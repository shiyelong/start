/**
 * GET  /api/admin/sources — List all aggregation sources (with optional type/health filters)
 * POST /api/admin/sources — Add a new aggregation source
 *
 * All endpoints require authentication via requireAuth().
 *
 * Validates: Requirements 10.1-10.5, 15.1-15.5, 20.1-20.6, 32.1-32.7
 */

import { requireAuth } from '../../_lib/auth';
import { query, execute, jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString, validateEnum } from '../../_lib/validate';

interface Env {
  DB: D1Database;
}

const VALID_TYPES = ['video', 'music', 'comic', 'novel', 'anime', 'live', 'podcast'] as const;
const VALID_HEALTH = ['online', 'offline', 'degraded'] as const;
const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;

// ── GET /api/admin/sources ────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const authResult = requireAuth(context);
    if (authResult instanceof Response) return authResult;

    const url = new URL(context.request.url);
    const typeFilter = url.searchParams.get('type');
    const healthFilter = url.searchParams.get('health');

    // Build query with optional filters
    let sql = 'SELECT * FROM source_config WHERE 1=1';
    const params: unknown[] = [];

    if (typeFilter) {
      if (!validateEnum(typeFilter, VALID_TYPES)) {
        throw new APIError(400, `Invalid type filter. Allowed: ${VALID_TYPES.join(', ')}`);
      }
      sql += ' AND type = ?';
      params.push(typeFilter);
    }

    if (healthFilter) {
      if (!validateEnum(healthFilter, VALID_HEALTH)) {
        throw new APIError(400, `Invalid health filter. Allowed: ${VALID_HEALTH.join(', ')}`);
      }
      sql += ' AND health = ?';
      params.push(healthFilter);
    }

    sql += ' ORDER BY type, priority ASC';

    const sources = await query(context.env.DB, sql, params);

    return jsonResponse({ sources });
  } catch (error) {
    return handleError(error);
  }
};

// ── POST /api/admin/sources ───────────────────────────────────

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

    // Validate required fields
    const name = typeof body.name === 'string' ? sanitizeString(body.name, 200) : '';
    const type = typeof body.type === 'string' ? body.type : '';
    const rating = typeof body.rating === 'string' ? body.rating : 'PG';
    const priority = typeof body.priority === 'number' ? body.priority : 50;
    const searchUrl = typeof body.searchUrl === 'string' ? sanitizeString(body.searchUrl, 2000) : '';
    const parseRules = typeof body.parseRules === 'string' ? body.parseRules : '{}';
    const timeout = typeof body.timeout === 'number' ? body.timeout : 10000;

    if (!name) throw new APIError(400, 'Missing required field: name');
    if (!searchUrl) throw new APIError(400, 'Missing required field: searchUrl');

    if (!validateEnum(type, VALID_TYPES)) {
      throw new APIError(400, `Invalid type. Allowed: ${VALID_TYPES.join(', ')}`);
    }

    if (!validateEnum(rating, VALID_RATINGS)) {
      throw new APIError(400, `Invalid rating. Allowed: ${VALID_RATINGS.join(', ')}`);
    }

    if (priority < 0 || priority > 100) {
      throw new APIError(400, 'Priority must be between 0 and 100');
    }

    if (timeout < 1000 || timeout > 60000) {
      throw new APIError(400, 'Timeout must be between 1000 and 60000 ms');
    }

    // Validate parseRules is valid JSON
    try {
      JSON.parse(parseRules);
    } catch {
      throw new APIError(400, 'parseRules must be valid JSON');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      context.env.DB,
      `INSERT INTO source_config
        (id, name, type, enabled, rating, priority, search_url, parse_rules,
         timeout, health, avg_response_time, success_rate, fail_count,
         last_checked, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 'online', 0, 100, 0, NULL, ?, ?)`,
      [id, name, type, rating, priority, searchUrl, parseRules, timeout, now, now],
    );

    const source = {
      id,
      name,
      type,
      enabled: true,
      rating,
      priority,
      searchUrl,
      parseRules,
      timeout,
      health: 'online',
      avgResponseTime: 0,
      successRate: 100,
      failCount: 0,
      lastChecked: null,
      createdAt: now,
      updatedAt: now,
    };

    return jsonResponse({ source }, 201);
  } catch (error) {
    return handleError(error);
  }
};
