/**
 * Unit tests for podcast source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * and the adapter registry functions.
 *
 * Validates: Requirements 24.1, 24.2, 24.3, 24.5, 24.9
 */

import { describe, it, expect } from 'vitest';
import { GenericPodcastAdapter } from './generic-podcast-adapter';
import {
  createAllPodcastAdapters,
  getPodcastAdapterById,
  getAllPodcastSourceIds,
} from './index';

// ── GenericPodcastAdapter ─────────────────────────────────────

describe('GenericPodcastAdapter', () => {
  const adapter = new GenericPodcastAdapter({
    id: 'test-podcast',
    name: 'Test Podcast',
    rating: 'PG',
    priority: 50,
    searchUrl: 'https://example.com/podcast/search',
    platform: 'test',
  });

  it('creates adapter with provided config', () => {
    expect(adapter.config.id).toBe('test-podcast');
    expect(adapter.config.name).toBe('Test Podcast');
    expect(adapter.config.rating).toBe('PG');
    expect(adapter.config.type).toBe('podcast');
  });

  it('uses 10s timeout for podcast sources', () => {
    expect(adapter.config.timeout).toBe(10000);
  });

  it('search returns items with correct source info', async () => {
    const items = await adapter.search('query', 1, 4);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.source).toBe('Test Podcast');
      expect(item.sourceId).toBe('test-podcast');
      expect(item.rating).toBe('PG');
      expect(item.type).toBe('podcast');
    }
  });

  it('search items contain podcast metadata', async () => {
    const items = await adapter.search('tech', 1, 2);
    for (const item of items) {
      expect(item.metadata.platform).toBe('test');
      expect(item.metadata.host).toBeDefined();
      expect(item.metadata.description).toBeDefined();
      expect(item.metadata.category).toBeDefined();
      expect(item.metadata.episodeCount).toBeDefined();
      expect(item.metadata.subscribers).toBeDefined();
    }
  });

  it('search respects pageSize limit (max 8)', async () => {
    const items = await adapter.search('test', 1, 20);
    expect(items).toHaveLength(8);
  });

  it('getDetail returns item with episodes in metadata', async () => {
    const detail = await adapter.getDetail('test-podcast-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-podcast-item-0');
    expect(detail!.metadata.platform).toBe('test');
    expect(detail!.metadata.host).toBeDefined();
    expect(Array.isArray(detail!.metadata.episodes)).toBe(true);
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-podcast');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Podcast Adapter Registry', () => {
  describe('createAllPodcastAdapters', () => {
    it('creates all 11 podcast adapters', () => {
      const adapters = createAllPodcastAdapters();
      expect(adapters.length).toBe(11);
    });

    it('all adapters have type=podcast', () => {
      const adapters = createAllPodcastAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('podcast');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllPodcastAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllPodcastAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes all expected podcast sources', () => {
      const adapters = createAllPodcastAdapters();
      const ids = adapters.map((a) => a.config.id);
      const expected = [
        'apple-podcasts', 'spotify-podcasts', 'xiaoyuzhou', 'ximalaya',
        'qingting', 'lizhi', 'google-podcasts', 'pocket-casts',
        'overcast', 'castbox', 'podcast-addict',
      ];
      for (const id of expected) {
        expect(ids).toContain(id);
      }
    });

    it('all podcast sources default to PG rating (Requirement 24.9)', () => {
      const adapters = createAllPodcastAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('PG');
      }
    });
  });

  describe('getPodcastAdapterById', () => {
    it('returns adapter for apple-podcasts', () => {
      const adapter = getPodcastAdapterById('apple-podcasts');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('apple-podcasts');
      expect(adapter!.config.name).toBe('Apple Podcasts');
    });

    it('returns adapter for xiaoyuzhou', () => {
      const adapter = getPodcastAdapterById('xiaoyuzhou');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('xiaoyuzhou');
      expect(adapter!.config.name).toBe('小宇宙');
    });

    it('returns adapter for spotify-podcasts (hyphenated ID)', () => {
      const adapter = getPodcastAdapterById('spotify-podcasts');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('spotify-podcasts');
      expect(adapter!.config.name).toBe('Spotify Podcasts');
    });

    it('returns adapter for podcast-addict (hyphenated ID)', () => {
      const adapter = getPodcastAdapterById('podcast-addict');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('podcast-addict');
      expect(adapter!.config.name).toBe('Podcast Addict');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getPodcastAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns correct adapter for each registered source', () => {
      const allIds = getAllPodcastSourceIds();
      for (const id of allIds) {
        const adapter = getPodcastAdapterById(id);
        expect(adapter).not.toBeNull();
        expect(adapter!.config.id).toBe(id);
      }
    });
  });

  describe('getAllPodcastSourceIds', () => {
    it('returns 11 source IDs', () => {
      const ids = getAllPodcastSourceIds();
      expect(ids.length).toBe(11);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllPodcastSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});
