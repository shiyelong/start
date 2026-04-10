/**
 * /api/verify/:id/vote — Vote (like/dislike) on a verification record + recalculate consensus
 *
 * POST /api/verify/:id/vote — Authenticated user votes on a record belonging to this item
 *
 * Body: { record_id: number, vote_type: 'like' | 'dislike' }
 *
 * Validates: Requirement 7 (AC1–AC7)
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
      resolved[field] = entries[0].new_value;
    } else if (entries.length === 2) {
      if (entries[0].new_value === entries[1].new_value) {
        resolved[field] = entries[0].new_value;
      } else {
        resolved[field] =
          entries[0].likes >= entries[1].likes
            ? entries[0].new_value
            : entries[1].new_value;
      }
    } else {
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


// ── POST /api/verify/:id/vote ─────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // 1. requireAuth
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  // 2. Validate item id param
  const rawId = context.params.id;
  const itemId = Number(rawId);
  if (!rawId || isNaN(itemId) || !Number.isInteger(itemId) || itemId <= 0) {
    return errorResponse('Invalid verify item ID', 400);
  }

  // 3. Check item exists
  const item = await queryOne<Record<string, unknown>>(
    DB,
    'SELECT id FROM verify_items WHERE id = ?',
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

  const recordId = typeof body.record_id === 'number' ? body.record_id : Number(body.record_id);
  const voteType = typeof body.vote_type === 'string' ? body.vote_type : '';

  if (!recordId || isNaN(recordId) || !Number.isInteger(recordId) || recordId <= 0) {
    return errorResponse('Missing or invalid record_id', 400);
  }
  if (voteType !== 'like' && voteType !== 'dislike') {
    return errorResponse('vote_type must be "like" or "dislike"', 400);
  }

  // 5. Validate record exists and belongs to this item
  const record = await queryOne<{ id: number; item_id: number; verifier_id: number; likes: number; dislikes: number }>(
    DB,
    'SELECT id, item_id, verifier_id, likes, dislikes FROM verify_records WHERE id = ?',
    [recordId],
  );
  if (!record) {
    return errorResponse('Verification record not found', 404);
  }
  if (record.item_id !== itemId) {
    return errorResponse('Record does not belong to this verify item', 400);
  }

  // 6. Check existing vote by this user on this record
  const existingVote = await queryOne<{ id: number; vote_type: string }>(
    DB,
    'SELECT id, vote_type FROM verify_votes WHERE record_id = ? AND user_id = ?',
    [recordId, user.id],
  );

  const now = new Date().toISOString();
  let likeDelta = 0;
  let dislikeDelta = 0;

  if (!existingVote) {
    // No existing vote → insert new vote, increment the appropriate count
    await execute(
      DB,
      'INSERT INTO verify_votes (record_id, user_id, vote_type, created_at) VALUES (?, ?, ?, ?)',
      [recordId, user.id, voteType, now],
    );
    if (voteType === 'like') {
      likeDelta = 1;
    } else {
      dislikeDelta = 1;
    }
  } else if (existingVote.vote_type === voteType) {
    // Same vote type → toggle off (remove vote), decrement count
    await execute(
      DB,
      'DELETE FROM verify_votes WHERE id = ?',
      [existingVote.id],
    );
    if (voteType === 'like') {
      likeDelta = -1;
    } else {
      dislikeDelta = -1;
    }
  } else {
    // Different vote type → update vote, adjust both counts
    await execute(
      DB,
      'UPDATE verify_votes SET vote_type = ?, created_at = ? WHERE id = ?',
      [voteType, now, existingVote.id],
    );
    if (voteType === 'like') {
      // Was dislike, now like
      likeDelta = 1;
      dislikeDelta = -1;
    } else {
      // Was like, now dislike
      likeDelta = -1;
      dislikeDelta = 1;
    }
  }

  // 7. Update record likes/dislikes counts
  if (likeDelta !== 0 || dislikeDelta !== 0) {
    await execute(
      DB,
      'UPDATE verify_records SET likes = likes + ?, dislikes = dislikes + ? WHERE id = ?',
      [likeDelta, dislikeDelta, recordId],
    );
  }

  // 8. Update record owner's reputation/like_count when likes change (AC7)
  if (likeDelta !== 0 && record.verifier_id !== user.id) {
    await execute(
      DB,
      'UPDATE users SET reputation = reputation + ?, like_count = like_count + ?, updated_at = ? WHERE id = ?',
      [likeDelta, likeDelta, now, record.verifier_id],
    );
  }

  // 9. Recalculate consensus for the item (AC5, AC6)
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

  // 10. Return updated record
  const updatedRecord = await queryOne(
    DB,
    'SELECT * FROM verify_records WHERE id = ?',
    [recordId],
  );

  return jsonResponse(updatedRecord);
};
