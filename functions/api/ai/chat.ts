/**
 * /api/ai/chat — AI proxy service
 *
 * POST /api/ai/chat — Forward AI chat request to LLM provider (auth required)
 *
 * - Reads API keys from env (never exposed to client)
 * - Supports OpenAI, DeepSeek, Moonshot providers
 * - Streams response back to client
 * - Logs usage in ai_usage table
 * - Rate limits via KV (default 30 req/hour per user)
 *
 * Validates: Requirement 15 (AC1–AC7)
 */

import { requireAuth } from '../_lib/auth';
import { execute, errorResponse } from '../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  MOONSHOT_API_KEY?: string;
  OPENAI_API_URL?: string;
  DEEPSEEK_API_URL?: string;
  MOONSHOT_API_URL?: string;
}

const RATE_LIMIT_MAX = 30; // requests per hour per user
const RATE_LIMIT_WINDOW = 3600; // seconds (1 hour)

interface ProviderConfig {
  apiKey: string;
  apiUrl: string;
  defaultModel: string;
}

function getProviderConfig(env: Env, provider: string): ProviderConfig | null {
  switch (provider) {
    case 'openai':
      return env.OPENAI_API_KEY
        ? {
            apiKey: env.OPENAI_API_KEY,
            apiUrl: env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
            defaultModel: 'gpt-3.5-turbo',
          }
        : null;
    case 'deepseek':
      return env.DEEPSEEK_API_KEY
        ? {
            apiKey: env.DEEPSEEK_API_KEY,
            apiUrl: env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
            defaultModel: 'deepseek-chat',
          }
        : null;
    case 'moonshot':
      return env.MOONSHOT_API_KEY
        ? {
            apiKey: env.MOONSHOT_API_KEY,
            apiUrl: env.MOONSHOT_API_URL || 'https://api.moonshot.cn/v1/chat/completions',
            defaultModel: 'moonshot-v1-8k',
          }
        : null;
    default:
      return null;
  }
}

// ── POST /api/ai/chat ─────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB, KV } = context.env;

  // AC5: Auth required
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  // AC7: Rate limiting via KV
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

  // AC3: Default provider is deepseek
  const provider = typeof body.provider === 'string' ? body.provider : 'deepseek';
  const config = getProviderConfig(context.env, provider);
  if (!config) {
    // AC6: Descriptive error without exposing API key
    return errorResponse(`Provider "${provider}" is not configured or unavailable`, 400);
  }

  const model = typeof body.model === 'string' ? body.model : config.defaultModel;

  // Increment rate limit counter
  await KV.put(rateLimitKey, String(currentCount + 1), { expirationTtl: RATE_LIMIT_WINDOW });

  // AC1: Forward request to LLM provider and stream response
  try {
    const llmResponse = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!llmResponse.ok) {
      // AC6: Return descriptive error without exposing API key
      const errorText = await llmResponse.text().catch(() => 'Unknown error');
      // Strip any potential API key leaks from error text
      const safeError = errorText.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');
      return errorResponse(`LLM provider error: ${safeError}`, llmResponse.status);
    }

    // AC4: Log usage in ai_usage table
    const now = new Date().toISOString();
    // We log with estimated tokens (actual count comes from stream, but we log the request)
    execute(DB, 
      `INSERT INTO ai_usage (user_id, provider, model, tokens_used, created_at)
       VALUES (?, ?, ?, 0, ?)`,
      [user.id, provider, model, now],
    ).catch(() => { /* non-blocking usage logging */ });

    // Stream the response back to client
    return new Response(llmResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    // AC6: Never expose API keys in error messages
    return errorResponse('Failed to connect to AI provider', 502);
  }
};
