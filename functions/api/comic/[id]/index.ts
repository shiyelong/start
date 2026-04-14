/**
 * Comic detail API.
 *
 * GET /api/comic/[id] — get comic details + chapter list
 *
 * The comic ID format is `{sourceId}-{rest}`, e.g. `mangadex-query-0`.
 * The source ID prefix is used to route to the correct adapter.
 *
 * Response:
 *   { item: AggregatedItem, related: AggregatedItem[] }
 *
 * Validates: Requirements 18.1, 18.2, 18.3, 18.9, 18.12
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString } from '../../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../../_lib/rating';
import { getComicAdapterById } from '../_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Extract the source ID from a composite comic ID.
 *
 * Comic IDs follow the pattern `{sourceId}-{rest}`.
 */
function extractSourceId(comicId: string): { sourceId: string; itemId: string } | null {
  const dashIndex = comicId.indexOf('-');
  if (dashIndex === -1) return null;

  const sourceId = comicId.substring(0, dashIndex);
  return { sourceId, itemId: comicId };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const rawId = (context.params as Record<string, string>).id;
    if (!rawId) {
      throw new APIError(400, '缺少漫画 ID');
    }

    const comicId = sanitizeString(rawId, 500);
    const parsed = extractSourceId(comicId);

    if (!parsed) {
      throw new APIError(400, '无效的漫画 ID 格式');
    }

    const { sourceId, itemId } = parsed;
    const adapter = getComicAdapterById(sourceId);

    if (!adapter) {
      throw new APIError(404, `未找到漫画源: ${sourceId}`);
    }

    // Get comic detail
    const item = await adapter.getDetail(itemId);
    if (!item) {
      throw new APIError(404, '漫画不存在');
    }

    // Check rating permission
    const maxRating: ContentRating = (context.data.maxRating as ContentRating) || 'NC-17';
    if (!isRatingAllowed(maxRating, item.rating)) {
      throw new APIError(403, '当前用户模式无权访问该分级内容');
    }

    // Get related recommendations from the same source
    let related = await adapter.search(
      item.title.replace(/\[.*?\]\s*/, '').split(' - ')[0] || 'recommended',
      1,
      6,
    );

    // Filter out the current item and apply rating filter
    related = related
      .filter((r) => r.id !== itemId)
      .filter((r) => isRatingAllowed(maxRating, r.rating))
      .slice(0, 5);

    return jsonResponse({ item, related });
  } catch (error) {
    return handleError(error);
  }
};
