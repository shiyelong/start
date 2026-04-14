/**
 * /api/zone/services/[id] — Service provider detail
 *
 * GET /api/zone/services/[id] — Get provider detail with reviews
 */

import { queryOne, query, jsonResponse, errorResponse } from '../../../_lib/db';
import { handleError } from '../../../_lib/errors';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const id = (context.params as Record<string, string>).id;

    const provider = await queryOne(DB, 'SELECT * FROM service_providers WHERE id = ?', [id]);
    if (!provider) {
      return errorResponse('Provider not found', 404);
    }

    const reviews = await query(
      DB,
      'SELECT * FROM service_reviews WHERE provider_id = ? ORDER BY created_at DESC LIMIT 20',
      [id],
    );

    return jsonResponse({ provider, reviews });
  } catch (err) {
    return handleError(err);
  }
};
