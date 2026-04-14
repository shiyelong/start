/**
 * GET /api/users/me/sync
 *
 * Returns all user data for cross-device synchronization:
 * history, favorites, bookmarks, playlists, following, settings.
 *
 * Validates: Requirements 41.1, 11.6
 */

import { requireAuth } from '../../_lib/auth';
import { query, queryOne, jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const auth = requireAuth(context);
    if (auth instanceof Response) return auth;

    const { DB } = context.env;
    const userId = auth.id;

    // Fetch all user data in parallel for efficiency
    const [history, favorites, bookmarks, playlists, following, settingsRow] =
      await Promise.all([
        // Recent playback history (last 100 entries)
        query(
          DB,
          `SELECT content_type, content_id, title, source, cover, rating, progress, duration, watched_at
           FROM playback_history
           WHERE user_id = ?
           ORDER BY watched_at DESC
           LIMIT 100`,
          [userId],
        ),

        // All favorites
        query(
          DB,
          `SELECT content_type, content_id, title, source, cover, rating, created_at
           FROM favorites
           WHERE user_id = ?
           ORDER BY created_at DESC`,
          [userId],
        ),

        // All bookmarks (reading progress)
        query(
          DB,
          `SELECT content_type, content_id, chapter_id, position, updated_at
           FROM bookmarks
           WHERE user_id = ?`,
          [userId],
        ),

        // All playlists
        query(
          DB,
          `SELECT id, name, type, track_ids, created_at, updated_at
           FROM playlists
           WHERE user_id = ?
           ORDER BY updated_at DESC`,
          [userId],
        ),

        // All following (anime/live subscriptions)
        query(
          DB,
          `SELECT content_type, content_id, title, cover, last_episode, created_at
           FROM following
           WHERE user_id = ?
           ORDER BY created_at DESC`,
          [userId],
        ),

        // User settings
        queryOne(
          DB,
          'SELECT age_gate_mode, daily_limit, notification_prefs, theme, updated_at FROM user_settings WHERE user_id = ?',
          [userId],
        ),
      ]);

    // Parse playlist track_ids from JSON strings
    const parsedPlaylists = playlists.map((p: Record<string, unknown>) => ({
      ...p,
      track_ids: typeof p.track_ids === 'string' ? JSON.parse(p.track_ids as string) : p.track_ids,
    }));

    // Parse settings
    const settings = settingsRow
      ? {
          ageGateMode: (settingsRow as Record<string, unknown>).age_gate_mode,
          dailyLimit: (settingsRow as Record<string, unknown>).daily_limit,
          notificationPrefs: JSON.parse(
            ((settingsRow as Record<string, unknown>).notification_prefs as string) ?? '{}',
          ),
          theme: (settingsRow as Record<string, unknown>).theme,
        }
      : {
          ageGateMode: 'adult',
          dailyLimit: 0,
          notificationPrefs: {},
          theme: 'dark',
        };

    return jsonResponse({
      history,
      favorites,
      bookmarks,
      playlists: parsedPlaylists,
      following,
      settings,
    });
  } catch (error) {
    return handleError(error);
  }
};
