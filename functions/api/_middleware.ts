/**
 * Cloudflare Pages Functions middleware for /api/* routes.
 * - Applies rate limiting per IP (general 200/15min, auth 10/1min).
 * - Sets CORS headers on every response (and handles OPTIONS preflight).
 * - Parses JWT from Authorization header using Web Crypto HMAC-SHA256.
 * - Attaches decoded user context { id, role } to context.data.user.
 * - Does NOT block unauthenticated requests — downstream handlers decide.
 */

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

interface UserContext {
  id: number;
  role: string;
}

// ── CORS helpers ──────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function corsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function applyCors(response: Response): Response {
  const res = new Response(response.body, response);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

// ── JWT helpers (Web Crypto HMAC-SHA256) ──────────────────────

function base64UrlDecode(str: string): Uint8Array {
  // Convert base64url → base64, then decode
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyJwt(token: string, secret: string): Promise<UserContext | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Import the secret as a CryptoKey
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Verify signature
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;

    // Decode payload
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Return user context
    if (typeof payload.id !== 'number' || typeof payload.role !== 'string') {
      return null;
    }

    return { id: payload.id, role: payload.role };
  } catch {
    return null;
  }
}

// ── Rate limiting helpers ─────────────────────────────────────

interface RateLimitConfig {
  key: string;
  limit: number;
  windowSeconds: number;
}

function isAuthEndpoint(url: URL): boolean {
  const path = url.pathname;
  return path.includes('/api/auth/login') || path.includes('/api/auth/register');
}

function getRateLimitConfig(ip: string, url: URL): RateLimitConfig {
  if (isAuthEndpoint(url)) {
    return { key: `rate:auth:${ip}`, limit: 10, windowSeconds: 60 };
  }
  return { key: `rate:general:${ip}`, limit: 200, windowSeconds: 900 };
}

async function checkRateLimit(
  kv: KVNamespace,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const current = await kv.get(config.key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= config.limit) {
    return { allowed: false, retryAfter: config.windowSeconds };
  }

  // Increment counter; set TTL only on first request in the window
  if (count === 0) {
    await kv.put(config.key, '1', { expirationTtl: config.windowSeconds });
  } else {
    // Preserve existing TTL by not setting a new one — KV keeps the original expiration
    await kv.put(config.key, String(count + 1));
  }

  return { allowed: true, retryAfter: 0 };
}

function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests. Please try again later.',
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        ...CORS_HEADERS,
      },
    },
  );
}

// ── Middleware entry point ─────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (context) => {
  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return corsResponse();
  }

  // ── Rate limiting (before JWT check) ──
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const url = new URL(context.request.url);
  const rlConfig = getRateLimitConfig(ip, url);
  const { allowed, retryAfter } = await checkRateLimit(context.env.KV, rlConfig);

  if (!allowed) {
    return rateLimitResponse(retryAfter);
  }

  // Try to extract and verify JWT — never block if missing/invalid
  const authHeader = context.request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = await verifyJwt(token, context.env.JWT_SECRET);
    if (user) {
      context.data.user = user;
    }
  }

  // Continue to the next handler, then apply CORS headers to the response
  const response = await context.next();
  return applyCors(response);
};
