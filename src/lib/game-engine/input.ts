/**
 * Unified Input System — 键盘 + 触摸 + 鼠标统一输入处理
 *
 * 提供帧级别的输入状态查询和事件回调：
 * - 键盘：按下/释放状态追踪，单次按键检测
 * - 触摸：触摸开始/移动/结束，滑动方向检测
 * - 鼠标：点击、位置追踪
 * - 输入映射：将游戏动作映射到具体按键/触摸
 *
 * Requirements: 6.3 (键盘+触摸屏输入)
 */

// ─── Types ───────────────────────────────────────────────

export type InputAction = string;

export interface SwipeInfo {
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
  velocity: number;
}

export interface TouchInfo {
  x: number;
  y: number;
  id: number;
}

export interface MouseInfo {
  x: number;
  y: number;
  pressed: boolean;
}

export interface InputMapping {
  /** Map an action name to one or more keyboard keys */
  keys?: string[];
  /** Map an action to a touch/swipe direction */
  swipe?: 'left' | 'right' | 'up' | 'down';
}

// ─── Constants ───────────────────────────────────────────

const SWIPE_THRESHOLD = 30;

// ─── InputManager ────────────────────────────────────────

export class InputManager {
  // Keyboard state
  private keysDown: Set<string>;
  private keysPressed: Set<string>;
  private keysReleased: Set<string>;

  // Touch state
  private activeTouches: Map<number, TouchInfo>;
  private swipeStart: { x: number; y: number; time: number } | null;
  private lastSwipe: SwipeInfo | null;

  // Mouse state
  private mouse: MouseInfo;

  // Action mapping
  private actionMap: Map<InputAction, InputMapping>;

  // Event listener references for cleanup
  private listeners: Array<{ target: EventTarget; type: string; handler: EventListener }>;
  private canvas: HTMLCanvasElement | null;

  constructor() {
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();
    this.activeTouches = new Map();
    this.swipeStart = null;
    this.lastSwipe = null;
    this.mouse = { x: 0, y: 0, pressed: false };
    this.actionMap = new Map();
    this.listeners = [];
    this.canvas = null;
  }

  // ─── Setup / Teardown ──────────────────────────────────

  /** Attach input listeners to the window and canvas */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    // Keyboard
    this.addListener(window, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (!this.keysDown.has(ke.key)) {
        this.keysPressed.add(ke.key);
      }
      this.keysDown.add(ke.key);
    });

    this.addListener(window, 'keyup', (e: Event) => {
      const ke = e as KeyboardEvent;
      this.keysDown.delete(ke.key);
      this.keysReleased.add(ke.key);
    });

    // Touch
    this.addListener(canvas, 'touchstart', (e: Event) => {
      const te = e as TouchEvent;
      te.preventDefault();
      for (let i = 0; i < te.changedTouches.length; i++) {
        const t = te.changedTouches[i];
        const pos = this.canvasPos(t.clientX, t.clientY);
        this.activeTouches.set(t.identifier, { ...pos, id: t.identifier });
        if (!this.swipeStart) {
          this.swipeStart = { x: pos.x, y: pos.y, time: Date.now() };
        }
      }
    }, { passive: false });

    this.addListener(canvas, 'touchmove', (e: Event) => {
      const te = e as TouchEvent;
      te.preventDefault();
      for (let i = 0; i < te.changedTouches.length; i++) {
        const t = te.changedTouches[i];
        const pos = this.canvasPos(t.clientX, t.clientY);
        this.activeTouches.set(t.identifier, { ...pos, id: t.identifier });
      }
    }, { passive: false });

    this.addListener(canvas, 'touchend', (e: Event) => {
      const te = e as TouchEvent;
      for (let i = 0; i < te.changedTouches.length; i++) {
        const t = te.changedTouches[i];
        this.activeTouches.delete(t.identifier);
      }
      // Detect swipe
      if (this.swipeStart && te.changedTouches.length > 0) {
        const t = te.changedTouches[0];
        const pos = this.canvasPos(t.clientX, t.clientY);
        const dx = pos.x - this.swipeStart.x;
        const dy = pos.y - this.swipeStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const elapsed = (Date.now() - this.swipeStart.time) / 1000;

        if (dist >= SWIPE_THRESHOLD) {
          let direction: SwipeInfo['direction'];
          if (Math.abs(dx) > Math.abs(dy)) {
            direction = dx > 0 ? 'right' : 'left';
          } else {
            direction = dy > 0 ? 'down' : 'up';
          }
          this.lastSwipe = {
            direction,
            distance: dist,
            velocity: elapsed > 0 ? dist / elapsed : 0,
          };
        }
        this.swipeStart = null;
      }
    });

    this.addListener(canvas, 'touchcancel', () => {
      this.activeTouches.clear();
      this.swipeStart = null;
    });

    // Mouse
    this.addListener(canvas, 'mousedown', (e: Event) => {
      const me = e as MouseEvent;
      const pos = this.canvasPos(me.clientX, me.clientY);
      this.mouse = { ...pos, pressed: true };
    });

    this.addListener(canvas, 'mousemove', (e: Event) => {
      const me = e as MouseEvent;
      const pos = this.canvasPos(me.clientX, me.clientY);
      this.mouse.x = pos.x;
      this.mouse.y = pos.y;
    });

    this.addListener(canvas, 'mouseup', () => {
      this.mouse.pressed = false;
    });
  }

  /** Remove all event listeners and reset state */
  detach(): void {
    for (const { target, type, handler } of this.listeners) {
      target.removeEventListener(type, handler);
    }
    this.listeners = [];
    this.canvas = null;
    this.keysDown.clear();
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.activeTouches.clear();
    this.swipeStart = null;
    this.lastSwipe = null;
    this.mouse = { x: 0, y: 0, pressed: false };
  }

  /** Call at the end of each frame to clear single-frame states */
  endFrame(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.lastSwipe = null;
  }

  // ─── Keyboard Queries ──────────────────────────────────

  /** Returns true while the key is held down */
  isKeyDown(key: string): boolean {
    return this.keysDown.has(key);
  }

  /** Returns true only on the frame the key was first pressed */
  isKeyPressed(key: string): boolean {
    return this.keysPressed.has(key);
  }

  /** Returns true only on the frame the key was released */
  isKeyReleased(key: string): boolean {
    return this.keysReleased.has(key);
  }

  // ─── Touch Queries ─────────────────────────────────────

  /** Get all active touch points */
  getTouches(): TouchInfo[] {
    return Array.from(this.activeTouches.values());
  }

  /** Get the most recent swipe (available for one frame after swipe ends) */
  getSwipe(): SwipeInfo | null {
    return this.lastSwipe;
  }

  /** Returns true if there are any active touches */
  isTouching(): boolean {
    return this.activeTouches.size > 0;
  }

  // ─── Mouse Queries ─────────────────────────────────────

  /** Get current mouse state */
  getMouse(): Readonly<MouseInfo> {
    return this.mouse;
  }

  /** Returns true while mouse button is held */
  isMouseDown(): boolean {
    return this.mouse.pressed;
  }

  // ─── Action Mapping ────────────────────────────────────

  /** Define an action mapping */
  mapAction(action: InputAction, mapping: InputMapping): void {
    this.actionMap.set(action, mapping);
  }

  /** Define multiple action mappings at once */
  mapActions(mappings: Record<InputAction, InputMapping>): void {
    for (const [action, mapping] of Object.entries(mappings)) {
      this.actionMap.set(action, mapping);
    }
  }

  /** Check if an action is currently active (key held or swipe detected) */
  isActionActive(action: InputAction): boolean {
    const mapping = this.actionMap.get(action);
    if (!mapping) return false;

    // Check keyboard keys
    if (mapping.keys) {
      for (const key of mapping.keys) {
        if (this.keysDown.has(key)) return true;
      }
    }

    // Check swipe direction
    if (mapping.swipe && this.lastSwipe) {
      if (this.lastSwipe.direction === mapping.swipe) return true;
    }

    return false;
  }

  /** Check if an action was just triggered this frame */
  isActionPressed(action: InputAction): boolean {
    const mapping = this.actionMap.get(action);
    if (!mapping) return false;

    if (mapping.keys) {
      for (const key of mapping.keys) {
        if (this.keysPressed.has(key)) return true;
      }
    }

    if (mapping.swipe && this.lastSwipe) {
      if (this.lastSwipe.direction === mapping.swipe) return true;
    }

    return false;
  }

  // ─── Helpers ───────────────────────────────────────────

  private canvasPos(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private addListener(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.listeners.push({ target, type, handler });
  }
}
