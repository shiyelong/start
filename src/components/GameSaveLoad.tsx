"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth, useAuth } from "@/lib/auth";

interface SaveSlot {
  slot: number;
  hasData: boolean;
  updatedAt: string | null;
}

interface SaveRecord {
  id: number;
  user_id: number;
  game_id: string;
  save_data: string;
  slot: number;
  updated_at: string;
}

interface GameSaveLoadProps {
  gameId: string;
  onLoad?: (data: unknown) => void;
  onSave?: () => unknown;
}

const SLOT_COUNT = 3;

export default function GameSaveLoad({ gameId, onLoad, onSave }: GameSaveLoadProps) {
  const { isLoggedIn } = useAuth();
  const [slots, setSlots] = useState<SaveSlot[]>(
    Array.from({ length: SLOT_COUNT }, (_, i) => ({
      slot: i,
      hasData: false,
      updatedAt: null,
    })),
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Fetch existing saves on mount
  const refreshSlots = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetchWithAuth(
        `/api/games/saves?game_id=${gameId}`,
      );
      if (!res.ok) return;
      const saves = (await res.json()) as SaveRecord[];
      setSlots(
        Array.from({ length: SLOT_COUNT }, (_, i) => {
          const s = saves.find((sv) => sv.slot === i);
          return {
            slot: i,
            hasData: !!s,
            updatedAt: s?.updated_at ?? null,
          };
        }),
      );
    } catch {
      // silently ignore
    }
  }, [gameId, isLoggedIn]);

  useEffect(() => {
    refreshSlots();
  }, [refreshSlots]);

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 2000);
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    } catch {
      return "";
    }
  };

  const handleSave = async (slot: number) => {
    if (!onSave) return;
    setBusy(slot);
    try {
      const saveData = onSave();
      const res = await fetchWithAuth("/api/games/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId, save_data: saveData, slot }),
      });
      if (!res.ok) throw new Error();
      showMsg(`存档 ${slot + 1} 保存成功`);
      await refreshSlots();
    } catch {
      showMsg("保存失败");
    } finally {
      setBusy(null);
    }
  };

  const handleLoad = async (slot: number) => {
    if (!onLoad) return;
    setBusy(slot);
    try {
      const res = await fetchWithAuth(
        `/api/games/saves?game_id=${gameId}&slot=${slot}`,
      );
      if (!res.ok) throw new Error();
      const save = (await res.json()) as SaveRecord | null;
      if (!save) {
        showMsg("该存档为空");
        return;
      }
      const data = typeof save.save_data === "string"
        ? JSON.parse(save.save_data)
        : save.save_data;
      onLoad(data);
      showMsg(`存档 ${slot + 1} 加载成功`);
    } catch {
      showMsg("加载失败");
    } finally {
      setBusy(null);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4 text-center">
        <p className="text-[#666] text-xs">
          
          登录后可存档
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
      <h3 className="text-sm font-bold mb-3 text-[#3ea6ff]">
        
        存档管理
      </h3>

      <div className="space-y-2">
        {slots.map((s) => (
          <div
            key={s.slot}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#212121] text-xs"
          >
            <span className="text-[#aaa] w-14 shrink-0">
              存档 {s.slot + 1}
            </span>
            <span className="flex-1 text-[#666] truncate text-[10px]">
              {s.hasData ? formatTime(s.updatedAt) : "空"}
            </span>
            <button
              onClick={() => handleSave(s.slot)}
              disabled={busy !== null || !onSave}
              className="px-2.5 py-1 rounded bg-[#3ea6ff]/20 text-[#3ea6ff] hover:bg-[#3ea6ff]/30 transition disabled:opacity-40"
            >
              {busy === s.slot ? "..." : "保存"}
            </button>
            <button
              onClick={() => handleLoad(s.slot)}
              disabled={busy !== null || !s.hasData || !onLoad}
              className="px-2.5 py-1 rounded bg-[#f0b90b]/20 text-[#f0b90b] hover:bg-[#f0b90b]/30 transition disabled:opacity-40"
            >
              {busy === s.slot ? "..." : "读取"}
            </button>
          </div>
        ))}
      </div>

      {msg && (
        <p className="text-center text-[10px] text-[#3ea6ff] mt-2">{msg}</p>
      )}
    </div>
  );
}
