/**
 * /api/classic/rom/search — Public ROM search
 *
 * GET /api/classic/rom/search — Search ROM metadata across all users
 *
 * Query params:
 *   q          — title substring (case-insensitive)
 *   platform   — filter by ConsolePlatform
 *   playerCount — filter by player count (1-4)
 *   page       — 1-based page number (default 1)
 *   pageSize   — results per page (default 20, max 100)
 *
 * Validates: Requirements 2.2, 16.3, 16.4
 */

import { query, jsonResponse, errorResponse } from '../../_lib/db';
import { sanitizeString, validateEnum } from '../../_lib/validate';

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

// ── GET /api/classic/rom/search ───────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB, KV } = context.env;
  const url = new URL(context.request.url);

  const q = url.searchParams.get('q') || '';
  const platform = url.searchParams.get('platform') || '';
  const playerCountParam = url.searchParams.get('playerCount') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

  // Build cache key
  const cacheKey = `rom:search:${platform}:${sanitizeString(q, 100)}:${playerCountParam}:${page}:${pageSize}`;
  const cached = await KV.get(cacheKey);
  if (cached) {
    return jsonResponse(JSON.parse(cached));
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q) {
    conditions.push('title LIKE ?');
    params.push(`%${sanitizeString(q, 100)}%`);
  }

  if (platform && validateEnum(platform, VALID_PLATFORMS)) {
    conditions.push('platform = ?');
    params.push(platform);
  }

  if (playerCountParam) {
    const pc = parseInt(playerCountParam, 10);
    if (VALID_PLAYER_COUNTS.includes(pc)) {
      conditions.push('player_count = ?');
      params.push(pc);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows, countRow] = await Promise.all([
    query(
      DB,
      `SELECT hash, user_id, title, platform, player_count, file_size, cover_art_url, is_favorite, created_at, updated_at
       FROM rom_metadata ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
    query<{ total: number }>(
      DB,
      `SELECT COUNT(*) as total FROM rom_metadata ${where}`,
      params,
    ),
  ]);

  const total = countRow[0]?.total ?? 0;

  const result = {
    items: rows.map(mapRowToMetadata),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };

  // Cache search results (TTL: 60s)
  await KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 });

  return jsonResponse(result);
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
