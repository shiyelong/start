"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { InputHandler } from "@/lib/game-engine/input-handler";
import { lerp, updateShake, updateScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

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
  depth: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
  gravity: number;
}

interface GameState {
  gold: number;
  bait: number;
  collection: string[];
  caught: CaughtFish[];
  totalGold: number;
  phase: "idle" | "casting" | "waiting" | "bite" | "reeling" | "caught" | "missed";
  castTime: number;
  biteDelay: number;
  biteTimer: number;
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
  particles: Particle[];
  waveOffset: number;
  lineY: number;
  lineTargetY: number;
  bobberBob: number;
  catchScale: number;
  catchFadeIn: number;
  alertPulse: number;
  swimmingFish: SwimmingFish[];
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "fishing";
const CANVAS_H = 360;
const WATER_START = 100;
const BITE_WINDOW = 2.0;
const MIN_BITE_DELAY = 1.5;
const MAX_BITE_DELAY = 3.5;
const MAX_SWIMMING_FISH = 12;
const MAX_PARTICLES = 120;

const FISH_POOL: Fish[] = [
  { name: "鲫鱼", emoji: "F1", rarity: "common", weight: "0.3-1.2kg", price: 5, chance: 30 },
  { name: "草鱼", emoji: "F2", rarity: "common", weight: "1-3kg", price: 10, chance: 25 },
  { name: "鲤鱼", emoji: "F3", rarity: "common", weight: "0.5-2kg", price: 8, chance: 20 },
  { name: "鲈鱼", emoji: "?", rarity: "rare", weight: "1-4kg", price: 25, chance: 10 },
  { name: "金枪鱼", emoji: "F4", rarity: "rare", weight: "5-20kg", price: 50, chance: 7 },
  { name: "河豚", emoji: "F3", rarity: "epic", weight: "0.5-2kg", price: 100, chance: 4 },
  { name: "龙虾", emoji: "?", rarity: "epic", weight: "0.8-3kg", price: 80, chance: 3 },
  { name: "金龙鱼", emoji: "?", rarity: "legendary", weight: "2-5kg", price: 500, chance: 0.8 },
  { name: "美人鱼", emoji: "?", rarity: "legendary", weight: "???", price: 1000, chance: 0.2 },
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

function spawnParticles(
  particles: Particle[], x: number, y: number,
  colors: string[], count: number,
  opts?: { speed?: [number, number]; size?: [number, number]; life?: [number, number]; angle?: [number, number]; gravity?: number },
) {
  const [sMin, sMax] = opts?.speed ?? [40, 100];
  const [szMin, szMax] = opts?.size ?? [2, 4];
  const [lMin, lMax] = opts?.life ?? [0.3, 0.7];
  const [aMin, aMax] = opts?.angle ?? [0, Math.PI * 2];
  const grav = opts?.gravity ?? 0;
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = aMin + Math.random() * (aMax - aMin);
    const speed = sMin + Math.random() * (sMax - sMin);
    const life = lMin + Math.random() * (lMax - lMin);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life, maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: szMin + Math.random() * (szMax - szMin),
      gravity: grav,
    });
  }
}

function spawnCelebration(particles: Particle[], cx: number, cy: number) {
  const colors = ["#ff4444", "#f0b90b", "#3ea6ff", "#a855f7", "#22c55e", "#ffffff"];
  spawnParticles(particles, cx, cy, colors, 30, {
    speed: [80, 200], size: [2, 5], life: [0.5, 1.2], gravity: 120,
  });
}

// ─── PixiJS Renderer ─────────────────────────────────────
function colorToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

function drawGamePixi(
  g: PixiGraphics,
  texts: Map<string, PixiText>,
  game: GameState,
  anim: AnimState,
  w: number,
  h: number,
): void {
  g.clear();
  texts.forEach(t => { t.visible = false; });

  const showText = (key: string, text: string, x: number, y: number, ax = 0, ay = 0, alpha = 1) => {
    const t = texts.get(key);
    if (!t) return;
    t.text = text; t.x = x; t.y = y; t.anchor.set(ax, ay); t.alpha = alpha; t.visible = true;
  };

  // Shake offset
  let shakeX = 0, shakeY = 0;
  if (anim.shake.time > 0) {
    const mag = anim.shake.intensity * (anim.shake.time / Math.max(anim.shake.time + 0.001, 1));
    shakeX = (Math.random() * 2 - 1) * mag;
    shakeY = (Math.random() * 2 - 1) * mag;
  }

  // Sky background (approximate gradient with bands)
  const skyHue = anim.bgHue;
  // Top sky
  g.rect(shakeX, shakeY, w, WATER_START).fill({ color: colorToNum(hslToHex(skyHue, 60, 12)) });

  // Water background
  g.rect(shakeX, WATER_START + shakeY, w, h - WATER_START).fill({ color: 0x0a3c78 });
  // Deeper water
  g.rect(shakeX, WATER_START + (h - WATER_START) * 0.5 + shakeY, w, (h - WATER_START) * 0.5).fill({ color: 0x052350, alpha: 0.8 });
  g.rect(shakeX, h - 40 + shakeY, w, 40).fill({ color: 0x020f28, alpha: 0.6 });

  // Animated waves (simplified with rects for performance)
  for (let layer = 0; layer < 3; layer++) {
    const alpha = 0.15 - layer * 0.04;
    const speed = 1 + layer * 0.5;
    const amplitude = 4 + layer * 2;
    for (let x = 0; x < w; x += 8) {
      const waveY = WATER_START + Math.sin((x * 0.02) + anim.waveOffset * speed + layer * 2) * amplitude
        + Math.sin((x * 0.01) + anim.waveOffset * speed * 0.7) * amplitude * 0.5;
      g.rect(x + shakeX, waveY + shakeY, 8, h - waveY).fill({ color: 0x3ea6ff, alpha });
    }
  }

  // Swimming fish
  for (const sf of anim.swimmingFish) {
    const wobbleY = Math.sin(sf.wobble) * 3 * sf.depth;
    const fx = sf.x + shakeX;
    const fy = sf.y + wobbleY + shakeY;
    const fishAlpha = 0.3 + sf.depth * 0.5;
    const fc = colorToNum(sf.color);

    // Fish body (ellipse approximated with circle)
    g.ellipse(fx, fy, sf.size, sf.size * 0.5).fill({ color: fc, alpha: fishAlpha });

    // Tail
    const dir = sf.vx > 0 ? -1 : 1;
    const tx = fx + dir * sf.size;
    g.moveTo(tx, fy)
      .lineTo(tx + dir * sf.size * 0.5, fy - sf.size * 0.4)
      .lineTo(tx + dir * sf.size * 0.5, fy + sf.size * 0.4)
      .closePath().fill({ color: fc, alpha: fishAlpha });

    // Eye
    const ex = fx + (sf.vx > 0 ? 1 : -1) * sf.size * 0.4;
    g.circle(ex, fy - sf.size * 0.1, sf.size * 0.12).fill({ color: 0xffffff, alpha: fishAlpha });
  }

  // Fishing rod + line
  const rodX = w / 2;
  const rodTipY = 20;

  if (game.phase !== "idle") {
    // Rod
    g.moveTo(rodX - 30 + shakeX, -5 + shakeY)
      .lineTo(rodX + shakeX, rodTipY + shakeY)
      .stroke({ color: 0x8b7355, width: 3 });

    // Fishing line
    g.moveTo(rodX + shakeX, rodTipY + shakeY)
      .lineTo(rodX + shakeX, anim.lineY + shakeY)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.5 });

    // Bobber
    const bobberY = Math.min(anim.lineY, WATER_START + 10);
    const bobY = bobberY + Math.sin(anim.bobberBob) * 3;

    g.circle(rodX + shakeX, bobY + shakeY, 5).fill({ color: 0xff4444 });
    g.circle(rodX + shakeX, bobY - 4 + shakeY, 3).fill({ color: 0xffffff });

    // Line from bobber to hook
    if (anim.lineY > bobberY + 10) {
      g.moveTo(rodX + shakeX, bobY + 5 + shakeY)
        .lineTo(rodX + shakeX, anim.lineY + shakeY)
        .stroke({ color: 0xffffff, width: 0.5, alpha: 0.3 });

      // Hook (small arc approximated)
      const hx = rodX + 3 + shakeX;
      const hy = anim.lineY + shakeY;
      g.moveTo(hx, hy - 4)
        .lineTo(hx + 3, hy)
        .lineTo(hx, hy + 4)
        .lineTo(hx - 2, hy + 2)
        .stroke({ color: 0xcccccc, width: 1.5 });
    }
  }

  // Bite alert
  if (game.phase === "bite") {
    const pulse = 0.5 + 0.5 * Math.sin(anim.alertPulse * 8);
    const alertY = WATER_START - 30;

    // Glow circle
    g.circle(rodX + shakeX, alertY + shakeY, 30).fill({ color: 0xff4444, alpha: pulse * 0.3 });

    // Alert text
    showText("alert_text", "! 上钩了！", rodX + shakeX, alertY + shakeY, 0.5, 0.5, 0.7 + pulse * 0.3);

    // Timer bar
    const barW = 120;
    const barH = 6;
    const barX = rodX - barW / 2 + shakeX;
    const barY = alertY + 18 + shakeY;
    const remaining = Math.max(0, game.biteTimer / BITE_WINDOW);

    g.roundRect(barX, barY, barW, barH, 3).fill({ color: 0x000000, alpha: 0.5 });
    if (remaining > 0) {
      g.roundRect(barX, barY, barW * remaining, barH, 3).fill({ color: remaining > 0.3 ? 0x22c55e : 0xff4444 });
    }
  }

  // Waiting text
  if (game.phase === "waiting") {
    const dots = ".".repeat(1 + Math.floor(anim.time * 2) % 3);
    showText("waiting_text", `等待鱼上钩${dots}`, rodX + shakeX, WATER_START - 15 + shakeY, 0.5, 0.5, 0.7);
  }

  // Catch result display
  if (game.phase === "caught" && game.currentFish) {
    const fish = game.currentFish;
    const cy = h / 2 - 20;
    const alpha = Math.min(1, anim.catchFadeIn);

    // Glow
    g.circle(rodX + shakeX, cy + shakeY, 60).fill({ color: colorToNum(RARITY_COLORS[fish.rarity]), alpha: alpha * 0.3 });

    // Fish emoji
    showText("catch_emoji", fish.emoji, rodX + shakeX, cy - 10 + shakeY, 0.5, 0.5, alpha);
    // Fish name
    showText("catch_name", fish.name, rodX + shakeX, cy + 25 + shakeY, 0.5, 0.5, alpha);
    // Rarity + price
    showText("catch_info", `${RARITY_LABELS[fish.rarity]} · +${fish.price}金`, rodX + shakeX, cy + 45 + shakeY, 0.5, 0.5, alpha);
  }

  // Miss display
  if (game.phase === "missed") {
    const alpha = Math.min(1, anim.catchFadeIn);
    showText("miss_text", "鱼跑了！", rodX + shakeX, h / 2 - 10 + shakeY, 0.5, 0.5, alpha);
    showText("miss_hint", "下次手速快一点", rodX + shakeX, h / 2 + 15 + shakeY, 0.5, 0.5, alpha);
  }

  // Idle prompt
  if (game.phase === "idle" && game.bait > 0) {
    const pulse = 0.6 + 0.4 * Math.sin(anim.time * 2);
    showText("idle_text", "点击「抛竿」开始钓鱼", rodX + shakeX, h / 2 + shakeY, 0.5, 0.5, pulse);
  }

  // Particles
  for (const p of anim.particles) {
    if (p.life <= 0) continue;
    g.circle(p.x + shakeX, p.y + shakeY, p.size).fill({ color: colorToNum(p.color), alpha: Math.max(0, p.life / p.maxLife) });
  }

  // Score popups
  for (const p of anim.scorePopups) {
    if (p.life <= 0) continue;
    const progress = 1 - p.life;
    const floatY = p.y - progress * 40;
    const popAlpha = Math.max(0, Math.min(1, p.life));
    let text = `+${p.value}`;
    if (p.combo > 1) text += ` x${p.combo}`;
    showText("popup_0", text, p.x + shakeX, floatY + shakeY, 0.5, 0.5, popAlpha);
  }

  // Pause overlay
  if (game.paused) {
    g.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.6 });
    showText("pause_title", "⏸ 已暂停", w / 2, h / 2, 0.5, 0.5);
    showText("pause_hint", "点击继续", w / 2, h / 2 + 36, 0.5, 0.5, 0.7);
  }
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
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
    particles: [],
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
  const inputRef = useRef<InputHandler>(null!);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const scoreSubmittedRef = useRef(false);
  const phaseTimerRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // React UI state (only for elements outside canvas)
  const [gold, setGold] = useState(0);
  const [bait, setBait] = useState(20);
  const [totalGold, setTotalGold] = useState(0);
  const [collectionSize, setCollectionSize] = useState(0);
  const [phase, setPhase] = useState<GameState["phase"]>("idle");
  const [lastCatch, setLastCatch] = useState<CaughtFish | null>(null);
  const [paused, setPaused] = useState(false);
  const [, forceUpdate] = useState(0);

  // Initialize sound
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
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
    anim.particles = [];
    anim.shake = { time: 0, intensity: 0 };
    anim.lineY = 20;
    anim.lineTargetY = 20;
    anim.catchScale = 0;
    anim.catchFadeIn = 0;
    anim.targetBgHue = 210;
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
      const cw = canvas.width / dpr;
      spawnParticles(anim.particles, cw / 2, WATER_START + 10,
        ["#3ea6ff", "#65b8ff", "#ffffff"], 15,
        { speed: [40, 100], size: [2, 4], life: [0.3, 0.7], angle: [-Math.PI, 0], gravity: 80 },
      );
    }

    soundRef.current?.playTone(300, 0.15, "sine");
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
    anim.targetBgHue = 120;
    anim.shake = { time: 0.3, intensity: 4 };
    phaseTimerRef.current = 0;

    // Celebration particles
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      const cx = cw / 2;
      const cy = ch / 2 - 20;

      if (fish.rarity === "legendary") {
        spawnCelebration(anim.particles, cx, cy);
        spawnCelebration(anim.particles, cx - 40, cy - 20);
        spawnCelebration(anim.particles, cx + 40, cy - 20);
      } else if (fish.rarity === "epic") {
        spawnParticles(anim.particles, cx, cy, [RARITY_COLORS.epic], 30,
          { speed: [60, 150], size: [2, 5], life: [0.4, 1.0], gravity: 80 });
      } else {
        spawnParticles(anim.particles, cx, cy, [RARITY_COLORS[fish.rarity]], 15,
          { speed: [40, 100], size: [2, 4], life: [0.3, 0.8], gravity: 60 });
      }

      anim.scorePopups.push({
        x: cx, y: cy - 50, value: fish.price, life: 1.5, combo: 1,
      });
    }

    if (fish.rarity === "legendary") {
      soundRef.current?.playLevelUp();
    } else if (fish.rarity === "epic") {
      soundRef.current?.playCombo(3);
    } else {
      soundRef.current?.playScore(fish.price);
    }

    setLastCatch(caught);
    syncUI();
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
      const anim = animRef.current;
      anim.scorePopups = [];
      anim.particles = [];
      anim.lineY = 20;
      anim.lineTargetY = 20;
      anim.targetBgHue = 210;
      scoreSubmittedRef.current = false;
      if (d.caught && d.caught.length > 0) {
        setLastCatch(d.caught[0]);
      }
      syncUI();
      forceUpdate(n => n + 1);
    } catch { /* ignore malformed data */ }
  }, [syncUI]);

  // ─── Init game on mount ──────────────────────────────────
  useEffect(() => {
    initGame();
  }, []);

  // ─── PixiJS Game Loop ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initAndRun() {
      const pixi = await loadPixi();
      if (destroyed) return;

      const parent = canvas!.parentElement;
      const cw = parent ? parent.clientWidth : 400;

      const app = await createPixiApp({
        canvas: canvas!,
        width: cw,
        height: CANVAS_H,
        backgroundColor: 0x0a0a1a,
        antialias: true,
      });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

      // Text pool
      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 14,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (60-80 texts)
      makeText("alert_text", { fontSize: 20, fill: "#ff4444", fontWeight: "bold" });
      makeText("waiting_text", { fontSize: 14, fill: "#3ea6ff" });
      makeText("catch_emoji", { fontSize: 40 });
      makeText("catch_name", { fontSize: 16, fill: "#f0b90b", fontWeight: "bold" });
      makeText("catch_info", { fontSize: 12, fill: "#8a8a8a" });
      makeText("miss_text", { fontSize: 18, fill: "#ff6b6b", fontWeight: "bold" });
      makeText("miss_hint", { fontSize: 13, fill: "#8a8a8a" });
      makeText("idle_text", { fontSize: 14, fill: "#8a8a8a" });
      makeText("pause_title", { fontSize: 28, fill: "#ffffff", fontWeight: "bold" });
      makeText("pause_hint", { fontSize: 14, fill: "#8a8a8a" });
      makeText("popup_0", { fontSize: 18, fill: "#ffd93d", fontWeight: "bold" });
      // Reserve extra text slots for score popups and dynamic content
      for (let i = 1; i < 10; i++) {
        makeText(`popup_${i}`, { fontSize: 18, fill: "#ffd93d", fontWeight: "bold" });
      }
      // Extra pool for future use
      for (let i = 0; i < 60; i++) {
        makeText(`pool_${i}`, { fontSize: 12, fill: "#ffffff" });
      }

      lastTimeRef.current = 0;

      // Resize handler
      const resize = () => {
        if (destroyed) return;
        const p = canvas!.parentElement;
        if (!p) return;
        const newW = p.clientWidth;
        app.renderer.resize(newW, CANVAS_H);
      };
      resize();
      window.addEventListener("resize", resize);

      app.ticker.add((ticker) => {
        if (destroyed) return;
        const dt = Math.min(ticker.deltaMS, 50) / 1000;

        const anim = animRef.current;
        const game = gameRef.current;
        if (!game) return;

        const rw = app.renderer.width / (window.devicePixelRatio || 1);
        const rh = CANVAS_H;

        if (!game.paused) {
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
          let pi = anim.particles.length;
          while (pi-- > 0) {
            const p = anim.particles[pi];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += p.gravity * dt;
            p.life -= dt;
            p.vx *= 0.97;
            p.vy *= 0.97;
            if (p.life <= 0) {
              anim.particles[pi] = anim.particles[anim.particles.length - 1];
              anim.particles.pop();
            }
          }

          // Smooth bg hue
          anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.03);

          // Swimming fish
          if (anim.swimmingFish.length < MAX_SWIMMING_FISH && Math.random() < dt * 0.8) {
            anim.swimmingFish.push(createSwimmingFish(rw, rh));
          }
          let fi = anim.swimmingFish.length;
          while (fi-- > 0) {
            const sf = anim.swimmingFish[fi];
            sf.x += sf.vx * dt;
            sf.wobble += sf.wobbleSpeed * dt;
            if ((sf.vx > 0 && sf.x > rw + 30) || (sf.vx < 0 && sf.x < -30)) {
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
              soundRef.current?.playTone(800, 0.1, "square");
              syncUI();
            }
          } else if (game.phase === "bite") {
            game.biteTimer -= dt;
            anim.alertPulse += dt;
            if (game.biteTimer <= 0) {
              game.phase = "missed";
              anim.lineTargetY = 20;
              anim.catchFadeIn = 0;
              anim.targetBgHue = 0;
              phaseTimerRef.current = 0;
              soundRef.current?.playError();
              syncUI();
            }
          } else if (game.phase === "caught") {
            anim.catchScale = Math.min(1, anim.catchScale + dt * 4);
            anim.catchFadeIn = Math.min(1, anim.catchFadeIn + dt * 3);
            phaseTimerRef.current += dt;
            anim.lineTargetY = 20;
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
        drawGamePixi(gfx, texts, game, anim, rw, rh);
      });

      // Cleanup resize on destroy
      return () => {
        window.removeEventListener("resize", resize);
      };
    }

    const cleanupPromise = initAndRun();

    return () => {
      destroyed = true;
      cleanupPromise?.then(cleanup => cleanup?.());
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
        pixiGfxRef.current = null;
        pixiTextsRef.current.clear();
      }
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
      soundRef.current?.dispose();
      inputRef.current?.dispose();
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
            <span className="text-[#3ea6ff]">? 钓鱼达人</span>
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
              ? 抛竿
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
              {soundRef.current?.isMuted() ? "?" : "?"}
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
              F1 快拉！收竿！
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-2">
          抛竿后等待鱼上钩 · 出现提示时快速点击收竿 · 空格键/回车也可操作
        </p>

        {/* Fish Encyclopedia */}
        <h3 className="text-sm font-bold mt-4 mb-2">
          <span className="text-[#f0b90b]">?</span> 鱼类图鉴
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
                <div className="text-xl">{collected ? f.emoji : "?"}</div>
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
              <span className="text-[#3ea6ff]">?</span> 最近钓获
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
