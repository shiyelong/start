"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { ParticleSystem } from "@/lib/game-engine/particle-system";
import { InputHandler } from "@/lib/game-engine/input-handler";
import { easeOutQuad, easeInOutCubic, lerp } from "@/lib/game-engine/animation-utils";
import { drawGradientBackground, drawText, drawRoundedRect, drawGlow } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
interface Question {
  q: string;
  opts: string[];
  scores: number[];
}

interface ResultType {
  type: string;
  desc: string;
  hue: number;
  emoji: string;
}

interface QuizState {
  step: number;
  scores: number[];
  result: number | null;
  done: boolean;
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  // Transition between questions
  transition: number;       // 0 = idle, >0 = transitioning (0→1)
  transitionDir: 1 | -1;   // 1 = forward slide
  // Option hover/active
  hoverIdx: number;         // -1 = none
  activeIdx: number;        // -1 = none, index of pressed option
  activeTimer: number;      // flash timer for selected option
  // Result reveal
  resultReveal: number;     // 0→1 fade in
  resultScale: number;      // bounce scale
  // Restart button
  restartHover: boolean;
}

// ─── Quiz Data ───────────────────────────────────────────
const questions: Question[] = [
  { q: '周末你更喜欢？', opts: ['宅家看剧打游戏', '出门社交聚会', '独自去咖啡馆', '户外运动冒险'], scores: [0, 2, 1, 3] },
  { q: '朋友形容你最多的词是？', opts: ['有趣搞笑', '靠谱稳重', '有创意', '热情开朗'], scores: [1, 0, 3, 2] },
  { q: '选一个超能力？', opts: ['读心术', '时间暂停', '隐身', '飞行'], scores: [2, 0, 1, 3] },
  { q: '你的理想工作环境？', opts: ['安静的独立空间', '热闹的开放办公', '自由的远程办公', '经常出差的工作'], scores: [0, 2, 1, 3] },
  { q: '压力大的时候你会？', opts: ['打游戏/看视频', '找朋友倾诉', '独自散步思考', '运动发泄'], scores: [1, 2, 0, 3] },
  { q: '选一种动物代表你？', opts: ['猫咪', '金毛犬', '猫头鹰', '海豚'], scores: [0, 2, 1, 3] },
];

const results: ResultType[] = [
  { type: '冷静分析型', desc: '你是一个理性冷静的人，善于独立思考。你喜欢安静的环境，享受独处的时光。在朋友眼中你是最靠谱的存在。', hue: 210, emoji: '🧊' },
  { type: '创意艺术型', desc: '你充满创造力和想象力，总能看到别人看不到的角度。你的内心世界丰富多彩，是天生的艺术家。', hue: 280, emoji: '🎨' },
  { type: '社交达人型', desc: '你热情开朗，天生的社交高手。你喜欢热闹的氛围，总能成为人群中的焦点。朋友们都爱和你在一起。', hue: 25, emoji: '🌟' },
  { type: '冒险探索型', desc: '你充满好奇心和冒险精神，喜欢尝试新事物。你不满足于现状，总是在寻找下一个挑战。', hue: 150, emoji: '🚀' },
];

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "quiz";
const OPTION_RADIUS = 14;
const OPTION_GAP = 12;
const OPTION_HEIGHT = 52;
const PROGRESS_HEIGHT = 6;
const TRANSITION_DURATION = 0.35;
const ACTIVE_FLASH_DURATION = 0.25;
const RESULT_REVEAL_DURATION = 0.8;

// ─── Game Logic ──────────────────────────────────────────
function initQuizState(): QuizState {
  return { step: 0, scores: [0, 0, 0, 0], result: null, done: false };
}

function answerQuestion(state: QuizState, optIdx: number): QuizState {
  const ns = [...state.scores];
  ns[questions[state.step].scores[optIdx]]++;
  const nextStep = state.step + 1;
  if (nextStep >= questions.length) {
    const maxScore = Math.max(...ns);
    return { step: state.step, scores: ns, result: ns.indexOf(maxScore), done: true };
  }
  return { step: nextStep, scores: ns, result: null, done: false };
}

// ─── Layout helpers ──────────────────────────────────────
function getOptionRects(w: number, h: number, questionY: number): { x: number; y: number; w: number; h: number }[] {
  const padding = 20;
  const optW = Math.min(w - padding * 2, 380);
  const startX = (w - optW) / 2;
  const startY = questionY + 50;
  return questions[0].opts.map((_, i) => ({
    x: startX,
    y: startY + i * (OPTION_HEIGHT + OPTION_GAP),
    w: optW,
    h: OPTION_HEIGHT,
  }));
}

function getRestartRect(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const bw = 140;
  const bh = 44;
  return { x: (w - bw) / 2, y: h - 70, w: bw, h: bh };
}

// ─── Renderer ────────────────────────────────────────────
function renderQuiz(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  quiz: QuizState,
  anim: AnimState,
  particles: ParticleSystem,
  dpr: number,
): void {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  drawGradientBackground(ctx, w, h, anim.bgHue, 45);

  if (!quiz.done) {
    // ─── Question Screen ─────────────────────────────
    const transT = anim.transition > 0 ? easeInOutCubic(Math.min(1, anim.transition)) : 0;
    const slideOffset = transT * anim.transitionDir * -w * 0.3;
    const fadeAlpha = anim.transition > 0 ? 1 - transT : 1;

    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    ctx.translate(slideOffset, 0);

    // Progress bar
    const progressY = 16;
    const progressW = Math.min(w - 40, 380);
    const progressX = (w - progressW) / 2;
    const progress = (quiz.step + 1) / questions.length;

    // Progress bg
    drawRoundedRect(ctx, progressX, progressY, progressW, PROGRESS_HEIGHT, 3);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fill();

    // Progress fill
    const fillW = progressW * progress;
    if (fillW > 0) {
      drawRoundedRect(ctx, progressX, progressY, fillW, PROGRESS_HEIGHT, 3);
      ctx.fillStyle = "#f0b90b";
      ctx.fill();
    }

    // Step indicator
    ctx.fillStyle = "#8a8a8a";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${quiz.step + 1} / ${questions.length}`, w / 2, progressY + PROGRESS_HEIGHT + 16);

    // Question text
    const questionY = progressY + PROGRESS_HEIGHT + 44;
    drawText(ctx, questions[quiz.step].q, w / 2, questionY, w * 0.85, "#ffffff", 22);

    // Option buttons
    const optRects = getOptionRects(w, h, questionY);
    const opts = questions[quiz.step].opts;

    for (let i = 0; i < opts.length; i++) {
      const r = optRects[i];
      const isHover = anim.hoverIdx === i;
      const isActive = anim.activeIdx === i;

      // Active flash
      let flashAlpha = 0;
      if (isActive && anim.activeTimer > 0) {
        flashAlpha = Math.sin(anim.activeTimer / ACTIVE_FLASH_DURATION * Math.PI) * 0.6;
      }

      // Button background
      drawRoundedRect(ctx, r.x, r.y, r.w, r.h, OPTION_RADIUS);
      if (isActive) {
        ctx.fillStyle = `rgba(240, 185, 11, ${0.15 + flashAlpha})`;
      } else if (isHover) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      }
      ctx.fill();

      // Border
      drawRoundedRect(ctx, r.x, r.y, r.w, r.h, OPTION_RADIUS);
      if (isActive) {
        ctx.strokeStyle = `rgba(240, 185, 11, ${0.8 + flashAlpha * 0.2})`;
        ctx.lineWidth = 2;
      } else if (isHover) {
        ctx.strokeStyle = "rgba(240, 185, 11, 0.3)";
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      // Option label with number
      const label = `${String.fromCharCode(65 + i)}. ${opts[i]}`;
      ctx.fillStyle = isActive ? "#f0b90b" : "#e0e0e0";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, r.x + 18, r.y + r.h / 2);
    }

    ctx.restore();
  } else {
    // ─── Result Screen ───────────────────────────────
    const revealT = easeOutQuad(Math.min(1, anim.resultReveal));
    const resultIdx = quiz.result ?? 0;
    const res = results[resultIdx];

    ctx.save();
    ctx.globalAlpha = revealT;

    // Result card background with gradient
    const cardW = Math.min(w - 32, 360);
    const cardH = 280;
    const cardX = (w - cardW) / 2;
    const cardY = 30;

    // Card glow
    drawGlow(ctx, w / 2, cardY + cardH / 2, cardW * 0.7, `hsl(${res.hue}, 70%, 50%)`, revealT * 0.3);

    // Card
    const scale = 0.9 + 0.1 * revealT;
    ctx.save();
    ctx.translate(w / 2, cardY + cardH / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -(cardY + cardH / 2));

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 20);
    const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    grad.addColorStop(0, `hsla(${res.hue}, 60%, 35%, 0.9)`);
    grad.addColorStop(1, `hsla(${res.hue}, 50%, 18%, 0.95)`);
    ctx.fillStyle = grad;
    ctx.fill();

    // Card border
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.strokeStyle = `hsla(${res.hue}, 60%, 50%, 0.4)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Emoji
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(res.emoji, w / 2, cardY + 55);

    // Type name
    drawText(ctx, res.type, w / 2, cardY + 110, cardW * 0.8, "#ffffff", 26);

    // Description - word wrap
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const descMaxW = cardW - 40;
    const descLines = wrapText(ctx, res.desc, descMaxW);
    const descStartY = cardY + 140;
    for (let i = 0; i < descLines.length; i++) {
      ctx.fillText(descLines[i], w / 2, descStartY + i * 20);
    }

    ctx.restore(); // scale

    // Restart button
    const btn = getRestartRect(w, h);
    drawRoundedRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    if (anim.restartHover) {
      ctx.fillStyle = "#f5cc3a";
    } else {
      ctx.fillStyle = "#f0b90b";
    }
    ctx.fill();
    drawText(ctx, "重新测试", btn.x + btn.w / 2, btn.y + btn.h / 2, btn.w * 0.8, "#0f0f0f", 15);

    ctx.restore(); // globalAlpha
  }

  // Particles always on top
  particles.render(ctx);

  ctx.restore();
}

// ─── Text wrapping helper ────────────────────────────────
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const test = current + text[i];
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = text[i];
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Component ───────────────────────────────────────────
export default function QuizGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quizRef = useRef<QuizState>(initQuizState());
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 260,
    targetBgHue: 260,
    transition: 0,
    transitionDir: 1,
    hoverIdx: -1,
    activeIdx: -1,
    activeTimer: 0,
    resultReveal: 0,
    resultScale: 1,
    restartHover: false,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const pendingAnswerRef = useRef<number>(-1);

  const [resultType, setResultType] = useState<string | null>(null);

  // Initialize sound + particles
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
  }, []);

  // Handle option tap
  const handleTap = useCallback((cx: number, cy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const quiz = quizRef.current;
    const anim = animRef.current;

    if (quiz.done) {
      // Check restart button
      const btn = getRestartRect(w, h);
      if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
        soundRef.current?.playClick();
        quizRef.current = initQuizState();
        anim.resultReveal = 0;
        anim.targetBgHue = 260;
        anim.transition = 0;
        anim.activeIdx = -1;
        anim.hoverIdx = -1;
        particlesRef.current?.clear();
        setResultType(null);
      }
      return;
    }

    // Don't accept taps during transition
    if (anim.transition > 0 || pendingAnswerRef.current >= 0) return;

    // Check option rects
    const progressY = 16;
    const questionY = progressY + PROGRESS_HEIGHT + 44;
    const optRects = getOptionRects(w, h, questionY);

    for (let i = 0; i < optRects.length; i++) {
      const r = optRects[i];
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        soundRef.current?.playClick();
        anim.activeIdx = i;
        anim.activeTimer = ACTIVE_FLASH_DURATION;
        pendingAnswerRef.current = i;

        // Spark at tap position
        particlesRef.current?.emitSpark(cx, cy, "#f0b90b");
        break;
      }
    }
  }, []);

  // Handle mouse move for hover
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const quiz = quizRef.current;
    const anim = animRef.current;

    if (quiz.done) {
      const btn = getRestartRect(w, h);
      anim.restartHover = cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h;
      canvas.style.cursor = anim.restartHover ? "pointer" : "default";
      return;
    }

    const progressY = 16;
    const questionY = progressY + PROGRESS_HEIGHT + 44;
    const optRects = getOptionRects(w, h, questionY);
    let found = -1;
    for (let i = 0; i < optRects.length; i++) {
      const r = optRects[i];
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        found = i;
        break;
      }
    }
    anim.hoverIdx = found;
    canvas.style.cursor = found >= 0 ? "pointer" : "default";
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
      const h = Math.max(480, Math.min(w * 1.4, 640));
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
      const quiz = quizRef.current;

      anim.time += dt;

      // Active flash timer
      if (anim.activeTimer > 0) {
        anim.activeTimer -= dt;
        if (anim.activeTimer <= 0) {
          anim.activeTimer = 0;
          // Process pending answer after flash
          if (pendingAnswerRef.current >= 0) {
            const optIdx = pendingAnswerRef.current;
            pendingAnswerRef.current = -1;
            const newState = answerQuestion(quiz, optIdx);

            if (newState.done) {
              // Show result
              quizRef.current = newState;
              anim.transition = 0;
              anim.activeIdx = -1;
              anim.resultReveal = 0;
              const res = results[newState.result ?? 0];
              anim.targetBgHue = res.hue;
              setResultType(res.type);
            } else {
              // Transition to next question
              quizRef.current = newState;
              anim.transition = 0.001; // start transition
              anim.transitionDir = 1;
              anim.activeIdx = -1;
            }
          }
        }
      }

      // Question transition
      if (anim.transition > 0 && anim.transition < 1) {
        anim.transition += dt / TRANSITION_DURATION;
        if (anim.transition >= 1) {
          anim.transition = 0;
        }
      }

      // Result reveal
      if (quiz.done && anim.resultReveal < 1) {
        anim.resultReveal += dt / RESULT_REVEAL_DURATION;
        if (anim.resultReveal >= 0.3 && anim.resultReveal - dt / RESULT_REVEAL_DURATION < 0.3) {
          // Trigger celebration particles at ~30% reveal
          const dpr = window.devicePixelRatio || 1;
          const cw = canvas.width / dpr;
          const ch = canvas.height / dpr;
          particlesRef.current?.emitCelebration(cw / 2, 160);
          particlesRef.current?.emitCelebration(cw / 2 - 80, 120);
          particlesRef.current?.emitCelebration(cw / 2 + 80, 120);
          soundRef.current?.playLevelUp();
        }
        if (anim.resultReveal > 1) anim.resultReveal = 1;
      }

      // Smooth bg hue
      anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.04);

      // Update particles
      particlesRef.current?.update(dt);

      // Render
      const dpr = window.devicePixelRatio || 1;
      renderQuiz(ctx, canvas, quiz, anim, particlesRef.current!, dpr);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ─── Input ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse click
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleTap(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousemove", handleMouseMove);

    // Touch tap
    const input = new InputHandler(canvas);
    input.onTap((x, y) => handleTap(x, y));
    input.preventDefaults();
    inputRef.current = input;

    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousemove", handleMouseMove);
      input.dispose();
    };
  }, [handleTap, handleMouseMove]);

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

        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">
            <span className="text-[#c084fc]">🔮 性格测试</span>
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => soundRef.current?.toggleMute()}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
            >
              {soundRef.current?.isMuted() ? "🔇" : "🔊"}
            </button>
          </div>
        </div>

        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl"
            style={{ touchAction: "none" }}
          />
        </div>

        {resultType && (
          <p className="text-center text-[10px] text-[#666] mt-3">
            你的性格类型：{resultType} · 点击"重新测试"再试一次
          </p>
        )}

        {!resultType && (
          <p className="text-center text-[10px] text-[#666] mt-3">
            选择最符合你的选项 · 共{questions.length}道题
          </p>
        )}
      </main>
    </>
  );
}
