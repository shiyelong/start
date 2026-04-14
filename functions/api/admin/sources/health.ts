/**
 * GET /api/admin/sources/health — Source health monitoring dashboard
 *
 * Returns all sources with their health status, average response time,
 * success rate, and fail count for the admin monitoring dashboard.
 *
 * Requires authentication via requireAuth().
 *
 * Validates: Requirements 10.4, 10.5, 15.4, 15.5, 20.4, 20.5, 32.7
 */

import { requireAuth } from '../../_lib/auth';
import { query, jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
}

interface SourceRow {
  id: string;
  name: string;
  type: string;
  enabled: number;
  health: string;
  avg_response_time: number;
  success_rate: number;
  fail_count: number;
  last_checked: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const authResult = requireAuth(context);
    if (authResult instanceof Response) return authResult;

    const sources = await query<SourceRow>(
      context.env.DB,
      `SELECT id, name, type, enabled, health, avg_response_time,
              success_rate, fail_count, last_checked
       FROM source_config
       ORDER BY type, name`,
    );

    // Compute summary statistics
    const total = sources.length;
    const online = sources.filter((s) => s.health === 'online').length;
    const degraded = sources.filter((s) => s.health === 'degraded').length;
    const offline = sources.filter((s) => s.health === 'offline').length;
    const enabledCount = sources.filter((s) => s.enabled === 1).length;

    const avgResponseTime =
      total > 0
        ? Math.round(
            sources.reduce((sum, s) => sum + s.avg_response_time, 0) / total,
          )
        : 0;

    const avgSuccessRate =
      total > 0
        ? Math.round(
            sources.reduce((sum, s) => sum + s.success_rate, 0) / total,
          )
        : 0;

    return jsonResponse({
      summary: {
        total,
        online,
        degraded,
        offline,
        enabled: enabledCount,
        avgResponseTime,
        avgSuccessRate,
      },
      sources,
    });
  } catch (error) {
    return handleError(error);
  }
};
