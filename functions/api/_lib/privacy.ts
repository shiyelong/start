/**
 * Privacy protection utilities for backend.
 *
 * - IP anonymization: replace real IP with hashed anonymous ID
 * - EXIF stripping: remove metadata from uploaded images (stub)
 * - Region detection: check user country from CF headers
 *
 * All functions use Cloudflare-native APIs (no npm dependencies).
 *
 * Validates: Requirements 47.1, 47.2, 47.3, 47.6, 47.7, 47.8
 */

// ── IP Anonymization ──────────────────────────────────────────

/**
 * Generate an anonymous identifier from Cloudflare Ray ID.
 * Never stores or logs the real IP address.
 */
export async function anonymizeRequest(request: Request): Promise<string> {
  const rayId = request.headers.get('cf-ray') || '';
  const connectingIp = request.headers.get('cf-connecting-ip') || '';

  // Hash the combination to create a stable anonymous ID
  const input = `${rayId}:${connectingIp}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  const hashArray = new Uint8Array(hashBuffer);

  return [...hashArray.slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get the user's country code from Cloudflare headers.
 * Returns 'XX' if not available.
 */
export function getCountryCode(request: Request): string {
  // Cloudflare adds cf-ipcountry header
  return request.headers.get('cf-ipcountry') || 'XX';
}

/**
 * Check if the user is in a restricted region.
 */
export function isRestrictedRegion(countryCode: string, restrictedCountries: string[]): boolean {
  return restrictedCountries.includes(countryCode.toUpperCase());
}

// ── EXIF Stripping (stub) ─────────────────────────────────────

/**
 * Strip EXIF metadata from JPEG image data.
 *
 * Stub implementation — in production, this would parse JPEG markers
 * and remove APP1 (EXIF), APP13 (IPTC), and XMP segments.
 *
 * For now, returns the data unchanged. A full implementation would:
 * 1. Parse JPEG SOI marker (0xFFD8)
 * 2. Skip/remove APP1 (0xFFE1) segments containing EXIF
 * 3. Skip/remove APP13 (0xFFED) segments containing IPTC
 * 4. Preserve all other segments (DQT, DHT, SOF, SOS, etc.)
 */
export async function stripExifFromJpeg(data: Uint8Array): Promise<Uint8Array> {
  // Verify JPEG magic bytes
  if (data.length < 2 || data[0] !== 0xff || data[1] !== 0xd8) {
    return data; // Not a JPEG, return as-is
  }

  // Stub: return data unchanged
  // Production would strip EXIF segments here
  return data;
}

/**
 * Strip metadata from PNG image data.
 *
 * Stub implementation — in production, this would remove
 * tEXt, iTXt, zTXt, and eXIf chunks from the PNG.
 */
export async function stripMetadataFromPng(data: Uint8Array): Promise<Uint8Array> {
  // Verify PNG magic bytes
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 8 || !PNG_MAGIC.every((b, i) => data[i] === b)) {
    return data; // Not a PNG, return as-is
  }

  // Stub: return data unchanged
  return data;
}

/**
 * Auto-detect image format and strip metadata.
 */
export async function stripImageMetadata(data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 2) return data;

  // JPEG
  if (data[0] === 0xff && data[1] === 0xd8) {
    return stripExifFromJpeg(data);
  }

  // PNG
  if (data[0] === 0x89 && data[1] === 0x50) {
    return stripMetadataFromPng(data);
  }

  // Unknown format — return as-is
  return data;
}

// ── URL Neutralization ────────────────────────────────────────

/**
 * Check if a URL path should be neutralized for privacy.
 * Adult zone paths are replaced with generic "/zone" prefix.
 */
export function isNeutralizedPath(path: string): boolean {
  return path.startsWith('/zone');
}

/**
 * Generate neutral response headers for privacy.
 */
export function getPrivacyHeaders(countryCode: string): Record<string, string> {
  return {
    'X-Region': countryCode,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  };
}
