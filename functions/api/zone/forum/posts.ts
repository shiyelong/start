/**
 * /api/zone/forum/posts — Adult forum posts CRUD
 *
 * GET  /api/zone/forum/posts — Paginated post list with section/sort filters
 * POST /api/zone/forum/posts — Create a new post (auth required, supports anonymous)
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_SECTIONS = ['discuss', 'experience', 'resource', 'dating', 'worker', 'safety'];

// Basic keyword filter for illegal content
const BLOCKED_KEYWORDS = ['未成年', '儿童', '幼女', '幼男', 'underage', 'child'];

function containsBlockedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_KEYWORDS.some(kw => lower.includes(kw));
}

// ── GET /api/zone/forum/posts ─────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const url = new URL(context.request.url);

    const section = url.searchParams.get('section');
    const sort = url.searchParams.get('sort') || 'latest';
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;
    const q = url.searchParams.get('q');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (section && VALID_SECTIONS.includes(section)) {
      conditions.push('section = ?');
      params.push(section);
    }
    if (q) {
      conditions.push('(title LIKE ? OR content LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'pinned DESC, created_at DESC';
    switch (sort) {
      case 'hot': orderBy = 'pinned DESC, (likes + replies * 2) DESC'; break;
      case 'replies': orderBy = 'pinned DESC, replies DESC'; break;
      default: orderBy = 'pinned DESC, created_at DESC'; break;
    }

    const sql = `SELECT * FROM adult_posts${where} ORDER BY ${orderBy}`;
    const countSql = `SELECT COUNT(*) FROM adult_posts${where}`;

    const result = await paginate(DB, sql, countSql, params, page, pageSize);
    return jsonResponse(result);
  } catch (err) {
    return handleError(err);
  }
};

// ── POST /api/zone/forum/posts ────────────────────────────────

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
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const isAnonymous = body.anonymous === true;

    if (!title || !content) {
      return errorResponse('Missing required fields: title, content', 400);
    }

    // Content moderation
    if (containsBlockedContent(title) || containsBlockedContent(content)) {
      return errorResponse('Content contains prohibited keywords', 403);
    }

    let section = typeof body.section === 'string' ? body.section : 'discuss';
    if (!VALID_SECTIONS.includes(section)) section = 'discuss';

    const now = new Date().toISOString();
    const authorName = isAnonymous ? `匿名${Math.floor(Math.random() * 9999)}` : `用户${user.id}`;

    const { lastRowId } = await execute(
      DB,
      `INSERT INTO adult_posts (author_id, author_name, is_anonymous, title, content, section, likes, replies, views, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
      [user.id, authorName, isAnonymous ? 1 : 0, title, content, section, now, now],
    );

    const created = await queryOne(DB, 'SELECT * FROM adult_posts WHERE id = ?', [lastRowId]);
    return jsonResponse(created, 201);
  } catch (err) {
    return handleError(err);
  }
};
