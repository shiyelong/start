"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics } from "pixi.js";
import { ArrowLeft, Volume2, VolumeX, Trophy, Plus, Coins } from "lucide-react";

const GAME_ID = "shisanzhang";
const W = 800, H = 600;
const SUITS = ["spade", "heart", "diamond", "club"] as const;
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as const;
type Suit = typeof SUITS[number];
type Rank = typeof RANKS[number];
interface Card { suit: Suit; rank: Rank; id: number; }
type Slot = "front" | "middle" | "back";
type Phase = "arrange" | "reveal" | "score";
interface PlayerHand { front: Card[]; middle: Card[]; back: Card[]; }
interface ScoreResult { vs: number[]; total: number; sweep: number[]; }

const SLOT_MAX: Record<Slot, number> = { front: 3, middle: 5, back: 5 };
const SLOT_LABELS: Record<Slot, string> = { front: "前墩", middle: "中墩", back: "后墩" };
const SUIT_COLORS: Record<Suit, number> = { spade: 0xffffff, heart: 0xff4757, diamond: 0xff6b81, club: 0xcccccc };

function rankVal(r: Rank): number { return RANKS.indexOf(r) + 2; }

function makeDeck(): Card[] {
  const d: Card[] = []; let id = 0;
  for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r, id: id++ });
  return d;
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

/* ===== Hand evaluation ===== */
function isFlush(cards: Card[]): boolean { return cards.length >= 5 && cards.every(c => c.suit === cards[0].suit); }
function sortedRanks(cards: Card[]): number[] { return cards.map(c => rankVal(c.rank)).sort((a, b) => b - a); }

function isStraight(cards: Card[]): boolean {
  if (cards.length < 5) return false;
  const vals = sortedRanks(cards);
  for (let i = 0; i < vals.length - 1; i++) if (vals[i] - vals[i + 1] !== 1) {
    if (i === 0 && vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) return true;
    return false;
  }
  return true;
}

function countRanks(cards: Card[]): number[] {
  const m = new Map<number, number>();
  for (const c of cards) m.set(rankVal(c.rank), (m.get(rankVal(c.rank)) || 0) + 1);
  return Array.from(m.values());
}

function handScore5(cards: Card[]): number {
  if (cards.length !== 5) return 0;
  const fl = isFlush(cards), st = isStraight(cards), vals = sortedRanks(cards);
  const counts = countRanks(cards).sort((a, b) => b - a);
  if (fl && st && vals[0] === 14 && vals[1] === 13) return 900 + vals[0]; // Royal
  if (fl && st) return 800 + vals[0]; // Straight flush
  if (counts[0] === 4) return 700 + vals[0]; // Four of a kind
  if (counts[0] === 3 && counts[1] === 2) return 600 + vals[0]; // Full house
  if (fl) return 500 + vals[0]; // Flush
  if (st) return 400 + vals[0]; // Straight
  if (counts[0] === 3) return 300 + vals[0]; // Three of a kind
  if (counts[0] === 2 && counts[1] === 2) return 200 + vals[0]; // Two pair
  if (counts[0] === 2) return 100 + vals[0]; // One pair
  return vals[0]; // High card
}

function handScore3(cards: Card[]): number {
  if (cards.length !== 3) return 0;
  const counts = countRanks(cards).sort((a, b) => b - a);
  const vals = sortedRanks(cards);
  if (counts[0] === 3) return 300 + vals[0];
  if (counts[0] === 2) return 100 + vals[0];
  return vals[0];
}

function slotScore(slot: Slot, cards: Card[]): number {
  return slot === "front" ? handScore3(cards) : handScore5(cards);
}

function isValidArrangement(h: PlayerHand): boolean {
  if (h.front.length !== 3 || h.middle.length !== 5 || h.back.length !== 5) return false;
  const fs = slotScore("front", h.front), ms = slotScore("middle", h.middle), bs = slotScore("back", h.back);
  return bs >= ms && ms >= fs;
}

function handLabel(slot: Slot, cards: Card[]): string {
  if (slot === "front") {
    const c = countRanks(cards).sort((a, b) => b - a);
    if (c[0] === 3) return "三条";
    if (c[0] === 2) return "一对";
    return "高牌";
  }
  const fl = isFlush(cards), st = isStraight(cards), vals = sortedRanks(cards);
  const c = countRanks(cards).sort((a, b) => b - a);
  if (fl && st && vals[0] === 14) return "皇家同花顺";
  if (fl && st) return "同花顺";
  if (c[0] === 4) return "四条";
  if (c[0] === 3 && c[1] === 2) return "葫芦";
  if (fl) return "同花";
  if (st) return "顺子";
  if (c[0] === 3) return "三条";
  if (c[0] === 2 && c[1] === 2) return "两对";
  if (c[0] === 2) return "一对";
  return "高牌";
}

/* ===== Scoring ===== */
function compareSlot(slot: Slot, a: Card[], b: Card[]): number {
  const sa = slotScore(slot, a), sb = slotScore(slot, b);
  return sa > sb ? 1 : sa < sb ? -1 : 0;
}

function computeScores(hands: PlayerHand[]): ScoreResult[] {
  const results: ScoreResult[] = hands.map(() => ({ vs: [0, 0, 0, 0], total: 0, sweep: [] }));
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      let iWins = 0, jWins = 0;
      for (const slot of ["front", "middle", "back"] as Slot[]) {
        const r = compareSlot(slot, hands[i][slot], hands[j][slot]);
        if (r > 0) { results[i].vs[j]++; results[j].vs[i]--; iWins++; }
        else if (r < 0) { results[j].vs[i]++; results[i].vs[j]--; jWins++; }
      }
      if (iWins === 3) { results[i].vs[j] += 3; results[j].vs[i] -= 3; results[i].sweep.push(j); }
      if (jWins === 3) { results[j].vs[i] += 3; results[i].vs[j] -= 3; results[j].sweep.push(i); }
    }
  }
  for (let i = 0; i < 4; i++) results[i].total = results[i].vs.reduce((a, b) => a + b, 0);
  return results;
}

/* ===== AI arrangement ===== */
function aiArrange(cards: Card[]): PlayerHand {
  const sorted = [...cards].sort((a, b) => rankVal(b.rank) - rankVal(a.rank));
  let best: PlayerHand = { front: sorted.slice(0, 3), middle: sorted.slice(3, 8), back: sorted.slice(8, 13) };
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 200; attempt++) {
    const sh = shuffle(cards);
    const h: PlayerHand = { front: sh.slice(0, 3), middle: sh.slice(3, 8), back: sh.slice(8, 13) };
    if (!isValidArrangement(h)) continue;
    const sc = slotScore("back", h.back) * 3 + slotScore("middle", h.middle) * 2 + slotScore("front", h.front);
    if (sc > bestScore) { bestScore = sc; best = h; }
  }
  if (!isValidArrangement(best)) {
    best.front.sort((a, b) => rankVal(a.rank) - rankVal(b.rank));
    best.middle.sort((a, b) => rankVal(a.rank) - rankVal(b.rank));
    best.back.sort((a, b) => rankVal(b.rank) - rankVal(a.rank));
  }
  return best;
}

/* ===== Sound ===== */
class SSZSound {
  private ctx: AudioContext | null = null;
  private muted = false;
  private getCtx(): AudioContext { if (!this.ctx) this.ctx = new AudioContext(); return this.ctx; }
  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.12) {
    if (this.muted) return;
    try {
      const c = this.getCtx(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    } catch {}
  }
  playDeal() { [0, 40, 80].forEach((d, i) => setTimeout(() => this.tone(600 + i * 80, 0.06, "triangle"), d)); }
  playPlace() { this.tone(523, 0.08, "triangle"); setTimeout(() => this.tone(659, 0.08, "triangle"), 50); }
  playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "triangle"), i * 120)); }
  playLose() { [400, 350, 300, 250].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, "sawtooth", 0.08), i * 150)); }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

const PLAYER_NAMES = ["你", "电脑A", "电脑B", "电脑C"];

/* ===== PixiJS card drawing ===== */
function drawSuitShape(g: PixiGraphics, suit: Suit, cx: number, cy: number, size: number) {
  const s = size;
  if (suit === "heart") {
    g.moveTo(cx, cy + s * 0.35).bezierCurveTo(cx - s * 0.5, cy - s * 0.3, cx - s * 0.9, cy + s * 0.1, cx, cy + s * 0.8)
      .moveTo(cx, cy + s * 0.35).bezierCurveTo(cx + s * 0.5, cy - s * 0.3, cx + s * 0.9, cy + s * 0.1, cx, cy + s * 0.8)
      .fill({ color: 0xff4757 });
  } else if (suit === "diamond") {
    g.moveTo(cx, cy - s * 0.5).lineTo(cx + s * 0.35, cy).lineTo(cx, cy + s * 0.5).lineTo(cx - s * 0.35, cy).closePath()
      .fill({ color: 0xff6b81 });
  } else if (suit === "club") {
    g.circle(cx, cy - s * 0.2, s * 0.22).circle(cx - s * 0.22, cy + s * 0.1, s * 0.22).circle(cx + s * 0.22, cy + s * 0.1, s * 0.22)
      .fill({ color: 0xcccccc });
    g.rect(cx - s * 0.06, cy + s * 0.1, s * 0.12, s * 0.35).fill({ color: 0xcccccc });
  } else {
    // spade
    g.moveTo(cx, cy - s * 0.45).bezierCurveTo(cx - s * 0.6, cy, cx - s * 0.5, cy + s * 0.4, cx, cy + s * 0.15)
      .moveTo(cx, cy - s * 0.45).bezierCurveTo(cx + s * 0.6, cy, cx + s * 0.5, cy + s * 0.4, cx, cy + s * 0.15)
      .fill({ color: 0xffffff });
    g.rect(cx - s * 0.06, cy + s * 0.1, s * 0.12, s * 0.35).fill({ color: 0xffffff });
  }
}

function drawCardFace(g: PixiGraphics, card: Card, x: number, y: number, w: number, h: number, selected: boolean, pixi: typeof import("pixi.js"), texts: import("pixi.js").Text[], ti: { i: number }) {
  g.roundRect(x, y, w, h, 4).fill({ color: 0xf5f5f0 });
  const bc = selected ? 0x3ea6ff : 0x888888;
  g.roundRect(x, y, w, h, 4).stroke({ color: bc, width: selected ? 2.5 : 1 });
  const col = SUIT_COLORS[card.suit];
  // rank text top-left
  if (ti.i < texts.length) {
    const t = texts[ti.i++];
    t.text = card.rank; t.style.fontSize = 11; t.style.fontWeight = "bold"; t.style.fill = col;
    t.anchor.set(0, 0); t.x = x + 3; t.y = y + 2; t.visible = true;
  }
  drawSuitShape(g, card.suit, x + w / 2, y + h / 2, Math.min(w, h) * 0.35);
}

function drawCardBack(g: PixiGraphics, x: number, y: number, w: number, h: number) {
  g.roundRect(x, y, w, h, 4).fill({ color: 0x1a1a3e });
  g.roundRect(x, y, w, h, 4).stroke({ color: 0x3ea6ff, width: 1 });
  for (let py = y + 6; py < y + h - 6; py += 8) {
    for (let px = x + 6; px < x + w - 6; px += 8) {
      g.rect(px, py, 3, 3).fill({ color: 0x3ea6ff, alpha: 0.1 });
    }
  }
}

/* ===== Main Component ===== */
export default function ShiSanZhangPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("arrange");
  const [score, setScore] = useState(0);
  const [totalWins, setTotalWins] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showLB, setShowLB] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [message, setMessage] = useState("选择手牌放入墩位");

  const soundRef = useRef<SSZSound | null>(null);
  const phaseRef = useRef(phase);
  const stateRef = useRef({
    allCards: [] as Card[][],       // 4 players' 13 cards
    hands: [] as PlayerHand[],      // arranged hands
    playerPool: [] as Card[],       // unplaced cards
    playerSlots: { front: [], middle: [], back: [] } as PlayerHand,
    selected: [] as number[],       // selected card ids in pool
    activeSlot: "back" as Slot,
    scores: null as ScoreResult[] | null,
    round: 1,
  });

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    soundRef.current = new SSZSound();
    return () => { soundRef.current?.dispose(); };
  }, []);

  /* ===== Deal ===== */
  const deal = useCallback(() => {
    const deck = shuffle(makeDeck());
    const allCards = [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39, 52)];
    const aiHands = [aiArrange(allCards[1]), aiArrange(allCards[2]), aiArrange(allCards[3])];
    const s = stateRef.current;
    s.allCards = allCards;
    s.hands = [{ front: [], middle: [], back: [] }, ...aiHands];
    s.playerPool = [...allCards[0]].sort((a, b) => {
      const si = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      return si !== 0 ? si : rankVal(a.rank) - rankVal(b.rank);
    });
    s.playerSlots = { front: [], middle: [], back: [] };
    s.selected = [];
    s.activeSlot = "back";
    s.scores = null;
    setPhase("arrange");
    setMessage("选择手牌放入墩位");
    soundRef.current?.playDeal();
  }, []);

  useEffect(() => { deal(); }, [deal]);

  /* ===== Player actions ===== */
  const toggleSelect = useCallback((cardId: number) => {
    if (phaseRef.current !== "arrange") return;
    const s = stateRef.current;
    const idx = s.selected.indexOf(cardId);
    if (idx >= 0) { s.selected.splice(idx, 1); }
    else { s.selected.push(cardId); }
    soundRef.current?.playPlace();
  }, []);

  const placeCards = useCallback((slot: Slot) => {
    if (phaseRef.current !== "arrange") return;
    const s = stateRef.current;
    const max = SLOT_MAX[slot];
    const current = s.playerSlots[slot].length;
    const toPlace = s.selected.filter(id => s.playerPool.some(c => c.id === id));
    if (current + toPlace.length > max) { setMessage(`${SLOT_LABELS[slot]}最多${max}张牌`); return; }
    for (const id of toPlace) {
      const ci = s.playerPool.findIndex(c => c.id === id);
      if (ci >= 0) { s.playerSlots[slot].push(s.playerPool[ci]); s.playerPool.splice(ci, 1); }
    }
    s.selected = [];
    s.activeSlot = slot;
    soundRef.current?.playPlace();
  }, []);

  const removeFromSlot = useCallback((slot: Slot, cardId: number) => {
    if (phaseRef.current !== "arrange") return;
    const s = stateRef.current;
    const ci = s.playerSlots[slot].findIndex(c => c.id === cardId);
    if (ci >= 0) {
      s.playerPool.push(s.playerSlots[slot][ci]);
      s.playerSlots[slot].splice(ci, 1);
      s.playerPool.sort((a, b) => {
        const si = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
        return si !== 0 ? si : rankVal(a.rank) - rankVal(b.rank);
      });
    }
  }, []);

  const confirmArrangement = useCallback(() => {
    const s = stateRef.current;
    const h: PlayerHand = { front: [...s.playerSlots.front], middle: [...s.playerSlots.middle], back: [...s.playerSlots.back] };
    if (h.front.length !== 3 || h.middle.length !== 5 || h.back.length !== 5) {
      setMessage("请将13张牌全部放入三个墩位"); return;
    }
    if (!isValidArrangement(h)) {
      setMessage("倒水! 后墩须大于中墩, 中墩须大于前墩"); return;
    }
    s.hands[0] = h;
    s.scores = computeScores(s.hands);
    const playerScore = s.scores[0].total;
    setScore(prev => prev + playerScore);
    if (playerScore > 0) { soundRef.current?.playWin(); setTotalWins(w => w + 1); }
    else soundRef.current?.playLose();
    setPhase("reveal");
    setMessage(playerScore > 0 ? `得分 +${playerScore}!` : `得分 ${playerScore}`);
    fetchWithAuth("/api/games/scores", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: GAME_ID, score: Math.max(0, playerScore) }),
    }).catch(() => {});
  }, []);

  const nextRound = useCallback(() => {
    stateRef.current.round++;
    deal();
  }, [deal]);

  /* ===== Save / Load ===== */
  const handleSave = useCallback(() => {
    const s = stateRef.current;
    return JSON.stringify({ allCards: s.allCards, hands: s.hands, playerPool: s.playerPool, playerSlots: s.playerSlots, scores: s.scores, round: s.round, score, phase: phaseRef.current });
  }, [score]);

  const handleLoad = useCallback((data: string) => {
    try {
      const d = JSON.parse(data);
      const s = stateRef.current;
      s.allCards = d.allCards; s.hands = d.hands; s.playerPool = d.playerPool;
      s.playerSlots = d.playerSlots; s.scores = d.scores; s.round = d.round;
      s.selected = [];
      setScore(d.score || 0);
      setPhase(d.phase || "arrange");
    } catch {}
  }, []);

  /* ===== PixiJS Rendering ===== */
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let destroyed = false;
    let app: Application | null = null;
    let animId = 0;

    async function init() {
      const pixi = await loadPixi();
      if (destroyed) return;
      app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0f0f0f });
      if (destroyed) { app.destroy(true); return; }

      const g = new pixi.Graphics();
      app.stage.addChild(g);
      const texts: import("pixi.js").Text[] = [];
      for (let i = 0; i < 200; i++) {
        const t = new pixi.Text({ text: "", style: { fontSize: 11, fill: 0xffffff, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" } });
        t.visible = false; app.stage.addChild(t); texts.push(t);
      }

      const CW = 44, CH = 62; // card size

      function render() {
        if (destroyed) return;
        g.clear();
        for (const t of texts) { t.visible = false; t.alpha = 1; }
        const ti = { i: 0 };
        const s = stateRef.current;
        const curPhase = phaseRef.current;

        // Table background
        g.rect(0, 0, W, H).fill({ color: 0x0f0f0f });
        g.roundRect(10, 10, W - 20, H - 20, 12).fill({ color: 0x0a1a0a });
        g.roundRect(10, 10, W - 20, H - 20, 12).stroke({ color: 0x1a3a1a, width: 1 });

        // === AI hands (top area) ===
        for (let p = 1; p < 4; p++) {
          const bx = 20 + (p - 1) * 260, by = 18;
          // Player label
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = PLAYER_NAMES[p]; t.style.fontSize = 11; t.style.fontWeight = "bold"; t.style.fill = 0x3ea6ff;
            t.anchor.set(0, 0); t.x = bx; t.y = by; t.visible = true;
          }
          if (curPhase === "arrange") {
            // face-down cards
            for (let i = 0; i < 13; i++) {
              drawCardBack(g, bx + (i % 7) * 32, by + 18 + Math.floor(i / 7) * 34, 28, 38);
            }
          } else {
            // Reveal AI hands
            const h = s.hands[p];
            const slots: Slot[] = ["front", "middle", "back"];
            let oy = by + 16;
            for (const slot of slots) {
              if (ti.i < texts.length) {
                const t = texts[ti.i++];
                t.text = SLOT_LABELS[slot]; t.style.fontSize = 8; t.style.fontWeight = "normal"; t.style.fill = 0x888888;
                t.anchor.set(0, 0); t.x = bx; t.y = oy; t.visible = true;
              }
              const cards = h[slot];
              for (let i = 0; i < cards.length; i++) {
                drawCardFace(g, cards[i], bx + 30 + i * 28, oy - 2, 26, 36, false, pixi, texts, ti);
              }
              oy += 38;
            }
            // Score
            if (s.scores && ti.i < texts.length) {
              const sc = s.scores[p].total;
              const t = texts[ti.i++];
              t.text = `${sc >= 0 ? "+" : ""}${sc}`; t.style.fontSize = 11; t.style.fontWeight = "bold";
              t.style.fill = sc >= 0 ? 0x2ed573 : 0xff4757;
              t.anchor.set(0, 0); t.x = bx + 200; t.y = by; t.visible = true;
            }
          }
        }

        // === Player slots (middle area) ===
        const slotY = { front: 160, middle: 230, back: 300 };
        for (const slot of ["front", "middle", "back"] as Slot[]) {
          const sy = slotY[slot];
          const max = SLOT_MAX[slot];
          // Slot label
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = `${SLOT_LABELS[slot]} (${s.playerSlots[slot].length}/${max})`; t.style.fontSize = 12; t.style.fontWeight = "bold";
            t.style.fill = s.activeSlot === slot ? 0x3ea6ff : 0x888888;
            t.anchor.set(0, 0.5); t.x = 30; t.y = sy + CH / 2; t.visible = true;
          }
          // Slot background
          const slotX = 120;
          g.roundRect(slotX - 4, sy - 4, max * (CW + 6) + 8, CH + 8, 6).fill({ color: 0x1a1a1a });
          g.roundRect(slotX - 4, sy - 4, max * (CW + 6) + 8, CH + 8, 6).stroke({ color: s.activeSlot === slot ? 0x3ea6ff : 0x333333, width: 1 });
          // Empty slot markers
          for (let i = 0; i < max; i++) {
            const cx = slotX + i * (CW + 6);
            if (i >= s.playerSlots[slot].length) {
              g.roundRect(cx, sy, CW, CH, 4).stroke({ color: 0x333333, width: 1, alpha: 0.3 });
            }
          }
          // Placed cards
          for (let i = 0; i < s.playerSlots[slot].length; i++) {
            drawCardFace(g, s.playerSlots[slot][i], slotX + i * (CW + 6), sy, CW, CH, false, pixi, texts, ti);
          }
          // Hand label in reveal
          if (curPhase !== "arrange" && s.playerSlots[slot].length === SLOT_MAX[slot] && ti.i < texts.length) {
            const lbl = handLabel(slot, s.playerSlots[slot]);
            const t = texts[ti.i++];
            t.text = lbl; t.style.fontSize = 10; t.style.fontWeight = "bold"; t.style.fill = 0xffd700;
            t.anchor.set(0, 0.5); t.x = slotX + max * (CW + 6) + 12; t.y = sy + CH / 2; t.visible = true;
          }
        }

        // Player score in reveal
        if (curPhase !== "arrange" && s.scores && ti.i < texts.length) {
          const sc = s.scores[0].total;
          const t = texts[ti.i++];
          t.text = `你的得分: ${sc >= 0 ? "+" : ""}${sc}`; t.style.fontSize = 16; t.style.fontWeight = "bold";
          t.style.fill = sc >= 0 ? 0x2ed573 : 0xff4757;
          t.anchor.set(0, 0); t.x = 550; t.y = 170; t.visible = true;
          // Sweep info
          if (s.scores[0].sweep.length > 0 && ti.i < texts.length) {
            const t2 = texts[ti.i++];
            t2.text = `通杀: ${s.scores[0].sweep.map(i => PLAYER_NAMES[i]).join(", ")}`;
            t2.style.fontSize = 12; t2.style.fontWeight = "bold"; t2.style.fill = 0xffd700;
            t2.anchor.set(0, 0); t2.x = 550; t2.y = 195; t2.visible = true;
          }
          // Per-opponent breakdown
          for (let p = 1; p < 4; p++) {
            if (ti.i < texts.length) {
              const t3 = texts[ti.i++];
              const v = s.scores[0].vs[p];
              t3.text = `vs ${PLAYER_NAMES[p]}: ${v >= 0 ? "+" : ""}${v}`;
              t3.style.fontSize = 11; t3.style.fontWeight = "normal"; t3.style.fill = v >= 0 ? 0x2ed573 : 0xff4757;
              t3.anchor.set(0, 0); t3.x = 550; t3.y = 215 + (p - 1) * 20; t3.visible = true;
            }
          }
        }

        // === Player hand (bottom) ===
        if (curPhase === "arrange" && s.playerPool.length > 0) {
          const poolY = 390;
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = `手牌 (${s.playerPool.length}张)`; t.style.fontSize = 12; t.style.fontWeight = "bold"; t.style.fill = 0xffffff;
            t.anchor.set(0, 0); t.x = 30; t.y = poolY - 2; t.visible = true;
          }
          const startX = 30;
          const gap = Math.min(CW + 6, (W - 60) / s.playerPool.length);
          for (let i = 0; i < s.playerPool.length; i++) {
            const c = s.playerPool[i];
            const sel = s.selected.includes(c.id);
            const cy = sel ? poolY + 14 : poolY + 22;
            drawCardFace(g, c, startX + i * gap, cy, CW, CH, sel, pixi, texts, ti);
          }
        }

        // Round info
        if (ti.i < texts.length) {
          const t = texts[ti.i++];
          t.text = `第${s.round}局`; t.style.fontSize = 11; t.style.fontWeight = "normal"; t.style.fill = 0x888888;
          t.anchor.set(1, 0); t.x = W - 20; t.y = H - 22; t.visible = true;
        }

        animId = requestAnimationFrame(render);
      }
      animId = requestAnimationFrame(render);

      // Click handler
      const handleClick = (e: MouseEvent) => {
        if (destroyed) return;
        const rect = canvas!.getBoundingClientRect();
        const scaleX = W / rect.width, scaleY = H / rect.height;
        const mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;
        const s = stateRef.current;
        const curPhase = phaseRef.current;

        if (curPhase === "arrange") {
          // Click on pool cards
          const poolY = 390;
          const gap = Math.min(CW + 6, (W - 60) / Math.max(1, s.playerPool.length));
          for (let i = s.playerPool.length - 1; i >= 0; i--) {
            const cx = 30 + i * gap;
            const sel = s.selected.includes(s.playerPool[i].id);
            const cy = sel ? poolY + 14 : poolY + 22;
            if (mx >= cx && mx <= cx + CW && my >= cy && my <= cy + CH) {
              toggleSelect(s.playerPool[i].id);
              return;
            }
          }
          // Click on slot areas to place
          const slotY: Record<Slot, number> = { front: 160, middle: 230, back: 300 };
          for (const slot of ["front", "middle", "back"] as Slot[]) {
            const sy = slotY[slot];
            if (mx >= 116 && mx <= 116 + SLOT_MAX[slot] * (CW + 6) + 8 && my >= sy - 4 && my <= sy + CH + 4) {
              // Check if clicking on existing card to remove
              for (let i = s.playerSlots[slot].length - 1; i >= 0; i--) {
                const cx = 120 + i * (CW + 6);
                if (mx >= cx && mx <= cx + CW && my >= sy && my <= sy + CH) {
                  removeFromSlot(slot, s.playerSlots[slot][i].id);
                  return;
                }
              }
              // Place selected cards
              if (s.selected.length > 0) {
                placeCards(slot);
                return;
              }
              // Just set active slot
              s.activeSlot = slot;
              return;
            }
          }
        }
      };
      canvas!.addEventListener("click", handleClick);

      return () => { canvas!.removeEventListener("click", handleClick); };
    }

    let cleanup: (() => void) | undefined;
    init().then(c => { cleanup = c as (() => void) | undefined; });

    return () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      if (app) { try { app.destroy(true); } catch {} }
      cleanup?.();
    };
  }, [toggleSelect, placeCards, removeFromSlot]);

  /* ===== Auto-place shortcut ===== */
  const autoArrange = useCallback(() => {
    const s = stateRef.current;
    const all = [...s.playerPool, ...s.playerSlots.front, ...s.playerSlots.middle, ...s.playerSlots.back];
    const arranged = aiArrange(all);
    s.playerSlots = arranged;
    s.playerPool = [];
    s.selected = [];
    setMessage("已自动排列, 可手动调整");
  }, []);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-[900px] mx-auto px-3 pt-2 pb-20">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-2">
          <Link href="/games" className="flex items-center gap-1 text-[#3ea6ff] text-sm hover:underline">
            <ArrowLeft size={16} /> 返回游戏
          </Link>
          <h1 className="text-lg font-bold text-[#3ea6ff]">十三张</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => { const m = soundRef.current?.toggleMute(); setMuted(!!m); }}
              className="p-1.5 rounded bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]">
              {muted ? <VolumeX size={16} className="text-gray-500" /> : <Volume2 size={16} className="text-[#3ea6ff]" />}
            </button>
            <button onClick={() => setShowLB(true)}
              className="p-1.5 rounded bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]">
              <Trophy size={16} className="text-[#3ea6ff]" />
            </button>
            <button onClick={() => setShowSave(true)}
              className="p-1.5 rounded bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]">
              <Plus size={16} className="text-[#3ea6ff]" />
            </button>
          </div>
        </div>

        {/* Score bar */}
        <div className="flex items-center justify-between mb-2 px-2 py-1 bg-[#1a1a1a] rounded border border-[#333] text-sm">
          <span className="flex items-center gap-1"><Coins size={14} className="text-yellow-400" /> 总分: {score}</span>
          <span className="text-gray-400">胜场: {totalWins}</span>
          <span className="text-gray-400">第{stateRef.current.round}局</span>
        </div>

        {/* Canvas */}
        <div className="relative w-full" style={{ maxWidth: W, margin: "0 auto" }}>
          <canvas ref={canvasRef} width={W} height={H}
            className="w-full rounded-lg border border-[#333]" style={{ aspectRatio: `${W}/${H}` }} />
        </div>

        {/* Message */}
        <div className="text-center text-sm mt-2 text-gray-300">{message}</div>

        {/* Controls */}
        <div className="flex flex-wrap justify-center gap-2 mt-3">
          {phase === "arrange" && (
            <>
              {(["front", "middle", "back"] as Slot[]).map(slot => (
                <button key={slot} onClick={() => placeCards(slot)}
                  className={`px-3 py-1.5 rounded text-sm font-medium border ${
                    stateRef.current.activeSlot === slot
                      ? "bg-[#3ea6ff] text-black border-[#3ea6ff]"
                      : "bg-[#1a1a1a] text-white border-[#333] hover:border-[#3ea6ff]"
                  }`}>
                  放入{SLOT_LABELS[slot]}
                </button>
              ))}
              <button onClick={autoArrange}
                className="px-3 py-1.5 rounded text-sm bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff] text-gray-300">
                自动排列
              </button>
              <button onClick={confirmArrangement}
                className="px-4 py-1.5 rounded text-sm font-bold bg-[#3ea6ff] text-black hover:bg-[#5bb8ff]">
                确认
              </button>
            </>
          )}
          {(phase === "reveal" || phase === "score") && (
            <button onClick={nextRound}
              className="px-4 py-1.5 rounded text-sm font-bold bg-[#3ea6ff] text-black hover:bg-[#5bb8ff]">
              下一局
            </button>
          )}
        </div>

        {/* Rules */}
        <details className="mt-4 text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-300">游戏规则</summary>
          <div className="mt-1 p-2 bg-[#1a1a1a] rounded border border-[#333] space-y-1">
            <p>4人各发13张牌, 排成前墩(3张)、中墩(5张)、后墩(5张)</p>
            <p>后墩须大于中墩, 中墩须大于前墩, 否则倒水</p>
            <p>每个墩位与其他3人比较, 赢+1分, 输-1分</p>
            <p>通杀(3个墩位全赢)额外+3分</p>
            <p>牌型: 皇家同花顺 &gt; 同花顺 &gt; 四条 &gt; 葫芦 &gt; 同花 &gt; 顺子 &gt; 三条 &gt; 两对 &gt; 一对 &gt; 高牌</p>
          </div>
        </details>
      </div>

      {showLB && <GameLeaderboard gameId={GAME_ID} />}
      {showSave && <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={(data: unknown) => handleLoad(data as string)} />}
    </div>
  );
}
