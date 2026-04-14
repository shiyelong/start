/**
 * Unit tests for live source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * and the adapter registry functions.
 *
 * Validates: Requirements 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.8, 25.9
 */

import { describe, it, expect } from 'vitest';
import { GenericLiveAdapter } from './generic-live-adapter';
import {
  createAllLiveAdapters,
  getLiveAdapterById,
  getAllLiveSourceIds,
} from './index';

// ── GenericLiveAdapter ────────────────────────────────────────

describe('GenericLiveAdapter', () => {
  const adapter = new GenericLiveAdapter({
    id: 'test-live',
    name: 'Test Live',
    rating: 'PG-13',
    priority: 50,
    searchUrl: 'https://example.com/live/search',
    platform: 'test',
  });

  it('creates adapter with provided config', () => {
    expect(adapter.config.id).toBe('test-live');
    expect(adapter.config.name).toBe('Test Live');
    expect(adapter.config.rating).toBe('PG-13');
    expect(adapter.config.type).toBe('live');
  });

  it('uses 10s timeout for live sources', () => {
    expect(adapter.config.timeout).toBe(10000);
  });

  it('search returns items with correct source info', async () => {
    const items = await adapter.search('query', 1, 4);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.source).toBe('Test Live');
      expect(item.sourceId).toBe('test-live');
      expect(item.rating).toBe('PG-13');
      expect(item.type).toBe('live');
    }
  });

  it('search items contain live metadata', async () => {
    const items = await adapter.search('gaming', 1, 2);
    for (const item of items) {
      expect(item.metadata.platform).toBe('test');
      expect(item.metadata.streamerName).toBeDefined();
      expect(item.metadata.viewerCount).toBeDefined();
      expect(item.metadata.category).toBeDefined();
      expect(item.metadata.isLive).toBe(true);
    }
  });

  it('search respects pageSize limit (max 8)', async () => {
    const items = await adapter.search('test', 1, 20);
    expect(items).toHaveLength(8);
  });

  it('getDetail returns item with live metadata', async () => {
    const detail = await adapter.getDetail('test-live-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-live-item-0');
    expect(detail!.metadata.platform).toBe('test');
    expect(detail!.metadata.streamerName).toBeDefined();
    expect(detail!.metadata.isLive).toBe(true);
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-live');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Live Adapter Registry', () => {
  describe('createAllLiveAdapters', () => {
    it('creates all 14 live adapters', () => {
      const adapters = createAllLiveAdapters();
      expect(adapters.length).toBe(14);
    });

    it('all adapters have type=live', () => {
      const adapters = createAllLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('live');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllLiveAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes all expected live sources', () => {
      const adapters = createAllLiveAdapters();
      const ids = adapters.map((a) => a.config.id);
      const expected = [
        'douyu', 'huya', 'bilibili-live', 'twitch', 'youtube-live',
        'douyin-live', 'kuaishou-live', 'huajiao', 'inke', 'egame',
        'cc-live', 'afreecatv', 'kick', 'facebook-gaming',
      ];
      for (const id of expected) {
        expect(ids).toContain(id);
      }
    });

    it('all live sources default to PG-13 rating (Requirement 25.8)', () => {
      const adapters = createAllLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('PG-13');
      }
    });
  });

  describe('getLiveAdapterById', () => {
    it('returns adapter for douyu', () => {
      const adapter = getLiveAdapterById('douyu');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('douyu');
      expect(adapter!.config.name).toBe('斗鱼');
    });

    it('returns adapter for twitch', () => {
      const adapter = getLiveAdapterById('twitch');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('twitch');
      expect(adapter!.config.name).toBe('Twitch');
    });

    it('returns adapter for bilibili-live (hyphenated ID)', () => {
      const adapter = getLiveAdapterById('bilibili-live');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('bilibili-live');
      expect(adapter!.config.name).toBe('B站直播');
    });

    it('returns adapter for facebook-gaming (hyphenated ID)', () => {
      const adapter = getLiveAdapterById('facebook-gaming');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('facebook-gaming');
      expect(adapter!.config.name).toBe('Facebook Gaming');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getLiveAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns correct adapter for each registered source', () => {
      const allIds = getAllLiveSourceIds();
      for (const id of allIds) {
        const adapter = getLiveAdapterById(id);
        expect(adapter).not.toBeNull();
        expect(adapter!.config.id).toBe(id);
      }
    });
  });

  describe('getAllLiveSourceIds', () => {
    it('returns 14 source IDs', () => {
      const ids = getAllLiveSourceIds();
      expect(ids.length).toBe(14);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllLiveSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});
