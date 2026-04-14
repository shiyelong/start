/**
 * Generic video source adapter factory.
 *
 * Creates stub adapters for free video sources that share the same
 * ISourceAdapter interface. Each adapter defines its own config
 * (name, rating, priority, searchUrl) but shares the same stub
 * search/detail/stream logic.
 *
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 21.1
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export interface GenericVideoAdapterOptions {
  id: string;
  name: string;
  rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17';
  priority: number;
  searchUrl: string;
  /** Platform identifier used in metadata */
  platform: string;
}

export function createGenericVideoConfig(
  opts: GenericVideoAdapterOptions,
  overrides?: Partial<SourceConfig>,
): SourceConfig {
  return {
    id: opts.id,
    name: opts.name,
    type: 'video',
    enabled: true,
    rating: opts.rating,
    priority: opts.priority,
    searchUrl: opts.searchUrl,
    parseRules: JSON.stringify({ type: 'html', selector: '' }),
    timeout: 10000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class GenericVideoAdapter extends BaseSourceAdapter {
  private platform: string;

  constructor(opts: GenericVideoAdapterOptions, configOverrides?: Partial<SourceConfig>) {
    super(createGenericVideoConfig(opts, configOverrides));
    this.platform = opts.platform;
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub implementation — will be replaced with real scraping/API logic
    // All actual requests will go through Cloudflare Workers proxy
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 8);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `${this.config.id}-${query}-${(page - 1) * pageSize + i}`,
        title: `[${this.config.name}] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/video/stream/${this.config.id}-${query}-${i}`,
        metadata: {
          platform: this.platform,
          duration: Math.floor(Math.random() * 7200) + 60,
        },
      }));
    }

    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[${this.config.name}] ${itemId}`,
      cover: '',
      url: `/api/video/stream/${itemId}`,
      metadata: {
        platform: this.platform,
        description: `${this.config.name} video detail (stub)`,
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: Cloudflare Workers proxy URL
    return `https://cf-proxy.workers.dev/video/${this.config.id}/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
