'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ChevronDown,
  Music,
  ListMusic,
} from 'lucide-react';
import { useMusicPlayer, type PlaybackMode } from './MusicPlayerProvider';

// ---------------------------------------------------------------------------
// LRC Parser
// ---------------------------------------------------------------------------

export interface LrcLine {
  time: number; // seconds
  text: string;
}

/** Parse LRC format lyrics into sorted time+text pairs. */
export function parseLrc(lrcText: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

  for (const raw of lrcText.split('\n')) {
    const match = raw.match(regex);
    if (!match) continue;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();
    if (text) lines.push({ time, text });
  }

  return lines.sort((a, b) => a.time - b.time);
}

/** Find the index of the current lyric line for a given playback time. */
export function findCurrentLrcIndex(lines: LrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

const MODE_CYCLE: PlaybackMode[] = ['sequential', 'repeat-all', 'repeat-one', 'shuffle'];


// ---------------------------------------------------------------------------
// LRC Lyrics Display
// ---------------------------------------------------------------------------

function LyricsDisplay({
  lrcUrl,
  currentTime,
}: {
  lrcUrl?: string;
  currentTime: number;
}) {
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!lrcUrl) {
      setLines([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(lrcUrl)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setLines(parseLrc(text));
      })
      .catch(() => {
        if (!cancelled) setLines([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lrcUrl]);

  const currentIdx = findCurrentLrcIndex(lines, currentTime);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentIdx]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Loading lyrics...
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-white/20">
          <Music className="w-10 h-10" />
          <span className="text-sm">No lyrics available</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-8 scrollbar-hide"
      style={{ maskImage: 'linear-gradient(transparent, black 15%, black 85%, transparent)' }}
    >
      <div className="space-y-3 py-20">
        {lines.map((line, i) => (
          <p
            key={`${line.time}-${i}`}
            ref={i === currentIdx ? activeRef : undefined}
            className={`text-center transition-all duration-300 ${
              i === currentIdx
                ? 'text-[#3ea6ff] text-lg font-semibold scale-105'
                : 'text-white/40 text-sm'
            }`}
          >
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode Icon
// ---------------------------------------------------------------------------

function ModeIcon({ mode }: { mode: PlaybackMode }) {
  switch (mode) {
    case 'shuffle':
      return <Shuffle className="w-5 h-5" />;
    case 'repeat-one':
      return <Repeat1 className="w-5 h-5" />;
    case 'repeat-all':
      return <Repeat className="w-5 h-5" />;
    case 'sequential':
    default:
      return <Repeat className="w-5 h-5 opacity-40" />;
  }
}

function modeLabel(mode: PlaybackMode): string {
  switch (mode) {
    case 'sequential':
      return 'Sequential';
    case 'repeat-all':
      return 'Repeat All';
    case 'repeat-one':
      return 'Repeat One';
    case 'shuffle':
      return 'Shuffle';
  }
}


// ---------------------------------------------------------------------------
// Mini Player Bar
// ---------------------------------------------------------------------------

function MiniPlayerBar({ onExpand, onClose }: { onExpand: () => void; onClose: () => void }) {
  const { state, actions } = useMusicPlayer();
  const { currentTrack, isPlaying, currentTime, duration } = state;

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-[#0f0f0f] border-t border-white/5 z-40 flex flex-col lg:bottom-0 bottom-14">
      {/* Thin progress bar at top of mini bar */}
      <div className="w-full h-0.5 bg-white/10 flex-shrink-0">
        <div
          className="h-full bg-[#3ea6ff] transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        className="flex-1 flex items-center gap-3 px-3 cursor-pointer"
        onClick={onExpand}
      >
        {/* Album cover */}
        {currentTrack.cover ? (
          <img
            src={currentTrack.cover}
            alt={currentTrack.album}
            className="w-10 h-10 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
            <Music className="w-5 h-5 text-white/30" />
          </div>
        )}

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{currentTrack.title}</p>
          <p className="text-xs text-white/50 truncate">{currentTrack.artist}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={actions.previous}
            className="p-2 text-white/70 hover:text-white transition-colors"
            aria-label="上一首"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={actions.togglePlay}
            className="p-2 text-white hover:text-[#3ea6ff] transition-colors"
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={actions.next}
            className="p-2 text-white/70 hover:text-white transition-colors"
            aria-label="下一首"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          {/* 关闭按钮 */}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-2 text-white/40 hover:text-white transition-colors ml-1"
            aria-label="关闭播放器"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Full Screen Player
// ---------------------------------------------------------------------------

function FullScreenPlayer({ onCollapse }: { onCollapse: () => void }) {
  const { state, actions } = useMusicPlayer();
  const { currentTrack, isPlaying, currentTime, duration, volume, mode, playbackRate } = state;
  const [showQueue, setShowQueue] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    actions.seek(ratio * duration);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    actions.setVolume(ratio);
  };

  const cycleMode = () => {
    const idx = MODE_CYCLE.indexOf(mode);
    const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    actions.setMode(next);
  };

  return (
    <div className="fixed inset-0 bg-[#0f0f0f] z-50 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button
          onClick={onCollapse}
          className="p-2 text-white/70 hover:text-white transition-colors"
          aria-label="Collapse player"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
        <div className="text-center flex-1 min-w-0">
          <p className="text-sm text-white/70 truncate">Now Playing</p>
        </div>
        <button
          onClick={() => setShowQueue(!showQueue)}
          className={`p-2 transition-colors ${showQueue ? 'text-[#3ea6ff]' : 'text-white/70 hover:text-white'}`}
          aria-label="Queue"
        >
          <ListMusic className="w-5 h-5" />
        </button>
      </div>

      {showQueue ? (
        /* Queue list */
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <h3 className="text-sm font-semibold text-white/70 mb-3">
            Queue ({state.queue.length} tracks)
          </h3>
          {state.queue.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">Queue is empty</p>
          ) : (
            <div className="space-y-1">
              {state.queue.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    i === state.currentIndex
                      ? 'bg-[#3ea6ff]/10 border border-[#3ea6ff]/20'
                      : 'hover:bg-white/5'
                  }`}
                  onClick={() => {
                    actions.setQueue(state.queue, i);
                  }}
                >
                  {track.cover ? (
                    <img src={track.cover} alt="" className="w-10 h-10 rounded object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center">
                      <Music className="w-4 h-4 text-white/30" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${i === state.currentIndex ? 'text-[#3ea6ff]' : 'text-white'}`}>
                      {track.title}
                    </p>
                    <p className="text-xs text-white/50 truncate">{track.artist}</p>
                  </div>
                  <span className="text-xs text-white/30 tabular-nums">
                    {formatTime(track.duration)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Main player view */
        <>
          {/* Album cover */}
          <div className="flex-shrink-0 flex items-center justify-center px-8 py-6">
            {currentTrack.cover ? (
              <img
                src={currentTrack.cover}
                alt={currentTrack.album}
                className="w-64 h-64 sm:w-72 sm:h-72 rounded-xl object-cover shadow-2xl"
              />
            ) : (
              <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-xl bg-white/5 flex items-center justify-center">
                <Music className="w-20 h-20 text-white/10" />
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="px-6 text-center flex-shrink-0">
            <h2 className="text-lg font-semibold text-white truncate">{currentTrack.title}</h2>
            <p className="text-sm text-white/50 truncate mt-1">{currentTrack.artist}</p>
          </div>

          {/* Lyrics */}
          <LyricsDisplay lrcUrl={currentTrack.lrcUrl} currentTime={currentTime} />
        </>
      )}

      {/* Bottom controls — always visible */}
      <div className="flex-shrink-0 px-6 pb-6 pt-2" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
        {/* Progress bar */}
        <div
          className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer mb-2 group relative"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-[#3ea6ff] rounded-full relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#3ea6ff] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Time display */}
        <div className="flex justify-between text-xs text-white/40 tabular-nums mb-4">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Main controls */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <button
            onClick={cycleMode}
            className={`p-2 transition-colors ${mode !== 'sequential' ? 'text-[#3ea6ff]' : 'text-white/50 hover:text-white'}`}
            aria-label={modeLabel(mode)}
            title={modeLabel(mode)}
          >
            <ModeIcon mode={mode} />
          </button>

          <button
            onClick={actions.previous}
            className="p-2 text-white hover:text-[#3ea6ff] transition-colors"
            aria-label="Previous"
          >
            <SkipBack className="w-6 h-6" />
          </button>

          <button
            onClick={actions.togglePlay}
            className="w-14 h-14 rounded-full bg-[#3ea6ff] flex items-center justify-center text-black hover:bg-[#3ea6ff]/90 transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
          </button>

          <button
            onClick={actions.next}
            className="p-2 text-white hover:text-[#3ea6ff] transition-colors"
            aria-label="Next"
          >
            <SkipForward className="w-6 h-6" />
          </button>

          {/* Playback speed */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className={`p-2 text-xs font-semibold transition-colors ${
                playbackRate !== 1 ? 'text-[#3ea6ff]' : 'text-white/50 hover:text-white'
              }`}
              aria-label="Playback speed"
            >
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 min-w-[80px] shadow-lg">
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => {
                      actions.setPlaybackRate(rate);
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
                      playbackRate === rate ? 'text-[#3ea6ff]' : 'text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Volume slider */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => actions.setVolume(volume > 0 ? 0 : 0.8)}
            className="p-1 text-white/50 hover:text-white transition-colors"
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <div
            className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer group"
            onClick={handleVolumeClick}
          >
            <div
              className="h-full bg-white/40 rounded-full relative"
              style={{ width: `${volume * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="text-xs text-white/30 tabular-nums w-8 text-right">
            {Math.round(volume * 100)}
          </span>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Main MusicPlayer Component
// ---------------------------------------------------------------------------

export default function MusicPlayer() {
  const { state, actions } = useMusicPlayer();
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);

  // 当新歌曲开始播放时自动显示
  useEffect(() => {
    if (state.currentTrack && state.isPlaying) setHidden(false);
  }, [state.currentTrack, state.isPlaying]);

  // Don't render anything if no track in queue
  if (!state.currentTrack && state.queue.length === 0) return null;

  return (
    <>
      {!expanded && !hidden && <MiniPlayerBar onExpand={() => setExpanded(true)} onClose={() => { actions.pause(); setHidden(true); }} />}
      {expanded && <FullScreenPlayer onCollapse={() => setExpanded(false)} />}
    </>
  );
}
