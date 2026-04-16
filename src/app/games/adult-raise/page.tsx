"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import GameSaveLoad from "@/components/GameSaveLoad";
import GameLeaderboard from "@/components/GameLeaderboard";
import Link from "next/link";
import {
  ChevronLeft, Volume2, VolumeX, Heart, Lock, Play, RotateCcw,
  Star, Briefcase, Sparkles, Flame
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-raise";
const W = 420, H = 520;
const PRIMARY = "#ff6b9d", ACCENT = "#3ea6ff", BG = "#0f0f0f";
const MAX_DAYS = 30;
const MAX_AFFECTION = 100;

// ─── Types ───────────────────────────────────────────────────────────────────
type Phase = "title" | "playing" | "event" | "ending";
type Difficulty = "easy" | "normal" | "hard";
type ActionType = "date" | "gift" | "chat" | "work";
type EndingType = "good" | "normal" | "bad";
type TimeOfDay = "morning" | "afternoon" | "evening";

interface CharacterDef {
  id: number;
  name: string;
  personality: string;
  color: string;
  favoriteAction: ActionType;
  dislikedAction: ActionType;
  desc: string;
  morningBonus: number;
  eveningBonus: number;
}

interface PlayerStats {
  charm: number;
  wisdom: number;
  stamina: number;
  money: number;
}

interface GameState {
  day: number;
  timeOfDay: TimeOfDay;
  selectedChar: number;
  affection: [number, number, number];
  stats: PlayerStats;
  eventLog: string[];
  eventsUnlocked: Set<number>;
  difficulty: Difficulty;
  score: number;
  actionsToday: number;
}

interface EventDef {
  id: number;
  charId: number;
  threshold: number;
  title: string;
  text: string;
  affectionBonus: number;
  statBonus?: Partial<PlayerStats>;
}

// ─── Character Data ──────────────────────────────────────────────────────────
const CHARACTERS: CharacterDef[] = [
  {
    id: 0, name: "樱", personality: "温柔", color: "#ff6b9d",
    favoriteAction: "chat", dislikedAction: "work",
    desc: "温柔体贴的邻家女孩，喜欢安静的聊天",
    morningBonus: 1.2, eveningBonus: 1.0,
  },
  {
    id: 1, name: "凛", personality: "高冷", color: "#a55eea",
    favoriteAction: "gift", dislikedAction: "chat",
    desc: "高冷傲娇的千金小姐，用礼物打动她",
    morningBonus: 0.8, eveningBonus: 1.4,
  },
  {
    id: 2, name: "萌", personality: "活泼", color: "#ffa502",
    favoriteAction: "date", dislikedAction: "gift",
    desc: "活泼开朗的元气少女，最爱一起出去玩",
    morningBonus: 1.3, eveningBonus: 0.9,
  },
];

// ─── Events ──────────────────────────────────────────────────────────────────
const EVENTS: EventDef[] = [
  { id: 1, charId: 0, threshold: 20, title: "初次散步", text: "樱邀请你在公园散步，阳光洒在她的脸上...", affectionBonus: 5, statBonus: { charm: 2 } },
  { id: 2, charId: 0, threshold: 40, title: "雨中邂逅", text: "突然下雨，你们共撑一把伞，心跳加速...", affectionBonus: 8, statBonus: { charm: 3 } },
  { id: 3, charId: 0, threshold: 60, title: "月下告白", text: "月光下，樱红着脸靠近你，低声说着心里话...", affectionBonus: 10, statBonus: { wisdom: 3 } },
  { id: 4, charId: 0, threshold: 80, title: "温泉之夜", text: "温泉旅馆的夜晚，樱穿着浴衣来到你的房间...", affectionBonus: 12, statBonus: { charm: 5 } },
  { id: 5, charId: 1, threshold: 20, title: "偶遇咖啡厅", text: "凛在高级咖啡厅独自品茶，你鼓起勇气搭话...", affectionBonus: 5, statBonus: { wisdom: 2 } },
  { id: 6, charId: 1, threshold: 40, title: "音乐会之约", text: "凛邀请你参加私人音乐会，她的眼神变得柔和...", affectionBonus: 8, statBonus: { charm: 3 } },
  { id: 7, charId: 1, threshold: 60, title: "深夜来电", text: "凛深夜打来电话，声音带着一丝颤抖和脆弱...", affectionBonus: 10, statBonus: { wisdom: 4 } },
  { id: 8, charId: 1, threshold: 80, title: "别墅私会", text: "凛带你去她的私人别墅，褪去了平日的冷漠...", affectionBonus: 12, statBonus: { charm: 5 } },
  { id: 9, charId: 2, threshold: 20, title: "游乐园", text: "萌拉着你冲向过山车，她的笑声感染了你...", affectionBonus: 5, statBonus: { stamina: 2 } },
  { id: 10, charId: 2, threshold: 40, title: "海边嬉戏", text: "萌穿着泳装在海边奔跑，浪花溅湿了你们...", affectionBonus: 8, statBonus: { stamina: 3 } },
  { id: 11, charId: 2, threshold: 60, title: "烟花大会", text: "烟花绽放的瞬间，萌突然握住了你的手...", affectionBonus: 10, statBonus: { charm: 4 } },
  { id: 12, charId: 2, threshold: 80, title: "露营之夜", text: "帐篷里只有你们两个，萌靠在你的肩膀上...", affectionBonus: 12, statBonus: { stamina: 5 } },
];

// ─── Action Definitions ──────────────────────────────────────────────────────
interface ActionDef {
  type: ActionType;
  label: string;
  icon: string;
  baseAffection: number;
  staminaCost: number;
  moneyCost: number;
  statGain: Partial<PlayerStats>;
}

const ACTIONS: ActionDef[] = [
  { type: "date", label: "约会", icon: "heart", baseAffection: 10, staminaCost: 15, moneyCost: 30, statGain: { charm: 1 } },
  { type: "gift", label: "送礼", icon: "gift", baseAffection: 8, staminaCost: 5, moneyCost: 50, statGain: { charm: 1 } },
  { type: "chat", label: "聊天", icon: "chat", baseAffection: 5, staminaCost: 5, moneyCost: 0, statGain: { wisdom: 1 } },
  { type: "work", label: "工作", icon: "work", baseAffection: 0, staminaCost: 20, moneyCost: 0, statGain: { money: 80 } },
];

// ─── Difficulty Multipliers ──────────────────────────────────────────────────
const DIFF_MULT: Record<Difficulty, { affection: number; cost: number; stamina: number; startMoney: number; startStamina: number }> = {
  easy: { affection: 1.5, cost: 0.7, stamina: 0.7, startMoney: 200, startStamina: 100 },
  normal: { affection: 1.0, cost: 1.0, stamina: 1.0, startMoney: 100, startStamina: 80 },
  hard: { affection: 0.7, cost: 1.3, stamina: 1.3, startMoney: 50, startStamina: 60 },
};

function initGameState(diff: Difficulty): GameState {
  const m = DIFF_MULT[diff];
  return {
    day: 1,
    timeOfDay: "morning",
    selectedChar: 0,
    affection: [0, 0, 0],
    stats: { charm: 5, wisdom: 5, stamina: m.startStamina, money: m.startMoney },
    eventLog: [],
    eventsUnlocked: new Set(),
    difficulty: diff,
    score: 0,
    actionsToday: 0,
  };
}

function getEnding(affection: number): EndingType {
  if (affection >= 80) return "good";
  if (affection >= 40) return "normal";
  return "bad";
}

function getEndingText(char: CharacterDef, ending: EndingType): string {
  const texts: Record<number, Record<EndingType, string>> = {
    0: {
      good: "樱深情地望着你，你们紧紧相拥，开始了幸福的生活...",
      normal: "樱微笑着说再见，也许未来还会再相遇...",
      bad: "樱渐渐疏远了你，这段感情无疾而终...",
    },
    1: {
      good: "凛终于卸下了所有防备，在你怀中轻声说：我只属于你...",
      normal: "凛若有所思地看着你，转身离去，留下一丝遗憾...",
      bad: "凛冷冷地说：我们不合适。然后头也不回地走了...",
    },
    2: {
      good: "萌扑进你的怀里，笑着说：以后每天都要在一起哦！",
      normal: "萌挥挥手说拜拜，脸上的笑容带着一丝不舍...",
      bad: "萌的笑容消失了，她默默地走开了...",
    },
  };
  return texts[char.id]?.[ending] || "";
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdultRaise() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const frameRef = useRef(0);

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [gameState, setGameState] = useState<GameState>(() => initGameState("normal"));
  const [currentEvent, setCurrentEvent] = useState<EventDef | null>(null);
  const [endingChar, setEndingChar] = useState<CharacterDef>(CHARACTERS[0]);
  const [endingType, setEndingType] = useState<EndingType>("normal");

  const stateRef = useRef({ phase, gameState, currentEvent, difficulty, muted, endingChar, endingType });
  useEffect(() => {
    stateRef.current = { phase, gameState, currentEvent, difficulty, muted, endingChar, endingType };
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

  // ─── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    setGameState(initGameState(diff));
    setCurrentEvent(null);
    setPhase("playing");
    playSound("click");
  }, [playSound]);

  // ─── Check Events ──────────────────────────────────────────────────────────
  const checkEvents = useCallback((gs: GameState): EventDef | null => {
    for (const ev of EVENTS) {
      if (gs.eventsUnlocked.has(ev.id)) continue;
      if (ev.charId === gs.selectedChar && gs.affection[ev.charId] >= ev.threshold) {
        return ev;
      }
    }
    return null;
  }, []);

  // ─── Advance Time ──────────────────────────────────────────────────────────
  const advanceTime = useCallback((gs: GameState): GameState => {
    const next = { ...gs };
    if (gs.timeOfDay === "morning") {
      next.timeOfDay = "afternoon";
    } else if (gs.timeOfDay === "afternoon") {
      next.timeOfDay = "evening";
    } else {
      next.timeOfDay = "morning";
      next.day = gs.day + 1;
      next.actionsToday = 0;
      // Restore some stamina overnight
      next.stats = { ...next.stats, stamina: Math.min(100, next.stats.stamina + 25) };
    }
    return next;
  }, []);

  // ─── Perform Action ────────────────────────────────────────────────────────
  const performAction = useCallback((actionIdx: number) => {
    const gs = stateRef.current.gameState;
    const diff = stateRef.current.difficulty;
    if (gs.day > MAX_DAYS) return;

    const action = ACTIONS[actionIdx];
    const mult = DIFF_MULT[diff];
    const char = CHARACTERS[gs.selectedChar];

    const staminaCost = Math.floor(action.staminaCost * mult.stamina);
    const moneyCost = Math.floor(action.moneyCost * mult.cost);

    if (action.type !== "work" && gs.stats.stamina < staminaCost) {
      playSound("error");
      return;
    }
    if (gs.stats.money < moneyCost) {
      playSound("error");
      return;
    }

    let newStats = { ...gs.stats };
    newStats.stamina = Math.max(0, newStats.stamina - staminaCost);
    newStats.money -= moneyCost;

    // Apply stat gains
    if (action.statGain.charm) newStats.charm += action.statGain.charm;
    if (action.statGain.wisdom) newStats.wisdom += action.statGain.wisdom;
    if (action.statGain.stamina) newStats.stamina = Math.min(100, newStats.stamina + action.statGain.stamina);
    if (action.statGain.money) newStats.money += action.statGain.money;

    // Calculate affection gain
    let affGain = action.baseAffection;
    affGain = Math.floor(affGain * mult.affection);

    // Favorite/disliked bonus
    if (action.type === char.favoriteAction) affGain = Math.floor(affGain * 1.5);
    if (action.type === char.dislikedAction) affGain = Math.floor(affGain * 0.3);

    // Time of day bonus
    if (gs.timeOfDay === "morning") affGain = Math.floor(affGain * char.morningBonus);
    if (gs.timeOfDay === "evening") affGain = Math.floor(affGain * char.eveningBonus);

    // Stat-based bonus
    const charmBonus = 1 + newStats.charm * 0.01;
    const wisdomBonus = 1 + newStats.wisdom * 0.005;
    affGain = Math.floor(affGain * charmBonus * wisdomBonus);

    const newAff: [number, number, number] = [...gs.affection];
    newAff[gs.selectedChar] = Math.min(MAX_AFFECTION, newAff[gs.selectedChar] + affGain);

    const logEntry = action.type === "work"
      ? `第${gs.day}天${gs.timeOfDay === "morning" ? "早" : gs.timeOfDay === "afternoon" ? "午" : "晚"} - 工作赚钱 +${action.statGain.money}`
      : `第${gs.day}天${gs.timeOfDay === "morning" ? "早" : gs.timeOfDay === "afternoon" ? "午" : "晚"} - 与${char.name}${action.label} 亲密+${affGain}`;

    let nextState: GameState = {
      ...gs,
      stats: newStats,
      affection: newAff,
      eventLog: [logEntry, ...gs.eventLog].slice(0, 8),
      score: gs.score + affGain * 10 + (action.type === "work" ? 5 : 0),
      actionsToday: gs.actionsToday + 1,
    };

    // Advance time
    nextState = advanceTime(nextState);

    playSound(action.type === "work" ? "click" : "score");

    // Check for events
    const ev = checkEvents(nextState);
    if (ev) {
      nextState.eventsUnlocked = new Set(nextState.eventsUnlocked).add(ev.id);
      nextState.affection[ev.charId] = Math.min(MAX_AFFECTION, nextState.affection[ev.charId] + ev.affectionBonus);
      if (ev.statBonus) {
        if (ev.statBonus.charm) nextState.stats.charm += ev.statBonus.charm;
        if (ev.statBonus.wisdom) nextState.stats.wisdom += ev.statBonus.wisdom;
        if (ev.statBonus.stamina) nextState.stats.stamina = Math.min(100, nextState.stats.stamina + ev.statBonus.stamina);
      }
      nextState.score += ev.affectionBonus * 20;
      setCurrentEvent(ev);
      setGameState(nextState);
      setPhase("event");
      playSound("levelUp");
      return;
    }

    // Check end of game
    if (nextState.day > MAX_DAYS) {
      // Find best character
      let bestIdx = 0;
      for (let i = 1; i < 3; i++) {
        if (nextState.affection[i] > nextState.affection[bestIdx]) bestIdx = i;
      }
      setEndingChar(CHARACTERS[bestIdx]);
      setEndingType(getEnding(nextState.affection[bestIdx]));
      setGameState(nextState);
      setPhase("ending");
      playSound(nextState.affection[bestIdx] >= 80 ? "combo" : nextState.affection[bestIdx] >= 40 ? "levelUp" : "gameOver");
      return;
    }

    setGameState(nextState);
  }, [advanceTime, checkEvents, playSound]);

  // ─── Dismiss Event ─────────────────────────────────────────────────────────
  const dismissEvent = useCallback(() => {
    setCurrentEvent(null);
    const gs = stateRef.current.gameState;
    if (gs.day > MAX_DAYS) {
      let bestIdx = 0;
      for (let i = 1; i < 3; i++) {
        if (gs.affection[i] > gs.affection[bestIdx]) bestIdx = i;
      }
      setEndingChar(CHARACTERS[bestIdx]);
      setEndingType(getEnding(gs.affection[bestIdx]));
      setPhase("ending");
    } else {
      setPhase("playing");
    }
    playSound("click");
  }, [playSound]);

  // ─── Select Character ──────────────────────────────────────────────────────
  const selectChar = useCallback((idx: number) => {
    setGameState(prev => ({ ...prev, selectedChar: idx }));
    playSound("move");
  }, [playSound]);

  // ─── Save / Load ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    return {
      phase, difficulty, gameState: {
        ...gameState,
        eventsUnlocked: Array.from(gameState.eventsUnlocked),
      },
      endingChar: endingChar.id,
      endingType,
    };
  }, [phase, difficulty, gameState, endingChar, endingType]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    const gs = d.gameState as Record<string, unknown>;
    if (gs) {
      const loaded: GameState = {
        day: (gs.day as number) || 1,
        timeOfDay: (gs.timeOfDay as TimeOfDay) || "morning",
        selectedChar: (gs.selectedChar as number) || 0,
        affection: (gs.affection as [number, number, number]) || [0, 0, 0],
        stats: (gs.stats as PlayerStats) || { charm: 5, wisdom: 5, stamina: 80, money: 100 },
        eventLog: (gs.eventLog as string[]) || [],
        eventsUnlocked: new Set((gs.eventsUnlocked as number[]) || []),
        difficulty: (gs.difficulty as Difficulty) || "normal",
        score: (gs.score as number) || 0,
        actionsToday: (gs.actionsToday as number) || 0,
      };
      setGameState(loaded);
      setDifficulty(loaded.difficulty);
    }
    setPhase((d.phase as Phase) || "playing");
    if (d.endingChar !== undefined) setEndingChar(CHARACTERS[(d.endingChar as number) || 0]);
    if (d.endingType) setEndingType(d.endingType as EndingType);
    playSound("click");
  }, [playSound]);

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.phase === "title") return;
      if (s.phase === "event") { dismissEvent(); return; }
      if (s.phase === "ending") return;
      if (s.phase === "playing") {
        if (e.key >= "1" && e.key <= "4") {
          performAction(parseInt(e.key) - 1);
        }
        if (e.key === "q" || e.key === "Q") selectChar(0);
        if (e.key === "w" || e.key === "W") selectChar(1);
        if (e.key === "e" || e.key === "E") selectChar(2);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [performAction, dismissEvent, selectChar]);

  // ─── Canvas Render (PixiJS) ─────────────────────────────────────────────────
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0f0f0f, antialias: true });
      if (destroyed) { app.destroy(); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

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

      // 预创建文字对象
      for (let i = 0; i < 60; i++) makeText(`t${i}`, { fontSize: 12 });

      const colorToNum = (hex: string): number => {
        if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
        return 0xffffff;
      };

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => {
        if (textIdx >= 60) return;
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

      const gfxRect = (color: string | number, x: number, y: number, w: number, h: number, alpha = 1) => {
        gfx.rect(x, y, w, h).fill({ color: typeof color === "string" ? colorToNum(color) : color, alpha });
      };

      const gfxRoundRect = (color: string | number, x: number, y: number, w: number, h: number, r: number, alpha = 1) => {
        gfx.roundRect(x, y, w, h, r).fill({ color: typeof color === "string" ? colorToNum(color) : color, alpha });
      };

      const gfxCircle = (color: string | number, x: number, y: number, radius: number, alpha = 1) => {
        gfx.circle(x, y, radius).fill({ color: typeof color === "string" ? colorToNum(color) : color, alpha });
      };

      app.ticker.add(() => {
        if (destroyed) return;
        frameRef.current++;
        const f = frameRef.current;
        const s = stateRef.current;
        gfx.clear();
        texts.forEach(t => { t.visible = false; });
        textIdx = 0;

        // 背景
        gfxRect(BG, 0, 0, W, H);

        if (s.phase === "title") {
          // Title screen
          gfxRect("#1a0a2e", 0, 0, W, H * 0.5);
          gfxRect(BG, 0, H * 0.5, W, H * 0.5);

          // Floating hearts (simplified)
          for (let i = 0; i < 8; i++) {
            const hx = (W * 0.1 + i * W * 0.12 + Math.sin(f * 0.02 + i) * 20) % W;
            const hy = (H * 0.2 + Math.sin(f * 0.015 + i * 1.5) * 40 + i * 30) % H;
            const size = 6 + Math.sin(f * 0.03 + i) * 3;
            gfxCircle("#ff6b9d", hx, hy, size, 0.15 + 0.1 * Math.sin(f * 0.04 + i));
          }

          const glow = 0.7 + 0.3 * Math.sin(f * 0.04);
          showText("心动物语", W / 2, H / 2 - 95, { fill: "#ff6b9d", fontSize: 36, fontWeight: "bold", ax: 0.5, alpha: glow });
          showText("NC-17 成人养成", W / 2, H / 2 - 58, { fill: "#ff4757", fontSize: 12, ax: 0.5 });
          showText("30天恋爱养成 / 3位可攻略角色 / 多结局", W / 2, H / 2 - 33, { fill: "#aaaaaa", fontSize: 13, ax: 0.5 });

          for (let i = 0; i < 3; i++) {
            const ch = CHARACTERS[i];
            const cx = W / 2 - 100 + i * 100;
            const cy = H / 2 + 40;
            const bob = Math.sin(f * 0.03 + i * 2) * 4;
            gfxCircle(ch.color, cx, cy + bob, 28, 0.13);
            gfx.circle(cx, cy + bob, 28).stroke({ color: colorToNum(ch.color), width: 1.5, alpha: 0.4 });
            showText(ch.name, cx, cy + bob, { fill: ch.color, fontSize: 20, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            showText(ch.personality, cx, cy + bob + 25, { fill: "#888888", fontSize: 10, ax: 0.5, ay: 0.5 });
          }

          const promptAlpha = 0.5 + 0.5 * Math.sin(f * 0.06);
          showText("选择难度开始游戏", W / 2, H / 2 + 110, { fill: "#3ea6ff", fontSize: 14, ax: 0.5, alpha: promptAlpha });
        }

        if (s.phase === "playing" || (s.phase === "event" && s.currentEvent)) {
          const gs = s.gameState;
          const char = CHARACTERS[gs.selectedChar];

          // Top bar
          gfxRect("#1a1a2e", 0, 0, W, 42);
          showText(`第 ${gs.day}/${MAX_DAYS} 天`, 15, 4, { fontWeight: "bold", fontSize: 13 });
          const timeLabel = gs.timeOfDay === "morning" ? "早晨" : gs.timeOfDay === "afternoon" ? "下午" : "夜晚";
          const timeColor = gs.timeOfDay === "morning" ? "#ffa502" : gs.timeOfDay === "afternoon" ? "#3ea6ff" : "#a55eea";
          showText(timeLabel, 15, 22, { fill: timeColor, fontSize: 12 });
          showText(`${gs.score} 分`, W - 15, 4, { fill: "#f0b90b", fontSize: 12, fontWeight: "bold", ax: 1 });
          const diffLabel = gs.difficulty === "easy" ? "简单" : gs.difficulty === "normal" ? "普通" : "困难";
          const diffColor = gs.difficulty === "easy" ? "#20bf6b" : gs.difficulty === "normal" ? "#3ea6ff" : "#ff4757";
          showText(diffLabel, W - 15, 22, { fill: diffColor, fontSize: 10, ax: 1 });

          // Character tabs
          const tabW = (W - 40) / 3;
          for (let i = 0; i < 3; i++) {
            const ch = CHARACTERS[i];
            const tx = 20 + i * tabW;
            const selected = i === gs.selectedChar;
            gfxRoundRect(selected ? ch.color : "#151515", tx, 50, tabW - 4, 24, 6, selected ? 0.2 : 1);
            if (selected) gfx.roundRect(tx, 50, tabW - 4, 24, 6).stroke({ color: colorToNum(ch.color), width: 1.5 });
            showText(ch.name, tx + (tabW - 4) / 2, 58, { fill: selected ? ch.color : "#666666", fontSize: 11, fontWeight: selected ? "bold" : "normal", ax: 0.5, ay: 0.5 });
          }

          // Character display area
          const charY = 85;
          gfxRoundRect(char.color, 15, charY, W - 30, 100, 8, 0.04);
          gfx.roundRect(15, charY, W - 30, 100, 8).stroke({ color: colorToNum(char.color), width: 1, alpha: 0.19 });

          const bob = Math.sin(f * 0.03) * 3;
          gfxCircle(char.color, 60, charY + 45 + bob, 30, 0.19);
          showText(char.name, 60, charY + 45 + bob, { fill: char.color, fontSize: 24, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText(`性格: ${char.personality}`, 105, charY + 14, { fill: "#cccccc", fontSize: 12 });
          showText(char.desc, 105, charY + 32, { fill: "#888888", fontSize: 11 });

          // Affection bar
          const aff = gs.affection[gs.selectedChar];
          showText("亲密度", 105, charY + 50, { fill: "#666666", fontSize: 10 });
          gfxRoundRect("#222222", 155, charY + 52, 150, 10, 5);
          if (aff > 0) gfxRoundRect(char.color, 155, charY + 52, 150 * (aff / MAX_AFFECTION), 10, 5);
          showText(`${aff}/${MAX_AFFECTION}`, W - 25, charY + 52, { fontSize: 10, fontWeight: "bold", ax: 1 });

          const stageLabel = aff >= 80 ? "热恋" : aff >= 60 ? "暧昧" : aff >= 40 ? "好感" : aff >= 20 ? "认识" : "陌生";
          const stageColor = aff >= 80 ? "#ff4757" : aff >= 60 ? "#ff6b9d" : aff >= 40 ? "#ffa502" : aff >= 20 ? "#3ea6ff" : "#666666";
          showText(stageLabel, 105, charY + 72, { fill: stageColor, fontSize: 10 });

          // Stats bar
          const statsY = 195;
          gfxRoundRect("#1a1a1a", 15, statsY, W - 30, 40, 6);
          const statItems = [
            { label: "魅力", value: gs.stats.charm, color: "#ffa502" },
            { label: "智慧", value: gs.stats.wisdom, color: "#3ea6ff" },
            { label: "体力", value: gs.stats.stamina, color: "#20bf6b" },
            { label: "金钱", value: gs.stats.money, color: "#f0b90b" },
          ];
          const statW = (W - 50) / 4;
          for (let i = 0; i < 4; i++) {
            const sx = 25 + i * statW;
            showText(`${statItems[i].value}`, sx + statW / 2, statsY + 6, { fill: statItems[i].color, fontSize: 13, fontWeight: "bold", ax: 0.5 });
            showText(statItems[i].label, sx + statW / 2, statsY + 22, { fill: "#666666", fontSize: 9, ax: 0.5 });
          }

          // Day progress
          const progY = 245;
          gfxRoundRect("#222222", 15, progY, W - 30, 6, 3);
          if (gs.day > 0) gfxRoundRect(ACCENT, 15, progY, (W - 30) * (gs.day / MAX_DAYS), 6, 3);
          showText(`剩余 ${MAX_DAYS - gs.day + 1} 天 / 键盘 1-4 选择行动`, W / 2, progY + 12, { fill: "#555555", fontSize: 10, ax: 0.5 });

          // Action section
          showText("选择行动", 15, 275, { fill: "#888888", fontSize: 11, fontWeight: "bold" });
          const actionColors = ["#ff6b9d", "#a55eea", "#3ea6ff", "#f0b90b"];
          for (let i = 0; i < ACTIONS.length; i++) {
            const a = ACTIONS[i];
            const mult = DIFF_MULT[gs.difficulty];
            const staCost = Math.floor(a.staminaCost * mult.stamina);
            const monCost = Math.floor(a.moneyCost * mult.cost);
            const canDo = a.type === "work" || (gs.stats.stamina >= staCost && gs.stats.money >= monCost);
            const bx = 15, by = 295 + i * 38;
            gfxRoundRect(canDo ? "#1a1a2e" : "#111111", bx, by, W - 30, 32, 6);
            gfx.roundRect(bx, by, W - 30, 32, 6).stroke({ color: colorToNum(canDo ? actionColors[i] : "#222222"), width: 1, alpha: canDo ? 0.33 : 1 });
            gfxCircle(canDo ? actionColors[i] : "#444444", bx + 18, by + 16, 8);
            showText(`${i + 1}`, bx + 18, by + 16, { fill: "#0f0f0f", fontSize: 9, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            showText(a.label, bx + 34, by + 6, { fill: canDo ? "#ffffff" : "#555555", fontSize: 12, fontWeight: "bold" });
            if (a.type === "work") {
              showText(`体力-${staCost}  金钱+${a.statGain.money}`, bx + 34, by + 20, { fill: canDo ? "#888888" : "#444444", fontSize: 10 });
            } else {
              const isFav = a.type === char.favoriteAction;
              const affGain = Math.floor(a.baseAffection * (isFav ? 1.5 : 1) * mult.affection);
              showText(`体力-${staCost}${monCost > 0 ? `  金钱-${monCost}` : ""}  亲密+${affGain}${isFav ? " (喜欢!)" : ""}`, bx + 34, by + 20, { fill: canDo ? "#888888" : "#444444", fontSize: 10 });
            }
            if (!canDo) gfxRoundRect(0x000000, bx, by, W - 30, 32, 6, 0.3);
          }

          // Event log
          const logY = 460;
          for (let i = 0; i < Math.min(3, gs.eventLog.length); i++) {
            showText(gs.eventLog[i], 15, logY + i * 14, { fill: "#444444", fontSize: 10 });
          }

          // Event overlay
          if (s.phase === "event" && s.currentEvent) {
            const ev = s.currentEvent;
            const evChar = CHARACTERS[ev.charId];
            gfxRect(0x000000, 0, 0, W, H, 0.8);
            const cardX = 30, cardY = 80, cardW = W - 60, cardH = 320;
            gfxRoundRect("#1a1a2e", cardX, cardY, cardW, cardH, 12);
            gfx.roundRect(cardX, cardY, cardW, cardH, 12).stroke({ color: colorToNum(evChar.color), width: 2, alpha: 0.53 });
            showText(ev.title, W / 2, cardY + 58, { fill: evChar.color, fontSize: 18, fontWeight: "bold", ax: 0.5 });
            showText(`与 ${evChar.name} 的特别事件`, W / 2, cardY + 83, { fill: "#aaaaaa", fontSize: 12, ax: 0.5 });
            // Simplified text (no word wrap in PixiJS text objects)
            showText(ev.text.slice(0, 30), W / 2, cardY + 118, { fill: "#dddddd", fontSize: 13, ax: 0.5 });
            if (ev.text.length > 30) showText(ev.text.slice(30, 60), W / 2, cardY + 140, { fill: "#dddddd", fontSize: 13, ax: 0.5 });
            if (ev.text.length > 60) showText(ev.text.slice(60, 90), W / 2, cardY + 162, { fill: "#dddddd", fontSize: 13, ax: 0.5 });
            showText(`亲密度 +${ev.affectionBonus}`, W / 2, cardY + 210, { fill: evChar.color, fontSize: 12, fontWeight: "bold", ax: 0.5 });
            const contAlpha = 0.5 + 0.5 * Math.sin(f * 0.06);
            showText("点击继续", W / 2, cardY + cardH - 28, { fill: "#aaaaaa", fontSize: 12, ax: 0.5, alpha: contAlpha });
          }
        }

        if (s.phase === "ending") {
          const gs = s.gameState;
          const char = s.endingChar;
          const ending = s.endingType;
          const bgColor = ending === "good" ? "#1a0a2e" : ending === "normal" ? "#151515" : "#0a0a0a";
          gfxRect(bgColor, 0, 0, W, H);

          if (ending === "good") {
            for (let i = 0; i < 15; i++) {
              const px = (i * 37 + f * 0.5) % W;
              const py = (i * 23 + f * 0.3) % H;
              gfxCircle(char.color, px, py, 4 + Math.sin(f * 0.03 + i) * 2, 0.12);
            }
          }

          const endLabel = ending === "good" ? "完美结局" : ending === "normal" ? "普通结局" : "遗憾结局";
          const endColor = ending === "good" ? "#ff6b9d" : ending === "normal" ? "#ffa502" : "#666666";
          showText(endLabel, W / 2, 62, { fill: endColor, fontSize: 28, fontWeight: "bold", ax: 0.5 });

          const bob = Math.sin(f * 0.03) * 5;
          gfxCircle(char.color, W / 2, 150 + bob, 40, 0.19);
          showText(char.name, W / 2, 150 + bob, { fill: char.color, fontSize: 30, fontWeight: "bold", ax: 0.5, ay: 0.5 });

          const text = getEndingText(char, ending);
          showText(text.slice(0, 25), W / 2, 210, { fill: "#cccccc", fontSize: 14, ax: 0.5 });
          if (text.length > 25) showText(text.slice(25, 50), W / 2, 234, { fill: "#cccccc", fontSize: 14, ax: 0.5 });
          if (text.length > 50) showText(text.slice(50, 75), W / 2, 258, { fill: "#cccccc", fontSize: 14, ax: 0.5 });

          const sumY = 310;
          gfxRoundRect("#1a1a2e", 40, sumY, W - 80, 120, 8);
          gfx.roundRect(40, sumY, W - 80, 120, 8).stroke({ color: colorToNum(char.color), width: 1, alpha: 0.27 });
          showText("游戏总结", W / 2, sumY + 10, { fill: "#aaaaaa", fontSize: 12, fontWeight: "bold", ax: 0.5 });
          showText(`最终亲密度: ${gs.affection[char.id]}/${MAX_AFFECTION}`, W / 2, sumY + 35, { fill: "#888888", fontSize: 11, ax: 0.5 });
          showText(`总分: ${gs.score}`, W / 2, sumY + 55, { fill: "#888888", fontSize: 11, ax: 0.5 });
          showText(`魅力${gs.stats.charm} / 智慧${gs.stats.wisdom}`, W / 2, sumY + 75, { fill: "#888888", fontSize: 11, ax: 0.5 });

          const pa = 0.5 + 0.5 * Math.sin(f * 0.06);
          showText("点击下方按钮重新开始", W / 2, H - 38, { fill: "#3ea6ff", fontSize: 13, ax: 0.5, alpha: pa });
        }
      });
    }

    initPixi();

    return () => {
      destroyed = true;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
        pixiGfxRef.current = null;
        pixiTextsRef.current.clear();
        pixiInitRef.current = false;
      }
    };
  }, []);

  // ─── Canvas Click ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (cx: number, cy: number) => {
      const s = stateRef.current;
      if (s.phase === "title") return; // handled by buttons
      if (s.phase === "event") { dismissEvent(); return; }
      if (s.phase === "ending") return;

      if (s.phase === "playing") {
        // Character selection tabs: y 50-75
        if (cy >= 50 && cy <= 75) {
          const tabW = (W - 40) / 3;
          for (let i = 0; i < 3; i++) {
            if (cx >= 20 + i * tabW && cx <= 20 + (i + 1) * tabW) {
              selectChar(i);
              return;
            }
          }
        }
        // Action buttons: y 340-460
        for (let i = 0; i < ACTIONS.length; i++) {
          const bx = 15, by = 345 + i * 38;
          if (cx >= bx && cx <= W - 15 && cy >= by && cy <= by + 32) {
            performAction(i);
            return;
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
  }, [performAction, dismissEvent, selectChar]);

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
            <Heart size={24} className="text-[#ff6b9d]" />
            <h1 className="text-xl font-bold">心动物语</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800">NC-17</span>
          </div>
          <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-white/5 transition">
            {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
          <div>
            <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />

            {/* Title screen buttons */}
            {phase === "title" && (
              <div className="mt-4 space-y-2">
                <p className="text-center text-sm text-gray-400 mb-2">选择难度</p>
                <div className="flex gap-2 justify-center">
                  {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => startGame(d)}
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

            {/* Ending screen buttons */}
            {phase === "ending" && (
              <div className="mt-4 flex gap-2 justify-center">
                <button onClick={() => startGame(difficulty)}
                  className="flex items-center gap-1 px-4 py-2 bg-[#ff6b9d]/20 text-[#ff6b9d] rounded-lg text-sm hover:bg-[#ff6b9d]/30 transition border border-[#ff6b9d]/30">
                  <RotateCcw size={14} /> 重新开始
                </button>
                <button onClick={() => setPhase("title")}
                  className="flex items-center gap-1 px-4 py-2 bg-white/5 text-gray-400 rounded-lg text-sm hover:bg-white/10 transition border border-white/10">
                  返回标题
                </button>
              </div>
            )}

            {/* Playing info panel */}
            {(phase === "playing" || phase === "event") && (
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-[#1a1a1a] rounded-lg p-2 border border-white/5">
                  <Sparkles size={14} className="mx-auto text-[#ffa502] mb-1" />
                  <div className="text-[#ffa502] font-bold">{gameState.stats.charm}</div>
                  <div className="text-gray-500">魅力</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 border border-white/5">
                  <Star size={14} className="mx-auto text-[#3ea6ff] mb-1" />
                  <div className="text-[#3ea6ff] font-bold">{gameState.stats.wisdom}</div>
                  <div className="text-gray-500">智慧</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 border border-white/5">
                  <Flame size={14} className="mx-auto text-green-400 mb-1" />
                  <div className="text-green-400 font-bold">{gameState.stats.stamina}</div>
                  <div className="text-gray-500">体力</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 border border-white/5">
                  <Briefcase size={14} className="mx-auto text-[#f0b90b] mb-1" />
                  <div className="text-[#f0b90b] font-bold">{gameState.stats.money}</div>
                  <div className="text-gray-500">金钱</div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />

            {/* Event log */}
            {(phase === "playing" || phase === "event") && gameState.eventLog.length > 0 && (
              <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
                <h3 className="text-sm font-bold mb-2 text-[#ff6b9d]">行动记录</h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {gameState.eventLog.map((log, i) => (
                    <p key={i} className="text-[10px] text-gray-500">{log}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

