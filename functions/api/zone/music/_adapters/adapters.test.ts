/**
 * Unit tests for adult music source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * NC-17 rating enforcement, and the adapter registry functions.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.5, 17.9
 */

import { describe, it, expect } from 'vitest';
import { GenericAdultMusicAdapter } from './generic-adult-music-adapter';
import {
  createAllAdultMusicAdapters,
  getAdultMusicAdapterById,
  getAllAdultMusicSourceIds,
} from './index';

// ── GenericAdultMusicAdapter ──────────────────────────────────

describe('GenericAdultMusicAdapter', () => {
  const adapter = new GenericAdultMusicAdapter({
    id: 'test-adult-music-src',
    name: 'Test Adult Music Source',
    priority: 50,
    searchUrl: 'https://cf-proxy.workers.dev/adult-music/test/search',
    platform: 'test-adult-music',
  });

  it('creates adapter with NC-17 rating forced', () => {
    expect(adapter.config.id).toBe('test-adult-music-src');
    expect(adapter.config.name).toBe('Test Adult Music Source');
    expect(adapter.config.rating).toBe('NC-17');
    expect(adapter.config.type).toBe('music');
    expect(adapter.config.enabled).toBe(true);
  });

  it('forces NC-17 even when config overrides try to change rating', () => {
    const overridden = new GenericAdultMusicAdapter(
      {
        id: 'override-test',
        name: 'Override Test',
        priority: 50,
        searchUrl: 'https://example.com',
        platform: 'test',
      },
      { rating: 'PG' as any },
    );
    expect(overridden.config.rating).toBe('NC-17');
  });

  it('search returns items with correct structure', async () => {
    const items = await adapter.search('test', 1, 5);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.source).toBe('Test Adult Music Source');
      expect(item.sourceId).toBe('test-adult-music-src');
      expect(item.rating).toBe('NC-17');
      expect(item.type).toBe('music');
      expect(item.metadata.platform).toBe('test-adult-music');
      expect(item.url).toContain('/api/zone/music/stream/');
    }
  });

  it('search respects pageSize limit', async () => {
    const items = await adapter.search('test', 1, 3);
    expect(items).toHaveLength(3);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('test-adult-music-src-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-adult-music-src-item-0');
    expect(detail!.rating).toBe('NC-17');
    expect(detail!.metadata.platform).toBe('test-adult-music');
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-adult-music-src');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Adult Music Adapter Registry', () => {
  describe('createAllAdultMusicAdapters', () => {
    it('creates all 6 adult music adapters', () => {
      const adapters = createAllAdultMusicAdapters();
      expect(adapters.length).toBe(6);
    });

    it('all adapters have type=music', () => {
      const adapters = createAllAdultMusicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('music');
      }
    });

    it('all adapters have rating=NC-17', () => {
      const adapters = createAllAdultMusicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('NC-17');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllAdultMusicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllAdultMusicAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all adapter IDs follow adult-music-src-N pattern', () => {
      const adapters = createAllAdultMusicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.id).toMatch(/^adult-music-src-\d+$/);
      }
    });

    it('all adapter names follow Source-X pattern', () => {
      const adapters = createAllAdultMusicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.name).toMatch(/^Source-[A-F]$/);
      }
    });

    it('all adapter searchUrls go through CF proxy', () => {
      const adapters = createAllAdultMusicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.searchUrl).toContain('cf-proxy.workers.dev');
      }
    });
  });

  describe('getAdultMusicAdapterById', () => {
    it('returns adapter for adult-music-src-1', () => {
      const adapter = getAdultMusicAdapterById('adult-music-src-1');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-music-src-1');
      expect(adapter!.config.name).toBe('Source-A');
      expect(adapter!.config.rating).toBe('NC-17');
    });

    it('returns adapter for adult-music-src-6', () => {
      const adapter = getAdultMusicAdapterById('adult-music-src-6');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-music-src-6');
      expect(adapter!.config.name).toBe('Source-F');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getAdultMusicAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns null for regular music source IDs', () => {
      const adapter = getAdultMusicAdapterById('netease');
      expect(adapter).toBeNull();
    });
  });

  describe('getAllAdultMusicSourceIds', () => {
    it('returns 6 source IDs', () => {
      const ids = getAllAdultMusicSourceIds();
      expect(ids.length).toBe(6);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllAdultMusicSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('IDs range from adult-music-src-1 to adult-music-src-6', () => {
      const ids = getAllAdultMusicSourceIds();
      for (let i = 1; i <= 6; i++) {
        expect(ids).toContain(`adult-music-src-${i}`);
      }
    });
  });
});
