/**
 * Single playlist API.
 *
 * PUT    /api/music/playlist/[id] — update playlist (name, trackIds)
 * DELETE /api/music/playlist/[id] — delete playlist
 *
 * Validates: Requirement 8.8
 */

import { requireAuth } from '../../_lib/auth';
import { queryOne, execute, jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString } from '../../_lib/validate';

interface Env {
  DB: D1Database;
}

// PUT — update playlist
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const id = (context.params as Record<string, string>).id;
    if (!id) throw new APIError(400, 'Missing playlist id');

    // Verify ownership
    const existing = await queryOne<{ id: number; user_id: number }>(
      context.env.DB,
      'SELECT id, user_id FROM playlists WHERE id = ?',
      [id],
    );
    if (!existing) throw new APIError(404, 'Playlist not found');
    if (existing.user_id !== user.id) throw new APIError(403, 'Not your playlist');

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) throw new APIError(400, 'Playlist name cannot be empty');
      setClauses.push('name = ?');
      params.push(sanitizeString(name, 50));
    }

    if ('trackIds' in body) {
      if (!Array.isArray(body.trackIds)) throw new APIError(400, 'trackIds must be an array');
      setClauses.push('track_ids = ?');
      params.push(JSON.stringify(body.trackIds));
    }

    if (setClauses.length === 0) {
      throw new APIError(400, 'No fields to update');
    }

    setClauses.push("updated_at = datetime('now')");
    params.push(id);

    await execute(
      context.env.DB,
      `UPDATE playlists SET ${setClauses.join(', ')} WHERE id = ?`,
      params,
    );

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
};

// DELETE — delete playlist
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const id = (context.params as Record<string, string>).id;
    if (!id) throw new APIError(400, 'Missing playlist id');

    const existing = await queryOne<{ id: number; user_id: number }>(
      context.env.DB,
      'SELECT id, user_id FROM playlists WHERE id = ?',
      [id],
    );
    if (!existing) throw new APIError(404, 'Playlist not found');
    if (existing.user_id !== user.id) throw new APIError(403, 'Not your playlist');

    await execute(context.env.DB, 'DELETE FROM playlists WHERE id = ?', [id]);

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
};
