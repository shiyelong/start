/**
 * POST /api/auth/register
 *
 * Creates a new user account with email and password only.
 * No phone number, no real name, no third-party login (Requirement 41.4, 41.5).
 * Supports anonymous email providers like ProtonMail, Tutanota (Requirement 41.6).
 * Returns a JWT token and the user profile on success.
 *
 * Validates: Requirements 41.1, 41.2, 41.4, 41.5, 41.6
 */

import { hashPassword, signJwt } from '../_lib/auth';
import { queryOne, execute, jsonResponse } from '../_lib/db';
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
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { DB, JWT_SECRET } = context.env;

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    // Username is optional — auto-generate from email prefix if not provided
    const username = typeof body.username === 'string' ? body.username.trim() : '';

    // Validate required fields (only email + password, Requirement 41.5)
    const missing: string[] = [];
    if (!email) missing.push('email');
    if (!password) missing.push('password');
    if (missing.length > 0) {
      throw new APIError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    // Email format validation — accept any valid email including
    // anonymous providers like ProtonMail, Tutanota (Requirement 41.6)
    if (!EMAIL_REGEX.test(email)) {
      throw new APIError(400, 'Invalid email format');
    }

    // Password length 6+
    if (password.length < 6) {
      throw new APIError(400, 'Password must be at least 6 characters');
    }

    // Auto-generate username from email prefix if not provided
    let finalUsername = username;
    if (!finalUsername) {
      finalUsername = email.split('@')[0].slice(0, 20);
    }

    // Username length 2–20
    if (finalUsername.length < 2 || finalUsername.length > 20) {
      throw new APIError(400, 'Username must be between 2 and 20 characters');
    }

    // Check uniqueness — email
    const existingEmail = await queryOne(DB, 'SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail) {
      throw new APIError(400, 'Email already registered');
    }

    // Check uniqueness — username (auto-append random suffix if collision)
    let usernameToUse = finalUsername;
    const existingUsername = await queryOne(DB, 'SELECT id FROM users WHERE username = ?', [usernameToUse]);
    if (existingUsername) {
      // Append random suffix to avoid collision
      const suffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      usernameToUse = `${finalUsername.slice(0, 15)}_${suffix}`;
    }

    // Hash password (PBKDF2 via Web Crypto, Requirement 41.2)
    const passwordHash = await hashPassword(password);

    // Insert user
    const now = new Date().toISOString();
    const { lastRowId } = await execute(
      DB,
      `INSERT INTO users (username, email, password_hash, nickname, avatar, bio, role, verify_count, reputation, like_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'user', 0, 0, 0, ?, ?)`,
      [usernameToUse, email, passwordHash, usernameToUse, '', '', now, now],
    );

    // Create default user_settings row
    await execute(
      DB,
      `INSERT INTO user_settings (user_id, age_gate_mode, daily_limit, notification_prefs, theme, updated_at)
       VALUES (?, 'adult', 0, '{}', 'dark', ?)`,
      [lastRowId, now],
    );

    // Fetch the created user
    const user = await queryOne<UserRow>(
      DB,
      `SELECT id, username, email, nickname, avatar, bio, role, verify_count, reputation, like_count, created_at
       FROM users WHERE id = ?`,
      [lastRowId],
    );

    if (!user) {
      throw new APIError(500, 'Failed to create user');
    }

    // Generate JWT
    const token = await signJwt({ id: user.id, role: user.role }, JWT_SECRET);

    return jsonResponse({ token, user }, 201);
  } catch (error) {
    return handleError(error);
  }
};
