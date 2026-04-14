/**
 * Search suggestions API.
 *
 * GET /api/search/suggestions — return up to 8 keyword suggestions
 *
 * Query params:
 *   q (required) — partial search query
 *
 * Returns: { suggestions: string[] }
 *
 * For now returns mock suggestions based on query matching.
 * Will be replaced with real search index / analytics data later.
 *
 * Validates: Requirements 27.5, 27.6
 */

import { jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString } from '../_lib/validate';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const MAX_SUGGESTIONS = 8;

/**
 * Static suggestion pool — covers popular content across all types.
 * Once real analytics are available, suggestions will come from
 * search frequency data stored in D1.
 */
const SUGGESTION_POOL: string[] = [
  // Anime
  '进击的巨人 最终季',
  '进击的巨人 第一季',
  '鬼灭之刃 无限列车',
  '鬼灭之刃 柱训练篇',
  '海贼王 最新集',
  '海贼王 剧场版',
  '咒术回战 第二季',
  '间谍过家家',
  '葬送的芙莉莲',
  '药屋少女的呢喃',
  // Music
  '周杰伦 晴天',
  '周杰伦 稻香',
  '周杰伦 演唱会',
  'YOASOBI 夜に駆ける',
  'YOASOBI アイドル',
  'Taylor Swift Eras Tour',
  'Taylor Swift Anti-Hero',
  // Novel
  '斗破苍穹 动漫',
  '斗破苍穹 小说',
  '三体 动画',
  '三体 小说',
  '诡秘之主',
  // Games
  '原神 攻略',
  '原神 角色',
  '英雄联盟 赛事',
  '英雄联盟 攻略',
  '王者荣耀',
  // Live
  '斗鱼 游戏直播',
  '虎牙 英雄联盟',
  // General
  '科幻电影',
  '恋爱动漫',
  '热血漫画',
  '悬疑小说',
  '流行音乐',
  '科技播客',
];

// ── GET handler ───────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200).toLowerCase();

    // Match suggestions that contain the query string
    const matches = SUGGESTION_POOL
      .filter((s) => s.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);

    return jsonResponse({ suggestions: matches });
  } catch (error) {
    return handleError(error);
  }
};
