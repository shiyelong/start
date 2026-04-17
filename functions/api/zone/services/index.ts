/**
 * /api/zone/services — Service provider list + create
 *
 * GET  /api/zone/services — Paginated list with multi-dimension filters
 * POST /api/zone/services — Submit a new service provider profile (auth required)
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_SERVICE_TYPES = [
  'loufeng', 'waiwai', 'spa', 'companion', 'performance', 'health-beauty',
  'full-service', 'special', 'multi', 'long-term', 'online', 'venue',
  'travel', 'student', 'housewife',
];

const VALID_VERIFICATION_LEVELS = ['none', 'video', 'health', 'community', 'full'];

// ── GET /api/zone/services ────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const url = new URL(context.request.url);

    const nationality = url.searchParams.get('nationality');
    const region = url.searchParams.get('region');
    const serviceType = url.searchParams.get('serviceType');
    const verification = url.searchParams.get('verification');
    const source = url.searchParams.get('source');
    const minRating = url.searchParams.get('minRating');
    const sort = url.searchParams.get('sort') || 'hot';
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;
    const q = url.searchParams.get('q');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (nationality) {
      conditions.push('nationality = ?');
      params.push(nationality);
    }
    if (region) {
      conditions.push('region = ?');
      params.push(region);
    }
    if (serviceType && VALID_SERVICE_TYPES.includes(serviceType)) {
      conditions.push('service_type = ?');
      params.push(serviceType);
    }
    if (verification && VALID_VERIFICATION_LEVELS.includes(verification)) {
      conditions.push('verification_level = ?');
      params.push(verification);
    }
    if (source) {
      conditions.push('source = ?');
      params.push(source);
    }
    if (minRating) {
      const rating = parseFloat(minRating);
      if (!isNaN(rating)) {
        conditions.push('score >= ?');
        params.push(rating);
      }
    }
    if (q) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'views DESC';
    switch (sort) {
      case 'latest': orderBy = 'created_at DESC'; break;
      case 'rating': orderBy = 'score DESC'; break;
      case 'reviews': orderBy = 'review_count DESC'; break;
      case 'random': orderBy = 'RANDOM()'; break;
      default: orderBy = 'views DESC'; break;
    }

    const sql = `SELECT * FROM service_providers${where} ORDER BY ${orderBy}`;
    const countSql = `SELECT COUNT(*) FROM service_providers${where}`;

    const result = await paginate(DB, sql, countSql, params, page, pageSize);
    return jsonResponse(result);
  } catch (err) {
    return handleError(err);
  }
};

// ── POST /api/zone/services ───────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const serviceType = typeof body.serviceType === 'string' ? body.serviceType.trim() : '';

    if (!name || !description) {
      return errorResponse('Missing required fields: name, description', 400);
    }

    if (serviceType && !VALID_SERVICE_TYPES.includes(serviceType)) {
      return errorResponse('Invalid service type', 400);
    }

    const now = new Date().toISOString();
    const nationality = typeof body.nationality === 'string' ? body.nationality : '';
    const region = typeof body.region === 'string' ? body.region : '';
    const age = typeof body.age === 'number' ? body.age : 0;
    const price = typeof body.price === 'string' ? body.price : '';
    const providerSource = typeof body.source === 'string' ? body.source : 'user';

    const { lastRowId } = await execute(
      DB,
      `INSERT INTO service_providers (user_id, name, description, service_type, nationality, region, age, price, source, verification_level, score, review_count, views, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', 0, 0, 0, ?, ?)`,
      [user.id, name, description, serviceType || 'spa', nationality, region, age, price, providerSource, now, now],
    );

    const created = await queryOne(DB, 'SELECT * FROM service_providers WHERE id = ?', [lastRowId]);
    return jsonResponse(created, 201);
  } catch (err) {
    return handleError(err);
  }
};
