/**
 * /api/verify/:id — Verify item detail
 *
 * GET /api/verify/:id — Return full item with verify records and resolved fields
 *
 * Validates: Requirement 5 AC5
 */

import { query, queryOne, jsonResponse, errorResponse } from '../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── GET /api/verify/:id ───────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // 1. Extract and validate id
  const rawId = context.params.id;
  const id = Number(rawId);
  if (!rawId || isNaN(id) || !Number.isInteger(id) || id <= 0) {
    return errorResponse('Invalid verify item ID', 400);
  }

  // 2. Query verify_items by id
  const item = await queryOne(DB, 'SELECT * FROM verify_items WHERE id = ?', [id]);

  if (!item) {
    return errorResponse('Verify item not found', 404);
  }

  // 3. Query all verify_records for this item, ordered by created_at DESC
  const records = await query(
    DB,
    'SELECT * FROM verify_records WHERE item_id = ? ORDER BY created_at DESC',
    [id],
  );

  // 4. Parse JSON fields on the item
  for (const field of ['info', 'tags', 'resolved_fields']) {
    if (typeof (item as Record<string, unknown>)[field] === 'string') {
      try {
        (item as Record<string, unknown>)[field] = JSON.parse(
          (item as Record<string, unknown>)[field] as string,
        );
      } catch {
        // keep as string if parse fails
      }
    }
  }

  // 5. Return item + records
  return jsonResponse({ item, records });
};
