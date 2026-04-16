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

const GAME_ID = "baccarat";
const W = 800, H = 500;
const SUITS = ["spade", "heart", "diamond", "club"] as const;
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"] as const;
type Suit = typeof SUITS[number];
type Card = { suit: Suit; rank: typeof RANKS[number]; value: number };
type BetType = "player" | "banker" | "tie";
type RoadResult = "P" | "B" | "T";

function cardValue(rank: string): number {
  if (rank === "A") return 1;
  const n = parseInt(rank);
  if (!isNaN(n) && n >= 2 && n <= 9) return n;
  return 0;
}
function handTotal(cards: Card[]): number {
  return cards.reduce((s, c) => s + c.value, 0) % 10;
}
function createShoe(): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < 8; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        shoe.push({ suit, rank, value: cardValue(rank) });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

// Third-card rules
function playerDrawsThird(pTotal: number): boolean { return pTotal <= 5; }
function bankerDrawsThird(bTotal: number, playerThirdValue: number | null): boolean {
  if (playerThirdValue === null) return bTotal <= 5;
  if (bTotal <= 2) return true;
  if (bTotal === 3) return playerThirdValue !== 8;
  if (bTotal === 4) return playerThirdValue >= 2 && playerThirdValue <= 7;
  if (bTotal === 5) return playerThirdValue >= 4 && playerThirdValue <= 7;
  if (bTotal === 6) return playerThirdValue === 6 || playerThirdValue === 7;
  return false;
}


class BaccaratSound {
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
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    } catch {}
  }
  playDeal() { this.tone(800, 0.08, "triangle"); setTimeout(() => this.tone(600, 0.06, "triangle"), 50); }
  playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "triangle"), i * 100)); }
  playLose() { [400, 350, 300].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "sawtooth", 0.06), i * 120)); }
  playChip() { this.tone(1200, 0.04, "sine", 0.08); }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

// ── PixiJS card drawing helpers ──
function suitColor(suit: Suit): number {
  return suit === "heart" || suit === "diamond" ? 0xe74c3c : 0xffffff;
}
function drawSuitShape(g: PixiGraphics, suit: Suit, cx: number, cy: number, size: number) {
  const s = size;
  if (suit === "spade") {
    g.moveTo(cx, cy - s).lineTo(cx + s * 0.7, cy + s * 0.3).quadraticCurveTo(cx, cy + s * 0.1, cx, cy + s * 0.6);
    g.moveTo(cx, cy - s).lineTo(cx - s * 0.7, cy + s * 0.3).quadraticCurveTo(cx, cy + s * 0.1, cx, cy + s * 0.6);
    g.fill({ color: 0xffffff });
    g.rect(cx - 1, cy + s * 0.2, 2, s * 0.5).fill({ color: 0xffffff });
  } else if (suit === "heart") {
    g.moveTo(cx, cy + s * 0.7);
    g.quadraticCurveTo(cx - s, cy - s * 0.2, cx, cy - s * 0.5);
    g.quadraticCurveTo(cx + s, cy - s * 0.2, cx, cy + s * 0.7);
    g.fill({ color: 0xe74c3c });
  } else if (suit === "diamond") {
    g.moveTo(cx, cy - s).lineTo(cx + s * 0.6, cy).lineTo(cx, cy + s).lineTo(cx - s * 0.6, cy).closePath();
    g.fill({ color: 0xe74c3c });
  } else {
    g.circle(cx - s * 0.3, cy - s * 0.2, s * 0.35).fill({ color: 0xffffff });
    g.circle(cx + s * 0.3, cy - s * 0.2, s * 0.35).fill({ color: 0xffffff });
    g.circle(cx, cy - s * 0.55, s * 0.35).fill({ color: 0xffffff });
    g.rect(cx - 1, cy, 2, s * 0.5).fill({ color: 0xffffff });
  }
}

function drawCardPixi(
  g: PixiGraphics, pixi: typeof import("pixi.js"), container: import("pixi.js").Container,
  card: Card, x: number, y: number, w: number, h: number, faceUp: boolean,
  texts: import("pixi.js").Text[], ti: { i: number }
) {
  if (!faceUp) {
    g.roundRect(x, y, w, h, 6).fill({ color: 0x1a3a8a });
    g.roundRect(x + 3, y + 3, w - 6, h - 6, 4).stroke({ color: 0x3ea6ff, width: 1 });
    return;
  }
  g.roundRect(x, y, w, h, 6).fill({ color: 0xf5f5f0 });
  g.roundRect(x, y, w, h, 6).stroke({ color: 0x999999, width: 1 });
  // Rank text
  if (ti.i < texts.length) {
    const t = texts[ti.i++];
    t.text = card.rank; t.style.fontSize = Math.floor(w * 0.28);
    t.style.fontWeight = "bold"; t.style.fill = suitColor(card.suit);
    t.anchor.set(0, 0); t.x = x + 4; t.y = y + 2; t.visible = true;
  }
  drawSuitShape(g, card.suit, x + w / 2, y + h * 0.55, w * 0.18);
}

export default function BaccaratPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<"title" | "playing" | "result">("title");
  const [chips, setChips] = useState(1000);
  const [bet, setBet] = useState(100);
  const [betType, setBetType] = useState<BetType | null>(null);
  const [muted, setMuted] = useState(false);
  const [road, setRoad] = useState<RoadResult[]>([]);
  const [totalWins, setTotalWins] = useState(0);
  const [totalHands, setTotalHands] = useState(0);
  const [lastWin, setLastWin] = useState(0);

  const soundRef = useRef<BaccaratSound | null>(null);
  const shoeRef = useRef<Card[]>(createShoe());
  const playerHandRef = useRef<Card[]>([]);
  const bankerHandRef = useRef<Card[]>([]);
  const resultRef = useRef<{ winner: RoadResult; pTotal: number; bTotal: number } | null>(null);
  const animPhaseRef = useRef(0); // 0=idle, 1-6=dealing cards, 7=done
  const animTimerRef = useRef(0);

  const screenRef = useRef(screen);
  const chipsRef = useRef(chips);
  const betRef = useRef(bet);
  const betTypeRef = useRef(betType);
  const roadRef = useRef(road);
  const lastWinRef = useRef(lastWin);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { chipsRef.current = chips; }, [chips]);
  useEffect(() => { betRef.current = bet; }, [bet]);
  useEffect(() => { betTypeRef.current = betType; }, [betType]);
  useEffect(() => { roadRef.current = road; }, [road]);
  useEffect(() => { lastWinRef.current = lastWin; }, [lastWin]);

  useEffect(() => {
    soundRef.current = new BaccaratSound();
    return () => { soundRef.current?.dispose(); };
  }, []);

  // Load progress
  useEffect(() => {
    try {
      const s = localStorage.getItem("baccarat-progress");
      if (s) {
        const d = JSON.parse(s);
        if (d.chips) setChips(d.chips);
        if (d.road) setRoad(d.road);
        if (d.totalWins !== undefined) setTotalWins(d.totalWins);
        if (d.totalHands !== undefined) setTotalHands(d.totalHands);
      }
    } catch {}
  }, []);
  const saveProgress = useCallback(() => {
    try { localStorage.setItem("baccarat-progress", JSON.stringify({ chips, road, totalWins, totalHands })); } catch {}
  }, [chips, road, totalWins, totalHands]);
  useEffect(() => { saveProgress(); }, [saveProgress]);

  const drawCard = useCallback((): Card => {
    if (shoeRef.current.length < 20) shoeRef.current = createShoe();
    return shoeRef.current.pop()!;
  }, []);

  const dealRound = useCallback(() => {
    if (!betTypeRef.current || betRef.current <= 0 || betRef.current > chipsRef.current) return;
    const pHand: Card[] = [drawCard(), drawCard()];
    const bHand: Card[] = [drawCard(), drawCard()];
    playerHandRef.current = pHand;
    bankerHandRef.current = bHand;
    resultRef.current = null;
    animPhaseRef.current = 1;
    animTimerRef.current = 0;
    setChips(c => c - betRef.current);
    setScreen("playing");
    soundRef.current?.playDeal();
  }, [drawCard]);

  const resolveRound = useCallback(() => {
    const pH = playerHandRef.current;
    const bH = bankerHandRef.current;
    let pT = handTotal(pH);
    let bT = handTotal(bH);
    // Natural check
    if (pT < 8 && bT < 8) {
      let playerThirdVal: number | null = null;
      if (playerDrawsThird(pT)) {
        const c = drawCard();
        pH.push(c);
        playerThirdVal = c.value;
        pT = handTotal(pH);
      }
      if (bankerDrawsThird(bT, playerThirdVal)) {
        bH.push(drawCard());
        bT = handTotal(bH);
      }
    }
    playerHandRef.current = pH;
    bankerHandRef.current = bH;
    const winner: RoadResult = pT > bT ? "P" : bT > pT ? "B" : "T";
    resultRef.current = { winner, pTotal: pT, bTotal: bT };
    // Payout
    const bt = betTypeRef.current;
    const betAmt = betRef.current;
    let winAmt = 0;
    if (bt === "player" && winner === "P") winAmt = betAmt * 2;
    else if (bt === "banker" && winner === "B") winAmt = betAmt + Math.floor(betAmt * 0.95);
    else if (bt === "tie" && winner === "T") winAmt = betAmt * 9;
    else if (bt === "player" && winner === "T") winAmt = betAmt; // push
    else if (bt === "banker" && winner === "T") winAmt = betAmt; // push
    setChips(c => c + winAmt);
    setLastWin(winAmt > betAmt ? winAmt - betAmt : winAmt > 0 ? 0 : -betAmt);
    setRoad(r => [...r.slice(-19), winner]);
    setTotalHands(h => h + 1);
    if (winAmt > betAmt) {
      setTotalWins(w => w + 1);
      soundRef.current?.playWin();
    } else if (winAmt === 0) {
      soundRef.current?.playLose();
    }
    setScreen("result");
    // Submit score
    if (winAmt > betAmt) {
      const score = chipsRef.current + winAmt;
      fetchWithAuth(`/api/games/scores/${GAME_ID}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      }).catch(() => {});
    }
  }, [drawCard]);


  // ── PixiJS render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;
    let app: Application | null = null;
    let rafId = 0;

    async function init() {
      if (destroyed) return;
      const pixi = await loadPixi();
      if (destroyed) return;
      app = await createPixiApp({ canvas, width: W, height: H, backgroundColor: 0x0f0f0f });
      if (destroyed) { app.destroy(true); return; }
      const g = new pixi.Graphics();
      app.stage.addChild(g);
      // Pre-allocate text objects
      const texts: InstanceType<typeof pixi.Text>[] = [];
      for (let i = 0; i < 60; i++) {
        const t = new pixi.Text({ text: "", style: { fontSize: 14, fill: 0xffffff, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" } });
        t.visible = false;
        app.stage.addChild(t);
        texts.push(t);
      }

      function render() {
        if (destroyed) return;
        g.clear();
        for (const t of texts) { t.visible = false; t.alpha = 1; }
        const ti = { i: 0 };
        const curScreen = screenRef.current;
        const curChips = chipsRef.current;
        const curBet = betRef.current;
        const curBetType = betTypeRef.current;
        const curRoad = roadRef.current;
        const curLastWin = lastWinRef.current;

        // Felt background
        g.rect(0, 0, W, H).fill({ color: 0x1a5c2a });
        // Table border
        g.roundRect(10, 10, W - 20, H - 20, 16).stroke({ color: 0x2a8c4a, width: 3 });
        g.roundRect(14, 14, W - 28, H - 28, 14).stroke({ color: 0x145020, width: 1 });

        // ── Chips display (top-left) ──
        if (ti.i < texts.length) {
          const t = texts[ti.i++];
          t.text = `筹码: ${curChips}`; t.style.fontSize = 16; t.style.fontWeight = "bold"; t.style.fill = 0xffd700;
          t.anchor.set(0, 0); t.x = 30; t.y = 22; t.visible = true;
        }

        // ── Road map (路单) top-right ──
        const roadX = W - 230, roadY = 20;
        g.roundRect(roadX, roadY, 210, 30, 4).fill({ color: 0x0a3a1a });
        g.roundRect(roadX, roadY, 210, 30, 4).stroke({ color: 0x2a8c4a, width: 1 });
        if (ti.i < texts.length) {
          const t = texts[ti.i++];
          t.text = "路单"; t.style.fontSize = 10; t.style.fontWeight = "bold"; t.style.fill = 0x88cc88;
          t.anchor.set(0, 0.5); t.x = roadX + 4; t.y = roadY + 15; t.visible = true;
        }
        for (let i = 0; i < curRoad.length; i++) {
          const rx = roadX + 30 + i * 9;
          const color = curRoad[i] === "B" ? 0xe74c3c : curRoad[i] === "P" ? 0x3498db : 0x2ecc71;
          g.circle(rx, roadY + 15, 3.5).fill({ color });
        }

        // ── Dealing areas ──
        const areaW = 280, areaH = 160;
        const pAreaX = 60, bAreaX = W - 60 - areaW, areaY = 70;

        // Player area
        g.roundRect(pAreaX, areaY, areaW, areaH, 10).fill({ color: 0x0a3a1a });
        g.roundRect(pAreaX, areaY, areaW, areaH, 10).stroke({ color: 0x3498db, width: 2 });
        if (ti.i < texts.length) {
          const t = texts[ti.i++];
          t.text = "闲家"; t.style.fontSize = 20; t.style.fontWeight = "bold"; t.style.fill = 0x3498db;
          t.anchor.set(0.5, 0); t.x = pAreaX + areaW / 2; t.y = areaY + 6; t.visible = true;
        }

        // Banker area
        g.roundRect(bAreaX, areaY, areaW, areaH, 10).fill({ color: 0x0a3a1a });
        g.roundRect(bAreaX, areaY, areaW, areaH, 10).stroke({ color: 0xe74c3c, width: 2 });
        if (ti.i < texts.length) {
          const t = texts[ti.i++];
          t.text = "庄家"; t.style.fontSize = 20; t.style.fontWeight = "bold"; t.style.fill = 0xe74c3c;
          t.anchor.set(0.5, 0); t.x = bAreaX + areaW / 2; t.y = areaY + 6; t.visible = true;
        }

        // Deal animation
        const phase = animPhaseRef.current;
        if (curScreen === "playing" || curScreen === "result") {
          animTimerRef.current++;
          if (curScreen === "playing" && phase < 7) {
            const tick = animTimerRef.current;
            if (phase === 1 && tick > 10) { animPhaseRef.current = 2; soundRef.current?.playDeal(); }
            if (phase === 2 && tick > 25) { animPhaseRef.current = 3; soundRef.current?.playDeal(); }
            if (phase === 3 && tick > 40) { animPhaseRef.current = 4; soundRef.current?.playDeal(); }
            if (phase === 4 && tick > 55) { animPhaseRef.current = 5; soundRef.current?.playDeal(); }
            if (phase === 5 && tick > 70) { animPhaseRef.current = 6; resolveRound(); }
            if (phase === 6 && tick > 80) { animPhaseRef.current = 7; }
          }

          // Draw player cards
          const pH = playerHandRef.current;
          const cw = 60, ch = 85;
          const pStartX = pAreaX + (areaW - pH.length * (cw + 8)) / 2;
          for (let i = 0; i < pH.length; i++) {
            const show = (i === 0 && phase >= 2) || (i === 1 && phase >= 4) || (i === 2 && phase >= 6);
            if ((i < 2 && phase >= 1) || (i === 2 && phase >= 6)) {
              drawCardPixi(g, pixi, app!.stage, pH[i], pStartX + i * (cw + 8), areaY + 38, cw, ch, show, texts, ti);
            }
          }
          // Player total
          if (phase >= 4) {
            const pT = handTotal(pH.slice(0, phase >= 6 ? pH.length : 2));
            if (ti.i < texts.length) {
              const t = texts[ti.i++];
              t.text = `${pT} 点`; t.style.fontSize = 16; t.style.fontWeight = "bold"; t.style.fill = 0x3498db;
              t.anchor.set(0.5, 0); t.x = pAreaX + areaW / 2; t.y = areaY + areaH - 26; t.visible = true;
            }
          }

          // Draw banker cards
          const bH = bankerHandRef.current;
          const bStartX = bAreaX + (areaW - bH.length * (cw + 8)) / 2;
          for (let i = 0; i < bH.length; i++) {
            const show = (i === 0 && phase >= 3) || (i === 1 && phase >= 5) || (i === 2 && phase >= 6);
            if ((i < 2 && phase >= 1) || (i === 2 && phase >= 6)) {
              drawCardPixi(g, pixi, app!.stage, bH[i], bStartX + i * (cw + 8), areaY + 38, cw, ch, show, texts, ti);
            }
          }
          // Banker total
          if (phase >= 5) {
            const bT = handTotal(bH.slice(0, phase >= 6 ? bH.length : 2));
            if (ti.i < texts.length) {
              const t = texts[ti.i++];
              t.text = `${bT} 点`; t.style.fontSize = 16; t.style.fontWeight = "bold"; t.style.fill = 0xe74c3c;
              t.anchor.set(0.5, 0); t.x = bAreaX + areaW / 2; t.y = areaY + areaH - 26; t.visible = true;
            }
          }
        }

        // ── Bet type indicator ──
        if (curBetType && (curScreen === "playing" || curScreen === "result")) {
          const label = curBetType === "player" ? "闲家" : curBetType === "banker" ? "庄家" : "和局";
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = `下注: ${label} ${curBet}`; t.style.fontSize = 14; t.style.fontWeight = "bold"; t.style.fill = 0xffd700;
            t.anchor.set(0.5, 0); t.x = W / 2; t.y = areaY + areaH + 10; t.visible = true;
          }
        }

        // ── Result overlay ──
        if (curScreen === "result" && resultRef.current && phase >= 7) {
          const r = resultRef.current;
          g.roundRect(W / 2 - 160, 260, 320, 100, 12).fill({ color: 0x000000, alpha: 0.8 });
          g.roundRect(W / 2 - 160, 260, 320, 100, 12).stroke({ color: 0xffd700, width: 2 });
          const winLabel = r.winner === "P" ? "闲家赢" : r.winner === "B" ? "庄家赢" : "和局";
          const winColor = r.winner === "P" ? 0x3498db : r.winner === "B" ? 0xe74c3c : 0x2ecc71;
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = winLabel; t.style.fontSize = 28; t.style.fontWeight = "bold"; t.style.fill = winColor;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = 290; t.visible = true;
          }
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = `闲 ${r.pTotal} : ${r.bTotal} 庄`; t.style.fontSize = 16; t.style.fontWeight = "normal"; t.style.fill = 0xffffff;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = 318; t.visible = true;
          }
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            const wt = curLastWin > 0 ? `赢得 ${curLastWin}` : curLastWin === 0 ? "退回下注" : `输了 ${Math.abs(curLastWin)}`;
            t.text = wt; t.style.fontSize = 14; t.style.fontWeight = "bold";
            t.style.fill = curLastWin > 0 ? 0xffd700 : curLastWin === 0 ? 0xaaaaaa : 0xff6666;
            t.anchor.set(0.5, 0.5); t.x = W / 2; t.y = 344; t.visible = true;
          }
        }

        // ── Betting area (bottom) ──
        if (curScreen === "title" || curScreen === "result") {
          const by = 380;
          // Bet buttons
          const bets: { label: string; type: BetType; color: number; x: number }[] = [
            { label: "闲家 1:1", type: "player", color: 0x3498db, x: W / 2 - 200 },
            { label: "和局 8:1", type: "tie", color: 0x2ecc71, x: W / 2 - 60 },
            { label: "庄家 0.95:1", type: "banker", color: 0xe74c3c, x: W / 2 + 80 },
          ];
          for (const b of bets) {
            const sel = curBetType === b.type;
            g.roundRect(b.x, by, 120, 40, 8).fill({ color: sel ? b.color : 0x1a3a1a });
            g.roundRect(b.x, by, 120, 40, 8).stroke({ color: b.color, width: sel ? 2 : 1 });
            if (ti.i < texts.length) {
              const t = texts[ti.i++];
              t.text = b.label; t.style.fontSize = 13; t.style.fontWeight = "bold"; t.style.fill = sel ? 0xffffff : b.color;
              t.anchor.set(0.5, 0.5); t.x = b.x + 60; t.y = by + 20; t.visible = true;
            }
          }

          // Chip amounts
          const chipY = by + 52;
          const chipAmounts = [10, 50, 100, 500];
          for (let i = 0; i < chipAmounts.length; i++) {
            const cx = W / 2 - 130 + i * 70;
            const sel = curBet === chipAmounts[i];
            g.circle(cx + 25, chipY + 18, 16).fill({ color: sel ? 0xffd700 : 0x2a5a2a });
            g.circle(cx + 25, chipY + 18, 16).stroke({ color: 0xffd700, width: sel ? 2 : 1 });
            if (ti.i < texts.length) {
              const t = texts[ti.i++];
              t.text = `${chipAmounts[i]}`; t.style.fontSize = 11; t.style.fontWeight = "bold"; t.style.fill = sel ? 0x000000 : 0xffd700;
              t.anchor.set(0.5, 0.5); t.x = cx + 25; t.y = chipY + 18; t.visible = true;
            }
          }

          // Deal button
          const canDeal = curBetType !== null && curBet > 0 && curBet <= curChips;
          const dealX = W / 2 - 60, dealY = chipY + 44;
          g.roundRect(dealX, dealY, 120, 38, 8).fill({ color: canDeal ? 0xffd700 : 0x333333 });
          if (ti.i < texts.length) {
            const t = texts[ti.i++];
            t.text = "发牌"; t.style.fontSize = 16; t.style.fontWeight = "bold"; t.style.fill = canDeal ? 0x000000 : 0x666666;
            t.anchor.set(0.5, 0.5); t.x = dealX + 60; t.y = dealY + 19; t.visible = true;
          }
        }

        rafId = requestAnimationFrame(render);
      }
      rafId = requestAnimationFrame(render);
    }
    init();
    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      if (app) { app.destroy(true); app = null; }
    };
  }, [resolveRound]);


  // ── Canvas click handler ──
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ("touches" in e) {
      e.preventDefault();
      const t = e.changedTouches[0]; cx = t.clientX; cy = t.clientY;
    } else { cx = e.clientX; cy = e.clientY; }
    const mx = (cx - rect.left) * (W / rect.width);
    const my = (cy - rect.top) * (H / rect.height);

    if (screen === "playing") return; // no interaction during deal

    const by = 380;
    // Bet type buttons
    const betDefs: { type: BetType; x: number }[] = [
      { type: "player", x: W / 2 - 200 },
      { type: "tie", x: W / 2 - 60 },
      { type: "banker", x: W / 2 + 80 },
    ];
    for (const b of betDefs) {
      if (mx >= b.x && mx <= b.x + 120 && my >= by && my <= by + 40) {
        setBetType(b.type);
        soundRef.current?.playChip();
        return;
      }
    }

    // Chip amounts
    const chipY = by + 52;
    const chipAmounts = [10, 50, 100, 500];
    for (let i = 0; i < chipAmounts.length; i++) {
      const ccx = W / 2 - 130 + i * 70 + 25;
      if (Math.hypot(mx - ccx, my - (chipY + 18)) < 18) {
        setBet(chipAmounts[i]);
        soundRef.current?.playChip();
        return;
      }
    }

    // Deal button
    const dealX = W / 2 - 60, dealY = chipY + 44;
    if (mx >= dealX && mx <= dealX + 120 && my >= dealY && my <= dealY + 38) {
      dealRound();
      return;
    }
  }, [screen, dealRound]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen === "playing") return;
      if (e.key === "1") { setBetType("player"); soundRef.current?.playChip(); }
      if (e.key === "2") { setBetType("tie"); soundRef.current?.playChip(); }
      if (e.key === "3") { setBetType("banker"); soundRef.current?.playChip(); }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dealRound(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, dealRound]);

  // Save/Load handlers
  const handleSave = useCallback(() => {
    return { chips, road, totalWins, totalHands, bet, betType };
  }, [chips, road, totalWins, totalHands, bet, betType]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as { chips?: number; road?: RoadResult[]; totalWins?: number; totalHands?: number };
    if (d.chips !== undefined) setChips(d.chips);
    if (d.road) setRoad(d.road);
    if (d.totalWins !== undefined) setTotalWins(d.totalWins);
    if (d.totalHands !== undefined) setTotalHands(d.totalHands);
    setScreen("title");
  }, []);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ArrowLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center gap-2 mb-4">
          <Coins size={24} className="text-[#3ea6ff]" />
          <h1 className="text-xl font-bold">百家乐</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-400">筹码: <span className="text-[#ffd700] font-bold">{chips}</span></span>
            <button onClick={() => { const m = soundRef.current?.toggleMute(); setMuted(!!m); }} className="p-2 rounded-lg hover:bg-white/10">
              {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
            </button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full max-w-[800px] mx-auto rounded-xl border border-white/10 cursor-pointer touch-none"
          style={{ aspectRatio: `${W}/${H}` }}
          onClick={handleCanvasClick}
          onTouchEnd={handleCanvasClick}
        />

        {chips <= 0 && screen !== "playing" && (
          <div className="text-center mt-4">
            <p className="text-red-400 mb-2">筹码用完了</p>
            <button onClick={() => { setChips(1000); setRoad([]); setTotalHands(0); setTotalWins(0); }}
              className="flex items-center gap-1 mx-auto px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-bold hover:bg-[#3ea6ff]/80">
              <Plus size={14} /> 重新开始 (1000筹码)
            </button>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a1a] p-4 text-sm text-gray-400 space-y-1">
          <p className="text-[#3ea6ff] font-bold mb-2">游戏说明</p>
          <p>标准百家乐 (Punto Banco)，8副牌</p>
          <p>闲家 (1:1) / 庄家 (0.95:1, 5%佣金) / 和局 (8:1)</p>
          <p>点击选择下注类型和筹码金额，然后点击发牌</p>
          <p>键盘: 1=闲家 2=和局 3=庄家 空格/回车=发牌</p>
          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-white/10">
            <span>总手数: {totalHands}</span>
            <span>胜利: {totalWins}</span>
            <span>胜率: {totalHands > 0 ? Math.round(totalWins / totalHands * 100) : 0}%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}
