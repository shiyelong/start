"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, RotateCcw, Layers, Play, Volume2, VolumeX,
  Swords, Shield, Star, Zap
} from "lucide-react";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

/* ========== 常量 ========== */
const GAME_ID = "card-battle";
const W = 800, H = 600;
const PLAYER_MAX_HP = 30;
const MANA_PER_TURN = 5;
const DECK_SIZE = 10;
const HAND_SIZE = 5;
const DRAW_PER_TURN = 1;

/* ========== 类型 ========== */
type CardType = "attack" | "defense" | "magic" | "special";
type Rarity = "common" | "rare" | "legendary";
type Difficulty = "easy" | "normal" | "hard";
type GameScreen = "title" | "collection" | "deckEdit" | "diffSelect" | "battle" | "result";
type BattleTurn = "player" | "enemy";

const TYPE_LABELS: Record<CardType, string> = { attack: "攻击", defense: "防御", magic: "魔法", special: "特殊" };
const TYPE_COLORS: Record<CardType, string> = { attack: "#ff4757", defense: "#3ea6ff", magic: "#a55eea", special: "#ffa502" };
const RARITY_LABELS: Record<Rarity, string> = { common: "普通", rare: "稀有", legendary: "传说" };
const RARITY_COLORS: Record<Rarity, string> = { common: "#888", rare: "#3ea6ff", legendary: "#ffd700" };
const DIFF_LABELS: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };

interface CardDef {
  id: number; name: string; type: CardType; rarity: Rarity;
  atk: number; def: number; cost: number; effect: string; effectDesc: string;
}

interface BattleCard extends CardDef { uid: number; }

/* ========== 卡牌数据库 (20张) ========== */
const ALL_CARDS: CardDef[] = [
  // 攻击 (6)
  { id: 1, name: "烈焰斩", type: "attack", rarity: "common", atk: 4, def: 0, cost: 2, effect: "none", effectDesc: "造成4点伤害" },
  { id: 2, name: "雷霆一击", type: "attack", rarity: "common", atk: 3, def: 1, cost: 2, effect: "none", effectDesc: "造成3点伤害，1点护甲" },
  { id: 3, name: "暗影突袭", type: "attack", rarity: "rare", atk: 6, def: 0, cost: 3, effect: "pierce", effectDesc: "造成6点伤害，无视护甲" },
  { id: 4, name: "龙息", type: "attack", rarity: "legendary", atk: 8, def: 0, cost: 4, effect: "burn", effectDesc: "造成8点伤害，灼烧2回合" },
  { id: 5, name: "连环斩", type: "attack", rarity: "rare", atk: 3, def: 0, cost: 2, effect: "double", effectDesc: "攻击两次，每次3点" },
  { id: 6, name: "致命一击", type: "attack", rarity: "common", atk: 5, def: 0, cost: 3, effect: "none", effectDesc: "造成5点伤害" },
  // 防御 (5)
  { id: 7, name: "铁壁", type: "defense", rarity: "common", atk: 0, def: 5, cost: 2, effect: "none", effectDesc: "获得5点护甲" },
  { id: 8, name: "圣盾", type: "defense", rarity: "rare", atk: 0, def: 4, cost: 2, effect: "heal2", effectDesc: "获得4点护甲，恢复2点生命" },
  { id: 9, name: "荆棘甲", type: "defense", rarity: "rare", atk: 2, def: 4, cost: 3, effect: "thorns", effectDesc: "获得4点护甲，反弹2点伤害" },
  { id: 10, name: "不动如山", type: "defense", rarity: "legendary", atk: 0, def: 8, cost: 4, effect: "immune", effectDesc: "获得8点护甲，本回合免疫" },
  { id: 11, name: "格挡", type: "defense", rarity: "common", atk: 0, def: 3, cost: 1, effect: "none", effectDesc: "获得3点护甲" },
  // 魔法 (5)
  { id: 12, name: "治愈术", type: "magic", rarity: "common", atk: 0, def: 0, cost: 2, effect: "heal4", effectDesc: "恢复4点生命" },
  { id: 13, name: "魔力涌动", type: "magic", rarity: "rare", atk: 0, def: 0, cost: 1, effect: "mana2", effectDesc: "获得2点额外魔力" },
  { id: 14, name: "冰霜新星", type: "magic", rarity: "rare", atk: 3, def: 2, cost: 3, effect: "freeze", effectDesc: "造成3点伤害，冻结敌人1回合" },
  { id: 15, name: "陨石术", type: "magic", rarity: "legendary", atk: 10, def: 0, cost: 5, effect: "none", effectDesc: "造成10点伤害" },
  { id: 16, name: "生命汲取", type: "magic", rarity: "common", atk: 3, def: 0, cost: 2, effect: "drain", effectDesc: "造成3点伤害，恢复等量生命" },
  // 特殊 (4)
  { id: 17, name: "命运之轮", type: "special", rarity: "rare", atk: 0, def: 0, cost: 2, effect: "draw2", effectDesc: "抽2张牌" },
  { id: 18, name: "偷梁换柱", type: "special", rarity: "rare", atk: 0, def: 0, cost: 1, effect: "swap", effectDesc: "交换双方护甲值" },
  { id: 19, name: "时光倒流", type: "special", rarity: "legendary", atk: 0, def: 0, cost: 4, effect: "restore", effectDesc: "恢复至上回合状态" },
  { id: 20, name: "虚空之眼", type: "special", rarity: "common", atk: 2, def: 2, cost: 2, effect: "reveal", effectDesc: "造成2点伤害，2点护甲，窥视敌方手牌" },
];

/* ========== 音效引擎 ========== */
class CardSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }
  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
    if (this.muted) return;
    try {
      const c = this.getCtx(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    } catch {}
  }
  playCard() { this.tone(523, 0.1, "triangle"); setTimeout(() => this.tone(659, 0.1, "triangle"), 60); }
  playHit() { this.tone(200, 0.15, "sawtooth", 0.1); this.tone(100, 0.2, "square", 0.08); }
  playHeal() { this.tone(440, 0.1, "sine"); setTimeout(() => this.tone(554, 0.1, "sine"), 80); setTimeout(() => this.tone(659, 0.15, "sine"), 160); }
  playShield() { this.tone(330, 0.15, "triangle"); this.tone(440, 0.1, "triangle"); }
  playDraw() { this.tone(880, 0.06, "sine", 0.08); }
  playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "triangle"), i * 120)); }
  playLose() { [400, 350, 300, 250].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, "sawtooth", 0.08), i * 150)); }
  playClick() { this.tone(660, 0.05, "sine", 0.08); }
  playSpecial() { this.tone(600, 0.08, "sine"); setTimeout(() => this.tone(800, 0.08, "sine"), 50); setTimeout(() => this.tone(1000, 0.12, "sine"), 100); }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}


/* ========== 战斗状态 ========== */
interface BattleState {
  playerHp: number; playerArmor: number; playerMana: number;
  enemyHp: number; enemyArmor: number;
  playerHand: BattleCard[]; enemyHand: BattleCard[];
  playerDeck: BattleCard[]; enemyDeck: BattleCard[];
  turn: BattleTurn; turnNum: number;
  playerBurn: number; enemyBurn: number;
  playerFreeze: number; enemyFreeze: number;
  revealEnemy: boolean;
  log: string[]; selectedCard: number;
  prevState: Partial<BattleState> | null;
  gameOver: boolean; winner: "player" | "enemy" | null;
  animMsg: string; animTimer: number;
  uid: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function makeBattleDeck(cards: CardDef[], startUid: number): { deck: BattleCard[]; nextUid: number } {
  let uid = startUid;
  const deck = shuffleArray(cards).map(c => ({ ...c, uid: uid++ }));
  return { deck, nextUid: uid };
}

function drawFromDeck(deck: BattleCard[], hand: BattleCard[], count: number): { deck: BattleCard[]; hand: BattleCard[] } {
  const d = [...deck], h = [...hand];
  for (let i = 0; i < count && d.length > 0; i++) h.push(d.shift()!);
  return { deck: d, hand: h };
}


/* ========== AI 逻辑 ========== */
function aiSelectCard(hand: BattleCard[], mana: number, diff: Difficulty, enemyHp: number, playerHp: number): number {
  const playable = hand.map((c, i) => ({ c, i })).filter(x => x.c.cost <= mana);
  if (playable.length === 0) return -1;
  if (diff === "easy") return playable[Math.floor(Math.random() * playable.length)].i;
  if (diff === "normal") {
    if (playerHp <= 8) {
      const atks = playable.filter(x => x.c.type === "attack" || x.c.atk > 0);
      if (atks.length > 0) return atks.reduce((a, b) => a.c.atk > b.c.atk ? a : b).i;
    }
    if (enemyHp <= 10) {
      const defs = playable.filter(x => x.c.type === "defense" || x.c.def > 0);
      if (defs.length > 0) return defs.reduce((a, b) => a.c.def > b.c.def ? a : b).i;
    }
    return playable[Math.floor(Math.random() * playable.length)].i;
  }
  let best = playable[0], bestVal = -999;
  for (const p of playable) {
    let val = p.c.atk * 1.5 + p.c.def;
    if (playerHp <= 10 && p.c.atk > 0) val += p.c.atk * 2;
    if (enemyHp <= 10 && p.c.def > 0) val += p.c.def * 2;
    if (p.c.effect === "heal4" || p.c.effect === "heal2") val += (30 - enemyHp) * 0.5;
    if (p.c.effect === "burn") val += 6;
    if (p.c.effect === "freeze") val += 5;
    if (p.c.effect === "pierce") val += 3;
    if (p.c.effect === "double") val += p.c.atk;
    if (p.c.effect === "drain") val += p.c.atk * 0.5;
    if (p.c.rarity === "legendary") val += 3;
    if (val > bestVal) { bestVal = val; best = p; }
  }
  return best.i;
}

function getAIDeck(diff: Difficulty): CardDef[] {
  const pool = [...ALL_CARDS];
  if (diff === "easy") {
    const commons = pool.filter(c => c.rarity === "common");
    const deck: CardDef[] = [];
    while (deck.length < DECK_SIZE) deck.push(commons[Math.floor(Math.random() * commons.length)]);
    return deck;
  }
  if (diff === "normal") {
    const eligible = pool.filter(c => c.rarity !== "legendary");
    const deck: CardDef[] = [];
    while (deck.length < DECK_SIZE) deck.push(eligible[Math.floor(Math.random() * eligible.length)]);
    return deck;
  }
  const sorted = [...pool].sort((a, b) => (b.atk + b.def) - (a.atk + a.def));
  return sorted.slice(0, DECK_SIZE);
}

/* ========== PixiJS 绘制工具 ========== */
function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}

function drawCardPixi(
  g: PixiGraphics, card: CardDef | BattleCard, x: number, y: number, w: number, h: number,
  selected: boolean, dimmed: boolean, faceDown: boolean,
  texts: PixiText[], textIdx: { i: number }
) {
  if (faceDown) {
    // Card back
    g.roundRect(x, y, w, h, 6).fill({ color: 0x1a1a3e });
    g.roundRect(x, y, w, h, 6).stroke({ color: 0x3ea6ff, width: 1 });
    // Pattern dots
    for (let py = y + 8; py < y + h - 8; py += 12) {
      for (let px = x + 8; px < x + w - 8; px += 12) {
        g.rect(px, py, 4, 4).fill({ color: 0x3ea6ff, alpha: 0.12 });
      }
    }
    return;
  }
  // Card background
  g.roundRect(x, y, w, h, 6).fill({ color: 0x1e1e3a });
  // Border
  const borderColor = selected ? 0xffffff : hexToNum(RARITY_COLORS[card.rarity]);
  g.roundRect(x, y, w, h, 6).stroke({ color: borderColor, width: selected ? 2.5 : 1.5 });
  // Legendary glow
  if (card.rarity === "legendary") {
    g.roundRect(x, y, w, h, 6).stroke({ color: 0xffd700, width: 1, alpha: 0.5 });
  }
  // Type color bar
  g.rect(x + 4, y + 4, w - 8, 3).fill({ color: hexToNum(TYPE_COLORS[card.type]) });
  // Cost circle
  g.circle(x + w - 14, y + 16, 10).fill({ color: 0x1a1a4e });
  g.circle(x + w - 14, y + 16, 10).stroke({ color: 0xa55eea, width: 1.5 });

  // Cost text
  if (textIdx.i < texts.length) {
    const t = texts[textIdx.i++];
    t.text = `${card.cost}`; t.style.fontSize = 11; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
    t.anchor.set(0.5, 0.5); t.x = x + w - 14; t.y = y + 16; t.visible = true;
  }
  // Name
  if (textIdx.i < texts.length) {
    const t = texts[textIdx.i++];
    t.text = card.name; t.style.fontSize = 11; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
    t.anchor.set(0, 0); t.x = x + 6; t.y = y + 11; t.visible = true;
  }
  // Type label
  if (textIdx.i < texts.length) {
    const t = texts[textIdx.i++];
    t.text = TYPE_LABELS[card.type]; t.style.fontSize = 9; t.style.fontWeight = "normal"; t.style.fill = hexToNum(TYPE_COLORS[card.type]);
    t.anchor.set(0, 0); t.x = x + 6; t.y = y + 28; t.visible = true;
  }
  // Rarity label
  if (textIdx.i < texts.length) {
    const t = texts[textIdx.i++];
    t.text = RARITY_LABELS[card.rarity]; t.style.fontSize = 9; t.style.fontWeight = "normal"; t.style.fill = hexToNum(RARITY_COLORS[card.rarity]);
    t.anchor.set(1, 0); t.x = x + w - 6; t.y = y + 28; t.visible = true;
  }
  // Stats
  const sy = y + 40;
  if (card.atk > 0) {
    if (textIdx.i < texts.length) {
      const t = texts[textIdx.i++];
      t.text = `${card.atk}`; t.style.fontSize = 16; t.style.fontWeight = "bold"; t.style.fill = 0xff4757;
      t.anchor.set(0.5, 0); t.x = x + w * 0.3; t.y = sy + 2; t.visible = true;
    }
    if (textIdx.i < texts.length) {
      const t = texts[textIdx.i++];
      t.text = "攻击"; t.style.fontSize = 8; t.style.fontWeight = "normal"; t.style.fill = 0xff4757;
      t.anchor.set(0.5, 0); t.x = x + w * 0.3; t.y = sy + 20; t.visible = true; t.alpha = 0.6;
    }
  }
  if (card.def > 0) {
    if (textIdx.i < texts.length) {
      const t = texts[textIdx.i++];
      t.text = `${card.def}`; t.style.fontSize = 16; t.style.fontWeight = "bold"; t.style.fill = 0x3ea6ff;
      t.anchor.set(0.5, 0); t.x = x + w * 0.7; t.y = sy + 2; t.visible = true;
    }
    if (textIdx.i < texts.length) {
      const t = texts[textIdx.i++];
      t.text = "防御"; t.style.fontSize = 8; t.style.fontWeight = "normal"; t.style.fill = 0x3ea6ff;
      t.anchor.set(0.5, 0); t.x = x + w * 0.7; t.y = sy + 20; t.visible = true; t.alpha = 0.6;
    }
  }
  // Effect description
  const desc = card.effectDesc;
  if (desc.length > 10) {
    if (textIdx.i < texts.length) {
      const t = texts[textIdx.i++];
      t.text = desc.slice(0, 10); t.style.fontSize = 8; t.style.fontWeight = "normal"; t.style.fill = 0xaaaaaa;
      t.anchor.set(0.5, 0); t.x = x + w / 2; t.y = sy + 36; t.visible = true; t.alpha = 1;
    }
    if (textIdx.i < texts.length) {
      const t = texts[textIdx.i++];
      t.text = desc.slice(10); t.style.fontSize = 8; t.style.fontWeight = "normal"; t.style.fill = 0xaaaaaa;
      t.anchor.set(0.5, 0); t.x = x + w / 2; t.y = sy + 46; t.visible = true; t.alpha = 1;
    }
  } else {
    if (textIdx.i < texts.length) {
      const t = texts[textIdx.i++];
      t.text = desc; t.style.fontSize = 8; t.style.fontWeight = "normal"; t.style.fill = 0xaaaaaa;
      t.anchor.set(0.5, 0); t.x = x + w / 2; t.y = sy + 41; t.visible = true; t.alpha = 1;
    }
  }
  // Dimmed overlay
  if (dimmed) {
    g.roundRect(x, y, w, h, 6).fill({ color: 0x000000, alpha: 0.55 });
    if (textIdx.i < texts.length) {
      const t = texts[textIdx.i++];
      t.text = "魔力不足"; t.style.fontSize = 9; t.style.fontWeight = "bold"; t.style.fill = 0xff4757;
      t.anchor.set(0.5, 0.5); t.x = x + w / 2; t.y = y + h / 2; t.visible = true; t.alpha = 1;
    }
  }
}

function drawHpBarPixi(
  g: PixiGraphics, x: number, y: number, w: number, h: number,
  hp: number, maxHp: number, color: number,
  texts: PixiText[], textIdx: { i: number }
) {
  g.roundRect(x, y, w, h, 3).fill({ color: 0x222222 });
  const ratio = Math.max(0, hp / maxHp);
  if (ratio > 0) {
    g.roundRect(x, y, w * ratio, h, 3).fill({ color });
  }
  if (textIdx.i < texts.length) {
    const t = texts[textIdx.i++];
    t.text = `${Math.max(0, hp)}/${maxHp}`; t.style.fontSize = 10; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
    t.anchor.set(0.5, 0.5); t.x = x + w / 2; t.y = y + h / 2; t.visible = true; t.alpha = 1;
  }
}


/* ========== 主组件 ========== */
export default function CardBattlePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<GameScreen>("title");
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [collection, setCollection] = useState<number[]>(() => ALL_CARDS.map(c => c.id));
  const [playerDeckIds, setPlayerDeckIds] = useState<number[]>(() => ALL_CARDS.slice(0, DECK_SIZE).map(c => c.id));
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);

  const soundRef = useRef<CardSoundEngine | null>(null);
  const battleRef = useRef<BattleState | null>(null);
  const screenRef = useRef(screen);
  const scoreRef = useRef(score);
  const difficultyRef = useRef(difficulty);

  // Keep refs in sync
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  // Init sound
  useEffect(() => {
    soundRef.current = new CardSoundEngine();
    return () => { soundRef.current?.dispose(); };
  }, []);

  // Load saved progress
  useEffect(() => {
    try {
      const saved = localStorage.getItem("card-battle-progress");
      if (saved) {
        const d = JSON.parse(saved);
        if (d.collection) setCollection(d.collection);
        if (d.deckIds) setPlayerDeckIds(d.deckIds);
        if (d.wins) setWins(d.wins);
        if (d.losses) setLosses(d.losses);
      }
    } catch {}
  }, []);

  const saveProgress = useCallback(() => {
    try {
      localStorage.setItem("card-battle-progress", JSON.stringify({
        collection, deckIds: playerDeckIds, wins, losses
      }));
    } catch {}
  }, [collection, playerDeckIds, wins, losses]);

  useEffect(() => { saveProgress(); }, [saveProgress]);

  /* ========== 战斗初始化 ========== */
  const startBattle = useCallback((diff: Difficulty) => {
    const playerCards = playerDeckIds.map(id => ALL_CARDS.find(c => c.id === id)!);
    const enemyCards = getAIDeck(diff);
    const { deck: pDeck, nextUid: u1 } = makeBattleDeck(playerCards, 1);
    const { deck: eDeck, nextUid: u2 } = makeBattleDeck(enemyCards, u1);
    const { deck: pd2, hand: ph } = drawFromDeck(pDeck, [], HAND_SIZE);
    const { deck: ed2, hand: eh } = drawFromDeck(eDeck, [], HAND_SIZE);
    battleRef.current = {
      playerHp: PLAYER_MAX_HP, playerArmor: 0, playerMana: MANA_PER_TURN,
      enemyHp: PLAYER_MAX_HP, enemyArmor: 0,
      playerHand: ph, enemyHand: eh, playerDeck: pd2, enemyDeck: ed2,
      turn: "player", turnNum: 1,
      playerBurn: 0, enemyBurn: 0, playerFreeze: 0, enemyFreeze: 0,
      revealEnemy: false,
      log: ["对战开始! 选择一张牌出牌"], selectedCard: -1,
      prevState: null, gameOver: false, winner: null,
      animMsg: "", animTimer: 0, uid: u2,
    };
    setDifficulty(diff);
    setScore(0);
    setScreen("battle");
    soundRef.current?.playClick();
  }, [playerDeckIds]);


  /* ========== 出牌逻辑 ========== */
  const applyCardEffect = useCallback((card: BattleCard, isPlayer: boolean, state: BattleState): string[] => {
    const msgs: string[] = [];
    const attacker = isPlayer ? "你" : "对手";
    const defender = isPlayer ? "对手" : "你";
    const atkTarget = isPlayer ? "enemy" : "player";
    const dmg = card.atk;
    const armor = card.def;

    // Apply damage
    if (dmg > 0) {
      if (card.effect === "double") {
        for (let i = 0; i < 2; i++) {
          let actualDmg = dmg;
          if (atkTarget === "enemy") {
            const blocked = Math.min(state.enemyArmor, actualDmg);
            state.enemyArmor -= blocked; actualDmg -= blocked;
            state.enemyHp -= actualDmg;
          } else {
            const blocked = Math.min(state.playerArmor, actualDmg);
            state.playerArmor -= blocked; actualDmg -= blocked;
            state.playerHp -= actualDmg;
          }
        }
        msgs.push(`${attacker}使用${card.name}，攻击两次!`);
      } else {
        let actualDmg = dmg;
        if (card.effect === "pierce") {
          if (atkTarget === "enemy") state.enemyHp -= actualDmg;
          else state.playerHp -= actualDmg;
          msgs.push(`${attacker}使用${card.name}，无视护甲造成${actualDmg}点伤害!`);
        } else {
          if (atkTarget === "enemy") {
            const blocked = Math.min(state.enemyArmor, actualDmg);
            state.enemyArmor -= blocked; actualDmg -= blocked;
            state.enemyHp -= actualDmg;
          } else {
            const blocked = Math.min(state.playerArmor, actualDmg);
            state.playerArmor -= blocked; actualDmg -= blocked;
            state.playerHp -= actualDmg;
          }
          msgs.push(`${attacker}使用${card.name}，造成${actualDmg}点伤害`);
        }
      }
      if (card.effect === "drain") {
        const heal = Math.min(dmg, isPlayer ? (PLAYER_MAX_HP - state.playerHp) : (PLAYER_MAX_HP - state.enemyHp));
        if (isPlayer) state.playerHp += heal; else state.enemyHp += heal;
        if (heal > 0) msgs.push(`${attacker}汲取了${heal}点生命`);
      }
    }

    if (armor > 0) {
      if (isPlayer) state.playerArmor += armor; else state.enemyArmor += armor;
      msgs.push(`${attacker}获得${armor}点护甲`);
    }

    switch (card.effect) {
      case "burn":
        if (isPlayer) state.enemyBurn += 2; else state.playerBurn += 2;
        msgs.push(`${defender}被灼烧! 持续2回合`);
        break;
      case "freeze":
        if (isPlayer) state.enemyFreeze += 1; else state.playerFreeze += 1;
        msgs.push(`${defender}被冻结! 下回合无法行动`);
        break;
      case "heal2":
        if (isPlayer) state.playerHp = Math.min(PLAYER_MAX_HP, state.playerHp + 2);
        else state.enemyHp = Math.min(PLAYER_MAX_HP, state.enemyHp + 2);
        msgs.push(`${attacker}恢复2点生命`);
        break;
      case "heal4":
        if (isPlayer) state.playerHp = Math.min(PLAYER_MAX_HP, state.playerHp + 4);
        else state.enemyHp = Math.min(PLAYER_MAX_HP, state.enemyHp + 4);
        msgs.push(`${attacker}恢复4点生命`);
        break;
      case "mana2":
        if (isPlayer) state.playerMana += 2;
        msgs.push(`${attacker}获得2点额外魔力`);
        break;
      case "thorns": {
        const thornDmg = 2;
        if (isPlayer) state.enemyHp -= thornDmg; else state.playerHp -= thornDmg;
        msgs.push(`荆棘反弹${thornDmg}点伤害!`);
        break;
      }
      case "draw2": {
        if (isPlayer) {
          const r = drawFromDeck(state.playerDeck, state.playerHand, 2);
          state.playerDeck = r.deck; state.playerHand = r.hand;
        } else {
          const r = drawFromDeck(state.enemyDeck, state.enemyHand, 2);
          state.enemyDeck = r.deck; state.enemyHand = r.hand;
        }
        msgs.push(`${attacker}抽了2张牌`);
        break;
      }
      case "swap": {
        const tmp = state.playerArmor;
        state.playerArmor = state.enemyArmor;
        state.enemyArmor = tmp;
        msgs.push("双方护甲值交换!");
        break;
      }
      case "reveal":
        state.revealEnemy = true;
        msgs.push(`${attacker}窥视了${defender}的手牌`);
        break;
      case "immune":
        msgs.push(`${attacker}本回合免疫所有伤害!`);
        break;
    }

    state.playerHp = Math.max(0, Math.min(PLAYER_MAX_HP, state.playerHp));
    state.enemyHp = Math.max(0, Math.min(PLAYER_MAX_HP, state.enemyHp));
    state.playerArmor = Math.max(0, state.playerArmor);
    state.enemyArmor = Math.max(0, state.enemyArmor);

    return msgs;
  }, []);


  const playPlayerCard = useCallback((idx: number) => {
    const s = battleRef.current;
    if (!s || s.gameOver || s.turn !== "player" || s.playerFreeze > 0) return;
    if (idx < 0 || idx >= s.playerHand.length) return;
    const card = s.playerHand[idx];
    if (card.cost > s.playerMana) return;

    s.prevState = {
      playerHp: s.playerHp, playerArmor: s.playerArmor, playerMana: s.playerMana,
      enemyHp: s.enemyHp, enemyArmor: s.enemyArmor,
    };

    s.playerMana -= card.cost;
    s.playerHand = s.playerHand.filter((_, i) => i !== idx);
    const msgs = applyCardEffect(card, true, s);
    s.log = [...msgs.slice(-3)];
    s.animMsg = msgs[0] || ""; s.animTimer = 60;

    if (card.type === "attack") soundRef.current?.playHit();
    else if (card.type === "defense") soundRef.current?.playShield();
    else if (card.type === "magic") soundRef.current?.playSpecial();
    else soundRef.current?.playCard();

    if (s.enemyHp <= 0) {
      s.gameOver = true; s.winner = "player";
      const sc = s.turnNum * 10 + s.playerHp * 5 + (difficulty === "hard" ? 200 : difficulty === "normal" ? 100 : 50);
      setScore(sc);
      setWins(w => w + 1);
      soundRef.current?.playWin();
      const unowned = ALL_CARDS.filter(c => !collection.includes(c.id));
      if (unowned.length > 0) {
        const newCard = unowned[Math.floor(Math.random() * unowned.length)];
        setCollection(prev => [...prev, newCard.id]);
        s.log.push(`解锁新卡牌: ${newCard.name}!`);
      }
      setScreen("result");
      fetchWithAuth("/api/games/scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: sc }),
      }).catch(() => {});
      return;
    }
    if (s.playerHp <= 0) {
      s.gameOver = true; s.winner = "enemy";
      setLosses(l => l + 1);
      soundRef.current?.playLose();
      setScreen("result");
      return;
    }
  }, [applyCardEffect, collection, difficulty]);

  const endPlayerTurn = useCallback(() => {
    const s = battleRef.current;
    if (!s || s.gameOver || s.turn !== "player") return;
    soundRef.current?.playClick();

    if (s.playerBurn > 0) {
      s.playerHp -= 2; s.playerBurn--;
      s.log.push("灼烧造成2点伤害!");
    }

    s.turn = "enemy";
    s.revealEnemy = false;

    if (s.enemyFreeze > 0) {
      s.enemyFreeze--;
      s.log = ["对手被冻结，跳过回合!"];
    } else {
      let aiMana = MANA_PER_TURN + (difficulty === "hard" ? 1 : 0);
      let plays = 0;
      const maxPlays = difficulty === "hard" ? 3 : 2;
      while (plays < maxPlays) {
        const aiIdx = aiSelectCard(s.enemyHand, aiMana, difficulty, s.enemyHp, s.playerHp);
        if (aiIdx < 0) break;
        const aiCard = s.enemyHand[aiIdx];
        aiMana -= aiCard.cost;
        s.enemyHand = s.enemyHand.filter((_, i) => i !== aiIdx);
        const msgs = applyCardEffect(aiCard, false, s);
        s.log = [...msgs.slice(-3)];
        plays++;
        if (s.playerHp <= 0 || s.enemyHp <= 0) break;
      }
      const r = drawFromDeck(s.enemyDeck, s.enemyHand, DRAW_PER_TURN);
      s.enemyDeck = r.deck; s.enemyHand = r.hand;
    }

    if (s.enemyBurn > 0) {
      s.enemyHp -= 2; s.enemyBurn--;
      s.log.push("灼烧对对手造成2点伤害!");
    }

    if (s.playerHp <= 0) {
      s.gameOver = true; s.winner = "enemy";
      setLosses(l => l + 1);
      soundRef.current?.playLose();
      setScreen("result");
      return;
    }
    if (s.enemyHp <= 0) {
      s.gameOver = true; s.winner = "player";
      const sc = s.turnNum * 10 + s.playerHp * 5 + (difficulty === "hard" ? 200 : difficulty === "normal" ? 100 : 50);
      setScore(sc);
      setWins(w => w + 1);
      soundRef.current?.playWin();
      setScreen("result");
      fetchWithAuth("/api/games/scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: sc }),
      }).catch(() => {});
      return;
    }

    s.turn = "player"; s.turnNum++;
    s.playerMana = MANA_PER_TURN;
    s.selectedCard = -1;
    if (s.playerFreeze > 0) {
      s.playerFreeze--;
      s.log = ["你被冻结，本回合无法出牌!"];
    }
    const pr = drawFromDeck(s.playerDeck, s.playerHand, DRAW_PER_TURN);
    s.playerDeck = pr.deck; s.playerHand = pr.hand;
    soundRef.current?.playDraw();
  }, [applyCardEffect, difficulty]);

  const drawExtraCard = useCallback(() => {
    const s = battleRef.current;
    if (!s || s.gameOver || s.turn !== "player") return;
    if (s.playerMana < 1) return;
    s.playerMana -= 1;
    const r = drawFromDeck(s.playerDeck, s.playerHand, 1);
    s.playerDeck = r.deck; s.playerHand = r.hand;
    soundRef.current?.playDraw();
    s.log = ["花费1点魔力抽了1张牌"];
  }, []);


  /* ========== PixiJS 渲染 ========== */
  useEffect(() => {
    if (screen !== "battle" && screen !== "result") return;
    const canvas = canvasRef.current; if (!canvas) return;

    let destroyed = false;
    let app: Application | null = null;
    let g: PixiGraphics | null = null;
    const texts: PixiText[] = [];

    async function init() {
      const pixi = await loadPixi();
      if (destroyed) return;

      app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0a0a1a, antialias: true });
      if (destroyed) { app.destroy(true); return; }

      g = new pixi.Graphics();
      app.stage.addChild(g);

      // Pre-create text pool (80 texts)
      for (let i = 0; i < 80; i++) {
        const t = new pixi.Text({ text: "", style: { fontSize: 12, fill: 0xffffff, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" } });
        t.visible = false;
        app.stage.addChild(t);
        texts.push(t);
      }

      app.ticker.add(() => {
        if (destroyed || !g) return;
        const curScreen = screenRef.current;
        const curScore = scoreRef.current;
        const curDiff = difficultyRef.current;

        g.clear();
        // Hide all texts
        for (const t of texts) { t.visible = false; t.alpha = 1; }
        const textIdx = { i: 0 };

        // Background
        g.rect(0, 0, W, H).fill({ color: 0x0a0a1a });

        const s = battleRef.current;
        if (!s) return;

        // ---- Enemy area (top) ----
        g.roundRect(10, 8, W - 20, 90, 8).fill({ color: 0x12122a });
        g.roundRect(10, 8, W - 20, 90, 8).stroke({ color: 0x333333, width: 1 });

        // Enemy HP label
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = "对手 HP"; t.style.fontSize = 13; t.style.fontWeight = "bold"; t.style.fill = 0xff4757;
          t.anchor.set(0, 0); t.x = 20; t.y = 14; t.visible = true;
        }
        drawHpBarPixi(g, 90, 12, 200, 16, s.enemyHp, PLAYER_MAX_HP, 0xff4757, texts, textIdx);

        // Enemy armor
        if (s.enemyArmor > 0 && textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `护甲: ${s.enemyArmor}`; t.style.fontSize = 12; t.style.fontWeight = "bold"; t.style.fill = 0x3ea6ff;
          t.anchor.set(0, 0); t.x = 300; t.y = 16; t.visible = true;
        }

        // Status effects
        let sx = 400;
        if (s.enemyBurn > 0 && textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `灼烧x${s.enemyBurn}`; t.style.fontSize = 10; t.style.fontWeight = "normal"; t.style.fill = 0xff6b35;
          t.anchor.set(0, 0); t.x = sx; t.y = 16; t.visible = true; sx += 60;
        }
        if (s.enemyFreeze > 0 && textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `冻结x${s.enemyFreeze}`; t.style.fontSize = 10; t.style.fontWeight = "normal"; t.style.fill = 0x00d2ff;
          t.anchor.set(0, 0); t.x = sx; t.y = 16; t.visible = true;
        }

        // Enemy hand
        const eCardW = 50, eCardH = 70;
        const eStartX = (W - s.enemyHand.length * (eCardW + 4)) / 2;
        for (let i = 0; i < s.enemyHand.length; i++) {
          const ex = eStartX + i * (eCardW + 4);
          drawCardPixi(g, s.enemyHand[i], ex, 34, eCardW, eCardH, false, false, !s.revealEnemy, texts, textIdx);
        }

        // ---- Battle log (middle) ----
        g.roundRect(10, 106, W - 20, 50, 6).fill({ color: 0x0d0d20 });
        g.roundRect(10, 106, W - 20, 50, 6).stroke({ color: 0x222222, width: 1 });
        for (let i = 0; i < Math.min(s.log.length, 2); i++) {
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = s.log[s.log.length - 1 - i] || ""; t.style.fontSize = 11; t.style.fontWeight = "normal"; t.style.fill = 0xcccccc;
            t.anchor.set(0.5, 0); t.x = W / 2; t.y = 112 + i * 16; t.visible = true;
          }
        }

        // Anim message
        if (s.animTimer > 0) {
          s.animTimer--;
          const alpha = Math.min(1, s.animTimer / 30);
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = s.animMsg; t.style.fontSize = 16; t.style.fontWeight = "bold"; t.style.fill = 0xffd700;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = 90 - (60 - s.animTimer) * 0.3;
            t.visible = true; t.alpha = alpha;
          }
        }

        // ---- Turn info ----
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `回合 ${s.turnNum}`; t.style.fontSize = 11; t.style.fontWeight = "normal"; t.style.fill = 0x888888;
          t.anchor.set(0, 0); t.x = 16; t.y = 162; t.visible = true;
        }
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = s.turn === "player" ? "你的回合" : "对手回合";
          t.style.fontSize = 11; t.style.fontWeight = "normal";
          t.style.fill = s.turn === "player" ? 0x3ea6ff : 0xff4757;
          t.anchor.set(0, 0); t.x = 70; t.y = 162; t.visible = true;
        }
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `难度: ${DIFF_LABELS[curDiff]}`; t.style.fontSize = 11; t.style.fontWeight = "normal"; t.style.fill = 0x888888;
          t.anchor.set(0, 0); t.x = W - 100; t.y = 162; t.visible = true;
        }

        // ---- Player hand (bottom) ----
        const cardW = 90, cardH = 120;
        const gap = 6;
        const totalW = s.playerHand.length * (cardW + gap) - gap;
        const startX = Math.max(10, (W - totalW) / 2);
        const cardY = 260;

        for (let i = 0; i < s.playerHand.length; i++) {
          const c = s.playerHand[i];
          const cx = startX + i * (cardW + gap);
          const sel = i === s.selectedCard;
          const dimmed = c.cost > s.playerMana || s.turn !== "player" || s.playerFreeze > 0;
          const yOff = sel ? -12 : 0;
          drawCardPixi(g, c, cx, cardY + yOff, cardW, cardH, sel, dimmed, false, texts, textIdx);
        }

        // ---- Player stats (bottom bar) ----
        g.roundRect(10, 180, W - 20, 70, 8).fill({ color: 0x12122a });
        g.roundRect(10, 180, W - 20, 70, 8).stroke({ color: 0x333333, width: 1 });

        // Player HP label
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = "你 HP"; t.style.fontSize = 13; t.style.fontWeight = "bold"; t.style.fill = 0x3ea6ff;
          t.anchor.set(0, 0); t.x = 20; t.y = 186; t.visible = true;
        }
        drawHpBarPixi(g, 70, 184, 200, 16, s.playerHp, PLAYER_MAX_HP, 0x3ea6ff, texts, textIdx);

        // Player armor
        if (s.playerArmor > 0 && textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `护甲: ${s.playerArmor}`; t.style.fontSize = 12; t.style.fontWeight = "bold"; t.style.fill = 0x3ea6ff;
          t.anchor.set(0, 0); t.x = 280; t.y = 188; t.visible = true;
        }

        // Mana label
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `魔力: ${s.playerMana}/${MANA_PER_TURN}`; t.style.fontSize = 13; t.style.fontWeight = "bold"; t.style.fill = 0xa55eea;
          t.anchor.set(0, 0); t.x = 20; t.y = 210; t.visible = true;
        }
        // Mana dots
        for (let i = 0; i < MANA_PER_TURN; i++) {
          g.circle(120 + i * 18, 218, 6).fill({ color: i < s.playerMana ? 0xa55eea : 0x333333 });
          g.circle(120 + i * 18, 218, 6).stroke({ color: 0x555555, width: 1 });
        }

        // Player status effects
        let psx = 280;
        if (s.playerBurn > 0 && textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `灼烧x${s.playerBurn}`; t.style.fontSize = 10; t.style.fontWeight = "normal"; t.style.fill = 0xff6b35;
          t.anchor.set(0, 0); t.x = psx; t.y = 214; t.visible = true; psx += 60;
        }
        if (s.playerFreeze > 0 && textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `冻结x${s.playerFreeze}`; t.style.fontSize = 10; t.style.fontWeight = "normal"; t.style.fill = 0x00d2ff;
          t.anchor.set(0, 0); t.x = psx; t.y = 214; t.visible = true;
        }

        // Deck count
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `牌库: ${s.playerDeck.length}张`; t.style.fontSize = 10; t.style.fontWeight = "normal"; t.style.fill = 0x666666;
          t.anchor.set(1, 0); t.x = W - 20; t.y = 236; t.visible = true;
        }

        // ---- Action buttons ----
        const btnY = 400;
        // End turn
        g.roundRect(W / 2 - 160, btnY, 100, 36, 6).fill({ color: s.turn === "player" && !s.gameOver ? 0x3ea6ff : 0x333333 });
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = "结束回合"; t.style.fontSize = 13; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
          t.anchor.set(0.5, 0.5); t.x = W / 2 - 110; t.y = btnY + 18; t.visible = true;
        }

        // Play card
        const canPlay = s.turn === "player" && s.selectedCard >= 0 && s.selectedCard < s.playerHand.length && s.playerHand[s.selectedCard].cost <= s.playerMana && s.playerFreeze <= 0;
        g.roundRect(W / 2 - 50, btnY, 100, 36, 6).fill({ color: canPlay ? 0xff4757 : 0x333333 });
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = "出牌"; t.style.fontSize = 13; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
          t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = btnY + 18; t.visible = true;
        }

        // Draw card
        g.roundRect(W / 2 + 60, btnY, 100, 36, 6).fill({ color: s.turn === "player" && s.playerMana >= 1 && s.playerDeck.length > 0 && !s.gameOver ? 0xa55eea : 0x333333 });
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = "抽牌 (1)"; t.style.fontSize = 13; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
          t.anchor.set(0.5, 0.5); t.x = W / 2 + 110; t.y = btnY + 18; t.visible = true;
        }

        // ---- Tooltip for selected card ----
        if (s.selectedCard >= 0 && s.selectedCard < s.playerHand.length) {
          const sc = s.playerHand[s.selectedCard];
          g.roundRect(10, 450, W - 20, 40, 6).fill({ color: 0x1a1a3a });
          g.roundRect(10, 450, W - 20, 40, 6).stroke({ color: hexToNum(TYPE_COLORS[sc.type]), width: 1 });
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = `${sc.name} [${TYPE_LABELS[sc.type]}/${RARITY_LABELS[sc.rarity]}]`;
            t.style.fontSize = 12; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
            t.anchor.set(0, 0.5); t.x = 20; t.y = 465; t.visible = true;
          }
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = sc.effectDesc; t.style.fontSize = 11; t.style.fontWeight = "normal"; t.style.fill = 0xcccccc;
            t.anchor.set(0, 0.5); t.x = 320; t.y = 465; t.visible = true;
          }
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = `消耗: ${sc.cost} 魔力`; t.style.fontSize = 11; t.style.fontWeight = "normal"; t.style.fill = 0xa55eea;
            t.anchor.set(1, 0.5); t.x = W - 20; t.y = 465; t.visible = true;
          }
        }

        // ---- Score display ----
        if (textIdx.i < texts.length) {
          const t = texts[textIdx.i++];
          t.text = `得分: ${curScore}`; t.style.fontSize = 12; t.style.fontWeight = "bold"; t.style.fill = 0xffd700;
          t.anchor.set(1, 0); t.x = W - 16; t.y = 162; t.visible = true;
        }

        // ---- Result overlay ----
        if (curScreen === "result" && s.gameOver) {
          g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.75 });
          const isWin = s.winner === "player";
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = isWin ? "胜利!" : "失败!"; t.style.fontSize = 36; t.style.fontWeight = "bold";
            t.style.fill = isWin ? 0xffd700 : 0xff4757;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = H / 2 - 60; t.visible = true;
          }
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = `得分: ${curScore}`; t.style.fontSize = 20; t.style.fontWeight = "normal"; t.style.fill = 0xffffff;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = H / 2 - 15; t.visible = true;
          }
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = `回合数: ${s.turnNum}  剩余HP: ${Math.max(0, s.playerHp)}`;
            t.style.fontSize = 14; t.style.fontWeight = "normal"; t.style.fill = 0xaaaaaa;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = H / 2 + 15; t.visible = true;
          }
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = `难度: ${DIFF_LABELS[curDiff]}`;
            t.style.fontSize = 14; t.style.fontWeight = "normal"; t.style.fill = 0xaaaaaa;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = H / 2 + 38; t.visible = true;
          }
          // Buttons
          g.roundRect(W / 2 - 130, H / 2 + 60, 120, 40, 8).fill({ color: 0x3ea6ff });
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = "再来一局"; t.style.fontSize = 14; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
            t.anchor.set(0.5, 0.5); t.x = W / 2 - 70; t.y = H / 2 + 80; t.visible = true;
          }
          g.roundRect(W / 2 + 10, H / 2 + 60, 120, 40, 8).fill({ color: 0x333333 });
          g.roundRect(W / 2 + 10, H / 2 + 60, 120, 40, 8).stroke({ color: 0x555555, width: 1 });
          if (textIdx.i < texts.length) {
            const t = texts[textIdx.i++];
            t.text = "返回标题"; t.style.fontSize = 14; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
            t.anchor.set(0.5, 0.5); t.x = W / 2 + 70; t.y = H / 2 + 80; t.visible = true;
          }
        }
      });
    }

    init();

    return () => {
      destroyed = true;
      if (app) { app.destroy(true); app = null; }
    };
  }, [screen]);


  /* ========== Canvas 点击处理 ========== */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ("touches" in e) {
      e.preventDefault();
      const t = e.changedTouches[0];
      clientX = t.clientX; clientY = t.clientY;
    } else {
      clientX = e.clientX; clientY = e.clientY;
    }
    const mx = (clientX - rect.left) * (W / rect.width);
    const my = (clientY - rect.top) * (H / rect.height);
    const s = battleRef.current; if (!s) return;

    // Result screen buttons
    if (screen === "result" && s.gameOver) {
      if (mx >= W / 2 - 130 && mx <= W / 2 - 10 && my >= H / 2 + 60 && my <= H / 2 + 100) {
        startBattle(difficulty); return;
      }
      if (mx >= W / 2 + 10 && mx <= W / 2 + 130 && my >= H / 2 + 60 && my <= H / 2 + 100) {
        setScreen("title"); return;
      }
      return;
    }

    // Card selection
    const cardW = 90, gap = 6;
    const totalW = s.playerHand.length * (cardW + gap) - gap;
    const startX = Math.max(10, (W - totalW) / 2);
    const cardY = 260;
    for (let i = 0; i < s.playerHand.length; i++) {
      const cx = startX + i * (cardW + gap);
      const sel = i === s.selectedCard;
      const yOff = sel ? -12 : 0;
      if (mx >= cx && mx <= cx + cardW && my >= cardY + yOff && my <= cardY + yOff + 120) {
        if (s.selectedCard === i) {
          playPlayerCard(i);
        } else {
          s.selectedCard = i;
          soundRef.current?.playClick();
        }
        return;
      }
    }

    // Button clicks
    const btnY = 400;
    if (mx >= W / 2 - 160 && mx <= W / 2 - 60 && my >= btnY && my <= btnY + 36) {
      endPlayerTurn(); return;
    }
    if (mx >= W / 2 - 50 && mx <= W / 2 + 50 && my >= btnY && my <= btnY + 36) {
      if (s.selectedCard >= 0) playPlayerCard(s.selectedCard); return;
    }
    if (mx >= W / 2 + 60 && mx <= W / 2 + 160 && my >= btnY && my <= btnY + 36) {
      drawExtraCard(); return;
    }

    s.selectedCard = -1;
  }, [screen, difficulty, startBattle, playPlayerCard, endPlayerTurn, drawExtraCard]);

  /* ========== 键盘操作 ========== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== "battle") return;
      const s = battleRef.current; if (!s || s.gameOver) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (idx < s.playerHand.length) {
          if (s.selectedCard === idx) playPlayerCard(idx);
          else { s.selectedCard = idx; soundRef.current?.playClick(); }
        }
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (s.selectedCard >= 0) playPlayerCard(s.selectedCard);
      }
      if (e.key === "e" || e.key === "E") endPlayerTurn();
      if (e.key === "d" || e.key === "D") drawExtraCard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, playPlayerCard, endPlayerTurn, drawExtraCard]);

  /* ========== 存档 ========== */
  const handleSave = useCallback(() => {
    return { collection, deckIds: playerDeckIds, wins, losses, score };
  }, [collection, playerDeckIds, wins, losses, score]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as { collection?: number[]; deckIds?: number[]; wins?: number; losses?: number };
    if (d.collection) setCollection(d.collection);
    if (d.deckIds) setPlayerDeckIds(d.deckIds);
    if (d.wins !== undefined) setWins(d.wins);
    if (d.losses !== undefined) setLosses(d.losses);
    setScreen("title");
  }, []);

  /* ========== 卡组编辑 ========== */
  const toggleDeckCard = useCallback((cardId: number) => {
    setPlayerDeckIds(prev => {
      if (prev.includes(cardId)) {
        if (prev.length <= 5) return prev;
        return prev.filter(id => id !== cardId);
      }
      if (prev.length >= DECK_SIZE) return prev;
      return [...prev, cardId];
    });
    soundRef.current?.playClick();
  }, []);


  /* ========== 渲染 UI ========== */
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center gap-2 mb-4">
          <Layers size={24} className="text-[#3ea6ff]" />
          <h1 className="text-xl font-bold">卡牌对决</h1>
          <button onClick={() => { const m = soundRef.current?.toggleMute(); setMuted(!!m); }} className="ml-auto p-2 rounded-lg hover:bg-white/10">
            {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        {/* ========== 标题画面 ========== */}
        {screen === "title" && (
          <div className="text-center space-y-6">
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-[#1a1a3e] to-[#0f0f0f] p-8 overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="absolute w-1 h-1 bg-[#3ea6ff] rounded-full" style={{
                    left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
                    animation: `pulse ${2 + Math.random() * 3}s infinite`
                  }} />
                ))}
              </div>
              <Swords size={48} className="text-[#3ea6ff] mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-[#3ea6ff] mb-2">卡牌对决</h2>
              <p className="text-gray-400 mb-6">收集卡牌，组建卡组，挑战AI对手</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => setScreen("diffSelect")} className="flex items-center gap-2 px-6 py-3 bg-[#3ea6ff] rounded-xl font-bold hover:bg-[#3ea6ff]/80 transition">
                  <Play size={18} /> 开始对战
                </button>
                <button onClick={() => setScreen("collection")} className="flex items-center gap-2 px-6 py-3 bg-white/10 rounded-xl font-bold hover:bg-white/20 transition">
                  <Star size={18} /> 卡牌图鉴
                </button>
                <button onClick={() => setScreen("deckEdit")} className="flex items-center gap-2 px-6 py-3 bg-white/10 rounded-xl font-bold hover:bg-white/20 transition">
                  <Layers size={18} /> 编辑卡组
                </button>
              </div>
              <div className="mt-6 flex justify-center gap-8 text-sm text-gray-400">
                <span>胜: {wins}</span>
                <span>负: {losses}</span>
                <span>收集: {collection.length}/{ALL_CARDS.length}</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 text-left text-sm text-gray-400 space-y-1">
              <p className="text-[#3ea6ff] font-bold mb-2">操作说明</p>
              <p>点击/触摸选择卡牌，再次点击或按空格出牌</p>
              <p>数字键 1-9 快速选牌，E 结束回合，D 抽牌</p>
              <p>每回合 {MANA_PER_TURN} 点魔力，出牌消耗魔力</p>
              <p>双方各 {PLAYER_MAX_HP} 点生命值，先将对方HP降为0者获胜</p>
              <p>胜利后有机会解锁新卡牌</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
              <GameLeaderboard gameId={GAME_ID} />
            </div>
          </div>
        )}

        {/* ========== 难度选择 ========== */}
        {screen === "diffSelect" && (
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-bold">选择难度</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto">
              {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                <button key={d} onClick={() => startBattle(d)}
                  className="rounded-xl border border-white/10 bg-[#1a1a1a] p-6 hover:border-[#3ea6ff] transition text-center">
                  <div className="text-2xl mb-2">
                    {d === "easy" ? <Shield size={32} className="mx-auto text-green-400" /> :
                     d === "normal" ? <Swords size={32} className="mx-auto text-[#3ea6ff]" /> :
                     <Zap size={32} className="mx-auto text-red-400" />}
                  </div>
                  <div className="font-bold text-lg">{DIFF_LABELS[d]}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {d === "easy" ? "AI使用普通卡牌" : d === "normal" ? "AI使用稀有卡牌" : "AI使用最强卡牌+额外魔力"}
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setScreen("title")} className="text-gray-400 hover:text-white text-sm">
              <ChevronLeft size={14} className="inline" /> 返回
            </button>
          </div>
        )}

        {/* ========== 卡牌图鉴 ========== */}
        {screen === "collection" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">卡牌图鉴 ({collection.length}/{ALL_CARDS.length})</h2>
              <button onClick={() => setScreen("title")} className="text-gray-400 hover:text-white text-sm">
                <ChevronLeft size={14} className="inline" /> 返回
              </button>
            </div>
            {(["attack", "defense", "magic", "special"] as CardType[]).map(type => (
              <div key={type}>
                <h3 className="text-sm font-bold mb-2" style={{ color: TYPE_COLORS[type] }}>
                  {TYPE_LABELS[type]}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {ALL_CARDS.filter(c => c.type === type).map(card => {
                    const owned = collection.includes(card.id);
                    return (
                      <div key={card.id} className={`rounded-xl border p-3 transition ${owned ? "border-white/20 bg-[#1a1a2e]" : "border-white/5 bg-[#111] opacity-40"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold" style={{ color: RARITY_COLORS[card.rarity] }}>{RARITY_LABELS[card.rarity]}</span>
                          <span className="text-xs text-[#a55eea]">消耗:{card.cost}</span>
                        </div>
                        <div className="font-bold text-sm mb-1">{card.name}</div>
                        <div className="flex gap-3 text-xs mb-1">
                          {card.atk > 0 && <span className="text-[#ff4757]">攻击:{card.atk}</span>}
                          {card.def > 0 && <span className="text-[#3ea6ff]">防御:{card.def}</span>}
                        </div>
                        <div className="text-xs text-gray-500">{card.effectDesc}</div>
                        {!owned && <div className="text-xs text-gray-600 mt-1">未解锁</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ========== 卡组编辑 ========== */}
        {screen === "deckEdit" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">编辑卡组 ({playerDeckIds.length}/{DECK_SIZE})</h2>
              <button onClick={() => setScreen("title")} className="text-gray-400 hover:text-white text-sm">
                <ChevronLeft size={14} className="inline" /> 返回
              </button>
            </div>
            <p className="text-sm text-gray-400">从已收集的卡牌中选择 {DECK_SIZE} 张组成你的卡组 (最少5张)</p>

            <div className="rounded-xl border border-[#3ea6ff]/30 bg-[#1a1a2e] p-4">
              <h3 className="text-sm font-bold text-[#3ea6ff] mb-2">当前卡组</h3>
              <div className="flex flex-wrap gap-2">
                {playerDeckIds.map(id => {
                  const card = ALL_CARDS.find(c => c.id === id);
                  if (!card) return null;
                  return (
                    <button key={id} onClick={() => toggleDeckCard(id)}
                      className="px-2 py-1 rounded-lg text-xs border transition hover:border-red-500"
                      style={{ borderColor: TYPE_COLORS[card.type] + "60", backgroundColor: TYPE_COLORS[card.type] + "15" }}>
                      {card.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {ALL_CARDS.filter(c => collection.includes(c.id)).map(card => {
                const inDeck = playerDeckIds.includes(card.id);
                return (
                  <button key={card.id} onClick={() => toggleDeckCard(card.id)}
                    className={`rounded-xl border p-3 text-left transition ${inDeck ? "border-[#3ea6ff] bg-[#1a1a3e]" : "border-white/10 bg-[#1a1a1a] hover:border-white/30"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: RARITY_COLORS[card.rarity] }}>{RARITY_LABELS[card.rarity]}</span>
                      {inDeck && <span className="text-[10px] text-[#3ea6ff] font-bold">已选</span>}
                    </div>
                    <div className="font-bold text-sm">{card.name}</div>
                    <div className="flex gap-2 text-xs mt-1">
                      {card.atk > 0 && <span className="text-[#ff4757]">攻:{card.atk}</span>}
                      {card.def > 0 && <span className="text-[#3ea6ff]">防:{card.def}</span>}
                      <span className="text-[#a55eea]">耗:{card.cost}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">{card.effectDesc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ========== 对战画面 (PixiJS Canvas) ========== */}
        {(screen === "battle" || screen === "result") && (
          <div className="space-y-4">
            <canvas
              ref={canvasRef}
              className="w-full max-w-[800px] mx-auto rounded-xl border border-white/10 cursor-pointer touch-none"
              style={{ aspectRatio: `${W}/${H}` }}
              onClick={handleCanvasClick}
              onTouchEnd={handleCanvasClick}
            />
            <div className="flex flex-wrap gap-2 justify-center">
              <button onClick={() => startBattle(difficulty)} className="flex items-center gap-1 px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20">
                <RotateCcw size={14} /> 重新开始
              </button>
              <button onClick={() => setScreen("title")} className="flex items-center gap-1 px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20">
                <ChevronLeft size={14} /> 返回标题
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
              <GameLeaderboard gameId={GAME_ID} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
