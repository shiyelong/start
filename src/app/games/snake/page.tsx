"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID = 25;
const CANVAS_SIZE = 440;
const ACCENT = "#2ba640";
const ACCENT_GLOW = "#3aff55";

const DIFFS = [
  { label: "简单", speed: 180, color: "#2ba640", obstacles: 0 },
  { label: "普通", speed: 130, color: "#f0b90b", obstacles: 2 },
  { label: "困难", speed: 90, color: "#ff4444", obstacles: 4 },
  { label: "地狱", speed: 55, color: "#a855f7", obstacles: 6 },
];

// ─── Types ───────────────────────────────────────────────────────────────────
type Pos = { x: number; y: number };

type FoodType = "normal" | "golden" | "speed" | "shield" | "ghost" | "magnet" | "boss";
interface Food {
  x: number; y: number;
  type: FoodType;
  age: number;
  pulsePhase: number;
  vx?: number; vy?: number;
  size?: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
  alpha?: number;
}

interface Obstacle { x: number; y: number; }

interface PowerUp {
  type: "speed" | "shield" | "ghost" | "magnet";
  remaining: number;
}

interface DeathSegment {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; rotV: number;
  alpha: number; color: string; size: number;
}

interface GameState {
  snake: Pos[];
  dir: Pos;
  nextDir: Pos;
  foods: Food[];
  obstacles: Obstacle[];
  score: number;
  level: number;
  running: boolean;
  gameOver: boolean;
  started: boolean;
  powerUps: PowerUp[];
  shieldHits: number;
  tickCount: number;
  moveProgress: number;
  lastMoveTime: number;
  trail: { x: number; y: number; alpha: number }[];
  particles: Particle[];
  flashAlpha: number;
  flashColor: string;
  deathSegments: DeathSegment[];
  deathTime: number;
  displayScore: number;
  scorePopups: { x: number; y: number; value: number; life: number }[];
  bossTimer: number;
  baseSpeed: number;
  currentSpeed: number;
}

// ─── Food config ─────────────────────────────────────────────────────────────
const FOOD_CONFIG: Record<FoodType, { points: number; color: string; glow: string; emoji: string }> = {
  normal:  { points: 10, color: "#ff4444", glow: "#ff6666", emoji: "a" },
  golden:  { points: 30, color: "#ffd700", glow: "#ffee88", emoji: "*" },
  speed:   { points: 5,  color: "#00ccff", glow: "#66eeff", emoji: "?" },
  shield:  { points: 5,  color: "#8855ff", glow: "#aa88ff", emoji: "?" },
  ghost:   { points: 5,  color: "#ff88ff", glow: "#ffaaff", emoji: "?" },
  magnet:  { points: 5,  color: "#ff8800", glow: "#ffaa44", emoji: "?" },
  boss:    { points: 50, color: "#ff0066", glow: "#ff4499", emoji: "?" },
};

// ─── Hex to PixiJS number ────────────────────────────────────────────────────
function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}

// ─── Audio ───────────────────────────────────────────────────────────────────
function createAudioCtx() {
  if (typeof window === "undefined") return null;
  try { return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); }
  catch { return null; }
}

function playTone(ctx: AudioContext | null, freq: number, dur: number, type: OscillatorType = "square", vol = 0.08) {
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch { /* ignore */ }
}

function playEat(ctx: AudioContext | null) {
  playTone(ctx, 880, 0.1, "square", 0.06);
  setTimeout(() => playTone(ctx, 1100, 0.08, "square", 0.05), 50);
}

function playPowerUp(ctx: AudioContext | null) {
  playTone(ctx, 523, 0.1, "sine", 0.08);
  setTimeout(() => playTone(ctx, 659, 0.1, "sine", 0.07), 80);
  setTimeout(() => playTone(ctx, 784, 0.15, "sine", 0.06), 160);
}

function playDeath(ctx: AudioContext | null) {
  playTone(ctx, 300, 0.3, "sawtooth", 0.1);
  setTimeout(() => playTone(ctx, 200, 0.4, "sawtooth", 0.08), 150);
}

function playLevelUp(ctx: AudioContext | null) {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(ctx, f, 0.15, "sine", 0.07), i * 100));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rng(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function posOccupied(p: Pos, snake: Pos[], obstacles: Obstacle[], foods: Food[]): boolean {
  return snake.some(s => s.x === p.x && s.y === p.y) ||
    obstacles.some(o => o.x === p.x && o.y === p.y) ||
    foods.some(f => f.x === p.x && f.y === p.y);
}

function randomFreePos(snake: Pos[], obstacles: Obstacle[], foods: Food[]): Pos {
  let p: Pos;
  let tries = 0;
  do {
    p = { x: rng(1, GRID - 2), y: rng(1, GRID - 2) };
    tries++;
  } while (posOccupied(p, snake, obstacles, foods) && tries < 500);
  return p;
}

function spawnFood(type: FoodType, snake: Pos[], obstacles: Obstacle[], foods: Food[]): Food {
  const p = randomFreePos(snake, obstacles, foods);
  return {
    ...p, type, age: 0, pulsePhase: Math.random() * Math.PI * 2,
    ...(type === "boss" ? { vx: (Math.random() > 0.5 ? 1 : -1) * 0.02, vy: (Math.random() > 0.5 ? 1 : -1) * 0.02, size: 2 } : {}),
  };
}

function generateObstacles(level: number, diffObstacles: number, snake: Pos[], existingObs: Obstacle[]): Obstacle[] {
  const count = diffObstacles + Math.floor(level / 2) * 2;
  const obs: Obstacle[] = [...existingObs];
  const patterns = [
    (cx: number, cy: number) => Array.from({ length: 3 }, (_, i) => ({ x: cx + i - 1, y: cy })),
    (cx: number, cy: number) => Array.from({ length: 3 }, (_, i) => ({ x: cx, y: cy + i - 1 })),
    (cx: number, cy: number) => [{ x: cx, y: cy }, { x: cx + 1, y: cy }, { x: cx, y: cy + 1 }],
    (cx: number, cy: number) => [{ x: cx, y: cy }, { x: cx + 2, y: cy }],
  ];
  for (let i = obs.length; i < count; i++) {
    const pattern = patterns[rng(0, patterns.length - 1)];
    const cx = rng(3, GRID - 4);
    const cy = rng(3, GRID - 4);
    const newObs = pattern(cx, cy).filter(
      o => o.x > 0 && o.x < GRID - 1 && o.y > 0 && o.y < GRID - 1 &&
        !snake.some(s => Math.abs(s.x - o.x) < 3 && Math.abs(s.y - o.y) < 3) &&
        !obs.some(e => e.x === o.x && e.y === o.y)
    );
    obs.push(...newObs);
  }
  return obs;
}


// ─── Component ───────────────────────────────────────────────────────────────
export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gameRef = useRef<GameState>(null!);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [diffIdx, setDiffIdx] = useState(0);
  const [best, setBest] = useState<number[]>([0, 0, 0, 0]);
  const [activePowers, setActivePowers] = useState<string[]>([]);
  const [shieldCount, setShieldCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // PixiJS refs
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);
  const frameRef = useRef(0);

  // ─── Init audio ──────────────────────────────────────────────────────────
  useEffect(() => {
    const initAudio = () => {
      if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
      window.removeEventListener("click", initAudio);
      window.removeEventListener("touchstart", initAudio);
    };
    window.addEventListener("click", initAudio);
    window.addEventListener("touchstart", initAudio);
    return () => { window.removeEventListener("click", initAudio); window.removeEventListener("touchstart", initAudio); };
  }, []);

  // ─── Load best scores ───────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("snake_best_v2");
      if (saved) setBest(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveBest = useCallback((scores: number[]) => {
    setBest(scores);
    try { localStorage.setItem("snake_best_v2", JSON.stringify(scores)); } catch { /* ignore */ }
  }, []);

  // ─── Create initial game state ──────────────────────────────────────────
  const createGameState = useCallback((diff: number): GameState => {
    const snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
    const foods: Food[] = [spawnFood("normal", snake, [], [])];
    return {
      snake, dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
      foods, obstacles: [], score: 0, level: 1, running: true, gameOver: false, started: true,
      powerUps: [], shieldHits: 0, tickCount: 0,
      moveProgress: 0, lastMoveTime: performance.now(),
      trail: [], particles: [], flashAlpha: 0, flashColor: "#fff",
      deathSegments: [], deathTime: 0,
      displayScore: 0, scorePopups: [],
      bossTimer: 0,
      baseSpeed: DIFFS[diff].speed,
      currentSpeed: DIFFS[diff].speed,
    };
  }, []);

  // ─── Submit score ────────────────────────────────────────────────────────
  const submitScore = useCallback(async (finalScore: number) => {
    if (submitted || finalScore <= 0) return;
    setSubmitted(true);
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: "snake", score: finalScore }),
      });
    } catch { /* ignore */ }
  }, [submitted]);

  // ─── Spawn food logic ───────────────────────────────────────────────────
  const maybeSpawnFood = useCallback((g: GameState) => {
    if (!g.foods.some(f => f.type === "normal")) {
      g.foods.push(spawnFood("normal", g.snake, g.obstacles, g.foods));
    }
    if (g.tickCount % 30 === 0 && g.foods.length < 4) {
      const r = Math.random();
      if (r < 0.08) g.foods.push(spawnFood("golden", g.snake, g.obstacles, g.foods));
      else if (r < 0.15) g.foods.push(spawnFood("speed", g.snake, g.obstacles, g.foods));
      else if (r < 0.22) g.foods.push(spawnFood("shield", g.snake, g.obstacles, g.foods));
      else if (r < 0.28) g.foods.push(spawnFood("ghost", g.snake, g.obstacles, g.foods));
      else if (r < 0.34) g.foods.push(spawnFood("magnet", g.snake, g.obstacles, g.foods));
    }
    g.bossTimer++;
    if (g.bossTimer >= 200 && !g.foods.some(f => f.type === "boss")) {
      g.foods.push(spawnFood("boss", g.snake, g.obstacles, g.foods));
      g.bossTimer = 0;
    }
  }, []);

  // ─── Spawn particles ────────────────────────────────────────────────────
  const spawnParticles = useCallback((g: GameState, x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 1 + Math.random() * 3;
      g.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
        size: 1.5 + Math.random() * 2,
      });
    }
  }, []);

  // ─── Game tick ───────────────────────────────────────────────────────────
  const gameTick = useCallback((g: GameState) => {
    if (!g.running || g.gameOver) return;

    g.tickCount++;
    g.dir = g.nextDir;

    const head = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };

    const hitWall = head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID;
    const hitObstacle = g.obstacles.some(o => o.x === head.x && o.y === head.y);
    const hasGhost = g.powerUps.some(p => p.type === "ghost");
    const hitSelf = !hasGhost && g.snake.slice(1).some(s => s.x === head.x && s.y === head.y);

    if (hitWall || hitObstacle) {
      if (g.shieldHits > 0) {
        g.shieldHits--;
        setShieldCount(g.shieldHits);
        g.flashAlpha = 0.4;
        g.flashColor = "#8855ff";
        return;
      }
      g.running = false;
      g.gameOver = true;
      playDeath(audioCtxRef.current);
      const cellPx = CANVAS_SIZE / GRID;
      g.deathSegments = g.snake.map((s, i) => ({
        x: s.x * cellPx + cellPx / 2, y: s.y * cellPx + cellPx / 2,
        vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8 - 3,
        rot: 0, rotV: (Math.random() - 0.5) * 0.3,
        alpha: 1, color: i === 0 ? "#3ea6ff" : ACCENT, size: cellPx * 0.8,
      }));
      g.deathTime = performance.now();
      setOver(true);
      const newBest = [...best];
      newBest[diffIdx] = Math.max(newBest[diffIdx], g.score);
      saveBest(newBest);
      submitScore(g.score);
      return;
    }

    if (hitSelf) {
      g.running = false;
      g.gameOver = true;
      playDeath(audioCtxRef.current);
      const cellPx = CANVAS_SIZE / GRID;
      g.deathSegments = g.snake.map((s, i) => ({
        x: s.x * cellPx + cellPx / 2, y: s.y * cellPx + cellPx / 2,
        vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8 - 3,
        rot: 0, rotV: (Math.random() - 0.5) * 0.3,
        alpha: 1, color: i === 0 ? "#3ea6ff" : ACCENT, size: cellPx * 0.8,
      }));
      g.deathTime = performance.now();
      setOver(true);
      const newBest = [...best];
      newBest[diffIdx] = Math.max(newBest[diffIdx], g.score);
      saveBest(newBest);
      submitScore(g.score);
      return;
    }

    g.trail.unshift({ x: g.snake[0].x, y: g.snake[0].y, alpha: 1 });
    if (g.trail.length > 30) g.trail.pop();

    g.snake.unshift(head);

    // Magnet: attract food
    if (g.powerUps.some(p => p.type === "magnet")) {
      g.foods.forEach(f => {
        if (f.type === "boss") return;
        const dx = head.x - f.x;
        const dy = head.y - f.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 6 && dist > 1) {
          f.x += Math.sign(dx);
          f.y += Math.sign(dy);
        }
      });
    }

    // Check food collision
    let ate = false;
    const cellPx = CANVAS_SIZE / GRID;
    for (let i = g.foods.length - 1; i >= 0; i--) {
      const f = g.foods[i];
      const hitFood = f.type === "boss"
        ? Math.abs(head.x - f.x) <= 1 && Math.abs(head.y - f.y) <= 1
        : head.x === f.x && head.y === f.y;
      if (hitFood) {
        const cfg = FOOD_CONFIG[f.type];
        g.score += cfg.points;
        setScore(g.score);
        g.scorePopups.push({ x: f.x * cellPx + cellPx / 2, y: f.y * cellPx, value: cfg.points, life: 40 });

        spawnParticles(g, f.x * cellPx + cellPx / 2, f.y * cellPx + cellPx / 2, cfg.color, f.type === "boss" ? 30 : 12);

        if (f.type === "speed") {
          g.powerUps = g.powerUps.filter(p => p.type !== "speed");
          g.powerUps.push({ type: "speed", remaining: 60 });
          g.currentSpeed = Math.max(30, g.baseSpeed * 0.6);
          g.flashAlpha = 0.3; g.flashColor = "#00ccff";
          playPowerUp(audioCtxRef.current);
        } else if (f.type === "shield") {
          g.shieldHits += 1;
          setShieldCount(g.shieldHits);
          g.flashAlpha = 0.3; g.flashColor = "#8855ff";
          playPowerUp(audioCtxRef.current);
        } else if (f.type === "ghost") {
          g.powerUps = g.powerUps.filter(p => p.type !== "ghost");
          g.powerUps.push({ type: "ghost", remaining: 80 });
          g.flashAlpha = 0.3; g.flashColor = "#ff88ff";
          playPowerUp(audioCtxRef.current);
        } else if (f.type === "magnet") {
          g.powerUps = g.powerUps.filter(p => p.type !== "magnet");
          g.powerUps.push({ type: "magnet", remaining: 100 });
          g.flashAlpha = 0.3; g.flashColor = "#ff8800";
          playPowerUp(audioCtxRef.current);
        } else {
          playEat(audioCtxRef.current);
        }

        g.foods.splice(i, 1);
        ate = true;

        const newLevel = Math.floor(g.score / 100) + 1;
        if (newLevel > g.level) {
          g.level = newLevel;
          setLevel(newLevel);
          playLevelUp(audioCtxRef.current);
          g.flashAlpha = 0.5; g.flashColor = "#ffd700";
          if (g.score >= 50) {
            g.obstacles = generateObstacles(g.level, DIFFS[diffIdx].obstacles, g.snake, g.obstacles);
          }
        }
        break;
      }
    }

    if (!ate) g.snake.pop();

    // Tick power-ups
    g.powerUps.forEach(p => p.remaining--);
    const hadSpeed = g.powerUps.some(p => p.type === "speed");
    g.powerUps = g.powerUps.filter(p => p.remaining > 0);
    if (hadSpeed && !g.powerUps.some(p => p.type === "speed")) {
      g.currentSpeed = g.baseSpeed;
    }
    setActivePowers(g.powerUps.map(p => p.type));

    // Move boss food
    g.foods.forEach(f => {
      if (f.type === "boss" && f.vx !== undefined && f.vy !== undefined) {
        f.x += f.vx;
        f.y += f.vy;
        if (f.x <= 1 || f.x >= GRID - 2) f.vx = -(f.vx!);
        if (f.y <= 1 || f.y >= GRID - 2) f.vy = -(f.vy!);
      }
      f.age++;
    });

    g.foods = g.foods.filter(f => f.type === "normal" || f.type === "boss" || f.age < 300);

    maybeSpawnFood(g);

    if (g.score > 0 && g.score % 50 === 0 && g.tickCount % 10 === 0) {
      const p = randomFreePos(g.snake, g.obstacles, g.foods);
      if (!g.obstacles.some(o => o.x === p.x && o.y === p.y)) {
        g.obstacles.push(p);
      }
    }

    g.moveProgress = 0;
    g.lastMoveTime = performance.now();
  }, [diffIdx, best, saveBest, submitScore, spawnParticles, maybeSpawnFood]);

  // ─── PixiJS Render Loop ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: CANVAS_SIZE, height: CANVAS_SIZE, backgroundColor: 0x0a0a0a, antialias: true });
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
          fontFamily: "monospace",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (70 objects)
      for (let i = 0; i < 70; i++) makeText(`t${i}`, { fontSize: 12 });

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => {
        if (textIdx >= 70) return;
        const t = texts.get(`t${textIdx}`)!;
        textIdx++;
        t.text = text;
        t.x = x; t.y = y;
        t.anchor.set(opts?.ax ?? 0, opts?.ay ?? 0);
        t.alpha = opts?.alpha ?? 1;
        t.style.fill = opts?.fill ?? "#ffffff";
        t.style.fontSize = opts?.fontSize ?? 12;
        t.style.fontWeight = (opts?.fontWeight ?? "normal") as "normal" | "bold";
        t.visible = true;
      };

      const cn = hexToNum;
      const W = CANVAS_SIZE;
      const cellPx = W / GRID;

      app.ticker.add(() => {
        if (destroyed) return;
        frameRef.current++;
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        const gs = gameRef.current;
        const time = performance.now();

        if (!gs || !gs.started) {
          // ── Initial title screen ──
          // Grid lines
          for (let i = 0; i <= GRID; i++) {
            g.rect(i * cellPx, 0, 0.5, W).fill({ color: cn(ACCENT), alpha: 0.04 });
            g.rect(0, i * cellPx, W, 0.5).fill({ color: cn(ACCENT), alpha: 0.04 });
          }
          showText("S 贪吃蛇", W / 2, W / 2 - 10, { fill: ACCENT, fontSize: 24, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText("选择难度，点击开始", W / 2, W / 2 + 16, { fill: "#666666", fontSize: 12, ax: 0.5, ay: 0.5 });
          return;
        }

        // ── Interpolation progress ──
        const elapsed = time - gs.lastMoveTime;
        const progress = Math.min(elapsed / gs.currentSpeed, 1);

        // ── Game logic tick ──
        if (gs.running) {
          if (elapsed >= gs.currentSpeed) {
            gameTick(gs);
          }
        }

        // ── Background grid with pulse ──
        const gridPulse = 0.03 + Math.sin(time * 0.001) * 0.015;
        for (let i = 0; i <= GRID; i++) {
          g.rect(i * cellPx, 0, 0.5, W).fill({ color: cn(ACCENT), alpha: gridPulse });
          g.rect(0, i * cellPx, W, 0.5).fill({ color: cn(ACCENT), alpha: gridPulse });
        }

        // ── Obstacles ──
        gs.obstacles.forEach(o => {
          const pulse = 0.6 + Math.sin(time * 0.003 + o.x + o.y) * 0.15;
          g.rect(o.x * cellPx + 1, o.y * cellPx + 1, cellPx - 2, cellPx - 2).fill({ color: 0x642828, alpha: pulse });
          // X mark lines
          const cx = o.x * cellPx + cellPx / 2;
          const cy = o.y * cellPx + cellPx / 2;
          const s = cellPx * 0.25;
          g.moveTo(cx - s, cy - s).lineTo(cx + s, cy + s).stroke({ color: 0xff5050, alpha: pulse * 0.7, width: 1.5 });
          g.moveTo(cx + s, cy - s).lineTo(cx - s, cy + s).stroke({ color: 0xff5050, alpha: pulse * 0.7, width: 1.5 });
        });

        // ── Trail ──
        gs.trail.forEach(t => {
          t.alpha -= 0.035;
          if (t.alpha <= 0) return;
          const a = t.alpha * 0.4;
          g.circle(t.x * cellPx + cellPx / 2, t.y * cellPx + cellPx / 2, cellPx * 0.3 * t.alpha).fill({ color: cn(ACCENT), alpha: a });
        });
        gs.trail = gs.trail.filter(t => t.alpha > 0);

        // ── Snake body ──
        const isGhost = gs.powerUps.some(p => p.type === "ghost");
        const isMagnet = gs.powerUps.some(p => p.type === "magnet");

        gs.snake.forEach((seg, i) => {
          let drawX = seg.x * cellPx;
          let drawY = seg.y * cellPx;

          // Interpolate head position
          if (i === 0 && gs.running) {
            const prevX = (seg.x - gs.dir.x) * cellPx;
            const prevY = (seg.y - gs.dir.y) * cellPx;
            drawX = prevX + (drawX - prevX) * progress;
            drawY = prevY + (drawY - prevY) * progress;
          }

          const ratio = 1 - (i / gs.snake.length) * 0.6;
          const segSize = cellPx * (0.85 - i * 0.003);
          const offset = (cellPx - segSize) / 2;
          const alpha = isGhost ? 0.5 + Math.sin(time * 0.01 + i * 0.3) * 0.2 : ratio;

          if (i === 0) {
            // Head - rounded rect
            const r = segSize * 0.3;
            const hx = drawX + offset;
            const hy = drawY + offset;
            g.roundRect(hx, hy, segSize, segSize, r).fill({ color: 0x3ea6ff, alpha });

            // Eyes
            const hcx = drawX + cellPx / 2;
            const hcy = drawY + cellPx / 2;
            const eyeSize = cellPx * 0.15;
            const pupilSize = cellPx * 0.08;
            let ex1: number, ey1: number, ex2: number, ey2: number;

            if (gs.dir.x === 1) { ex1 = hcx + cellPx * 0.15; ey1 = hcy - cellPx * 0.18; ex2 = hcx + cellPx * 0.15; ey2 = hcy + cellPx * 0.18; }
            else if (gs.dir.x === -1) { ex1 = hcx - cellPx * 0.15; ey1 = hcy - cellPx * 0.18; ex2 = hcx - cellPx * 0.15; ey2 = hcy + cellPx * 0.18; }
            else if (gs.dir.y === -1) { ex1 = hcx - cellPx * 0.18; ey1 = hcy - cellPx * 0.15; ex2 = hcx + cellPx * 0.18; ey2 = hcy - cellPx * 0.15; }
            else { ex1 = hcx - cellPx * 0.18; ey1 = hcy + cellPx * 0.15; ex2 = hcx + cellPx * 0.18; ey2 = hcy + cellPx * 0.15; }

            // White of eye
            g.circle(ex1, ey1, eyeSize).fill({ color: 0xffffff });
            g.circle(ex2, ey2, eyeSize).fill({ color: 0xffffff });
            // Pupil
            g.circle(ex1 + gs.dir.x * 1.5, ey1 + gs.dir.y * 1.5, pupilSize).fill({ color: 0x111111 });
            g.circle(ex2 + gs.dir.x * 1.5, ey2 + gs.dir.y * 1.5, pupilSize).fill({ color: 0x111111 });
          } else {
            // Body segment
            const r = Math.max(1, segSize * 0.2);
            const bx = seg.x * cellPx + offset;
            const by = seg.y * cellPx + offset;
            const green = Math.floor(166 * ratio);
            const red = Math.floor(43 * ratio);
            const blue = Math.floor(64 * ratio);
            let bodyColor: number;
            if (isGhost) {
              bodyColor = 0xb478ff;
            } else if (isMagnet) {
              bodyColor = (0xff << 16) | (Math.floor(100 + green * 0.5) << 8) | 0;
            } else {
              bodyColor = (red << 16) | (green << 8) | blue;
            }
            g.roundRect(bx, by, segSize, segSize, r).fill({ color: bodyColor, alpha });
          }
        });

        // Shield indicator on head
        if (gs.shieldHits > 0) {
          const hx = gs.snake[0].x * cellPx + cellPx / 2;
          const hy = gs.snake[0].y * cellPx + cellPx / 2;
          const shieldAlpha = 0.5 + Math.sin(time * 0.005) * 0.3;
          g.circle(hx, hy, cellPx * 0.7).stroke({ color: 0x8855ff, alpha: shieldAlpha, width: 2 });
        }

        // ── Food items ──
        gs.foods.forEach(f => {
          const cfg = FOOD_CONFIG[f.type];
          const pulse = 1 + Math.sin(time * 0.005 + f.pulsePhase) * 0.15;

          if (f.type === "boss") {
            const bossSize = cellPx * 1.5 * pulse;
            const fx = f.x * cellPx + cellPx;
            const fy = f.y * cellPx + cellPx;
            g.circle(fx, fy, bossSize / 2).fill({ color: cn(cfg.color) });
            showText(cfg.emoji, fx, fy, { fontSize: cellPx * 0.8, ax: 0.5, ay: 0.5 });
          } else {
            const fx = f.x * cellPx + cellPx / 2;
            const fy = f.y * cellPx + cellPx / 2;
            // Main food circle
            g.circle(fx, fy, cellPx * 0.35 * pulse).fill({ color: cn(cfg.color) });
            // Inner highlight
            g.circle(fx - cellPx * 0.08, fy - cellPx * 0.08, cellPx * 0.12 * pulse).fill({ color: 0xffffff, alpha: 0.3 });
            // Emoji overlay for special food
            if (f.type !== "normal") {
              showText(cfg.emoji, fx, fy + 1, { fontSize: cellPx * 0.55, ax: 0.5, ay: 0.5 });
            }
          }
        });

        // ── Particles ──
        gs.particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.05;
          p.life--;
          const a = Math.max(0, p.life / p.maxLife);
          g.circle(p.x, p.y, p.size * a).fill({ color: cn(p.color), alpha: a });
        });
        gs.particles = gs.particles.filter(p => p.life > 0);

        // ── Score popups ──
        gs.scorePopups.forEach(sp => {
          sp.y -= 0.8;
          sp.life--;
          const a = sp.life / 40;
          showText(`+${sp.value}`, sp.x, sp.y, { fill: "#ffd700", fontSize: 14 + (1 - a) * 4, fontWeight: "bold", ax: 0.5, ay: 0.5, alpha: a });
        });
        gs.scorePopups = gs.scorePopups.filter(sp => sp.life > 0);

        // ── Death animation ──
        if (gs.gameOver && gs.deathSegments.length > 0) {
          gs.deathSegments.forEach(ds => {
            ds.x += ds.vx;
            ds.y += ds.vy;
            ds.vy += 0.15;
            ds.rot += ds.rotV;
            ds.alpha = Math.max(0, ds.alpha - 0.008);
            g.rect(ds.x - ds.size / 2, ds.y - ds.size / 2, ds.size, ds.size).fill({ color: cn(ds.color), alpha: ds.alpha });
          });
        }

        // ── Screen flash ──
        if (gs.flashAlpha > 0) {
          g.rect(0, 0, W, W).fill({ color: cn(gs.flashColor), alpha: gs.flashAlpha });
          gs.flashAlpha -= 0.02;
        }

        // ── Animated score display ──
        if (gs.displayScore < gs.score) {
          gs.displayScore += Math.ceil((gs.score - gs.displayScore) * 0.2);
          if (gs.score - gs.displayScore < 2) gs.displayScore = gs.score;
        }

        // ── Level indicator ──
        showText(`LV.${gs.level}`, 4, 4, { fill: "#ffffff", fontSize: 10, fontWeight: "bold", alpha: 0.08 });

        // ── Paused overlay ──
        if (!gs.running && !gs.gameOver && gs.started) {
          g.rect(0, 0, W, W).fill({ color: 0x000000, alpha: 0.6 });
          showText("暂停", W / 2, W / 2, { fill: "#ffffff", fontSize: 20, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText("按空格继续", W / 2, W / 2 + 24, { fill: "#888888", fontSize: 12, ax: 0.5, ay: 0.5 });
        }
      });
    }

    initPixi();

    return () => {
      destroyed = true;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      pixiGfxRef.current = null;
      pixiTextsRef.current.clear();
      pixiInitRef.current = false;
    };
  }, [gameTick]);

  // ─── Start game ────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const g = createGameState(diffIdx);
    gameRef.current = g;
    setScore(0);
    setLevel(1);
    setOver(false);
    setStarted(true);
    setPaused(false);
    setActivePowers([]);
    setShieldCount(0);
    setSubmitted(false);

    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
  }, [diffIdx, createGameState]);

  // ─── Toggle pause ──────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.gameOver || !g.started) return;
    g.running = !g.running;
    if (g.running) g.lastMoveTime = performance.now();
    setPaused(!g.running);
  }, []);

  // ─── Keyboard input ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || !g.started) return;

      if (e.key === " " || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }

      if (!g.running) return;

      const map: Record<string, Pos> = {
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
        a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
        W: { x: 0, y: -1 }, S: { x: 0, y: 1 },
        A: { x: -1, y: 0 }, D: { x: 1, y: 0 },
      };
      const d = map[e.key];
      if (d && !(d.x === -g.dir.x && d.y === -g.dir.y)) {
        g.nextDir = d;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePause]);

  // ─── Touch / swipe ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 20) return;

      const g = gameRef.current;
      if (!g || !g.running) return;

      let newDir: Pos;
      if (absDx > absDy) {
        newDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
      } else {
        newDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
      }
      if (!(newDir.x === -g.dir.x && newDir.y === -g.dir.y)) {
        g.nextDir = newDir;
      }
      touchStartRef.current = null;
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // ─── D-pad handler ─────────────────────────────────────────────────────
  const handleDir = useCallback((dx: number, dy: number) => {
    const g = gameRef.current;
    if (!g || !g.running) return;
    if (!(dx === -g.dir.x && dy === -g.dir.y)) {
      g.nextDir = { x: dx, y: dy };
    }
  }, []);

  // ─── Save / Load ──────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const g = gameRef.current;
    if (!g) return null;
    return {
      snake: g.snake, dir: g.dir, foods: g.foods, obstacles: g.obstacles,
      score: g.score, level: g.level, powerUps: g.powerUps, shieldHits: g.shieldHits,
      tickCount: g.tickCount, diffIdx, bossTimer: g.bossTimer,
    };
  }, [diffIdx]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as {
      snake: Pos[]; dir: Pos; foods: Food[]; obstacles: Obstacle[];
      score: number; level: number; powerUps: PowerUp[]; shieldHits: number;
      tickCount: number; diffIdx: number; bossTimer: number;
    };
    const g = createGameState(d.diffIdx);
    Object.assign(g, {
      snake: d.snake, dir: d.dir, nextDir: d.dir, foods: d.foods,
      obstacles: d.obstacles, score: d.score, level: d.level,
      powerUps: d.powerUps, shieldHits: d.shieldHits,
      tickCount: d.tickCount, bossTimer: d.bossTimer,
      displayScore: d.score,
    });
    gameRef.current = g;
    setScore(d.score);
    setLevel(d.level);
    setDiffIdx(d.diffIdx);
    setOver(false);
    setStarted(true);
    setPaused(false);
    setActivePowers(d.powerUps.map(p => p.type));
    setShieldCount(d.shieldHits);
    setSubmitted(false);
  }, [createGameState]);

  // ─── Power-up labels ──────────────────────────────────────────────────
  const powerLabels: Record<string, { icon: string; label: string; color: string }> = {
    speed: { icon: "?", label: "加速", color: "#00ccff" },
    shield: { icon: "?", label: "护盾", color: "#8855ff" },
    ghost: { icon: "?", label: "穿透", color: "#ff88ff" },
    magnet: { icon: "?", label: "磁铁", color: "#ff8800" },
  };


  // ─── JSX ───────────────────────────────────────────────────────────────
  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-24 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block float-left">
          ← 返回
        </Link>
        <div className="clear-both" />

        <h1 className="text-2xl font-bold mb-2">
          <span className="mr-2">S</span>
          <span style={{ color: ACCENT }}>贪吃蛇</span>
          <span className="text-xs text-[#666] ml-2 font-normal">Premium</span>
        </h1>

        {/* Difficulty */}
        <div className="flex justify-center gap-2 mb-2">
          {DIFFS.map((d, i) => (
            <button
              key={i}
              onClick={() => { if (!started || over) setDiffIdx(i); }}
              className="px-3 py-1 rounded-full text-[12px] border transition"
              style={{
                borderColor: diffIdx === i ? d.color : "#333",
                color: diffIdx === i ? d.color : "#666",
                backgroundColor: diffIdx === i ? `${d.color}15` : "transparent",
                fontWeight: diffIdx === i ? 700 : 400,
                opacity: started && !over ? 0.5 : 1,
                cursor: started && !over ? "not-allowed" : "pointer",
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Score bar */}
        <div className="flex justify-center items-center gap-4 text-sm mb-2">
          <span className="text-[#3ea6ff] font-bold tabular-nums">
            得分：{score}
          </span>
          <span className="text-[#666] text-xs">LV.{level}</span>
          <span className="text-[#8a8a8a] text-xs">最高：{best[diffIdx]}</span>
        </div>

        {/* Active power-ups */}
        {activePowers.length > 0 && (
          <div className="flex justify-center gap-2 mb-2">
            {activePowers.map((p, i) => {
              const info = powerLabels[p];
              return info ? (
                <span
                  key={`${p}-${i}`}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse"
                  style={{ backgroundColor: `${info.color}25`, color: info.color, border: `1px solid ${info.color}40` }}
                >
                  {info.icon} {info.label}
                </span>
              ) : null;
            })}
            {shieldCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: "#8855ff25", color: "#8855ff", border: "1px solid #8855ff40" }}>
                ? ×{shieldCount}
              </span>
            )}
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="mx-auto rounded-xl border border-[#333] touch-none"
          style={{ maxWidth: "100%", width: CANVAS_SIZE, height: CANVAS_SIZE, imageRendering: "auto" }}
        />

        {/* Controls */}
        {!started && (
          <button
            onClick={startGame}
            className="mt-4 px-8 py-2.5 rounded-xl text-white font-bold text-sm transition active:scale-95"
            style={{ backgroundColor: ACCENT }}
          >
            开始游戏
          </button>
        )}

        {started && !over && (
          <button
            onClick={togglePause}
            className="mt-2 px-5 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white transition"
          >
            {paused ? "▶ 继续" : "⏸ 暂停"}
          </button>
        )}

        {over && (
          <div className="mt-4">
            <p className="text-[#ff4444] font-bold mb-1">游戏结束！</p>
            <p className="text-[#ffd700] text-lg font-bold mb-2 tabular-nums">得分：{score}</p>
            <button
              onClick={startGame}
              className="px-6 py-2 rounded-xl text-white font-bold text-sm transition active:scale-95"
              style={{ backgroundColor: ACCENT }}
            >
              再来一局
            </button>
          </div>
        )}

        {/* Mobile D-pad */}
        <div className="mt-3 md:hidden">
          <div className="flex justify-center mb-1">
            <button
              onTouchStart={(e) => { e.preventDefault(); handleDir(0, -1); }}
              onClick={() => handleDir(0, -1)}
              className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#2ba640]/20 transition select-none"
            >
              ↑
            </button>
          </div>
          <div className="flex justify-center gap-1">
            <button
              onTouchStart={(e) => { e.preventDefault(); handleDir(-1, 0); }}
              onClick={() => handleDir(-1, 0)}
              className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#2ba640]/20 transition select-none"
            >
              ←
            </button>
            <button
              onTouchStart={(e) => { e.preventDefault(); handleDir(0, 1); }}
              onClick={() => handleDir(0, 1)}
              className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#2ba640]/20 transition select-none"
            >
              ↓
            </button>
            <button
              onTouchStart={(e) => { e.preventDefault(); handleDir(1, 0); }}
              onClick={() => handleDir(1, 0)}
              className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#2ba640]/20 transition select-none"
            >
              →
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-[#666]">
          <span>a +10</span>
          <span>* +30</span>
          <span>? +50</span>
          <span>? 加速</span>
          <span>? 护盾</span>
          <span>? 穿透</span>
          <span>? 磁铁</span>
        </div>
        <p className="text-[10px] text-[#555] mt-1">方向键/WASD控制 · 空格暂停 · 滑动操作</p>

        {/* Leaderboard + Save/Load */}
        <div className="mt-6 space-y-4 text-left">
          <GameLeaderboard gameId="snake" />
          <GameSaveLoad gameId="snake" onSave={handleSave} onLoad={handleLoad} />
        </div>
      </main>
    </>
  );
}
