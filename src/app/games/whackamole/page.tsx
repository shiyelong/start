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
import { easeOutBack, lerp, updateShake, applyShake, updateScorePopups, renderScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { resizeCanvas, drawGradientBackground, drawText, drawGlow, drawRoundedRect } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
interface Mole {
  active: boolean;
  showTime: number;    // time remaining visible (seconds)
  hitAnim: number;     // hit animation progress 0→1
  popAnim: number;     // pop-up animation progress 0→1
  missAnim: number;    // miss/retreat animation progress 0→1
}

interface GameState {
  score: number;
  over: boolean;
  playing: boolean;
  timeLeft: number;       // seconds remaining
  combo: number;          // consecutive hits
  maxCombo: number;
  totalWhacks: number;
  totalMisses: number;
  moles: Mole[];
  spawnTimer: number;     // time until next mole spawn
  spawnInterval: number;  // current spawn interval (decreases with time)
  moleVisibleTime: number; // how long moles stay visible (decreases)
  difficulty: number;     // 0→1 ramps up over game duration
  hammerX: number;
  hammerY: number;
  hammerAnim: number;     // hammer strike animation 0→1
  paused: boolean;
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "whackamole";
const GRID_ROWS = 3;
const GRID_COLS = 3;
const GAME_DURATION = 30;
const INITIAL_SPAWN_INTERVAL = 1.2;
const MIN_SPAWN_INTERVAL = 0.4;
const INITIAL_VISIBLE_TIME = 1.2;
const MIN_VISIBLE_TIME = 0.5;
const HOLE_COLORS = { bg: "#3a2a1a", rim: "#5a4a3a", inner: "#2a1a0a" };
const MOLE_COLORS = { body: "#8B6914", nose: "#ff6b6b", eye: "#1a1a1a", cheek: "#ffaa88" };

// ─── Game Logic (Pure Functions) ─────────────────────────
function createMole(): Mole {
  return { active: false, showTime: 0, hitAnim: 0, popAnim: 0, missAnim: 0 };
}

function initGameState(): GameState {
  const moles: Mole[] = [];
  for (let i = 0; i < GRID_ROWS * GRID_COLS; i++) moles.push(createMole());
  return {
    score: 0, over: false, playing: false,
    timeLeft: GAME_DURATION, combo: 0, maxCombo: 0,
    totalWhacks: 0, totalMisses: 0,
    moles, spawnTimer: 0.5,
    spawnInterval: INITIAL_SPAWN_INTERVAL,
    moleVisibleTime: INITIAL_VISIBLE_TIME,
    difficulty: 0, hammerX: 0, hammerY: 0, hammerAnim: 0,
    paused: false,
  };
}

function getComboBonus(combo: number): number {
  if (combo >= 10) return 5;
  if (combo >= 7) return 4;
  if (combo >= 5) return 3;
  if (combo >= 3) return 2;
  return 1;
}

function updateDifficulty(game: GameState): void {
  const elapsed = GAME_DURATION - game.timeLeft;
  game.difficulty = Math.min(1, elapsed / GAME_DURATION);
  game.spawnInterval = INITIAL_SPAWN_INTERVAL - (INITIAL_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * game.difficulty;
  game.moleVisibleTime = INITIAL_VISIBLE_TIME - (INITIAL_VISIBLE_TIME - MIN_VISIBLE_TIME) * game.difficulty;
}

function spawnMole(game: GameState): void {
  const inactive: number[] = [];
  for (let i = 0; i < game.moles.length; i++) {
    if (!game.moles[i].active && game.moles[i].hitAnim <= 0 && game.moles[i].missAnim <= 0) {
      inactive.push(i);
    }
  }
  if (inactive.length === 0) return;
  const idx = inactive[Math.floor(Math.random() * inactive.length)];
  const mole = game.moles[idx];
  mole.active = true;
  mole.showTime = game.moleVisibleTime;
  mole.hitAnim = 0;
  mole.popAnim = 0;
  mole.missAnim = 0;
}

function whackMole(game: GameState, index: number): { hit: boolean; points: number } {
  if (index < 0 || index >= game.moles.length) return { hit: false, points: 0 };
  const mole = game.moles[index];
  if (!mole.active) return { hit: false, points: 0 };
  mole.active = false;
  mole.hitAnim = 1;
  mole.showTime = 0;
  game.combo++;
  if (game.combo > game.maxCombo) game.maxCombo = game.combo;
  game.totalWhacks++;
  const bonus = getComboBonus(game.combo);
  const points = 10 * bonus;
  game.score += points;
  return { hit: true, points };
}

// ─── Renderer ────────────────────────────────────────────
function renderGame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  game: GameState, anim: AnimState,
  particles: ParticleSystem,
): void {
  ctx.save();
  applyShake(ctx, anim.shake);
  drawGradientBackground(ctx, w, h, anim.bgHue, 45);

  const padding = w * 0.06;
  const gridW = w - padding * 2;
  const gap = gridW * 0.06;
  const cellSize = (gridW - gap * (GRID_COLS - 1)) / GRID_COLS;
  const gridH = cellSize * GRID_ROWS + gap * (GRID_ROWS - 1);
  const gridX = padding;
  const gridY = (h - gridH) / 2 + h * 0.05;

  // Timer bar at top
  const barH = 6;
  const barY = 12;
  const barW = w - padding * 2;
  drawRoundedRect(ctx, padding, barY, barW, barH, 3);
  ctx.fillStyle = "#333";
  ctx.fill();
  const pct = Math.max(0, game.timeLeft / GAME_DURATION);
  const timerColor = pct > 0.3 ? "#3ea6ff" : pct > 0.1 ? "#ffcc00" : "#ff4444";
  if (pct > 0) {
    drawRoundedRect(ctx, padding, barY, barW * pct, barH, 3);
    ctx.fillStyle = timerColor;
    ctx.fill();
  }

  // Time text
  drawText(ctx, `${Math.ceil(game.timeLeft)}s`, w / 2, barY + barH + 14, w * 0.3, timerColor, 14);

  // Combo indicator
  if (game.combo >= 3 && game.playing && !game.over) {
    const comboText = `${game.combo} 连击! x${getComboBonus(game.combo)}`;
    const comboAlpha = Math.min(1, 0.5 + Math.sin(anim.time * 6) * 0.5);
    ctx.save();
    ctx.globalAlpha = comboAlpha;
    drawText(ctx, comboText, w / 2, gridY - 20, w * 0.6, "#ffd93d", 18);
    ctx.restore();
  }

  // Draw holes and moles
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const idx = r * GRID_COLS + c;
      const mole = game.moles[idx];
      const cx = gridX + c * (cellSize + gap) + cellSize / 2;
      const cy = gridY + r * (cellSize + gap) + cellSize / 2;
      const holeRadius = cellSize * 0.42;

      // Hole shadow
      ctx.beginPath();
      ctx.ellipse(cx, cy + holeRadius * 0.3, holeRadius * 1.1, holeRadius * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = HOLE_COLORS.inner;
      ctx.fill();

      // Hole rim
      ctx.beginPath();
      ctx.ellipse(cx, cy + holeRadius * 0.15, holeRadius * 1.05, holeRadius * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = HOLE_COLORS.rim;
      ctx.fill();

      // Hole opening
      ctx.beginPath();
      ctx.ellipse(cx, cy + holeRadius * 0.15, holeRadius * 0.9, holeRadius * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = HOLE_COLORS.bg;
      ctx.fill();

      // Mole pop-up animation
      let moleVisible = 0; // 0 = hidden, 1 = fully visible
      if (mole.active) {
        mole.popAnim = Math.min(1, mole.popAnim + 0.08);
        moleVisible = easeOutBack(mole.popAnim);
      } else if (mole.hitAnim > 0) {
        moleVisible = mole.hitAnim * 0.5; // shrink on hit
      } else if (mole.missAnim > 0) {
        moleVisible = mole.missAnim;
      }

      if (moleVisible > 0.01) {
        const moleSize = holeRadius * 0.7 * moleVisible;
        const moleY = cy - moleSize * 0.3 * moleVisible;

        // Glow for active mole
        if (mole.active) {
          drawGlow(ctx, cx, moleY, moleSize * 2, "#ffd93d", 0.15);
        }

        // Hit flash
        if (mole.hitAnim > 0.5) {
          ctx.save();
          ctx.globalAlpha = (mole.hitAnim - 0.5) * 2;
          drawGlow(ctx, cx, moleY, moleSize * 2.5, "#ff4444", 0.4);
          ctx.restore();
        }

        // Mole body (circle)
        ctx.beginPath();
        ctx.arc(cx, moleY, moleSize, 0, Math.PI * 2);
        ctx.fillStyle = mole.hitAnim > 0 ? "#ff6b6b" : MOLE_COLORS.body;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Eyes
        const eyeOff = moleSize * 0.3;
        const eyeSize = moleSize * 0.15;
        if (mole.hitAnim > 0) {
          // X eyes when hit
          ctx.strokeStyle = MOLE_COLORS.eye;
          ctx.lineWidth = 2;
          const xs = eyeSize * 0.7;
          ctx.beginPath();
          ctx.moveTo(cx - eyeOff - xs, moleY - eyeSize - xs);
          ctx.lineTo(cx - eyeOff + xs, moleY - eyeSize + xs);
          ctx.moveTo(cx - eyeOff + xs, moleY - eyeSize - xs);
          ctx.lineTo(cx - eyeOff - xs, moleY - eyeSize + xs);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx + eyeOff - xs, moleY - eyeSize - xs);
          ctx.lineTo(cx + eyeOff + xs, moleY - eyeSize + xs);
          ctx.moveTo(cx + eyeOff + xs, moleY - eyeSize - xs);
          ctx.lineTo(cx + eyeOff - xs, moleY - eyeSize + xs);
          ctx.stroke();
        } else {
          // Normal eyes
          ctx.beginPath();
          ctx.arc(cx - eyeOff, moleY - eyeSize, eyeSize, 0, Math.PI * 2);
          ctx.fillStyle = MOLE_COLORS.eye;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + eyeOff, moleY - eyeSize, eyeSize, 0, Math.PI * 2);
          ctx.fillStyle = MOLE_COLORS.eye;
          ctx.fill();
          // Eye highlights
          ctx.beginPath();
          ctx.arc(cx - eyeOff + eyeSize * 0.3, moleY - eyeSize - eyeSize * 0.3, eyeSize * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + eyeOff + eyeSize * 0.3, moleY - eyeSize - eyeSize * 0.3, eyeSize * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
        }

        // Nose
        ctx.beginPath();
        ctx.arc(cx, moleY + moleSize * 0.05, moleSize * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = MOLE_COLORS.nose;
        ctx.fill();

        // Cheeks
        ctx.beginPath();
        ctx.arc(cx - moleSize * 0.5, moleY + moleSize * 0.15, moleSize * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = MOLE_COLORS.cheek;
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cx + moleSize * 0.5, moleY + moleSize * 0.15, moleSize * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = MOLE_COLORS.cheek;
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // Hammer cursor effect
  if (game.hammerAnim > 0 && game.playing) {
    const hx = game.hammerX;
    const hy = game.hammerY;
    const hammerSize = w * 0.06;
    const angle = -0.3 + game.hammerAnim * 0.6;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);
    // Handle
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, 0, 4, hammerSize * 1.2);
    // Head
    drawRoundedRect(ctx, -hammerSize * 0.4, -hammerSize * 0.3, hammerSize * 0.8, hammerSize * 0.5, 3);
    ctx.fillStyle = "#666";
    ctx.fill();
    ctx.restore();
  }

  // Particles
  particles.render(ctx);

  // Score popups
  renderScorePopups(ctx, anim.scorePopups);

  // Idle / Game Over overlay
  if (!game.playing && !game.over) {
    // Start screen
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, "🔨 打地鼠", w / 2, h * 0.35, w * 0.8, "#ffd93d", 32);
    drawText(ctx, "点击开始", w / 2, h * 0.48, w * 0.6, "#3ea6ff", 22);
    drawText(ctx, "在30秒内尽可能多地打中地鼠", w / 2, h * 0.56, w * 0.8, "#888", 13);
    drawText(ctx, "连续命中获得连击加分", w / 2, h * 0.62, w * 0.8, "#888", 13);
  }

  if (game.over) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, w, h);
    const cardW = w * 0.82;
    const cardH = h * 0.42;
    const cardX = (w - cardW) / 2;
    const cardY = h * 0.25;
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fillStyle = "rgba(26,26,26,0.95)";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    drawText(ctx, "游戏结束!", w / 2, cardY + 32, cardW * 0.8, "#ffd93d", 24);
    drawText(ctx, `得分: ${game.score}`, w / 2, cardY + 68, cardW * 0.8, "#f0b90b", 28);
    drawText(ctx, `命中: ${game.totalWhacks}  失误: ${game.totalMisses}`, w / 2, cardY + 100, cardW * 0.8, "#aaa", 14);
    drawText(ctx, `最高连击: ${game.maxCombo}`, w / 2, cardY + 124, cardW * 0.8, "#ff6b6b", 16);
    const accuracy = game.totalWhacks + game.totalMisses > 0
      ? Math.round(game.totalWhacks / (game.totalWhacks + game.totalMisses) * 100) : 0;
    drawText(ctx, `命中率: ${accuracy}%`, w / 2, cardY + 148, cardW * 0.8, "#3ea6ff", 14);
    drawText(ctx, "点击再来一局", w / 2, cardY + cardH - 22, cardW * 0.8, "#888", 13);
  }

  if (game.paused && game.playing && !game.over) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, "已暂停", w / 2, h * 0.45, w * 0.6, "#fff", 28);
    drawText(ctx, "点击继续", w / 2, h * 0.53, w * 0.5, "#888", 14);
  }

  ctx.restore();
}


// ─── Component ───────────────────────────────────────────
export default function WhackAMole() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(initGameState());
  const animRef = useRef<AnimState>({
    time: 0, bgHue: 30, targetBgHue: 30,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);
  const pausedRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [muted, setMuted] = useState(false);

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

  // Get grid cell from canvas coordinates
  const getCellFromPos = useCallback((x: number, y: number): number => {
    const { w, h } = sizeRef.current;
    const padding = w * 0.06;
    const gridW = w - padding * 2;
    const gapFrac = gridW * 0.06;
    const cellSize = (gridW - gapFrac * (GRID_COLS - 1)) / GRID_COLS;
    const gridH = cellSize * GRID_ROWS + gapFrac * (GRID_ROWS - 1);
    const gridX = padding;
    const gridY = (h - gridH) / 2 + h * 0.05;

    const col = Math.floor((x - gridX) / (cellSize + gapFrac));
    const row = Math.floor((y - gridY) / (cellSize + gapFrac));
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return -1;

    // Check if within cell bounds (not in gap)
    const cellX = gridX + col * (cellSize + gapFrac);
    const cellY = gridY + row * (cellSize + gapFrac);
    if (x < cellX || x > cellX + cellSize || y < cellY || y > cellY + cellSize) return -1;

    return row * GRID_COLS + col;
  }, []);

  const startGame = useCallback(() => {
    const g = initGameState();
    g.playing = true;
    g.spawnTimer = 0.5;
    gameRef.current = g;
    scoreSubmittedRef.current = false;
    animRef.current.targetBgHue = 30;
    animRef.current.scorePopups = [];
    setScore(0);
    setGameOver(false);
    soundRef.current?.playClick();
  }, []);

  const handleTap = useCallback((x: number, y: number) => {
    const game = gameRef.current;
    const anim = animRef.current;

    game.hammerX = x;
    game.hammerY = y;
    game.hammerAnim = 1;

    if (!game.playing && !game.over) {
      startGame();
      return;
    }

    if (game.paused) {
      game.paused = false;
      pausedRef.current = false;
      lastTimeRef.current = 0;
      return;
    }

    if (game.over) {
      startGame();
      return;
    }

    if (!game.playing) return;

    const cellIdx = getCellFromPos(x, y);
    if (cellIdx < 0) {
      game.combo = 0;
      return;
    }

    const result = whackMole(game, cellIdx);
    if (result.hit) {
      // Get cell center for effects
      const { w, h } = sizeRef.current;
      const padding = w * 0.06;
      const gridW = w - padding * 2;
      const gapFrac = gridW * 0.06;
      const cellSize = (gridW - gapFrac * (GRID_COLS - 1)) / GRID_COLS;
      const gridH = cellSize * GRID_ROWS + gapFrac * (GRID_ROWS - 1);
      const gridX = padding;
      const gridY = (h - gridH) / 2 + h * 0.05;
      const col = cellIdx % GRID_COLS;
      const row = Math.floor(cellIdx / GRID_COLS);
      const cx = gridX + col * (cellSize + gapFrac) + cellSize / 2;
      const cy = gridY + row * (cellSize + gapFrac) + cellSize / 2;

      soundRef.current?.playScore(result.points);
      if (game.combo >= 3) soundRef.current?.playCombo(game.combo);
      particlesRef.current?.emitExplosion(cx, cy, "#ffd93d", 18);
      anim.shake = { time: 0.15, intensity: 4 };
      anim.scorePopups.push({ x: cx, y: cy - 30, value: result.points, life: 1, combo: game.combo >= 3 ? game.combo : 0 });
      setScore(game.score);
    } else {
      game.combo = 0;
      game.totalMisses++;
      soundRef.current?.playError();
    }
  }, [startGame, getCellFromPos]);

  // Initialize engines
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
    setMuted(soundRef.current.isMuted());
  }, []);

  // Setup canvas, input, and game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const doResize = () => {
      const { width } = resizeCanvas(canvas, parent);
      const h = Math.max(width * 1.15, 420);
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

      const game = gameRef.current;
      const anim = animRef.current;

      if (!pausedRef.current && !game.paused) {
        anim.time += dt;
        anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, dt * 3);
        updateShake(anim.shake, dt);
        particlesRef.current?.update(dt);
        updateScorePopups(anim.scorePopups, dt);

        // Hammer animation decay
        if (game.hammerAnim > 0) {
          game.hammerAnim = Math.max(0, game.hammerAnim - dt * 6);
        }

        if (game.playing && !game.over) {
          // Update timer
          game.timeLeft -= dt;
          if (game.timeLeft <= 0) {
            game.timeLeft = 0;
            game.over = true;
            game.playing = false;
            soundRef.current?.playGameOver();
            const { w, h } = sizeRef.current;
            particlesRef.current?.emitCelebration(w / 2, h / 2);
            anim.targetBgHue = 0;
            submitScore(game.score);
            setScore(game.score);
            setGameOver(true);
          } else {
            updateDifficulty(game);

            // Spawn moles
            game.spawnTimer -= dt;
            if (game.spawnTimer <= 0) {
              spawnMole(game);
              game.spawnTimer = game.spawnInterval * (0.8 + Math.random() * 0.4);
            }

            // Update moles
            for (const mole of game.moles) {
              if (mole.active) {
                mole.showTime -= dt;
                if (mole.showTime <= 0) {
                  mole.active = false;
                  mole.missAnim = 1;
                }
              }
              if (mole.hitAnim > 0) mole.hitAnim = Math.max(0, mole.hitAnim - dt * 4);
              if (mole.missAnim > 0) mole.missAnim = Math.max(0, mole.missAnim - dt * 3);
            }
          }
        }
      }

      // Render always
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
  }, [handleTap, submitScore]);

  // Auto-pause on tab switch
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        pausedRef.current = true;
        const game = gameRef.current;
        if (game.playing && !game.over) game.paused = true;
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
      score: game.score,
      over: game.over,
      timeLeft: game.timeLeft,
      combo: game.combo,
      maxCombo: game.maxCombo,
      totalWhacks: game.totalWhacks,
      totalMisses: game.totalMisses,
      difficulty: game.difficulty,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        score?: number; over?: boolean; timeLeft?: number;
        combo?: number; maxCombo?: number;
        totalWhacks?: number; totalMisses?: number; difficulty?: number;
      };
      if (!d || typeof d.score !== "number" || typeof d.timeLeft !== "number") return;
      const game = gameRef.current;
      game.score = d.score;
      game.over = d.over ?? false;
      game.timeLeft = d.timeLeft;
      game.combo = d.combo ?? 0;
      game.maxCombo = d.maxCombo ?? 0;
      game.totalWhacks = d.totalWhacks ?? 0;
      game.totalMisses = d.totalMisses ?? 0;
      game.difficulty = d.difficulty ?? 0;
      game.playing = !game.over && game.timeLeft > 0;
      scoreSubmittedRef.current = false;
      setScore(game.score);
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

        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-white">
            <i className="fas fa-hammer mr-2 text-[#f0b90b]" />
            <span className="text-[#ffd93d]">打地鼠</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">得分</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{score}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end mb-3 gap-1.5">
          <button
            onClick={() => {
              const m = soundRef.current?.toggleMute();
              setMuted(!!m);
            }}
            className="px-3 py-1.5 rounded-lg text-xs bg-[#1a1a1a] border border-[#333] text-[#8a8a8a] hover:text-white transition"
          >
            <i className={`fas ${muted ? "fa-volume-mute" : "fa-volume-up"}`} />
          </button>
          <button
            onClick={() => startGame()}
            className="px-3 py-1.5 rounded-lg text-xs bg-[#3ea6ff] text-[#0f0f0f] font-semibold hover:bg-[#65b8ff] transition"
          >
            新游戏
          </button>
        </div>

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
              onClick={() => startGame()}
              className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25"
            >
              再来一局
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          点击冒出的地鼠得分 · 连续命中获得连击加分 · 30秒限时
        </p>

        <div className="mt-4 space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
