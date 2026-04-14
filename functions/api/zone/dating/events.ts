/**
 * /api/zone/dating/events — Dating events
 *
 * GET  /api/zone/dating/events — List dating events
 * POST /api/zone/dating/events — Create a dating event (auth required)
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

// ── GET /api/zone/dating/events ───────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const url = new URL(context.request.url);

    const region = url.searchParams.get('region');
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

    const conditions: string[] = ['event_date >= date(\'now\')'];
    const params: unknown[] = [];

    if (region) {
      conditions.push('location LIKE ?');
      params.push(`%${region}%`);
    }

    const where = ` WHERE ${conditions.join(' AND ')}`;

    const sql = `SELECT * FROM dating_events${where} ORDER BY event_date ASC`;
    const countSql = `SELECT COUNT(*) FROM dating_events${where}`;

    const result = await paginate(DB, sql, countSql, params, page, pageSize);
    return jsonResponse(result);
  } catch (err) {
    return handleError(err);
  }
};

// ── POST /api/zone/dating/events ──────────────────────────────

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

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const eventDate = typeof body.eventDate === 'string' ? body.eventDate.trim() : '';
    const maxAttendees = typeof body.maxAttendees === 'number' ? body.maxAttendees : 20;

    if (!title || !description || !location || !eventDate) {
      return errorResponse('Missing required fields: title, description, location, eventDate', 400);
    }

    const now = new Date().toISOString();

    const { lastRowId } = await execute(
      DB,
      `INSERT INTO dating_events (organizer_id, title, description, location, event_date, max_attendees, attendees, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [user.id, title, description, location, eventDate, maxAttendees, now],
    );

    const created = await queryOne(DB, 'SELECT * FROM dating_events WHERE id = ?', [lastRowId]);
    return jsonResponse(created, 201);
  } catch (err) {
    return handleError(err);
  }
};
