/**
 * /api/games/scores — Submit game score
 *
 * POST /api/games/scores — Submit a score (auth required)
 *
 * Validates: Requirement 8 AC1, AC5
 */

import { requireAuth } from '../../_lib/auth';
import { execute, jsonResponse, errorResponse } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_GAME_IDS = new Set([
  '2048', 'snake', 'memory', 'tetris', 'quiz', 'reaction',
  'whackamole', 'colormatch', 'plusminus', 'farm', 'catchpet',
  'runner', 'tower', 'petbattle', 'dungeon', 'spaceshoot',
  'match3', 'fishing', 'typing', 'stacktower', 'sudoku',
  'minesweeper', 'huarong', 'sokoban', 'nonogram', 'lights',
  'logic', 'laser', 'hexchain', 'quantum', 'civilization',
  'survival', 'tycoon',
]);

// ── POST /api/games/scores ────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  const user = requireAuth(context);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const gameId = typeof body.game_id === 'string' ? body.game_id.trim() : '';
  const score = typeof body.score === 'number' ? body.score : NaN;

  if (!gameId) return errorResponse('Missing required field: game_id', 400);
  if (!VALID_GAME_IDS.has(gameId)) return errorResponse(`Invalid game_id: ${gameId}`, 400);
  if (isNaN(score) || !Number.isFinite(score)) return errorResponse('Invalid score', 400);

  const now = new Date().toISOString();

  const { lastRowId } = await execute(
    DB,
    `INSERT INTO game_scores (user_id, game_id, score, played_at) VALUES (?, ?, ?, ?)`,
    [user.id, gameId, Math.floor(score), now],
  );

  return jsonResponse({ id: lastRowId, user_id: user.id, game_id: gameId, score: Math.floor(score), played_at: now }, 201);
};
