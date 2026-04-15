/**
 * GET /api/rating/config — Get default MPAA rating configuration
 *
 * Returns the rating levels, mode-to-max-rating mapping,
 * and source auto-rating defaults.
 *
 * Validates: Requirement 14.8, 14.15
 */

import { jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';
import {
  RATING_ORDER,
  MODE_MAX_RATING,
  type ContentRating,
  type UserMode,
} from '../_lib/rating';

interface Env {
  DB: D1Database;
}

const RATING_DESCRIPTIONS: Record<ContentRating, string> = {
  'G': '大众级 — 所有年龄段适宜',
  'PG': '辅导级 — 建议家长指导',
  'PG-13': '特别辅导级 — 13岁以下需家长陪同',
  'R': '限制级 — 17岁以下需家长陪同',
  'NC-17': '成人级 — 仅限成人',
};

const MODE_DESCRIPTIONS: Record<UserMode, string> = {
  child: '儿童模式 — 仅显示 G 级内容',
  teen: '青少年模式 — 显示 G 至 PG-13 级内容',
  mature: '成熟模式 — 显示 G 至 R 级内容',
  adult: '成人模式 — 显示所有内容',
  elder: '长辈模式 — 仅显示 G 和 PG 级内容',
};

export const onRequestGet: PagesFunction<Env> = async () => {
  try {
    return jsonResponse({
      ratings: RATING_ORDER.map((rating) => ({
        level: rating,
        description: RATING_DESCRIPTIONS[rating],
        index: RATING_ORDER.indexOf(rating),
      })),
      modeMaxRating: Object.entries(MODE_MAX_RATING).map(([mode, maxRating]) => ({
        mode,
        maxRating,
        description: MODE_DESCRIPTIONS[mode as UserMode],
      })),
      ratingOrder: [...RATING_ORDER],
    });
  } catch (error) {
    return handleError(error);
  }
};
