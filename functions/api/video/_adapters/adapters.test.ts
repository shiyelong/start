/**
 * Unit tests for video source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * and the adapter registry functions.
 *
 * Validates: Requirements 2.1, 2.2, 2.5, 2.6, 3.1, 3.2, 3.6, 3.8,
 *            4.1, 4.2, 16.1, 16.2, 16.5, 16.6, 21.1
 */

import { describe, it, expect } from 'vitest';
import { BilibiliAdapter } from './bilibili';
import { YouTubeAdapter } from './youtube';
import { AcFunAdapter } from './acfun';
import { GenericVideoAdapter } from './generic-video-adapter';
import {
  createAllVideoAdapters,
  getVideoAdapterById,
  getAllVideoSourceIds,
} from './index';

// ── Bilibili Adapter ──────────────────────────────────────────

describe('BilibiliAdapter', () => {
  const adapter = new BilibiliAdapter();

  it('has correct default config', () => {
    expect(adapter.config.id).toBe('bilibili');
    expect(adapter.config.name).toBe('B站');
    expect(adapter.config.type).toBe('video');
    expect(adapter.config.rating).toBe('PG');
    expect(adapter.config.enabled).toBe(true);
  });

  it('search returns items with correct structure', async () => {
    const items = await adapter.search('test', 1, 5);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.source).toBe('B站');
      expect(item.sourceId).toBe('bilibili');
      expect(item.rating).toBe('PG');
      expect(item.type).toBe('video');
      expect(item.metadata.platform).toBe('bilibili');
      expect(item.url).toContain('/api/video/stream/');
    }
  });

  it('search respects pageSize limit', async () => {
    const items = await adapter.search('test', 1, 3);
    expect(items).toHaveLength(3);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('bili-test-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('bili-test-0');
    expect(detail!.metadata.platform).toBe('bilibili');
  });

  it('getStreamUrl returns bilibili embed URL', async () => {
    const url = await adapter.getStreamUrl('BV1xx0');
    expect(url).toContain('player.bilibili.com');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── YouTube Adapter ───────────────────────────────────────────

describe('YouTubeAdapter', () => {
  const adapter = new YouTubeAdapter();

  it('has correct default config', () => {
    expect(adapter.config.id).toBe('youtube');
    expect(adapter.config.name).toBe('YouTube');
    expect(adapter.config.rating).toBe('PG');
  });

  it('search returns items proxied through CF Workers', async () => {
    const items = await adapter.search('music', 1, 5);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.source).toBe('YouTube');
      expect(item.sourceId).toBe('youtube');
      expect(item.metadata.platform).toBe('youtube');
    }
  });

  it('getStreamUrl returns CF Workers proxy URL', async () => {
    const url = await adapter.getStreamUrl('yt-abc-0');
    expect(url).toContain('cf-yt-proxy.workers.dev');
  });
});

// ── AcFun Adapter ─────────────────────────────────────────────

describe('AcFunAdapter', () => {
  const adapter = new AcFunAdapter();

  it('has correct default config with G rating', () => {
    expect(adapter.config.id).toBe('acfun');
    expect(adapter.config.name).toBe('A站');
    expect(adapter.config.rating).toBe('G');
  });

  it('search returns items', async () => {
    const items = await adapter.search('anime', 1, 5);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.rating).toBe('G');
      expect(item.sourceId).toBe('acfun');
    }
  });
});

// ── GenericVideoAdapter ───────────────────────────────────────

describe('GenericVideoAdapter', () => {
  const adapter = new GenericVideoAdapter({
    id: 'test-source',
    name: 'Test Source',
    rating: 'PG-13',
    priority: 50,
    searchUrl: 'https://example.com/search',
    platform: 'test',
  });

  it('creates adapter with provided config', () => {
    expect(adapter.config.id).toBe('test-source');
    expect(adapter.config.name).toBe('Test Source');
    expect(adapter.config.rating).toBe('PG-13');
    expect(adapter.config.type).toBe('video');
  });

  it('search returns items with correct source info', async () => {
    const items = await adapter.search('query', 1, 4);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.source).toBe('Test Source');
      expect(item.sourceId).toBe('test-source');
      expect(item.rating).toBe('PG-13');
    }
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-source');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Adapter Registry', () => {
  describe('createAllVideoAdapters', () => {
    it('creates all 20 video adapters', () => {
      const adapters = createAllVideoAdapters();
      expect(adapters.length).toBe(20);
    });

    it('all adapters have type=video', () => {
      const adapters = createAllVideoAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('video');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllVideoAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllVideoAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes bilibili, youtube, and acfun', () => {
      const adapters = createAllVideoAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(ids).toContain('bilibili');
      expect(ids).toContain('youtube');
      expect(ids).toContain('acfun');
    });

    it('includes all free video sources', () => {
      const adapters = createAllVideoAdapters();
      const ids = adapters.map((a) => a.config.id);
      const expectedFree = [
        'ddrk', 'cupfox', 'dytt', 'twitch-vod', 'dailymotion', 'vimeo',
        'douyin', 'kuaishou', 'xigua', 'niconico', 'rumble', 'peertube',
        'odysee', 'sohu', 'haokan', 'hanjutv', 'rrvideo',
      ];
      for (const id of expectedFree) {
        expect(ids).toContain(id);
      }
    });
  });

  describe('getVideoAdapterById', () => {
    it('returns BilibiliAdapter for bilibili', () => {
      const adapter = getVideoAdapterById('bilibili');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('bilibili');
      expect(adapter!.config.name).toBe('B站');
    });

    it('returns YouTubeAdapter for youtube', () => {
      const adapter = getVideoAdapterById('youtube');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('youtube');
    });

    it('returns AcFunAdapter for acfun', () => {
      const adapter = getVideoAdapterById('acfun');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.rating).toBe('G');
    });

    it('returns GenericVideoAdapter for free sources', () => {
      const adapter = getVideoAdapterById('ddrk');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.name).toBe('低端影视');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getVideoAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });
  });

  describe('getAllVideoSourceIds', () => {
    it('returns 20 source IDs', () => {
      const ids = getAllVideoSourceIds();
      expect(ids.length).toBe(20);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllVideoSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});
