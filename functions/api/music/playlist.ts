/**
 * Music playlist API.
 *
 * POST /api/music/playlist   — create a new playlist
 * GET  /api/music/playlists  — list user's playlists
 *
 * Validates: Requirement 8.8
 */

import { requireAuth } from '../_lib/auth';
import { query, execute, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
}

// POST — create playlist
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

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new APIError(400, 'Playlist name is required');
    if (name.length > 50) throw new APIError(400, 'Playlist name max 50 characters');

    const trackIds = Array.isArray(body.trackIds) ? body.trackIds : [];
    const type = typeof body.type === 'string' ? body.type : 'music';

    const { lastRowId } = await execute(
      context.env.DB,
      `INSERT INTO playlists (user_id, name, type, track_ids) VALUES (?, ?, ?, ?)`,
      [user.id, sanitizeString(name, 50), type, JSON.stringify(trackIds)],
    );

    return jsonResponse({ id: lastRowId, name, type, trackIds }, 201);
  } catch (error) {
    return handleError(error);
  }
};

// GET — list playlists
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const rows = await query(
      context.env.DB,
      `SELECT id, name, type, track_ids, created_at, updated_at
       FROM playlists WHERE user_id = ? ORDER BY updated_at DESC`,
      [user.id],
    );

    const playlists = rows.map((r: Record<string, unknown>) => ({
      ...r,
      track_ids: typeof r.track_ids === 'string' ? JSON.parse(r.track_ids as string) : r.track_ids,
    }));

    return jsonResponse({ playlists });
  } catch (error) {
    return handleError(error);
  }
};
