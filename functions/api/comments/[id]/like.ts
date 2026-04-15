/**
 * POST /api/comments/[id]/like — Toggle like on a comment
 *
 * Validates: Requirement 29.5
 */

import { requireAuth } from '../../_lib/auth';
import { execute, queryOne, jsonResponse } from '../../_lib/db';
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

    // Check if already liked
    const existing = await queryOne(
      context.env.DB,
      'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?',
      [commentId, user.id],
    );

    if (existing) {
      // Unlike
      await execute(
        context.env.DB,
        'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?',
        [commentId, user.id],
      );
      await execute(
        context.env.DB,
        'UPDATE comments SET likes = MAX(0, likes - 1) WHERE id = ?',
        [commentId],
      );
      return jsonResponse({ liked: false, commentId });
    }

    // Like
    const now = new Date().toISOString();
    await execute(
      context.env.DB,
      'INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)',
      [commentId, user.id, now],
    );
    await execute(
      context.env.DB,
      'UPDATE comments SET likes = likes + 1 WHERE id = ?',
      [commentId],
    );

    return jsonResponse({ liked: true, commentId });
  } catch (error) {
    return handleError(error);
  }
};
