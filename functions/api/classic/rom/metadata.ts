/**
 * /api/classic/rom/metadata — ROM metadata CRUD
 *
 * POST /api/classic/rom/metadata — Create ROM metadata (auth required)
 * GET  /api/classic/rom/metadata — List/search ROM metadata for current user
 *
 * Validates: Requirements 2.2, 2.4, 2.5, 16.3, 16.4
 */

import { requireAuth } from '../../_lib/auth';
import { execute, query, jsonResponse, errorResponse } from '../../_lib/db';
import { sanitizeString, validateEnum, validateLength } from '../../_lib/validate';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_PLATFORMS = [
  'NES', 'SNES', 'Game_Boy', 'Game_Boy_Color', 'Game_Boy_Advance',
  'Genesis', 'Master_System', 'Arcade', 'Neo_Geo', 'PC_Engine', 'Atari_2600',
] as const;

const VALID_PLAYER_COUNTS = [1, 2, 3, 4];

// ── POST /api/classic/rom/metadata ────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB, KV } = context.env;

  const user = requireAuth(context);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const hash = typeof body.hash === 'string' ? body.hash.trim() : '';
  const title = typeof body.title === 'string' ? sanitizeString(body.title, 200) : '';
  const platform = typeof body.platform === 'string' ? body.platform : '';
  const playerCount = typeof body.playerCount === 'number' ? body.playerCount : 1;
  const fileSize = typeof body.fileSize === 'number' ? body.fileSize : 0;
  const coverArtUrl = typeof body.coverArtUrl === 'string' ? sanitizeString(body.coverArtUrl, 500) : null;

  // Validate required fields
  if (!hash || !validateLength(hash, 64, 64)) {
    return errorResponse('Invalid hash: must be a 64-character SHA-256 hex string', 400);
  }
  if (!title) {
    return errorResponse('Missing required field: title', 400);
  }
  if (!validateEnum(platform, VALID_PLATFORMS)) {
    return errorResponse(`Invalid platform: ${platform}`, 400);
  }
  if (!VALID_PLAYER_COUNTS.includes(playerCount)) {
    return errorResponse('Invalid playerCount: must be 1, 2, 3, or 4', 400);
  }
  if (!Number.isInteger(fileSize) || fileSize <= 0) {
    return errorResponse('Invalid fileSize: must be a positive integer', 400);
  }

  // Check for duplicate
  const existing = await query(DB, 'SELECT hash FROM rom_metadata WHERE hash = ? AND user_id = ?', [hash, String(user.id)]);
  if (existing.length > 0) {
    return errorResponse('ROM metadata already exists for this hash', 409);
  }

  const now = new Date().toISOString();

  await execute(
    DB,
    `INSERT INTO rom_metadata (hash, user_id, title, platform, player_count, file_size, cover_art_url, is_favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [hash, String(user.id), title, platform, playerCount, fileSize, coverArtUrl, now, now],
  );

  const metadata = {
    hash,
    userId: String(user.id),
    title,
    platform,
    playerCount,
    fileSize,
    coverArtUrl,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };

  // Cache in KV
  await KV.put(`rom:meta:${hash}`, JSON.stringify(metadata), { expirationTtl: 300 });

  return jsonResponse(metadata, 201);
};

// ── GET /api/classic/rom/metadata ─────────────────────────────
// Returns all ROM metadata for the authenticated user (with optional filters)

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  const user = requireAuth(context);
  if (user instanceof Response) return user;

  const url = new URL(context.request.url);
  const platform = url.searchParams.get('platform');
  const q = url.searchParams.get('q');
  const playerCount = url.searchParams.get('playerCount');

  const conditions: string[] = ['user_id = ?'];
  const params: unknown[] = [String(user.id)];

  if (platform && validateEnum(platform, VALID_PLATFORMS)) {
    conditions.push('platform = ?');
    params.push(platform);
  }

  if (q) {
    conditions.push('title LIKE ?');
    params.push(`%${sanitizeString(q, 100)}%`);
  }

  if (playerCount) {
    const pc = parseInt(playerCount, 10);
    if (VALID_PLAYER_COUNTS.includes(pc)) {
      conditions.push('player_count = ?');
      params.push(pc);
    }
  }

  const where = conditions.join(' AND ');
  const rows = await query(
    DB,
    `SELECT hash, user_id, title, platform, player_count, file_size, cover_art_url, is_favorite, created_at, updated_at
     FROM rom_metadata WHERE ${where} ORDER BY updated_at DESC`,
    params,
  );

  const items = rows.map(mapRowToMetadata);
  return jsonResponse({ items });
};

// ── Helpers ───────────────────────────────────────────────────

function mapRowToMetadata(row: Record<string, unknown>) {
  return {
    hash: row.hash,
    userId: row.user_id,
    title: row.title,
    platform: row.platform,
    playerCount: row.player_count,
    fileSize: row.file_size,
    coverArtUrl: row.cover_art_url ?? null,
    isFavorite: row.is_favorite === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
