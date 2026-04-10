/**
 * /api/games/saves — Save and load game state
 *
 * POST /api/games/saves — Save game state (auth required)
 * GET  /api/games/saves — Load game saves (auth required)
 *
 * Validates: Requirement 9 AC1, AC2, AC3, AC4
 */

import { requireAuth } from '../../_lib/auth';
import { execute, query, queryOne, jsonResponse, errorResponse } from '../../_lib/db';

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

const MAX_SLOT = 2;

// ── POST /api/games/saves ─────────────────────────────────────

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
  const saveData = body.save_data;
  const slot = typeof body.slot === 'number' ? Math.floor(body.slot) : 0;

  if (!gameId) return errorResponse('Missing required field: game_id', 400);
  if (!VALID_GAME_IDS.has(gameId)) return errorResponse(`Invalid game_id: ${gameId}`, 400);
  if (saveData === undefined || saveData === null) return errorResponse('Missing required field: save_data', 400);

  // AC4: slots 0, 1, 2 only
  if (slot < 0 || slot > MAX_SLOT) {
    return errorResponse(`Invalid slot: must be 0-${MAX_SLOT}`, 400);
  }

  const now = new Date().toISOString();
  const saveDataJson = typeof saveData === 'string' ? saveData : JSON.stringify(saveData);

  // AC3: UPSERT — INSERT OR REPLACE on UNIQUE(user_id, game_id, slot)
  await execute(
    DB,
    `INSERT OR REPLACE INTO game_saves (user_id, game_id, save_data, slot, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, gameId, saveDataJson, slot, now],
  );

  return jsonResponse({ user_id: user.id, game_id: gameId, slot, updated_at: now }, 201);
};

// ── GET /api/games/saves ──────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  const user = requireAuth(context);
  if (user instanceof Response) return user;

  const url = new URL(context.request.url);
  const gameId = url.searchParams.get('game_id') || '';
  const slotParam = url.searchParams.get('slot');

  if (!gameId) return errorResponse('Missing required query param: game_id', 400);
  if (!VALID_GAME_IDS.has(gameId)) return errorResponse(`Invalid game_id: ${gameId}`, 400);

  // AC2: If slot provided, return single save; otherwise all saves for that game
  if (slotParam !== null) {
    const slot = parseInt(slotParam, 10);
    if (isNaN(slot) || slot < 0 || slot > MAX_SLOT) {
      return errorResponse(`Invalid slot: must be 0-${MAX_SLOT}`, 400);
    }

    const save = await queryOne(
      DB,
      'SELECT * FROM game_saves WHERE user_id = ? AND game_id = ? AND slot = ?',
      [user.id, gameId, slot],
    );

    return jsonResponse(save);
  }

  const saves = await query(
    DB,
    'SELECT * FROM game_saves WHERE user_id = ? AND game_id = ? ORDER BY slot ASC',
    [user.id, gameId],
  );

  return jsonResponse(saves);
};
