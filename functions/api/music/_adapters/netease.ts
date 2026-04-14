/**
 * NetEase Cloud Music (网易云音乐) source adapter.
 *
 * Provides music search and audio stream for NetEase Cloud Music content.
 * Uses Cloudflare Workers proxy to access NetEase API.
 *
 * Default rating: PG (Requirement 8.15, 14.9)
 * Validates: Requirements 8.1, 8.2, 8.3
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export function createNeteaseConfig(overrides?: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'netease',
    name: '网易云音乐',
    type: 'music',
    enabled: true,
    rating: 'PG',
    priority: 10,
    searchUrl: 'https://music.163.com/api/search/get',
    parseRules: JSON.stringify({ type: 'json', resultPath: 'result.songs' }),
    timeout: 8000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class NeteaseAdapter extends BaseSourceAdapter {
  constructor(config?: Partial<SourceConfig>) {
    super(createNeteaseConfig(config));
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub: In production, proxies through Cloudflare Workers to NetEase API
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 10);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `netease-${query}-${(page - 1) * pageSize + i}`,
        title: `[网易云] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/music/stream/netease-${query}-${i}`,
        metadata: {
          platform: 'netease',
          artist: '网易云歌手',
          album: '网易云专辑',
          duration: Math.floor(Math.random() * 300) + 120,
        },
      }));
    }

    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[网易云] ${itemId}`,
      cover: '',
      url: `/api/music/stream/${itemId}`,
      metadata: {
        platform: 'netease',
        artist: '网易云歌手',
        album: '网易云专辑',
        description: '网易云音乐详情 (stub)',
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: Cloudflare Workers proxy to NetEase audio stream
    return `https://cf-proxy.workers.dev/music/netease/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
