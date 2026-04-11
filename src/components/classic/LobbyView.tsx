'use client';

import { useState, useCallback } from 'react';
import {
  Copy,
  Check,
  Play,
  Users,
  Crown,
  Gamepad2,
  Eye,
  UserX,
} from 'lucide-react';
import clsx from 'clsx';
import type { ConsolePlatform, PlayerInfo } from '@/lib/types';

// ---------------------------------------------------------------------------
// Platform display names (Chinese)
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<ConsolePlatform, string> = {
  NES: 'NES',
  SNES: 'SNES',
  Game_Boy: 'Game Boy',
  Game_Boy_Color: 'Game Boy Color',
  Game_Boy_Advance: 'GBA',
  Genesis: '世嘉MD',
  Master_System: 'Master System',
  Arcade: '街机',
  Neo_Geo: 'Neo Geo',
  PC_Engine: 'PC Engine',
  Atari_2600: 'Atari 2600',
};

// ---------------------------------------------------------------------------
// Slot colors for P1–P4
// ---------------------------------------------------------------------------

const SLOT_COLORS: Record<number, string> = {
  1: 'text-blue-400 bg-blue-400/15',
  2: 'text-red-400 bg-red-400/15',
  3: 'text-green-400 bg-green-400/15',
  4: 'text-yellow-400 bg-yellow-400/15',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LobbyViewProps {
  roomCode: string;
  players: PlayerInfo[];
  romTitle: string;
  platform: ConsolePlatform;
  maxPlayers: number;
  isHost: boolean;
  spectatorCount: number;
  onStartGame: () => void;
  onKickPlayer: (playerId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LobbyView({
  roomCode,
  players,
  romTitle,
  platform,
  maxPlayers,
  isHost,
  spectatorCount,
  onStartGame,
  onKickPlayer,
}: LobbyViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — ignore
    }
  }, [roomCode]);

  const emptySlots = maxPlayers - players.length;

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto p-4 space-y-5">
      {/* Room header */}
      <div className="w-full text-center space-y-2">
        <h2 className="text-lg font-bold">{romTitle}</h2>
        <div className="flex items-center justify-center gap-2 text-xs text-muted">
          <span className="px-2 py-0.5 rounded bg-bg-hover font-semibold">
            {PLATFORM_LABELS[platform]}
          </span>
          <span className="px-2 py-0.5 rounded bg-accent/15 text-accent font-semibold">
            {maxPlayers}P
          </span>
        </div>
      </div>

      {/* Room code */}
      <div className="w-full rounded-lg border border-border bg-bg-card p-4 text-center space-y-1">
        <p className="text-[10px] text-muted uppercase tracking-wider">房间代码</p>
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl font-mono font-bold tracking-[0.3em]">
            {roomCode}
          </span>
          <button
            onClick={handleCopyCode}
            className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-bg-hover transition"
            title="复制房间代码"
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      {/* Player list */}
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between text-xs text-muted px-1">
          <span className="flex items-center gap-1">
            <Users size={13} />
            玩家 ({players.length}/{maxPlayers})
          </span>
          {spectatorCount > 0 && (
            <span className="flex items-center gap-1">
              <Eye size={13} />
              观众 {spectatorCount}
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          {/* Connected players */}
          {players.map((player) => {
            const slotStyle = SLOT_COLORS[player.slot] ?? 'text-muted bg-bg-hover';
            return (
              <div
                key={player.playerId}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-bg-card hover:border-border-hover transition"
              >
                {/* Slot badge */}
                <span
                  className={clsx(
                    'flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold shrink-0',
                    slotStyle,
                  )}
                >
                  P{player.slot}
                </span>

                {/* Name + host badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">
                      {player.displayName}
                    </span>
                    {player.isHost && (
                      <Crown size={12} className="text-yellow-400 shrink-0" />
                    )}
                  </div>
                  {player.latencyMs > 0 && (
                    <span className="text-[10px] text-muted">
                      {player.latencyMs}ms
                    </span>
                  )}
                </div>

                {/* Kick button (host only, can't kick self) */}
                {isHost && !player.isHost && (
                  <button
                    onClick={() => onKickPlayer(player.playerId)}
                    className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition"
                    title="踢出玩家"
                  >
                    <UserX size={14} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => {
            const slotNum = players.length + i + 1;
            return (
              <div
                key={`empty-${slotNum}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border/50 opacity-40"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold bg-bg-hover text-muted">
                  P{slotNum}
                </span>
                <span className="text-xs text-muted">等待玩家加入…</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Start game button (host only) */}
      {isHost && (
        <button
          onClick={onStartGame}
          disabled={players.length < 1}
          className={clsx(
            'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition',
            players.length >= 2
              ? 'bg-accent text-white hover:bg-accent/90'
              : 'bg-accent/30 text-accent/60 cursor-not-allowed',
          )}
        >
          <Play size={16} />
          开始游戏
        </button>
      )}

      {!isHost && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Gamepad2 size={14} className="animate-pulse" />
          <span>等待房主开始游戏…</span>
        </div>
      )}
    </div>
  );
}
