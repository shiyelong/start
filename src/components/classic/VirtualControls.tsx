'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ConsolePlatform, InputFrame, VirtualControlsLayout } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VirtualControlsProps {
  platform: ConsolePlatform;
  onInput: (input: InputFrame) => void;
  opacity: number; // 0.25, 0.5, 0.75, 1.0
  size: 'small' | 'medium' | 'large';
}

interface ButtonDef {
  id: string;
  label: string;
  key: keyof InputFrame;
}

interface PlatformLayout {
  actionButtons: ButtonDef[];
  shoulderButtons: ButtonDef[];
  metaButtons: ButtonDef[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIZE_MAP = {
  small: { dpad: 80, button: 36 },
  medium: { dpad: 100, button: 44 },
  large: { dpad: 120, button: 52 },
} as const;

const DB_NAME = 'fc-arcade-online';
const DB_VERSION = 3;
const SETTINGS_STORE = 'settings';
const LAYOUT_KEY = 'virtualControlsLayout';

const LONG_PRESS_MS = 500;

// ---------------------------------------------------------------------------
// Platform button layouts
// ---------------------------------------------------------------------------

function getLayoutForPlatform(platform: ConsolePlatform): PlatformLayout {
  switch (platform) {
    case 'NES':
    case 'Game_Boy':
    case 'Game_Boy_Color':
      return {
        actionButtons: [
          { id: 'b', label: 'B', key: 'b' },
          { id: 'a', label: 'A', key: 'a' },
        ],
        shoulderButtons: [],
        metaButtons: [
          { id: 'select', label: 'SEL', key: 'select' },
          { id: 'start', label: 'START', key: 'start' },
        ],
      };
    case 'SNES':
      return {
        actionButtons: [
          { id: 'y', label: 'Y', key: 'y' },
          { id: 'b', label: 'B', key: 'b' },
          { id: 'x', label: 'X', key: 'x' },
          { id: 'a', label: 'A', key: 'a' },
        ],
        shoulderButtons: [
          { id: 'l', label: 'L', key: 'l' },
          { id: 'r', label: 'R', key: 'r' },
        ],
        metaButtons: [
          { id: 'select', label: 'SEL', key: 'select' },
          { id: 'start', label: 'START', key: 'start' },
        ],
      };
    case 'Game_Boy_Advance':
      return {
        actionButtons: [
          { id: 'b', label: 'B', key: 'b' },
          { id: 'a', label: 'A', key: 'a' },
        ],
        shoulderButtons: [
          { id: 'l', label: 'L', key: 'l' },
          { id: 'r', label: 'R', key: 'r' },
        ],
        metaButtons: [
          { id: 'select', label: 'SEL', key: 'select' },
          { id: 'start', label: 'START', key: 'start' },
        ],
      };
    case 'Genesis':
      return {
        actionButtons: [
          { id: 'a', label: 'A', key: 'a' },
          { id: 'b', label: 'B', key: 'b' },
          { id: 'x', label: 'C', key: 'x' },
        ],
        shoulderButtons: [],
        metaButtons: [
          { id: 'start', label: 'START', key: 'start' },
        ],
      };
    case 'Master_System':
      return {
        actionButtons: [
          { id: 'a', label: '1', key: 'a' },
          { id: 'b', label: '2', key: 'b' },
        ],
        shoulderButtons: [],
        metaButtons: [],
      };
    case 'Arcade':
      return {
        actionButtons: [
          { id: 'a', label: 'A', key: 'a' },
          { id: 'b', label: 'B', key: 'b' },
          { id: 'x', label: 'C', key: 'x' },
          { id: 'y', label: 'D', key: 'y' },
          { id: 'l', label: 'E', key: 'l' },
          { id: 'r', label: 'F', key: 'r' },
        ],
        shoulderButtons: [],
        metaButtons: [
          { id: 'start', label: 'START', key: 'start' },
          { id: 'select', label: 'COIN', key: 'select' },
        ],
      };
    case 'Neo_Geo':
      return {
        actionButtons: [
          { id: 'a', label: 'A', key: 'a' },
          { id: 'b', label: 'B', key: 'b' },
          { id: 'x', label: 'C', key: 'x' },
          { id: 'y', label: 'D', key: 'y' },
        ],
        shoulderButtons: [],
        metaButtons: [
          { id: 'start', label: 'START', key: 'start' },
          { id: 'select', label: 'COIN', key: 'select' },
        ],
      };
    case 'PC_Engine':
      return {
        actionButtons: [
          { id: 'b', label: 'II', key: 'b' },
          { id: 'a', label: 'I', key: 'a' },
        ],
        shoulderButtons: [],
        metaButtons: [
          { id: 'select', label: 'SEL', key: 'select' },
          { id: 'start', label: 'RUN', key: 'start' },
        ],
      };
    case 'Atari_2600':
      return {
        actionButtons: [
          { id: 'a', label: 'FIRE', key: 'a' },
        ],
        shoulderButtons: [],
        metaButtons: [],
      };
    default:
      return {
        actionButtons: [
          { id: 'b', label: 'B', key: 'b' },
          { id: 'a', label: 'A', key: 'a' },
        ],
        shoulderButtons: [],
        metaButtons: [
          { id: 'select', label: 'SEL', key: 'select' },
          { id: 'start', label: 'START', key: 'start' },
        ],
      };
  }
}

// ---------------------------------------------------------------------------
// IndexedDB helpers for layout persistence
// ---------------------------------------------------------------------------

function openSettingsDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('roms')) {
        db.createObjectStore('roms', { keyPath: 'hash' });
      }
      if (!db.objectStoreNames.contains('save-states')) {
        db.createObjectStore('save-states');
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadLayout(): Promise<VirtualControlsLayout | null> {
  try {
    const db = await openSettingsDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const store = tx.objectStore(SETTINGS_STORE);
      const req = store.get(LAYOUT_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveLayout(layout: VirtualControlsLayout): Promise<void> {
  try {
    const db = await openSettingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = tx.objectStore(SETTINGS_STORE);
      const req = store.put(layout, LAYOUT_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silently fail — layout persistence is best-effort
  }
}

// ---------------------------------------------------------------------------
// Neutral input frame
// ---------------------------------------------------------------------------

function neutralInput(): InputFrame {
  return {
    up: false, down: false, left: false, right: false,
    a: false, b: false, x: false, y: false,
    l: false, r: false, start: false, select: false,
    turbo: {},
  };
}

// ---------------------------------------------------------------------------
// Touch-capable detection
// ---------------------------------------------------------------------------

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches;
}

// ---------------------------------------------------------------------------
// D-pad direction from touch position (8-directional)
// ---------------------------------------------------------------------------

type DpadDir = { up: boolean; down: boolean; left: boolean; right: boolean };

function getDpadDirection(
  touchX: number,
  touchY: number,
  centerX: number,
  centerY: number,
  radius: number,
): DpadDir {
  const dx = touchX - centerX;
  const dy = touchY - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < radius * 0.15) {
    return { up: false, down: false, left: false, right: false };
  }

  const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180

  // 8 sectors of 45° each
  const up = angle < -22.5 && angle > -157.5;
  const down = angle > 22.5 && angle < 157.5;
  const left = angle > 112.5 || angle < -112.5;
  const right = angle > -67.5 && angle < 67.5;

  return { up, down, left, right };
}

// ---------------------------------------------------------------------------
// DPad sub-component
// ---------------------------------------------------------------------------

interface DPadProps {
  size: number;
  opacity: number;
  onDirectionChange: (dir: DpadDir) => void;
  position: { x: number; y: number };
  onDragEnd: (pos: { x: number; y: number }) => void;
}

function DPad({ size, opacity, onDirectionChange, position, onDragEnd }: DPadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeDir, setActiveDir] = useState<DpadDir>({ up: false, down: false, left: false, right: false });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleTouch = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (isDragging.current) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const touch = e.touches[0];
      const dir = getDpadDirection(touch.clientX, touch.clientY, cx, cy, size / 2);
      setActiveDir(dir);
      onDirectionChange(dir);
    },
    [size, onDirectionChange],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (isDragging.current) {
        isDragging.current = false;
        return;
      }
      const zero: DpadDir = { up: false, down: false, left: false, right: false };
      setActiveDir(zero);
      onDirectionChange(zero);
    },
    [onDirectionChange],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const el = ref.current;
      if (!el) return;

      // Start long-press timer for drag mode
      longPressTimer.current = setTimeout(() => {
        isDragging.current = true;
        const rect = el.getBoundingClientRect();
        dragOffset.current = {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      }, LONG_PRESS_MS);

      // Immediately register direction
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dir = getDpadDirection(touch.clientX, touch.clientY, cx, cy, size / 2);
      setActiveDir(dir);
      onDirectionChange(dir);
    },
    [size, onDirectionChange],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (isDragging.current) {
        const parentEl = ref.current?.parentElement;
        if (!parentEl) return;
        const parentRect = parentEl.getBoundingClientRect();
        const newX = touch.clientX - parentRect.left - dragOffset.current.x;
        const newY = touch.clientY - parentRect.top - dragOffset.current.y;
        onDragEnd({ x: newX, y: newY });
        return;
      }
      // Normal D-pad tracking
      handleTouch(e);
    },
    [handleTouch, onDragEnd],
  );

  const half = size / 2;
  const armW = size * 0.32;
  const armH = size * 0.32;

  return (
    <div
      ref={ref}
      className="absolute touch-none select-none"
      style={{
        left: position.x,
        top: position.y,
        width: size,
        height: size,
        opacity,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* D-pad background circle */}
      <div
        className="absolute rounded-full bg-black/50 border border-white/20"
        style={{ width: size, height: size }}
      />
      {/* Up */}
      <div
        className="absolute rounded-t-md transition-colors duration-75"
        style={{
          left: half - armW / 2,
          top: size * 0.08,
          width: armW,
          height: armH,
          backgroundColor: activeDir.up ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
        }}
      />
      {/* Down */}
      <div
        className="absolute rounded-b-md transition-colors duration-75"
        style={{
          left: half - armW / 2,
          bottom: size * 0.08,
          width: armW,
          height: armH,
          backgroundColor: activeDir.down ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
        }}
      />
      {/* Left */}
      <div
        className="absolute rounded-l-md transition-colors duration-75"
        style={{
          left: size * 0.08,
          top: half - armW / 2,
          width: armH,
          height: armW,
          backgroundColor: activeDir.left ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
        }}
      />
      {/* Right */}
      <div
        className="absolute rounded-r-md transition-colors duration-75"
        style={{
          right: size * 0.08,
          top: half - armW / 2,
          width: armH,
          height: armW,
          backgroundColor: activeDir.right ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
        }}
      />
      {/* Center dot */}
      <div
        className="absolute rounded-full bg-white/10"
        style={{
          left: half - 4,
          top: half - 4,
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action button sub-component
// ---------------------------------------------------------------------------

interface ActionButtonProps {
  btn: ButtonDef;
  btnSize: number;
  opacity: number;
  isPressed: boolean;
  onPress: (key: keyof InputFrame) => void;
  onRelease: (key: keyof InputFrame) => void;
}

function ActionButton({ btn, btnSize, opacity, isPressed, onPress, onRelease }: ActionButtonProps) {
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      onPress(btn.key);
    },
    [btn.key, onPress],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      onRelease(btn.key);
    },
    [btn.key, onRelease],
  );

  return (
    <div
      className="rounded-full flex items-center justify-center touch-none select-none transition-colors duration-75 border"
      style={{
        width: btnSize,
        height: btnSize,
        opacity,
        backgroundColor: isPressed ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)',
        borderColor: isPressed ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <span
        className="text-white font-bold pointer-events-none"
        style={{ fontSize: btnSize * 0.38 }}
      >
        {btn.label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button group (right side action buttons) with drag support
// ---------------------------------------------------------------------------

interface ButtonGroupProps {
  buttons: ButtonDef[];
  layout: 'row' | 'diamond' | 'grid';
  btnSize: number;
  opacity: number;
  pressedKeys: Set<string>;
  onPress: (key: keyof InputFrame) => void;
  onRelease: (key: keyof InputFrame) => void;
  position: { x: number; y: number };
  onDragEnd: (pos: { x: number; y: number }) => void;
}

function ButtonGroup({
  buttons,
  layout,
  btnSize,
  opacity,
  pressedKeys,
  onPress,
  onRelease,
  position,
  onDragEnd,
}: ButtonGroupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleGroupTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const el = ref.current;
    if (!el) return;
    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      const rect = el.getBoundingClientRect();
      dragOffset.current = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }, LONG_PRESS_MS);
  }, []);

  const handleGroupTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      const parentEl = ref.current?.parentElement;
      if (!parentEl) return;
      const parentRect = parentEl.getBoundingClientRect();
      onDragEnd({
        x: touch.clientX - parentRect.left - dragOffset.current.x,
        y: touch.clientY - parentRect.top - dragOffset.current.y,
      });
    },
    [onDragEnd],
  );

  const handleGroupTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    isDragging.current = false;
  }, []);

  const gap = btnSize * 0.15;

  // Render buttons based on layout type
  const renderButtons = () => {
    if (layout === 'diamond' && buttons.length === 4) {
      // SNES diamond: Y left, X top, B bottom, A right
      const [y, b, x, a] = buttons; // y, b, x, a
      const dSize = btnSize * 2.5;
      return (
        <div className="relative" style={{ width: dSize, height: dSize }}>
          {/* X - top */}
          <div className="absolute" style={{ left: dSize / 2 - btnSize / 2, top: 0 }}>
            <ActionButton btn={x} btnSize={btnSize} opacity={1} isPressed={pressedKeys.has(x.id)} onPress={onPress} onRelease={onRelease} />
          </div>
          {/* Y - left */}
          <div className="absolute" style={{ left: 0, top: dSize / 2 - btnSize / 2 }}>
            <ActionButton btn={y} btnSize={btnSize} opacity={1} isPressed={pressedKeys.has(y.id)} onPress={onPress} onRelease={onRelease} />
          </div>
          {/* A - right */}
          <div className="absolute" style={{ right: 0, top: dSize / 2 - btnSize / 2 }}>
            <ActionButton btn={a} btnSize={btnSize} opacity={1} isPressed={pressedKeys.has(a.id)} onPress={onPress} onRelease={onRelease} />
          </div>
          {/* B - bottom */}
          <div className="absolute" style={{ left: dSize / 2 - btnSize / 2, bottom: 0 }}>
            <ActionButton btn={b} btnSize={btnSize} opacity={1} isPressed={pressedKeys.has(b.id)} onPress={onPress} onRelease={onRelease} />
          </div>
        </div>
      );
    }

    if (layout === 'grid' && buttons.length > 4) {
      // Arcade 6-button grid: 2 rows of 3
      const cols = Math.min(3, buttons.length);
      return (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, ${btnSize}px)` }}>
          {buttons.map((btn) => (
            <ActionButton
              key={btn.id}
              btn={btn}
              btnSize={btnSize}
              opacity={1}
              isPressed={pressedKeys.has(btn.id)}
              onPress={onPress}
              onRelease={onRelease}
            />
          ))}
        </div>
      );
    }

    // Default: horizontal row
    return (
      <div className="flex items-center" style={{ gap }}>
        {buttons.map((btn) => (
          <ActionButton
            key={btn.id}
            btn={btn}
            btnSize={btnSize}
            opacity={1}
            isPressed={pressedKeys.has(btn.id)}
            onPress={onPress}
            onRelease={onRelease}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className="absolute touch-none select-none"
      style={{ left: position.x, top: position.y, opacity }}
      onTouchStart={handleGroupTouchStart}
      onTouchMove={handleGroupTouchMove}
      onTouchEnd={handleGroupTouchEnd}
    >
      {renderButtons()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Determine button layout type
// ---------------------------------------------------------------------------

function getButtonLayoutType(platform: ConsolePlatform): 'row' | 'diamond' | 'grid' {
  if (platform === 'SNES') return 'diamond';
  if (platform === 'Arcade') return 'grid';
  return 'row';
}

// ---------------------------------------------------------------------------
// Default positions (percentage-based, resolved to px in component)
// ---------------------------------------------------------------------------

const DEFAULT_LAYOUT: VirtualControlsLayout = {
  dpadPosition: { x: 20, y: -160 },
  buttonsPosition: { x: -160, y: -160 },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VirtualControls({
  platform,
  onInput,
  opacity,
  size,
}: VirtualControlsProps) {
  const [visible, setVisible] = useState(false);
  const [layout, setLayout] = useState<VirtualControlsLayout>(DEFAULT_LAYOUT);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const inputRef = useRef<InputFrame>(neutralInput());
  const containerRef = useRef<HTMLDivElement>(null);

  const platformLayout = useMemo(() => getLayoutForPlatform(platform), [platform]);
  const buttonLayoutType = useMemo(() => getButtonLayoutType(platform), [platform]);
  const sizes = SIZE_MAP[size];

  // Detect touch device
  useEffect(() => {
    setVisible(isTouchDevice());
  }, []);

  // Load persisted layout from IndexedDB
  useEffect(() => {
    loadLayout().then((saved) => {
      if (saved) setLayout(saved);
    });
  }, []);

  // Fire onInput callback whenever pressed keys change
  const emitInput = useCallback(() => {
    onInput({ ...inputRef.current });
  }, [onInput]);

  const handlePress = useCallback(
    (key: keyof InputFrame) => {
      if (key === 'turbo') return;
      (inputRef.current as unknown as Record<string, boolean>)[key] = true;
      pressedKeysRef.current.add(key as string);
      setPressedKeys(new Set(pressedKeysRef.current));
      emitInput();
    },
    [emitInput],
  );

  const handleRelease = useCallback(
    (key: keyof InputFrame) => {
      if (key === 'turbo') return;
      (inputRef.current as unknown as Record<string, boolean>)[key] = false;
      pressedKeysRef.current.delete(key as string);
      setPressedKeys(new Set(pressedKeysRef.current));
      emitInput();
    },
    [emitInput],
  );

  const handleDpadChange = useCallback(
    (dir: DpadDir) => {
      inputRef.current.up = dir.up;
      inputRef.current.down = dir.down;
      inputRef.current.left = dir.left;
      inputRef.current.right = dir.right;

      // Update pressed keys display
      const pk = pressedKeysRef.current;
      dir.up ? pk.add('up') : pk.delete('up');
      dir.down ? pk.add('down') : pk.delete('down');
      dir.left ? pk.add('left') : pk.delete('left');
      dir.right ? pk.add('right') : pk.delete('right');
      setPressedKeys(new Set(pk));
      emitInput();
    },
    [emitInput],
  );

  // Drag handlers — persist to IndexedDB
  const handleDpadDragEnd = useCallback(
    (pos: { x: number; y: number }) => {
      const newLayout = { ...layout, dpadPosition: pos };
      setLayout(newLayout);
      saveLayout(newLayout);
    },
    [layout],
  );

  const handleButtonsDragEnd = useCallback(
    (pos: { x: number; y: number }) => {
      const newLayout = { ...layout, buttonsPosition: pos };
      setLayout(newLayout);
      saveLayout(newLayout);
    },
    [layout],
  );

  // Resolve positions: negative values are from right/bottom edge
  const resolvePosition = useCallback(
    (pos: { x: number; y: number }) => {
      const container = containerRef.current;
      if (!container) return pos;
      const rect = container.getBoundingClientRect();
      return {
        x: pos.x < 0 ? rect.width + pos.x : pos.x,
        y: pos.y < 0 ? rect.height + pos.y : pos.y,
      };
    },
    [],
  );

  if (!visible) return null;

  const dpadPos = resolvePosition(layout.dpadPosition);
  const buttonsPos = resolvePosition(layout.buttonsPosition);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-30"
      style={{ touchAction: 'none' }}
    >
      {/* D-pad — bottom left */}
      <div className="pointer-events-auto">
        <DPad
          size={sizes.dpad}
          opacity={opacity}
          onDirectionChange={handleDpadChange}
          position={dpadPos}
          onDragEnd={handleDpadDragEnd}
        />
      </div>

      {/* Action buttons — bottom right */}
      <div className="pointer-events-auto">
        <ButtonGroup
          buttons={platformLayout.actionButtons}
          layout={buttonLayoutType}
          btnSize={sizes.button}
          opacity={opacity}
          pressedKeys={pressedKeys}
          onPress={handlePress}
          onRelease={handleRelease}
          position={buttonsPos}
          onDragEnd={handleButtonsDragEnd}
        />
      </div>

      {/* Shoulder buttons — top corners */}
      {platformLayout.shoulderButtons.length > 0 && (
        <div
          className="absolute top-2 left-0 right-0 flex justify-between px-4 pointer-events-auto"
          style={{ opacity }}
        >
          {platformLayout.shoulderButtons.map((btn) => (
            <ActionButton
              key={btn.id}
              btn={btn}
              btnSize={sizes.button}
              opacity={1}
              isPressed={pressedKeys.has(btn.id)}
              onPress={handlePress}
              onRelease={handleRelease}
            />
          ))}
        </div>
      )}

      {/* Meta buttons (Start, Select) — center bottom */}
      {platformLayout.metaButtons.length > 0 && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-auto"
          style={{ opacity }}
        >
          {platformLayout.metaButtons.map((btn) => (
            <div
              key={btn.id}
              className="rounded-full flex items-center justify-center touch-none select-none transition-colors duration-75 border px-3"
              style={{
                height: sizes.button * 0.65,
                backgroundColor: pressedKeys.has(btn.id)
                  ? 'rgba(255,255,255,0.4)'
                  : 'rgba(0,0,0,0.45)',
                borderColor: pressedKeys.has(btn.id)
                  ? 'rgba(255,255,255,0.5)'
                  : 'rgba(255,255,255,0.2)',
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                handlePress(btn.key);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleRelease(btn.key);
              }}
            >
              <span
                className="text-white font-semibold pointer-events-none"
                style={{ fontSize: sizes.button * 0.28 }}
              >
                {btn.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
