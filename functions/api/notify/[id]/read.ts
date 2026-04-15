/**
 * PUT /api/notify/[id]/read — Mark single notification as read
 *
 * Validates: Requirement 42.1
 */

import { requireAuth } from '../../_lib/auth';
import { execute, jsonResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const id = context.params.id as string;
    const now = new Date().toISOString();

    await execute(
      context.env.DB,
      'UPDATE notifications SET read = 1, read_at = ? WHERE id = ? AND user_id = ?',
      [now, id, user.id],
    );

    return jsonResponse({ read: true, id });
  } catch (error) {
    return handleError(error);
  }
};
