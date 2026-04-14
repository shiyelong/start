/**
 * /api/live/stream/:roomId — Proxy live stream
 *
 * GET /api/live/stream/:roomId — Resolve and redirect to the proxied
 *     live stream URL via Cloudflare Workers.
 *
 * The roomId format is `{sourceId}-{internalId}`. The handler extracts
 * the sourceId prefix, looks up the matching live adapter, and calls
 * `getStreamUrl()` to obtain the Cloudflare-proxied stream URL.
 *
 * All traffic goes through Cloudflare Workers proxy to hide NAS IP
 * (Project Constitution Chapter 2).
 *
 * Validates: Requirements 25.4, 25.9
 */

import { jsonResponse, errorResponse } from '../../_lib/db';
import { getLiveAdapterById, getAllLiveSourceIds } from '../_adapters/index';

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const roomId = (context.params as Record<string, string>).roomId;

  if (!roomId || typeof roomId !== 'string') {
    return errorResponse('Missing roomId parameter', 400);
  }

  // Extract source ID from the roomId prefix (format: sourceId-rest)
  const allSourceIds = getAllLiveSourceIds();
  let matchedSourceId: string | null = null;

  for (const sourceId of allSourceIds) {
    if (roomId.startsWith(`${sourceId}-`)) {
      matchedSourceId = sourceId;
      break;
    }
  }

  if (!matchedSourceId) {
    return errorResponse('Unknown live source for the given roomId', 404);
  }

  const adapter = getLiveAdapterById(matchedSourceId);
  if (!adapter) {
    return errorResponse('Live source adapter not found', 404);
  }

  try {
    const streamUrl = await adapter.getStreamUrl(roomId);

    // 302 redirect to the proxied stream URL
    return new Response(null, {
      status: 302,
      headers: { Location: streamUrl },
    });
  } catch {
    return errorResponse('Failed to resolve live stream URL', 502);
  }
};
