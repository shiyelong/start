// =============================================================================
// KV Hot Data Caching Utility — Cloudflare KV with TTL support
// Provides a typed caching layer for frequently accessed data:
//   - Search results (TTL 5 min)
//   - Hot content / recommendations (TTL 1 hour)
//   - Source health status (TTL 1 min)
// =============================================================================

/**
 * Cache entry metadata stored alongside the value.
 */
interface CacheMeta {
  /** ISO timestamp when the entry was created */
  createdAt: string;
  /** TTL in seconds that was used when storing */
  ttl: number;
  /** Optional tag for bulk invalidation */
  tag?: string;
}

/**
 * Predefined TTL presets (in seconds).
 */
export const CacheTTL = {
  /** Search results — 5 minutes */
  SEARCH: 300,
  /** Hot / trending content — 1 hour */
  HOT_CONTENT: 3600,
  /** Source health status — 1 minute */
  SOURCE_HEALTH: 60,
  /** User recommendations — 1 hour */
  RECOMMENDATIONS: 3600,
  /** API response cache — 10 minutes */
  API_RESPONSE: 600,
  /** Static config — 24 hours */
  CONFIG: 86400,
} as const;

/**
 * Build a namespaced cache key to avoid collisions.
 *
 * @example
 * cacheKey('search', 'video', 'action movies') → 'cache:search:video:action movies'
 */
export function cacheKey(...parts: string[]): string {
  return `cache:${parts.join(':')}`;
}

// ---------------------------------------------------------------------------
// Core get / set / delete
// ---------------------------------------------------------------------------

/**
 * Get a cached value from KV. Returns null on miss or expiry.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param key - Cache key (use `cacheKey()` helper)
 */
export async function kvGet<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  try {
    const raw = await kv.get(key, 'text');
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { value: T; meta: CacheMeta };
    return parsed.value;
  } catch {
    // Corrupted entry — treat as miss
    return null;
  }
}

/**
 * Store a value in KV with a TTL.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param key - Cache key
 * @param value - Value to cache (must be JSON-serializable)
 * @param ttlSeconds - Time-to-live in seconds
 * @param tag - Optional tag for bulk invalidation
 */
export async function kvSet<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttlSeconds: number,
  tag?: string,
): Promise<void> {
  const entry = {
    value,
    meta: {
      createdAt: new Date().toISOString(),
      ttl: ttlSeconds,
      tag,
    } satisfies CacheMeta,
  };

  await kv.put(key, JSON.stringify(entry), {
    expirationTtl: ttlSeconds,
  });
}

/**
 * Delete a cached entry.
 */
export async function kvDelete(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

// ---------------------------------------------------------------------------
// Get-or-set pattern (stale-while-revalidate)
// ---------------------------------------------------------------------------

/**
 * Get a cached value, or compute and cache it if missing.
 * This is the most common caching pattern.
 *
 * @example
 * const results = await kvGetOrSet(
 *   env.KV,
 *   cacheKey('search', 'video', query),
 *   CacheTTL.SEARCH,
 *   async () => {
 *     return await searchVideos(query);
 *   },
 * );
 */
export async function kvGetOrSet<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  tag?: string,
): Promise<T> {
  // Try cache first
  const cached = await kvGet<T>(kv, key);
  if (cached !== null) return cached;

  // Cache miss — compute the value
  const value = await compute();

  // Store in background (don't block the response)
  // In Cloudflare Workers, we can use waitUntil for this,
  // but since we don't have the execution context here,
  // we fire-and-forget with a catch.
  kvSet(kv, key, value, ttlSeconds, tag).catch(() => {
    // Silently ignore cache write failures
  });

  return value;
}

// ---------------------------------------------------------------------------
// Bulk invalidation by prefix
// ---------------------------------------------------------------------------

/**
 * Delete all cache entries matching a key prefix.
 * Uses KV list API to find matching keys, then deletes them.
 *
 * NOTE: KV list is eventually consistent and has rate limits.
 * Use sparingly (e.g., admin cache clear operations).
 */
export async function kvInvalidateByPrefix(
  kv: KVNamespace,
  prefix: string,
): Promise<number> {
  let cursor: string | undefined;
  let deletedCount = 0;

  do {
    const list = await kv.list({ prefix, cursor, limit: 100 });

    const deletePromises = list.keys.map((key) => kv.delete(key.name));
    await Promise.allSettled(deletePromises);
    deletedCount += list.keys.length;

    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  return deletedCount;
}

// ---------------------------------------------------------------------------
// Rate limiting helper (using KV as a simple counter)
// ---------------------------------------------------------------------------

/**
 * Simple KV-based rate limiter.
 * Returns true if the request is allowed, false if rate-limited.
 *
 * @param kv - KV namespace
 * @param identifier - Unique identifier (e.g., IP hash, user ID)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowSeconds - Time window in seconds
 */
export async function kvRateLimit(
  kv: KVNamespace,
  identifier: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();

  const raw = await kv.get(key, 'text');
  let state = { count: 0, windowStart: now };

  if (raw) {
    try {
      state = JSON.parse(raw);
    } catch {
      // Corrupted — reset
    }
  }

  // Check if we're in a new window
  const windowMs = windowSeconds * 1000;
  if (now - state.windowStart >= windowMs) {
    state = { count: 0, windowStart: now };
  }

  state.count++;
  const allowed = state.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - state.count);
  const resetAt = state.windowStart + windowMs;

  // Update the counter
  await kv.put(key, JSON.stringify(state), {
    expirationTtl: windowSeconds,
  });

  return { allowed, remaining, resetAt };
}
