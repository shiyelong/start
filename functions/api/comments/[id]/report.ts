/**
 * POST /api/comments/[id]/report — Report a comment
 *
 * Body: { reason?: string }
 *
 * Validates: Requirement 29.7
 */

import { requireAuth } from '../../_lib/auth';
import { execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const commentId = context.params.id as string;

    // Verify comment exists
    const comment = await queryOne(
      context.env.DB,
      'SELECT id FROM comments WHERE id = ?',
      [commentId],
    );

    if (!comment) {
      return errorResponse('Comment not found', 404);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await context.request.json();
    } catch {
      // reason is optional
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    const now = new Date().toISOString();

    // Prevent duplicate reports
    const existing = await queryOne(
      context.env.DB,
      'SELECT id FROM comment_reports WHERE comment_id = ? AND user_id = ?',
      [commentId, user.id],
    );

    if (existing) {
      return jsonResponse({ reported: true, commentId, message: '已举报' });
    }

    await execute(
      context.env.DB,
      `INSERT INTO comment_reports (comment_id, user_id, reason, created_at)
       VALUES (?, ?, ?, ?)`,
      [commentId, user.id, reason || null, now],
    );

    return jsonResponse({ reported: true, commentId });
  } catch (error) {
    return handleError(error);
  }
};
