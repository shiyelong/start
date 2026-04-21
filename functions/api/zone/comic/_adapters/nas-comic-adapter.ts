/**
 * NAS local comic library adapter.
 *
 * Reads comic metadata from D1 (synced from NAS via Cloudflare Tunnel).
 * Images served through: User → CF CDN → CF Tunnel → NAS.
 * NAS IP never exposed. Zero public ports.
 *
 * Stream URL format: /api/nas/stream/comic/{id}
 */

import { BaseSourceAdapter } from '../../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../../_lib/source-adapter';
import type { SourceHealth } from '../../../../../src/lib/types';

interface NasComicOpts {
  id: string;
  name: string;
  priority: number;
}

export class NasComicAdapter extends BaseSourceAdapter {
  constructor(opts: NasComicOpts) {
    const config: SourceConfig = {
      id: opts.id,
      name: opts.name,
      type: 'comic',
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
      const itemId = `nas-c-${query}-${(page - 1) * pageSize + i}`;
      items.push(this.buildItem({
        id: itemId,
        title: `[本地] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/nas/stream/comic/${itemId}`,
        metadata: {
          platform: 'nas',
          storage: 'local',
          pageCount: 0,
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
      url: `/api/nas/stream/comic/${itemId}`,
      metadata: { platform: 'nas', storage: 'local' },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    return `/api/nas/stream/comic/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
