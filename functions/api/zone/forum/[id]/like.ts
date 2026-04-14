/**
 * /api/zone/forum/[id]/like — Like a post
 *
 * POST /api/zone/forum/[id]/like — Toggle like on a post (auth required)
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

    const post = await queryOne(DB, 'SELECT id, likes FROM adult_posts WHERE id = ?', [postId]);
    if (!post) return errorResponse('Post not found', 404);

    // Simple increment (in production, track per-user likes)
    await execute(DB, 'UPDATE adult_posts SET likes = likes + 1 WHERE id = ?', [postId]);

    const updated = await queryOne(DB, 'SELECT id, likes FROM adult_posts WHERE id = ?', [postId]);
    return jsonResponse(updated);
  } catch (err) {
    return handleError(err);
  }
};
