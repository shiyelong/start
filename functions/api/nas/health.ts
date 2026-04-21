/**
 * GET /api/nas/health — NAS connection health check
 *
 * Returns NAS tunnel connection status, latency, disk usage.
 * Admin-only endpoint.
 *
 * Validates: Requirement 52.8, Project Constitution Ch.2
 */

import { requireAuth } from '../_lib/auth';
import { jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';
import { checkNasHealth, getBandwidthStatus, buildNasConfig } from '../_lib/nas-proxy';

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
      return jsonResponse({
        health: {
          connected: false,
          latencyMs: 0,
          lastChecked: new Date().toISOString(),
          error: 'NAS 配置缺失（NAS_BASE_URL / NAS_SIGNING_KEY / NAS_ENCRYPTION_KEY）',
        },
        bandwidth: null,
      });
    }

    const [health, bandwidth] = await Promise.all([
      checkNasHealth(nasConfig),
      getBandwidthStatus(nasConfig.kv),
    ]);

    return jsonResponse({ health, bandwidth });
  } catch (error) {
    return handleError(error);
  }
};
