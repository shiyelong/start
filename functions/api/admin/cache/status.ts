/**
 * GET /api/admin/cache/status — Cache status overview
 *
 * Returns: total size, file count, hit rate, type breakdown, NAS connection status.
 * Now performs real NAS tunnel health check via nas-proxy.
 *
 * Validates: Requirement 52.8
 */

import { requireAuth } from '../../_lib/auth';
import { jsonResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';
import { getCacheStatus } from '../../_lib/nas-cache';
import { buildNasConfig, getBandwidthStatus } from '../../_lib/nas-proxy';

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

    // Pass NAS config for real tunnel health check
    const status = await getCacheStatus(context.env.DB, nasConfig ?? undefined);

    // Include bandwidth info if NAS is configured
    let bandwidth = null;
    if (nasConfig) {
      bandwidth = await getBandwidthStatus(nasConfig.kv);
    }

    return jsonResponse({ status, bandwidth });
  } catch (error) {
    return handleError(error);
  }
};
