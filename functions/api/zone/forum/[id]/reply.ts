/**
 * /api/zone/forum/[id]/reply — Post replies
 *
 * GET  /api/zone/forum/[id]/reply — Get replies for a post
 * POST /api/zone/forum/[id]/reply — Add a reply (auth required)
 */

import { requireAuth } from '../../../_lib/auth';
import { query, execute, queryOne, jsonResponse, errorResponse } from '../../../_lib/db';
import { handleError } from '../../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const postId = (context.params as Record<string, string>).id;

    const replies = await query(
      DB,
      'SELECT * FROM adult_post_replies WHERE post_id = ? ORDER BY created_at ASC LIMIT 100',
      [postId],
    );

    return jsonResponse({ replies });
  } catch (err) {
    return handleError(err);
  }
};

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

    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return errorResponse('Reply content is required', 400);

    const isAnonymous = body.anonymous === true;
    const authorName = isAnonymous ? `匿名${Math.floor(Math.random() * 9999)}` : `用户${user.id}`;
    const now = new Date().toISOString();

    const { lastRowId } = await execute(
      DB,
      `INSERT INTO adult_post_replies (post_id, author_id, author_name, is_anonymous, content, likes, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [postId, user.id, authorName, isAnonymous ? 1 : 0, content, now],
    );

    // Increment reply count
    await execute(DB, 'UPDATE adult_posts SET replies = replies + 1, updated_at = ? WHERE id = ?', [now, postId]);

    const reply = await queryOne(DB, 'SELECT * FROM adult_post_replies WHERE id = ?', [lastRowId]);
    return jsonResponse(reply, 201);
  } catch (err) {
    return handleError(err);
  }
};
