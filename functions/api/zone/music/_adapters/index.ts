/**
 * Adult music/ASMR source adapter registry.
 *
 * 6 adapters covering:
 *   - 本地NAS (local ASMR/music library)
 *   - Telegram频道 (bot-fetched audio)
 *   - 4 aggregated external sources (DLsite, ASMR.one, Japaneseasmr, OnlyFans)
 *
 * All sources forced NC-17. All traffic through Cloudflare Workers proxy.
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultMusicAdapter } from './generic-adult-music-adapter';
import type { GenericAdultMusicAdapterOptions } from './generic-adult-music-adapter';

export { GenericAdultMusicAdapter } from './generic-adult-music-adapter';

const ADULT_MUSIC_SOURCES: GenericAdultMusicAdapterOptions[] = [
  // Local & user sources
  { id: 'adult-music-nas', name: '本地NAS', priority: 1, searchUrl: '', platform: 'nas' },
  { id: 'adult-music-telegram', name: 'Telegram频道', priority: 2, searchUrl: '', platform: 'telegram' },
  // External aggregated sources
  { id: 'adult-music-dlsite', name: 'DLsite', priority: 10, searchUrl: 'https://cf-proxy.workers.dev/adult-music/dlsite/search', platform: 'dlsite' },
  { id: 'adult-music-asmrone', name: 'ASMR.one', priority: 11, searchUrl: 'https://cf-proxy.workers.dev/adult-music/asmrone/search', platform: 'asmrone' },
  { id: 'adult-music-jasmr', name: 'Japaneseasmr', priority: 12, searchUrl: 'https://cf-proxy.workers.dev/adult-music/jasmr/search', platform: 'jasmr' },
  { id: 'adult-music-onlyfans', name: 'OnlyFans', priority: 13, searchUrl: 'https://cf-proxy.workers.dev/adult-music/onlyfans/search', platform: 'onlyfans' },
];

export function createAllAdultMusicAdapters(): ISourceAdapter[] {
  return ADULT_MUSIC_SOURCES.map((opts) => new GenericAdultMusicAdapter(opts));
}

export function getAdultMusicAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ADULT_MUSIC_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultMusicAdapter(opts);
  return null;
}

export function getAllAdultMusicSourceIds(): string[] {
  return ADULT_MUSIC_SOURCES.map((s) => s.id);
}
