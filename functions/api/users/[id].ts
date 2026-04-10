/**
 * GET /api/users/:id
 *
 * Returns public profile fields for a user. No authentication required.
 * Excludes email and password_hash for privacy.
 *
 * Validates: Requirement 4 (AC5)
 */

import { queryOne, jsonResponse, errorResponse } from '../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

interface PublicUserRow {
  id: number;
  username: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  role: string;
  reputation: number;
  verify_count: number;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id;

  // Validate id is a numeric value
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return errorResponse('Invalid user ID', 400);
  }

  // Query only public fields — never return email or password_hash
  const user = await queryOne<PublicUserRow>(
    context.env.DB,
    `SELECT id, username, nickname, avatar, bio, role, reputation, verify_count
     FROM users WHERE id = ?`,
    [userId],
  );

  if (!user) {
    return errorResponse('User not found', 404);
  }

  return jsonResponse({ user });
};
