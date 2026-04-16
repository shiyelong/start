"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Container } from "pixi.js";
import { ChevronLeft, Volume2, VolumeX, RotateCcw, Play, Hand } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   常量 & 类型
   ═══════════════════════════════════════════════════════════════════════════ */
const GAME_ID = "bigtwo";
const W = 800, H = 600;

// 花色: 0=方块 1=梅花 2=红心 3=黑桃
const RANK_NAMES = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"] as const;
type Suit = 0 | 1 | 2 | 3;
type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

interface Card {
  suit: Suit;
  rank: Rank;
  id: number; // suit * 13 + rank, unique 0-51
}

type HandType = "single" | "pair" | "triple" | "straight" | "flush" | "fullhouse" | "fourofakind" | "straightflush";
const HAND_LABELS: Record<HandType, string> = {
  single: "单张", pair: "对子", triple: "三条", straight: "顺子",
  flush: "同花", fullhouse: "葫芦", fourofakind: "铁支", straightflush: "同花顺",
};
const FIVE_CARD_RANK: Record<string, number> = {
  straight: 0, flush: 1, fullhouse: 2, fourofakind: 3, straightflush: 4,
};

interface Play {
  cards: Card[];
  type: HandType;
}

interface GameState {
  hands: Card[][]; // 4 players, index 0 = human
  currentPlayer: number;
  lastPlay: Play | null;
  lastPlayPlayer: number;
  passCount: number;
  gameOver: boolean;
  winner: number;
  turnCount: number;
  firstTurn: boolean; // must play 3 of diamonds
  scores: number[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   音效引擎
   ═══════════════════════════════════════════════════════════════════════════ */
class BigTwoSound {
  private ctx: AudioContext | null = null;
  private muted = false;
  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }
  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
    if (this.muted) return;
    const c = this.getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  playCard() {
    this.tone(600, 0.08, "square", 0.1);
    setTimeout(() => this.tone(800, 0.06, "square", 0.08), 40);
  }
  playPass() {
    this.tone(300, 0.15, "sine", 0.08);
  }
  playWin() {
    this.tone(523, 0.15, "square", 0.12);
    setTimeout(() => this.tone(659, 0.15, "square", 0.12), 120);
    setTimeout(() => this.tone(784, 0.2, "square", 0.15), 240);
    setTimeout(() => this.tone(1047, 0.3, "square", 0.18), 380);
  }
  playError() {
    this.tone(200, 0.2, "sawtooth", 0.08);
  }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   牌局逻辑
   ═══════════════════════════════════════════════════════════════════════════ */
function makeCard(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: suit * 13 + rank };
}

function cardValue(c: Card): number {
  return c.rank * 4 + c.suit; // rank is primary, suit is tiebreaker
}

function compareCards(a: Card, b: Card): number {
  return cardValue(a) - cardValue(b);
}

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort(compareCards);
}

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) {
      deck.push(makeCard(s as Suit, r as Rank));
    }
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function is3ofDiamonds(c: Card): boolean {
  return c.suit === 0 && c.rank === 0; // suit=diamonds, rank=3
}

function findStartingPlayer(hands: Card[][]): number {
  for (let p = 0; p < 4; p++) {
    if (hands[p].some(is3ofDiamonds)) return p;
  }
  return 0;
}

/* ─── Hand classification ─── */
function classifyPlay(cards: Card[]): Play | null {
  const n = cards.length;
  const sorted = sortHand(cards);

  if (n === 1) return { cards: sorted, type: "single" };

  if (n === 2) {
    if (sorted[0].rank === sorted[1].rank) return { cards: sorted, type: "pair" };
    return null;
  }

  if (n === 3) {
    if (sorted[0].rank === sorted[1].rank && sorted[1].rank === sorted[2].rank)
      return { cards: sorted, type: "triple" };
    return null;
  }

  if (n === 5) {
    const ranks = sorted.map(c => c.rank);
    const suits = sorted.map(c => c.suit);
    const sameSuit = suits.every(s => s === suits[0]);

    // Check straight (consecutive ranks, with special case for wrapping)
    const isStraight = (() => {
      // Normal consecutive
      for (let i = 1; i < 5; i++) {
        if (ranks[i] !== ranks[0] + i) return false;
      }
      // Disallow straights that include 2 (rank 12) — in Big Two, 2 is highest and doesn't form straights normally
      // Actually in standard Big Two, straights can include 2 but it's the highest card
      // Common rule: 10-J-Q-K-A is valid, J-Q-K-A-2 is valid, but Q-K-A-2-3 is NOT
      // With our ranking (3=0...2=12): valid straights are consecutive ranks where max-min=4
      return ranks[4] - ranks[0] === 4;
    })();

    // Straight flush
    if (isStraight && sameSuit) return { cards: sorted, type: "straightflush" };

    // Four of a kind (+ 1 kicker)
    if ((ranks[0] === ranks[1] && ranks[1] === ranks[2] && ranks[2] === ranks[3]) ||
        (ranks[1] === ranks[2] && ranks[2] === ranks[3] && ranks[3] === ranks[4])) {
      return { cards: sorted, type: "fourofakind" };
    }

    // Full house (3+2)
    if ((ranks[0] === ranks[1] && ranks[1] === ranks[2] && ranks[3] === ranks[4]) ||
        (ranks[0] === ranks[1] && ranks[2] === ranks[3] && ranks[3] === ranks[4])) {
      return { cards: sorted, type: "fullhouse" };
    }

    // Flush
    if (sameSuit) return { cards: sorted, type: "flush" };

    // Straight
    if (isStraight) return { cards: sorted, type: "straight" };

    return null;
  }

  return null;
}

/* ─── Comparison: can play beat lastPlay? ─── */
function getPlayStrength(play: Play): number {
  const { cards, type } = play;
  if (type === "single") return cardValue(cards[0]);
  if (type === "pair") return cardValue(cards[1]); // higher card
  if (type === "triple") return cardValue(cards[2]);

  // 5-card hands
  const typeRank = FIVE_CARD_RANK[type] ?? 0;
  // For same type comparison, use the key card
  let keyValue = 0;
  if (type === "straight" || type === "straightflush") {
    keyValue = cardValue(cards[4]); // highest card
  } else if (type === "flush") {
    keyValue = cardValue(cards[4]);
  } else if (type === "fullhouse") {
    // The triple part determines strength
    const ranks = cards.map(c => c.rank);
    const tripleRank = ranks[2]; // middle card is always part of triple in sorted hand
    keyValue = tripleRank * 4 + 3; // max suit for comparison
  } else if (type === "fourofakind") {
    const ranks = cards.map(c => c.rank);
    const quadRank = ranks[2]; // middle is always part of quad
    keyValue = quadRank * 4 + 3;
  }
  return typeRank * 10000 + keyValue;
}

function canBeat(play: Play, last: Play): boolean {
  // Same number of cards
  if (play.cards.length !== last.cards.length) return false;

  // For 5-card hands, higher type always wins
  if (play.cards.length === 5) {
    const playTypeRank = FIVE_CARD_RANK[play.type] ?? 0;
    const lastTypeRank = FIVE_CARD_RANK[last.type] ?? 0;
    if (playTypeRank > lastTypeRank) return true;
    if (playTypeRank < lastTypeRank) return false;
    // Same type: compare key values
    return getPlayStrength(play) > getPlayStrength(last);
  }

  // Singles, pairs, triples: must be same type
  if (play.type !== last.type) return false;
  return getPlayStrength(play) > getPlayStrength(last);
}

function contains3ofDiamonds(cards: Card[]): boolean {
  return cards.some(is3ofDiamonds);
}

/* ─── AI logic: find lowest valid play ─── */
function findValidPlays(hand: Card[], lastPlay: Play | null, mustInclude3D: boolean): Play[] {
  const validPlays: Play[] = [];
  const sorted = sortHand(hand);
  const n = sorted.length;

  // Singles
  for (let i = 0; i < n; i++) {
    const p = classifyPlay([sorted[i]]);
    if (p && (!lastPlay || canBeat(p, lastPlay))) {
      if (!mustInclude3D || contains3ofDiamonds(p.cards)) validPlays.push(p);
    }
  }

  // Pairs
  for (let i = 0; i < n - 1; i++) {
    if (sorted[i].rank === sorted[i + 1].rank) {
      const p = classifyPlay([sorted[i], sorted[i + 1]]);
      if (p && (!lastPlay || canBeat(p, lastPlay))) {
        if (!mustInclude3D || contains3ofDiamonds(p.cards)) validPlays.push(p);
      }
    }
  }

  // Triples
  for (let i = 0; i < n - 2; i++) {
    if (sorted[i].rank === sorted[i + 1].rank && sorted[i + 1].rank === sorted[i + 2].rank) {
      const p = classifyPlay([sorted[i], sorted[i + 1], sorted[i + 2]]);
      if (p && (!lastPlay || canBeat(p, lastPlay))) {
        if (!mustInclude3D || contains3ofDiamonds(p.cards)) validPlays.push(p);
      }
    }
  }

  // 5-card combinations
  if (n >= 5) {
    const indices: number[][] = [];
    const combo = (start: number, chosen: number[]) => {
      if (chosen.length === 5) { indices.push([...chosen]); return; }
      if (start >= n) return;
      if (n - start < 5 - chosen.length) return;
      combo(start + 1, [...chosen, start]);
      combo(start + 1, chosen);
    };
    combo(0, []);

    for (const idx of indices) {
      const cards = idx.map(i => sorted[i]);
      const p = classifyPlay(cards);
      if (p && (!lastPlay || canBeat(p, lastPlay))) {
        if (!mustInclude3D || contains3ofDiamonds(p.cards)) validPlays.push(p);
      }
    }
  }

  return validPlays;
}

function aiPlay(hand: Card[], lastPlay: Play | null, mustInclude3D: boolean): Play | null {
  const plays = findValidPlays(hand, lastPlay, mustInclude3D);
  if (plays.length === 0) return null;
  // Play lowest valid combination
  plays.sort((a, b) => getPlayStrength(a) - getPlayStrength(b));
  return plays[0];
}

/* ─── Deal and init ─── */
function initGame(): GameState {
  const deck = shuffle(makeDeck());
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < 52; i++) {
    hands[i % 4].push(deck[i]);
  }
  for (let p = 0; p < 4; p++) hands[p] = sortHand(hands[p]);

  const starter = findStartingPlayer(hands);
  return {
    hands,
    currentPlayer: starter,
    lastPlay: null,
    lastPlayPlayer: -1,
    passCount: 0,
    gameOver: false,
    winner: -1,
    turnCount: 0,
    firstTurn: true,
    scores: [0, 0, 0, 0],
  };
}

function removeCardsFromHand(hand: Card[], cards: Card[]): Card[] {
  const ids = new Set(cards.map(c => c.id));
  return hand.filter(c => !ids.has(c.id));
}


/* ═══════════════════════════════════════════════════════════════════════════
   PixiJS 绘制辅助
   ═══════════════════════════════════════════════════════════════════════════ */
const CARD_W = 60, CARD_H = 84, CARD_R = 6;
const SUIT_COLORS: Record<Suit, number> = { 0: 0xff0000, 1: 0x000000, 2: 0xff0000, 3: 0x000000 };
const SUIT_SYMBOLS = ["D", "C", "H", "S"] as const;

function drawSuitShape(g: PixiGraphics, suit: Suit, cx: number, cy: number, size: number) {
  const color = SUIT_COLORS[suit];
  if (suit === 2) {
    // Heart
    const s = size * 0.5;
    g.moveTo(cx, cy + s * 0.8);
    g.bezierCurveTo(cx - s * 1.2, cy - s * 0.2, cx - s * 0.6, cy - s * 1.2, cx, cy - s * 0.4);
    g.bezierCurveTo(cx + s * 0.6, cy - s * 1.2, cx + s * 1.2, cy - s * 0.2, cx, cy + s * 0.8);
    g.fill({ color });
  } else if (suit === 0) {
    // Diamond
    const s = size * 0.55;
    g.moveTo(cx, cy - s);
    g.lineTo(cx + s * 0.65, cy);
    g.lineTo(cx, cy + s);
    g.lineTo(cx - s * 0.65, cy);
    g.closePath();
    g.fill({ color });
  } else if (suit === 1) {
    // Club - three circles + stem
    const s = size * 0.3;
    g.circle(cx, cy - s * 0.8, s);
    g.circle(cx - s * 0.9, cy + s * 0.2, s);
    g.circle(cx + s * 0.9, cy + s * 0.2, s);
    g.fill({ color });
    g.rect(cx - s * 0.3, cy + s * 0.2, s * 0.6, s * 1.2);
    g.fill({ color });
  } else {
    // Spade
    const s = size * 0.5;
    g.moveTo(cx, cy - s);
    g.bezierCurveTo(cx - s * 1.2, cy + s * 0.2, cx - s * 0.4, cy + s * 0.9, cx, cy + s * 0.3);
    g.bezierCurveTo(cx + s * 0.4, cy + s * 0.9, cx + s * 1.2, cy + s * 0.2, cx, cy - s);
    g.fill({ color });
    g.rect(cx - s * 0.15, cy + s * 0.2, s * 0.3, s * 0.7);
    g.fill({ color });
  }
}

function drawCard(g: PixiGraphics, card: Card, x: number, y: number, selected: boolean) {
  const yOff = selected ? -12 : 0;
  const dy = y + yOff;

  // Card background
  g.roundRect(x, dy, CARD_W, CARD_H, CARD_R);
  g.fill({ color: selected ? 0xddeeff : 0xffffff });
  g.roundRect(x, dy, CARD_W, CARD_H, CARD_R);
  g.stroke({ color: selected ? 0x3ea6ff : 0x888888, width: selected ? 2 : 1 });

  // Draw suit shape in center
  drawSuitShape(g, card.suit, x + CARD_W / 2, dy + CARD_H / 2, 22);
}

/* ═══════════════════════════════════════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════════════════════════════════════ */
const PLAYER_NAMES = ["你", "电脑西", "电脑北", "电脑东"];

export default function BigTwoPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const soundRef = useRef<BigTwoSound>(null!);
  const pixiAppRef = useRef<Application | null>(null);
  const gfxRef = useRef<PixiGraphics | null>(null);
  const containerRef = useRef<Container | null>(null);

  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(-1);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("准备开始");
  const [muted, setMuted] = useState(false);
  const [handCounts, setHandCounts] = useState([13, 13, 13, 13]);
  const [lastPlayInfo, setLastPlayInfo] = useState<string>("");
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [, forceRender] = useState(0);
  const scoreSubmittedRef = useRef(false);

  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore <= 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* ignore */ }
  }, []);

  /* ─── PixiJS init ─── */
  useEffect(() => {
    let destroyed = false;
    soundRef.current = new BigTwoSound();

    const setup = async () => {
      if (!canvasRef.current || destroyed) return;
      const pixi = await loadPixi();
      if (destroyed) return;

      const app = await createPixiApp({
        canvas: canvasRef.current,
        width: W,
        height: H,
        backgroundColor: 0x0f0f0f,
      });
      if (destroyed) { app.destroy(); return; }
      pixiAppRef.current = app;

      const mainGfx = new pixi.Graphics();
      app.stage.addChild(mainGfx);
      gfxRef.current = mainGfx;

      // Text container
      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      containerRef.current = textContainer;
    };

    setup();

    return () => {
      destroyed = true;
      soundRef.current?.dispose();
      pixiAppRef.current?.destroy();
      pixiAppRef.current = null;
    };
  }, []);

  /* ─── Render function ─── */
  const render = useCallback(async () => {
    const g = gfxRef.current;
    const game = gameRef.current;
    const container = containerRef.current;
    if (!g || !game || !container) return;

    const pixi = await loadPixi();
    g.clear();

    // Clear old texts
    container.removeChildren();

    // ─── Play area (center) ───
    g.roundRect(W / 2 - 160, H / 2 - 70, 320, 120, 10);
    g.fill({ color: 0x1a2a1a, alpha: 0.6 });
    g.stroke({ color: 0x2a4a2a, width: 1 });

    // Draw last play in center
    if (game.lastPlay && game.lastPlayPlayer >= 0) {
      const lp = game.lastPlay;
      const totalW = lp.cards.length * 45 + 15;
      const startX = W / 2 - totalW / 2;
      const startY = H / 2 - 42;
      for (let i = 0; i < lp.cards.length; i++) {
        drawCard(g, lp.cards[i], startX + i * 45, startY, false);
      }
      // Label
      const label = `${PLAYER_NAMES[game.lastPlayPlayer]}: ${HAND_LABELS[lp.type]}`;
      const lt = new pixi.Text({ text: label, style: new pixi.TextStyle({ fontSize: 12, fill: "#aaaaaa", fontFamily: "sans-serif" }) });
      lt.x = W / 2 - lt.width / 2;
      lt.y = H / 2 + 52;
      container.addChild(lt);
    }

    // ─── Opponents (top, left, right) ───
    // Player 1 (West/left)
    drawOpponent(g, pixi, container, 30, H / 2 - 30, game.hands[1].length, PLAYER_NAMES[1], game.currentPlayer === 1);
    // Player 2 (North/top)
    drawOpponent(g, pixi, container, W / 2 - 40, 20, game.hands[2].length, PLAYER_NAMES[2], game.currentPlayer === 2);
    // Player 3 (East/right)
    drawOpponent(g, pixi, container, W - 130, H / 2 - 30, game.hands[3].length, PLAYER_NAMES[3], game.currentPlayer === 3);

    // ─── Player hand (bottom, fan-shaped) ───
    const hand = game.hands[0];
    const handLen = hand.length;
    if (handLen > 0) {
      const maxSpread = Math.min(680, handLen * 48);
      const spacing = handLen > 1 ? maxSpread / (handLen - 1) : 0;
      const startX = W / 2 - maxSpread / 2;
      const baseY = H - CARD_H - 50;
      const fanAngle = 0.3; // total fan angle in radians
      const angleStep = handLen > 1 ? fanAngle / (handLen - 1) : 0;
      const startAngle = -fanAngle / 2;

      for (let i = 0; i < handLen; i++) {
        const card = hand[i];
        const sel = selectedCards.has(card.id);
        const cx = startX + i * spacing;
        // Fan curve: slight arc
        const t = handLen > 1 ? i / (handLen - 1) - 0.5 : 0;
        const cy = baseY + t * t * 40; // parabolic curve
        drawCard(g, card, cx, cy, sel);

        // Draw rank text on card
        const yOff = sel ? -12 : 0;
        const textColor = (card.suit === 0 || card.suit === 2) ? "#ff0000" : "#111111";
        const rankStr = RANK_NAMES[card.rank];
        const rt = new pixi.Text({
          text: rankStr,
          style: new pixi.TextStyle({ fontSize: 13, fill: textColor, fontWeight: "bold", fontFamily: "sans-serif" }),
        });
        rt.x = cx + 4;
        rt.y = cy + yOff + 3;
        container.addChild(rt);

        // Small suit indicator below rank
        const suitChar = SUIT_SYMBOLS[card.suit];
        const st = new pixi.Text({
          text: suitChar,
          style: new pixi.TextStyle({ fontSize: 9, fill: textColor, fontFamily: "sans-serif" }),
        });
        st.x = cx + 5;
        st.y = cy + yOff + 18;
        container.addChild(st);
      }
    }

    // ─── Current player indicator ───
    if (game.currentPlayer === 0 && !game.gameOver) {
      const indicator = new pixi.Text({
        text: "轮到你出牌",
        style: new pixi.TextStyle({ fontSize: 14, fill: "#3ea6ff", fontWeight: "bold", fontFamily: "sans-serif" }),
      });
      indicator.x = W / 2 - indicator.width / 2;
      indicator.y = H - CARD_H - 80;
      container.addChild(indicator);
    }

    // ─── Game over overlay ───
    if (game.gameOver) {
      g.rect(0, 0, W, H);
      g.fill({ color: 0x000000, alpha: 0.6 });
      const winText = game.winner === 0 ? "你赢了!" : `${PLAYER_NAMES[game.winner]} 赢了!`;
      const wt = new pixi.Text({
        text: winText,
        style: new pixi.TextStyle({ fontSize: 36, fill: game.winner === 0 ? "#ffd700" : "#ff4444", fontWeight: "bold", fontFamily: "sans-serif" }),
      });
      wt.x = W / 2 - wt.width / 2;
      wt.y = H / 2 - 40;
      container.addChild(wt);
    }
  }, [selectedCards]);

  function drawOpponent(
    g: PixiGraphics,
    pixi: typeof import("pixi.js"),
    container: Container,
    x: number, y: number,
    cardCount: number, name: string, isActive: boolean
  ) {
    // Background
    g.roundRect(x, y, 100, 60, 6);
    g.fill({ color: isActive ? 0x1a3a5a : 0x1a1a1a, alpha: 0.8 });
    g.stroke({ color: isActive ? 0x3ea6ff : 0x333333, width: isActive ? 2 : 1 });

    // Name
    const nt = new pixi.Text({
      text: name,
      style: new pixi.TextStyle({ fontSize: 13, fill: isActive ? "#3ea6ff" : "#aaaaaa", fontWeight: "bold", fontFamily: "sans-serif" }),
    });
    nt.x = x + 50 - nt.width / 2;
    nt.y = y + 6;
    container.addChild(nt);

    // Card count
    const ct = new pixi.Text({
      text: `${cardCount} 张`,
      style: new pixi.TextStyle({ fontSize: 18, fill: "#ffffff", fontWeight: "bold", fontFamily: "sans-serif" }),
    });
    ct.x = x + 50 - ct.width / 2;
    ct.y = y + 28;
    container.addChild(ct);
  }

  /* ─── Start game ─── */
  const startGame = useCallback(() => {
    const game = initGame();
    gameRef.current = game;
    setGameStarted(true);
    setGameOver(false);
    setWinner(-1);
    setSelectedCards(new Set());
    setPlayerHand([...game.hands[0]]);
    setHandCounts(game.hands.map(h => h.length));
    setLastPlayInfo("");
    setMessage(game.currentPlayer === 0 ? "你先出牌（必须包含方块3）" : `${PLAYER_NAMES[game.currentPlayer]} 先出牌`);
    scoreSubmittedRef.current = false;
    forceRender(n => n + 1);

    // If AI starts, trigger AI turn
    if (game.currentPlayer !== 0) {
      setTimeout(() => runAiTurns(), 600);
    }
  }, []);

  /* ─── Render on state change ─── */
  useEffect(() => {
    if (gameStarted) render();
  }, [gameStarted, selectedCards, playerHand, currentPlayer, gameOver, lastPlayInfo, render]);

  /* ─── Card selection (click/tap) ─── */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const game = gameRef.current;
    if (!game || game.currentPlayer !== 0 || game.gameOver || aiThinking) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;

    let clientX: number, clientY: number;
    if ("touches" in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;

    const hand = game.hands[0];
    const handLen = hand.length;
    if (handLen === 0) return;

    const maxSpread = Math.min(680, handLen * 48);
    const spacing = handLen > 1 ? maxSpread / (handLen - 1) : 0;
    const startX = W / 2 - maxSpread / 2;
    const baseY = H - CARD_H - 50;

    // Check from right to left (top cards first)
    for (let i = handLen - 1; i >= 0; i--) {
      const card = hand[i];
      const sel = selectedCards.has(card.id);
      const cx = startX + i * spacing;
      const t = handLen > 1 ? i / (handLen - 1) - 0.5 : 0;
      const cy = baseY + t * t * 40 + (sel ? -12 : 0);

      if (mx >= cx && mx <= cx + CARD_W && my >= cy && my <= cy + CARD_H) {
        setSelectedCards(prev => {
          const next = new Set(prev);
          if (next.has(card.id)) next.delete(card.id);
          else next.add(card.id);
          return next;
        });
        soundRef.current?.playCard();
        break;
      }
    }
  }, [selectedCards, aiThinking]);

  /* ─── Play selected cards ─── */
  const playCards = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.currentPlayer !== 0 || game.gameOver || aiThinking) return;

    const hand = game.hands[0];
    const cards = hand.filter(c => selectedCards.has(c.id));
    if (cards.length === 0) {
      soundRef.current?.playError();
      setMessage("请先选择要出的牌");
      return;
    }

    const play = classifyPlay(cards);
    if (!play) {
      soundRef.current?.playError();
      setMessage("无效的牌型组合");
      return;
    }

    // First turn must include 3 of diamonds
    if (game.firstTurn && game.currentPlayer === 0 && !contains3ofDiamonds(play.cards)) {
      soundRef.current?.playError();
      setMessage("第一手必须包含方块3");
      return;
    }

    // Must beat last play (unless starting fresh)
    if (game.lastPlay && game.lastPlayPlayer !== 0) {
      if (!canBeat(play, game.lastPlay)) {
        soundRef.current?.playError();
        setMessage("必须出比上家更大的牌");
        return;
      }
    }

    // Valid play!
    game.hands[0] = removeCardsFromHand(hand, play.cards);
    game.lastPlay = play;
    game.lastPlayPlayer = 0;
    game.passCount = 0;
    game.firstTurn = false;
    game.turnCount++;

    soundRef.current?.playCard();
    setSelectedCards(new Set());
    setPlayerHand([...game.hands[0]]);
    setHandCounts(game.hands.map(h => h.length));
    setLastPlayInfo(`你: ${HAND_LABELS[play.type]}`);

    // Check win
    if (game.hands[0].length === 0) {
      game.gameOver = true;
      game.winner = 0;
      setGameOver(true);
      setWinner(0);
      setMessage("你赢了!");
      soundRef.current?.playWin();
      // Score: remaining cards of opponents
      const score = game.hands[1].length + game.hands[2].length + game.hands[3].length;
      submitScore(score * 10);
      return;
    }

    // Next player
    game.currentPlayer = 1;
    setCurrentPlayer(1);
    setMessage(`${PLAYER_NAMES[1]} 思考中...`);

    setTimeout(() => runAiTurns(), 600);
  }, [selectedCards, aiThinking, submitScore]);

  /* ─── Pass ─── */
  const pass = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.currentPlayer !== 0 || game.gameOver || aiThinking) return;

    // Can't pass if you must start (first turn or round reset to you)
    if (!game.lastPlay || game.lastPlayPlayer === 0) {
      soundRef.current?.playError();
      setMessage("你必须出牌（没有上家的牌需要压）");
      return;
    }

    game.passCount++;
    soundRef.current?.playPass();
    setSelectedCards(new Set());

    // Check if 3 passes = round reset
    if (game.passCount >= 3) {
      game.lastPlay = null;
      game.passCount = 0;
    }

    game.currentPlayer = 1;
    setCurrentPlayer(1);
    setMessage(`${PLAYER_NAMES[1]} 思考中...`);

    setTimeout(() => runAiTurns(), 600);
  }, [aiThinking]);

  /* ─── AI turns ─── */
  const runAiTurns = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.gameOver) return;

    setAiThinking(true);

    const runNext = (player: number) => {
      if (player === 0 || game.gameOver) {
        setAiThinking(false);
        setCurrentPlayer(0);
        if (!game.lastPlay || game.lastPlayPlayer === 0) {
          setMessage("轮到你出牌（自由出牌）");
        } else {
          setMessage("轮到你出牌");
        }
        forceRender(n => n + 1);
        return;
      }

      const mustInclude3D = game.firstTurn && game.currentPlayer === player;
      const lastPlay = (game.lastPlay && game.lastPlayPlayer !== player) ? game.lastPlay : null;
      const play = aiPlay(game.hands[player], lastPlay, mustInclude3D);

      if (play) {
        game.hands[player] = removeCardsFromHand(game.hands[player], play.cards);
        game.lastPlay = play;
        game.lastPlayPlayer = player;
        game.passCount = 0;
        game.firstTurn = false;
        game.turnCount++;

        soundRef.current?.playCard();
        setHandCounts(game.hands.map(h => h.length));
        setLastPlayInfo(`${PLAYER_NAMES[player]}: ${HAND_LABELS[play.type]}`);
        setMessage(`${PLAYER_NAMES[player]} 出了 ${HAND_LABELS[play.type]}`);

        // Check win
        if (game.hands[player].length === 0) {
          game.gameOver = true;
          game.winner = player;
          setGameOver(true);
          setWinner(player);
          setMessage(`${PLAYER_NAMES[player]} 赢了!`);
          if (player !== 0) soundRef.current?.playError();
          setAiThinking(false);
          forceRender(n => n + 1);
          return;
        }
      } else {
        // AI passes
        game.passCount++;
        soundRef.current?.playPass();
        setMessage(`${PLAYER_NAMES[player]} 不出`);

        if (game.passCount >= 3) {
          game.lastPlay = null;
          game.passCount = 0;
        }
      }

      // Next player
      const next = (player + 1) % 4;
      game.currentPlayer = next;

      if (next === 0) {
        // Back to human
        setAiThinking(false);
        setCurrentPlayer(0);
        setPlayerHand([...game.hands[0]]);
        if (!game.lastPlay || game.lastPlayPlayer === 0) {
          setMessage("轮到你出牌（自由出牌）");
        } else {
          setMessage("轮到你出牌");
        }
        forceRender(n => n + 1);
      } else {
        setTimeout(() => runNext(next), 500);
      }
    };

    runNext(game.currentPlayer);
  }, []);

  /* ─── Save / Load ─── */
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return null;
    return {
      hands: game.hands,
      currentPlayer: game.currentPlayer,
      lastPlay: game.lastPlay,
      lastPlayPlayer: game.lastPlayPlayer,
      passCount: game.passCount,
      gameOver: game.gameOver,
      winner: game.winner,
      turnCount: game.turnCount,
      firstTurn: game.firstTurn,
      scores: game.scores,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as GameState;
    if (!d || !d.hands) return;
    gameRef.current = d;
    setGameStarted(true);
    setGameOver(d.gameOver);
    setWinner(d.winner);
    setCurrentPlayer(d.currentPlayer);
    setSelectedCards(new Set());
    setPlayerHand([...d.hands[0]]);
    setHandCounts(d.hands.map(h => h.length));
    setMessage(d.currentPlayer === 0 ? "轮到你出牌" : `${PLAYER_NAMES[d.currentPlayer]} 思考中...`);
    forceRender(n => n + 1);
    if (d.currentPlayer !== 0 && !d.gameOver) {
      setTimeout(() => runAiTurns(), 600);
    }
  }, [runAiTurns]);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute() ?? false;
    setMuted(m);
  }, []);

  const restart = useCallback(() => {
    startGame();
  }, [startGame]);


  /* ═══════════════════════════════════════════════════════════════════════════
     JSX
     ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-20">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/games" className="text-[#aaa] hover:text-white transition">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-[#3ea6ff]">锄大D</h1>
          <div className="flex-1" />
          <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-[#222] transition" title={muted ? "取消静音" : "静音"}>
            {muted ? <VolumeX className="w-5 h-5 text-[#666]" /> : <Volume2 className="w-5 h-5 text-[#aaa]" />}
          </button>
          <button onClick={restart} className="p-2 rounded-lg hover:bg-[#222] transition" title="重新开始">
            <RotateCcw className="w-5 h-5 text-[#aaa]" />
          </button>
        </div>

        {/* Game canvas */}
        <div className="relative rounded-xl overflow-hidden border border-[#222] bg-[#0a0a0a] mb-4">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="w-full"
            style={{ aspectRatio: `${W}/${H}`, touchAction: "none" }}
            onClick={handleCanvasClick}
            onTouchStart={handleCanvasClick}
          />

          {/* Start overlay */}
          {!gameStarted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-4">
              <h2 className="text-3xl font-bold text-[#3ea6ff]">锄大D</h2>
              <p className="text-[#888] text-sm">大老二 / Big Two</p>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition text-lg"
              >
                <Play className="w-5 h-5" />
                开始游戏
              </button>
            </div>
          )}

          {/* Game over overlay */}
          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-4">
              <h2 className="text-3xl font-bold" style={{ color: winner === 0 ? "#ffd700" : "#ff4444" }}>
                {winner === 0 ? "你赢了!" : `${PLAYER_NAMES[winner]} 赢了!`}
              </h2>
              <button
                onClick={restart}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition"
              >
                <RotateCcw className="w-4 h-4" />
                再来一局
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        {gameStarted && !gameOver && (
          <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
            <div className="text-sm text-[#888] px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              {message}
            </div>
            {lastPlayInfo && (
              <div className="text-sm text-[#aaa] px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
                {lastPlayInfo}
              </div>
            )}
            <button
              onClick={playCards}
              disabled={currentPlayer !== 0 || aiThinking || selectedCards.size === 0}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              出牌
            </button>
            <button
              onClick={pass}
              disabled={currentPlayer !== 0 || aiThinking}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#333] text-[#ccc] font-bold hover:bg-[#444] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Hand className="w-4 h-4" />
              不出
            </button>
          </div>
        )}

        {/* Hand counts */}
        {gameStarted && (
          <div className="flex justify-center gap-4 mb-4 text-xs text-[#888]">
            {PLAYER_NAMES.map((name, i) => (
              <span key={i} className={`px-2 py-1 rounded ${currentPlayer === i ? "text-[#3ea6ff] bg-[#1a2a3a]" : ""}`}>
                {name}: {handCounts[i]}张
              </span>
            ))}
          </div>
        )}

        {/* Rules reference */}
        {gameStarted && (
          <div className="mb-4 p-3 rounded-xl bg-[#1a1a1a] border border-[#333] text-xs text-[#666]">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>牌型: 单张 / 对子 / 三条 / 顺子 / 同花 / 葫芦 / 铁支 / 同花顺</span>
              <span>大小: 3最小 2最大 | 花色: 方块 &lt; 梅花 &lt; 红心 &lt; 黑桃</span>
            </div>
          </div>
        )}

        {/* Save/Load + Leaderboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </div>
    </div>
  );
}
