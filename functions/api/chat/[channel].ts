/**
 * /api/chat/:channel — Channel chat messages
 *
 * GET  /api/chat/:channel — Get recent messages (last 100)
 * POST /api/chat/:channel — Send a message (auth required)
 *
 * Validates: Requirement 16 (AC1, AC2, AC3, AC4)
 */

import { requireAuth } from '../_lib/auth';
import { query, execute, queryOne, jsonResponse, errorResponse } from '../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// AC3: Valid channels
const VALID_CHANNELS = ['lobby', 'game', 'music', 'funny', 'random'];

// ── GET /api/chat/:channel ────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const channel = (context.params as Record<string, string>).channel;

  if (!VALID_CHANNELS.includes(channel)) {
    return errorResponse('Invalid channel', 400);
  }

  // AC2: Return last 100 messages sorted by creation time
  const messages = await query(
    DB,
    'SELECT * FROM chat_messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT 100',
    [channel],
  );

  return jsonResponse({ messages });
};

// ── POST /api/chat/:channel ───────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const channel = (context.params as Record<string, string>).channel;

  if (!VALID_CHANNELS.includes(channel)) {
    return errorResponse('Invalid channel', 400);
  }

  // AC1: Auth required
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';

  // AC4: Empty content → 400
  if (!content) {
    return errorResponse('Message content cannot be empty', 400);
  }

  // Get username from users table
  const userRow = await queryOne<{ username: string }>(
    DB,
    'SELECT username FROM users WHERE id = ?',
    [user.id],
  );
  const username = userRow?.username ?? 'Unknown';

  const now = new Date().toISOString();

  const { lastRowId } = await execute(
    DB,
    `INSERT INTO chat_messages (channel_id, user_id, username, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [channel, user.id, username, content, now],
  );

  const message = await queryOne(DB, 'SELECT * FROM chat_messages WHERE id = ?', [lastRowId]);
  if (!message) {
    return errorResponse('Failed to send message', 500);
  }

  return jsonResponse(message, 201);
};
