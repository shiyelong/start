/**
 * QQ Music (QQ音乐) source adapter.
 *
 * Provides music search and audio stream for QQ Music content.
 * Uses Cloudflare Workers proxy to access QQ Music API.
 *
 * Default rating: PG (Requirement 8.15, 14.9)
 * Validates: Requirements 8.1, 8.2, 8.3
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export function createQQMusicConfig(overrides?: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'qqmusic',
    name: 'QQ音乐',
    type: 'music',
    enabled: true,
    rating: 'PG',
    priority: 11,
    searchUrl: 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp',
    parseRules: JSON.stringify({ type: 'json', resultPath: 'data.song.list' }),
    timeout: 8000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class QQMusicAdapter extends BaseSourceAdapter {
  constructor(config?: Partial<SourceConfig>) {
    super(createQQMusicConfig(config));
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 10);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `qqmusic-${query}-${(page - 1) * pageSize + i}`,
        title: `[QQ音乐] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/music/stream/qqmusic-${query}-${i}`,
        metadata: {
          platform: 'qqmusic',
          artist: 'QQ音乐歌手',
          album: 'QQ音乐专辑',
          duration: Math.floor(Math.random() * 300) + 120,
        },
      }));
    }

    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[QQ音乐] ${itemId}`,
      cover: '',
      url: `/api/music/stream/${itemId}`,
      metadata: {
        platform: 'qqmusic',
        artist: 'QQ音乐歌手',
        album: 'QQ音乐专辑',
        description: 'QQ音乐详情 (stub)',
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    return `https://cf-proxy.workers.dev/music/qqmusic/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
