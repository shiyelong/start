/**
 * POST /api/admin/auth/login — Admin login with separate JWT
 *
 * Body: { username: string, password: string }
 *
 * Admin authentication is isolated from regular user auth.
 * Issues a JWT with role='admin' or specific admin sub-role.
 *
 * Validates: Requirement 55.1, 55.2
 */

import { signJwt, verifyPassword } from '../../_lib/auth';
import { queryOne, execute, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return errorResponse('Missing username or password', 400);
    }

    // Look up admin in admins table
    const admin = await queryOne<{
      id: number;
      username: string;
      password_hash: string;
      role: string;
      active: number;
    }>(
      context.env.DB,
      'SELECT id, username, password_hash, role, active FROM admins WHERE username = ?',
      [username],
    );

    if (!admin) {
      return errorResponse('用户名或密码错误', 401);
    }

    if (!admin.active) {
      return errorResponse('账户已被禁用', 403);
    }

    // Verify password
    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) {
      return errorResponse('用户名或密码错误', 401);
    }

    // Issue admin JWT (shorter expiry: 7 days)
    const token = await signJwt(
      { id: admin.id, role: admin.role },
      context.env.JWT_SECRET,
      7,
    );

    // Log the login
    const now = new Date().toISOString();
    await execute(
      context.env.DB,
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'login', 'admin', ?, ?, ?)`,
      [admin.id, String(admin.id), 'Admin login', now],
    ).catch(() => {});

    return jsonResponse({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
