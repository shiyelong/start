/**
 * /api/live/rooms — Live room list + create
 *
 * GET  /api/live/rooms — List active rooms sorted by viewer_count DESC
 * POST /api/live/rooms — Create a new live room (auth required)
 *
 * Validates: Requirement 13 (AC1, AC2, AC5)
 */

import { requireAuth } from '../../_lib/auth';
import { query, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_CATEGORIES = ['gaming', 'music', 'chat', 'study', 'outdoor', 'food', 'tech', 'art'];

// ── GET /api/live/rooms ───────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const url = new URL(context.request.url);

  const category = url.searchParams.get('category');

  const conditions: string[] = ['status = ?'];
  const params: unknown[] = ['live'];

  // AC5: Optional category filter
  if (category && VALID_CATEGORIES.includes(category)) {
    conditions.push('category = ?');
    params.push(category);
  }

  const where = ` WHERE ${conditions.join(' AND ')}`;

  // AC2: Sorted by viewer_count DESC
  const sql = `SELECT * FROM live_rooms${where} ORDER BY viewer_count DESC`;
  const rooms = await query(DB, sql, params);

  return jsonResponse({ items: rooms });
};

// ── POST /api/live/rooms ──────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // AC1: Auth required
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return errorResponse('Missing required field: title', 400);
  }

  let category = typeof body.category === 'string' ? body.category.trim() : '';
  if (category && !VALID_CATEGORIES.includes(category)) {
    category = '';
  }

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : '[]';

  // Get streamer name from users table
  const userRow = await queryOne<{ username: string }>(
    DB,
    'SELECT username FROM users WHERE id = ?',
    [user.id],
  );
  const streamerName = userRow?.username ?? 'Unknown';

  const now = new Date().toISOString();

  const { lastRowId } = await execute(
    DB,
    `INSERT INTO live_rooms (title, streamer_id, streamer_name, category, description, tags, status, viewer_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'live', 0, ?, ?)`,
    [title, user.id, streamerName, category || null, description || null, tags, now, now],
  );

  const created = await queryOne(DB, 'SELECT * FROM live_rooms WHERE id = ?', [lastRowId]);
  if (!created) {
    return errorResponse('Failed to create live room', 500);
  }

  return jsonResponse(created, 201);
};
