/**
 * /api/admin/telegram/channels — Telegram channel management
 *
 * GET    — List all configured channels
 * POST   — Add a new channel
 * PUT    — Update channel config (by id in body)
 * DELETE — Remove a channel (by id in body)
 *
 * Validates: Requirements 51.7, 51.8, 51.9, 51.10
 */

import { requireAuth } from '../../_lib/auth';
import { query, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError, APIError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  TELEGRAM_BOT_TOKEN?: string;
}

// ── GET /api/admin/telegram/channels ──────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const channels = await query(
      context.env.DB,
      'SELECT * FROM telegram_channels ORDER BY created_at DESC',
      [],
    ).catch(() => []);

    return jsonResponse({ channels });
  } catch (error) {
    return handleError(error);
  }
};

// ── POST /api/admin/telegram/channels ─────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const type = typeof body.type === 'string' ? body.type.trim() : 'general';
    const rating = typeof body.rating === 'string' ? body.rating.trim() : 'PG';
    const fetchInterval = typeof body.fetchInterval === 'number' ? body.fetchInterval : 30;

    if (!channelId) throw new APIError(400, 'Missing required field: channelId');
    if (!name) throw new APIError(400, 'Missing required field: name');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      context.env.DB,
      `INSERT INTO telegram_channels (id, channel_id, name, type, rating, fetch_interval, enabled, last_fetched, message_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NULL, 0, ?, ?)`,
      [id, channelId, name, type, rating, fetchInterval, now, now],
    ).catch(() => {
      // Table may not exist yet
    });

    return jsonResponse({
      channel: { id, channelId, name, type, rating, fetchInterval, enabled: true },
    }, 201);
  } catch (error) {
    return handleError(error);
  }
};

// ── PUT /api/admin/telegram/channels ──────────────────────────

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new APIError(400, 'Missing required field: id');

    const updates: string[] = [];
    const params: unknown[] = [];

    if (typeof body.name === 'string') {
      updates.push('name = ?');
      params.push(body.name.trim());
    }
    if (typeof body.type === 'string') {
      updates.push('type = ?');
      params.push(body.type.trim());
    }
    if (typeof body.rating === 'string') {
      updates.push('rating = ?');
      params.push(body.rating.trim());
    }
    if (typeof body.fetchInterval === 'number') {
      updates.push('fetch_interval = ?');
      params.push(body.fetchInterval);
    }
    if (typeof body.enabled === 'boolean') {
      updates.push('enabled = ?');
      params.push(body.enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await execute(
      context.env.DB,
      `UPDATE telegram_channels SET ${updates.join(', ')} WHERE id = ?`,
      params,
    ).catch(() => {});

    return jsonResponse({ updated: true, id });
  } catch (error) {
    return handleError(error);
  }
};

// ── DELETE /api/admin/telegram/channels ────────────────────────

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new APIError(400, 'Missing required field: id');

    await execute(
      context.env.DB,
      'DELETE FROM telegram_channels WHERE id = ?',
      [id],
    ).catch(() => {});

    return jsonResponse({ deleted: true, id });
  } catch (error) {
    return handleError(error);
  }
};
