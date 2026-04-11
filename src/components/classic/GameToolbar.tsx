'use client';

import {
  Pause,
  Play,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ArrowLeft,
  Save,
  Gauge,
  Monitor,
} from 'lucide-react';
import clsx from 'clsx';

interface GameToolbarProps {
  isPaused: boolean;
  isMuted: boolean;
  isFullscreen: boolean;
  isTheaterMode: boolean;
  scale: number; // 50-200
  speed: number; // 0.5, 1, 2, 4
  onTogglePause: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleTheaterMode: () => void;
  onScaleChange: (scale: number) => void;
  onSpeedChange: (speed: number) => void;
  onSaveState: () => void;
  onExit: () => void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

export default function GameToolbar({
  isPaused,
  isMuted,
  isFullscreen,
  isTheaterMode,
  scale,
  speed,
  onTogglePause,
  onToggleMute,
  onToggleFullscreen,
  onToggleTheaterMode,
  onScaleChange,
  onSpeedChange,
  onSaveState,
  onExit,
}: GameToolbarProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 bg-bg-card/90 backdrop-blur-sm border-b border-border rounded-t-lg flex-wrap">
      {/* Exit */}
      <button
        onClick={onExit}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-subtle hover:text-white hover:bg-bg-hover transition"
        title="返回"
      >
        <ArrowLeft size={15} />
        <span className="hidden sm:inline">返回</span>
      </button>

      <div className="w-px h-5 bg-border" />

      {/* Pause/Resume */}
      <button
        onClick={onTogglePause}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition',
          isPaused
            ? 'bg-accent/15 text-accent'
            : 'text-subtle hover:text-white hover:bg-bg-hover'
        )}
        title={isPaused ? '继续' : '暂停'}
      >
        {isPaused ? <Play size={15} /> : <Pause size={15} />}
        <span className="hidden sm:inline">{isPaused ? '继续' : '暂停'}</span>
      </button>

      {/* Mute/Unmute */}
      <button
        onClick={onToggleMute}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition',
          isMuted
            ? 'bg-danger/15 text-danger'
            : 'text-subtle hover:text-white hover:bg-bg-hover'
        )}
        title={isMuted ? '取消静音' : '静音'}
      >
        {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>

      <div className="w-px h-5 bg-border hidden sm:block" />

      {/* Speed Control */}
      <div className="flex items-center gap-1">
        <Gauge size={13} className="text-muted" />
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={clsx(
              'px-1.5 py-0.5 rounded text-[10px] font-bold transition',
              speed === s
                ? 'bg-accent/20 text-accent'
                : 'text-muted hover:text-white hover:bg-bg-hover'
            )}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-border hidden sm:block" />

      {/* Screen Size Slider */}
      <div className="hidden sm:flex items-center gap-2">
        <span className="text-[10px] text-muted whitespace-nowrap">{scale}%</span>
        <input
          type="range"
          min={50}
          max={200}
          step={10}
          value={scale}
          onChange={(e) => onScaleChange(Number(e.target.value))}
          className="w-20 h-1 accent-accent cursor-pointer"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save State */}
      <button
        onClick={onSaveState}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-subtle hover:text-white hover:bg-bg-hover transition"
        title="存档"
      >
        <Save size={15} />
        <span className="hidden sm:inline">存档</span>
      </button>

      {/* Theater Mode (desktop only) */}
      <button
        onClick={onToggleTheaterMode}
        className={clsx(
          'hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition',
          isTheaterMode
            ? 'bg-accent/15 text-accent'
            : 'text-subtle hover:text-white hover:bg-bg-hover'
        )}
        title={isTheaterMode ? '退出剧场模式' : '剧场模式'}
      >
        <Monitor size={15} />
      </button>

      {/* Fullscreen */}
      <button
        onClick={onToggleFullscreen}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-subtle hover:text-white hover:bg-bg-hover transition"
        title={isFullscreen ? '退出全屏' : '全屏'}
      >
        {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
      </button>
    </div>
  );
}
