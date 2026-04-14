/**
 * Novel bookmark API.
 *
 * POST /api/novel/bookmark — save / update novel reading progress (upsert)
 * GET  /api/novel/bookmark — get user's novel bookmarks
 *
 * Validates: Requirements 23.8
 */

import { requireAuth } from '../_lib/auth';
import { execute, queryOne, query, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
}

// ── POST — save / update novel reading progress ──────────────

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

    const novelId = typeof body.novelId === 'string' ? body.novelId.trim() : '';
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const position = typeof body.position === 'number' ? Math.max(0, Math.floor(body.position)) : 0;

    const missing: string[] = [];
    if (!novelId) missing.push('novelId');
    if (!chapterId) missing.push('chapterId');
    if (missing.length > 0) {
      throw new APIError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    const sanitizedNovelId = sanitizeString(novelId, 500);
    const sanitizedChapterId = sanitizeString(chapterId, 500);

    // Upsert: check if a bookmark for this user + novel already exists
    const existing = await queryOne<{ id: number }>(
      context.env.DB,
      `SELECT id FROM bookmarks WHERE user_id = ? AND content_type = 'novel' AND content_id = ?`,
      [user.id, sanitizedNovelId],
    );

    if (existing) {
      await execute(
        context.env.DB,
        `UPDATE bookmarks
         SET chapter_id = ?, position = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [sanitizedChapterId, position, existing.id],
      );
    } else {
      await execute(
        context.env.DB,
        `INSERT INTO bookmarks (user_id, content_type, content_id, chapter_id, position)
         VALUES (?, 'novel', ?, ?, ?)`,
        [user.id, sanitizedNovelId, sanitizedChapterId, position],
      );
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
};

// ── GET — get user's novel bookmarks ─────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    const novelId = url.searchParams.get('novelId');

    if (novelId) {
      // Get bookmark for a specific novel
      const bookmark = await queryOne(
        context.env.DB,
        `SELECT id, content_id AS novelId, chapter_id AS chapterId, position, updated_at
         FROM bookmarks WHERE user_id = ? AND content_type = 'novel' AND content_id = ?`,
        [user.id, sanitizeString(novelId, 500)],
      );
      return jsonResponse({ bookmark: bookmark ?? null });
    }

    // Get all novel bookmarks for the user
    const bookmarks = await query(
      context.env.DB,
      `SELECT id, content_id AS novelId, chapter_id AS chapterId, position, updated_at
       FROM bookmarks WHERE user_id = ? AND content_type = 'novel'
       ORDER BY updated_at DESC`,
      [user.id],
    );

    return jsonResponse({ bookmarks });
  } catch (error) {
    return handleError(error);
  }
};
