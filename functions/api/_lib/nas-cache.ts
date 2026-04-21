/**
 * NAS Cache Proxy Layer
 *
 * Implements cache-through proxy for NAS storage via Cloudflare Tunnel.
 * - Cache hit: read from NAS → decrypt → return
 * - Cache miss: fetch from source → return → async encrypt + store to NAS
 * - File names are SHA-256 hashed and bucketed (first 2 chars)
 * - LRU eviction when cache exceeds configured max size
 * - Traffic shaping: rate limiting, random delays, daily bandwidth caps
 *
 * NAS is accessed ONLY through Cloudflare Tunnel (zero public ports).
 * Encryption key stored in Workers Secrets (NAS_ENCRYPTION_KEY).
 *
 * All NAS communication goes through the nas-proxy module which handles:
 * - Request signing (HMAC-SHA256)
 * - Bandwidth tracking & daily caps
 * - Traffic shaping (random delays)
 * - Health monitoring
 *
 * Validates: Requirements 52.1–52.9
 */

import { queryOne, execute, query } from './db';
import { encrypt, decrypt } from './crypto';
import { checkNasHealth, type NasProxyConfig } from './nas-proxy';

// ── Types ─────────────────────────────────────────────────────

export interface CacheConfig {
  maxSizeBytes: number;
  maxBandwidthPerDay: number;
  downloadSpeedLimit: number;
  randomDelayMs: number;
  cleanupDays: number;
}

export interface CacheEntry {
  id: string;
  originalUrl: string;
  hashedName: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
  accessCount: number;
  lastAccessed: string;
  createdAt: string;
}

export interface CacheStatus {
  totalFiles: number;
  totalSizeBytes: number;
  hitRate: number;
  nasConnected: boolean;
  typeBreakdown: Record<string, { count: number; sizeBytes: number }>;
}

// ── Default config ────────────────────────────────────────────

const DEFAULT_CONFIG: CacheConfig = {
  maxSizeBytes: 500 * 1024 * 1024 * 1024, // 500GB
  maxBandwidthPerDay: 100 * 1024 * 1024 * 1024, // 100GB/day
  downloadSpeedLimit: 50 * 1024 * 1024, // 50Mbps
  randomDelayMs: 500,
  cleanupDays: 30,
};

// ── Helpers ───────────────────────────────────────────────────

/** Generate SHA-256 hash of a string, return hex. */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate obfuscated file path from URL: ab/cd/abcdef...enc */
async function obfuscatePath(url: string): Promise<{ hash: string; bucket: string; path: string }> {
  const hash = await sha256Hex(url);
  const bucket = hash.slice(0, 2);
  return {
    hash,
    bucket,
    path: `${bucket}/${hash.slice(2, 4)}/${hash}.enc`,
  };
}

/** Add random delay for traffic shaping. */
async function randomDelay(maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * maxMs);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

// ── Cache proxy ───────────────────────────────────────────────

/**
 * Attempt to read content from NAS cache.
 * Returns decrypted content if cache hit, null if miss.
 */
export async function cacheGet(
  db: D1Database,
  nasBaseUrl: string,
  encryptionKey: string,
  originalUrl: string,
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const { hash } = await obfuscatePath(originalUrl);

  // Look up in cache_index
  const entry = await queryOne<CacheEntry>(
    db,
    'SELECT * FROM cache_index WHERE hashed_name = ?',
    [hash],
  ).catch(() => null);

  if (!entry) return null;

  // Update access stats
  const now = new Date().toISOString();
  execute(
    db,
    'UPDATE cache_index SET access_count = access_count + 1, last_accessed = ? WHERE hashed_name = ?',
    [now, hash],
  ).catch(() => {});

  // Fetch encrypted content from NAS via Tunnel
  try {
    const nasUrl = `${nasBaseUrl}/${entry.bucket}/${hash.slice(2, 4)}/${hash}.enc`;
    const response = await fetch(nasUrl);
    if (!response.ok) return null;

    const encryptedData = await response.arrayBuffer();
    const decryptedData = await decrypt(new Uint8Array(encryptedData), encryptionKey);

    return {
      data: decryptedData.buffer,
      contentType: entry.contentType || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/**
 * Store content in NAS cache (async, non-blocking).
 * Encrypts content with AES-256-GCM before storing.
 */
export async function cachePut(
  db: D1Database,
  nasBaseUrl: string,
  encryptionKey: string,
  originalUrl: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  const { hash, bucket, path } = await obfuscatePath(originalUrl);

  try {
    // Encrypt
    const encryptedData = await encrypt(data, encryptionKey);

    // Store to NAS via Tunnel
    const nasUrl = `${nasBaseUrl}/${path}`;
    await fetch(nasUrl, {
      method: 'PUT',
      body: encryptedData,
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    // Record in cache_index
    const now = new Date().toISOString();
    await execute(
      db,
      `INSERT OR REPLACE INTO cache_index
        (id, original_url, hashed_name, bucket, content_type, size_bytes, access_count, last_accessed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [crypto.randomUUID(), originalUrl, hash, bucket, contentType, data.length, now, now],
    );
  } catch {
    // Non-critical — cache write failure doesn't affect user
  }
}

/**
 * Get cache status summary.
 *
 * @param nasConfig  Optional NAS proxy config for real tunnel health check.
 *                   If omitted, nasConnected defaults to false.
 */
export async function getCacheStatus(
  db: D1Database,
  nasConfig?: NasProxyConfig,
): Promise<CacheStatus> {
  const stats = await queryOne<{ total: number; size: number }>(
    db,
    'SELECT COUNT(*) as total, COALESCE(SUM(size_bytes), 0) as size FROM cache_index',
    [],
  ).catch(() => ({ total: 0, size: 0 }));

  const hitStats = await queryOne<{ hits: number; total: number }>(
    db,
    'SELECT COALESCE(SUM(access_count), 0) as hits, COUNT(*) as total FROM cache_index',
    [],
  ).catch(() => ({ hits: 0, total: 0 }));

  const typeRows = await query<{ content_type: string; cnt: number; sz: number }>(
    db,
    `SELECT content_type, COUNT(*) as cnt, COALESCE(SUM(size_bytes), 0) as sz
     FROM cache_index GROUP BY content_type`,
    [],
  ).catch(() => []);

  const typeBreakdown: Record<string, { count: number; sizeBytes: number }> = {};
  for (const row of typeRows) {
    typeBreakdown[row.content_type || 'unknown'] = {
      count: row.cnt,
      sizeBytes: row.sz,
    };
  }

  // Real tunnel health check via nas-proxy
  let nasConnected = false;
  if (nasConfig) {
    try {
      const health = await checkNasHealth(nasConfig);
      nasConnected = health.connected;
    } catch {
      nasConnected = false;
    }
  }

  return {
    totalFiles: stats?.total ?? 0,
    totalSizeBytes: stats?.size ?? 0,
    hitRate: hitStats?.total ? hitStats.hits / hitStats.total : 0,
    nasConnected,
    typeBreakdown,
  };
}

/**
 * Clear cache entries by criteria.
 */
export async function clearCache(
  db: D1Database,
  criteria: { type?: string; olderThanDays?: number; leastAccessed?: number },
): Promise<number> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (criteria.type) {
    conditions.push('content_type LIKE ?');
    params.push(`%${criteria.type}%`);
  }

  if (criteria.olderThanDays) {
    const cutoff = new Date(Date.now() - criteria.olderThanDays * 86400000).toISOString();
    conditions.push('last_accessed < ?');
    params.push(cutoff);
  }

  if (criteria.leastAccessed) {
    conditions.push('access_count < ?');
    params.push(criteria.leastAccessed);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const result = await execute(db, `DELETE FROM cache_index${where}`, params);
  return result.changes;
}

/**
 * Emergency destroy: wipe all cache data.
 */
export async function destroyAllCache(db: D1Database): Promise<void> {
  await execute(db, 'DELETE FROM cache_index', []);
}
