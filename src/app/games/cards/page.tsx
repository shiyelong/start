"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, RotateCcw, Layers, Play, Trophy, Volume2, VolumeX,
  Swords, Shield, Sparkles, Star, Zap, Heart, Target, Eye
} from "lucide-react";

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
    // Prefer attack if player low HP, defense if self low HP
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
  // Hard: maximize value
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
  // AI gets a deck based on difficulty
  const pool = [...ALL_CARDS];
  if (diff === "easy") {
    // Only common cards
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
  // Hard: best cards
  const sorted = [...pool].sort((a, b) => (b.atk + b.def) - (a.atk + a.def));
  return sorted.slice(0, DECK_SIZE);
}

/* ========== Canvas 绘制工具 ========== */
function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawCardOnCanvas(ctx: CanvasRenderingContext2D, card: CardDef | BattleCard, x: number, y: number, w: number, h: number, selected: boolean, dimmed: boolean, faceDown: boolean) {
  if (faceDown) {
    drawRoundRect(ctx, x, y, w, h, 6);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, "#1a1a3e"); grad.addColorStop(1, "#0a0a2e");
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = "#3ea6ff"; ctx.lineWidth = 1; ctx.stroke();
    // Pattern
    ctx.fillStyle = "#3ea6ff20";
    for (let py = y + 8; py < y + h - 8; py += 12) {
      for (let px = x + 8; px < x + w - 8; px += 12) {
        ctx.fillRect(px, py, 4, 4);
      }
    }
    return;
  }
  // Card background gradient
  drawRoundRect(ctx, x, y, w, h, 6);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#1e1e3a"); grad.addColorStop(1, "#0e0e1e");
  ctx.fillStyle = grad; ctx.fill();
  // Border
  const borderColor = selected ? "#fff" : RARITY_COLORS[card.rarity];
  ctx.strokeStyle = borderColor; ctx.lineWidth = selected ? 2.5 : 1.5; ctx.stroke();
  // Rarity glow for legendary
  if (card.rarity === "legendary") {
    ctx.shadowColor = "#ffd700"; ctx.shadowBlur = 8;
    ctx.strokeStyle = "#ffd70080"; ctx.lineWidth = 1; ctx.stroke();
    ctx.shadowBlur = 0;
  }
  // Type color bar at top
  ctx.fillStyle = TYPE_COLORS[card.type]; ctx.fillRect(x + 4, y + 4, w - 8, 3);
  // Cost circle
  ctx.beginPath(); ctx.arc(x + w - 14, y + 16, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a4e"; ctx.fill();
  ctx.strokeStyle = "#a55eea"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`${card.cost}`, x + w - 14, y + 16);
  // Name
  ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const nameW = w - 34;
  ctx.save(); ctx.beginPath(); ctx.rect(x + 6, y + 10, nameW, 16); ctx.clip();
  ctx.fillText(card.name, x + 6, y + 11);
  ctx.restore();
  // Type label
  ctx.fillStyle = TYPE_COLORS[card.type]; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(TYPE_LABELS[card.type], x + 6, y + 28);
  // Rarity label
  ctx.fillStyle = RARITY_COLORS[card.rarity]; ctx.textAlign = "right";
  ctx.fillText(RARITY_LABELS[card.rarity], x + w - 6, y + 28);
  // Stats area
  const sy = y + 40;
  if (card.atk > 0) {
    ctx.fillStyle = "#ff4757"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`${card.atk}`, x + w * 0.3, sy + 10);
    ctx.fillStyle = "#ff475799"; ctx.font = "8px sans-serif";
    ctx.fillText("攻击", x + w * 0.3, sy + 24);
  }
  if (card.def > 0) {
    ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`${card.def}`, x + w * 0.7, sy + 10);
    ctx.fillStyle = "#3ea6ff99"; ctx.font = "8px sans-serif";
    ctx.fillText("防御", x + w * 0.7, sy + 24);
  }
  // Effect description
  ctx.fillStyle = "#aaa"; ctx.font = "8px sans-serif"; ctx.textAlign = "center";
  const desc = card.effectDesc;
  if (desc.length > 10) {
    ctx.fillText(desc.slice(0, 10), x + w / 2, sy + 40);
    ctx.fillText(desc.slice(10), x + w / 2, sy + 50);
  } else {
    ctx.fillText(desc, x + w / 2, sy + 45);
  }
  // Dimmed overlay
  if (dimmed) {
    drawRoundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fill();
    ctx.fillStyle = "#ff4757"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("魔力不足", x + w / 2, y + h / 2);
  }
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hp: number, maxHp: number, color: string) {
  drawRoundRect(ctx, x, y, w, h, 3);
  ctx.fillStyle = "#222"; ctx.fill();
  const ratio = Math.max(0, hp / maxHp);
  if (ratio > 0) {
    drawRoundRect(ctx, x, y, w * ratio, h, 3);
    ctx.fillStyle = color; ctx.fill();
  }
  ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`${Math.max(0, hp)}/${maxHp}`, x + w / 2, y + h / 2);
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
  const rafRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });

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
    let atkTarget = isPlayer ? "enemy" : "player";
    let dmg = card.atk;
    let armor = card.def;

    // Apply damage
    if (dmg > 0) {
      if (card.effect === "double") {
        // Hit twice — doesn't pierce armor
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
          // Ignore armor
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

    // Apply armor
    if (armor > 0) {
      if (isPlayer) state.playerArmor += armor; else state.enemyArmor += armor;
      msgs.push(`${attacker}获得${armor}点护甲`);
    }

    // Special effects
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
      case "thorns":
        const thornDmg = 2;
        if (isPlayer) state.enemyHp -= thornDmg; else state.playerHp -= thornDmg;
        msgs.push(`荆棘反弹${thornDmg}点伤害!`);
        break;
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

    // Clamp HP
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

    // Save prev state for restore
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

    // Check win
    if (s.enemyHp <= 0) {
      s.gameOver = true; s.winner = "player";
      const sc = s.turnNum * 10 + s.playerHp * 5 + (difficulty === "hard" ? 200 : difficulty === "normal" ? 100 : 50);
      setScore(sc);
      setWins(w => w + 1);
      soundRef.current?.playWin();
      // Unlock new card
      const unowned = ALL_CARDS.filter(c => !collection.includes(c.id));
      if (unowned.length > 0) {
        const newCard = unowned[Math.floor(Math.random() * unowned.length)];
        setCollection(prev => [...prev, newCard.id]);
        s.log.push(`解锁新卡牌: ${newCard.name}!`);
      }
      setScreen("result");
      // Submit score
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

    // Apply burn to player
    if (s.playerBurn > 0) {
      s.playerHp -= 2; s.playerBurn--;
      s.log.push("灼烧造成2点伤害!");
    }

    // Enemy turn
    s.turn = "enemy";
    s.revealEnemy = false;

    // Enemy freeze check
    if (s.enemyFreeze > 0) {
      s.enemyFreeze--;
      s.log = ["对手被冻结，跳过回合!"];
    } else {
      // AI plays cards
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
      // Enemy draw
      const r = drawFromDeck(s.enemyDeck, s.enemyHand, DRAW_PER_TURN);
      s.enemyDeck = r.deck; s.enemyHand = r.hand;
    }

    // Apply burn to enemy
    if (s.enemyBurn > 0) {
      s.enemyHp -= 2; s.enemyBurn--;
      s.log.push("灼烧对对手造成2点伤害!");
    }

    // Check game over
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

    // New player turn
    s.turn = "player"; s.turnNum++;
    s.playerMana = MANA_PER_TURN;
    s.selectedCard = -1;
    // Player freeze check
    if (s.playerFreeze > 0) {
      s.playerFreeze--;
      s.log = ["你被冻结，本回合无法出牌!"];
    }
    // Player draw
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


  /* ========== Canvas 渲染 ========== */
  useEffect(() => {
    if (screen !== "battle" && screen !== "result") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    let frame = 0;
    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#0a0a1a"); bgGrad.addColorStop(1, "#0f0f0f");
      ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
      frame++;

      const s = battleRef.current;
      if (!s) { ctx.restore(); rafRef.current = requestAnimationFrame(render); return; }

      // ---- Enemy area (top) ----
      drawRoundRect(ctx, 10, 8, W - 20, 90, 8);
      ctx.fillStyle = "#12122a"; ctx.fill();
      ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.stroke();

      // Enemy HP
      ctx.fillStyle = "#ff4757"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(`对手 HP`, 20, 14);
      drawHpBar(ctx, 90, 12, 200, 16, s.enemyHp, PLAYER_MAX_HP, "#ff4757");
      // Enemy armor
      if (s.enemyArmor > 0) {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`护甲: ${s.enemyArmor}`, 300, 16);
      }
      // Status effects
      let sx = 400;
      if (s.enemyBurn > 0) { ctx.fillStyle = "#ff6b35"; ctx.font = "10px sans-serif"; ctx.fillText(`灼烧x${s.enemyBurn}`, sx, 16); sx += 60; }
      if (s.enemyFreeze > 0) { ctx.fillStyle = "#00d2ff"; ctx.font = "10px sans-serif"; ctx.fillText(`冻结x${s.enemyFreeze}`, sx, 16); sx += 60; }

      // Enemy hand (face down or revealed)
      const eCardW = 50, eCardH = 70;
      const eStartX = (W - s.enemyHand.length * (eCardW + 4)) / 2;
      for (let i = 0; i < s.enemyHand.length; i++) {
        const ex = eStartX + i * (eCardW + 4);
        drawCardOnCanvas(ctx, s.enemyHand[i], ex, 34, eCardW, eCardH, false, false, !s.revealEnemy);
      }

      // ---- Battle log (middle) ----
      drawRoundRect(ctx, 10, 106, W - 20, 50, 6);
      ctx.fillStyle = "#0d0d20"; ctx.fill();
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#ccc"; ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (let i = 0; i < Math.min(s.log.length, 2); i++) {
        ctx.fillText(s.log[s.log.length - 1 - i] || "", W / 2, 112 + i * 16);
      }

      // Anim message
      if (s.animTimer > 0) {
        s.animTimer--;
        const alpha = Math.min(1, s.animTimer / 30);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffd700"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(s.animMsg, W / 2, 90 - (60 - s.animTimer) * 0.3);
        ctx.globalAlpha = 1;
      }

      // ---- Turn info ----
      ctx.fillStyle = "#888"; ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(`回合 ${s.turnNum}`, 16, 162);
      ctx.fillStyle = s.turn === "player" ? "#3ea6ff" : "#ff4757";
      ctx.fillText(s.turn === "player" ? "你的回合" : "对手回合", 70, 162);
      ctx.fillStyle = "#888";
      ctx.fillText(`难度: ${DIFF_LABELS[difficulty]}`, W - 100, 162);

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
        drawCardOnCanvas(ctx, c, cx, cardY + yOff, cardW, cardH, sel, dimmed, false);
      }

      // ---- Player stats (bottom bar) ----
      drawRoundRect(ctx, 10, 180, W - 20, 70, 8);
      ctx.fillStyle = "#12122a"; ctx.fill();
      ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.stroke();

      // Player HP
      ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(`你 HP`, 20, 186);
      drawHpBar(ctx, 70, 184, 200, 16, s.playerHp, PLAYER_MAX_HP, "#3ea6ff");
      // Player armor
      if (s.playerArmor > 0) {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 12px sans-serif";
        ctx.fillText(`护甲: ${s.playerArmor}`, 280, 188);
      }
      // Mana
      ctx.fillStyle = "#a55eea"; ctx.font = "bold 13px sans-serif";
      ctx.fillText(`魔力: ${s.playerMana}/${MANA_PER_TURN}`, 20, 210);
      // Mana dots
      for (let i = 0; i < MANA_PER_TURN; i++) {
        ctx.beginPath(); ctx.arc(120 + i * 18, 218, 6, 0, Math.PI * 2);
        ctx.fillStyle = i < s.playerMana ? "#a55eea" : "#333"; ctx.fill();
        ctx.strokeStyle = "#555"; ctx.lineWidth = 1; ctx.stroke();
      }
      // Status effects
      let psx = 280;
      if (s.playerBurn > 0) { ctx.fillStyle = "#ff6b35"; ctx.font = "10px sans-serif"; ctx.textAlign = "left"; ctx.fillText(`灼烧x${s.playerBurn}`, psx, 214); psx += 60; }
      if (s.playerFreeze > 0) { ctx.fillStyle = "#00d2ff"; ctx.font = "10px sans-serif"; ctx.fillText(`冻结x${s.playerFreeze}`, psx, 214); psx += 60; }
      // Deck count
      ctx.fillStyle = "#666"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(`牌库: ${s.playerDeck.length}张`, W - 20, 236);

      // ---- Action buttons ----
      const btnY = 400;
      // End turn button
      drawRoundRect(ctx, W / 2 - 160, btnY, 100, 36, 6);
      ctx.fillStyle = s.turn === "player" && !s.gameOver ? "#3ea6ff" : "#333"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("结束回合", W / 2 - 110, btnY + 18);

      // Play card button
      drawRoundRect(ctx, W / 2 - 50, btnY, 100, 36, 6);
      const canPlay = s.turn === "player" && s.selectedCard >= 0 && s.selectedCard < s.playerHand.length && s.playerHand[s.selectedCard].cost <= s.playerMana && s.playerFreeze <= 0;
      ctx.fillStyle = canPlay ? "#ff4757" : "#333"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif";
      ctx.fillText("出牌", W / 2, btnY + 18);

      // Draw card button
      drawRoundRect(ctx, W / 2 + 60, btnY, 100, 36, 6);
      ctx.fillStyle = s.turn === "player" && s.playerMana >= 1 && s.playerDeck.length > 0 && !s.gameOver ? "#a55eea" : "#333"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif";
      ctx.fillText("抽牌 (1)", W / 2 + 110, btnY + 18);

      // ---- Tooltip for selected card ----
      if (s.selectedCard >= 0 && s.selectedCard < s.playerHand.length) {
        const sc = s.playerHand[s.selectedCard];
        drawRoundRect(ctx, 10, 450, W - 20, 40, 6);
        ctx.fillStyle = "#1a1a3a"; ctx.fill();
        ctx.strokeStyle = TYPE_COLORS[sc.type]; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(`${sc.name} [${TYPE_LABELS[sc.type]}/${RARITY_LABELS[sc.rarity]}]`, 20, 465);
        ctx.fillStyle = "#ccc"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(sc.effectDesc, 320, 465);
        ctx.fillStyle = "#a55eea"; ctx.textAlign = "right";
        ctx.fillText(`消耗: ${sc.cost} 魔力`, W - 20, 465);
      }

      // ---- Score display ----
      ctx.fillStyle = "#ffd700"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillText(`得分: ${score}`, W - 16, 162);

      // ---- Result overlay ----
      if (screen === "result" && s.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, W, H);
        const isWin = s.winner === "player";
        ctx.fillStyle = isWin ? "#ffd700" : "#ff4757";
        ctx.font = "bold 36px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(isWin ? "胜利!" : "失败!", W / 2, H / 2 - 60);
        ctx.fillStyle = "#fff"; ctx.font = "20px sans-serif";
        ctx.fillText(`得分: ${score}`, W / 2, H / 2 - 15);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText(`回合数: ${s.turnNum}  剩余HP: ${Math.max(0, s.playerHp)}`, W / 2, H / 2 + 15);
        ctx.fillText(`难度: ${DIFF_LABELS[difficulty]}`, W / 2, H / 2 + 38);
        // Buttons
        drawRoundRect(ctx, W / 2 - 130, H / 2 + 60, 120, 40, 8);
        ctx.fillStyle = "#3ea6ff"; ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif";
        ctx.fillText("再来一局", W / 2 - 70, H / 2 + 80);

        drawRoundRect(ctx, W / 2 + 10, H / 2 + 60, 120, 40, 8);
        ctx.fillStyle = "#333"; ctx.fill(); ctx.strokeStyle = "#555"; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif";
        ctx.fillText("返回标题", W / 2 + 70, H / 2 + 80);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, score, difficulty]);

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
          // Double click = play
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
    // End turn
    if (mx >= W / 2 - 160 && mx <= W / 2 - 60 && my >= btnY && my <= btnY + 36) {
      endPlayerTurn(); return;
    }
    // Play card
    if (mx >= W / 2 - 50 && mx <= W / 2 + 50 && my >= btnY && my <= btnY + 36) {
      if (s.selectedCard >= 0) playPlayerCard(s.selectedCard); return;
    }
    // Draw card
    if (mx >= W / 2 + 60 && mx <= W / 2 + 160 && my >= btnY && my <= btnY + 36) {
      drawExtraCard(); return;
    }

    // Deselect
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
        if (prev.length <= 5) return prev; // Min 5 cards
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

            {/* 操作说明 */}
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

            {/* Current deck */}
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

            {/* Available cards */}
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

        {/* ========== 对战画面 (Canvas) ========== */}
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
