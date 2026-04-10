/**
 * /api/live/rooms/:id/chat — Live room chat messages
 *
 * GET  /api/live/rooms/:id/chat — Get recent messages (last 100)
 * POST /api/live/rooms/:id/chat — Send a chat message (auth required)
 *
 * Validates: Requirement 14 (AC1, AC2)
 */

import { requireAuth } from '../../../_lib/auth';
import { query, execute, queryOne, jsonResponse, errorResponse } from '../../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── GET /api/live/rooms/:id/chat ──────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const roomId = (context.params as Record<string, string>).id;

  // Verify room exists
  const room = await queryOne(DB, 'SELECT id FROM live_rooms WHERE id = ?', [roomId]);
  if (!room) {
    return errorResponse('Live room not found', 404);
  }

  // AC2: Return last 100 messages sorted by creation time
  const messages = await query(
    DB,
    'SELECT * FROM live_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 100',
    [roomId],
  );

  return jsonResponse({ messages });
};

// ── POST /api/live/rooms/:id/chat ─────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const roomId = (context.params as Record<string, string>).id;

  // AC1: Auth required
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  // Verify room exists and is live
  const room = await queryOne<{ id: number; status: string }>(
    DB,
    'SELECT id, status FROM live_rooms WHERE id = ?',
    [roomId],
  );
  if (!room) {
    return errorResponse('Live room not found', 404);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return errorResponse('Missing required field: content', 400);
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
    `INSERT INTO live_messages (room_id, user_id, username, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [roomId, user.id, username, content, now],
  );

  const message = await queryOne(DB, 'SELECT * FROM live_messages WHERE id = ?', [lastRowId]);
  if (!message) {
    return errorResponse('Failed to send message', 500);
  }

  return jsonResponse(message, 201);
};
