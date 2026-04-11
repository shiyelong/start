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
import { easeOutQuad, lerp, updateShake, applyShake, updateScorePopups, renderScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { drawGradientBackground, drawText, drawGlow, drawRoundedRect } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
interface GameState {
  grid: boolean[][];       // true = lit, false = unlit
  size: number;
  moves: number;
  levelIdx: number;
  won: boolean;
  score: number;
  bestMoves: number;       // best (fewest) moves for current level
  paused: boolean;
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  toggleAnims: ToggleAnim[];
  winFadeIn: number;       // 0→1 for win overlay
  cellPulse: number;       // pulsing for lit cells
}

interface ToggleAnim {
  row: number;
  col: number;
  progress: number;        // 0→1
  toState: boolean;        // target state (lit or unlit)
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "lights";
const TOGGLE_DURATION = 0.2;
const CELL_RADIUS = 6;
const BOARD_PADDING = 12;
const CELL_GAP = 6;

const LEVELS = [
  { size: 3, moves: 3, label: "3×3 简单" },
  { size: 4, moves: 5, label: "4×4 中等" },
  { size: 5, moves: 8, label: "5×5 困难" },
  { size: 6, moves: 12, label: "6×6 地狱" },
  { size: 7, moves: 16, label: "7×7 噩梦" },
];

const LIT_COLOR = "#f0b90b";
const LIT_GLOW_COLOR = "#f0b90b";
const UNLIT_COLOR = "#1a1a1a";
const UNLIT_BORDER = "#333333";

// ─── Game Logic (Pure Functions) ─────────────────────────
function createEmptyGrid(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array(size).fill(false));
}

function toggleCell(grid: boolean[][], r: number, c: number, size: number): boolean[][] {
  const ng = grid.map(row => [...row]);
  ng[r][c] = !ng[r][c];
  if (r > 0) ng[r - 1][c] = !ng[r - 1][c];
  if (r < size - 1) ng[r + 1][c] = !ng[r + 1][c];
  if (c > 0) ng[r][c - 1] = !ng[r][c - 1];
  if (c < size - 1) ng[r][c + 1] = !ng[r][c + 1];
  return ng;
}

function getAffectedCells(r: number, c: number, size: number): [number, number][] {
  const cells: [number, number][] = [[r, c]];
  if (r > 0) cells.push([r - 1, c]);
  if (r < size - 1) cells.push([r + 1, c]);
  if (c > 0) cells.push([r, c - 1]);
  if (c < size - 1) cells.push([r, c + 1]);
  return cells;
}

function generatePuzzle(size: number, numMoves: number): boolean[][] {
  const grid = createEmptyGrid(size);
  for (let i = 0; i < numMoves; i++) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    const affected = getAffectedCells(r, c, size);
    for (const [ar, ac] of affected) {
      grid[ar][ac] = !grid[ar][ac];
    }
  }
  // Ensure not already solved
  if (grid.every(row => row.every(cell => !cell))) {
    return generatePuzzle(size, numMoves);
  }
  return grid;
}

function countLit(grid: boolean[][]): number {
  let count = 0;
  for (const row of grid) for (const cell of row) if (cell) count++;
  return count;
}

function isSolved(grid: boolean[][]): boolean {
  return grid.every(row => row.every(cell => !cell));
}

function calculateScore(moves: number, size: number): number {
  // Fewer moves = higher score. Base score scales with grid size.
  const maxMoves = size * size * 2;
  const efficiency = Math.max(0, maxMoves - moves);
  return Math.max(10, efficiency * size * 10);
}

function initGameState(levelIdx: number): GameState {
  const level = LEVELS[levelIdx];
  return {
    grid: generatePuzzle(level.size, level.moves),
    size: level.size,
    moves: 0,
    levelIdx,
    won: false,
    score: 0,
    bestMoves: 0,
    paused: false,
  };
}

// ─── Renderer ────────────────────────────────────────────
function renderGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  game: GameState,
  anim: AnimState,
  particles: ParticleSystem,
  dpr: number,
): void {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  drawGradientBackground(ctx, w, h, anim.bgHue, 50);

  // Apply shake
  applyShake(ctx, anim.shake);

  // Board layout
  const maxBoardWidth = Math.min(w - 24, 420);
  const cellSize = (maxBoardWidth - BOARD_PADDING * 2 - CELL_GAP * (game.size - 1)) / game.size;
  const boardWidth = BOARD_PADDING * 2 + cellSize * game.size + CELL_GAP * (game.size - 1);
  const boardHeight = boardWidth;
  const boardX = (w - boardWidth) / 2;
  const boardY = 12;

  // Board background
  drawRoundedRect(ctx, boardX, boardY, boardWidth, boardHeight, 12);
  ctx.fillStyle = "rgba(15, 15, 15, 0.6)";
  ctx.fill();

  // Build toggle anim lookup
  const animLookup = new Map<string, ToggleAnim>();
  for (const ta of anim.toggleAnims) {
    animLookup.set(`${ta.row},${ta.col}`, ta);
  }

  // Draw cells
  for (let r = 0; r < game.size; r++) {
    for (let c = 0; c < game.size; c++) {
      const cx = boardX + BOARD_PADDING + c * (cellSize + CELL_GAP);
      const cy = boardY + BOARD_PADDING + r * (cellSize + CELL_GAP);
      const isLit = game.grid[r][c];
      const key = `${r},${c}`;
      const ta = animLookup.get(key);

      let litAmount = isLit ? 1 : 0;
      if (ta) {
        const t = easeOutQuad(Math.min(1, ta.progress));
        litAmount = ta.toState ? t : 1 - t;
      }

      // Cell background
      ctx.save();
      drawRoundedRect(ctx, cx, cy, cellSize, cellSize, CELL_RADIUS);

      if (litAmount > 0.01) {
        // Lit cell: golden glow
        const pulse = 0.85 + 0.15 * Math.sin(anim.cellPulse * 3 + r * 0.5 + c * 0.7);
        const alpha = litAmount * pulse;

        // Glow behind cell
        drawGlow(ctx, cx + cellSize / 2, cy + cellSize / 2, cellSize * 0.8, LIT_GLOW_COLOR, alpha * 0.4);

        // Cell fill with interpolated color
        const litR = 240, litG = 185, litB = 11;
        const darkR = 26, darkG = 26, darkB = 26;
        const fr = Math.round(lerp(darkR, litR, litAmount));
        const fg = Math.round(lerp(darkG, litG, litAmount));
        const fb = Math.round(lerp(darkB, litB, litAmount));
        drawRoundedRect(ctx, cx, cy, cellSize, cellSize, CELL_RADIUS);
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
        ctx.fill();

        // Border glow
        drawRoundedRect(ctx, cx, cy, cellSize, cellSize, CELL_RADIUS);
        ctx.strokeStyle = `rgba(240, 185, 11, ${alpha * 0.8})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Sun icon for lit cells
        if (litAmount > 0.5) {
          const iconAlpha = (litAmount - 0.5) * 2;
          ctx.globalAlpha = iconAlpha;
          const iconSize = Math.min(cellSize * 0.4, 20);
          const icx = cx + cellSize / 2;
          const icy = cy + cellSize / 2;

          // Draw simple sun rays
          ctx.strokeStyle = "rgba(15, 15, 15, 0.7)";
          ctx.lineWidth = 2;
          const rayLen = iconSize * 0.4;
          for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const innerR = iconSize * 0.35;
            ctx.beginPath();
            ctx.moveTo(icx + Math.cos(angle) * innerR, icy + Math.sin(angle) * innerR);
            ctx.lineTo(icx + Math.cos(angle) * (innerR + rayLen), icy + Math.sin(angle) * (innerR + rayLen));
            ctx.stroke();
          }
          // Sun circle
          ctx.beginPath();
          ctx.arc(icx, icy, iconSize * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(15, 15, 15, 0.7)";
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        // Unlit cell
        drawRoundedRect(ctx, cx, cy, cellSize, cellSize, CELL_RADIUS);
        ctx.fillStyle = UNLIT_COLOR;
        ctx.fill();
        drawRoundedRect(ctx, cx, cy, cellSize, cellSize, CELL_RADIUS);
        ctx.strokeStyle = UNLIT_BORDER;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // Particles
  particles.render(ctx);

  // Score popups
  renderScorePopups(ctx, anim.scorePopups);

  // Pause overlay
  if (game.paused && !game.won) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, "⏸ 已暂停", w / 2, h / 2, w * 0.8, "#ffffff", 28);
    drawText(ctx, "点击继续", w / 2, h / 2 + 36, w * 0.6, "#8a8a8a", 14);
  }

  ctx.restore();
}

// ─── Component ───────────────────────────────────────────
export default function LightsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 45,
    targetBgHue: 45,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    toggleAnims: [],
    winFadeIn: 0,
    cellPulse: 0,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);

  // React UI state (only for elements outside canvas)
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [lightsOn, setLightsOn] = useState(0);
  const [won, setWon] = useState(false);
  const [levelIdx, setLevelIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [, forceUpdate] = useState(0);

  // Initialize sound + particles
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
  }, []);

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

  // Init game
  const initGame = useCallback((idx: number) => {
    gameRef.current = initGameState(idx);
    const anim = animRef.current;
    anim.toggleAnims = [];
    anim.scorePopups = [];
    anim.shake = { time: 0, intensity: 0 };
    anim.winFadeIn = 0;
    anim.targetBgHue = 45;
    particlesRef.current?.clear();
    scoreSubmittedRef.current = false;
    setScore(0);
    setMoves(0);
    setLightsOn(countLit(gameRef.current.grid));
    setWon(false);
    setPaused(false);
    forceUpdate(n => n + 1);
  }, []);

  // Handle cell click
  const handleCellClick = useCallback((canvasX: number, canvasY: number) => {
    const game = gameRef.current;
    if (!game || game.won || game.paused) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;

    const maxBoardWidth = Math.min(w - 24, 420);
    const cellSize = (maxBoardWidth - BOARD_PADDING * 2 - CELL_GAP * (game.size - 1)) / game.size;
    const boardWidth = BOARD_PADDING * 2 + cellSize * game.size + CELL_GAP * (game.size - 1);
    const boardX = (w - boardWidth) / 2;
    const boardY = 12;

    // Find which cell was clicked
    const relX = canvasX - boardX - BOARD_PADDING;
    const relY = canvasY - boardY - BOARD_PADDING;
    if (relX < 0 || relY < 0) return;

    const col = Math.floor(relX / (cellSize + CELL_GAP));
    const row = Math.floor(relY / (cellSize + CELL_GAP));
    if (row < 0 || row >= game.size || col < 0 || col >= game.size) return;

    // Check click is within cell bounds (not in gap)
    const cellX = col * (cellSize + CELL_GAP);
    const cellY = row * (cellSize + CELL_GAP);
    if (relX - cellX > cellSize || relY - cellY > cellSize) return;

    // Toggle
    const affected = getAffectedCells(row, col, game.size);
    const newGrid = toggleCell(game.grid, row, col, game.size);

    // Create toggle animations
    const anim = animRef.current;
    for (const [ar, ac] of affected) {
      anim.toggleAnims.push({
        row: ar,
        col: ac,
        progress: 0,
        toState: newGrid[ar][ac],
      });
    }

    game.grid = newGrid;
    game.moves++;

    // Sound
    soundRef.current?.playClick();

    // Particles at clicked cell
    const pcx = boardX + BOARD_PADDING + col * (cellSize + CELL_GAP) + cellSize / 2;
    const pcy = boardY + BOARD_PADDING + row * (cellSize + CELL_GAP) + cellSize / 2;
    particlesRef.current?.emitSpark(pcx, pcy, LIT_COLOR);

    // Check win
    if (isSolved(newGrid)) {
      game.won = true;
      game.score = calculateScore(game.moves, game.size);
      anim.targetBgHue = 120; // green for win

      // Win celebration particles
      const centerX = boardX + boardWidth / 2;
      const centerY = boardY + boardWidth / 2;
      particlesRef.current?.emitCelebration(centerX, centerY);
      particlesRef.current?.emitCelebration(centerX - 60, centerY - 40);
      particlesRef.current?.emitCelebration(centerX + 60, centerY - 40);

      soundRef.current?.playLevelUp();
      anim.shake = { time: 0.3, intensity: 4 };

      // Score popup
      anim.scorePopups.push({
        x: centerX,
        y: centerY - 20,
        value: game.score,
        life: 1.5,
        combo: 1,
      });

      submitScore(game.score);
      setWon(true);
      setScore(game.score);
    }

    setMoves(game.moves);
    setLightsOn(countLit(newGrid));
  }, [submitScore]);

  // Toggle pause
  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.won) return;
    game.paused = !game.paused;
    setPaused(game.paused);
  }, []);

  // Save/Load
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      grid: game.grid.map(r => [...r]),
      size: game.size,
      moves: game.moves,
      levelIdx: game.levelIdx,
      won: game.won,
      score: game.score,
      bestMoves: game.bestMoves,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        grid: boolean[][]; size: number; moves: number;
        levelIdx: number; won: boolean; score: number; bestMoves: number;
      };
      if (!d || !Array.isArray(d.grid) || typeof d.size !== "number" || typeof d.moves !== "number") return;
      const game = gameRef.current;
      if (!game) return;
      game.grid = d.grid;
      game.size = d.size;
      game.moves = d.moves;
      game.levelIdx = d.levelIdx;
      game.won = d.won;
      game.score = d.score;
      game.bestMoves = d.bestMoves || 0;
      game.paused = false;
      animRef.current.toggleAnims = [];
      animRef.current.scorePopups = [];
      animRef.current.winFadeIn = 0;
      particlesRef.current?.clear();
      scoreSubmittedRef.current = false;
      setLevelIdx(d.levelIdx);
      setScore(d.score);
      setMoves(d.moves);
      setLightsOn(countLit(d.grid));
      setWon(d.won);
      setPaused(false);
      forceUpdate(n => n + 1);
    } catch { /* ignore malformed data */ }
  }, []);

  // ─── Animation Loop ──────────────────────────────────────
  useEffect(() => {
    initGame(levelIdx);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const size = gameRef.current?.size || 5;
      const maxBoardWidth = Math.min(w - 24, 420);
      const cellSize = (maxBoardWidth - BOARD_PADDING * 2 - CELL_GAP * (size - 1)) / size;
      const boardHeight = BOARD_PADDING * 2 + cellSize * size + CELL_GAP * (size - 1);
      const h = boardHeight + 24;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    resize();
    window.addEventListener("resize", resize);

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const rawDt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const dt = Math.min(rawDt, 50) / 1000; // seconds, capped

      const anim = animRef.current;
      const game = gameRef.current;

      if (!game?.paused) {
        anim.time += dt;
        anim.cellPulse += dt;

        // Update toggle animations
        let i = anim.toggleAnims.length;
        while (i-- > 0) {
          anim.toggleAnims[i].progress += dt / TOGGLE_DURATION;
          if (anim.toggleAnims[i].progress >= 1) {
            anim.toggleAnims[i] = anim.toggleAnims[anim.toggleAnims.length - 1];
            anim.toggleAnims.pop();
          }
        }

        // Update shake
        updateShake(anim.shake, dt);

        // Update score popups
        updateScorePopups(anim.scorePopups, dt);

        // Update particles
        particlesRef.current?.update(dt);

        // Smooth bg hue
        anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.03);

        // Win fade in
        if (game?.won && anim.winFadeIn < 1) {
          anim.winFadeIn = Math.min(1, anim.winFadeIn + dt * 2);
        }
      }

      // Render
      if (game) {
        const dpr = window.devicePixelRatio || 1;
        renderGame(ctx, canvas, game, anim, particlesRef.current!, dpr);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [levelIdx]);

  // ─── Input ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse click
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      handleCellClick(x, y);
    };
    canvas.addEventListener("click", onClick);

    // Touch tap
    const input = new InputHandler(canvas);
    input.onTap((x, y) => handleCellClick(x, y));
    input.preventDefaults();
    inputRef.current = input;

    return () => {
      canvas.removeEventListener("click", onClick);
      input.dispose();
    };
  }, [handleCellClick]);

  // ─── Tab visibility auto-pause ─────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.hidden && gameRef.current && !gameRef.current.won) {
        gameRef.current.paused = true;
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ─── Cleanup ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      soundRef.current?.dispose();
      inputRef.current?.dispose();
      particlesRef.current?.clear();
    };
  }, []);

  // Level change
  const changeLevel = useCallback((idx: number) => {
    setLevelIdx(idx);
    initGame(idx);
  }, [initGame]);

  const restart = useCallback(() => {
    initGame(levelIdx);
  }, [initGame, levelIdx]);

  const nextLevel = useCallback(() => {
    if (levelIdx < LEVELS.length - 1) {
      const next = levelIdx + 1;
      setLevelIdx(next);
      initGame(next);
    }
  }, [levelIdx, initGame]);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block transition">
          ← 返回游戏中心
        </Link>

        {/* Title + Stats */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">
            <span className="text-[#f0b90b]">💡 关灯游戏</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">亮灯</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{lightsOn}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">步数</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{moves}</div>
            </div>
            {won && (
              <div className="text-center px-3 py-1.5 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30">
                <div className="text-[10px] text-[#22c55e]">得分</div>
                <div className="font-bold text-[#22c55e] text-sm tabular-nums">{score}</div>
              </div>
            )}
          </div>
        </div>

        {/* Level selector + controls */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {LEVELS.map((l, i) => (
              <button
                key={i}
                onClick={() => changeLevel(i)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition shrink-0 ${
                  levelIdx === i
                    ? "bg-[#f0b90b] text-[#0f0f0f] border-[#f0b90b] font-bold"
                    : "text-[#aaa] border-[#333] hover:text-white hover:border-[#555]"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={togglePause}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
            >
              {paused ? "▶" : "⏸"}
            </button>
            <button
              onClick={() => soundRef.current?.toggleMute()}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
            >
              {soundRef.current?.isMuted() ? "🔇" : "🔊"}
            </button>
            <button
              onClick={restart}
              className="px-3 py-1.5 rounded-lg text-xs bg-[#f0b90b] text-[#0f0f0f] font-semibold hover:bg-[#f5cc3a] transition"
            >
              新游戏
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl"
            style={{ touchAction: "none" }}
          />
        </div>

        {/* Win overlay */}
        {won && (
          <div className="text-center mt-3">
            <p className="text-3xl mb-1">🌙</p>
            <p className="text-lg font-bold text-[#f0b90b]">全部关灯！</p>
            <p className="text-[#8a8a8a] text-sm mb-3">用了 {moves} 步 · 得分 {score}</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={restart}
                className="px-4 py-2 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa] hover:text-white transition"
              >
                再来一次
              </button>
              {levelIdx < LEVELS.length - 1 && (
                <button
                  onClick={nextLevel}
                  className="px-4 py-2 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm hover:bg-[#f5cc3a] transition"
                >
                  下一难度
                </button>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          点击灯泡翻转自身和相邻灯 · 目标：全部关灯
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
