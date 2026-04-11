/**
 * POST /api/classic/replay/share — Generate shareable replay link
 * Requirements: 17.6, 17.8
 */

import { jsonResponse, errorResponse, execute, queryOne } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  REPLAYS: R2Bucket;
  JWT_SECRET: string;
}

function generateShareCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  for (const b of arr) code += chars[b % chars.length];
  return code;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      replayId?: string;
      userId?: string;
      romHash?: string;
      platform?: string;
      duration?: number;
    };

    if (!body.replayId || !body.userId) {
      return errorResponse('replayId and userId are required', 400);
    }

    const shareCode = generateShareCode();
    const id = body.replayId;

    // Check if replay already exists in DB
    const existing = await queryOne(context.env.DB, 'SELECT id FROM replay WHERE id = ?', [id]);

    if (!existing) {
      await execute(
        context.env.DB,
        `INSERT INTO replay (id, user_id, rom_hash, platform, duration_seconds, share_code)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, body.userId, body.romHash ?? '', body.platform ?? '', body.duration ?? 0, shareCode],
      );
    } else {
      await execute(context.env.DB, 'UPDATE replay SET share_code = ? WHERE id = ?', [shareCode, id]);
    }

    const url = `/games/classic/replay/${shareCode}`;
    return jsonResponse({ shareCode, url });
  } catch (err) {
    return errorResponse('Internal server error', 500);
  }
};
