/**
 * PUT    /api/admin/sources/[id] — Update an existing aggregation source
 * DELETE /api/admin/sources/[id] — Delete an aggregation source
 *
 * All endpoints require authentication via requireAuth().
 *
 * Validates: Requirements 10.1-10.5, 15.1-15.5, 20.1-20.6, 32.1-32.7
 */

import { requireAuth } from '../../_lib/auth';
import { queryOne, execute, jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString, validateEnum } from '../../_lib/validate';

interface Env {
  DB: D1Database;
}

const VALID_TYPES = ['video', 'music', 'comic', 'novel', 'anime', 'live', 'podcast'] as const;
const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
const VALID_HEALTH = ['online', 'offline', 'degraded'] as const;

// ── PUT /api/admin/sources/[id] ───────────────────────────────

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const authResult = requireAuth(context);
    if (authResult instanceof Response) return authResult;

    const id = context.params.id as string;
    if (!id) throw new APIError(400, 'Missing source id');

    // Verify source exists
    const existing = await queryOne(
      context.env.DB,
      'SELECT id FROM source_config WHERE id = ?',
      [id],
    );
    if (!existing) throw new APIError(404, 'Source not found');

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    // Build dynamic UPDATE — only update provided fields
    const updates: string[] = [];
    const params: unknown[] = [];

    if (typeof body.name === 'string') {
      const name = sanitizeString(body.name, 200);
      if (!name) throw new APIError(400, 'name cannot be empty');
      updates.push('name = ?');
      params.push(name);
    }

    if (typeof body.type === 'string') {
      if (!validateEnum(body.type, VALID_TYPES)) {
        throw new APIError(400, `Invalid type. Allowed: ${VALID_TYPES.join(', ')}`);
      }
      updates.push('type = ?');
      params.push(body.type);
    }

    if (typeof body.enabled === 'boolean' || typeof body.enabled === 'number') {
      updates.push('enabled = ?');
      params.push(body.enabled ? 1 : 0);
    }

    if (typeof body.rating === 'string') {
      if (!validateEnum(body.rating, VALID_RATINGS)) {
        throw new APIError(400, `Invalid rating. Allowed: ${VALID_RATINGS.join(', ')}`);
      }
      updates.push('rating = ?');
      params.push(body.rating);
    }

    if (typeof body.priority === 'number') {
      if (body.priority < 0 || body.priority > 100) {
        throw new APIError(400, 'Priority must be between 0 and 100');
      }
      updates.push('priority = ?');
      params.push(body.priority);
    }

    if (typeof body.searchUrl === 'string') {
      const searchUrl = sanitizeString(body.searchUrl, 2000);
      if (!searchUrl) throw new APIError(400, 'searchUrl cannot be empty');
      updates.push('search_url = ?');
      params.push(searchUrl);
    }

    if (typeof body.parseRules === 'string') {
      try {
        JSON.parse(body.parseRules);
      } catch {
        throw new APIError(400, 'parseRules must be valid JSON');
      }
      updates.push('parse_rules = ?');
      params.push(body.parseRules);
    }

    if (typeof body.timeout === 'number') {
      if (body.timeout < 1000 || body.timeout > 60000) {
        throw new APIError(400, 'Timeout must be between 1000 and 60000 ms');
      }
      updates.push('timeout = ?');
      params.push(body.timeout);
    }

    if (typeof body.health === 'string') {
      if (!validateEnum(body.health, VALID_HEALTH)) {
        throw new APIError(400, `Invalid health. Allowed: ${VALID_HEALTH.join(', ')}`);
      }
      updates.push('health = ?');
      params.push(body.health);
    }

    if (updates.length === 0) {
      throw new APIError(400, 'No valid fields to update');
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = ?');
    const now = new Date().toISOString();
    params.push(now);

    // Add the WHERE clause param
    params.push(id);

    await execute(
      context.env.DB,
      `UPDATE source_config SET ${updates.join(', ')} WHERE id = ?`,
      params,
    );

    // Return the updated source
    const updated = await queryOne(
      context.env.DB,
      'SELECT * FROM source_config WHERE id = ?',
      [id],
    );

    return jsonResponse({ source: updated });
  } catch (error) {
    return handleError(error);
  }
};

// ── DELETE /api/admin/sources/[id] ────────────────────────────

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const authResult = requireAuth(context);
    if (authResult instanceof Response) return authResult;

    const id = context.params.id as string;
    if (!id) throw new APIError(400, 'Missing source id');

    // Verify source exists
    const existing = await queryOne(
      context.env.DB,
      'SELECT id FROM source_config WHERE id = ?',
      [id],
    );
    if (!existing) throw new APIError(404, 'Source not found');

    await execute(
      context.env.DB,
      'DELETE FROM source_config WHERE id = ?',
      [id],
    );

    return jsonResponse({ success: true, id });
  } catch (error) {
    return handleError(error);
  }
};
