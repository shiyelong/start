/**
 * PUT /api/users/me/password
 *
 * Allows an authenticated user to change their password.
 * Requires the current password for verification.
 *
 * Validates: Requirements 41.1, 41.2
 */

import { requireAuth, hashPassword, verifyPassword } from '../../_lib/auth';
import { queryOne, execute, jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
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

    const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    // Validate required fields
    if (!oldPassword || !newPassword) {
      throw new APIError(400, 'Both oldPassword and newPassword are required');
    }

    // New password length 6+
    if (newPassword.length < 6) {
      throw new APIError(400, 'New password must be at least 6 characters');
    }

    // Fetch current password hash
    const user = await queryOne<{ password_hash: string }>(
      context.env.DB,
      'SELECT password_hash FROM users WHERE id = ?',
      [auth.id],
    );

    if (!user) {
      throw new APIError(404, 'User not found');
    }

    // Verify old password
    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) {
      throw new APIError(401, 'Current password is incorrect');
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Update password
    await execute(
      context.env.DB,
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
      [newHash, auth.id],
    );

    return jsonResponse({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    return handleError(error);
  }
};
