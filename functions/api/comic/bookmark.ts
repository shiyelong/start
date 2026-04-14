/**
 * Comic bookmark API.
 *
 * POST /api/comic/bookmark — save / update comic reading progress (upsert)
 * GET  /api/comic/bookmark — get user's comic bookmarks
 *
 * Validates: Requirements 18.8
 */

import { requireAuth } from '../_lib/auth';
import { execute, queryOne, query, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
}

// ── POST — save / update comic reading progress ──────────────

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

    const mangaId = typeof body.mangaId === 'string' ? body.mangaId.trim() : '';
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const page = typeof body.page === 'number' ? Math.max(0, Math.floor(body.page)) : 0;

    const missing: string[] = [];
    if (!mangaId) missing.push('mangaId');
    if (!chapterId) missing.push('chapterId');
    if (missing.length > 0) {
      throw new APIError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    const sanitizedMangaId = sanitizeString(mangaId, 500);
    const sanitizedChapterId = sanitizeString(chapterId, 500);

    // Upsert: check if a bookmark for this user + comic already exists
    const existing = await queryOne<{ id: number }>(
      context.env.DB,
      `SELECT id FROM bookmarks WHERE user_id = ? AND content_type = 'comic' AND content_id = ?`,
      [user.id, sanitizedMangaId],
    );

    if (existing) {
      await execute(
        context.env.DB,
        `UPDATE bookmarks
         SET chapter_id = ?, position = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [sanitizedChapterId, page, existing.id],
      );
    } else {
      await execute(
        context.env.DB,
        `INSERT INTO bookmarks (user_id, content_type, content_id, chapter_id, position)
         VALUES (?, 'comic', ?, ?, ?)`,
        [user.id, sanitizedMangaId, sanitizedChapterId, page],
      );
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
};

// ── GET — get user's comic bookmarks ─────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    const mangaId = url.searchParams.get('mangaId');

    if (mangaId) {
      // Get bookmark for a specific manga
      const bookmark = await queryOne(
        context.env.DB,
        `SELECT id, content_id AS mangaId, chapter_id AS chapterId, position AS page, updated_at
         FROM bookmarks WHERE user_id = ? AND content_type = 'comic' AND content_id = ?`,
        [user.id, sanitizeString(mangaId, 500)],
      );
      return jsonResponse({ bookmark: bookmark ?? null });
    }

    // Get all comic bookmarks for the user
    const bookmarks = await query(
      context.env.DB,
      `SELECT id, content_id AS mangaId, chapter_id AS chapterId, position AS page, updated_at
       FROM bookmarks WHERE user_id = ? AND content_type = 'comic'
       ORDER BY updated_at DESC`,
      [user.id],
    );

    return jsonResponse({ bookmarks });
  } catch (error) {
    return handleError(error);
  }
};
