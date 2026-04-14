/**
 * /api/zone/blacklist — Blacklist query
 *
 * GET /api/zone/blacklist — Search blacklist entries
 */

import { paginate, jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const url = new URL(context.request.url);

    const q = url.searchParams.get('q');
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      conditions.push('(name LIKE ? OR reason LIKE ? OR phone LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT id, name, reason, report_count, created_at FROM blacklist${where} ORDER BY report_count DESC`;
    const countSql = `SELECT COUNT(*) FROM blacklist${where}`;

    const result = await paginate(DB, sql, countSql, params, page, pageSize);
    return jsonResponse(result);
  } catch (err) {
    return handleError(err);
  }
};
