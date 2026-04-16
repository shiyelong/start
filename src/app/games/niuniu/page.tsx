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

const GAME_ID = "niuniu";
type Suit = 0 | 1 | 2 | 3; // spade, heart, club, diamond
type Card = { suit: Suit; rank: number }; // rank 1-13
type HandRank = { name: string; level: number; bull: number };
type Phase = "idle" | "betting" | "dealt" | "reveal" | "result";
interface Player { name: string; cards: Card[]; chips: number; bet: number; isHuman: boolean; isBanker: boolean; hand: HandRank | null; revealed: boolean; }
interface GameState { players: Player[]; deck: Card[]; phase: Phase; round: number; bankerIdx: number; message: string; }

const SUIT_COLORS = [0xffffff, 0xff4444, 0xffffff, 0xff4444];

function cardValue(rank: number): number { return rank >= 10 ? 10 : rank; }

function makeDeck(): Card[] {
  const d: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ suit: s as Suit, rank: r });
  return d;
}
function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

function evaluateHand(cards: Card[]): HandRank {
  if (cards.length !== 5) return { name: "没牛", level: 0, bull: 0 };
  // Special: 五小牛 — all <=5 and sum <=10
  const vals = cards.map(c => cardValue(c.rank));
  const total = vals.reduce((a, b) => a + b, 0);
  if (vals.every(v => v <= 5) && total <= 10) return { name: "五小牛", level: 14, bull: 0 };
  // Special: 五花牛 — all face cards (J/Q/K)
  if (cards.every(c => c.rank >= 11)) return { name: "五花牛", level: 13, bull: 0 };
  // Special: 炸弹牛 — four of a kind
  const counts: Record<number, number> = {};
  cards.forEach(c => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  if (Object.values(counts).some(v => v === 4)) return { name: "炸弹牛", level: 12, bull: 0 };
  // Normal: find 3 cards summing to multiple of 10
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 4; j++) for (let k = j + 1; k < 5; k++) {
    if ((vals[i] + vals[j] + vals[k]) % 10 === 0) {
      const rest: number[] = [];
      for (let m = 0; m < 5; m++) if (m !== i && m !== j && m !== k) rest.push(vals[m]);
      const rem = (rest[0] + rest[1]) % 10;
      if (rem === 0) return { name: "牛牛", level: 11, bull: 10 };
      return { name: `牛${["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][rem]}`, level: rem, bull: rem };
    }
  }
  return { name: "没牛", level: 0, bull: 0 };
}

function compareHands(a: HandRank, b: HandRank): number { return a.level - b.level; }

class NiuNiuSound {
  private ctx: AudioContext | null = null;
  private muted = false;
  private getCtx(): AudioContext { if (!this.ctx) this.ctx = new AudioContext(); return this.ctx; }
  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.12) {
    if (this.muted) return;
    try {
      const c = this.getCtx(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    } catch {}
  }
  playDeal() { [400, 500, 600].forEach((f, i) => setTimeout(() => this.tone(f, 0.08, "triangle"), i * 60)); }
  playFlip() { this.tone(800, 0.06, "sine", 0.1); }
  playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, "triangle"), i * 100)); }
  playLose() { [400, 350, 300].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "sawtooth", 0.08), i * 120)); }
  playBet() { this.tone(660, 0.05, "sine", 0.08); }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

function initGame(chips?: number): GameState {
  const names = ["你", "玩家二", "玩家三", "玩家四"];
  const players: Player[] = names.map((n, i) => ({
    name: n, cards: [], chips: chips ?? 1000, bet: 0, isHuman: i === 0, isBanker: i === 0, hand: null, revealed: false,
  }));
  return { players, deck: shuffle(makeDeck()), phase: "idle", round: 1, bankerIdx: 0, message: "点击「新局」开始游戏" };
}

// ─── PixiJS Rendering ────────────────────────────────────────────────────────
function drawSuitShape(g: PixiGraphics, suit: Suit, x: number, y: number, size: number) {
  const c = SUIT_COLORS[suit];
  g.setStrokeStyle({ width: 1.5, color: c });
  if (suit === 0) { // spade
    g.moveTo(x, y - size * 0.5); g.lineTo(x + size * 0.4, y + size * 0.15);
    g.quadraticCurveTo(x, y - size * 0.05, x - size * 0.4, y + size * 0.15);
    g.closePath(); g.fill({ color: c }); g.moveTo(x, y + size * 0.1); g.lineTo(x, y + size * 0.5); g.stroke();
  } else if (suit === 1) { // heart
    g.moveTo(x, y + size * 0.4);
    g.quadraticCurveTo(x - size * 0.5, y - size * 0.1, x, y - size * 0.35);
    g.quadraticCurveTo(x + size * 0.5, y - size * 0.1, x, y + size * 0.4);
    g.fill({ color: c });
  } else if (suit === 2) { // club
    g.circle(x, y - size * 0.2, size * 0.2); g.circle(x - size * 0.22, y + size * 0.05, size * 0.2);
    g.circle(x + size * 0.22, y + size * 0.05, size * 0.2); g.fill({ color: c });
    g.moveTo(x, y + size * 0.15); g.lineTo(x, y + size * 0.5); g.stroke();
  } else { // diamond
    g.moveTo(x, y - size * 0.4); g.lineTo(x + size * 0.28, y); g.lineTo(x, y + size * 0.4);
    g.lineTo(x - size * 0.28, y); g.closePath(); g.fill({ color: c });
  }
}

function renderGame(g: PixiGraphics, state: GameState, w: number, h: number, pixi: typeof import("pixi.js")) {
  g.clear();
  // Table background
  g.roundRect(0, 0, w, h, 16); g.fill({ color: 0x0a3a1a });
  g.roundRect(10, 10, w - 20, h - 20, 12); g.fill({ color: 0x0d4d22 });
  // Center label
  const cx = w / 2, cy = h / 2;
  g.circle(cx, cy, 40); g.fill({ color: 0x0a3a1a, alpha: 0.5 });

  const positions = [
    { x: cx, y: h - 95 },  // bottom (human)
    { x: 70, y: cy },       // left
    { x: cx, y: 65 },       // top
    { x: w - 70, y: cy },   // right
  ];

  const cardW = 42, cardH = 60, gap = 6;
  state.players.forEach((p, pi) => {
    const pos = positions[pi];
    const isVert = pi === 1 || pi === 3;
    // Player label bg
    const lblX = isVert ? pos.x - 30 : pos.x - 40;
    const lblY = isVert ? (pi === 1 ? pos.y + 70 : pos.y + 70) : (pi === 0 ? pos.y + 38 : pos.y - 55);
    g.roundRect(lblX, lblY, 80, 16, 4);
    g.fill({ color: p.isBanker ? 0xf0b90b : 0x333333, alpha: 0.8 });

    // Draw 5 cards
    const totalW = isVert ? cardH : (cardW + gap) * 5 - gap;
    const totalH = isVert ? (cardW + gap) * 5 - gap : cardH;
    const startX = isVert ? pos.x - cardH / 2 : pos.x - totalW / 2;
    const startY = isVert ? pos.y - totalH / 2 : pos.y - cardH / 2;

    for (let ci = 0; ci < 5; ci++) {
      const card = p.cards[ci];
      let cX: number, cY: number;
      if (isVert) { cX = startX; cY = startY + ci * (cardW + gap); }
      else { cX = startX + ci * (cardW + gap); cY = startY; }

      if (!card || !p.revealed) {
        // Face down
        g.roundRect(cX, cY, isVert ? cardH : cardW, isVert ? cardW : cardH, 4);
        g.fill({ color: 0x2244aa }); g.stroke({ color: 0x3366cc, width: 1 });
        // Back pattern
        g.roundRect(cX + 3, cY + 3, (isVert ? cardH : cardW) - 6, (isVert ? cardW : cardH) - 6, 2);
        g.fill({ color: 0x1a3388 });
      } else {
        // Face up
        g.roundRect(cX, cY, isVert ? cardH : cardW, isVert ? cardW : cardH, 4);
        g.fill({ color: 0xf5f5f0 }); g.stroke({ color: 0xcccccc, width: 1 });
        const suitColor = SUIT_COLORS[card.suit];
        // Suit shape in center
        const scx = cX + (isVert ? cardH : cardW) / 2;
        const scy = cY + (isVert ? cardW : cardH) / 2;
        drawSuitShape(g, card.suit, scx, scy + 6, 14);
      }
    }

    // Hand result text
    if (p.revealed && p.hand) {
      const rX = isVert ? pos.x - 28 : pos.x - 30;
      const rY = isVert ? (pi === 1 ? pos.y - totalH / 2 - 22 : pos.y - totalH / 2 - 22) : (pi === 0 ? pos.y + cardH / 2 + 4 : pos.y - cardH / 2 - 20);
      g.roundRect(rX, rY, 60, 18, 4);
      const rc = p.hand.level >= 11 ? 0xf0b90b : p.hand.level > 0 ? 0x3ea6ff : 0x888888;
      g.fill({ color: rc, alpha: 0.9 });
    }
  });
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function NiuNiuPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<GameState>(() => initGame());
  const [muted, setMuted] = useState(false);
  const [betAmount, setBetAmount] = useState(50);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [totalScore, setTotalScore] = useState(0);

  const soundRef = useRef<NiuNiuSound | null>(null);
  const gameRef = useRef(game);
  const appRef = useRef<Application | null>(null);
  const gfxRef = useRef<PixiGraphics | null>(null);
  const destroyedRef = useRef(false);
  const animRef = useRef(0);

  useEffect(() => { gameRef.current = game; }, [game]);

  // Sound init
  useEffect(() => {
    soundRef.current = new NiuNiuSound();
    return () => { soundRef.current?.dispose(); };
  }, []);

  // PixiJS init
  useEffect(() => {
    destroyedRef.current = false;
    let mounted = true;
    (async () => {
      if (!canvasRef.current || destroyedRef.current) return;
      const pixi = await loadPixi();
      if (!mounted) return;
      const cw = Math.min(canvasRef.current.parentElement?.clientWidth ?? 600, 600);
      const ch = Math.min(cw * 0.75, 450);
      canvasRef.current.width = cw; canvasRef.current.height = ch;
      const app = await createPixiApp({ canvas: canvasRef.current, width: cw, height: ch, backgroundColor: 0x0f0f0f });
      if (!mounted) { app.destroy(); return; }
      appRef.current = app;
      const g = new pixi.Graphics();
      app.stage.addChild(g);
      gfxRef.current = g;

      const loop = () => {
        if (destroyedRef.current) return;
        g.clear();
        renderGame(g, gameRef.current, cw, ch, pixi);
        animRef.current = requestAnimationFrame(loop);
      };
      loop();
    })();
    return () => {
      mounted = false; destroyedRef.current = true;
      cancelAnimationFrame(animRef.current);
      appRef.current?.destroy(); appRef.current = null;
    };
  }, []);

  // ─── Game Actions ────────────────────────────────────────────────────────
  const startRound = useCallback(() => {
    soundRef.current?.playDeal();
    setGame(prev => {
      const g = { ...prev, deck: shuffle(makeDeck()), phase: "betting" as Phase, message: "请下注" };
      g.players = g.players.map((p, i) => ({
        ...p, cards: [], bet: 0, hand: null, revealed: false,
        isBanker: i === g.bankerIdx,
      }));
      return g;
    });
  }, []);

  const placeBet = useCallback(() => {
    soundRef.current?.playBet();
    setGame(prev => {
      if (prev.phase !== "betting") return prev;
      const g = { ...prev };
      g.players = g.players.map((p, i) => {
        if (p.isBanker) return { ...p, bet: 0 };
        const bet = p.isHuman ? Math.min(betAmount, p.chips) : Math.min(10 + Math.floor(Math.random() * 60), p.chips);
        return { ...p, bet };
      });
      // Deal 5 cards each
      let deck = [...g.deck];
      g.players = g.players.map(p => {
        const cards = deck.splice(0, 5);
        return { ...p, cards, hand: evaluateHand(cards) };
      });
      g.deck = deck;
      g.phase = "dealt";
      g.message = "已发牌，点击「翻牌」查看";
      return g;
    });
  }, [betAmount]);

  const revealCards = useCallback(() => {
    soundRef.current?.playFlip();
    setGame(prev => {
      if (prev.phase !== "dealt") return prev;
      const g = { ...prev, phase: "reveal" as Phase };
      // Reveal human first
      g.players = g.players.map((p, i) => i === 0 ? { ...p, revealed: true } : p);
      g.message = "你的牌已翻开，等待其他玩家...";
      return g;
    });
    // Reveal AI players one by one
    setTimeout(() => {
      setGame(prev => {
        const g = { ...prev };
        g.players = g.players.map(p => ({ ...p, revealed: true }));
        // Settle bets
        const banker = g.players[g.bankerIdx];
        const bankerHand = banker.hand!;
        let bankerNet = 0;
        g.players = g.players.map((p, i) => {
          if (i === g.bankerIdx) return p;
          const cmp = compareHands(p.hand!, bankerHand);
          const mult = Math.max(1, Math.min(p.hand!.level, 3));
          if (cmp > 0) {
            // Player wins
            const win = p.bet * mult;
            bankerNet -= win;
            return { ...p, chips: p.chips + win };
          } else {
            // Banker wins
            const loss = p.bet * mult;
            bankerNet += loss;
            return { ...p, chips: Math.max(0, p.chips - loss) };
          }
        });
        g.players[g.bankerIdx] = { ...g.players[g.bankerIdx], chips: g.players[g.bankerIdx].chips + bankerNet };
        const humanChips = g.players[0].chips;
        if (bankerNet > 0 && g.bankerIdx === 0) soundRef.current?.playWin();
        else if (g.players[0].hand!.level > bankerHand.level && g.bankerIdx !== 0) soundRef.current?.playWin();
        else soundRef.current?.playLose();

        g.phase = "result";
        g.message = bankerNet > 0 && g.bankerIdx === 0 ? `庄家赢了 ${bankerNet} 筹码` : `本局结算完毕`;
        g.bankerIdx = (g.bankerIdx + 1) % 4;
        g.round++;
        // Score submission
        const sc = Math.max(0, humanChips - 1000 + g.round * 5);
        setTotalScore(sc);
        return g;
      });
    }, 800);
  }, []);

  const handleSave = useCallback(() => {
    const g = gameRef.current;
    return { players: g.players.map(p => ({ chips: p.chips })), round: g.round, bankerIdx: g.bankerIdx, totalScore };
  }, [totalScore]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as { players: { chips: number }[]; round: number; bankerIdx: number; totalScore?: number };
    setGame(prev => {
      const g = initGame();
      g.players = g.players.map((p, i) => ({ ...p, chips: d.players[i]?.chips ?? 1000 }));
      g.round = d.round ?? 1;
      g.bankerIdx = d.bankerIdx ?? 0;
      g.message = "存档已加载，点击「新局」继续";
      return g;
    });
    if (d.totalScore) setTotalScore(d.totalScore);
  }, []);

  const submitScore = useCallback(() => {
    fetchWithAuth("/api/games/scores", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: GAME_ID, score: totalScore }),
    }).catch(() => {});
  }, [totalScore]);

  const humanPlayer = game.players[0];
  const isGameOver = humanPlayer.chips <= 0;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-20">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/games" className="text-[#aaa] hover:text-white transition"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-lg font-bold text-[#3ea6ff] flex-1">牛牛</h1>
          <button onClick={() => { const m = soundRef.current?.toggleMute(); setMuted(m ?? false); }}
            className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white transition">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white transition">
            <Trophy className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {/* Canvas */}
            <div className="rounded-xl overflow-hidden border border-[#333] bg-[#1a1a1a]">
              <canvas ref={canvasRef} className="w-full" style={{ aspectRatio: "4/3" }} />
            </div>

            {/* Info bar */}
            <div className="flex flex-wrap gap-2 text-xs">
              {game.players.map((p, i) => (
                <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${p.isBanker ? "border-[#f0b90b] bg-[#f0b90b]/10" : "border-[#333] bg-[#1a1a1a]"}`}>
                  <Coins className="w-3 h-3 text-[#f0b90b]" />
                  <span className="text-[#aaa]">{p.name}{p.isBanker ? "(庄)" : ""}</span>
                  <span className="text-[#f0b90b] font-bold">{p.chips}</span>
                  {p.revealed && p.hand && <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${p.hand.level >= 11 ? "bg-[#f0b90b]/20 text-[#f0b90b]" : p.hand.level > 0 ? "bg-[#3ea6ff]/20 text-[#3ea6ff]" : "bg-[#333] text-[#888]"}`}>{p.hand.name}</span>}
                </div>
              ))}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {game.phase === "idle" || game.phase === "result" ? (
                <button onClick={startRound} disabled={isGameOver}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#5ab8ff] transition disabled:opacity-40">
                  <Plus className="w-4 h-4" /> 新局
                </button>
              ) : null}
              {game.phase === "betting" && (
                <>
                  <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-2 py-1">
                    {[10, 50, 100, 200].map(v => (
                      <button key={v} onClick={() => setBetAmount(v)}
                        className={`px-2.5 py-1 rounded text-xs transition ${betAmount === v ? "bg-[#3ea6ff] text-[#0f0f0f] font-bold" : "text-[#aaa] hover:text-white"}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <button onClick={placeBet}
                    className="px-4 py-2 rounded-lg bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm hover:bg-[#f5cc3a] transition">
                    下注 {betAmount}
                  </button>
                </>
              )}
              {game.phase === "dealt" && (
                <button onClick={revealCards}
                  className="px-4 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#5ab8ff] transition">
                  翻牌
                </button>
              )}
              {game.phase === "result" && totalScore > 0 && (
                <button onClick={submitScore}
                  className="px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#3ea6ff] text-xs hover:bg-[#222] transition">
                  提交分数 ({totalScore})
                </button>
              )}
            </div>

            {/* Message */}
            <div className="text-sm text-[#aaa] bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2">
              {game.message}
              {isGameOver && <span className="text-red-400 ml-2">筹码耗尽，游戏结束</span>}
            </div>

            {/* Rules */}
            <details className="text-xs text-[#666] bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2">
              <summary className="cursor-pointer text-[#aaa] hover:text-white transition">游戏规则</summary>
              <div className="mt-2 space-y-1">
                <p>4人对局，轮流做庄。非庄家下注后发牌，每人5张。</p>
                <p>从5张牌中找3张之和为10的倍数（牛），剩余2张之和的个位数为牛数。</p>
                <p>牌型大小：五小牛 &gt; 五花牛 &gt; 炸弹牛 &gt; 牛牛 &gt; 牛九 &gt; ... &gt; 牛一 &gt; 没牛</p>
                <p>A=1, 2-9=面值, 10/J/Q/K=10。起始筹码1000。</p>
              </div>
            </details>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            {showLeaderboard && <GameLeaderboard gameId={GAME_ID} />}
          </div>
        </div>
      </div>
    </div>
  );
}
