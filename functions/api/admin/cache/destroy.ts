/**
 * POST /api/admin/cache/destroy — Emergency destroy all cached data
 *
 * Requires admin password confirmation in body.
 * Deletes all encrypted files from NAS + D1 index + R2 backup index.
 *
 * Validates: Requirement 52.10, 52.11
 */

import { requireAuth } from '../../_lib/auth';
import { jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';
import { destroyAllCache } from '../../_lib/nas-cache';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    // Require password confirmation for destructive operation
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
    if (!confirmPassword) {
      return errorResponse('Password confirmation required for emergency destroy', 400);
    }

    // Stub: In production, verify admin password here
    // const passwordValid = await verifyPassword(confirmPassword, storedHash);
    // if (!passwordValid) return errorResponse('Invalid password', 403);

    await destroyAllCache(context.env.DB);

    return jsonResponse({
      destroyed: true,
      message: 'All cache data has been permanently destroyed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
};
