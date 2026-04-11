/**
 * POST /api/classic/tournament/:id/join — Join a tournament
 * Requirements: 27.3
 */

import { jsonResponse, errorResponse, queryOne, query, execute } from '../../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const id = (context.params as { id: string }).id;
    const body = (await context.request.json()) as { userId?: string };

    if (!id || !body.userId) {
      return errorResponse('Tournament ID and userId are required', 400);
    }

    // Check tournament exists and is in registration
    const tournament = await queryOne<{ status: string; max_participants: number }>(
      context.env.DB,
      'SELECT status, max_participants FROM tournament WHERE id = ?',
      [id],
    );

    if (!tournament) return errorResponse('Tournament not found', 404);
    if (tournament.status !== 'registration') {
      return errorResponse('报名已截止', 400);
    }

    // Check if already joined
    const existing = await queryOne(
      context.env.DB,
      'SELECT user_id FROM tournament_participant WHERE tournament_id = ? AND user_id = ?',
      [id, body.userId],
    );
    if (existing) return errorResponse('已报名', 400);

    // Check capacity
    const participants = await query(
      context.env.DB,
      'SELECT user_id FROM tournament_participant WHERE tournament_id = ?',
      [id],
    );
    if (participants.length >= tournament.max_participants) {
      return errorResponse('参赛人数已满', 400);
    }

    const seed = participants.length + 1;
    await execute(
      context.env.DB,
      'INSERT INTO tournament_participant (tournament_id, user_id, seed) VALUES (?, ?, ?)',
      [id, body.userId, seed],
    );

    return jsonResponse({ success: true, seed });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};
