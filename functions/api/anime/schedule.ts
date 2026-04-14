/**
 * Anime schedule API.
 *
 * GET /api/anime/schedule — new anime schedule grouped by day of week
 *
 * Returns a schedule object keyed by day of week (Monday-Sunday)
 * with anime items airing on each day.
 *
 * Validates: Requirements 22.3
 */

import { jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/** Days of the week in order (Monday first, matching anime schedule convention). */
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

interface AnimeScheduleItem {
  id: string;
  title: string;
  cover: string;
  time: string;
  episode: string;
  status: string;
}

/**
 * Generate stub schedule data.
 *
 * In production this will be populated from anime source APIs
 * and cached in KV. For now returns representative stub data.
 */
function generateStubSchedule(): Record<string, AnimeScheduleItem[]> {
  const schedule: Record<string, AnimeScheduleItem[]> = {};

  const stubAnime = [
    { title: '咒术回战', time: '23:30' },
    { title: '我的英雄学院', time: '17:30' },
    { title: '鬼灭之刃', time: '23:15' },
    { title: '进击的巨人', time: '00:10' },
    { title: '间谍过家家', time: '23:00' },
    { title: '链锯人', time: '00:00' },
    { title: '蓝色监狱', time: '23:30' },
    { title: '药屋少女的呢喃', time: '22:00' },
    { title: '葬送的芙莉莲', time: '23:00' },
    { title: '迷宫饭', time: '22:30' },
    { title: '怪兽8号', time: '23:00' },
    { title: '排球少年', time: '01:25' },
    { title: '无职转生', time: '00:00' },
    { title: '我推的孩子', time: '23:00' },
  ];

  for (const day of DAYS_OF_WEEK) {
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    // Distribute anime across days (2 per day)
    const startIdx = (dayIndex * 2) % stubAnime.length;
    const items: AnimeScheduleItem[] = [];

    for (let i = 0; i < 2; i++) {
      const anime = stubAnime[(startIdx + i) % stubAnime.length];
      items.push({
        id: `schedule-${day.toLowerCase()}-${i}`,
        title: anime.title,
        cover: '',
        time: anime.time,
        episode: `第${Math.floor(Math.random() * 12) + 1}集`,
        status: 'ongoing',
      });
    }

    schedule[day] = items;
  }

  return schedule;
}

export const onRequestGet: PagesFunction<Env> = async () => {
  try {
    const schedule = generateStubSchedule();

    return jsonResponse({ schedule });
  } catch (error) {
    return handleError(error);
  }
};
