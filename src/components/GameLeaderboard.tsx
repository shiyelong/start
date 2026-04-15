"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/lib/auth";

interface LeaderboardEntry {
  id: number;
  user_id: number;
  game_id: string;
  score: number;
  played_at: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
}

interface LeaderboardResponse {
  items: LeaderboardEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type Period = "daily" | "weekly" | "all";

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "daily", label: "日榜" },
  { key: "weekly", label: "周榜" },
  { key: "all", label: "总榜" },
];

export default function GameLeaderboard({ gameId }: { gameId: string }) {
  const [period, setPeriod] = useState<Period>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `/api/games/scores/${gameId}?period=${p}&pageSize=10`,
      );
      if (!res.ok) throw new Error("加载排行榜失败");
      const data = (await res.json()) as LeaderboardResponse;
      setEntries(data.items);
    } catch {
      setError("加载排行榜失败");
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchLeaderboard(period);
  }, [period, fetchLeaderboard]);

  const handlePeriod = (p: Period) => {
    setPeriod(p);
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    } catch {
      return "";
    }
  };

  const rankIcon = (rank: number) => {
    if (rank === 1) return "?";
    if (rank === 2) return "?";
    if (rank === 3) return "?";
    return `${rank}`;
  };

  return (
    <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
      <h3 className="text-sm font-bold mb-3 text-[#3ea6ff]">
        
        排行榜
      </h3>

      {/* Period tabs */}
      <div className="flex gap-1.5 mb-3">
        {PERIOD_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => handlePeriod(t.key)}
            className={`px-3 py-1 rounded-full text-xs border transition ${
              period === t.key
                ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold"
                : "text-[#aaa] border-[#333] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-6 text-[#666] text-xs">加载中...</div>
      ) : error ? (
        <div className="text-center py-6 text-[#666] text-xs">{error}</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-6 text-[#666] text-xs">暂无记录</div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <div
              key={e.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#212121] transition text-xs"
            >
              <span className="w-6 text-center font-bold text-sm shrink-0">
                {rankIcon(i + 1)}
              </span>
              <span className="flex-1 truncate text-[#ccc]">
                {e.nickname || e.username}
              </span>
              <span className="text-[#f0b90b] font-bold tabular-nums">
                {e.score.toLocaleString()}
              </span>
              <span className="text-[#666] text-[10px] w-16 text-right shrink-0">
                {formatTime(e.played_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
