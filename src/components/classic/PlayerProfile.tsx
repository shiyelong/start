'use client';

import { useState, useEffect } from 'react';
import { Trophy, Clock, Gamepad2, Star, Medal, User } from 'lucide-react';
import clsx from 'clsx';
import type { PlayerProfile as ProfileType, GameSession, AchievementDefinition, PlayerAchievement } from '@/lib/types';

// ---------------------------------------------------------------------------
// Achievement definitions (10+ badges)
// ---------------------------------------------------------------------------

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  { id: 'first_game', name: '初次启动', description: '完成第一局游戏', conditionType: 'games_played', conditionValue: 1 },
  { id: 'games_10', name: '游戏达人', description: '累计游玩10局游戏', conditionType: 'games_played', conditionValue: 10 },
  { id: 'games_50', name: '资深玩家', description: '累计游玩50局游戏', conditionType: 'games_played', conditionValue: 50 },
  { id: 'games_100', name: '游戏大师', description: '累计游玩100局游戏', conditionType: 'games_played', conditionValue: 100 },
  { id: 'time_1h', name: '一小时', description: '累计游玩时间达到1小时', conditionType: 'time_played', conditionValue: 3600 },
  { id: 'time_10h', name: '十小时', description: '累计游玩时间达到10小时', conditionType: 'time_played', conditionValue: 36000 },
  { id: 'time_100h', name: '百小时', description: '累计游玩时间达到100小时', conditionType: 'time_played', conditionValue: 360000 },
  { id: 'first_mp_win', name: '首胜', description: '赢得第一场多人对战', conditionType: 'multiplayer_wins', conditionValue: 1 },
  { id: 'mp_wins_10', name: '连胜高手', description: '赢得10场多人对战', conditionType: 'multiplayer_wins', conditionValue: 10 },
  { id: 'mp_wins_50', name: '对战王者', description: '赢得50场多人对战', conditionType: 'multiplayer_wins', conditionValue: 50 },
  { id: 'platforms_3', name: '多平台玩家', description: '在3个不同平台上游玩', conditionType: 'platforms_played', conditionValue: 3 },
  { id: 'social_first', name: '社交达人', description: '参加第一场多人游戏', conditionType: 'multiplayer_games', conditionValue: 1 },
];

// ---------------------------------------------------------------------------
// Check achievements against stats
// ---------------------------------------------------------------------------

export function checkAchievements(
  profile: ProfileType,
  earned: PlayerAchievement[],
): AchievementDefinition[] {
  const earnedIds = new Set(earned.map((a) => a.achievementId));
  const newlyEarned: AchievementDefinition[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (earnedIds.has(def.id)) continue;
    let met = false;
    switch (def.conditionType) {
      case 'games_played':
        met = profile.totalGamesPlayed >= def.conditionValue;
        break;
      case 'time_played':
        met = profile.totalTimeSeconds >= def.conditionValue;
        break;
      case 'multiplayer_wins':
        met = profile.multiplayerWins >= def.conditionValue;
        break;
      default:
        break;
    }
    if (met) newlyEarned.push(def);
  }
  return newlyEarned;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN');
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlayerProfileProps {
  userId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerProfilePage({ userId }: PlayerProfileProps) {
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [achievements, setAchievements] = useState<PlayerAchievement[]>([]);
  const [recentSessions, setRecentSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/classic/profile/${userId}`).then((r) => r.ok ? r.json() as Promise<{ profile?: ProfileType; recentSessions?: GameSession[] }> : null),
      fetch('/api/classic/profile/achievements').then((r) => r.ok ? r.json() as Promise<{ achievements?: PlayerAchievement[] }> : null),
    ])
      .then(([profileData, achievementsData]) => {
        if (profileData?.profile) setProfile(profileData.profile);
        if (achievementsData?.achievements) setAchievements(achievementsData.achievements);
        if (profileData?.recentSessions) setRecentSessions(profileData.recentSessions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted text-sm">
        加载中...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted text-sm gap-2">
        <User size={32} />
        <span>未找到玩家资料</span>
      </div>
    );
  }

  const earnedIds = new Set(achievements.map((a) => a.achievementId));

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Profile header */}
      <div className="rounded-xl bg-bg-card border border-border p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center">
            <User size={28} className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{profile.displayName}</h1>
            <p className="text-xs text-muted">加入于 {formatDate(profile.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Gamepad2 size={18} />} label="游戏局数" value={String(profile.totalGamesPlayed)} />
        <StatCard icon={<Clock size={18} />} label="游玩时间" value={formatTime(profile.totalTimeSeconds)} />
        <StatCard icon={<Trophy size={18} />} label="多人胜场" value={String(profile.multiplayerWins)} />
      </div>

      {/* Achievements */}
      <section className="rounded-xl bg-bg-card border border-border p-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Medal size={16} className="text-yellow-400" />
          成就徽章
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {ACHIEVEMENT_DEFINITIONS.map((def) => {
            const earned = earnedIds.has(def.id);
            return (
              <div
                key={def.id}
                className={clsx(
                  'rounded-lg p-2.5 text-xs transition',
                  earned
                    ? 'bg-yellow-500/10 border border-yellow-500/20'
                    : 'bg-bg-hover/50 border border-border opacity-50',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Star size={12} className={earned ? 'text-yellow-400' : 'text-muted'} />
                  <span className={clsx('font-medium', earned ? 'text-yellow-300' : 'text-muted')}>
                    {def.name}
                  </span>
                </div>
                <p className="text-[10px] text-muted mt-0.5">{def.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recently played */}
      <section className="rounded-xl bg-bg-card border border-border p-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Clock size={16} className="text-accent" />
          最近游玩
        </h2>
        {recentSessions.length === 0 ? (
          <p className="text-xs text-muted">暂无游玩记录</p>
        ) : (
          <div className="space-y-1.5">
            {recentSessions.slice(0, 20).map((session) => (
              <div key={session.id} className="flex items-center justify-between px-2 py-1.5 rounded bg-bg-hover/50 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-accent font-mono text-[10px]">{session.platform}</span>
                  <span className="text-gray-300">{session.romHash.slice(0, 8)}...</span>
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <span>{formatTime(session.durationSeconds)}</span>
                  <span>{formatDate(session.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card sub-component
// ---------------------------------------------------------------------------

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-card border border-border p-3 text-center">
      <div className="flex justify-center text-accent mb-1">{icon}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}
