/**
 * React hook for ResponsiveCanvas integration with PixiJS games.
 *
 * Provides:
 * - Automatic DPR-aware canvas sizing
 * - Container-fit scaling with aspect ratio preservation
 * - Touch/mouse coordinate mapping to game space
 * - Resize observer for dynamic layout changes
 *
 * Usage:
 *   const { containerRef, canvasRef, rc } = useResponsiveCanvas(gameW, gameH);
 *   // In JSX:
 *   <div ref={containerRef} className="w-full">
 *     <canvas ref={canvasRef} />
 *   </div>
 *   // In touch handler:
 *   const { x, y } = rc.current!.toGameCoords(e.clientX, e.clientY);
 */

import { useRef, useEffect, useCallback } from 'react';
import { ResponsiveCanvas, type ResponsiveCanvasOptions } from './responsive-canvas';

export interface UseResponsiveCanvasResult {
  /** Ref for the container div that wraps the canvas */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref for the canvas element */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Ref to the ResponsiveCanvas instance (available after mount) */
  rc: React.MutableRefObject<ResponsiveCanvas | null>;
  /** Convert screen coords to game coords */
  toGameCoords: (clientX: number, clientY: number) => { x: number; y: number };
  /** Manually trigger a resize update */
  updateSize: () => void;
}

export function useResponsiveCanvas(
  gameWidth: number,
  gameHeight: number,
  options?: Partial<Omit<ResponsiveCanvasOptions, 'gameWidth' | 'gameHeight'>>,
): UseResponsiveCanvasResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rcRef = useRef<ResponsiveCanvas | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rc = new ResponsiveCanvas(canvas, {
      gameWidth,
      gameHeight,
      maxDpr: options?.maxDpr ?? 2,
      autoResize: options?.autoResize ?? true,
    });

    rcRef.current = rc;

    return () => {
      rc.destroy();
      rcRef.current = null;
    };
  }, [gameWidth, gameHeight, options?.maxDpr, options?.autoResize]);

  const toGameCoords = useCallback((clientX: number, clientY: number) => {
    if (rcRef.current) {
      return rcRef.current.toGameCoords(clientX, clientY);
    }
    return { x: 0, y: 0 };
  }, []);

  const updateSize = useCallback(() => {
    rcRef.current?.updateSize();
  }, []);

  return {
    containerRef,
    canvasRef,
    rc: rcRef,
    toGameCoords,
    updateSize,
  };
}
