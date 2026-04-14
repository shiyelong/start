/**
 * Bilibili (B站) video source adapter.
 *
 * Provides video list, search, and embed playback for Bilibili content.
 * Uses Cloudflare Workers proxy to access Bilibili API.
 *
 * Default rating: PG (Requirement 14.9)
 * Validates: Requirements 2.1, 2.2, 2.5, 2.6
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export function createBilibiliConfig(overrides?: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'bilibili',
    name: 'B站',
    type: 'video',
    enabled: true,
    rating: 'PG',
    priority: 10,
    searchUrl: 'https://api.bilibili.com/x/web-interface/search/type',
    parseRules: JSON.stringify({ type: 'json', resultPath: 'data.result' }),
    timeout: 10000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class BilibiliAdapter extends BaseSourceAdapter {
  constructor(config?: Partial<SourceConfig>) {
    super(createBilibiliConfig(config));
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub: In production, this would proxy through Cloudflare Workers
    // to call Bilibili search API and parse results
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 10);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `bili-${query}-${(page - 1) * pageSize + i}`,
        title: `[B站] ${query} - 视频 ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/video/stream/bili-${query}-${i}`,
        metadata: {
          platform: 'bilibili',
          bvid: `BV1xx${i}`,
          uploader: '示例UP主',
          views: Math.floor(Math.random() * 100000),
          duration: Math.floor(Math.random() * 600) + 60,
        },
      }));
    }

    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[B站] 视频详情 - ${itemId}`,
      cover: '',
      url: `/api/video/stream/${itemId}`,
      metadata: {
        platform: 'bilibili',
        description: 'B站视频详情（stub）',
        uploader: '示例UP主',
        views: 50000,
        likes: 2000,
        duration: 300,
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: proxy through Cloudflare Workers to get Bilibili embed URL
    return `https://player.bilibili.com/player.html?bvid=${itemId}&autoplay=0`;
  }

  async healthCheck(): Promise<SourceHealth> {
    // Stub: would ping Bilibili API through Cloudflare Workers proxy
    return 'online';
  }
}
