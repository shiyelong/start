'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  SkipForward,
  SkipBack,
  Lock,
  Unlock,
  ChevronsRight,
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

export interface VideoQualityLevel {
  height: number;
  bitrate: number;
  label: string;
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
  onMinimize?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isHlsSource(src: string): boolean {
  return /\.m3u8(\?|$)/i.test(src);
}

// ---------------------------------------------------------------------------
// Timeline Preview — shows time tooltip on progress bar hover
// ---------------------------------------------------------------------------

function TimelinePreview({
  duration,
  containerWidth,
  mouseX,
  visible,
}: {
  duration: number;
  containerWidth: number;
  mouseX: number;
  visible: boolean;
}) {
  if (!visible || duration <= 0 || containerWidth <= 0) return null;
  const ratio = clamp(mouseX / containerWidth, 0, 1);
  const previewTime = ratio * duration;
  const left = clamp(mouseX, 30, containerWidth - 30);

  return (
    <div
      className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-20"
      style={{ left: `${left}px` }}
    >
      <div className="bg-black/90 text-white text-xs font-mono px-2 py-1 rounded whitespace-nowrap">
        {formatTime(previewTime)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buffer bar — shows buffered ranges
// ---------------------------------------------------------------------------

function BufferBar({ videoRef, duration }: { videoRef: React.RefObject<HTMLVideoElement | null>; duration: number }) {
  const [ranges, setRanges] = useState<{ start: number; end: number }[]>([]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      const buf = video.buffered;
      const r: { start: number; end: number }[] = [];
      for (let i = 0; i < buf.length; i++) {
        r.push({ start: buf.start(i), end: buf.end(i) });
      }
      setRanges(r);
    };
    video.addEventListener('progress', update);
    video.addEventListener('loadedmetadata', update);
    return () => {
      video.removeEventListener('progress', update);
      video.removeEventListener('loadedmetadata', update);
    };
  }, [videoRef]);

  if (duration <= 0) return null;

  return (
    <>
      {ranges.map((r, i) => (
        <div
          key={i}
          className="absolute top-0 h-full bg-white/20 rounded-full"
          style={{
            left: `${(r.start / duration) * 100}%`,
            width: `${((r.end - r.start) / duration) * 100}%`,
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Double-tap seek overlay
// ---------------------------------------------------------------------------

function DoubleTapOverlay({
  side,
  amount,
}: {
  side: 'left' | 'right';
  amount: number;
}) {
  return (
    <div
      className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} w-1/3 h-full flex items-center ${
        side === 'left' ? 'justify-start pl-8' : 'justify-end pr-8'
      } pointer-events-none z-30 animate-fade-in`}
    >
      <div className="flex flex-col items-center gap-1 text-white">
        {side === 'left' ? (
          <SkipBack className="w-8 h-8" />
        ) : (
          <SkipForward className="w-8 h-8" />
        )}
        <span className="text-sm font-semibold">{amount}s</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Long-press speed boost overlay
// ---------------------------------------------------------------------------

function SpeedBoostOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-30">
      <div className="flex items-center gap-1.5 bg-black/70 text-white text-sm font-semibold px-3 py-1.5 rounded-full">
        <ChevronsRight className="w-4 h-4 text-[#3ea6ff]" />
        3x 快进中
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
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
  onMinimize,
}: VideoPlayerProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressReportRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hlsRef = useRef<import('hls.js').default | null>(null);

  // Player state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  // HLS state
  const [hlsLevels, setHlsLevels] = useState<VideoQualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = auto
  const [hlsReady, setHlsReady] = useState(false);

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);
  const [controlsLocked, setControlsLocked] = useState(false);

  // Timeline preview state
  const [progressHover, setProgressHover] = useState(false);
  const [progressMouseX, setProgressMouseX] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  // Touch gesture state
  const [gestureOverlay, setGestureOverlay] = useState<string | null>(null);
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Double-tap state
  const [doubleTap, setDoubleTap] = useState<{ side: 'left' | 'right'; amount: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Long-press speed boost
  const [speedBoost, setSpeedBoost] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRateRef = useRef(1);

  // Continuous seek gesture state
  const [seekGesture, setSeekGesture] = useState(false);
  const seekStartTimeRef = useRef(0);
  const seekAccumRef = useRef(0);

  // -----------------------------------------------------------------------
  // HLS setup
  // -----------------------------------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      setHlsLevels([]);
      setHlsReady(false);
    }

    if (isHlsSource(src)) {
      let cancelled = false;
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !video) return;
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
          });
          hlsRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            const levels: VideoQualityLevel[] = data.levels.map((l) => ({
              height: l.height,
              bitrate: l.bitrate,
              label: `${l.height}p`,
            }));
            setHlsLevels(levels);
            setHlsReady(true);
            if (autoPlay) video.play().catch(() => {});
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            setCurrentLevel(data.level);
          });

          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              setError(`HLS Error: ${data.details}`);
              onError?.(new Error(data.details));
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          video.src = src;
          if (autoPlay) video.play().catch(() => {});
        }
      });
      return () => {
        cancelled = true;
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    } else {
      // Regular video source
      video.src = src;
      if (autoPlay) video.play().catch(() => {});
    }
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Video element event handlers
  // -----------------------------------------------------------------------

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    if (startTime > 0) video.currentTime = startTime;
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

  const changeHlsLevel = useCallback((level: number) => {
    const hls = hlsRef.current;
    if (hls) {
      hls.currentLevel = level; // -1 = auto
    }
    setCurrentLevel(level);
    setShowQualityMenu(false);
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
    } catch { /* not supported */ }
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
    } catch { /* not supported */ }
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
    if (controlsLocked) return;
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing, controlsLocked]);

  useEffect(() => {
    if (controlsLocked) { setShowControls(true); return; }
    if (playing) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    } else {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [playing, controlsLocked]);

  // -----------------------------------------------------------------------
  // Progress reporting
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (onProgress) {
      progressReportRef.current = setInterval(() => {
        const video = videoRef.current;
        if (video && !video.paused) onProgress(video.currentTime);
      }, 5000);
    }
    return () => { if (progressReportRef.current) clearInterval(progressReportRef.current); };
  }, [onProgress]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // -----------------------------------------------------------------------
  // Keyboard shortcuts (enhanced)
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (!container.contains(document.activeElement) && !isFullscreen) return;

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          resetHideTimer();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          seek(currentTime - (e.code === 'KeyJ' ? 10 : 5));
          showGestureOverlay(e.code === 'KeyJ' ? '-10s' : '-5s');
          resetHideTimer();
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          seek(currentTime + (e.code === 'KeyL' ? 10 : 5));
          showGestureOverlay(e.code === 'KeyL' ? '+10s' : '+5s');
          resetHideTimer();
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(volume + 0.05);
          resetHideTimer();
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(volume - 0.05);
          resetHideTimer();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          resetHideTimer();
          break;
        case 'Comma':
          if (e.shiftKey) {
            e.preventDefault();
            const idx = PLAYBACK_RATES.indexOf(playbackRate as typeof PLAYBACK_RATES[number]);
            if (idx > 0) changePlaybackRate(PLAYBACK_RATES[idx - 1]);
          }
          break;
        case 'Period':
          if (e.shiftKey) {
            e.preventDefault();
            const idx = PLAYBACK_RATES.indexOf(playbackRate as typeof PLAYBACK_RATES[number]);
            if (idx < PLAYBACK_RATES.length - 1) changePlaybackRate(PLAYBACK_RATES[idx + 1]);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seek, changeVolume, toggleMute, toggleFullscreen, changePlaybackRate, currentTime, volume, playbackRate, resetHideTimer, isFullscreen]);

  // -----------------------------------------------------------------------
  // Touch gestures — enhanced with double-tap, long-press, continuous seek
  // -----------------------------------------------------------------------

  const showGestureOverlay = useCallback((text: string) => {
    setGestureOverlay(text);
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = setTimeout(() => setGestureOverlay(null), 800);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const now = Date.now();
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now };

    // Long-press detection: start 3x speed after 500ms hold
    longPressTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      savedRateRef.current = video.playbackRate;
      video.playbackRate = 3;
      setSpeedBoost(true);
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // If finger moves significantly, cancel long-press
    const start = touchStartRef.current;
    if (!start || e.touches.length !== 1) return;
    const dx = Math.abs(e.touches[0].clientX - start.x);
    const dy = Math.abs(e.touches[0].clientY - start.y);
    if (dx > 10 || dy > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      // If speed boost was active, cancel it
      if (speedBoost) {
        const video = videoRef.current;
        if (video) video.playbackRate = savedRateRef.current;
        setSpeedBoost(false);
      }
    }

    // Continuous horizontal seek gesture
    if (dx > 20 && dx > dy * 1.5 && !seekGesture) {
      setSeekGesture(true);
      seekStartTimeRef.current = currentTime;
      seekAccumRef.current = 0;
    }

    if (seekGesture) {
      const totalDx = e.touches[0].clientX - start.x;
      const container = containerRef.current;
      const width = container?.clientWidth || 300;
      // Map full-width swipe to ±120s
      const seekDelta = (totalDx / width) * 120;
      seekAccumRef.current = seekDelta;
      const previewTime = clamp(seekStartTimeRef.current + seekDelta, 0, duration);
      showGestureOverlay(`${seekDelta >= 0 ? '+' : ''}${formatTime(Math.abs(seekDelta))} → ${formatTime(previewTime)}`);
    }
  }, [speedBoost, seekGesture, currentTime, duration, showGestureOverlay]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Cancel long-press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // End speed boost
    if (speedBoost) {
      const video = videoRef.current;
      if (video) video.playbackRate = savedRateRef.current;
      setSpeedBoost(false);
      touchStartRef.current = null;
      return;
    }

    // End continuous seek
    if (seekGesture) {
      seek(clamp(seekStartTimeRef.current + seekAccumRef.current, 0, duration));
      setSeekGesture(false);
      touchStartRef.current = null;
      return;
    }

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

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Tap detection (short, small movement)
    if (elapsed < 300 && absDx < 15 && absDy < 15) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const tapX = touch.clientX - rect.left;
      const now = Date.now();
      const lastTap = lastTapRef.current;

      // Double-tap detection
      if (lastTap && now - lastTap.time < 350 && Math.abs(tapX - lastTap.x) < 80) {
        // Double tap!
        if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
        lastTapRef.current = null;

        const isLeft = tapX < rect.width / 2;
        const seekAmount = 10;
        if (isLeft) {
          seek(currentTime - seekAmount);
          setDoubleTap({ side: 'left', amount: seekAmount });
        } else {
          seek(currentTime + seekAmount);
          setDoubleTap({ side: 'right', amount: seekAmount });
        }
        setTimeout(() => setDoubleTap(null), 600);
        return;
      }

      // Single tap — wait to see if double tap follows
      lastTapRef.current = { time: now, x: tapX };
      doubleTapTimerRef.current = setTimeout(() => {
        lastTapRef.current = null;
        // Single tap: toggle controls
        if (showControls) {
          setShowControls(false);
        } else {
          resetHideTimer();
        }
      }, 350);
      return;
    }

    // Swipe gestures (only if not a tap)
    if (elapsed < 50 || elapsed > 1000) return;
    const minSwipe = 40;

    // Vertical swipe
    if (absDy > absDx && absDy > minSwipe) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const isLeftHalf = start.x < rect.left + rect.width / 2;

      if (isLeftHalf) {
        showGestureOverlay(dy < 0 ? 'Brightness +' : 'Brightness -');
      } else {
        const delta = dy < 0 ? 0.1 : -0.1;
        changeVolume(volume + delta);
        const newVol = clamp(volume + delta, 0, 1);
        showGestureOverlay(`Volume ${Math.round(newVol * 100)}%`);
      }
      resetHideTimer();
    }
  }, [currentTime, volume, duration, seek, changeVolume, showGestureOverlay, resetHideTimer, showControls, speedBoost, seekGesture]);

  // -----------------------------------------------------------------------
  // Close menus
  // -----------------------------------------------------------------------

  const closeMenus = useCallback(() => {
    setShowSpeedMenu(false);
    setShowQualityMenu(false);
    setShowSubtitleMenu(false);
  }, []);

  // -----------------------------------------------------------------------
  // Progress bar interaction with timeline preview
  // -----------------------------------------------------------------------

  const handleProgressMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setProgressMouseX(e.clientX - rect.left);
    setProgressBarWidth(rect.width);
    setProgressHover(true);
  }, []);

  const handleProgressMouseLeave = useCallback(() => {
    setProgressHover(false);
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      seek(ratio * duration);
    },
    [duration, seek],
  );

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

  // Quality options: from HLS levels or fallback
  const qualityOptions = useMemo(() => {
    if (hlsLevels.length > 0) {
      return [
        { level: -1, label: '自动' },
        ...hlsLevels.map((l, i) => ({ level: i, label: l.label })),
      ];
    }
    return [
      { level: -1, label: '自动' },
      { level: 0, label: '1080p' },
      { level: 1, label: '720p' },
      { level: 2, label: '480p' },
      { level: 3, label: '360p' },
    ];
  }, [hlsLevels]);

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
        if ((e.target as HTMLElement).closest('[data-controls]')) return;
        closeMenus();
        togglePlay();
        resetHideTimer();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full"
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

      {/* Double-tap seek overlay */}
      {doubleTap && <DoubleTapOverlay side={doubleTap.side} amount={doubleTap.amount} />}

      {/* Long-press speed boost */}
      <SpeedBoostOverlay active={speedBoost} />

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
          <Loader2 className="w-12 h-12 text-[#3ea6ff] animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-white text-sm mb-4 text-center px-4 max-w-md">{error}</p>
          <button
            onClick={(e) => { e.stopPropagation(); retry(); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] text-black font-semibold rounded hover:bg-[#3ea6ff]/90 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            重试
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
          <span className="text-white/50 text-xs">{source}</span>
          <RatingBadge rating={rating} size="sm" />
          <div className="flex-1" />
          {/* Lock controls button (mobile) */}
          <button
            onClick={() => setControlsLocked(!controlsLocked)}
            className="text-white/70 hover:text-white transition-colors p-1 sm:hidden"
            aria-label={controlsLocked ? '解锁控制' : '锁定控制'}
          >
            {controlsLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          {/* Minimize button */}
          {onMinimize && (
            <button
              onClick={(e) => { e.stopPropagation(); onMinimize(); }}
              className="text-white/70 hover:text-white transition-colors p-1"
              aria-label="迷你播放器"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>
          )}
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
        {/* Progress bar with timeline preview and buffer */}
        <div
          ref={progressBarRef}
          className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer mb-3 group/progress relative"
          onClick={handleProgressClick}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
          {/* Buffer ranges */}
          <BufferBar videoRef={videoRef} duration={duration} />
          {/* Progress */}
          <div
            className="absolute top-0 h-full bg-[#3ea6ff] rounded-full z-[1] transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-[#3ea6ff] rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-lg" />
          </div>
          {/* Hover preview line */}
          {progressHover && (
            <div
              className="absolute top-0 h-full w-0.5 bg-white/40 z-[2] pointer-events-none"
              style={{ left: `${progressMouseX}px` }}
            />
          )}
          {/* Timeline preview tooltip */}
          <TimelinePreview
            duration={duration}
            containerWidth={progressBarWidth}
            mouseX={progressMouseX}
            visible={progressHover}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="text-white hover:text-[#3ea6ff] transition-colors p-1"
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          {/* Skip buttons (desktop) */}
          <button
            onClick={() => seek(currentTime - 10)}
            className="text-white/70 hover:text-white transition-colors p-1 hidden sm:block"
            aria-label="后退10秒"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => seek(currentTime + 10)}
            className="text-white/70 hover:text-white transition-colors p-1 hidden sm:block"
            aria-label="前进10秒"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Time display */}
          <span className="text-white text-xs tabular-nums whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          <div className="flex items-center gap-1 group/vol">
            <button
              onClick={toggleMute}
              className="text-white hover:text-[#3ea6ff] transition-colors p-1"
              aria-label={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div
              className="w-16 h-1 bg-white/20 rounded-full cursor-pointer hidden sm:block"
              onClick={handleVolumeClick}
            >
              <div className="h-full bg-[#3ea6ff] rounded-full" style={{ width: `${volumePercent}%` }} />
            </div>
          </div>

          {/* Playback speed */}
          <div className="relative">
            <button
              onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowQualityMenu(false); setShowSubtitleMenu(false); }}
              className={`hover:text-[#3ea6ff] transition-colors p-1 text-xs font-semibold ${playbackRate !== 1 ? 'text-[#3ea6ff]' : 'text-white'}`}
              aria-label="播放速度"
            >
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 min-w-[80px] shadow-lg">
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => changePlaybackRate(rate)}
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

          {/* Quality selector */}
          <div className="relative">
            <button
              onClick={() => { setShowQualityMenu(!showQualityMenu); setShowSpeedMenu(false); setShowSubtitleMenu(false); }}
              className="text-white hover:text-[#3ea6ff] transition-colors p-1"
              aria-label="画质设置"
            >
              <Settings className="w-5 h-5" />
            </button>
            {showQualityMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 min-w-[100px] shadow-lg">
                {qualityOptions.map((q) => (
                  <button
                    key={q.level}
                    onClick={() => changeHlsLevel(q.level)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
                      currentLevel === q.level ? 'text-[#3ea6ff]' : 'text-white'
                    }`}
                  >
                    {q.label}
                    {q.level === -1 && hlsLevels.length > 0 && currentLevel >= 0 && (
                      <span className="ml-1 text-white/40">({hlsLevels[currentLevel]?.label})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Subtitles */}
          {subtitles.length > 0 && (
            <div className="relative">
              <button
                onClick={() => { setShowSubtitleMenu(!showSubtitleMenu); setShowSpeedMenu(false); setShowQualityMenu(false); }}
                className={`hover:text-[#3ea6ff] transition-colors p-1 ${activeSubtitle !== null ? 'text-[#3ea6ff]' : 'text-white'}`}
                aria-label="字幕"
              >
                <Subtitles className="w-5 h-5" />
              </button>
              {showSubtitleMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 min-w-[120px] shadow-lg">
                  <button
                    onClick={() => toggleSubtitle(null)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${activeSubtitle === null ? 'text-[#3ea6ff]' : 'text-white'}`}
                  >
                    关闭
                  </button>
                  {subtitles.map((sub, i) => (
                    <button
                      key={`${sub.language}-${i}`}
                      onClick={() => toggleSubtitle(i)}
                      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${activeSubtitle === i ? 'text-[#3ea6ff]' : 'text-white'}`}
                    >
                      {sub.label}
                      {sub.isAI && <span className="ml-1 text-[10px] text-[#3ea6ff]/70">(AI)</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PiP */}
          <button
            onClick={togglePiP}
            className="text-white hover:text-[#3ea6ff] transition-colors p-1 hidden sm:block"
            aria-label="画中画"
          >
            <PictureInPicture2 className="w-5 h-5" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="text-white hover:text-[#3ea6ff] transition-colors p-1"
            aria-label={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
