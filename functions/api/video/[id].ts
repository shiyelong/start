/**
 * Video detail API.
 *
 * GET /api/video/[id] — get video details + related recommendations
 *
 * The video ID format is `{sourceId}-{rest}`, e.g. `bilibili-query-0`.
 * The source ID prefix is used to route to the correct adapter.
 *
 * Response:
 *   { item: AggregatedItem, related: AggregatedItem[] }
 *
 * Validates: Requirements 2.1, 2.5, 3.2, 3.3, 4.4, 16.2
 */

import { jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../_lib/rating';
import { AggregatorEngine } from '../_lib/aggregator';
import { getVideoAdapterById, createAllVideoAdapters } from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Extract the source ID from a composite video ID.
 *
 * Video IDs follow the pattern `{sourceId}-{rest}`.
 * Known source IDs are matched greedily (e.g. `twitch-vod` before `twitch`).
 */
function extractSourceId(videoId: string): { sourceId: string; itemId: string } | null {
  // Known multi-segment source IDs (must be checked first)
  const multiSegmentIds = ['twitch-vod'];
  for (const sid of multiSegmentIds) {
    if (videoId.startsWith(`${sid}-`)) {
      return { sourceId: sid, itemId: videoId };
    }
  }

  // Single-segment source IDs
  const dashIndex = videoId.indexOf('-');
  if (dashIndex === -1) return null;

  const sourceId = videoId.substring(0, dashIndex);
  return { sourceId, itemId: videoId };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const rawId = (context.params as Record<string, string>).id;
    if (!rawId) {
      throw new APIError(400, '缺少视频 ID');
    }

    const videoId = sanitizeString(rawId, 500);
    const parsed = extractSourceId(videoId);

    if (!parsed) {
      throw new APIError(400, '无效的视频 ID 格式');
    }

    const { sourceId, itemId } = parsed;
    const adapter = getVideoAdapterById(sourceId);

    if (!adapter) {
      throw new APIError(404, `未找到视频源: ${sourceId}`);
    }

    // Get video detail
    const item = await adapter.getDetail(itemId);
    if (!item) {
      throw new APIError(404, '视频不存在');
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
