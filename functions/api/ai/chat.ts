/**
 * /api/ai/chat — AI chat via OpenRouter proxy
 *
 * POST   /api/ai/chat                        — SSE streaming chat (auth required)
 * GET    /api/ai/chat/history                 — List conversations
 * GET    /api/ai/chat/history/[conversationId] — Get single conversation messages
 * DELETE /api/ai/chat/history/[conversationId] — Delete single conversation
 * DELETE /api/ai/chat/history                 — Clear all history
 *
 * OpenRouter API Key from env.OPENROUTER_API_KEY — never hardcoded.
 * Non-adult mode adds content safety system prompt.
 * Adult mode has no restrictions.
 *
 * Validates: Requirements 56.2, 56.3, 56.4, 56.5, 56.6, 56.7, 56.8, 56.10, 56.11
 */

import { requireAuth } from '../_lib/auth';
import { query, execute, queryOne, jsonResponse, errorResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  OPENROUTER_API_KEY?: string;
}

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 3600;

const SAFETY_SYSTEM_PROMPT =
  '你是星聚平台的AI助手。请确保回复内容安全、友好，不包含暴力、色情或其他不当内容。用中文回答。';

// ── POST /api/ai/chat ─────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const { DB, KV } = context.env;

    // Rate limiting
    const rateLimitKey = `ai_rate:${user.id}`;
    const currentCount = parseInt((await KV.get(rateLimitKey)) || '0', 10);
    if (currentCount >= RATE_LIMIT_MAX) {
      return errorResponse('Rate limit exceeded. Please try again later.', 429);
    }

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return errorResponse('Missing required field: messages', 400);
    }

    const model = typeof body.model === 'string' ? body.model : 'deepseek/deepseek-chat';
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
    const isAdultMode = body.adultMode === true;

    // Build messages with system prompt
    const systemMessages = isAdultMode
      ? messages
      : [{ role: 'system', content: SAFETY_SYSTEM_PROMPT }, ...messages];

    // Increment rate limit
    await KV.put(rateLimitKey, String(currentCount + 1), { expirationTtl: RATE_LIMIT_WINDOW });

    const apiKey = context.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return errorResponse('AI service not configured', 503);
    }

    // Forward to OpenRouter
    const llmResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://starhub.app',
        'X-Title': 'StarHub AI',
      },
      body: JSON.stringify({
        model,
        messages: systemMessages,
        stream: true,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text().catch(() => 'Unknown error');
      const safeError = errorText.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');
      return errorResponse(`AI provider error: ${safeError}`, llmResponse.status);
    }

    // Log usage (non-blocking)
    const now = new Date().toISOString();
    execute(
      DB,
      `INSERT INTO ai_usage (user_id, provider, model, tokens_used, created_at)
       VALUES (?, 'openrouter', ?, 0, ?)`,
      [user.id, model, now],
    ).catch(() => {});

    // Store conversation (non-blocking)
    if (conversationId) {
      execute(
        DB,
        `UPDATE ai_conversations SET updated_at = ? WHERE id = ? AND user_id = ?`,
        [now, conversationId, user.id],
      ).catch(() => {});
    }

    return new Response(llmResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleError(error);
  }
};

// ── GET /api/ai/chat — History endpoints ──────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const { DB } = context.env;
    const url = new URL(context.request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // GET /api/ai/chat/history/[conversationId]
    if (pathParts.length >= 5 && pathParts[3] === 'history') {
      const conversationId = pathParts[4];
      const messages = await query(
        DB,
        'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC',
        [conversationId],
      ).catch(() => []);

      return jsonResponse({ conversationId, messages });
    }

    // GET /api/ai/chat/history
    const conversations = await query(
      DB,
      'SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50',
      [user.id],
    ).catch(() => []);

    return jsonResponse({ conversations });
  } catch (error) {
    return handleError(error);
  }
};

// ── DELETE /api/ai/chat — Delete history ──────────────────────

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const { DB } = context.env;
    const url = new URL(context.request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // DELETE /api/ai/chat/history/[conversationId]
    if (pathParts.length >= 5 && pathParts[3] === 'history') {
      const conversationId = pathParts[4];
      await execute(
        DB,
        'DELETE FROM ai_messages WHERE conversation_id = ? AND conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = ?)',
        [conversationId, user.id],
      ).catch(() => {});
      await execute(
        DB,
        'DELETE FROM ai_conversations WHERE id = ? AND user_id = ?',
        [conversationId, user.id],
      ).catch(() => {});

      return jsonResponse({ deleted: true });
    }

    // DELETE /api/ai/chat/history — clear all
    await execute(
      DB,
      'DELETE FROM ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = ?)',
      [user.id],
    ).catch(() => {});
    await execute(
      DB,
      'DELETE FROM ai_conversations WHERE user_id = ?',
      [user.id],
    ).catch(() => {});

    return jsonResponse({ deleted: true, all: true });
  } catch (error) {
    return handleError(error);
  }
};
