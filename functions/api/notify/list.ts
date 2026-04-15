/**
 * GET /api/notify/list — Get notification list
 *
 * Query params: type, unreadOnly, page, pageSize
 *
 * Validates: Requirement 42.1
 */

import { requireAuth } from '../_lib/auth';
import { paginate, jsonResponse, errorResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

    const conditions = ['user_id = ?'];
    const params: unknown[] = [user.id];

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (unreadOnly) {
      conditions.push('read = 0');
    }

    const where = ` WHERE ${conditions.join(' AND ')}`;
    const sql = `SELECT * FROM notifications${where} ORDER BY created_at DESC`;
    const countSql = `SELECT COUNT(*) FROM notifications${where}`;

    const result = await paginate(context.env.DB, sql, countSql, params, page, pageSize);

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};
