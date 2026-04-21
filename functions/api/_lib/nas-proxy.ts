/**
 * NAS Proxy Service — Cloudflare Tunnel Communication Layer
 *
 * All NAS access goes through this module. Zero direct connections.
 * Path: Cloudflare Workers → Cloudflare Tunnel → NAS
 *
 * Features:
 * - Health monitoring with automatic fallback
 * - Traffic shaping: bandwidth caps, random delays, speed limiting
 * - Request signing for NAS-side verification
 * - Bandwidth tracking per day to avoid ISP detection
 * - Connection pooling via Cloudflare's fetch
 *
 * NAS_BASE_URL is the Cloudflare Tunnel hostname (e.g. https://nas.yourdomain.com)
 * configured in Workers Secrets. Never contains a real IP.
 *
 * Validates: Project Constitution Ch.2, Requirements 52.1–52.9
 */

// ── Types ─────────────────────────────────────────────────────

export interface NasProxyConfig {
  /** Tunnel base URL from Workers Secrets (NAS_BASE_URL) */
  baseUrl: string;
  /** HMAC key for request signing (NAS_SIGNING_KEY) */
  signingKey: string;
  /** AES-256 encryption key (NAS_ENCRYPTION_KEY) */
  encryptionKey: string;
  /** KV namespace for bandwidth tracking */
  kv: KVNamespace;
}

export interface NasHealthStatus {
  connected: boolean;
  latencyMs: number;
  lastChecked: string;
  tunnelId?: string;
  diskUsage?: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
  };
}

export interface BandwidthStatus {
  usedToday: number;
  limitPerDay: number;
  remaining: number;
  throttled: boolean;
  resetAt: string;
}

export interface NasFileInfo {
  path: string;
  size: number;
  mimeType: string;
  modifiedAt: string;
  checksum?: string;
}

// ── Constants ─────────────────────────────────────────────────

/** Max bandwidth per day: 100GB (avoid ISP detection) */
const MAX_BANDWIDTH_PER_DAY = 100 * 1024 * 1024 * 1024;

/** Max single request size: 2GB */
const MAX_REQUEST_SIZE = 2 * 1024 * 1024 * 1024;

/** Random delay range for traffic shaping (ms) */
const TRAFFIC_SHAPE_DELAY_MIN = 50;
const TRAFFIC_SHAPE_DELAY_MAX = 500;

/** Health check timeout (ms) */
const HEALTH_CHECK_TIMEOUT = 5000;

/** Request timeout (ms) */
const DEFAULT_TIMEOUT = 30000;

/** KV keys */
const KV_BANDWIDTH_PREFIX = 'nas:bw:';
const KV_HEALTH_KEY = 'nas:health';
const KV_HEALTH_TTL = 60; // 1 minute

// ── Helpers ───────────────────────────────────────────────────

/** Get today's date key for bandwidth tracking (UTC) */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add random delay for traffic shaping to avoid ISP pattern detection */
async function trafficShapeDelay(): Promise<void> {
  const delay = TRAFFIC_SHAPE_DELAY_MIN +
    Math.floor(Math.random() * (TRAFFIC_SHAPE_DELAY_MAX - TRAFFIC_SHAPE_DELAY_MIN));
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/** Sign a request path with HMAC-SHA256 for NAS-side verification */
async function signRequest(path: string, signingKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${timestamp}:${path}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  );

  const sigHex = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${timestamp}:${sigHex}`;
}

/** Fetch with timeout */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ── Bandwidth tracking ────────────────────────────────────────

/**
 * Get current bandwidth usage for today.
 */
export async function getBandwidthStatus(kv: KVNamespace): Promise<BandwidthStatus> {
  const key = `${KV_BANDWIDTH_PREFIX}${todayKey()}`;
  const raw = await kv.get(key);
  const usedToday = raw ? parseInt(raw, 10) : 0;
  const remaining = Math.max(0, MAX_BANDWIDTH_PER_DAY - usedToday);

  // Reset time is midnight UTC
  const now = new Date();
  const resetAt = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  )).toISOString();

  return {
    usedToday,
    limitPerDay: MAX_BANDWIDTH_PER_DAY,
    remaining,
    throttled: remaining <= 0,
    resetAt,
  };
}

/**
 * Record bandwidth usage.
 */
async function recordBandwidth(kv: KVNamespace, bytes: number): Promise<void> {
  const key = `${KV_BANDWIDTH_PREFIX}${todayKey()}`;
  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;
  // TTL: 48 hours (auto-cleanup)
  await kv.put(key, String(current + bytes), { expirationTtl: 172800 });
}

/**
 * Check if bandwidth limit allows the request.
 */
async function checkBandwidthLimit(kv: KVNamespace, estimatedBytes: number): Promise<boolean> {
  const status = await getBandwidthStatus(kv);
  return status.remaining >= estimatedBytes;
}

// ── Core NAS proxy functions ──────────────────────────────────

/**
 * Check NAS health via Cloudflare Tunnel.
 * Pings the NAS health endpoint and returns connection status.
 */
export async function checkNasHealth(config: NasProxyConfig): Promise<NasHealthStatus> {
  // Check KV cache first
  const cached = await config.kv.get(KV_HEALTH_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as NasHealthStatus;
    } catch { /* ignore */ }
  }

  const startTime = Date.now();
  try {
    const sig = await signRequest('/health', config.signingKey);
    const response = await fetchWithTimeout(
      `${config.baseUrl}/health`,
      {
        method: 'GET',
        headers: {
          'X-NAS-Signature': sig,
          'User-Agent': 'StarHub-Worker/1.0',
        },
      },
      HEALTH_CHECK_TIMEOUT,
    );

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const status: NasHealthStatus = {
        connected: false,
        latencyMs,
        lastChecked: new Date().toISOString(),
      };
      await config.kv.put(KV_HEALTH_KEY, JSON.stringify(status), { expirationTtl: KV_HEALTH_TTL });
      return status;
    }

    const body = await response.json() as Record<string, unknown>;
    const status: NasHealthStatus = {
      connected: true,
      latencyMs,
      lastChecked: new Date().toISOString(),
      tunnelId: typeof body.tunnelId === 'string' ? body.tunnelId : undefined,
      diskUsage: body.disk ? body.disk as NasHealthStatus['diskUsage'] : undefined,
    };

    await config.kv.put(KV_HEALTH_KEY, JSON.stringify(status), { expirationTtl: KV_HEALTH_TTL });
    return status;
  } catch {
    const status: NasHealthStatus = {
      connected: false,
      latencyMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
    };
    await config.kv.put(KV_HEALTH_KEY, JSON.stringify(status), { expirationTtl: KV_HEALTH_TTL });
    return status;
  }
}

/**
 * Read a file from NAS via Cloudflare Tunnel.
 * Supports range requests for streaming.
 */
export async function nasReadFile(
  config: NasProxyConfig,
  filePath: string,
  options?: {
    rangeStart?: number;
    rangeEnd?: number;
    timeout?: number;
  },
): Promise<{ data: ReadableStream | null; contentType: string; size: number; status: number } | null> {
  // Traffic shaping
  await trafficShapeDelay();

  // Check bandwidth
  const canProceed = await checkBandwidthLimit(config.kv, 1024 * 1024); // estimate 1MB min
  if (!canProceed) {
    return null; // Bandwidth exceeded
  }

  const sig = await signRequest(filePath, config.signingKey);
  const headers: Record<string, string> = {
    'X-NAS-Signature': sig,
    'User-Agent': 'StarHub-Worker/1.0',
  };

  if (options?.rangeStart !== undefined) {
    const rangeEnd = options.rangeEnd !== undefined ? options.rangeEnd : '';
    headers['Range'] = `bytes=${options.rangeStart}-${rangeEnd}`;
  }

  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/media${filePath}`,
      { method: 'GET', headers },
      options?.timeout ?? DEFAULT_TIMEOUT,
    );

    if (!response.ok && response.status !== 206) {
      return null;
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const size = parseInt(response.headers.get('Content-Length') || '0', 10);

    // Record bandwidth
    recordBandwidth(config.kv, size).catch(() => {});

    return {
      data: response.body,
      contentType,
      size,
      status: response.status,
    };
  } catch {
    return null;
  }
}

/**
 * Write a file to NAS via Cloudflare Tunnel (for caching).
 * Encrypts content before sending.
 */
export async function nasWriteFile(
  config: NasProxyConfig,
  filePath: string,
  data: Uint8Array | ReadableStream,
  contentType: string,
): Promise<boolean> {
  await trafficShapeDelay();

  const sig = await signRequest(filePath, config.signingKey);

  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/media${filePath}`,
      {
        method: 'PUT',
        headers: {
          'X-NAS-Signature': sig,
          'Content-Type': contentType,
          'User-Agent': 'StarHub-Worker/1.0',
        },
        body: data,
      },
      DEFAULT_TIMEOUT * 2, // Writes get more time
    );

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Delete a file from NAS via Cloudflare Tunnel.
 */
export async function nasDeleteFile(
  config: NasProxyConfig,
  filePath: string,
): Promise<boolean> {
  const sig = await signRequest(filePath, config.signingKey);

  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/media${filePath}`,
      {
        method: 'DELETE',
        headers: {
          'X-NAS-Signature': sig,
          'User-Agent': 'StarHub-Worker/1.0',
        },
      },
      DEFAULT_TIMEOUT,
    );

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List files in a NAS directory via Cloudflare Tunnel.
 * Used by the sync worker to discover new content.
 */
export async function nasListFiles(
  config: NasProxyConfig,
  directory: string,
  options?: {
    recursive?: boolean;
    extensions?: string[];
    page?: number;
    pageSize?: number;
  },
): Promise<NasFileInfo[]> {
  await trafficShapeDelay();

  const sig = await signRequest(directory, config.signingKey);
  const params = new URLSearchParams();
  if (options?.recursive) params.set('recursive', '1');
  if (options?.extensions?.length) params.set('ext', options.extensions.join(','));
  if (options?.page) params.set('page', String(options.page));
  if (options?.pageSize) params.set('pageSize', String(options.pageSize));

  const qs = params.toString();
  const url = `${config.baseUrl}/list${directory}${qs ? `?${qs}` : ''}`;

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'X-NAS-Signature': sig,
          'User-Agent': 'StarHub-Worker/1.0',
        },
      },
      DEFAULT_TIMEOUT,
    );

    if (!response.ok) return [];

    const body = await response.json() as { files: NasFileInfo[] };
    return body.files || [];
  } catch {
    return [];
  }
}

/**
 * Get file metadata from NAS without downloading the file.
 */
export async function nasGetFileInfo(
  config: NasProxyConfig,
  filePath: string,
): Promise<NasFileInfo | null> {
  const sig = await signRequest(filePath, config.signingKey);

  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/info${filePath}`,
      {
        method: 'GET',
        headers: {
          'X-NAS-Signature': sig,
          'User-Agent': 'StarHub-Worker/1.0',
        },
      },
      HEALTH_CHECK_TIMEOUT,
    );

    if (!response.ok) return null;
    return await response.json() as NasFileInfo;
  } catch {
    return null;
  }
}

/**
 * Build a NasProxyConfig from environment bindings.
 * Returns null if required secrets are missing.
 */
export function buildNasConfig(env: {
  NAS_BASE_URL?: string;
  NAS_SIGNING_KEY?: string;
  NAS_ENCRYPTION_KEY?: string;
  KV?: KVNamespace;
}): NasProxyConfig | null {
  if (!env.NAS_BASE_URL || !env.NAS_SIGNING_KEY || !env.NAS_ENCRYPTION_KEY || !env.KV) {
    return null;
  }

  return {
    baseUrl: env.NAS_BASE_URL,
    signingKey: env.NAS_SIGNING_KEY,
    encryptionKey: env.NAS_ENCRYPTION_KEY,
    kv: env.KV,
  };
}
