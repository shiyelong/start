'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MessageSquare, Send, Eye, EyeOff } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DanmakuItem {
  id: string;
  text: string;
  time: number;        // seconds when danmaku appears
  color: string;       // hex color like '#FFFFFF'
  position: 'scroll' | 'top' | 'bottom';
  size: 'small' | 'normal' | 'large';
}

export type DensityLevel = 'off' | 'low' | 'medium' | 'high';

export interface DanmakuLayerProps {
  danmakuList: DanmakuItem[];
  currentTime: number;
  playing: boolean;
  onSend?: (text: string, color: string, position: string, size: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_SIZES: Record<DanmakuItem['size'], number> = {
  small: 14,
  normal: 18,
  large: 24,
};

const DENSITY_LIMITS: Record<DensityLevel, number> = {
  off: 0,
  low: 5,
  medium: 15,
  high: 30,
};

const TIME_WINDOW = 0.5; // seconds
const SCROLL_DURATION = 8; // seconds
const FIXED_DURATION = 4; // seconds

const COLOR_PRESETS = [
  '#FFFFFF',
  '#FF0000',
  '#00FF00',
  '#3EA6FF',
  '#FFFF00',
  '#FF69B4',
  '#FFA500',
  '#9B59B6',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DanmakuLayer({
  danmakuList,
  currentTime,
  playing,
  onSend,
}: DanmakuLayerProps) {
  // State
  const [enabled, setEnabled] = useState(true);
  const [density, setDensity] = useState<DensityLevel>('medium');
  const [showInput, setShowInput] = useState(false);

  // Send form state
  const [inputText, setInputText] = useState('');
  const [sendColor, setSendColor] = useState('#FFFFFF');
  const [sendPosition, setSendPosition] = useState<DanmakuItem['position']>('scroll');
  const [sendSize, setSendSize] = useState<DanmakuItem['size']>('normal');

  // Track which danmaku IDs have already been rendered to avoid re-triggering
  const renderedRef = useRef<Set<string>>(new Set());
  const [activeDanmaku, setActiveDanmaku] = useState<DanmakuItem[]>([]);

  // -----------------------------------------------------------------------
  // Filter danmaku within the time window and apply density limit
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!enabled || density === 'off') {
      setActiveDanmaku([]);
      return;
    }

    const maxVisible = DENSITY_LIMITS[density];
    const windowStart = currentTime - TIME_WINDOW;
    const windowEnd = currentTime + TIME_WINDOW;

    // Find danmaku in the current time window that haven't been rendered yet
    const newItems = danmakuList.filter(
      (d) =>
        d.time >= windowStart &&
        d.time <= windowEnd &&
        !renderedRef.current.has(d.id),
    );

    // Mark new items as rendered
    for (const item of newItems) {
      renderedRef.current.add(item.id);
    }

    setActiveDanmaku((prev) => {
      const combined = [...prev, ...newItems];
      // Keep only up to maxVisible items, preferring newer ones
      if (combined.length > maxVisible) {
        return combined.slice(combined.length - maxVisible);
      }
      return combined;
    });
  }, [currentTime, danmakuList, enabled, density]);

  // Clean up expired danmaku
  useEffect(() => {
    if (!playing || !enabled || density === 'off') return;

    const interval = setInterval(() => {
      setActiveDanmaku((prev) =>
        prev.filter((d) => {
          const elapsed = currentTime - d.time;
          const maxDuration = d.position === 'scroll' ? SCROLL_DURATION : FIXED_DURATION;
          return elapsed < maxDuration;
        }),
      );
    }, 500);

    return () => clearInterval(interval);
  }, [playing, currentTime, enabled, density]);

  // Reset rendered set when seeking backwards
  const prevTimeRef = useRef(currentTime);
  useEffect(() => {
    if (currentTime < prevTimeRef.current - 1) {
      renderedRef.current.clear();
      setActiveDanmaku([]);
    }
    prevTimeRef.current = currentTime;
  }, [currentTime]);

  // -----------------------------------------------------------------------
  // Density cycling
  // -----------------------------------------------------------------------

  const cycleDensity = useCallback(() => {
    setDensity((prev) => {
      const order: DensityLevel[] = ['off', 'low', 'medium', 'high'];
      const idx = order.indexOf(prev);
      return order[(idx + 1) % order.length];
    });
  }, []);

  // -----------------------------------------------------------------------
  // Send handler
  // -----------------------------------------------------------------------

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || !onSend) return;
    onSend(trimmed, sendColor, sendPosition, sendSize);
    setInputText('');
  }, [inputText, sendColor, sendPosition, sendSize, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
      // Prevent video player keyboard shortcuts from firing
      e.stopPropagation();
    },
    [handleSend],
  );

  // -----------------------------------------------------------------------
  // Compute vertical slots for top/bottom danmaku to avoid overlap
  // -----------------------------------------------------------------------

  const topSlots = useMemo(() => {
    let slot = 0;
    const slots: Record<string, number> = {};
    for (const d of activeDanmaku) {
      if (d.position === 'top') {
        slots[d.id] = slot;
        slot = (slot + 1) % 5;
      }
    }
    return slots;
  }, [activeDanmaku]);

  const bottomSlots = useMemo(() => {
    let slot = 0;
    const slots: Record<string, number> = {};
    for (const d of activeDanmaku) {
      if (d.position === 'bottom') {
        slots[d.id] = slot;
        slot = (slot + 1) % 5;
      }
    }
    return slots;
  }, [activeDanmaku]);

  // Assign vertical offset for scroll danmaku to spread them out
  const scrollSlots = useMemo(() => {
    let slot = 0;
    const slots: Record<string, number> = {};
    for (const d of activeDanmaku) {
      if (d.position === 'scroll') {
        slots[d.id] = slot;
        slot = (slot + 1) % 12;
      }
    }
    return slots;
  }, [activeDanmaku]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
      {/* Danmaku items */}
      {enabled &&
        density !== 'off' &&
        activeDanmaku.map((d) => {
          const fontSize = FONT_SIZES[d.size];
          const baseStyle: React.CSSProperties = {
            color: d.color,
            fontSize: `${fontSize}px`,
            fontWeight: 600,
            textShadow: '1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
            position: 'absolute',
            lineHeight: 1.4,
          };

          if (d.position === 'scroll') {
            const slotIndex = scrollSlots[d.id] ?? 0;
            const topOffset = 8 + slotIndex * (fontSize + 8);
            return (
              <div
                key={d.id}
                className="danmaku-scroll"
                style={{
                  ...baseStyle,
                  top: `${topOffset}px`,
                  right: 0,
                  animation: `danmaku-scroll ${SCROLL_DURATION}s linear forwards`,
                }}
              >
                {d.text}
              </div>
            );
          }

          if (d.position === 'top') {
            const slotIndex = topSlots[d.id] ?? 0;
            const topOffset = 8 + slotIndex * (fontSize + 8);
            const elapsed = currentTime - d.time;
            const opacity = elapsed > FIXED_DURATION - 1 ? Math.max(0, FIXED_DURATION - elapsed) : 1;
            return (
              <div
                key={d.id}
                style={{
                  ...baseStyle,
                  top: `${topOffset}px`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  opacity,
                  transition: 'opacity 0.5s ease',
                }}
              >
                {d.text}
              </div>
            );
          }

          // bottom
          const slotIndex = bottomSlots[d.id] ?? 0;
          const bottomOffset = 60 + slotIndex * (fontSize + 8);
          const elapsed = currentTime - d.time;
          const opacity = elapsed > FIXED_DURATION - 1 ? Math.max(0, FIXED_DURATION - elapsed) : 1;
          return (
            <div
              key={d.id}
              style={{
                ...baseStyle,
                bottom: `${bottomOffset}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
                opacity,
                transition: 'opacity 0.5s ease',
              }}
            >
              {d.text}
            </div>
          );
        })}

      {/* Controls bar — positioned ABOVE video controls (bottom-12 to avoid overlap) */}
      <div
        className="absolute bottom-12 left-0 right-0 pointer-events-auto"
        data-controls
        onClick={(e) => e.stopPropagation()}
      >
        {/* Send input area */}
        {showInput && (
          <div className="mx-3 mb-2 bg-black/70 rounded-lg p-3 backdrop-blur-sm">
            {/* Style options row */}
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              {/* Color presets */}
              <div className="flex items-center gap-1">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSendColor(c)}
                    className="w-5 h-5 rounded-full border-2 transition-transform"
                    style={{
                      backgroundColor: c,
                      borderColor: sendColor === c ? '#3ea6ff' : 'transparent',
                      transform: sendColor === c ? 'scale(1.2)' : 'scale(1)',
                    }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>

              {/* Position selector */}
              <div className="flex items-center gap-1 text-xs">
                {(['scroll', 'top', 'bottom'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setSendPosition(pos)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      sendPosition === pos
                        ? 'bg-[#3ea6ff] text-black'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {pos === 'scroll' ? '滚动' : pos === 'top' ? '顶部' : '底部'}
                  </button>
                ))}
              </div>

              {/* Size selector */}
              <div className="flex items-center gap-1 text-xs">
                {(['small', 'normal', 'large'] as const).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setSendSize(sz)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      sendSize === sz
                        ? 'bg-[#3ea6ff] text-black'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {sz === 'small' ? 'S' : sz === 'normal' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>

            {/* Input + send */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入弹幕内容..."
                maxLength={100}
                className="flex-1 bg-white/10 text-white text-sm px-3 py-1.5 rounded outline-none placeholder:text-white/30 focus:ring-1 focus:ring-[#3ea6ff]"
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim()}
                className="text-[#3ea6ff] hover:text-[#65b8ff] disabled:text-white/20 transition-colors p-1.5"
                aria-label="发送弹幕"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Toggle buttons row */}
        <div className="flex items-center gap-2 mx-3 mb-2">
          {/* Toggle danmaku visibility */}
          <button
            onClick={() => setEnabled((prev) => !prev)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              enabled
                ? 'bg-white/10 text-white hover:bg-white/20'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
            aria-label={enabled ? '关闭弹幕' : '开启弹幕'}
          >
            {enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{enabled ? '弹幕开' : '弹幕关'}</span>
          </button>

          {/* Density control */}
          <button
            onClick={cycleDensity}
            className="px-2 py-1 rounded text-xs bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="弹幕密度"
          >
            密度: {density === 'off' ? '关' : density === 'low' ? '低' : density === 'medium' ? '中' : '高'}
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Open send input */}
          {onSend && (
            <button
              onClick={() => setShowInput((prev) => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                showInput
                  ? 'bg-[#3ea6ff] text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              aria-label="发送弹幕"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>弹幕</span>
            </button>
          )}
        </div>
      </div>

      {/* CSS animation for scroll danmaku */}
      <style jsx>{`
        @keyframes danmaku-scroll {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(-200%);
          }
        }
        .danmaku-scroll {
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
