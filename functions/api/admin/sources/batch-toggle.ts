/**
 * POST /api/admin/sources/batch-toggle — Batch enable/disable sources
 *
 * Body: { ids: string[], enabled: boolean }
 *
 * Requires authentication via requireAuth().
 *
 * Validates: Requirements 10.3, 15.3, 20.3, 32.6
 */

import { requireAuth } from '../../_lib/auth';
import { execute, jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const authResult = requireAuth(context);
    if (authResult instanceof Response) return authResult;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    const ids = body.ids;
    const enabled = body.enabled;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new APIError(400, 'ids must be a non-empty array of strings');
    }

    if (typeof enabled !== 'boolean') {
      throw new APIError(400, 'enabled must be a boolean');
    }

    // Validate all ids are strings
    for (const id of ids) {
      if (typeof id !== 'string' || id.length === 0) {
        throw new APIError(400, 'Each id must be a non-empty string');
      }
    }

    // Cap batch size to prevent abuse
    if (ids.length > 100) {
      throw new APIError(400, 'Maximum 100 sources per batch operation');
    }

    const enabledValue = enabled ? 1 : 0;
    const now = new Date().toISOString();

    // Build parameterized IN clause
    const placeholders = ids.map(() => '?').join(', ');
    const params = [enabledValue, now, ...ids];

    const result = await execute(
      context.env.DB,
      `UPDATE source_config SET enabled = ?, updated_at = ? WHERE id IN (${placeholders})`,
      params,
    );

    return jsonResponse({
      success: true,
      updated: result.changes,
      enabled,
    });
  } catch (error) {
    return handleError(error);
  }
};
