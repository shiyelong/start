'use client';

import { useRef, useEffect } from 'react';
import { Timer, Play, User } from 'lucide-react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RacePlayer {
  playerId: string;
  displayName: string;
  /** Elapsed time in seconds since race start */
  elapsedSeconds: number;
  /** Whether this player's emulator is running */
  isRunning: boolean;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RaceGridProps {
  /** List of players in the race */
  players: RacePlayer[];
  /** Whether the race has started */
  raceStarted: boolean;
  /** Countdown value before race starts (3, 2, 1, null when started) */
  countdown: number | null;
  /** Ref callback to get the canvas element for a given playerId */
  canvasRefCallback: (playerId: string, canvas: HTMLCanvasElement | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}

// ---------------------------------------------------------------------------
// Slot colors for players
// ---------------------------------------------------------------------------

const PLAYER_COLORS: string[] = [
  'border-blue-500/60',
  'border-red-500/60',
  'border-green-500/60',
  'border-yellow-500/60',
];

const PLAYER_TEXT_COLORS: string[] = [
  'text-blue-400',
  'text-red-400',
  'text-green-400',
  'text-yellow-400',
];

// ---------------------------------------------------------------------------
// RacePlayerCell
// ---------------------------------------------------------------------------

function RacePlayerCell({
  player,
  index,
  raceStarted,
  canvasRefCallback,
}: {
  player: RacePlayer;
  index: number;
  raceStarted: boolean;
  canvasRefCallback: (playerId: string, canvas: HTMLCanvasElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      canvasRefCallback(player.playerId, null);
    };
  }, [player.playerId, canvasRefCallback]);

  const handleCanvasRef = (el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    canvasRefCallback(player.playerId, el);
  };

  const borderColor = PLAYER_COLORS[index % PLAYER_COLORS.length];
  const textColor = PLAYER_TEXT_COLORS[index % PLAYER_TEXT_COLORS.length];

  return (
    <div
      className={clsx(
        'flex flex-col rounded-lg border-2 bg-black overflow-hidden',
        borderColor,
      )}
    >
      {/* Player header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-card/80 border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <User size={12} className={textColor} />
          <span className={clsx('text-xs font-bold', textColor)}>
            P{index + 1}
          </span>
          <span className="text-xs font-semibold text-white truncate max-w-[120px]">
            {player.displayName}
          </span>
        </div>

        {/* Elapsed time */}
        {raceStarted && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <Timer size={11} />
            <span className="font-mono">{formatElapsed(player.elapsedSeconds)}</span>
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div className="relative w-full aspect-[4/3] bg-black">
        <canvas
          ref={handleCanvasRef}
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Waiting overlay before race starts */}
        {!raceStarted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-xs text-muted">等待开始…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RaceGrid Component
// ---------------------------------------------------------------------------

export default function RaceGrid({
  players,
  raceStarted,
  countdown,
  canvasRefCallback,
}: RaceGridProps) {
  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Countdown overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
            <Play size={24} className="text-accent" />
            <span className="text-5xl font-bold text-white font-mono">
              {countdown}
            </span>
            <span className="text-xs text-muted">准备开始</span>
          </div>
        </div>
      )}

      {/* Grid of player canvases */}
      <div
        className={clsx(
          'flex-1 grid gap-2 p-2',
          // Responsive: 1 col on mobile, 2 cols on desktop
          players.length <= 1
            ? 'grid-cols-1'
            : 'grid-cols-1 md:grid-cols-2',
        )}
      >
        {players.map((player, i) => (
          <RacePlayerCell
            key={player.playerId}
            player={player}
            index={i}
            raceStarted={raceStarted}
            canvasRefCallback={canvasRefCallback}
          />
        ))}
      </div>
    </div>
  );
}
