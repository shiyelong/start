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
import { easeOutQuad, easeOutBack, lerp, updateShake, applyShake, updateScorePopups, renderScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { setupCanvas, resizeCanvas, drawGradientBackground, drawText, drawGlow, drawRoundedRect } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
type Phase = "idle" | "waiting" | "go" | "result" | "early" | "finished";

interface GameState {
  phase: Phase;
  round: number;
  totalRounds: number;
  times: number[];
  bestTime: number;
  currentTime: number;
  score: number;
  over: boolean;
  waitStart: number;   // timestamp when waiting phase started
  goStart: number;     // timestamp when go phase started
  delayMs: number;     // random delay for current round
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  pulsePhase: number;
  circleScale: number;
  targetCircleScale: number;
  flashAlpha: number;
  resultFadeIn: number;
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "reaction";
const TOTAL_ROUNDS = 5;
const MIN_DELAY = 1000;
const MAX_DELAY = 5000;
const CIRCLE_RADIUS_RATIO = 0.22; // relative to canvas width

// ─── Game Logic (Pure Functions) ─────────────────────────
function initGameState(): GameState {
  return {
    phase: "idle",
    round: 0,
    totalRounds: TOTAL_ROUNDS,
    times: [],
    bestTime: 9999,
    currentTime: 0,
    score: 0,
    over: false,
    waitStart: 0,
    goStart: 0,
    delayMs: 0,
  };
}

function getRandomDelay(): number {
  return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
}

function calculateScore(times: number[]): number {
  if (times.length === 0) return 0;
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  // Lower is better: convert to a positive score (max ~10000 for ~100ms avg)
  return Math.max(0, Math.round(10000 - avg * 10));
}

// ─── Renderer ────────────────────────────────────────────
function renderGame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  game: GameState,
  anim: AnimState,
  particles: ParticleSystem,
): void {
  ctx.save();

  // Apply shake
  applyShake(ctx, anim.shake);

  // Background
  drawGradientBackground(ctx, w, h, anim.bgHue, 50);

  const cx = w / 2;
  const cy = h * 0.38;
  const baseRadius = w * CIRCLE_RADIUS_RATIO;
  const radius = baseRadius * anim.circleScale;

  // Draw main circle area
  if (game.phase === "idle") {
    // Pulsing blue circle - "Click to start"
    const pulse = 1 + Math.sin(anim.pulsePhase * 2) * 0.05;
    drawGlow(ctx, cx, cy, radius * 1.6 * pulse, "#3ea6ff", 0.15);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "#3ea6ff";
    ctx.fill();
    drawText(ctx, "点击开始", cx, cy, radius * 1.5, "#ffffff", 24);
    drawText(ctx, "测试你的反应速度", cx, cy + 36, w * 0.7, "#aaaaaa", 14);
  } else if (game.phase === "waiting") {
    // Red circle - "Wait for green..."
    const pulse = 1 + Math.sin(anim.pulsePhase * 4) * 0.02;
    drawGlow(ctx, cx, cy, radius * 1.4 * pulse, "#ff4444", 0.2);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "#cc3333";
    ctx.fill();
    drawText(ctx, "等待绿色...", cx, cy, radius * 1.5, "#ffffff", 22);
    drawText(ctx, `第 ${game.round + 1} / ${game.totalRounds} 轮`, cx, cy + 34, w * 0.6, "#ffaaaa", 13);
  } else if (game.phase === "go") {
    // Green circle - "TAP NOW!"
    const pulse = 1 + Math.sin(anim.pulsePhase * 8) * 0.06;
    drawGlow(ctx, cx, cy, radius * 2 * pulse, "#44ff44", 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "#22cc22";
    ctx.fill();
    drawText(ctx, "点击！", cx, cy, radius * 1.5, "#ffffff", 32);
  } else if (game.phase === "result") {
    // Show result for this round
    const pulse = 1 + Math.sin(anim.pulsePhase * 2) * 0.03;
    const color = game.currentTime < 200 ? "#44ff44" : game.currentTime < 350 ? "#ffcc00" : "#ff8844";
    drawGlow(ctx, cx, cy, radius * 1.5, color, 0.2 * anim.resultFadeIn);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * pulse * anim.resultFadeIn, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    drawText(ctx, `${game.currentTime}ms`, cx, cy - 8, radius * 1.5, "#ffffff", 30);
    const label = game.currentTime < 200 ? "极速！" : game.currentTime < 350 ? "不错！" : "继续加油";
    drawText(ctx, label, cx, cy + 28, radius * 1.5, "#ffffff", 16);
    drawText(ctx, "点击继续", cx, cy + 56, w * 0.6, "#aaaaaa", 13);
  } else if (game.phase === "early") {
    // Too early!
    drawGlow(ctx, cx, cy, radius * 1.4, "#ff6600", 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#cc5500";
    ctx.fill();
    drawText(ctx, "太早了！", cx, cy - 4, radius * 1.5, "#ffffff", 26);
    drawText(ctx, "点击重试本轮", cx, cy + 30, w * 0.6, "#ffccaa", 14);
  } else if (game.phase === "finished") {
    // Final results
    const avg = game.times.length > 0
      ? Math.round(game.times.reduce((a, b) => a + b, 0) / game.times.length)
      : 0;
    const color = avg < 250 ? "#44ff44" : avg < 400 ? "#ffcc00" : "#ff8844";
    drawGlow(ctx, cx, cy, radius * 1.8, color, 0.2);

    // Results card background
    const cardW = w * 0.8;
    const cardH = h * 0.45;
    const cardX = (w - cardW) / 2;
    const cardY = cy - cardH * 0.4;
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fillStyle = "rgba(26, 26, 26, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    drawText(ctx, "测试完成！", cx, cardY + 30, cardW * 0.8, "#3ea6ff", 22);
    drawText(ctx, `平均: ${avg}ms`, cx, cardY + 65, cardW * 0.8, color, 28);
    drawText(ctx, `最快: ${game.bestTime}ms`, cx, cardY + 100, cardW * 0.8, "#44ff44", 18);
    drawText(ctx, `得分: ${game.score}`, cx, cardY + 130, cardW * 0.8, "#f0b90b", 18);

    // Individual round times
    const timesStr = game.times.map((t, i) => `R${i + 1}:${t}`).join("  ");
    drawText(ctx, timesStr, cx, cardY + 162, cardW * 0.9, "#888888", 11);

    drawText(ctx, "点击再来一局", cx, cardY + cardH - 20, cardW * 0.8, "#aaaaaa", 14);
  }

  // Flash overlay (for go transition)
  if (anim.flashAlpha > 0) {
    ctx.globalAlpha = anim.flashAlpha;
    ctx.fillStyle = "#44ff44";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // Particles
  particles.render(ctx);

  // Score popups
  renderScorePopups(ctx, anim.scorePopups);

  // Round indicator at top
  if (game.phase !== "idle" && game.phase !== "finished") {
    const dotY = 16;
    const dotSpacing = 20;
    const startX = cx - ((game.totalRounds - 1) * dotSpacing) / 2;
    for (let i = 0; i < game.totalRounds; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * dotSpacing, dotY, 5, 0, Math.PI * 2);
      if (i < game.times.length) {
        ctx.fillStyle = "#44ff44"; // completed
      } else if (i === game.round) {
        ctx.fillStyle = "#3ea6ff"; // current
      } else {
        ctx.fillStyle = "#333333"; // upcoming
      }
      ctx.fill();
    }
  }

  ctx.restore();
}


// ─── Component ───────────────────────────────────────────
export default function ReactionTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(initGameState());
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 220,
    targetBgHue: 220,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    pulsePhase: 0,
    circleScale: 1,
    targetCircleScale: 1,
    flashAlpha: 0,
    resultFadeIn: 0,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreSubmittedRef = useRef(false);
  const pausedRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0 });

  // React UI state
  const [score, setScore] = useState(0);
  const [bestTime, setBestTime] = useState(9999);
  const [avgTime, setAvgTime] = useState(0);
  const [roundCount, setRoundCount] = useState(0);
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

  // Start a new round (transition to waiting phase)
  const startRound = useCallback(() => {
    const game = gameRef.current;
    game.phase = "waiting";
    game.delayMs = getRandomDelay();
    game.waitStart = performance.now();
    animRef.current.targetBgHue = 0; // red hue
    animRef.current.flashAlpha = 0;

    // Set timer for green
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (pausedRef.current) return;
      game.phase = "go";
      game.goStart = performance.now();
      animRef.current.targetBgHue = 120; // green hue
      animRef.current.flashAlpha = 0.3;
      soundRef.current?.playClick();
    }, game.delayMs);
  }, []);

  // Handle tap/click on canvas
  const handleTap = useCallback(() => {
    const game = gameRef.current;
    const anim = animRef.current;
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h * 0.38;

    if (game.phase === "idle") {
      // Start game
      game.round = 0;
      game.times = [];
      game.bestTime = 9999;
      game.currentTime = 0;
      game.score = 0;
      game.over = false;
      scoreSubmittedRef.current = false;
      setGameOver(false);
      setScore(0);
      setBestTime(9999);
      setAvgTime(0);
      setRoundCount(0);
      startRound();
      soundRef.current?.playClick();
    } else if (game.phase === "waiting") {
      // Too early!
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      game.phase = "early";
      anim.targetBgHue = 30; // orange
      anim.shake = { time: 0.3, intensity: 6 };
      soundRef.current?.playError();
      particlesRef.current?.emitExplosion(cx, cy, "#ff6600", 15);
    } else if (game.phase === "go") {
      // Record reaction time
      const reactionTime = Math.round(performance.now() - game.goStart);
      game.currentTime = reactionTime;
      game.times.push(reactionTime);
      if (reactionTime < game.bestTime) game.bestTime = reactionTime;
      game.round++;
      game.phase = "result";
      anim.resultFadeIn = 0;
      anim.targetBgHue = reactionTime < 200 ? 120 : reactionTime < 350 ? 60 : 30;

      // Effects
      soundRef.current?.playScore(Math.max(0, 500 - reactionTime));
      particlesRef.current?.emitCelebration(cx, cy);
      anim.scorePopups.push({
        x: cx, y: cy - 60,
        value: reactionTime,
        life: 1.2,
        combo: 0,
      });

      // Update React UI
      const avg = Math.round(game.times.reduce((a, b) => a + b, 0) / game.times.length);
      setAvgTime(avg);
      setBestTime(game.bestTime);
      setRoundCount(game.times.length);
    } else if (game.phase === "result") {
      // Next round or finish
      if (game.round >= game.totalRounds) {
        // Game finished
        game.phase = "finished";
        game.over = true;
        game.score = calculateScore(game.times);
        anim.targetBgHue = 220;
        soundRef.current?.playLevelUp();
        particlesRef.current?.emitCelebration(cx, cy);
        submitScore(game.score);
        setScore(game.score);
        setGameOver(true);
      } else {
        startRound();
      }
    } else if (game.phase === "early") {
      // Retry this round
      startRound();
    } else if (game.phase === "finished") {
      // Restart
      gameRef.current = initGameState();
      anim.targetBgHue = 220;
      setGameOver(false);
      setScore(0);
      setBestTime(9999);
      setAvgTime(0);
      setRoundCount(0);
    }
  }, [startRound, submitScore]);

  // Initialize engines
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(200);
  }, []);

  // Setup canvas, input, and game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const doResize = () => {
      const { width, height } = resizeCanvas(canvas, parent);
      // Override height to be taller for this game
      const h = Math.max(width * 1.1, 400);
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
    input.onTap(() => handleTap());
    input.preventDefaults();
    inputRef.current = input;

    // Mouse click support
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      handleTap();
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
      anim.time += dt;
      anim.pulsePhase += dt;

      // Smooth transitions
      anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, dt * 3);
      anim.circleScale = lerp(anim.circleScale, anim.targetCircleScale, dt * 8);
      if (anim.flashAlpha > 0) anim.flashAlpha = Math.max(0, anim.flashAlpha - dt * 2);
      if (gameRef.current.phase === "result") {
        anim.resultFadeIn = Math.min(1, anim.resultFadeIn + dt * 5);
      }

      // Update shake
      updateShake(anim.shake, dt);

      // Update particles
      particlesRef.current?.update(dt);

      // Update score popups
      updateScorePopups(anim.scorePopups, dt);

      // Check if waiting phase timer should fire (for paused recovery)
      const game = gameRef.current;
      if (game.phase === "waiting") {
        const elapsed = performance.now() - game.waitStart;
        if (elapsed >= game.delayMs && game.phase === "waiting") {
          game.phase = "go";
          game.goStart = performance.now();
          anim.targetBgHue = 120;
          anim.flashAlpha = 0.3;
          soundRef.current?.playClick();
        }
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
  }, [handleTap]);

  // Auto-pause on tab switch
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        pausedRef.current = true;
        // Clear any pending timer
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else {
        pausedRef.current = false;
        lastTimeRef.current = 0;
        // If we were in waiting phase, restart the round
        const game = gameRef.current;
        if (game.phase === "waiting") {
          startRound();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [startRound]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
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
      times: [...game.times],
      bestTime: game.bestTime,
      round: game.round,
      score: game.score,
      over: game.over,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as { times?: number[]; bestTime?: number; round?: number; score?: number; over?: boolean };
      if (!d || !Array.isArray(d.times) || typeof d.bestTime !== "number") return;
      const game = gameRef.current;
      game.times = d.times;
      game.bestTime = d.bestTime;
      game.round = d.round ?? d.times.length;
      game.score = d.score ?? calculateScore(d.times);
      game.over = d.over ?? false;
      game.phase = game.over ? "finished" : "idle";
      scoreSubmittedRef.current = false;
      const avg = d.times.length > 0 ? Math.round(d.times.reduce((a, b) => a + b, 0) / d.times.length) : 0;
      setScore(game.score);
      setBestTime(game.bestTime);
      setAvgTime(avg);
      setRoundCount(d.times.length);
      setGameOver(game.over);
    } catch { /* ignore malformed data */ }
  }, []);

  const avg = avgTime;

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
            <i className="fas fa-bolt mr-2 text-[#f0b90b]" />
            <span className="text-[#3ea6ff]">反应测试</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">最快</div>
              <div className="font-bold text-[#44ff44] text-sm tabular-nums">
                {bestTime < 9999 ? `${bestTime}ms` : "--"}
              </div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">平均</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">
                {avg > 0 ? `${avg}ms` : "--"}
              </div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">轮次</div>
              <div className="font-bold text-white text-sm tabular-nums">
                {roundCount}/{TOTAL_ROUNDS}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-end mb-3 gap-1.5">
          <button
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              timerRef.current = null;
              gameRef.current = initGameState();
              animRef.current.targetBgHue = 220;
              scoreSubmittedRef.current = false;
              setGameOver(false);
              setScore(0);
              setBestTime(9999);
              setAvgTime(0);
              setRoundCount(0);
            }}
            className="px-3 py-1.5 rounded-lg text-xs bg-[#3ea6ff] text-[#0f0f0f] font-semibold hover:bg-[#65b8ff] transition"
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
              onClick={() => {
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = null;
                gameRef.current = initGameState();
                animRef.current.targetBgHue = 220;
                scoreSubmittedRef.current = false;
                setGameOver(false);
                setScore(0);
                setBestTime(9999);
                setAvgTime(0);
                setRoundCount(0);
              }}
              className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25"
            >
              再来一局
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          等待绿色出现后尽快点击 · {TOTAL_ROUNDS}轮取平均
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
