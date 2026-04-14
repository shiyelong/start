/**
 * Video stream proxy API.
 *
 * GET /api/video/stream/[id] — proxy video stream URL through Cloudflare Workers
 *
 * Returns a 302 redirect to the proxied stream URL. All video streams
 * are routed through Cloudflare Workers to ensure the NAS real IP is
 * never exposed to third-party video sources.
 *
 * Security: All traffic goes through Cloudflare (Project Constitution Ch.2)
 *
 * Validates: Requirements 3.1, 3.8, 4.4
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString } from '../../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../../_lib/rating';
import { getVideoAdapterById } from '../_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Extract the source ID from a composite video ID.
 */
function extractSourceId(videoId: string): { sourceId: string; itemId: string } | null {
  const multiSegmentIds = ['twitch-vod'];
  for (const sid of multiSegmentIds) {
    if (videoId.startsWith(`${sid}-`)) {
      return { sourceId: sid, itemId: videoId };
    }
  }

  const dashIndex = videoId.indexOf('-');
  if (dashIndex === -1) return null;

  return { sourceId: videoId.substring(0, dashIndex), itemId: videoId };
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

    // Check rating permission
    const maxRating: ContentRating = (context.data.maxRating as ContentRating) || 'NC-17';
    if (!isRatingAllowed(maxRating, adapter.config.rating)) {
      throw new APIError(403, '当前用户模式无权访问该分级内容');
    }

    // Get the proxied stream URL from the adapter
    // All URLs go through Cloudflare Workers — NAS IP never exposed
    const streamUrl = await adapter.getStreamUrl(itemId);

    if (!streamUrl) {
      throw new APIError(404, '无法获取视频流地址');
    }

    // 302 redirect to the proxied stream URL
    return new Response(null, {
      status: 302,
      headers: {
        Location: streamUrl,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
