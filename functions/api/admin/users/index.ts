/**
 * GET /api/admin/users — User list with search and pagination
 *
 * Query params: search, page, pageSize, sort
 *
 * Validates: Requirement 55.2
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    const search = url.searchParams.get('search') || '';
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;
    const sort = url.searchParams.get('sort') || 'newest';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = sort === 'oldest' ? 'created_at ASC' : 'created_at DESC';

    const sql = `SELECT id, username, email, role, banned, created_at, updated_at FROM users${where} ORDER BY ${orderBy}`;
    const countSql = `SELECT COUNT(*) FROM users${where}`;

    const result = await paginate(context.env.DB, sql, countSql, params, page, pageSize);

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};
