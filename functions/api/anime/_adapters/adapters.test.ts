/**
 * Unit tests for anime source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * and the adapter registry functions.
 *
 * Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.7, 22.8, 22.9, 22.10
 */

import { describe, it, expect } from 'vitest';
import { GenericAnimeAdapter } from './generic-anime-adapter';
import {
  createAllAnimeAdapters,
  getAnimeAdapterById,
  getAllAnimeSourceIds,
} from './index';

// ── GenericAnimeAdapter ───────────────────────────────────────

describe('GenericAnimeAdapter', () => {
  const adapter = new GenericAnimeAdapter({
    id: 'test-anime',
    name: 'Test Anime',
    rating: 'PG-13',
    priority: 50,
    searchUrl: 'https://example.com/anime/search',
    platform: 'test',
  });

  it('creates adapter with provided config', () => {
    expect(adapter.config.id).toBe('test-anime');
    expect(adapter.config.name).toBe('Test Anime');
    expect(adapter.config.rating).toBe('PG-13');
    expect(adapter.config.type).toBe('anime');
  });

  it('uses 10s timeout for anime sources', () => {
    expect(adapter.config.timeout).toBe(10000);
  });

  it('search returns items with correct source info', async () => {
    const items = await adapter.search('query', 1, 4);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.source).toBe('Test Anime');
      expect(item.sourceId).toBe('test-anime');
      expect(item.rating).toBe('PG-13');
      expect(item.type).toBe('anime');
    }
  });

  it('search items contain anime metadata', async () => {
    const items = await adapter.search('naruto', 1, 2);
    for (const item of items) {
      expect(item.metadata.platform).toBe('test');
      expect(item.metadata.studio).toBeDefined();
      expect(item.metadata.status).toBeDefined();
      expect(item.metadata.episodes).toBeDefined();
      expect(item.metadata.year).toBeDefined();
      expect(item.metadata.region).toBeDefined();
      expect(item.metadata.tags).toBeDefined();
    }
  });

  it('search respects pageSize limit (max 8)', async () => {
    const items = await adapter.search('test', 1, 20);
    expect(items).toHaveLength(8);
  });

  it('getDetail returns item with episodes in metadata', async () => {
    const detail = await adapter.getDetail('test-anime-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-anime-item-0');
    expect(detail!.metadata.platform).toBe('test');
    expect(detail!.metadata.studio).toBeDefined();
    expect(Array.isArray(detail!.metadata.episodes)).toBe(true);
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-anime');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Anime Adapter Registry', () => {
  describe('createAllAnimeAdapters', () => {
    it('creates all 13 anime adapters', () => {
      const adapters = createAllAnimeAdapters();
      expect(adapters.length).toBe(13);
    });

    it('all adapters have type=anime', () => {
      const adapters = createAllAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('anime');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllAnimeAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes all expected anime sources', () => {
      const adapters = createAllAnimeAdapters();
      const ids = adapters.map((a) => a.config.id);
      const expected = [
        'yinghua', 'age', 'omofun', 'anime1', 'animepahe',
        'gogoanime', '9anime', 'animedao', 'zoroto', 'crunchyroll-free',
        'dmhy', 'bangumi-moe', 'simpleanime',
      ];
      for (const id of expected) {
        expect(ids).toContain(id);
      }
    });

    it('all anime sources default to PG-13 rating (Requirement 22.9)', () => {
      const adapters = createAllAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('PG-13');
      }
    });
  });

  describe('getAnimeAdapterById', () => {
    it('returns adapter for yinghua', () => {
      const adapter = getAnimeAdapterById('yinghua');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('yinghua');
      expect(adapter!.config.name).toBe('樱花动漫');
    });

    it('returns adapter for gogoanime', () => {
      const adapter = getAnimeAdapterById('gogoanime');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('gogoanime');
      expect(adapter!.config.name).toBe('GoGoAnime');
    });

    it('returns adapter for crunchyroll-free (hyphenated ID)', () => {
      const adapter = getAnimeAdapterById('crunchyroll-free');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('crunchyroll-free');
      expect(adapter!.config.name).toBe('Crunchyroll 免费区');
    });

    it('returns adapter for bangumi-moe (hyphenated ID)', () => {
      const adapter = getAnimeAdapterById('bangumi-moe');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('bangumi-moe');
      expect(adapter!.config.name).toBe('萌番组');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getAnimeAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns correct adapter for each registered source', () => {
      const allIds = getAllAnimeSourceIds();
      for (const id of allIds) {
        const adapter = getAnimeAdapterById(id);
        expect(adapter).not.toBeNull();
        expect(adapter!.config.id).toBe(id);
      }
    });
  });

  describe('getAllAnimeSourceIds', () => {
    it('returns 13 source IDs', () => {
      const ids = getAllAnimeSourceIds();
      expect(ids.length).toBe(13);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllAnimeSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});
