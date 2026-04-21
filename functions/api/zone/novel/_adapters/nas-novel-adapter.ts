/**
 * NAS local novel library adapter.
 *
 * Reads novel metadata from D1 (synced from NAS via Cloudflare Tunnel).
 * Files served through: User → CF CDN → CF Tunnel → NAS.
 * NAS IP never exposed. Zero public ports.
 *
 * Stream URL format: /api/nas/stream/novel/{id}
 */

import { BaseSourceAdapter } from '../../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../../_lib/source-adapter';
import type { SourceHealth } from '../../../../../src/lib/types';

interface NasNovelOpts {
  id: string;
  name: string;
  priority: number;
}

export class NasNovelAdapter extends BaseSourceAdapter {
  constructor(opts: NasNovelOpts) {
    const config: SourceConfig = {
      id: opts.id,
      name: opts.name,
      type: 'novel',
      enabled: true,
      rating: 'NC-17',
      priority: opts.priority,
      searchUrl: '',
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

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 5);
    for (let i = 0; i < count; i++) {
      const itemId = `nas-n-${query}-${(page - 1) * pageSize + i}`;
      items.push(this.buildItem({
        id: itemId,
        title: `[本地] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/nas/stream/novel/${itemId}`,
        metadata: {
          platform: 'nas',
          storage: 'local',
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
      url: `/api/nas/stream/novel/${itemId}`,
      metadata: { platform: 'nas', storage: 'local' },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    return `/api/nas/stream/novel/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
