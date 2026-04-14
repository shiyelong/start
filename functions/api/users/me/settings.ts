/**
 * PUT /api/users/me/settings
 *
 * Updates user settings: AgeGate mode, PIN, daily time limit,
 * notification preferences.
 *
 * Validates: Requirements 41.7, 14.2, 14.7, 14.10
 */

import { requireAuth } from '../../_lib/auth';
import { queryOne, execute, jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_MODES = ['child', 'teen', 'mature', 'adult', 'elder'] as const;
const PIN_REGEX = /^\d{6}$/;

interface UserSettings {
  user_id: number;
  age_gate_mode: string;
  age_gate_pin: string | null;
  daily_limit: number;
  notification_prefs: string;
  theme: string;
  updated_at: string;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const auth = requireAuth(context);
    if (auth instanceof Response) return auth;

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    const { DB } = context.env;

    // Ensure settings row exists (upsert pattern)
    const existing = await queryOne<UserSettings>(
      DB,
      'SELECT * FROM user_settings WHERE user_id = ?',
      [auth.id],
    );

    if (!existing) {
      // Create default settings row if missing
      await execute(
        DB,
        `INSERT INTO user_settings (user_id, age_gate_mode, daily_limit, notification_prefs, theme, updated_at)
         VALUES (?, 'adult', 0, '{}', 'dark', datetime('now'))`,
        [auth.id],
      );
    }

    // Build dynamic UPDATE
    const setClauses: string[] = [];
    const params: unknown[] = [];

    // AgeGate mode
    if ('ageGateMode' in body) {
      const mode = body.ageGateMode;
      if (typeof mode !== 'string' || !VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
        throw new APIError(400, `Invalid ageGateMode. Must be one of: ${VALID_MODES.join(', ')}`);
      }
      setClauses.push('age_gate_mode = ?');
      params.push(mode);
    }

    // PIN (6-digit numeric)
    if ('pin' in body) {
      const pin = body.pin;
      if (pin !== null) {
        if (typeof pin !== 'string' || !PIN_REGEX.test(pin)) {
          throw new APIError(400, 'PIN must be a 6-digit number');
        }
        setClauses.push('age_gate_pin = ?');
        params.push(pin);
      } else {
        setClauses.push('age_gate_pin = NULL');
      }
    }

    // Daily limit (minutes, 0 = unlimited)
    if ('dailyLimit' in body) {
      const limit = body.dailyLimit;
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) {
        throw new APIError(400, 'dailyLimit must be a non-negative integer (minutes)');
      }
      setClauses.push('daily_limit = ?');
      params.push(limit);
    }

    // Notification preferences (JSON object)
    if ('notificationPrefs' in body) {
      const prefs = body.notificationPrefs;
      if (typeof prefs !== 'object' || prefs === null || Array.isArray(prefs)) {
        throw new APIError(400, 'notificationPrefs must be a JSON object');
      }
      setClauses.push('notification_prefs = ?');
      params.push(JSON.stringify(prefs));
    }

    if (setClauses.length === 0) {
      throw new APIError(400, 'No valid fields to update. Allowed: ageGateMode, pin, dailyLimit, notificationPrefs');
    }

    // Always update timestamp
    setClauses.push("updated_at = datetime('now')");
    params.push(auth.id);

    const sql = `UPDATE user_settings SET ${setClauses.join(', ')} WHERE user_id = ?`;
    await execute(DB, sql, params);

    // Return updated settings
    const settings = await queryOne<UserSettings>(
      DB,
      'SELECT * FROM user_settings WHERE user_id = ?',
      [auth.id],
    );

    return jsonResponse({
      settings: {
        ageGateMode: settings?.age_gate_mode ?? 'adult',
        pinSet: !!settings?.age_gate_pin,
        dailyLimit: settings?.daily_limit ?? 0,
        notificationPrefs: JSON.parse(settings?.notification_prefs ?? '{}'),
        theme: settings?.theme ?? 'dark',
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
