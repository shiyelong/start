/**
 * /api/community/posts/[id]/like — Toggle like on a post
 *
 * POST /api/community/posts/:id/like — Authenticated user toggles like
 *
 * - If not previously liked → insert into post_likes, increment posts.likes, increment author's reputation
 * - If already liked → delete from post_likes, decrement posts.likes, decrement author's reputation
 * - Return { liked: boolean, likes: number }
 *
 * Validates: Requirement 12 (AC2, AC3, AC5)
 */

import { requireAuth } from '../../../_lib/auth';
import { queryOne, execute, jsonResponse, errorResponse } from '../../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── POST /api/community/posts/:id/like ────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // 1. Auth required
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  // 2. Validate post ID
  const rawId = context.params.id;
  const postId = Number(rawId);
  if (!rawId || isNaN(postId) || !Number.isInteger(postId) || postId <= 0) {
    return errorResponse('Invalid post ID', 400);
  }

  // 3. Check post exists and get author_id
  const post = await queryOne<{ id: number; author_id: number; likes: number }>(
    DB,
    'SELECT id, author_id, likes FROM posts WHERE id = ?',
    [postId],
  );
  if (!post) {
    return errorResponse('Post not found', 404);
  }

  // 4. Check if user already liked this post
  const existingLike = await queryOne<{ id: number }>(
    DB,
    'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
    [postId, user.id],
  );

  const now = new Date().toISOString();
  let liked: boolean;
  let likeDelta: number;

  if (!existingLike) {
    // AC2: Not previously liked → insert like, increment count
    await execute(
      DB,
      'INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)',
      [postId, user.id, now],
    );
    liked = true;
    likeDelta = 1;
  } else {
    // AC3: Already liked → remove like (toggle), decrement count
    await execute(
      DB,
      'DELETE FROM post_likes WHERE id = ?',
      [existingLike.id],
    );
    liked = false;
    likeDelta = -1;
  }

  // 5. Update post likes count
  await execute(
    DB,
    'UPDATE posts SET likes = likes + ?, updated_at = ? WHERE id = ?',
    [likeDelta, now, postId],
  );

  // 6. AC5: Update author's reputation (skip if user is liking their own post)
  if (post.author_id !== user.id) {
    await execute(
      DB,
      'UPDATE users SET reputation = reputation + ?, updated_at = ? WHERE id = ?',
      [likeDelta, now, post.author_id],
    );
  }

  return jsonResponse({
    liked,
    likes: post.likes + likeDelta,
  });
};
