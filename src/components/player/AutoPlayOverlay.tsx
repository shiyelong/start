'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, X, SkipForward, Clock, List } from 'lucide-react';
import type { AutoPlayCandidate } from '@/lib/player/autoplay-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoPlayOverlayProps {
  candidate: AutoPlayCandidate;
  queue: AutoPlayCandidate[];
  countdownSeconds?: number;
  onPlayNow: () => void;
  onCancel: () => void;
  onToggleAutoPlay: (enabled: boolean) => void;
  autoPlayEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCENT = '#3ea6ff';

function reasonLabel(reason: AutoPlayCandidate['reason']): string {
  switch (reason) {
    case 'next-episode':
      return 'Next Episode';
    case 'same-channel':
      return 'From same channel';
    case 'recommended':
      return 'Recommended';
  }
}

// ---------------------------------------------------------------------------
// CountdownRing — circular SVG countdown timer
// ---------------------------------------------------------------------------

function CountdownRing({
  remaining,
  total,
  size = 56,
}: {
  remaining: number;
  total: number;
  size?: number;
}) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? remaining / total : 0;
  const offset = circumference * (1 - progress);

  return (
    <svg
      width={size}
      height={size}
      className="transform -rotate-90"
      aria-hidden="true"
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={ACCENT}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AutoPlayOverlay({
  candidate,
  queue,
  countdownSeconds = 5,
  onPlayNow,
  onCancel,
  onToggleAutoPlay,
  autoPlayEnabled,
}: AutoPlayOverlayProps) {
  const [remaining, setRemaining] = useState(countdownSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Countdown logic
  // -----------------------------------------------------------------------

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setRemaining(countdownSeconds);

    if (!autoPlayEnabled) return;

    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [countdownSeconds, autoPlayEnabled, clearTimer]);

  // Auto-play when countdown reaches 0
  useEffect(() => {
    if (remaining === 0 && autoPlayEnabled) {
      onPlayNow();
    }
  }, [remaining, autoPlayEnabled, onPlayNow]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleCancel = useCallback(() => {
    clearTimer();
    onCancel();
  }, [clearTimer, onCancel]);

  const handlePlayNow = useCallback(() => {
    clearTimer();
    onPlayNow();
  }, [clearTimer, onPlayNow]);

  const handleToggle = useCallback(() => {
    const next = !autoPlayEnabled;
    if (!next) clearTimer();
    onToggleAutoPlay(next);
  }, [autoPlayEnabled, clearTimer, onToggleAutoPlay]);

  // Limit displayed queue to 5 items
  const displayQueue = queue.slice(0, 5);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="w-full max-w-md px-4 py-6 flex flex-col items-center gap-5">
        {/* ---- Toggle ---- */}
        <div className="flex items-center gap-2 self-end">
          <span className="text-xs text-neutral-400">Auto Play</span>
          <button
            role="switch"
            aria-checked={autoPlayEnabled}
            onClick={handleToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              autoPlayEnabled ? 'bg-[#3ea6ff]' : 'bg-neutral-600'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                autoPlayEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
        </div>

        {/* ---- Main candidate card ---- */}
        <div className="w-full rounded-lg bg-neutral-900 border border-neutral-700 overflow-hidden">
          {/* Thumbnail + countdown ring */}
          <div className="relative aspect-video bg-neutral-800">
            {candidate.item.cover ? (
              <img
                src={candidate.item.cover}
                alt={candidate.item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Play className="w-12 h-12 text-neutral-600" />
              </div>
            )}

            {/* Countdown overlay */}
            {autoPlayEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="relative flex items-center justify-center">
                  <CountdownRing remaining={remaining} total={countdownSeconds} />
                  <span className="absolute text-white text-lg font-semibold">
                    {remaining}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="px-4 py-3">
            <p className="text-white text-sm font-medium truncate">
              {candidate.item.title}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-neutral-400 text-xs truncate">
                {candidate.item.source}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${ACCENT}22`, color: ACCENT }}
              >
                {reasonLabel(candidate.reason)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 px-4 pb-4">
            <button
              onClick={handlePlayNow}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm font-semibold text-black transition-colors"
              style={{ backgroundColor: ACCENT }}
            >
              <Play className="w-4 h-4" />
              Play Now
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm font-semibold text-white bg-neutral-700 hover:bg-neutral-600 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>

        {/* ---- Upcoming queue ---- */}
        {displayQueue.length > 0 && (
          <div className="w-full">
            <div className="flex items-center gap-1.5 mb-2">
              <List className="w-4 h-4 text-neutral-400" />
              <span className="text-xs text-neutral-400 font-medium">
                Up Next
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {displayQueue.map((entry, idx) => (
                <div
                  key={entry.item.id ?? idx}
                  className="flex items-center gap-3 rounded bg-neutral-900/60 px-3 py-2"
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-9 flex-shrink-0 rounded overflow-hidden bg-neutral-800">
                    {entry.item.cover ? (
                      <img
                        src={entry.item.cover}
                        alt={entry.item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <SkipForward className="w-4 h-4 text-neutral-600" />
                      </div>
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs truncate">
                      {entry.item.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-neutral-500 text-[10px] truncate">
                        {entry.item.source}
                      </span>
                      <Clock className="w-3 h-3 text-neutral-500" />
                      <span className="text-neutral-500 text-[10px]">
                        {reasonLabel(entry.reason)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
