/**
 * Adult video stream proxy API.
 *
 * GET /api/zone/video/stream/[id] — proxy adult video stream URL
 * through Cloudflare Workers.
 *
 * Returns a 302 redirect to the proxied stream URL. All video streams
 * are routed through Cloudflare Workers to ensure the NAS real IP is
 * never exposed to third-party video sources.
 *
 * Security: All traffic goes through Cloudflare (Project Constitution Ch.2)
 * Rating: Only NC-17 content — adult mode required.
 *
 * Validates: Requirements 17.3, 17.5, 17.9
 */

import { jsonResponse } from '../../../_lib/db';
import { APIError, handleError } from '../../../_lib/errors';
import { sanitizeString } from '../../../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../../../_lib/rating';
import { getAdultVideoAdapterById } from '../_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Extract the source ID from a composite adult video ID.
 *
 * Adult video IDs follow patterns like:
 * - "adult-src-N-<rest>" for generic sources
 * - "adult-nas-<rest>" for NAS content
 * - "adult-upload-<rest>" for user uploads
 * - "adult-tg-channel-<rest>" / "adult-tg-group-<rest>" for Telegram
 * - "adult-pornhub-<rest>" etc. for external sources
 *
 * We extract the source ID prefix to route to the correct adapter.
 */
function extractAdultSourceId(videoId: string): { sourceId: string; itemId: string } | null {
  // Known source ID prefixes (ordered by specificity)
  const knownPrefixes = [
    'adult-nas',
    'adult-upload',
    'adult-tg-channel',
    'adult-tg-group',
    'adult-pornhub',
    'adult-xvideos',
    'adult-xnxx',
    'adult-javbus',
    'adult-missav',
    'adult-thisav',
    'adult-jable',
    'adult-avgle',
    'adult-spankbang',
    'adult-hentaihaven',
    'adult-hanime',
    'adult-r18',
  ];

  for (const prefix of knownPrefixes) {
    if (videoId.startsWith(`${prefix}-`)) {
      return { sourceId: prefix, itemId: videoId };
    }
  }

  // Fallback: match "adult-src-N" pattern
  const match = videoId.match(/^(adult-src-\d+)-/);
  if (!match) return null;

  return {
    sourceId: match[1],
    itemId: videoId,
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const rawId = (context.params as Record<string, string>).id;
    if (!rawId) {
      throw new APIError(400, '缺少视频 ID');
    }

    const videoId = sanitizeString(rawId, 500);
    const parsed = extractAdultSourceId(videoId);

    if (!parsed) {
      throw new APIError(400, '无效的视频 ID 格式');
    }

    const { sourceId, itemId } = parsed;
    const adapter = getAdultVideoAdapterById(sourceId);

    if (!adapter) {
      throw new APIError(404, `未找到视频源: ${sourceId}`);
    }

    // Check rating permission — adult video is always NC-17
    const maxRating: ContentRating = (context.data.maxRating as ContentRating) || 'PG';
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
