/**
 * Render Utilities - Canvas 基础绘制、DPR 适配、视觉效果
 *
 * 提供游戏通用的渲染工具：
 * - drawRoundedRect 圆角矩形 (Requirement 4.1)
 * - setupCanvas / resizeCanvas DPR 适配 (Requirement 5.1, 5.6)
 * - drawGlow 发光效果 (Requirement 4.6)
 * - drawGradientBackground 渐变背景
 * - drawText 自动缩放文字
 * - drawGrid 网格绘制（棋盘类游戏通用）
 */

// ─── GridConfig ──────────────────────────────────────────

export interface GridConfig {
  x: number;
  y: number;
  rows: number;
  cols: number;
  cellSize: number;
  gap: number;
  bgColor: string;
  cellColor: string;
  radius: number;
}

// ─── Rounded Rectangle ──────────────────────────────────

/**
 * Draw a rounded rectangle path on the context.
 * After calling this the path is ready for fill() or stroke().
 */
export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ─── Canvas DPR Setup ────────────────────────────────────

/**
 * Initialize a canvas with the given logical dimensions, accounting for
 * devicePixelRatio so the rendering is crisp on high-DPI screens.
 *
 * Returns the DPR used and the 2D context.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): { dpr: number; ctx: CanvasRenderingContext2D } {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  return { dpr, ctx };
}

/**
 * Resize a canvas to fit its parent element, applying DPR scaling.
 * The canvas logical width matches the parent's clientWidth; height is
 * set to maintain a square-ish aspect (same as width) — callers can
 * override height via the returned value.
 *
 * Property 5 guarantee: output width ≤ parent width, height > 0,
 * dpr === window.devicePixelRatio.
 */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  parent: HTMLElement,
): { width: number; height: number; dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  const parentWidth = parent.clientWidth;
  const width = Math.max(1, parentWidth);
  const height = Math.max(1, width);

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return { width, height, dpr };
}

// ─── Glow Effect ─────────────────────────────────────────

/**
 * Draw a radial glow at (x, y) with the given radius, color, and intensity.
 * Intensity controls the alpha of the glow (0–1 range recommended).
 */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  intensity: number,
): void {
  ctx.save();
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  ctx.globalAlpha = Math.max(0, Math.min(1, intensity));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Gradient Background ─────────────────────────────────

/**
 * Fill the canvas area with a vertical gradient based on HSL hue.
 * Saturation defaults to 60 if not provided.
 */
export function drawGradientBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hue: number,
  saturation: number = 60,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, 12%)`);
  gradient.addColorStop(1, `hsl(${hue}, ${saturation}%, 6%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// ─── Text Drawing ────────────────────────────────────────

/**
 * Draw text at (x, y) that auto-scales down if it exceeds maxWidth.
 * Color defaults to white, fontSize defaults to 16.
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  color: string = '#ffffff',
  fontSize: number = 16,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let size = fontSize;
  ctx.font = `bold ${size}px sans-serif`;

  // Scale down until text fits within maxWidth (minimum 8px)
  while (size > 8 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `bold ${size}px sans-serif`;
  }

  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

// ─── Grid Drawing ────────────────────────────────────────

/**
 * Draw a grid with a rounded-rect background and individual cell rects.
 * Useful for board games (chess, 2048-style, puzzle grids, etc.).
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  config: GridConfig,
): void {
  const { x, y, rows, cols, cellSize, gap, bgColor, cellColor, radius } = config;

  // Total board dimensions
  const totalWidth = gap + cols * (cellSize + gap);
  const totalHeight = gap + rows * (cellSize + gap);

  // Background
  drawRoundedRect(ctx, x, y, totalWidth, totalHeight, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();

  // Individual cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x + gap + c * (cellSize + gap);
      const cy = y + gap + r * (cellSize + gap);
      drawRoundedRect(ctx, cx, cy, cellSize, cellSize, Math.min(radius, cellSize / 4));
      ctx.fillStyle = cellColor;
      ctx.fill();
    }
  }
}
