/**
 * Database utility functions for Cloudflare D1.
 *
 * Thin abstraction over D1 parameterized queries.
 * All SQL is executed via bind parameters — never string interpolation —
 * to prevent SQL injection (Requirement 21 AC3-4).
 *
 * The interface is intentionally minimal so that swapping D1 for
 * PostgreSQL later requires only replacing this module (Requirement 20 AC2).
 */

// ── Query helpers ─────────────────────────────────────────────

/** Execute a parameterized SELECT and return all matching rows. */
export async function query<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.all<T>();
  return result.results;
}

/** Execute a parameterized SELECT and return the first row, or null. */
export async function queryOne<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const stmt = db.prepare(sql).bind(...params);
  const row = await stmt.first<T>();
  return row ?? null;
}

/** Execute a parameterized INSERT / UPDATE / DELETE and return metadata. */
export async function execute(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<{ lastRowId: number; changes: number }> {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.run();
  return {
    lastRowId: result.meta.last_row_id ?? 0,
    changes: result.meta.changes ?? 0,
  };
}

// ── Pagination ────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Run a paginated SELECT.
 *
 * @param db        D1 database binding
 * @param sql       The base SELECT (without LIMIT/OFFSET — they are appended)
 * @param countSql  A matching `SELECT COUNT(*)` query for the total
 * @param params    Bind parameters shared by both queries
 * @param page      1-based page number
 * @param pageSize  Rows per page
 */
export async function paginate<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  countSql: string,
  params: unknown[] = [],
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<T>> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const [items, countRow] = await Promise.all([
    query<T>(db, `${sql} LIMIT ? OFFSET ?`, [...params, safePageSize, offset]),
    queryOne<{ 'COUNT(*)': number }>(db, countSql, params),
  ]);

  const total = countRow?.['COUNT(*)'] ?? 0;

  return {
    items,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(total / safePageSize),
  };
}

// ── Response helpers ──────────────────────────────────────────

/** Create a JSON Response with the given data and status code. */
export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Create an error JSON Response. */
export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ error: message }, status);
}
