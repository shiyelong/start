/**
 * Animation & Transition System — 缓动函数和动画时间线
 *
 * 提供标准缓动函数和动画时间线用于序列化动画。
 *
 * Requirements: 6.7 (动画过渡)
 */

// ─── Easing Functions ────────────────────────────────────

export type EasingFunction = (t: number) => number;

/** Linear interpolation — no easing */
export function linear(t: number): number {
  return t;
}

/** Ease in — starts slow, accelerates */
export function easeIn(t: number): number {
  return t * t;
}

/** Ease out — starts fast, decelerates */
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Ease in-out — slow start and end, fast middle */
export function easeInOut(t: number): number {
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Cubic ease in */
export function easeInCubic(t: number): number {
  return t * t * t;
}

/** Cubic ease out */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Cubic ease in-out */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Elastic ease out — overshoots then settles */
export function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/** Back ease out — slight overshoot */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Bounce ease out */
export function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

/** Map of easing function names to implementations */
export const easings: Record<string, EasingFunction> = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeOutElastic,
  easeOutBack,
  easeOutBounce,
};

// ─── Tween ───────────────────────────────────────────────

export interface TweenConfig {
  /** Starting value */
  from: number;
  /** Ending value */
  to: number;
  /** Duration in seconds */
  duration: number;
  /** Easing function (default: easeOut) */
  easing?: EasingFunction;
  /** Callback with the current interpolated value */
  onUpdate: (value: number) => void;
  /** Called when the tween completes */
  onComplete?: () => void;
  /** Delay before starting in seconds (default: 0) */
  delay?: number;
}

export interface Tween {
  elapsed: number;
  config: TweenConfig;
  completed: boolean;
  started: boolean;
}

// ─── Animation Timeline ──────────────────────────────────

export class AnimationTimeline {
  private tweens: Tween[];
  private running: boolean;

  constructor() {
    this.tweens = [];
    this.running = true;
  }

  /** Add a tween to the timeline */
  add(config: TweenConfig): Tween {
    const tween: Tween = {
      elapsed: 0,
      config,
      completed: false,
      started: false,
    };
    this.tweens.push(tween);
    return tween;
  }

  /** Add a sequence of tweens that play one after another */
  sequence(configs: TweenConfig[]): Tween[] {
    const tweens: Tween[] = [];
    let accumulatedDelay = 0;

    for (const config of configs) {
      const delay = (config.delay ?? 0) + accumulatedDelay;
      const tween = this.add({ ...config, delay });
      tweens.push(tween);
      accumulatedDelay = delay + config.duration;
    }

    return tweens;
  }

  /** Add tweens that all start at the same time */
  parallel(configs: TweenConfig[]): Tween[] {
    return configs.map((config) => this.add(config));
  }

  /** Update all active tweens. Call once per frame with dt in seconds. */
  update(dt: number): void {
    if (!this.running) return;

    let i = this.tweens.length;
    while (i-- > 0) {
      const tween = this.tweens[i];
      if (tween.completed) {
        this.tweens.splice(i, 1);
        continue;
      }

      tween.elapsed += dt;

      const delay = tween.config.delay ?? 0;
      if (tween.elapsed < delay) continue;

      if (!tween.started) {
        tween.started = true;
      }

      const activeTime = tween.elapsed - delay;
      const progress = Math.min(activeTime / tween.config.duration, 1);
      const easing = tween.config.easing ?? easeOut;
      const easedProgress = easing(progress);

      const value = tween.config.from + (tween.config.to - tween.config.from) * easedProgress;
      tween.config.onUpdate(value);

      if (progress >= 1) {
        tween.completed = true;
        tween.config.onComplete?.();
      }
    }
  }

  /** Check if any tweens are still active */
  isActive(): boolean {
    return this.tweens.length > 0;
  }

  /** Get the number of active tweens */
  getActiveCount(): number {
    return this.tweens.length;
  }

  /** Pause the timeline */
  pause(): void {
    this.running = false;
  }

  /** Resume the timeline */
  resume(): void {
    this.running = true;
  }

  /** Cancel all active tweens */
  clear(): void {
    this.tweens = [];
  }

  /** Cancel a specific tween */
  cancel(tween: Tween): void {
    const idx = this.tweens.indexOf(tween);
    if (idx >= 0) {
      this.tweens.splice(idx, 1);
    }
  }
}

// ─── Utility: lerp ───────────────────────────────────────

/** Linear interpolation between two values */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
