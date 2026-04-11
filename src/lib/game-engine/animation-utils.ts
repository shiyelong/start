/**
 * Animation Utilities - 缓动函数、屏幕震动、分数弹出
 *
 * 提供游戏通用的动画工具：
 * - 缓动函数用于状态变化过渡动画 (Requirement 4.5)
 * - 屏幕震动用于碰撞/消除等重大事件的视觉反馈
 * - 分数弹出用于得分动画 (Requirement 4.5)
 */

// ─── Easing Functions ────────────────────────────────────
// All easing functions take t in [0, 1] and return a value.

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Screen Shake ────────────────────────────────────────

export interface ShakeState {
  time: number;
  intensity: number;
}

/**
 * Decrease shake time by dt. When time reaches 0 the shake stops.
 */
export function updateShake(state: ShakeState, dt: number): void {
  if (state.time > 0) {
    state.time = Math.max(0, state.time - dt);
  }
}

/**
 * Apply a random translate to the canvas context based on remaining shake.
 * Should be called before rendering the frame; caller is responsible for
 * saving/restoring the context or resetting the transform afterwards.
 */
export function applyShake(ctx: CanvasRenderingContext2D, state: ShakeState): void {
  if (state.time <= 0) return;
  const magnitude = state.intensity * (state.time / Math.max(state.time + 0.001, 1));
  const offsetX = (Math.random() * 2 - 1) * magnitude;
  const offsetY = (Math.random() * 2 - 1) * magnitude;
  ctx.translate(offsetX, offsetY);
}

// ─── Score Popups ────────────────────────────────────────

export interface ScorePopup {
  x: number;
  y: number;
  value: number;
  life: number;
  combo: number;
}

/**
 * Update all score popups: decrease life, remove dead ones in-place.
 */
export function updateScorePopups(popups: ScorePopup[], dt: number): void {
  let i = popups.length;
  while (i-- > 0) {
    popups[i].life -= dt;
    if (popups[i].life <= 0) {
      popups[i] = popups[popups.length - 1];
      popups.pop();
    }
  }
}

/**
 * Render score popups floating upward with fading opacity.
 * Combo multiplier is shown when combo > 1.
 */
export function renderScorePopups(
  ctx: CanvasRenderingContext2D,
  popups: ScorePopup[],
): void {
  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    if (p.life <= 0) continue;

    // Assume a max life of ~1s for the float offset calculation
    const progress = 1 - p.life; // 0 → 1 as popup ages
    const floatY = p.y - progress * 40; // drift upward 40px over lifetime
    const alpha = Math.max(0, Math.min(1, p.life));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffd93d';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let text = `+${p.value}`;
    if (p.combo > 1) {
      text += ` x${p.combo}`;
    }

    ctx.fillText(text, p.x, floatY);
    ctx.restore();
  }
}
