// InputHandler - Unified keyboard + touch input handling for game engine
// Requirements: 5.2 (touch + keyboard), 5.3 (swipe visual feedback), 5.5 (prevent defaults)

export interface SwipeResult {
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
  velocity: number;
}

export interface InputState {
  swipeStart: { x: number; y: number } | null;
  swipeCurrent: { x: number; y: number } | null;
}

const SWIPE_THRESHOLD = 30;
const HOLD_DELAY = 500;

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private inputState: InputState;
  private keyMap: Map<string, () => void>;

  // Touch callback handlers
  private tapHandler: ((x: number, y: number) => void) | null = null;
  private swipeHandler: ((result: SwipeResult) => void) | null = null;
  private holdHandler: ((x: number, y: number) => void) | null = null;
  private dragHandler: ((x: number, y: number, dx: number, dy: number) => void) | null = null;

  // Internal touch tracking
  private touchStartTime = 0;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holdFired = false;
  private lastTouchPos: { x: number; y: number } | null = null;

  // Bound event listeners (for removal in dispose)
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;

  // Prevent-defaults listeners
  private preventTouchStart: ((e: TouchEvent) => void) | null = null;
  private preventTouchMove: ((e: TouchEvent) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.inputState = { swipeStart: null, swipeCurrent: null };
    this.keyMap = new Map();

    // Bind keyboard handler
    this.boundKeyDown = (e: KeyboardEvent) => {
      const handler = this.keyMap.get(e.key);
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', this.boundKeyDown);

    // Bind touch handlers
    this.boundTouchStart = (e: TouchEvent) => this.handleTouchStart(e);
    this.boundTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
    this.boundTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e);

    canvas.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.boundTouchEnd, { passive: true });
  }

  // ─── Keyboard Binding ──────────────────────────────────────────────────

  bindKey(key: string, handler: () => void): void {
    this.keyMap.set(key, handler);
  }

  bindKeys(map: Record<string, () => void>): void {
    for (const [key, handler] of Object.entries(map)) {
      this.keyMap.set(key, handler);
    }
  }

  // ─── Touch Callbacks ───────────────────────────────────────────────────

  onTap(handler: (x: number, y: number) => void): void {
    this.tapHandler = handler;
  }

  onSwipe(handler: (result: SwipeResult) => void): void {
    this.swipeHandler = handler;
  }

  onHold(handler: (x: number, y: number) => void): void {
    this.holdHandler = handler;
  }

  onDrag(handler: (x: number, y: number, dx: number, dy: number) => void): void {
    this.dragHandler = handler;
  }

  // ─── Swipe Visual Feedback ─────────────────────────────────────────────

  getSwipeVisual(): InputState {
    return this.inputState;
  }

  // ─── Prevent Defaults ──────────────────────────────────────────────────

  preventDefaults(): void {
    // Prevent page scrolling/zooming on the canvas
    this.preventTouchStart = (e: TouchEvent) => {
      e.preventDefault();
    };
    this.preventTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };
    this.canvas.addEventListener('touchstart', this.preventTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.preventTouchMove, { passive: false });
  }

  // ─── Dispose ───────────────────────────────────────────────────────────

  dispose(): void {
    // Remove keyboard listener
    window.removeEventListener('keydown', this.boundKeyDown);

    // Remove touch listeners
    this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    this.canvas.removeEventListener('touchmove', this.boundTouchMove);
    this.canvas.removeEventListener('touchend', this.boundTouchEnd);

    // Remove prevent-defaults listeners
    if (this.preventTouchStart) {
      this.canvas.removeEventListener('touchstart', this.preventTouchStart);
    }
    if (this.preventTouchMove) {
      this.canvas.removeEventListener('touchmove', this.preventTouchMove);
    }

    // Clear hold timer
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }

    // Clear state
    this.keyMap.clear();
    this.tapHandler = null;
    this.swipeHandler = null;
    this.holdHandler = null;
    this.dragHandler = null;
    this.inputState.swipeStart = null;
    this.inputState.swipeCurrent = null;
  }

  // ─── Internal Touch Handling ───────────────────────────────────────────

  private getTouchPos(touch: Touch): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    const pos = this.getTouchPos(e.touches[0]);
    this.inputState.swipeStart = pos;
    this.inputState.swipeCurrent = pos;
    this.touchStartTime = Date.now();
    this.holdFired = false;
    this.lastTouchPos = pos;

    // Start hold timer
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      if (this.inputState.swipeStart && !this.holdFired) {
        const start = this.inputState.swipeStart;
        const current = this.inputState.swipeCurrent;
        // Only fire hold if finger hasn't moved much
        if (current) {
          const dx = current.x - start.x;
          const dy = current.y - start.y;
          if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
            this.holdFired = true;
            this.holdHandler?.(start.x, start.y);
          }
        }
      }
    }, HOLD_DELAY);
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.inputState.swipeStart || e.touches.length !== 1) return;
    e.preventDefault();
    const pos = this.getTouchPos(e.touches[0]);
    this.inputState.swipeCurrent = pos;

    // Fire drag callback
    if (this.dragHandler && this.lastTouchPos) {
      const dx = pos.x - this.lastTouchPos.x;
      const dy = pos.y - this.lastTouchPos.y;
      this.dragHandler(pos.x, pos.y, dx, dy);
    }
    this.lastTouchPos = pos;
  }

  private handleTouchEnd(_e: TouchEvent): void {
    // Clear hold timer
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }

    const start = this.inputState.swipeStart;
    const current = this.inputState.swipeCurrent;
    this.inputState.swipeStart = null;
    this.inputState.swipeCurrent = null;
    this.lastTouchPos = null;

    if (!start || !current) return;
    if (this.holdFired) return;

    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const elapsed = (Date.now() - this.touchStartTime) / 1000; // seconds

    if (distance < SWIPE_THRESHOLD) {
      // Tap
      this.tapHandler?.(start.x, start.y);
    } else if (this.swipeHandler) {
      // Swipe
      const velocity = elapsed > 0 ? distance / elapsed : 0;
      let direction: SwipeResult['direction'];
      if (Math.abs(dx) > Math.abs(dy)) {
        direction = dx > 0 ? 'right' : 'left';
      } else {
        direction = dy > 0 ? 'down' : 'up';
      }
      this.swipeHandler({ direction, distance, velocity });
    }
  }
}
