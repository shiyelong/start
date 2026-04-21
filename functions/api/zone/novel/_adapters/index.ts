/**
 * Adult novel source adapter registry.
 *
 * 7 adapters covering:
 *   - 本地NAS (local library)
 *   - 网友上传 (user-uploaded)
 *   - Telegram频道 (bot-fetched)
 *   - 4 aggregated external sources (69书吧, 笔趣阁, DLsite, VNDB)
 *
 * All sources forced NC-17. All traffic through Cloudflare Workers proxy.
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultNovelAdapter } from './generic-adult-novel-adapter';
import type { GenericAdultNovelAdapterOptions } from './generic-adult-novel-adapter';
import { NasNovelAdapter } from './nas-novel-adapter';

export { GenericAdultNovelAdapter } from './generic-adult-novel-adapter';

const ADULT_NOVEL_SOURCES: GenericAdultNovelAdapterOptions[] = [
  // Local & user sources (NAS uses dedicated adapter)
  { id: 'adult-novel-upload', name: '网友上传', priority: 2, searchUrl: '', platform: 'user-upload' },
  { id: 'adult-novel-telegram', name: 'Telegram频道', priority: 3, searchUrl: '', platform: 'telegram' },
  // External aggregated sources
  { id: 'adult-novel-69shu', name: '69书吧', priority: 10, searchUrl: 'https://cf-proxy.workers.dev/adult-novel/69shu/search', platform: '69shu' },
  { id: 'adult-novel-biquge', name: '笔趣阁', priority: 11, searchUrl: 'https://cf-proxy.workers.dev/adult-novel/biquge/search', platform: 'biquge' },
  { id: 'adult-novel-dlsite', name: 'DLsite', priority: 12, searchUrl: 'https://cf-proxy.workers.dev/adult-novel/dlsite/search', platform: 'dlsite' },
  { id: 'adult-novel-vndb', name: 'VNDB', priority: 13, searchUrl: 'https://cf-proxy.workers.dev/adult-novel/vndb/search', platform: 'vndb' },
];

/** NAS source — dedicated adapter with tunnel streaming */
const NAS_NOVEL_SOURCE = { id: 'adult-novel-nas', name: '本地NAS', priority: 1 };

export function createAllAdultNovelAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [];

  // NAS — dedicated adapter
  adapters.push(new NasNovelAdapter(NAS_NOVEL_SOURCE));

  // Generic adapters
  for (const opts of ADULT_NOVEL_SOURCES) {
    adapters.push(new GenericAdultNovelAdapter(opts));
  }

  return adapters;
}

export function getAdultNovelAdapterById(sourceId: string): ISourceAdapter | null {
  if (sourceId === NAS_NOVEL_SOURCE.id) return new NasNovelAdapter(NAS_NOVEL_SOURCE);
  const opts = ADULT_NOVEL_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultNovelAdapter(opts);
  return null;
}

export function getAllAdultNovelSourceIds(): string[] {
  return ADULT_NOVEL_SOURCES.map((s) => s.id);
}
