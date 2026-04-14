/**
 * Cloudflare Pages Functions middleware for /api/* routes.
 *
 * Middleware chain (executed in order):
 * 1. CORS — handle OPTIONS preflight, apply headers to every response.
 * 2. Rate limiting — per-IP counters stored in KV.
 * 3. JWT auth parsing — decode token from Authorization header,
 *    attach user context to `context.data.user`. Never blocks.
 * 4. MPAA rating permission — reads `x-user-mode` header (set by the
 *    frontend AgeGate) and attaches the resolved max rating to
 *    `context.data.maxRating` so downstream handlers can filter content.
 *
 * The middleware does NOT block unauthenticated requests — downstream
 * handlers decide via `requireAuth()` / `requireRole()`.
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Mode',
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

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

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

  if (count === 0) {
    await kv.put(config.key, '1', { expirationTtl: config.windowSeconds });
  } else {
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

// ── MPAA rating permission helpers ────────────────────────────

type ContentRating = 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17';
type UserMode = 'child' | 'teen' | 'mature' | 'adult' | 'elder';

const RATING_ORDER: readonly ContentRating[] = ['G', 'PG', 'PG-13', 'R', 'NC-17'];

const MODE_MAX_RATING: Record<UserMode, ContentRating> = {
  child: 'G',
  teen: 'PG-13',
  mature: 'R',
  adult: 'NC-17',
  elder: 'PG',
};

const VALID_MODES: readonly string[] = ['child', 'teen', 'mature', 'adult', 'elder'];

/**
 * Resolve the maximum allowed content rating from the `X-User-Mode` header.
 *
 * If the header is missing or invalid the middleware defaults to `adult`
 * (NC-17) — downstream handlers that need stricter enforcement should
 * check `context.data.maxRating` explicitly.
 */
function resolveMaxRating(request: Request): ContentRating {
  const modeHeader = request.headers.get('X-User-Mode');
  if (modeHeader && VALID_MODES.includes(modeHeader)) {
    return MODE_MAX_RATING[modeHeader as UserMode];
  }
  // Default: no restriction (adult mode)
  return 'NC-17';
}

// ── Middleware entry point ─────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (context) => {
  // 1. Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return corsResponse();
  }

  // 2. Rate limiting (before JWT check)
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const url = new URL(context.request.url);
  const rlConfig = getRateLimitConfig(ip, url);
  const { allowed, retryAfter } = await checkRateLimit(context.env.KV, rlConfig);

  if (!allowed) {
    return rateLimitResponse(retryAfter);
  }

  // 3. JWT auth parsing — never blocks if missing/invalid
  const authHeader = context.request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = await verifyJwt(token, context.env.JWT_SECRET);
    if (user) {
      context.data.user = user;
    }
  }

  // 4. MPAA rating permission — attach maxRating for downstream handlers
  context.data.maxRating = resolveMaxRating(context.request);

  // Continue to the next handler, then apply CORS headers to the response
  const response = await context.next();
  return applyCors(response);
};
