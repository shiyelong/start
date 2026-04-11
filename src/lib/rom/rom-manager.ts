import type {
  ConsolePlatform,
  RomMetadata,
  RomEntry,
  ValidationResult,
  MetadataFilters,
} from '@/lib/types';
import { SUPPORTED_EXTENSIONS, MAX_ROM_SIZE_BYTES } from '@/lib/types';
import { getCoreForExtension } from '@/lib/emulator/core-registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'fc-arcade-online';
const DB_VERSION = 3;
const ROM_STORE = 'roms';
const API_BASE = '/api/classic/rom';

// ---------------------------------------------------------------------------
// IndexedDB helper
// ---------------------------------------------------------------------------

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ROM_STORE)) {
        db.createObjectStore(ROM_STORE, { keyPath: 'hash' });
      }
      if (!db.objectStoreNames.contains('save-states')) {
        db.createObjectStore('save-states');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// RomManager
// ---------------------------------------------------------------------------

export class RomManager {
  // ---------- Upload & Validation ----------

  async validateFile(file: File): Promise<ValidationResult> {
    const sizeBytes = file.size;
    const dotIndex = file.name.lastIndexOf('.');
    const extension = dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : '';

    // Check extension
    if (
      !extension ||
      !(SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)
    ) {
      return {
        valid: false,
        error: `Unsupported file extension "${extension}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
        sizeBytes,
      };
    }

    // Check size
    if (sizeBytes > MAX_ROM_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size (${sizeBytes} bytes) exceeds the 64 MB limit`,
        sizeBytes,
      };
    }

    // Detect platform (null for .zip — ambiguous)
    const detectedPlatform = this.detectPlatform(file.name) ?? undefined;

    return {
      valid: true,
      detectedPlatform,
      sizeBytes,
    };
  }

  async computeHash(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  detectPlatform(
    filename: string,
    zipContents?: string[],
  ): ConsolePlatform | null {
    const dotIndex = filename.lastIndexOf('.');
    const extension = dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';

    // .zip is ambiguous (Arcade vs Neo_Geo vs others) — caller must prompt user
    if (extension === '.zip') {
      // Even if zipContents are provided we return null to keep the contract
      // simple: the UI layer handles disambiguation.
      return null;
    }

    const core = getCoreForExtension(extension);
    return core?.platform ?? null;
  }

  // ---------- IndexedDB operations ----------

  async storeLocal(
    hash: string,
    data: ArrayBuffer,
    platform: ConsolePlatform,
    title: string,
  ): Promise<void> {
    const db = await openDatabase();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROM_STORE, 'readwrite');
      const store = tx.objectStore(ROM_STORE);
      const entry: RomEntry = {
        hash,
        data,
        platform,
        title,
        addedAt: Date.now(),
      };
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async loadLocal(hash: string): Promise<RomEntry | null> {
    const db = await openDatabase();
    return new Promise<RomEntry | null>((resolve, reject) => {
      const tx = db.transaction(ROM_STORE, 'readonly');
      const store = tx.objectStore(ROM_STORE);
      const request = store.get(hash);
      request.onsuccess = () => resolve((request.result as RomEntry) ?? null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async deleteLocal(hash: string): Promise<void> {
    const db = await openDatabase();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROM_STORE, 'readwrite');
      const store = tx.objectStore(ROM_STORE);
      const request = store.delete(hash);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async listLocal(): Promise<RomEntry[]> {
    const db = await openDatabase();
    return new Promise<RomEntry[]>((resolve, reject) => {
      const tx = db.transaction(ROM_STORE, 'readonly');
      const store = tx.objectStore(ROM_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as RomEntry[]);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  // ---------- Metadata API calls ----------

  async saveMetadata(metadata: RomMetadata): Promise<void> {
    const res = await fetch(`${API_BASE}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) {
      throw new Error(`Failed to save metadata: ${res.status} ${res.statusText}`);
    }
  }

  async getMetadata(hash: string): Promise<RomMetadata | null> {
    const res = await fetch(`${API_BASE}/${hash}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to get metadata: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as RomMetadata;
  }

  async updateMetadata(
    hash: string,
    updates: Partial<RomMetadata>,
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/${hash}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      throw new Error(`Failed to update metadata: ${res.status} ${res.statusText}`);
    }
  }

  async deleteMetadata(hash: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${hash}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Failed to delete metadata: ${res.status} ${res.statusText}`);
    }
  }

  async searchMetadata(
    query: string,
    filters: MetadataFilters,
  ): Promise<RomMetadata[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filters.platform) params.set('platform', filters.platform);
    if (filters.playerCount != null)
      params.set('playerCount', String(filters.playerCount));

    const res = await fetch(`${API_BASE}/search?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to search metadata: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as RomMetadata[];
  }
}
