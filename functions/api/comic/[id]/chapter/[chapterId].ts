/**
 * Comic chapter pages API.
 *
 * GET /api/comic/[id]/chapter/[chapterId] — get comic chapter pages
 *
 * Returns page image URLs for a given comic chapter. In a full implementation
 * this would fetch pages from the configured comic source adapters. For now
 * it returns a structured response that the Comic_Reader component can consume.
 *
 * Validates: Requirements 18.8
 */

import { requireAuth } from '../../../_lib/auth';
import { jsonResponse } from '../../../_lib/db';
import { APIError, handleError } from '../../../_lib/errors';
import { sanitizeString } from '../../../_lib/validate';

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const comicId = context.params.id;
    const chapterId = context.params.chapterId;

    if (!comicId || typeof comicId !== 'string') {
      throw new APIError(400, 'Missing comic id');
    }
    if (!chapterId || typeof chapterId !== 'string') {
      throw new APIError(400, 'Missing chapter id');
    }

    const sanitizedComicId = sanitizeString(comicId, 500);
    const sanitizedChapterId = sanitizeString(chapterId, 500);

    // In a full implementation, this would:
    // 1. Look up the comic source from source_config
    // 2. Use the appropriate source adapter to fetch chapter pages
    // 3. Proxy image URLs through Cloudflare Workers
    //
    // For now, return a structured placeholder that the frontend
    // Comic_Reader component can work with. The aggregation engine
    // (Task 19.2) will wire up real source adapters later.

    return jsonResponse({
      comicId: sanitizedComicId,
      chapterId: sanitizedChapterId,
      pages: [],
      totalPages: 0,
      message: 'Comic source adapters not yet configured. Connect a source via the admin panel.',
    });
  } catch (error) {
    return handleError(error);
  }
};
