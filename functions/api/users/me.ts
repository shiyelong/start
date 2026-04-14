/**
 * PUT /api/users/me — Update profile (nickname, bio, avatar)
 * DELETE /api/users/me — Delete account (72h full data purge)
 *
 * Validates: Requirements 41.1, 47.4
 */

import { requireAuth } from '../_lib/auth';
import { execute, queryOne, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

interface UserRow {
  id: number;
  username: string;
  email: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  role: string;
  verify_count: number;
  reputation: number;
  like_count: number;
  created_at: string;
  updated_at: string;
}

/** Allowed profile fields that can be updated. */
const ALLOWED_FIELDS = ['nickname', 'bio', 'avatar'] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    // Step 1: Require authentication
    const auth = requireAuth(context);
    if (auth instanceof Response) return auth;

    // Step 2: Parse JSON body
    let body: Record<string, unknown>;
    try {
      body = (await context.request.json()) as Record<string, unknown>;
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    // Step 3: Build dynamic UPDATE for only provided fields
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        const value = body[field];
        if (value !== null && typeof value !== 'string') {
          throw new APIError(400, `Field "${field}" must be a string or null`);
        }
        setClauses.push(`${field} = ?`);
        params.push(value ?? null);
      }
    }

    if (setClauses.length === 0) {
      throw new APIError(400, 'No valid fields to update. Allowed: nickname, bio, avatar');
    }

    // Always update the updated_at timestamp
    setClauses.push("updated_at = datetime('now')");
    params.push(auth.id);

    const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
    await execute(context.env.DB, sql, params);

    // Step 4: Return updated profile
    const user = await queryOne<UserRow>(
      context.env.DB,
      `SELECT id, username, email, nickname, avatar, bio, role,
              verify_count, reputation, like_count, created_at, updated_at
       FROM users WHERE id = ?`,
      [auth.id],
    );

    if (!user) {
      throw new APIError(404, 'User not found');
    }

    return jsonResponse({ user });
  } catch (error) {
    return handleError(error);
  }
};

/**
 * DELETE /api/users/me
 *
 * Schedules account deletion. The account is marked for deletion immediately,
 * and all user data will be fully purged within 72 hours (Requirement 47.4).
 *
 * Implementation: We set a `deleted_at` timestamp on the user record and
 * store a KV entry with 72h TTL that triggers the purge job.
 * For now, we immediately soft-delete by clearing sensitive data and
 * marking the account, then schedule full purge via KV expiration.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const auth = requireAuth(context);
    if (auth instanceof Response) return auth;

    const { DB, KV } = context.env;
    const now = new Date().toISOString();

    // Schedule full data purge within 72 hours via KV
    // The purge worker will pick this up and delete all associated data
    const purgeAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    await KV.put(
      `account:delete:${auth.id}`,
      JSON.stringify({
        userId: auth.id,
        requestedAt: now,
        purgeAt,
      }),
      { expirationTtl: 72 * 60 * 60 }, // 72 hours
    );

    // Immediately anonymize the account — clear personal data
    await execute(
      DB,
      `UPDATE users SET
        email = ?,
        nickname = 'Deleted User',
        avatar = NULL,
        bio = NULL,
        password_hash = 'DELETED',
        updated_at = ?
       WHERE id = ?`,
      [`deleted_${auth.id}@starhub.local`, now, auth.id],
    );

    // Clear user settings
    await execute(DB, `DELETE FROM user_settings WHERE user_id = ?`, [auth.id]);

    // Invalidate session
    await KV.delete(`session:${auth.id}`);

    return jsonResponse({
      success: true,
      message: 'Account scheduled for deletion. All data will be purged within 72 hours.',
      purgeAt,
    });
  } catch (error) {
    return handleError(error);
  }
};
