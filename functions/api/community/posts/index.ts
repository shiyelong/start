/**
 * /api/community/posts — Post list + create
 *
 * GET  /api/community/posts — Paginated list with optional category and sort filters
 * POST /api/community/posts — Create a new post (auth required)
 *
 * Validates: Requirement 11 (AC1, AC2, AC4, AC5)
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_CATEGORIES = ['discuss', 'share', 'question', 'announce'];
// ── GET /api/community/posts ──────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const url = new URL(context.request.url);

  const category = url.searchParams.get('category');
  const sort = url.searchParams.get('sort') || 'newest';
  const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category && VALID_CATEGORIES.includes(category)) {
    conditions.push('category = ?');
    params.push(category);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  // AC2: newest = ORDER BY created_at DESC, hottest = ORDER BY likes DESC
  const orderBy = sort === 'hottest' ? 'likes DESC' : 'created_at DESC';

  const sql = `SELECT * FROM posts${where} ORDER BY ${orderBy}`;
  const countSql = `SELECT COUNT(*) FROM posts${where}`;

  const result = await paginate(DB, sql, countSql, params, page, pageSize);

  return jsonResponse(result);
};

// ── POST /api/community/posts ─────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // Auth required (AC1)
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  // AC4: Missing title or content → 400
  const missing: string[] = [];
  if (!title) missing.push('title');
  if (!content) missing.push('content');
  if (missing.length > 0) {
    return errorResponse(`Missing required fields: ${missing.join(', ')}`, 400);
  }

  // AC5: Default category is discuss
  let category = typeof body.category === 'string' ? body.category.trim() : 'discuss';
  if (!VALID_CATEGORIES.includes(category)) {
    category = 'discuss';
  }

  // Get author_name from users table
  const userRow = await queryOne<{ username: string }>(
    DB,
    'SELECT username FROM users WHERE id = ?',
    [user.id],
  );
  const authorName = userRow?.username ?? 'Unknown';

  const now = new Date().toISOString();

  const { lastRowId } = await execute(
    DB,
    `INSERT INTO posts (title, content, category, author_id, author_name, likes, views, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    [title, content, category, user.id, authorName, now, now],
  );

  const created = await queryOne(DB, 'SELECT * FROM posts WHERE id = ?', [lastRowId]);
  if (!created) {
    return errorResponse('Failed to create post', 500);
  }

  return jsonResponse(created, 201);
};
