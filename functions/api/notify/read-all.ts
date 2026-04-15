/**
 * PUT /api/notify/read-all — Mark all notifications as read
 *
 * Validates: Requirement 42.1
 */

import { requireAuth } from '../_lib/auth';
import { execute, jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const now = new Date().toISOString();

    const result = await execute(
      context.env.DB,
      'UPDATE notifications SET read = 1, read_at = ? WHERE user_id = ? AND read = 0',
      [now, user.id],
    );

    return jsonResponse({ readAll: true, updated: result.changes });
  } catch (error) {
    return handleError(error);
  }
};
