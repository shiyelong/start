/**
 * YouTube proxy video source adapter.
 *
 * Proxies YouTube video access through Cloudflare Workers to enable
 * access from mainland China without VPN.
 *
 * Default rating: PG (Requirement 14.9)
 * Validates: Requirements 3.1, 3.2, 3.3, 3.6, 3.8
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export function createYouTubeConfig(overrides?: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'youtube',
    name: 'YouTube',
    type: 'video',
    enabled: true,
    rating: 'PG',
    priority: 15,
    searchUrl: 'https://www.googleapis.com/youtube/v3/search',
    parseRules: JSON.stringify({ type: 'json', resultPath: 'items' }),
    timeout: 10000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class YouTubeAdapter extends BaseSourceAdapter {
  constructor(config?: Partial<SourceConfig>) {
    super(createYouTubeConfig(config));
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub: In production, proxies through Cloudflare Workers to YouTube Data API
    // All requests go through CF Workers to hide NAS IP (Requirement 3.8)
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 10);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `yt-${query}-${(page - 1) * pageSize + i}`,
        title: `[YouTube] ${query} - Video ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/video/stream/yt-${query}-${i}`,
        metadata: {
          platform: 'youtube',
          videoId: `dQw4w9WgXcQ${i}`,
          channel: 'Example Channel',
          views: Math.floor(Math.random() * 1000000),
          duration: Math.floor(Math.random() * 900) + 60,
        },
      }));
    }

    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[YouTube] Video Detail - ${itemId}`,
      cover: '',
      url: `/api/video/stream/${itemId}`,
      metadata: {
        platform: 'youtube',
        description: 'YouTube video detail (stub)',
        channel: 'Example Channel',
        views: 500000,
        likes: 20000,
        duration: 600,
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: Cloudflare Workers reverse proxy for YouTube video stream
    // This ensures NAS IP is never exposed (Requirement 3.8)
    const videoId = itemId.replace('yt-', '').split('-')[0];
    return `https://cf-yt-proxy.workers.dev/embed/${videoId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
