'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ContentRating } from '@/lib/types';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Subtitles,
  PictureInPicture2,
  RotateCcw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import RatingBadge from '@/components/ui/RatingBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubtitleTrack {
  label: string;
  language: string;
  src: string;
  isAI?: boolean;
}

export interface VideoPlayerProps {
  src: string;
  title: string;
  source: string;
  rating: ContentRating;
  autoPlay?: boolean;
  startTime?: number;
  subtitles?: SubtitleTrack[];
  onEnded?: () => void;
  onProgress?: (time: number) => void;
  onError?: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;
const QUALITY_OPTIONS = ['auto', '1080p', '720p', '480p', '360p'] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VideoPlayer({
  src,
  title,
  source,
  rating,
  autoPlay = false,
  startTime = 0,
  subtitles = [],
  onEnded,
  onProgress,
  onError,
}: VideoPlayerProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressReportRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Player state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [quality, setQuality] = useState<string>('auto');

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);

  // Touch gesture state
  const [gestureOverlay, setGestureOverlay] = useState<string | null>(null);
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // -----------------------------------------------------------------------
  // Video element event handlers
  // -----------------------------------------------------------------------

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    if (startTime > 0) {
      video.currentTime = startTime;
    }
    setBuffering(false);
  }, [startTime]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || seeking) return;
    setCurrentTime(video.currentTime);
  }, [seeking]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    onEnded?.();
  }, [onEnded]);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    const msg = video?.error?.message || 'Video failed to load';
    setError(msg);
    setBuffering(false);
    onError?.(new Error(msg));
  }, [onError]);

  const handleWaiting = useCallback(() => setBuffering(true), []);
  const handleCanPlay = useCallback(() => setBuffering(false), []);

  // -----------------------------------------------------------------------
  // Player controls
  // -----------------------------------------------------------------------

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const t = clamp(time, 0, video.duration || 0);
    video.currentTime = t;
    setCurrentTime(t);
  }, []);

  const changeVolume = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = clamp(v, 0, 1);
    video.volume = clamped;
    setVolume(clamped);
    if (clamped > 0 && muted) {
      video.muted = false;
      setMuted(false);
    }
  }, [muted]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(!video.muted);
  }, []);

  const changePlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }, []);

  const changeQuality = useCallback((q: string) => {
    setQuality(q);
    setShowQualityMenu(false);
    // Quality switching would be handled by adaptive streaming in production
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not supported
    }
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // PiP not supported
    }
  }, []);

  const toggleSubtitle = useCallback((index: number | null) => {
    setActiveSubtitle(index);
    setShowSubtitleMenu(false);
    const video = videoRef.current;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === index ? 'showing' : 'hidden';
    }
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setBuffering(true);
    const video = videoRef.current;
    if (video) {
      video.load();
      video.play().catch(() => {});
    }
  }, []);

  // -----------------------------------------------------------------------
  // Controls auto-hide
  // -----------------------------------------------------------------------

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    if (playing) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    } else {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [playing]);

  // -----------------------------------------------------------------------
  // Progress reporting
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (onProgress) {
      progressReportRef.current = setInterval(() => {
        const video = videoRef.current;
        if (video && !video.paused) {
          onProgress(video.currentTime);
        }
      }, 5000);
    }
    return () => {
      if (progressReportRef.current) clearInterval(progressReportRef.current);
    };
  }, [onProgress]);

  // -----------------------------------------------------------------------
  // Fullscreen change listener
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when our container or video is focused, or fullscreen
      const container = containerRef.current;
      if (!container) return;
      if (!container.contains(document.activeElement) && !isFullscreen) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          resetHideTimer();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(currentTime - 10);
          resetHideTimer();
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(currentTime + 10);
          resetHideTimer();
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(volume + 0.1);
          resetHideTimer();
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(volume - 0.1);
          resetHideTimer();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seek, changeVolume, currentTime, volume, resetHideTimer, isFullscreen]);

  // -----------------------------------------------------------------------
  // Touch gestures
  // -----------------------------------------------------------------------

  const showGestureOverlay = useCallback((text: string) => {
    setGestureOverlay(text);
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = setTimeout(() => setGestureOverlay(null), 800);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start || e.changedTouches.length !== 1) {
      touchStartRef.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;
    touchStartRef.current = null;

    // Ignore very short or very long gestures
    if (elapsed < 50 || elapsed > 1000) return;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const minSwipe = 40;

    // Horizontal swipe: seek
    if (absDx > absDy && absDx > minSwipe) {
      const seekAmount = dx > 0 ? 10 : -10;
      seek(currentTime + seekAmount);
      showGestureOverlay(dx > 0 ? '+10s' : '-10s');
      resetHideTimer();
      return;
    }

    // Vertical swipe
    if (absDy > absDx && absDy > minSwipe) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const isLeftHalf = start.x < rect.left + rect.width / 2;

      if (isLeftHalf) {
        // Left half: brightness (show overlay only)
        const direction = dy < 0 ? 'up' : 'down';
        showGestureOverlay(direction === 'up' ? 'Brightness +' : 'Brightness -');
      } else {
        // Right half: volume
        const delta = dy < 0 ? 0.1 : -0.1;
        changeVolume(volume + delta);
        const newVol = clamp(volume + delta, 0, 1);
        showGestureOverlay(`Volume ${Math.round(newVol * 100)}%`);
      }
      resetHideTimer();
    }
  }, [currentTime, volume, seek, changeVolume, showGestureOverlay, resetHideTimer]);

  // -----------------------------------------------------------------------
  // Close menus on outside click
  // -----------------------------------------------------------------------

  const closeMenus = useCallback(() => {
    setShowSpeedMenu(false);
    setShowQualityMenu(false);
    setShowSubtitleMenu(false);
  }, []);

  // -----------------------------------------------------------------------
  // Progress bar interaction
  // -----------------------------------------------------------------------

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      seek(ratio * duration);
    },
    [duration, seek],
  );

  const handleProgressMouseDown = useCallback(() => setSeeking(true), []);
  const handleProgressMouseUp = useCallback(() => setSeeking(false), []);

  // -----------------------------------------------------------------------
  // Volume slider
  // -----------------------------------------------------------------------

  const handleVolumeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      changeVolume(ratio);
    },
    [changeVolume],
  );

  // -----------------------------------------------------------------------
  // Computed values
  // -----------------------------------------------------------------------

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = muted ? 0 : volume * 100;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black aspect-video select-none group"
      tabIndex={0}
      onMouseMove={resetHideTimer}
      onClick={(e) => {
        // Only toggle play if clicking the video area, not controls
        if ((e.target as HTMLElement).closest('[data-controls]')) return;
        closeMenus();
        togglePlay();
        resetHideTimer();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full"
        src={src}
        autoPlay={autoPlay}
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleVideoError}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        {subtitles.map((sub, i) => (
          <track
            key={`${sub.language}-${i}`}
            kind="subtitles"
            label={sub.label}
            srcLang={sub.language}
            src={sub.src}
            default={i === 0}
          />
        ))}
      </video>

      {/* Gesture overlay */}
      {gestureOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="bg-black/70 text-white text-lg font-semibold px-6 py-3 rounded-lg">
            {gestureOverlay}
          </div>
        </div>
      )}

      {/* Buffering spinner */}
      {buffering && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Loader2 className="w-12 h-12 text-accent animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40">
          <AlertTriangle className="w-12 h-12 text-danger mb-4" />
          <p className="text-white text-sm mb-4 text-center px-4 max-w-md">{error}</p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              retry();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-black font-semibold rounded hover:bg-accent-hover transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}

      {/* Title bar (top) */}
      <div
        className={`absolute top-0 left-0 right-0 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 z-10 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        data-controls
      >
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium truncate">{title}</span>
          <span className="text-muted text-xs">{source}</span>
          <RatingBadge rating={rating} size="sm" />
        </div>
      </div>

      {/* Controls bar (bottom) */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-2 px-3 transition-opacity duration-300 z-10 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        data-controls
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 group/progress relative"
          onClick={handleProgressClick}
          onMouseDown={handleProgressMouseDown}
          onMouseUp={handleProgressMouseUp}
        >
          <div
            className="h-full bg-accent rounded-full relative transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-accent rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="text-white hover:text-accent transition-colors p-1"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          {/* Time display */}
          <span className="text-white text-xs tabular-nums whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Volume */}
          <div className="flex items-center gap-1 group/vol">
            <button
              onClick={toggleMute}
              className="text-white hover:text-accent transition-colors p-1"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <div
              className="w-16 h-1 bg-white/20 rounded-full cursor-pointer hidden sm:block"
              onClick={handleVolumeClick}
            >
              <div
                className="h-full bg-accent rounded-full"
                style={{ width: `${volumePercent}%` }}
              />
            </div>
          </div>

          {/* Playback speed */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSpeedMenu(!showSpeedMenu);
                setShowQualityMenu(false);
                setShowSubtitleMenu(false);
              }}
              className="text-white hover:text-accent transition-colors p-1 text-xs font-semibold"
              aria-label="Playback speed"
            >
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-bg-card border border-border rounded-lg py-1 min-w-[80px] shadow-lg">
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => changePlaybackRate(rate)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover transition-colors ${
                      playbackRate === rate ? 'text-accent' : 'text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quality selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowQualityMenu(!showQualityMenu);
                setShowSpeedMenu(false);
                setShowSubtitleMenu(false);
              }}
              className="text-white hover:text-accent transition-colors p-1"
              aria-label="Quality settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            {showQualityMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-bg-card border border-border rounded-lg py-1 min-w-[100px] shadow-lg">
                {QUALITY_OPTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => changeQuality(q)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover transition-colors ${
                      quality === q ? 'text-accent' : 'text-white'
                    }`}
                  >
                    {q === 'auto' ? 'Auto' : q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Subtitles */}
          {subtitles.length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowSubtitleMenu(!showSubtitleMenu);
                  setShowSpeedMenu(false);
                  setShowQualityMenu(false);
                }}
                className={`hover:text-accent transition-colors p-1 ${
                  activeSubtitle !== null ? 'text-accent' : 'text-white'
                }`}
                aria-label="Subtitles"
              >
                <Subtitles className="w-5 h-5" />
              </button>
              {showSubtitleMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-bg-card border border-border rounded-lg py-1 min-w-[120px] shadow-lg">
                  <button
                    onClick={() => toggleSubtitle(null)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover transition-colors ${
                      activeSubtitle === null ? 'text-accent' : 'text-white'
                    }`}
                  >
                    Off
                  </button>
                  {subtitles.map((sub, i) => (
                    <button
                      key={`${sub.language}-${i}`}
                      onClick={() => toggleSubtitle(i)}
                      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover transition-colors ${
                        activeSubtitle === i ? 'text-accent' : 'text-white'
                      }`}
                    >
                      {sub.label}
                      {sub.isAI && (
                        <span className="ml-1 text-[10px] text-accent/70">(AI)</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Picture-in-Picture */}
          <button
            onClick={togglePiP}
            className="text-white hover:text-accent transition-colors p-1"
            aria-label="Picture in Picture"
          >
            <PictureInPicture2 className="w-5 h-5" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="text-white hover:text-accent transition-colors p-1"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize className="w-5 h-5" />
            ) : (
              <Maximize className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
