'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Gauge,
  Rewind,
  ShieldAlert,
} from 'lucide-react';
import clsx from 'clsx';
import type { EmulatorWrapper } from '@/lib/emulator/emulator-wrapper';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
type SpeedValue = (typeof SPEED_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpeedRewindPanelProps {
  emulator: EmulatorWrapper | null;
  isOpen: boolean;
  onClose: () => void;
  isMultiplayer: boolean;
  currentSpeed: number;
  onSpeedChange: (speed: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpeedRewindPanel({
  emulator,
  isOpen,
  onClose,
  isMultiplayer,
  currentSpeed,
  onSpeedChange,
}: SpeedRewindPanelProps) {
  const [bufferLevel, setBufferLevel] = useState(0);
  const [isRewinding, setIsRewinding] = useState(false);
  const rewindIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll rewind buffer level while panel is open
  useEffect(() => {
    if (!isOpen || !emulator || isMultiplayer) return;

    const poll = setInterval(() => {
      setBufferLevel(emulator.getRewindBufferLevel());
      setIsRewinding(emulator.isRewinding);
    }, 200);

    return () => clearInterval(poll);
  }, [isOpen, emulator, isMultiplayer]);

  const handleSpeedChange = useCallback(
    (speed: SpeedValue) => {
      if (isMultiplayer || !emulator) return;
      onSpeedChange(speed);
    },
    [emulator, isMultiplayer, onSpeedChange],
  );

  const startRewind = useCallback(() => {
    if (isMultiplayer || !emulator) return;

    emulator.rewindStep();
    setIsRewinding(true);

    // Continuously rewind while held (~15 steps/sec)
    rewindIntervalRef.current = setInterval(() => {
      emulator.rewindStep();
      setBufferLevel(emulator.getRewindBufferLevel());
    }, 67);
  }, [emulator, isMultiplayer]);

  const stopRewind = useCallback(() => {
    if (rewindIntervalRef.current) {
      clearInterval(rewindIntervalRef.current);
      rewindIntervalRef.current = null;
    }
    if (emulator) {
      emulator.stopRewinding();
      setIsRewinding(false);
      setBufferLevel(emulator.getRewindBufferLevel());
    }
  }, [emulator]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (rewindIntervalRef.current) {
        clearInterval(rewindIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={clsx(
          'fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw] bg-bg-card border-l border-border shadow-xl',
          'flex flex-col',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold">速度与回退</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-white hover:bg-bg-hover transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Multiplayer warning */}
          {isMultiplayer && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>多人游戏模式下无法使用速度控制和回退功能，请在单人模式中使用。</span>
            </div>
          )}

          {/* Speed Control Section */}
          <div className={clsx(isMultiplayer && 'opacity-50 pointer-events-none')}>
            <div className="flex items-center gap-2 mb-3">
              <Gauge size={15} className="text-accent" />
              <span className="text-xs font-bold">速度控制</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  disabled={isMultiplayer}
                  className={clsx(
                    'flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs font-bold transition',
                    currentSpeed === s
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-bg-hover text-muted hover:text-white hover:bg-bg-hover/80 border border-transparent',
                    isMultiplayer && 'cursor-not-allowed',
                  )}
                >
                  <span className="text-sm">{s}x</span>
                  <span className="text-[10px] font-normal text-muted">
                    {s === 0.5 ? '慢速' : s === 1 ? '正常' : s === 2 ? '快进' : '极速'}
                  </span>
                </button>
              ))}
            </div>

            {/* Current speed indicator */}
            <div className="mt-2 text-center text-[10px] text-muted">
              当前速度: <span className="text-accent font-bold">{currentSpeed}x</span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Rewind Section */}
          <div className={clsx(isMultiplayer && 'opacity-50 pointer-events-none')}>
            <div className="flex items-center gap-2 mb-3">
              <Rewind size={15} className="text-accent" />
              <span className="text-xs font-bold">回退 (最多10秒)</span>
            </div>

            {/* Rewind button — hold to rewind */}
            <button
              onMouseDown={startRewind}
              onMouseUp={stopRewind}
              onMouseLeave={stopRewind}
              onTouchStart={startRewind}
              onTouchEnd={stopRewind}
              disabled={isMultiplayer || bufferLevel === 0}
              className={clsx(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-xs font-bold transition',
                isRewinding
                  ? 'bg-accent/25 text-accent border border-accent/40'
                  : bufferLevel === 0 || isMultiplayer
                    ? 'bg-bg-hover text-muted cursor-not-allowed border border-transparent'
                    : 'bg-accent/15 text-accent hover:bg-accent/25 border border-transparent',
              )}
            >
              <Rewind size={15} />
              {isRewinding ? '回退中…按住继续' : '按住回退'}
            </button>

            {/* Buffer fill indicator */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>回退缓冲区</span>
                <span>{bufferLevel}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-bg-hover overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-300',
                    bufferLevel > 60
                      ? 'bg-accent'
                      : bufferLevel > 20
                        ? 'bg-warning'
                        : 'bg-danger',
                  )}
                  style={{ width: `${bufferLevel}%` }}
                />
              </div>
              <p className="text-[10px] text-muted/60">
                缓冲区每帧自动捕获，最多存储约10秒的游戏状态。
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
