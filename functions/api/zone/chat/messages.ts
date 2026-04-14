/**
 * /api/zone/chat/messages — Private messaging
 *
 * GET  /api/zone/chat/messages — Get messages with a specific user
 * POST /api/zone/chat/messages — Send a message (auth required)
 */

import { requireAuth } from '../../_lib/auth';
import { query, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

// ── GET /api/zone/chat/messages ───────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    const contactId = url.searchParams.get('contactId');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10) || 50;

    if (!contactId) {
      return errorResponse('contactId is required', 400);
    }

    const messages = await query(
      DB,
      `SELECT * FROM private_messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at DESC LIMIT ?`,
      [user.id, contactId, contactId, user.id, Math.min(limit, 100)],
    );

    // Mark messages as read
    await execute(
      DB,
      `UPDATE private_messages SET read_at = ? WHERE receiver_id = ? AND sender_id = ? AND read_at IS NULL`,
      [new Date().toISOString(), user.id, contactId],
    );

    return jsonResponse({ messages: messages.reverse() });
  } catch (err) {
    return handleError(err);
  }
};

// ── POST /api/zone/chat/messages ──────────────────────────────

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

    const receiverId = typeof body.receiverId === 'string' || typeof body.receiverId === 'number' ? String(body.receiverId) : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const messageType = typeof body.type === 'string' ? body.type : 'text';

    if (!receiverId || !content) {
      return errorResponse('Missing required fields: receiverId, content', 400);
    }

    const now = new Date().toISOString();

    const { lastRowId } = await execute(
      DB,
      `INSERT INTO private_messages (sender_id, receiver_id, content, message_type, read_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
      [user.id, receiverId, content, messageType, now],
    );

    const message = await queryOne(DB, 'SELECT * FROM private_messages WHERE id = ?', [lastRowId]);
    return jsonResponse(message, 201);
  } catch (err) {
    return handleError(err);
  }
};
