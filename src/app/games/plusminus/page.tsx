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
import { lerp, updateShake, applyShake, updateScorePopups, renderScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { drawGradientBackground, drawText, drawGlow, drawRoundedRect } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
interface GameState {
  num: number;
  target: number;
  score: number;
  level: number;
  combo: number;
  timeLeft: number;
  maxTime: number;
  over: boolean;
  started: boolean;
  paused: boolean;
  bestCombo: number;
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  matchFlash: number;       // 0→1 flash on match
  numScale: number;         // bounce scale for current number
  targetNumScale: number;
  timerPulse: number;       // pulse when time is low
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "plusminus";
const BASE_TIME = 6;
const MIN_TIME = 2;
const TIME_DECAY = 0.3;

const ACCENT = "#f0b90b";
const DANGER = "#ef4444";
const SUCCESS = "#22c55e";
const BTN_MINUS_COLOR = "#ef4444";
const BTN_PLUS_COLOR = "#22c55e";

// ─── Game Logic (Pure Functions) ─────────────────────────
function getMaxTime(level: number): number {
  return Math.max(MIN_TIME, BASE_TIME - level * TIME_DECAY);
}

function generateTarget(level: number): number {
  const range = Math.min(5 + level * 2, 30);
  return Math.floor(Math.random() * range) - Math.floor(range / 3);
}

function initGameState(): GameState {
  const maxTime = getMaxTime(1);
  return {
    num: 0,
    target: generateTarget(1),
    score: 0,
    level: 1,
    combo: 0,
    timeLeft: maxTime,
    maxTime,
    over: false,
    started: false,
    paused: false,
    bestCombo: 0,
  };
}

function startGame(state: GameState): void {
  state.num = 0;
  state.target = generateTarget(1);
  state.score = 0;
  state.level = 1;
  state.combo = 0;
  state.maxTime = getMaxTime(1);
  state.timeLeft = state.maxTime;
  state.over = false;
  state.started = true;
  state.paused = false;
  state.bestCombo = 0;
}

function newRound(state: GameState): void {
  state.num = 0;
  state.maxTime = getMaxTime(state.level);
  state.timeLeft = state.maxTime;
  state.target = generateTarget(state.level);
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

  const cx = w / 2;

  if (!game.started && !game.over) {
    // ─── Start Screen ─────────────────────────────────
    drawText(ctx, "➕➖", cx, h * 0.25, w * 0.8, "#ffffff", 48);
    drawText(ctx, "加减消除", cx, h * 0.38, w * 0.8, ACCENT, 32);
    drawText(ctx, "← 减1 | → 加1 | 让数字等于目标！", cx, h * 0.48, w * 0.85, "#8a8a8a", 14);

    // Start button
    const btnW = 180;
    const btnH = 50;
    const btnX = cx - btnW / 2;
    const btnY = h * 0.58;
    drawRoundedRect(ctx, btnX, btnY, btnW, btnH, 14);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    drawText(ctx, "开始游戏", cx, btnY + btnH / 2, btnW * 0.8, "#0f0f0f", 20);

    // Store button bounds for click detection
    (game as unknown as Record<string, unknown>)._startBtnBounds = { x: btnX, y: btnY, w: btnW, h: btnH };
  } else if (game.over) {
    // ─── Game Over Screen ─────────────────────────────
    drawText(ctx, "游戏结束！", cx, h * 0.18, w * 0.8, "#ffffff", 28);
    drawText(ctx, `${game.score}`, cx, h * 0.32, w * 0.8, ACCENT, 56);
    drawText(ctx, "分", cx, h * 0.42, w * 0.5, "#8a8a8a", 16);
    drawText(ctx, `到达第 ${game.level} 关 · 最高连击 x${game.bestCombo}`, cx, h * 0.52, w * 0.85, "#8a8a8a", 13);

    // Restart button
    const btnW = 180;
    const btnH = 50;
    const btnX = cx - btnW / 2;
    const btnY = h * 0.60;
    drawRoundedRect(ctx, btnX, btnY, btnW, btnH, 14);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    drawText(ctx, "再来一局", cx, btnY + btnH / 2, btnW * 0.8, "#0f0f0f", 20);

    (game as unknown as Record<string, unknown>)._startBtnBounds = { x: btnX, y: btnY, w: btnW, h: btnH };
  } else {
    // ─── Playing Screen ───────────────────────────────

    // Timer bar
    const barY = 12;
    const barH = 10;
    const barW = w - 40;
    const barX = 20;
    const pct = game.maxTime > 0 ? game.timeLeft / game.maxTime : 0;

    // Bar background
    drawRoundedRect(ctx, barX, barY, barW, barH, 5);
    ctx.fillStyle = "rgba(30, 30, 30, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Bar fill
    const fillW = Math.max(0, barW * pct);
    if (fillW > 0) {
      drawRoundedRect(ctx, barX, barY, fillW, barH, 5);
      const barColor = pct > 0.3 ? ACCENT : pct > 0.15 ? "#f59e0b" : DANGER;
      ctx.fillStyle = barColor;
      ctx.fill();

      // Pulse glow when low
      if (pct <= 0.3) {
        const pulse = 0.3 + 0.3 * Math.sin(anim.timerPulse * 8);
        drawGlow(ctx, barX + fillW, barY + barH / 2, 20, DANGER, pulse);
      }
    }

    // Target label + number
    const targetY = 50;
    drawText(ctx, "目标", cx, targetY, w * 0.5, "#8a8a8a", 14);
    const targetNumY = targetY + 40;

    // Glow behind target
    drawGlow(ctx, cx, targetNumY, 50, "#f59e0b", 0.25);
    drawText(ctx, `${game.target}`, cx, targetNumY, w * 0.6, "#f59e0b", 48);

    // Current label + number
    const currentY = targetNumY + 55;
    drawText(ctx, "当前", cx, currentY, w * 0.5, "#8a8a8a", 14);
    const currentNumY = currentY + 50;

    // Match flash background
    if (anim.matchFlash > 0) {
      drawGlow(ctx, cx, currentNumY, 80, SUCCESS, anim.matchFlash * 0.5);
    }

    // Current number with scale animation
    const numColor = game.num === game.target ? SUCCESS : "#ffffff";
    const numSize = 64 * anim.numScale;
    drawText(ctx, `${game.num}`, cx, currentNumY, w * 0.6, numColor, numSize);

    // Glow when matching
    if (game.num === game.target) {
      drawGlow(ctx, cx, currentNumY, 60, SUCCESS, 0.4);
    }

    // ─── -1 / +1 Buttons ─────────────────────────────
    const btnW = 110;
    const btnH = 70;
    const btnGap = 20;
    const btnY = currentNumY + 60;
    const minusBtnX = cx - btnGap / 2 - btnW;
    const plusBtnX = cx + btnGap / 2;

    // -1 button
    drawRoundedRect(ctx, minusBtnX, btnY, btnW, btnH, 16);
    ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
    ctx.fill();
    drawRoundedRect(ctx, minusBtnX, btnY, btnW, btnH, 16);
    ctx.strokeStyle = BTN_MINUS_COLOR;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    drawText(ctx, "−1", minusBtnX + btnW / 2, btnY + btnH / 2, btnW * 0.7, BTN_MINUS_COLOR, 32);

    // +1 button
    drawRoundedRect(ctx, plusBtnX, btnY, btnW, btnH, 16);
    ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
    ctx.fill();
    drawRoundedRect(ctx, plusBtnX, btnY, btnW, btnH, 16);
    ctx.strokeStyle = BTN_PLUS_COLOR;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    drawText(ctx, "+1", plusBtnX + btnW / 2, btnY + btnH / 2, btnW * 0.7, BTN_PLUS_COLOR, 32);

    // Store button bounds
    (game as unknown as Record<string, unknown>)._minusBtnBounds = { x: minusBtnX, y: btnY, w: btnW, h: btnH };
    (game as unknown as Record<string, unknown>)._plusBtnBounds = { x: plusBtnX, y: btnY, w: btnW, h: btnH };
  }

  // Particles (always render)
  particles.render(ctx);

  // Score popups
  renderScorePopups(ctx, anim.scorePopups);

  // Pause overlay
  if (game.paused && game.started && !game.over) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, "⏸ 已暂停", cx, h / 2, w * 0.8, "#ffffff", 28);
    drawText(ctx, "点击继续", cx, h / 2 + 36, w * 0.6, "#8a8a8a", 14);
  }

  ctx.restore();
}


// ─── Hit Test Helpers ────────────────────────────────────
interface Bounds { x: number; y: number; w: number; h: number }

function hitTest(px: number, py: number, b: Bounds | undefined): boolean {
  if (!b) return false;
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

// ─── Component ───────────────────────────────────────────
export default function PlusMinusGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 270,
    targetBgHue: 270,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    matchFlash: 0,
    numScale: 1,
    targetNumScale: 1,
    timerPulse: 0,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);
  const pendingRoundRef = useRef(false);

  // React UI state (only for elements outside canvas)
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [combo, setCombo] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);

  // Initialize sound + particles
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
    gameRef.current = initGameState();
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

  // Start / restart
  const doStart = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    startGame(game);
    const anim = animRef.current;
    anim.scorePopups = [];
    anim.shake = { time: 0, intensity: 0 };
    anim.matchFlash = 0;
    anim.numScale = 1;
    anim.targetNumScale = 1;
    anim.targetBgHue = 270;
    particlesRef.current?.clear();
    scoreSubmittedRef.current = false;
    pendingRoundRef.current = false;
    setScore(0);
    setLevel(1);
    setCombo(0);
    setGameOver(false);
    setStarted(true);
    setPaused(false);
  }, []);

  // Handle tap direction
  const handleTap = useCallback((dir: "left" | "right") => {
    const game = gameRef.current;
    if (!game || !game.started || game.over || game.paused || pendingRoundRef.current) return;

    const newNum = dir === "left" ? game.num - 1 : game.num + 1;
    game.num = newNum;

    // Bounce animation
    animRef.current.numScale = 1.2;
    animRef.current.targetNumScale = 1;

    soundRef.current?.playClick();

    // Check match
    if (newNum === game.target) {
      const newCombo = game.combo + 1;
      const pts = 10 * game.level + (newCombo > 1 ? newCombo * 5 : 0);
      game.score += pts;
      game.combo = newCombo;
      if (newCombo > game.bestCombo) game.bestCombo = newCombo;
      const newLvl = game.level + 1;
      game.level = newLvl;

      // Visual feedback
      animRef.current.matchFlash = 1;
      animRef.current.targetBgHue = 120; // green flash

      // Particles at center
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;
        particlesRef.current?.emitCelebration(cw / 2, ch * 0.42);
      }

      // Score popup
      const canvas2 = canvasRef.current;
      if (canvas2) {
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas2.width / dpr;
        animRef.current.scorePopups.push({
          x: cw / 2,
          y: 120,
          value: pts,
          life: 1.2,
          combo: newCombo,
        });
      }

      // Sound
      if (newCombo > 1) {
        soundRef.current?.playCombo(newCombo);
      } else {
        soundRef.current?.playScore(pts);
      }

      // Update React UI
      setScore(game.score);
      setLevel(newLvl);
      setCombo(newCombo);

      // Delay new round
      pendingRoundRef.current = true;
      setTimeout(() => {
        if (gameRef.current && gameRef.current.started && !gameRef.current.over) {
          newRound(gameRef.current);
          animRef.current.targetBgHue = 270;
          pendingRoundRef.current = false;
        }
      }, 350);
    }
  }, []);

  // Handle canvas click
  const handleCanvasClick = useCallback((x: number, y: number) => {
    const game = gameRef.current;
    if (!game) return;

    // Pause toggle
    if (game.paused && game.started && !game.over) {
      game.paused = false;
      setPaused(false);
      return;
    }

    // Start / restart button
    if ((!game.started || game.over) && hitTest(x, y, (game as unknown as Record<string, unknown>)._startBtnBounds as Bounds | undefined)) {
      doStart();
      return;
    }

    // -1 / +1 buttons
    if (game.started && !game.over && !game.paused) {
      if (hitTest(x, y, (game as unknown as Record<string, unknown>)._minusBtnBounds as Bounds | undefined)) {
        handleTap("left");
        return;
      }
      if (hitTest(x, y, (game as unknown as Record<string, unknown>)._plusBtnBounds as Bounds | undefined)) {
        handleTap("right");
        return;
      }
    }
  }, [doStart, handleTap]);

  // Toggle pause
  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (!game || !game.started || game.over) return;
    game.paused = !game.paused;
    setPaused(game.paused);
  }, []);

  // Save/Load
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      num: game.num,
      target: game.target,
      score: game.score,
      level: game.level,
      combo: game.combo,
      timeLeft: game.timeLeft,
      maxTime: game.maxTime,
      over: game.over,
      started: game.started,
      bestCombo: game.bestCombo,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        num: number; target: number; score: number; level: number;
        combo: number; timeLeft: number; maxTime: number;
        over: boolean; started: boolean; bestCombo: number;
      };
      if (!d || typeof d.num !== "number" || typeof d.target !== "number" || typeof d.score !== "number") return;
      const game = gameRef.current;
      if (!game) return;
      game.num = d.num;
      game.target = d.target;
      game.score = d.score;
      game.level = d.level;
      game.combo = d.combo;
      game.timeLeft = d.timeLeft;
      game.maxTime = d.maxTime;
      game.over = d.over;
      game.started = d.started;
      game.bestCombo = d.bestCombo || 0;
      game.paused = false;
      animRef.current.scorePopups = [];
      animRef.current.matchFlash = 0;
      animRef.current.shake = { time: 0, intensity: 0 };
      particlesRef.current?.clear();
      scoreSubmittedRef.current = false;
      pendingRoundRef.current = false;
      setScore(d.score);
      setLevel(d.level);
      setCombo(d.combo);
      setGameOver(d.over);
      setStarted(d.started);
      setPaused(false);
    } catch { /* ignore malformed data */ }
  }, []);

  // ─── Animation Loop ──────────────────────────────────────
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
      const h = Math.min(w * 1.2, 520);
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
      const dt = Math.min(rawDt, 50) / 1000;

      const anim = animRef.current;
      const game = gameRef.current;

      if (game && !game.paused) {
        anim.time += dt;
        anim.timerPulse += dt;

        // Timer countdown
        if (game.started && !game.over && !pendingRoundRef.current) {
          game.timeLeft -= dt;
          if (game.timeLeft <= 0) {
            game.timeLeft = 0;
            game.over = true;
            game.started = false;
            anim.shake = { time: 0.5, intensity: 8 };
            anim.targetBgHue = 0; // red
            soundRef.current?.playGameOver();

            // Game over particles
            const dpr = window.devicePixelRatio || 1;
            const cw = canvas.width / dpr;
            const ch = canvas.height / dpr;
            particlesRef.current?.emitExplosion(cw / 2, ch * 0.4, DANGER, 30);

            submitScore(game.score);
            setGameOver(true);
            setStarted(false);
          }
        }

        // Match flash decay
        if (anim.matchFlash > 0) {
          anim.matchFlash = Math.max(0, anim.matchFlash - dt * 4);
        }

        // Number scale lerp
        anim.numScale = lerp(anim.numScale, anim.targetNumScale, 0.15);

        // Update shake
        updateShake(anim.shake, dt);

        // Update score popups
        updateScorePopups(anim.scorePopups, dt);

        // Update particles
        particlesRef.current?.update(dt);

        // Smooth bg hue
        anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.04);
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
  }, [submitScore]);

  // ─── Input ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse click
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      handleCanvasClick(x, y);
    };
    canvas.addEventListener("click", onClick);

    // Touch tap
    const input = new InputHandler(canvas);
    input.onTap((x, y) => handleCanvasClick(x, y));
    input.preventDefaults();
    inputRef.current = input;

    // Keyboard
    input.bindKeys({
      ArrowLeft: () => handleTap("left"),
      ArrowRight: () => handleTap("right"),
    });

    return () => {
      canvas.removeEventListener("click", onClick);
      input.dispose();
    };
  }, [handleCanvasClick, handleTap]);

  // ─── Tab visibility auto-pause ─────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.hidden && gameRef.current && gameRef.current.started && !gameRef.current.over) {
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
            <span className="text-[#f0b90b]">➕➖ 加减消除</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">得分</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{score}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">关卡</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{level}</div>
            </div>
            {combo > 1 && (
              <div className="text-center px-3 py-1.5 rounded-lg bg-[#ec4899]/10 border border-[#ec4899]/30">
                <div className="text-[10px] text-[#ec4899]">连击</div>
                <div className="font-bold text-[#ec4899] text-sm tabular-nums">x{combo}</div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-end mb-3 gap-1.5">
          {started && !gameOver && (
            <button
              onClick={togglePause}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
            >
              {paused ? "▶" : "⏸"}
            </button>
          )}
          <button
            onClick={() => { soundRef.current?.toggleMute(); }}
            className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
          >
            {soundRef.current?.isMuted() ? "🔇" : "🔊"}
          </button>
          {(started || gameOver) && (
            <button
              onClick={doStart}
              className="px-3 py-1.5 rounded-lg text-xs bg-[#f0b90b] text-[#0f0f0f] font-semibold hover:bg-[#f5cc3a] transition"
            >
              新游戏
            </button>
          )}
        </div>

        {/* Canvas */}
        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl"
            style={{ touchAction: "none" }}
          />
        </div>

        <p className="text-center text-[10px] text-[#666] mt-3">
          ← 减1 | → 加1 · 让当前数字等于目标
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
