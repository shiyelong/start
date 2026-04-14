/**
 * Unified API client for StarHub platform.
 *
 * - Automatically attaches JWT Bearer token from localStorage
 * - Handles 401 by clearing auth state and redirecting to /login
 * - Handles 429 rate-limit responses with Retry-After back-off
 * - Wraps network errors with a consistent error type
 */

import { getToken, clearToken, clearUser } from './auth';
import type { APIErrorResponse, FetchAPIOptions } from './types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE
    ? process.env.NEXT_PUBLIC_API_BASE
    : '';

const MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

export class APIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders(options?: FetchAPIOptions): Headers {
  const headers = new Headers(options?.headers);

  if (!headers.has('Content-Type') && options?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return headers;
}

function redirectToLogin(): void {
  clearToken();
  clearUser();
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// fetchAPI — the main export
// ---------------------------------------------------------------------------

/**
 * Generic API fetch wrapper with automatic auth, error handling, and retry.
 *
 * @typeParam T - Expected JSON response type
 * @param url - API path (e.g. `/api/search?q=hello`)
 * @param options - Fetch options (body will be JSON-stringified automatically)
 * @returns Parsed JSON response of type T
 *
 * @throws {APIError} on HTTP errors (4xx/5xx) or network failures
 *
 * Behaviour:
 * - 401 → clears auth state, redirects to /login, throws APIError
 * - 429 → retries up to MAX_RETRIES times respecting Retry-After header
 * - Network error → throws APIError with status 0
 */
export async function fetchAPI<T>(
  url: string,
  options?: FetchAPIOptions,
): Promise<T> {
  const headers = buildHeaders(options);

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    body:
      options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  };

  let lastError: APIError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;

    try {
      res = await fetch(`${API_BASE}${url}`, fetchOptions);
    } catch (networkError) {
      throw new APIError(
        networkError instanceof Error
          ? networkError.message
          : 'Network request failed',
        0,
        'NETWORK_ERROR',
      );
    }

    // --- 401 Unauthorized ---
    if (res.status === 401) {
      redirectToLogin();
      throw new APIError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    // --- 429 Rate Limited ---
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader
        ? parseInt(retryAfterHeader, 10)
        : undefined;
      const delayMs =
        retryAfterSeconds !== undefined && !Number.isNaN(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : DEFAULT_RETRY_DELAY_MS;

      lastError = new APIError(
        'Rate limit exceeded',
        429,
        'RATE_LIMITED',
        retryAfterSeconds,
      );

      if (attempt < MAX_RETRIES) {
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    // --- Other errors ---
    if (!res.ok) {
      let errorBody: APIErrorResponse | null = null;
      try {
        errorBody = (await res.json()) as APIErrorResponse;
      } catch {
        // response body is not JSON — that's fine
      }

      throw new APIError(
        errorBody?.error ?? errorBody?.message ?? res.statusText,
        res.status,
        `HTTP_${res.status}`,
      );
    }

    // --- Success ---
    if (options?.rawResponse) {
      return res as unknown as T;
    }

    // Handle 204 No Content
    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return (await res.json()) as T;
  }

  // Should not reach here, but satisfy TypeScript
  throw lastError ?? new APIError('Unexpected error', 0, 'UNKNOWN');
}
