/**
 * /api/community/posts/[id] — Post detail
 *
 * GET /api/community/posts/:id — Return post with all comments, increment view count
 *
 * Validates: Requirement 11 AC3
 */

import { query, queryOne, execute, jsonResponse, errorResponse } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── GET /api/community/posts/:id ──────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const id = Number(context.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return errorResponse('Invalid post ID', 400);
  }

  // Fetch the post
  const post = await queryOne(DB, 'SELECT * FROM posts WHERE id = ?', [id]);

  if (!post) {
    return errorResponse('Post not found', 404);
  }

  // Increment view count (AC3)
  await execute(DB, 'UPDATE posts SET views = views + 1 WHERE id = ?', [id]);

  // Fetch all comments ordered by created_at ASC
  const comments = await query(
    DB,
    'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC',
    [id],
  );

  return jsonResponse({
    ...post,
    views: (post as Record<string, unknown>).views as number + 1,
    comments,
  });
};
