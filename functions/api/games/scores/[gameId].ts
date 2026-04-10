/**
 * /api/games/scores/:gameId — Leaderboard
 *
 * GET /api/games/scores/:gameId — Public leaderboard with time filters
 *
 * Validates: Requirement 8 AC2, AC3, AC4, AC5
 */

import { query, jsonResponse, errorResponse } from '../../_lib/db';

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

// ── GET /api/games/scores/:gameId ─────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const gameId = context.params.gameId as string;

  if (!VALID_GAME_IDS.has(gameId)) {
    return errorResponse(`Invalid game_id: ${gameId}`, 400);
  }

  const url = new URL(context.request.url);
  const period = url.searchParams.get('period') || 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ['gs.game_id = ?'];
  const params: unknown[] = [gameId];

  // AC3: Time filter
  if (period === 'daily') {
    conditions.push("gs.played_at >= datetime('now', '-1 day')");
  } else if (period === 'weekly') {
    conditions.push("gs.played_at >= datetime('now', '-7 days')");
  }
  // 'all' — no time filter

  const where = conditions.join(' AND ');

  // AC2: Top scores with user info, sorted by score DESC
  const sql = `
    SELECT gs.id, gs.user_id, gs.game_id, gs.score, gs.played_at,
           u.username, u.nickname, u.avatar
    FROM game_scores gs
    LEFT JOIN users u ON gs.user_id = u.id
    WHERE ${where}
    ORDER BY gs.score DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `SELECT COUNT(*) as total FROM game_scores gs WHERE ${where}`;

  const [items, countRow] = await Promise.all([
    query(DB, sql, [...params, pageSize, offset]),
    query<{ total: number }>(DB, countSql, params),
  ]);

  const total = countRow[0]?.total ?? 0;

  return jsonResponse({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
};
