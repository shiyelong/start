/**
 * GET /api/classic/replay/:id — Get replay metadata
 * Requirements: 17.6
 */

import { jsonResponse, errorResponse, queryOne } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const id = (context.params as { id: string }).id;
    if (!id) return errorResponse('Replay ID is required', 400);

    // Try by ID first, then by share_code
    let replay = await queryOne(
      context.env.DB,
      'SELECT id, user_id, rom_hash, platform, duration_seconds, share_code, r2_key, created_at FROM replay WHERE id = ?',
      [id],
    );

    if (!replay) {
      replay = await queryOne(
        context.env.DB,
        'SELECT id, user_id, rom_hash, platform, duration_seconds, share_code, r2_key, created_at FROM replay WHERE share_code = ?',
        [id],
      );
    }

    if (!replay) return errorResponse('Replay not found', 404);

    return jsonResponse(replay);
  } catch {
    return errorResponse('Internal server error', 500);
  }
};
