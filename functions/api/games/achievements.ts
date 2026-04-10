/**
 * /api/games/achievements — Unlock and query achievements
 *
 * POST /api/games/achievements — Unlock achievement (auth required)
 * GET  /api/games/achievements — Query achievements (auth required)
 *
 * Validates: Requirement 10 AC1, AC2, AC3, AC4
 */

import { requireAuth } from '../_lib/auth';
import { execute, query, queryOne, jsonResponse, errorResponse } from '../_lib/db';

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

// ── POST /api/games/achievements ──────────────────────────────

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
  const achievementId = typeof body.achievement_id === 'string' ? body.achievement_id.trim() : '';

  if (!gameId) return errorResponse('Missing required field: game_id', 400);
  if (!achievementId) return errorResponse('Missing required field: achievement_id', 400);
  if (!VALID_GAME_IDS.has(gameId)) return errorResponse(`Invalid game_id: ${gameId}`, 400);

  // AC2: Idempotent — check if already unlocked
  const existing = await queryOne(
    DB,
    'SELECT * FROM game_achievements WHERE user_id = ? AND game_id = ? AND achievement_id = ?',
    [user.id, gameId, achievementId],
  );

  if (existing) {
    return jsonResponse(existing);
  }

  // AC1: Record the achievement
  const now = new Date().toISOString();

  const { lastRowId } = await execute(
    DB,
    `INSERT INTO game_achievements (user_id, game_id, achievement_id, unlocked_at)
     VALUES (?, ?, ?, ?)`,
    [user.id, gameId, achievementId, now],
  );

  return jsonResponse(
    { id: lastRowId, user_id: user.id, game_id: gameId, achievement_id: achievementId, unlocked_at: now },
    201,
  );
};

// ── GET /api/games/achievements ───────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  const user = requireAuth(context);
  if (user instanceof Response) return user;

  const url = new URL(context.request.url);
  const gameId = url.searchParams.get('game_id');

  // AC3: If game_id provided, return achievements for that game
  if (gameId) {
    if (!VALID_GAME_IDS.has(gameId)) {
      return errorResponse(`Invalid game_id: ${gameId}`, 400);
    }

    const achievements = await query(
      DB,
      'SELECT * FROM game_achievements WHERE user_id = ? AND game_id = ? ORDER BY unlocked_at DESC',
      [user.id, gameId],
    );

    return jsonResponse(achievements);
  }

  // AC4: No game_id — return all achievements grouped by game_id
  const all = await query(
    DB,
    'SELECT * FROM game_achievements WHERE user_id = ? ORDER BY game_id, unlocked_at DESC',
    [user.id],
  );

  // Group by game_id
  const grouped: Record<string, unknown[]> = {};
  for (const row of all) {
    const gid = (row as Record<string, unknown>).game_id as string;
    if (!grouped[gid]) grouped[gid] = [];
    grouped[gid].push(row);
  }

  return jsonResponse(grouped);
};
