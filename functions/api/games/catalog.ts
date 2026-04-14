/**
 * /api/games/catalog — Game catalog with filtering
 *
 * GET /api/games/catalog — Public endpoint, returns game catalog
 *   Query params: platform?, type?, rating?, sortBy?, page?, pageSize?
 *
 * The game catalog is stored as static data (mirrors the frontend MOCK_GAMES).
 * Filtering is done server-side based on query params and user's AgeGate mode.
 *
 * Validates: Requirement 6.10, 6.11, 7.4
 */

import { jsonResponse, errorResponse } from '../_lib/db';
import {
  type ContentRating,
  isRatingAllowed,
  type UserMode,
  MODE_MAX_RATING,
} from '../_lib/rating';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── Types ─────────────────────────────────────────────────────

type GamePlatform = 'PC' | '手机' | 'NS' | 'PS' | 'Xbox' | '网页游戏';

type GameGenre =
  | '益智' | '策略' | 'RPG' | '动作' | '模拟经营'
  | '赛车' | '卡牌' | '解谜' | '音乐' | '塔防'
  | '沙盒' | '体育' | '棋牌' | '射击' | '休闲';

interface GameCatalogItem {
  id: string;
  name: string;
  cover: string;
  platforms: GamePlatform[];
  genre: GameGenre;
  rating: ContentRating;
  score: number;
  popularity: number;
  updatedAt: string;
  featured?: boolean;
  description?: string;
  playUrl?: string;
}

// ── Valid filter values ───────────────────────────────────────

const VALID_PLATFORMS = new Set<string>([
  'PC', '手机', 'NS', 'PS', 'Xbox', '网页游戏',
]);

const VALID_GENRES = new Set<string>([
  '益智', '策略', 'RPG', '动作', '模拟经营',
  '赛车', '卡牌', '解谜', '音乐', '塔防',
  '沙盒', '体育', '棋牌', '射击', '休闲',
]);

const VALID_RATINGS = new Set<string>(['G', 'PG', 'PG-13', 'R', 'NC-17']);

const VALID_SORT = new Set<string>(['popularity', 'score', 'latest', 'name']);

// ── Static game catalog ───────────────────────────────────────

const GAME_CATALOG: GameCatalogItem[] = [
  // Web games (playable in browser)
  {
    id: '2048', name: '2048', cover: 'https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '益智', rating: 'G', score: 4.5, popularity: 95,
    updatedAt: '2026-04-10', featured: true, playUrl: '/games/2048',
    description: '经典数字合并益智游戏，多模式挑战',
  },
  {
    id: 'tetris', name: '俄罗斯方块', cover: 'https://images.unsplash.com/photo-1577741314755-048d8525d31e?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '益智', rating: 'G', score: 4.7, popularity: 92,
    updatedAt: '2026-04-09', featured: true, playUrl: '/games/tetris',
    description: '经典方块消除，挑战你的极限',
  },
  {
    id: 'snake', name: '贪吃蛇', cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '休闲', rating: 'G', score: 4.2, popularity: 88,
    updatedAt: '2026-04-08', playUrl: '/games/snake',
    description: '经典贪吃蛇，简单上手',
  },
  {
    id: 'spaceshoot', name: '太空射击', cover: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&q=80',
    platforms: ['网页游戏', 'PC'], genre: '射击', rating: 'PG', score: 4.6, popularity: 90,
    updatedAt: '2026-04-10', featured: true, playUrl: '/games/spaceshoot',
    description: '弹幕射击打Boss，紧张刺激',
  },
  {
    id: 'match3', name: '宝石消消乐', cover: 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '益智', rating: 'G', score: 4.3, popularity: 85,
    updatedAt: '2026-04-07', playUrl: '/games/match3',
    description: '三消益智停不下来',
  },
  {
    id: 'tower', name: '塔防守卫', cover: 'https://images.unsplash.com/photo-1563207153-f403bf289096?w=400&q=80',
    platforms: ['网页游戏', 'PC'], genre: '塔防', rating: 'PG', score: 4.4, popularity: 82,
    updatedAt: '2026-04-06', playUrl: '/games/tower',
    description: '建塔防御怪物入侵',
  },
  {
    id: 'sudoku', name: '数独', cover: 'https://images.unsplash.com/photo-1580541832626-2a7131ee809f?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '解谜', rating: 'G', score: 4.1, popularity: 70,
    updatedAt: '2026-04-05', playUrl: '/games/sudoku',
    description: '经典9宫格逻辑推理',
  },
  {
    id: 'fishing', name: '钓鱼达人', cover: 'https://images.unsplash.com/photo-1504309092620-4d0ec726efa4?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '休闲', rating: 'G', score: 3.9, popularity: 60,
    updatedAt: '2026-03-28', playUrl: '/games/fishing',
    description: '休闲钓鱼收集图鉴',
  },
  {
    id: 'pokemon', name: '宠物大冒险', cover: 'https://images.unsplash.com/photo-1542779283-429940ce8336?w=400&q=80',
    platforms: ['网页游戏', 'PC', '手机'], genre: 'RPG', rating: 'PG', score: 4.8, popularity: 98,
    updatedAt: '2026-04-10', featured: true, playUrl: '/games/pokemon',
    description: '探索世界收集宠物回合制战斗',
  },
  {
    id: 'civilization', name: '文明崛起', cover: 'https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=400&q=80',
    platforms: ['网页游戏', 'PC'], genre: '策略', rating: 'PG', score: 4.7, popularity: 93,
    updatedAt: '2026-04-09', featured: true, playUrl: '/games/civilization',
    description: '4X策略建城征服世界',
  },
  {
    id: 'forest', name: '森林冒险', cover: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=80',
    platforms: ['网页游戏', 'PC'], genre: '动作', rating: 'PG', score: 4.5, popularity: 87,
    updatedAt: '2026-04-08', featured: true, playUrl: '/games/forest',
    description: '横版闯关探索神秘森林',
  },
  {
    id: 'huarong', name: '华容道', cover: 'https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '解谜', rating: 'G', score: 4.0, popularity: 65,
    updatedAt: '2026-04-04', playUrl: '/games/huarong',
    description: '滑块解谜经典益智',
  },
  {
    id: 'logic', name: '逻辑推理', cover: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '解谜', rating: 'G', score: 4.2, popularity: 68,
    updatedAt: '2026-04-03', playUrl: '/games/logic',
    description: '烧脑逻辑谜题挑战',
  },
  // Multi-platform games (non-web)
  {
    id: 'zelda-totk', name: '塞尔达传说：王国之泪', cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
    platforms: ['NS'], genre: 'RPG', rating: 'PG', score: 4.9, popularity: 99,
    updatedAt: '2026-04-10', featured: true,
    description: '开放世界冒险，探索海拉鲁大陆',
  },
  {
    id: 'elden-ring', name: '艾尔登法环', cover: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox'], genre: '动作', rating: 'PG-13', score: 4.8, popularity: 97,
    updatedAt: '2026-04-09',
    description: '宫崎英高打造的开放世界动作RPG',
  },
  {
    id: 'gta6', name: 'GTA 6', cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox'], genre: '动作', rating: 'R', score: 4.9, popularity: 100,
    updatedAt: '2026-04-10',
    description: '开放世界犯罪动作游戏',
  },
  {
    id: 'mario-wonder', name: '超级马力欧惊奇', cover: 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=400&q=80',
    platforms: ['NS'], genre: '动作', rating: 'G', score: 4.7, popularity: 91,
    updatedAt: '2026-04-07',
    description: '经典横版过关，全新惊奇花机制',
  },
  {
    id: 'ff7-rebirth', name: '最终幻想7 重生', cover: 'https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=400&q=80',
    platforms: ['PS', 'PC'], genre: 'RPG', rating: 'PG-13', score: 4.6, popularity: 89,
    updatedAt: '2026-04-06',
    description: '经典JRPG重制，壮阔冒险旅程',
  },
  {
    id: 'palworld', name: '幻兽帕鲁', cover: 'https://images.unsplash.com/photo-1542779283-429940ce8336?w=400&q=80',
    platforms: ['PC', 'Xbox'], genre: '沙盒', rating: 'PG-13', score: 4.3, popularity: 86,
    updatedAt: '2026-04-05',
    description: '开放世界生存建造+宠物收集',
  },
  {
    id: 'fc25', name: 'EA FC 25', cover: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox', '手机'], genre: '体育', rating: 'G', score: 4.1, popularity: 84,
    updatedAt: '2026-04-04',
    description: '最新足球模拟游戏',
  },
  {
    id: 'civ7', name: '文明7', cover: 'https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox', 'NS'], genre: '策略', rating: 'PG', score: 4.5, popularity: 83,
    updatedAt: '2026-04-03',
    description: '回合制策略经典续作',
  },
  {
    id: 'honor-of-kings', name: '王者荣耀', cover: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400&q=80',
    platforms: ['手机'], genre: '策略', rating: 'PG', score: 4.4, popularity: 96,
    updatedAt: '2026-04-10',
    description: '5v5 MOBA竞技手游',
  },
  {
    id: 'genshin', name: '原神', cover: 'https://images.unsplash.com/photo-1542779283-429940ce8336?w=400&q=80',
    platforms: ['PC', '手机', 'PS'], genre: 'RPG', rating: 'PG', score: 4.5, popularity: 94,
    updatedAt: '2026-04-09',
    description: '开放世界冒险RPG',
  },
  {
    id: 'pubg-mobile', name: '和平精英', cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80',
    platforms: ['手机'], genre: '射击', rating: 'PG-13', score: 4.2, popularity: 88,
    updatedAt: '2026-04-08',
    description: '战术竞技射击手游',
  },
  {
    id: 'chess', name: '国际象棋', cover: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&q=80',
    platforms: ['网页游戏', 'PC', '手机'], genre: '棋牌', rating: 'G', score: 4.6, popularity: 75,
    updatedAt: '2026-04-02', playUrl: '/games/chess',
    description: '经典棋类对战，支持AI和在线对战',
  },
  {
    id: 'rhythm-master', name: '节奏大师', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '音乐', rating: 'G', score: 4.3, popularity: 72,
    updatedAt: '2026-04-01', playUrl: '/games/rhythm',
    description: '节奏游戏，多歌曲多难度',
  },
  {
    id: 'card-battle', name: '卡牌对决', cover: 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80',
    platforms: ['网页游戏', 'PC', '手机'], genre: '卡牌', rating: 'PG', score: 4.1, popularity: 71,
    updatedAt: '2026-03-30', playUrl: '/games/cards',
    description: '收集卡牌组建卡组对战',
  },
  {
    id: 'racing-fury', name: '极速狂飙', cover: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox'], genre: '赛车', rating: 'PG', score: 4.4, popularity: 80,
    updatedAt: '2026-03-29',
    description: '高速赛车竞速，多赛道挑战',
  },
  {
    id: 'farm-sim', name: '开心农场', cover: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '模拟经营', rating: 'G', score: 4.0, popularity: 67,
    updatedAt: '2026-03-25', playUrl: '/games/farm',
    description: '种田养殖经营你的农场',
  },
  {
    id: 'sandbox-world', name: '沙盒世界', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80',
    platforms: ['PC', '手机'], genre: '沙盒', rating: 'PG', score: 4.3, popularity: 78,
    updatedAt: '2026-03-20',
    description: '2D沙盒建造，自由探索',
  },
];

// ── GET /api/games/catalog ────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

  // Parse query params
  const platform = url.searchParams.get('platform') || '';
  const type = url.searchParams.get('type') || '';
  const rating = url.searchParams.get('rating') || '';
  const sortBy = url.searchParams.get('sortBy') || 'popularity';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '50', 10) || 50));

  // Validate filter values
  if (platform && !VALID_PLATFORMS.has(platform)) {
    return errorResponse(`Invalid platform: ${platform}`, 400);
  }
  if (type && !VALID_GENRES.has(type)) {
    return errorResponse(`Invalid type: ${type}`, 400);
  }
  if (rating && !VALID_RATINGS.has(rating)) {
    return errorResponse(`Invalid rating: ${rating}`, 400);
  }
  if (!VALID_SORT.has(sortBy)) {
    return errorResponse(`Invalid sortBy: ${sortBy}. Must be one of: popularity, score, latest, name`, 400);
  }

  // Determine max allowed rating from user's AgeGate mode (passed as query param)
  // Default to 'adult' (NC-17) if not specified — public endpoint, no auth required
  const userMode = (url.searchParams.get('mode') || 'adult') as UserMode;
  const maxRating = MODE_MAX_RATING[userMode] || MODE_MAX_RATING.adult;

  // Filter catalog
  let filtered = GAME_CATALOG.filter((game) => {
    // AgeGate rating filter — only show games at or below user's max rating
    if (!isRatingAllowed(maxRating, game.rating)) return false;

    // Platform filter
    if (platform && !game.platforms.includes(platform as GamePlatform)) return false;

    // Genre/type filter
    if (type && game.genre !== type) return false;

    // Explicit rating filter (e.g. show only PG games)
    if (rating && game.rating !== rating) return false;

    return true;
  });

  // Sort
  switch (sortBy) {
    case 'popularity':
      filtered.sort((a, b) => b.popularity - a.popularity);
      break;
    case 'score':
      filtered.sort((a, b) => b.score - a.score);
      break;
    case 'latest':
      filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case 'name':
      filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      break;
  }

  // Paginate
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const items = filtered.slice(offset, offset + pageSize);

  return jsonResponse({
    items,
    total,
    page,
    pageSize,
    totalPages,
  });
};
