/**
 * GameEngine Core — 游戏循环框架
 *
 * 提供完整的游戏生命周期管理：初始化 → 更新 → 渲染 → 销毁
 * 基于 requestAnimationFrame 的游戏循环，目标 60fps
 * 帧率无关的 delta time 更新
 *
 * Requirements: 6.1 (Canvas/WebGL 60fps), 6.2 (完整游戏循环), 6.3 (键盘+触摸)
 */

// ─── Types ───────────────────────────────────────────────

export type GameState = 'loading' | 'playing' | 'paused' | 'game-over';

export interface GameLifecycle {
  /** Called once when the engine initializes. Set up game state here. */
  onInit: (engine: GameEngine) => void;
  /** Called every frame with delta time in seconds. Update game logic here. */
  onUpdate: (engine: GameEngine, dt: number) => void;
  /** Called every frame after update. Render to the canvas context here. */
  onRender: (engine: GameEngine, ctx: CanvasRenderingContext2D) => void;
  /** Called when the engine is destroyed. Clean up resources here. */
  onDestroy: (engine: GameEngine) => void;
}

export interface GameEngineConfig {
  /** The canvas element to render to */
  canvas: HTMLCanvasElement;
  /** Logical width of the game world (before DPR scaling) */
  width: number;
  /** Logical height of the game world (before DPR scaling) */
  height: number;
  /** Target frames per second (default: 60) */
  targetFps?: number;
  /** Maximum delta time cap in seconds to prevent spiral of death (default: 0.05) */
  maxDeltaTime?: number;
  /** Whether to auto-resize canvas to fit parent (default: false) */
  autoResize?: boolean;
  /** Game lifecycle hooks */
  lifecycle: GameLifecycle;
}

// ─── GameEngine ──────────────────────────────────────────

export class GameEngine {
  // Canvas & rendering
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private logicalWidth: number;
  private logicalHeight: number;

  // Timing
  private targetFps: number;
  private maxDeltaTime: number;
  private lastTimestamp: number;
  private rafId: number;
  private frameCount: number;
  private elapsedTime: number;
  private fpsAccumulator: number;
  private fpsFrameCount: number;
  private currentFps: number;

  // State
  private state: GameState;
  private running: boolean;
  private autoResize: boolean;
  private resizeObserver: ResizeObserver | null;

  // Lifecycle
  private lifecycle: GameLifecycle;

  constructor(config: GameEngineConfig) {
    this.canvas = config.canvas;
    this.logicalWidth = config.width;
    this.logicalHeight = config.height;
    this.targetFps = config.targetFps ?? 60;
    this.maxDeltaTime = config.maxDeltaTime ?? 0.05;
    this.autoResize = config.autoResize ?? false;
    this.lifecycle = config.lifecycle;

    // Initialize canvas context
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('GameEngine: Failed to get 2D canvas context');
    }
    this.ctx = ctx;
    this.dpr = 1;

    // Timing state
    this.lastTimestamp = 0;
    this.rafId = 0;
    this.frameCount = 0;
    this.elapsedTime = 0;
    this.fpsAccumulator = 0;
    this.fpsFrameCount = 0;
    this.currentFps = 0;

    // Engine state
    this.state = 'loading';
    this.running = false;
    this.resizeObserver = null;

    // Set up canvas dimensions
    this.setupCanvas();
  }

  // ─── Canvas Management ─────────────────────────────────

  private setupCanvas(): void {
    this.dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    this.canvas.width = this.logicalWidth * this.dpr;
    this.canvas.height = this.logicalHeight * this.dpr;
    this.canvas.style.width = `${this.logicalWidth}px`;
    this.canvas.style.height = `${this.logicalHeight}px`;
  }

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const parentWidth = parent.clientWidth;
    const aspectRatio = this.logicalHeight / this.logicalWidth;
    this.logicalWidth = Math.max(1, parentWidth);
    this.logicalHeight = Math.max(1, Math.round(parentWidth * aspectRatio));
    this.setupCanvas();
  }

  // ─── Lifecycle ─────────────────────────────────────────

  /** Initialize and start the game engine */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Set up auto-resize if enabled
    if (this.autoResize && typeof ResizeObserver !== 'undefined') {
      const parent = this.canvas.parentElement;
      if (parent) {
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(parent);
      }
    }

    // Call onInit lifecycle hook
    this.state = 'loading';
    this.lifecycle.onInit(this);
    this.state = 'playing';

    // Start the game loop
    this.lastTimestamp = 0;
    this.rafId = requestAnimationFrame((ts) => this.loop(ts));
  }

  /** Stop and destroy the game engine, releasing all resources */
  destroy(): void {
    this.running = false;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.lifecycle.onDestroy(this);
    this.state = 'game-over';
  }

  // ─── Game Loop ─────────────────────────────────────────

  private loop(timestamp: number): void {
    if (!this.running) return;

    // Calculate delta time
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
    }
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    const dt = Math.min(rawDt, this.maxDeltaTime);
    this.lastTimestamp = timestamp;

    // FPS tracking
    this.frameCount++;
    this.elapsedTime += dt;
    this.fpsAccumulator += dt;
    this.fpsFrameCount++;
    if (this.fpsAccumulator >= 1.0) {
      this.currentFps = Math.round(this.fpsFrameCount / this.fpsAccumulator);
      this.fpsAccumulator = 0;
      this.fpsFrameCount = 0;
    }

    // Update phase (only when playing)
    if (this.state === 'playing') {
      this.lifecycle.onUpdate(this, dt);
    }

    // Render phase (always render, even when paused)
    this.ctx.save();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.lifecycle.onRender(this, this.ctx);
    this.ctx.restore();

    // Schedule next frame
    this.rafId = requestAnimationFrame((ts) => this.loop(ts));
  }

  // ─── State Management ──────────────────────────────────

  getState(): GameState {
    return this.state;
  }

  setState(newState: GameState): void {
    this.state = newState;
  }

  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  gameOver(): void {
    this.state = 'game-over';
  }

  restart(): void {
    this.state = 'loading';
    this.frameCount = 0;
    this.elapsedTime = 0;
    this.lifecycle.onInit(this);
    this.state = 'playing';
  }

  // ─── Getters ───────────────────────────────────────────

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  getWidth(): number {
    return this.logicalWidth;
  }

  getHeight(): number {
    return this.logicalHeight;
  }

  getDpr(): number {
    return this.dpr;
  }

  getFps(): number {
    return this.currentFps;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getElapsedTime(): number {
    return this.elapsedTime;
  }

  isRunning(): boolean {
    return this.running;
  }
}
