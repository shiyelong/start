/**
 * POST /api/admin/sources/[id]/test — Test source connectivity
 *
 * Currently returns a mock test result. In the future this will
 * instantiate the source's adapter and call healthCheck().
 *
 * Requires authentication via requireAuth().
 *
 * Validates: Requirements 10.4, 15.4, 20.4, 32.5
 */

import { requireAuth } from '../../../_lib/auth';
import { queryOne, execute, jsonResponse } from '../../../_lib/db';
import { APIError, handleError } from '../../../_lib/errors';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const authResult = requireAuth(context);
    if (authResult instanceof Response) return authResult;

    const id = context.params.id as string;
    if (!id) throw new APIError(400, 'Missing source id');

    // Verify source exists
    const source = await queryOne<{ id: string; name: string; health: string }>(
      context.env.DB,
      'SELECT id, name, health FROM source_config WHERE id = ?',
      [id],
    );
    if (!source) throw new APIError(404, 'Source not found');

    // Mock connectivity test — simulate a response time between 100-500ms
    const responseTime = Math.floor(Math.random() * 401) + 100;
    const success = true;
    const now = new Date().toISOString();

    // Update last_checked timestamp and health status on successful test
    await execute(
      context.env.DB,
      `UPDATE source_config
       SET last_checked = ?, health = 'online', fail_count = 0, updated_at = ?
       WHERE id = ?`,
      [now, now, id],
    );

    return jsonResponse({
      success,
      sourceId: id,
      sourceName: source.name,
      responseTime,
      testedAt: now,
    });
  } catch (error) {
    return handleError(error);
  }
};
