/**
 * Podcast subscribe (订阅) API.
 *
 * POST /api/podcast/subscribe — subscribe / unsubscribe a podcast (toggle)
 * GET  /api/podcast/subscriptions — get user's subscribed podcasts list
 *
 * Uses the `following` table in D1 with content_type='podcast'.
 *
 * Validates: Requirements 24.5
 */

import { requireAuth } from '../_lib/auth';
import { execute, queryOne, query, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
}

// ── POST — subscribe / unsubscribe a podcast ─────────────────

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

    const podcastId = typeof body.podcastId === 'string' ? body.podcastId.trim() : '';
    if (!podcastId) {
      throw new APIError(400, 'Missing required field: podcastId');
    }

    const sanitizedPodcastId = sanitizeString(podcastId, 500);
    const title = typeof body.title === 'string' ? sanitizeString(body.title, 500) : sanitizedPodcastId;
    const cover = typeof body.cover === 'string' ? sanitizeString(body.cover, 1000) : '';

    // Check if already subscribed — if so, unsubscribe (toggle behavior)
    const existing = await queryOne<{ id: number }>(
      context.env.DB,
      `SELECT id FROM following WHERE user_id = ? AND content_type = 'podcast' AND content_id = ?`,
      [user.id, sanitizedPodcastId],
    );

    if (existing) {
      await execute(
        context.env.DB,
        `DELETE FROM following WHERE id = ?`,
        [existing.id],
      );
      return jsonResponse({ success: true, subscribed: false });
    }

    // Insert new subscription
    await execute(
      context.env.DB,
      `INSERT INTO following (user_id, content_type, content_id, title, cover)
       VALUES (?, 'podcast', ?, ?, ?)`,
      [user.id, sanitizedPodcastId, title, cover],
    );

    return jsonResponse({ success: true, subscribed: true });
  } catch (error) {
    return handleError(error);
  }
};

// ── GET — get user's subscribed podcasts list ─────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const items = await query(
      context.env.DB,
      `SELECT id, content_id AS podcastId, title, cover, last_episode AS lastEpisode, created_at
       FROM following WHERE user_id = ? AND content_type = 'podcast'
       ORDER BY created_at DESC`,
      [user.id],
    );

    return jsonResponse({ items });
  } catch (error) {
    return handleError(error);
  }
};
