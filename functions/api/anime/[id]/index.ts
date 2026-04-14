/**
 * Anime detail API.
 *
 * GET /api/anime/[id] — get anime details + episode list
 *
 * The anime ID format is `{sourceId}-{rest}`, e.g. `yinghua-query-0`.
 * The source ID prefix is used to route to the correct adapter.
 *
 * Response:
 *   { item: AggregatedItem, related: AggregatedItem[] }
 *
 * Validates: Requirements 22.1, 22.2, 22.4, 22.9
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString } from '../../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../../_lib/rating';
import { getAnimeAdapterById } from '../_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Extract the source ID from a composite anime ID.
 *
 * Anime IDs follow the pattern `{sourceId}-{rest}`.
 * Some source IDs contain hyphens (e.g. crunchyroll-free, bangumi-moe),
 * so we try known multi-segment IDs first.
 */
const MULTI_SEGMENT_IDS = ['crunchyroll-free', 'bangumi-moe'];

function extractSourceId(animeId: string): { sourceId: string; itemId: string } | null {
  // Try known multi-segment source IDs first
  for (const prefix of MULTI_SEGMENT_IDS) {
    if (animeId.startsWith(prefix + '-')) {
      return { sourceId: prefix, itemId: animeId };
    }
  }

  // Fall back to first dash separator
  const dashIndex = animeId.indexOf('-');
  if (dashIndex === -1) return null;

  const sourceId = animeId.substring(0, dashIndex);
  return { sourceId, itemId: animeId };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const rawId = (context.params as Record<string, string>).id;
    if (!rawId) {
      throw new APIError(400, '缺少动漫 ID');
    }

    const animeId = sanitizeString(rawId, 500);
    const parsed = extractSourceId(animeId);

    if (!parsed) {
      throw new APIError(400, '无效的动漫 ID 格式');
    }

    const { sourceId, itemId } = parsed;
    const adapter = getAnimeAdapterById(sourceId);

    if (!adapter) {
      throw new APIError(404, `未找到动漫源: ${sourceId}`);
    }

    // Get anime detail
    const item = await adapter.getDetail(itemId);
    if (!item) {
      throw new APIError(404, '动漫不存在');
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
