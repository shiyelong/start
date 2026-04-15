"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { ParticleSystem } from "@/lib/game-engine/particle-system";
import { InputHandler } from "@/lib/game-engine/input-handler";
import { easeOutQuad, easeOutBounce, lerp, updateShake, applyShake, updateScorePopups, renderScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { resizeCanvas, drawGradientBackground, drawText, drawGlow, drawRoundedRect } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
interface GemAnim {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  progress: number;     // 0→1
  type: "swap" | "fall" | "spawn";
}

interface GameState {
  board: number[][];       // 7x7 grid, gem type index (0-6), -1 = empty
  score: number;
  moves: number;
  maxMoves: number;
  combo: number;
  maxCombo: number;
  over: boolean;
  selected: [number, number] | null;
  phase: "idle" | "swapping" | "clearing" | "falling" | "checking";
  totalCleared: number;
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  gemAnims: GemAnim[];
  animTimer: number;
  clearingGems: [number, number][];
  clearAlpha: number;
  selectedPulse: number;
  resultFadeIn: number;
  swapBack: boolean;
  swapGems: [[number, number], [number, number]] | null;
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "match3";
const ROWS = 7;
const COLS = 7;
const NUM_GEM_TYPES = 7;
const MAX_MOVES = 30;
const SWAP_DURATION = 0.2;
const FALL_DURATION = 0.15;
const CLEAR_DURATION = 0.25;
const BASE_SCORE = 10;

const GEM_COLORS = [
  { fill: "#ef4444", glow: "#fca5a5", name: "红" },   // red
  { fill: "#3b82f6", glow: "#93c5fd", name: "蓝" },   // blue
  { fill: "#22c55e", glow: "#86efac", name: "绿" },   // green
  { fill: "#eab308", glow: "#fde047", name: "黄" },   // yellow
  { fill: "#a855f7", glow: "#d8b4fe", name: "紫" },   // purple
  { fill: "#f97316", glow: "#fdba74", name: "橙" },   // orange
  { fill: "#ec4899", glow: "#f9a8d4", name: "粉" },   // pink
];

// ─── Game Logic (Pure Functions) ─────────────────────────
function randomGem(): number {
  return Math.floor(Math.random() * NUM_GEM_TYPES);
}

function createBoard(): number[][] {
  const board: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    board.push([]);
    for (let c = 0; c < COLS; c++) {
      let gem: number;
      do {
        gem = randomGem();
      } while (
        (c >= 2 && board[r][c - 1] === gem && board[r][c - 2] === gem) ||
        (r >= 2 && board[r - 1][c] === gem && board[r - 2][c] === gem)
      );
      board[r].push(gem);
    }
  }
  return board;
}

function findMatches(board: number[][]): [number, number][] {
  const matched = new Set<string>();
  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 2; c++) {
      const g = board[r][c];
      if (g >= 0 && g === board[r][c + 1] && g === board[r][c + 2]) {
        // Extend match as far as possible
        let end = c + 2;
        while (end + 1 < COLS && board[r][end + 1] === g) end++;
        for (let i = c; i <= end; i++) matched.add(`${r},${i}`);
      }
    }
  }
  // Vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 2; r++) {
      const g = board[r][c];
      if (g >= 0 && g === board[r + 1][c] && g === board[r + 2][c]) {
        let end = r + 2;
        while (end + 1 < ROWS && board[end + 1][c] === g) end++;
        for (let i = r; i <= end; i++) matched.add(`${i},${c}`);
      }
    }
  }
  return Array.from(matched).map(s => {
    const [r, c] = s.split(",").map(Number);
    return [r, c] as [number, number];
  });
}

function applyGravity(board: number[][]): GemAnim[] {
  const anims: GemAnim[] = [];
  for (let c = 0; c < COLS; c++) {
    let writeRow = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] >= 0) {
        if (writeRow !== r) {
          board[writeRow][c] = board[r][c];
          board[r][c] = -1;
          anims.push({ fromRow: r, fromCol: c, toRow: writeRow, toCol: c, progress: 0, type: "fall" });
        }
        writeRow--;
      }
    }
    // Fill empty cells at top with new gems
    for (let r = writeRow; r >= 0; r--) {
      board[r][c] = randomGem();
      anims.push({ fromRow: r - (writeRow - r + 1), fromCol: c, toRow: r, toCol: c, progress: 0, type: "spawn" });
    }
  }
  return anims;
}

function hasValidMoves(board: number[][]): boolean {
  // Check if any swap creates a match
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // Try swap right
      if (c + 1 < COLS) {
        [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
        if (findMatches(board).length > 0) {
          [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
          return true;
        }
        [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
      }
      // Try swap down
      if (r + 1 < ROWS) {
        [board[r][c], board[r + 1][c]] = [board[r + 1][c], board[r][c]];
        if (findMatches(board).length > 0) {
          [board[r][c], board[r + 1][c]] = [board[r + 1][c], board[r][c]];
          return true;
        }
        [board[r][c], board[r + 1][c]] = [board[r + 1][c], board[r][c]];
      }
    }
  }
  return false;
}

function initGameState(): GameState {
  return {
    board: createBoard(),
    score: 0,
    moves: MAX_MOVES,
    maxMoves: MAX_MOVES,
    combo: 0,
    maxCombo: 0,
    over: false,
    selected: null,
    phase: "idle",
    totalCleared: 0,
  };
}


// ─── Renderer ────────────────────────────────────────────
function getGridLayout(w: number, h: number) {
  const padding = 16;
  const availW = w - padding * 2;
  const gap = 4;
  const cellSize = Math.floor((availW - gap * (COLS - 1)) / COLS);
  const gridW = cellSize * COLS + gap * (COLS - 1);
  const gridH = cellSize * ROWS + gap * (ROWS - 1);
  const gridX = (w - gridW) / 2;
  const gridY = h * 0.22;
  return { cellSize, gap, gridX, gridY, gridW, gridH };
}

function getCellCenter(gridX: number, gridY: number, cellSize: number, gap: number, row: number, col: number) {
  return {
    x: gridX + col * (cellSize + gap) + cellSize / 2,
    y: gridY + row * (cellSize + gap) + cellSize / 2,
  };
}

function drawGem(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  size: number,
  gemType: number,
  alpha: number = 1,
  scale: number = 1,
  glowIntensity: number = 0,
) {
  if (gemType < 0 || gemType >= GEM_COLORS.length) return;
  const gem = GEM_COLORS[gemType];
  const r = size * 0.42 * scale;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Glow effect
  if (glowIntensity > 0) {
    drawGlow(ctx, x, y, r * 1.8, gem.glow, glowIntensity);
  }

  // Gem body - rounded square with gradient
  const halfSize = r;
  const cornerR = r * 0.3;
  drawRoundedRect(ctx, x - halfSize, y - halfSize, halfSize * 2, halfSize * 2, cornerR);
  const grad = ctx.createLinearGradient(x - halfSize, y - halfSize, x + halfSize, y + halfSize);
  grad.addColorStop(0, gem.glow);
  grad.addColorStop(0.4, gem.fill);
  grad.addColorStop(1, gem.fill);
  ctx.fillStyle = grad;
  ctx.fill();

  // Inner highlight
  const highlightR = r * 0.55;
  const hGrad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, highlightR);
  hGrad.addColorStop(0, "rgba(255,255,255,0.35)");
  hGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.arc(x, y, highlightR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function renderGame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  game: GameState,
  anim: AnimState,
  particles: ParticleSystem,
): void {
  ctx.save();
  applyShake(ctx, anim.shake);
  drawGradientBackground(ctx, w, h, anim.bgHue, 55);

  const cx = w / 2;
  const { cellSize, gap, gridX, gridY, gridW, gridH } = getGridLayout(w, h);

  if (game.over) {
    // ─── Game Over Screen ────────────────────────────
    // Draw board dimmed in background
    renderBoard(ctx, game, anim, cellSize, gap, gridX, gridY, 0.3);

    const cardW = w * 0.85;
    const cardH = h * 0.48;
    const cardX = (w - cardW) / 2;
    const cardY = h * 0.18;

    drawGlow(ctx, cx, cardY + cardH * 0.3, w * 0.3, "#f0b90b", 0.15 * anim.resultFadeIn);

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fillStyle = "rgba(26,26,26,0.92)";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    const fi = anim.resultFadeIn;
    ctx.globalAlpha = fi;

    drawText(ctx, "游戏结束！", cx, cardY + 36, cardW * 0.8, "#ec4899", 24);
    drawText(ctx, `${game.score}`, cx, cardY + 80, cardW * 0.8, "#f0b90b", 42);
    drawText(ctx, "分", cx, cardY + 108, cardW * 0.5, "#888", 14);

    const statsY = cardY + 135;
    drawText(ctx, `消除: ${game.totalCleared}`, cx - w * 0.15, statsY, cardW * 0.35, "#22c55e", 15);
    drawText(ctx, `最高连击: ${game.maxCombo}`, cx + w * 0.15, statsY, cardW * 0.4, "#f0b90b", 15);

    // Restart button
    const btnW = w * 0.5;
    const btnH2 = 48;
    const btnX2 = cx - btnW / 2;
    const btnY2 = cardY + cardH - 65;
    drawRoundedRect(ctx, btnX2, btnY2, btnW, btnH2, 12);
    ctx.fillStyle = "#ec4899";
    ctx.fill();
    drawText(ctx, "再来一局", cx, btnY2 + btnH2 / 2, btnW * 0.8, "#fff", 18);

    ctx.globalAlpha = 1;
    particles.render(ctx);
    renderScorePopups(ctx, anim.scorePopups);
    ctx.restore();
    return;
  }

  // ─── HUD: Score, Moves, Combo ──────────────────────
  const hudY = 12;
  drawText(ctx, `⭐ ${game.score}`, w * 0.2, hudY + 10, w * 0.3, "#f0b90b", 16);
  drawText(ctx, `? ${game.moves}步`, cx, hudY + 10, w * 0.3, "#3ea6ff", 16);
  if (game.combo > 1) {
    const comboPulse = 1 + Math.sin(anim.time * 5) * 0.08;
    ctx.save();
    ctx.translate(w * 0.8, hudY + 10);
    ctx.scale(comboPulse, comboPulse);
    drawText(ctx, ` x${game.combo}`, 0, 0, w * 0.25, "#ff6b6b", 16);
    ctx.restore();
  }

  // Moves bar
  const barY = hudY + 26;
  const barW = w - 32;
  const barX = 16;
  const barH = 6;
  const movesFrac = Math.max(0, game.moves / game.maxMoves);
  const movesColor = movesFrac > 0.5 ? "#22c55e" : movesFrac > 0.2 ? "#eab308" : "#ef4444";
  drawRoundedRect(ctx, barX, barY, barW, barH, 3);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  if (movesFrac > 0) {
    drawRoundedRect(ctx, barX, barY, barW * movesFrac, barH, 3);
    ctx.fillStyle = movesColor;
    ctx.fill();
  }

  // ─── Grid Background ──────────────────────────────
  drawRoundedRect(ctx, gridX - 6, gridY - 6, gridW + 12, gridH + 12, 12);
  ctx.fillStyle = "rgba(26,26,26,0.6)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ─── Board ─────────────────────────────────────────
  renderBoard(ctx, game, anim, cellSize, gap, gridX, gridY, 1);

  // ─── Particles & Popups ────────────────────────────
  particles.render(ctx);
  renderScorePopups(ctx, anim.scorePopups);

  // ─── Hint text ─────────────────────────────────────
  const hintY = gridY + gridH + 24;
  drawText(ctx, "点击两个相邻宝石交换 · 三个相同消除得分", cx, hintY, w * 0.9, "#555", 11);

  ctx.restore();
}

function renderBoard(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  anim: AnimState,
  cellSize: number,
  gap: number,
  gridX: number,
  gridY: number,
  boardAlpha: number,
) {
  ctx.save();
  ctx.globalAlpha = boardAlpha;

  // Build a set of animating gem positions for lookup
  const animatingTo = new Set<string>();
  const animatingFrom = new Set<string>();
  for (const a of anim.gemAnims) {
    animatingTo.add(`${a.toRow},${a.toCol}`);
    animatingFrom.add(`${a.fromRow},${a.fromCol}`);
  }

  // Build clearing set
  const clearingSet = new Set<string>();
  for (const [r, c] of anim.clearingGems) {
    clearingSet.add(`${r},${c}`);
  }

  // Draw static gems (not animating)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${r},${c}`;
      if (animatingTo.has(key)) continue;
      if (clearingSet.has(key)) continue;
      const gemType = game.board[r][c];
      if (gemType < 0) continue;

      const { x, y } = getCellCenter(gridX, gridY, cellSize, gap, r, c);
      const isSelected = game.selected && game.selected[0] === r && game.selected[1] === c;
      const glowI = isSelected ? 0.4 + Math.sin(anim.selectedPulse * 4) * 0.15 : 0;
      const scale = isSelected ? 1.08 + Math.sin(anim.selectedPulse * 4) * 0.04 : 1;
      drawGem(ctx, x, y, cellSize, gemType, 1, scale, glowI);
    }
  }

  // Draw animating gems
  for (const a of anim.gemAnims) {
    const gemType = game.board[a.toRow][a.toCol];
    if (gemType < 0) continue;
    const from = getCellCenter(gridX, gridY, cellSize, gap, a.fromRow, a.fromCol);
    const to = getCellCenter(gridX, gridY, cellSize, gap, a.toRow, a.toCol);
    const t = a.type === "fall" || a.type === "spawn" ? easeOutBounce(a.progress) : easeOutQuad(a.progress);
    const x = lerp(from.x, to.x, t);
    const y = lerp(from.y, to.y, t);
    const scale = a.type === "spawn" ? lerp(0.3, 1, t) : 1;
    drawGem(ctx, x, y, cellSize, gemType, 1, scale, 0);
  }

  // Draw clearing gems (shrinking + fading)
  for (const [r, c] of anim.clearingGems) {
    const gemType = game.board[r][c];
    if (gemType < 0) continue;
    const { x, y } = getCellCenter(gridX, gridY, cellSize, gap, r, c);
    const alpha = anim.clearAlpha;
    const scale = anim.clearAlpha;
    drawGem(ctx, x, y, cellSize, gemType, alpha, scale, alpha * 0.5);
  }

  ctx.restore();
}


// ─── Component ───────────────────────────────────────────
export default function Match3Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(initGameState());
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 330,
    targetBgHue: 330,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    gemAnims: [],
    animTimer: 0,
    clearingGems: [],
    clearAlpha: 1,
    selectedPulse: 0,
    resultFadeIn: 0,
    swapBack: false,
    swapGems: null,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);
  const pausedRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0 });

  // React UI state
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(MAX_MOVES);
  const [combo, setCombo] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // Submit score
  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* silent */ }
  }, []);

  // End game
  const endGame = useCallback(() => {
    const game = gameRef.current;
    game.over = true;
    game.phase = "idle";
    animRef.current.resultFadeIn = 0;
    soundRef.current?.playGameOver();
    const { w, h } = sizeRef.current;
    particlesRef.current?.emitCelebration(w / 2, h * 0.35);
    submitScore(game.score);
    setScore(game.score);
    setGameOver(true);
  }, [submitScore]);

  // Process chain: clear matches → gravity → check again
  const processChain = useCallback(() => {
    const game = gameRef.current;
    const anim = animRef.current;
    const { w, h } = sizeRef.current;
    const { cellSize, gap, gridX, gridY } = getGridLayout(w, h);

    const matches = findMatches(game.board);
    if (matches.length === 0) {
      // Chain ended
      game.combo = 0;
      game.phase = "idle";
      // Check if game is over
      if (game.moves <= 0 || !hasValidMoves(game.board)) {
        endGame();
      }
      return;
    }

    // Increment combo
    game.combo++;
    if (game.combo > game.maxCombo) game.maxCombo = game.combo;

    // Calculate score
    const pts = matches.length * BASE_SCORE * game.combo;
    game.score += pts;
    game.totalCleared += matches.length;

    // Sound effects
    soundRef.current?.playScore(pts);
    if (game.combo > 1) soundRef.current?.playCombo(game.combo);

    // Particles + score popup for each cleared gem
    for (const [r, c] of matches) {
      const { x, y } = getCellCenter(gridX, gridY, cellSize, gap, r, c);
      const gemType = game.board[r][c];
      if (gemType >= 0) {
        particlesRef.current?.emitExplosion(x, y, GEM_COLORS[gemType].fill, 8);
      }
    }

    // Score popup at center of cleared area
    const avgR = matches.reduce((s, m) => s + m[0], 0) / matches.length;
    const avgC = matches.reduce((s, m) => s + m[1], 0) / matches.length;
    const popupPos = getCellCenter(gridX, gridY, cellSize, gap, avgR, avgC);
    anim.scorePopups.push({
      x: popupPos.x,
      y: popupPos.y - 20,
      value: pts,
      life: 1,
      combo: game.combo,
    });

    // Shake on big combos
    if (game.combo >= 2) {
      anim.shake = { time: 0.2, intensity: 3 + game.combo };
    }

    // Start clear animation
    game.phase = "clearing";
    anim.clearingGems = matches;
    anim.clearAlpha = 1;
    anim.animTimer = 0;
    anim.targetBgHue = 330 + game.combo * 10;

    setScore(game.score);
    setCombo(game.combo);
  }, [endGame]);

  // After clear animation: remove gems, apply gravity, animate falls
  const afterClear = useCallback(() => {
    const game = gameRef.current;
    const anim = animRef.current;

    // Remove cleared gems
    for (const [r, c] of anim.clearingGems) {
      game.board[r][c] = -1;
    }
    anim.clearingGems = [];

    // Apply gravity
    const fallAnims = applyGravity(game.board);
    if (fallAnims.length > 0) {
      game.phase = "falling";
      anim.gemAnims = fallAnims;
      anim.animTimer = 0;
    } else {
      // No falls needed, check for new matches
      game.phase = "checking";
      processChain();
    }
  }, [processChain]);

  // After fall animation: check for new matches
  const afterFall = useCallback(() => {
    const anim = animRef.current;
    const game = gameRef.current;
    anim.gemAnims = [];
    game.phase = "checking";
    processChain();
  }, [processChain]);

  // Handle swap attempt
  const trySwap = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    const game = gameRef.current;
    const anim = animRef.current;
    if (game.phase !== "idle" || game.over) return;
    if (game.moves <= 0) return;

    // Perform swap
    [game.board[r1][c1], game.board[r2][c2]] = [game.board[r2][c2], game.board[r1][c1]];

    const matches = findMatches(game.board);
    if (matches.length === 0) {
      // Swap back - invalid move
      [game.board[r1][c1], game.board[r2][c2]] = [game.board[r2][c2], game.board[r1][c1]];
      // Animate swap and swap-back
      game.phase = "swapping";
      anim.swapBack = true;
      anim.swapGems = [[r1, c1], [r2, c2]];
      anim.gemAnims = [
        { fromRow: r1, fromCol: c1, toRow: r2, toCol: c2, progress: 0, type: "swap" },
        { fromRow: r2, fromCol: c2, toRow: r1, toCol: c1, progress: 0, type: "swap" },
      ];
      anim.animTimer = 0;
      soundRef.current?.playError();
      return;
    }

    // Valid swap
    game.moves--;
    game.selected = null;
    game.phase = "swapping";
    anim.swapBack = false;
    anim.swapGems = [[r1, c1], [r2, c2]];
    anim.gemAnims = [
      { fromRow: r1, fromCol: c1, toRow: r2, toCol: c2, progress: 0, type: "swap" },
      { fromRow: r2, fromCol: c2, toRow: r1, toCol: c1, progress: 0, type: "swap" },
    ];
    anim.animTimer = 0;
    soundRef.current?.playMove();
    setMoves(game.moves);
  }, []);

  // After swap animation
  const afterSwap = useCallback(() => {
    const game = gameRef.current;
    const anim = animRef.current;
    anim.gemAnims = [];

    if (anim.swapBack) {
      // Invalid swap - return to idle
      game.phase = "idle";
      anim.swapBack = false;
      anim.swapGems = null;
      return;
    }

    anim.swapGems = null;
    game.phase = "checking";
    game.combo = 0;
    processChain();
  }, [processChain]);

  // Handle tap on grid
  const handleTap = useCallback((x: number, y: number) => {
    const game = gameRef.current;
    const { w, h } = sizeRef.current;

    if (game.over) {
      // Restart button
      const cx = w / 2;
      const cardH = h * 0.48;
      const cardY = h * 0.18;
      const btnW = w * 0.5;
      const btnH2 = 48;
      const btnX2 = cx - btnW / 2;
      const btnY2 = cardY + cardH - 65;
      if (x >= btnX2 && x <= btnX2 + btnW && y >= btnY2 && y <= btnY2 + btnH2) {
        // Restart
        gameRef.current = initGameState();
        animRef.current.resultFadeIn = 0;
        animRef.current.targetBgHue = 330;
        animRef.current.gemAnims = [];
        animRef.current.clearingGems = [];
        scoreSubmittedRef.current = false;
        setScore(0);
        setMoves(MAX_MOVES);
        setCombo(0);
        setGameOver(false);
        soundRef.current?.playClick();
      }
      return;
    }

    if (game.phase !== "idle") return;

    const { cellSize, gap, gridX, gridY } = getGridLayout(w, h);

    // Determine which cell was tapped
    const col = Math.floor((x - gridX) / (cellSize + gap));
    const row = Math.floor((y - gridY) / (cellSize + gap));
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
      game.selected = null;
      return;
    }

    // Check if tap is within cell bounds (not in gap)
    const cellX = gridX + col * (cellSize + gap);
    const cellY = gridY + row * (cellSize + gap);
    if (x < cellX || x > cellX + cellSize || y < cellY || y > cellY + cellSize) {
      return;
    }

    soundRef.current?.playClick();

    if (!game.selected) {
      game.selected = [row, col];
      return;
    }

    const [sr, sc] = game.selected;
    if (sr === row && sc === col) {
      // Deselect
      game.selected = null;
      return;
    }

    // Check adjacency
    if (Math.abs(sr - row) + Math.abs(sc - col) !== 1) {
      // Not adjacent - select new gem
      game.selected = [row, col];
      return;
    }

    // Try swap
    game.selected = null;
    trySwap(sr, sc, row, col);
  }, [trySwap]);

  // Restart
  const restart = useCallback(() => {
    gameRef.current = initGameState();
    animRef.current.resultFadeIn = 0;
    animRef.current.targetBgHue = 330;
    animRef.current.gemAnims = [];
    animRef.current.clearingGems = [];
    animRef.current.scorePopups = [];
    scoreSubmittedRef.current = false;
    particlesRef.current?.clear();
    setScore(0);
    setMoves(MAX_MOVES);
    setCombo(0);
    setGameOver(false);
    soundRef.current?.playClick();
  }, []);

  // Initialize engines
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(400);
  }, []);

  // Setup canvas, input, and game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const doResize = () => {
      const { width } = resizeCanvas(canvas, parent);
      const h = Math.max(width * 1.2, 480);
      const dpr = window.devicePixelRatio || 1;
      canvas.height = h * dpr;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: width, h };
    };
    doResize();
    window.addEventListener("resize", doResize);

    // Input handler
    const input = new InputHandler(canvas);
    input.onTap((tx, ty) => handleTap(tx, ty));
    input.preventDefaults();
    inputRef.current = input;

    // Mouse click support
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      handleTap(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener("mousedown", onMouseDown);

    // Game loop
    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min(timestamp - lastTimeRef.current, 50) / 1000;
      lastTimeRef.current = timestamp;

      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const anim = animRef.current;
      const game = gameRef.current;
      anim.time += dt;
      anim.selectedPulse += dt;

      // Smooth transitions
      anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, dt * 3);
      updateShake(anim.shake, dt);
      particlesRef.current?.update(dt);
      updateScorePopups(anim.scorePopups, dt);

      if (game.over) {
        anim.resultFadeIn = Math.min(1, anim.resultFadeIn + dt * 4);
      }

      // Phase-based animation updates
      if (game.phase === "swapping") {
        anim.animTimer += dt;
        const progress = Math.min(1, anim.animTimer / SWAP_DURATION);
        for (const a of anim.gemAnims) a.progress = progress;
        if (progress >= 1) afterSwap();
      } else if (game.phase === "clearing") {
        anim.animTimer += dt;
        anim.clearAlpha = Math.max(0, 1 - anim.animTimer / CLEAR_DURATION);
        if (anim.animTimer >= CLEAR_DURATION) afterClear();
      } else if (game.phase === "falling") {
        anim.animTimer += dt;
        const progress = Math.min(1, anim.animTimer / FALL_DURATION);
        for (const a of anim.gemAnims) a.progress = progress;
        if (progress >= 1) afterFall();
      }

      // Render
      const { w, h } = sizeRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx && w > 0 && h > 0) {
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderGame(ctx, w, h, game, anim, particlesRef.current);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", doResize);
      canvas.removeEventListener("mousedown", onMouseDown);
      input.dispose();
    };
  }, [handleTap, afterSwap, afterClear, afterFall]);

  // Auto-pause on tab switch
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        pausedRef.current = true;
      } else {
        pausedRef.current = false;
        lastTimeRef.current = 0;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      soundRef.current?.dispose();
      inputRef.current?.dispose();
      particlesRef.current?.clear();
    };
  }, []);

  // Save/Load
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    return {
      board: game.board.map(r => [...r]),
      score: game.score,
      moves: game.moves,
      combo: game.combo,
      maxCombo: game.maxCombo,
      over: game.over,
      totalCleared: game.totalCleared,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        board?: number[][]; score?: number; moves?: number;
        combo?: number; maxCombo?: number; over?: boolean; totalCleared?: number;
      };
      if (!d || typeof d.score !== "number" || !Array.isArray(d.board)) return;
      if (d.board.length !== ROWS) return;
      for (const row of d.board) {
        if (!Array.isArray(row) || row.length !== COLS) return;
        for (const v of row) {
          if (typeof v !== "number" || v < 0 || v >= NUM_GEM_TYPES) return;
        }
      }
      const game = gameRef.current;
      game.board = d.board.map(r => [...r]);
      game.score = d.score;
      game.moves = typeof d.moves === "number" ? d.moves : MAX_MOVES;
      game.combo = d.combo ?? 0;
      game.maxCombo = d.maxCombo ?? 0;
      game.over = d.over ?? false;
      game.totalCleared = d.totalCleared ?? 0;
      game.selected = null;
      game.phase = "idle";
      animRef.current.gemAnims = [];
      animRef.current.clearingGems = [];
      scoreSubmittedRef.current = false;
      setScore(game.score);
      setMoves(game.moves);
      setCombo(game.combo);
      setGameOver(game.over);
    } catch { /* ignore malformed data */ }
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block transition">
          ← 返回游戏中心
        </Link>

        {/* Title + Stats */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-white">
            
            <span className="text-[#ec4899]">宝石消消乐</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">得分</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{score}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">步数</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{moves}</div>
            </div>
            {combo > 1 && (
              <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
                <div className="text-[10px] text-[#8a8a8a]">连击</div>
                <div className="font-bold text-[#ff6b6b] text-sm tabular-nums animate-pulse">{combo}x</div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-end mb-3 gap-1.5">
          <button
            onClick={restart}
            className="px-3 py-1.5 rounded-lg text-xs bg-[#ec4899] text-white font-semibold hover:bg-[#db2777] transition"
          >
            新游戏
          </button>
        </div>

        {/* Canvas */}
        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl cursor-pointer"
            style={{ touchAction: "none" }}
          />
        </div>

        {gameOver && (
          <div className="text-center mt-3">
            <button
              onClick={restart}
              className="px-6 py-2.5 rounded-xl bg-[#ec4899] text-white font-bold text-sm hover:bg-[#db2777] transition shadow-lg shadow-[#ec4899]/25"
            >
              再来一局
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          点击两个相邻宝石交换 · 三个相同消除得分 · {MAX_MOVES}步限制
        </p>

        {/* Leaderboard & Save/Load */}
        <div className="mt-4 space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
