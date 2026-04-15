/**
 * POST /api/admin/cache/clear — Clear cache by criteria
 *
 * Body: { type?: string, olderThanDays?: number, leastAccessed?: number }
 *
 * Validates: Requirement 52.8, 52.10
 */

import { requireAuth } from '../../_lib/auth';
import { jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';
import { clearCache } from '../../_lib/nas-cache';

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

    const criteria = {
      type: typeof body.type === 'string' ? body.type : undefined,
      olderThanDays: typeof body.olderThanDays === 'number' ? body.olderThanDays : undefined,
      leastAccessed: typeof body.leastAccessed === 'number' ? body.leastAccessed : undefined,
    };

    const deleted = await clearCache(context.env.DB, criteria);

    return jsonResponse({
      cleared: true,
      deletedEntries: deleted,
      criteria,
    });
  } catch (error) {
    return handleError(error);
  }
};
