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
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const stateRef = useRef<GameState>(initState("normal"));

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
        // Particle effect
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
    // Calculate expenses
    const salaryTotal = s.employees.filter(e => e.hired).reduce((a, e) => a + e.salary, 0);
    const upkeep = s.upgrades.reduce((a, u) => a + u.level * 10, 0);
    s.dailyExpense = salaryTotal + upkeep;
    s.gold -= s.dailyExpense;
    s.totalIncome += s.dailyIncome;
    s.totalExpense += s.dailyExpense;

    // Update reputation
    const avgSat = s.satisfaction;
    const hiredSkill = s.employees.filter(e => e.hired).reduce((a, e) => a + e.skill, 0);
    const upgLevel = s.upgrades.reduce((a, u) => a + u.level, 0);
    s.reputation = Math.max(0, Math.min(100,
      s.reputation + Math.floor((avgSat - 50) / 10) + Math.floor(hiredSkill / 50) + Math.floor(upgLevel / 3) - 1
    ));

    // Update satisfaction
    const satBase = 40;
    const satFromStaff = s.employees.filter(e => e.hired).reduce((a, e) => a + e.charm * 0.2 + e.skill * 0.15, 0);
    const satFromUpg = s.upgrades.reduce((a, u) => a + u.level * u.satisfactionBonus, 0);
    s.satisfaction = Math.min(100, Math.floor(satBase + satFromStaff + satFromUpg));

    s.score += s.dailyIncome + s.reputation;

    // Random event
    if (Math.random() < 0.4) {
      const evt = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      s.currentEvent = evt;
      s.gold += evt.goldChange;
      s.reputation = Math.max(0, Math.min(100, s.reputation + evt.repChange));
      s.gameLog.push(`[事件] ${evt.title}: ${evt.effect}`);
    }

    s.gameLog.push(`第${s.day}天结算: 收入+${s.dailyIncome} 支出-${s.dailyExpense}`);

    // Check game over
    if (s.gold < -200) {
      setPhase("gameover");
      playSound("gameOver");
      return;
    }

    // Check win (day 30)
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

    // During night, click on guests for bonus
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

  // ─── Canvas Render Loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = `${CW}px`;
    canvas.style.height = `${CH}px`;

    let lastTime = 0;
    const targetInterval = 1000 / 60;

    const render = (timestamp: number) => {
      const delta = timestamp - lastTime;
      if (delta < targetInterval * 0.8) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      lastTime = timestamp;
      frameRef.current++;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, CW, CH);
      const s = stateRef.current;
      const f = frameRef.current;

      if (phaseRef.current === "title") {
        drawTitle(ctx, f);
      } else if (phaseRef.current === "playing") {
        if (s.timeOfDay === "night") {
          processNight();
        }
        drawPlaying(ctx, s, f);
      } else if (phaseRef.current === "dayEnd") {
        drawDayEnd(ctx, s, f);
      } else if (phaseRef.current === "gameover") {
        drawGameOver(ctx, s, f);
      } else if (phaseRef.current === "result") {
        drawResult(ctx, s, f);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [phase, processNight]);

  // ─── Draw Functions ────────────────────────────────────────────────────────
  function drawTitle(ctx: CanvasRenderingContext2D, f: number) {
    // Background gradient effect
    const grad = ctx.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, "#0a0a1a");
    grad.addColorStop(0.5, "#1a0a2e");
    grad.addColorStop(1, "#0a0a1a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);

    // Animated stars
    for (let i = 0; i < 30; i++) {
      const sx = (i * 73 + f * 0.3) % CW;
      const sy = (i * 47 + f * 0.1) % CH;
      const alpha = 0.3 + 0.3 * Math.sin(f * 0.03 + i);
      ctx.fillStyle = `rgba(62, 166, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Title
    ctx.fillStyle = PRIMARY;
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("夜色酒吧", CW / 2, 160);

    ctx.fillStyle = ACCENT;
    ctx.font = "14px sans-serif";
    ctx.fillText("NC-17 成人模拟经营", CW / 2, 190);

    ctx.fillStyle = "#888";
    ctx.font = "12px sans-serif";
    ctx.fillText("雇佣员工 / 装修升级 / 经营夜店 / 事件挑战", CW / 2, 215);

    // Pulsing prompt
    const glow = 0.5 + 0.5 * Math.sin(f * 0.05);
    ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
    ctx.font = "16px sans-serif";
    ctx.fillText("选择难度开始经营", CW / 2, 280);

    // Difficulty buttons
    const diffs: { label: string; key: Difficulty; y: number; color: string }[] = [
      { label: "简单模式", key: "easy", y: 320, color: GREEN },
      { label: "普通模式", key: "normal", y: 360, color: PRIMARY },
      { label: "困难模式", key: "hard", y: 400, color: RED },
    ];
    for (const d of diffs) {
      ctx.fillStyle = "#1a1a2e";
      ctx.beginPath();
      ctx.roundRect(CW / 2 - 70, d.y, 140, 32, 8);
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(CW / 2 - 70, d.y, 140, 32, 8);
      ctx.stroke();
      ctx.fillStyle = d.color;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(d.label, CW / 2, d.y + 21);
    }
  }

  function drawPlaying(ctx: CanvasRenderingContext2D, s: GameState, f: number) {
    // Top stats bar
    ctx.fillStyle = PANEL_BG;
    ctx.beginPath();
    ctx.roundRect(8, 8, CW - 16, 44, 8);
    ctx.fill();

    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = GOLD_COLOR;
    ctx.fillText(`金币: ${s.gold}`, 16, 26);
    ctx.fillStyle = PRIMARY;
    ctx.fillText(`第${s.day}天`, 120, 26);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillText(`声望: ${s.reputation}`, 190, 26);
    ctx.fillStyle = GREEN;
    ctx.fillText(`满意: ${s.satisfaction}%`, 280, 26);
    ctx.fillStyle = "#aaa";
    ctx.font = "11px sans-serif";
    ctx.fillText(`分数: ${s.score}`, 380, 26);

    // Time indicator
    ctx.fillStyle = s.timeOfDay === "night" ? "#845ef7" : "#ffa94d";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(s.timeOfDay === "night" ? "夜间营业中" : "白天准备中", 16, 44);

    if (s.timeOfDay === "night") {
      // Night progress bar
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.roundRect(130, 36, 200, 10, 4);
      ctx.fill();
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.roundRect(130, 36, s.nightProgress * 2, 10, 4);
      ctx.fill();
      ctx.fillStyle = "#aaa";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${Math.floor(s.nightProgress)}%`, 340, 45);

      ctx.fillStyle = GOLD_COLOR;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`今日收入: +${s.dailyIncome}`, CW - 16, 44);
    }

    // Main area
    if (s.timeOfDay === "day") {
      drawDayPanel(ctx, s, f);
    } else {
      drawNightScene(ctx, s, f);
    }
  }

  function drawDayPanel(ctx: CanvasRenderingContext2D, s: GameState, f: number) {
    // Tab buttons
    const tabs: { key: "staff" | "upgrade" | "info"; label: string; x: number }[] = [
      { key: "staff", label: "员工管理", x: 16 },
      { key: "upgrade", label: "装修升级", x: 170 },
      { key: "info", label: "经营信息", x: 324 },
    ];
    for (const t of tabs) {
      const active = s.selectedTab === t.key;
      ctx.fillStyle = active ? PRIMARY : "#2a2a4e";
      ctx.beginPath();
      ctx.roundRect(t.x, 58, 140, 28, 6);
      ctx.fill();
      ctx.fillStyle = active ? "#000" : "#aaa";
      ctx.font = active ? "bold 12px sans-serif" : "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.label, t.x + 70, 76);
    }

    const panelY = 94;
    ctx.fillStyle = CARD_BG;
    ctx.beginPath();
    ctx.roundRect(8, panelY, CW - 16, CH - panelY - 50, 8);
    ctx.fill();

    if (s.selectedTab === "staff") {
      drawStaffPanel(ctx, s, panelY);
    } else if (s.selectedTab === "upgrade") {
      drawUpgradePanel(ctx, s, panelY);
    } else {
      drawInfoPanel(ctx, s, panelY, f);
    }

    // Start Night button
    ctx.fillStyle = s.hiredCount > 0 ? ACCENT : "#333";
    ctx.beginPath();
    ctx.roundRect(CW / 2 - 80, CH - 42, 160, 34, 8);
    ctx.fill();
    ctx.fillStyle = s.hiredCount > 0 ? "#fff" : "#666";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("开始营业", CW / 2, CH - 20);
  }

  function drawStaffPanel(ctx: CanvasRenderingContext2D, s: GameState, panelY: number) {
    const employees = s.employees;
    const perPage = 6;
    let y = panelY + 10;

    ctx.fillStyle = "#aaa";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`已雇佣: ${s.hiredCount}/16  |  点击下方按钮雇佣/查看`, 20, y + 8);
    y += 22;

    for (let i = 0; i < Math.min(perPage, employees.length); i++) {
      const emp = employees[i];
      const ey = y + i * 56;
      const roleColor = ROLE_COLORS[emp.role] || "#aaa";

      ctx.fillStyle = emp.hired ? "#1a2a1a" : PANEL_BG;
      ctx.beginPath();
      ctx.roundRect(16, ey, CW - 32, 50, 6);
      ctx.fill();
      ctx.strokeStyle = emp.hired ? GREEN : "#333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(16, ey, CW - 32, 50, 6);
      ctx.stroke();

      // Role badge
      ctx.fillStyle = roleColor;
      ctx.beginPath();
      ctx.roundRect(24, ey + 6, 50, 16, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ROLE_NAMES[emp.role], 49, ey + 18);

      // Name
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(emp.name, 82, ey + 18);

      // Stats
      ctx.fillStyle = "#888";
      ctx.font = "10px sans-serif";
      ctx.fillText(`魅力:${emp.charm} 技能:${emp.skill} 体力:${emp.stamina}`, 24, ey + 38);

      // Salary / hire button
      if (emp.hired) {
        ctx.fillStyle = GREEN;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("已雇佣", CW - 28, ey + 18);
        ctx.fillStyle = "#888";
        ctx.font = "10px sans-serif";
        ctx.fillText(`日薪: ${emp.salary}`, CW - 28, ey + 36);
      } else {
        const cost = Math.floor(emp.salary * 3 * diffCostMult(s.difficulty));
        ctx.fillStyle = s.gold >= cost ? "#2a4a2a" : "#3a2a2a";
        ctx.beginPath();
        ctx.roundRect(CW - 90, ey + 8, 56, 30, 6);
        ctx.fill();
        ctx.fillStyle = s.gold >= cost ? GREEN : RED;
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("雇佣", CW - 62, ey + 20);
        ctx.fillStyle = GOLD_COLOR;
        ctx.font = "9px sans-serif";
        ctx.fillText(`${cost}G`, CW - 62, ey + 33);
      }
    }
  }

  function drawUpgradePanel(ctx: CanvasRenderingContext2D, s: GameState, panelY: number) {
    let y = panelY + 12;
    ctx.fillStyle = "#aaa";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("升级设施提升客人满意度和收入", 20, y + 8);
    y += 24;

    const catIcons: Record<string, string> = {
      lighting: "灯", sound: "音", vip: "V", stage: "台"
    };
    const catColors: Record<string, string> = {
      lighting: "#ffa94d", sound: "#845ef7", vip: "#ff6b6b", stage: "#51cf66"
    };

    for (let i = 0; i < s.upgrades.length; i++) {
      const upg = s.upgrades[i];
      const uy = y + i * 80;
      const catColor = catColors[upg.category] || "#aaa";

      ctx.fillStyle = PANEL_BG;
      ctx.beginPath();
      ctx.roundRect(16, uy, CW - 32, 72, 6);
      ctx.fill();
      ctx.strokeStyle = catColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(16, uy, CW - 32, 72, 6);
      ctx.stroke();

      // Category icon
      ctx.fillStyle = catColor;
      ctx.beginPath();
      ctx.arc(42, uy + 24, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(catIcons[upg.category] || "?", 42, uy + 28);

      // Name and level
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(upg.name, 66, uy + 20);

      // Level bar
      for (let l = 0; l < upg.maxLevel; l++) {
        ctx.fillStyle = l < upg.level ? catColor : "#333";
        ctx.beginPath();
        ctx.roundRect(66 + l * 24, uy + 28, 18, 8, 3);
        ctx.fill();
      }
      ctx.fillStyle = "#888";
      ctx.font = "10px sans-serif";
      ctx.fillText(`Lv.${upg.level}/${upg.maxLevel}`, 66 + upg.maxLevel * 24 + 8, uy + 36);

      // Desc
      ctx.fillStyle = "#666";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${upg.desc} | 满意+${upg.satisfactionBonus} 收入+${upg.incomeBonus}/级`, 24, uy + 58);

      // Upgrade button
      if (upg.level < upg.maxLevel) {
        const cost = Math.floor(upg.cost * (1 + upg.level * 0.5) * diffCostMult(s.difficulty));
        ctx.fillStyle = s.gold >= cost ? "#2a2a5e" : "#3a2a2a";
        ctx.beginPath();
        ctx.roundRect(CW - 90, uy + 12, 56, 44, 6);
        ctx.fill();
        ctx.fillStyle = s.gold >= cost ? PRIMARY : RED;
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("升级", CW - 62, uy + 30);
        ctx.fillStyle = GOLD_COLOR;
        ctx.font = "9px sans-serif";
        ctx.fillText(`${cost}G`, CW - 62, uy + 46);
      } else {
        ctx.fillStyle = GREEN;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("满级", CW - 62, uy + 38);
      }
    }
  }

  function drawInfoPanel(ctx: CanvasRenderingContext2D, s: GameState, panelY: number, f: number) {
    let y = panelY + 16;
    const lx = 24, rx = 260;

    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("经营概况", lx, y);
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
      ctx.fillStyle = "#888";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(info[i].label, ix, iy);
      ctx.fillStyle = info[i].color;
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(info[i].value, ix + 80, iy);
    }

    // Game log
    y += Math.ceil(info.length / 2) * 30 + 16;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("经营日志", lx, y);
    y += 16;

    const logs = s.gameLog.slice(-8);
    for (let i = 0; i < logs.length; i++) {
      ctx.fillStyle = logs[i].startsWith("[事件]") ? "#ffa94d" : "#666";
      ctx.font = "10px sans-serif";
      ctx.fillText(logs[i].length > 40 ? logs[i].slice(0, 40) + "..." : logs[i], lx, y + i * 14);
    }
  }

  function drawNightScene(ctx: CanvasRenderingContext2D, s: GameState, f: number) {
    // Night background
    const nightGrad = ctx.createLinearGradient(0, 56, 0, CH);
    nightGrad.addColorStop(0, "#0a0a2e");
    nightGrad.addColorStop(1, "#1a0a3e");
    ctx.fillStyle = nightGrad;
    ctx.fillRect(0, 56, CW, CH - 56);

    // Bar counter
    ctx.fillStyle = "#2a1a3e";
    ctx.beginPath();
    ctx.roundRect(20, 60, CW - 40, 90, 8);
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(20, 60, CW - 40, 90, 8);
    ctx.stroke();

    // Bar label
    ctx.fillStyle = ACCENT;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("吧台区域", CW / 2, 80);

    // Hired staff icons on bar
    const hired = s.employees.filter(e => e.hired);
    for (let i = 0; i < hired.length; i++) {
      const ex = 50 + (i % 8) * 52;
      const ey = 95 + Math.floor(i / 8) * 28;
      const roleColor = ROLE_COLORS[hired[i].role];
      ctx.fillStyle = roleColor;
      ctx.beginPath();
      ctx.arc(ex, ey, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ROLE_NAMES[hired[i].role][0], ex, ey + 3);
    }

    // Dance floor area
    ctx.fillStyle = "#1a0a2e";
    ctx.beginPath();
    ctx.roundRect(20, 155, CW - 40, CH - 210, 8);
    ctx.fill();

    // Animated floor lights
    const lightUpg = s.upgrades.find(u => u.id === "light");
    const lightLevel = lightUpg?.level || 0;
    if (lightLevel > 0) {
      for (let i = 0; i < lightLevel * 3; i++) {
        const lx = 40 + (i * 67 + f * 2) % (CW - 80);
        const ly = 170 + (i * 43 + f) % (CH - 240);
        const hue = (f * 2 + i * 60) % 360;
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.15)`;
        ctx.beginPath();
        ctx.arc(lx, ly, 20 + lightLevel * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sound waves (if sound upgraded)
    const soundUpg = s.upgrades.find(u => u.id === "sound");
    const soundLevel = soundUpg?.level || 0;
    if (soundLevel > 0) {
      for (let i = 0; i < soundLevel; i++) {
        const wave = (f * 0.05 + i * 0.5) % 3;
        ctx.strokeStyle = `rgba(132, 94, 247, ${0.3 - wave * 0.1})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(CW / 2, CH - 80, 30 + wave * 40, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // VIP area indicator
    const vipUpg = s.upgrades.find(u => u.id === "vip");
    if (vipUpg && vipUpg.level > 0) {
      ctx.fillStyle = "rgba(255, 107, 107, 0.1)";
      ctx.beginPath();
      ctx.roundRect(CW - 120, 160, 95, 60, 6);
      ctx.fill();
      ctx.strokeStyle = "#ff6b6b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(CW - 120, 160, 95, 60, 6);
      ctx.stroke();
      ctx.fillStyle = "#ff6b6b";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`VIP Lv.${vipUpg.level}`, CW - 72, 178);
    }

    // Stage indicator
    const stageUpg = s.upgrades.find(u => u.id === "stage");
    if (stageUpg && stageUpg.level > 0) {
      ctx.fillStyle = "rgba(81, 207, 102, 0.1)";
      ctx.beginPath();
      ctx.roundRect(25, 160, 95, 60, 6);
      ctx.fill();
      ctx.strokeStyle = "#51cf66";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(25, 160, 95, 60, 6);
      ctx.stroke();
      ctx.fillStyle = "#51cf66";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`舞台 Lv.${stageUpg.level}`, 72, 178);
    }

    // Draw guests
    for (const g of s.guests) {
      // Guest body
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.isVIP ? 10 : 7, 0, Math.PI * 2);
      ctx.fill();

      if (g.isVIP) {
        // VIP crown
        ctx.fillStyle = GOLD_COLOR;
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("V", g.x, g.y - 14);
        // Glow
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.3 + 0.2 * Math.sin(f * 0.1)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Satisfaction indicator
      const satColor = g.satisfaction > 70 ? GREEN : g.satisfaction > 40 ? "#ffa94d" : RED;
      ctx.fillStyle = satColor;
      ctx.fillRect(g.x - 6, g.y + 10, (g.satisfaction / 100) * 12, 2);
    }

    // Draw particles
    for (const p of s.particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color.startsWith("#")
        ? p.color + Math.floor(alpha * 255).toString(16).padStart(2, "0")
        : p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    // Guest count
    ctx.fillStyle = "#aaa";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`客人: ${s.guests.length}/${s.maxGuests}`, 24, CH - 42);

    // Hint
    ctx.fillStyle = "#555";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("点击客人可获得额外小费", CW / 2, CH - 10);
  }

  function drawDayEnd(ctx: CanvasRenderingContext2D, s: GameState, f: number) {
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, CW, CH);

    ctx.fillStyle = PRIMARY;
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`第${s.day}天 结算`, CW / 2, 80);

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
      ctx.fillStyle = PANEL_BG;
      ctx.beginPath();
      ctx.roundRect(80, iy, CW - 160, 28, 6);
      ctx.fill();
      ctx.fillStyle = "#aaa";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(items[i].label, 96, iy + 19);
      ctx.fillStyle = items[i].color;
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(items[i].value, CW - 96, iy + 19);
    }

    // Event
    if (s.currentEvent) {
      const ey = 120 + items.length * 36 + 16;
      ctx.fillStyle = "#2a1a0a";
      ctx.beginPath();
      ctx.roundRect(40, ey, CW - 80, 60, 8);
      ctx.fill();
      ctx.strokeStyle = "#ffa94d";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(40, ey, CW - 80, 60, 8);
      ctx.stroke();
      ctx.fillStyle = "#ffa94d";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`[事件] ${s.currentEvent.title}`, CW / 2, ey + 20);
      ctx.fillStyle = "#ccc";
      ctx.font = "11px sans-serif";
      ctx.fillText(s.currentEvent.desc, CW / 2, ey + 38);
      ctx.fillStyle = s.currentEvent.goldChange >= 0 ? GREEN : RED;
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(s.currentEvent.effect, CW / 2, ey + 54);
    }

    // Next day button
    const glow = 0.7 + 0.3 * Math.sin(f * 0.06);
    ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
    ctx.beginPath();
    ctx.roundRect(CW / 2 - 70, CH - 60, 140, 36, 8);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("进入下一天", CW / 2, CH - 36);
  }

  function drawGameOver(ctx: CanvasRenderingContext2D, s: GameState, f: number) {
    ctx.fillStyle = "rgba(10, 0, 0, 0.95)";
    ctx.fillRect(0, 0, CW, CH);

    ctx.fillStyle = RED;
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("经营失败", CW / 2, CH / 2 - 60);

    ctx.fillStyle = "#aaa";
    ctx.font = "14px sans-serif";
    ctx.fillText("酒吧资金链断裂，被迫关门！", CW / 2, CH / 2 - 25);

    ctx.fillStyle = GOLD_COLOR;
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(`最终分数: ${s.score}`, CW / 2, CH / 2 + 10);

    ctx.fillStyle = "#888";
    ctx.font = "12px sans-serif";
    ctx.fillText(`经营了 ${s.day} 天 | 累计收入 ${s.totalIncome}G`, CW / 2, CH / 2 + 40);

    const glow = 0.5 + 0.5 * Math.sin(f * 0.05);
    ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
    ctx.font = "14px sans-serif";
    ctx.fillText("点击重新开始", CW / 2, CH / 2 + 80);
  }

  function drawResult(ctx: CanvasRenderingContext2D, s: GameState, f: number) {
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, CW, CH);

    // Stars
    for (let i = 0; i < 40; i++) {
      const sx = (i * 73 + f * 0.5) % CW;
      const sy = (i * 47 + f * 0.2) % CH;
      const alpha = 0.3 + 0.3 * Math.sin(f * 0.03 + i);
      ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = GOLD_COLOR;
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("经营成功！", CW / 2, 100);

    ctx.fillStyle = PRIMARY;
    ctx.font = "16px sans-serif";
    ctx.fillText("你成功经营了30天！", CW / 2, 135);

    const results = [
      { label: "最终分数", value: `${s.score}`, color: GOLD_COLOR },
      { label: "累计收入", value: `${s.totalIncome}G`, color: GREEN },
      { label: "累计支出", value: `${s.totalExpense}G`, color: RED },
      { label: "最终声望", value: `${s.reputation}/100`, color: "#ff6b6b" },
      { label: "员工数量", value: `${s.hiredCount}人`, color: "#845ef7" },
      { label: "难度", value: s.difficulty === "easy" ? "简单" : s.difficulty === "hard" ? "困难" : "普通", color: "#aaa" },
    ];

    for (let i = 0; i < results.length; i++) {
      const iy = 170 + i * 34;
      ctx.fillStyle = PANEL_BG;
      ctx.beginPath();
      ctx.roundRect(100, iy, CW - 200, 28, 6);
      ctx.fill();
      ctx.fillStyle = "#aaa";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(results[i].label, 116, iy + 19);
      ctx.fillStyle = results[i].color;
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(results[i].value, CW - 116, iy + 19);
    }

    // Rating
    const rating = s.score > 3000 ? "S" : s.score > 2000 ? "A" : s.score > 1000 ? "B" : "C";
    const ratingColor = rating === "S" ? GOLD_COLOR : rating === "A" ? GREEN : rating === "B" ? PRIMARY : "#888";
    ctx.fillStyle = ratingColor;
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(rating, CW / 2, CH - 80);
    ctx.fillStyle = "#aaa";
    ctx.font = "12px sans-serif";
    ctx.fillText("评级", CW / 2, CH - 60);

    const glow = 0.5 + 0.5 * Math.sin(f * 0.05);
    ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
    ctx.font = "14px sans-serif";
    ctx.fillText("点击重新开始", CW / 2, CH - 25);
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
