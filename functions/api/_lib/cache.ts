/**
 * KV cache utilities and rate-limiting helpers.
 *
 * All cache operations go through Cloudflare KV with TTL-based expiry.
 * Rate limiting uses a simple counter pattern:
 *   key = `rate:{ip}:{endpoint}`, value = request count, TTL = window.
 *
 * (Design doc § 中间件层 — 速率限制 KV)
 */

// ── Types ─────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** KV key for this rate-limit bucket. */
  key: string;
  /** Maximum requests allowed in the window. */
  limit: number;
  /** Window duration in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Seconds the client should wait before retrying (0 if allowed). */
  retryAfter: number;
}

// ── Rate limiting ─────────────────────────────────────────────

/**
 * Build a rate-limit config for the given IP and request path.
 *
 * Auth endpoints get a tighter limit (10 req / 60 s) to slow brute-force.
 * Everything else gets a generous 200 req / 15 min.
 */
export function getRateLimitConfig(ip: string, pathname: string): RateLimitConfig {
  const isAuth =
    pathname.includes('/api/auth/login') || pathname.includes('/api/auth/register');

  if (isAuth) {
    return { key: `rate:auth:${ip}`, limit: 10, windowSeconds: 60 };
  }
  return { key: `rate:general:${ip}`, limit: 200, windowSeconds: 900 };
}

/**
 * Check (and increment) the rate-limit counter stored in KV.
 *
 * - First request in a window creates the key with a TTL.
 * - Subsequent requests increment the counter without resetting the TTL.
 * - Once the counter reaches the limit, further requests are rejected
 *   until the key expires.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const current = await kv.get(config.key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= config.limit) {
    return { allowed: false, retryAfter: config.windowSeconds };
  }

  // Increment — set TTL only on the first request in the window
  if (count === 0) {
    await kv.put(config.key, '1', { expirationTtl: config.windowSeconds });
  } else {
    // KV preserves the original TTL when we omit expirationTtl
    await kv.put(config.key, String(count + 1));
  }

  return { allowed: true, retryAfter: 0 };
}

// ── Generic KV cache helpers ──────────────────────────────────

/**
 * Read a cached JSON value from KV.
 *
 * @returns The parsed value, or `null` on cache miss.
 */
export async function cacheGet<T = unknown>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  const raw = await kv.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Write a JSON value to KV with an optional TTL.
 *
 * @param ttlSeconds  Time-to-live in seconds. Omit for no expiry.
 */
export async function cacheSet(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const options: KVNamespacePutOptions = {};
  if (ttlSeconds && ttlSeconds > 0) {
    options.expirationTtl = ttlSeconds;
  }
  await kv.put(key, JSON.stringify(value), options);
}

/**
 * Delete a cached value from KV.
 */
export async function cacheDel(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}
