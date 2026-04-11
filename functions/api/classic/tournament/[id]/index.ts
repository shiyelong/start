/**
 * GET /api/classic/tournament/:id — Get tournament details
 * Requirements: 27.6
 */

import { jsonResponse, errorResponse, queryOne, query } from '../../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const id = (context.params as { id: string }).id;
    if (!id) return errorResponse('Tournament ID is required', 400);

    const tournament = await queryOne(
      context.env.DB,
      `SELECT id, name, rom_hash AS romHash, platform, max_participants AS maxParticipants,
              match_format AS matchFormat, status, created_by AS createdBy,
              created_at AS createdAt, started_at AS startedAt, completed_at AS completedAt
       FROM tournament WHERE id = ?`,
      [id],
    );

    if (!tournament) return errorResponse('Tournament not found', 404);

    const participants = await query(
      context.env.DB,
      `SELECT user_id AS userId, seed, eliminated_round AS eliminatedRound, registered_at AS registeredAt
       FROM tournament_participant WHERE tournament_id = ? ORDER BY seed ASC`,
      [id],
    );

    const matches = await query(
      context.env.DB,
      `SELECT id, tournament_id AS tournamentId, round, match_index AS matchIndex,
              player1_id AS player1Id, player2_id AS player2Id, winner_id AS winnerId,
              room_code AS roomCode, status, scheduled_at AS scheduledAt, completed_at AS completedAt
       FROM tournament_match WHERE tournament_id = ? ORDER BY round ASC, match_index ASC`,
      [id],
    );

    // Group matches into rounds
    const roundMap = new Map<number, typeof matches>();
    for (const m of matches) {
      const r = (m as { round: number }).round;
      if (!roundMap.has(r)) roundMap.set(r, []);
      roundMap.get(r)!.push(m);
    }
    const rounds = Array.from(roundMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, ms]) => ({ round, matches: ms }));

    return jsonResponse({ tournament, participants, rounds });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};
