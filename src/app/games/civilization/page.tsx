"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, Play, RotateCcw, Trophy, Pause, FastForward,
  Home, ShoppingBag, Factory, Wheat, GraduationCap, Heart,
  Trash2, Volume2, VolumeX
} from "lucide-react";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

/* ========== 常量 ========== */
const GAME_ID = "city-builder";
const W = 640, H = 480;
const GRID = 20;
const COLS = W / GRID;
const ROWS = H / GRID;
const DAY_TICKS = 600; // 10 seconds per day at 60fps

/* ========== 颜色 ========== */
const C = {
  bg: "#0f0f0f",
  grid: "#1a1a1a",
  gridLine: "#222222",
  grass: "#1a3a1a",
  grassLight: "#1e4420",
  road: "#333333",
  water: "#0a2a4a",
  primary: "#3ea6ff",
  gold: "#f0b90b",
  red: "#ff4444",
  green: "#2ba640",
  purple: "#a855f7",
  white: "#e0e0e0",
  dim: "#666666",
  panel: "#1a1a1a",
  panelBorder: "#333333",
};

/** Convert "#rrggbb" to 0xRRGGBB */
function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}

/* ========== 建筑定义 ========== */
type BuildingType = "house" | "shop" | "factory" | "farm" | "school" | "hospital";
interface BuildingDef {
  type: BuildingType;
  name: string;
  cost: number;
  color: string;
  roofColor: string;
  size: number;
  effects: {
    population?: number;
    income?: number;
    food?: number;
    material?: number;
    happiness?: number;
    jobs?: number;
  };
  description: string;
}

const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: {
    type: "house", name: "住宅", cost: 100, color: "#4a6a4a", roofColor: "#6a8a6a",
    size: 1, effects: { population: 4, happiness: 1 },
    description: "+4人口 +1幸福度",
  },
  shop: {
    type: "shop", name: "商店", cost: 200, color: "#5a5a3a", roofColor: "#8a8a5a",
    size: 1, effects: { income: 15, jobs: 3, happiness: 2 },
    description: "+15金币/天 +3工作 +2幸福度",
  },
  factory: {
    type: "factory", name: "工厂", cost: 350, color: "#4a4a5a", roofColor: "#6a6a7a",
    size: 2, effects: { material: 8, income: 10, jobs: 6, happiness: -2 },
    description: "+8材料/天 +10金币/天 +6工作 -2幸福度",
  },
  farm: {
    type: "farm", name: "农场", cost: 150, color: "#3a5a2a", roofColor: "#5a7a4a",
    size: 2, effects: { food: 12, jobs: 4, happiness: 1 },
    description: "+12食物/天 +4工作 +1幸福度",
  },
  school: {
    type: "school", name: "学校", cost: 400, color: "#3a4a6a", roofColor: "#5a6a8a",
    size: 1, effects: { happiness: 5, income: 5, jobs: 3 },
    description: "+5幸福度 +5金币/天 +3工作",
  },
  hospital: {
    type: "hospital", name: "医院", cost: 500, color: "#5a3a3a", roofColor: "#8a5a5a",
    size: 1, effects: { happiness: 8, jobs: 5 },
    description: "+8幸福度 +5工作",
  },
};

const BUILDING_ORDER: BuildingType[] = ["house", "shop", "factory", "farm", "school", "hospital"];

/* ========== 难度 ========== */
type DifficultyId = "easy" | "normal" | "hard";
interface DifficultyDef {
  id: DifficultyId; name: string;
  startGold: number; startFood: number; startMaterial: number;
  costMul: number; incomeMul: number; consumeMul: number;
  eventChance: number;
}
const DIFFICULTIES: DifficultyDef[] = [
  { id: "easy", name: "简单", startGold: 2000, startFood: 100, startMaterial: 80, costMul: 0.8, incomeMul: 1.3, consumeMul: 0.7, eventChance: 0.05 },
  { id: "normal", name: "普通", startGold: 1000, startFood: 60, startMaterial: 40, costMul: 1, incomeMul: 1, consumeMul: 1, eventChance: 0.1 },
  { id: "hard", name: "困难", startGold: 500, startFood: 30, startMaterial: 20, costMul: 1.3, incomeMul: 0.7, consumeMul: 1.5, eventChance: 0.15 },
];

/* ========== NPC ========== */
interface NPC {
  x: number; y: number;
  targetX: number; targetY: number;
  speed: number;
  color: string;
  needFood: number;
  needWork: boolean;
  needFun: number;
  satisfied: boolean;
}

/* ========== 建筑实例 ========== */
interface Building {
  type: BuildingType;
  gridX: number;
  gridY: number;
  level: number;
}

/* ========== 游戏状态 ========== */
interface GameState {
  phase: "title" | "playing" | "paused" | "gameover" | "victory";
  difficulty: DifficultyId;
  day: number;
  dayTick: number;
  isNight: boolean;
  speed: number;
  gold: number;
  population: number;
  food: number;
  material: number;
  happiness: number;
  maxPopulation: number;
  totalJobs: number;
  buildings: Building[];
  npcs: NPC[];
  selectedBuilding: BuildingType | null;
  demolishMode: boolean;
  cameraX: number;
  cameraY: number;
  dragging: boolean;
  dragStartX: number;
  dragStartY: number;
  camStartX: number;
  camStartY: number;
  score: number;
  log: string[];
  soundEnabled: boolean;
  totalIncome: number;
  totalFoodProd: number;
  totalMaterialProd: number;
}

/* ========== 音效 ========== */
class SoundManager {
  private ctx: AudioContext | null = null;
  enabled = true;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  play(type: "build" | "demolish" | "coin" | "alert" | "click" | "day" | "victory" | "gameover") {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime;

      switch (type) {
        case "build":
          osc.type = "square"; osc.frequency.setValueAtTime(440, t);
          osc.frequency.linearRampToValueAtTime(660, t + 0.1);
          gain.gain.setValueAtTime(0.08, t); gain.gain.linearRampToValueAtTime(0, t + 0.15);
          osc.start(t); osc.stop(t + 0.15);
          break;
        case "demolish":
          osc.type = "sawtooth"; osc.frequency.setValueAtTime(300, t);
          osc.frequency.linearRampToValueAtTime(100, t + 0.2);
          gain.gain.setValueAtTime(0.06, t); gain.gain.linearRampToValueAtTime(0, t + 0.2);
          osc.start(t); osc.stop(t + 0.2);
          break;
        case "coin":
          osc.type = "sine"; osc.frequency.setValueAtTime(800, t);
          osc.frequency.linearRampToValueAtTime(1200, t + 0.08);
          gain.gain.setValueAtTime(0.05, t); gain.gain.linearRampToValueAtTime(0, t + 0.1);
          osc.start(t); osc.stop(t + 0.1);
          break;
        case "alert":
          osc.type = "square"; osc.frequency.setValueAtTime(200, t);
          osc.frequency.setValueAtTime(250, t + 0.1);
          osc.frequency.setValueAtTime(200, t + 0.2);
          gain.gain.setValueAtTime(0.06, t); gain.gain.linearRampToValueAtTime(0, t + 0.3);
          osc.start(t); osc.stop(t + 0.3);
          break;
        case "click":
          osc.type = "sine"; osc.frequency.setValueAtTime(600, t);
          gain.gain.setValueAtTime(0.04, t); gain.gain.linearRampToValueAtTime(0, t + 0.05);
          osc.start(t); osc.stop(t + 0.05);
          break;
        case "day":
          osc.type = "sine"; osc.frequency.setValueAtTime(523, t);
          osc.frequency.setValueAtTime(659, t + 0.1);
          osc.frequency.setValueAtTime(784, t + 0.2);
          gain.gain.setValueAtTime(0.04, t); gain.gain.linearRampToValueAtTime(0, t + 0.35);
          osc.start(t); osc.stop(t + 0.35);
          break;
        case "victory":
          osc.type = "sine";
          [523, 659, 784, 1047].forEach((f, i) => {
            osc.frequency.setValueAtTime(f, t + i * 0.15);
          });
          gain.gain.setValueAtTime(0.06, t); gain.gain.linearRampToValueAtTime(0, t + 0.7);
          osc.start(t); osc.stop(t + 0.7);
          break;
        case "gameover":
          osc.type = "sawtooth"; osc.frequency.setValueAtTime(400, t);
          osc.frequency.linearRampToValueAtTime(100, t + 0.5);
          gain.gain.setValueAtTime(0.06, t); gain.gain.linearRampToValueAtTime(0, t + 0.5);
          osc.start(t); osc.stop(t + 0.5);
          break;
      }
    } catch { /* ignore audio errors */ }
  }
}

const soundMgr = new SoundManager();

/* ========== 工具函数 ========== */
function createInitialState(diff: DifficultyId): GameState {
  const d = DIFFICULTIES.find(dd => dd.id === diff)!;
  return {
    phase: "playing", difficulty: diff,
    day: 1, dayTick: 0, isNight: false, speed: 1,
    gold: d.startGold, population: 0, food: d.startFood,
    material: d.startMaterial, happiness: 50,
    maxPopulation: 0, totalJobs: 0,
    buildings: [], npcs: [],
    selectedBuilding: null, demolishMode: false,
    cameraX: 0, cameraY: 0,
    dragging: false, dragStartX: 0, dragStartY: 0, camStartX: 0, camStartY: 0,
    score: 0, log: ["欢迎来到你的新城市！开始建造吧。"],
    soundEnabled: true,
    totalIncome: 0, totalFoodProd: 0, totalMaterialProd: 0,
  };
}

function canPlace(buildings: Building[], type: BuildingType, gx: number, gy: number): boolean {
  const def = BUILDING_DEFS[type];
  const sz = def.size;
  if (gx < 0 || gy < 0 || gx + sz > COLS || gy + sz > ROWS) return false;
  for (const b of buildings) {
    const bsz = BUILDING_DEFS[b.type].size;
    if (gx < b.gridX + bsz && gx + sz > b.gridX && gy < b.gridY + bsz && gy + sz > b.gridY) return false;
  }
  return true;
}

function recalcResources(buildings: Building[], diff: DifficultyDef) {
  let maxPop = 0, totalJobs = 0, income = 0, foodProd = 0, matProd = 0, hap = 50;
  for (const b of buildings) {
    const def = BUILDING_DEFS[b.type];
    const e = def.effects;
    if (e.population) maxPop += e.population * b.level;
    if (e.jobs) totalJobs += e.jobs * b.level;
    if (e.income) income += Math.floor(e.income * b.level * diff.incomeMul);
    if (e.food) foodProd += Math.floor(e.food * b.level * diff.incomeMul);
    if (e.material) matProd += Math.floor(e.material * b.level * diff.incomeMul);
    if (e.happiness) hap += e.happiness * b.level;
  }
  return { maxPop, totalJobs, income, foodProd, matProd, hap: Math.max(0, Math.min(100, hap)) };
}

function spawnNPC(buildings: Building[]): NPC | null {
  if (buildings.length === 0) return null;
  const b = buildings[Math.floor(Math.random() * buildings.length)];
  const def = BUILDING_DEFS[b.type];
  const px = (b.gridX + def.size / 2) * GRID;
  const py = (b.gridY + def.size / 2) * GRID;
  const colors = ["#7a9a7a", "#8a8a6a", "#6a7a8a", "#9a7a6a", "#7a6a9a"];
  return {
    x: px, y: py,
    targetX: px, targetY: py,
    speed: 0.3 + Math.random() * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
    needFood: 50 + Math.random() * 50,
    needWork: Math.random() > 0.5,
    needFun: 50 + Math.random() * 50,
    satisfied: true,
  };
}

/* ========== 主组件 ========== */
export default function CityBuilderPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({ ...createInitialState("normal"), phase: "title" });
  const hoverRef = useRef({ gx: -1, gy: -1 });
  const [, forceUpdate] = useState(0);
  const rerender = useCallback(() => forceUpdate(n => n + 1), []);

  /* ---- PixiJS refs ---- */
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);

  const state = stateRef.current;

  /* ---- 游戏逻辑 tick (called from pixi ticker) ---- */
  const tickGame = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "playing") return;

    const diff = DIFFICULTIES.find(d => d.id === s.difficulty)!;
    const ticksPerFrame = s.speed;

    for (let tick = 0; tick < ticksPerFrame; tick++) {
      s.dayTick++;
      s.isNight = s.dayTick > DAY_TICKS * 0.6;

      // New day
      if (s.dayTick >= DAY_TICKS) {
        s.dayTick = 0;
        s.day++;
        soundMgr.play("day");

        const res = recalcResources(s.buildings, diff);
        s.maxPopulation = res.maxPop;
        s.totalJobs = res.totalJobs;
        s.totalIncome = res.income;
        s.totalFoodProd = res.foodProd;
        s.totalMaterialProd = res.matProd;

        s.gold += res.income;
        s.food += res.foodProd;
        s.material += res.matProd;

        const foodConsume = Math.floor(s.population * 2 * diff.consumeMul);
        s.food -= foodConsume;

        s.happiness = res.hap;
        if (s.food < 0) { s.happiness -= 20; s.food = 0; }
        if (s.population > s.totalJobs && s.totalJobs > 0) s.happiness -= 10;
        s.happiness = Math.max(0, Math.min(100, s.happiness));

        if (s.food > 0 && s.happiness > 30 && s.population < s.maxPopulation) {
          const growth = Math.min(2, s.maxPopulation - s.population);
          s.population += growth;
          if (growth > 0) s.log.push(`第${s.day}天: +${growth}人口迁入`);
        } else if (s.happiness < 20 && s.population > 0) {
          const loss = Math.min(2, s.population);
          s.population -= loss;
          if (loss > 0) s.log.push(`第${s.day}天: -${loss}人口离开（不满）`);
        }
        if (s.food <= 0 && s.population > 0) {
          const loss = Math.min(3, s.population);
          s.population -= loss;
          if (loss > 0) s.log.push(`第${s.day}天: -${loss}人口饥荒`);
        }

        s.score = s.population * 10 + s.buildings.length * 5 + s.day + Math.floor(s.happiness / 2);

        if (Math.random() < diff.eventChance && s.day > 3) {
          const events = [
            { msg: `第${s.day}天: 商人来访，+50金币`, effect: () => { s.gold += 50; } },
            { msg: `第${s.day}天: 丰收季节，+30食物`, effect: () => { s.food += 30; } },
            { msg: `第${s.day}天: 暴风雨，-20材料`, effect: () => { s.material = Math.max(0, s.material - 20); } },
            { msg: `第${s.day}天: 节日庆典，+10幸福度`, effect: () => { s.happiness = Math.min(100, s.happiness + 10); } },
            { msg: `第${s.day}天: 疫病流行，-5幸福度`, effect: () => { s.happiness = Math.max(0, s.happiness - 5); } },
          ];
          const ev = events[Math.floor(Math.random() * events.length)];
          ev.effect();
          s.log.push(ev.msg);
          soundMgr.play("alert");
        }

        if (s.log.length > 20) s.log = s.log.slice(-20);

        while (s.npcs.length < Math.min(s.population, 40)) {
          const npc = spawnNPC(s.buildings);
          if (npc) s.npcs.push(npc); else break;
        }
        while (s.npcs.length > s.population) s.npcs.pop();

        if (s.population >= 100) {
          s.phase = "victory";
          s.log.push("城市繁荣！人口达到100，胜利！");
          soundMgr.play("victory");
          try {
            fetchWithAuth("/api/games/scores", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ game_id: GAME_ID, score: s.score }),
            }).catch(() => {});
          } catch {}
          rerender();
          return;
        }

        if (s.population <= 0 && s.day > 5 && s.buildings.length > 0) {
          s.phase = "gameover";
          s.log.push("城市荒废，所有居民离开了...");
          soundMgr.play("gameover");
          rerender();
          return;
        }

        rerender();
      }

      // Update NPCs
      for (const npc of s.npcs) {
        const dx = npc.targetX - npc.x;
        const dy = npc.targetY - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2) {
          if (s.buildings.length > 0) {
            const tb = s.buildings[Math.floor(Math.random() * s.buildings.length)];
            const def = BUILDING_DEFS[tb.type];
            npc.targetX = (tb.gridX + Math.random() * def.size) * GRID;
            npc.targetY = (tb.gridY + Math.random() * def.size) * GRID;
          } else {
            npc.targetX = Math.random() * COLS * GRID;
            npc.targetY = Math.random() * ROWS * GRID;
          }
        } else {
          npc.x += (dx / dist) * npc.speed;
          npc.y += (dy / dist) * npc.speed;
        }
        npc.satisfied = s.happiness > 30 && s.food > 0;
      }
    }
  }, [rerender]);

  /* ---- PixiJS init + render loop ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: hexToNum(C.grass), antialias: true });
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
          fontSize: opts.fontSize ?? 10,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "monospace",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (70 objects)
      for (let i = 0; i < 70; i++) makeText(`t${i}`, { fontSize: 10 });

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
        t.style.fontSize = opts?.fontSize ?? 10;
        t.style.fontWeight = (opts?.fontWeight ?? "normal") as "normal" | "bold";
        t.visible = true;
      };

      const cn = hexToNum;

      app.ticker.add(() => {
        if (destroyed) return;

        // Run game logic
        tickGame();

        // Clear graphics each frame
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        const s = stateRef.current;
        const { buildings, npcs, cameraX, cameraY, isNight, selectedBuilding, demolishMode } = s;
        const hgx = hoverRef.current.gx;
        const hgy = hoverRef.current.gy;

        // Background
        g.rect(0, 0, W, H).fill({ color: cn(C.grass) });

        // Grid lines (offset by camera)
        for (let x = 0; x <= COLS; x++) {
          g.rect(x * GRID - cameraX, 0 - cameraY, 0.5, ROWS * GRID).fill({ color: cn(C.gridLine), alpha: 0.5 });
        }
        for (let y = 0; y <= ROWS; y++) {
          g.rect(0 - cameraX, y * GRID - cameraY, COLS * GRID, 0.5).fill({ color: cn(C.gridLine), alpha: 0.5 });
        }

        // Grass variation
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            if ((x + y) % 3 === 0) {
              g.rect(x * GRID + 2 - cameraX, y * GRID + 2 - cameraY, 3, 3).fill({ color: cn(C.grassLight) });
            }
          }
        }

        // Buildings
        for (const b of buildings) {
          const def = BUILDING_DEFS[b.type];
          const bx = b.gridX * GRID - cameraX;
          const by = b.gridY * GRID - cameraY;
          const bw = def.size * GRID;
          const bh = def.size * GRID;

          // Shadow
          g.rect(bx + 2, by + 2, bw, bh).fill({ color: 0x000000, alpha: 0.3 });
          // Body
          g.rect(bx, by, bw, bh).fill({ color: cn(def.color) });
          // Roof
          g.rect(bx, by, bw, bh * 0.3).fill({ color: cn(def.roofColor) });
          // Border
          g.rect(bx, by, bw, 1).fill({ color: 0x555555 });
          g.rect(bx, by + bh - 1, bw, 1).fill({ color: 0x555555 });
          g.rect(bx, by, 1, bh).fill({ color: 0x555555 });
          g.rect(bx + bw - 1, by, 1, bh).fill({ color: 0x555555 });

          // Level indicator
          if (b.level > 1) {
            showText(`Lv${b.level}`, bx + bw - 2, by + bh - 3, { fill: C.gold, fontSize: 8, fontWeight: "bold", ax: 1, ay: 1 });
          }

          // Type label
          const label = def.name.charAt(0);
          showText(label, bx + bw / 2, by + bh / 2 + 2, { fill: C.white, fontSize: 10, fontWeight: "bold", ax: 0.5, ay: 0.5 });
        }

        // NPCs
        for (const npc of npcs) {
          const nx = npc.x - cameraX;
          const ny = npc.y - cameraY;
          // Body
          g.circle(nx, ny, 3).fill({ color: cn(npc.color) });
          // Head
          g.circle(nx, ny - 4, 2).fill({ color: 0xdddddd });
          // Satisfaction indicator
          if (!npc.satisfied) {
            showText("!", nx, ny - 9, { fill: C.red, fontSize: 6, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          }
        }

        // Hover preview
        if (selectedBuilding && hgx >= 0 && hgy >= 0) {
          const def = BUILDING_DEFS[selectedBuilding];
          const sz = def.size;
          const ok = canPlace(buildings, selectedBuilding, hgx, hgy);
          const hx = hgx * GRID - cameraX;
          const hy = hgy * GRID - cameraY;
          g.rect(hx, hy, sz * GRID, sz * GRID).fill({ color: ok ? cn(C.primary) : cn(C.red), alpha: 0.25 });
          // Border for hover
          g.rect(hx, hy, sz * GRID, 2).fill({ color: ok ? cn(C.primary) : cn(C.red) });
          g.rect(hx, hy + sz * GRID - 2, sz * GRID, 2).fill({ color: ok ? cn(C.primary) : cn(C.red) });
          g.rect(hx, hy, 2, sz * GRID).fill({ color: ok ? cn(C.primary) : cn(C.red) });
          g.rect(hx + sz * GRID - 2, hy, 2, sz * GRID).fill({ color: ok ? cn(C.primary) : cn(C.red) });
          showText(def.name, hx + (sz * GRID) / 2, hy + (sz * GRID) / 2 + 4, { fill: ok ? C.primary : C.red, fontSize: 10, fontWeight: "bold", ax: 0.5, ay: 0.5 });
        }

        // Demolish hover
        if (demolishMode && hgx >= 0 && hgy >= 0) {
          const target = buildings.find(b => {
            const sz = BUILDING_DEFS[b.type].size;
            return hgx >= b.gridX && hgx < b.gridX + sz && hgy >= b.gridY && hgy < b.gridY + sz;
          });
          if (target) {
            const def = BUILDING_DEFS[target.type];
            const tx = target.gridX * GRID - cameraX;
            const ty = target.gridY * GRID - cameraY;
            g.rect(tx, ty, def.size * GRID, def.size * GRID).fill({ color: cn(C.red), alpha: 0.3 });
            g.rect(tx, ty, def.size * GRID, 2).fill({ color: cn(C.red) });
            g.rect(tx, ty + def.size * GRID - 2, def.size * GRID, 2).fill({ color: cn(C.red) });
            g.rect(tx, ty, 2, def.size * GRID).fill({ color: cn(C.red) });
            g.rect(tx + def.size * GRID - 2, ty, 2, def.size * GRID).fill({ color: cn(C.red) });
          }
        }

        // Night overlay
        if (isNight) {
          g.rect(0, 0, W, H).fill({ color: 0x000014, alpha: 0.4 });
        }

        // Day/night indicator bar at top
        const dayProgress = s.dayTick / DAY_TICKS;
        g.rect(0, 0, W, 16).fill({ color: 0x000000, alpha: 0.5 });
        const sunX = dayProgress * W;
        if (!isNight) {
          g.circle(sunX, 8, 5).fill({ color: cn(C.gold) });
        } else {
          g.circle(sunX, 8, 4).fill({ color: 0xaaaacc });
        }
        showText(`第${s.day}天 ${isNight ? "夜晚" : "白天"}`, 4, 3, { fill: C.white, fontSize: 9, fontWeight: "bold" });
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
  }, [tickGame]);

  /* ---- 输入处理 ---- */
  const getGridPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { gx: -1, gy: -1 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const cx = (clientX - rect.left) * scaleX + stateRef.current.cameraX;
    const cy = (clientY - rect.top) * scaleY + stateRef.current.cameraY;
    return { gx: Math.floor(cx / GRID), gy: Math.floor(cy / GRID) };
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (s.phase !== "playing") return;
    const { gx, gy } = getGridPos(e.clientX, e.clientY);
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return;

    if (s.demolishMode) {
      const idx = s.buildings.findIndex(b => {
        const sz = BUILDING_DEFS[b.type].size;
        return gx >= b.gridX && gx < b.gridX + sz && gy >= b.gridY && gy < b.gridY + sz;
      });
      if (idx >= 0) {
        const b = s.buildings[idx];
        const def = BUILDING_DEFS[b.type];
        const refund = Math.floor(def.cost * 0.3);
        s.gold += refund;
        s.buildings.splice(idx, 1);
        s.log.push(`拆除了${def.name}，回收${refund}金币`);
        soundMgr.play("demolish");
        const diff = DIFFICULTIES.find(d => d.id === s.difficulty)!;
        const res = recalcResources(s.buildings, diff);
        s.maxPopulation = res.maxPop;
        s.totalJobs = res.totalJobs;
        s.totalIncome = res.income;
        s.totalFoodProd = res.foodProd;
        s.totalMaterialProd = res.matProd;
        rerender();
      }
      return;
    }

    if (s.selectedBuilding) {
      const def = BUILDING_DEFS[s.selectedBuilding];
      const diff = DIFFICULTIES.find(d => d.id === s.difficulty)!;
      const cost = Math.floor(def.cost * diff.costMul);

      if (s.gold < cost) {
        s.log.push(`金币不足！需要${cost}金币`);
        soundMgr.play("alert");
        rerender();
        return;
      }
      if (def.type === "factory" || def.type === "farm") {
        if (s.material < 10) {
          s.log.push("材料不足！需要10材料");
          soundMgr.play("alert");
          rerender();
          return;
        }
      }

      if (!canPlace(s.buildings, s.selectedBuilding, gx, gy)) {
        soundMgr.play("alert");
        return;
      }

      s.gold -= cost;
      if (def.type === "factory" || def.type === "farm") s.material -= 10;
      s.buildings.push({ type: s.selectedBuilding, gridX: gx, gridY: gy, level: 1 });
      s.log.push(`建造了${def.name}（-${cost}金币）`);
      soundMgr.play("build");

      const res = recalcResources(s.buildings, diff);
      s.maxPopulation = res.maxPop;
      s.totalJobs = res.totalJobs;
      s.totalIncome = res.income;
      s.totalFoodProd = res.foodProd;
      s.totalMaterialProd = res.matProd;
      s.happiness = res.hap;
      rerender();
    }
  }, [getGridPos, rerender]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (s.dragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const dx = (e.clientX - s.dragStartX) * scaleX;
      const dy = (e.clientY - s.dragStartY) * scaleY;
      s.cameraX = Math.max(0, Math.min(COLS * GRID - W, s.camStartX - dx));
      s.cameraY = Math.max(0, Math.min(ROWS * GRID - H, s.camStartY - dy));
      return;
    }
    const { gx, gy } = getGridPos(e.clientX, e.clientY);
    hoverRef.current = { gx, gy };
  }, [getGridPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (!s.selectedBuilding && !s.demolishMode) {
      s.dragging = true;
      s.dragStartX = e.clientX;
      s.dragStartY = e.clientY;
      s.camStartX = s.cameraX;
      s.camStartY = s.cameraY;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    stateRef.current.dragging = false;
  }, []);

  // Touch support
  const touchRef = useRef<{ id: number; sx: number; sy: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    const t = e.touches[0];
    if (!s.selectedBuilding && !s.demolishMode) {
      touchRef.current = { id: t.identifier, sx: t.clientX, sy: t.clientY };
      s.dragging = true;
      s.dragStartX = t.clientX;
      s.dragStartY = t.clientY;
      s.camStartX = s.cameraX;
      s.camStartY = s.cameraY;
    } else {
      const { gx, gy } = getGridPos(t.clientX, t.clientY);
      hoverRef.current = { gx, gy };
    }
  }, [getGridPos]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    const t = e.touches[0];
    if (s.dragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const dx = (t.clientX - s.dragStartX) * scaleX;
      const dy = (t.clientY - s.dragStartY) * scaleY;
      s.cameraX = Math.max(0, Math.min(COLS * GRID - W, s.camStartX - dx));
      s.cameraY = Math.max(0, Math.min(ROWS * GRID - H, s.camStartY - dy));
    } else {
      const { gx, gy } = getGridPos(t.clientX, t.clientY);
      hoverRef.current = { gx, gy };
    }
  }, [getGridPos]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (s.dragging) {
      s.dragging = false;
      touchRef.current = null;
      return;
    }
    if (s.selectedBuilding || s.demolishMode) {
      const t = e.changedTouches[0];
      const { gx, gy } = getGridPos(t.clientX, t.clientY);
      if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return;

      if (s.demolishMode) {
        const idx = s.buildings.findIndex(b => {
          const sz = BUILDING_DEFS[b.type].size;
          return gx >= b.gridX && gx < b.gridX + sz && gy >= b.gridY && gy < b.gridY + sz;
        });
        if (idx >= 0) {
          const b = s.buildings[idx];
          const def = BUILDING_DEFS[b.type];
          const refund = Math.floor(def.cost * 0.3);
          s.gold += refund;
          s.buildings.splice(idx, 1);
          s.log.push(`拆除了${def.name}，回收${refund}金币`);
          soundMgr.play("demolish");
          const diff = DIFFICULTIES.find(d => d.id === s.difficulty)!;
          const res = recalcResources(s.buildings, diff);
          s.maxPopulation = res.maxPop;
          s.totalJobs = res.totalJobs;
          rerender();
        }
      } else if (s.selectedBuilding) {
        const def = BUILDING_DEFS[s.selectedBuilding];
        const diff = DIFFICULTIES.find(d => d.id === s.difficulty)!;
        const cost = Math.floor(def.cost * diff.costMul);
        if (s.gold >= cost && canPlace(s.buildings, s.selectedBuilding, gx, gy)) {
          s.gold -= cost;
          if (def.type === "factory" || def.type === "farm") s.material = Math.max(0, s.material - 10);
          s.buildings.push({ type: s.selectedBuilding, gridX: gx, gridY: gy, level: 1 });
          s.log.push(`建造了${def.name}（-${cost}金币）`);
          soundMgr.play("build");
          const res = recalcResources(s.buildings, diff);
          s.maxPopulation = res.maxPop;
          s.totalJobs = res.totalJobs;
          s.totalIncome = res.income;
          s.totalFoodProd = res.foodProd;
          s.totalMaterialProd = res.matProd;
          s.happiness = res.hap;
          rerender();
        }
      }
    }
  }, [getGridPos, rerender]);

  /* ---- 键盘 ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      switch (e.key) {
        case "Escape":
          s.selectedBuilding = null;
          s.demolishMode = false;
          rerender();
          break;
        case "1": s.selectedBuilding = "house"; s.demolishMode = false; rerender(); break;
        case "2": s.selectedBuilding = "shop"; s.demolishMode = false; rerender(); break;
        case "3": s.selectedBuilding = "factory"; s.demolishMode = false; rerender(); break;
        case "4": s.selectedBuilding = "farm"; s.demolishMode = false; rerender(); break;
        case "5": s.selectedBuilding = "school"; s.demolishMode = false; rerender(); break;
        case "6": s.selectedBuilding = "hospital"; s.demolishMode = false; rerender(); break;
        case "d": case "D":
          s.demolishMode = !s.demolishMode;
          s.selectedBuilding = null;
          rerender();
          break;
        case " ":
          e.preventDefault();
          if (s.phase === "playing") { s.phase = "paused"; } else if (s.phase === "paused") { s.phase = "playing"; }
          rerender();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rerender]);

  /* ---- 存档 ---- */
  const handleSave = useCallback(() => {
    const s = stateRef.current;
    return {
      difficulty: s.difficulty, day: s.day, dayTick: s.dayTick,
      gold: s.gold, population: s.population, food: s.food,
      material: s.material, happiness: s.happiness, score: s.score,
      buildings: s.buildings, log: s.log.slice(-10),
      maxPopulation: s.maxPopulation, totalJobs: s.totalJobs,
      totalIncome: s.totalIncome, totalFoodProd: s.totalFoodProd,
      totalMaterialProd: s.totalMaterialProd,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    const s = stateRef.current;
    s.difficulty = (d.difficulty as DifficultyId) || "normal";
    s.day = (d.day as number) || 1;
    s.dayTick = (d.dayTick as number) || 0;
    s.gold = (d.gold as number) || 1000;
    s.population = (d.population as number) || 0;
    s.food = (d.food as number) || 60;
    s.material = (d.material as number) || 40;
    s.happiness = (d.happiness as number) || 50;
    s.score = (d.score as number) || 0;
    s.buildings = (d.buildings as Building[]) || [];
    s.log = (d.log as string[]) || [];
    s.maxPopulation = (d.maxPopulation as number) || 0;
    s.totalJobs = (d.totalJobs as number) || 0;
    s.totalIncome = (d.totalIncome as number) || 0;
    s.totalFoodProd = (d.totalFoodProd as number) || 0;
    s.totalMaterialProd = (d.totalMaterialProd as number) || 0;
    s.npcs = [];
    s.phase = "playing";
    s.selectedBuilding = null;
    s.demolishMode = false;
    for (let i = 0; i < Math.min(s.population, 40); i++) {
      const npc = spawnNPC(s.buildings);
      if (npc) s.npcs.push(npc);
    }
    s.log.push("存档加载成功");
    rerender();
  }, [rerender]);

  /* ---- 操作函数 ---- */
  const startGame = useCallback((diff: DifficultyId) => {
    const ns = createInitialState(diff);
    Object.assign(stateRef.current, ns);
    soundMgr.play("click");
    rerender();
  }, [rerender]);

  const selectBuilding = useCallback((type: BuildingType | null) => {
    const s = stateRef.current;
    s.selectedBuilding = s.selectedBuilding === type ? null : type;
    s.demolishMode = false;
    soundMgr.play("click");
    rerender();
  }, [rerender]);

  const toggleDemolish = useCallback(() => {
    const s = stateRef.current;
    s.demolishMode = !s.demolishMode;
    s.selectedBuilding = null;
    soundMgr.play("click");
    rerender();
  }, [rerender]);

  const togglePause = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "playing") s.phase = "paused";
    else if (s.phase === "paused") s.phase = "playing";
    soundMgr.play("click");
    rerender();
  }, [rerender]);

  const toggleSpeed = useCallback(() => {
    const s = stateRef.current;
    s.speed = s.speed === 1 ? 2 : 1;
    soundMgr.play("click");
    rerender();
  }, [rerender]);

  const toggleSound = useCallback(() => {
    const s = stateRef.current;
    s.soundEnabled = !s.soundEnabled;
    soundMgr.enabled = s.soundEnabled;
    rerender();
  }, [rerender]);

  const restartGame = useCallback(() => {
    const ns = createInitialState(stateRef.current.difficulty);
    Object.assign(stateRef.current, ns);
    rerender();
  }, [rerender]);

  const backToTitle = useCallback(() => {
    stateRef.current.phase = "title";
    rerender();
  }, [rerender]);

  const diff = DIFFICULTIES.find(d => d.id === state.difficulty)!;

  /* ---- 建筑图标映射 ---- */
  const BuildingIcon = ({ type }: { type: BuildingType }) => {
    switch (type) {
      case "house": return <Home size={14} />;
      case "shop": return <ShoppingBag size={14} />;
      case "factory": return <Factory size={14} />;
      case "farm": return <Wheat size={14} />;
      case "school": return <GraduationCap size={14} />;
      case "hospital": return <Heart size={14} />;
    }
  };

  /* ========== 渲染 ========== */
  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-4 pb-24 md:pb-8">
        {/* 顶部导航 */}
        <div className="flex items-center gap-3 mb-3">
          <Link href="/games" className="text-[#3ea6ff] hover:text-white transition">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold flex-1">城市经营</h1>
          {state.phase !== "title" && (
            <div className="flex gap-2">
              <button onClick={toggleSound} className="p-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white transition">
                {state.soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            </div>
          )}
        </div>

        {/* ===== 标题画面 ===== */}
        {state.phase === "title" && (
          <div className="text-center py-8">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#2ba640] to-[#1a5a2a] flex items-center justify-center border-2 border-[#3ea6ff]/30">
                <Home size={36} className="text-[#3ea6ff]" />
              </div>
              <h2 className="text-2xl font-bold mb-2">城市经营</h2>
              <p className="text-[#8a8a8a] text-sm max-w-xs mx-auto">
                建造你的梦想城市！管理资源、建造建筑、吸引居民，让城市繁荣发展。
              </p>
            </div>

            <div className="mb-6">
              <p className="text-xs text-[#666] mb-3">选择难度</p>
              <div className="flex gap-3 justify-center">
                {DIFFICULTIES.map(d => (
                  <button key={d.id} onClick={() => startGame(d.id)}
                    className="px-5 py-3 rounded-xl border border-[#333] bg-[#1a1a1a] hover:border-[#3ea6ff]/50 transition group">
                    <Play size={16} className="mx-auto mb-1 text-[#3ea6ff] group-hover:scale-110 transition" />
                    <p className="text-sm font-bold">{d.name}</p>
                    <p className="text-[10px] text-[#666] mt-1">
                      {d.id === "easy" ? "初始2000金币" : d.id === "normal" ? "初始1000金币" : "初始500金币"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-[#555] max-w-sm mx-auto space-y-1">
              <p>操作说明：</p>
              <p>点击建筑按钮后点击地图放置 | 拖拽移动视角</p>
              <p>快捷键 1-6 选择建筑 | D 拆除 | 空格 暂停</p>
              <p>目标：人口达到100即为胜利</p>
            </div>

            {/* 排行榜和存档 */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
              <GameLeaderboard gameId={GAME_ID} />
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            </div>
          </div>
        )}

        {/* ===== 游戏中 / 暂停 ===== */}
        {(state.phase === "playing" || state.phase === "paused") && (
          <>
            {/* 资源栏 */}
            <div className="flex flex-wrap gap-2 mb-2 text-[11px]">
              <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#f0b90b]">
                金币 {state.gold}
              </span>
              <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#3ea6ff]">
                人口 {state.population}/{state.maxPopulation}
              </span>
              <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#2ba640]">
                食物 {state.food}
              </span>
              <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#a855f7]">
                材料 {state.material}
              </span>
              <span className="px-2 py-1 rounded bg-[#212121] border border-[#333]" style={{ color: state.happiness > 50 ? "#2ba640" : state.happiness > 25 ? "#f0b90b" : "#ff4444" }}>
                幸福度 {state.happiness}%
              </span>
              <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#ccc]">
                第{state.day}天
              </span>
            </div>

            {/* 每日收支 */}
            <div className="flex flex-wrap gap-2 mb-2 text-[10px] text-[#666]">
              <span>收入+{state.totalIncome}/天</span>
              <span>食物+{state.totalFoodProd}/天</span>
              <span>材料+{state.totalMaterialProd}/天</span>
              <span>消耗-{Math.floor(state.population * 2 * diff.consumeMul)}食物/天</span>
              <span>工作{Math.min(state.population, state.totalJobs)}/{state.totalJobs}</span>
            </div>

            {/* Canvas */}
            <div className="relative mb-2">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className="w-full rounded-xl border border-[#333] bg-[#0a0a0a] cursor-crosshair"
                style={{ imageRendering: "pixelated", maxHeight: "60vh" }}
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
              {state.phase === "paused" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                  <div className="text-center">
                    <Pause size={40} className="mx-auto mb-2 text-[#3ea6ff]" />
                    <p className="text-lg font-bold">暂停</p>
                    <p className="text-xs text-[#666]">按空格或点击继续</p>
                    <button onClick={togglePause} className="mt-3 px-4 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-sm font-bold hover:bg-[#3ea6ff]/80 transition">
                      继续
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 控制栏 */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {BUILDING_ORDER.map((type, i) => {
                const def = BUILDING_DEFS[type];
                const cost = Math.floor(def.cost * diff.costMul);
                const selected = state.selectedBuilding === type;
                const canAfford = state.gold >= cost;
                return (
                  <button key={type} onClick={() => selectBuilding(type)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] transition ${
                      selected ? "bg-[#3ea6ff]/15 border-[#3ea6ff]/50 text-[#3ea6ff]" :
                      canAfford ? "border-[#333] text-[#ccc] hover:border-[#3ea6ff]/30" :
                      "border-[#222] text-[#555] opacity-60"
                    }`}
                    title={`${def.name} (${cost}金币) ${def.description} [快捷键${i + 1}]`}
                  >
                    <BuildingIcon type={type} />
                    <span>{def.name}</span>
                    <span className="text-[#f0b90b] text-[10px]">{cost}</span>
                  </button>
                );
              })}

              <button onClick={toggleDemolish}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] transition ${
                  state.demolishMode ? "bg-[#ff4444]/15 border-[#ff4444]/50 text-[#ff4444]" :
                  "border-[#333] text-[#ccc] hover:border-[#ff4444]/30"
                }`}
                title="拆除模式 [D]"
              >
                <Trash2 size={14} />
                <span>拆除</span>
              </button>

              <button onClick={togglePause}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#333] text-[11px] text-[#ccc] hover:border-[#3ea6ff]/30 transition"
                title="暂停 [空格]"
              >
                <Pause size={14} />
                <span>暂停</span>
              </button>
              <button onClick={toggleSpeed}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] transition ${
                  state.speed === 2 ? "bg-[#f0b90b]/15 border-[#f0b90b]/50 text-[#f0b90b]" :
                  "border-[#333] text-[#ccc] hover:border-[#f0b90b]/30"
                }`}
                title="加速"
              >
                <FastForward size={14} />
                <span>加速</span>
              </button>
            </div>

            {/* 日志 */}
            <div className="h-20 overflow-y-auto rounded-xl bg-[#0a0a0a] border border-[#333] p-2 text-[10px] text-[#8a8a8a] space-y-0.5">
              {state.log.map((l, i) => <p key={i}>{l}</p>)}
            </div>

            {/* 存档 */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
              <GameLeaderboard gameId={GAME_ID} />
            </div>
          </>
        )}

        {/* ===== 胜利画面 ===== */}
        {state.phase === "victory" && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#f0b90b]/10 flex items-center justify-center border-2 border-[#f0b90b]/30">
              <Trophy size={36} className="text-[#f0b90b]" />
            </div>
            <h2 className="text-2xl font-bold text-[#f0b90b] mb-2">城市繁荣！</h2>
            <p className="text-[#8a8a8a] mb-1">你的城市人口达到了100人</p>
            <div className="flex justify-center gap-4 text-sm mb-4">
              <span className="text-[#f0b90b]">得分: {state.score}</span>
              <span className="text-[#3ea6ff]">天数: {state.day}</span>
              <span className="text-[#2ba640]">建筑: {state.buildings.length}</span>
            </div>
            <div className="flex gap-3 justify-center mb-6">
              <button onClick={restartGame} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#3ea6ff]/80 transition">
                <RotateCcw size={16} /> 再来一局
              </button>
              <button onClick={backToTitle} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#333] text-[#ccc] text-sm hover:border-[#3ea6ff]/30 transition">
                <ChevronLeft size={16} /> 返回标题
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
              <GameLeaderboard gameId={GAME_ID} />
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            </div>
          </div>
        )}

        {/* ===== 游戏结束画面 ===== */}
        {state.phase === "gameover" && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#ff4444]/10 flex items-center justify-center border-2 border-[#ff4444]/30">
              <Home size={36} className="text-[#ff4444]" />
            </div>
            <h2 className="text-2xl font-bold text-[#ff4444] mb-2">城市荒废</h2>
            <p className="text-[#8a8a8a] mb-1">所有居民都离开了你的城市</p>
            <div className="flex justify-center gap-4 text-sm mb-4">
              <span className="text-[#f0b90b]">得分: {state.score}</span>
              <span className="text-[#3ea6ff]">天数: {state.day}</span>
              <span className="text-[#2ba640]">最高人口: {state.maxPopulation}</span>
            </div>
            <div className="flex gap-3 justify-center mb-6">
              <button onClick={restartGame} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#3ea6ff]/80 transition">
                <RotateCcw size={16} /> 再来一局
              </button>
              <button onClick={backToTitle} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#333] text-[#ccc] text-sm hover:border-[#3ea6ff]/30 transition">
                <ChevronLeft size={16} /> 返回标题
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
              <GameLeaderboard gameId={GAME_ID} />
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
