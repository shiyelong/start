/**
 * /api/zone/forum/[id]/report — Report a post
 *
 * POST /api/zone/forum/[id]/report — Report a post (auth required)
 */

import { requireAuth } from '../../../_lib/auth';
import { execute, queryOne, jsonResponse, errorResponse } from '../../../_lib/db';
import { handleError } from '../../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const postId = (context.params as Record<string, string>).id;

    const post = await queryOne(DB, 'SELECT id FROM adult_posts WHERE id = ?', [postId]);
    if (!post) return errorResponse('Post not found', 404);

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : 'inappropriate';
    const now = new Date().toISOString();

    await execute(
      DB,
      `INSERT INTO verification_reports (reporter_id, target_id, target_type, report_type, content, status, created_at)
       VALUES (?, ?, 'forum_post', ?, ?, 'pending', ?)`,
      [user.id, postId, reason, `Forum post report: ${reason}`, now],
    );

    return jsonResponse({ success: true, message: 'Report submitted' });
  } catch (err) {
    return handleError(err);
  }
};
