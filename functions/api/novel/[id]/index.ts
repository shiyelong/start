/**
 * Novel detail API.
 *
 * GET /api/novel/[id] — get novel details + chapter list
 *
 * The novel ID format is `{sourceId}-{rest}`, e.g. `biquge-query-0`.
 * The source ID prefix is used to route to the correct adapter.
 *
 * Response:
 *   { item: AggregatedItem, related: AggregatedItem[] }
 *
 * Validates: Requirements 23.1, 23.2, 23.3, 23.9, 23.12
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString } from '../../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../../_lib/rating';
import { getNovelAdapterById } from '../_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Extract the source ID from a composite novel ID.
 *
 * Novel IDs follow the pattern `{sourceId}-{rest}`.
 */
function extractSourceId(novelId: string): { sourceId: string; itemId: string } | null {
  const dashIndex = novelId.indexOf('-');
  if (dashIndex === -1) return null;

  const sourceId = novelId.substring(0, dashIndex);
  return { sourceId, itemId: novelId };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const rawId = (context.params as Record<string, string>).id;
    if (!rawId) {
      throw new APIError(400, '缺少小说 ID');
    }

    const novelId = sanitizeString(rawId, 500);
    const parsed = extractSourceId(novelId);

    if (!parsed) {
      throw new APIError(400, '无效的小说 ID 格式');
    }

    const { sourceId, itemId } = parsed;
    const adapter = getNovelAdapterById(sourceId);

    if (!adapter) {
      throw new APIError(404, `未找到小说源: ${sourceId}`);
    }

    // Get novel detail
    const item = await adapter.getDetail(itemId);
    if (!item) {
      throw new APIError(404, '小说不存在');
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
