/**
 * Video playback history API.
 *
 * GET  /api/video/history  — list user's playback history (paginated, filterable)
 * POST /api/video/history  — record / update playback progress (upsert)
 *
 * Validates: Requirements 11.1, 11.2, 11.4, 11.5, 11.6
 */

import { requireAuth } from '../_lib/auth';
import { paginate, execute, queryOne, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
}

// ── GET — playback history list ───────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    const source = url.searchParams.get('source');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Build query with optional source filter
    let baseSql = `SELECT id, content_type, content_id, title, source, cover, rating, progress, duration, watched_at
      FROM playback_history WHERE user_id = ?`;
    let countSql = `SELECT COUNT(*) FROM playback_history WHERE user_id = ?`;
    const params: unknown[] = [user.id];

    if (source) {
      baseSql += ` AND source = ?`;
      countSql += ` AND source = ?`;
      params.push(sanitizeString(source, 100));
    }

    baseSql += ` ORDER BY watched_at DESC`;

    const result = await paginate(
      context.env.DB,
      baseSql,
      countSql,
      params,
      page,
      pageSize,
    );

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};


// ── POST — record / update playback progress ──────────────────

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

    // Validate required fields
    const contentId = typeof body.contentId === 'string' ? body.contentId.trim() : '';
    const contentType = typeof body.contentType === 'string' ? body.contentType.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    const cover = typeof body.cover === 'string' ? body.cover.trim() : null;
    const rating = typeof body.rating === 'string' ? body.rating.trim() : 'PG';
    const progress = typeof body.progress === 'number' ? Math.max(0, Math.floor(body.progress)) : 0;
    const duration = typeof body.duration === 'number' ? Math.max(0, Math.floor(body.duration)) : 0;

    const missing: string[] = [];
    if (!contentId) missing.push('contentId');
    if (!contentType) missing.push('contentType');
    if (!title) missing.push('title');
    if (!source) missing.push('source');
    if (missing.length > 0) {
      throw new APIError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    const VALID_CONTENT_TYPES = ['video', 'music', 'anime', 'podcast'];
    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      throw new APIError(400, `Invalid contentType. Must be one of: ${VALID_CONTENT_TYPES.join(', ')}`);
    }

    const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'];
    if (!VALID_RATINGS.includes(rating)) {
      throw new APIError(400, `Invalid rating. Must be one of: ${VALID_RATINGS.join(', ')}`);
    }

    // Upsert: check if a record for this user + contentType + contentId exists
    const existing = await queryOne<{ id: number }>(
      context.env.DB,
      `SELECT id FROM playback_history WHERE user_id = ? AND content_type = ? AND content_id = ?`,
      [user.id, sanitizeString(contentType, 50), sanitizeString(contentId, 500)],
    );

    if (existing) {
      // Update existing record
      await execute(
        context.env.DB,
        `UPDATE playback_history
         SET title = ?, source = ?, cover = ?, rating = ?, progress = ?, duration = ?, watched_at = datetime('now')
         WHERE id = ?`,
        [
          sanitizeString(title, 500),
          sanitizeString(source, 100),
          cover ? sanitizeString(cover, 2000) : null,
          rating,
          progress,
          duration,
          existing.id,
        ],
      );
    } else {
      // Insert new record
      await execute(
        context.env.DB,
        `INSERT INTO playback_history (user_id, content_type, content_id, title, source, cover, rating, progress, duration)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          sanitizeString(contentType, 50),
          sanitizeString(contentId, 500),
          sanitizeString(title, 500),
          sanitizeString(source, 100),
          cover ? sanitizeString(cover, 2000) : null,
          rating,
          progress,
          duration,
        ],
      );
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
};
