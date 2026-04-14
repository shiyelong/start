/**
 * Live follow (关注主播) API.
 *
 * POST /api/live/follow — follow / unfollow a streamer (toggle)
 * GET  /api/live/following — get user's followed streamers list
 *
 * Uses the `following` table in D1 with content_type='live'.
 *
 * Validates: Requirements 25.6
 */

import { requireAuth } from '../_lib/auth';
import { execute, queryOne, query, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
}

// ── POST — follow / unfollow a streamer ──────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    const streamerId = typeof body.streamerId === 'string' ? body.streamerId.trim() : '';
    if (!streamerId) {
      throw new APIError(400, 'Missing required field: streamerId');
    }

    const sanitizedStreamerId = sanitizeString(streamerId, 500);
    const title = typeof body.title === 'string' ? sanitizeString(body.title, 500) : sanitizedStreamerId;
    const cover = typeof body.cover === 'string' ? sanitizeString(body.cover, 1000) : '';

    // Check if already following — if so, unfollow (toggle behavior)
    const existing = await queryOne<{ id: number }>(
      context.env.DB,
      `SELECT id FROM following WHERE user_id = ? AND content_type = 'live' AND content_id = ?`,
      [user.id, sanitizedStreamerId],
    );

    if (existing) {
      await execute(
        context.env.DB,
        `DELETE FROM following WHERE id = ?`,
        [existing.id],
      );
      return jsonResponse({ success: true, following: false });
    }

    // Insert new follow
    await execute(
      context.env.DB,
      `INSERT INTO following (user_id, content_type, content_id, title, cover)
       VALUES (?, 'live', ?, ?, ?)`,
      [user.id, sanitizedStreamerId, title, cover],
    );

    return jsonResponse({ success: true, following: true });
  } catch (error) {
    return handleError(error);
  }
};

// ── GET — get user's followed streamers list ─────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const items = await query(
      context.env.DB,
      `SELECT id, content_id AS streamerId, title, cover, last_episode AS lastSeen, created_at
       FROM following WHERE user_id = ? AND content_type = 'live'
       ORDER BY created_at DESC`,
      [user.id],
    );

    return jsonResponse({ items });
  } catch (error) {
    return handleError(error);
  }
};
