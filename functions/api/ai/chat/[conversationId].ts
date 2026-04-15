/**
 * /api/ai/chat/[conversationId] — Single conversation management
 *
 * GET    /api/ai/chat/[conversationId] — Get all messages in a conversation
 * DELETE /api/ai/chat/[conversationId] — Delete a single conversation and its messages
 *
 * Validates: Requirements 56.5, 56.7
 */

import { requireAuth } from '../../_lib/auth';
import { query, queryOne, execute, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── GET /api/ai/chat/[conversationId] ─────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const { DB } = context.env;
    const conversationId = (context.params as Record<string, string>).conversationId;

    if (!conversationId) {
      return errorResponse('Missing conversationId', 400);
    }

    // Verify conversation belongs to user
    const conversation = await queryOne(
      DB,
      'SELECT id, title, model, created_at, updated_at FROM ai_conversations WHERE id = ? AND user_id = ?',
      [conversationId, user.id],
    ).catch(() => null);

    if (!conversation) {
      return errorResponse('Conversation not found', 404);
    }

    // Fetch messages
    const messages = await query(
      DB,
      `SELECT id, role, content, created_at
       FROM ai_messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [conversationId],
    ).catch(() => []);

    return jsonResponse({
      conversation,
      messages,
    });
  } catch (error) {
    return handleError(error);
  }
};

// ── DELETE /api/ai/chat/[conversationId] ──────────────────────

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const { DB } = context.env;
    const conversationId = (context.params as Record<string, string>).conversationId;

    if (!conversationId) {
      return errorResponse('Missing conversationId', 400);
    }

    // Verify ownership before deleting
    const conversation = await queryOne(
      DB,
      'SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?',
      [conversationId, user.id],
    ).catch(() => null);

    if (!conversation) {
      return errorResponse('Conversation not found', 404);
    }

    // Delete messages first, then conversation
    await execute(
      DB,
      'DELETE FROM ai_messages WHERE conversation_id = ?',
      [conversationId],
    ).catch(() => {});

    await execute(
      DB,
      'DELETE FROM ai_conversations WHERE id = ? AND user_id = ?',
      [conversationId, user.id],
    ).catch(() => {});

    return jsonResponse({ deleted: true, conversationId });
  } catch (error) {
    return handleError(error);
  }
};
