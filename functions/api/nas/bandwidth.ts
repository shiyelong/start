/**
 * GET /api/nas/bandwidth — NAS bandwidth usage status
 *
 * Returns today's bandwidth usage, daily limit, and throttle status.
 * Used by admin dashboard to monitor ISP detection risk.
 *
 * Validates: Requirement 52.9, Project Constitution Ch.2
 */

import { requireAuth } from '../_lib/auth';
import { jsonResponse, errorResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';
import { getBandwidthStatus, buildNasConfig } from '../_lib/nas-proxy';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  NAS_BASE_URL: string;
  NAS_SIGNING_KEY: string;
  NAS_ENCRYPTION_KEY: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const nasConfig = buildNasConfig(context.env);
    if (!nasConfig) {
      return errorResponse('NAS 配置缺失', 503);
    }

    const bandwidth = await getBandwidthStatus(nasConfig.kv);

    return jsonResponse({
      bandwidth,
      // Human-readable summary
      summary: {
        usedGB: (bandwidth.usedToday / (1024 * 1024 * 1024)).toFixed(2),
        limitGB: (bandwidth.limitPerDay / (1024 * 1024 * 1024)).toFixed(0),
        remainingGB: (bandwidth.remaining / (1024 * 1024 * 1024)).toFixed(2),
        percentUsed: ((bandwidth.usedToday / bandwidth.limitPerDay) * 100).toFixed(1),
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
