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
import { easeOutQuad, easeOutBounce, lerp, updateShake, updateScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

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

// ─── Hex → PixiJS number ─────────────────────────────────
function hexToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

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
    for (let r = writeRow; r >= 0; r--) {
      board[r][c] = randomGem();
      anims.push({ fromRow: r - (writeRow - r + 1), fromCol: c, toRow: r, toCol: c, progress: 0, type: "spawn" });
    }
  }
  return anims;
}

function hasValidMoves(board: number[][]): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) {
        [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
        if (findMatches(board).length > 0) {
          [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
          return true;
        }
        [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
      }
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

// ─── Layout helpers ──────────────────────────────────────
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
  const scoreSubmittedRef = useRef(false);
  const pausedRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0 });
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(0);

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
      game.combo = 0;
      game.phase = "idle";
      if (game.moves <= 0 || !hasValidMoves(game.board)) {
        endGame();
      }
      return;
    }

    game.combo++;
    if (game.combo > game.maxCombo) game.maxCombo = game.combo;

    const pts = matches.length * BASE_SCORE * game.combo;
    game.score += pts;
    game.totalCleared += matches.length;

    soundRef.current?.playScore(pts);
    if (game.combo > 1) soundRef.current?.playCombo(game.combo);

    for (const [r, c] of matches) {
      const { x, y } = getCellCenter(gridX, gridY, cellSize, gap, r, c);
      const gemType = game.board[r][c];
      if (gemType >= 0) {
        particlesRef.current?.emitExplosion(x, y, GEM_COLORS[gemType].fill, 8);
      }
    }

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

    if (game.combo >= 2) {
      anim.shake = { time: 0.2, intensity: 3 + game.combo };
    }

    game.phase = "clearing";
    anim.clearingGems = matches;
    anim.clearAlpha = 1;
    anim.animTimer = 0;
    anim.targetBgHue = 330 + game.combo * 10;

    setScore(game.score);
    setCombo(game.combo);
  }, [endGame]);

  // After clear animation
  const afterClear = useCallback(() => {
    const game = gameRef.current;
    const anim = animRef.current;
    for (const [r, c] of anim.clearingGems) {
      game.board[r][c] = -1;
    }
    anim.clearingGems = [];
    const fallAnims = applyGravity(game.board);
    if (fallAnims.length > 0) {
      game.phase = "falling";
      anim.gemAnims = fallAnims;
      anim.animTimer = 0;
    } else {
      game.phase = "checking";
      processChain();
    }
  }, [processChain]);

  // After fall animation
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

    [game.board[r1][c1], game.board[r2][c2]] = [game.board[r2][c2], game.board[r1][c1]];

    const matches = findMatches(game.board);
    if (matches.length === 0) {
      [game.board[r1][c1], game.board[r2][c2]] = [game.board[r2][c2], game.board[r1][c1]];
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
      const cx = w / 2;
      const cardH = h * 0.48;
      const cardY = h * 0.18;
      const btnW = w * 0.5;
      const btnH2 = 48;
      const btnX2 = cx - btnW / 2;
      const btnY2 = cardY + cardH - 65;
      if (x >= btnX2 && x <= btnX2 + btnW && y >= btnY2 && y <= btnY2 + btnH2) {
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
    const col = Math.floor((x - gridX) / (cellSize + gap));
    const row = Math.floor((y - gridY) / (cellSize + gap));
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
      game.selected = null;
      return;
    }

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
      game.selected = null;
      return;
    }

    if (Math.abs(sr - row) + Math.abs(sc - col) !== 1) {
      game.selected = [row, col];
      return;
    }

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

  // ─── PixiJS Setup & Render Loop ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    let destroyed = false;

    // Compute initial size
    const pw = Math.max(1, parent.clientWidth);
    const ph = Math.max(pw * 1.2, 480);
    canvas.style.width = `${pw}px`;
    canvas.style.height = `${ph}px`;
    sizeRef.current = { w: pw, h: ph };

    // Input handler
    const input = new InputHandler(canvas);
    input.onTap((tx, ty) => handleTap(tx, ty));
    input.preventDefaults();
    inputRef.current = input;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      handleTap(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener("mousedown", onMouseDown);

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;

      const pixi = await loadPixi();
      if (destroyed) return;

      const app = await createPixiApp({
        canvas: canvas!,
        width: pw,
        height: ph,
        backgroundColor: 0x0f0f0f,
        antialias: true,
      });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const g = new pixi.Graphics();
      app.stage.addChild(g);
      pixiGfxRef.current = g;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 12,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (70 objects)
      for (let i = 0; i < 70; i++) makeText(`t${i}`, { fontSize: 12 });

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: {
        fill?: string; fontSize?: number; fontWeight?: string;
        ax?: number; ay?: number; alpha?: number;
      }) => {
        if (textIdx >= 70) return;
        const t = texts.get(`t${textIdx}`)!;
        textIdx++;
        t.text = text;
        t.x = x; t.y = y;
        t.anchor.set(opts?.ax ?? 0.5, opts?.ay ?? 0.5);
        t.alpha = opts?.alpha ?? 1;
        t.style.fill = opts?.fill ?? "#ffffff";
        t.style.fontSize = opts?.fontSize ?? 12;
        t.style.fontWeight = (opts?.fontWeight ?? "bold") as "normal" | "bold";
        t.visible = true;
      };

      const cn = hexToNum;

      // ─── Draw gem helper (PixiJS) ──────────────────────
      const drawGemPixi = (
        gfx: PixiGraphics,
        x: number, y: number,
        size: number,
        gemType: number,
        alpha: number = 1,
        scale: number = 1,
        glowIntensity: number = 0,
      ) => {
        if (gemType < 0 || gemType >= GEM_COLORS.length) return;
        const gem = GEM_COLORS[gemType];
        const r = size * 0.42 * scale;
        const halfSize = r;
        const cornerR = r * 0.3;

        // Glow
        if (glowIntensity > 0) {
          gfx.circle(x, y, r * 1.8).fill({ color: cn(gem.glow), alpha: glowIntensity * 0.5 });
        }

        // Gem body - rounded rect
        gfx.roundRect(x - halfSize, y - halfSize, halfSize * 2, halfSize * 2, cornerR)
          .fill({ color: cn(gem.fill), alpha });

        // Lighter top-left highlight
        gfx.roundRect(x - halfSize + 2, y - halfSize + 2, halfSize * 1.2, halfSize * 1.2, cornerR * 0.8)
          .fill({ color: cn(gem.glow), alpha: alpha * 0.35 });

        // Inner highlight circle
        gfx.circle(x - r * 0.2, y - r * 0.2, r * 0.35)
          .fill({ color: 0xffffff, alpha: alpha * 0.3 });
      };

      // ─── Render particles via PixiJS Graphics ─────────
      const renderParticlesPixi = (gfx: PixiGraphics) => {
        const ps = particlesRef.current;
        if (!ps) return;
        // Access internal particles array
        const particles = (ps as unknown as { particles: Array<{ x: number; y: number; size: number; color: string; alpha: number; life: number }> }).particles;
        if (!particles) return;
        for (const p of particles) {
          if (p.life <= 0) continue;
          gfx.circle(p.x, p.y, p.size).fill({ color: cn(p.color), alpha: p.alpha });
        }
      };

      // ─── Render score popups via PixiJS Text ──────────
      const renderPopupsPixi = (popups: ScorePopup[]) => {
        for (const p of popups) {
          if (p.life <= 0) continue;
          const progress = 1 - p.life;
          const floatY = p.y - progress * 40;
          const alpha = Math.max(0, Math.min(1, p.life));
          let text = `+${p.value}`;
          if (p.combo > 1) text += ` x${p.combo}`;
          showText(text, p.x, floatY, { fill: "#ffd93d", fontSize: 18, fontWeight: "bold", alpha });
        }
      };

      // ─── Main ticker ──────────────────────────────────
      app.ticker.add(() => {
        if (destroyed) return;
        frameRef.current++;
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        const now = performance.now();
        if (!lastTimeRef.current) lastTimeRef.current = now;
        const dt = Math.min(now - lastTimeRef.current, 50) / 1000;
        lastTimeRef.current = now;

        if (pausedRef.current) return;

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

        // ─── Render ──────────────────────────────────────
        const { w, h } = sizeRef.current;
        if (w <= 0 || h <= 0) return;

        // Apply shake offset
        const shakeOx = anim.shake.time > 0 ? (Math.random() * 2 - 1) * anim.shake.intensity * (anim.shake.time) : 0;
        const shakeOy = anim.shake.time > 0 ? (Math.random() * 2 - 1) * anim.shake.intensity * (anim.shake.time) : 0;
        g.x = shakeOx;
        g.y = shakeOy;

        const cx = w / 2;
        const { cellSize, gap, gridX, gridY, gridW, gridH } = getGridLayout(w, h);

        // Background gradient (two rects to approximate)
        const hue = anim.bgHue;
        const bgTop = hslToNum(hue, 55, 12);
        const bgBot = hslToNum(hue, 55, 6);
        g.rect(0, 0, w, h / 2).fill({ color: bgTop });
        g.rect(0, h / 2, w, h / 2).fill({ color: bgBot });

        if (game.over) {
          // ─── Game Over Screen ──────────────────────────
          renderBoardPixi(g, game, anim, cellSize, gap, gridX, gridY, 0.3, drawGemPixi);

          const cardW = w * 0.85;
          const cardH = h * 0.48;
          const cardX = (w - cardW) / 2;
          const cardY = h * 0.18;

          // Glow behind card
          g.circle(cx, cardY + cardH * 0.3, w * 0.3).fill({ color: cn("#f0b90b"), alpha: 0.15 * anim.resultFadeIn });

          // Card background
          g.roundRect(cardX, cardY, cardW, cardH, 16).fill({ color: 0x1a1a1a, alpha: 0.92 });
          g.roundRect(cardX, cardY, cardW, cardH, 16).stroke({ color: 0x333333, width: 1 });

          const fi = anim.resultFadeIn;
          showText("游戏结束！", cx, cardY + 36, { fill: "#ec4899", fontSize: 24, fontWeight: "bold", alpha: fi });
          showText(`${game.score}`, cx, cardY + 80, { fill: "#f0b90b", fontSize: 42, fontWeight: "bold", alpha: fi });
          showText("分", cx, cardY + 108, { fill: "#888888", fontSize: 14, alpha: fi });

          const statsY = cardY + 135;
          showText(`消除: ${game.totalCleared}`, cx - w * 0.15, statsY, { fill: "#22c55e", fontSize: 15, alpha: fi });
          showText(`最高连击: ${game.maxCombo}`, cx + w * 0.15, statsY, { fill: "#f0b90b", fontSize: 15, alpha: fi });

          // Restart button
          const btnW = w * 0.5;
          const btnH2 = 48;
          const btnX2 = cx - btnW / 2;
          const btnY2 = cardY + cardH - 65;
          g.roundRect(btnX2, btnY2, btnW, btnH2, 12).fill({ color: cn("#ec4899") });
          showText("再来一局", cx, btnY2 + btnH2 / 2, { fill: "#ffffff", fontSize: 18, fontWeight: "bold" });

          renderParticlesPixi(g);
          renderPopupsPixi(anim.scorePopups);
          return;
        }

        // ─── HUD: Score, Moves, Combo ────────────────────
        const hudY = 12;
        showText(`${game.score}`, w * 0.2, hudY + 10, { fill: "#f0b90b", fontSize: 16, fontWeight: "bold" });
        showText(`${game.moves}步`, cx, hudY + 10, { fill: "#3ea6ff", fontSize: 16, fontWeight: "bold" });
        if (game.combo > 1) {
          showText(`x${game.combo}`, w * 0.8, hudY + 10, { fill: "#ff6b6b", fontSize: 16, fontWeight: "bold" });
        }

        // Moves bar
        const barY = hudY + 26;
        const barW2 = w - 32;
        const barX = 16;
        const barH = 6;
        const movesFrac = Math.max(0, game.moves / game.maxMoves);
        const movesColor = movesFrac > 0.5 ? "#22c55e" : movesFrac > 0.2 ? "#eab308" : "#ef4444";
        g.roundRect(barX, barY, barW2, barH, 3).fill({ color: 0xffffff, alpha: 0.08 });
        if (movesFrac > 0) {
          g.roundRect(barX, barY, barW2 * movesFrac, barH, 3).fill({ color: cn(movesColor) });
        }

        // ─── Grid Background ─────────────────────────────
        g.roundRect(gridX - 6, gridY - 6, gridW + 12, gridH + 12, 12).fill({ color: 0x1a1a1a, alpha: 0.6 });
        g.roundRect(gridX - 6, gridY - 6, gridW + 12, gridH + 12, 12).stroke({ color: 0xffffff, width: 1, alpha: 0.06 });

        // ─── Board ───────────────────────────────────────
        renderBoardPixi(g, game, anim, cellSize, gap, gridX, gridY, 1, drawGemPixi);

        // ─── Particles & Popups ──────────────────────────
        renderParticlesPixi(g);
        renderPopupsPixi(anim.scorePopups);

        // ─── Hint text ───────────────────────────────────
        const hintY = gridY + gridH + 24;
        showText("点击两个相邻宝石交换 · 三个相同消除得分", cx, hintY, { fill: "#555555", fontSize: 11 });
      });
    }

    initPixi();

    return () => {
      destroyed = true;
      canvas.removeEventListener("mousedown", onMouseDown);
      input.dispose();
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      pixiGfxRef.current = null;
      pixiTextsRef.current.clear();
      pixiInitRef.current = false;
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
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
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

// ─── Board rendering helper (PixiJS) ─────────────────────
function renderBoardPixi(
  g: PixiGraphics,
  game: GameState,
  anim: AnimState,
  cellSize: number,
  gap: number,
  gridX: number,
  gridY: number,
  boardAlpha: number,
  drawGemPixi: (gfx: PixiGraphics, x: number, y: number, size: number, gemType: number, alpha?: number, scale?: number, glowIntensity?: number) => void,
) {
  const animatingTo = new Set<string>();
  for (const a of anim.gemAnims) {
    animatingTo.add(`${a.toRow},${a.toCol}`);
  }

  const clearingSet = new Set<string>();
  for (const [r, c] of anim.clearingGems) {
    clearingSet.add(`${r},${c}`);
  }

  // Draw static gems
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
      drawGemPixi(g, x, y, cellSize, gemType, boardAlpha, scale, glowI);
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
    drawGemPixi(g, x, y, cellSize, gemType, boardAlpha, scale, 0);
  }

  // Draw clearing gems (shrinking + fading)
  for (const [r, c] of anim.clearingGems) {
    const gemType = game.board[r][c];
    if (gemType < 0) continue;
    const { x, y } = getCellCenter(gridX, gridY, cellSize, gap, r, c);
    const alpha = anim.clearAlpha * boardAlpha;
    const scale = anim.clearAlpha;
    drawGemPixi(g, x, y, cellSize, gemType, alpha, scale, alpha * 0.5);
  }
}

// ─── HSL to PixiJS number ────────────────────────────────
function hslToNum(h: number, s: number, l: number): number {
  const a = s / 100 * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
