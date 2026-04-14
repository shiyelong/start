/**
 * POST /api/auth/login
 *
 * Authenticates a user with email and password.
 * Returns a JWT token (30-day expiry) and the user profile on success.
 * Caches session data in KV with TTL matching JWT expiration.
 *
 * Validates: Requirements 41.1, 41.2
 */

import { verifyPassword, signJwt } from '../_lib/auth';
import { queryOne, jsonResponse } from '../_lib/db';
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
  password_hash: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  role: string;
  verify_count: number;
  reputation: number;
  like_count: number;
  created_at: string;
}

/** 30 days in seconds — matches JWT expiry. */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { DB, KV, JWT_SECRET } = context.env;

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    // Check missing fields
    const missing: string[] = [];
    if (!email) missing.push('email');
    if (!password) missing.push('password');
    if (missing.length > 0) {
      throw new APIError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    // Look up user by email — use generic error for both cases
    const user = await queryOne<UserRow>(
      DB,
      `SELECT id, username, email, password_hash, nickname, avatar, bio, role,
              verify_count, reputation, like_count, created_at
       FROM users WHERE email = ?`,
      [email],
    );

    if (!user) {
      throw new APIError(401, 'Email or password incorrect');
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new APIError(401, 'Email or password incorrect');
    }

    // Generate JWT (30-day expiry is the default in signJwt)
    const token = await signJwt({ id: user.id, role: user.role }, JWT_SECRET);

    // Cache session in KV with TTL matching JWT expiration
    await KV.put(
      `session:${user.id}`,
      JSON.stringify({ id: user.id, role: user.role }),
      { expirationTtl: SESSION_TTL_SECONDS },
    );

    // Return token + user profile (exclude password_hash)
    const { password_hash: _, ...profile } = user;

    return jsonResponse({ token, user: profile });
  } catch (error) {
    return handleError(error);
  }
};
