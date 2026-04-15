/**
 * /api/notify/preferences — Notification preferences
 *
 * GET  — Get current notification preferences
 * PUT  — Update notification preferences
 *
 * Validates: Requirement 42.4, 42.5
 */

import { requireAuth } from '../_lib/auth';
import { queryOne, execute, jsonResponse, errorResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

interface NotificationPreferences {
  animeUpdate: boolean;
  liveOnline: boolean;
  message: boolean;
  system: boolean;
  commentReply: boolean;
  podcastUpdate: boolean;
  pushEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  animeUpdate: true,
  liveOnline: true,
  message: true,
  system: true,
  commentReply: true,
  podcastUpdate: true,
  pushEnabled: false,
};

// ── GET /api/notify/preferences ───────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const row = await queryOne<{ notification_prefs: string }>(
      context.env.DB,
      'SELECT notification_prefs FROM user_settings WHERE user_id = ?',
      [user.id],
    ).catch(() => null);

    let prefs = DEFAULT_PREFS;
    if (row?.notification_prefs) {
      try {
        prefs = { ...DEFAULT_PREFS, ...JSON.parse(row.notification_prefs) };
      } catch {}
    }

    return jsonResponse({ preferences: prefs });
  } catch (error) {
    return handleError(error);
  }
};

// ── PUT /api/notify/preferences ───────────────────────────────

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    // Merge with defaults
    const prefs: NotificationPreferences = {
      animeUpdate: typeof body.animeUpdate === 'boolean' ? body.animeUpdate : DEFAULT_PREFS.animeUpdate,
      liveOnline: typeof body.liveOnline === 'boolean' ? body.liveOnline : DEFAULT_PREFS.liveOnline,
      message: typeof body.message === 'boolean' ? body.message : DEFAULT_PREFS.message,
      system: typeof body.system === 'boolean' ? body.system : DEFAULT_PREFS.system,
      commentReply: typeof body.commentReply === 'boolean' ? body.commentReply : DEFAULT_PREFS.commentReply,
      podcastUpdate: typeof body.podcastUpdate === 'boolean' ? body.podcastUpdate : DEFAULT_PREFS.podcastUpdate,
      pushEnabled: typeof body.pushEnabled === 'boolean' ? body.pushEnabled : DEFAULT_PREFS.pushEnabled,
    };

    const now = new Date().toISOString();
    await execute(
      context.env.DB,
      `INSERT INTO user_settings (user_id, notification_prefs, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET notification_prefs = ?, updated_at = ?`,
      [user.id, JSON.stringify(prefs), now, JSON.stringify(prefs), now],
    ).catch(() => {});

    return jsonResponse({ preferences: prefs, updated: true });
  } catch (error) {
    return handleError(error);
  }
};
