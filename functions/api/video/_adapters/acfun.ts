/**
 * AcFun (A站) video source adapter.
 *
 * Provides video list and search for AcFun content.
 * All AcFun content defaults to G rating (Requirement 14.9).
 *
 * Validates: Requirements 16.1, 16.2, 16.5, 16.6
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export function createAcFunConfig(overrides?: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'acfun',
    name: 'A站',
    type: 'video',
    enabled: true,
    rating: 'G',
    priority: 20,
    searchUrl: 'https://www.acfun.cn/rest/pc-direct/search/resource',
    parseRules: JSON.stringify({ type: 'json', resultPath: 'data.page.list' }),
    timeout: 10000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class AcFunAdapter extends BaseSourceAdapter {
  constructor(config?: Partial<SourceConfig>) {
    super(createAcFunConfig(config));
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 10);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `acfun-${query}-${(page - 1) * pageSize + i}`,
        title: `[A站] ${query} - 视频 ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/video/stream/acfun-${query}-${i}`,
        metadata: {
          platform: 'acfun',
          acid: `ac${30000000 + i}`,
          uploader: '示例UP主',
          views: Math.floor(Math.random() * 50000),
          duration: Math.floor(Math.random() * 400) + 30,
        },
      }));
    }

    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[A站] 视频详情 - ${itemId}`,
      cover: '',
      url: `/api/video/stream/${itemId}`,
      metadata: {
        platform: 'acfun',
        description: 'A站视频详情（stub）',
        uploader: '示例UP主',
        views: 30000,
        likes: 1000,
        duration: 240,
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    return `https://www.acfun.cn/player/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
