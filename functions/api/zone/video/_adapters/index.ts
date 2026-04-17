/**
 * Adult video source adapter registry.
 *
 * 16 adapters covering:
 *   - 本地NAS (local library via Cloudflare Tunnel)
 *   - 自拍上传 (user-uploaded content stored in R2)
 *   - Telegram频道/群组 (bot-fetched media)
 *   - 12 aggregated external sources (proxied through CF Workers)
 *
 * All sources forced NC-17. All traffic through Cloudflare Workers proxy.
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultVideoAdapter } from './generic-adult-video-adapter';
import type { GenericAdultVideoAdapterOptions } from './generic-adult-video-adapter';
import { NasVideoAdapter } from './nas-video-adapter';
import { UserUploadVideoAdapter } from './user-upload-video-adapter';
import { TelegramVideoAdapter } from './telegram-video-adapter';

export { GenericAdultVideoAdapter } from './generic-adult-video-adapter';

// ---------------------------------------------------------------------------
// Source definitions — real names, real proxy endpoints
// ---------------------------------------------------------------------------

/** Local NAS library — served via Cloudflare Tunnel, never direct */
const NAS_SOURCE = {
  id: 'adult-nas',
  name: '本地NAS',
  priority: 1,
};

/** User-uploaded self-shot content — stored in R2 */
const UPLOAD_SOURCE = {
  id: 'adult-upload',
  name: '自拍上传',
  priority: 2,
};

/** Telegram channels/groups — fetched via bot API */
const TELEGRAM_SOURCES = [
  { id: 'adult-tg-channel', name: 'Telegram频道', priority: 3, platform: 'telegram-channel' },
  { id: 'adult-tg-group', name: 'Telegram群组', priority: 4, platform: 'telegram-group' },
];

/** External aggregated sources — all proxied through CF Workers */
const AGGREGATED_SOURCES: GenericAdultVideoAdapterOptions[] = [
  { id: 'adult-pornhub', name: 'Pornhub', priority: 10, searchUrl: 'https://cf-proxy.workers.dev/adult/pornhub/search', platform: 'pornhub' },
  { id: 'adult-xvideos', name: 'XVideos', priority: 11, searchUrl: 'https://cf-proxy.workers.dev/adult/xvideos/search', platform: 'xvideos' },
  { id: 'adult-xnxx', name: 'XNXX', priority: 12, searchUrl: 'https://cf-proxy.workers.dev/adult/xnxx/search', platform: 'xnxx' },
  { id: 'adult-javbus', name: 'JavBus', priority: 13, searchUrl: 'https://cf-proxy.workers.dev/adult/javbus/search', platform: 'javbus' },
  { id: 'adult-missav', name: 'Missav', priority: 14, searchUrl: 'https://cf-proxy.workers.dev/adult/missav/search', platform: 'missav' },
  { id: 'adult-thisav', name: 'ThisAV', priority: 15, searchUrl: 'https://cf-proxy.workers.dev/adult/thisav/search', platform: 'thisav' },
  { id: 'adult-jable', name: 'Jable', priority: 16, searchUrl: 'https://cf-proxy.workers.dev/adult/jable/search', platform: 'jable' },
  { id: 'adult-avgle', name: 'Avgle', priority: 17, searchUrl: 'https://cf-proxy.workers.dev/adult/avgle/search', platform: 'avgle' },
  { id: 'adult-spankbang', name: 'SpankBang', priority: 18, searchUrl: 'https://cf-proxy.workers.dev/adult/spankbang/search', platform: 'spankbang' },
  { id: 'adult-hentaihaven', name: 'HentaiHaven', priority: 19, searchUrl: 'https://cf-proxy.workers.dev/adult/hentaihaven/search', platform: 'hentaihaven' },
  { id: 'adult-hanime', name: 'Hanime', priority: 20, searchUrl: 'https://cf-proxy.workers.dev/adult/hanime/search', platform: 'hanime' },
  { id: 'adult-r18', name: 'R18', priority: 21, searchUrl: 'https://cf-proxy.workers.dev/adult/r18/search', platform: 'r18' },
];

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createAllAdultVideoAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [];

  // Local NAS
  adapters.push(new NasVideoAdapter(NAS_SOURCE));

  // User uploads
  adapters.push(new UserUploadVideoAdapter(UPLOAD_SOURCE));

  // Telegram
  for (const tg of TELEGRAM_SOURCES) {
    adapters.push(new TelegramVideoAdapter(tg));
  }

  // External aggregated
  for (const opts of AGGREGATED_SOURCES) {
    adapters.push(new GenericAdultVideoAdapter(opts));
  }

  return adapters;
}

export function getAdultVideoAdapterById(sourceId: string): ISourceAdapter | null {
  if (sourceId === NAS_SOURCE.id) return new NasVideoAdapter(NAS_SOURCE);
  if (sourceId === UPLOAD_SOURCE.id) return new UserUploadVideoAdapter(UPLOAD_SOURCE);
  const tg = TELEGRAM_SOURCES.find(s => s.id === sourceId);
  if (tg) return new TelegramVideoAdapter(tg);
  const agg = AGGREGATED_SOURCES.find(s => s.id === sourceId);
  if (agg) return new GenericAdultVideoAdapter(agg);
  return null;
}

export function getAllAdultVideoSourceIds(): string[] {
  return [
    NAS_SOURCE.id,
    UPLOAD_SOURCE.id,
    ...TELEGRAM_SOURCES.map(s => s.id),
    ...AGGREGATED_SOURCES.map(s => s.id),
  ];
}
