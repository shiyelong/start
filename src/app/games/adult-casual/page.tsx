"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import GameSaveLoad from "@/components/GameSaveLoad";
import GameLeaderboard from "@/components/GameLeaderboard";
import Link from "next/link";
import {
  ChevronLeft, Volume2, VolumeX, Lock, Play, RotateCcw,
  Gamepad2, Brain, Zap, Target
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-casual";
const W = 420, H = 520;
const PRIMARY = "#3ea6ff", BG = "#0f0f0f";

// ─── Types ───────────────────────────────────────────────────────────────────
type Phase = "title" | "playing" | "gameover";
type MiniGame = "memory" | "reaction" | "whack";
type Difficulty = "easy" | "normal" | "hard";

// ─── Memory Card Types ───────────────────────────────────────────────────────
interface MemCard {
  id: number;
  pairId: number;
  color: string;
  pattern: number; // 0-7 pattern type
  flipped: boolean;
  matched: boolean;
}

// ─── Reaction Test Types ─────────────────────────────────────────────────────
interface ReactionState {
  round: number;
  maxRounds: number;
  phase: "wait" | "ready" | "go" | "result";
  targetX: number;
  targetY: number;
  targetSize: number;
  startTime: number;
  times: number[];
  waitDuration: number;
}

// ─── Whack-a-Mole Types ─────────────────────────────────────────────────────
interface MoleCell {
  active: boolean;
  timer: number;
  hit: boolean;
  hitTimer: number;
}

interface WhackState {
  grid: MoleCell[];
  score: number;
  misses: number;
  timeLeft: number;
  spawnTimer: number;
  spawnInterval: number;
  moleDuration: number;
}

// ─── Card Colors & Patterns ──────────────────────────────────────────────────
const CARD_PAIRS = [
  { color: "#ff4757", pattern: 0 },
  { color: "#3ea6ff", pattern: 1 },
  { color: "#ffa502", pattern: 2 },
  { color: "#2ed573", pattern: 3 },
  { color: "#a55eea", pattern: 4 },
  { color: "#ff6b81", pattern: 5 },
  { color: "#1e90ff", pattern: 6 },
  { color: "#f0b90b", pattern: 7 },
];

// ─── Difficulty Settings ─────────────────────────────────────────────────────
const DIFF_SETTINGS: Record<Difficulty, {
  memFlipTime: number;
  reactionRounds: number;
  reactionMinWait: number;
  reactionMaxWait: number;
  reactionTargetSize: number;
  whackTime: number;
  whackSpawnInterval: number;
  whackMoleDuration: number;
  scoreMultiplier: number;
}> = {
  easy: {
    memFlipTime: 1200,
    reactionRounds: 8,
    reactionMinWait: 1500,
    reactionMaxWait: 3500,
    reactionTargetSize: 50,
    whackTime: 35,
    whackSpawnInterval: 1.2,
    whackMoleDuration: 1.5,
    scoreMultiplier: 0.8,
  },
  normal: {
    memFlipTime: 800,
    reactionRounds: 10,
    reactionMinWait: 1000,
    reactionMaxWait: 4000,
    reactionTargetSize: 40,
    whackTime: 30,
    whackSpawnInterval: 0.9,
    whackMoleDuration: 1.1,
    scoreMultiplier: 1.0,
  },
  hard: {
    memFlipTime: 500,
    reactionRounds: 12,
    reactionMinWait: 800,
    reactionMaxWait: 5000,
    reactionTargetSize: 30,
    whackTime: 25,
    whackSpawnInterval: 0.6,
    whackMoleDuration: 0.7,
    scoreMultiplier: 1.5,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createMemoryCards(): MemCard[] {
  const cards: MemCard[] = [];
  for (let i = 0; i < 8; i++) {
    const pair = CARD_PAIRS[i];
    cards.push({ id: i * 2, pairId: i, color: pair.color, pattern: pair.pattern, flipped: false, matched: false });
    cards.push({ id: i * 2 + 1, pairId: i, color: pair.color, pattern: pair.pattern, flipped: false, matched: false });
  }
  return shuffle(cards);
}

function createWhackGrid(): MoleCell[] {
  return Array.from({ length: 9 }, () => ({ active: false, timer: 0, hit: false, hitTimer: 0 }));
}

function initReaction(diff: Difficulty): ReactionState {
  const s = DIFF_SETTINGS[diff];
  return {
    round: 0,
    maxRounds: s.reactionRounds,
    phase: "wait",
    targetX: W / 2,
    targetY: H / 2,
    targetSize: s.reactionTargetSize,
    startTime: 0,
    times: [],
    waitDuration: s.reactionMinWait + Math.random() * (s.reactionMaxWait - s.reactionMinWait),
  };
}

function initWhack(diff: Difficulty): WhackState {
  const s = DIFF_SETTINGS[diff];
  return {
    grid: createWhackGrid(),
    score: 0,
    misses: 0,
    timeLeft: s.whackTime,
    spawnTimer: 0.5,
    spawnInterval: s.whackSpawnInterval,
    moleDuration: s.whackMoleDuration,
  };
}

// ─── Canvas Drawing Helpers ──────────────────────────────────────────────────
function drawPattern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, pattern: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const cx = x + size / 2, cy = y + size / 2;
  const r = size * 0.3;

  switch (pattern) {
    case 0: // circle
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      break;
    case 1: // diamond
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
      break;
    case 2: // triangle
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.7); ctx.lineTo(cx - r, cy + r * 0.7); ctx.closePath(); ctx.fill();
      break;
    case 3: // cross
      ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
      break;
    case 4: // star
      for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * Math.PI / 180;
        const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle);
        if (i === 0) ctx.beginPath();
        const inner = (i * 72 + 36 - 90) * Math.PI / 180;
        ctx.lineTo(px, py);
        ctx.lineTo(cx + r * 0.4 * Math.cos(inner), cy + r * 0.4 * Math.sin(inner));
      }
      ctx.closePath(); ctx.fill();
      break;
    case 5: // square
      ctx.fillRect(cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4);
      break;
    case 6: // ring
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke();
      break;
    case 7: // hexagon
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 30) * Math.PI / 180;
        const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      break;
  }
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fill();
}


// ─── Component ───────────────────────────────────────────────────────────────
export default function AdultCasual() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const lastRef = useRef(0);

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [currentGame, setCurrentGame] = useState<MiniGame>("memory");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [totalScore, setTotalScore] = useState(0);

  // Memory state
  const [memCards, setMemCards] = useState<MemCard[]>(() => createMemoryCards());
  const [memFlipped, setMemFlipped] = useState<number[]>([]);
  const [memLocked, setMemLocked] = useState(false);
  const [memMoves, setMemMoves] = useState(0);
  const [memScore, setMemScore] = useState(0);

  // Reaction state
  const [reaction, setReaction] = useState<ReactionState>(() => initReaction("normal"));
  const [reactionScore, setReactionScore] = useState(0);

  // Whack state
  const [whack, setWhack] = useState<WhackState>(() => initWhack("normal"));
  const [whackScore, setWhackScore] = useState(0);

  // Refs for render loop
  const stateRef = useRef({
    phase, currentGame, difficulty, muted, totalScore,
    memCards, memFlipped, memLocked, memMoves, memScore,
    reaction, reactionScore,
    whack, whackScore,
  });

  useEffect(() => {
    stateRef.current = {
      phase, currentGame, difficulty, muted, totalScore,
      memCards, memFlipped, memLocked, memMoves, memScore,
      reaction, reactionScore,
      whack, whackScore,
    };
  });

  // ─── Age Gate ──────────────────────────────────────────────────────────────
  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  // ─── Sound ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playSound = useCallback((type: "move" | "click" | "score" | "levelUp" | "gameOver" | "error" | "combo") => {
    if (!soundRef.current || stateRef.current.muted) return;
    const s = soundRef.current;
    switch (type) {
      case "move": s.playMove(); break;
      case "click": s.playClick(); break;
      case "score": s.playScore(100); break;
      case "levelUp": s.playLevelUp(); break;
      case "gameOver": s.playGameOver(); break;
      case "error": s.playError(); break;
      case "combo": s.playCombo(3); break;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(m ?? false);
  }, []);

  // ─── Start Mini Game ───────────────────────────────────────────────────────
  const startMiniGame = useCallback((game: MiniGame, diff: Difficulty) => {
    setCurrentGame(game);
    setDifficulty(diff);
    setPhase("playing");
    lastRef.current = 0;

    if (game === "memory") {
      setMemCards(createMemoryCards());
      setMemFlipped([]);
      setMemLocked(false);
      setMemMoves(0);
      setMemScore(0);
    } else if (game === "reaction") {
      const r = initReaction(diff);
      r.phase = "wait";
      r.waitDuration = DIFF_SETTINGS[diff].reactionMinWait + Math.random() * (DIFF_SETTINGS[diff].reactionMaxWait - DIFF_SETTINGS[diff].reactionMinWait);
      setReaction(r);
      setReactionScore(0);
    } else if (game === "whack") {
      setWhack(initWhack(diff));
      setWhackScore(0);
    }
    playSound("click");
  }, [playSound]);

  // ─── Memory Card Click ─────────────────────────────────────────────────────
  const handleMemoryClick = useCallback((cardIdx: number) => {
    const s = stateRef.current;
    if (s.phase !== "playing" || s.currentGame !== "memory" || s.memLocked) return;
    const card = s.memCards[cardIdx];
    if (!card || card.flipped || card.matched) return;
    if (s.memFlipped.includes(cardIdx)) return;

    playSound("click");
    const newCards = [...s.memCards];
    newCards[cardIdx] = { ...newCards[cardIdx], flipped: true };
    const newFlipped = [...s.memFlipped, cardIdx];
    setMemCards(newCards);
    setMemFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMemLocked(true);
      setMemMoves(prev => prev + 1);
      const [i1, i2] = newFlipped;
      const c1 = newCards[i1], c2 = newCards[i2];

      if (c1.pairId === c2.pairId) {
        // Match!
        setTimeout(() => {
          setMemCards(prev => prev.map((c, i) =>
            i === i1 || i === i2 ? { ...c, matched: true } : c
          ));
          setMemFlipped([]);
          setMemLocked(false);
          const mult = DIFF_SETTINGS[stateRef.current.difficulty].scoreMultiplier;
          const pts = Math.floor(100 * mult);
          setMemScore(prev => prev + pts);
          playSound("score");

          // Check win
          const allMatched = stateRef.current.memCards.every((c, idx) =>
            c.matched || idx === i1 || idx === i2
          );
          if (allMatched) {
            const bonus = Math.max(0, Math.floor((200 - stateRef.current.memMoves * 10) * mult));
            const finalScore = stateRef.current.memScore + pts + bonus;
            setMemScore(finalScore);
            setTotalScore(prev => prev + finalScore);
            setTimeout(() => {
              setPhase("gameover");
              playSound("combo");
            }, 300);
          }
        }, DIFF_SETTINGS[stateRef.current.difficulty].memFlipTime);
      } else {
        // No match
        setTimeout(() => {
          setMemCards(prev => prev.map((c, i) =>
            i === i1 || i === i2 ? { ...c, flipped: false } : c
          ));
          setMemFlipped([]);
          setMemLocked(false);
          playSound("error");
        }, DIFF_SETTINGS[stateRef.current.difficulty].memFlipTime);
      }
    }
  }, [playSound]);

  // ─── Reaction Click ────────────────────────────────────────────────────────
  const handleReactionClick = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "playing" || s.currentGame !== "reaction") return;
    const r = s.reaction;

    if (r.phase === "wait") {
      // Start the round - begin waiting for target
      const diff = s.difficulty;
      const settings = DIFF_SETTINGS[diff];
      setReaction(prev => ({
        ...prev,
        phase: "ready",
        startTime: performance.now(),
        waitDuration: settings.reactionMinWait + Math.random() * (settings.reactionMaxWait - settings.reactionMinWait),
      }));
      playSound("click");
    } else if (r.phase === "ready") {
      // Clicked too early!
      playSound("error");
      setReaction(prev => ({
        ...prev,
        phase: "wait",
        times: [...prev.times, 9999], // penalty
      }));
    } else if (r.phase === "go") {
      // Hit the target!
      const reactionTime = performance.now() - r.startTime;
      const newTimes = [...r.times, reactionTime];
      playSound("score");

      const mult = DIFF_SETTINGS[s.difficulty].scoreMultiplier;
      const pts = Math.floor(Math.max(10, (1000 - reactionTime) * 0.5) * mult);
      setReactionScore(prev => prev + pts);

      if (newTimes.length >= r.maxRounds) {
        // Game over
        const validTimes = newTimes.filter(t => t < 9000);
        const avg = validTimes.length > 0 ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length : 9999;
        const bonus = Math.floor(Math.max(0, (500 - avg) * 2) * mult);
        const finalScore = stateRef.current.reactionScore + pts + bonus;
        setReactionScore(finalScore);
        setTotalScore(prev => prev + finalScore);
        setReaction(prev => ({ ...prev, phase: "result", times: newTimes }));
        setTimeout(() => {
          setPhase("gameover");
          playSound("combo");
        }, 500);
      } else {
        setReaction(prev => ({
          ...prev,
          phase: "wait",
          round: prev.round + 1,
          times: newTimes,
        }));
      }
    }
  }, [playSound]);

  // ─── Whack Click ───────────────────────────────────────────────────────────
  const handleWhackClick = useCallback((cellIdx: number) => {
    const s = stateRef.current;
    if (s.phase !== "playing" || s.currentGame !== "whack") return;
    const cell = s.whack.grid[cellIdx];
    if (!cell || !cell.active || cell.hit) return;

    playSound("score");
    const mult = DIFF_SETTINGS[s.difficulty].scoreMultiplier;
    const pts = Math.floor(50 * mult);

    setWhack(prev => {
      const newGrid = [...prev.grid];
      newGrid[cellIdx] = { ...newGrid[cellIdx], hit: true, hitTimer: 0.3 };
      return { ...prev, grid: newGrid, score: prev.score + pts };
    });
    setWhackScore(prev => prev + pts);
  }, [playSound]);

  // ─── Save / Load ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    return {
      totalScore,
      memScore,
      reactionScore,
      whackScore,
      difficulty,
    };
  }, [totalScore, memScore, reactionScore, whackScore, difficulty]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    setTotalScore((d.totalScore as number) || 0);
    setMemScore((d.memScore as number) || 0);
    setReactionScore((d.reactionScore as number) || 0);
    setWhackScore((d.whackScore as number) || 0);
    setDifficulty((d.difficulty as Difficulty) || "normal");
    setPhase("title");
    playSound("click");
  }, [playSound]);

  // ─── Game Loop (Reaction timer + Whack update) ────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const loop = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const dt = Math.min((ts - lastRef.current) / 1000, 0.05);
      lastRef.current = ts;
      const s = stateRef.current;
      frameRef.current++;

      // Update reaction timer
      if (s.phase === "playing" && s.currentGame === "reaction" && s.reaction.phase === "ready") {
        const elapsed = performance.now() - s.reaction.startTime;
        if (elapsed >= s.reaction.waitDuration) {
          const settings = DIFF_SETTINGS[s.difficulty];
          const margin = 40;
          setReaction(prev => ({
            ...prev,
            phase: "go",
            startTime: performance.now(),
            targetX: margin + Math.random() * (W - margin * 2),
            targetY: 100 + Math.random() * (H - 200),
            targetSize: settings.reactionTargetSize,
          }));
        }
      }

      // Update whack-a-mole
      if (s.phase === "playing" && s.currentGame === "whack") {
        setWhack(prev => {
          const newState = { ...prev, timeLeft: prev.timeLeft - dt };
          if (newState.timeLeft <= 0) {
            setTotalScore(p => p + prev.score);
            setTimeout(() => {
              setPhase("gameover");
              playSound("gameOver");
            }, 100);
            return { ...newState, timeLeft: 0 };
          }

          const newGrid = prev.grid.map(cell => {
            const c = { ...cell };
            if (c.hit) {
              c.hitTimer -= dt;
              if (c.hitTimer <= 0) { c.hit = false; c.active = false; c.timer = 0; }
            } else if (c.active) {
              c.timer -= dt;
              if (c.timer <= 0) {
                c.active = false;
                newState.misses++;
              }
            }
            return c;
          });

          newState.spawnTimer -= dt;
          if (newState.spawnTimer <= 0) {
            newState.spawnTimer = prev.spawnInterval * (0.8 + Math.random() * 0.4);
            const inactive = newGrid.map((c, i) => (!c.active && !c.hit) ? i : -1).filter(i => i >= 0);
            if (inactive.length > 0) {
              const idx = inactive[Math.floor(Math.random() * inactive.length)];
              newGrid[idx] = { active: true, timer: prev.moleDuration, hit: false, hitTimer: 0 };
            }
          }

          return { ...newState, grid: newGrid };
        });
      }

      // Render
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      if (s.phase === "title") {
        renderTitle(ctx, frameRef.current);
      } else if (s.phase === "playing") {
        if (s.currentGame === "memory") renderMemory(ctx, s, frameRef.current);
        else if (s.currentGame === "reaction") renderReaction(ctx, s, frameRef.current);
        else if (s.currentGame === "whack") renderWhack(ctx, s, frameRef.current);
      } else if (s.phase === "gameover") {
        renderGameOver(ctx, s, frameRef.current);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playSound]);


  // ─── Canvas Click Handler ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (cx: number, cy: number) => {
      const s = stateRef.current;

      if (s.phase === "title") return; // handled by buttons

      if (s.phase === "gameover") return; // handled by buttons

      if (s.phase === "playing") {
        if (s.currentGame === "memory") {
          // Card grid: 4x4, starts at y=80
          const gridX = 20, gridY = 80;
          const cardW = (W - 60) / 4, cardH = (H - 180) / 4;
          const gap = 6;
          for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
              const x = gridX + col * (cardW + gap);
              const y = gridY + row * (cardH + gap);
              if (cx >= x && cx <= x + cardW && cy >= y && cy <= y + cardH) {
                handleMemoryClick(row * 4 + col);
                return;
              }
            }
          }
        } else if (s.currentGame === "reaction") {
          handleReactionClick();
        } else if (s.currentGame === "whack") {
          // 3x3 grid
          const gridSize = Math.min(W - 60, H - 160);
          const cellSize = gridSize / 3;
          const startX = (W - gridSize) / 2;
          const startY = 90;
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              const x = startX + col * cellSize;
              const y = startY + row * cellSize;
              if (cx >= x && cx <= x + cellSize && cy >= y && cy <= y + cellSize) {
                handleWhackClick(row * 3 + col);
                return;
              }
            }
          }
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (W / rect.width);
      const cy = (e.clientY - rect.top) * (H / rect.height);
      handleClick(cx, cy);
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = (e.changedTouches[0].clientX - rect.left) * (W / rect.width);
      const cy = (e.changedTouches[0].clientY - rect.top) * (H / rect.height);
      handleClick(cx, cy);
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchend", onTouch);
    };
  }, [handleMemoryClick, handleReactionClick, handleWhackClick]);

  // ─── Blocked ───────────────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Lock size={48} className="mx-auto text-gray-600 mb-4" />
          <h1 className="text-xl font-bold mb-2">访问受限</h1>
          <p className="text-gray-400">需要 NC-17 模式才能访问此内容。</p>
          <Link href="/zone/games" className="mt-4 inline-block text-[#3ea6ff]">返回</Link>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回
        </Link>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gamepad2 size={24} className="text-[#3ea6ff]" />
            <h1 className="text-xl font-bold">深夜游乐场</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800">NC-17</span>
          </div>
          <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-white/5 transition">
            {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
          <div>
            <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />

            {/* Title screen: game selection + difficulty */}
            {phase === "title" && (
              <div className="mt-4 space-y-3">
                <p className="text-center text-sm text-gray-400">选择小游戏</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { g: "memory" as MiniGame, label: "记忆翻牌", Icon: Brain, color: "#3ea6ff" },
                    { g: "reaction" as MiniGame, label: "反应测试", Icon: Zap, color: "#ffa502" },
                    { g: "whack" as MiniGame, label: "打地鼠", Icon: Target, color: "#2ed573" },
                  ]).map(({ g, label, Icon, color }) => (
                    <button key={g} onClick={() => setCurrentGame(g)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg text-xs font-medium transition border ${
                        currentGame === g
                          ? `border-[${color}]/60 bg-[${color}]/10 text-white`
                          : "border-white/10 text-gray-400 hover:bg-white/5"
                      }`}
                      style={currentGame === g ? { borderColor: `${color}60`, backgroundColor: `${color}15` } : {}}>
                      <Icon size={20} style={{ color }} />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-center text-sm text-gray-400 mt-2">选择难度</p>
                <div className="flex gap-2 justify-center">
                  {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => startMiniGame(currentGame, d)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
                        d === "easy" ? "border-green-700 text-green-400 hover:bg-green-900/30" :
                        d === "normal" ? "border-[#3ea6ff]/50 text-[#3ea6ff] hover:bg-[#3ea6ff]/10" :
                        "border-red-700 text-red-400 hover:bg-red-900/30"
                      }`}>
                      <Play size={14} className="inline mr-1" />
                      {d === "easy" ? "简单" : d === "normal" ? "普通" : "困难"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Game over buttons */}
            {phase === "gameover" && (
              <div className="mt-4 flex gap-2 justify-center">
                <button onClick={() => startMiniGame(currentGame, difficulty)}
                  className="flex items-center gap-1 px-4 py-2 bg-[#3ea6ff]/20 text-[#3ea6ff] rounded-lg text-sm hover:bg-[#3ea6ff]/30 transition border border-[#3ea6ff]/30">
                  <RotateCcw size={14} /> 再来一局
                </button>
                <button onClick={() => setPhase("title")}
                  className="flex items-center gap-1 px-4 py-2 bg-white/5 text-gray-400 rounded-lg text-sm hover:bg-white/10 transition border border-white/10">
                  返回标题
                </button>
              </div>
            )}

            {/* Score summary */}
            {phase === "title" && totalScore > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-[#1a1a1a] rounded-lg p-2 border border-white/5">
                  <Brain size={14} className="mx-auto text-[#3ea6ff] mb-1" />
                  <div className="text-[#3ea6ff] font-bold">{memScore}</div>
                  <div className="text-gray-500">翻牌</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 border border-white/5">
                  <Zap size={14} className="mx-auto text-[#ffa502] mb-1" />
                  <div className="text-[#ffa502] font-bold">{reactionScore}</div>
                  <div className="text-gray-500">反应</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 border border-white/5">
                  <Target size={14} className="mx-auto text-[#2ed573] mb-1" />
                  <div className="text-[#2ed573] font-bold">{whackScore}</div>
                  <div className="text-gray-500">地鼠</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 border border-white/5">
                  <Gamepad2 size={14} className="mx-auto text-[#f0b90b] mb-1" />
                  <div className="text-[#f0b90b] font-bold">{totalScore}</div>
                  <div className="text-gray-500">总分</div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Canvas Render Functions ─────────────────────────────────────────────────

function renderTitle(ctx: CanvasRenderingContext2D, f: number) {
  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0a1628");
  grad.addColorStop(1, BG);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Floating particles
  for (let i = 0; i < 12; i++) {
    const x = (W * 0.05 + i * W * 0.08 + Math.sin(f * 0.015 + i * 1.2) * 25) % W;
    const y = (H * 0.1 + Math.sin(f * 0.012 + i * 1.8) * 50 + i * 35) % H;
    const size = 3 + Math.sin(f * 0.025 + i) * 2;
    const alpha = 0.1 + 0.08 * Math.sin(f * 0.03 + i);
    ctx.fillStyle = `rgba(62, 166, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Title
  ctx.textAlign = "center";
  const glow = 0.7 + 0.3 * Math.sin(f * 0.04);
  ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("深夜游乐场", W / 2, H / 2 - 80);

  ctx.fillStyle = "#ff4757";
  ctx.font = "12px sans-serif";
  ctx.fillText("NC-17 成人休闲合集", W / 2, H / 2 - 50);

  ctx.fillStyle = "#aaa";
  ctx.font = "13px sans-serif";
  ctx.fillText("记忆翻牌 / 反应测试 / 打地鼠", W / 2, H / 2 - 25);

  // Game icons preview
  const icons = [
    { label: "记忆翻牌", color: "#3ea6ff", pattern: 1 },
    { label: "反应测试", color: "#ffa502", pattern: 0 },
    { label: "打地鼠", color: "#2ed573", pattern: 5 },
  ];
  for (let i = 0; i < 3; i++) {
    const ic = icons[i];
    const cx = W / 2 - 110 + i * 110;
    const cy = H / 2 + 30;
    const bob = Math.sin(f * 0.03 + i * 2) * 4;

    ctx.fillStyle = `${ic.color}22`;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `${ic.color}66`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    drawPattern(ctx, cx - 12, cy + bob - 12, 24, ic.pattern, ic.color);

    ctx.fillStyle = "#888";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ic.label, cx, cy + bob + 28);
  }

  // Prompt
  const promptAlpha = 0.5 + 0.5 * Math.sin(f * 0.06);
  ctx.fillStyle = `rgba(62, 166, 255, ${promptAlpha})`;
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("选择游戏和难度开始", W / 2, H / 2 + 100);
}

function renderMemory(ctx: CanvasRenderingContext2D, s: typeof stateRefType, f: number) {
  // Header bar
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, W, 65);
  ctx.textAlign = "left";
  ctx.fillStyle = "#3ea6ff";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("记忆翻牌", 15, 24);
  ctx.fillStyle = "#888";
  ctx.font = "12px sans-serif";
  ctx.fillText(`步数: ${s.memMoves}`, 15, 48);
  ctx.textAlign = "right";
  ctx.fillStyle = "#f0b90b";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(`${s.memScore} 分`, W - 15, 24);
  const matched = s.memCards.filter(c => c.matched).length;
  ctx.fillStyle = "#888";
  ctx.font = "12px sans-serif";
  ctx.fillText(`${matched / 2} / 8 对`, W - 15, 48);

  // Card grid 4x4
  const gridX = 20, gridY = 80;
  const gap = 6;
  const cardW = (W - 40 - gap * 3) / 4;
  const cardH = (H - 100 - gap * 3) / 4;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const idx = row * 4 + col;
      const card = s.memCards[idx];
      if (!card) continue;
      const x = gridX + col * (cardW + gap);
      const y = gridY + row * (cardH + gap);

      if (card.matched) {
        // Matched - faded
        ctx.fillStyle = "#1a2a1a";
        drawRoundedRect(ctx, x, y, cardW, cardH, 8);
        ctx.globalAlpha = 0.3;
        drawPattern(ctx, x, y, Math.min(cardW, cardH), card.pattern, card.color);
        ctx.globalAlpha = 1;
      } else if (card.flipped) {
        // Face up
        ctx.fillStyle = "#1a1a2e";
        drawRoundedRect(ctx, x, y, cardW, cardH, 8);
        ctx.strokeStyle = card.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, cardW, cardH, 8);
        ctx.stroke();
        drawPattern(ctx, x, y, Math.min(cardW, cardH), card.pattern, card.color);
      } else {
        // Face down
        const pulse = 0.8 + 0.2 * Math.sin(f * 0.03 + idx * 0.5);
        ctx.fillStyle = `rgba(62, 166, 255, ${0.08 * pulse})`;
        drawRoundedRect(ctx, x, y, cardW, cardH, 8);
        ctx.strokeStyle = `rgba(62, 166, 255, ${0.3 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, cardW, cardH, 8);
        ctx.stroke();
        // Question mark
        ctx.fillStyle = `rgba(62, 166, 255, ${0.4 * pulse})`;
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("?", x + cardW / 2, y + cardH / 2 + 7);
      }
    }
  }
}

function renderReaction(ctx: CanvasRenderingContext2D, s: typeof stateRefType, f: number) {
  const r = s.reaction;

  // Header bar
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, W, 65);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffa502";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("反应测试", 15, 24);
  ctx.fillStyle = "#888";
  ctx.font = "12px sans-serif";
  ctx.fillText(`第 ${r.times.length + 1} / ${r.maxRounds} 轮`, 15, 48);
  ctx.textAlign = "right";
  ctx.fillStyle = "#f0b90b";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(`${s.reactionScore} 分`, W - 15, 24);

  // Show last reaction time
  if (r.times.length > 0) {
    const last = r.times[r.times.length - 1];
    ctx.fillStyle = last >= 9000 ? "#ff4757" : "#2ed573";
    ctx.font = "12px sans-serif";
    ctx.fillText(last >= 9000 ? "太早了!" : `${Math.floor(last)}ms`, W - 15, 48);
  }

  if (r.phase === "wait") {
    // Waiting to start
    ctx.textAlign = "center";
    const alpha = 0.5 + 0.5 * Math.sin(f * 0.06);
    ctx.fillStyle = `rgba(62, 166, 255, ${alpha})`;
    ctx.font = "18px sans-serif";
    ctx.fillText("点击屏幕开始", W / 2, H / 2);
    ctx.fillStyle = "#666";
    ctx.font = "12px sans-serif";
    ctx.fillText("目标出现后尽快点击", W / 2, H / 2 + 30);
  } else if (r.phase === "ready") {
    // Waiting for target to appear
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4757";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("等待...", W / 2, H / 2);
    ctx.fillStyle = "#666";
    ctx.font = "12px sans-serif";
    ctx.fillText("目标出现前不要点击!", W / 2, H / 2 + 30);

    // Pulsing border
    const pulse = 0.3 + 0.3 * Math.sin(f * 0.08);
    ctx.strokeStyle = `rgba(255, 71, 87, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 75, W - 20, H - 85);
  } else if (r.phase === "go") {
    // Target visible!
    ctx.fillStyle = "#0a2a0a";
    ctx.fillRect(10, 75, W - 20, H - 85);

    // Target circle with pulse
    const pulse = 1 + 0.15 * Math.sin(f * 0.15);
    const size = r.targetSize * pulse;
    ctx.fillStyle = "#ffa502";
    ctx.beginPath();
    ctx.arc(r.targetX, r.targetY, size, 0, Math.PI * 2);
    ctx.fill();

    // Inner ring
    ctx.fillStyle = "#ff6348";
    ctx.beginPath();
    ctx.arc(r.targetX, r.targetY, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(r.targetX, r.targetY, size * 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#2ed573";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("点击!", W / 2, H - 20);
  }

  // Times history bar
  if (r.times.length > 0) {
    const barY = H - 50;
    const barH = 30;
    const barW = (W - 40) / r.maxRounds;
    for (let i = 0; i < r.times.length; i++) {
      const t = r.times[i];
      const x = 20 + i * barW;
      if (t >= 9000) {
        ctx.fillStyle = "#ff475744";
      } else {
        const ratio = Math.min(1, t / 1000);
        const g = Math.floor(255 * (1 - ratio));
        const red = Math.floor(255 * ratio);
        ctx.fillStyle = `rgba(${red}, ${g}, 50, 0.5)`;
      }
      ctx.fillRect(x + 1, barY, barW - 2, barH);
      ctx.fillStyle = "#fff";
      ctx.font = "8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t >= 9000 ? "X" : `${Math.floor(t)}`, x + barW / 2, barY + barH / 2 + 3);
    }
  }
}

function renderWhack(ctx: CanvasRenderingContext2D, s: typeof stateRefType, f: number) {
  const w = s.whack;

  // Header bar
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, W, 65);
  ctx.textAlign = "left";
  ctx.fillStyle = "#2ed573";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("打地鼠", 15, 24);
  ctx.fillStyle = "#888";
  ctx.font = "12px sans-serif";
  ctx.fillText(`得分: ${w.score}`, 15, 48);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ff4757";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(`${Math.ceil(w.timeLeft)}秒`, W - 15, 24);
  ctx.fillStyle = "#888";
  ctx.font = "12px sans-serif";
  ctx.fillText(`漏掉: ${w.misses}`, W - 15, 48);

  // Timer bar
  const timerW = W - 30;
  const timerRatio = Math.max(0, w.timeLeft / DIFF_SETTINGS[s.difficulty].whackTime);
  ctx.fillStyle = "#222";
  ctx.fillRect(15, 68, timerW, 6);
  ctx.fillStyle = timerRatio > 0.3 ? "#2ed573" : "#ff4757";
  ctx.fillRect(15, 68, timerW * timerRatio, 6);

  // 3x3 grid
  const gridSize = Math.min(W - 60, H - 160);
  const cellSize = gridSize / 3;
  const startX = (W - gridSize) / 2;
  const startY = 90;
  const cellGap = 4;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const cell = w.grid[idx];
      const x = startX + col * cellSize + cellGap;
      const y = startY + row * cellSize + cellGap;
      const sz = cellSize - cellGap * 2;

      // Cell background
      ctx.fillStyle = "#1a1a2e";
      drawRoundedRect(ctx, x, y, sz, sz, 10);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, sz, sz, 10);
      ctx.stroke();

      if (cell.hit) {
        // Hit animation
        ctx.fillStyle = "#2ed57344";
        drawRoundedRect(ctx, x, y, sz, sz, 10);
        ctx.strokeStyle = "#2ed573";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, sz, sz, 10);
        ctx.stroke();
        // Checkmark
        ctx.strokeStyle = "#2ed573";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + sz * 0.3, y + sz * 0.5);
        ctx.lineTo(x + sz * 0.45, y + sz * 0.65);
        ctx.lineTo(x + sz * 0.7, y + sz * 0.35);
        ctx.stroke();
      } else if (cell.active) {
        // Active mole
        const pulse = 0.9 + 0.1 * Math.sin(f * 0.15 + idx);
        const moleR = sz * 0.35 * pulse;
        const cx = x + sz / 2, cy2 = y + sz / 2;

        // Mole body
        ctx.fillStyle = "#8B4513";
        ctx.beginPath();
        ctx.arc(cx, cy2, moleR, 0, Math.PI * 2);
        ctx.fill();

        // Mole face
        ctx.fillStyle = "#D2691E";
        ctx.beginPath();
        ctx.arc(cx, cy2, moleR * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(cx - moleR * 0.25, cy2 - moleR * 0.15, moleR * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + moleR * 0.25, cy2 - moleR * 0.15, moleR * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = "#ff6b81";
        ctx.beginPath();
        ctx.arc(cx, cy2 + moleR * 0.1, moleR * 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Timer indicator
        const timeRatio = cell.timer / s.whack.moleDuration;
        ctx.strokeStyle = timeRatio > 0.3 ? "#ffa502" : "#ff4757";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy2, moleR + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timeRatio);
        ctx.stroke();
      } else {
        // Empty hole
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.ellipse(x + sz / 2, y + sz * 0.6, sz * 0.3, sz * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function renderGameOver(ctx: CanvasRenderingContext2D, s: typeof stateRefType, f: number) {
  // Dark overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";

  // Game name
  const gameLabel = s.currentGame === "memory" ? "记忆翻牌" : s.currentGame === "reaction" ? "反应测试" : "打地鼠";
  const gameColor = s.currentGame === "memory" ? "#3ea6ff" : s.currentGame === "reaction" ? "#ffa502" : "#2ed573";

  ctx.fillStyle = gameColor;
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("游戏结束", W / 2, H / 2 - 80);

  ctx.fillStyle = "#888";
  ctx.font = "14px sans-serif";
  ctx.fillText(gameLabel, W / 2, H / 2 - 50);

  // Score
  const currentScore = s.currentGame === "memory" ? s.memScore : s.currentGame === "reaction" ? s.reactionScore : s.whackScore;
  ctx.fillStyle = "#f0b90b";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText(`${currentScore}`, W / 2, H / 2);
  ctx.fillStyle = "#888";
  ctx.font = "12px sans-serif";
  ctx.fillText("分", W / 2, H / 2 + 20);

  // Stats
  if (s.currentGame === "memory") {
    ctx.fillStyle = "#aaa";
    ctx.font = "13px sans-serif";
    ctx.fillText(`用了 ${s.memMoves} 步完成`, W / 2, H / 2 + 50);
  } else if (s.currentGame === "reaction") {
    const validTimes = s.reaction.times.filter(t => t < 9000);
    const avg = validTimes.length > 0 ? Math.floor(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 0;
    const best = validTimes.length > 0 ? Math.floor(Math.min(...validTimes)) : 0;
    ctx.fillStyle = "#aaa";
    ctx.font = "13px sans-serif";
    ctx.fillText(`平均反应: ${avg}ms`, W / 2, H / 2 + 45);
    ctx.fillText(`最快: ${best}ms`, W / 2, H / 2 + 65);
  } else if (s.currentGame === "whack") {
    ctx.fillStyle = "#aaa";
    ctx.font = "13px sans-serif";
    ctx.fillText(`命中: ${s.whack.score / Math.floor(50 * DIFF_SETTINGS[s.difficulty].scoreMultiplier) || 0}`, W / 2, H / 2 + 45);
    ctx.fillText(`漏掉: ${s.whack.misses}`, W / 2, H / 2 + 65);
  }

  // Total score
  ctx.fillStyle = "#666";
  ctx.font = "12px sans-serif";
  ctx.fillText(`总分: ${s.totalScore}`, W / 2, H / 2 + 100);

  // Prompt
  const alpha = 0.5 + 0.5 * Math.sin(f * 0.06);
  ctx.fillStyle = `rgba(62, 166, 255, ${alpha})`;
  ctx.font = "14px sans-serif";
  ctx.fillText("点击下方按钮继续", W / 2, H / 2 + 130);
}

// Type helper for stateRef
type StateRefType = {
  phase: Phase; currentGame: MiniGame; difficulty: Difficulty; muted: boolean; totalScore: number;
  memCards: MemCard[]; memFlipped: number[]; memLocked: boolean; memMoves: number; memScore: number;
  reaction: ReactionState; reactionScore: number;
  whack: WhackState; whackScore: number;
};
const stateRefType: StateRefType = {} as StateRefType;
