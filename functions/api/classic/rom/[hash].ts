/**
 * /api/classic/rom/:hash — ROM metadata by hash
 *
 * GET    /api/classic/rom/:hash — Get ROM metadata
 * PUT    /api/classic/rom/:hash — Update ROM metadata (auth required, owner only)
 * DELETE /api/classic/rom/:hash — Delete ROM metadata (auth required, owner only)
 *
 * Validates: Requirements 2.2, 2.4, 2.5, 16.3, 16.4
 */

import { requireAuth } from '../../_lib/auth';
import { queryOne, execute, jsonResponse, errorResponse } from '../../_lib/db';
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

// ── GET /api/classic/rom/:hash ────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB, KV } = context.env;
  const hash = context.params.hash as string;

  if (!hash || !validateLength(hash, 64, 64)) {
    return errorResponse('Invalid hash parameter', 400);
  }

  // Check KV cache first
  const cached = await KV.get(`rom:meta:${hash}`);
  if (cached) {
    return jsonResponse(JSON.parse(cached));
  }

  const row = await queryOne(
    DB,
    `SELECT hash, user_id, title, platform, player_count, file_size, cover_art_url, is_favorite, created_at, updated_at
     FROM rom_metadata WHERE hash = ?`,
    [hash],
  );

  if (!row) {
    return errorResponse('ROM metadata not found', 404);
  }

  const metadata = mapRowToMetadata(row);

  // Cache in KV (TTL: 300s)
  await KV.put(`rom:meta:${hash}`, JSON.stringify(metadata), { expirationTtl: 300 });

  return jsonResponse(metadata);
};

// ── PUT /api/classic/rom/:hash ────────────────────────────────

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { DB, KV } = context.env;
  const hash = context.params.hash as string;

  if (!hash || !validateLength(hash, 64, 64)) {
    return errorResponse('Invalid hash parameter', 400);
  }

  const user = requireAuth(context);
  if (user instanceof Response) return user;

  // Verify ownership
  const existing = await queryOne<{ user_id: string }>(
    DB,
    'SELECT user_id FROM rom_metadata WHERE hash = ?',
    [hash],
  );

  if (!existing) {
    return errorResponse('ROM metadata not found', 404);
  }
  if (existing.user_id !== String(user.id)) {
    return errorResponse('Forbidden: you do not own this ROM entry', 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  // Build SET clause from allowed fields
  const sets: string[] = [];
  const params: unknown[] = [];

  if (typeof body.title === 'string') {
    const title = sanitizeString(body.title, 200);
    if (!title) return errorResponse('Title cannot be empty', 400);
    sets.push('title = ?');
    params.push(title);
  }

  if (typeof body.platform === 'string') {
    if (!validateEnum(body.platform, VALID_PLATFORMS)) {
      return errorResponse(`Invalid platform: ${body.platform}`, 400);
    }
    sets.push('platform = ?');
    params.push(body.platform);
  }

  if (typeof body.playerCount === 'number') {
    if (!VALID_PLAYER_COUNTS.includes(body.playerCount)) {
      return errorResponse('Invalid playerCount: must be 1, 2, 3, or 4', 400);
    }
    sets.push('player_count = ?');
    params.push(body.playerCount);
  }

  if (typeof body.coverArtUrl === 'string') {
    sets.push('cover_art_url = ?');
    params.push(sanitizeString(body.coverArtUrl, 500));
  }

  if (typeof body.isFavorite === 'boolean') {
    sets.push('is_favorite = ?');
    params.push(body.isFavorite ? 1 : 0);
  }

  if (sets.length === 0) {
    return errorResponse('No valid fields to update', 400);
  }

  const now = new Date().toISOString();
  sets.push('updated_at = ?');
  params.push(now);
  params.push(hash);

  await execute(DB, `UPDATE rom_metadata SET ${sets.join(', ')} WHERE hash = ?`, params);

  // Fetch updated row
  const updated = await queryOne(
    DB,
    `SELECT hash, user_id, title, platform, player_count, file_size, cover_art_url, is_favorite, created_at, updated_at
     FROM rom_metadata WHERE hash = ?`,
    [hash],
  );

  const metadata = mapRowToMetadata(updated!);

  // Invalidate and re-cache in KV
  await KV.put(`rom:meta:${hash}`, JSON.stringify(metadata), { expirationTtl: 300 });

  return jsonResponse(metadata);
};

// ── DELETE /api/classic/rom/:hash ─────────────────────────────

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { DB, KV } = context.env;
  const hash = context.params.hash as string;

  if (!hash || !validateLength(hash, 64, 64)) {
    return errorResponse('Invalid hash parameter', 400);
  }

  const user = requireAuth(context);
  if (user instanceof Response) return user;

  // Verify ownership
  const existing = await queryOne<{ user_id: string }>(
    DB,
    'SELECT user_id FROM rom_metadata WHERE hash = ?',
    [hash],
  );

  if (!existing) {
    return errorResponse('ROM metadata not found', 404);
  }
  if (existing.user_id !== String(user.id)) {
    return errorResponse('Forbidden: you do not own this ROM entry', 403);
  }

  await execute(DB, 'DELETE FROM rom_metadata WHERE hash = ?', [hash]);

  // Remove from KV cache
  await KV.delete(`rom:meta:${hash}`);

  return jsonResponse({ deleted: true });
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
