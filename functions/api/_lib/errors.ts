/**
 * Standardized error classes and unified error handler for API routes.
 *
 * - `APIError` — thrown by handlers when a known error condition occurs.
 * - `SourceError` — thrown by aggregation source adapters; does NOT abort
 *   the overall search (the aggregator catches these per-source).
 * - `handleError()` — converts any thrown value into a JSON Response,
 *   hiding internal details from the client.
 *
 * (Design doc § 错误处理)
 */

import { jsonResponse } from './db';

// ── Error classes ─────────────────────────────────────────────

/**
 * A known, client-safe API error.
 *
 * @param statusCode  HTTP status code (4xx / 5xx).
 * @param message     Human-readable message returned to the client.
 * @param code        Optional machine-readable error code (e.g. `RATE_LIMITED`).
 */
export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * An error originating from a single aggregation source.
 *
 * The aggregator engine catches these per-source so that one failing
 * source does not break the entire search.
 */
export class SourceError extends Error {
  constructor(
    public sourceId: string,
    public sourceName: string,
    message: string,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

// ── Unified error handler ─────────────────────────────────────

/**
 * Convert any thrown value into a well-formed JSON Response.
 *
 * - `APIError` instances produce the exact status code and message.
 * - Everything else produces a generic 500 to avoid leaking internals.
 */
export function handleError(error: unknown): Response {
  if (error instanceof APIError) {
    return jsonResponse(
      { error: error.message, ...(error.code ? { code: error.code } : {}) },
      error.statusCode,
    );
  }

  // Unknown / unexpected error — log but never expose details
  console.error('Unhandled error:', error);
  return jsonResponse({ error: '服务暂时不可用，请稍后重试' }, 500);
}
