/**
 * POST /api/auth/register
 *
 * Creates a new user account with username, email, and password.
 * Returns a JWT token and the user profile on success.
 *
 * Validates: Requirement 2 (AC1–AC6)
 */

import { hashPassword, signJwt } from '../_lib/auth';
import { queryOne, execute, jsonResponse, errorResponse } from '../_lib/db';

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB, JWT_SECRET } = context.env;

  // Parse request body
  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  // AC6: Check missing fields
  const missing: string[] = [];
  if (!username) missing.push('username');
  if (!email) missing.push('email');
  if (!password) missing.push('password');
  if (missing.length > 0) {
    return errorResponse(`Missing required fields: ${missing.join(', ')}`, 400);
  }

  // AC2: Username length 2–20
  if (username.length < 2 || username.length > 20) {
    return errorResponse('Username must be between 2 and 20 characters', 400);
  }

  // AC3: Password length 6+
  if (password.length < 6) {
    return errorResponse('Password must be at least 6 characters', 400);
  }

  // Email format validation
  if (!EMAIL_REGEX.test(email)) {
    return errorResponse('Invalid email format', 400);
  }

  // AC4: Check uniqueness
  const existingUsername = await queryOne(DB, 'SELECT id FROM users WHERE username = ?', [username]);
  if (existingUsername) {
    return errorResponse('Username already taken', 400);
  }

  const existingEmail = await queryOne(DB, 'SELECT id FROM users WHERE email = ?', [email]);
  if (existingEmail) {
    return errorResponse('Email already taken', 400);
  }

  // AC5: Hash password
  const passwordHash = await hashPassword(password);

  // Insert user
  const now = new Date().toISOString();
  const { lastRowId } = await execute(
    DB,
    `INSERT INTO users (username, email, password_hash, nickname, avatar, bio, role, verify_count, reputation, like_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'user', 0, 0, 0, ?, ?)`,
    [username, email, passwordHash, username, '', '', now, now],
  );

  // Fetch the created user
  const user = await queryOne<UserRow>(
    DB,
    `SELECT id, username, email, nickname, avatar, bio, role, verify_count, reputation, like_count, created_at
     FROM users WHERE id = ?`,
    [lastRowId],
  );

  if (!user) {
    return errorResponse('Failed to create user', 500);
  }

  // AC1: Generate JWT
  const token = await signJwt({ id: user.id, role: user.role }, JWT_SECRET);

  return jsonResponse({ token, user }, 201);
};
