"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, Volume2, VolumeX, Layers, Lock, Play, RotateCcw,
  Sword, Shield, Zap, Heart, Flame, Sparkles, Trophy, Star,
  Skull, Eye, Target, Wind
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-cards";
const W = 480, H = 560;
const PRIMARY = "#a55eea", ACCENT = "#3ea6ff";

// ─── Types ───────────────────────────────────────────────────────────────────
type CardType = "attack" | "defense" | "skill" | "special";
type Difficulty = "easy" | "normal" | "hard";
type Phase = "title" | "diffSelect" | "battle" | "drawPhase" | "selectCard" | "resolve" | "victory" | "defeat" | "gameComplete";

interface GameCard {
  id: number;
  name: string;
  type: CardType;
  atk: number;
  def: number;
  cost: number;
  effect: string;
  color: string;
}

interface Fighter {
  hp: number;
  maxHp: number;
  armor: number;
  energy: number;
  maxEnergy: number;
}

interface Opponent {
  name: string;
  title: string;
  color: string;
  hp: number;
  armor: number;
  energy: number;
  atkMult: number;
  defMult: number;
}

interface BattleState {
  player: Fighter;
  enemy: Fighter;
  hand: GameCard[];
  deck: GameCard[];
  discard: GameCard[];
  enemyHand: GameCard[];
  turn: number;
  selectedCard: number | null;
  opponentIdx: number;
  log: string[];
  animTimer: number;
  animType: "none" | "playerAtk" | "enemyAtk" | "heal" | "shield";
  unlockedCards: number[];
}

// ─── Card Database (24 cards) ────────────────────────────────────────────────
const ALL_CARDS: Omit<GameCard, "id">[] = [
  // Attack cards (8)
  { name: "暗影斩", type: "attack", atk: 6, def: 0, cost: 1, effect: "基础攻击", color: "#ff4757" },
  { name: "血刃突刺", type: "attack", atk: 9, def: 0, cost: 2, effect: "穿透2护甲", color: "#ff6b81" },
  { name: "烈焰爆破", type: "attack", atk: 12, def: 0, cost: 3, effect: "灼烧伤害", color: "#ff4500" },
  { name: "暗杀", type: "attack", atk: 15, def: 0, cost: 3, effect: "无视护甲", color: "#c0392b" },
  { name: "连环斩", type: "attack", atk: 4, def: 0, cost: 1, effect: "攻击两次", color: "#e74c3c" },
  { name: "致命一击", type: "attack", atk: 20, def: 0, cost: 4, effect: "暴击伤害", color: "#8b0000" },
  { name: "毒刃", type: "attack", atk: 5, def: 0, cost: 1, effect: "附加毒伤3", color: "#27ae60" },
  { name: "裂地斩", type: "attack", atk: 10, def: 0, cost: 2, effect: "破甲攻击", color: "#d35400" },
  // Defense cards (6)
  { name: "铁壁", type: "defense", atk: 0, def: 6, cost: 1, effect: "获得护甲", color: "#3ea6ff" },
  { name: "暗影护盾", type: "defense", atk: 0, def: 10, cost: 2, effect: "暗影护甲", color: "#2980b9" },
  { name: "荆棘甲", type: "defense", atk: 3, def: 8, cost: 2, effect: "反弹3伤害", color: "#16a085" },
  { name: "绝对防御", type: "defense", atk: 0, def: 15, cost: 3, effect: "坚不可摧", color: "#1abc9c" },
  { name: "魔力屏障", type: "defense", atk: 0, def: 5, cost: 1, effect: "回1能量", color: "#9b59b6" },
  { name: "石化之壁", type: "defense", atk: 0, def: 12, cost: 3, effect: "减伤护盾", color: "#7f8c8d" },
  // Skill cards (6)
  { name: "生命汲取", type: "skill", atk: 5, def: 0, cost: 2, effect: "吸血50%", color: "#e84393" },
  { name: "治愈术", type: "skill", atk: 0, def: 0, cost: 2, effect: "恢复8HP", color: "#00b894" },
  { name: "能量涌动", type: "skill", atk: 0, def: 0, cost: 0, effect: "回3能量", color: "#fdcb6e" },
  { name: "战吼", type: "skill", atk: 0, def: 4, cost: 1, effect: "下次攻击+5", color: "#e17055" },
  { name: "暗影步", type: "skill", atk: 3, def: 3, cost: 1, effect: "攻防兼备", color: "#6c5ce7" },
  { name: "嗜血", type: "skill", atk: 8, def: 0, cost: 2, effect: "消耗3HP攻击", color: "#d63031" },
  // Special cards (4)
  { name: "灵魂收割", type: "special", atk: 25, def: 0, cost: 5, effect: "终极攻击", color: "#ffd700" },
  { name: "不灭之躯", type: "special", atk: 0, def: 0, cost: 4, effect: "回满HP", color: "#ffd700" },
  { name: "暗影吞噬", type: "special", atk: 0, def: 0, cost: 3, effect: "偷取敌方5HP", color: "#ffd700" },
  { name: "命运逆转", type: "special", atk: 0, def: 0, cost: 3, effect: "交换HP比例", color: "#ffd700" },
];

function makeCard(templateIdx: number, id: number): GameCard {
  return { ...ALL_CARDS[templateIdx], id };
}

// ─── Opponents (5) ───────────────────────────────────────────────────────────
const OPPONENTS: Opponent[] = [
  { name: "暗影学徒", title: "初级对手", color: "#7f8c8d", hp: 40, armor: 0, energy: 3, atkMult: 0.7, defMult: 0.7 },
  { name: "血族猎手", title: "中级对手", color: "#e74c3c", hp: 55, armor: 5, energy: 4, atkMult: 0.9, defMult: 0.8 },
  { name: "深渊法师", title: "高级对手", color: "#9b59b6", hp: 65, armor: 8, energy: 4, atkMult: 1.0, defMult: 1.0 },
  { name: "堕落骑士", title: "精英对手", color: "#e67e22", hp: 80, armor: 12, energy: 5, atkMult: 1.2, defMult: 1.1 },
  { name: "暗影领主", title: "最终Boss", color: "#ffd700", hp: 100, armor: 15, energy: 5, atkMult: 1.5, defMult: 1.3 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildStarterDeck(): GameCard[] {
  let id = 0;
  const indices = [0, 0, 1, 2, 4, 8, 8, 9, 14, 16, 18, 6];
  return indices.map(idx => makeCard(idx, id++));
}

function buildEnemyCards(opIdx: number, mult: { atk: number; def: number }): GameCard[] {
  let id = 1000;
  const templates = [0, 1, 2, 8, 9, 14, 4, 10];
  return templates.map(idx => {
    const c = makeCard(idx, id++);
    c.atk = Math.floor(c.atk * mult.atk);
    c.def = Math.floor(c.def * mult.def);
    return c;
  });
}

function diffMult(diff: Difficulty): { hp: number; eMult: number } {
  switch (diff) {
    case "easy": return { hp: 60, eMult: 0.7 };
    case "normal": return { hp: 50, eMult: 1.0 };
    case "hard": return { hp: 40, eMult: 1.3 };
  }
}

function hexToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}


// ─── Component ───────────────────────────────────────────────────────────────
export default function AdultCards() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const frameRef = useRef(0);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [score, setScore] = useState(0);

  const battleRef = useRef<BattleState>({
    player: { hp: 50, maxHp: 50, armor: 0, energy: 3, maxEnergy: 3 },
    enemy: { hp: 40, maxHp: 40, armor: 0, energy: 3, maxEnergy: 3 },
    hand: [],
    deck: [],
    discard: [],
    enemyHand: [],
    turn: 1,
    selectedCard: null,
    opponentIdx: 0,
    log: [],
    animTimer: 0,
    animType: "none",
    unlockedCards: [],
  });

  const stateRef = useRef({ phase, difficulty, muted, score });
  useEffect(() => { stateRef.current = { phase, difficulty, muted, score }; });

  // ─── Age Gate ──────────────────────────────────────────────────────────────
  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  // ─── Sound ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playSound = useCallback((type: "click" | "attack" | "defend" | "heal" | "win" | "lose" | "draw" | "special") => {
    const s = soundRef.current;
    if (!s || stateRef.current.muted) return;
    switch (type) {
      case "click": s.playClick(); break;
      case "attack": s.playTone(220, 0.15, "sawtooth"); break;
      case "defend": s.playTone(440, 0.12, "triangle"); break;
      case "heal": s.playTone(660, 0.2, "sine"); break;
      case "win": s.playLevelUp(); break;
      case "lose": s.playGameOver(); break;
      case "draw": s.playMove(); break;
      case "special": s.playCombo(3); break;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(m ?? false);
  }, []);

  // ─── Apply Card Effect ─────────────────────────────────────────────────────
  const applyCard = useCallback((card: GameCard, isPlayer: boolean) => {
    const b = battleRef.current;
    const attacker = isPlayer ? b.player : b.enemy;
    const defender = isPlayer ? b.enemy : b.player;

    switch (card.name) {
      case "连环斩": {
        const dmg1 = Math.max(0, card.atk - defender.armor);
        const dmg2 = Math.max(0, card.atk - defender.armor);
        defender.hp -= dmg1 + dmg2;
        defender.armor = Math.max(0, defender.armor - 1);
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，造成${dmg1 + dmg2}伤害`);
        break;
      }
      case "暗杀": {
        defender.hp -= card.atk;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，无视护甲造成${card.atk}伤害`);
        break;
      }
      case "血刃突刺": {
        const pierce = Math.max(0, defender.armor - 2);
        const dmg = Math.max(0, card.atk - pierce);
        defender.hp -= dmg;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，穿透护甲造成${dmg}伤害`);
        break;
      }
      case "毒刃": {
        const dmg = Math.max(0, card.atk - defender.armor);
        defender.hp -= dmg + 3;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，造成${dmg}+3毒伤`);
        break;
      }
      case "裂地斩": {
        defender.armor = Math.max(0, defender.armor - 4);
        const dmg = Math.max(0, card.atk - defender.armor);
        defender.hp -= dmg;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，破甲并造成${dmg}伤害`);
        break;
      }
      case "荆棘甲": {
        attacker.armor += card.def;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，获得${card.def}护甲，反弹3伤害`);
        break;
      }
      case "魔力屏障": {
        attacker.armor += card.def;
        attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 1);
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，获得${card.def}护甲并回1能量`);
        break;
      }
      case "生命汲取": {
        const dmg = Math.max(0, card.atk - defender.armor);
        defender.hp -= dmg;
        const heal = Math.floor(dmg * 0.5);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，造成${dmg}伤害并恢复${heal}HP`);
        break;
      }
      case "治愈术": {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + 8);
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，恢复8HP`);
        break;
      }
      case "能量涌动": {
        attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 3);
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，恢复3能量`);
        break;
      }
      case "战吼": {
        attacker.armor += card.def;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，获得${card.def}护甲，下次攻击+5`);
        break;
      }
      case "嗜血": {
        attacker.hp -= 3;
        const dmg = Math.max(0, card.atk - defender.armor);
        defender.hp -= dmg;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，消耗3HP造成${dmg}伤害`);
        break;
      }
      case "灵魂收割": {
        defender.hp -= card.atk;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，终极攻击造成${card.atk}伤害`);
        break;
      }
      case "不灭之躯": {
        attacker.hp = attacker.maxHp;
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，HP回满`);
        break;
      }
      case "暗影吞噬": {
        defender.hp -= 5;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + 5);
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，偷取5HP`);
        break;
      }
      case "命运逆转": {
        const pRatio = attacker.hp / attacker.maxHp;
        const eRatio = defender.hp / defender.maxHp;
        attacker.hp = Math.floor(eRatio * attacker.maxHp);
        defender.hp = Math.floor(pRatio * defender.maxHp);
        b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，交换HP比例`);
        break;
      }
      default: {
        if (card.atk > 0) {
          const dmg = Math.max(0, card.atk - defender.armor);
          defender.hp -= dmg;
          defender.armor = Math.max(0, defender.armor - Math.floor(card.atk * 0.3));
          b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，造成${dmg}伤害`);
        }
        if (card.def > 0) {
          attacker.armor += card.def;
          b.log.push(`${isPlayer ? "你" : "敌方"}使用${card.name}，获得${card.def}护甲`);
        }
        break;
      }
    }
    attacker.hp = Math.max(0, attacker.hp);
    defender.hp = Math.max(0, defender.hp);
  }, []);


  // ─── Start Battle ──────────────────────────────────────────────────────────
  const startBattle = useCallback((opIdx: number, diff: Difficulty) => {
    const dm = diffMult(diff);
    const op = OPPONENTS[opIdx];
    const playerDeck = shuffle(buildStarterDeck());
    const unlocked = battleRef.current.unlockedCards;
    let nextId = 100;
    unlocked.forEach(idx => {
      playerDeck.push(makeCard(idx, nextId++));
    });
    const shuffled = shuffle(playerDeck);
    const hand = shuffled.splice(0, 3);

    const eMult = dm.eMult * op.atkMult;
    const eCards = buildEnemyCards(opIdx, { atk: eMult, def: dm.eMult * op.defMult });

    battleRef.current = {
      player: { hp: dm.hp, maxHp: dm.hp, armor: 0, energy: 3, maxEnergy: 3 + (diff === "easy" ? 1 : 0) },
      enemy: { hp: Math.floor(op.hp * dm.eMult), maxHp: Math.floor(op.hp * dm.eMult), armor: op.armor, energy: op.energy, maxEnergy: op.energy },
      hand,
      deck: shuffled,
      discard: [],
      enemyHand: shuffle(eCards),
      turn: 1,
      selectedCard: null,
      opponentIdx: opIdx,
      log: [`对阵 ${op.name} - ${op.title}`],
      animTimer: 0,
      animType: "none",
      unlockedCards: unlocked,
    };
    setPhase("selectCard");
    playSound("draw");
  }, [playSound]);

  // ─── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    setScore(0);
    battleRef.current.unlockedCards = [];
    battleRef.current.opponentIdx = 0;
    startBattle(0, diff);
    playSound("click");
  }, [startBattle, playSound]);

  // ─── Draw Cards ────────────────────────────────────────────────────────────
  const drawCards = useCallback((count: number) => {
    const b = battleRef.current;
    for (let i = 0; i < count; i++) {
      if (b.deck.length === 0) {
        if (b.discard.length === 0) break;
        b.deck = shuffle(b.discard);
        b.discard = [];
      }
      const card = b.deck.pop();
      if (card) b.hand.push(card);
    }
  }, []);

  // ─── Play Selected Card ────────────────────────────────────────────────────
  const playCard = useCallback((cardIdx: number) => {
    const b = battleRef.current;
    if (cardIdx < 0 || cardIdx >= b.hand.length) return;
    const card = b.hand[cardIdx];
    if (card.cost > b.player.energy) {
      b.log.push("能量不足！");
      playSound("click");
      return;
    }

    b.player.energy -= card.cost;
    b.hand.splice(cardIdx, 1);
    b.discard.push(card);
    b.selectedCard = null;

    const soundType = card.type === "attack" ? "attack" : card.type === "defense" ? "defend" : card.type === "special" ? "special" : "heal";
    playSound(soundType);
    b.animType = card.type === "attack" || card.type === "special" ? "playerAtk" : card.type === "defense" ? "shield" : "heal";
    b.animTimer = 20;
    applyCard(card, true);

    if (b.enemy.hp <= 0) {
      const opIdx = b.opponentIdx;
      const pts = (opIdx + 1) * 500 + b.player.hp * 10 + b.turn * 5;
      setScore(prev => prev + pts);
      b.log.push(`击败了 ${OPPONENTS[opIdx].name}！+${pts}分`);

      const rewardIdx = 3 + opIdx * 2;
      if (rewardIdx < ALL_CARDS.length && !b.unlockedCards.includes(rewardIdx)) {
        b.unlockedCards.push(rewardIdx);
        b.log.push(`解锁新卡牌: ${ALL_CARDS[rewardIdx].name}`);
      }
      const rewardIdx2 = 10 + opIdx;
      if (rewardIdx2 < ALL_CARDS.length && !b.unlockedCards.includes(rewardIdx2)) {
        b.unlockedCards.push(rewardIdx2);
        b.log.push(`解锁新卡牌: ${ALL_CARDS[rewardIdx2].name}`);
      }

      if (opIdx >= OPPONENTS.length - 1) {
        setPhase("gameComplete");
        playSound("win");
      } else {
        setPhase("victory");
        playSound("win");
      }
      return;
    }

    enemyTurn();
  }, [applyCard, playSound]);

  // ─── Enemy Turn ────────────────────────────────────────────────────────────
  const enemyTurn = useCallback(() => {
    const b = battleRef.current;
    b.enemy.energy = Math.min(b.enemy.maxEnergy, b.enemy.energy + 2);

    const affordable = b.enemyHand.filter(c => c.cost <= b.enemy.energy);
    if (affordable.length > 0) {
      let chosen: GameCard;
      if (b.enemy.hp < b.enemy.maxHp * 0.3) {
        const defCards = affordable.filter(c => c.type === "defense" || c.type === "skill");
        chosen = defCards.length > 0 ? defCards[Math.floor(Math.random() * defCards.length)] : affordable[Math.floor(Math.random() * affordable.length)];
      } else {
        const atkCards = affordable.filter(c => c.type === "attack");
        chosen = atkCards.length > 0 ? atkCards[Math.floor(Math.random() * atkCards.length)] : affordable[Math.floor(Math.random() * affordable.length)];
      }
      b.enemy.energy -= chosen.cost;
      applyCard(chosen, false);
      b.animType = "enemyAtk";
      b.animTimer = 20;

      const idx = b.enemyHand.indexOf(chosen);
      if (idx >= 0) {
        b.enemyHand.splice(idx, 1);
        b.enemyHand.push({ ...chosen, id: chosen.id + 10000 });
      }
    } else {
      b.log.push("敌方能量不足，跳过回合");
      b.enemy.energy = Math.min(b.enemy.maxEnergy, b.enemy.energy + 1);
    }

    if (b.player.hp <= 0) {
      setPhase("defeat");
      playSound("lose");
      return;
    }

    b.turn++;
    b.player.energy = Math.min(b.player.maxEnergy, b.player.energy + 2);
    b.player.armor = Math.max(0, b.player.armor - 1);
    b.enemy.armor = Math.max(0, b.enemy.armor - 1);
    drawCards(3 - b.hand.length > 0 ? Math.min(3, 3 - b.hand.length + 1) : 1);
    if (b.hand.length === 0) drawCards(1);
  }, [applyCard, drawCards, playSound]);

  // ─── Next Opponent ─────────────────────────────────────────────────────────
  const nextOpponent = useCallback(() => {
    const b = battleRef.current;
    const nextIdx = b.opponentIdx + 1;
    if (nextIdx < OPPONENTS.length) {
      startBattle(nextIdx, stateRef.current.difficulty);
    }
    playSound("click");
  }, [startBattle, playSound]);

  // ─── End Turn (skip) ──────────────────────────────────────────────────────
  const endTurn = useCallback(() => {
    const b = battleRef.current;
    b.log.push("你跳过了回合");
    b.selectedCard = null;
    enemyTurn();
    playSound("click");
  }, [enemyTurn, playSound]);

  // ─── Save / Load ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const b = battleRef.current;
    return {
      difficulty: stateRef.current.difficulty,
      score: stateRef.current.score,
      phase: stateRef.current.phase,
      player: { ...b.player },
      enemy: { ...b.enemy },
      hand: b.hand.map(c => ({ ...c })),
      deck: b.deck.map(c => ({ ...c })),
      discard: b.discard.map(c => ({ ...c })),
      turn: b.turn,
      opponentIdx: b.opponentIdx,
      unlockedCards: [...b.unlockedCards],
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d) return;
    setDifficulty((d.difficulty as Difficulty) || "normal");
    setScore((d.score as number) || 0);
    const b = battleRef.current;
    b.player = (d.player as Fighter) || b.player;
    b.enemy = (d.enemy as Fighter) || b.enemy;
    b.hand = (d.hand as GameCard[]) || [];
    b.deck = (d.deck as GameCard[]) || [];
    b.discard = (d.discard as GameCard[]) || [];
    b.turn = (d.turn as number) || 1;
    b.opponentIdx = (d.opponentIdx as number) || 0;
    b.unlockedCards = (d.unlockedCards as number[]) || [];
    b.selectedCard = null;
    b.log = ["存档已加载..."];
    b.animTimer = 0;
    b.animType = "none";
    const eCards = buildEnemyCards(b.opponentIdx, {
      atk: diffMult(stateRef.current.difficulty).eMult * OPPONENTS[b.opponentIdx].atkMult,
      def: diffMult(stateRef.current.difficulty).eMult * OPPONENTS[b.opponentIdx].defMult,
    });
    b.enemyHand = shuffle(eCards);
    setPhase("selectCard");
    playSound("click");
  }, [playSound]);

  // ─── Submit Score ──────────────────────────────────────────────────────────
  const submitScore = useCallback(async () => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score }),
      });
    } catch { /* silent */ }
  }, [score]);

  useEffect(() => {
    if (phase === "gameComplete" || phase === "defeat") submitScore();
  }, [phase, submitScore]);


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
      const app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0a0a0a, antialias: true });
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
          fontFamily: "monospace",
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

        const b = battleRef.current;
        const p = stateRef.current.phase;

        if (b.animTimer > 0) b.animTimer--;

        if (p === "title" || p === "diffSelect") {
          // ─── Title Screen ────────────────────────────────────────────
          const t = frameRef.current * 0.02;
          // Background pattern
          for (let i = 0; i < 12; i++) {
            const bx = W / 2 + Math.cos(t + i * 0.5) * 120;
            const by = 120 + Math.sin(t + i * 0.7) * 40;
            const alpha = 0.05 + 0.03 * Math.sin(t + i);
            g.circle(bx, by, 30 + i * 3).fill({ color: cn(PRIMARY), alpha });
          }

          showText("暗影牌局", W / 2, 100, { fill: PRIMARY, fontSize: 36, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText("NC-17 成人卡牌对战", W / 2, 130, { fill: "#ff4757", fontSize: 13, ax: 0.5, ay: 0.5 });
          showText("回合制策略 / 20+卡牌 / 5位对手", W / 2, 155, { fill: "#888888", fontSize: 12, ax: 0.5, ay: 0.5 });

          // Card preview animation
          const previewCards = [0, 2, 8, 14, 20];
          previewCards.forEach((ci, i) => {
            const c = ALL_CARDS[ci];
            const cx = 60 + i * 90;
            const cy = 200 + Math.sin(t + i * 0.8) * 8;
            const cw = 70, ch = 95;
            g.roundRect(cx, cy, cw, ch, 6).fill({ color: 0x1a1a2e });
            g.roundRect(cx, cy, cw, ch, 6).stroke({ color: cn(c.color), width: 1.5 });
            showText(c.name.slice(0, 4), cx + cw / 2, cy + 20, { fill: c.color, fontSize: 10, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            showText(`${c.atk || c.def}`, cx + cw / 2, cy + 50, { fill: "#ffffff", fontSize: 18, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            const typeStr = c.type === "attack" ? "攻击" : c.type === "defense" ? "防御" : c.type === "skill" ? "技能" : "特殊";
            showText(typeStr, cx + cw / 2, cy + 75, { fill: "#888888", fontSize: 9, ax: 0.5, ay: 0.5 });
          });

          if (p === "title") {
            const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.06);
            showText("点击开始", W / 2, 360, { fill: ACCENT, fontSize: 16, ax: 0.5, ay: 0.5, alpha: glow });
          }

          if (p === "diffSelect") {
            showText("选择难度", W / 2, 340, { fill: "#ffffff", fontSize: 16, fontWeight: "bold", ax: 0.5, ay: 0.5 });

            const diffs: { label: string; color: string; y: number }[] = [
              { label: "简单 - 高HP/弱敌", color: "#2ed573", y: 380 },
              { label: "普通 - 标准挑战", color: "#ffa502", y: 420 },
              { label: "困难 - 低HP/强敌", color: "#ff4757", y: 460 },
            ];
            diffs.forEach(df => {
              g.roundRect(W / 2 - 120, df.y - 18, 240, 32, 8).fill({ color: 0x1a1a2e });
              g.roundRect(W / 2 - 120, df.y - 18, 240, 32, 8).stroke({ color: cn(df.color), width: 1 });
              showText(df.label, W / 2, df.y + 2, { fill: df.color, fontSize: 13, ax: 0.5, ay: 0.5 });
            });
          }

        } else if (p === "selectCard" || p === "battle" || p === "resolve" || p === "drawPhase") {
          // ─── Battle Screen ───────────────────────────────────────────
          const op = OPPONENTS[b.opponentIdx];

          // Enemy area (top)
          g.rect(0, 0, W, 120).fill({ color: 0x1a0a2e });

          // Enemy name
          showText(`${op.name} - ${op.title}`, W / 2, 20, { fill: op.color, fontSize: 14, fontWeight: "bold", ax: 0.5, ay: 0.5 });

          // Enemy HP bar
          const eHpRatio = Math.max(0, b.enemy.hp / b.enemy.maxHp);
          g.roundRect(60, 30, W - 120, 14, 4).fill({ color: 0x333333 });
          if (eHpRatio > 0) g.roundRect(60, 30, (W - 120) * eHpRatio, 14, 4).fill({ color: 0xff4757 });
          showText(`HP ${b.enemy.hp}/${b.enemy.maxHp}`, W / 2, 37, { fill: "#ffffff", fontSize: 10, ax: 0.5, ay: 0.5 });

          // Enemy armor & energy
          showText(`护甲: ${b.enemy.armor}`, 60, 62, { fill: ACCENT, fontSize: 11 });
          showText(`能量: ${b.enemy.energy}/${b.enemy.maxEnergy}`, W - 60, 62, { fill: "#fdcb6e", fontSize: 11, ax: 1, ay: 0 });

          // Enemy card back (visual)
          g.roundRect(W / 2 - 30, 72, 60, 40, 4).fill({ color: 0x2d1b4e });
          g.roundRect(W / 2 - 30, 72, 60, 40, 4).stroke({ color: cn(op.color), width: 1 });
          showText("?", W / 2, 96, { fill: op.color, fontSize: 10, ax: 0.5, ay: 0.5 });

          // Divider
          g.rect(0, 120, W, 1).fill({ color: 0x333333 });

          // Battle log area
          g.rect(0, 121, W, 60).fill({ color: 0x0d0d1a });
          const logStart = Math.max(0, b.log.length - 3);
          for (let i = logStart; i < b.log.length; i++) {
            showText(b.log[i].slice(0, 40), 10, 136 + (i - logStart) * 16, { fill: "#888888", fontSize: 10 });
          }

          // Turn info
          showText(`回合 ${b.turn}`, W - 10, 136, { fill: "#555555", fontSize: 10, ax: 1, ay: 0 });

          // Player area
          g.rect(0, 182, W, 60).fill({ color: 0x0a0a1a });

          // Player HP bar
          const pHpRatio = Math.max(0, b.player.hp / b.player.maxHp);
          g.roundRect(60, 190, W - 120, 14, 4).fill({ color: 0x333333 });
          if (pHpRatio > 0) g.roundRect(60, 190, (W - 120) * pHpRatio, 14, 4).fill({ color: 0x2ed573 });
          showText(`HP ${b.player.hp}/${b.player.maxHp}`, W / 2, 197, { fill: "#ffffff", fontSize: 10, ax: 0.5, ay: 0.5 });

          // Player armor & energy
          showText(`护甲: ${b.player.armor}`, 60, 222, { fill: ACCENT, fontSize: 11 });
          showText(`能量: ${b.player.energy}/${b.player.maxEnergy}`, W - 60, 222, { fill: "#fdcb6e", fontSize: 11, ax: 1, ay: 0 });

          showText("你的手牌", W / 2, 256, { fill: "#ffffff", fontSize: 12, fontWeight: "bold", ax: 0.5, ay: 0.5 });

          // Hand cards
          const cardW = 90, cardH = 130, gap = 8;
          const handLen = b.hand.length;
          const totalW = handLen * (cardW + gap) - gap;
          const startX = (W - totalW) / 2;
          const cardY = 268;

          for (let i = 0; i < handLen; i++) {
            const c = b.hand[i];
            const cx = startX + i * (cardW + gap);
            const isSelected = b.selectedCard === i;
            const canAfford = c.cost <= b.player.energy;
            const yOff = isSelected ? -12 : 0;

            // Card background
            g.roundRect(cx, cardY + yOff, cardW, cardH, 6).fill({ color: isSelected ? 0x2a1a4e : 0x1a1a2e });

            // Card border
            const borderColor = isSelected ? 0xffffff : canAfford ? cn(c.color) : 0x444444;
            g.roundRect(cx, cardY + yOff, cardW, cardH, 6).stroke({ color: borderColor, width: isSelected ? 2 : 1 });

            // Cost badge
            g.circle(cx + 14, cardY + yOff + 14, 10).fill({ color: 0xfdcb6e });
            showText(`${c.cost}`, cx + 14, cardY + yOff + 14, { fill: "#000000", fontSize: 11, fontWeight: "bold", ax: 0.5, ay: 0.5 });

            // Card name
            showText(c.name.slice(0, 5), cx + cardW / 2, cardY + yOff + 18, { fill: c.color, fontSize: 11, fontWeight: "bold", ax: 0.5, ay: 0.5 });

            // Type label
            const typeLabel = c.type === "attack" ? "攻击" : c.type === "defense" ? "防御" : c.type === "skill" ? "技能" : "特殊";
            showText(typeLabel, cx + cardW / 2, cardY + yOff + 34, { fill: "#888888", fontSize: 9, ax: 0.5, ay: 0.5 });

            // Stats
            if (c.atk > 0) {
              const sx = c.def > 0 ? cx + cardW / 3 : cx + cardW / 2;
              showText(`${c.atk}`, sx, cardY + yOff + 60, { fill: "#ff4757", fontSize: 20, fontWeight: "bold", ax: 0.5, ay: 0.5 });
              showText("攻", sx, cardY + yOff + 78, { fill: "#ff4757", fontSize: 9, ax: 0.5, ay: 0.5 });
            }
            if (c.def > 0) {
              const sx = c.atk > 0 ? cx + cardW * 2 / 3 : cx + cardW / 2;
              showText(`${c.def}`, sx, cardY + yOff + 60, { fill: ACCENT, fontSize: 20, fontWeight: "bold", ax: 0.5, ay: 0.5 });
              showText("防", sx, cardY + yOff + 78, { fill: ACCENT, fontSize: 9, ax: 0.5, ay: 0.5 });
            }
            if (c.atk === 0 && c.def === 0) {
              showText("SP", cx + cardW / 2, cardY + yOff + 65, { fill: "#ffd700", fontSize: 14, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            }

            // Effect text
            showText(c.effect.slice(0, 8), cx + cardW / 2, cardY + yOff + 100, { fill: "#aaaaaa", fontSize: 9, ax: 0.5, ay: 0.5 });

            // Afford indicator
            if (!canAfford) {
              g.roundRect(cx, cardY + yOff, cardW, cardH, 6).fill({ color: 0x000000, alpha: 0.5 });
              showText("能量不足", cx + cardW / 2, cardY + yOff + cardH / 2, { fill: "#ff4757", fontSize: 10, ax: 0.5, ay: 0.5 });
            }
          }

          // Action buttons
          const btnY = 410;
          if (b.selectedCard !== null) {
            g.roundRect(W / 2 - 100, btnY, 90, 32, 6).fill({ color: 0x2ed573 });
            showText("出牌", W / 2 - 55, btnY + 16, { fill: "#000000", fontSize: 13, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          }
          g.roundRect(W / 2 + 10, btnY, 90, 32, 6).fill({ color: 0x555555 });
          showText("跳过", W / 2 + 55, btnY + 16, { fill: "#ffffff", fontSize: 13, fontWeight: "bold", ax: 0.5, ay: 0.5 });

          // Opponent progress
          showText(`对手 ${b.opponentIdx + 1}/${OPPONENTS.length}`, W / 2, 460, { fill: "#444444", fontSize: 10, ax: 0.5, ay: 0.5 });

          // Animation overlay
          if (b.animTimer > 0) {
            const alpha = b.animTimer / 20 * 0.3;
            if (b.animType === "playerAtk") {
              g.rect(0, 0, W, 120).fill({ color: 0xff4757, alpha });
            } else if (b.animType === "enemyAtk") {
              g.rect(0, 182, W, 60).fill({ color: 0xff4757, alpha });
            } else if (b.animType === "shield") {
              g.rect(0, 182, W, 60).fill({ color: cn(ACCENT), alpha });
            } else if (b.animType === "heal") {
              g.rect(0, 182, W, 60).fill({ color: 0x2ed573, alpha });
            }
          }

        } else if (p === "victory") {
          // ─── Victory Screen ──────────────────────────────────────────
          const op = OPPONENTS[b.opponentIdx];
          showText("胜利", W / 2, 120, { fill: "#ffd700", fontSize: 30, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText(`击败了 ${op.name}`, W / 2, 160, { fill: "#ffffff", fontSize: 16, ax: 0.5, ay: 0.5 });
          showText(`当前分数: ${stateRef.current.score}`, W / 2, 200, { fill: "#aaaaaa", fontSize: 13, ax: 0.5, ay: 0.5 });
          showText(`剩余HP: ${b.player.hp}/${b.player.maxHp}`, W / 2, 225, { fill: "#aaaaaa", fontSize: 13, ax: 0.5, ay: 0.5 });

          // Unlocked cards
          if (b.unlockedCards.length > 0) {
            showText("解锁卡牌:", W / 2, 260, { fill: PRIMARY, fontSize: 12, ax: 0.5, ay: 0.5 });
            b.unlockedCards.forEach((ci, i) => {
              if (ci < ALL_CARDS.length) {
                showText(ALL_CARDS[ci].name, W / 2, 280 + i * 18, { fill: ALL_CARDS[ci].color, fontSize: 12, ax: 0.5, ay: 0.5 });
              }
            });
          }

          // Next button
          const nextIdx = b.opponentIdx + 1;
          if (nextIdx < OPPONENTS.length) {
            const glow = 0.6 + 0.4 * Math.sin(frameRef.current * 0.08);
            showText(`挑战下一位: ${OPPONENTS[nextIdx].name}`, W / 2, 380, { fill: ACCENT, fontSize: 16, ax: 0.5, ay: 0.5, alpha: glow });
            g.roundRect(W / 2 - 60, 400, 120, 36, 8).fill({ color: cn(ACCENT) });
            showText("继续", W / 2, 418, { fill: "#000000", fontSize: 14, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          }

        } else if (p === "defeat") {
          // ─── Defeat Screen ───────────────────────────────────────────
          showText("战败", W / 2, 150, { fill: "#ff4757", fontSize: 30, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText(`最终分数: ${stateRef.current.score}`, W / 2, 200, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5 });
          showText(`坚持到第 ${b.turn} 回合`, W / 2, 225, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5 });
          showText(`击败 ${b.opponentIdx} 位对手`, W / 2, 250, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5 });

          const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.06);
          showText("点击重新开始", W / 2, 340, { fill: "#ff4757", fontSize: 16, ax: 0.5, ay: 0.5, alpha: glow });

        } else if (p === "gameComplete") {
          // ─── Game Complete Screen ────────────────────────────────────
          const t = frameRef.current * 0.03;
          // Falling particles
          for (let i = 0; i < 20; i++) {
            const px = Math.random() * W;
            const py = (frameRef.current * 0.5 + i * 30) % H;
            const alpha = 0.3 + Math.random() * 0.3;
            g.circle(px, py, 2).fill({ color: 0xffd700, alpha });
          }

          showText("通关", W / 2, 120, { fill: "#ffd700", fontSize: 34, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText("暗影牌局 - 全部击败", W / 2, 160, { fill: PRIMARY, fontSize: 18, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText(`最终分数: ${stateRef.current.score}`, W / 2, 210, { fill: "#ffffff", fontSize: 16, ax: 0.5, ay: 0.5 });

          const diffLabel = stateRef.current.difficulty === "easy" ? "简单" : stateRef.current.difficulty === "normal" ? "普通" : "困难";
          showText(`难度: ${diffLabel}`, W / 2, 240, { fill: "#aaaaaa", fontSize: 13, ax: 0.5, ay: 0.5 });
          showText(`解锁 ${b.unlockedCards.length} 张新卡牌`, W / 2, 265, { fill: "#aaaaaa", fontSize: 13, ax: 0.5, ay: 0.5 });

          const glow = 0.5 + 0.5 * Math.sin(t * 2);
          showText("点击重新开始", W / 2, 380, { fill: ACCENT, fontSize: 16, ax: 0.5, ay: 0.5, alpha: glow });
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
  }, []);


  // ─── Click Handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    };

    const handleClick = (mx: number, my: number) => {
      const p = stateRef.current.phase;
      const b = battleRef.current;

      if (p === "title") {
        setPhase("diffSelect");
        playSound("click");
        return;
      }

      if (p === "diffSelect") {
        const diffs: { d: Difficulty; y: number }[] = [
          { d: "easy", y: 380 },
          { d: "normal", y: 420 },
          { d: "hard", y: 460 },
        ];
        for (const df of diffs) {
          if (mx >= W / 2 - 120 && mx <= W / 2 + 120 && my >= df.y - 18 && my <= df.y + 14) {
            startGame(df.d);
            return;
          }
        }
        return;
      }

      if (p === "selectCard") {
        const cardW = 90, cardH = 130, gap = 8;
        const handLen = b.hand.length;
        const totalW = handLen * (cardW + gap) - gap;
        const startX = (W - totalW) / 2;
        const cardY = 268;

        for (let i = 0; i < handLen; i++) {
          const cx = startX + i * (cardW + gap);
          const isSelected = b.selectedCard === i;
          const yOff = isSelected ? -12 : 0;
          if (mx >= cx && mx <= cx + cardW && my >= cardY + yOff && my <= cardY + yOff + cardH) {
            if (b.selectedCard === i) {
              playCard(i);
            } else {
              b.selectedCard = i;
              playSound("click");
            }
            return;
          }
        }

        const btnY = 410;
        if (b.selectedCard !== null && mx >= W / 2 - 100 && mx <= W / 2 - 10 && my >= btnY && my <= btnY + 32) {
          playCard(b.selectedCard);
          return;
        }

        if (mx >= W / 2 + 10 && mx <= W / 2 + 100 && my >= btnY && my <= btnY + 32) {
          endTurn();
          return;
        }

        b.selectedCard = null;
        return;
      }

      if (p === "victory") {
        if (mx >= W / 2 - 60 && mx <= W / 2 + 60 && my >= 400 && my <= 436) {
          nextOpponent();
          return;
        }
        return;
      }

      if (p === "defeat" || p === "gameComplete") {
        setPhase("title");
        playSound("click");
        return;
      }
    };

    const onClick = (e: MouseEvent) => {
      const { x, y } = getPos(e);
      handleClick(x, y);
    };

    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const { x, y } = getPos(e.changedTouches[0]);
      handleClick(x, y);
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchend", onTouch);
    };
  }, [phase, startGame, playCard, endTurn, nextOpponent, playSound]);

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
        {/* Nav */}
        <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回
        </Link>

        {/* Title bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers size={24} className="text-[#a55eea]" />
            <h1 className="text-xl font-bold">暗影牌局</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800">NC-17</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-white/10 transition" title={muted ? "取消静音" : "静音"}>
              {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
            </button>
            {(phase !== "title" && phase !== "diffSelect") && (
              <button onClick={() => setPhase("title")} className="p-2 rounded-lg hover:bg-white/10 transition" title="重新开始">
                <RotateCcw size={18} className="text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full max-w-[480px] mx-auto rounded-lg border border-white/10 cursor-pointer"
        />

        {/* Score display */}
        {phase !== "title" && phase !== "diffSelect" && (
          <div className="flex items-center justify-center gap-4 mt-3 text-sm">
            <span className="text-[#ffd700]">
              <Trophy size={14} className="inline mr-1" />
              分数: {score}
            </span>
            <span className="text-gray-500">
              对手: {battleRef.current.opponentIdx + 1}/{OPPONENTS.length}
            </span>
          </div>
        )}

        {/* Save/Load & Leaderboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </div>
    </div>
  );
}
