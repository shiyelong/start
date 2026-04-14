/**
 * Novel chapter content API.
 *
 * GET /api/novel/[id]/chapter/[chapterId] — get novel chapter text content
 *
 * Returns the text content and title for a given novel chapter. In a full
 * implementation this would fetch content from the configured novel source
 * adapters. For now it returns a structured response that the Novel_Reader
 * component can consume.
 *
 * Validates: Requirements 23.8
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

    const novelId = context.params.id;
    const chapterId = context.params.chapterId;

    if (!novelId || typeof novelId !== 'string') {
      throw new APIError(400, 'Missing novel id');
    }
    if (!chapterId || typeof chapterId !== 'string') {
      throw new APIError(400, 'Missing chapter id');
    }

    const sanitizedNovelId = sanitizeString(novelId, 500);
    const sanitizedChapterId = sanitizeString(chapterId, 500);

    // In a full implementation, this would:
    // 1. Look up the novel source from source_config
    // 2. Use the appropriate source adapter to fetch chapter content
    // 3. Return the chapter text through Cloudflare Workers proxy
    //
    // For now, return a structured placeholder that the frontend
    // Novel_Reader component can work with. The aggregation engine
    // (Task 20.2) will wire up real source adapters later.

    return jsonResponse({
      novelId: sanitizedNovelId,
      chapterId: sanitizedChapterId,
      title: '',
      content: '',
      message: 'Novel source adapters not yet configured. Connect a source via the admin panel.',
    });
  } catch (error) {
    return handleError(error);
  }
};
