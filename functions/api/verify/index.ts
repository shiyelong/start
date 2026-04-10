/**
 * /api/verify — Verify items list + create
 *
 * GET  /api/verify — Paginated list with filtering and search
 * POST /api/verify — Create a new verify item (auth required)
 *                    or batch import (admin only)
 *
 * Validates: Requirement 5 (AC1–AC4, AC6–AC8)
 */

import { requireAuth, requireRole } from '../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_TYPES = ['person', 'company', 'restaurant', 'hotel', 'shop', 'school', 'hospital'];

// ── GET /api/verify ───────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const url = new URL(context.request.url);

  const type = url.searchParams.get('type');
  const subType = url.searchParams.get('sub_type');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

  // Build dynamic WHERE clauses
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  if (subType) {
    conditions.push('sub_type = ?');
    params.push(subType);
  }

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  // AC3: case-insensitive search on name, tags, info (location)
  if (search) {
    const pattern = `%${search}%`;
    conditions.push('(name LIKE ? COLLATE NOCASE OR tags LIKE ? COLLATE NOCASE OR info LIKE ? COLLATE NOCASE)');
    params.push(pattern, pattern, pattern);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  const sql = `SELECT * FROM verify_items${where} ORDER BY created_at DESC`;
  const countSql = `SELECT COUNT(*) FROM verify_items${where}`;

  const result = await paginate(DB, sql, countSql, params, page, pageSize);

  // Parse JSON fields for each item
  result.items = result.items.map(parseJsonFields);

  return jsonResponse(result);
};


// ── POST /api/verify ──────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  // AC8: Batch import — admin only
  if (Array.isArray(body.items)) {
    const admin = requireRole(context, 'admin');
    if (admin instanceof Response) return admin;

    const items = body.items as Record<string, unknown>[];
    let created = 0;
    const now = new Date().toISOString();

    for (const item of items) {
      const itemType = typeof item.type === 'string' ? item.type.trim() : '';
      const itemName = typeof item.name === 'string' ? item.name.trim() : '';
      if (!itemType || !itemName) continue;
      if (!VALID_TYPES.includes(itemType)) continue;

      const subType = typeof item.sub_type === 'string' ? item.sub_type.trim() : 'all';
      const info = item.info ? JSON.stringify(item.info) : '{}';
      const tags = Array.isArray(item.tags) ? JSON.stringify(item.tags) : '[]';

      await execute(
        DB,
        `INSERT INTO verify_items (type, sub_type, name, status, info, tags, resolved_fields, submitted_by, verify_count, created_at, updated_at)
         VALUES (?, ?, ?, 'unverified', ?, ?, '{}', ?, 0, ?, ?)`,
        [itemType, subType, itemName, info, tags, admin.id, now, now],
      );
      created++;
    }

    return jsonResponse({ created }, 201);
  }

  // Single item creation — auth required
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  const type = typeof body.type === 'string' ? body.type.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  // AC7: Missing type or name → 400
  const missing: string[] = [];
  if (!type) missing.push('type');
  if (!name) missing.push('name');
  if (missing.length > 0) {
    return errorResponse(`Missing required fields: ${missing.join(', ')}`, 400);
  }

  // AC6: Validate type
  if (!VALID_TYPES.includes(type)) {
    return errorResponse(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  const subType = typeof body.sub_type === 'string' ? body.sub_type.trim() : 'all';
  const info = body.info ? JSON.stringify(body.info) : '{}';
  const tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : '[]';
  const now = new Date().toISOString();

  // AC4: Create with status "unverified"
  const { lastRowId } = await execute(
    DB,
    `INSERT INTO verify_items (type, sub_type, name, status, info, tags, resolved_fields, submitted_by, verify_count, created_at, updated_at)
     VALUES (?, ?, ?, 'unverified', ?, ?, '{}', ?, 0, ?, ?)`,
    [type, subType, name, info, tags, user.id, now, now],
  );

  const created = await queryOne(DB, 'SELECT * FROM verify_items WHERE id = ?', [lastRowId]);
  if (!created) {
    return errorResponse('Failed to create verify item', 500);
  }

  return jsonResponse(parseJsonFields(created), 201);
};

// ── Helpers ───────────────────────────────────────────────────

function parseJsonFields(item: Record<string, unknown>): Record<string, unknown> {
  for (const field of ['info', 'tags', 'resolved_fields']) {
    if (typeof item[field] === 'string') {
      try {
        item[field] = JSON.parse(item[field] as string);
      } catch {
        // keep as string if parse fails
      }
    }
  }
  return item;
}
