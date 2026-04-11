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
interface Fish {
  name: string;
  emoji: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  weight: string;
  price: number;
  chance: number;
}

interface CaughtFish extends Fish {
  actualWeight: string;
}

interface SwimmingFish {
  x: number;
  y: number;
  vx: number;
  size: number;
  color: string;
  wobble: number;
  wobbleSpeed: number;
  depth: number; // 0-1 for parallax
}

interface GameState {
  gold: number;
  bait: number;
  collection: string[];    // fish names collected
  caught: CaughtFish[];    // recent catches
  totalGold: number;       // total gold earned (score)
  phase: "idle" | "casting" | "waiting" | "bite" | "reeling" | "caught" | "missed";
  castTime: number;        // time since cast
  biteDelay: number;       // random delay before bite
  biteTimer: number;       // time window to reel in
  currentFish: Fish | null;
  paused: boolean;
  over: boolean;
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  waveOffset: number;
  lineY: number;           // fishing line end Y
  lineTargetY: number;
  bobberBob: number;       // bobber bobbing animation
  catchScale: number;      // scale animation for catch display
  catchFadeIn: number;     // fade in for catch result
  alertPulse: number;      // pulse for bite alert
  swimmingFish: SwimmingFish[];
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "fishing";
const CANVAS_H = 360;
const WATER_START = 100;   // Y where water begins
const BITE_WINDOW = 2.0;   // seconds to tap after bite
const MIN_BITE_DELAY = 1.5;
const MAX_BITE_DELAY = 3.5;
const MAX_SWIMMING_FISH = 12;

const FISH_POOL: Fish[] = [
  { name: "鲫鱼", emoji: "🐟", rarity: "common", weight: "0.3-1.2kg", price: 5, chance: 30 },
  { name: "草鱼", emoji: "🐠", rarity: "common", weight: "1-3kg", price: 10, chance: 25 },
  { name: "鲤鱼", emoji: "🐡", rarity: "common", weight: "0.5-2kg", price: 8, chance: 20 },
  { name: "鲈鱼", emoji: "🎣", rarity: "rare", weight: "1-4kg", price: 25, chance: 10 },
  { name: "金枪鱼", emoji: "🦈", rarity: "rare", weight: "5-20kg", price: 50, chance: 7 },
  { name: "河豚", emoji: "🐡", rarity: "epic", weight: "0.5-2kg", price: 100, chance: 4 },
  { name: "龙虾", emoji: "🦞", rarity: "epic", weight: "0.8-3kg", price: 80, chance: 3 },
  { name: "金龙鱼", emoji: "✨", rarity: "legendary", weight: "2-5kg", price: 500, chance: 0.8 },
  { name: "美人鱼", emoji: "🧜", rarity: "legendary", weight: "???", price: 1000, chance: 0.2 },
];

const RARITY_COLORS: Record<string, string> = {
  common: "#aaaaaa",
  rare: "#3ea6ff",
  epic: "#a855f7",
  legendary: "#f0b90b",
};

const RARITY_LABELS: Record<string, string> = {
  common: "普通",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
};

const RARITY_CSS: Record<string, string> = {
  common: "text-[#aaa]",
  rare: "text-[#3ea6ff]",
  epic: "text-[#a855f7]",
  legendary: "text-[#f0b90b]",
};

const RARITY_BG: Record<string, string> = {
  common: "border-[#333]",
  rare: "border-[#3ea6ff]/30",
  epic: "border-[#a855f7]/30",
  legendary: "border-[#f0b90b]/30 bg-[#f0b90b]/5",
};

// ─── Game Logic (Pure Functions) ─────────────────────────
function rollFish(): Fish {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const f of FISH_POOL) {
    cumulative += f.chance;
    if (roll < cumulative) return f;
  }
  return FISH_POOL[0];
}

function generateWeight(fish: Fish): string {
  if (fish.weight.includes("?")) return "???";
  const parts = fish.weight.replace("kg", "").split("-");
  const min = Number(parts[0]);
  const max = Number(parts[1]);
  return (min + Math.random() * (max - min)).toFixed(1) + "kg";
}

function initGameState(): GameState {
  return {
    gold: 0,
    bait: 20,
    collection: [],
    caught: [],
    totalGold: 0,
    phase: "idle",
    castTime: 0,
    biteDelay: 0,
    biteTimer: 0,
    currentFish: null,
    paused: false,
    over: false,
  };
}

function createSwimmingFish(w: number, h: number): SwimmingFish {
  const depth = 0.3 + Math.random() * 0.7;
  const rarityRoll = Math.random();
  let color: string;
  if (rarityRoll < 0.6) color = RARITY_COLORS.common;
  else if (rarityRoll < 0.85) color = RARITY_COLORS.rare;
  else if (rarityRoll < 0.95) color = RARITY_COLORS.epic;
  else color = RARITY_COLORS.legendary;

  return {
    x: Math.random() < 0.5 ? -20 : w + 20,
    y: WATER_START + 30 + Math.random() * (h - WATER_START - 60),
    vx: (Math.random() < 0.5 ? 1 : -1) * (15 + Math.random() * 35) * depth,
    size: 6 + depth * 10,
    color,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 2 + Math.random() * 3,
    depth,
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

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, WATER_START);
  skyGrad.addColorStop(0, `hsl(${anim.bgHue}, 60%, 12%)`);
  skyGrad.addColorStop(1, `hsl(${anim.bgHue + 10}, 50%, 8%)`);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, WATER_START);

  // Water gradient
  const waterGrad = ctx.createLinearGradient(0, WATER_START, 0, h);
  waterGrad.addColorStop(0, "rgba(10, 60, 120, 0.95)");
  waterGrad.addColorStop(0.5, "rgba(5, 35, 80, 0.98)");
  waterGrad.addColorStop(1, "rgba(2, 15, 40, 1)");
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, WATER_START, w, h - WATER_START);

  // Apply shake
  applyShake(ctx, anim.shake);

  // Animated waves
  ctx.save();
  for (let layer = 0; layer < 3; layer++) {
    const alpha = 0.15 - layer * 0.04;
    const speed = 1 + layer * 0.5;
    const amplitude = 4 + layer * 2;
    ctx.beginPath();
    ctx.moveTo(0, WATER_START);
    for (let x = 0; x <= w; x += 4) {
      const y = WATER_START + Math.sin((x * 0.02) + anim.waveOffset * speed + layer * 2) * amplitude
        + Math.sin((x * 0.01) + anim.waveOffset * speed * 0.7) * amplitude * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = `rgba(62, 166, 255, ${alpha})`;
    ctx.fill();
  }
  ctx.restore();

  // Swimming fish (behind fishing line)
  for (const sf of anim.swimmingFish) {
    const wobbleY = Math.sin(sf.wobble) * 3 * sf.depth;
    const fx = sf.x;
    const fy = sf.y + wobbleY;
    const facing = sf.vx > 0 ? 1 : -1;

    ctx.save();
    ctx.globalAlpha = 0.3 + sf.depth * 0.5;
    ctx.translate(fx, fy);
    ctx.scale(facing, 1);

    // Fish body (ellipse)
    ctx.beginPath();
    ctx.ellipse(0, 0, sf.size, sf.size * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = sf.color;
    ctx.fill();

    // Tail
    ctx.beginPath();
    ctx.moveTo(-sf.size, 0);
    ctx.lineTo(-sf.size - sf.size * 0.5, -sf.size * 0.4);
    ctx.lineTo(-sf.size - sf.size * 0.5, sf.size * 0.4);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.beginPath();
    ctx.arc(sf.size * 0.4, -sf.size * 0.1, sf.size * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    ctx.restore();
  }

  // Fishing rod + line
  const rodX = w / 2;
  const rodTipY = 20;

  if (game.phase !== "idle") {
    // Rod (simple line from top)
    ctx.strokeStyle = "#8B7355";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rodX - 30, -5);
    ctx.lineTo(rodX, rodTipY);
    ctx.stroke();

    // Fishing line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rodX, rodTipY);
    ctx.lineTo(rodX, anim.lineY);
    ctx.stroke();

    // Bobber
    const bobberY = Math.min(anim.lineY, WATER_START + 10);
    const bobY = bobberY + Math.sin(anim.bobberBob) * 3;

    // Bobber body
    ctx.beginPath();
    ctx.arc(rodX, bobY, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4444";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rodX, bobY - 4, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Line from bobber to hook
    if (anim.lineY > bobberY + 10) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(rodX, bobY + 5);
      ctx.lineTo(rodX, anim.lineY);
      ctx.stroke();

      // Hook
      ctx.strokeStyle = "#ccc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rodX + 3, anim.lineY, 4, -Math.PI * 0.5, Math.PI, false);
      ctx.stroke();
    }
  }

  // Bite alert
  if (game.phase === "bite") {
    const pulse = 0.5 + 0.5 * Math.sin(anim.alertPulse * 8);
    const alertY = WATER_START - 30;

    // Exclamation mark
    drawGlow(ctx, rodX, alertY, 30, "#ff4444", pulse * 0.6);
    ctx.save();
    ctx.font = `bold ${20 + pulse * 6}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(255, 68, 68, ${0.7 + pulse * 0.3})`;
    ctx.fillText("❗ 上钩了！", rodX, alertY);
    ctx.restore();

    // Timer bar
    const barW = 120;
    const barH = 6;
    const barX = rodX - barW / 2;
    const barY = alertY + 18;
    const remaining = Math.max(0, game.biteTimer / BITE_WINDOW);

    drawRoundedRect(ctx, barX, barY, barW, barH, 3);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();

    drawRoundedRect(ctx, barX, barY, barW * remaining, barH, 3);
    ctx.fillStyle = remaining > 0.3 ? "#22c55e" : "#ff4444";
    ctx.fill();
  }

  // Waiting text
  if (game.phase === "waiting") {
    const dots = ".".repeat(1 + Math.floor(anim.time * 2) % 3);
    ctx.save();
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(62, 166, 255, 0.7)";
    ctx.fillText(`等待鱼上钩${dots}`, rodX, WATER_START - 15);
    ctx.restore();
  }

  // Catch result display
  if (game.phase === "caught" && game.currentFish) {
    const fish = game.currentFish;
    const cy = h / 2 - 20;
    const scale = easeOutQuad(Math.min(1, anim.catchScale));
    const alpha = Math.min(1, anim.catchFadeIn);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(rodX, cy);
    ctx.scale(scale, scale);

    // Glow behind fish
    drawGlow(ctx, 0, 0, 60, RARITY_COLORS[fish.rarity], 0.5);

    // Fish emoji
    ctx.font = "40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fish.emoji, 0, -10);

    // Fish name
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = RARITY_COLORS[fish.rarity];
    ctx.fillText(fish.name, 0, 25);

    // Rarity + price
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#8a8a8a";
    ctx.fillText(`${RARITY_LABELS[fish.rarity]} · +${fish.price}金`, 0, 45);

    ctx.restore();
  }

  // Miss display
  if (game.phase === "missed") {
    const alpha = Math.min(1, anim.catchFadeIn);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff6b6b";
    ctx.fillText("鱼跑了！", rodX, h / 2 - 10);
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "#8a8a8a";
    ctx.fillText("下次手速快一点", rodX, h / 2 + 15);
    ctx.restore();
  }

  // Idle prompt
  if (game.phase === "idle" && game.bait > 0) {
    const pulse = 0.6 + 0.4 * Math.sin(anim.time * 2);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#8a8a8a";
    ctx.fillText("点击「抛竿」开始钓鱼", rodX, h / 2);
    ctx.restore();
  }

  // Particles
  particles.render(ctx);

  // Score popups
  renderScorePopups(ctx, anim.scorePopups);

  // Pause overlay
  if (game.paused) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, "⏸ 已暂停", w / 2, h / 2, w * 0.8, "#ffffff", 28);
    drawText(ctx, "点击继续", w / 2, h / 2 + 36, w * 0.6, "#8a8a8a", 14);
  }

  ctx.restore();
}


// ─── Component ───────────────────────────────────────────
export default function FishingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 210,
    targetBgHue: 210,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    waveOffset: 0,
    lineY: 20,
    lineTargetY: 20,
    bobberBob: 0,
    catchScale: 0,
    catchFadeIn: 0,
    alertPulse: 0,
    swimmingFish: [],
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);
  const phaseTimerRef = useRef<number>(0); // for auto-transitions

  // React UI state (only for elements outside canvas)
  const [gold, setGold] = useState(0);
  const [bait, setBait] = useState(20);
  const [totalGold, setTotalGold] = useState(0);
  const [collectionSize, setCollectionSize] = useState(0);
  const [phase, setPhase] = useState<GameState["phase"]>("idle");
  const [lastCatch, setLastCatch] = useState<CaughtFish | null>(null);
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

  // Sync UI from game state
  const syncUI = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setGold(g.gold);
    setBait(g.bait);
    setTotalGold(g.totalGold);
    setCollectionSize(g.collection.length);
    setPhase(g.phase);
    setPaused(g.paused);
  }, []);

  // Init game
  const initGame = useCallback(() => {
    gameRef.current = initGameState();
    const anim = animRef.current;
    anim.scorePopups = [];
    anim.shake = { time: 0, intensity: 0 };
    anim.lineY = 20;
    anim.lineTargetY = 20;
    anim.catchScale = 0;
    anim.catchFadeIn = 0;
    anim.targetBgHue = 210;
    particlesRef.current?.clear();
    scoreSubmittedRef.current = false;
    phaseTimerRef.current = 0;
    setLastCatch(null);
    syncUI();
    forceUpdate(n => n + 1);
  }, [syncUI]);

  // Cast line
  const castLine = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.paused) return;
    if (game.phase !== "idle" && game.phase !== "caught" && game.phase !== "missed") return;
    if (game.bait <= 0) return;

    game.bait--;
    game.phase = "casting";
    game.castTime = 0;
    game.biteDelay = MIN_BITE_DELAY + Math.random() * (MAX_BITE_DELAY - MIN_BITE_DELAY);
    game.biteTimer = BITE_WINDOW;
    game.currentFish = null;

    const anim = animRef.current;
    anim.lineTargetY = WATER_START + 60 + Math.random() * 80;
    anim.catchScale = 0;
    anim.catchFadeIn = 0;
    phaseTimerRef.current = 0;

    // Splash particles at water surface
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      particlesRef.current?.emit(w / 2, WATER_START + 10, {
        count: 15,
        color: ["#3ea6ff", "#65b8ff", "#ffffff"],
        speed: [40, 100],
        size: [2, 4],
        life: [0.3, 0.7],
        angle: [-Math.PI, 0],
        gravity: 80,
      });
    }

    soundRef.current?.playTone(300, 0.15, "sine"); // cast sound
    syncUI();
  }, [syncUI]);

  // Reel in (tap during bite)
  const reelIn = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.phase !== "bite" || game.paused) return;

    const fish = rollFish();
    const actualWeight = generateWeight(fish);
    const caught: CaughtFish = { ...fish, actualWeight };

    game.currentFish = fish;
    game.gold += fish.price;
    game.totalGold += fish.price;
    game.phase = "caught";
    if (!game.collection.includes(fish.name)) {
      game.collection.push(fish.name);
    }
    game.caught.unshift(caught);
    if (game.caught.length > 20) game.caught.pop();

    const anim = animRef.current;
    anim.catchScale = 0;
    anim.catchFadeIn = 0;
    anim.targetBgHue = 120; // green for catch
    anim.shake = { time: 0.3, intensity: 4 };
    phaseTimerRef.current = 0;

    // Celebration particles
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cx = w / 2;
      const cy = h / 2 - 20;

      if (fish.rarity === "legendary") {
        particlesRef.current?.emitCelebration(cx, cy);
        particlesRef.current?.emitCelebration(cx - 40, cy - 20);
        particlesRef.current?.emitCelebration(cx + 40, cy - 20);
      } else if (fish.rarity === "epic") {
        particlesRef.current?.emitExplosion(cx, cy, RARITY_COLORS.epic, 30);
      } else {
        particlesRef.current?.emitExplosion(cx, cy, RARITY_COLORS[fish.rarity], 15);
      }

      // Score popup
      anim.scorePopups.push({
        x: cx,
        y: cy - 50,
        value: fish.price,
        life: 1.5,
        combo: 1,
      });
    }

    // Sound based on rarity
    if (fish.rarity === "legendary") {
      soundRef.current?.playLevelUp();
    } else if (fish.rarity === "epic") {
      soundRef.current?.playCombo(3);
    } else {
      soundRef.current?.playScore(fish.price);
    }

    setLastCatch(caught);
    syncUI();

    // Submit score
    submitScore(game.totalGold);
  }, [syncUI, submitScore]);

  // Buy bait
  const buyBait = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.gold < 20) return;
    game.gold -= 20;
    game.bait += 10;
    soundRef.current?.playClick();
    syncUI();
  }, [syncUI]);

  // Toggle pause
  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.paused = !game.paused;
    setPaused(game.paused);
  }, []);

  // Save/Load
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      gold: game.gold,
      bait: game.bait,
      collection: [...game.collection],
      caught: game.caught.slice(0, 10).map(c => ({
        name: c.name, emoji: c.emoji, rarity: c.rarity,
        weight: c.weight, price: c.price, chance: c.chance,
        actualWeight: c.actualWeight,
      })),
      totalGold: game.totalGold,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        gold: number; bait: number; collection: string[];
        caught: CaughtFish[]; totalGold: number;
      };
      if (!d || typeof d.gold !== "number" || typeof d.bait !== "number" || !Array.isArray(d.collection)) return;
      const game = gameRef.current;
      if (!game) return;
      game.gold = d.gold;
      game.bait = d.bait;
      game.collection = d.collection;
      game.caught = Array.isArray(d.caught) ? d.caught : [];
      game.totalGold = d.totalGold || 0;
      game.phase = "idle";
      game.paused = false;
      game.currentFish = null;
      animRef.current.scorePopups = [];
      animRef.current.lineY = 20;
      animRef.current.lineTargetY = 20;
      animRef.current.targetBgHue = 210;
      particlesRef.current?.clear();
      scoreSubmittedRef.current = false;
      if (d.caught && d.caught.length > 0) {
        setLastCatch(d.caught[0]);
      }
      syncUI();
      forceUpdate(n => n + 1);
    } catch { /* ignore malformed data */ }
  }, [syncUI]);

  // ─── Animation Loop ──────────────────────────────────────
  useEffect(() => {
    initGame();
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
      const h = CANVAS_H;
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
        anim.waveOffset += dt;
        anim.bobberBob += dt * 3;

        // Smooth line movement
        anim.lineY = lerp(anim.lineY, anim.lineTargetY, 0.08);

        // Update shake
        updateShake(anim.shake, dt);

        // Update score popups
        updateScorePopups(anim.scorePopups, dt);

        // Update particles
        particlesRef.current?.update(dt);

        // Smooth bg hue
        anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.03);

        // Swimming fish
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;

        // Spawn new fish
        if (anim.swimmingFish.length < MAX_SWIMMING_FISH && Math.random() < dt * 0.8) {
          anim.swimmingFish.push(createSwimmingFish(cw, ch));
        }

        // Update swimming fish
        let fi = anim.swimmingFish.length;
        while (fi-- > 0) {
          const sf = anim.swimmingFish[fi];
          sf.x += sf.vx * dt;
          sf.wobble += sf.wobbleSpeed * dt;
          // Remove if off screen
          if ((sf.vx > 0 && sf.x > cw + 30) || (sf.vx < 0 && sf.x < -30)) {
            anim.swimmingFish[fi] = anim.swimmingFish[anim.swimmingFish.length - 1];
            anim.swimmingFish.pop();
          }
        }

        // Phase state machine
        if (game.phase === "casting") {
          game.castTime += dt;
          if (game.castTime > 0.5) {
            game.phase = "waiting";
            game.castTime = 0;
            anim.targetBgHue = 210;
            syncUI();
          }
        } else if (game.phase === "waiting") {
          game.castTime += dt;
          if (game.castTime >= game.biteDelay) {
            game.phase = "bite";
            game.biteTimer = BITE_WINDOW;
            anim.alertPulse = 0;
            soundRef.current?.playTone(800, 0.1, "square"); // bite alert
            syncUI();
          }
        } else if (game.phase === "bite") {
          game.biteTimer -= dt;
          anim.alertPulse += dt;
          if (game.biteTimer <= 0) {
            // Missed!
            game.phase = "missed";
            anim.lineTargetY = 20;
            anim.catchFadeIn = 0;
            anim.targetBgHue = 0; // red tint
            phaseTimerRef.current = 0;
            soundRef.current?.playError();
            syncUI();
          }
        } else if (game.phase === "caught") {
          anim.catchScale = Math.min(1, anim.catchScale + dt * 4);
          anim.catchFadeIn = Math.min(1, anim.catchFadeIn + dt * 3);
          phaseTimerRef.current += dt;
          anim.lineTargetY = 20;
          // Auto return to idle after 2.5s
          if (phaseTimerRef.current > 2.5) {
            game.phase = "idle";
            anim.targetBgHue = 210;
            syncUI();
          }
        } else if (game.phase === "missed") {
          anim.catchFadeIn = Math.min(1, anim.catchFadeIn + dt * 3);
          phaseTimerRef.current += dt;
          if (phaseTimerRef.current > 2.0) {
            game.phase = "idle";
            anim.targetBgHue = 210;
            syncUI();
          }
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
  }, [syncUI]);

  // ─── Input ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTap = () => {
      const game = gameRef.current;
      if (!game) return;
      if (game.paused) {
        togglePause();
        return;
      }
      if (game.phase === "bite") {
        reelIn();
      }
    };

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      handleTap();
    };

    canvas.addEventListener("click", onClick);

    const input = new InputHandler(canvas);
    input.onTap(() => handleTap());
    input.preventDefaults();
    inputRef.current = input;

    return () => {
      canvas.removeEventListener("click", onClick);
      input.dispose();
    };
  }, [reelIn, togglePause]);

  // Keyboard: space to cast or reel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const game = gameRef.current;
        if (!game) return;
        if (game.phase === "bite") {
          reelIn();
        } else if (game.phase === "idle" || game.phase === "caught" || game.phase === "missed") {
          castLine();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [reelIn, castLine]);

  // ─── Tab visibility auto-pause ─────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.hidden && gameRef.current) {
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

  const restart = useCallback(() => {
    initGame();
  }, [initGame]);

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
            <span className="text-[#3ea6ff]">🎣 钓鱼达人</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">金币</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{gold}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">鱼饵</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{bait}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">图鉴</div>
              <div className="font-bold text-[#aaa] text-sm tabular-nums">{collectionSize}/{FISH_POOL.length}</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex gap-1.5">
            <button
              onClick={castLine}
              disabled={bait <= 0 || (phase !== "idle" && phase !== "caught" && phase !== "missed")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                bait <= 0 || (phase !== "idle" && phase !== "caught" && phase !== "missed")
                  ? "bg-[#333] text-[#666]"
                  : "bg-[#3ea6ff] text-[#0f0f0f] hover:bg-[#65b8ff] active:scale-95"
              }`}
            >
              🎣 抛竿
            </button>
            <button
              onClick={buyBait}
              disabled={gold < 20}
              className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                gold < 20
                  ? "border-[#333] text-[#666]"
                  : "border-[#f0b90b]/30 text-[#f0b90b] hover:bg-[#f0b90b]/10"
              }`}
            >
              买饵(20金)
            </button>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={togglePause}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
            >
              {paused ? "▶" : "⏸"}
            </button>
            <button
              onClick={() => { soundRef.current?.toggleMute(); forceUpdate(n => n + 1); }}
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

        {/* Bite prompt */}
        {phase === "bite" && (
          <div className="text-center mt-2 animate-pulse">
            <button
              onClick={reelIn}
              className="px-6 py-2.5 rounded-xl bg-[#ff4444] text-white font-bold text-sm hover:bg-[#ff6666] active:scale-95 transition"
            >
              🐟 快拉！收竿！
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-2">
          抛竿后等待鱼上钩 · 出现提示时快速点击收竿 · 空格键/回车也可操作
        </p>

        {/* Fish Encyclopedia */}
        <h3 className="text-sm font-bold mt-4 mb-2">
          <span className="text-[#f0b90b]">📖</span> 鱼类图鉴
        </h3>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {FISH_POOL.map(f => {
            const collected = gameRef.current?.collection.includes(f.name);
            return (
              <div
                key={f.name}
                className={`p-2 rounded-lg border text-center ${
                  collected ? RARITY_BG[f.rarity] : "border-[#333] opacity-40"
                }`}
              >
                <div className="text-xl">{collected ? f.emoji : "❓"}</div>
                <p className={`text-[10px] font-bold ${collected ? RARITY_CSS[f.rarity] : "text-[#666]"}`}>
                  {collected ? f.name : "???"}
                </p>
              </div>
            );
          })}
        </div>

        {/* Recent catches */}
        {gameRef.current && gameRef.current.caught.length > 0 && (
          <>
            <h3 className="text-sm font-bold mb-2">
              <span className="text-[#3ea6ff]">📋</span> 最近钓获
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {gameRef.current.caught.slice(0, 10).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] p-1.5 rounded-lg bg-[#1a1a1a]">
                  <span>{f.emoji}</span>
                  <span className={`font-bold ${RARITY_CSS[f.rarity]}`}>{f.name}</span>
                  <span className="text-[#8a8a8a]">{f.actualWeight}</span>
                  <span className="text-[#f0b90b] ml-auto">+{f.price}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Leaderboard & Save/Load */}
        <div className="mt-4 space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
