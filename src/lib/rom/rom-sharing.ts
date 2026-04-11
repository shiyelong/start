/**
 * ROM sharing and storage features.
 *
 * - R2 upload/download for cross-device ROM access (opt-in)
 * - "Play Together" invite link generation
 * - "Recently Played" section (last 20 ROMs)
 * - "Favorite" ROM pinning
 * - Friend's shared library view
 *
 * Requirements: 3.2-3.5, 23.1-23.6
 */

import type { RomMetadata, ConsolePlatform } from '@/lib/types';

// ---------------------------------------------------------------------------
// IndexedDB helpers for recently played & favorites
// ---------------------------------------------------------------------------

const DB_NAME = 'fc-arcade-online';
const DB_VERSION = 3;
const SETTINGS_STORE = 'settings';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('roms')) db.createObjectStore('roms', { keyPath: 'hash' });
      if (!db.objectStoreNames.contains('save-states')) db.createObjectStore('save-states');
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Recently Played
// ---------------------------------------------------------------------------

export interface RecentlyPlayedEntry {
  romHash: string;
  title: string;
  platform: ConsolePlatform;
  playedAt: number;
}

const RECENTLY_PLAYED_KEY = 'recently-played';
const MAX_RECENT = 20;

export async function getRecentlyPlayed(): Promise<RecentlyPlayedEntry[]> {
  const db = await openDB();
  return new Promise<RecentlyPlayedEntry[]>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const req = store.get(RECENTLY_PLAYED_KEY);
    req.onsuccess = () => resolve((req.result as RecentlyPlayedEntry[]) ?? []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function addRecentlyPlayed(entry: Omit<RecentlyPlayedEntry, 'playedAt'>): Promise<void> {
  const db = await openDB();
  const existing = await new Promise<RecentlyPlayedEntry[]>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const req = store.get(RECENTLY_PLAYED_KEY);
    req.onsuccess = () => resolve((req.result as RecentlyPlayedEntry[]) ?? []);
    req.onerror = () => reject(req.error);
  });

  // Remove duplicate if exists, add to front
  const filtered = existing.filter((e) => e.romHash !== entry.romHash);
  const updated = [{ ...entry, playedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put(updated, RECENTLY_PLAYED_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

const FAVORITES_KEY = 'favorite-roms';

export async function getFavorites(): Promise<string[]> {
  const db = await openDB();
  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const req = store.get(FAVORITES_KEY);
    req.onsuccess = () => resolve((req.result as string[]) ?? []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function toggleFavorite(romHash: string): Promise<boolean> {
  const db = await openDB();
  const existing = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const req = store.get(FAVORITES_KEY);
    req.onsuccess = () => resolve((req.result as string[]) ?? []);
    req.onerror = () => reject(req.error);
  });

  const isFav = existing.includes(romHash);
  const updated = isFav ? existing.filter((h) => h !== romHash) : [...existing, romHash];

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put(updated, FAVORITES_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });

  // Also update D1 metadata
  try {
    await fetch(`/api/classic/rom/metadata/${romHash}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: !isFav }),
    });
  } catch {
    // Best effort
  }

  return !isFav;
}

// ---------------------------------------------------------------------------
// R2 upload/download (opt-in cross-device)
// ---------------------------------------------------------------------------

export async function uploadRomToR2(romHash: string, data: ArrayBuffer): Promise<boolean> {
  try {
    const res = await fetch(`/api/classic/rom/r2/${romHash}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function downloadRomFromR2(romHash: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`/api/classic/rom/r2/${romHash}`);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// "Play Together" invite link
// ---------------------------------------------------------------------------

export function generateInviteLink(romHash: string, platform: ConsolePlatform, title: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    rom: romHash,
    platform,
    title,
    action: 'play-together',
  });
  return `${base}/games/classic?${params.toString()}`;
}

export function parseInviteLink(url: string): { romHash: string; platform: string; title: string } | null {
  try {
    const parsed = new URL(url);
    const rom = parsed.searchParams.get('rom');
    const platform = parsed.searchParams.get('platform');
    const title = parsed.searchParams.get('title');
    if (!rom || !platform || !title) return null;
    return { romHash: rom, platform, title };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Friend's shared library (read-only metadata list)
// ---------------------------------------------------------------------------

export async function getFriendLibrary(friendUserId: string): Promise<RomMetadata[]> {
  try {
    const res = await fetch(`/api/classic/rom/search?userId=${encodeURIComponent(friendUserId)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: RomMetadata[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}
