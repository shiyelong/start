/**
 * GET /api/admin/logs — Admin operation logs
 *
 * Query params: adminId, action, targetType, startDate, endDate, page, pageSize
 *
 * Validates: Requirement 55.5, 55.8
 */

import { requireAuth } from '../_lib/auth';
import { paginate, jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const admin = requireAuth(context);
    if (admin instanceof Response) return admin;

    const url = new URL(context.request.url);
    const adminId = url.searchParams.get('adminId');
    const action = url.searchParams.get('action');
    const targetType = url.searchParams.get('targetType');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (adminId) {
      conditions.push('admin_id = ?');
      params.push(adminId);
    }

    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }

    if (targetType) {
      conditions.push('target_type = ?');
      params.push(targetType);
    }

    if (startDate) {
      conditions.push('created_at >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('created_at <= ?');
      params.push(endDate);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT * FROM admin_logs${where} ORDER BY created_at DESC`;
    const countSql = `SELECT COUNT(*) FROM admin_logs${where}`;

    const result = await paginate(context.env.DB, sql, countSql, params, page, pageSize);

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};
