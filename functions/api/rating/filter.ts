/**
 * GET /api/rating/filter — Get filter rules based on user mode
 *
 * Query params: mode (optional, defaults to user's stored mode)
 *
 * Returns the maximum allowed rating and list of allowed ratings
 * for the given user mode.
 *
 * Validates: Requirement 14.9, 14.12, 14.16
 */

import { requireAuth } from '../_lib/auth';
import { queryOne, jsonResponse, errorResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';
import {
  RATING_ORDER,
  MODE_MAX_RATING,
  type ContentRating,
  type UserMode,
} from '../_lib/rating';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const VALID_MODES: UserMode[] = ['child', 'teen', 'mature', 'adult', 'elder'];

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    let mode = url.searchParams.get('mode') as UserMode | null;

    // If no mode specified, get from user settings
    if (!mode) {
      const settings = await queryOne<{ age_mode: string }>(
        context.env.DB,
        'SELECT age_mode FROM user_settings WHERE user_id = ?',
        [user.id],
      ).catch(() => null);

      mode = (settings?.age_mode as UserMode) || 'teen';
    }

    if (!VALID_MODES.includes(mode)) {
      return errorResponse(`Invalid mode. Allowed: ${VALID_MODES.join(', ')}`, 400);
    }

    const maxRating = MODE_MAX_RATING[mode];
    const maxIndex = RATING_ORDER.indexOf(maxRating);

    // All ratings at or below the max
    const allowedRatings = RATING_ORDER.slice(0, maxIndex + 1);

    // Content types visible in this mode
    const visibleTypes: string[] = ['video', 'music', 'comic', 'novel', 'anime', 'game', 'live', 'podcast'];
    if (mode === 'child') {
      // Children only see basic content types
      visibleTypes.length = 0;
      visibleTypes.push('video', 'music', 'game');
    } else if (mode === 'elder') {
      visibleTypes.length = 0;
      visibleTypes.push('video', 'music');
    }

    return jsonResponse({
      mode,
      maxRating,
      allowedRatings: [...allowedRatings],
      visibleTypes,
      adultZoneVisible: mode === 'adult',
    });
  } catch (error) {
    return handleError(error);
  }
};
