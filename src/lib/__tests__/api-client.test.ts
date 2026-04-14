/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APIError, fetchAPI } from '../api-client';

// ---------------------------------------------------------------------------
// Mock auth module
// ---------------------------------------------------------------------------

vi.mock('../auth', () => ({
  getToken: vi.fn(() => 'test-jwt-token'),
  clearToken: vi.fn(),
  clearUser: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn<(...args: unknown[]) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  const h = new Headers(headers);
  if (!h.has('Content-Type')) {
    h.set('Content-Type', 'application/json');
  }
  return new Response(JSON.stringify(body), { status, headers: h });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchAPI', () => {
  it('should make a GET request and return parsed JSON', async () => {
    const data = { items: [], total: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(data));

    const result = await fetchAPI<typeof data>('/api/search?q=test');

    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/search?q=test');
    expect(new Headers(options.headers).get('Authorization')).toBe(
      'Bearer test-jwt-token',
    );
  });

  it('should send JSON body for POST requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    await fetchAPI('/api/video/favorite', {
      method: 'POST',
      body: { videoId: 'v1' },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ videoId: 'v1' }));
    expect(new Headers(options.headers).get('Content-Type')).toBe(
      'application/json',
    );
  });

  it('should handle 204 No Content', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const result = await fetchAPI('/api/notify/read-all', { method: 'PUT' });
    expect(result).toBeUndefined();
  });

  describe('401 Unauthorized', () => {
    it('should throw APIError on 401', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Unauthorized' }, 401),
      );

      await expect(fetchAPI('/api/auth/me')).rejects.toThrow(APIError);
    });

    it('should throw with status 401 and code UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Unauthorized' }, 401),
      );

      try {
        await fetchAPI('/api/auth/me');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        const apiErr = err as APIError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('429 Rate Limited', () => {
    it('should retry and eventually throw if all retries exhausted', async () => {
      const rateLimitResponse = () =>
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Retry-After': '0' },
        });

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse())
        .mockResolvedValueOnce(rateLimitResponse())
        .mockResolvedValueOnce(rateLimitResponse());

      await expect(fetchAPI('/api/search?q=test')).rejects.toThrow(APIError);
      // Initial attempt + MAX_RETRIES (2) = 3 total calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should succeed if a retry returns 200', async () => {
      const rateLimitResponse = new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { 'Retry-After': '0' } },
      );

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const result = await fetchAPI<{ ok: boolean }>('/api/search?q=test');
      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should include retryAfter in the error', async () => {
      const rateLimitResponse = () =>
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Retry-After': '0' },
        });

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse())
        .mockResolvedValueOnce(rateLimitResponse())
        .mockResolvedValueOnce(rateLimitResponse());

      try {
        await fetchAPI('/api/search?q=test');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        const apiErr = err as APIError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.code).toBe('RATE_LIMITED');
        // Retry-After header value '0' is parsed as 0
        expect(apiErr.retryAfter).toBe(0);
      }
    });
  });

  describe('Network errors', () => {
    it('should throw APIError with status 0 on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await fetchAPI('/api/search?q=test');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        const apiErr = err as APIError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.code).toBe('NETWORK_ERROR');
        expect(apiErr.message).toBe('Failed to fetch');
      }
    });
  });

  describe('Other HTTP errors', () => {
    it('should throw APIError with parsed error body', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Not found' }, 404),
      );

      try {
        await fetchAPI('/api/video/nonexistent');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        const apiErr = err as APIError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.message).toBe('Not found');
        expect(apiErr.code).toBe('HTTP_404');
      }
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      );

      try {
        await fetchAPI('/api/broken');
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        const apiErr = err as APIError;
        expect(apiErr.status).toBe(500);
      }
    });
  });
});
