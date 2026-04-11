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
import { resizeCanvas, drawGradientBackground, drawText, drawGlow, drawRoundedRect } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
interface ColorEntry {
  name: string;
  hex: string;
}

interface GameState {
  score: number;
  combo: number;
  maxCombo: number;
  round: number;
  timeLeft: number;       // seconds remaining
  totalTime: number;      // total game time
  wordColor: ColorEntry;  // the color the word is WRITTEN in
  wordText: ColorEntry;   // the color NAME displayed
  isMatch: boolean;       // whether wordColor === wordText
  over: boolean;
  started: boolean;
  correct: number;
  wrong: number;
  difficulty: number;     // increases over time, affects time per question
  questionTime: number;   // time allowed per question (decreases with difficulty)
  questionTimer: number;  // time remaining for current question
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  flashColor: string;
  flashAlpha: number;
  wordScale: number;
  targetWordScale: number;
  timerPulse: number;
  btnMatchHover: number;
  btnNoMatchHover: number;
  resultFadeIn: number;
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "colormatch";
const GAME_TIME = 30;
const BASE_QUESTION_TIME = 5;
const MIN_QUESTION_TIME = 1.5;
const MATCH_PROBABILITY = 0.35;

const COLORS: ColorEntry[] = [
  { name: "红色", hex: "#ef4444" },
  { name: "蓝色", hex: "#3b82f6" },
  { name: "绿色", hex: "#22c55e" },
  { name: "黄色", hex: "#eab308" },
  { name: "紫色", hex: "#a855f7" },
  { name: "橙色", hex: "#f97316" },
  { name: "粉色", hex: "#ec4899" },
  { name: "青色", hex: "#06b6d4" },
];

// ─── Game Logic (Pure Functions) ─────────────────────────
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateQuestion(difficulty: number): { wordColor: ColorEntry; wordText: ColorEntry; isMatch: boolean } {
  const isMatch = Math.random() < MATCH_PROBABILITY;
  const wordText = pickRandom(COLORS);
  if (isMatch) {
    return { wordColor: wordText, wordText, isMatch: true };
  }
  // Pick a different color for the ink
  let wordColor = pickRandom(COLORS);
  while (wordColor.hex === wordText.hex) {
    wordColor = pickRandom(COLORS);
  }
  // At higher difficulty, pick more confusing combos (similar hues)
  if (difficulty > 3 && Math.random() < 0.4) {
    // Pick from a subset of "confusing" pairs
    const confusing = COLORS.filter(c => c.hex !== wordText.hex);
    wordColor = pickRandom(confusing);
  }
  return { wordColor, wordText, isMatch: false };
}

function getQuestionTime(difficulty: number): number {
  return Math.max(MIN_QUESTION_TIME, BASE_QUESTION_TIME - difficulty * 0.3);
}

function initGameState(): GameState {
  const q = generateQuestion(0);
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    round: 0,
    timeLeft: GAME_TIME,
    totalTime: GAME_TIME,
    wordColor: q.wordColor,
    wordText: q.wordText,
    isMatch: q.isMatch,
    over: false,
    started: false,
    correct: 0,
    wrong: 0,
    difficulty: 0,
    questionTime: BASE_QUESTION_TIME,
    questionTimer: BASE_QUESTION_TIME,
  };
}

function calculateScore(correct: number, maxCombo: number): number {
  return correct * 100 + maxCombo * 50;
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
  applyShake(ctx, anim.shake);
  drawGradientBackground(ctx, w, h, anim.bgHue, 50);

  const cx = w / 2;

  if (!game.started && !game.over) {
    // ─── Idle / Start Screen ─────────────────────────
    const pulse = 1 + Math.sin(anim.time * 2) * 0.05;
    const btnW = w * 0.55;
    const btnH = 56;
    const btnX = cx - btnW / 2;
    const btnY = h * 0.45;

    drawGlow(ctx, cx, h * 0.28, w * 0.2, "#a855f7", 0.15 * pulse);

    // Title
    drawText(ctx, "🎨 颜色挑战", cx, h * 0.18, w * 0.8, "#a855f7", 28);
    drawText(ctx, "Stroop 效应测试", cx, h * 0.24, w * 0.7, "#888", 14);

    // Instructions card
    const cardW = w * 0.85;
    const cardH = 110;
    const cardX = (w - cardW) / 2;
    const cardY = h * 0.30;
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fillStyle = "rgba(26,26,26,0.85)";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    drawText(ctx, "文字颜色与文字含义是否一致？", cx, cardY + 28, cardW * 0.85, "#ccc", 14);
    drawText(ctx, "匹配 → 颜色和文字相同", cx, cardY + 52, cardW * 0.8, "#22c55e", 13);
    drawText(ctx, "不匹配 → 颜色和文字不同", cx, cardY + 74, cardW * 0.8, "#ef4444", 13);
    drawText(ctx, `限时 ${GAME_TIME} 秒，连击加分！`, cx, cardY + 96, cardW * 0.8, "#f0b90b", 13);

    // Start button
    drawRoundedRect(ctx, btnX, btnY, btnW, btnH, 14);
    ctx.fillStyle = "#a855f7";
    ctx.fill();
    drawText(ctx, "开始游戏", cx, btnY + btnH / 2, btnW * 0.8, "#fff", 22);

    particles.render(ctx);
    ctx.restore();
    return;
  }

  if (game.over) {
    // ─── Game Over Screen ────────────────────────────
    const cardW = w * 0.85;
    const cardH = h * 0.55;
    const cardX = (w - cardW) / 2;
    const cardY = h * 0.12;

    drawGlow(ctx, cx, cardY + cardH * 0.3, w * 0.3, "#f0b90b", 0.15 * anim.resultFadeIn);

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fillStyle = "rgba(26,26,26,0.92)";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    const fi = anim.resultFadeIn;
    ctx.globalAlpha = fi;

    drawText(ctx, "游戏结束！", cx, cardY + 36, cardW * 0.8, "#a855f7", 24);
    drawText(ctx, `${game.score}`, cx, cardY + 80, cardW * 0.8, "#f0b90b", 42);
    drawText(ctx, "分", cx, cardY + 108, cardW * 0.5, "#888", 14);

    const statsY = cardY + 140;
    drawText(ctx, `正确: ${game.correct}`, cx - w * 0.15, statsY, cardW * 0.35, "#22c55e", 16);
    drawText(ctx, `错误: ${game.wrong}`, cx + w * 0.15, statsY, cardW * 0.35, "#ef4444", 16);
    drawText(ctx, `最高连击: ${game.maxCombo}`, cx, statsY + 30, cardW * 0.6, "#f0b90b", 16);
    drawText(ctx, `回答: ${game.round} 题`, cx, statsY + 56, cardW * 0.6, "#aaa", 14);

    // Restart button
    const btnW = w * 0.5;
    const btnH2 = 48;
    const btnX2 = cx - btnW / 2;
    const btnY2 = cardY + cardH - 65;
    drawRoundedRect(ctx, btnX2, btnY2, btnW, btnH2, 12);
    ctx.fillStyle = "#a855f7";
    ctx.fill();
    drawText(ctx, "再来一局", cx, btnY2 + btnH2 / 2, btnW * 0.8, "#fff", 18);

    ctx.globalAlpha = 1;
    particles.render(ctx);
    renderScorePopups(ctx, anim.scorePopups);
    ctx.restore();
    return;
  }

  // ─── Active Game ───────────────────────────────────
  // Timer bar at top
  const barH = 8;
  const barW = w - 32;
  const barX = 16;
  const barY = 12;
  const timeFrac = Math.max(0, game.timeLeft / game.totalTime);
  const timerColor = timeFrac > 0.5 ? "#22c55e" : timeFrac > 0.2 ? "#eab308" : "#ef4444";

  drawRoundedRect(ctx, barX, barY, barW, barH, 4);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();
  if (timeFrac > 0) {
    drawRoundedRect(ctx, barX, barY, barW * timeFrac, barH, 4);
    ctx.fillStyle = timerColor;
    ctx.fill();
  }

  // Time text
  const timeStr = Math.ceil(game.timeLeft).toString();
  const timePulse = game.timeLeft < 5 ? 1 + Math.sin(anim.timerPulse * 6) * 0.1 : 1;
  ctx.save();
  ctx.translate(cx, barY + barH + 18);
  ctx.scale(timePulse, timePulse);
  drawText(ctx, `${timeStr}s`, 0, 0, 60, timerColor, 16);
  ctx.restore();

  // Question timer bar (per-question)
  const qBarY = barY + barH + 34;
  const qFrac = Math.max(0, game.questionTimer / game.questionTime);
  const qBarW = w * 0.6;
  const qBarX = cx - qBarW / 2;
  drawRoundedRect(ctx, qBarX, qBarY, qBarW, 4, 2);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  if (qFrac > 0) {
    drawRoundedRect(ctx, qBarX, qBarY, qBarW * qFrac, 4, 2);
    ctx.fillStyle = qFrac > 0.3 ? "#a855f7" : "#ef4444";
    ctx.fill();
  }

  // Score + Combo
  const infoY = qBarY + 24;
  drawText(ctx, `得分: ${game.score}`, w * 0.25, infoY, w * 0.4, "#f0b90b", 15);
  if (game.combo > 1) {
    const comboPulse = 1 + Math.sin(anim.time * 5) * 0.08;
    ctx.save();
    ctx.translate(w * 0.75, infoY);
    ctx.scale(comboPulse, comboPulse);
    drawText(ctx, `🔥 x${game.combo}`, 0, 0, w * 0.3, "#ff6b6b", 16);
    ctx.restore();
  } else {
    drawText(ctx, `连击: ${game.combo}`, w * 0.75, infoY, w * 0.3, "#888", 14);
  }

  // ─── Color Word Display ────────────────────────────
  const wordY = h * 0.38;
  const wordAreaH = h * 0.18;
  const wordAreaW = w * 0.8;
  const wordAreaX = cx - wordAreaW / 2;
  const wordAreaY2 = wordY - wordAreaH / 2;

  // Word background card
  drawRoundedRect(ctx, wordAreaX, wordAreaY2, wordAreaW, wordAreaH, 16);
  ctx.fillStyle = "rgba(26,26,26,0.8)";
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Glow behind word
  drawGlow(ctx, cx, wordY, w * 0.15, game.wordColor.hex, 0.2);

  // The color word - displayed in wordColor's hex, showing wordText's name
  const ws = anim.wordScale;
  ctx.save();
  ctx.translate(cx, wordY);
  ctx.scale(ws, ws);
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = game.wordColor.hex;
  ctx.fillText(game.wordText.name, 0, 0);
  ctx.restore();

  // ─── Match / No Match Buttons ──────────────────────
  const btnY = h * 0.58;
  const btnW = w * 0.38;
  const btnH = 56;
  const gap = w * 0.04;

  // Match button (left)
  const matchX = cx - gap / 2 - btnW;
  drawRoundedRect(ctx, matchX, btnY, btnW, btnH, 14);
  ctx.fillStyle = "#22c55e";
  ctx.fill();
  drawGlow(ctx, matchX + btnW / 2, btnY + btnH / 2, btnW * 0.4, "#22c55e", 0.1);
  drawText(ctx, "✓ 匹配", matchX + btnW / 2, btnY + btnH / 2, btnW * 0.8, "#fff", 20);

  // No Match button (right)
  const noMatchX = cx + gap / 2;
  drawRoundedRect(ctx, noMatchX, btnY, btnW, btnH, 14);
  ctx.fillStyle = "#ef4444";
  ctx.fill();
  drawGlow(ctx, noMatchX + btnW / 2, btnY + btnH / 2, btnW * 0.4, "#ef4444", 0.1);
  drawText(ctx, "✗ 不匹配", noMatchX + btnW / 2, btnY + btnH / 2, btnW * 0.8, "#fff", 20);

  // Keyboard hints
  drawText(ctx, "← 或 A", matchX + btnW / 2, btnY + btnH + 16, btnW, "#555", 10);
  drawText(ctx, "→ 或 D", noMatchX + btnW / 2, btnY + btnH + 16, btnW, "#555", 10);

  // ─── Flash overlay ─────────────────────────────────
  if (anim.flashAlpha > 0) {
    ctx.globalAlpha = anim.flashAlpha;
    ctx.fillStyle = anim.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // Particles
  particles.render(ctx);

  // Score popups
  renderScorePopups(ctx, anim.scorePopups);

  ctx.restore();
}

// ─── Component ───────────────────────────────────────────
export default function ColorMatch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(initGameState());
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 270,
    targetBgHue: 270,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    flashColor: "#22c55e",
    flashAlpha: 0,
    wordScale: 1,
    targetWordScale: 1,
    timerPulse: 0,
    btnMatchHover: 0,
    btnNoMatchHover: 0,
    resultFadeIn: 0,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);
  const pausedRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0 });

  // React UI state (for elements outside canvas)
  const [score, setScore] = useState(0);
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

  // Advance to next question
  const nextQuestion = useCallback(() => {
    const game = gameRef.current;
    const anim = animRef.current;
    game.difficulty = Math.floor(game.round / 5);
    const q = generateQuestion(game.difficulty);
    game.wordColor = q.wordColor;
    game.wordText = q.wordText;
    game.isMatch = q.isMatch;
    game.questionTime = getQuestionTime(game.difficulty);
    game.questionTimer = game.questionTime;
    // Word pop-in animation
    anim.wordScale = 0.3;
    anim.targetWordScale = 1;
  }, []);

  // Handle answer
  const handleAnswer = useCallback((answeredMatch: boolean) => {
    const game = gameRef.current;
    const anim = animRef.current;
    if (game.over || !game.started) return;

    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const wordY = h * 0.38;

    const isCorrect = answeredMatch === game.isMatch;
    game.round++;

    if (isCorrect) {
      game.combo++;
      if (game.combo > game.maxCombo) game.maxCombo = game.combo;
      game.correct++;
      const points = 100 + (game.combo > 1 ? game.combo * 20 : 0);
      game.score += points;

      // Effects
      anim.flashColor = "#22c55e";
      anim.flashAlpha = 0.15;
      anim.targetBgHue = 270 + game.combo * 5;
      soundRef.current?.playScore(points);
      if (game.combo > 1) soundRef.current?.playCombo(game.combo);
      particlesRef.current?.emitExplosion(cx, wordY, game.wordColor.hex, 15);
      anim.scorePopups.push({
        x: cx, y: wordY - 40,
        value: points,
        life: 1,
        combo: game.combo,
      });

      setScore(game.score);
      setCombo(game.combo);
    } else {
      game.combo = 0;
      game.wrong++;

      // Effects
      anim.flashColor = "#ef4444";
      anim.flashAlpha = 0.2;
      anim.shake = { time: 0.25, intensity: 5 };
      soundRef.current?.playError();
      particlesRef.current?.emitExplosion(cx, wordY, "#ef4444", 10);

      setCombo(0);
    }

    nextQuestion();
  }, [nextQuestion]);

  // Start game
  const startGame = useCallback(() => {
    const game = gameRef.current;
    game.started = true;
    game.over = false;
    game.score = 0;
    game.combo = 0;
    game.maxCombo = 0;
    game.round = 0;
    game.timeLeft = GAME_TIME;
    game.correct = 0;
    game.wrong = 0;
    game.difficulty = 0;
    scoreSubmittedRef.current = false;
    animRef.current.resultFadeIn = 0;
    animRef.current.targetBgHue = 270;
    nextQuestion();
    setScore(0);
    setCombo(0);
    setGameOver(false);
    soundRef.current?.playClick();
  }, [nextQuestion]);

  // End game
  const endGame = useCallback(() => {
    const game = gameRef.current;
    game.over = true;
    game.started = false;
    game.score = calculateScore(game.correct, game.maxCombo);
    animRef.current.targetBgHue = 270;
    animRef.current.resultFadeIn = 0;
    soundRef.current?.playGameOver();
    const { w, h } = sizeRef.current;
    particlesRef.current?.emitCelebration(w / 2, h * 0.3);
    submitScore(game.score);
    setScore(game.score);
    setGameOver(true);
  }, [submitScore]);

  // Handle tap on canvas
  const handleTap = useCallback((x: number, y: number) => {
    const game = gameRef.current;
    const { w, h } = sizeRef.current;
    const cx = w / 2;

    if (!game.started && !game.over) {
      // Start button area
      const btnW = w * 0.55;
      const btnH = 56;
      const btnX = cx - btnW / 2;
      const btnY = h * 0.45;
      if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
        startGame();
      }
      return;
    }

    if (game.over) {
      // Restart button area
      const btnW = w * 0.5;
      const btnH2 = 48;
      const cardH = h * 0.55;
      const cardY = h * 0.12;
      const btnX2 = cx - btnW / 2;
      const btnY2 = cardY + cardH - 65;
      if (x >= btnX2 && x <= btnX2 + btnW && y >= btnY2 && y <= btnY2 + btnH2) {
        gameRef.current = initGameState();
        startGame();
      }
      return;
    }

    // Active game - check button taps
    const btnY = h * 0.58;
    const btnW = w * 0.38;
    const btnH = 56;
    const gap = w * 0.04;
    const matchX = cx - gap / 2 - btnW;
    const noMatchX = cx + gap / 2;

    if (y >= btnY && y <= btnY + btnH) {
      if (x >= matchX && x <= matchX + btnW) {
        handleAnswer(true);
      } else if (x >= noMatchX && x <= noMatchX + btnW) {
        handleAnswer(false);
      }
    }
  }, [startGame, handleAnswer]);

  // Initialize engines
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
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
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      handleTap(mx, my);
    };
    canvas.addEventListener("mousedown", onMouseDown);

    // Keyboard support
    const onKeyDown = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game.started || game.over) {
        if (e.key === " " || e.key === "Enter") {
          if (!game.started && !game.over) startGame();
          else if (game.over) {
            gameRef.current = initGameState();
            startGame();
          }
        }
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleAnswer(true);
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        handleAnswer(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

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
      anim.timerPulse += dt;

      // Smooth transitions
      anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, dt * 3);
      anim.wordScale = lerp(anim.wordScale, anim.targetWordScale, dt * 12);
      if (anim.flashAlpha > 0) anim.flashAlpha = Math.max(0, anim.flashAlpha - dt * 3);
      if (game.over) anim.resultFadeIn = Math.min(1, anim.resultFadeIn + dt * 4);

      // Update shake
      updateShake(anim.shake, dt);

      // Update particles
      particlesRef.current?.update(dt);

      // Update score popups
      updateScorePopups(anim.scorePopups, dt);

      // Game timer countdown
      if (game.started && !game.over) {
        game.timeLeft -= dt;
        game.questionTimer -= dt;

        // Question timeout - count as wrong
        if (game.questionTimer <= 0) {
          game.combo = 0;
          game.wrong++;
          game.round++;
          anim.shake = { time: 0.15, intensity: 3 };
          soundRef.current?.playError();
          setCombo(0);
          nextQuestion();
        }

        // Game over
        if (game.timeLeft <= 0) {
          game.timeLeft = 0;
          endGame();
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
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("mousedown", onMouseDown);
      input.dispose();
    };
  }, [handleTap, handleAnswer, startGame, endGame, nextQuestion]);

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
      score: game.score,
      combo: game.combo,
      maxCombo: game.maxCombo,
      round: game.round,
      timeLeft: game.timeLeft,
      correct: game.correct,
      wrong: game.wrong,
      over: game.over,
      started: game.started,
      difficulty: game.difficulty,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        score?: number; combo?: number; maxCombo?: number; round?: number;
        timeLeft?: number; correct?: number; wrong?: number;
        over?: boolean; started?: boolean; difficulty?: number;
      };
      if (!d || typeof d.score !== "number" || typeof d.timeLeft !== "number") return;
      const game = gameRef.current;
      game.score = d.score;
      game.combo = d.combo ?? 0;
      game.maxCombo = d.maxCombo ?? 0;
      game.round = d.round ?? 0;
      game.timeLeft = d.timeLeft;
      game.correct = d.correct ?? 0;
      game.wrong = d.wrong ?? 0;
      game.over = d.over ?? false;
      game.started = d.started ?? false;
      game.difficulty = d.difficulty ?? 0;
      scoreSubmittedRef.current = false;
      if (game.started && !game.over) {
        nextQuestion();
      }
      setScore(game.score);
      setCombo(game.combo);
      setGameOver(game.over);
    } catch { /* ignore malformed data */ }
  }, [nextQuestion]);

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
            <i className="fas fa-palette mr-2 text-[#a855f7]" />
            <span className="text-[#a855f7]">颜色挑战</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">得分</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{score}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">连击</div>
              <div className="font-bold text-[#ff6b6b] text-sm tabular-nums">{combo}</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-end mb-3 gap-1.5">
          <button
            onClick={() => {
              gameRef.current = initGameState();
              animRef.current.targetBgHue = 270;
              animRef.current.resultFadeIn = 0;
              scoreSubmittedRef.current = false;
              setGameOver(false);
              setScore(0);
              setCombo(0);
            }}
            className="px-3 py-1.5 rounded-lg text-xs bg-[#a855f7] text-white font-semibold hover:bg-[#9333ea] transition"
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
                gameRef.current = initGameState();
                animRef.current.targetBgHue = 270;
                animRef.current.resultFadeIn = 0;
                scoreSubmittedRef.current = false;
                startGame();
              }}
              className="px-6 py-2.5 rounded-xl bg-[#a855f7] text-white font-bold text-sm hover:bg-[#9333ea] transition shadow-lg shadow-[#a855f7]/25"
            >
              再来一局
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          判断文字颜色与文字含义是否一致 · 限时{GAME_TIME}秒 · 键盘 ←/→ 或 A/D
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
