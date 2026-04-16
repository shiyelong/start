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

const GAME_ID = "blackjack";
const SUITS = ["spade", "heart", "diamond", "club"] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
type Suit = (typeof SUITS)[number];
type Rank = (typeof RANKS)[number];
interface Card { suit: Suit; rank: Rank; faceUp: boolean; x: number; y: number; tx: number; ty: number; }
interface Hand { cards: Card[]; bet: number; done: boolean; doubled: boolean; }
interface GameState {
  shoe: Card[]; dealer: Card[]; hands: Hand[]; activeHand: number;
  chips: number; currentBet: number; phase: "bet" | "play" | "dealer" | "result";
  insurance: number; message: string; roundsPlayed: number; peakChips: number;
}

function makeShoe(): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < 6; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        shoe.push({ suit, rank, faceUp: false, x: 0, y: 0, tx: 0, ty: 0 });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return parseInt(rank);
}

function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardValue(c.rank); if (c.rank === "A") aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

// ─── Sound ───────────────────────────────────────────────────────────────────
class BJSound {
  private ctx: AudioContext | null = null;
  private muted = false;
  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }
  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.12) {
    if (this.muted) return;
    try {
      const c = this.getCtx(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    } catch {}
  }
  playDeal() { this.tone(600, 0.08, "triangle"); setTimeout(() => this.tone(800, 0.06, "triangle"), 50); }
  playHit() { this.tone(500, 0.07, "triangle"); }
  playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, "triangle"), i * 100)); }
  playLose() { [400, 350, 300, 250].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "sawtooth", 0.08), i * 120)); }
  playBlackjack() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, "sine", 0.15), i * 80)); }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

// ─── PixiJS Card Rendering ───────────────────────────────────────────────────
const CW = 60, CH = 84, CR = 6;
const SUIT_COLORS: Record<Suit, number> = { spade: 0xffffff, club: 0xffffff, heart: 0xff4444, diamond: 0xff4444 };

function drawSuitShape(g: PixiGraphics, suit: Suit, cx: number, cy: number, s: number) {
  const c = SUIT_COLORS[suit];
  if (suit === "heart") {
    g.moveTo(cx, cy + s * 0.4).bezierCurveTo(cx - s, cy - s * 0.4, cx - s * 0.5, cy - s, cx, cy - s * 0.3)
     .bezierCurveTo(cx + s * 0.5, cy - s, cx + s, cy - s * 0.4, cx, cy + s * 0.4).fill({ color: c });
  } else if (suit === "diamond") {
    g.moveTo(cx, cy - s * 0.7).lineTo(cx + s * 0.5, cy).lineTo(cx, cy + s * 0.7).lineTo(cx - s * 0.5, cy).closePath().fill({ color: c });
  } else if (suit === "spade") {
    g.moveTo(cx, cy - s * 0.7).bezierCurveTo(cx - s, cy, cx - s * 0.6, cy + s * 0.6, cx, cy + s * 0.2)
     .bezierCurveTo(cx + s * 0.6, cy + s * 0.6, cx + s, cy, cx, cy - s * 0.7).fill({ color: c });
    g.rect(cx - s * 0.08, cy + s * 0.1, s * 0.16, s * 0.5).fill({ color: c });
  } else {
    g.circle(cx, cy - s * 0.25, s * 0.25).fill({ color: c });
    g.circle(cx - s * 0.22, cy + s * 0.1, s * 0.25).fill({ color: c });
    g.circle(cx + s * 0.22, cy + s * 0.1, s * 0.25).fill({ color: c });
    g.rect(cx - s * 0.08, cy + s * 0.1, s * 0.16, s * 0.5).fill({ color: c });
  }
}

function drawCard(g: PixiGraphics, card: Card, pixi: typeof import("pixi.js"), app: Application) {
  const { x, y } = card;
  if (!card.faceUp) {
    g.roundRect(x, y, CW, CH, CR).fill({ color: 0x1a3a8a });
    g.roundRect(x + 3, y + 3, CW - 6, CH - 6, CR - 1).stroke({ color: 0x3366cc, width: 1 });
    // Cross-hatch pattern
    for (let i = 0; i < 6; i++) {
      g.moveTo(x + 6 + i * 9, y + 6).lineTo(x + 6 + i * 9, y + CH - 6).stroke({ color: 0x2255aa, width: 0.5 });
      g.moveTo(x + 6, y + 8 + i * 12).lineTo(x + CW - 6, y + 8 + i * 12).stroke({ color: 0x2255aa, width: 0.5 });
    }
    return;
  }
  // Face-up card
  g.roundRect(x, y, CW, CH, CR).fill({ color: 0xf5f5f0 });
  g.roundRect(x, y, CW, CH, CR).stroke({ color: 0xcccccc, width: 1 });
  const col = SUIT_COLORS[card.suit];
  // Rank text top-left
  const txt = new pixi.Text({ text: card.rank, style: { fontSize: 13, fill: col, fontWeight: "bold", fontFamily: "monospace" } });
  txt.x = x + 4; txt.y = y + 3; app.stage.addChild(txt);
  // Small suit top-left
  drawSuitShape(g, card.suit, x + 11, y + 28, 7);
  // Center suit large
  drawSuitShape(g, card.suit, x + CW / 2, y + CH / 2, 14);
  // Rank text bottom-right (inverted)
  const txt2 = new pixi.Text({ text: card.rank, style: { fontSize: 13, fill: col, fontWeight: "bold", fontFamily: "monospace" } });
  txt2.x = x + CW - 16; txt2.y = y + CH - 18; app.stage.addChild(txt2);
}

function drawChipStack(g: PixiGraphics, x: number, y: number, amount: number, pixi: typeof import("pixi.js"), app: Application) {
  const chipColors = [0xcc0000, 0x0066cc, 0x009933, 0x333333, 0xcc6600];
  const stacks = Math.min(Math.ceil(amount / 100), 5);
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < 3; j++) {
      const cy = y - j * 4 - i * 2;
      g.circle(x + i * 16, cy, 8).fill({ color: chipColors[i % chipColors.length] });
      g.circle(x + i * 16, cy, 8).stroke({ color: 0xffffff, width: 0.5 });
    }
  }
  const t = new pixi.Text({ text: `${amount}`, style: { fontSize: 11, fill: 0xf0b90b, fontWeight: "bold", fontFamily: "monospace" } });
  t.x = x - 4; t.y = y + 12; app.stage.addChild(t);
}

// ─── Main Component ──────────────────────────────────────────────────────────
function initState(): GameState {
  return {
    shoe: makeShoe(), dealer: [], hands: [{ cards: [], bet: 0, done: false, doubled: false }],
    activeHand: 0, chips: 1000, currentBet: 50, phase: "bet",
    insurance: 0, message: "下注开始", roundsPlayed: 0, peakChips: 1000,
  };
}

export default function BlackjackPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gs, setGs] = useState<GameState>(initState);
  const [muted, setMuted] = useState(false);
  const [showLB, setShowLB] = useState(false);
  const soundRef = useRef<BJSound | null>(null);
  const gsRef = useRef(gs);
  const destroyedRef = useRef(false);
  const appRef = useRef<Application | null>(null);
  const rafRef = useRef(0);
  const scoreSubmittedRef = useRef(false);

  useEffect(() => { gsRef.current = gs; }, [gs]);

  // Sound init
  useEffect(() => {
    soundRef.current = new BJSound();
    return () => { soundRef.current?.dispose(); };
  }, []);

  // PixiJS init
  useEffect(() => {
    let destroyed = false;
    destroyedRef.current = false;
    let app: Application | null = null;
    let pixi: typeof import("pixi.js");
    const textPool: import("pixi.js").Text[] = [];

    async function init() {
      if (!canvasRef.current) return;
      pixi = await loadPixi();
      if (destroyed) return;
      const cw = Math.min(canvasRef.current.parentElement?.clientWidth ?? 600, 600);
      const ch = Math.round(cw * 0.7);
      canvasRef.current.width = cw;
      canvasRef.current.height = ch;
      app = await createPixiApp({ canvas: canvasRef.current, width: cw, height: ch, backgroundColor: 0x1a5c2a });
      if (destroyed) { app.destroy(); return; }
      appRef.current = app;

      function render() {
        if (destroyed || !app) return;
        // Clear old text objects
        for (const t of textPool) { t.visible = false; app.stage.removeChild(t); t.destroy(); }
        textPool.length = 0;

        const g = new pixi.Graphics();
        const state = gsRef.current;
        const W = app.screen.width, H = app.screen.height;

        // Felt texture lines
        for (let i = 0; i < W; i += 20) {
          g.moveTo(i, 0).lineTo(i, H).stroke({ color: 0x1e6b32, width: 0.3 });
        }
        // Dealer area label
        const dl = new pixi.Text({ text: "庄家", style: { fontSize: 12, fill: 0x88cc88, fontFamily: "sans-serif" } });
        dl.x = 10; dl.y = 8; app.stage.addChild(dl); textPool.push(dl);

        // Dealer cards
        const dealerCards = state.dealer;
        const dcStartX = W / 2 - (dealerCards.length * (CW + 8)) / 2;
        for (let i = 0; i < dealerCards.length; i++) {
          const c = dealerCards[i];
          const tx = dcStartX + i * (CW + 8);
          const ty = 30;
          c.x += (tx - c.x) * 0.2; c.y += (ty - c.y) * 0.2;
          if (Math.abs(c.x - tx) < 0.5) c.x = tx;
          if (Math.abs(c.y - ty) < 0.5) c.y = ty;
          drawCard(g, c, pixi, app!);
        }

        // Dealer hand value
        if (dealerCards.length > 0) {
          const allUp = dealerCards.every(c => c.faceUp);
          const visCards = allUp ? dealerCards : dealerCards.filter(c => c.faceUp);
          const val = handValue(visCards);
          const valStr = allUp ? `${val.total}` : `${val.total}`;
          const vt = new pixi.Text({ text: valStr, style: { fontSize: 14, fill: 0xffffff, fontWeight: "bold", fontFamily: "monospace" } });
          vt.x = W / 2 - 10; vt.y = 12; app.stage.addChild(vt); textPool.push(vt);
        }

        // Player hands
        const handY = H - CH - 40;
        for (let h = 0; h < state.hands.length; h++) {
          const hand = state.hands[h];
          const hCards = hand.cards;
          const totalW = hCards.length * (CW + 8);
          const startX = W / 2 - totalW / 2 + (state.hands.length > 1 ? (h - 0.5) * (totalW + 20) : 0);
          for (let i = 0; i < hCards.length; i++) {
            const c = hCards[i];
            const tx = startX + i * (CW + 8);
            const ty = handY;
            c.x += (tx - c.x) * 0.2; c.y += (ty - c.y) * 0.2;
            if (Math.abs(c.x - tx) < 0.5) c.x = tx;
            if (Math.abs(c.y - ty) < 0.5) c.y = ty;
            drawCard(g, c, pixi, app!);
          }
          // Hand value
          if (hCards.length > 0) {
            const val = handValue(hCards);
            const active = h === state.activeHand && state.phase === "play";
            const vt = new pixi.Text({
              text: `${val.total}${val.soft ? " (软)" : ""}`,
              style: { fontSize: 13, fill: active ? 0x3ea6ff : 0xffffff, fontWeight: "bold", fontFamily: "monospace" }
            });
            vt.x = startX; vt.y = handY - 18; app.stage.addChild(vt); textPool.push(vt);
          }
          // Active hand indicator
          if (h === state.activeHand && state.phase === "play") {
            g.circle(startX + totalW / 2 - 4, handY - 26, 3).fill({ color: 0x3ea6ff });
          }
        }

        // Bet / chips display
        if (state.phase !== "bet") {
          drawChipStack(g, 20, H - 20, state.hands[0]?.bet ?? 0, pixi, app!);
        }

        // Message
        if (state.message && state.phase === "result") {
          const bg_w = Math.min(W - 40, 280);
          g.roundRect(W / 2 - bg_w / 2, H / 2 - 22, bg_w, 44, 8).fill({ color: 0x000000, alpha: 0.7 });
          const mt = new pixi.Text({
            text: state.message,
            style: { fontSize: 16, fill: 0xf0b90b, fontWeight: "bold", fontFamily: "sans-serif", align: "center" }
          });
          mt.anchor.set(0.5, 0.5); mt.x = W / 2; mt.y = H / 2; app.stage.addChild(mt); textPool.push(mt);
        }

        app.stage.addChild(g);
        rafRef.current = requestAnimationFrame(render);
        // Cleanup previous frame graphics (keep only latest)
        const children = app.stage.children;
        for (let i = children.length - 1; i >= 0; i--) {
          const child = children[i];
          if (child instanceof pixi.Graphics && child !== g) {
            app.stage.removeChild(child);
            child.destroy();
          }
        }
      }
      rafRef.current = requestAnimationFrame(render);
    }
    init();
    return () => {
      destroyed = true;
      destroyedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      if (app) { app.destroy(); appRef.current = null; }
    };
  }, []);

  // ─── Game Logic ──────────────────────────────────────────────────────────
  const drawFromShoe = useCallback((state: GameState): Card => {
    if (state.shoe.length < 20) state.shoe = makeShoe();
    const c = state.shoe.pop()!;
    c.faceUp = true; c.x = 300; c.y = -80;
    return c;
  }, []);

  const deal = useCallback(() => {
    setGs(prev => {
      if (prev.phase !== "bet" || prev.currentBet > prev.chips) return prev;
      const s = { ...prev, shoe: [...prev.shoe], dealer: [] as Card[], hands: [{ cards: [] as Card[], bet: prev.currentBet, done: false, doubled: false }], insurance: 0, phase: "play" as const, message: "", activeHand: 0 };
      s.chips -= s.currentBet;
      // Deal 2 to player, 2 to dealer (one face down)
      const p1 = drawFromShoe(s); s.hands[0].cards.push(p1);
      const d1 = drawFromShoe(s); d1.faceUp = true; s.dealer.push(d1);
      const p2 = drawFromShoe(s); s.hands[0].cards.push(p2);
      const d2 = drawFromShoe(s); d2.faceUp = false; s.dealer.push(d2);
      s.roundsPlayed++;
      soundRef.current?.playDeal();
      // Check player blackjack
      if (isBlackjack(s.hands[0].cards)) {
        s.dealer[1].faceUp = true;
        if (isBlackjack(s.dealer)) {
          s.chips += s.currentBet; // push
          s.message = "双方21点 - 平局";
          s.phase = "result";
        } else {
          s.chips += s.currentBet + Math.floor(s.currentBet * 1.5);
          s.message = "21点! 赢得 " + Math.floor(s.currentBet * 1.5) + " 筹码";
          s.phase = "result";
          soundRef.current?.playBlackjack();
        }
        s.peakChips = Math.max(s.peakChips, s.chips);
      }
      return s;
    });
  }, [drawFromShoe]);

  const resolveDealer = useCallback((state: GameState): GameState => {
    const s = { ...state, dealer: [...state.dealer] };
    s.dealer[1].faceUp = true;
    // Dealer hits on soft 17
    while (true) {
      const v = handValue(s.dealer);
      if (v.total < 17 || (v.total === 17 && v.soft)) {
        const c = drawFromShoe(s); s.dealer.push(c);
      } else break;
    }
    const dv = handValue(s.dealer).total;
    let totalWin = 0;
    const msgs: string[] = [];
    for (const hand of s.hands) {
      const pv = handValue(hand.cards).total;
      if (pv > 21) continue; // already busted
      if (dv > 21) {
        totalWin += hand.bet * 2;
        msgs.push("庄家爆牌!");
      } else if (pv > dv) {
        totalWin += hand.bet * 2;
        msgs.push("赢了!");
      } else if (pv === dv) {
        totalWin += hand.bet;
        msgs.push("平局");
      } else {
        msgs.push("输了");
      }
    }
    // Insurance payout
    if (s.insurance > 0 && isBlackjack(s.dealer)) {
      totalWin += s.insurance * 3;
      msgs.push("保险赢了!");
    }
    s.chips += totalWin;
    s.peakChips = Math.max(s.peakChips, s.chips);
    s.message = msgs.join(" | ");
    s.phase = "result";
    if (totalWin > 0) soundRef.current?.playWin(); else soundRef.current?.playLose();
    return s;
  }, [drawFromShoe]);

  const checkHandDone = useCallback((state: GameState): GameState => {
    let s = { ...state };
    // Move to next hand or dealer
    while (s.activeHand < s.hands.length && s.hands[s.activeHand].done) {
      s.activeHand++;
    }
    if (s.activeHand >= s.hands.length) {
      // All hands done, check if any non-busted
      const anyAlive = s.hands.some(h => handValue(h.cards).total <= 21);
      if (anyAlive) {
        return resolveDealer(s);
      } else {
        s.message = "全部爆牌!";
        s.phase = "result";
        soundRef.current?.playLose();
      }
    }
    return s;
  }, [resolveDealer]);

  const hit = useCallback(() => {
    setGs(prev => {
      if (prev.phase !== "play") return prev;
      const s = { ...prev, shoe: [...prev.shoe], hands: prev.hands.map(h => ({ ...h, cards: [...h.cards] })) };
      const hand = s.hands[s.activeHand];
      const c = drawFromShoe(s); hand.cards.push(c);
      soundRef.current?.playHit();
      const v = handValue(hand.cards).total;
      if (v > 21) { hand.done = true; return checkHandDone(s); }
      if (v === 21) { hand.done = true; return checkHandDone(s); }
      return s;
    });
  }, [drawFromShoe, checkHandDone]);

  const stand = useCallback(() => {
    setGs(prev => {
      if (prev.phase !== "play") return prev;
      const s = { ...prev, hands: prev.hands.map(h => ({ ...h, cards: [...h.cards] })) };
      s.hands[s.activeHand].done = true;
      return checkHandDone(s);
    });
  }, [checkHandDone]);

  const doubleDown = useCallback(() => {
    setGs(prev => {
      if (prev.phase !== "play") return prev;
      const hand = prev.hands[prev.activeHand];
      if (hand.cards.length !== 2 || prev.chips < hand.bet) return prev;
      const s = { ...prev, shoe: [...prev.shoe], hands: prev.hands.map(h => ({ ...h, cards: [...h.cards] })) };
      const h = s.hands[s.activeHand];
      s.chips -= h.bet; h.bet *= 2; h.doubled = true;
      const c = drawFromShoe(s); h.cards.push(c);
      soundRef.current?.playHit();
      h.done = true;
      return checkHandDone(s);
    });
  }, [drawFromShoe, checkHandDone]);

  const split = useCallback(() => {
    setGs(prev => {
      if (prev.phase !== "play") return prev;
      const hand = prev.hands[prev.activeHand];
      if (hand.cards.length !== 2 || hand.cards[0].rank !== hand.cards[1].rank || prev.chips < hand.bet) return prev;
      if (prev.hands.length >= 4) return prev; // max 4 hands
      const s = { ...prev, shoe: [...prev.shoe], hands: prev.hands.map(h => ({ ...h, cards: [...h.cards] })) };
      s.chips -= hand.bet;
      const card2 = s.hands[s.activeHand].cards.pop()!;
      const newHand: Hand = { cards: [card2], bet: hand.bet, done: false, doubled: false };
      // Deal one card to each
      const c1 = drawFromShoe(s); s.hands[s.activeHand].cards.push(c1);
      const c2 = drawFromShoe(s); newHand.cards.push(c2);
      s.hands.splice(s.activeHand + 1, 0, newHand);
      soundRef.current?.playDeal();
      return s;
    });
  }, [drawFromShoe]);

  const buyInsurance = useCallback(() => {
    setGs(prev => {
      if (prev.phase !== "play" || prev.insurance > 0) return prev;
      if (prev.dealer.length < 2 || prev.dealer[0].rank !== "A") return prev;
      const cost = Math.floor(prev.hands[0].bet / 2);
      if (prev.chips < cost) return prev;
      return { ...prev, chips: prev.chips - cost, insurance: cost };
    });
  }, []);

  const adjustBet = useCallback((delta: number) => {
    setGs(prev => {
      if (prev.phase !== "bet") return prev;
      const nb = Math.max(10, Math.min(500, Math.min(prev.chips, prev.currentBet + delta)));
      return { ...prev, currentBet: nb };
    });
  }, []);

  const newRound = useCallback(() => {
    setGs(prev => {
      if (prev.chips <= 0) return { ...initState(), message: "破产! 重新开始", peakChips: prev.peakChips };
      return { ...prev, phase: "bet" as const, message: "", dealer: [], hands: [{ cards: [], bet: 0, done: false, doubled: false }], activeHand: 0, insurance: 0 };
    });
  }, []);

  // ─── Score Submission ────────────────────────────────────────────────────
  useEffect(() => {
    if (gs.phase === "result" && gs.chips > 1000 && !scoreSubmittedRef.current) {
      scoreSubmittedRef.current = true;
      fetchWithAuth("/api/games/scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: gs.peakChips }),
      }).catch(() => {});
    }
    if (gs.phase === "bet") scoreSubmittedRef.current = false;
  }, [gs.phase, gs.chips, gs.peakChips]);

  // ─── Save / Load ────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const { shoe, ...rest } = gsRef.current;
    return { ...rest, shoeLen: shoe.length };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Partial<GameState> & { shoeLen?: number };
    if (d && typeof d.chips === "number") {
      setGs(prev => ({
        ...prev, ...d, shoe: d.shoeLen ? makeShoe().slice(0, d.shoeLen) : prev.shoe,
        dealer: d.dealer ?? [], hands: d.hands ?? [{ cards: [], bet: 0, done: false, doubled: false }],
        phase: "bet", message: "存档已加载",
      }));
    }
  }, []);

  const canHit = gs.phase === "play" && gs.hands[gs.activeHand] && !gs.hands[gs.activeHand].done;
  const canDouble = canHit && gs.hands[gs.activeHand].cards.length === 2 && gs.chips >= gs.hands[gs.activeHand].bet;
  const canSplit = canHit && gs.hands[gs.activeHand].cards.length === 2 && gs.hands[gs.activeHand].cards[0].rank === gs.hands[gs.activeHand].cards[1].rank && gs.chips >= gs.hands[gs.activeHand].bet && gs.hands.length < 4;
  const canInsurance = gs.phase === "play" && gs.insurance === 0 && gs.dealer.length >= 2 && gs.dealer[0].rank === "A" && gs.hands[0].cards.length === 2 && gs.chips >= Math.floor(gs.hands[0].bet / 2);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-4xl mx-auto px-3 pt-2 pb-20">
        {/* Top bar */}
        <div className="flex items-center gap-2 mb-3">
          <Link href="/games" className="p-2 rounded-lg hover:bg-[#1a1a1a] transition">
            <ArrowLeft size={18} className="text-[#aaa]" />
          </Link>
          <h1 className="text-lg font-bold text-[#3ea6ff] flex-1">21点</h1>
          <button onClick={() => setShowLB(!showLB)} className="p-2 rounded-lg hover:bg-[#1a1a1a] transition">
            <Trophy size={18} className="text-[#f0b90b]" />
          </button>
          <button onClick={() => { const m = soundRef.current?.toggleMute(); setMuted(m ?? false); }} className="p-2 rounded-lg hover:bg-[#1a1a1a] transition">
            {muted ? <VolumeX size={18} className="text-[#666]" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        {/* Chips display */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2 text-sm">
            <Coins size={16} className="text-[#f0b90b]" />
            <span className="text-[#f0b90b] font-bold">{gs.chips}</span>
            <span className="text-[#666]">筹码</span>
          </div>
          <div className="text-xs text-[#666]">第 {gs.roundsPlayed} 局 | 最高 {gs.peakChips}</div>
        </div>

        {/* Canvas */}
        <div className="rounded-xl overflow-hidden border border-[#333] mb-3">
          <canvas ref={canvasRef} className="w-full" style={{ aspectRatio: "600/420" }} />
        </div>

        {/* Bet controls */}
        {gs.phase === "bet" && (
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4 mb-3">
            <div className="text-center mb-3 text-sm text-[#aaa]">下注金额</div>
            <div className="flex items-center justify-center gap-3 mb-3">
              <button onClick={() => adjustBet(-50)} className="px-3 py-1.5 rounded-lg bg-[#333] text-white text-sm hover:bg-[#444] transition">-50</button>
              <button onClick={() => adjustBet(-10)} className="px-3 py-1.5 rounded-lg bg-[#333] text-white text-sm hover:bg-[#444] transition">-10</button>
              <span className="text-2xl font-bold text-[#f0b90b] w-20 text-center">{gs.currentBet}</span>
              <button onClick={() => adjustBet(10)} className="px-3 py-1.5 rounded-lg bg-[#333] text-white text-sm hover:bg-[#444] transition">
                <Plus size={14} className="inline" /> 10
              </button>
              <button onClick={() => adjustBet(50)} className="px-3 py-1.5 rounded-lg bg-[#333] text-white text-sm hover:bg-[#444] transition">
                <Plus size={14} className="inline" /> 50
              </button>
            </div>
            <button onClick={deal} disabled={gs.currentBet > gs.chips || gs.currentBet < 10}
              className="w-full py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-base hover:bg-[#5bb8ff] transition disabled:opacity-40">
              发牌
            </button>
          </div>
        )}

        {/* Play controls */}
        {gs.phase === "play" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <button onClick={hit} disabled={!canHit}
              className="py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition disabled:opacity-40">
              要牌
            </button>
            <button onClick={stand} disabled={!canHit}
              className="py-3 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold hover:bg-[#f5cc3d] transition disabled:opacity-40">
              停牌
            </button>
            <button onClick={doubleDown} disabled={!canDouble}
              className="py-3 rounded-xl bg-[#e74c3c] text-white font-bold hover:bg-[#ff6b5b] transition disabled:opacity-40">
              加倍
            </button>
            <button onClick={split} disabled={!canSplit}
              className="py-3 rounded-xl bg-[#9b59b6] text-white font-bold hover:bg-[#b06cc8] transition disabled:opacity-40">
              分牌
            </button>
            {canInsurance && (
              <button onClick={buyInsurance}
                className="col-span-2 sm:col-span-4 py-2 rounded-xl bg-[#333] text-[#3ea6ff] font-bold border border-[#3ea6ff]/30 hover:bg-[#3ea6ff]/10 transition">
                保险 ({Math.floor(gs.hands[0].bet / 2)} 筹码)
              </button>
            )}
          </div>
        )}

        {/* Result */}
        {gs.phase === "result" && (
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4 mb-3 text-center">
            <div className="text-lg font-bold mb-2 text-[#f0b90b]">{gs.message}</div>
            <div className="text-sm text-[#aaa] mb-3">当前筹码: <span className="text-[#3ea6ff] font-bold">{gs.chips}</span></div>
            <button onClick={newRound}
              className="px-8 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition">
              {gs.chips <= 0 ? "重新开始" : "下一局"}
            </button>
          </div>
        )}

        {/* Leaderboard */}
        {showLB && (
          <div className="mb-3">
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        )}

        {/* Save/Load */}
        <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
      </div>
    </div>
  );
}
