"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import GameSaveLoad from "@/components/GameSaveLoad";
import GameLeaderboard from "@/components/GameLeaderboard";
import Link from "next/link";
import {
  ChevronLeft, Volume2, VolumeX, Lock, Play, RotateCcw,
  Camera, Trash2, Home, Flower2, LayoutGrid
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-sandbox";
const W = 480, H = 480;
const GRID = 24;
const COLS = W / GRID, ROWS = H / GRID;
const PRIMARY = "#3ea6ff", ACCENT = "#ff6b9d", BG = "#0f0f0f";

// ─── Types ───────────────────────────────────────────────────────────────────
type Phase = "title" | "playing" | "result";
type Difficulty = "easy" | "normal" | "hard";
type RoomType = "bedroom" | "bathroom" | "living" | "garden";
type FurnitureCategory = "bed" | "seating" | "table" | "lighting" | "bath" | "decor" | "plant" | "character";

interface FurnitureDef {
  id: string;
  name: string;
  category: FurnitureCategory;
  color: string;
  w: number;
  h: number;
  glow?: string;
  rooms: RoomType[];
  cost: number;
  scoreValue: number;
}

interface PlacedItem {
  id: string;
  defId: string;
  x: number;
  y: number;
  rotation: number; // 0, 90, 180, 270
}

interface RoomDef {
  type: RoomType;
  name: string;
  color: string;
  floorColor: string;
  wallColor: string;
  required: string[]; // furniture ids needed for completion
  bonusItems: string[];
}

interface GameState {
  room: RoomType;
  placed: PlacedItem[];
  coins: number;
  score: number;
  difficulty: Difficulty;
  nextItemId: number;
}

// ─── Room Definitions ────────────────────────────────────────────────────────
const ROOMS: RoomDef[] = [
  {
    type: "bedroom", name: "卧室", color: "#ff6b9d", floorColor: "#1a1020", wallColor: "#2a1a30",
    required: ["double-bed", "nightstand", "wardrobe", "lamp-floor"],
    bonusItems: ["mirror-full", "rug-round", "curtain", "painting"],
  },
  {
    type: "bathroom", name: "浴室", color: "#70a1ff", floorColor: "#101820", wallColor: "#1a2530",
    required: ["bathtub", "sink", "toilet", "mirror-wall"],
    bonusItems: ["towel-rack", "candle-set", "plant-small", "bath-mat"],
  },
  {
    type: "living", name: "客厅", color: "#ffa502", floorColor: "#181410", wallColor: "#2a2418",
    required: ["sofa", "coffee-table", "tv-stand", "lamp-table"],
    bonusItems: ["bookshelf", "rug-rect", "painting", "plant-tall"],
  },
  {
    type: "garden", name: "花园", color: "#2ed573", floorColor: "#0a1a0a", wallColor: "#1a2a1a",
    required: ["bench", "fountain", "flower-bed", "lantern"],
    bonusItems: ["tree", "swing", "pond", "statue"],
  },
];

// ─── Furniture Catalog (20+ items) ───────────────────────────────────────────
const FURNITURE: FurnitureDef[] = [
  // Beds
  { id: "double-bed", name: "双人床", category: "bed", color: "#ff6b9d", w: 4, h: 3, rooms: ["bedroom"], cost: 80, scoreValue: 15 },
  { id: "single-bed", name: "单人床", category: "bed", color: "#ff8fa3", w: 3, h: 2, rooms: ["bedroom"], cost: 50, scoreValue: 10 },
  // Seating
  { id: "sofa", name: "沙发", category: "seating", color: "#a55eea", w: 4, h: 2, rooms: ["living"], cost: 70, scoreValue: 15 },
  { id: "armchair", name: "扶手椅", category: "seating", color: "#b07cc6", w: 2, h: 2, rooms: ["living", "bedroom"], cost: 40, scoreValue: 8 },
  { id: "bench", name: "长椅", category: "seating", color: "#8B6914", w: 3, h: 1, rooms: ["garden"], cost: 35, scoreValue: 12 },
  // Tables
  { id: "nightstand", name: "床头柜", category: "table", color: "#c8a87c", w: 1, h: 1, rooms: ["bedroom"], cost: 20, scoreValue: 8 },
  { id: "coffee-table", name: "茶几", category: "table", color: "#d4a76a", w: 3, h: 2, rooms: ["living"], cost: 35, scoreValue: 10 },
  { id: "tv-stand", name: "电视柜", category: "table", color: "#555555", w: 4, h: 1, rooms: ["living"], cost: 60, scoreValue: 12 },
  { id: "vanity", name: "梳妆台", category: "table", color: "#e8c8a0", w: 2, h: 1, rooms: ["bedroom", "bathroom"], cost: 45, scoreValue: 10 },
  // Lighting
  { id: "lamp-floor", name: "落地灯", category: "lighting", color: "#ffd700", w: 1, h: 1, glow: "rgba(255,215,0,0.12)", rooms: ["bedroom", "living"], cost: 25, scoreValue: 8 },
  { id: "lamp-table", name: "台灯", category: "lighting", color: "#ffe066", w: 1, h: 1, glow: "rgba(255,224,102,0.10)", rooms: ["bedroom", "living"], cost: 20, scoreValue: 8 },
  { id: "candle-set", name: "烛台", category: "lighting", color: "#ff9f43", w: 1, h: 1, glow: "rgba(255,159,67,0.15)", rooms: ["bathroom", "bedroom"], cost: 15, scoreValue: 6 },
  { id: "lantern", name: "灯笼", category: "lighting", color: "#ff6348", w: 1, h: 1, glow: "rgba(255,99,72,0.12)", rooms: ["garden"], cost: 20, scoreValue: 10 },
  // Bath
  { id: "bathtub", name: "浴缸", category: "bath", color: "#dfe6e9", w: 4, h: 2, rooms: ["bathroom"], cost: 90, scoreValue: 18 },
  { id: "sink", name: "洗手台", category: "bath", color: "#b2bec3", w: 2, h: 1, rooms: ["bathroom"], cost: 30, scoreValue: 10 },
  { id: "toilet", name: "马桶", category: "bath", color: "#f5f6fa", w: 1, h: 2, rooms: ["bathroom"], cost: 40, scoreValue: 10 },
  // Decor
  { id: "mirror-full", name: "穿衣镜", category: "decor", color: "#74b9ff", w: 1, h: 2, rooms: ["bedroom", "bathroom"], cost: 30, scoreValue: 8 },
  { id: "mirror-wall", name: "壁镜", category: "decor", color: "#81ecec", w: 2, h: 1, rooms: ["bathroom"], cost: 25, scoreValue: 8 },
  { id: "wardrobe", name: "衣柜", category: "decor", color: "#6c5ce7", w: 3, h: 1, rooms: ["bedroom"], cost: 55, scoreValue: 12 },
  { id: "bookshelf", name: "书架", category: "decor", color: "#a0522d", w: 2, h: 1, rooms: ["living", "bedroom"], cost: 40, scoreValue: 10 },
  { id: "painting", name: "挂画", category: "decor", color: "#e17055", w: 2, h: 1, rooms: ["bedroom", "living"], cost: 20, scoreValue: 6 },
  { id: "curtain", name: "窗帘", category: "decor", color: "#d63031", w: 3, h: 1, rooms: ["bedroom", "living"], cost: 25, scoreValue: 6 },
  { id: "rug-round", name: "圆形地毯", category: "decor", color: "#e84393", w: 3, h: 3, rooms: ["bedroom", "living"], cost: 30, scoreValue: 6 },
  { id: "rug-rect", name: "方形地毯", category: "decor", color: "#fd79a8", w: 4, h: 3, rooms: ["living"], cost: 35, scoreValue: 6 },
  { id: "towel-rack", name: "毛巾架", category: "decor", color: "#636e72", w: 1, h: 1, rooms: ["bathroom"], cost: 10, scoreValue: 4 },
  { id: "bath-mat", name: "浴室垫", category: "decor", color: "#00cec9", w: 2, h: 1, rooms: ["bathroom"], cost: 10, scoreValue: 4 },
  { id: "statue", name: "雕像", category: "decor", color: "#b2bec3", w: 1, h: 1, rooms: ["garden"], cost: 50, scoreValue: 10 },
  // Plants
  { id: "plant-small", name: "小盆栽", category: "plant", color: "#00b894", w: 1, h: 1, rooms: ["bedroom", "living", "bathroom"], cost: 10, scoreValue: 4 },
  { id: "plant-tall", name: "大盆栽", category: "plant", color: "#2ed573", w: 1, h: 2, rooms: ["living", "bedroom"], cost: 20, scoreValue: 6 },
  { id: "flower-bed", name: "花坛", category: "plant", color: "#ff6b81", w: 3, h: 2, rooms: ["garden"], cost: 30, scoreValue: 12 },
  { id: "tree", name: "树木", category: "plant", color: "#1e8449", w: 2, h: 2, rooms: ["garden"], cost: 40, scoreValue: 10 },
  { id: "fountain", name: "喷泉", category: "plant", color: "#54a0ff", w: 2, h: 2, rooms: ["garden"], cost: 60, scoreValue: 15 },
  { id: "pond", name: "池塘", category: "plant", color: "#0984e3", w: 3, h: 2, rooms: ["garden"], cost: 50, scoreValue: 10 },
  { id: "swing", name: "秋千", category: "plant", color: "#c8a87c", w: 2, h: 2, rooms: ["garden"], cost: 35, scoreValue: 8 },
  // Characters
  { id: "char-sakura", name: "樱 (浴衣)", category: "character", color: "#ff6b9d", w: 1, h: 2, rooms: ["bedroom", "bathroom", "living", "garden"], cost: 100, scoreValue: 25 },
  { id: "char-rin", name: "凛 (礼服)", category: "character", color: "#a55eea", w: 1, h: 2, rooms: ["bedroom", "bathroom", "living", "garden"], cost: 100, scoreValue: 25 },
  { id: "char-moe", name: "萌 (泳装)", category: "character", color: "#ffa502", w: 1, h: 2, rooms: ["bedroom", "bathroom", "living", "garden"], cost: 100, scoreValue: 25 },
];

// ─── Difficulty Settings ─────────────────────────────────────────────────────
const DIFF_SETTINGS: Record<Difficulty, { coins: number; label: string; color: string }> = {
  easy: { coins: 800, label: "简单", color: "#20bf6b" },
  normal: { coins: 500, label: "普通", color: "#3ea6ff" },
  hard: { coins: 300, label: "困难", color: "#ff4757" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initGameState(diff: Difficulty): GameState {
  return {
    room: "bedroom",
    placed: [],
    coins: DIFF_SETTINGS[diff].coins,
    score: 0,
    difficulty: diff,
    nextItemId: 1,
  };
}

function getFurnitureDef(defId: string): FurnitureDef | undefined {
  return FURNITURE.find(f => f.id === defId);
}

function getRoomDef(type: RoomType): RoomDef {
  return ROOMS.find(r => r.type === type)!;
}

function getItemBounds(item: PlacedItem, def: FurnitureDef): { x: number; y: number; w: number; h: number } {
  const rotated = item.rotation === 90 || item.rotation === 270;
  return {
    x: item.x,
    y: item.y,
    w: rotated ? def.h : def.w,
    h: rotated ? def.w : def.h,
  };
}

function itemsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function calcRoomScore(placed: PlacedItem[], roomType: RoomType): { score: number; completion: number; details: string[] } {
  const room = getRoomDef(roomType);
  const roomItems = placed.filter(p => {
    const def = getFurnitureDef(p.defId);
    return def && def.rooms.includes(roomType);
  });

  let score = 0;
  const details: string[] = [];

  for (const item of roomItems) {
    const def = getFurnitureDef(item.defId);
    if (def) score += def.scoreValue;
  }

  let requiredCount = 0;
  for (const reqId of room.required) {
    if (roomItems.some(p => p.defId === reqId)) {
      requiredCount++;
      score += 10;
    }
  }
  const reqCompletion = room.required.length > 0 ? requiredCount / room.required.length : 0;
  if (reqCompletion === 1) {
    score += 30;
    details.push("必需家具齐全 +30");
  }

  let bonusCount = 0;
  for (const bonusId of room.bonusItems) {
    if (roomItems.some(p => p.defId === bonusId)) {
      bonusCount++;
      score += 5;
    }
  }
  if (bonusCount >= 2) {
    score += 15;
    details.push(`装饰加成 +${15 + bonusCount * 5}`);
  }

  const chars = roomItems.filter(p => p.defId.startsWith("char-"));
  if (chars.length > 0) {
    score += chars.length * 20;
    details.push(`角色加成 +${chars.length * 20}`);
  }

  const categories = new Set(roomItems.map(p => getFurnitureDef(p.defId)?.category).filter(Boolean));
  if (categories.size >= 4) {
    score += 20;
    details.push("多样性加成 +20");
  }

  const completion = Math.min(100, Math.floor(reqCompletion * 60 + Math.min(bonusCount / Math.max(1, room.bonusItems.length), 1) * 25 + (chars.length > 0 ? 15 : 0)));

  return { score, completion, details };
}

function hexToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}


// ─── Component ───────────────────────────────────────────────────────────────
export default function AdultSandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const frameRef = useRef(0);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiInitRef = useRef(false);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [gameState, setGameState] = useState<GameState>(() => initGameState("normal"));
  const [selectedFurniture, setSelectedFurniture] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<FurnitureCategory | "all">("all");
  const [resultData, setResultData] = useState<{ score: number; completion: number; details: string[] }>({ score: 0, completion: 0, details: [] });

  const stateRef = useRef({ phase, gameState, selectedFurniture, dragging, dragOffset, hoveredItem, muted, difficulty, resultData });
  useEffect(() => {
    stateRef.current = { phase, gameState, selectedFurniture, dragging, dragOffset, hoveredItem, muted, difficulty, resultData };
  });

  // ─── Age Gate ──────────────────────────────────────────────────────────────
  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  // ─── Sound ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playSound = useCallback((type: "move" | "click" | "score" | "levelUp" | "gameOver" | "error") => {
    if (!soundRef.current || stateRef.current.muted) return;
    const s = soundRef.current;
    switch (type) {
      case "move": s.playMove(); break;
      case "click": s.playClick(); break;
      case "score": s.playScore(100); break;
      case "levelUp": s.playLevelUp(); break;
      case "gameOver": s.playGameOver(); break;
      case "error": s.playError(); break;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(m ?? false);
  }, []);

  // ─── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    setGameState(initGameState(diff));
    setSelectedFurniture(null);
    setDragging(null);
    setPhase("playing");
    playSound("click");
  }, [playSound]);

  // ─── Place Furniture ───────────────────────────────────────────────────────
  const placeFurniture = useCallback((gx: number, gy: number) => {
    const s = stateRef.current;
    if (!s.selectedFurniture || s.phase !== "playing") return;
    const def = getFurnitureDef(s.selectedFurniture);
    if (!def) return;
    if (s.gameState.coins < def.cost) { playSound("error"); return; }
    if (!def.rooms.includes(s.gameState.room)) { playSound("error"); return; }

    const px = Math.max(1, Math.min(COLS - 1 - def.w, gx));
    const py = Math.max(1, Math.min(ROWS - 1 - def.h, gy));
    const newBounds = { x: px, y: py, w: def.w, h: def.h };

    for (const item of s.gameState.placed) {
      const iDef = getFurnitureDef(item.defId);
      if (!iDef) continue;
      if (itemsOverlap(newBounds, getItemBounds(item, iDef))) {
        playSound("error");
        return;
      }
    }

    const newItem: PlacedItem = {
      id: `item-${s.gameState.nextItemId}`,
      defId: s.selectedFurniture,
      x: px, y: py, rotation: 0,
    };

    setGameState(prev => ({
      ...prev,
      placed: [...prev.placed, newItem],
      coins: prev.coins - def.cost,
      nextItemId: prev.nextItemId + 1,
    }));
    playSound("score");
  }, [playSound]);

  // ─── Remove Item ───────────────────────────────────────────────────────────
  const removeItem = useCallback((itemId: string) => {
    setGameState(prev => {
      const item = prev.placed.find(p => p.id === itemId);
      if (!item) return prev;
      const def = getFurnitureDef(item.defId);
      const refund = def ? Math.floor(def.cost * 0.7) : 0;
      return { ...prev, placed: prev.placed.filter(p => p.id !== itemId), coins: prev.coins + refund };
    });
    playSound("click");
  }, [playSound]);

  // ─── Rotate Item ───────────────────────────────────────────────────────────
  const rotateItem = useCallback((itemId: string) => {
    setGameState(prev => ({
      ...prev,
      placed: prev.placed.map(p => p.id === itemId ? { ...p, rotation: (p.rotation + 90) % 360 } : p),
    }));
    playSound("move");
  }, [playSound]);

  // ─── Switch Room ───────────────────────────────────────────────────────────
  const switchRoom = useCallback((room: RoomType) => {
    setGameState(prev => ({ ...prev, room }));
    setSelectedFurniture(null);
    setDragging(null);
    playSound("click");
  }, [playSound]);

  // ─── Finish & Score ────────────────────────────────────────────────────────
  const finishRoom = useCallback(() => {
    const gs = stateRef.current.gameState;
    const result = calcRoomScore(gs.placed, gs.room);
    setResultData(result);
    setGameState(prev => ({ ...prev, score: prev.score + result.score }));
    setPhase("result");
    playSound(result.completion >= 80 ? "levelUp" : result.completion >= 50 ? "score" : "gameOver");
  }, [playSound]);

  // ─── Take Photo ────────────────────────────────────────────────────────────
  const takePhoto = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const link = document.createElement("a");
      link.download = `秘密花园_${getRoomDef(stateRef.current.gameState.room).name}_${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      playSound("score");
    } catch { /* ignore */ }
  }, [playSound]);

  // ─── Save / Load ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    return { phase, difficulty, gameState };
  }, [phase, difficulty, gameState]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    const gs = d.gameState as GameState | undefined;
    if (gs) {
      setGameState({
        room: gs.room || "bedroom",
        placed: gs.placed || [],
        coins: gs.coins ?? 500,
        score: gs.score ?? 0,
        difficulty: gs.difficulty || "normal",
        nextItemId: gs.nextItemId || 1,
      });
      setDifficulty(gs.difficulty || "normal");
    }
    setPhase((d.phase as Phase) || "playing");
    playSound("click");
  }, [playSound]);

  // ─── PixiJS Render ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0f0f0f, antialias: true });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const g = new pixi.Graphics();
      app.stage.addChild(g);
      pixiGfxRef.current = g;

      // Pre-create text pool
      const TEXT_POOL_SIZE = 80;
      const texts = pixiTextsRef.current;
      texts.clear();
      for (let i = 0; i < TEXT_POOL_SIZE; i++) {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({ fontSize: 12, fill: "#ffffff", fontFamily: "sans-serif" }) });
        t.visible = false;
        app.stage.addChild(t);
        texts.set(`t${i}`, t);
      }

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: {
        fill?: string; fontSize?: number; fontWeight?: string;
        ax?: number; ay?: number; alpha?: number;
      }) => {
        if (textIdx >= TEXT_POOL_SIZE) return;
        const t = texts.get(`t${textIdx}`)!;
        textIdx++;
        t.text = text;
        t.x = x; t.y = y;
        t.anchor.set(opts?.ax ?? 0, opts?.ay ?? 0);
        t.alpha = opts?.alpha ?? 1;
        const st = t.style as import("pixi.js").TextStyle;
        st.fontSize = opts?.fontSize ?? 12;
        st.fill = opts?.fill ?? "#ffffff";
        st.fontWeight = (opts?.fontWeight ?? "normal") as "normal" | "bold";
        st.fontFamily = "sans-serif";
        t.visible = true;
      };

      app.ticker.add(() => {
        if (destroyed) return;
        frameRef.current++;
        const f = frameRef.current;
        const s = stateRef.current;

        g.clear();
        textIdx = 0;
        texts.forEach(t => { t.visible = false; });

        if (s.phase === "title") {
          renderTitlePixi(g, showText, f);
        } else if (s.phase === "playing") {
          renderRoomPixi(g, showText, s.gameState, s.hoveredItem, s.dragging, f);
        } else if (s.phase === "result") {
          renderResultPixi(g, showText, s.gameState, s.resultData, f);
        }
      });

      // ─── Title Render ──────────────────────────────────────────────────
      function renderTitlePixi(g: PixiGraphics, showText: (t: string, x: number, y: number, o?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => void, f: number) {
        // Background gradient approximation
        g.rect(0, 0, W, H / 2).fill({ color: 0x1a0a20 });
        g.rect(0, H / 2, W, H / 2).fill({ color: hexToNum(BG) });

        // Floating petals
        for (let i = 0; i < 12; i++) {
          const x = (W * 0.05 + i * W * 0.08 + Math.sin(f * 0.015 + i * 1.2) * 30) % W;
          const y = (f * 0.3 + i * 60) % (H + 40) - 20;
          const size = 4 + Math.sin(f * 0.02 + i) * 2;
          const alpha = 0.1 + 0.08 * Math.sin(f * 0.03 + i);
          g.ellipse(x, y, size, size * 0.5).fill({ color: 0xff6b9d, alpha });
        }

        // Title
        const glow = 0.7 + 0.3 * Math.sin(f * 0.04);
        showText("秘密花园", W / 2, H / 2 - 100 - 14, { fill: ACCENT, fontSize: 38, fontWeight: "bold", ax: 0.5, alpha: glow });
        showText("NC-17 成人沙盒建造", W / 2, H / 2 - 70 - 10, { fill: "#ff4757", fontSize: 12, ax: 0.5 });
        showText("4种房间 / 20+家具 / 3位角色 / 自由建造", W / 2, H / 2 - 45 - 10, { fill: "#aaaaaa", fontSize: 13, ax: 0.5 });

        // Room previews
        for (let i = 0; i < 4; i++) {
          const room = ROOMS[i];
          const rx = W / 2 - 150 + i * 80;
          const ry = H / 2 + 10;
          const bob = Math.sin(f * 0.025 + i * 1.5) * 4;

          g.roundRect(rx - 25, ry + bob - 20, 50, 50, 8).fill({ color: hexToNum(room.color), alpha: 0.09 });
          g.roundRect(rx - 25, ry + bob - 20, 50, 50, 8).stroke({ color: hexToNum(room.color), width: 1, alpha: 0.27 });
          showText(room.name, rx, ry + bob + 5 - 7, { fill: room.color, fontSize: 14, fontWeight: "bold", ax: 0.5 });
        }

        // Features
        showText("拖拽放置 / 旋转物品 / 拍照保存 / 评分系统", W / 2, H / 2 + 80 - 6, { fill: "#666666", fontSize: 11, ax: 0.5 });

        // Prompt
        const pa = 0.5 + 0.5 * Math.sin(f * 0.06);
        showText("选择难度开始建造", W / 2, H / 2 + 120 - 7, { fill: PRIMARY, fontSize: 14, ax: 0.5, alpha: pa });
      }

      // ─── Room Render ───────────────────────────────────────────────────
      function renderRoomPixi(g: PixiGraphics, showText: (t: string, x: number, y: number, o?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => void, gs: GameState, hoveredId: string | null, draggingId: string | null, f: number) {
        const room = getRoomDef(gs.room);

        // Floor
        g.rect(0, 0, W, H).fill({ color: hexToNum(room.floorColor) });

        // Grid lines
        for (let c = 0; c <= COLS; c++) {
          g.rect(c * GRID, 0, 0.5, H).fill({ color: 0xffffff, alpha: 0.03 });
        }
        for (let r = 0; r <= ROWS; r++) {
          g.rect(0, r * GRID, W, 0.5).fill({ color: 0xffffff, alpha: 0.03 });
        }

        // Walls
        const wc = hexToNum(room.wallColor);
        g.rect(0, 0, W, GRID).fill({ color: wc });
        g.rect(0, H - GRID, W, GRID).fill({ color: wc });
        g.rect(0, 0, GRID, H).fill({ color: wc });
        g.rect(W - GRID, 0, GRID, H).fill({ color: wc });

        // Wall brick texture
        for (let i = 0; i < COLS; i++) {
          g.rect(i * GRID, 0, GRID, GRID).stroke({ color: 0xffffff, width: 1, alpha: 0.05 });
          g.rect(i * GRID, H - GRID, GRID, GRID).stroke({ color: 0xffffff, width: 1, alpha: 0.05 });
        }

        // Room label
        showText(room.name, W / 2, GRID - 5 - 8, { fill: room.color, fontSize: 10, fontWeight: "bold", ax: 0.5, alpha: 0.25 });

        // Glow effects (under items)
        for (const item of gs.placed) {
          const def = getFurnitureDef(item.defId);
          if (!def || !def.glow) continue;
          const b = getItemBounds(item, def);
          const cx = (b.x + b.w / 2) * GRID;
          const cy = (b.y + b.h / 2) * GRID;
          const radius = Math.max(b.w, b.h) * GRID * 1.5;
          const pulse = 1 + 0.1 * Math.sin(f * 0.04);
          g.circle(cx, cy, radius * pulse).fill({ color: hexToNum(def.color), alpha: 0.06 });
        }

        // Placed items
        for (const item of gs.placed) {
          const def = getFurnitureDef(item.defId);
          if (!def) continue;
          const b = getItemBounds(item, def);
          const px = b.x * GRID;
          const py = b.y * GRID;
          const pw = b.w * GRID;
          const ph = b.h * GRID;
          const isHovered = item.id === hoveredId;
          const isDragging = item.id === draggingId;

          // Shadow
          g.roundRect(px + 2, py + 2, pw, ph, 3).fill({ color: 0x000000, alpha: 0.3 });

          // Item body
          g.roundRect(px, py, pw, ph, 3).fill({ color: hexToNum(def.color), alpha: isDragging ? 0.8 : 1 });

          // Inner detail
          g.roundRect(px + 2, py + 2, pw - 4, ph - 4, 2).fill({ color: 0x000000, alpha: 0.2 });

          // Character special rendering
          if (def.category === "character") {
            const ccx = px + pw / 2;
            const bob = Math.sin(f * 0.04) * 2;
            const headR = Math.min(pw, ph) * 0.2;
            // Head
            g.circle(ccx, py + headR + 4 + bob, headR).fill({ color: 0xffd5c2 });
            // Hair
            g.circle(ccx, py + headR + 2 + bob, headR + 1).fill({ color: hexToNum(def.color) });
            // Body
            g.roundRect(ccx - pw * 0.3, py + headR * 2 + 6 + bob, pw * 0.6, ph - headR * 2 - 10, 4).fill({ color: hexToNum(def.color), alpha: 0.8 });
            // Name
            showText(def.name.split(" ")[0], ccx, py + ph - 3 - 5, { fill: "#ffffff", fontSize: 9, fontWeight: "bold", ax: 0.5 });
          } else {
            // Furniture label
            const fs = Math.min(10, pw / def.name.length * 1.2);
            showText(def.name, px + pw / 2, py + ph / 2 + 4 - fs * 0.4, { fill: "#ffffffb3", fontSize: fs, ax: 0.5 });
          }

          // Rotation indicator
          if (item.rotation !== 0) {
            showText(`${item.rotation}`, px + pw - 2, py, { fill: "#ffffff4d", fontSize: 8, ax: 1 });
          }

          // Hover highlight
          if (isHovered && !isDragging) {
            g.roundRect(px - 1, py - 1, pw + 2, ph + 2, 4).stroke({ color: hexToNum(PRIMARY), width: 2 });
            // Tooltip
            const tooltipW = Math.max(80, def.name.length * 12 + 20);
            g.roundRect(px, py - 22, tooltipW, 18, 4).fill({ color: 0x000000, alpha: 0.85 });
            showText(`${def.name} (${def.scoreValue}分)`, px + 4, py - 22, { fill: "#ffffff", fontSize: 10 });
          }

          // Dragging outline
          if (isDragging) {
            g.roundRect(px - 1, py - 1, pw + 2, ph + 2, 4).stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
          }
        }

        // HUD overlay
        g.roundRect(4, H - GRID + 2, 140, GRID - 4, 4).fill({ color: 0x000000, alpha: 0.6 });
        showText(`G ${gs.coins}`, 10, H - 6 - 8, { fill: "#f0b90b", fontSize: 10, fontWeight: "bold" });
        showText(`| ${gs.placed.length} 物品`, 65, H - 6 - 8, { fill: "#888888", fontSize: 10 });
      }

      // ─── Result Render ─────────────────────────────────────────────────
      function renderResultPixi(g: PixiGraphics, showText: (t: string, x: number, y: number, o?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => void, gs: GameState, result: { score: number; completion: number; details: string[] }, f: number) {
        const room = getRoomDef(gs.room);

        // Background
        g.rect(0, 0, W, H / 2).fill({ color: hexToNum(room.floorColor) });
        g.rect(0, H / 2, W, H / 2).fill({ color: hexToNum(BG) });

        // Particles for high completion
        if (result.completion >= 80) {
          for (let i = 0; i < 20; i++) {
            const px = (i * 31 + f * 0.4) % W;
            const py = (i * 29 + f * 0.2) % H;
            const size = 2 + Math.sin(f * 0.03 + i) * 1.5;
            const alpha = (15 + Math.sin(f * 0.04 + i) * 10) / 255;
            g.circle(px, py, size).fill({ color: hexToNum(room.color), alpha });
          }
        }

        // Title
        showText(`${room.name}评分`, W / 2, 70 - 14, { fill: room.color, fontSize: 28, fontWeight: "bold", ax: 0.5 });

        // Completion circle (background ring)
        const circleX = W / 2, circleY = 160, circleR = 55;
        g.circle(circleX, circleY, circleR + 4).fill({ color: 0x222222 });
        g.circle(circleX, circleY, circleR - 4).fill({ color: hexToNum(BG) });

        // Completion arc (filled ring)
        const compColor = result.completion >= 80 ? "#2ed573" : result.completion >= 50 ? "#ffa502" : "#ff4757";
        if (result.completion > 0) {
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + (Math.PI * 2 * result.completion / 100);
          g.arc(circleX, circleY, circleR, startAngle, endAngle).lineTo(circleX, circleY).fill({ color: hexToNum(compColor), alpha: 0.3 });
        }

        showText(`${result.completion}%`, circleX, circleY - 12, { fill: compColor, fontSize: 24, fontWeight: "bold", ax: 0.5 });
        showText("完成度", circleX, circleY + 12, { fill: "#888888", fontSize: 11, ax: 0.5 });

        // Score
        showText(`${result.score} 分`, W / 2, 260 - 10, { fill: "#f0b90b", fontSize: 20, fontWeight: "bold", ax: 0.5 });

        // Rating
        const rating = result.completion >= 90 ? "S" : result.completion >= 80 ? "A" : result.completion >= 60 ? "B" : result.completion >= 40 ? "C" : "D";
        const ratingColor = rating === "S" ? "#ffd700" : rating === "A" ? "#2ed573" : rating === "B" ? "#3ea6ff" : rating === "C" ? "#ffa502" : "#ff4757";
        showText(rating, W / 2, 310 - 18, { fill: ratingColor, fontSize: 36, fontWeight: "bold", ax: 0.5 });
        showText("评级", W / 2, 330 - 6, { fill: "#666666", fontSize: 11, ax: 0.5 });

        // Details card
        const cardY = 350;
        g.roundRect(40, cardY, W - 80, 100, 8).fill({ color: 0x1a1a1a });
        g.roundRect(40, cardY, W - 80, 100, 8).stroke({ color: hexToNum(room.color), width: 1, alpha: 0.2 });

        showText("评分详情", W / 2, cardY + 18 - 6, { fill: "#aaaaaa", fontSize: 11, fontWeight: "bold", ax: 0.5 });

        if (result.details.length === 0) {
          showText("继续添加家具来提高评分", W / 2, cardY + 45 - 5, { fill: "#888888", fontSize: 10, ax: 0.5 });
        } else {
          for (let i = 0; i < Math.min(4, result.details.length); i++) {
            showText(result.details[i], W / 2, cardY + 38 + i * 16 - 5, { fill: "#888888", fontSize: 10, ax: 0.5 });
          }
        }

        showText(`累计总分: ${gs.score}`, W / 2, cardY + 92 - 5, { fill: "#555555", fontSize: 10, ax: 0.5 });
      }
    }

    initPixi();

    return () => {
      destroyed = true;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      pixiGfxRef.current = null;
      pixiTextsRef.current.clear();
      pixiInitRef.current = false;
    };
  }, []);

  // ─── Canvas Interaction ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getGridPos = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const cx = (clientX - rect.left) * (W / rect.width);
      const cy = (clientY - rect.top) * (H / rect.height);
      return { cx, cy, gx: Math.floor(cx / GRID), gy: Math.floor(cy / GRID) };
    };

    const findItemAt = (gx: number, gy: number): PlacedItem | null => {
      const s = stateRef.current;
      for (let i = s.gameState.placed.length - 1; i >= 0; i--) {
        const item = s.gameState.placed[i];
        const def = getFurnitureDef(item.defId);
        if (!def) continue;
        const b = getItemBounds(item, def);
        if (gx >= b.x && gx < b.x + b.w && gy >= b.y && gy < b.y + b.h) return item;
      }
      return null;
    };

    const onMouseDown = (e: MouseEvent) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const { gx, gy } = getGridPos(e.clientX, e.clientY);

      if (e.button === 2) {
        const item = findItemAt(gx, gy);
        if (item) rotateItem(item.id);
        return;
      }

      const item = findItemAt(gx, gy);
      if (item) {
        setDragging(item.id);
        setDragOffset({ x: gx - item.x, y: gy - item.y });
        return;
      }

      if (s.selectedFurniture) {
        placeFurniture(gx, gy);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const { gx, gy } = getGridPos(e.clientX, e.clientY);

      if (s.dragging) {
        const newX = Math.max(1, Math.min(COLS - 2, gx - s.dragOffset.x));
        const newY = Math.max(1, Math.min(ROWS - 2, gy - s.dragOffset.y));
        setGameState(prev => ({
          ...prev,
          placed: prev.placed.map(p => p.id === s.dragging ? { ...p, x: newX, y: newY } : p),
        }));
      } else {
        const item = findItemAt(gx, gy);
        setHoveredItem(item?.id ?? null);
      }
    };

    const onMouseUp = () => {
      if (stateRef.current.dragging) {
        setDragging(null);
        playSound("move");
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const { gx, gy } = getGridPos(e.touches[0].clientX, e.touches[0].clientY);
      const item = findItemAt(gx, gy);
      if (item) {
        setDragging(item.id);
        setDragOffset({ x: gx - item.x, y: gy - item.y });
      } else if (s.selectedFurniture) {
        placeFurniture(gx, gy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      if (!s.dragging) return;
      const { gx, gy } = getGridPos(e.touches[0].clientX, e.touches[0].clientY);
      const newX = Math.max(1, Math.min(COLS - 2, gx - s.dragOffset.x));
      const newY = Math.max(1, Math.min(ROWS - 2, gy - s.dragOffset.y));
      setGameState(prev => ({
        ...prev,
        placed: prev.placed.map(p => p.id === s.dragging ? { ...p, x: newX, y: newY } : p),
      }));
    };

    const onTouchEnd = () => {
      if (stateRef.current.dragging) {
        setDragging(null);
        playSound("move");
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const { gx, gy } = getGridPos(e.clientX, e.clientY);
      const item = findItemAt(gx, gy);
      if (item) removeItem(item.id);
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("dblclick", onDblClick);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [placeFurniture, removeItem, rotateItem, playSound]);

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      if (e.key === "r" || e.key === "R") {
        if (s.hoveredItem) rotateItem(s.hoveredItem);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (s.hoveredItem) removeItem(s.hoveredItem);
      }
      if (e.key === "Escape") {
        setSelectedFurniture(null);
        setDragging(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotateItem, removeItem]);

  // ─── Blocked ───────────────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Lock size={48} className="mx-auto text-gray-600 mb-4" />
          <h1 className="text-xl font-bold mb-2">访问受限</h1>
          <p className="text-gray-400">需要 NC-17 模式才能访问此内容。</p>
          <Link href="/zone/games" className="mt-4 inline-block text-[#3ea6ff]">返回</Link>
        </div>
      </div>
    );
  }

  // Available furniture for current room
  const availableFurniture = FURNITURE.filter(f =>
    f.rooms.includes(gameState.room) &&
    (filterCategory === "all" || f.category === filterCategory)
  );

  const categories: { key: FurnitureCategory | "all"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "bed", label: "床" },
    { key: "seating", label: "座椅" },
    { key: "table", label: "桌柜" },
    { key: "lighting", label: "灯具" },
    { key: "bath", label: "浴室" },
    { key: "decor", label: "装饰" },
    { key: "plant", label: "植物" },
    { key: "character", label: "角色" },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回
        </Link>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flower2 size={24} className="text-[#ff6b9d]" />
            <h1 className="text-xl font-bold">秘密花园</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800">NC-17</span>
          </div>
          <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-white/5 transition">
            {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
          <div>
            <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 cursor-crosshair" />

            {/* Title screen buttons */}
            {phase === "title" && (
              <div className="mt-4 space-y-2">
                <p className="text-center text-sm text-gray-400 mb-2">选择难度（影响初始金币）</p>
                <div className="flex gap-2 justify-center">
                  {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => startGame(d)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition border`}
                      style={{ borderColor: DIFF_SETTINGS[d].color + "80", color: DIFF_SETTINGS[d].color }}>
                      <Play size={14} className="inline mr-1" />
                      {DIFF_SETTINGS[d].label} ({DIFF_SETTINGS[d].coins}G)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Playing controls */}
            {phase === "playing" && (
              <>
                {/* Room tabs */}
                <div className="mt-3 flex gap-2">
                  {ROOMS.map(r => (
                    <button key={r.type} onClick={() => switchRoom(r.type)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition border ${
                        gameState.room === r.type
                          ? `border-[${r.color}] bg-[${r.color}]/10`
                          : "border-white/10 bg-white/5 text-gray-500"
                      }`}
                      style={gameState.room === r.type ? { borderColor: r.color, color: r.color, backgroundColor: r.color + "15" } : {}}>
                      <Home size={12} className="inline mr-1" />
                      {r.name}
                    </button>
                  ))}
                </div>

                {/* Stats bar */}
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <span className="text-[#f0b90b] font-bold">G {gameState.coins}</span>
                  <span className="text-gray-500">|</span>
                  <span className="text-gray-400">已放置: {gameState.placed.length}</span>
                  <span className="text-gray-500">|</span>
                  <span style={{ color: DIFF_SETTINGS[gameState.difficulty].color }}>{DIFF_SETTINGS[gameState.difficulty].label}</span>
                  <div className="flex-1" />
                  <button onClick={takePhoto} className="flex items-center gap-1 px-2 py-1 rounded bg-[#3ea6ff]/20 text-[#3ea6ff] text-xs hover:bg-[#3ea6ff]/30 transition">
                    <Camera size={12} /> 拍照
                  </button>
                  <button onClick={finishRoom} className="flex items-center gap-1 px-2 py-1 rounded bg-[#ff6b9d]/20 text-[#ff6b9d] text-xs hover:bg-[#ff6b9d]/30 transition">
                    <LayoutGrid size={12} /> 评分
                  </button>
                </div>

                {/* Category filter */}
                <div className="mt-3 flex gap-1 flex-wrap">
                  {categories.filter(c => {
                    if (c.key === "all") return true;
                    return FURNITURE.some(f => f.category === c.key && f.rooms.includes(gameState.room));
                  }).map(c => (
                    <button key={c.key} onClick={() => setFilterCategory(c.key)}
                      className={`px-2 py-1 rounded text-[10px] border transition ${
                        filterCategory === c.key
                          ? "border-[#3ea6ff] bg-[#3ea6ff]/15 text-[#3ea6ff]"
                          : "border-white/10 text-gray-500 hover:text-gray-300"
                      }`}>
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Furniture palette */}
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
                  {availableFurniture.map(f => (
                    <button key={f.id} onClick={() => setSelectedFurniture(selectedFurniture === f.id ? null : f.id)}
                      className={`px-2 py-1.5 rounded text-[10px] border transition text-left ${
                        selectedFurniture === f.id
                          ? "border-[#3ea6ff] bg-[#3ea6ff]/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      } ${gameState.coins < f.cost ? "opacity-40" : ""}`}>
                      <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: f.color }} />
                      <span className="text-gray-300">{f.name}</span>
                      <span className="text-[#f0b90b] ml-1">{f.cost}G</span>
                    </button>
                  ))}
                </div>

                <p className="mt-2 text-[10px] text-gray-600">
                  点击放置 / 拖拽移动 / 右键旋转 / 双击删除(退还70%) / R旋转 / Del删除
                </p>
              </>
            )}

            {/* Result screen */}
            {phase === "result" && (
              <div className="mt-4 flex gap-2 justify-center">
                <button onClick={() => setPhase("playing")}
                  className="flex items-center gap-1 px-4 py-2 bg-[#3ea6ff]/20 text-[#3ea6ff] rounded-lg text-sm hover:bg-[#3ea6ff]/30 transition border border-[#3ea6ff]/30">
                  继续装修
                </button>
                <button onClick={() => startGame(difficulty)}
                  className="flex items-center gap-1 px-4 py-2 bg-[#ff6b9d]/20 text-[#ff6b9d] rounded-lg text-sm hover:bg-[#ff6b9d]/30 transition border border-[#ff6b9d]/30">
                  <RotateCcw size={14} /> 重新开始
                </button>
                <button onClick={() => setPhase("title")}
                  className="flex items-center gap-1 px-4 py-2 bg-white/5 text-gray-400 rounded-lg text-sm hover:bg-white/10 transition border border-white/10">
                  返回标题
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />

            {/* Placed items list */}
            {phase === "playing" && gameState.placed.length > 0 && (
              <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
                <h3 className="text-sm font-bold mb-2 text-[#ff6b9d]">已放置物品</h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {gameState.placed.map(item => {
                    const def = getFurnitureDef(item.defId);
                    if (!def) return null;
                    return (
                      <div key={item.id} className="flex items-center gap-2 text-[10px] text-gray-400 group">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: def.color }} />
                        <span className="flex-1">{def.name}</span>
                        <button onClick={() => rotateItem(item.id)} className="opacity-0 group-hover:opacity-100 text-[#3ea6ff] transition">
                          <RotateCcw size={10} />
                        </button>
                        <button onClick={() => removeItem(item.id)} className="opacity-0 group-hover:opacity-100 text-red-400 transition">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}