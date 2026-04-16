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

const GAME_ID = "poker-stud";
const W = 700, H = 500;
const SUITS = ["spade", "heart", "diamond", "club"] as const;
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as const;
type Suit = typeof SUITS[number];
type Rank = typeof RANKS[number];
interface Card { suit: Suit; rank: Rank; faceUp: boolean; }
type Action = "fold" | "call" | "raise" | "allin";
interface Player { name: string; chips: number; hand: Card[]; folded: boolean; allIn: boolean; bet: number; isHuman: boolean; }
interface GameState {
  players: Player[]; deck: Card[]; pot: number; round: number; /* 0-3 betting rounds */
  currentPlayer: number; highBet: number; phase: "betting" | "showdown" | "idle";
  dealerIdx: number; message: string; winner: number; handRank: string;
  roundStarter: number; actedThisRound: Set<number>;
}

const ANTE = 10;
const START_CHIPS = 1000;

// ─── Sound ───
class StudSound {
  private ctx: AudioContext | null = null; private muted = false;
  private getCtx() { if (!this.ctx) this.ctx = new AudioContext(); return this.ctx; }
  private tone(f: number, d: number, type: OscillatorType = "sine", vol = 0.12) {
    if (this.muted) return; try { const c = this.getCtx(); const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + d); } catch {} }
  playDeal() { this.tone(600, 0.08, "triangle"); setTimeout(() => this.tone(800, 0.06, "triangle"), 40); }
  playBet() { this.tone(440, 0.1, "sine"); this.tone(550, 0.08, "sine"); }
  playWin() { [523,659,784,1047].forEach((f,i) => setTimeout(() => this.tone(f, 0.2, "triangle"), i*100)); }
  playLose() { [400,350,300,250].forEach((f,i) => setTimeout(() => this.tone(f, 0.2, "sawtooth", 0.08), i*120)); }
  playAllIn() { this.tone(880, 0.15, "square", 0.1); setTimeout(() => this.tone(1100, 0.2, "square", 0.1), 80); }
  toggleMute() { this.muted = !this.muted; return this.muted; }
  isMuted() { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

// ─── Deck & Hand Evaluation ───
function makeDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r, faceUp: false });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function rankVal(r: Rank): number { const i = RANKS.indexOf(r); return i + 2; }
function handScore(cards: Card[]): { score: number; name: string } {
  if (cards.length < 5) return { score: 0, name: "未完成" };
  const vals = cards.map(c => rankVal(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const flush = suits.every(s => s === suits[0]);
  const sorted = [...vals].sort((a, b) => a - b);
  const straight = sorted.every((v, i) => i === 0 || v === sorted[i-1] + 1)
    || (sorted.join(",") === "2,3,4,5,14"); // A-low straight
  const counts: Record<number, number> = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.values(counts).sort((a, b) => b - a);
  const highCard = vals[0];

  if (flush && straight && sorted[4] === 14 && sorted[0] === 10) return { score: 9e8 + highCard, name: "皇家同花顺" };
  if (flush && straight) return { score: 8e8 + sorted[4], name: "同花顺" };
  if (groups[0] === 4) { const qv = +Object.keys(counts).find(k => counts[+k] === 4)!; return { score: 7e8 + qv * 100 + highCard, name: "四条" }; }
  if (groups[0] === 3 && groups[1] === 2) { const tv = +Object.keys(counts).find(k => counts[+k] === 3)!; return { score: 6e8 + tv * 100 + highCard, name: "葫芦" }; }
  if (flush) return { score: 5e8 + highCard * 1e4 + vals[1] * 1e3 + vals[2] * 100 + vals[3] * 10 + vals[4], name: "同花" };
  if (straight) return { score: 4e8 + sorted[4], name: "顺子" };
  if (groups[0] === 3) { const tv = +Object.keys(counts).find(k => counts[+k] === 3)!; return { score: 3e8 + tv * 100 + highCard, name: "三条" }; }
  if (groups[0] === 2 && groups[1] === 2) { const pairs = Object.keys(counts).filter(k => counts[+k] === 2).map(Number).sort((a,b) => b-a); return { score: 2e8 + pairs[0] * 1e4 + pairs[1] * 100 + highCard, name: "两对" }; }
  if (groups[0] === 2) { const pv = +Object.keys(counts).find(k => counts[+k] === 2)!; return { score: 1e8 + pv * 1e4 + highCard, name: "一对" }; }
  return { score: highCard * 1e4 + vals[1] * 1e3 + vals[2] * 100 + vals[3] * 10 + vals[4], name: "高牌" };
}

// Evaluate visible hand strength (for betting order & AI)
function visibleStrength(cards: Card[]): number {
  const up = cards.filter(c => c.faceUp);
  if (up.length === 0) return 0;
  const vals = up.map(c => rankVal(c.rank)).sort((a, b) => b - a);
  const counts: Record<number, number> = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const maxGroup = Math.max(...Object.values(counts));
  return maxGroup * 100 + vals[0];
}

// AI decision
function aiDecide(player: Player, highBet: number, pot: number): { action: Action; amount: number } {
  const allCards = player.hand;
  const strength = visibleStrength(allCards);
  const fullScore = allCards.length >= 5 ? handScore(allCards).score : 0;
  const toCall = highBet - player.bet;
  const bluff = Math.random() < 0.12;

  if (allCards.length >= 5 && fullScore > 3e8) return { action: "raise", amount: Math.min(pot, player.chips) };
  if (strength > 250 || fullScore > 2e8 || bluff) {
    if (player.chips <= toCall) return { action: "allin", amount: player.chips };
    if (strength > 300 || fullScore > 4e8) return { action: "raise", amount: Math.min(toCall + Math.floor(pot * 0.5), player.chips) };
    return { action: "call", amount: Math.min(toCall, player.chips) };
  }
  if (strength > 150 || toCall === 0) return { action: "call", amount: Math.min(toCall, player.chips) };
  if (toCall > player.chips * 0.3) return { action: "fold", amount: 0 };
  return { action: "call", amount: Math.min(toCall, player.chips) };
}

// Find player with best visible hand (for betting order)
function findBestVisible(players: Player[]): number {
  let best = -1, bestStr = -1;
  players.forEach((p, i) => { if (!p.folded && p.chips > 0) { const s = visibleStrength(p.hand); if (s > bestStr) { bestStr = s; best = i; } } });
  return best >= 0 ? best : 0;
}

function nextActive(players: Player[], from: number): number {
  for (let i = 1; i <= players.length; i++) {
    const idx = (from + i) % players.length;
    if (!players[idx].folded && players[idx].chips > 0 && !players[idx].allIn) return idx;
  }
  return -1;
}

function activePlayers(players: Player[]): number { return players.filter(p => !p.folded).length; }
function canActPlayers(players: Player[]): number { return players.filter(p => !p.folded && !p.allIn && p.chips > 0).length; }

// ─── Drawing helpers ───
function drawSuitShape(g: PixiGraphics, suit: Suit, x: number, y: number, size: number) {
  const s = size;
  if (suit === "heart") {
    g.moveTo(x, y + s * 0.3).bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3)
     .bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s)
     .bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3)
     .bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3).fill({ color: 0xff3333 });
  } else if (suit === "diamond") {
    g.moveTo(x, y).lineTo(x + s * 0.4, y + s * 0.5).lineTo(x, y + s).lineTo(x - s * 0.4, y + s * 0.5).closePath().fill({ color: 0xff3333 });
  } else if (suit === "club") {
    g.circle(x, y + s * 0.3, s * 0.25).fill({ color: 0xffffff });
    g.circle(x - s * 0.22, y + s * 0.55, s * 0.25).fill({ color: 0xffffff });
    g.circle(x + s * 0.22, y + s * 0.55, s * 0.25).fill({ color: 0xffffff });
    g.rect(x - s * 0.06, y + s * 0.6, s * 0.12, s * 0.4).fill({ color: 0xffffff });
  } else { // spade
    g.moveTo(x, y).bezierCurveTo(x - s * 0.5, y + s * 0.4, x - s * 0.5, y + s * 0.8, x, y + s * 0.65)
     .bezierCurveTo(x + s * 0.5, y + s * 0.8, x + s * 0.5, y + s * 0.4, x, y).fill({ color: 0xffffff });
    g.rect(x - s * 0.06, y + s * 0.6, s * 0.12, s * 0.4).fill({ color: 0xffffff });
  }
}

// ─── Main Component ───
export default function PokerStudPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<"title" | "game" | "result">("title");
  const [score, setScore] = useState(0);
  const [muted, setMuted] = useState(false);
  const [totalWins, setTotalWins] = useState(0);
  const [totalGames, setTotalGames] = useState(0);

  const soundRef = useRef<StudSound | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const screenRef = useRef(screen);
  const scoreRef = useRef(score);

  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  useEffect(() => { soundRef.current = new StudSound(); return () => { soundRef.current?.dispose(); }; }, []);

  useEffect(() => {
    try { const s = localStorage.getItem("poker-stud-stats");
      if (s) { const d = JSON.parse(s); setTotalWins(d.wins || 0); setTotalGames(d.games || 0); }
    } catch {}
  }, []);

  const saveStats = useCallback((wins: number, games: number) => {
    try { localStorage.setItem("poker-stud-stats", JSON.stringify({ wins, games })); } catch {}
  }, []);

  // ─── Game Init ───
  const initGame = useCallback(() => {
    const deck = makeDeck();
    const players: Player[] = [
      { name: "你", chips: START_CHIPS, hand: [], folded: false, allIn: false, bet: 0, isHuman: true },
      { name: "AI-甲", chips: START_CHIPS, hand: [], folded: false, allIn: false, bet: 0, isHuman: false },
      { name: "AI-乙", chips: START_CHIPS, hand: [], folded: false, allIn: false, bet: 0, isHuman: false },
      { name: "AI-丙", chips: START_CHIPS, hand: [], folded: false, allIn: false, bet: 0, isHuman: false },
    ];
    // Ante
    let pot = 0;
    players.forEach(p => { const a = Math.min(ANTE, p.chips); p.chips -= a; p.bet = a; pot += a; });
    // Deal 1 face-down + 1 face-up
    players.forEach(p => { const c1 = deck.pop()!; c1.faceUp = false; p.hand.push(c1); });
    players.forEach(p => { const c2 = deck.pop()!; c2.faceUp = true; p.hand.push(c2); });
    soundRef.current?.playDeal();

    const starter = findBestVisible(players);
    stateRef.current = {
      players, deck, pot, round: 0, currentPlayer: starter, highBet: ANTE,
      phase: "betting", dealerIdx: 0, message: "第一轮下注", winner: -1, handRank: "",
      roundStarter: starter, actedThisRound: new Set(),
    };
    setScore(0);
    setScreen("game");
  }, []);

  // ─── Player Actions ───
  const doAction = useCallback((action: Action, raiseAmt?: number) => {
    const gs = stateRef.current;
    if (!gs || gs.phase !== "betting" || gs.currentPlayer !== 0) return;
    applyAction(gs, 0, action, raiseAmt);
    advanceTurn(gs);
  }, []);

  function applyAction(gs: GameState, idx: number, action: Action, raiseAmt?: number) {
    const p = gs.players[idx];
    if (action === "fold") { p.folded = true; soundRef.current?.playBet(); return; }
    if (action === "allin") {
      const amt = p.chips; gs.pot += amt; p.bet += amt; p.chips = 0; p.allIn = true;
      if (p.bet > gs.highBet) gs.highBet = p.bet;
      soundRef.current?.playAllIn(); return;
    }
    const toCall = gs.highBet - p.bet;
    if (action === "call") {
      const amt = Math.min(toCall, p.chips); p.chips -= amt; p.bet += amt; gs.pot += amt;
      if (p.chips === 0) p.allIn = true;
      soundRef.current?.playBet(); return;
    }
    if (action === "raise") {
      const raise = raiseAmt || Math.min(gs.pot, p.chips);
      const total = Math.min(toCall + raise, p.chips);
      p.chips -= total; p.bet += total; gs.pot += total;
      if (p.bet > gs.highBet) gs.highBet = p.bet;
      if (p.chips === 0) p.allIn = true;
      gs.actedThisRound.clear(); gs.actedThisRound.add(idx);
      soundRef.current?.playBet(); return;
    }
  }

  function advanceTurn(gs: GameState) {
    gs.actedThisRound.add(gs.currentPlayer);
    // Check if only one player left
    if (activePlayers(gs.players) <= 1) { finishHand(gs); return; }
    // Check if betting round is complete
    const canAct = gs.players.filter((p, i) => !p.folded && !p.allIn && p.chips > 0);
    const allMatched = canAct.every(p => p.bet === gs.highBet);
    const allActed = canAct.every((p, i) => {
      const realIdx = gs.players.indexOf(p);
      return gs.actedThisRound.has(realIdx);
    });

    if (canActPlayers(gs.players) === 0 || (allMatched && allActed)) {
      nextRound(gs); return;
    }
    const nxt = nextActive(gs.players, gs.currentPlayer);
    if (nxt < 0) { nextRound(gs); return; }
    gs.currentPlayer = nxt;
    // AI auto-play
    if (!gs.players[nxt].isHuman && gs.phase === "betting") {
      setTimeout(() => {
        if (!stateRef.current || stateRef.current.phase !== "betting") return;
        const decision = aiDecide(gs.players[nxt], gs.highBet, gs.pot);
        applyAction(gs, nxt, decision.action, decision.amount);
        advanceTurn(gs);
      }, 400 + Math.random() * 300);
    }
  }

  function nextRound(gs: GameState) {
    gs.round++;
    gs.players.forEach(p => p.bet = 0);
    gs.highBet = 0;
    gs.actedThisRound = new Set();

    if (gs.round >= 4 || activePlayers(gs.players) <= 1) { finishHand(gs); return; }
    // Deal one more face-up card
    gs.players.forEach(p => {
      if (!p.folded && gs.deck.length > 0) {
        const c = gs.deck.pop()!; c.faceUp = true; p.hand.push(c);
      }
    });
    soundRef.current?.playDeal();
    gs.message = `第${gs.round + 1}轮下注`;
    const starter = findBestVisible(gs.players);
    gs.currentPlayer = starter;
    gs.roundStarter = starter;

    if (!gs.players[starter].isHuman && gs.phase === "betting") {
      setTimeout(() => {
        if (!stateRef.current || stateRef.current.phase !== "betting") return;
        const decision = aiDecide(gs.players[starter], gs.highBet, gs.pot);
        applyAction(gs, starter, decision.action, decision.amount);
        advanceTurn(gs);
      }, 500);
    }
  }

  function finishHand(gs: GameState) {
    gs.phase = "showdown";
    // Reveal all cards
    gs.players.forEach(p => p.hand.forEach(c => c.faceUp = true));
    const remaining = gs.players.map((p, i) => ({ p, i })).filter(x => !x.p.folded);
    if (remaining.length === 1) {
      gs.winner = remaining[0].i;
      gs.handRank = "其他玩家弃牌";
    } else {
      let bestIdx = -1, bestScore = -1, bestName = "";
      remaining.forEach(({ p, i }) => {
        const h = handScore(p.hand);
        if (h.score > bestScore) { bestScore = h.score; bestIdx = i; bestName = h.name; }
      });
      gs.winner = bestIdx;
      gs.handRank = bestName;
    }
    gs.players[gs.winner].chips += gs.pot;
    gs.message = `${gs.players[gs.winner].name} 赢得 ${gs.pot} 筹码 (${gs.handRank})`;
    gs.pot = 0;

    if (gs.winner === 0) {
      soundRef.current?.playWin();
      const sc = gs.players[0].chips - START_CHIPS + 100;
      setScore(Math.max(0, sc));
      setTotalWins(w => { const nw = w + 1; saveStats(nw, totalGames + 1); return nw; });
    } else {
      soundRef.current?.playLose();
      setTotalGames(g => { const ng = g + 1; saveStats(totalWins, ng); return ng; });
    }

    // Auto-start next hand after delay or show result if player is broke
    setTimeout(() => {
      if (!stateRef.current) return;
      if (gs.players[0].chips <= 0) {
        setScreen("result");
        fetchWithAuth("/api/games/scores", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game_id: GAME_ID, score: scoreRef.current }),
        }).catch(() => {});
        return;
      }
      // Remove broke AI, reset for next hand
      startNextHand(gs);
    }, 2500);
  }

  function startNextHand(gs: GameState) {
    gs.deck = makeDeck();
    gs.round = 0; gs.phase = "betting"; gs.winner = -1; gs.handRank = "";
    gs.players.forEach(p => { p.hand = []; p.folded = false; p.allIn = false; p.bet = 0; });
    // Refill broke AI
    gs.players.forEach((p, i) => { if (!p.isHuman && p.chips <= 0) p.chips = START_CHIPS; });
    // Ante
    gs.players.forEach(p => { const a = Math.min(ANTE, p.chips); p.chips -= a; p.bet = a; gs.pot += a; });
    gs.highBet = ANTE;
    // Deal
    gs.players.forEach(p => { const c = gs.deck.pop()!; c.faceUp = false; p.hand.push(c); });
    gs.players.forEach(p => { const c = gs.deck.pop()!; c.faceUp = true; p.hand.push(c); });
    soundRef.current?.playDeal();
    const starter = findBestVisible(gs.players);
    gs.currentPlayer = starter; gs.roundStarter = starter;
    gs.actedThisRound = new Set();
    gs.message = "新一手 - 第一轮下注";

    if (!gs.players[starter].isHuman) {
      setTimeout(() => {
        if (!stateRef.current || stateRef.current.phase !== "betting") return;
        const decision = aiDecide(gs.players[starter], gs.highBet, gs.pot);
        applyAction(gs, starter, decision.action, decision.amount);
        advanceTurn(gs);
      }, 500);
    }
  }

  // ─── PixiJS Rendering ───
  useEffect(() => {
    if (screen !== "game" && screen !== "result") return;
    const canvas = canvasRef.current; if (!canvas) return;
    let destroyed = false;
    let app: Application | null = null;
    let animId = 0;

    async function init() {
      const pixi = await loadPixi();
      if (destroyed) return;
      app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0a1a0a, antialias: true });
      if (destroyed) { app.destroy(true); return; }

      const g: PixiGraphics = new pixi.Graphics();
      app.stage.addChild(g);
      const texts: InstanceType<typeof pixi.Text>[] = [];
      for (let i = 0; i < 100; i++) {
        const t = new pixi.Text({ text: "", style: { fontSize: 12, fill: 0xffffff, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" } });
        t.visible = false; app.stage.addChild(t); texts.push(t);
      }

      function render() {
        if (destroyed) return;
        g.clear();
        for (const t of texts) { t.visible = false; t.alpha = 1; }
        const ti = { i: 0 };
        const gs = stateRef.current;

        // Felt background
        g.rect(0, 0, W, H).fill({ color: 0x0a1a0a });
        g.ellipse(W / 2, H / 2, W / 2 - 20, H / 2 - 30).fill({ color: 0x1a5c2a });
        g.ellipse(W / 2, H / 2, W / 2 - 22, H / 2 - 32).stroke({ color: 0x2a7a3a, width: 3 });

        if (!gs) { animId = requestAnimationFrame(render); return; }

        // Pot display
        if (ti.i < texts.length) {
          const t = texts[ti.i++];
          t.text = `底池: ${gs.pot}`; t.style.fontSize = 16; t.style.fontWeight = "bold"; t.style.fill = 0xffd700;
          t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = H / 2 - 30; t.visible = true;
        }
        // Round indicator
        if (ti.i < texts.length) {
          const t = texts[ti.i++];
          t.text = gs.phase === "showdown" ? "摊牌" : `第${gs.round + 1}/4轮`;
          t.style.fontSize = 12; t.style.fontWeight = "normal"; t.style.fill = 0xaaaaaa;
          t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = H / 2 - 10; t.visible = true;
        }
        // Message
        if (gs.message && ti.i < texts.length) {
          const t = texts[ti.i++];
          t.text = gs.message; t.style.fontSize = 13; t.style.fontWeight = "bold"; t.style.fill = 0x3ea6ff;
          t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = H / 2 + 10; t.visible = true;
        }

        // Player positions: 0=bottom, 1=left, 2=top, 3=right
        const positions = [
          { x: W / 2, y: H - 30, cardY: H - 130, labelY: H - 15 },
          { x: 60, y: H / 2, cardY: H / 2 - 50, labelY: H / 2 + 55 },
          { x: W / 2, y: 30, cardY: 45, labelY: 18 },
          { x: W - 60, y: H / 2, cardY: H / 2 - 50, labelY: H / 2 + 55 },
        ];

        gs.players.forEach((p, pi) => {
          const pos = positions[pi];
          const isActive = gs.currentPlayer === pi && gs.phase === "betting";
          const cardW = pi === 0 ? 48 : 36;
          const cardH = pi === 0 ? 68 : 50;
          const totalCards = p.hand.length;
          const gap = pi === 0 ? 6 : 4;
          const startX = pos.x - (totalCards * (cardW + gap) - gap) / 2;

          // Highlight active player
          if (isActive) {
            g.roundRect(startX - 8, pos.cardY - 8, totalCards * (cardW + gap) + 8, cardH + 16, 8)
             .stroke({ color: 0x3ea6ff, width: 2 });
          }

          // Draw cards
          p.hand.forEach((card, ci) => {
            const cx = startX + ci * (cardW + gap);
            const cy = pos.cardY;
            const showFace = card.faceUp && (pi === 0 || card.faceUp);
            const isHole = ci === 0 && pi !== 0 && gs.phase !== "showdown";

            if (isHole || (!card.faceUp && pi !== 0)) {
              // Face-down card
              g.roundRect(cx, cy, cardW, cardH, 4).fill({ color: 0x2244aa });
              g.roundRect(cx, cy, cardW, cardH, 4).stroke({ color: 0x3355cc, width: 1 });
              g.roundRect(cx + 3, cy + 3, cardW - 6, cardH - 6, 2).stroke({ color: 0x4466dd, width: 1 });
            } else if (card.faceUp || pi === 0) {
              // Face-up card
              g.roundRect(cx, cy, cardW, cardH, 4).fill({ color: 0xf5f5f0 });
              g.roundRect(cx, cy, cardW, cardH, 4).stroke({ color: 0x999999, width: 1 });
              const isRed = card.suit === "heart" || card.suit === "diamond";
              // Rank text
              if (ti.i < texts.length) {
                const t = texts[ti.i++];
                t.text = card.rank; t.style.fontSize = pi === 0 ? 14 : 10;
                t.style.fontWeight = "bold"; t.style.fill = isRed ? 0xcc0000 : 0x111111;
                t.anchor.set(0, 0); t.x = cx + 3; t.y = cy + 2; t.visible = true;
              }
              // Suit shape
              drawSuitShape(g, card.suit, cx + cardW / 2, cy + (pi === 0 ? 22 : 16), pi === 0 ? 14 : 10);
            }
          });

          // Player label
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = `${p.name}${p.folded ? " (弃牌)" : p.allIn ? " (梭哈)" : ""}`;
            t.style.fontSize = 11; t.style.fontWeight = "bold";
            t.style.fill = p.folded ? 0x666666 : pi === 0 ? 0x3ea6ff : 0xdddddd;
            t.anchor.set(0.5, 0); t.x = pos.x; t.y = pos.labelY; t.visible = true;
          }
          // Chips
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = `${p.chips} 筹码`; t.style.fontSize = 10; t.style.fontWeight = "normal";
            t.style.fill = 0xffd700; t.anchor.set(0.5, 0); t.x = pos.x; t.y = pos.labelY + 14; t.visible = true;
          }
          // Current bet
          if (p.bet > 0 && ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = `下注: ${p.bet}`; t.style.fontSize = 9; t.style.fontWeight = "normal";
            t.style.fill = 0xff9900; t.anchor.set(0.5, 0); t.x = pos.x; t.y = pos.labelY + 27; t.visible = true;
          }

          // Winner highlight
          if (gs.phase === "showdown" && gs.winner === pi) {
            g.roundRect(startX - 10, pos.cardY - 10, totalCards * (cardW + gap) + 12, cardH + 20, 8)
             .stroke({ color: 0xffd700, width: 3 });
          }
        });

        // Action buttons area (drawn on canvas for reference, actual buttons in HTML)
        if (gs.phase === "betting" && gs.currentPlayer === 0) {
          const btnY = H - 160;
          g.roundRect(W / 2 - 200, btnY, 400, 28, 6).fill({ color: 0x000000, alpha: 0.5 });
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = "请选择操作"; t.style.fontSize = 12; t.style.fontWeight = "bold"; t.style.fill = 0x3ea6ff;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = btnY + 14; t.visible = true;
          }
        }

        animId = requestAnimationFrame(render);
      }
      render();
    }
    init();
    return () => { destroyed = true; cancelAnimationFrame(animId); if (app) { app.destroy(true); app = null; } };
  }, [screen]);

  // ─── Save / Load ───
  const handleSave = useCallback(() => {
    const gs = stateRef.current;
    if (!gs) return { chips: START_CHIPS, wins: totalWins, games: totalGames };
    return { chips: gs.players[0].chips, wins: totalWins, games: totalGames, score };
  }, [totalWins, totalGames, score]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as { wins?: number; games?: number };
    if (d.wins !== undefined) setTotalWins(d.wins);
    if (d.games !== undefined) setTotalGames(d.games);
    setScreen("title");
  }, []);

  const gs = stateRef.current;
  const isPlayerTurn = gs?.phase === "betting" && gs?.currentPlayer === 0;
  const toCall = gs ? gs.highBet - (gs.players[0]?.bet || 0) : 0;
  const playerChips = gs?.players[0]?.chips || 0;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ArrowLeft size={16} /> 返回游戏中心
        </Link>
        <div className="flex items-center gap-2 mb-4">
          <Coins size={24} className="text-[#3ea6ff]" />
          <h1 className="text-xl font-bold">梭哈</h1>
          <span className="text-xs text-gray-500 ml-1">五张牌梭哈</span>
          <button onClick={() => { const m = soundRef.current?.toggleMute(); setMuted(!!m); }}
            className="ml-auto p-2 rounded-lg hover:bg-white/10">
            {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        {screen === "title" && (
          <div className="text-center space-y-6">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#1a2a1a] to-[#0f0f0f] p-8">
              <Coins size={48} className="text-[#3ea6ff] mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-[#3ea6ff] mb-2">梭哈</h2>
              <p className="text-gray-400 mb-6">经典五张牌梭哈扑克，与三位AI对手一决高下</p>
              <button onClick={initGame}
                className="flex items-center gap-2 px-8 py-3 bg-[#3ea6ff] rounded-xl font-bold hover:bg-[#3ea6ff]/80 transition mx-auto">
                <Plus size={18} /> 开始游戏
              </button>
              <div className="mt-6 flex justify-center gap-8 text-sm text-gray-400">
                <span>胜场: {totalWins}</span><span>总局: {totalGames}</span>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 text-left text-sm text-gray-400 space-y-1">
              <p className="text-[#3ea6ff] font-bold mb-2">游戏规则</p>
              <p>4位玩家，每人底注10筹码，起始1000筹码</p>
              <p>每人发1张暗牌+1张明牌，共4轮下注</p>
              <p>每轮下注后发1张明牌，最终5张牌(1暗4明)</p>
              <p>明牌最大者先行动，可跟注/加注/弃牌/梭哈</p>
              <p>牌型: 皇家同花顺 &gt; 同花顺 &gt; 四条 &gt; 葫芦 &gt; 同花 &gt; 顺子 &gt; 三条 &gt; 两对 &gt; 一对 &gt; 高牌</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
              <GameLeaderboard gameId={GAME_ID} />
            </div>
          </div>
        )}

        {(screen === "game" || screen === "result") && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span>筹码: <span className="text-[#ffd700] font-bold">{playerChips}</span></span>
              <span>底池: <span className="text-[#ffd700]">{gs?.pot || 0}</span></span>
              <span>轮次: {(gs?.round || 0) + 1}/4</span>
              {gs?.phase === "showdown" && gs.winner >= 0 && (
                <span className="text-[#3ea6ff] font-bold ml-auto flex items-center gap-1">
                  <Trophy size={14} /> {gs.players[gs.winner].name} 获胜 ({gs.handRank})
                </span>
              )}
            </div>

            <canvas ref={canvasRef} width={W} height={H}
              className="w-full max-w-[700px] mx-auto rounded-xl border border-[#333] bg-[#1a1a1a]"
              style={{ aspectRatio: `${W}/${H}` }} />

            {/* Action Buttons */}
            {isPlayerTurn && !gs?.players[0].folded && (
              <div className="flex flex-wrap justify-center gap-2">
                {toCall === 0 ? (
                  <button onClick={() => doAction("call")}
                    className="px-5 py-2 bg-[#3ea6ff] rounded-lg font-bold text-sm hover:bg-[#3ea6ff]/80 transition">
                    过牌
                  </button>
                ) : (
                  <button onClick={() => doAction("call")}
                    className="px-5 py-2 bg-[#3ea6ff] rounded-lg font-bold text-sm hover:bg-[#3ea6ff]/80 transition"
                    disabled={playerChips <= 0}>
                    跟注 ({Math.min(toCall, playerChips)})
                  </button>
                )}
                <button onClick={() => doAction("raise", Math.min(gs!.pot, playerChips))}
                  className="px-5 py-2 bg-[#ff9900] rounded-lg font-bold text-sm hover:bg-[#ff9900]/80 transition"
                  disabled={playerChips <= toCall}>
                  加注 ({Math.min(gs!.pot, playerChips - toCall)})
                </button>
                <button onClick={() => doAction("allin")}
                  className="px-5 py-2 bg-[#ff3333] rounded-lg font-bold text-sm hover:bg-[#ff3333]/80 transition"
                  disabled={playerChips <= 0}>
                  梭哈(全下) ({playerChips})
                </button>
                <button onClick={() => doAction("fold")}
                  className="px-5 py-2 bg-[#333] rounded-lg font-bold text-sm hover:bg-[#444] transition">
                  弃牌
                </button>
              </div>
            )}

            {gs?.phase === "showdown" && (
              <div className="text-center text-sm text-gray-400">
                {gs.players[0].chips > 0 ? "下一手即将开始..." : ""}
              </div>
            )}

            {screen === "result" && (
              <div className="text-center space-y-4 py-4">
                <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-6">
                  <h3 className="text-2xl font-bold text-[#ff4757] mb-2">游戏结束</h3>
                  <p className="text-gray-400 mb-2">你的筹码已耗尽</p>
                  <p className="text-[#ffd700] text-lg font-bold mb-4">最终得分: {score}</p>
                  <div className="flex justify-center gap-3">
                    <button onClick={initGame}
                      className="px-6 py-2 bg-[#3ea6ff] rounded-lg font-bold hover:bg-[#3ea6ff]/80 transition">
                      再来一局
                    </button>
                    <button onClick={() => setScreen("title")}
                      className="px-6 py-2 bg-[#333] rounded-lg font-bold hover:bg-[#444] transition">
                      返回标题
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
