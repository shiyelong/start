/**
 * Unit tests for SaveSystem — game save/load with IndexedDB + cloud sync
 *
 * Uses fake-indexeddb to simulate IndexedDB in Node environment.
 * Requirements: 6.10
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SaveSystem, SaveSlot, computeChecksum, serialize, deserialize } from './save-system';

// ─── Mock fetchAPI ───────────────────────────────────────

vi.mock('../api-client', () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from '../api-client';
const mockFetchAPI = vi.mocked(fetchAPI);

// ─── Helpers ─────────────────────────────────────────────

/** Clear all IndexedDB databases between tests */
function clearIndexedDB() {
  // fake-indexeddb/auto replaces the global indexedDB; deleting the DB resets state
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('starhub-game-saves');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Tests ───────────────────────────────────────────────

describe('computeChecksum', () => {
  it('returns a deterministic hex string for the same input', () => {
    const a = computeChecksum('hello');
    const b = computeChecksum('hello');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns different checksums for different inputs', () => {
    expect(computeChecksum('abc')).not.toBe(computeChecksum('xyz'));
  });
});

describe('serialize / deserialize', () => {
  it('round-trips a plain object', () => {
    const obj = { score: 100, level: 5, items: ['sword', 'shield'] };
    const raw = serialize(obj);
    expect(deserialize(raw)).toEqual(obj);
  });

  it('round-trips primitive values', () => {
    expect(deserialize(serialize(42))).toBe(42);
    expect(deserialize(serialize('hello'))).toBe('hello');
    expect(deserialize(serialize(null))).toBeNull();
    expect(deserialize(serialize(true))).toBe(true);
  });
});

describe('SaveSystem', () => {
  let sys: SaveSystem;

  beforeEach(async () => {
    // Close any previous connection before deleting the DB
    if (sys) {
      await sys.close();
    }
    await clearIndexedDB();
    sys = new SaveSystem();
    mockFetchAPI.mockReset();
  });

  // ── save / load ────────────────────────────────────

  it('saves and loads game state', async () => {
    const state = { score: 999, level: 3 };
    await sys.save('snake', 0, state);

    const loaded = await sys.load('snake', 0);
    expect(loaded).toEqual(state);
  });

  it('returns null for an empty slot', async () => {
    const loaded = await sys.load('snake', 1);
    expect(loaded).toBeNull();
  });

  it('overwrites an existing save in the same slot', async () => {
    await sys.save('2048', 0, { score: 100 });
    await sys.save('2048', 0, { score: 200 });

    const loaded = await sys.load('2048', 0);
    expect(loaded).toEqual({ score: 200 });
  });

  // ── delete ─────────────────────────────────────────

  it('deletes a save slot', async () => {
    await sys.save('tetris', 0, { lines: 40 });
    await sys.delete('tetris', 0);

    const loaded = await sys.load('tetris', 0);
    expect(loaded).toBeNull();
  });

  it('does not throw when deleting a non-existent slot', async () => {
    await expect(sys.delete('tetris', 2)).resolves.not.toThrow();
  });

  // ── listSaves ──────────────────────────────────────

  it('lists saves for a specific game sorted by slot', async () => {
    await sys.save('snake', 2, { a: 1 });
    await sys.save('snake', 0, { b: 2 });
    await sys.save('2048', 0, { c: 3 }); // different game

    const saves = await sys.listSaves('snake');
    expect(saves).toHaveLength(2);
    expect(saves[0].slot).toBe(0);
    expect(saves[1].slot).toBe(2);
  });

  it('returns empty array when no saves exist for a game', async () => {
    const saves = await sys.listSaves('nonexistent');
    expect(saves).toEqual([]);
  });

  // ── getSaveInfo ────────────────────────────────────

  it('returns save metadata for an existing slot', async () => {
    await sys.save('memory', 1, { pairs: 8 }, '2.0.0');

    const info = await sys.getSaveInfo('memory', 1);
    expect(info).not.toBeNull();
    expect(info!.gameId).toBe('memory');
    expect(info!.slot).toBe(1);
    expect(info!.version).toBe('2.0.0');
    expect(info!.timestamp).toBeGreaterThan(0);
    expect(info!.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(info!.data).toEqual({ pairs: 8 });
  });

  it('returns null for a non-existent slot', async () => {
    const info = await sys.getSaveInfo('memory', 2);
    expect(info).toBeNull();
  });

  // ── syncToCloud ────────────────────────────────────

  it('uploads a local save to the cloud', async () => {
    mockFetchAPI.mockResolvedValueOnce(undefined);
    await sys.save('snake', 0, { score: 50 });

    await sys.syncToCloud('snake', 0);

    expect(mockFetchAPI).toHaveBeenCalledWith('/api/games/saves', {
      method: 'POST',
      body: expect.objectContaining({
        game_id: 'snake',
        slot: 0,
        save_data: expect.objectContaining({
          data: { score: 50 },
        }),
      }),
    });
  });

  it('does nothing when syncing a non-existent slot to cloud', async () => {
    await sys.syncToCloud('snake', 9);
    expect(mockFetchAPI).not.toHaveBeenCalled();
  });

  // ── syncFromCloud ──────────────────────────────────

  it('downloads remote saves and merges newer ones into local', async () => {
    // Local save with an old timestamp
    await sys.save('snake', 0, { score: 10 });

    const futureTimestamp = Date.now() + 100_000;
    const remoteData = JSON.stringify({
      data: { score: 999 },
      timestamp: futureTimestamp,
      version: '1.0.0',
      checksum: computeChecksum(serialize({ score: 999 })),
    });

    mockFetchAPI.mockResolvedValueOnce([
      { user_id: 1, game_id: 'snake', slot: 0, save_data: remoteData, updated_at: new Date(futureTimestamp).toISOString() },
    ]);

    await sys.syncFromCloud('snake');

    const loaded = await sys.load('snake', 0);
    expect(loaded).toEqual({ score: 999 });
  });

  it('does not overwrite local save when remote is older', async () => {
    await sys.save('snake', 0, { score: 500 });

    const oldTimestamp = 1000; // very old
    const remoteData = JSON.stringify({
      data: { score: 1 },
      timestamp: oldTimestamp,
      version: '1.0.0',
      checksum: computeChecksum(serialize({ score: 1 })),
    });

    mockFetchAPI.mockResolvedValueOnce([
      { user_id: 1, game_id: 'snake', slot: 0, save_data: remoteData, updated_at: new Date(oldTimestamp).toISOString() },
    ]);

    await sys.syncFromCloud('snake');

    const loaded = await sys.load('snake', 0);
    expect(loaded).toEqual({ score: 500 });
  });

  // ── autoSync ───────────────────────────────────────

  it('uploads all local saves then downloads remote saves', async () => {
    await sys.save('snake', 0, { a: 1 });
    await sys.save('snake', 1, { b: 2 });

    // Mock POST calls for upload (2 slots)
    mockFetchAPI.mockResolvedValueOnce(undefined); // slot 0 upload
    mockFetchAPI.mockResolvedValueOnce(undefined); // slot 1 upload
    // Mock GET call for download
    mockFetchAPI.mockResolvedValueOnce([]);

    await sys.autoSync('snake');

    // 2 POST calls + 1 GET call
    expect(mockFetchAPI).toHaveBeenCalledTimes(3);
    expect(mockFetchAPI).toHaveBeenNthCalledWith(1, '/api/games/saves', expect.objectContaining({ method: 'POST' }));
    expect(mockFetchAPI).toHaveBeenNthCalledWith(2, '/api/games/saves', expect.objectContaining({ method: 'POST' }));
    expect(mockFetchAPI).toHaveBeenNthCalledWith(3, '/api/games/saves?game_id=snake');
  });
});
