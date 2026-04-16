"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import {
  ChevronLeft, Volume2, VolumeX, Lock, RotateCcw,
  Play, Users, Sparkles, Star, Clock,
  Wine, Lamp, Speaker, Crown, Moon
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-sim";
const CW = 480, CH = 520;
const PRIMARY = "#3ea6ff", ACCENT = "#a55eea", BG = "#0f0f0f";
const PANEL_BG = "#1a1a2e", CARD_BG = "#12122a";
const GOLD_COLOR = "#ffd700", RED = "#ff4757", GREEN = "#2ed573";

// ─── Types ───────────────────────────────────────────────────────────────────
type Difficulty = "easy" | "normal" | "hard";
type Phase = "title" | "playing" | "dayEnd" | "event" | "gameover" | "result";
type TimeOfDay = "day" | "night";

interface Employee {
  id: string; name: string; role: "bartender" | "waiter" | "dj" | "bouncer";
  charm: number; skill: number; stamina: number; salary: number;
  hired: boolean;
}

interface Upgrade {
  id: string; name: string; category: "lighting" | "sound" | "vip" | "stage";
  level: number; maxLevel: number; cost: number; satisfactionBonus: number;
  incomeBonus: number; desc: string;
}

interface Guest {
  x: number; y: number; vx: number; vy: number;
  satisfaction: number; spending: number; timer: number;
  isVIP: boolean; color: string;
}

interface GameEvent {
  title: string; desc: string; effect: string;
  goldChange: number; repChange: number;
}

interface GameState {
  gold: number; day: number; reputation: number; satisfaction: number;
  totalIncome: number; totalExpense: number; score: number;
  timeOfDay: TimeOfDay; nightProgress: number;
  employees: Employee[]; upgrades: Upgrade[]; guests: Guest[];
  hiredCount: number; maxGuests: number;
  dailyIncome: number; dailyExpense: number;
  currentEvent: GameEvent | null; eventQueue: GameEvent[];
  difficulty: Difficulty; gameLog: string[];
  selectedTab: "staff" | "upgrade" | "info";
  particles: Particle[];
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

// ─── Data ────────────────────────────────────────────────────────────────────
const ROLE_NAMES: Record<string, string> = {
  bartender: "调酒师", waiter: "服务员", dj: "DJ", bouncer: "保安"
};

const ROLE_COLORS: Record<string, string> = {
  bartender: "#ff6b6b", waiter: "#51cf66", dj: "#845ef7", bouncer: "#339af0"
};

function hexToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

function hslToNum(h: number, s: number, l: number): number {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return (r << 16) | (g << 8) | b;
}

function makeEmployeePool(): Employee[] {
  const names: Record<string, string[]> = {
    bartender: ["小李", "阿杰", "大卫", "小美"],
    waiter: ["小红", "阿明", "小芳", "阿强"],
    dj: ["DJ阿K", "DJ小P", "DJ星辰", "DJ夜风"],
    bouncer: ["大壮", "铁柱", "阿龙", "黑熊"],
  };
  const pool: Employee[] = [];
  for (const role of ["bartender", "waiter", "dj", "bouncer"] as const) {
    names[role].forEach((name, i) => {
      pool.push({
        id: `${role}_${i}`,
        name,
        role,
        charm: 30 + Math.floor(Math.random() * 40),
        skill: 30 + Math.floor(Math.random() * 40),
        stamina: 40 + Math.floor(Math.random() * 30),
        salary: role === "dj" ? 80 : role === "bouncer" ? 60 : role === "bartender" ? 70 : 50,
        hired: false,
      });
    });
  }
  return pool;
}

function makeUpgrades(): Upgrade[] {
  return [
    { id: "light", name: "氛围灯光", category: "lighting", level: 0, maxLevel: 5, cost: 100, satisfactionBonus: 5, incomeBonus: 8, desc: "升级灯光系统" },
    { id: "sound", name: "音响系统", category: "sound", level: 0, maxLevel: 5, cost: 120, satisfactionBonus: 6, incomeBonus: 10, desc: "升级音响设备" },
    { id: "vip", name: "VIP包间", category: "vip", level: 0, maxLevel: 3, cost: 200, satisfactionBonus: 8, incomeBonus: 20, desc: "增设VIP包间" },
    { id: "stage", name: "表演舞台", category: "stage", level: 0, maxLevel: 3, cost: 250, satisfactionBonus: 10, incomeBonus: 25, desc: "建造表演舞台" },
  ];
}

const EVENTS: GameEvent[] = [
  { title: "VIP驾到", desc: "一位神秘VIP客人光临，大量消费！", effect: "+200金币 +5声望", goldChange: 200, repChange: 5 },
  { title: "卫生检查", desc: "卫生部门突击检查！", effect: "-100金币 -3声望", goldChange: -100, repChange: -3 },
  { title: "竞争对手", desc: "对面新开了一家夜店，抢走部分客源。", effect: "-50金币 -2声望", goldChange: -50, repChange: -2 },
  { title: "网红打卡", desc: "一位网红在你的酒吧直播，人气暴涨！", effect: "+150金币 +8声望", goldChange: 150, repChange: 8 },
  { title: "设备故障", desc: "音响系统突然故障，需要紧急维修。", effect: "-80金币", goldChange: -80, repChange: -1 },
  { title: "主题之夜", desc: "成功举办主题派对，客人爆满！", effect: "+180金币 +6声望", goldChange: 180, repChange: 6 },
  { title: "员工纠纷", desc: "两名员工发生冲突，影响服务质量。", effect: "-2声望", goldChange: 0, repChange: -2 },
  { title: "媒体报道", desc: "本地媒体正面报道了你的酒吧！", effect: "+10声望", goldChange: 50, repChange: 10 },
];

function diffMult(d: Difficulty): number {
  return d === "easy" ? 1.3 : d === "hard" ? 0.7 : 1.0;
}

function diffCostMult(d: Difficulty): number {
  return d === "easy" ? 0.8 : d === "hard" ? 1.3 : 1.0;
}

// ─── Init State ──────────────────────────────────────────────────────────────
function initState(diff: Difficulty): GameState {
  const startGold = diff === "easy" ? 800 : diff === "hard" ? 300 : 500;
  return {
    gold: startGold, day: 1, reputation: 30, satisfaction: 50,
    totalIncome: 0, totalExpense: 0, score: 0,
    timeOfDay: "day", nightProgress: 0,
    employees: makeEmployeePool(), upgrades: makeUpgrades(),
    guests: [], hiredCount: 0, maxGuests: 8,
    dailyIncome: 0, dailyExpense: 0,
    currentEvent: null, eventQueue: [],
    difficulty: diff, gameLog: ["欢迎来到夜色酒吧！准备开始经营吧。"],
    selectedTab: "staff", particles: [],
  };
}

// ─── Guest Spawning ──────────────────────────────────────────────────────────
function spawnGuest(state: GameState): Guest {
  const isVIP = Math.random() < 0.1 + state.reputation * 0.002;
  const baseSpend = isVIP ? 30 + Math.random() * 40 : 8 + Math.random() * 15;
  const satBonus = state.upgrades.reduce((a, u) => a + u.level * u.satisfactionBonus, 0);
  const hiredBonus = state.employees.filter(e => e.hired).reduce((a, e) => a + e.charm * 0.3, 0);
  return {
    x: 40 + Math.random() * 400,
    y: 180 + Math.random() * 200,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    satisfaction: Math.min(100, 40 + satBonus + hiredBonus + Math.random() * 20),
    spending: baseSpend * diffMult(state.difficulty),
    timer: 200 + Math.floor(Math.random() * 150),
    isVIP,
    color: isVIP ? GOLD_COLOR : `hsl(${Math.floor(Math.random() * 360)}, 60%, 65%)`,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdultSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const frameRef = useRef(0);
  const stateRef = useRef<GameState>(initState("normal"));
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [, forceUpdate] = useState(0);

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ─── Age Gate ──────────────────────────────────────────────────────────────
  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  // ─── Sound ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playSound = useCallback((type: "move" | "click" | "score" | "levelUp" | "gameOver" | "error" | "combo") => {
    if (!soundRef.current || muted) return;
    switch (type) {
      case "move": soundRef.current.playMove(); break;
      case "click": soundRef.current.playClick(); break;
      case "score": soundRef.current.playScore(100); break;
      case "levelUp": soundRef.current.playLevelUp(); break;
      case "gameOver": soundRef.current.playGameOver(); break;
      case "error": soundRef.current.playError(); break;
      case "combo": soundRef.current.playCombo(3); break;
    }
  }, [muted]);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(m ?? false);
  }, []);

  // ─── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    stateRef.current = initState(diff);
    setPhase("playing");
    playSound("click");
  }, [playSound]);

  // ─── Hire Employee ─────────────────────────────────────────────────────────
  const hireEmployee = useCallback((id: string) => {
    const s = stateRef.current;
    const emp = s.employees.find(e => e.id === id);
    if (!emp || emp.hired) return;
    const cost = Math.floor(emp.salary * 3 * diffCostMult(s.difficulty));
    if (s.gold < cost) {
      s.gameLog.push("金币不足，无法雇佣！");
      playSound("error");
      forceUpdate(n => n + 1);
      return;
    }
    s.gold -= cost;
    emp.hired = true;
    s.hiredCount++;
    s.maxGuests = 8 + s.employees.filter(e => e.hired && e.role === "waiter").length * 3
      + s.employees.filter(e => e.hired && e.role === "bouncer").length * 2;
    s.gameLog.push(`雇佣了${ROLE_NAMES[emp.role]} ${emp.name}！`);
    playSound("score");
    forceUpdate(n => n + 1);
  }, [playSound]);

  // ─── Buy Upgrade ───────────────────────────────────────────────────────────
  const buyUpgrade = useCallback((id: string) => {
    const s = stateRef.current;
    const upg = s.upgrades.find(u => u.id === id);
    if (!upg || upg.level >= upg.maxLevel) return;
    const cost = Math.floor(upg.cost * (1 + upg.level * 0.5) * diffCostMult(s.difficulty));
    if (s.gold < cost) {
      s.gameLog.push("金币不足，无法升级！");
      playSound("error");
      forceUpdate(n => n + 1);
      return;
    }
    s.gold -= cost;
    upg.level++;
    s.gameLog.push(`${upg.name} 升级到 Lv.${upg.level}！`);
    playSound("levelUp");
    forceUpdate(n => n + 1);
  }, [playSound]);

  // ─── Process Night (called each frame during night) ────────────────────────
  const processNight = useCallback(() => {
    const s = stateRef.current;
    s.nightProgress += 0.5;

    // Spawn guests
    const hiredWaiters = s.employees.filter(e => e.hired && e.role === "waiter").length;
    const spawnRate = 0.02 + hiredWaiters * 0.008 + s.reputation * 0.0003;
    if (s.guests.length < s.maxGuests && Math.random() < spawnRate) {
      s.guests.push(spawnGuest(s));
    }

    // Update guests
    for (let i = s.guests.length - 1; i >= 0; i--) {
      const g = s.guests[i];
      g.x += g.vx;
      g.y += g.vy;
      if (g.x < 30 || g.x > CW - 30) g.vx *= -1;
      if (g.y < 160 || g.y > CH - 60) g.vy *= -1;
      g.x = Math.max(30, Math.min(CW - 30, g.x));
      g.y = Math.max(160, Math.min(CH - 60, g.y));
      g.timer--;
      if (g.timer <= 0) {
        const income = Math.floor(g.spending * (g.satisfaction / 50));
        s.dailyIncome += income;
        s.gold += income;
        for (let p = 0; p < 3; p++) {
          s.particles.push({
            x: g.x, y: g.y,
            vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2,
            life: 30, maxLife: 30,
            color: g.isVIP ? GOLD_COLOR : GREEN,
            size: g.isVIP ? 4 : 2,
          });
        }
        s.guests.splice(i, 1);
      }
    }

    // Update particles
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0) s.particles.splice(i, 1);
    }

    // Night ends at 100
    if (s.nightProgress >= 100) {
      endDay();
    }
  }, []);

  // ─── End Day ───────────────────────────────────────────────────────────────
  const endDay = useCallback(() => {
    const s = stateRef.current;
    const salaryTotal = s.employees.filter(e => e.hired).reduce((a, e) => a + e.salary, 0);
    const upkeep = s.upgrades.reduce((a, u) => a + u.level * 10, 0);
    s.dailyExpense = salaryTotal + upkeep;
    s.gold -= s.dailyExpense;
    s.totalIncome += s.dailyIncome;
    s.totalExpense += s.dailyExpense;

    const avgSat = s.satisfaction;
    const hiredSkill = s.employees.filter(e => e.hired).reduce((a, e) => a + e.skill, 0);
    const upgLevel = s.upgrades.reduce((a, u) => a + u.level, 0);
    s.reputation = Math.max(0, Math.min(100,
      s.reputation + Math.floor((avgSat - 50) / 10) + Math.floor(hiredSkill / 50) + Math.floor(upgLevel / 3) - 1
    ));

    const satBase = 40;
    const satFromStaff = s.employees.filter(e => e.hired).reduce((a, e) => a + e.charm * 0.2 + e.skill * 0.15, 0);
    const satFromUpg = s.upgrades.reduce((a, u) => a + u.level * u.satisfactionBonus, 0);
    s.satisfaction = Math.min(100, Math.floor(satBase + satFromStaff + satFromUpg));

    s.score += s.dailyIncome + s.reputation;

    if (Math.random() < 0.4) {
      const evt = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      s.currentEvent = evt;
      s.gold += evt.goldChange;
      s.reputation = Math.max(0, Math.min(100, s.reputation + evt.repChange));
      s.gameLog.push(`[事件] ${evt.title}: ${evt.effect}`);
    }

    s.gameLog.push(`第${s.day}天结算: 收入+${s.dailyIncome} 支出-${s.dailyExpense}`);

    if (s.gold < -200) {
      setPhase("gameover");
      playSound("gameOver");
      return;
    }

    if (s.day >= 30) {
      setPhase("result");
      playSound("combo");
      return;
    }

    setPhase("dayEnd");
    playSound("score");
    forceUpdate(n => n + 1);
  }, [playSound]);

  // ─── Next Day ──────────────────────────────────────────────────────────────
  const nextDay = useCallback(() => {
    const s = stateRef.current;
    s.day++;
    s.dailyIncome = 0;
    s.dailyExpense = 0;
    s.nightProgress = 0;
    s.guests = [];
    s.particles = [];
    s.currentEvent = null;
    s.timeOfDay = "day";
    setPhase("playing");
    playSound("click");
    forceUpdate(n => n + 1);
  }, [playSound]);

  // ─── Start Night ───────────────────────────────────────────────────────────
  const startNight = useCallback(() => {
    const s = stateRef.current;
    if (s.hiredCount === 0) {
      s.gameLog.push("至少需要雇佣一名员工才能开始营业！");
      playSound("error");
      forceUpdate(n => n + 1);
      return;
    }
    s.timeOfDay = "night";
    s.nightProgress = 0;
    s.guests = [];
    s.particles = [];
    playSound("levelUp");
    forceUpdate(n => n + 1);
  }, [playSound]);

  // ─── Tab Switch ────────────────────────────────────────────────────────────
  const switchTab = useCallback((tab: "staff" | "upgrade" | "info") => {
    stateRef.current.selectedTab = tab;
    playSound("click");
    forceUpdate(n => n + 1);
  }, [playSound]);

  // ─── Save / Load ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const s = stateRef.current;
    return {
      gold: s.gold, day: s.day, reputation: s.reputation, satisfaction: s.satisfaction,
      totalIncome: s.totalIncome, totalExpense: s.totalExpense, score: s.score,
      employees: s.employees, upgrades: s.upgrades,
      hiredCount: s.hiredCount, difficulty: s.difficulty,
      gameLog: s.gameLog.slice(-20),
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    const diff = (d.difficulty as Difficulty) || "normal";
    const s = initState(diff);
    s.gold = (d.gold as number) ?? 500;
    s.day = (d.day as number) ?? 1;
    s.reputation = (d.reputation as number) ?? 30;
    s.satisfaction = (d.satisfaction as number) ?? 50;
    s.totalIncome = (d.totalIncome as number) ?? 0;
    s.totalExpense = (d.totalExpense as number) ?? 0;
    s.score = (d.score as number) ?? 0;
    if (Array.isArray(d.employees)) s.employees = d.employees as Employee[];
    if (Array.isArray(d.upgrades)) s.upgrades = d.upgrades as Upgrade[];
    s.hiredCount = (d.hiredCount as number) ?? 0;
    s.maxGuests = 8 + s.employees.filter(e => e.hired && e.role === "waiter").length * 3
      + s.employees.filter(e => e.hired && e.role === "bouncer").length * 2;
    if (Array.isArray(d.gameLog)) s.gameLog = d.gameLog as string[];
    stateRef.current = s;
    setDifficulty(diff);
    setPhase("playing");
    playSound("click");
    forceUpdate(n => n + 1);
  }, [playSound]);

  // ─── Canvas Click ──────────────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (CW / rect.width);
    const my = (e.clientY - rect.top) * (CH / rect.height);
    const s = stateRef.current;

    if (phaseRef.current === "title") return;
    if (phaseRef.current === "gameover" || phaseRef.current === "result") return;

    if (phaseRef.current === "playing" && s.timeOfDay === "night") {
      for (let i = s.guests.length - 1; i >= 0; i--) {
        const g = s.guests[i];
        const dx = mx - g.x, dy = my - g.y;
        if (dx * dx + dy * dy < 256) {
          const bonus = Math.floor(g.spending * 0.3);
          s.gold += bonus;
          s.dailyIncome += bonus;
          g.satisfaction = Math.min(100, g.satisfaction + 5);
          for (let p = 0; p < 5; p++) {
            s.particles.push({
              x: g.x, y: g.y,
              vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 2,
              life: 25, maxLife: 25,
              color: PRIMARY, size: 3,
            });
          }
          playSound("score");
          break;
        }
      }
    }
  }, [playSound]);

  // ─── Canvas Touch ──────────────────────────────────────────────────────────
  const handleCanvasTouch = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (touch.clientX - rect.left) * (CW / rect.width);
    const my = (touch.clientY - rect.top) * (CH / rect.height);
    const s = stateRef.current;

    if (phaseRef.current === "playing" && s.timeOfDay === "night") {
      for (let i = s.guests.length - 1; i >= 0; i--) {
        const g = s.guests[i];
        const dx = mx - g.x, dy = my - g.y;
        if (dx * dx + dy * dy < 400) {
          const bonus = Math.floor(g.spending * 0.3);
          s.gold += bonus;
          s.dailyIncome += bonus;
          g.satisfaction = Math.min(100, g.satisfaction + 5);
          for (let p = 0; p < 5; p++) {
            s.particles.push({
              x: g.x, y: g.y,
              vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 2,
              life: 25, maxLife: 25,
              color: PRIMARY, size: 3,
            });
          }
          playSound("score");
          break;
        }
      }
    }
  }, [playSound]);

  // ─── PixiJS Render Loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: CW, height: CH, backgroundColor: 0x0f0f0f, antialias: true });
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
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (80 objects)
      for (let i = 0; i < 80; i++) makeText(`t${i}`, { fontSize: 12 });

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => {
        if (textIdx >= 80) return;
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

      app.ticker.add(() => {
        if (destroyed) return;
        frameRef.current++;
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        const s = stateRef.current;
        const f = frameRef.current;
        const p = phaseRef.current;

        if (p === "title") {
          drawTitle(g, showText, cn, f);
        } else if (p === "playing") {
          if (s.timeOfDay === "night") {
            processNight();
          }
          drawPlaying(g, showText, cn, s, f);
        } else if (p === "dayEnd") {
          drawDayEnd(g, showText, cn, s, f);
        } else if (p === "gameover") {
          drawGameOver(g, showText, cn, s, f);
        } else if (p === "result") {
          drawResult(g, showText, cn, s, f);
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
  }, [processNight]);

  // ─── Draw Functions (PixiJS) ───────────────────────────────────────────────
  type ShowTextFn = (text: string, x: number, y: number, opts?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => void;
  type CnFn = (hex: string) => number;

  function drawTitle(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, f: number) {
    // Background gradient approximation
    g.rect(0, 0, CW, CH).fill({ color: 0x0a0a1a });
    g.rect(0, CH * 0.3, CW, CH * 0.4).fill({ color: 0x1a0a2e, alpha: 0.5 });

    // Animated stars
    for (let i = 0; i < 30; i++) {
      const sx = (i * 73 + f * 0.3) % CW;
      const sy = (i * 47 + f * 0.1) % CH;
      const alpha = 0.3 + 0.3 * Math.sin(f * 0.03 + i);
      g.circle(sx, sy, 1.5).fill({ color: cn(PRIMARY), alpha });
    }

    // Title
    showText("夜色酒吧", CW / 2, 160, { fill: PRIMARY, fontSize: 36, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    showText("NC-17 成人模拟经营", CW / 2, 190, { fill: ACCENT, fontSize: 14, ax: 0.5, ay: 0.5 });
    showText("雇佣员工 / 装修升级 / 经营夜店 / 事件挑战", CW / 2, 215, { fill: "#888888", fontSize: 12, ax: 0.5, ay: 0.5 });

    // Pulsing prompt
    const glow = 0.5 + 0.5 * Math.sin(f * 0.05);
    showText("选择难度开始经营", CW / 2, 280, { fill: PRIMARY, fontSize: 16, ax: 0.5, ay: 0.5, alpha: glow });

    // Difficulty buttons
    const diffs: { label: string; y: number; color: string }[] = [
      { label: "简单模式", y: 320, color: GREEN },
      { label: "普通模式", y: 360, color: PRIMARY },
      { label: "困难模式", y: 400, color: RED },
    ];
    for (const d of diffs) {
      g.roundRect(CW / 2 - 70, d.y, 140, 32, 8).fill({ color: 0x1a1a2e });
      g.roundRect(CW / 2 - 70, d.y, 140, 32, 8).stroke({ color: cn(d.color), width: 1 });
      showText(d.label, CW / 2, d.y + 16, { fill: d.color, fontSize: 14, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    }
  }

  function drawPlaying(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, f: number) {
    // Top stats bar
    g.roundRect(8, 8, CW - 16, 44, 8).fill({ color: cn(PANEL_BG) });

    showText(`金币: ${s.gold}`, 16, 26, { fill: GOLD_COLOR, fontSize: 12, fontWeight: "bold", ay: 0.5 });
    showText(`第${s.day}天`, 120, 26, { fill: PRIMARY, fontSize: 12, fontWeight: "bold", ay: 0.5 });
    showText(`声望: ${s.reputation}`, 190, 26, { fill: "#ff6b6b", fontSize: 12, fontWeight: "bold", ay: 0.5 });
    showText(`满意: ${s.satisfaction}%`, 280, 26, { fill: GREEN, fontSize: 12, fontWeight: "bold", ay: 0.5 });
    showText(`分数: ${s.score}`, 380, 26, { fill: "#aaaaaa", fontSize: 11, ay: 0.5 });

    // Time indicator
    showText(s.timeOfDay === "night" ? "夜间营业中" : "白天准备中", 16, 44, {
      fill: s.timeOfDay === "night" ? "#845ef7" : "#ffa94d", fontSize: 11, fontWeight: "bold", ay: 0.5
    });

    if (s.timeOfDay === "night") {
      // Night progress bar
      g.roundRect(130, 36, 200, 10, 4).fill({ color: 0x333333 });
      g.roundRect(130, 36, s.nightProgress * 2, 10, 4).fill({ color: cn(ACCENT) });
      showText(`${Math.floor(s.nightProgress)}%`, 340, 41, { fill: "#aaaaaa", fontSize: 10, ay: 0.5 });
      showText(`今日收入: +${s.dailyIncome}`, CW - 16, 44, { fill: GOLD_COLOR, fontSize: 11, ax: 1, ay: 0.5 });
    }

    // Main area
    if (s.timeOfDay === "day") {
      drawDayPanel(g, showText, cn, s, f);
    } else {
      drawNightScene(g, showText, cn, s, f);
    }
  }

  function drawDayPanel(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, f: number) {
    // Tab buttons
    const tabs: { key: "staff" | "upgrade" | "info"; label: string; x: number }[] = [
      { key: "staff", label: "员工管理", x: 16 },
      { key: "upgrade", label: "装修升级", x: 170 },
      { key: "info", label: "经营信息", x: 324 },
    ];
    for (const t of tabs) {
      const active = s.selectedTab === t.key;
      g.roundRect(t.x, 58, 140, 28, 6).fill({ color: active ? cn(PRIMARY) : 0x2a2a4e });
      showText(t.label, t.x + 70, 72, {
        fill: active ? "#000000" : "#aaaaaa",
        fontSize: 12, fontWeight: active ? "bold" : "normal", ax: 0.5, ay: 0.5
      });
    }

    const panelY = 94;
    g.roundRect(8, panelY, CW - 16, CH - panelY - 50, 8).fill({ color: cn(CARD_BG) });

    if (s.selectedTab === "staff") {
      drawStaffPanel(g, showText, cn, s, panelY);
    } else if (s.selectedTab === "upgrade") {
      drawUpgradePanel(g, showText, cn, s, panelY);
    } else {
      drawInfoPanel(g, showText, cn, s, panelY, f);
    }

    // Start Night button
    g.roundRect(CW / 2 - 80, CH - 42, 160, 34, 8).fill({ color: s.hiredCount > 0 ? cn(ACCENT) : 0x333333 });
    showText("开始营业", CW / 2, CH - 25, {
      fill: s.hiredCount > 0 ? "#ffffff" : "#666666",
      fontSize: 14, fontWeight: "bold", ax: 0.5, ay: 0.5
    });
  }

  function drawStaffPanel(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, panelY: number) {
    const employees = s.employees;
    const perPage = 6;
    let y = panelY + 10;

    showText(`已雇佣: ${s.hiredCount}/16  |  点击下方按钮雇佣/查看`, 20, y + 8, { fill: "#aaaaaa", fontSize: 11, ay: 0.5 });
    y += 22;

    for (let i = 0; i < Math.min(perPage, employees.length); i++) {
      const emp = employees[i];
      const ey = y + i * 56;
      const roleColor = ROLE_COLORS[emp.role] || "#aaaaaa";

      g.roundRect(16, ey, CW - 32, 50, 6).fill({ color: emp.hired ? 0x1a2a1a : cn(PANEL_BG) });
      g.roundRect(16, ey, CW - 32, 50, 6).stroke({ color: emp.hired ? cn(GREEN) : 0x333333, width: 1 });

      // Role badge
      g.roundRect(24, ey + 6, 50, 16, 4).fill({ color: cn(roleColor) });
      showText(ROLE_NAMES[emp.role], 49, ey + 14, { fill: "#ffffff", fontSize: 10, fontWeight: "bold", ax: 0.5, ay: 0.5 });

      // Name
      showText(emp.name, 82, ey + 18, { fill: "#ffffff", fontSize: 12, fontWeight: "bold", ay: 0.5 });

      // Stats
      showText(`魅力:${emp.charm} 技能:${emp.skill} 体力:${emp.stamina}`, 24, ey + 38, { fill: "#888888", fontSize: 10, ay: 0.5 });

      // Salary / hire button
      if (emp.hired) {
        showText("已雇佣", CW - 28, ey + 18, { fill: GREEN, fontSize: 11, fontWeight: "bold", ax: 1, ay: 0.5 });
        showText(`日薪: ${emp.salary}`, CW - 28, ey + 36, { fill: "#888888", fontSize: 10, ax: 1, ay: 0.5 });
      } else {
        const cost = Math.floor(emp.salary * 3 * diffCostMult(s.difficulty));
        g.roundRect(CW - 90, ey + 8, 56, 30, 6).fill({ color: s.gold >= cost ? 0x2a4a2a : 0x3a2a2a });
        showText("雇佣", CW - 62, ey + 17, { fill: s.gold >= cost ? GREEN : RED, fontSize: 10, fontWeight: "bold", ax: 0.5, ay: 0.5 });
        showText(`${cost}G`, CW - 62, ey + 30, { fill: GOLD_COLOR, fontSize: 9, ax: 0.5, ay: 0.5 });
      }
    }
  }

  function drawUpgradePanel(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, panelY: number) {
    let y = panelY + 12;
    showText("升级设施提升客人满意度和收入", 20, y + 8, { fill: "#aaaaaa", fontSize: 11, ay: 0.5 });
    y += 24;

    const catIcons: Record<string, string> = { lighting: "灯", sound: "音", vip: "V", stage: "台" };
    const catColors: Record<string, string> = { lighting: "#ffa94d", sound: "#845ef7", vip: "#ff6b6b", stage: "#51cf66" };

    for (let i = 0; i < s.upgrades.length; i++) {
      const upg = s.upgrades[i];
      const uy = y + i * 80;
      const catColor = catColors[upg.category] || "#aaaaaa";

      g.roundRect(16, uy, CW - 32, 72, 6).fill({ color: cn(PANEL_BG) });
      g.roundRect(16, uy, CW - 32, 72, 6).stroke({ color: cn(catColor), width: 1 });

      // Category icon
      g.circle(42, uy + 24, 14).fill({ color: cn(catColor) });
      showText(catIcons[upg.category] || "?", 42, uy + 24, { fill: "#ffffff", fontSize: 12, fontWeight: "bold", ax: 0.5, ay: 0.5 });

      // Name and level
      showText(upg.name, 66, uy + 20, { fill: "#ffffff", fontSize: 13, fontWeight: "bold", ay: 0.5 });

      // Level bar
      for (let l = 0; l < upg.maxLevel; l++) {
        g.roundRect(66 + l * 24, uy + 28, 18, 8, 3).fill({ color: l < upg.level ? cn(catColor) : 0x333333 });
      }
      showText(`Lv.${upg.level}/${upg.maxLevel}`, 66 + upg.maxLevel * 24 + 8, uy + 32, { fill: "#888888", fontSize: 10, ay: 0.5 });

      // Desc
      showText(`${upg.desc} | 满意+${upg.satisfactionBonus} 收入+${upg.incomeBonus}/级`, 24, uy + 58, { fill: "#666666", fontSize: 10, ay: 0.5 });

      // Upgrade button
      if (upg.level < upg.maxLevel) {
        const cost = Math.floor(upg.cost * (1 + upg.level * 0.5) * diffCostMult(s.difficulty));
        g.roundRect(CW - 90, uy + 12, 56, 44, 6).fill({ color: s.gold >= cost ? 0x2a2a5e : 0x3a2a2a });
        showText("升级", CW - 62, uy + 27, { fill: s.gold >= cost ? PRIMARY : RED, fontSize: 10, fontWeight: "bold", ax: 0.5, ay: 0.5 });
        showText(`${cost}G`, CW - 62, uy + 43, { fill: GOLD_COLOR, fontSize: 9, ax: 0.5, ay: 0.5 });
      } else {
        showText("满级", CW - 62, uy + 34, { fill: GREEN, fontSize: 11, fontWeight: "bold", ax: 0.5, ay: 0.5 });
      }
    }
  }

  function drawInfoPanel(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, panelY: number, _f: number) {
    let y = panelY + 16;
    const lx = 24, rx = 260;

    showText("经营概况", lx, y, { fill: "#ffffff", fontSize: 13, fontWeight: "bold", ay: 0.5 });
    y += 24;

    const info = [
      { label: "当前金币", value: `${s.gold}G`, color: GOLD_COLOR },
      { label: "经营天数", value: `第${s.day}天 / 30天`, color: PRIMARY },
      { label: "声望等级", value: `${s.reputation}/100`, color: "#ff6b6b" },
      { label: "客人满意度", value: `${s.satisfaction}%`, color: GREEN },
      { label: "累计收入", value: `+${s.totalIncome}G`, color: GREEN },
      { label: "累计支出", value: `-${s.totalExpense}G`, color: RED },
      { label: "员工数量", value: `${s.hiredCount}人`, color: "#845ef7" },
      { label: "最大客容量", value: `${s.maxGuests}人`, color: PRIMARY },
    ];

    for (let i = 0; i < info.length; i++) {
      const ix = i % 2 === 0 ? lx : rx;
      const iy = y + Math.floor(i / 2) * 30;
      showText(info[i].label, ix, iy, { fill: "#888888", fontSize: 11, ay: 0.5 });
      showText(info[i].value, ix + 80, iy, { fill: info[i].color, fontSize: 12, fontWeight: "bold", ay: 0.5 });
    }

    // Game log
    y += Math.ceil(info.length / 2) * 30 + 16;
    showText("经营日志", lx, y, { fill: "#ffffff", fontSize: 12, fontWeight: "bold", ay: 0.5 });
    y += 16;

    const logs = s.gameLog.slice(-8);
    for (let i = 0; i < logs.length; i++) {
      const logText = logs[i].length > 40 ? logs[i].slice(0, 40) + "..." : logs[i];
      showText(logText, lx, y + i * 14, { fill: logs[i].startsWith("[事件]") ? "#ffa94d" : "#666666", fontSize: 10, ay: 0.5 });
    }
  }

  function drawNightScene(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, f: number) {
    // Night background
    g.rect(0, 56, CW, CH - 56).fill({ color: 0x0a0a2e });
    g.rect(0, CH * 0.5, CW, CH * 0.5).fill({ color: 0x1a0a3e, alpha: 0.5 });

    // Bar counter
    g.roundRect(20, 60, CW - 40, 90, 8).fill({ color: 0x2a1a3e });
    g.roundRect(20, 60, CW - 40, 90, 8).stroke({ color: cn(ACCENT), width: 1 });

    // Bar label
    showText("吧台区域", CW / 2, 80, { fill: ACCENT, fontSize: 12, fontWeight: "bold", ax: 0.5, ay: 0.5 });

    // Hired staff icons on bar
    const hired = s.employees.filter(e => e.hired);
    for (let i = 0; i < hired.length; i++) {
      const ex = 50 + (i % 8) * 52;
      const ey = 95 + Math.floor(i / 8) * 28;
      const roleColor = ROLE_COLORS[hired[i].role];
      g.circle(ex, ey, 10).fill({ color: cn(roleColor) });
      showText(ROLE_NAMES[hired[i].role][0], ex, ey, { fill: "#ffffff", fontSize: 8, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    }

    // Dance floor area
    g.roundRect(20, 155, CW - 40, CH - 210, 8).fill({ color: 0x1a0a2e });

    // Animated floor lights
    const lightUpg = s.upgrades.find(u => u.id === "light");
    const lightLevel = lightUpg?.level || 0;
    if (lightLevel > 0) {
      for (let i = 0; i < lightLevel * 3; i++) {
        const lx = 40 + (i * 67 + f * 2) % (CW - 80);
        const ly = 170 + (i * 43 + f) % (CH - 240);
        const hue = (f * 2 + i * 60) % 360;
        g.circle(lx, ly, 20 + lightLevel * 5).fill({ color: hslToNum(hue, 80, 60), alpha: 0.15 });
      }
    }

    // Sound waves (if sound upgraded)
    const soundUpg = s.upgrades.find(u => u.id === "sound");
    const soundLevel = soundUpg?.level || 0;
    if (soundLevel > 0) {
      for (let i = 0; i < soundLevel; i++) {
        const wave = (f * 0.05 + i * 0.5) % 3;
        const alpha = 0.3 - wave * 0.1;
        if (alpha > 0) {
          g.circle(CW / 2, CH - 80, 30 + wave * 40).stroke({ color: 0x845ef7, width: 1, alpha });
        }
      }
    }

    // VIP area indicator
    const vipUpg = s.upgrades.find(u => u.id === "vip");
    if (vipUpg && vipUpg.level > 0) {
      g.roundRect(CW - 120, 160, 95, 60, 6).fill({ color: 0xff6b6b, alpha: 0.1 });
      g.roundRect(CW - 120, 160, 95, 60, 6).stroke({ color: 0xff6b6b, width: 1 });
      showText(`VIP Lv.${vipUpg.level}`, CW - 72, 178, { fill: "#ff6b6b", fontSize: 9, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    }

    // Stage indicator
    const stageUpg = s.upgrades.find(u => u.id === "stage");
    if (stageUpg && stageUpg.level > 0) {
      g.roundRect(25, 160, 95, 60, 6).fill({ color: 0x51cf66, alpha: 0.1 });
      g.roundRect(25, 160, 95, 60, 6).stroke({ color: 0x51cf66, width: 1 });
      showText(`舞台 Lv.${stageUpg.level}`, 72, 178, { fill: "#51cf66", fontSize: 9, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    }

    // Draw guests
    for (const guest of s.guests) {
      const guestColor = guest.color.startsWith("#") ? cn(guest.color) : hslToNum(
        parseInt(guest.color.match(/\d+/)?.[0] || "0"), 60, 65
      );
      g.circle(guest.x, guest.y, guest.isVIP ? 10 : 7).fill({ color: guestColor });

      if (guest.isVIP) {
        showText("V", guest.x, guest.y - 14, { fill: GOLD_COLOR, fontSize: 8, fontWeight: "bold", ax: 0.5, ay: 0.5 });
        const glowAlpha = 0.3 + 0.2 * Math.sin(f * 0.1);
        g.circle(guest.x, guest.y, 14).stroke({ color: cn(GOLD_COLOR), width: 2, alpha: glowAlpha });
      }

      // Satisfaction indicator
      const satColor = guest.satisfaction > 70 ? GREEN : guest.satisfaction > 40 ? "#ffa94d" : RED;
      g.rect(guest.x - 6, guest.y + 10, (guest.satisfaction / 100) * 12, 2).fill({ color: cn(satColor) });
    }

    // Draw particles
    for (const pt of s.particles) {
      const alpha = pt.life / pt.maxLife;
      g.circle(pt.x, pt.y, pt.size * alpha).fill({ color: cn(pt.color), alpha });
    }

    // Guest count
    showText(`客人: ${s.guests.length}/${s.maxGuests}`, 24, CH - 42, { fill: "#aaaaaa", fontSize: 11, ay: 0.5 });

    // Hint
    showText("点击客人可获得额外小费", CW / 2, CH - 10, { fill: "#555555", fontSize: 10, ax: 0.5, ay: 0.5 });
  }

  function drawDayEnd(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, f: number) {
    g.rect(0, 0, CW, CH).fill({ color: 0x0a0a1a });

    showText(`第${s.day}天 结算`, CW / 2, 80, { fill: PRIMARY, fontSize: 24, fontWeight: "bold", ax: 0.5, ay: 0.5 });

    const items = [
      { label: "今日收入", value: `+${s.dailyIncome}G`, color: GREEN },
      { label: "员工薪资", value: `-${s.employees.filter(e => e.hired).reduce((a, e) => a + e.salary, 0)}G`, color: RED },
      { label: "设施维护", value: `-${s.upgrades.reduce((a, u) => a + u.level * 10, 0)}G`, color: RED },
      { label: "净利润", value: `${s.dailyIncome - s.dailyExpense >= 0 ? "+" : ""}${s.dailyIncome - s.dailyExpense}G`, color: s.dailyIncome - s.dailyExpense >= 0 ? GREEN : RED },
      { label: "当前金币", value: `${s.gold}G`, color: GOLD_COLOR },
      { label: "声望", value: `${s.reputation}/100`, color: "#ff6b6b" },
      { label: "满意度", value: `${s.satisfaction}%`, color: PRIMARY },
    ];

    for (let i = 0; i < items.length; i++) {
      const iy = 120 + i * 36;
      g.roundRect(80, iy, CW - 160, 28, 6).fill({ color: cn(PANEL_BG) });
      showText(items[i].label, 96, iy + 14, { fill: "#aaaaaa", fontSize: 12, ay: 0.5 });
      showText(items[i].value, CW - 96, iy + 14, { fill: items[i].color, fontSize: 13, fontWeight: "bold", ax: 1, ay: 0.5 });
    }

    // Event
    if (s.currentEvent) {
      const ey = 120 + items.length * 36 + 16;
      g.roundRect(40, ey, CW - 80, 60, 8).fill({ color: 0x2a1a0a });
      g.roundRect(40, ey, CW - 80, 60, 8).stroke({ color: 0xffa94d, width: 1 });
      showText(`[事件] ${s.currentEvent.title}`, CW / 2, ey + 16, { fill: "#ffa94d", fontSize: 12, fontWeight: "bold", ax: 0.5, ay: 0.5 });
      showText(s.currentEvent.desc, CW / 2, ey + 34, { fill: "#cccccc", fontSize: 11, ax: 0.5, ay: 0.5 });
      showText(s.currentEvent.effect, CW / 2, ey + 50, {
        fill: s.currentEvent.goldChange >= 0 ? GREEN : RED,
        fontSize: 11, fontWeight: "bold", ax: 0.5, ay: 0.5
      });
    }

    // Next day button
    const glow = 0.7 + 0.3 * Math.sin(f * 0.06);
    g.roundRect(CW / 2 - 70, CH - 60, 140, 36, 8).fill({ color: cn(PRIMARY), alpha: glow });
    showText("进入下一天", CW / 2, CH - 42, { fill: "#000000", fontSize: 14, fontWeight: "bold", ax: 0.5, ay: 0.5 });
  }

  function drawGameOver(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, f: number) {
    g.rect(0, 0, CW, CH).fill({ color: 0x0a0000, alpha: 0.95 });

    showText("经营失败", CW / 2, CH / 2 - 60, { fill: RED, fontSize: 32, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    showText("酒吧资金链断裂，被迫关门！", CW / 2, CH / 2 - 25, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5 });
    showText(`最终分数: ${s.score}`, CW / 2, CH / 2 + 10, { fill: GOLD_COLOR, fontSize: 16, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    showText(`经营了 ${s.day} 天 | 累计收入 ${s.totalIncome}G`, CW / 2, CH / 2 + 40, { fill: "#888888", fontSize: 12, ax: 0.5, ay: 0.5 });

    const glow = 0.5 + 0.5 * Math.sin(f * 0.05);
    showText("点击重新开始", CW / 2, CH / 2 + 80, { fill: PRIMARY, fontSize: 14, ax: 0.5, ay: 0.5, alpha: glow });
  }

  function drawResult(g: PixiGraphics, showText: ShowTextFn, cn: CnFn, s: GameState, f: number) {
    g.rect(0, 0, CW, CH).fill({ color: 0x0a0a1a });

    // Stars
    for (let i = 0; i < 40; i++) {
      const sx = (i * 73 + f * 0.5) % CW;
      const sy = (i * 47 + f * 0.2) % CH;
      const alpha = 0.3 + 0.3 * Math.sin(f * 0.03 + i);
      g.circle(sx, sy, 1.5).fill({ color: cn(GOLD_COLOR), alpha });
    }

    showText("经营成功！", CW / 2, 100, { fill: GOLD_COLOR, fontSize: 28, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    showText("你成功经营了30天！", CW / 2, 135, { fill: PRIMARY, fontSize: 16, ax: 0.5, ay: 0.5 });

    const results = [
      { label: "最终分数", value: `${s.score}`, color: GOLD_COLOR },
      { label: "累计收入", value: `${s.totalIncome}G`, color: GREEN },
      { label: "累计支出", value: `${s.totalExpense}G`, color: RED },
      { label: "最终声望", value: `${s.reputation}/100`, color: "#ff6b6b" },
      { label: "员工数量", value: `${s.hiredCount}人`, color: "#845ef7" },
      { label: "难度", value: s.difficulty === "easy" ? "简单" : s.difficulty === "hard" ? "困难" : "普通", color: "#aaaaaa" },
    ];

    for (let i = 0; i < results.length; i++) {
      const iy = 170 + i * 34;
      g.roundRect(100, iy, CW - 200, 28, 6).fill({ color: cn(PANEL_BG) });
      showText(results[i].label, 116, iy + 14, { fill: "#aaaaaa", fontSize: 12, ay: 0.5 });
      showText(results[i].value, CW - 116, iy + 14, { fill: results[i].color, fontSize: 13, fontWeight: "bold", ax: 1, ay: 0.5 });
    }

    // Rating
    const rating = s.score > 3000 ? "S" : s.score > 2000 ? "A" : s.score > 1000 ? "B" : "C";
    const ratingColor = rating === "S" ? GOLD_COLOR : rating === "A" ? GREEN : rating === "B" ? PRIMARY : "#888888";
    showText(rating, CW / 2, CH - 80, { fill: ratingColor, fontSize: 48, fontWeight: "bold", ax: 0.5, ay: 0.5 });
    showText("评级", CW / 2, CH - 52, { fill: "#aaaaaa", fontSize: 12, ax: 0.5, ay: 0.5 });

    const glow = 0.5 + 0.5 * Math.sin(f * 0.05);
    showText("点击重新开始", CW / 2, CH - 25, { fill: PRIMARY, fontSize: 14, ax: 0.5, ay: 0.5, alpha: glow });
  }

  // ─── HTML Button Handlers ──────────────────────────────────────────────────
  const handleTitleClick = useCallback((diff: Difficulty) => {
    startGame(diff);
  }, [startGame]);

  const handleDayEndClick = useCallback(() => {
    if (phase === "dayEnd") nextDay();
  }, [phase, nextDay]);

  const handleStartNight = useCallback(() => {
    if (phase === "playing" && stateRef.current.timeOfDay === "day") startNight();
  }, [phase, startNight]);

  const handleRestart = useCallback(() => {
    startGame(difficulty);
  }, [startGame, difficulty]);

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
  const s = stateRef.current;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Nav */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff]">
            <ChevronLeft size={16} /> 返回
          </Link>
          <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-white/10 transition">
            {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2 mb-4">
          <Wine size={24} className="text-[#a55eea]" />
          <h1 className="text-xl font-bold">夜色酒吧</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400 ml-2">NC-17</span>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border border-white/10 cursor-pointer"
          onClick={handleCanvasClick}
          onTouchEnd={handleCanvasTouch}
        />

        {/* Controls below canvas */}
        {phase === "title" && (
          <div className="flex gap-2 mt-4 justify-center">
            <button onClick={() => handleTitleClick("easy")} className="px-4 py-2 rounded-lg bg-[#2ed573]/20 text-[#2ed573] text-sm font-medium hover:bg-[#2ed573]/30 transition">
              <Play size={14} className="inline mr-1" />简单
            </button>
            <button onClick={() => handleTitleClick("normal")} className="px-4 py-2 rounded-lg bg-[#3ea6ff]/20 text-[#3ea6ff] text-sm font-medium hover:bg-[#3ea6ff]/30 transition">
              <Play size={14} className="inline mr-1" />普通
            </button>
            <button onClick={() => handleTitleClick("hard")} className="px-4 py-2 rounded-lg bg-[#ff4757]/20 text-[#ff4757] text-sm font-medium hover:bg-[#ff4757]/30 transition">
              <Play size={14} className="inline mr-1" />困难
            </button>
          </div>
        )}

        {phase === "playing" && s.timeOfDay === "day" && (
          <div className="mt-4 space-y-3">
            {/* Tab buttons */}
            <div className="flex gap-2">
              <button onClick={() => switchTab("staff")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${s.selectedTab === "staff" ? "bg-[#3ea6ff] text-black" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                <Users size={14} className="inline mr-1" />员工
              </button>
              <button onClick={() => switchTab("upgrade")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${s.selectedTab === "upgrade" ? "bg-[#3ea6ff] text-black" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                <Sparkles size={14} className="inline mr-1" />装修
              </button>
              <button onClick={() => switchTab("info")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${s.selectedTab === "info" ? "bg-[#3ea6ff] text-black" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                <Star size={14} className="inline mr-1" />信息
              </button>
            </div>

            {/* Staff list (HTML overlay for better interaction) */}
            {s.selectedTab === "staff" && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {s.employees.slice(0, 8).map(emp => {
                  const cost = Math.floor(emp.salary * 3 * diffCostMult(s.difficulty));
                  return (
                    <div key={emp.id} className={`flex items-center gap-2 p-2 rounded-lg border ${emp.hired ? "border-green-800 bg-green-900/10" : "border-white/10 bg-white/5"}`}>
                      <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ backgroundColor: ROLE_COLORS[emp.role], color: "#fff" }}>
                        {ROLE_NAMES[emp.role]}
                      </span>
                      <span className="text-sm font-medium flex-1">{emp.name}</span>
                      <span className="text-[10px] text-gray-500">魅{emp.charm} 技{emp.skill} 体{emp.stamina}</span>
                      {emp.hired ? (
                        <span className="text-xs text-green-400 font-bold">已雇佣</span>
                      ) : (
                        <button
                          onClick={() => hireEmployee(emp.id)}
                          disabled={s.gold < cost}
                          className="px-2 py-1 rounded text-xs font-bold bg-[#3ea6ff]/20 text-[#3ea6ff] hover:bg-[#3ea6ff]/30 disabled:opacity-30 transition"
                        >
                          雇佣 {cost}G
                        </button>
                      )}
                    </div>
                  );
                })}
                {s.employees.length > 8 && (
                  <div className="space-y-2">
                    {s.employees.slice(8).map(emp => {
                      const cost = Math.floor(emp.salary * 3 * diffCostMult(s.difficulty));
                      return (
                        <div key={emp.id} className={`flex items-center gap-2 p-2 rounded-lg border ${emp.hired ? "border-green-800 bg-green-900/10" : "border-white/10 bg-white/5"}`}>
                          <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ backgroundColor: ROLE_COLORS[emp.role], color: "#fff" }}>
                            {ROLE_NAMES[emp.role]}
                          </span>
                          <span className="text-sm font-medium flex-1">{emp.name}</span>
                          <span className="text-[10px] text-gray-500">魅{emp.charm} 技{emp.skill} 体{emp.stamina}</span>
                          {emp.hired ? (
                            <span className="text-xs text-green-400 font-bold">已雇佣</span>
                          ) : (
                            <button
                              onClick={() => hireEmployee(emp.id)}
                              disabled={s.gold < cost}
                              className="px-2 py-1 rounded text-xs font-bold bg-[#3ea6ff]/20 text-[#3ea6ff] hover:bg-[#3ea6ff]/30 disabled:opacity-30 transition"
                            >
                              雇佣 {cost}G
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {s.selectedTab === "upgrade" && (
              <div className="space-y-2">
                {s.upgrades.map(upg => {
                  const cost = Math.floor(upg.cost * (1 + upg.level * 0.5) * diffCostMult(s.difficulty));
                  const catColors: Record<string, string> = { lighting: "#ffa94d", sound: "#845ef7", vip: "#ff6b6b", stage: "#51cf66" };
                  const catColor = catColors[upg.category] || "#aaa";
                  return (
                    <div key={upg.id} className="p-3 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: catColor }}>
                          {upg.category === "lighting" ? <Lamp size={12} /> : upg.category === "sound" ? <Speaker size={12} /> : upg.category === "vip" ? <Crown size={12} /> : <Star size={12} />}
                        </span>
                        <span className="text-sm font-bold flex-1">{upg.name}</span>
                        <span className="text-xs text-gray-500">Lv.{upg.level}/{upg.maxLevel}</span>
                      </div>
                      <div className="flex gap-1 mb-1">
                        {Array.from({ length: upg.maxLevel }).map((_, l) => (
                          <div key={l} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: l < upg.level ? catColor : "#333" }} />
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">{upg.desc} | 满意+{upg.satisfactionBonus} 收入+{upg.incomeBonus}/级</span>
                        {upg.level < upg.maxLevel ? (
                          <button
                            onClick={() => buyUpgrade(upg.id)}
                            disabled={s.gold < cost}
                            className="px-2 py-1 rounded text-xs font-bold bg-[#a55eea]/20 text-[#a55eea] hover:bg-[#a55eea]/30 disabled:opacity-30 transition"
                          >
                            升级 {cost}G
                          </button>
                        ) : (
                          <span className="text-xs text-green-400 font-bold">满级</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {s.selectedTab === "info" && (
              <div className="p-3 rounded-lg border border-white/10 bg-white/5 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">金币</span><span className="text-[#ffd700] font-bold">{s.gold}G</span></div>
                <div className="flex justify-between"><span className="text-gray-500">天数</span><span className="text-[#3ea6ff]">第{s.day}天/30天</span></div>
                <div className="flex justify-between"><span className="text-gray-500">声望</span><span className="text-[#ff6b6b]">{s.reputation}/100</span></div>
                <div className="flex justify-between"><span className="text-gray-500">满意度</span><span className="text-[#2ed573]">{s.satisfaction}%</span></div>
                <div className="flex justify-between"><span className="text-gray-500">员工</span><span>{s.hiredCount}人</span></div>
                <div className="flex justify-between"><span className="text-gray-500">客容量</span><span>{s.maxGuests}人</span></div>
                <div className="flex justify-between"><span className="text-gray-500">累计收入</span><span className="text-[#2ed573]">+{s.totalIncome}G</span></div>
                <div className="flex justify-between"><span className="text-gray-500">累计支出</span><span className="text-[#ff4757]">-{s.totalExpense}G</span></div>
                <div className="mt-2 pt-2 border-t border-white/10">
                  <p className="text-gray-500 font-bold mb-1">经营日志</p>
                  {s.gameLog.slice(-5).map((log, i) => (
                    <p key={i} className={`text-[10px] ${log.startsWith("[事件]") ? "text-[#ffa94d]" : "text-gray-600"}`}>{log}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Start Night button */}
            <button
              onClick={handleStartNight}
              disabled={s.hiredCount === 0}
              className="w-full py-3 rounded-lg bg-[#a55eea] text-white font-bold text-sm hover:bg-[#a55eea]/80 disabled:opacity-30 transition"
            >
              <Moon size={14} className="inline mr-1" />开始营业（进入夜间）
            </button>
          </div>
        )}

        {phase === "dayEnd" && (
          <button
            onClick={handleDayEndClick}
            className="w-full mt-4 py-3 rounded-lg bg-[#3ea6ff] text-black font-bold text-sm hover:bg-[#3ea6ff]/80 transition"
          >
            <Clock size={14} className="inline mr-1" />进入下一天
          </button>
        )}

        {(phase === "gameover" || phase === "result") && (
          <div className="flex gap-2 mt-4">
            <button onClick={handleRestart} className="flex-1 py-2 rounded-lg bg-[#a55eea] text-white text-sm font-bold hover:bg-[#a55eea]/80 transition">
              <RotateCcw size={14} className="inline mr-1" />重新开始
            </button>
          </div>
        )}

        {/* Save/Load & Leaderboard */}
        <div className="mt-6 space-y-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </div>
    </div>
  );
}
