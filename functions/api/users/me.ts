/**
 * PUT /api/users/me
 *
 * Allows an authenticated user to update their profile (nickname, bio, avatar).
 * Persists changes and returns the updated profile.
 *
 * Validates: Requirement 4 (AC2)
 */

import { requireAuth } from '../_lib/auth';
import { execute, queryOne, jsonResponse, errorResponse } from '../_lib/db';

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
  // Step 1: Require authentication — 401 if not authenticated
  const auth = requireAuth(context);
  if (auth instanceof Response) return auth;

  // Step 2: Parse JSON body
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  // Step 3: Build dynamic UPDATE for only provided fields
  const setClauses: string[] = [];
  const params: unknown[] = [];

  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (value !== null && typeof value !== 'string') {
        return errorResponse(`Field "${field}" must be a string or null`, 400);
      }
      setClauses.push(`${field} = ?`);
      params.push(value ?? null);
    }
  }

  if (setClauses.length === 0) {
    return errorResponse('No valid fields to update. Allowed: nickname, bio, avatar', 400);
  }

  // Always update the updated_at timestamp
  setClauses.push('updated_at = datetime(\'now\')');
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
    return errorResponse('User not found', 404);
  }

  return jsonResponse({ user });
};
