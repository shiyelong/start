/**
 * POST /api/comments/[id]/reply — Reply to a comment
 *
 * Body: { content: string }
 * Nested replies max 2 levels deep.
 *
 * Validates: Requirement 29.5, 29.6
 */

import { requireAuth } from '../../_lib/auth';
import { execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const parentId = context.params.id as string;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return errorResponse('Missing required field: content', 400);
    }

    if (content.length > 2000) {
      return errorResponse('Reply too long (max 2000 characters)', 400);
    }

    // Verify parent comment exists
    const parent = await queryOne<{ id: string; content_type: string; content_id: string; parent_id: string | null }>(
      context.env.DB,
      'SELECT id, content_type, content_id, parent_id FROM comments WHERE id = ?',
      [parentId],
    );

    if (!parent) {
      return errorResponse('Parent comment not found', 404);
    }

    // Check nesting depth (max 2 levels)
    if (parent.parent_id) {
      // Parent is already a reply — check if grandparent also has a parent
      const grandparent = await queryOne<{ parent_id: string | null }>(
        context.env.DB,
        'SELECT parent_id FROM comments WHERE id = ?',
        [parent.parent_id],
      );
      if (grandparent?.parent_id) {
        return errorResponse('最多支持2层嵌套回复', 400);
      }
    }

    // Get author name
    const userRow = await queryOne<{ username: string }>(
      context.env.DB,
      'SELECT username FROM users WHERE id = ?',
      [user.id],
    );
    const authorName = userRow?.username ?? 'Unknown';

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      context.env.DB,
      `INSERT INTO comments (id, content_type, content_id, user_id, author_name, content, likes, parent_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, parent.content_type, parent.content_id, user.id, authorName, content, parentId, now],
    );

    // Create notification for the parent comment author
    const parentAuthor = await queryOne<{ user_id: number }>(
      context.env.DB,
      'SELECT user_id FROM comments WHERE id = ?',
      [parentId],
    );

    if (parentAuthor && parentAuthor.user_id !== user.id) {
      await execute(
        context.env.DB,
        `INSERT INTO notifications (user_id, type, title, body, read, created_at)
         VALUES (?, 'comment_reply', ?, ?, 0, ?)`,
        [
          parentAuthor.user_id,
          `${authorName} 回复了你的评论`,
          content.slice(0, 100),
          now,
        ],
      ).catch(() => {});
    }

    return jsonResponse(
      {
        id,
        contentType: parent.content_type,
        contentId: parent.content_id,
        userId: user.id,
        authorName,
        content,
        likes: 0,
        parentId,
        createdAt: now,
      },
      201,
    );
  } catch (error) {
    return handleError(error);
  }
};
