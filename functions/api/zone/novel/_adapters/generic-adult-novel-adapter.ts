/**
 * Generic adult novel source adapter factory.
 *
 * Creates stub adapters for adult novel sources that share the same
 * ISourceAdapter interface. Each adapter defines its own config
 * (name, priority, searchUrl) but shares the same stub
 * search/detail/stream logic. Rating is ALWAYS forced to NC-17.
 *
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Validates: Requirements 30.1, 30.5, 30.7, 30.8, 30.9
 */

import { BaseSourceAdapter } from '../../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../../_lib/source-adapter';
import type { SourceHealth } from '../../../../../src/lib/types';

export interface GenericAdultNovelAdapterOptions {
  id: string;
  name: string;
  priority: number;
  searchUrl: string;
  /** Platform identifier used in metadata */
  platform: string;
}

export function createGenericAdultNovelConfig(
  opts: GenericAdultNovelAdapterOptions,
  overrides?: Partial<SourceConfig>,
): SourceConfig {
  // Destructure rating out of overrides so it can never override NC-17
  const { rating: _ignoredRating, ...safeOverrides } = overrides ?? {};

  return {
    id: opts.id,
    name: opts.name,
    type: 'novel',
    enabled: true,
    rating: 'NC-17',              // ALWAYS NC-17 — hardcoded, never overridable
    priority: opts.priority,
    searchUrl: opts.searchUrl,
    parseRules: JSON.stringify({ type: 'html', selector: '' }),
    timeout: 10000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...safeOverrides,
  };
}

export class GenericAdultNovelAdapter extends BaseSourceAdapter {
  private platform: string;

  constructor(opts: GenericAdultNovelAdapterOptions, configOverrides?: Partial<SourceConfig>) {
    super(createGenericAdultNovelConfig(opts, configOverrides));
    this.platform = opts.platform;
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub implementation — will be replaced with real scraping/API logic
    // All actual requests go through Cloudflare Workers proxy
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 8);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `${this.config.id}-${query}-${(page - 1) * pageSize + i}`,
        title: `[${this.config.name}] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/zone/novel/${this.config.id}-${query}-${i}`,
        metadata: {
          platform: this.platform,
          wordCount: Math.floor(Math.random() * 500000) + 10000,
          language: 'unknown',
          status: 'unknown',
        },
        tags: [],
      }));
    }

    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[${this.config.name}] ${itemId}`,
      cover: '',
      url: `/api/zone/novel/${itemId}`,
      metadata: {
        platform: this.platform,
        description: `${this.config.name} novel detail (stub)`,
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: Cloudflare Workers proxy URL — NAS IP never exposed
    return `https://cf-proxy.workers.dev/zone/novel/${this.config.id}/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
