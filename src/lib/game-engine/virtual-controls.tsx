"use client";

/**
 * VirtualControls — 移动端虚拟操控按钮
 *
 * 自动检测移动设备并显示虚拟 D-pad 和动作按钮。
 * 触摸事件通过回调传递给游戏输入系统。
 *
 * Requirements: 6.9 (移动端虚拟操控按钮自动显示)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

export interface VirtualControlsProps {
  /** Called when a direction button is pressed */
  onDirectionStart?: (direction: "up" | "down" | "left" | "right") => void;
  /** Called when a direction button is released */
  onDirectionEnd?: (direction: "up" | "down" | "left" | "right") => void;
  /** Called when action button A is pressed */
  onActionA?: () => void;
  /** Called when action button A is released */
  onActionAEnd?: () => void;
  /** Called when action button B is pressed */
  onActionB?: () => void;
  /** Called when action button B is released */
  onActionBEnd?: () => void;
  /** Force show controls even on desktop (for testing) */
  forceShow?: boolean;
  /** Custom opacity (0-1, default: 0.6) */
  opacity?: number;
  /** Whether to show action buttons (default: true) */
  showActions?: boolean;
  /** Whether to show D-pad (default: true) */
  showDpad?: boolean;
}

// ─── Mobile Detection ────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const hasTouchScreen =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 1024;
      setIsMobile(hasTouchScreen && isSmallScreen);
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

// ─── DPad Button ─────────────────────────────────────────

interface DPadButtonProps {
  direction: "up" | "down" | "left" | "right";
  icon: React.ReactNode;
  onStart: () => void;
  onEnd: () => void;
  className?: string;
}

function DPadButton({ direction, icon, onStart, onEnd, className = "" }: DPadButtonProps) {
  const activeRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeRef.current) {
        activeRef.current = true;
        onStart();
      }
    },
    [onStart],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeRef.current) {
        activeRef.current = false;
        onEnd();
      }
    },
    [onEnd],
  );

  return (
    <button
      className={`w-12 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center
        active:bg-[#3ea6ff]/30 active:border-[#3ea6ff]/50 transition-colors select-none touch-none ${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      aria-label={`Direction ${direction}`}
      data-direction={direction}
    >
      {icon}
    </button>
  );
}

// ─── Action Button ───────────────────────────────────────

interface ActionButtonProps {
  label: string;
  color: string;
  onStart: () => void;
  onEnd: () => void;
}

function ActionButton({ label, color, onStart, onEnd }: ActionButtonProps) {
  const activeRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeRef.current) {
        activeRef.current = true;
        onStart();
      }
    },
    [onStart],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeRef.current) {
        activeRef.current = false;
        onEnd();
      }
    },
    [onEnd],
  );

  return (
    <button
      className={`w-14 h-14 rounded-full border-2 flex items-center justify-center
        font-bold text-sm select-none touch-none active:scale-95 transition-transform`}
      style={{
        backgroundColor: `${color}20`,
        borderColor: `${color}60`,
        color: color,
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      aria-label={`Action ${label}`}
    >
      {label}
    </button>
  );
}

// ─── VirtualControls Component ───────────────────────────

export default function VirtualControls({
  onDirectionStart,
  onDirectionEnd,
  onActionA,
  onActionAEnd,
  onActionB,
  onActionBEnd,
  forceShow = false,
  opacity = 0.6,
  showActions = true,
  showDpad = true,
}: VirtualControlsProps) {
  const isMobile = useIsMobile();
  const visible = forceShow || isMobile;

  if (!visible) return null;

  const dirStart = (dir: "up" | "down" | "left" | "right") => {
    onDirectionStart?.(dir);
  };

  const dirEnd = (dir: "up" | "down" | "left" | "right") => {
    onDirectionEnd?.(dir);
  };

  return (
    <div
      className="fixed bottom-4 left-0 right-0 flex items-end justify-between px-4 pointer-events-none z-50"
      style={{ opacity }}
    >
      {/* D-Pad (left side) */}
      {showDpad && (
        <div className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1">
          {/* Row 1: empty - up - empty */}
          <div />
          <DPadButton
            direction="up"
            icon={<ChevronUp size={20} className="text-white" />}
            onStart={() => dirStart("up")}
            onEnd={() => dirEnd("up")}
          />
          <div />

          {/* Row 2: left - center - right */}
          <DPadButton
            direction="left"
            icon={<ChevronLeft size={20} className="text-white" />}
            onStart={() => dirStart("left")}
            onEnd={() => dirEnd("left")}
          />
          <div className="w-12 h-12" />
          <DPadButton
            direction="right"
            icon={<ChevronRight size={20} className="text-white" />}
            onStart={() => dirStart("right")}
            onEnd={() => dirEnd("right")}
          />

          {/* Row 3: empty - down - empty */}
          <div />
          <DPadButton
            direction="down"
            icon={<ChevronDown size={20} className="text-white" />}
            onStart={() => dirStart("down")}
            onEnd={() => dirEnd("down")}
          />
          <div />
        </div>
      )}

      {/* Spacer when only one side is shown */}
      {!showDpad && <div />}

      {/* Action Buttons (right side) */}
      {showActions && (
        <div className="pointer-events-auto flex items-center gap-3 mb-2">
          <ActionButton
            label="B"
            color="#ff6b6b"
            onStart={() => onActionB?.()}
            onEnd={() => onActionBEnd?.()}
          />
          <ActionButton
            label="A"
            color="#3ea6ff"
            onStart={() => onActionA?.()}
            onEnd={() => onActionAEnd?.()}
          />
        </div>
      )}

      {/* Spacer when only one side is shown */}
      {!showActions && <div />}
    </div>
  );
}
