/**
 * Music stream proxy API.
 *
 * GET /api/music/stream/[id] — proxy audio stream URL through Cloudflare Workers
 *
 * Returns a 302 redirect to the proxied audio stream URL. All audio streams
 * are routed through Cloudflare Workers to ensure the NAS real IP is
 * never exposed to third-party music sources.
 *
 * Security: All traffic goes through Cloudflare (Project Constitution Ch.2)
 *
 * Validates: Requirements 8.4, 8.11, 8.13
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString } from '../../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../../_lib/rating';
import { getMusicAdapterById } from '../_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Extract the source ID from a composite music ID.
 *
 * Music IDs follow the pattern: `{sourceId}-{rest}`
 * e.g. "netease-query-0", "qqmusic-song-3", "ytmusic-track-5"
 */
function extractSourceId(musicId: string): { sourceId: string; itemId: string } | null {
  // Handle multi-segment source IDs first
  const multiSegmentIds = ['qqmusic', 'ytmusic'];
  for (const sid of multiSegmentIds) {
    if (musicId.startsWith(`${sid}-`)) {
      return { sourceId: sid, itemId: musicId };
    }
  }

  const dashIndex = musicId.indexOf('-');
  if (dashIndex === -1) return null;

  return { sourceId: musicId.substring(0, dashIndex), itemId: musicId };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const rawId = (context.params as Record<string, string>).id;
    if (!rawId) {
      throw new APIError(400, '缺少音乐 ID');
    }

    const musicId = sanitizeString(rawId, 500);
    const parsed = extractSourceId(musicId);

    if (!parsed) {
      throw new APIError(400, '无效的音乐 ID 格式');
    }

    const { sourceId, itemId } = parsed;
    const adapter = getMusicAdapterById(sourceId);

    if (!adapter) {
      throw new APIError(404, `未找到音乐源: ${sourceId}`);
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
      throw new APIError(404, '无法获取音频流地址');
    }

    // 302 redirect to the proxied audio stream URL
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
