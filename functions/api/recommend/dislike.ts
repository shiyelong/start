/**
 * POST /api/recommend/dislike — Mark content as "not interested"
 *
 * Body: { contentId: string, type?: string }
 *
 * The content will be excluded from future recommendations.
 *
 * Validates: Requirement 28.5
 */

import { requireAuth } from '../_lib/auth';
import { execute, jsonResponse, errorResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const contentId = typeof body.contentId === 'string' ? body.contentId.trim() : '';
    const type = typeof body.type === 'string' ? body.type.trim() : '';

    if (!contentId) {
      return errorResponse('Missing required field: contentId', 400);
    }

    const now = new Date().toISOString();

    await execute(
      context.env.DB,
      `INSERT INTO recommend_dislikes (user_id, content_id, type, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, content_id) DO NOTHING`,
      [user.id, contentId, type || null, now],
    );

    // Invalidate recommendation cache for this user
    const cacheKeys = [
      `recommend:home:${user.id}:1`,
      `recommend:${type}:${user.id}:1`,
    ];
    await Promise.all(
      cacheKeys.map((key) => context.env.KV.delete(key).catch(() => {})),
    );

    return jsonResponse({ disliked: true, contentId });
  } catch (error) {
    return handleError(error);
  }
};
