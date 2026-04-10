/**
 * Auth utilities for Cloudflare Pages Functions.
 *
 * - JWT sign / verify using Web Crypto HMAC-SHA256
 * - Password hashing using PBKDF2 (Web Crypto) — bcrypt-equivalent security
 * - requireAuth / requireRole helpers for downstream handlers
 *
 * All crypto uses the Web Crypto API available in Cloudflare Workers runtime.
 * No npm dependencies required.
 */

import { errorResponse } from './db';

// ── Types ─────────────────────────────────────────────────────

export interface JwtPayload {
  id: number;
  role: string;
  exp: number;
  iat: number;
}

export interface UserContext {
  id: number;
  role: string;
}

// ── Base64url helpers ─────────────────────────────────────────

function base64UrlEncode(data: Uint8Array): string {
  const binary = String.fromCharCode(...data);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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

// ── JWT ───────────────────────────────────────────────────────

/**
 * Create a JWT token signed with HMAC-SHA256 via Web Crypto.
 *
 * @param payload  Must include `id` (number) and `role` (string).
 * @param secret   HMAC secret (from env.JWT_SECRET).
 * @param expiresInDays  Token lifetime in days. Default 30 (Requirement 3 AC1).
 * @returns Signed JWT string (header.payload.signature).
 */
export async function signJwt(
  payload: { id: number; role: string },
  secret: string,
  expiresInDays: number = 30,
): Promise<string> {
  const encoder = new TextEncoder();

  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInDays * 24 * 60 * 60,
  };

  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${headerB64}.${payloadB64}`),
  );

  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Verify and decode a JWT token.
 *
 * @returns The decoded payload, or null if invalid / expired.
 */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
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
    const payload = JSON.parse(payloadJson) as JwtPayload;

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Validate required fields
    if (typeof payload.id !== 'number' || typeof payload.role !== 'string') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ── Password hashing (PBKDF2 via Web Crypto) ─────────────────
//
// Cloudflare Workers don't support native bcrypt, so we use PBKDF2
// with SHA-256, 100 000 iterations, and a random 16-byte salt.
// Stored format: `<hex-salt>:<hex-hash>` (Requirement 2 AC5).

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16; // bytes
const HASH_LENGTH = 32; // bytes (256 bits)

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Hash a password using PBKDF2-SHA256 (100 000 iterations, random salt).
 *
 * @returns String in `salt:hash` hex format, safe to store in the database.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_LENGTH * 8, // bits
  );

  return `${bufferToHex(salt.buffer)}:${bufferToHex(derivedBits)}`;
}

/**
 * Verify a password against a stored `salt:hash` string.
 *
 * @returns true if the password matches.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) return false;

    const salt = hexToBuffer(saltHex);
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      HASH_LENGTH * 8,
    );

    // Constant-time comparison
    const derived = new Uint8Array(derivedBits);
    const stored = hexToBuffer(hashHex);
    if (derived.length !== stored.length) return false;

    let diff = 0;
    for (let i = 0; i < derived.length; i++) {
      diff |= derived[i] ^ stored[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

// ── Auth guard helpers ────────────────────────────────────────

/**
 * Extract the authenticated user from context.data.user (set by middleware).
 *
 * @returns The UserContext, or a 401 Response if not authenticated.
 */
export function requireAuth(
  context: { data: Record<string, unknown> },
): UserContext | Response {
  const user = context.data.user as UserContext | undefined;
  if (!user) {
    return errorResponse('Unauthorized', 401);
  }
  return user;
}

/**
 * Like requireAuth, but also checks the user's role.
 *
 * @returns The UserContext, a 401 if not authenticated, or 403 if role mismatch
 *          (Requirement 4 AC4).
 */
export function requireRole(
  context: { data: Record<string, unknown> },
  role: string,
): UserContext | Response {
  const result = requireAuth(context);
  if (result instanceof Response) return result;

  if (result.role !== role && result.role !== 'admin') {
    return errorResponse('Forbidden', 403);
  }
  return result;
}
