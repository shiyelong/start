/**
 * NAS local video library adapter.
 *
 * Reads video metadata from D1 (synced from NAS via Cloudflare Tunnel).
 * Streams served through: User → CF CDN → CF Tunnel → NAS.
 * NAS IP never exposed. Zero public ports.
 *
 * The NAS sync worker periodically scans the NAS media folder,
 * extracts metadata (ffprobe), and upserts into D1 `nas_videos` table.
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
   * In production: SELECT * FROM nas_videos WHERE title LIKE ? AND rating = 'NC-17'
   */
  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // TODO: Replace with actual D1 query when DB binding is available
    // const stmt = env.DB.prepare(
    //   `SELECT * FROM nas_videos
    //    WHERE (title LIKE ?1 OR tags LIKE ?1) AND rating = 'NC-17'
    //    ORDER BY added_at DESC
    //    LIMIT ?2 OFFSET ?3`
    // );
    // const results = await stmt.bind(`%${query}%`, pageSize, (page-1)*pageSize).all();

    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 5);
    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `nas-v-${query}-${(page - 1) * pageSize + i}`,
        title: `[本地] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/zone/video/stream/nas/${query}-${i}`,
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
    // TODO: D1 lookup by ID
    return this.buildItem({
      id: itemId,
      title: `[本地] ${itemId}`,
      cover: '',
      url: `/api/zone/video/stream/nas/${itemId}`,
      metadata: { platform: 'nas', storage: 'local' },
    });
  }

  /**
   * Stream URL goes through Cloudflare Tunnel → NAS.
   * Format: https://tunnel.yourdomain.com/media/videos/{itemId}
   * The tunnel endpoint is configured in cloudflared.yml (never committed to git).
   */
  async getStreamUrl(itemId: string): Promise<string> {
    return `https://cf-proxy.workers.dev/nas/video/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    // TODO: Ping NAS via tunnel health endpoint
    return 'online';
  }
}
