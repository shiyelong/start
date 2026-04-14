/**
 * /api/zone/dating/match — Dating matching logic
 *
 * POST /api/zone/dating/match — Like or dislike a profile (auth required)
 * GET  /api/zone/dating/match — Get current matches
 */

import { requireAuth } from '../../_lib/auth';
import { query, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

// ── GET /api/zone/dating/match ────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    // Get mutual matches (both liked each other)
    const matches = await query(
      DB,
      `SELECT dp.* FROM dating_matches dm1
       JOIN dating_matches dm2 ON dm1.target_id = dm2.user_id AND dm1.user_id = dm2.target_id
       JOIN dating_profiles dp ON dp.user_id = dm1.target_id
       WHERE dm1.user_id = ? AND dm1.action = 'like' AND dm2.action = 'like'
       ORDER BY dm1.created_at DESC`,
      [user.id],
    );

    return jsonResponse({ matches });
  } catch (err) {
    return handleError(err);
  }
};

// ── POST /api/zone/dating/match ───────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const targetId = typeof body.targetId === 'string' || typeof body.targetId === 'number' ? String(body.targetId) : '';
    const action = typeof body.action === 'string' && ['like', 'dislike'].includes(body.action) ? body.action : '';

    if (!targetId || !action) {
      return errorResponse('Missing required fields: targetId, action (like/dislike)', 400);
    }

    const now = new Date().toISOString();

    // Check if already matched
    const existing = await queryOne(
      DB,
      'SELECT id FROM dating_matches WHERE user_id = ? AND target_id = ?',
      [user.id, targetId],
    );

    if (existing) {
      // Update existing
      await execute(
        DB,
        'UPDATE dating_matches SET action = ?, created_at = ? WHERE user_id = ? AND target_id = ?',
        [action, now, user.id, targetId],
      );
    } else {
      await execute(
        DB,
        'INSERT INTO dating_matches (user_id, target_id, action, created_at) VALUES (?, ?, ?, ?)',
        [user.id, targetId, action, now],
      );
    }

    // Check for mutual match
    let isMatch = false;
    if (action === 'like') {
      const mutual = await queryOne(
        DB,
        'SELECT id FROM dating_matches WHERE user_id = ? AND target_id = ? AND action = ?',
        [targetId, user.id, 'like'],
      );
      isMatch = !!mutual;
    }

    return jsonResponse({ success: true, action, isMatch });
  } catch (err) {
    return handleError(err);
  }
};
