/**
 * Unit tests for music source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * and the adapter registry functions.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.11, 8.13, 8.14, 8.15
 */

import { describe, it, expect } from 'vitest';
import { NeteaseAdapter } from './netease';
import { QQMusicAdapter } from './qqmusic';
import { GenericMusicAdapter } from './generic-music-adapter';
import {
  createAllMusicAdapters,
  getMusicAdapterById,
  getAllMusicSourceIds,
} from './index';

// ── NetEase Adapter ───────────────────────────────────────────

describe('NeteaseAdapter', () => {
  const adapter = new NeteaseAdapter();

  it('has correct default config', () => {
    expect(adapter.config.id).toBe('netease');
    expect(adapter.config.name).toBe('网易云音乐');
    expect(adapter.config.type).toBe('music');
    expect(adapter.config.rating).toBe('PG');
    expect(adapter.config.enabled).toBe(true);
  });

  it('search returns items with correct structure', async () => {
    const items = await adapter.search('test', 1, 5);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.source).toBe('网易云音乐');
      expect(item.sourceId).toBe('netease');
      expect(item.rating).toBe('PG');
      expect(item.type).toBe('music');
      expect(item.metadata.platform).toBe('netease');
      expect(item.url).toContain('/api/music/stream/');
    }
  });

  it('search respects pageSize limit', async () => {
    const items = await adapter.search('test', 1, 3);
    expect(items).toHaveLength(3);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('netease-test-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('netease-test-0');
    expect(detail!.metadata.platform).toBe('netease');
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('netease-song-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('netease');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── QQ Music Adapter ──────────────────────────────────────────

describe('QQMusicAdapter', () => {
  const adapter = new QQMusicAdapter();

  it('has correct default config', () => {
    expect(adapter.config.id).toBe('qqmusic');
    expect(adapter.config.name).toBe('QQ音乐');
    expect(adapter.config.type).toBe('music');
    expect(adapter.config.rating).toBe('PG');
  });

  it('search returns items with correct source info', async () => {
    const items = await adapter.search('music', 1, 5);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.source).toBe('QQ音乐');
      expect(item.sourceId).toBe('qqmusic');
      expect(item.metadata.platform).toBe('qqmusic');
    }
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('qqmusic-abc-0');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('qqmusic');
  });
});

// ── GenericMusicAdapter ───────────────────────────────────────

describe('GenericMusicAdapter', () => {
  const adapter = new GenericMusicAdapter({
    id: 'test-music',
    name: 'Test Music',
    rating: 'G',
    priority: 50,
    searchUrl: 'https://example.com/music/search',
    platform: 'test',
  });

  it('creates adapter with provided config', () => {
    expect(adapter.config.id).toBe('test-music');
    expect(adapter.config.name).toBe('Test Music');
    expect(adapter.config.rating).toBe('G');
    expect(adapter.config.type).toBe('music');
  });

  it('uses 8s timeout for music sources', () => {
    expect(adapter.config.timeout).toBe(8000);
  });

  it('search returns items with correct source info', async () => {
    const items = await adapter.search('query', 1, 4);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.source).toBe('Test Music');
      expect(item.sourceId).toBe('test-music');
      expect(item.rating).toBe('G');
      expect(item.type).toBe('music');
    }
  });

  it('search items contain music metadata', async () => {
    const items = await adapter.search('song', 1, 2);
    for (const item of items) {
      expect(item.metadata.platform).toBe('test');
      expect(item.metadata.artist).toBeDefined();
      expect(item.metadata.album).toBeDefined();
      expect(item.metadata.duration).toBeDefined();
    }
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-music');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Music Adapter Registry', () => {
  describe('createAllMusicAdapters', () => {
    it('creates all 11 music adapters', () => {
      const adapters = createAllMusicAdapters();
      expect(adapters.length).toBe(11);
    });

    it('all adapters have type=music', () => {
      const adapters = createAllMusicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('music');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllMusicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllMusicAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes netease and qqmusic named adapters', () => {
      const adapters = createAllMusicAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(ids).toContain('netease');
      expect(ids).toContain('qqmusic');
    });

    it('includes all generic music sources', () => {
      const adapters = createAllMusicAdapters();
      const ids = adapters.map((a) => a.config.id);
      const expectedGeneric = [
        'kugou', 'kuwo', 'migu', 'spotify', 'soundcloud',
        'bandcamp', 'jamendo', 'fma', 'ytmusic',
      ];
      for (const id of expectedGeneric) {
        expect(ids).toContain(id);
      }
    });

    it('Jamendo and FMA have G rating (free/CC music)', () => {
      const adapters = createAllMusicAdapters();
      const jamendo = adapters.find((a) => a.config.id === 'jamendo');
      const fma = adapters.find((a) => a.config.id === 'fma');
      expect(jamendo!.config.rating).toBe('G');
      expect(fma!.config.rating).toBe('G');
    });

    it('Chinese music sources have PG rating', () => {
      const adapters = createAllMusicAdapters();
      const chineseSources = ['netease', 'qqmusic', 'kugou', 'kuwo', 'migu'];
      for (const id of chineseSources) {
        const adapter = adapters.find((a) => a.config.id === id);
        expect(adapter!.config.rating).toBe('PG');
      }
    });
  });

  describe('getMusicAdapterById', () => {
    it('returns NeteaseAdapter for netease', () => {
      const adapter = getMusicAdapterById('netease');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('netease');
      expect(adapter!.config.name).toBe('网易云音乐');
    });

    it('returns QQMusicAdapter for qqmusic', () => {
      const adapter = getMusicAdapterById('qqmusic');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('qqmusic');
      expect(adapter!.config.name).toBe('QQ音乐');
    });

    it('returns GenericMusicAdapter for generic sources', () => {
      const adapter = getMusicAdapterById('spotify');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.name).toBe('Spotify');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getMusicAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns correct adapter for each registered source', () => {
      const allIds = getAllMusicSourceIds();
      for (const id of allIds) {
        const adapter = getMusicAdapterById(id);
        expect(adapter).not.toBeNull();
        expect(adapter!.config.id).toBe(id);
      }
    });
  });

  describe('getAllMusicSourceIds', () => {
    it('returns 11 source IDs', () => {
      const ids = getAllMusicSourceIds();
      expect(ids.length).toBe(11);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllMusicSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});
