/**
 * POST /api/classic/cheats — Submit a new cheat code
 * Requirements: 20.7
 */

import { jsonResponse, errorResponse, execute } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      romHash?: string;
      platform?: string;
      code?: string;
      format?: string;
      description?: string;
      submittedBy?: string;
    };

    if (!body.romHash || !body.code || !body.format || !body.description) {
      return errorResponse('romHash, code, format, and description are required', 400);
    }

    const validFormats = ['gamegenie', 'actionreplay', 'proactionreplay'];
    if (!validFormats.includes(body.format)) {
      return errorResponse('format must be gamegenie, actionreplay, or proactionreplay', 400);
    }

    const id = crypto.randomUUID();
    await execute(
      context.env.DB,
      `INSERT INTO cheat_code (id, rom_hash, platform, code, format, description, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, body.romHash, body.platform ?? '', body.code, body.format, body.description, body.submittedBy ?? 'anonymous'],
    );

    return jsonResponse({ id, success: true }, 201);
  } catch {
    return errorResponse('Internal server error', 500);
  }
};
