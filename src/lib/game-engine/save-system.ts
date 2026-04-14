/**
 * Game Save System — IndexedDB local storage + cloud sync
 *
 * Provides save/load/delete operations for game state with:
 * - IndexedDB local persistence (offline-first)
 * - JSON serialization with metadata (timestamp, version, checksum)
 * - Cloud sync via D1 database (POST/GET /api/games/saves)
 *
 * Requirements: 6.10 (game save to IndexedDB + cross-device sync)
 */

import { fetchAPI } from '../api-client';

// ─── Types ───────────────────────────────────────────────

/** Metadata and data for a single save slot */
export interface SaveSlot {
  gameId: string;
  slot: number;
  data: unknown;
  timestamp: number;
  version: string;
  checksum: string;
}

/** Shape returned by the cloud saves API */
interface CloudSaveRecord {
  user_id: number;
  game_id: string;
  slot: number;
  save_data: string;
  updated_at: string;
}

// ─── Constants ───────────────────────────────────────────

const DB_NAME = 'starhub-game-saves';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const DEFAULT_GAME_VERSION = '1.0.0';

// ─── Helpers ─────────────────────────────────────────────

/**
 * Simple deterministic hash for integrity checking.
 * Uses a DJB2-style algorithm on the JSON string.
 */
export function computeChecksum(serialized: string): string {
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Serialize game state to a JSON string.
 */
export function serialize(data: unknown): string {
  return JSON.stringify(data);
}

/**
 * Deserialize a JSON string back to game state.
 */
export function deserialize(raw: string): unknown {
  return JSON.parse(raw);
}

// ─── IndexedDB helpers ───────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: ['gameId', 'slot'] });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db: IDBDatabase, key: IDBValidKey): Promise<SaveSlot | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as SaveSlot | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, value: SaveSlot): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<SaveSlot[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as SaveSlot[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── SaveSystem ──────────────────────────────────────────

export class SaveSystem {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /** Lazily open (or reuse) the IndexedDB connection */
  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB();
    }
    return this.dbPromise;
  }

  /** Close the IndexedDB connection (useful for cleanup in tests) */
  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }

  // ── Local operations ─────────────────────────────────

  /**
   * Save game state to a specific slot in IndexedDB.
   *
   * Serializes the data to JSON, computes a checksum, and stores
   * the full SaveSlot record locally.
   */
  async save(
    gameId: string,
    slot: number,
    data: unknown,
    version: string = DEFAULT_GAME_VERSION,
  ): Promise<void> {
    const serialized = serialize(data);
    const checksum = computeChecksum(serialized);

    const record: SaveSlot = {
      gameId,
      slot,
      data,
      timestamp: Date.now(),
      version,
      checksum,
    };

    const db = await this.getDB();
    await idbPut(db, record);
  }

  /**
   * Load game state from a specific slot.
   * Returns the deserialized data, or null if the slot is empty.
   */
  async load(gameId: string, slot: number): Promise<unknown | null> {
    const db = await this.getDB();
    const record = await idbGet(db, [gameId, slot]);
    if (!record) return null;
    return record.data;
  }

  /**
   * Delete a save from a specific slot.
   */
  async delete(gameId: string, slot: number): Promise<void> {
    const db = await this.getDB();
    await idbDelete(db, [gameId, slot]);
  }

  /**
   * List all saves for a given game, sorted by slot number.
   */
  async listSaves(gameId: string): Promise<SaveSlot[]> {
    const db = await this.getDB();
    const all = await idbGetAll(db);
    return all
      .filter((s) => s.gameId === gameId)
      .sort((a, b) => a.slot - b.slot);
  }

  /**
   * Get metadata for a specific save slot, or null if empty.
   */
  async getSaveInfo(gameId: string, slot: number): Promise<SaveSlot | null> {
    const db = await this.getDB();
    const record = await idbGet(db, [gameId, slot]);
    return record ?? null;
  }

  // ── Cloud sync operations ────────────────────────────

  /**
   * Upload a local save to the cloud (D1 database) via POST /api/games/saves.
   * Requires the user to be authenticated (fetchAPI attaches JWT automatically).
   */
  async syncToCloud(gameId: string, slot: number): Promise<void> {
    const db = await this.getDB();
    const record = await idbGet(db, [gameId, slot]);
    if (!record) return; // nothing to sync

    const payload = {
      game_id: gameId,
      slot,
      save_data: {
        data: record.data,
        timestamp: record.timestamp,
        version: record.version,
        checksum: record.checksum,
      },
    };

    await fetchAPI('/api/games/saves', {
      method: 'POST',
      body: payload,
    });
  }

  /**
   * Download saves from the cloud for a given game and merge into IndexedDB.
   * Remote saves only overwrite local ones if the remote timestamp is newer.
   */
  async syncFromCloud(gameId: string): Promise<void> {
    const remoteSaves = await fetchAPI<CloudSaveRecord[] | CloudSaveRecord>(
      `/api/games/saves?game_id=${encodeURIComponent(gameId)}`,
    );

    const records = Array.isArray(remoteSaves) ? remoteSaves : remoteSaves ? [remoteSaves] : [];
    const db = await this.getDB();

    for (const remote of records) {
      let parsed: { data: unknown; timestamp: number; version: string; checksum: string };
      try {
        const raw = typeof remote.save_data === 'string'
          ? remote.save_data
          : JSON.stringify(remote.save_data);
        parsed = JSON.parse(raw);
      } catch {
        // If the cloud data isn't in our expected envelope, wrap it
        parsed = {
          data: remote.save_data,
          timestamp: new Date(remote.updated_at).getTime(),
          version: DEFAULT_GAME_VERSION,
          checksum: computeChecksum(
            typeof remote.save_data === 'string'
              ? remote.save_data
              : JSON.stringify(remote.save_data),
          ),
        };
      }

      const local = await idbGet(db, [gameId, remote.slot]);

      // Only overwrite local if remote is newer (or local doesn't exist)
      if (!local || parsed.timestamp > local.timestamp) {
        const slot: SaveSlot = {
          gameId,
          slot: remote.slot,
          data: parsed.data,
          timestamp: parsed.timestamp,
          version: parsed.version,
          checksum: parsed.checksum,
        };
        await idbPut(db, slot);
      }
    }
  }

  /**
   * Full bidirectional sync: upload all local saves, then download remote saves.
   * After this call, both local and cloud should have the latest version of each slot.
   */
  async autoSync(gameId: string): Promise<void> {
    // Upload local saves to cloud
    const localSaves = await this.listSaves(gameId);
    for (const save of localSaves) {
      await this.syncToCloud(gameId, save.slot);
    }

    // Download remote saves (merges newer remote into local)
    await this.syncFromCloud(gameId);
  }
}
