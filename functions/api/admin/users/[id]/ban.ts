/**
 * PUT /api/admin/users/[id]/ban — Ban or unban a user
 *
 * Body: { action: 'ban' | 'unban', reason?: string }
 *
 * Records operation in admin_logs.
 *
 * Validates: Requirement 55.2, 55.5
 */

import { requireAuth } from '../../../_lib/auth';
import { execute, queryOne, jsonResponse, errorResponse } from '../../../_lib/db';
import { handleError } from '../../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const admin = requireAuth(context);
    if (admin instanceof Response) return admin;

    const targetId = context.params.id as string;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const action = typeof body.action === 'string' ? body.action : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    if (action !== 'ban' && action !== 'unban') {
      return errorResponse('action must be "ban" or "unban"', 400);
    }

    // Verify target user exists
    const target = await queryOne<{ id: number; username: string; banned: number }>(
      context.env.DB,
      'SELECT id, username, banned FROM users WHERE id = ?',
      [targetId],
    );

    if (!target) {
      return errorResponse('User not found', 404);
    }

    const now = new Date().toISOString();
    const banned = action === 'ban' ? 1 : 0;

    await execute(
      context.env.DB,
      'UPDATE users SET banned = ?, updated_at = ? WHERE id = ?',
      [banned, now, targetId],
    );

    // Log the operation
    await execute(
      context.env.DB,
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, 'user', ?, ?, ?)`,
      [
        admin.id,
        action,
        targetId,
        JSON.stringify({ username: target.username, reason }),
        now,
      ],
    ).catch(() => {});

    return jsonResponse({
      userId: target.id,
      username: target.username,
      banned: action === 'ban',
      action,
      reason,
    });
  } catch (error) {
    return handleError(error);
  }
};
