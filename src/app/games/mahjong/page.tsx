"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText, Container as PixiContainer } from "pixi.js";
import { ArrowLeft, RotateCw, Volume2, VolumeX } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Suit = "wan" | "tiao" | "bing" | "feng" | "jian";
interface Tile { suit: Suit; value: number; id: number; }
type Wind = 0 | 1 | 2 | 3; // E S W N

interface Meld {
  type: "chi" | "pong" | "kong";
  tiles: Tile[];
}

interface Player {
  hand: Tile[];
  melds: Meld[];
  discards: Tile[];
  isHuman: boolean;
  wind: Wind;
}

interface GameState {
  wall: Tile[];
  players: Player[];
  currentPlayer: number;
  phase: "draw" | "discard" | "action" | "over";
  lastDiscard: Tile | null;
  lastDiscardPlayer: number;
  winner: number;
  dealer: number;
  turnCount: number;
  pendingActions: PendingAction[];
}

interface PendingAction {
  player: number;
  type: "chi" | "pong" | "kong" | "hu";
  tiles?: Tile[];
}

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "mahjong";
const WIND_NAMES = ["东", "南", "西", "北"];
const JIAN_NAMES = ["中", "发", "白"];
const SUIT_NAMES: Record<Suit, string> = { wan: "万", tiao: "条", bing: "饼", feng: "风", jian: "箭" };

// ─── Tile Creation ───────────────────────────────────────────────────────────
function createFullWall(): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  // 万条饼 each 1-9, 4 copies
  for (const suit of ["wan", "tiao", "bing"] as Suit[]) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) tiles.push({ suit, value: v, id: id++ });
    }
  }
  // 风 ESWN (value 1-4), 4 copies
  for (let v = 1; v <= 4; v++) {
    for (let c = 0; c < 4; c++) tiles.push({ suit: "feng", value: v, id: id++ });
  }
  // 箭 中发白 (value 1-3), 4 copies
  for (let v = 1; v <= 3; v++) {
    for (let c = 0; c < 4; c++) tiles.push({ suit: "jian", value: v, id: id++ });
  }
  return tiles; // 136 tiles total
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tileKey(t: Tile): string {
  return `${t.suit}_${t.value}`;
}

function tileName(t: Tile): string {
  if (t.suit === "feng") return WIND_NAMES[t.value - 1];
  if (t.suit === "jian") return JIAN_NAMES[t.value - 1];
  return `${t.value}${SUIT_NAMES[t.suit]}`;
}

function sortHand(hand: Tile[]): Tile[] {
  const suitOrder: Record<Suit, number> = { wan: 0, tiao: 1, bing: 2, feng: 3, jian: 4 };
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.value - b.value;
  });
}

function sameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value;
}

// ─── Win Detection ───────────────────────────────────────────────────────────
function countTiles(hand: Tile[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of hand) {
    const k = tileKey(t);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function canWin(hand: Tile[], melds: Meld[]): boolean {
  // Need 4 sets + 1 pair total. melds already count as sets.
  // Remaining hand must form (4 - melds.length) sets + 1 pair
  const setsNeeded = 4 - melds.length;
  return tryWin(hand, setsNeeded);
}

function tryWin(hand: Tile[], setsNeeded: number): boolean {
  if (hand.length === 0 && setsNeeded === 0) return true;
  if (hand.length === 2 && setsNeeded === 0) {
    return sameTile(hand[0], hand[1]);
  }
  if (hand.length < 2) return false;

  const sorted = sortHand(hand);
  // Try pair first
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sameTile(sorted[i], sorted[i + 1])) {
      const rest = [...sorted.slice(0, i), ...sorted.slice(i + 2)];
      if (trySets(rest, setsNeeded)) return true;
      // Skip duplicates
      while (i + 2 < sorted.length && sameTile(sorted[i], sorted[i + 2])) i++;
    }
  }
  return false;
}

function trySets(hand: Tile[], setsNeeded: number): boolean {
  if (setsNeeded === 0) return hand.length === 0;
  if (hand.length < 3) return false;

  const sorted = sortHand(hand);
  const first = sorted[0];

  // Try triplet (pong)
  if (sorted.length >= 3 && sameTile(sorted[0], sorted[1]) && sameTile(sorted[1], sorted[2])) {
    if (trySets(sorted.slice(3), setsNeeded - 1)) return true;
  }

  // Try sequence (chi) - only for numbered suits
  if (first.suit === "wan" || first.suit === "tiao" || first.suit === "bing") {
    const idx2 = sorted.findIndex(t => t.suit === first.suit && t.value === first.value + 1);
    if (idx2 >= 0) {
      const rest2 = [...sorted.slice(1, idx2), ...sorted.slice(idx2 + 1)];
      const idx3 = rest2.findIndex(t => t.suit === first.suit && t.value === first.value + 2);
      if (idx3 >= 0) {
        const rest3 = [...rest2.slice(0, idx3), ...rest2.slice(idx3 + 1)];
        if (trySets(rest3, setsNeeded - 1)) return true;
      }
    }
  }

  return false;
}


// ─── Action Detection ────────────────────────────────────────────────────────
function canPong(hand: Tile[], discard: Tile): boolean {
  let count = 0;
  for (const t of hand) if (sameTile(t, discard)) count++;
  return count >= 2;
}

function canKong(hand: Tile[], discard: Tile): boolean {
  let count = 0;
  for (const t of hand) if (sameTile(t, discard)) count++;
  return count >= 3;
}

function canSelfKong(hand: Tile[]): Tile | null {
  const counts = countTiles(hand);
  for (const [, count] of counts) {
    if (count === 4) {
      const t = hand.find(h => {
        const k = tileKey(h);
        return counts.get(k) === 4;
      });
      return t || null;
    }
  }
  return null;
}

function canChi(hand: Tile[], discard: Tile, playerIdx: number, discardPlayer: number): Tile[][] {
  // Chi only from the player to your left (previous player)
  if ((discardPlayer + 1) % 4 !== playerIdx) return [];
  if (discard.suit === "feng" || discard.suit === "jian") return [];

  const combos: Tile[][] = [];
  const s = discard.suit;
  const v = discard.value;

  // v-2, v-1, v
  if (v >= 3) {
    const t1 = hand.find(t => t.suit === s && t.value === v - 2);
    const t2 = hand.find(t => t.suit === s && t.value === v - 1 && t.id !== t1?.id);
    if (t1 && t2) combos.push([t1, t2]);
  }
  // v-1, v, v+1
  if (v >= 2 && v <= 8) {
    const t1 = hand.find(t => t.suit === s && t.value === v - 1);
    const t2 = hand.find(t => t.suit === s && t.value === v + 1 && t.id !== t1?.id);
    if (t1 && t2) combos.push([t1, t2]);
  }
  // v, v+1, v+2
  if (v <= 7) {
    const t1 = hand.find(t => t.suit === s && t.value === v + 1);
    const t2 = hand.find(t => t.suit === s && t.value === v + 2 && t.id !== t1?.id);
    if (t1 && t2) combos.push([t1, t2]);
  }
  return combos;
}

function canHu(hand: Tile[], melds: Meld[], discard: Tile | null): boolean {
  const testHand = discard ? [...hand, discard] : [...hand];
  return canWin(testHand, melds);
}

// ─── Game Init ───────────────────────────────────────────────────────────────
function initGameState(): GameState {
  const wall = shuffleArray(createFullWall());
  const players: Player[] = [];
  for (let i = 0; i < 4; i++) {
    const hand = sortHand(wall.splice(0, 13));
    players.push({
      hand,
      melds: [],
      discards: [],
      isHuman: i === 0,
      wind: i as Wind,
    });
  }
  // Dealer (East) draws first extra tile
  const firstDraw = wall.shift()!;
  players[0].hand.push(firstDraw);
  players[0].hand = sortHand(players[0].hand);

  return {
    wall,
    players,
    currentPlayer: 0,
    phase: "discard", // dealer starts by discarding
    lastDiscard: null,
    lastDiscardPlayer: -1,
    winner: -1,
    dealer: 0,
    turnCount: 0,
    pendingActions: [],
  };
}

// ─── AI Logic ────────────────────────────────────────────────────────────────
function aiChooseDiscard(player: Player): number {
  // Simple AI: discard isolated tiles first, then random
  const hand = player.hand;
  if (hand.length === 0) return 0;

  // Try to discard isolated honor tiles first
  for (let i = 0; i < hand.length; i++) {
    const t = hand[i];
    if (t.suit === "feng" || t.suit === "jian") {
      const count = hand.filter(h => sameTile(h, t)).length;
      if (count === 1) return i;
    }
  }
  // Discard isolated number tiles
  for (let i = 0; i < hand.length; i++) {
    const t = hand[i];
    if (t.suit !== "feng" && t.suit !== "jian") {
      const hasNeighbor = hand.some(h => h.suit === t.suit && Math.abs(h.value - t.value) <= 1 && h.id !== t.id);
      if (!hasNeighbor) return i;
    }
  }
  return Math.floor(Math.random() * hand.length);
}

// ─── Tile Drawing with PixiJS Graphics ───────────────────────────────────────
function drawTileFace(
  g: PixiGraphics,
  pixi: typeof import("pixi.js"),
  container: PixiContainer,
  tile: Tile,
  x: number, y: number, w: number, h: number,
  faceDown: boolean,
  selected: boolean,
  textPool: Map<string, PixiText>,
  textIdx: { val: number },
) {
  const radius = Math.min(w, h) * 0.15;

  if (faceDown) {
    g.roundRect(x, y, w, h, radius).fill({ color: 0x1a6b3a });
    g.roundRect(x + 2, y + 2, w - 4, h - 4, radius - 1).stroke({ color: 0x2a8b5a, width: 1 });
    return;
  }

  // Tile background
  const bgColor = selected ? 0x3ea6ff : 0xf5f0e8;
  g.roundRect(x, y, w, h, radius).fill({ color: bgColor });
  g.roundRect(x, y, w, h, radius).stroke({ color: 0x999999, width: 1 });

  // Shadow at bottom
  g.roundRect(x, y + h - 3, w, 3, radius).fill({ color: 0xccccaa, alpha: 0.3 });

  const cx = x + w / 2;
  const cy = y + h / 2;
  const smallSize = Math.min(w, h) * 0.3;

  if (tile.suit === "wan") {
    // Red number + 万 text
    showTileText(pixi, container, textPool, textIdx, String(tile.value), cx, cy - smallSize * 0.4, {
      fill: "#cc0000", fontSize: Math.floor(smallSize * 1.4), fontWeight: "bold", ax: 0.5, ay: 0.5,
    });
    showTileText(pixi, container, textPool, textIdx, "万", cx, cy + smallSize * 0.7, {
      fill: "#cc0000", fontSize: Math.floor(smallSize * 0.8), ax: 0.5, ay: 0.5,
    });
  } else if (tile.suit === "tiao") {
    // Green bamboo lines
    const lineCount = Math.min(tile.value, 5);
    const lineW = Math.max(2, w * 0.06);
    const lineH = h * 0.4;
    const startX = cx - (lineCount - 1) * lineW * 1.5;
    for (let i = 0; i < lineCount; i++) {
      const lx = startX + i * lineW * 3;
      g.roundRect(lx - lineW / 2, cy - lineH / 2 - smallSize * 0.2, lineW, lineH, 1)
        .fill({ color: 0x228b22 });
    }
    showTileText(pixi, container, textPool, textIdx, String(tile.value), cx, cy + smallSize * 0.8, {
      fill: "#228b22", fontSize: Math.floor(smallSize * 0.7), fontWeight: "bold", ax: 0.5, ay: 0.5,
    });
  } else if (tile.suit === "bing") {
    // Red circles
    const circleR = Math.min(w, h) * 0.08;
    const rows = tile.value <= 3 ? 1 : tile.value <= 6 ? 2 : 3;
    const perRow = Math.ceil(tile.value / rows);
    let drawn = 0;
    for (let r = 0; r < rows && drawn < tile.value; r++) {
      const thisRow = Math.min(perRow, tile.value - drawn);
      const rowY = cy - (rows - 1) * circleR * 1.5 + r * circleR * 3 - smallSize * 0.15;
      for (let c = 0; c < thisRow; c++) {
        const dotX = cx - (thisRow - 1) * circleR * 1.5 + c * circleR * 3;
        g.circle(dotX, rowY, circleR).fill({ color: 0xcc0000 });
        g.circle(dotX, rowY, circleR * 0.5).fill({ color: 0xf5f0e8 });
        drawn++;
      }
    }
  } else if (tile.suit === "feng") {
    showTileText(pixi, container, textPool, textIdx, WIND_NAMES[tile.value - 1], cx, cy, {
      fill: "#000000", fontSize: Math.floor(smallSize * 1.6), fontWeight: "bold", ax: 0.5, ay: 0.5,
    });
  } else if (tile.suit === "jian") {
    const colors = ["#cc0000", "#228b22", "#4444aa"];
    const names = ["中", "发", "白"];
    if (tile.value === 3) {
      // 白 - empty frame
      g.roundRect(cx - smallSize * 0.5, cy - smallSize * 0.5, smallSize, smallSize, 2)
        .stroke({ color: 0x4444aa, width: 2 });
    } else {
      showTileText(pixi, container, textPool, textIdx, names[tile.value - 1], cx, cy, {
        fill: colors[tile.value - 1], fontSize: Math.floor(smallSize * 1.6), fontWeight: "bold", ax: 0.5, ay: 0.5,
      });
    }
  }
}

function showTileText(
  pixi: typeof import("pixi.js"),
  container: PixiContainer,
  textPool: Map<string, PixiText>,
  textIdx: { val: number },
  text: string,
  x: number, y: number,
  opts: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number },
) {
  const key = `tile_t${textIdx.val}`;
  textIdx.val++;
  let t = textPool.get(key);
  if (!t) {
    t = new pixi.Text({ text: "", style: new pixi.TextStyle({
      fontSize: 12,
      fill: "#000000",
      fontWeight: "normal",
      fontFamily: "serif, -apple-system, BlinkMacSystemFont, sans-serif",
    })});
    container.addChild(t);
    textPool.set(key, t);
  }
  t.text = text;
  t.x = x;
  t.y = y;
  t.anchor.set(opts.ax ?? 0, opts.ay ?? 0);
  t.alpha = opts.alpha ?? 1;
  t.style.fill = opts.fill ?? "#000000";
  t.style.fontSize = opts.fontSize ?? 12;
  t.style.fontWeight = (opts.fontWeight ?? "normal") as "normal" | "bold";
  t.visible = true;
}


// ─── Main Component ──────────────────────────────────────────────────────────
export default function MahjongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const soundRef = useRef<SoundEngine>(null!);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const textContainerRef = useRef<PixiContainer | null>(null);
  const pixiInitRef = useRef(false);
  const scoreSubmittedRef = useRef(false);
  const selectedTileRef = useRef<number>(-1);
  const animTimeRef = useRef(0);

  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(-1);
  const [message, setMessage] = useState("游戏开始 - 请出牌");
  const [, forceUpdate] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showActions, setShowActions] = useState<string[]>([]);
  const [chiOptions, setChiOptions] = useState<Tile[][]>([]);

  const showMsg = useCallback((msg: string) => {
    setMessage(msg);
  }, []);

  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* ignore */ }
  }, []);

  // ─── Game Actions ──────────────────────────────────────────────────────
  const checkActionsAfterDiscard = useCallback((game: GameState) => {
    if (game.phase === "over" || !game.lastDiscard) return;
    const actions: PendingAction[] = [];
    const discard = game.lastDiscard;
    const dp = game.lastDiscardPlayer;

    for (let i = 0; i < 4; i++) {
      if (i === dp) continue;
      const p = game.players[i];
      // Hu check
      if (canHu(p.hand, p.melds, discard)) {
        actions.push({ player: i, type: "hu" });
      }
      // Kong check
      if (canKong(p.hand, discard)) {
        actions.push({ player: i, type: "kong" });
      }
      // Pong check
      if (canPong(p.hand, discard)) {
        actions.push({ player: i, type: "pong" });
      }
      // Chi check (only next player)
      if ((dp + 1) % 4 === i) {
        const chiCombos = canChi(p.hand, discard, i, dp);
        if (chiCombos.length > 0) {
          actions.push({ player: i, type: "chi", tiles: chiCombos[0] });
        }
      }
    }

    game.pendingActions = actions;

    // Check if human has actions
    const humanActions = actions.filter(a => a.player === 0);
    if (humanActions.length > 0) {
      const acts = humanActions.map(a => a.type);
      acts.push("pass");
      setShowActions(acts);
      if (acts.includes("chi")) {
        const chiActs = actions.filter(a => a.player === 0 && a.type === "chi");
        // Gather all chi options for human
        const allChi = canChi(game.players[0].hand, discard, 0, dp);
        setChiOptions(allChi);
      }
      game.phase = "action";
      showMsg("请选择操作");
    } else {
      // AI auto-actions
      resolveAIActions(game);
    }
  }, [showMsg]);

  const resolveAIActions = useCallback((game: GameState) => {
    const actions = game.pendingActions.filter(a => a.player !== 0);
    if (actions.length === 0) {
      // No actions, next player draws
      advanceToNextPlayer(game);
      return;
    }

    // Priority: hu > kong > pong > chi
    const sorted = [...actions].sort((a, b) => {
      const pri: Record<string, number> = { hu: 0, kong: 1, pong: 2, chi: 3 };
      return (pri[a.type] ?? 4) - (pri[b.type] ?? 4);
    });

    const best = sorted[0];
    const p = game.players[best.player];
    const discard = game.lastDiscard!;

    if (best.type === "hu") {
      // AI wins
      p.hand.push(discard);
      p.hand = sortHand(p.hand);
      game.lastDiscard = null;
      game.winner = best.player;
      game.phase = "over";
      soundRef.current?.playLevelUp();
      showMsg(`${WIND_NAMES[best.player]}家 胡牌!`);
      setWinner(best.player);
      setGameOver(true);
      return;
    }

    if (best.type === "pong") {
      // AI always pongs
      const matching = p.hand.filter(t => sameTile(t, discard));
      const toRemove = matching.slice(0, 2);
      p.hand = p.hand.filter(t => !toRemove.includes(t));
      p.melds.push({ type: "pong", tiles: [...toRemove, discard] });
      game.lastDiscard = null;
      soundRef.current?.playCombo(2);
      showMsg(`${WIND_NAMES[best.player]}家 碰!`);
      // AI discards
      game.currentPlayer = best.player;
      const discIdx = aiChooseDiscard(p);
      const discarded = p.hand.splice(discIdx, 1)[0];
      p.discards.push(discarded);
      game.lastDiscard = discarded;
      game.lastDiscardPlayer = best.player;
      game.pendingActions = [];
      setTimeout(() => {
        checkActionsAfterDiscard(game);
        forceUpdate(n => n + 1);
      }, 400);
      return;
    }

    if (best.type === "kong") {
      const matching = p.hand.filter(t => sameTile(t, discard));
      const toRemove = matching.slice(0, 3);
      p.hand = p.hand.filter(t => !toRemove.includes(t));
      p.melds.push({ type: "kong", tiles: [...toRemove, discard] });
      game.lastDiscard = null;
      soundRef.current?.playCombo(3);
      showMsg(`${WIND_NAMES[best.player]}家 杠!`);
      // Draw replacement tile
      if (game.wall.length > 0) {
        const drawn = game.wall.shift()!;
        p.hand.push(drawn);
        p.hand = sortHand(p.hand);
      }
      game.currentPlayer = best.player;
      const discIdx = aiChooseDiscard(p);
      const discarded = p.hand.splice(discIdx, 1)[0];
      p.discards.push(discarded);
      game.lastDiscard = discarded;
      game.lastDiscardPlayer = best.player;
      game.pendingActions = [];
      setTimeout(() => {
        checkActionsAfterDiscard(game);
        forceUpdate(n => n + 1);
      }, 400);
      return;
    }

    // Chi
    if (best.type === "chi" && best.tiles) {
      p.hand = p.hand.filter(t => !best.tiles!.includes(t));
      p.melds.push({ type: "chi", tiles: [...best.tiles, discard] });
      game.lastDiscard = null;
      soundRef.current?.playScore(50);
      showMsg(`${WIND_NAMES[best.player]}家 吃!`);
      game.currentPlayer = best.player;
      const discIdx = aiChooseDiscard(p);
      const discarded = p.hand.splice(discIdx, 1)[0];
      p.discards.push(discarded);
      game.lastDiscard = discarded;
      game.lastDiscardPlayer = best.player;
      game.pendingActions = [];
      setTimeout(() => {
        checkActionsAfterDiscard(game);
        forceUpdate(n => n + 1);
      }, 400);
      return;
    }

    advanceToNextPlayer(game);
  }, [checkActionsAfterDiscard, showMsg]);

  const advanceToNextPlayer = useCallback((game: GameState) => {
    game.pendingActions = [];
    game.currentPlayer = (game.lastDiscardPlayer + 1) % 4;
    game.turnCount++;

    // Draw tile
    if (game.wall.length === 0) {
      game.phase = "over";
      game.winner = -1;
      showMsg("流局 - 牌墙已空");
      setGameOver(true);
      return;
    }

    const p = game.players[game.currentPlayer];
    const drawn = game.wall.shift()!;
    p.hand.push(drawn);
    p.hand = sortHand(p.hand);
    soundRef.current?.playClick();

    // Check self-hu after draw
    if (canHu(p.hand, p.melds, null)) {
      if (!p.isHuman) {
        // AI auto-hu
        game.winner = game.currentPlayer;
        game.phase = "over";
        soundRef.current?.playLevelUp();
        showMsg(`${WIND_NAMES[game.currentPlayer]}家 自摸胡牌!`);
        setWinner(game.currentPlayer);
        setGameOver(true);
        forceUpdate(n => n + 1);
        return;
      } else {
        setShowActions(["hu", "pass"]);
        game.phase = "action";
        showMsg("自摸! 是否胡牌?");
        forceUpdate(n => n + 1);
        return;
      }
    }

    if (p.isHuman) {
      game.phase = "discard";
      showMsg("请选择要打出的牌");
    } else {
      // AI discard
      game.phase = "discard";
      setTimeout(() => {
        const discIdx = aiChooseDiscard(p);
        const discarded = p.hand.splice(discIdx, 1)[0];
        p.discards.push(discarded);
        game.lastDiscard = discarded;
        game.lastDiscardPlayer = game.currentPlayer;
        soundRef.current?.playMove();
        checkActionsAfterDiscard(game);
        forceUpdate(n => n + 1);
      }, 300 + Math.random() * 400);
    }
    forceUpdate(n => n + 1);
  }, [checkActionsAfterDiscard, showMsg]);

  const handleDiscard = useCallback((tileIdx: number) => {
    const game = gameRef.current;
    if (!game || game.phase !== "discard" || game.currentPlayer !== 0) return;
    const p = game.players[0];
    if (tileIdx < 0 || tileIdx >= p.hand.length) return;

    const discarded = p.hand.splice(tileIdx, 1)[0];
    p.discards.push(discarded);
    game.lastDiscard = discarded;
    game.lastDiscardPlayer = 0;
    selectedTileRef.current = -1;
    soundRef.current?.playMove();
    checkActionsAfterDiscard(game);
    forceUpdate(n => n + 1);
  }, [checkActionsAfterDiscard]);

  const handleAction = useCallback((action: string, chiIdx?: number) => {
    const game = gameRef.current;
    if (!game) return;
    const p = game.players[0];

    if (action === "pass") {
      setShowActions([]);
      setChiOptions([]);
      // If it was self-draw action phase, go to discard
      if (game.currentPlayer === 0 && !game.lastDiscard) {
        game.phase = "discard";
        showMsg("请选择要打出的牌");
        forceUpdate(n => n + 1);
        return;
      }
      // Remove human actions, let AI resolve
      game.pendingActions = game.pendingActions.filter(a => a.player !== 0);
      resolveAIActions(game);
      forceUpdate(n => n + 1);
      return;
    }

    if (action === "hu") {
      if (game.currentPlayer === 0 && !game.lastDiscard) {
        // Self-draw hu
        game.winner = 0;
        game.phase = "over";
        soundRef.current?.playLevelUp();
        showMsg("恭喜! 自摸胡牌!");
        submitScore(1000 + game.turnCount * 10);
        setWinner(0);
        setGameOver(true);
      } else if (game.lastDiscard) {
        p.hand.push(game.lastDiscard);
        p.hand = sortHand(p.hand);
        game.lastDiscard = null;
        game.winner = 0;
        game.phase = "over";
        soundRef.current?.playLevelUp();
        showMsg("恭喜! 胡牌!");
        submitScore(800 + game.turnCount * 10);
        setWinner(0);
        setGameOver(true);
      }
      setShowActions([]);
      setChiOptions([]);
      forceUpdate(n => n + 1);
      return;
    }

    const discard = game.lastDiscard;
    if (!discard) return;

    if (action === "pong") {
      const matching = p.hand.filter(t => sameTile(t, discard));
      const toRemove = matching.slice(0, 2);
      p.hand = p.hand.filter(t => !toRemove.includes(t));
      p.melds.push({ type: "pong", tiles: [...toRemove, discard] });
      game.lastDiscard = null;
      game.currentPlayer = 0;
      game.phase = "discard";
      game.pendingActions = [];
      soundRef.current?.playCombo(2);
      showMsg("碰! 请出牌");
      setShowActions([]);
      setChiOptions([]);
      forceUpdate(n => n + 1);
      return;
    }

    if (action === "kong") {
      const matching = p.hand.filter(t => sameTile(t, discard));
      const toRemove = matching.slice(0, 3);
      p.hand = p.hand.filter(t => !toRemove.includes(t));
      p.melds.push({ type: "kong", tiles: [...toRemove, discard] });
      game.lastDiscard = null;
      game.currentPlayer = 0;
      game.pendingActions = [];
      soundRef.current?.playCombo(3);
      // Draw replacement
      if (game.wall.length > 0) {
        const drawn = game.wall.shift()!;
        p.hand.push(drawn);
        p.hand = sortHand(p.hand);
      }
      game.phase = "discard";
      showMsg("杠! 请出牌");
      setShowActions([]);
      setChiOptions([]);
      forceUpdate(n => n + 1);
      return;
    }

    if (action === "chi") {
      const idx = chiIdx ?? 0;
      const combo = chiOptions[idx];
      if (!combo) return;
      p.hand = p.hand.filter(t => !combo.includes(t));
      p.melds.push({ type: "chi", tiles: [...combo, discard] });
      game.lastDiscard = null;
      game.currentPlayer = 0;
      game.phase = "discard";
      game.pendingActions = [];
      soundRef.current?.playScore(50);
      showMsg("吃! 请出牌");
      setShowActions([]);
      setChiOptions([]);
      forceUpdate(n => n + 1);
      return;
    }
  }, [chiOptions, resolveAIActions, showMsg, submitScore]);

  const initGame = useCallback(() => {
    gameRef.current = initGameState();
    selectedTileRef.current = -1;
    scoreSubmittedRef.current = false;
    setGameOver(false);
    setWinner(-1);
    setShowActions([]);
    setChiOptions([]);
    showMsg("游戏开始 - 你是东家(庄家), 请出牌");
    forceUpdate(n => n + 1);
  }, [showMsg]);

  // ─── Save / Load ───────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      wall: game.wall.map(t => ({ ...t })),
      players: game.players.map(p => ({
        hand: p.hand.map(t => ({ ...t })),
        melds: p.melds.map(m => ({ type: m.type, tiles: m.tiles.map(t => ({ ...t })) })),
        discards: p.discards.map(t => ({ ...t })),
        isHuman: p.isHuman,
        wind: p.wind,
      })),
      currentPlayer: game.currentPlayer,
      phase: game.phase,
      lastDiscard: game.lastDiscard ? { ...game.lastDiscard } : null,
      lastDiscardPlayer: game.lastDiscardPlayer,
      winner: game.winner,
      dealer: game.dealer,
      turnCount: game.turnCount,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as GameState;
      if (!d || !Array.isArray(d.players)) return;
      gameRef.current = {
        ...d,
        pendingActions: [],
      };
      scoreSubmittedRef.current = false;
      setGameOver(d.phase === "over");
      setWinner(d.winner);
      setShowActions([]);
      setChiOptions([]);
      showMsg("存档已加载");
      forceUpdate(n => n + 1);
    } catch { /* ignore */ }
  }, [showMsg]);

  // ─── Toggle Mute ───────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    soundRef.current?.toggleMute();
    setMuted(m => !m);
  }, []);


  // ─── Initialization ────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    initGame();
  }, [initGame]);

  // ─── PixiJS Rendering ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const pw = parent.clientWidth;
      const cw = Math.min(pw, 900);
      const ch = Math.min(cw * 0.85, 700);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      if (pixiAppRef.current) {
        pixiAppRef.current.renderer.resize(cw, ch);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // Canvas click handler for tile selection
    const handleCanvasClick = (e: MouseEvent) => {
      const game = gameRef.current;
      if (!game || game.phase === "over") return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (canvas.clientWidth * (window.devicePixelRatio || 1));
      const scaleY = canvas.height / (canvas.clientHeight * (window.devicePixelRatio || 1));
      const mx = (e.clientX - rect.left) * scaleX * (window.devicePixelRatio || 1);
      const my = (e.clientY - rect.top) * scaleY * (window.devicePixelRatio || 1);

      // Check if clicking on player's hand tiles
      if (game.currentPlayer === 0 && game.phase === "discard") {
        const p = game.players[0];
        const w = pixiAppRef.current ? pixiAppRef.current.renderer.width / (pixiAppRef.current.renderer.resolution || 1) : 800;
        const h = pixiAppRef.current ? pixiAppRef.current.renderer.height / (pixiAppRef.current.renderer.resolution || 1) : 600;
        const tileW = Math.min(42, (w - 40) / (p.hand.length + 1));
        const tileH = tileW * 1.35;
        const handW = p.hand.length * tileW;
        const startX = (w - handW) / 2;
        const startY = h - tileH - 12;

        for (let i = 0; i < p.hand.length; i++) {
          const tx = startX + i * tileW;
          const ty = selectedTileRef.current === i ? startY - 10 : startY;
          if (mx >= tx && mx <= tx + tileW - 2 && my >= ty && my <= ty + tileH) {
            if (selectedTileRef.current === i) {
              // Double click = discard
              handleDiscard(i);
            } else {
              selectedTileRef.current = i;
              forceUpdate(n => n + 1);
            }
            return;
          }
        }
      }
    };

    // Touch handler
    const handleCanvasTouch = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY } as MouseEvent;
      Object.defineProperty(fakeEvent, "target", { value: canvas });
      handleCanvasClick(fakeEvent);
    };

    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener("touchstart", handleCanvasTouch, { passive: false });

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;

      const pixi = await loadPixi();
      if (destroyed) return;

      const parent = canvas!.parentElement;
      const pw = parent ? parent.clientWidth : 900;
      const cw = Math.min(pw, 900);
      const ch = Math.min(cw * 0.85, 700);

      const app = await createPixiApp({
        canvas: canvas!,
        width: cw,
        height: ch,
        backgroundColor: 0x0a3a1a,
        antialias: true,
      });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const g = new pixi.Graphics();
      app.stage.addChild(g);
      pixiGfxRef.current = g;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      textContainerRef.current = textContainer;
      const texts = pixiTextsRef.current;
      texts.clear();

      // UI text pool
      const makeUIText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 12,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "serif, -apple-system, BlinkMacSystemFont, sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create UI text objects
      for (let i = 0; i < 20; i++) makeUIText(`ui${i}`, { fontSize: 14 });

      let uiIdx = 0;
      const showUIText = (text: string, x: number, y: number, opts?: {
        fill?: string; fontSize?: number; fontWeight?: string;
        ax?: number; ay?: number; alpha?: number;
      }) => {
        const key = `ui${uiIdx}`;
        uiIdx++;
        if (uiIdx > 19) return;
        const t = texts.get(key);
        if (!t) return;
        t.text = text;
        t.x = x; t.y = y;
        t.anchor.set(opts?.ax ?? 0, opts?.ay ?? 0);
        t.alpha = opts?.alpha ?? 1;
        t.style.fill = opts?.fill ?? "#ffffff";
        t.style.fontSize = opts?.fontSize ?? 12;
        t.style.fontWeight = (opts?.fontWeight ?? "normal") as "normal" | "bold";
        t.visible = true;
      };

      // ─── Render Loop ──────────────────────────────────────────────
      app.ticker.add((ticker) => {
        if (destroyed) return;
        const dt = Math.min(ticker.deltaMS, 50);
        const game = gameRef.current;
        if (!game) return;

        animTimeRef.current += dt / 1000;

        // Reset
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        uiIdx = 0;
        const textIdx = { val: 0 };

        const w = app.renderer.width / (app.renderer.resolution || 1);
        const h = app.renderer.height / (app.renderer.resolution || 1);

        // ─── Background ──────────────────────────────────────────
        // Dark green felt table
        g.rect(0, 0, w, h).fill({ color: 0x0a3a1a });
        // Table border
        g.roundRect(4, 4, w - 8, h - 8, 12).stroke({ color: 0x1a5a3a, width: 2 });

        // Center area for discards
        const centerX = w / 2;
        const centerY = h / 2 - 20;
        const discardAreaW = Math.min(w * 0.45, 350);
        const discardAreaH = Math.min(h * 0.35, 220);
        g.roundRect(centerX - discardAreaW / 2, centerY - discardAreaH / 2, discardAreaW, discardAreaH, 8)
          .fill({ color: 0x0d4d24, alpha: 0.6 });
        g.roundRect(centerX - discardAreaW / 2, centerY - discardAreaH / 2, discardAreaW, discardAreaH, 8)
          .stroke({ color: 0x1a6b3a, width: 1 });

        // ─── Wall count ──────────────────────────────────────────
        showUIText(`余牌: ${game.wall.length}`, centerX, centerY - discardAreaH / 2 + 8, {
          fill: "#88cc88", fontSize: 11, ax: 0.5, ay: 0,
        });

        // ─── Wind indicators ─────────────────────────────────────
        const windLabels = ["东(你)", "南", "西", "北"];
        const windPositions = [
          { x: centerX, y: h - 4 },           // bottom (player)
          { x: w - 4, y: centerY },            // right
          { x: centerX, y: 4 },                // top
          { x: 4, y: centerY },                // left
        ];
        for (let i = 0; i < 4; i++) {
          const wp = windPositions[i];
          const isActive = game.currentPlayer === i;
          const color = isActive ? "#3ea6ff" : "#668866";
          const ax = i === 3 ? 0 : i === 1 ? 1 : 0.5;
          const ay = i === 0 ? 1 : i === 2 ? 0 : 0.5;
          showUIText(windLabels[i], wp.x, wp.y, {
            fill: color, fontSize: 11, fontWeight: isActive ? "bold" : "normal", ax, ay,
          });
        }

        // ─── Draw discards in center ─────────────────────────────
        const miniTileW = Math.min(22, discardAreaW / 10);
        const miniTileH = miniTileW * 1.3;

        for (let pi = 0; pi < 4; pi++) {
          const discards = game.players[pi].discards;
          const maxPerRow = Math.floor(discardAreaW / (miniTileW + 1)) - 1;
          for (let di = 0; di < discards.length; di++) {
            const row = Math.floor(di / maxPerRow);
            const col = di % maxPerRow;
            let dx: number, dy: number;
            if (pi === 0) {
              // Bottom section
              dx = centerX - discardAreaW / 2 + 10 + col * (miniTileW + 1);
              dy = centerY + 8 + row * (miniTileH + 1);
            } else if (pi === 2) {
              // Top section
              dx = centerX - discardAreaW / 2 + 10 + col * (miniTileW + 1);
              dy = centerY - discardAreaH / 2 + 22 + row * (miniTileH + 1);
            } else if (pi === 1) {
              // Right section
              dx = centerX + discardAreaW / 4 + col * (miniTileW + 1);
              dy = centerY - discardAreaH / 4 + row * (miniTileH + 1);
            } else {
              // Left section
              dx = centerX - discardAreaW / 2 + 10 + col * (miniTileW + 1);
              dy = centerY - discardAreaH / 4 + row * (miniTileH + 1);
            }
            if (dy < centerY + discardAreaH / 2 - miniTileH && dx < centerX + discardAreaW / 2 - miniTileW) {
              drawTileFace(g, pixi, textContainer, discards[di], dx, dy, miniTileW, miniTileH, false, false, texts, textIdx);
            }
          }
        }

        // ─── Draw opponent hands (face down) ─────────────────────
        // Player 2 (top)
        {
          const p2 = game.players[2];
          const count = p2.hand.length;
          const tw = Math.min(28, (w - 100) / (count + 1));
          const th = tw * 1.3;
          const sx = (w - count * tw) / 2;
          for (let i = 0; i < count; i++) {
            drawTileFace(g, pixi, textContainer, p2.hand[i], sx + i * tw, 20, tw - 1, th, true, false, texts, textIdx);
          }
          // Melds
          let mx = sx + count * tw + 4;
          for (const meld of p2.melds) {
            for (const mt of meld.tiles) {
              drawTileFace(g, pixi, textContainer, mt, mx, 20, tw - 1, th, false, false, texts, textIdx);
              mx += tw;
            }
            mx += 4;
          }
        }

        // Player 1 (right) - vertical
        {
          const p1 = game.players[1];
          const count = p1.hand.length;
          const tw = Math.min(24, (h - 160) / (count + 1));
          const th = tw * 1.3;
          const sx = w - th - 12;
          const sy = (h - count * tw) / 2;
          for (let i = 0; i < count; i++) {
            drawTileFace(g, pixi, textContainer, p1.hand[i], sx, sy + i * tw, th, tw - 1, true, false, texts, textIdx);
          }
        }

        // Player 3 (left) - vertical
        {
          const p3 = game.players[3];
          const count = p3.hand.length;
          const tw = Math.min(24, (h - 160) / (count + 1));
          const th = tw * 1.3;
          const sy = (h - count * tw) / 2;
          for (let i = 0; i < count; i++) {
            drawTileFace(g, pixi, textContainer, p3.hand[i], 12, sy + i * tw, th, tw - 1, true, false, texts, textIdx);
          }
        }

        // ─── Draw player's hand (bottom, face up) ────────────────
        {
          const p0 = game.players[0];
          const tileW = Math.min(42, (w - 40) / (p0.hand.length + 1));
          const tileH = tileW * 1.35;
          const handW = p0.hand.length * tileW;
          const startX = (w - handW) / 2;
          const startY = h - tileH - 12;

          for (let i = 0; i < p0.hand.length; i++) {
            const isSelected = selectedTileRef.current === i;
            const ty = isSelected ? startY - 10 : startY;
            drawTileFace(g, pixi, textContainer, p0.hand[i], startX + i * tileW, ty, tileW - 2, tileH, false, isSelected, texts, textIdx);
          }

          // Melds (to the right of hand)
          let meldX = startX + handW + 8;
          const meldTileW = tileW * 0.75;
          const meldTileH = tileH * 0.75;
          for (const meld of p0.melds) {
            for (const mt of meld.tiles) {
              drawTileFace(g, pixi, textContainer, mt, meldX, startY + (tileH - meldTileH), meldTileW - 1, meldTileH, false, false, texts, textIdx);
              meldX += meldTileW;
            }
            meldX += 4;
          }
        }

        // ─── Last discard highlight ──────────────────────────────
        if (game.lastDiscard && game.phase === "action") {
          const pulse = Math.sin(animTimeRef.current * 4) * 0.3 + 0.7;
          const ldW = 36;
          const ldH = ldW * 1.35;
          g.roundRect(centerX - ldW / 2 - 2, centerY - ldH / 2 - 2, ldW + 4, ldH + 4, 6)
            .stroke({ color: 0x3ea6ff, width: 2, alpha: pulse });
          drawTileFace(g, pixi, textContainer, game.lastDiscard, centerX - ldW / 2, centerY - ldH / 2, ldW, ldH, false, false, texts, textIdx);
        }

        // ─── Game over overlay ───────────────────────────────────
        if (game.phase === "over") {
          g.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.5 });
          const resultText = game.winner >= 0
            ? (game.winner === 0 ? "恭喜胡牌!" : `${WIND_NAMES[game.winner]}家 胡牌`)
            : "流局";
          showUIText(resultText, centerX, centerY - 10, {
            fill: game.winner === 0 ? "#ffd700" : "#ff6666",
            fontSize: 28, fontWeight: "bold", ax: 0.5, ay: 0.5,
          });
          showUIText("点击「新游戏」重新开始", centerX, centerY + 25, {
            fill: "#aaaaaa", fontSize: 13, ax: 0.5, ay: 0.5,
          });
        }
      });
    }

    initPixi();

    return () => {
      destroyed = true;
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("touchstart", handleCanvasTouch);
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      pixiGfxRef.current = null;
      pixiTextsRef.current.clear();
      textContainerRef.current = null;
      pixiInitRef.current = false;
    };
  }, [handleDiscard, initGame]);


  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-[960px] mx-auto px-4 pt-4 pb-24 lg:pb-8">
        {/* Nav */}
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/games"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#3ea6ff] transition"
          >
            <ArrowLeft size={16} />
            返回游戏
          </Link>
          <h1 className="text-lg font-bold text-[#3ea6ff]">麻将</h1>
          <button
            onClick={toggleMute}
            className="ml-auto p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
            title={muted ? "开启音效" : "关闭音效"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        {/* Message bar */}
        <div className="mb-3 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm text-center text-[#88cc88]">
          {message}
        </div>

        {/* Canvas */}
        <div className="relative w-full flex justify-center mb-4">
          <canvas
            ref={canvasRef}
            className="rounded-xl border border-[#333] max-w-full touch-none"
          />
        </div>

        {/* Action buttons */}
        {showActions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {showActions.includes("hu") && (
              <button
                onClick={() => handleAction("hu")}
                className="px-5 py-2.5 rounded-lg bg-[#ff4444] text-white font-bold text-sm hover:bg-[#ff6666] transition shadow-lg"
              >
                胡牌
              </button>
            )}
            {showActions.includes("kong") && (
              <button
                onClick={() => handleAction("kong")}
                className="px-5 py-2.5 rounded-lg bg-[#ff8800] text-white font-bold text-sm hover:bg-[#ffaa33] transition"
              >
                杠
              </button>
            )}
            {showActions.includes("pong") && (
              <button
                onClick={() => handleAction("pong")}
                className="px-5 py-2.5 rounded-lg bg-[#3ea6ff] text-white font-bold text-sm hover:bg-[#5bb8ff] transition"
              >
                碰
              </button>
            )}
            {showActions.includes("chi") && chiOptions.length > 0 && (
              chiOptions.map((combo, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAction("chi", idx)}
                  className="px-5 py-2.5 rounded-lg bg-[#44bb44] text-white font-bold text-sm hover:bg-[#66dd66] transition"
                >
                  吃 {combo.map(t => tileName(t)).join("+")}
                </button>
              ))
            )}
            {showActions.includes("pass") && (
              <button
                onClick={() => handleAction("pass")}
                className="px-5 py-2.5 rounded-lg bg-[#333] text-gray-300 font-bold text-sm hover:bg-[#444] transition"
              >
                过
              </button>
            )}
          </div>
        )}

        {/* Discard selected tile button */}
        {!gameOver && gameRef.current?.currentPlayer === 0 && gameRef.current?.phase === "discard" && selectedTileRef.current >= 0 && (
          <div className="flex justify-center mb-4">
            <button
              onClick={() => handleDiscard(selectedTileRef.current)}
              className="px-6 py-2.5 rounded-lg bg-[#3ea6ff] text-white font-bold text-sm hover:bg-[#5bb8ff] transition"
            >
              打出选中的牌
            </button>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          <button
            onClick={initGame}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm text-gray-300 hover:text-[#3ea6ff] hover:border-[#3ea6ff]/30 transition"
          >
            <RotateCw size={14} />
            新游戏
          </button>
        </div>

        {/* Info panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Player info */}
          <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
            <h3 className="text-sm font-bold mb-3 text-[#3ea6ff]">对局信息</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">庄家</span>
                <span className="text-white">东家 (你)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">余牌</span>
                <span className="text-[#88cc88]">{gameRef.current?.wall.length ?? 0} 张</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">回合</span>
                <span className="text-white">{gameRef.current?.turnCount ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">状态</span>
                <span className="text-[#3ea6ff]">
                  {gameOver ? (winner === 0 ? "胜利" : winner > 0 ? "失败" : "流局") : "进行中"}
                </span>
              </div>
            </div>
          </div>

          {/* Rules hint */}
          <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
            <h3 className="text-sm font-bold mb-3 text-[#3ea6ff]">操作说明</h3>
            <div className="space-y-1 text-xs text-gray-400">
              <p>点击牌选中, 再次点击打出</p>
              <p>或点击选中后按「打出选中的牌」</p>
              <p>碰/吃/杠/胡 按钮会在可操作时出现</p>
              <p>胡牌条件: 4组面子 + 1对雀头</p>
              <p>面子: 顺子(吃) 或 刻子(碰)</p>
            </div>
          </div>
        </div>

        {/* Save/Load & Leaderboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}
