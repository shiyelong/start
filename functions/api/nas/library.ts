/**
 * GET /api/nas/library — Browse NAS content library
 *
 * Query params:
 *   type     — video | comic | novel | music (required)
 *   q        — search query (optional)
 *   page     — page number, default 1
 *   pageSize — items per page, default 20
 *   sort     — added_at | title | file_size, default added_at
 *   order    — asc | desc, default desc
 *
 * Returns paginated list of NAS content metadata from D1.
 * Requires adult mode (NC-17 rating).
 *
 * Validates: Requirement 52.2, Project Constitution Ch.2
 */

import { requireAuth } from '../_lib/auth';
import { jsonResponse, errorResponse, paginate } from '../_lib/db';
import { handleError } from '../_lib/errors';
import { APIError } from '../_lib/errors';
import { isRatingAllowed, type ContentRating } from '../_lib/rating';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const VALID_TYPES = ['video', 'comic', 'novel', 'music'] as const;
const VALID_SORTS: Record<string, string[]> = {
  video: ['added_at', 'title', 'file_size', 'duration'],
  comic: ['added_at', 'title', 'page_count'],
  novel: ['added_at', 'title', 'word_count'],
  music: ['added_at', 'title', 'duration'],
};

const TYPE_TABLE: Record<string, string> = {
  video: 'nas_videos',
  comic: 'nas_comics',
  novel: 'nas_novels',
  music: 'nas_music',
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    // Check rating — NAS content is NC-17
    const maxRating: ContentRating = (context.data as Record<string, unknown>).maxRating as ContentRating || 'PG';
    if (!isRatingAllowed(maxRating, 'NC-17')) {
      throw new APIError(403, '当前用户模式无权访问 NAS 内容');
    }

    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');
    const q = url.searchParams.get('q') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
    const sort = url.searchParams.get('sort') || 'added_at';
    const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

    if (!type || !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      throw new APIError(400, '无效的内容类型，支持: video, comic, novel, music');
    }

    const table = TYPE_TABLE[type];
    const validSorts = VALID_SORTS[type];
    const safeSort = validSorts.includes(sort) ? sort : 'added_at';

    // Build query
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      conditions.push('title LIKE ?');
      params.push(`%${q}%`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM ${table}${where} ORDER BY ${safeSort} ${order}`;
    const countSql = `SELECT COUNT(*) FROM ${table}${where}`;

    const result = await paginate(
      context.env.DB,
      sql,
      countSql,
      params,
      page,
      pageSize,
    );

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};
