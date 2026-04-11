/**
 * PUT /api/classic/tournament/:id/match — Report match result
 * Requirements: 27.5, 27.8
 */

import { jsonResponse, errorResponse, queryOne, execute } from '../../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const tournamentId = (context.params as { id: string }).id;
    const body = (await context.request.json()) as {
      matchId?: string;
      winnerId?: string;
      forfeit?: boolean;
    };

    if (!tournamentId || !body.matchId || !body.winnerId) {
      return errorResponse('tournamentId, matchId, and winnerId are required', 400);
    }

    // Verify match exists
    const match = await queryOne<{
      id: string;
      round: number;
      match_index: number;
      player1_id: string;
      player2_id: string;
      status: string;
    }>(
      context.env.DB,
      'SELECT id, round, match_index, player1_id, player2_id, status FROM tournament_match WHERE id = ? AND tournament_id = ?',
      [body.matchId, tournamentId],
    );

    if (!match) return errorResponse('Match not found', 404);
    if (match.status === 'completed') return errorResponse('比赛已结束', 400);

    const status = body.forfeit ? 'forfeit' : 'completed';
    const now = new Date().toISOString();

    // Update match
    await execute(
      context.env.DB,
      'UPDATE tournament_match SET winner_id = ?, status = ?, completed_at = ? WHERE id = ?',
      [body.winnerId, status, now, body.matchId],
    );

    // Advance winner to next round match
    const nextRound = match.round + 1;
    const nextMatchIndex = Math.floor(match.match_index / 2);
    const playerSlot = match.match_index % 2 === 0 ? 'player1_id' : 'player2_id';

    const nextMatch = await queryOne<{ id: string }>(
      context.env.DB,
      'SELECT id FROM tournament_match WHERE tournament_id = ? AND round = ? AND match_index = ?',
      [tournamentId, nextRound, nextMatchIndex],
    );

    if (nextMatch) {
      await execute(
        context.env.DB,
        `UPDATE tournament_match SET ${playerSlot} = ? WHERE id = ?`,
        [body.winnerId, nextMatch.id],
      );
    }

    // Update eliminated player
    const loserId = body.winnerId === match.player1_id ? match.player2_id : match.player1_id;
    if (loserId) {
      await execute(
        context.env.DB,
        'UPDATE tournament_participant SET eliminated_round = ? WHERE tournament_id = ? AND user_id = ?',
        [match.round, tournamentId, loserId],
      );
    }

    // Check if tournament is complete (final match decided)
    if (!nextMatch) {
      await execute(
        context.env.DB,
        "UPDATE tournament SET status = 'completed', completed_at = ? WHERE id = ?",
        [now, tournamentId],
      );
    }

    return jsonResponse({ success: true });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};
