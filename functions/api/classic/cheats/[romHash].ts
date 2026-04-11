/**
 * GET /api/classic/cheats/:romHash — Get cheat codes for ROM
 * Requirements: 20.6
 */

import { jsonResponse, errorResponse, query } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const romHash = (context.params as { romHash: string }).romHash;
    if (!romHash) return errorResponse('romHash is required', 400);

    const cheats = await query(
      context.env.DB,
      `SELECT id, rom_hash AS romHash, platform, code, format, description,
              submitted_by AS submittedBy, upvotes, created_at AS createdAt
       FROM cheat_code
       WHERE rom_hash = ?
       ORDER BY upvotes DESC, created_at DESC`,
      [romHash],
    );

    return jsonResponse({ items: cheats });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};
