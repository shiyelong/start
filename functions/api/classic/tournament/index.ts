/**
 * /api/classic/tournament
 * POST — Create a new tournament
 * GET  — List tournaments
 * Requirements: 27.1
 */

import { jsonResponse, errorResponse, execute, query } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      name?: string;
      romHash?: string;
      platform?: string;
      maxParticipants?: number;
      matchFormat?: string;
      createdBy?: string;
    };

    if (!body.name || !body.romHash || !body.createdBy) {
      return errorResponse('name, romHash, and createdBy are required', 400);
    }

    const validSizes = [4, 8, 16, 32];
    const maxP = body.maxParticipants ?? 8;
    if (!validSizes.includes(maxP)) {
      return errorResponse('maxParticipants must be 4, 8, 16, or 32', 400);
    }

    const validFormats = ['bo1', 'bo3'];
    const format = body.matchFormat ?? 'bo1';
    if (!validFormats.includes(format)) {
      return errorResponse('matchFormat must be bo1 or bo3', 400);
    }

    const id = crypto.randomUUID();
    await execute(
      context.env.DB,
      `INSERT INTO tournament (id, name, rom_hash, platform, max_participants, match_format, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'registration', ?)`,
      [id, body.name, body.romHash, body.platform ?? '', maxP, format, body.createdBy],
    );

    return jsonResponse({ id, success: true }, 201);
  } catch {
    return errorResponse('Internal server error', 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const tournaments = await query(
      context.env.DB,
      `SELECT id, name, rom_hash AS romHash, platform, max_participants AS maxParticipants,
              match_format AS matchFormat, status, created_by AS createdBy, created_at AS createdAt
       FROM tournament
       ORDER BY created_at DESC
       LIMIT 50`,
    );
    return jsonResponse({ items: tournaments });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};
