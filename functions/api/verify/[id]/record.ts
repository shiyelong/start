/**
 * /api/verify/:id/record — Submit verification record + consensus calculation
 *
 * POST /api/verify/:id/record — Authenticated user submits a verification record
 *
 * Validates: Requirement 6 (AC1–AC6), Requirement 7 AC6 (Consensus Algorithm)
 */

import { requireAuth } from '../../_lib/auth';
import { query, queryOne, execute, jsonResponse, errorResponse } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── Consensus Algorithm (Requirement 7 AC6) ───────────────────

/**
 * Resolve field values from all records of a verify item.
 *
 * Rules:
 * - 1 record for a field → use that value
 * - 2 records with different values → use the one with more likes
 * - 3+ records → majority count first, then likes as tiebreaker
 */
function calculateConsensus(
  records: Array<{ field: string; new_value: string; likes: number }>,
): Record<string, string> {
  // Group records by field name
  const byField = new Map<string, Array<{ new_value: string; likes: number }>>();
  for (const r of records) {
    if (!byField.has(r.field)) {
      byField.set(r.field, []);
    }
    byField.get(r.field)!.push({ new_value: r.new_value, likes: r.likes });
  }

  const resolved: Record<string, string> = {};

  for (const [field, entries] of byField) {
    if (entries.length === 1) {
      // 1 record: use that value
      resolved[field] = entries[0].new_value;
    } else if (entries.length === 2) {
      // 2 records with different values: use the one with more likes
      if (entries[0].new_value === entries[1].new_value) {
        resolved[field] = entries[0].new_value;
      } else {
        resolved[field] =
          entries[0].likes >= entries[1].likes
            ? entries[0].new_value
            : entries[1].new_value;
      }
    } else {
      // 3+ records: majority count first, then likes as tiebreaker
      const valueCounts = new Map<string, { count: number; totalLikes: number }>();
      for (const e of entries) {
        const existing = valueCounts.get(e.new_value) || { count: 0, totalLikes: 0 };
        existing.count++;
        existing.totalLikes += e.likes;
        valueCounts.set(e.new_value, existing);
      }

      let bestValue = '';
      let bestCount = -1;
      let bestLikes = -1;

      for (const [value, stats] of valueCounts) {
        if (
          stats.count > bestCount ||
          (stats.count === bestCount && stats.totalLikes > bestLikes)
        ) {
          bestValue = value;
          bestCount = stats.count;
          bestLikes = stats.totalLikes;
        }
      }

      resolved[field] = bestValue;
    }
  }

  return resolved;
}

// ── POST /api/verify/:id/record ───────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // 1. requireAuth
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  // 2. Validate id param
  const rawId = context.params.id;
  const itemId = Number(rawId);
  if (!rawId || isNaN(itemId) || !Number.isInteger(itemId) || itemId <= 0) {
    return errorResponse('Invalid verify item ID', 400);
  }

  // 3. Check item exists
  const item = await queryOne<Record<string, unknown>>(
    DB,
    'SELECT * FROM verify_items WHERE id = ?',
    [itemId],
  );
  if (!item) {
    return errorResponse('Verify item not found', 404);
  }

  // 4. Parse and validate body
  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const field = typeof body.field === 'string' ? body.field.trim() : '';
  const newValue = typeof body.new_value === 'string' ? body.new_value.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const oldValue = typeof body.old_value === 'string' ? body.old_value.trim() : '';

  // AC5: Missing field, new_value, or reason → 400
  const missing: string[] = [];
  if (!field) missing.push('field');
  if (!newValue) missing.push('new_value');
  if (!reason) missing.push('reason');
  if (missing.length > 0) {
    return errorResponse(`Missing required fields: ${missing.join(', ')}`, 400);
  }

  // 5. Get user's username for verifier_name
  const userRow = await queryOne<{ username: string }>(
    DB,
    'SELECT username FROM users WHERE id = ?',
    [user.id],
  );
  const verifierName = userRow?.username ?? 'unknown';

  const now = new Date().toISOString();

  // 6. Insert verify_record
  const { lastRowId } = await execute(
    DB,
    `INSERT INTO verify_records (item_id, verifier_id, verifier_name, field, old_value, new_value, reason, likes, dislikes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    [itemId, user.id, verifierName, field, oldValue, newValue, reason, now],
  );

  // 7. Increment item.verify_count, user.verify_count, user.reputation
  await execute(
    DB,
    'UPDATE verify_items SET verify_count = verify_count + 1, updated_at = ? WHERE id = ?',
    [now, itemId],
  );
  await execute(
    DB,
    'UPDATE users SET verify_count = verify_count + 1, reputation = reputation + 1, updated_at = ? WHERE id = ?',
    [now, user.id],
  );

  // 8. Update item status to "verified" if it was "unverified" (AC2)
  if (item.status === 'unverified') {
    await execute(
      DB,
      'UPDATE verify_items SET status = ?, updated_at = ? WHERE id = ?',
      ['verified', now, itemId],
    );
  }

  // 9. Recalculate resolved_fields using consensus algorithm
  const allRecords = await query<{ field: string; new_value: string; likes: number }>(
    DB,
    'SELECT field, new_value, likes FROM verify_records WHERE item_id = ?',
    [itemId],
  );

  const resolvedFields = calculateConsensus(allRecords);

  await execute(
    DB,
    'UPDATE verify_items SET resolved_fields = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(resolvedFields), now, itemId],
  );

  // 10. Return the created record
  const record = await queryOne(
    DB,
    'SELECT * FROM verify_records WHERE id = ?',
    [lastRowId],
  );

  return jsonResponse(record, 201);
};
