/**
 * Responsive Canvas utility for games.
 *
 * Handles:
 * - devicePixelRatio scaling for crisp rendering on Retina/high-DPI screens
 * - Dynamic resize to fit container while maintaining aspect ratio
 * - Touch coordinate mapping from screen space to game space
 *
 * Usage:
 *   const rc = new ResponsiveCanvas(canvasEl, gameWidth, gameHeight);
 *   rc.onResize(() => { // re-render });
 *   // In touch handler:
 *   const { x, y } = rc.toGameCoords(touch.clientX, touch.clientY);
 *   // Cleanup:
 *   rc.destroy();
 */

export interface ResponsiveCanvasOptions {
  /** Logical game width (design resolution) */
  gameWidth: number;
  /** Logical game height (design resolution) */
  gameHeight: number;
  /** Max DPR to use (default: 2, prevents excessive memory on 3x screens) */
  maxDpr?: number;
  /** Whether to auto-resize on window resize (default: true) */
  autoResize?: boolean;
}

export class ResponsiveCanvas {
  private canvas: HTMLCanvasElement;
  private gameW: number;
  private gameH: number;
  private maxDpr: number;
  private resizeCallbacks: (() => void)[] = [];
  private observer: ResizeObserver | null = null;
  private currentScale = 1;
  private currentDpr = 1;

  constructor(canvas: HTMLCanvasElement, options: ResponsiveCanvasOptions) {
    this.canvas = canvas;
    this.gameW = options.gameWidth;
    this.gameH = options.gameHeight;
    this.maxDpr = options.maxDpr ?? 2;

    if (options.autoResize !== false) {
      this.setupAutoResize();
    }

    this.updateSize();
  }

  /** Get the effective DPR being used */
  get dpr(): number {
    return this.currentDpr;
  }

  /** Get the current CSS display scale */
  get scale(): number {
    return this.currentScale;
  }

  /** Get logical game dimensions */
  get gameWidth(): number { return this.gameW; }
  get gameHeight(): number { return this.gameH; }

  /** Register a callback for resize events */
  onResize(cb: () => void): void {
    this.resizeCallbacks.push(cb);
  }

  /**
   * Convert screen coordinates (e.g. from touch/mouse event) to game coordinates.
   */
  toGameCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.gameW;
    const y = ((clientY - rect.top) / rect.height) * this.gameH;
    return {
      x: Math.max(0, Math.min(this.gameW, x)),
      y: Math.max(0, Math.min(this.gameH, y)),
    };
  }

  /**
   * Update canvas size based on container and DPR.
   * Call this if you need to manually trigger a resize.
   */
  updateSize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.currentDpr = dpr;

    const parent = this.canvas.parentElement;
    if (!parent) return;

    const containerW = parent.clientWidth;
    const containerH = parent.clientHeight || window.innerHeight * 0.8;

    // Calculate scale to fit container while maintaining aspect ratio
    const scaleX = containerW / this.gameW;
    const scaleY = containerH / this.gameH;
    const scale = Math.min(scaleX, scaleY, 1); // Never scale up beyond 1x
    this.currentScale = scale;

    const displayW = Math.floor(this.gameW * scale);
    const displayH = Math.floor(this.gameH * scale);

    // Set CSS display size
    this.canvas.style.width = `${displayW}px`;
    this.canvas.style.height = `${displayH}px`;

    // Set actual pixel size (for crisp rendering)
    this.canvas.width = Math.floor(this.gameW * dpr);
    this.canvas.height = Math.floor(this.gameH * dpr);

    // Scale the 2D context if using Canvas 2D
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Notify listeners
    for (const cb of this.resizeCallbacks) {
      cb();
    }
  }

  /**
   * Apply responsive sizing for PixiJS.
   * Returns the resolution multiplier to pass to createPixiApp.
   */
  getPixiResolution(): number {
    return this.currentDpr;
  }

  private setupAutoResize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    this.observer = new ResizeObserver(() => {
      this.updateSize();
    });
    this.observer.observe(parent);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.resizeCallbacks = [];
  }
}

/**
 * Helper: get optimal canvas dimensions for the current viewport.
 * Returns dimensions that fit the screen while maintaining the game's aspect ratio.
 */
export function getOptimalCanvasSize(
  gameWidth: number,
  gameHeight: number,
  maxWidth?: number,
  maxHeight?: number,
): { width: number; height: number; scale: number } {
  const vw = maxWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 800);
  const vh = maxHeight ?? (typeof window !== 'undefined' ? window.innerHeight - 120 : 600);

  const scaleX = vw / gameWidth;
  const scaleY = vh / gameHeight;
  const scale = Math.min(scaleX, scaleY, 1);

  return {
    width: Math.floor(gameWidth * scale),
    height: Math.floor(gameHeight * scale),
    scale,
  };
}
