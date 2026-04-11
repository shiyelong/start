"use client";
import { useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface VirtualDPadProps {
  onDirection: (dir: "up" | "down" | "left" | "right") => void;
  onAction?: () => void;
  layout?: "cross" | "joystick";
}

type Direction = "up" | "down" | "left" | "right";

// ─── Component ───────────────────────────────────────────────────────────────
export default function VirtualDPad({
  onDirection,
  onAction,
  layout = "cross",
}: VirtualDPadProps) {
  const [activeDir, setActiveDir] = useState<Direction | null>(null);
  const [actionActive, setActionActive] = useState(false);

  const handleTouchStart = useCallback(
    (dir: Direction) => (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveDir(dir);
      onDirection(dir);
    },
    [onDirection]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveDir(null);
    },
    []
  );

  const handleActionStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActionActive(true);
      onAction?.();
    },
    [onAction]
  );

  const handleActionEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActionActive(false);
    },
    []
  );

  // Also support mouse for desktop testing
  const handleMouseDown = useCallback(
    (dir: Direction) => (e: React.MouseEvent) => {
      e.preventDefault();
      setActiveDir(dir);
      onDirection(dir);
    },
    [onDirection]
  );

  const handleMouseUp = useCallback(() => {
    setActiveDir(null);
  }, []);

  const handleActionMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setActionActive(true);
      onAction?.();
    },
    [onAction]
  );

  const handleActionMouseUp = useCallback(() => {
    setActionActive(false);
  }, []);

  const btnBase =
    "flex items-center justify-center select-none touch-none transition-colors duration-100";
  const btnSize = "w-14 h-14 rounded-xl text-xl";

  const dirBtnClass = (dir: Direction) =>
    `${btnBase} ${btnSize} ${
      activeDir === dir
        ? "bg-accent/30 text-accent border border-accent/60 scale-95"
        : "bg-bg-card text-subtle border border-border hover:bg-bg-hover"
    }`;

  return (
    <div className="flex items-center gap-6 select-none touch-none">
      {/* D-Pad cross layout */}
      <div className="grid grid-cols-3 grid-rows-3 gap-1" style={{ width: "11rem", height: "11rem" }}>
        {/* Row 1: empty - up - empty */}
        <div />
        <button
          className={dirBtnClass("up")}
          onTouchStart={handleTouchStart("up")}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown("up")}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          aria-label="上"
        >
          ▲
        </button>
        <div />

        {/* Row 2: left - center - right */}
        <button
          className={dirBtnClass("left")}
          onTouchStart={handleTouchStart("left")}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown("left")}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          aria-label="左"
        >
          ◀
        </button>
        <div className="flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-border/40" />
        </div>
        <button
          className={dirBtnClass("right")}
          onTouchStart={handleTouchStart("right")}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown("right")}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          aria-label="右"
        >
          ▶
        </button>

        {/* Row 3: empty - down - empty */}
        <div />
        <button
          className={dirBtnClass("down")}
          onTouchStart={handleTouchStart("down")}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown("down")}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          aria-label="下"
        >
          ▼
        </button>
        <div />
      </div>

      {/* Optional action button */}
      {onAction && (
        <button
          className={`${btnBase} w-16 h-16 rounded-full text-sm font-bold ${
            actionActive
              ? "bg-accent/30 text-accent border-2 border-accent/60 scale-95"
              : "bg-bg-card text-subtle border-2 border-border hover:bg-bg-hover"
          }`}
          onTouchStart={handleActionStart}
          onTouchEnd={handleActionEnd}
          onMouseDown={handleActionMouseDown}
          onMouseUp={handleActionMouseUp}
          onMouseLeave={handleActionMouseUp}
          aria-label="动作"
        >
          A
        </button>
      )}
    </div>
  );
}
