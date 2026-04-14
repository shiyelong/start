/**
 * /api/zone/services/[id]/review — Anonymous review
 *
 * POST /api/zone/services/[id]/review — Submit anonymous review
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

    const id = (context.params as Record<string, string>).id;

    const provider = await queryOne(DB, 'SELECT id FROM service_providers WHERE id = ?', [id]);
    if (!provider) {
      return errorResponse('Provider not found', 404);
    }

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const score = typeof body.score === 'number' ? Math.min(5, Math.max(1, body.score)) : 5;
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    if (!content) {
      return errorResponse('Review content is required', 400);
    }

    const now = new Date().toISOString();
    // Anonymous: use hashed user id as anonymous identifier
    const anonId = `anon-${Math.abs(user.id * 2654435761 % 100000)}`;

    const { lastRowId } = await execute(
      DB,
      `INSERT INTO service_reviews (provider_id, anonymous_id, score, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, anonId, score, content, now],
    );

    // Update provider average score
    await execute(
      DB,
      `UPDATE service_providers SET
        review_count = review_count + 1,
        score = (SELECT AVG(score) FROM service_reviews WHERE provider_id = ?),
        updated_at = ?
       WHERE id = ?`,
      [id, now, id],
    );

    const review = await queryOne(DB, 'SELECT * FROM service_reviews WHERE id = ?', [lastRowId]);
    return jsonResponse(review, 201);
  } catch (err) {
    return handleError(err);
  }
};
