/**
 * User-uploaded video adapter.
 *
 * Videos uploaded by users (self-shot, personal recordings) are stored
 * in Cloudflare R2. Metadata stored in D1 `user_uploads` table.
 *
 * Upload flow: User → CF Pages → R2 (with virus scan middleware).
 * Playback: User → CF CDN → R2 (direct, no NAS involved).
 */

import { BaseSourceAdapter } from '../../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../../_lib/source-adapter';
import type { SourceHealth } from '../../../../../src/lib/types';

interface UploadVideoOpts {
  id: string;
  name: string;
  priority: number;
}

export class UserUploadVideoAdapter extends BaseSourceAdapter {
  constructor(opts: UploadVideoOpts) {
    const config: SourceConfig = {
      id: opts.id,
      name: opts.name,
      type: 'video',
      enabled: true,
      rating: 'NC-17',
      priority: opts.priority,
      searchUrl: '',
      parseRules: '{}',
      timeout: 5000,
      health: 'online',
      avgResponseTime: 30,
      successRate: 100,
      failCount: 0,
      lastChecked: new Date().toISOString(),
    };
    super(config);
  }

  /**
   * Search user-uploaded videos from D1 `user_uploads` table.
   */
  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // TODO: D1 query
    // SELECT * FROM user_uploads
    // WHERE type = 'video' AND rating = 'NC-17'
    //   AND (title LIKE ?1 OR tags LIKE ?1)
    // ORDER BY uploaded_at DESC LIMIT ?2 OFFSET ?3

    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 4);
    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `upload-v-${query}-${(page - 1) * pageSize + i}`,
        title: `[自拍] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/zone/video/stream/upload/${query}-${i}`,
        metadata: {
          platform: 'user-upload',
          storage: 'r2',
          uploader: 'anonymous',
        },
        tags: [],
      }));
    }
    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[自拍] ${itemId}`,
      cover: '',
      url: `/api/zone/video/stream/upload/${itemId}`,
      metadata: { platform: 'user-upload', storage: 'r2' },
    });
  }

  /**
   * Stream from R2 via CF CDN.
   */
  async getStreamUrl(itemId: string): Promise<string> {
    // R2 public bucket URL (configured in wrangler.toml)
    return `https://cf-proxy.workers.dev/r2/uploads/video/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
