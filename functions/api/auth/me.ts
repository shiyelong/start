/**
 * GET /api/auth/me
 *
 * Returns the full profile of the currently authenticated user.
 * Requires a valid JWT token (set by middleware).
 *
 * Validates: Requirement 4 (AC1)
 */

import { requireAuth } from '../_lib/auth';
import { queryOne, jsonResponse, errorResponse } from '../_lib/db';

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
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Step 1: Require authentication
  const auth = requireAuth(context);
  if (auth instanceof Response) return auth;

  // Step 2: Query user by id (exclude password_hash)
  const user = await queryOne<UserRow>(
    context.env.DB,
    `SELECT id, username, email, nickname, avatar, bio, role,
            verify_count, reputation, like_count, created_at
     FROM users WHERE id = ?`,
    [auth.id],
  );

  if (!user) {
    return errorResponse('User not found', 404);
  }

  // Step 3: Return full user profile
  return jsonResponse({ user });
};
