/**
 * NAS local video library adapter.
 *
 * Reads video metadata from D1 (synced from NAS via Cloudflare Tunnel).
 * Streams served through: User → CF CDN → CF Tunnel → NAS.
 * NAS IP never exposed. Zero public ports.
 *
 * The NAS sync worker (/api/nas/sync) periodically scans the NAS media
 * folder, extracts metadata, and upserts into D1 `nas_videos` table.
 *
 * Stream URL format: /api/nas/stream/video/{id}
 * This routes through the unified NAS stream proxy which handles:
 * - Request signing for NAS-side verification
 * - Bandwidth tracking & daily caps
 * - Traffic shaping (random delays to avoid ISP detection)
 * - Range request support for seeking
 * - Cache fallback when NAS is unreachable
 */

import { BaseSourceAdapter } from '../../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../../_lib/source-adapter';
import type { SourceHealth } from '../../../../../src/lib/types';

interface NasVideoOpts {
  id: string;
  name: string;
  priority: number;
}

export class NasVideoAdapter extends BaseSourceAdapter {
  constructor(opts: NasVideoOpts) {
    const config: SourceConfig = {
      id: opts.id,
      name: opts.name,
      type: 'video',
      enabled: true,
      rating: 'NC-17',
      priority: opts.priority,
      searchUrl: '', // No external URL — reads from D1
      parseRules: '{}',
      timeout: 5000,
      health: 'online',
      avgResponseTime: 50,
      successRate: 100,
      failCount: 0,
      lastChecked: new Date().toISOString(),
    };
    super(config);
  }

  /**
   * Search NAS videos from D1 `nas_videos` table.
   *
   * TODO: When DB binding is available in adapter context, replace stub
   * with real D1 query. For now, returns stub items that route through
   * the NAS stream proxy.
   */
  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub — in production, the search endpoint (/api/zone/video/search)
    // queries D1 directly and doesn't go through the adapter for NAS content.
    // This stub exists for aggregator compatibility.
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 5);
    for (let i = 0; i < count; i++) {
      const itemId = `nas-v-${query}-${(page - 1) * pageSize + i}`;
      items.push(this.buildItem({
        id: itemId,
        title: `[本地] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/nas/stream/video/${itemId}`,
        metadata: {
          platform: 'nas',
          storage: 'local',
          quality: '1080p',
          codec: 'h264',
        },
        tags: [],
      }));
    }
    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[本地] ${itemId}`,
      cover: '',
      url: `/api/nas/stream/video/${itemId}`,
      metadata: { platform: 'nas', storage: 'local' },
    });
  }

  /**
   * Stream URL goes through the unified NAS stream proxy.
   * /api/nas/stream/video/{id} → CF Workers → CF Tunnel → NAS
   *
   * The proxy handles:
   * - HMAC request signing
   * - Bandwidth tracking
   * - Traffic shaping
   * - Range requests
   * - Cache fallback
   */
  async getStreamUrl(itemId: string): Promise<string> {
    return `/api/nas/stream/video/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    // Health is checked via /api/nas/health endpoint
    // which pings NAS through the tunnel
    return 'online';
  }
}
