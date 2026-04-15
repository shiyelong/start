/**
 * PUT /api/admin/rating/[contentId] — Adjust content MPAA rating
 *
 * Body: { rating: ContentRating, reason?: string }
 *
 * Admin-only endpoint to manually adjust a content item's rating.
 * Records the change in admin_logs.
 *
 * Validates: Requirement 14.8, 14.16, 55.2
 */

import { requireAuth } from '../../_lib/auth';
import { execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';
import { RATING_ORDER, type ContentRating } from '../../_lib/rating';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const admin = requireAuth(context);
    if (admin instanceof Response) return admin;

    const contentId = context.params.contentId as string;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const rating = typeof body.rating === 'string' ? body.rating : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    if (!VALID_RATINGS.includes(rating as ContentRating)) {
      return errorResponse(`Invalid rating. Allowed: ${VALID_RATINGS.join(', ')}`, 400);
    }

    const now = new Date().toISOString();

    // Try updating in source_config first (aggregation sources)
    const sourceResult = await execute(
      context.env.DB,
      'UPDATE source_config SET rating = ?, updated_at = ? WHERE id = ?',
      [rating, now, contentId],
    );

    if (sourceResult.changes === 0) {
      // Not a source — could be a post or other content type
      // Try posts table
      const postResult = await execute(
        context.env.DB,
        'UPDATE posts SET rating = ?, updated_at = ? WHERE id = ?',
        [rating, now, contentId],
      ).catch(() => ({ changes: 0 }));

      if (postResult.changes === 0) {
        return errorResponse('Content not found', 404);
      }
    }

    // Log the rating change
    await execute(
      context.env.DB,
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'rating_change', 'content', ?, ?, ?)`,
      [
        admin.id,
        contentId,
        JSON.stringify({ newRating: rating, reason }),
        now,
      ],
    ).catch(() => {});

    return jsonResponse({
      contentId,
      rating,
      reason,
      updatedAt: now,
    });
  } catch (error) {
    return handleError(error);
  }
};
