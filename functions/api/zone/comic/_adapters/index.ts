/**
 * Adult comic source adapter registry.
 *
 * 11 adapters covering:
 *   - 本地NAS (local library via Cloudflare Tunnel)
 *   - 网友上传 (user-uploaded content stored in R2)
 *   - Telegram频道 (bot-fetched media)
 *   - 8 aggregated external sources (proxied through CF Workers)
 *
 * All sources forced NC-17. All traffic through Cloudflare Workers proxy.
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultComicAdapter } from './generic-adult-comic-adapter';
import type { GenericAdultComicAdapterOptions } from './generic-adult-comic-adapter';

export { GenericAdultComicAdapter } from './generic-adult-comic-adapter';

const ADULT_COMIC_SOURCES: GenericAdultComicAdapterOptions[] = [
  // Local & user sources
  { id: 'adult-comic-nas', name: '本地NAS', priority: 1, searchUrl: '', platform: 'nas' },
  { id: 'adult-comic-upload', name: '网友上传', priority: 2, searchUrl: '', platform: 'user-upload' },
  { id: 'adult-comic-telegram', name: 'Telegram频道', priority: 3, searchUrl: '', platform: 'telegram' },
  // External aggregated sources
  { id: 'adult-comic-nhentai', name: 'nhentai', priority: 10, searchUrl: 'https://cf-proxy.workers.dev/adult-comic/nhentai/search', platform: 'nhentai' },
  { id: 'adult-comic-ehentai', name: 'E-Hentai', priority: 11, searchUrl: 'https://cf-proxy.workers.dev/adult-comic/ehentai/search', platform: 'ehentai' },
  { id: 'adult-comic-hitomi', name: 'Hitomi', priority: 12, searchUrl: 'https://cf-proxy.workers.dev/adult-comic/hitomi/search', platform: 'hitomi' },
  { id: 'adult-comic-pixiv', name: 'Pixiv', priority: 13, searchUrl: 'https://cf-proxy.workers.dev/adult-comic/pixiv/search', platform: 'pixiv' },
  { id: 'adult-comic-jinman', name: '禁漫天堂', priority: 14, searchUrl: 'https://cf-proxy.workers.dev/adult-comic/jinman/search', platform: 'jinman' },
  { id: 'adult-comic-shenshi', name: '紳士漫畫', priority: 15, searchUrl: 'https://cf-proxy.workers.dev/adult-comic/shenshi/search', platform: 'shenshi' },
  { id: 'adult-comic-wnacg', name: 'Wnacg', priority: 16, searchUrl: 'https://cf-proxy.workers.dev/adult-comic/wnacg/search', platform: 'wnacg' },
  { id: 'adult-comic-tsumino', name: 'Tsumino', priority: 17, searchUrl: 'https://cf-proxy.workers.dev/adult-comic/tsumino/search', platform: 'tsumino' },
];

export function createAllAdultComicAdapters(): ISourceAdapter[] {
  return ADULT_COMIC_SOURCES.map((opts) => new GenericAdultComicAdapter(opts));
}

export function getAdultComicAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ADULT_COMIC_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultComicAdapter(opts);
  return null;
}

export function getAllAdultComicSourceIds(): string[] {
  return ADULT_COMIC_SOURCES.map((s) => s.id);
}
