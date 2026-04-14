/**
 * Video favorites API.
 *
 * POST /api/video/favorite   — toggle favorite (add if not exists, remove if exists)
 * GET  /api/video/favorites  — list user's favorites (paginated, filterable)
 *
 * Validates: Requirements 11.3, 11.4, 11.6
 */

import { requireAuth } from '../_lib/auth';
import { paginate, execute, queryOne, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
}

// ── POST — toggle favorite ────────────────────────────────────

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

    const contentId = typeof body.contentId === 'string' ? body.contentId.trim() : '';
    const contentType = typeof body.contentType === 'string' ? body.contentType.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    const cover = typeof body.cover === 'string' ? body.cover.trim() : null;
    const rating = typeof body.rating === 'string' ? body.rating.trim() : 'PG';

    const missing: string[] = [];
    if (!contentId) missing.push('contentId');
    if (!contentType) missing.push('contentType');
    if (!title) missing.push('title');
    if (!source) missing.push('source');
    if (missing.length > 0) {
      throw new APIError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'];
    if (!VALID_RATINGS.includes(rating)) {
      throw new APIError(400, `Invalid rating. Must be one of: ${VALID_RATINGS.join(', ')}`);
    }

    const sanitizedContentType = sanitizeString(contentType, 50);
    const sanitizedContentId = sanitizeString(contentId, 500);

    // Toggle: check if already favorited
    const existing = await queryOne<{ id: number }>(
      context.env.DB,
      `SELECT id FROM favorites WHERE user_id = ? AND content_type = ? AND content_id = ?`,
      [user.id, sanitizedContentType, sanitizedContentId],
    );

    if (existing) {
      // Remove favorite
      await execute(
        context.env.DB,
        `DELETE FROM favorites WHERE id = ?`,
        [existing.id],
      );
      return jsonResponse({ favorited: false });
    }

    // Add favorite
    await execute(
      context.env.DB,
      `INSERT INTO favorites (user_id, content_type, content_id, title, source, cover, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        sanitizedContentType,
        sanitizedContentId,
        sanitizeString(title, 500),
        sanitizeString(source, 100),
        cover ? sanitizeString(cover, 2000) : null,
        rating,
      ],
    );

    return jsonResponse({ favorited: true });
  } catch (error) {
    return handleError(error);
  }
};

// ── GET — favorites list ──────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    const contentType = url.searchParams.get('contentType');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    let baseSql = `SELECT id, content_type, content_id, title, source, cover, rating, created_at
      FROM favorites WHERE user_id = ?`;
    let countSql = `SELECT COUNT(*) FROM favorites WHERE user_id = ?`;
    const params: unknown[] = [user.id];

    if (contentType) {
      baseSql += ` AND content_type = ?`;
      countSql += ` AND content_type = ?`;
      params.push(sanitizeString(contentType, 50));
    }

    baseSql += ` ORDER BY created_at DESC`;

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
