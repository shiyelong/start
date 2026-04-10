/**
 * /api/community/posts/[id]/comment — Add comment to a post
 *
 * POST /api/community/posts/:id/comment — Authenticated user adds a comment
 *
 * - Auth required
 * - Body: { content }
 * - Missing content → 400
 * - Insert into comments table with author info
 * - Return the created comment
 *
 * Validates: Requirement 12 (AC1, AC4)
 */

import { requireAuth } from '../../../_lib/auth';
import { queryOne, execute, jsonResponse, errorResponse } from '../../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── POST /api/community/posts/:id/comment ─────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // 1. Auth required (AC1)
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  // 2. Validate post ID
  const rawId = context.params.id;
  const postId = Number(rawId);
  if (!rawId || isNaN(postId) || !Number.isInteger(postId) || postId <= 0) {
    return errorResponse('Invalid post ID', 400);
  }

  // 3. Check post exists
  const post = await queryOne<{ id: number }>(
    DB,
    'SELECT id FROM posts WHERE id = ?',
    [postId],
  );
  if (!post) {
    return errorResponse('Post not found', 404);
  }

  // 4. Parse and validate body
  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';

  // AC4: Missing content → 400
  if (!content) {
    return errorResponse('Missing required fields: content', 400);
  }

  // 5. Get author name from users table
  const userRow = await queryOne<{ username: string }>(
    DB,
    'SELECT username FROM users WHERE id = ?',
    [user.id],
  );
  const authorName = userRow?.username ?? 'Unknown';

  // 6. Insert comment (AC1)
  const now = new Date().toISOString();

  const { lastRowId } = await execute(
    DB,
    `INSERT INTO comments (post_id, author_id, author_name, content, likes, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [postId, user.id, authorName, content, now],
  );

  // 7. Fetch and return the created comment
  const created = await queryOne(
    DB,
    'SELECT * FROM comments WHERE id = ?',
    [lastRowId],
  );
  if (!created) {
    return errorResponse('Failed to create comment', 500);
  }

  return jsonResponse(created, 201);
};
