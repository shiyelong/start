/**
 * Domain fallback and health-check utility.
 *
 * - Maintains a list of backup domains
 * - Periodically checks domain health via lightweight HEAD requests
 * - Automatically switches to a healthy backup domain when the primary fails
 * - Domain list can be fetched from KV via API or hardcoded as defaults
 *
 * Validates: Requirements 47.9, 47.10
 */

// ── Types ─────────────────────────────────────────────────────

export interface DomainEntry {
  /** Full origin, e.g. "https://star.example.com" */
  url: string;
  /** Whether this domain is currently reachable */
  healthy: boolean;
  /** Timestamp of last health check (ms) */
  lastChecked: number;
  /** Average response time in ms (0 if unknown) */
  avgResponseMs: number;
}

export interface DomainFallbackConfig {
  /** Health check interval in milliseconds. Default: 5 minutes */
  checkIntervalMs: number;
  /** Request timeout for health checks in milliseconds. Default: 5 seconds */
  healthTimeoutMs: number;
  /** Maximum number of consecutive failures before marking unhealthy */
  maxFailures: number;
}

// ── Constants ─────────────────────────────────────────────────

const STORAGE_KEY = 'starhub_domains';
const ACTIVE_DOMAIN_KEY = 'starhub_active_domain';

const DEFAULT_CONFIG: DomainFallbackConfig = {
  checkIntervalMs: 5 * 60 * 1000, // 5 minutes
  healthTimeoutMs: 5000,           // 5 seconds
  maxFailures: 3,
};

// ── State ─────────────────────────────────────────────────────

let domains: DomainEntry[] = [];
let config: DomainFallbackConfig = { ...DEFAULT_CONFIG };
let checkTimer: ReturnType<typeof setInterval> | null = null;
let failureCounts: Map<string, number> = new Map();

// ── Storage helpers ───────────────────────────────────────────

function loadDomains(): DomainEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as DomainEntry[];
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveDomains(entries: DomainEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage may be full or unavailable
  }
}

function getActiveDomain(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_DOMAIN_KEY);
  } catch {
    return null;
  }
}

function setActiveDomain(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_DOMAIN_KEY, url);
  } catch {
    // Ignore
  }
}

// ── Health check ──────────────────────────────────────────────

/**
 * Check if a single domain is reachable via a lightweight HEAD request.
 * Returns response time in ms, or -1 if unreachable.
 */
async function checkDomainHealth(domainUrl: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.healthTimeoutMs);

  try {
    const start = performance.now();
    const response = await fetch(`${domainUrl}/api/health`, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    const elapsed = performance.now() - start;

    if (response.ok || response.status === 204 || response.status === 404) {
      // 404 is acceptable — the domain is reachable even if /api/health isn't defined
      return Math.round(elapsed);
    }
    return -1;
  } catch {
    return -1;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run health checks on all configured domains and update their status.
 */
export async function runHealthChecks(): Promise<DomainEntry[]> {
  const now = Date.now();
  const results = await Promise.allSettled(
    domains.map(async (domain) => {
      const responseMs = await checkDomainHealth(domain.url);
      const failures = failureCounts.get(domain.url) || 0;

      if (responseMs >= 0) {
        failureCounts.set(domain.url, 0);
        return {
          ...domain,
          healthy: true,
          lastChecked: now,
          avgResponseMs: domain.avgResponseMs > 0
            ? Math.round((domain.avgResponseMs + responseMs) / 2)
            : responseMs,
        };
      }

      const newFailures = failures + 1;
      failureCounts.set(domain.url, newFailures);
      return {
        ...domain,
        healthy: newFailures < config.maxFailures ? domain.healthy : false,
        lastChecked: now,
      };
    }),
  );

  domains = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { ...domains[i], lastChecked: now },
  );

  saveDomains(domains);
  return domains;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Initialize the domain fallback system with a list of domains.
 *
 * @param domainUrls  Array of domain origins (e.g. ["https://a.com", "https://b.com"])
 * @param userConfig  Optional configuration overrides
 */
export function initDomainFallback(
  domainUrls: string[],
  userConfig?: Partial<DomainFallbackConfig>,
): void {
  config = { ...DEFAULT_CONFIG, ...userConfig };

  // Load cached state or initialize fresh
  const cached = loadDomains();
  const cachedMap = new Map(cached.map((d) => [d.url, d]));

  domains = domainUrls.map((url) => {
    const existing = cachedMap.get(url);
    if (existing) return existing;
    return {
      url,
      healthy: true, // Assume healthy until proven otherwise
      lastChecked: 0,
      avgResponseMs: 0,
    };
  });

  failureCounts = new Map();
  saveDomains(domains);
}

/**
 * Start periodic health checks.
 */
export function startHealthChecks(): void {
  if (typeof window === 'undefined') return;
  stopHealthChecks();

  // Run immediately, then on interval
  runHealthChecks();
  checkTimer = setInterval(() => {
    runHealthChecks();
  }, config.checkIntervalMs);
}

/**
 * Stop periodic health checks.
 */
export function stopHealthChecks(): void {
  if (checkTimer !== null) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

/**
 * Get the best available domain (healthy, lowest response time).
 * Falls back to the first domain if none are healthy.
 */
export function getBestDomain(): string {
  // Check if we have a manually set active domain that's still healthy
  const active = getActiveDomain();
  if (active) {
    const activeDomain = domains.find((d) => d.url === active);
    if (activeDomain?.healthy) return active;
  }

  // Find the healthiest domain with lowest response time
  const healthy = domains
    .filter((d) => d.healthy)
    .sort((a, b) => a.avgResponseMs - b.avgResponseMs);

  if (healthy.length > 0) {
    const best = healthy[0].url;
    setActiveDomain(best);
    return best;
  }

  // No healthy domains — return the first one as a last resort
  if (domains.length > 0) {
    return domains[0].url;
  }

  // No domains configured — return current origin
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Get the current list of domains with their health status.
 */
export function getDomainStatus(): DomainEntry[] {
  return [...domains];
}

/**
 * Manually switch to a specific domain.
 */
export function switchToDomain(domainUrl: string): void {
  setActiveDomain(domainUrl);
  if (typeof window !== 'undefined') {
    const path = window.location.pathname + window.location.search;
    window.location.href = `${domainUrl}${path}`;
  }
}

/**
 * Attempt a fetch with automatic domain fallback.
 * If the primary domain fails, tries backup domains in order.
 */
export async function fetchWithFallback(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const sortedDomains = [...domains]
    .filter((d) => d.healthy)
    .sort((a, b) => a.avgResponseMs - b.avgResponseMs);

  // Add unhealthy domains at the end as last resort
  const unhealthy = domains.filter((d) => !d.healthy);
  const allDomains = [...sortedDomains, ...unhealthy];

  let lastError: Error | null = null;

  for (const domain of allDomains) {
    try {
      const response = await fetch(`${domain.url}${path}`, {
        ...options,
        signal: options?.signal ?? AbortSignal.timeout(config.healthTimeoutMs * 2),
      });

      if (response.ok || response.status < 500) {
        // Success or client error — domain is reachable
        setActiveDomain(domain.url);
        return response;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Mark this domain as potentially unhealthy
      const failures = (failureCounts.get(domain.url) || 0) + 1;
      failureCounts.set(domain.url, failures);
      if (failures >= config.maxFailures) {
        const entry = domains.find((d) => d.url === domain.url);
        if (entry) entry.healthy = false;
      }
    }
  }

  throw lastError ?? new Error('All domains unreachable');
}
