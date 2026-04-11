'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { ConsolePlatform } from '@/lib/types';

// Aspect ratios per platform
const ASPECT_RATIOS: Record<ConsolePlatform, { w: number; h: number }> = {
  NES: { w: 4, h: 3 },
  SNES: { w: 4, h: 3 },
  Game_Boy: { w: 10, h: 9 },
  Game_Boy_Color: { w: 10, h: 9 },
  Game_Boy_Advance: { w: 3, h: 2 },
  Genesis: { w: 4, h: 3 },
  Master_System: { w: 4, h: 3 },
  Arcade: { w: 4, h: 3 },
  Neo_Geo: { w: 4, h: 3 },
  PC_Engine: { w: 4, h: 3 },
  Atari_2600: { w: 4, h: 3 },
};

interface EmulatorCanvasProps {
  platform: ConsolePlatform;
  scale: number; // 50-200
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isFullscreen: boolean;
  onRequestFullscreen: () => void;
  onExitFullscreen: () => void;
}

export default function EmulatorCanvas({
  platform,
  scale,
  canvasRef,
  isFullscreen,
}: EmulatorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aspect = ASPECT_RATIOS[platform] ?? { w: 4, h: 3 };
  const aspectRatio = aspect.w / aspect.h;

  // Compute canvas dimensions to fit container while preserving aspect ratio
  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const scaleFactor = scale / 100;

    let canvasW: number;
    let canvasH: number;

    if (isFullscreen) {
      // In fullscreen, fit to container
      if (containerW / containerH > aspectRatio) {
        canvasH = containerH;
        canvasW = canvasH * aspectRatio;
      } else {
        canvasW = containerW;
        canvasH = canvasW / aspectRatio;
      }
    } else {
      // Normal mode: base size from container, then apply scale
      const baseW = Math.min(containerW, 800);
      const baseH = baseW / aspectRatio;
      canvasW = baseW * scaleFactor;
      canvasH = baseH * scaleFactor;

      // Clamp to container
      if (canvasW > containerW) {
        canvasW = containerW;
        canvasH = canvasW / aspectRatio;
      }
      if (canvasH > containerH) {
        canvasH = containerH;
        canvasW = canvasH * aspectRatio;
      }
    }

    canvas.style.width = `${Math.round(canvasW)}px`;
    canvas.style.height = `${Math.round(canvasH)}px`;
  }, [scale, isFullscreen, aspectRatio, canvasRef]);

  useEffect(() => {
    updateCanvasSize();
    const handleResize = () => updateCanvasSize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateCanvasSize]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center w-full flex-1 bg-black overflow-hidden"
    >
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        className="block"
        style={{
          imageRendering: 'pixelated',
          backgroundColor: '#000',
        }}
      />
    </div>
  );
}
