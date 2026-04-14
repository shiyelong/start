/**
 * Danmaku (bullet comment) API.
 *
 * GET  /api/danmaku/[videoId] — Get danmaku list for a video (public)
 * POST /api/danmaku/[videoId] — Send a danmaku (auth required)
 *
 * Validates: Requirements 29.4, 29.7
 */

import { requireAuth } from '../_lib/auth';
import { query, execute, jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
}

// ── Banned words for basic keyword filtering (Req 29.7) ──────

const BANNED_WORDS: string[] = [
  '广告', '代购', '加微信', '加QQ', '色情', '赌博',
  '诈骗', '传销', '毒品', '枪支',
];

/**
 * Check if text contains any banned words.
 * Returns the first matched banned word, or null if clean.
 */
function findBannedWord(text: string): string | null {
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      return word;
    }
  }
  return null;
}

// ── Validation constants ──────────────────────────────────────

const VALID_POSITIONS = ['scroll', 'top', 'bottom'] as const;
const VALID_SIZES = ['small', 'normal', 'large'] as const;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const MAX_TEXT_LENGTH = 100;

// ── GET /api/danmaku/[videoId] — public ───────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const videoId = (context.params as Record<string, string>).videoId;
    if (!videoId) {
      throw new APIError(400, 'Missing videoId');
    }

    const url = new URL(context.request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    let sql = `SELECT id, video_id, user_id, time_offset, text, color, position, size, created_at
      FROM danmaku WHERE video_id = ?`;
    const params: unknown[] = [videoId];

    // Optional time range filter
    if (fromParam !== null) {
      const from = parseFloat(fromParam);
      if (isNaN(from) || from < 0) {
        throw new APIError(400, 'Invalid "from" parameter, must be a non-negative number');
      }
      sql += ` AND time_offset >= ?`;
      params.push(from);
    }

    if (toParam !== null) {
      const to = parseFloat(toParam);
      if (isNaN(to) || to < 0) {
        throw new APIError(400, 'Invalid "to" parameter, must be a non-negative number');
      }
      sql += ` AND time_offset <= ?`;
      params.push(to);
    }

    sql += ` ORDER BY time_offset ASC`;

    const danmaku = await query(context.env.DB, sql, params);

    return jsonResponse({ danmaku });
  } catch (error) {
    return handleError(error);
  }
};

// ── POST /api/danmaku/[videoId] — auth required ───────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const videoId = (context.params as Record<string, string>).videoId;
    if (!videoId) {
      throw new APIError(400, 'Missing videoId');
    }

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      throw new APIError(400, 'Invalid JSON body');
    }

    // Validate time (required, number >= 0)
    const time = typeof body.time === 'number' ? body.time : NaN;
    if (isNaN(time) || time < 0) {
      throw new APIError(400, 'Invalid "time" field, must be a non-negative number');
    }

    // Validate text (required, max 100 chars)
    const rawText = typeof body.text === 'string' ? body.text.trim() : '';
    if (!rawText) {
      throw new APIError(400, 'Danmaku text cannot be empty');
    }
    if (rawText.length > MAX_TEXT_LENGTH) {
      throw new APIError(400, `Danmaku text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`);
    }
    const text = sanitizeString(rawText, MAX_TEXT_LENGTH);

    // Basic keyword filtering (Req 29.7)
    const bannedWord = findBannedWord(text);
    if (bannedWord) {
      throw new APIError(400, 'Danmaku contains prohibited content');
    }

    // Validate color (optional, must be hex)
    let color = '#FFFFFF';
    if (body.color !== undefined && body.color !== null) {
      const rawColor = typeof body.color === 'string' ? body.color.trim() : '';
      if (!HEX_COLOR_RE.test(rawColor)) {
        throw new APIError(400, 'Invalid color, must be a hex color (e.g. #FF0000)');
      }
      color = rawColor.toUpperCase();
    }

    // Validate position (optional, must be scroll/top/bottom)
    let position = 'scroll';
    if (body.position !== undefined && body.position !== null) {
      const rawPosition = typeof body.position === 'string' ? body.position.trim() : '';
      if (!(VALID_POSITIONS as readonly string[]).includes(rawPosition)) {
        throw new APIError(400, `Invalid position, must be one of: ${VALID_POSITIONS.join(', ')}`);
      }
      position = rawPosition;
    }

    // Validate size (optional, must be small/normal/large)
    let size = 'normal';
    if (body.size !== undefined && body.size !== null) {
      const rawSize = typeof body.size === 'string' ? body.size.trim() : '';
      if (!(VALID_SIZES as readonly string[]).includes(rawSize)) {
        throw new APIError(400, `Invalid size, must be one of: ${VALID_SIZES.join(', ')}`);
      }
      size = rawSize;
    }

    // Insert into danmaku table
    await execute(
      context.env.DB,
      `INSERT INTO danmaku (video_id, user_id, time_offset, text, color, position, size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [videoId, user.id, time, text, color, position, size],
    );

    return jsonResponse({ success: true }, 201);
  } catch (error) {
    return handleError(error);
  }
};
