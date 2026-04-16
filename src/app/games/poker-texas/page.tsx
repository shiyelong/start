"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import {
  ChevronLeft,
  Volume2,
  VolumeX,
  Trophy,
  RotateCcw,
  Play,
  CircleDollarSign,
  Hand,
  ArrowUpCircle,
  XCircle,
  CheckCircle,
  Flame,
} from "lucide-react";
import type { Application, Container, Graphics, Text as PixiText } from "pixi.js";

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */
const GAME_ID = "poker-texas";
const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const W = 900;
const H = 600;

const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
const VALUES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
type Suit = (typeof SUITS)[number];
type Value = (typeof VALUES)[number];

interface Card {
  suit: Suit;
  value: Value;
}

type HandRank =
  | "royal-flush"
  | "straight-flush"
  | "four-of-a-kind"
  | "full-house"
  | "flush"
  | "straight"
  | "three-of-a-kind"
  | "two-pair"
  | "one-pair"
  | "high-card";

const HAND_RANK_NAMES: Record<HandRank, string> = {
  "royal-flush": "皇家同花顺",
  "straight-flush": "同花顺",
  "four-of-a-kind": "四条",
  "full-house": "葫芦",
  flush: "同花",
  straight: "顺子",
  "three-of-a-kind": "三条",
  "two-pair": "两对",
  "one-pair": "一对",
  "high-card": "高牌",
};

const HAND_RANK_ORDER: HandRank[] = [
  "high-card",
  "one-pair",
  "two-pair",
  "three-of-a-kind",
  "straight",
  "flush",
  "full-house",
  "four-of-a-kind",
  "straight-flush",
  "royal-flush",
];

interface HandResult {
  rank: HandRank;
  rankIndex: number;
  kickers: number[];
}

type AIPersonality = "tight" | "loose" | "aggressive";

interface Player {
  id: number;
  name: string;
  chips: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  currentBet: number;
  isHuman: boolean;
  personality?: AIPersonality;
  seatAngle: number;
}

type Phase = "preflop" | "flop" | "turn" | "river" | "showdown";
type GameStatus = "idle" | "playing" | "roundEnd";

interface GameState {
  players: Player[];
  communityCards: Card[];
  deck: Card[];
  pot: number;
  currentPlayerIndex: number;
  dealerIndex: number;
  phase: Phase;
  status: GameStatus;
  currentBet: number;
  minRaise: number;
  message: string;
  winner: string;
  winningHand: string;
  roundNumber: number;
  totalScore: number;
}

/* ================================================================== */
/*  Sound Engine                                                       */
/* ================================================================== */
class PokerSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.12) {
    if (this.muted) return;
    try {
      const c = this.getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    } catch { /* ignore */ }
  }

  deal() { this.tone(800, 0.06, "sine", 0.08); setTimeout(() => this.tone(600, 0.05, "sine", 0.06), 40); }
  bet() { this.tone(500, 0.08, "triangle"); setTimeout(() => this.tone(700, 0.06, "triangle"), 50); }
  fold() { this.tone(300, 0.15, "sawtooth", 0.06); }
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "triangle"), i * 100)); }
  check() { this.tone(440, 0.05, "sine", 0.06); }
  allIn() { this.tone(400, 0.1, "square", 0.08); setTimeout(() => this.tone(600, 0.1, "square", 0.08), 80); setTimeout(() => this.tone(900, 0.15, "square", 0.1), 160); }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

/* ================================================================== */
/*  Deck & Card Utilities                                              */
/* ================================================================== */
function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const value of VALUES) deck.push({ suit, value });
  return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function valueToNum(v: Value): number {
  const map: Record<Value, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
  return map[v];
}

/* ================================================================== */
/*  Hand Evaluation                                                    */
/* ================================================================== */
function evaluateHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) return { rank: "high-card", rankIndex: 0, kickers: all.map(c => valueToNum(c.value)).sort((a, b) => b - a) };

  const combos = getCombinations(all, 5);
  let best: HandResult = { rank: "high-card", rankIndex: 0, kickers: [0] };

  for (const combo of combos) {
    const result = evaluate5(combo);
    if (compareHands(result, best) > 0) best = result;
  }
  return best;
}

function getCombinations(arr: Card[], k: number): Card[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const results: Card[][] = [];
  const first = arr[0];
  const rest = arr.slice(1);
  for (const combo of getCombinations(rest, k - 1)) results.push([first, ...combo]);
  for (const combo of getCombinations(rest, k)) results.push(combo);
  return results;
}

function evaluate5(cards: Card[]): HandResult {
  const vals = cards.map(c => valueToNum(c.value)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;
  if (vals[0] - vals[4] === 4 && new Set(vals).size === 5) {
    isStraight = true;
    straightHigh = vals[0];
  }
  // Ace-low straight (A-2-3-4-5)
  if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
    isStraight = true;
    straightHigh = 5;
  }

  // Count values
  const counts: Record<number, number> = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ val: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: "royal-flush", rankIndex: 9, kickers: [14] };
    return { rank: "straight-flush", rankIndex: 8, kickers: [straightHigh] };
  }
  if (groups[0].count === 4) return { rank: "four-of-a-kind", rankIndex: 7, kickers: [groups[0].val, groups[1].val] };
  if (groups[0].count === 3 && groups[1].count === 2) return { rank: "full-house", rankIndex: 6, kickers: [groups[0].val, groups[1].val] };
  if (isFlush) return { rank: "flush", rankIndex: 5, kickers: vals };
  if (isStraight) return { rank: "straight", rankIndex: 4, kickers: [straightHigh] };
  if (groups[0].count === 3) return { rank: "three-of-a-kind", rankIndex: 3, kickers: [groups[0].val, groups[1].val, groups[2].val] };
  if (groups[0].count === 2 && groups[1].count === 2) return { rank: "two-pair", rankIndex: 2, kickers: [Math.max(groups[0].val, groups[1].val), Math.min(groups[0].val, groups[1].val), groups[2].val] };
  if (groups[0].count === 2) return { rank: "one-pair", rankIndex: 1, kickers: [groups[0].val, ...groups.slice(1).map(g => g.val)] };
  return { rank: "high-card", rankIndex: 0, kickers: vals };
}

function compareHands(a: HandResult, b: HandResult): number {
  if (a.rankIndex !== b.rankIndex) return a.rankIndex - b.rankIndex;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

/* ================================================================== */
/*  AI Logic                                                           */
/* ================================================================== */
function aiDecision(
  player: Player,
  communityCards: Card[],
  currentBet: number,
  pot: number,
  minRaise: number,
): { action: "fold" | "call" | "raise" | "check" | "all-in"; amount: number } {
  const toCall = currentBet - player.currentBet;
  const personality = player.personality || "loose";
  const handStrength = communityCards.length >= 3
    ? evaluateHand(player.holeCards, communityCards).rankIndex
    : estimatePreflop(player.holeCards);

  // Random factor
  const r = Math.random();

  if (personality === "tight") {
    // Tight: only plays strong hands
    if (toCall === 0) {
      if (handStrength >= 3 && r < 0.5) return { action: "raise", amount: Math.min(minRaise + BIG_BLIND, player.chips) };
      return { action: "check", amount: 0 };
    }
    if (handStrength < 1 && r < 0.7) return { action: "fold", amount: 0 };
    if (handStrength >= 5 && player.chips <= toCall * 2) return { action: "all-in", amount: player.chips };
    if (handStrength >= 3 && r < 0.4) return { action: "raise", amount: Math.min(toCall + minRaise, player.chips) };
    if (toCall <= player.chips * 0.15 || handStrength >= 1) return { action: "call", amount: toCall };
    return { action: "fold", amount: 0 };
  }

  if (personality === "aggressive") {
    // Aggressive: raises often, bluffs
    if (toCall === 0) {
      if (r < 0.6) return { action: "raise", amount: Math.min(minRaise + BIG_BLIND * 2, player.chips) };
      return { action: "check", amount: 0 };
    }
    if (handStrength >= 4 && r < 0.3) return { action: "all-in", amount: player.chips };
    if (handStrength >= 2 || r < 0.35) return { action: "raise", amount: Math.min(toCall + minRaise * 2, player.chips) };
    if (toCall <= player.chips * 0.3 || r < 0.4) return { action: "call", amount: toCall };
    return { action: "fold", amount: 0 };
  }

  // Loose: calls often, rarely folds
  if (toCall === 0) {
    if (handStrength >= 2 && r < 0.4) return { action: "raise", amount: Math.min(minRaise, player.chips) };
    return { action: "check", amount: 0 };
  }
  if (handStrength >= 5 && r < 0.4) return { action: "all-in", amount: player.chips };
  if (toCall <= player.chips * 0.25 || handStrength >= 1 || r < 0.5) return { action: "call", amount: toCall };
  if (handStrength < 1 && r < 0.4) return { action: "fold", amount: 0 };
  return { action: "call", amount: toCall };
}

function estimatePreflop(cards: Card[]): number {
  if (cards.length < 2) return 0;
  const v1 = valueToNum(cards[0].value);
  const v2 = valueToNum(cards[1].value);
  const paired = v1 === v2;
  const suited = cards[0].suit === cards[1].suit;
  const high = Math.max(v1, v2);
  const gap = Math.abs(v1 - v2);

  if (paired && high >= 10) return 5; // High pair
  if (paired) return 3;
  if (high === 14 && Math.min(v1, v2) >= 10) return 4; // AK, AQ, AJ, AT
  if (suited && gap <= 2 && high >= 10) return 3;
  if (high >= 12 && Math.min(v1, v2) >= 10) return 2;
  if (suited && gap <= 3) return 1;
  if (high >= 10) return 1;
  return 0;
}

/* ================================================================== */
/*  Initial State                                                      */
/* ================================================================== */
function createInitialState(): GameState {
  const players: Player[] = [
    { id: 0, name: "你", chips: STARTING_CHIPS, holeCards: [], folded: false, allIn: false, currentBet: 0, isHuman: true, seatAngle: Math.PI / 2 },
    { id: 1, name: "小明", chips: STARTING_CHIPS, holeCards: [], folded: false, allIn: false, currentBet: 0, isHuman: false, personality: "tight", seatAngle: Math.PI },
    { id: 2, name: "阿强", chips: STARTING_CHIPS, holeCards: [], folded: false, allIn: false, currentBet: 0, isHuman: false, personality: "aggressive", seatAngle: 0 },
    { id: 3, name: "老王", chips: STARTING_CHIPS, holeCards: [], folded: false, allIn: false, currentBet: 0, isHuman: false, personality: "loose", seatAngle: -Math.PI / 2 },
  ];
  return {
    players,
    communityCards: [],
    deck: [],
    pot: 0,
    currentPlayerIndex: 0,
    dealerIndex: 0,
    phase: "preflop",
    status: "idle",
    currentBet: 0,
    minRaise: BIG_BLIND,
    message: "点击开始新一局",
    winner: "",
    winningHand: "",
    roundNumber: 0,
    totalScore: 0,
  };
}

/* ================================================================== */
/*  PixiJS Rendering                                                   */
/* ================================================================== */
let pixiModule: typeof import("pixi.js") | null = null;

function suitColor(suit: Suit): number {
  return suit === "hearts" || suit === "diamonds" ? 0xcc0000 : 0x333333;
}

function drawSuitShape(g: Graphics, suit: Suit, x: number, y: number, size: number) {
  const c = suitColor(suit);
  g.setStrokeStyle({ width: 0 });

  if (suit === "hearts") {
    // Heart shape using circles and triangle
    const r = size * 0.25;
    g.circle(x - r, y - r * 0.3, r).fill({ color: c });
    g.circle(x + r, y - r * 0.3, r).fill({ color: c });
    g.moveTo(x - size * 0.48, y).lineTo(x, y + size * 0.55).lineTo(x + size * 0.48, y).closePath().fill({ color: c });
  } else if (suit === "diamonds") {
    // Diamond shape
    g.moveTo(x, y - size * 0.45).lineTo(x + size * 0.3, y).lineTo(x, y + size * 0.45).lineTo(x - size * 0.3, y).closePath().fill({ color: c });
  } else if (suit === "clubs") {
    // Club shape using circles
    const r = size * 0.2;
    g.circle(x, y - r * 1.2, r).fill({ color: c });
    g.circle(x - r * 1.1, y + r * 0.3, r).fill({ color: c });
    g.circle(x + r * 1.1, y + r * 0.3, r).fill({ color: c });
    g.rect(x - size * 0.06, y + r * 0.2, size * 0.12, size * 0.3).fill({ color: c });
  } else {
    // Spade shape
    const r = size * 0.2;
    g.circle(x - r * 1.1, y + r * 0.1, r).fill({ color: c });
    g.circle(x + r * 1.1, y + r * 0.1, r).fill({ color: c });
    g.moveTo(x - size * 0.42, y + r * 0.3).lineTo(x, y - size * 0.45).lineTo(x + size * 0.42, y + r * 0.3).closePath().fill({ color: c });
    g.rect(x - size * 0.06, y + r * 0.2, size * 0.12, size * 0.3).fill({ color: c });
  }
}

async function renderGame(app: Application, state: GameState) {
  if (!pixiModule) pixiModule = await loadPixi();
  const PIXI = pixiModule;

  // Clear stage
  while (app.stage.children.length > 0) app.stage.removeChildAt(0);

  const stage = app.stage;

  // Green felt background
  const bg = new PIXI.Graphics();
  bg.rect(0, 0, W, H).fill({ color: 0x0d5a2d });
  // Table oval
  bg.ellipse(W / 2, H / 2, W * 0.42, H * 0.38).fill({ color: 0x1a7a3a });
  bg.ellipse(W / 2, H / 2, W * 0.40, H * 0.36).fill({ color: 0x1e8c42 });
  // Table border
  bg.ellipse(W / 2, H / 2, W * 0.43, H * 0.39);
  bg.stroke({ color: 0x8b6914, width: 4 });
  stage.addChild(bg);

  // Community cards
  const ccStartX = W / 2 - (state.communityCards.length * 52) / 2;
  for (let i = 0; i < state.communityCards.length; i++) {
    const card = state.communityCards[i];
    const cx = ccStartX + i * 55 + 25;
    const cy = H / 2 - 10;
    drawCardOnStage(stage, card, cx, cy, 48, 68, false);
  }

  // Pot display
  if (state.pot > 0) {
    const potBg = new PIXI.Graphics();
    potBg.roundRect(W / 2 - 50, H / 2 + 40, 100, 28, 14).fill({ color: 0x000000, alpha: 0.5 });
    stage.addChild(potBg);
    const potText = new PIXI.Text({ text: `底池: ${state.pot}`, style: new PIXI.TextStyle({ fontSize: 13, fill: "#f0b90b", fontFamily: "sans-serif", fontWeight: "bold" }) });
    potText.anchor.set(0.5);
    potText.x = W / 2;
    potText.y = H / 2 + 54;
    stage.addChild(potText);
  }

  // Players
  const positions = [
    { x: W / 2, y: H - 50 },      // Player 0 (human) - bottom
    { x: 80, y: H / 2 },           // Player 1 - left
    { x: W / 2, y: 55 },           // Player 2 - top
    { x: W - 80, y: H / 2 },       // Player 3 - right
  ];

  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const pos = positions[i];
    const isCurrentTurn = state.status === "playing" && state.currentPlayerIndex === i;

    // Player panel background
    const panelW = 120;
    const panelH = 52;
    const panel = new PIXI.Graphics();
    const panelColor = p.folded ? 0x333333 : isCurrentTurn ? 0x3ea6ff : 0x1a1a1a;
    const panelAlpha = p.folded ? 0.4 : 0.85;
    panel.roundRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 10).fill({ color: panelColor, alpha: panelAlpha });
    if (isCurrentTurn) panel.roundRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 10).stroke({ color: 0x3ea6ff, width: 2 });
    if (state.dealerIndex === i) {
      const dealerBadge = new PIXI.Graphics();
      dealerBadge.circle(pos.x + panelW / 2 - 5, pos.y - panelH / 2 + 5, 10).fill({ color: 0xf0b90b });
      stage.addChild(dealerBadge);
      const dText = new PIXI.Text({ text: "D", style: new PIXI.TextStyle({ fontSize: 11, fill: "#000", fontWeight: "bold", fontFamily: "sans-serif" }) });
      dText.anchor.set(0.5);
      dText.x = pos.x + panelW / 2 - 5;
      dText.y = pos.y - panelH / 2 + 5;
      stage.addChild(dText);
    }
    stage.addChild(panel);

    // Name
    const nameText = new PIXI.Text({ text: p.name + (p.folded ? " (弃牌)" : p.allIn ? " (全押)" : ""), style: new PIXI.TextStyle({ fontSize: 11, fill: p.folded ? "#666" : "#fff", fontFamily: "sans-serif", fontWeight: "bold" }) });
    nameText.anchor.set(0.5);
    nameText.x = pos.x;
    nameText.y = pos.y - 12;
    stage.addChild(nameText);

    // Chips
    const chipText = new PIXI.Text({ text: `筹码: ${p.chips}`, style: new PIXI.TextStyle({ fontSize: 10, fill: "#f0b90b", fontFamily: "sans-serif" }) });
    chipText.anchor.set(0.5);
    chipText.x = pos.x;
    chipText.y = pos.y + 4;
    stage.addChild(chipText);

    // Current bet
    if (p.currentBet > 0) {
      const betText = new PIXI.Text({ text: `下注: ${p.currentBet}`, style: new PIXI.TextStyle({ fontSize: 9, fill: "#3ea6ff", fontFamily: "sans-serif" }) });
      betText.anchor.set(0.5);
      betText.x = pos.x;
      betText.y = pos.y + 17;
      stage.addChild(betText);
    }

    // Chip stack visualization (small circles)
    const chipStackX = pos.x + (i === 1 ? 70 : i === 3 ? -70 : 0);
    const chipStackY = pos.y + (i === 0 ? -45 : i === 2 ? 45 : 0);
    if (p.currentBet > 0) {
      const numChips = Math.min(Math.ceil(p.currentBet / 20), 8);
      for (let c = 0; c < numChips; c++) {
        const chip = new PIXI.Graphics();
        chip.circle(chipStackX + (c % 4) * 8 - 12, chipStackY - Math.floor(c / 4) * 4, 5).fill({ color: 0xf0b90b });
        chip.circle(chipStackX + (c % 4) * 8 - 12, chipStackY - Math.floor(c / 4) * 4, 5).stroke({ color: 0xd4a00a, width: 1 });
        stage.addChild(chip);
      }
    }

    // Hole cards
    const cardOffsetY = i === 0 ? -85 : i === 2 ? 50 : 0;
    const cardOffsetX = i === 1 ? 70 : i === 3 ? -70 : 0;
    if (p.holeCards.length === 2) {
      const showCards = p.isHuman || state.phase === "showdown";
      for (let ci = 0; ci < 2; ci++) {
        const cx = pos.x + cardOffsetX + (ci - 0.5) * 38;
        const cy = pos.y + cardOffsetY;
        if (showCards && !p.folded) {
          drawCardOnStage(stage, p.holeCards[ci], cx, cy, 34, 50, false);
        } else if (!p.folded) {
          drawCardOnStage(stage, p.holeCards[ci], cx, cy, 34, 50, true);
        }
      }
    }
  }

  // Phase indicator
  const phaseNames: Record<Phase, string> = { preflop: "翻牌前", flop: "翻牌", turn: "转牌", river: "河牌", showdown: "摊牌" };
  if (state.status === "playing" || state.phase === "showdown") {
    const phaseText = new PIXI.Text({ text: phaseNames[state.phase], style: new PIXI.TextStyle({ fontSize: 12, fill: "#aaa", fontFamily: "sans-serif" }) });
    phaseText.anchor.set(0.5);
    phaseText.x = W / 2;
    phaseText.y = H / 2 - 55;
    stage.addChild(phaseText);
  }

  // Message overlay
  if (state.message && (state.status === "roundEnd" || state.status === "idle")) {
    const msgBg = new PIXI.Graphics();
    msgBg.roundRect(W / 2 - 160, H / 2 - 20, 320, 40, 10).fill({ color: 0x000000, alpha: 0.7 });
    stage.addChild(msgBg);
    const msgText = new PIXI.Text({ text: state.message, style: new PIXI.TextStyle({ fontSize: 14, fill: "#3ea6ff", fontFamily: "sans-serif", fontWeight: "bold", align: "center" }) });
    msgText.anchor.set(0.5);
    msgText.x = W / 2;
    msgText.y = H / 2;
    stage.addChild(msgText);
  }
}

function drawCardOnStage(stage: Container, card: Card, x: number, y: number, w: number, h: number, faceDown: boolean) {
  if (!pixiModule) return;
  const PIXI = pixiModule;
  const g = new PIXI.Graphics();

  if (faceDown) {
    g.roundRect(x - w / 2, y - h / 2, w, h, 4).fill({ color: 0x2244aa });
    g.roundRect(x - w / 2, y - h / 2, w, h, 4).stroke({ color: 0x1a3388, width: 1 });
    // Pattern on back
    g.roundRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6, 2).stroke({ color: 0x3366cc, width: 1 });
    stage.addChild(g);
    return;
  }

  // White card
  g.roundRect(x - w / 2, y - h / 2, w, h, 4).fill({ color: 0xffffff });
  g.roundRect(x - w / 2, y - h / 2, w, h, 4).stroke({ color: 0xcccccc, width: 1 });

  // Suit shape in center
  drawSuitShape(g, card.suit, x, y + 4, w * 0.6);
  stage.addChild(g);

  // Value text
  const color = suitColor(card.suit);
  const hexColor = "#" + color.toString(16).padStart(6, "0");
  const valText = new PIXI.Text({
    text: card.value,
    style: new PIXI.TextStyle({ fontSize: Math.max(10, w * 0.28), fill: hexColor, fontFamily: "sans-serif", fontWeight: "bold" }),
  });
  valText.anchor.set(0.5);
  valText.x = x - w / 2 + w * 0.25;
  valText.y = y - h / 2 + h * 0.2;
  stage.addChild(valText);
}

/* ================================================================== */
/*  React Component                                                    */
/* ================================================================== */
export default function PokerTexasPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const soundRef = useRef<PokerSoundEngine | null>(null);
  const [muted, setMuted] = useState(false);
  const [gs, setGs] = useState<GameState>(createInitialState);
  const gsRef = useRef(gs);
  gsRef.current = gs;
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Init PixiJS
  useEffect(() => {
    if (!canvasRef.current) return;
    soundRef.current = new PokerSoundEngine();
    let destroyed = false;

    (async () => {
      const app = await createPixiApp({
        canvas: canvasRef.current!,
        width: W,
        height: H,
        backgroundColor: 0x0d5a2d,
      });
      if (destroyed) { app.destroy(); return; }
      appRef.current = app;
      pixiModule = await loadPixi();
      renderGame(app, gsRef.current);
    })();

    return () => {
      destroyed = true;
      appRef.current?.destroy();
      appRef.current = null;
      soundRef.current?.dispose();
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

  // Re-render on state change
  useEffect(() => {
    if (appRef.current) renderGame(appRef.current, gs);
  }, [gs]);

  /* ---- Game Flow ---- */
  const startNewRound = useCallback(() => {
    setGs(prev => {
      const activePlayers = prev.players.filter(p => p.chips > 0);
      if (activePlayers.length < 2) {
        return { ...prev, status: "idle", message: "游戏结束！" };
      }

      const deck = createDeck();
      const newDealer = (prev.dealerIndex + 1) % prev.players.length;
      const players = prev.players.map(p => ({
        ...p,
        holeCards: [] as Card[],
        folded: p.chips <= 0,
        allIn: false,
        currentBet: 0,
      }));

      // Deal 2 cards to each active player
      for (let c = 0; c < 2; c++) {
        for (let i = 0; i < players.length; i++) {
          if (!players[i].folded) {
            players[i].holeCards.push(deck.pop()!);
          }
        }
      }

      // Post blinds
      const sbIndex = findNextActive(players, newDealer);
      const bbIndex = findNextActive(players, sbIndex);
      const sbAmount = Math.min(SMALL_BLIND, players[sbIndex].chips);
      const bbAmount = Math.min(BIG_BLIND, players[bbIndex].chips);

      players[sbIndex].chips -= sbAmount;
      players[sbIndex].currentBet = sbAmount;
      if (players[sbIndex].chips === 0) players[sbIndex].allIn = true;

      players[bbIndex].chips -= bbAmount;
      players[bbIndex].currentBet = bbAmount;
      if (players[bbIndex].chips === 0) players[bbIndex].allIn = true;

      const firstToAct = findNextActive(players, bbIndex);

      soundRef.current?.deal();

      return {
        ...prev,
        players,
        deck,
        communityCards: [],
        pot: sbAmount + bbAmount,
        currentBet: BIG_BLIND,
        minRaise: BIG_BLIND,
        dealerIndex: newDealer,
        currentPlayerIndex: firstToAct,
        phase: "preflop" as Phase,
        status: "playing" as GameStatus,
        message: "",
        winner: "",
        winningHand: "",
        roundNumber: prev.roundNumber + 1,
      };
    });
  }, []);

  function findNextActive(players: Player[], fromIndex: number): number {
    let idx = (fromIndex + 1) % players.length;
    let count = 0;
    while ((players[idx].folded || players[idx].chips <= 0 && !players[idx].allIn) && count < players.length) {
      idx = (idx + 1) % players.length;
      count++;
    }
    return idx;
  }

  const advancePhase = useCallback((state: GameState): GameState => {
    const activePlayers = state.players.filter(p => !p.folded);

    // Only one player left
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      const totalScore = state.totalScore + (winner.isHuman ? state.pot : 0);
      soundRef.current?.win();
      const newPlayers = state.players.map(p =>
        p.id === winner.id ? { ...p, chips: p.chips + state.pot, currentBet: 0 } : { ...p, currentBet: 0 }
      );
      if (winner.isHuman) {
        submitScore(totalScore);
      }
      return {
        ...state,
        players: newPlayers,
        pot: 0,
        status: "roundEnd",
        message: `${winner.name} 赢得 ${state.pot} 筹码！`,
        winner: winner.name,
        totalScore,
      };
    }

    // Reset bets for new phase
    const resetPlayers = state.players.map(p => ({ ...p, currentBet: 0 }));
    const deck = [...state.deck];
    let communityCards = [...state.communityCards];
    let nextPhase = state.phase;

    if (state.phase === "preflop") {
      communityCards.push(deck.pop()!, deck.pop()!, deck.pop()!);
      nextPhase = "flop";
      soundRef.current?.deal();
    } else if (state.phase === "flop") {
      communityCards.push(deck.pop()!);
      nextPhase = "turn";
      soundRef.current?.deal();
    } else if (state.phase === "turn") {
      communityCards.push(deck.pop()!);
      nextPhase = "river";
      soundRef.current?.deal();
    } else if (state.phase === "river") {
      // Showdown
      return resolveShowdown({ ...state, players: resetPlayers, communityCards, deck });
    }

    const firstToAct = findNextActive(resetPlayers, state.dealerIndex);

    return {
      ...state,
      players: resetPlayers,
      deck,
      communityCards,
      phase: nextPhase,
      currentBet: 0,
      minRaise: BIG_BLIND,
      currentPlayerIndex: firstToAct,
    };
  }, []);

  function resolveShowdown(state: GameState): GameState {
    const activePlayers = state.players.filter(p => !p.folded);
    let bestResult: HandResult | null = null;
    let winnerId = -1;

    for (const p of activePlayers) {
      const result = evaluateHand(p.holeCards, state.communityCards);
      if (!bestResult || compareHands(result, bestResult) > 0) {
        bestResult = result;
        winnerId = p.id;
      }
    }

    const winner = state.players.find(p => p.id === winnerId)!;
    const handName = bestResult ? HAND_RANK_NAMES[bestResult.rank] : "";
    const totalScore = state.totalScore + (winner.isHuman ? state.pot : 0);

    soundRef.current?.win();

    const newPlayers = state.players.map(p =>
      p.id === winnerId ? { ...p, chips: p.chips + state.pot, currentBet: 0 } : { ...p, currentBet: 0 }
    );

    if (winner.isHuman) {
      submitScore(totalScore);
    }

    return {
      ...state,
      players: newPlayers,
      pot: 0,
      phase: "showdown",
      status: "roundEnd",
      message: `${winner.name} 以 ${handName} 赢得 ${state.pot} 筹码！`,
      winner: winner.name,
      winningHand: handName,
      totalScore,
    };
  }

  const processAction = useCallback((action: "fold" | "call" | "raise" | "check" | "all-in", raiseAmount?: number) => {
    setGs(prev => {
      if (prev.status !== "playing") return prev;
      const state = { ...prev };
      const players = state.players.map(p => ({ ...p }));
      const player = players[state.currentPlayerIndex];

      if (action === "fold") {
        player.folded = true;
        soundRef.current?.fold();
      } else if (action === "check") {
        soundRef.current?.check();
      } else if (action === "call") {
        const toCall = Math.min(state.currentBet - player.currentBet, player.chips);
        player.chips -= toCall;
        player.currentBet += toCall;
        state.pot += toCall;
        if (player.chips === 0) player.allIn = true;
        soundRef.current?.bet();
      } else if (action === "raise") {
        const amount = raiseAmount || state.minRaise;
        const totalBet = state.currentBet + amount;
        const toAdd = Math.min(totalBet - player.currentBet, player.chips);
        player.chips -= toAdd;
        player.currentBet += toAdd;
        state.pot += toAdd;
        state.currentBet = player.currentBet;
        state.minRaise = amount;
        if (player.chips === 0) player.allIn = true;
        soundRef.current?.bet();
      } else if (action === "all-in") {
        const allInAmount = player.chips;
        player.currentBet += allInAmount;
        state.pot += allInAmount;
        player.chips = 0;
        player.allIn = true;
        if (player.currentBet > state.currentBet) {
          state.currentBet = player.currentBet;
        }
        soundRef.current?.allIn();
      }

      state.players = players;

      // Find next player
      const activePlayers = players.filter(p => !p.folded && !p.allIn);
      if (activePlayers.length <= 1 && players.filter(p => !p.folded).length <= 1) {
        // Only one non-folded player
        return advancePhase(state);
      }

      // Check if betting round is complete
      const playersInRound = players.filter(p => !p.folded && !p.allIn);
      const allMatched = playersInRound.every(p => p.currentBet === state.currentBet);
      const nextIdx = findNextActive(players, state.currentPlayerIndex);
      const wentAround = nextIdx <= state.currentPlayerIndex || playersInRound.length === 0;

      if ((allMatched && wentAround) || playersInRound.length === 0) {
        return advancePhase(state);
      }

      state.currentPlayerIndex = nextIdx;
      return state;
    });
  }, [advancePhase]);

  // AI turn processing
  useEffect(() => {
    if (gs.status !== "playing") return;
    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.isHuman || currentPlayer.folded || currentPlayer.allIn) return;

    aiTimerRef.current = setTimeout(() => {
      const decision = aiDecision(currentPlayer, gs.communityCards, gs.currentBet, gs.pot, gs.minRaise);
      processAction(decision.action, decision.amount);
    }, 600 + Math.random() * 400);

    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [gs.currentPlayerIndex, gs.status, gs.phase, processAction, gs.communityCards, gs.currentBet, gs.pot, gs.minRaise, gs.players]);

  /* ---- Player Actions ---- */
  const canAct = gs.status === "playing" && gs.players[gs.currentPlayerIndex]?.isHuman;
  const humanPlayer = gs.players[0];
  const toCall = gs.currentBet - humanPlayer.currentBet;

  const handleFold = () => { if (canAct) processAction("fold"); };
  const handleCheck = () => { if (canAct && toCall === 0) processAction("check"); };
  const handleCall = () => { if (canAct && toCall > 0) processAction("call"); };
  const handleRaise = () => {
    if (!canAct) return;
    const amount = gs.minRaise;
    if (humanPlayer.chips >= toCall + amount) processAction("raise", amount);
  };
  const handleAllIn = () => { if (canAct) processAction("all-in"); };

  const handleToggleMute = () => {
    const m = soundRef.current?.toggleMute() ?? false;
    setMuted(m);
  };

  const handleSave = useCallback(() => ({
    players: gs.players.map(p => ({ ...p, holeCards: [] })),
    roundNumber: gs.roundNumber,
    totalScore: gs.totalScore,
    dealerIndex: gs.dealerIndex,
  }), [gs]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as { players: Player[]; roundNumber: number; totalScore: number; dealerIndex: number };
    setGs(prev => ({
      ...createInitialState(),
      players: d.players.map((p, i) => ({ ...prev.players[i], ...p, holeCards: [], folded: false, allIn: false, currentBet: 0 })),
      roundNumber: d.roundNumber,
      totalScore: d.totalScore,
      dealerIndex: d.dealerIndex,
      message: "存档已加载，点击开始新一局",
    }));
  }, []);

  async function submitScore(score: number) {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score }),
      });
    } catch { /* ignore */ }
  }

  const personalityLabel = (p: AIPersonality | undefined) => {
    if (p === "tight") return "保守型";
    if (p === "aggressive") return "激进型";
    if (p === "loose") return "宽松型";
    return "";
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pb-20 lg:pb-0">
      <Header />
      <main className="max-w-[1100px] mx-auto px-4 py-4">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/games" className="p-2 rounded-lg hover:bg-white/5 transition text-gray-400 hover:text-[#3ea6ff]">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-[#3ea6ff] flex items-center gap-2">
            <CircleDollarSign size={20} />
            德州扑克
          </h1>
          <div className="flex-1" />
          <span className="text-xs text-gray-500">第 {gs.roundNumber} 局</span>
          <span className="text-xs text-[#f0b90b]">总分: {gs.totalScore}</span>
          <button onClick={handleToggleMute} className="p-2 rounded-lg hover:bg-white/5 transition text-gray-400">
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        {/* Canvas */}
        <div className="flex justify-center mb-4">
          <div className="relative rounded-xl overflow-hidden border border-[#333] shadow-2xl" style={{ maxWidth: W }}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="w-full"
              style={{ aspectRatio: `${W}/${H}` }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {gs.status === "idle" || gs.status === "roundEnd" ? (
            <button
              onClick={startNewRound}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition text-sm"
            >
              {gs.status === "idle" ? <Play size={16} /> : <RotateCcw size={16} />}
              {gs.status === "idle" ? "开始游戏" : "下一局"}
            </button>
          ) : canAct ? (
            <>
              {toCall === 0 && (
                <button onClick={handleCheck} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-white hover:bg-[#333] transition text-sm">
                  <CheckCircle size={15} />
                  过牌
                </button>
              )}
              {toCall > 0 && (
                <button onClick={handleCall} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#3ea6ff]/20 border border-[#3ea6ff]/40 text-[#3ea6ff] hover:bg-[#3ea6ff]/30 transition text-sm">
                  <Hand size={15} />
                  跟注 ({toCall})
                </button>
              )}
              <button onClick={handleRaise} disabled={humanPlayer.chips < toCall + gs.minRaise} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#f0b90b]/20 border border-[#f0b90b]/40 text-[#f0b90b] hover:bg-[#f0b90b]/30 transition text-sm disabled:opacity-30">
                <ArrowUpCircle size={15} />
                加注 (+{gs.minRaise})
              </button>
              <button onClick={handleAllIn} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#ff6b6b]/20 border border-[#ff6b6b]/40 text-[#ff6b6b] hover:bg-[#ff6b6b]/30 transition text-sm">
                <Flame size={15} />
                全押 ({humanPlayer.chips})
              </button>
              <button onClick={handleFold} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#666]/20 border border-[#666]/40 text-[#999] hover:bg-[#666]/30 transition text-sm">
                <XCircle size={15} />
                弃牌
              </button>
            </>
          ) : (
            <div className="text-sm text-gray-500 py-2">
              {gs.players[gs.currentPlayerIndex]?.name} 正在思考...
            </div>
          )}
        </div>

        {/* Info panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Player info */}
          <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
            <h3 className="text-sm font-bold text-[#3ea6ff] mb-3 flex items-center gap-2">
              <Trophy size={14} />
              玩家信息
            </h3>
            <div className="space-y-2">
              {gs.players.map(p => (
                <div key={p.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${p.folded ? "opacity-40" : ""} ${gs.currentPlayerIndex === p.id && gs.status === "playing" ? "bg-[#3ea6ff]/10" : "bg-[#212121]"}`}>
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.personality && <span className="text-[10px] text-gray-500">{personalityLabel(p.personality)}</span>}
                  <span className="text-[#f0b90b] tabular-nums">{p.chips}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hand rankings reference */}
          <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
            <h3 className="text-sm font-bold text-[#3ea6ff] mb-3">牌型参考</h3>
            <div className="space-y-1 text-[10px] text-gray-400">
              {HAND_RANK_ORDER.slice().reverse().map((rank, i) => (
                <div key={rank} className="flex justify-between">
                  <span>{i + 1}. {HAND_RANK_NAMES[rank]}</span>
                  <span className="text-gray-600">{rank}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Game status */}
          <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
            <h3 className="text-sm font-bold text-[#3ea6ff] mb-3">游戏状态</h3>
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex justify-between"><span>底池</span><span className="text-[#f0b90b]">{gs.pot}</span></div>
              <div className="flex justify-between"><span>当前下注</span><span>{gs.currentBet}</span></div>
              <div className="flex justify-between"><span>最小加注</span><span>{gs.minRaise}</span></div>
              <div className="flex justify-between"><span>小盲/大盲</span><span>{SMALL_BLIND}/{BIG_BLIND}</span></div>
              <div className="flex justify-between"><span>局数</span><span>{gs.roundNumber}</span></div>
              {gs.winner && <div className="flex justify-between"><span>上局赢家</span><span className="text-[#3ea6ff]">{gs.winner}</span></div>}
              {gs.winningHand && <div className="flex justify-between"><span>赢牌</span><span className="text-[#f0b90b]">{gs.winningHand}</span></div>}
            </div>
          </div>
        </div>

        {/* Save/Load + Leaderboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}
