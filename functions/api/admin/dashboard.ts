/**
 * GET /api/admin/dashboard — Platform statistics overview
 *
 * Returns: registered users, DAU, content counts, search volume,
 * NAS cache status, source health summary, bandwidth usage.
 *
 * Validates: Requirement 55.6
 */

import { requireAuth } from '../_lib/auth';
import { queryOne, query, jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Total registered users
    const usersCount = await queryOne<{ 'COUNT(*)': number }>(
      context.env.DB,
      'SELECT COUNT(*) FROM users',
    ).catch(() => null);

    // Daily active users (users with activity today)
    const dauCount = await queryOne<{ 'COUNT(*)': number }>(
      context.env.DB,
      'SELECT COUNT(DISTINCT user_id) AS "COUNT(*)" FROM playback_history WHERE created_at >= ?',
      [todayStart],
    ).catch(() => null);

    // Content counts by type
    const sourceCounts = await query<{ type: string; cnt: number }>(
      context.env.DB,
      'SELECT type, COUNT(*) AS cnt FROM source_config WHERE enabled = 1 GROUP BY type',
    ).catch(() => []);

    const contentByType: Record<string, number> = {};
    sourceCounts.forEach((row) => {
      contentByType[row.type] = row.cnt;
    });

    // Source health summary
    const healthSummary = await query<{ health: string; cnt: number }>(
      context.env.DB,
      'SELECT health, COUNT(*) AS cnt FROM source_config GROUP BY health',
    ).catch(() => []);

    const sourceHealth: Record<string, number> = {};
    let sourceTotal = 0;
    healthSummary.forEach((row) => {
      sourceHealth[row.health] = row.cnt;
      sourceTotal += row.cnt;
    });

    // NAS cache status from KV
    const cacheStatus = await context.env.KV.get('nas:cache:status', 'text').catch(() => null);

    // Today's search count
    const searchCount = await queryOne<{ 'COUNT(*)': number }>(
      context.env.DB,
      'SELECT COUNT(*) FROM search_logs WHERE created_at >= ?',
      [todayStart],
    ).catch(() => null);

    return jsonResponse({
      totalUsers: usersCount?.['COUNT(*)'] ?? 0,
      dailyActiveUsers: dauCount?.['COUNT(*)'] ?? 0,
      contentByType,
      todaySearches: searchCount?.['COUNT(*)'] ?? 0,
      cacheStatus: cacheStatus || 'unknown',
      sourceHealth,
      sourceTotal,
      sourceHealthy: sourceHealth['online'] ?? 0,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
};
