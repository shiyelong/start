'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, UserPlus, X } from 'lucide-react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpectatorOverlayProps {
  /** Current number of spectators in the room */
  spectatorCount: number;
  /** Whether the current user is spectating */
  isSpectating: boolean;
  /** Whether a player slot has opened and this spectator is offered it */
  slotOffered: boolean;
  /** Called when the spectator accepts the offered slot */
  onTakeSlot?: () => void;
  /** Called when the spectator declines the offered slot */
  onDeclineSlot?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpectatorOverlay({
  spectatorCount,
  isSpectating,
  slotOffered,
  onTakeSlot,
  onDeclineSlot,
}: SpectatorOverlayProps) {
  const [showOffer, setShowOffer] = useState(false);

  // Show the slot offer when it becomes available
  useEffect(() => {
    if (slotOffered) {
      setShowOffer(true);
    }
  }, [slotOffered]);

  const handleTakeSlot = useCallback(() => {
    setShowOffer(false);
    onTakeSlot?.();
  }, [onTakeSlot]);

  const handleDecline = useCallback(() => {
    setShowOffer(false);
    onDeclineSlot?.();
  }, [onDeclineSlot]);

  return (
    <>
      {/* Spectating badge — top-left */}
      {isSpectating && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm border border-border/50 text-xs">
          <Eye size={13} className="text-accent" />
          <span className="font-semibold text-accent">观战中</span>
        </div>
      )}

      {/* Spectator count — top-right */}
      {spectatorCount > 0 && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm border border-border/50 text-xs text-muted">
          <Eye size={13} />
          <span>{spectatorCount} 观众</span>
        </div>
      )}

      {/* Slot offer popup — center */}
      {showOffer && isSpectating && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 p-5 rounded-xl bg-bg-card border border-border shadow-xl max-w-xs w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
            <UserPlus size={28} className="text-accent" />
            <p className="text-sm font-bold text-center">有空位了！</p>
            <p className="text-xs text-muted text-center">
              一个玩家离开了房间，你可以加入游戏。
            </p>
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={handleTakeSlot}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent/90 transition"
              >
                <UserPlus size={14} />
                加入游戏
              </button>
              <button
                onClick={handleDecline}
                className="p-2.5 rounded-lg border border-border text-muted hover:text-white hover:bg-bg-hover transition"
                title="继续观战"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
