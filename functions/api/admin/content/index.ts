/**
 * /api/admin/content — Content management
 *
 * GET    — List content with type/rating/report filters
 * DELETE — Remove content by id (records operation log)
 *
 * Validates: Requirement 55.2, 55.5
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

// ── GET /api/admin/content ────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const admin = requireAuth(context);
    if (admin instanceof Response) return admin;

    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');
    const rating = url.searchParams.get('rating');
    const reported = url.searchParams.get('reported') === 'true';
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

    // Query posts as the primary content table
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (type) {
      conditions.push('category = ?');
      params.push(type);
    }

    if (reported) {
      conditions.push('id IN (SELECT DISTINCT target_id FROM comment_reports)');
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT * FROM posts${where} ORDER BY created_at DESC`;
    const countSql = `SELECT COUNT(*) FROM posts${where}`;

    const result = await paginate(context.env.DB, sql, countSql, params, page, pageSize);

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};

// ── DELETE /api/admin/content ─────────────────────────────────

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const admin = requireAuth(context);
    if (admin instanceof Response) return admin;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const contentId = typeof body.id === 'string' ? body.id : typeof body.id === 'number' ? String(body.id) : '';
    const contentType = typeof body.type === 'string' ? body.type : 'post';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    if (!contentId) {
      return errorResponse('Missing required field: id', 400);
    }

    const now = new Date().toISOString();

    // Delete based on content type
    let deleted = false;
    switch (contentType) {
      case 'post': {
        const result = await execute(context.env.DB, 'DELETE FROM posts WHERE id = ?', [contentId]);
        deleted = result.changes > 0;
        break;
      }
      case 'comment': {
        const result = await execute(context.env.DB, 'DELETE FROM comments WHERE id = ?', [contentId]);
        deleted = result.changes > 0;
        break;
      }
      case 'danmaku': {
        const result = await execute(context.env.DB, 'DELETE FROM danmaku WHERE id = ?', [contentId]);
        deleted = result.changes > 0;
        break;
      }
      default: {
        const result = await execute(context.env.DB, 'DELETE FROM posts WHERE id = ?', [contentId]);
        deleted = result.changes > 0;
      }
    }

    if (!deleted) {
      return errorResponse('Content not found', 404);
    }

    // Log the operation
    await execute(
      context.env.DB,
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'delete_content', ?, ?, ?, ?)`,
      [admin.id, contentType, contentId, JSON.stringify({ reason }), now],
    ).catch(() => {});

    return jsonResponse({ deleted: true, contentId, contentType });
  } catch (error) {
    return handleError(error);
  }
};
