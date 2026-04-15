/**
 * /api/comments/[contentType]/[contentId] — Comment list + create
 *
 * GET  — List comments for a content item (paginated, sortable)
 * POST — Create a new comment (auth required)
 *
 * Validates: Requirement 29.5, 29.6, 29.7
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_CONTENT_TYPES = ['video', 'music', 'comic', 'novel', 'anime', 'game', 'podcast'];

// Basic sensitive word filter
async function containsSensitiveWords(text: string, kv: KVNamespace): Promise<boolean> {
  const wordList = await kv.get('sensitive_words', 'text').catch(() => null);
  if (!wordList) return false;

  const words = wordList.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

// ── GET /api/comments/[contentType]/[contentId] ───────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const contentType = context.params.contentType as string;
    const contentId = context.params.contentId as string;

    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      return errorResponse(
        `Invalid content type. Allowed: ${VALID_CONTENT_TYPES.join(', ')}`,
        400,
      );
    }

    const url = new URL(context.request.url);
    const sort = url.searchParams.get('sort') || 'newest';
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

    const orderBy = sort === 'hottest' ? 'likes DESC' : 'created_at DESC';

    // Get top-level comments (parent_id IS NULL)
    const where = ' WHERE content_type = ? AND content_id = ? AND parent_id IS NULL';
    const params = [contentType, contentId];

    const sql = `SELECT * FROM comments${where} ORDER BY ${orderBy}`;
    const countSql = `SELECT COUNT(*) FROM comments${where}`;

    const result = await paginate(context.env.DB, sql, countSql, params, page, pageSize);

    // For each top-level comment, fetch up to 3 replies
    const enriched = await Promise.all(
      (result.items as Record<string, unknown>[]).map(async (comment) => {
        const replies = await paginate(
          context.env.DB,
          'SELECT * FROM comments WHERE parent_id = ? ORDER BY created_at ASC',
          'SELECT COUNT(*) FROM comments WHERE parent_id = ?',
          [comment.id],
          1,
          3,
        ).catch(() => ({ items: [], total: 0 }));

        return {
          ...comment,
          replies: replies.items,
          replyCount: replies.total,
        };
      }),
    );

    return jsonResponse({
      ...result,
      items: enriched,
    });
  } catch (error) {
    return handleError(error);
  }
};

// ── POST /api/comments/[contentType]/[contentId] ──────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const contentType = context.params.contentType as string;
    const contentId = context.params.contentId as string;

    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      return errorResponse(
        `Invalid content type. Allowed: ${VALID_CONTENT_TYPES.join(', ')}`,
        400,
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return errorResponse('Missing required field: content', 400);
    }

    if (content.length > 2000) {
      return errorResponse('Comment too long (max 2000 characters)', 400);
    }

    // Sensitive word filter
    const hasSensitive = await containsSensitiveWords(content, context.env.KV);
    if (hasSensitive) {
      return errorResponse('评论包含敏感词，请修改后重试', 400);
    }

    // Get author name
    const userRow = await queryOne<{ username: string }>(
      context.env.DB,
      'SELECT username FROM users WHERE id = ?',
      [user.id],
    );
    const authorName = userRow?.username ?? 'Unknown';

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      context.env.DB,
      `INSERT INTO comments (id, content_type, content_id, user_id, author_name, content, likes, parent_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
      [id, contentType, contentId, user.id, authorName, content, now],
    );

    return jsonResponse(
      {
        id,
        contentType,
        contentId,
        userId: user.id,
        authorName,
        content,
        likes: 0,
        parentId: null,
        createdAt: now,
      },
      201,
    );
  } catch (error) {
    return handleError(error);
  }
};
