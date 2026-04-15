/**
 * GET /api/admin/cache/status — Cache status overview
 *
 * Returns: total size, file count, hit rate, type breakdown, NAS connection status.
 *
 * Validates: Requirement 52.8
 */

import { requireAuth } from '../../_lib/auth';
import { jsonResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';
import { getCacheStatus } from '../../_lib/nas-cache';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const status = await getCacheStatus(context.env.DB);

    return jsonResponse({ status });
  } catch (error) {
    return handleError(error);
  }
};
