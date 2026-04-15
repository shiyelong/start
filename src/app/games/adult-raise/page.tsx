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
  const rafRef = useRef(0);
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

  // ─── Canvas Render ─────────────────────────────────────────────────────────
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

    const render = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      const s = stateRef.current;
      frameRef.current++;
      const f = frameRef.current;

      if (s.phase === "title") {
        renderTitle(ctx, f);
      } else if (s.phase === "playing") {
        renderPlaying(ctx, s.gameState, f);
      } else if (s.phase === "event" && s.currentEvent) {
        renderPlaying(ctx, s.gameState, f);
        renderEvent(ctx, s.currentEvent, s.gameState, f);
      } else if (s.phase === "ending") {
        renderEnding(ctx, s.endingChar, s.endingType, s.gameState, f);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
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

// ─── Canvas Render Functions ─────────────────────────────────────────────────

function renderTitle(ctx: CanvasRenderingContext2D, f: number) {
  // Background gradient effect
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1a0a2e");
  grad.addColorStop(1, BG);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Floating hearts
  for (let i = 0; i < 8; i++) {
    const x = (W * 0.1 + i * W * 0.12 + Math.sin(f * 0.02 + i) * 20) % W;
    const y = (H * 0.2 + Math.sin(f * 0.015 + i * 1.5) * 40 + i * 30) % H;
    const size = 6 + Math.sin(f * 0.03 + i) * 3;
    const alpha = 0.15 + 0.1 * Math.sin(f * 0.04 + i);
    ctx.fillStyle = `rgba(255, 107, 157, ${alpha})`;
    drawHeart(ctx, x, y, size);
  }

  // Title
  ctx.textAlign = "center";
  const glow = 0.7 + 0.3 * Math.sin(f * 0.04);
  ctx.fillStyle = `rgba(255, 107, 157, ${glow})`;
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("心动物语", W / 2, H / 2 - 80);

  ctx.fillStyle = "#ff4757";
  ctx.font = "12px sans-serif";
  ctx.fillText("NC-17 成人养成", W / 2, H / 2 - 50);

  ctx.fillStyle = "#aaa";
  ctx.font = "13px sans-serif";
  ctx.fillText("30天恋爱养成 / 3位可攻略角色 / 多结局", W / 2, H / 2 - 25);

  // Character previews
  for (let i = 0; i < 3; i++) {
    const ch = CHARACTERS[i];
    const cx = W / 2 - 100 + i * 100;
    const cy = H / 2 + 40;
    const bob = Math.sin(f * 0.03 + i * 2) * 4;

    // Character circle
    ctx.fillStyle = `${ch.color}22`;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `${ch.color}66`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Character initial
    ctx.fillStyle = ch.color;
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(ch.name, cx, cy + bob + 7);

    // Personality
    ctx.fillStyle = "#888";
    ctx.font = "10px sans-serif";
    ctx.fillText(ch.personality, cx, cy + bob + 25);
  }

  // Prompt
  const promptAlpha = 0.5 + 0.5 * Math.sin(f * 0.06);
  ctx.fillStyle = `rgba(62, 166, 255, ${promptAlpha})`;
  ctx.font = "14px sans-serif";
  ctx.fillText("选择难度开始游戏", W / 2, H / 2 + 110);
}

function renderPlaying(ctx: CanvasRenderingContext2D, gs: GameState, f: number) {
  const char = CHARACTERS[gs.selectedChar];

  // Top bar: Day / Time
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, W, 42);
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(`第 ${gs.day}/${MAX_DAYS} 天`, 15, 18);

  const timeLabel = gs.timeOfDay === "morning" ? "早晨" : gs.timeOfDay === "afternoon" ? "下午" : "夜晚";
  const timeColor = gs.timeOfDay === "morning" ? "#ffa502" : gs.timeOfDay === "afternoon" ? "#3ea6ff" : "#a55eea";
  ctx.fillStyle = timeColor;
  ctx.font = "12px sans-serif";
  ctx.fillText(timeLabel, 15, 34);

  // Score
  ctx.textAlign = "right";
  ctx.fillStyle = "#f0b90b";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(`${gs.score} 分`, W - 15, 18);

  // Difficulty badge
  const diffLabel = gs.difficulty === "easy" ? "简单" : gs.difficulty === "normal" ? "普通" : "困难";
  const diffColor = gs.difficulty === "easy" ? "#20bf6b" : gs.difficulty === "normal" ? "#3ea6ff" : "#ff4757";
  ctx.fillStyle = diffColor;
  ctx.font = "10px sans-serif";
  ctx.fillText(diffLabel, W - 15, 34);

  // Character tabs
  ctx.textAlign = "center";
  const tabW = (W - 40) / 3;
  for (let i = 0; i < 3; i++) {
    const ch = CHARACTERS[i];
    const tx = 20 + i * tabW;
    const selected = i === gs.selectedChar;
    ctx.fillStyle = selected ? `${ch.color}33` : "#151515";
    roundRect(ctx, tx, 50, tabW - 4, 24, 6);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 1.5;
      roundRect(ctx, tx, 50, tabW - 4, 24, 6);
      ctx.stroke();
    }
    ctx.fillStyle = selected ? ch.color : "#666";
    ctx.font = selected ? "bold 11px sans-serif" : "11px sans-serif";
    ctx.fillText(ch.name, tx + (tabW - 4) / 2, 66);
  }

  // Character display area
  const charY = 85;
  ctx.fillStyle = `${char.color}0a`;
  roundRect(ctx, 15, charY, W - 30, 100, 8);
  ctx.fill();
  ctx.strokeStyle = `${char.color}30`;
  ctx.lineWidth = 1;
  roundRect(ctx, 15, charY, W - 30, 100, 8);
  ctx.stroke();

  // Character avatar
  const bob = Math.sin(f * 0.03) * 3;
  ctx.fillStyle = `${char.color}30`;
  ctx.beginPath();
  ctx.arc(60, charY + 45 + bob, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = char.color;
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(char.name, 60, charY + 52 + bob);

  // Character info
  ctx.textAlign = "left";
  ctx.fillStyle = "#ccc";
  ctx.font = "12px sans-serif";
  ctx.fillText(`性格: ${char.personality}`, 105, charY + 22);
  ctx.fillStyle = "#888";
  ctx.font = "11px sans-serif";
  ctx.fillText(char.desc, 105, charY + 40);

  // Affection bar
  const aff = gs.affection[gs.selectedChar];
  ctx.fillStyle = "#666";
  ctx.font = "10px sans-serif";
  ctx.fillText("亲密度", 105, charY + 60);
  ctx.fillStyle = "#222";
  roundRect(ctx, 155, charY + 52, 150, 10, 5);
  ctx.fill();
  ctx.fillStyle = char.color;
  roundRect(ctx, 155, charY + 52, 150 * (aff / MAX_AFFECTION), 10, 5);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${aff}/${MAX_AFFECTION}`, W - 25, charY + 62);

  // Affection stage label
  ctx.textAlign = "left";
  ctx.font = "10px sans-serif";
  const stageLabel = aff >= 80 ? "热恋" : aff >= 60 ? "暧昧" : aff >= 40 ? "好感" : aff >= 20 ? "认识" : "陌生";
  const stageColor = aff >= 80 ? "#ff4757" : aff >= 60 ? "#ff6b9d" : aff >= 40 ? "#ffa502" : aff >= 20 ? "#3ea6ff" : "#666";
  ctx.fillStyle = stageColor;
  ctx.fillText(stageLabel, 105, charY + 82);

  // Favorite hint
  ctx.fillStyle = "#555";
  ctx.font = "10px sans-serif";
  const favAction = ACTIONS.find(a => a.type === char.favoriteAction);
  ctx.fillText(`喜欢: ${favAction?.label || ""}`, 160, charY + 82);

  // All characters affection mini display
  ctx.textAlign = "center";
  for (let i = 0; i < 3; i++) {
    const ch = CHARACTERS[i];
    const mx = W - 80 + i * 22;
    const my = charY + 85;
    ctx.fillStyle = i === gs.selectedChar ? ch.color : "#444";
    ctx.font = "9px sans-serif";
    ctx.fillText(`${gs.affection[i]}`, mx, my);
  }

  // Stats bar area
  const statsY = 195;
  ctx.fillStyle = "#1a1a1a";
  roundRect(ctx, 15, statsY, W - 30, 40, 6);
  ctx.fill();

  const statItems = [
    { label: "魅力", value: gs.stats.charm, color: "#ffa502" },
    { label: "智慧", value: gs.stats.wisdom, color: "#3ea6ff" },
    { label: "体力", value: gs.stats.stamina, color: "#20bf6b" },
    { label: "金钱", value: gs.stats.money, color: "#f0b90b" },
  ];
  const statW = (W - 50) / 4;
  for (let i = 0; i < 4; i++) {
    const sx = 25 + i * statW;
    ctx.textAlign = "center";
    ctx.fillStyle = statItems[i].color;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`${statItems[i].value}`, sx + statW / 2, statsY + 18);
    ctx.fillStyle = "#666";
    ctx.font = "9px sans-serif";
    ctx.fillText(statItems[i].label, sx + statW / 2, statsY + 32);
  }

  // Day progress bar
  const progY = 245;
  ctx.fillStyle = "#222";
  roundRect(ctx, 15, progY, W - 30, 6, 3);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  roundRect(ctx, 15, progY, (W - 30) * (gs.day / MAX_DAYS), 6, 3);
  ctx.fill();

  // Hint text
  ctx.textAlign = "center";
  ctx.fillStyle = "#555";
  ctx.font = "10px sans-serif";
  ctx.fillText(`剩余 ${MAX_DAYS - gs.day + 1} 天 / 键盘 1-4 选择行动 / Q W E 切换角色`, W / 2, progY + 20);

  // Action section header
  ctx.textAlign = "left";
  ctx.fillStyle = "#888";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("选择行动", 15, 285);

  // Time bonus indicator
  ctx.textAlign = "right";
  ctx.fillStyle = timeColor;
  ctx.font = "10px sans-serif";
  const timeBonus = gs.timeOfDay === "morning" ? char.morningBonus : gs.timeOfDay === "evening" ? char.eveningBonus : 1.0;
  if (timeBonus > 1.0) ctx.fillText(`${char.name} ${timeLabel}加成 x${timeBonus.toFixed(1)}`, W - 15, 285);

  // Action buttons
  const actionIcons = ["heart", "gift", "chat", "work"];
  const actionColors = ["#ff6b9d", "#a55eea", "#3ea6ff", "#f0b90b"];
  for (let i = 0; i < ACTIONS.length; i++) {
    const a = ACTIONS[i];
    const mult = DIFF_MULT[gs.difficulty];
    const staCost = Math.floor(a.staminaCost * mult.stamina);
    const monCost = Math.floor(a.moneyCost * mult.cost);
    const canDo = a.type === "work" || (gs.stats.stamina >= staCost && gs.stats.money >= monCost);

    const bx = 15, by = 295 + i * 38;
    ctx.fillStyle = canDo ? "#1a1a2e" : "#111";
    roundRect(ctx, bx, by, W - 30, 32, 6);
    ctx.fill();
    ctx.strokeStyle = canDo ? `${actionColors[i]}55` : "#222";
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, W - 30, 32, 6);
    ctx.stroke();

    // Icon placeholder
    ctx.fillStyle = canDo ? actionColors[i] : "#444";
    ctx.beginPath();
    ctx.arc(bx + 18, by + 16, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f0f0f";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${i + 1}`, bx + 18, by + 19);

    // Label
    ctx.textAlign = "left";
    ctx.fillStyle = canDo ? "#fff" : "#555";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(a.label, bx + 34, by + 14);

    // Details
    ctx.fillStyle = canDo ? "#888" : "#444";
    ctx.font = "10px sans-serif";
    if (a.type === "work") {
      ctx.fillText(`体力-${staCost}  金钱+${a.statGain.money}`, bx + 34, by + 27);
    } else {
      const isFav = a.type === char.favoriteAction;
      const affText = isFav ? `亲密+${Math.floor(a.baseAffection * 1.5 * mult.affection)}` : `亲密+${Math.floor(a.baseAffection * mult.affection)}`;
      ctx.fillText(`体力-${staCost}${monCost > 0 ? `  金钱-${monCost}` : ""}  ${affText}${isFav ? " (喜欢!)" : ""}`, bx + 34, by + 27);
    }

    // Disabled overlay
    if (!canDo) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      roundRect(ctx, bx, by, W - 30, 32, 6);
      ctx.fill();
    }
  }

  // Event log at bottom
  ctx.textAlign = "left";
  ctx.fillStyle = "#444";
  ctx.font = "10px sans-serif";
  const logY = 460;
  for (let i = 0; i < Math.min(3, gs.eventLog.length); i++) {
    ctx.fillText(gs.eventLog[i], 15, logY + i * 14);
  }
}

function renderEvent(ctx: CanvasRenderingContext2D, ev: EventDef, gs: GameState, f: number) {
  // Overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(0, 0, W, H);

  const char = CHARACTERS[ev.charId];
  const pulse = 0.8 + 0.2 * Math.sin(f * 0.05);

  // Event card
  const cardX = 30, cardY = 80, cardW = W - 60, cardH = 320;
  ctx.fillStyle = "#1a1a2e";
  roundRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.fill();
  ctx.strokeStyle = `${char.color}88`;
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.stroke();

  // Decorative hearts
  for (let i = 0; i < 5; i++) {
    const hx = cardX + 20 + i * (cardW - 40) / 4;
    const hy = cardY + 30 + Math.sin(f * 0.04 + i) * 8;
    ctx.fillStyle = `${char.color}${Math.floor(pulse * 40).toString(16).padStart(2, "0")}`;
    drawHeart(ctx, hx, hy, 8);
  }

  // Title
  ctx.textAlign = "center";
  ctx.fillStyle = char.color;
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(ev.title, W / 2, cardY + 70);

  // Character name
  ctx.fillStyle = "#aaa";
  ctx.font = "12px sans-serif";
  ctx.fillText(`与 ${char.name} 的特别事件`, W / 2, cardY + 95);

  // Event text (word wrap)
  ctx.fillStyle = "#ddd";
  ctx.font = "13px sans-serif";
  const words = ev.text;
  const maxLineW = cardW - 40;
  let line = "";
  let lineY = cardY + 130;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxLineW && line.length > 0) {
      ctx.fillText(line, W / 2, lineY);
      line = words[i];
      lineY += 22;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, W / 2, lineY);

  // Bonuses
  const bonusY = cardY + 220;
  ctx.fillStyle = char.color;
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(`亲密度 +${ev.affectionBonus}`, W / 2, bonusY);

  if (ev.statBonus) {
    ctx.fillStyle = "#ffa502";
    ctx.font = "11px sans-serif";
    const bonuses: string[] = [];
    if (ev.statBonus.charm) bonuses.push(`魅力+${ev.statBonus.charm}`);
    if (ev.statBonus.wisdom) bonuses.push(`智慧+${ev.statBonus.wisdom}`);
    if (ev.statBonus.stamina) bonuses.push(`体力+${ev.statBonus.stamina}`);
    ctx.fillText(bonuses.join("  "), W / 2, bonusY + 20);
  }

  // Continue prompt
  const contAlpha = 0.5 + 0.5 * Math.sin(f * 0.06);
  ctx.fillStyle = `rgba(170, 170, 170, ${contAlpha})`;
  ctx.font = "12px sans-serif";
  ctx.fillText("点击继续", W / 2, cardY + cardH - 20);
}

function renderEnding(ctx: CanvasRenderingContext2D, char: CharacterDef, ending: EndingType, gs: GameState, f: number) {
  // Background
  const bgColor = ending === "good" ? "#1a0a2e" : ending === "normal" ? "#151515" : "#0a0a0a";
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Particles
  if (ending === "good") {
    for (let i = 0; i < 15; i++) {
      const px = (i * 37 + f * 0.5) % W;
      const py = (i * 23 + f * 0.3) % H;
      const size = 4 + Math.sin(f * 0.03 + i) * 2;
      ctx.fillStyle = `${char.color}${Math.floor(20 + Math.sin(f * 0.04 + i) * 15).toString(16).padStart(2, "0")}`;
      drawHeart(ctx, px, py, size);
    }
  }

  ctx.textAlign = "center";

  // Ending type label
  const endLabel = ending === "good" ? "完美结局" : ending === "normal" ? "普通结局" : "遗憾结局";
  const endColor = ending === "good" ? "#ff6b9d" : ending === "normal" ? "#ffa502" : "#666";
  ctx.fillStyle = endColor;
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(endLabel, W / 2, 80);

  // Character
  const bob = Math.sin(f * 0.03) * 5;
  ctx.fillStyle = `${char.color}30`;
  ctx.beginPath();
  ctx.arc(W / 2, 150 + bob, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = char.color;
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(char.name, W / 2, 158 + bob);

  // Ending text (word wrap)
  const text = getEndingText(char, ending);
  ctx.fillStyle = "#ccc";
  ctx.font = "14px sans-serif";
  const maxW = W - 60;
  let line = "";
  let ly = 220;
  for (let i = 0; i < text.length; i++) {
    const test = line + text[i];
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      ctx.fillText(line, W / 2, ly);
      line = text[i];
      ly += 24;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, W / 2, ly);

  // Stats summary
  const sumY = 310;
  ctx.fillStyle = "#1a1a2e";
  roundRect(ctx, 40, sumY, W - 80, 120, 8);
  ctx.fill();
  ctx.strokeStyle = `${char.color}44`;
  ctx.lineWidth = 1;
  roundRect(ctx, 40, sumY, W - 80, 120, 8);
  ctx.stroke();

  ctx.fillStyle = "#aaa";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("游戏总结", W / 2, sumY + 22);

  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#888";
  const summaryItems = [
    `最终亲密度: ${gs.affection[char.id]}/${MAX_AFFECTION}`,
    `解锁事件: ${gs.eventsUnlocked.size}/${EVENTS.filter(e => e.charId === char.id).length}`,
    `最终属性: 魅力${gs.stats.charm} / 智慧${gs.stats.wisdom}`,
    `总分: ${gs.score}`,
  ];
  for (let i = 0; i < summaryItems.length; i++) {
    ctx.fillText(summaryItems[i], W / 2, sumY + 45 + i * 20);
  }

  // All characters final affection
  ctx.fillStyle = "#555";
  ctx.font = "10px sans-serif";
  for (let i = 0; i < 3; i++) {
    const ch = CHARACTERS[i];
    ctx.fillText(`${ch.name}: ${gs.affection[i]}`, W / 2 - 80 + i * 80, sumY + 110);
  }

  // Prompt
  const pa = 0.5 + 0.5 * Math.sin(f * 0.06);
  ctx.fillStyle = `rgba(62, 166, 255, ${pa})`;
  ctx.font = "13px sans-serif";
  ctx.fillText("点击下方按钮重新开始", W / 2, H - 30);
}

// ─── Utility Drawing Functions ───────────────────────────────────────────────

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.3);
  ctx.bezierCurveTo(-size, -size * 0.3, -size, size * 0.6, 0, size);
  ctx.bezierCurveTo(size, size * 0.6, size, -size * 0.3, 0, size * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
