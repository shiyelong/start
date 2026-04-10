/**
 * Input validation and sanitization utilities.
 *
 * Reusable helpers for validating and sanitizing user input across
 * all API handlers. The primary SQL injection defence is parameterized
 * queries (see db.ts); these helpers add defence-in-depth by ensuring
 * inputs are well-formed before they reach the database layer.
 *
 * (Requirement 21 AC3 — validate and sanitize all user input)
 */

// ── Sanitization ──────────────────────────────────────────────

/**
 * Trim whitespace, strip control characters, and enforce a maximum length.
 *
 * @param input     Raw string from user input.
 * @param maxLength Maximum allowed length (default 1000).
 * @returns Sanitized string.
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  // Strip ASCII control characters (0x00-0x1F) except common whitespace (\n \r \t)
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  const trimmed = cleaned.trim();
  return trimmed.slice(0, maxLength);
}

/**
 * Escape HTML entities to prevent XSS in stored content.
 *
 * Covers the five critical characters: & < > " '
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Validators ────────────────────────────────────────────────

/**
 * Return true if the value looks like a valid email address.
 * Uses a pragmatic regex — not RFC 5322 exhaustive, but catches
 * the vast majority of real-world addresses.
 */
export function validateEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Return true if the value is a positive integer (> 0).
 * Accepts both number and numeric string inputs.
 */
export function validateId(id: unknown): boolean {
  const n = typeof id === 'string' ? Number(id) : id;
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

/**
 * Return true if the value is one of the allowed enum values.
 */
export function validateEnum(value: string, allowed: readonly string[]): boolean {
  return allowed.includes(value);
}

/**
 * Return true if the string length is within [min, max] (inclusive).
 */
export function validateLength(str: string, min: number, max: number): boolean {
  if (typeof str !== 'string') return false;
  return str.length >= min && str.length <= max;
}
