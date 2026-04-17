/**
 * Telegram video adapter.
 *
 * Fetches video content from Telegram channels/groups via Bot API.
 * Media files are cached in R2 after first fetch.
 * Metadata stored in D1 `telegram_media` table.
 *
 * Flow: Bot receives webhook → stores metadata in D1 → caches media in R2.
 * Playback: User → CF CDN → R2 cached copy (never direct Telegram link).
 */

import { BaseSourceAdapter } from '../../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../../_lib/source-adapter';
import type { SourceHealth } from '../../../../../src/lib/types';

interface TelegramVideoOpts {
  id: string;
  name: string;
  priority: number;
  platform: string;
}

export class TelegramVideoAdapter extends BaseSourceAdapter {
  private platform: string;

  constructor(opts: TelegramVideoOpts) {
    const config: SourceConfig = {
      id: opts.id,
      name: opts.name,
      type: 'video',
      enabled: true,
      rating: 'NC-17',
      priority: opts.priority,
      searchUrl: '',
      parseRules: '{}',
      timeout: 8000,
      health: 'online',
      avgResponseTime: 200,
      successRate: 95,
      failCount: 0,
      lastChecked: new Date().toISOString(),
    };
    super(config);
    this.platform = opts.platform;
  }

  /**
   * Search Telegram-sourced videos from D1 `telegram_media` table.
   */
  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // TODO: D1 query
    // SELECT * FROM telegram_media
    // WHERE media_type = 'video' AND rating = 'NC-17'
    //   AND source_type = ?4
    //   AND (caption LIKE ?1 OR channel_name LIKE ?1)
    // ORDER BY message_date DESC LIMIT ?2 OFFSET ?3

    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 6);
    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `tg-v-${this.platform}-${query}-${(page - 1) * pageSize + i}`,
        title: `[${this.config.name}] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/zone/video/stream/telegram/${this.platform}/${query}-${i}`,
        metadata: {
          platform: this.platform,
          storage: 'r2-cache',
          channelName: `@example_${this.platform}`,
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
      url: `/api/zone/video/stream/telegram/${itemId}`,
      metadata: { platform: this.platform },
    });
  }

  /**
   * Stream from R2 cache (media is pre-cached when bot receives it).
   */
  async getStreamUrl(itemId: string): Promise<string> {
    return `https://cf-proxy.workers.dev/r2/telegram/video/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    // TODO: Check bot API connectivity
    return 'online';
  }
}
