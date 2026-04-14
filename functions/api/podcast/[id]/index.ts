/**
 * Podcast detail API.
 *
 * GET /api/podcast/[id] — get podcast details + episode list
 *
 * The podcast ID format is `{sourceId}-{rest}`, e.g. `apple-podcasts-query-0`.
 * The source ID prefix is used to route to the correct adapter.
 *
 * Response:
 *   { item: AggregatedItem, related: AggregatedItem[] }
 *
 * Validates: Requirements 24.1, 24.3, 24.9
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString } from '../../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../../_lib/rating';
import { getPodcastAdapterById } from '../_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Extract the source ID from a composite podcast ID.
 *
 * Podcast IDs follow the pattern `{sourceId}-{rest}`.
 * Some source IDs contain hyphens (e.g. apple-podcasts, spotify-podcasts,
 * google-podcasts, pocket-casts, podcast-addict), so we try known
 * multi-segment IDs first.
 */
const MULTI_SEGMENT_IDS = [
  'apple-podcasts',
  'spotify-podcasts',
  'google-podcasts',
  'pocket-casts',
  'podcast-addict',
];

function extractSourceId(podcastId: string): { sourceId: string; itemId: string } | null {
  // Try known multi-segment source IDs first
  for (const prefix of MULTI_SEGMENT_IDS) {
    if (podcastId.startsWith(prefix + '-')) {
      return { sourceId: prefix, itemId: podcastId };
    }
  }

  // Fall back to first dash separator
  const dashIndex = podcastId.indexOf('-');
  if (dashIndex === -1) return null;

  const sourceId = podcastId.substring(0, dashIndex);
  return { sourceId, itemId: podcastId };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const rawId = (context.params as Record<string, string>).id;
    if (!rawId) {
      throw new APIError(400, '缺少播客 ID');
    }

    const podcastId = sanitizeString(rawId, 500);
    const parsed = extractSourceId(podcastId);

    if (!parsed) {
      throw new APIError(400, '无效的播客 ID 格式');
    }

    const { sourceId, itemId } = parsed;
    const adapter = getPodcastAdapterById(sourceId);

    if (!adapter) {
      throw new APIError(404, `未找到播客源: ${sourceId}`);
    }

    // Get podcast detail
    const item = await adapter.getDetail(itemId);
    if (!item) {
      throw new APIError(404, '播客不存在');
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
