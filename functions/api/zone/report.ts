/**
 * /api/zone/report — Report submission
 *
 * POST /api/zone/report — Submit a report (auth required)
 */

import { requireAuth } from '../_lib/auth';
import { execute, queryOne, jsonResponse, errorResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const VALID_REPORT_TYPES = ['fraud', 'violence', 'underage', 'blackmail', 'harassment', 'other'];

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

    const reportType = typeof body.type === 'string' && VALID_REPORT_TYPES.includes(body.type) ? body.type : 'other';
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
    const targetType = typeof body.targetType === 'string' ? body.targetType.trim() : 'user';
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    if (!content) {
      return errorResponse('Report content is required', 400);
    }

    const now = new Date().toISOString();

    const { lastRowId } = await execute(
      DB,
      `INSERT INTO verification_reports (reporter_id, target_id, target_type, report_type, content, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [user.id, targetId, targetType, reportType, content, now],
    );

    const created = await queryOne(DB, 'SELECT * FROM verification_reports WHERE id = ?', [lastRowId]);
    return jsonResponse(created, 201);
  } catch (err) {
    return handleError(err);
  }
};
