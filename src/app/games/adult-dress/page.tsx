"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import {
  ChevronLeft, Volume2, VolumeX, Lock, Camera, RotateCcw,
  Shirt, Star, Sparkles, User
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { fetchWithAuth } from "@/lib/auth";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-dress";
const CW = 480, CH = 600;
const PRIMARY = "#a55eea", ACCENT = "#3ea6ff", BG = "#0f0f0f";

// ─── Types ───────────────────────────────────────────────────────────────────
type Phase = "title" | "select" | "playing" | "photo";
type Slot = "hair" | "top" | "bottom" | "shoes" | "accessory" | "underwear";

interface ClothingItem {
  id: string;
  name: string;
  slot: Slot;
  colors: string[];
  drawFn: (ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) => void;
}

interface CharacterModel {
  id: string;
  name: string;
  bodyType: string;
  skinColor: string;
  bodyWidth: number;
  bodyHeight: number;
  headRadius: number;
  desc: string;
}

interface EquipState {
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  accessory: number;
  underwear: number;
}

interface ColorState {
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  accessory: number;
  underwear: number;
}

// ─── Character Models ────────────────────────────────────────────────────────
const MODELS: CharacterModel[] = [
  { id: "slim", name: "纤细型", bodyType: "纤细", skinColor: "#f5d0c5", bodyWidth: 36, bodyHeight: 90, headRadius: 24, desc: "修长身材" },
  { id: "curvy", name: "丰满型", bodyType: "丰满", skinColor: "#e8b89d", bodyWidth: 44, bodyHeight: 85, headRadius: 26, desc: "丰满曲线" },
  { id: "athletic", name: "运动型", bodyType: "健美", skinColor: "#d4a574", bodyWidth: 40, bodyHeight: 95, headRadius: 25, desc: "健美体型" },
];

// ─── Slot Labels ─────────────────────────────────────────────────────────────
const SLOT_LABELS: Record<Slot, string> = {
  hair: "发型", top: "上衣", bottom: "下装", shoes: "鞋子", accessory: "配饰", underwear: "内衣",
};
const SLOTS: Slot[] = ["hair", "top", "bottom", "shoes", "accessory", "underwear"];

// ─── Clothing Items ──────────────────────────────────────────────────────────
function makeItems(): Record<Slot, ClothingItem[]> {
  return {
    hair: [
      { id: "h1", name: "长直发", slot: "hair", colors: ["#ffd700", "#1a1a2e", "#ff6b81", "#a55eea", "#e8b89d"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy - 6, 30, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - 30, cy - 6, 12, 60); ctx.fillRect(cx + 18, cy - 6, 12, 60); } },
      { id: "h2", name: "短发", slot: "hair", colors: ["#333", "#ff6b81", "#3ea6ff", "#ffd700", "#a55eea"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy - 4, 28, Math.PI * 0.8, Math.PI * 0.2); ctx.fill(); } },
      { id: "h3", name: "马尾辫", slot: "hair", colors: ["#a55eea", "#ffd700", "#ff6b81", "#333", "#e8b89d"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy - 6, 28, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx + 20, cy - 10); ctx.quadraticCurveTo(cx + 45, cy, cx + 35, cy + 40); ctx.lineWidth = 8; ctx.strokeStyle = c; ctx.stroke(); } },
      { id: "h4", name: "卷发", slot: "hair", colors: ["#2ed573", "#ffd700", "#ff6b81", "#a55eea", "#333"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; for (let a = Math.PI; a >= 0; a -= 0.3) { const r = 30 + Math.sin(a * 5) * 4; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 26, cy - 6 + Math.sin(a) * -20, 10, 0, Math.PI * 2); ctx.fill(); } ctx.beginPath(); ctx.arc(cx, cy - 6, 28, Math.PI, 0); ctx.fill(); } },
      { id: "h5", name: "双马尾", slot: "hair", colors: ["#ff6b81", "#3ea6ff", "#ffd700", "#a55eea", "#333"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy - 6, 28, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - 32, cy - 2, 10, 50); ctx.fillRect(cx + 22, cy - 2, 10, 50); } },
    ],
    top: [
      { id: "t1", name: "T恤", slot: "top", colors: ["#3ea6ff", "#ff4757", "#2ed573", "#ffd700", "#a55eea"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(cx - 24, cy + 50, 48, 38, 4); ctx.fill(); ctx.fillRect(cx - 34, cy + 50, 14, 20); ctx.fillRect(cx + 20, cy + 50, 14, 20); } },
      { id: "t2", name: "吊带背心", slot: "top", colors: ["#ff4757", "#333", "#fff", "#a55eea", "#3ea6ff"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(cx - 20, cy + 52, 40, 36, 3); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 14, cy + 52); ctx.lineTo(cx - 10, cy + 42); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + 14, cy + 52); ctx.lineTo(cx + 10, cy + 42); ctx.stroke(); } },
      { id: "t3", name: "西装外套", slot: "top", colors: ["#333", "#1a1a4e", "#5a3e2b", "#666", "#a55eea"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(cx - 26, cy + 48, 52, 42, 4); ctx.fill(); ctx.fillRect(cx - 36, cy + 48, 14, 28); ctx.fillRect(cx + 22, cy + 48, 14, 28); ctx.fillStyle = "#fff"; ctx.fillRect(cx - 2, cy + 50, 4, 38); } },
      { id: "t4", name: "比基尼上衣", slot: "top", colors: ["#ff4757", "#3ea6ff", "#ffd700", "#a55eea", "#333"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx - 10, cy + 58, 10, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 10, cy + 58, 10, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 10, cy + 48); ctx.lineTo(cx, cy + 44); ctx.lineTo(cx + 10, cy + 48); ctx.stroke(); } },
      { id: "t5", name: "无（裸露）", slot: "top", colors: ["transparent"],
        drawFn: () => {} },
    ],
    bottom: [
      { id: "b1", name: "迷你裙", slot: "bottom", colors: ["#a55eea", "#ff4757", "#333", "#3ea6ff", "#ffd700"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx - 22, cy + 88); ctx.lineTo(cx + 22, cy + 88); ctx.lineTo(cx + 28, cy + 118); ctx.lineTo(cx - 28, cy + 118); ctx.closePath(); ctx.fill(); } },
      { id: "b2", name: "牛仔裤", slot: "bottom", colors: ["#1e90ff", "#333", "#5a3e2b", "#666", "#1a1a4e"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.fillRect(cx - 20, cy + 88, 18, 55); ctx.fillRect(cx + 2, cy + 88, 18, 55); } },
      { id: "b3", name: "热裤", slot: "bottom", colors: ["#ffa502", "#ff4757", "#333", "#a55eea", "#3ea6ff"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.fillRect(cx - 20, cy + 88, 18, 22); ctx.fillRect(cx + 2, cy + 88, 18, 22); } },
      { id: "b4", name: "比基尼下装", slot: "bottom", colors: ["#ff4757", "#3ea6ff", "#ffd700", "#a55eea", "#333"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx - 16, cy + 88); ctx.lineTo(cx + 16, cy + 88); ctx.lineTo(cx + 12, cy + 100); ctx.lineTo(cx - 12, cy + 100); ctx.closePath(); ctx.fill(); } },
      { id: "b5", name: "无（裸露）", slot: "bottom", colors: ["transparent"],
        drawFn: () => {} },
    ],
    shoes: [
      { id: "s1", name: "高跟鞋", slot: "shoes", colors: ["#ff4757", "#333", "#ffd700", "#a55eea", "#fff"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.fillRect(cx - 18, cy + 148, 16, 8); ctx.fillRect(cx + 2, cy + 148, 16, 8); ctx.fillRect(cx - 10, cy + 152, 4, 10); ctx.fillRect(cx + 10, cy + 152, 4, 10); } },
      { id: "s2", name: "长靴", slot: "shoes", colors: ["#333", "#5a3e2b", "#1a1a4e", "#ff4757", "#a55eea"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.fillRect(cx - 18, cy + 128, 16, 28); ctx.fillRect(cx + 2, cy + 128, 16, 28); } },
      { id: "s3", name: "运动鞋", slot: "shoes", colors: ["#fff", "#ff4757", "#3ea6ff", "#2ed573", "#ffd700"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(cx - 20, cy + 148, 18, 10, 3); ctx.fill(); ctx.beginPath(); ctx.roundRect(cx + 2, cy + 148, 18, 10, 3); ctx.fill(); } },
      { id: "s4", name: "凉鞋", slot: "shoes", colors: ["#ffd700", "#ff4757", "#333", "#a55eea", "#3ea6ff"],
        drawFn: (ctx, cx, cy, c) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 16, cy + 150); ctx.lineTo(cx - 6, cy + 145); ctx.lineTo(cx - 16, cy + 155); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + 4, cy + 150); ctx.lineTo(cx + 14, cy + 145); ctx.lineTo(cx + 4, cy + 155); ctx.stroke(); } },
      { id: "s5", name: "赤脚", slot: "shoes", colors: ["transparent"],
        drawFn: () => {} },
    ],
    accessory: [
      { id: "a1", name: "项链", slot: "accessory", colors: ["#ffd700", "#c0c0c0", "#ff4757", "#3ea6ff", "#a55eea"],
        drawFn: (ctx, cx, cy, c) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy + 46, 14, 0.1, Math.PI - 0.1); ctx.stroke(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy + 60, 4, 0, Math.PI * 2); ctx.fill(); } },
      { id: "a2", name: "眼镜", slot: "accessory", colors: ["#3ea6ff", "#333", "#ff4757", "#ffd700", "#a55eea"],
        drawFn: (ctx, cx, cy, c) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx - 10, cy + 18, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 10, cy + 18, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 2, cy + 18); ctx.lineTo(cx + 2, cy + 18); ctx.stroke(); } },
      { id: "a3", name: "帽子", slot: "accessory", colors: ["#ff6b81", "#333", "#3ea6ff", "#ffd700", "#a55eea"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.fillRect(cx - 32, cy - 8, 64, 10); ctx.beginPath(); ctx.roundRect(cx - 20, cy - 24, 40, 20, 6); ctx.fill(); } },
      { id: "a4", name: "耳环", slot: "accessory", colors: ["#ffd700", "#c0c0c0", "#ff4757", "#a55eea", "#3ea6ff"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx - 26, cy + 22, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 26, cy + 22, 4, 0, Math.PI * 2); ctx.fill(); } },
      { id: "a5", name: "无", slot: "accessory", colors: ["transparent"],
        drawFn: () => {} },
    ],
    underwear: [
      { id: "u1", name: "蕾丝内衣", slot: "underwear", colors: ["#ff4757", "#333", "#fff", "#a55eea", "#ffd700"],
        drawFn: (ctx, cx, cy, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx - 10 + (i % 3) * 10, cy + 54 + Math.floor(i / 3) * 8, 4, 0, Math.PI * 2); ctx.stroke(); } } },
      { id: "u2", name: "运动内衣", slot: "underwear", colors: ["#333", "#3ea6ff", "#ff4757", "#2ed573", "#a55eea"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.roundRect(cx - 18, cy + 50, 36, 16, 3); ctx.fill(); ctx.globalAlpha = 1; } },
      { id: "u3", name: "丁字裤", slot: "underwear", colors: ["#ff4757", "#333", "#a55eea", "#ffd700", "#3ea6ff"],
        drawFn: (ctx, cx, cy, c) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 14, cy + 88); ctx.lineTo(cx, cy + 96); ctx.lineTo(cx + 14, cy + 88); ctx.stroke(); } },
      { id: "u4", name: "三角内裤", slot: "underwear", colors: ["#a55eea", "#ff4757", "#3ea6ff", "#ffd700", "#333"],
        drawFn: (ctx, cx, cy, c) => { ctx.fillStyle = c; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(cx - 16, cy + 86); ctx.lineTo(cx + 16, cy + 86); ctx.lineTo(cx, cy + 100); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; } },
      { id: "u5", name: "无（裸露）", slot: "underwear", colors: ["transparent"],
        drawFn: () => {} },
    ],
  };
}

// ─── Scoring System ──────────────────────────────────────────────────────────
const STYLE_COMBOS: { name: string; slots: Partial<Record<Slot, string[]>>; bonus: number }[] = [
  { name: "优雅淑女", slots: { top: ["t3"], bottom: ["b1"], shoes: ["s1"], accessory: ["a1"] }, bonus: 30 },
  { name: "运动活力", slots: { top: ["t1"], bottom: ["b3"], shoes: ["s3"], accessory: ["a2"] }, bonus: 25 },
  { name: "海滩风情", slots: { top: ["t4"], bottom: ["b4"], shoes: ["s5"], accessory: ["a1"] }, bonus: 35 },
  { name: "性感诱惑", slots: { top: ["t2"], bottom: ["b1"], shoes: ["s1"], underwear: ["u1"] }, bonus: 30 },
  { name: "全裸大胆", slots: { top: ["t5"], bottom: ["b5"], underwear: ["u5"] }, bonus: 20 },
  { name: "蕾丝梦境", slots: { underwear: ["u1"], top: ["t2"], accessory: ["a1"] }, bonus: 25 },
];

function calcScore(equipped: EquipState, items: Record<Slot, ClothingItem[]>): { total: number; combos: string[]; details: string[] } {
  let total = 0;
  const combos: string[] = [];
  const details: string[] = [];

  // Base: each non-empty slot = 10 pts
  let filledSlots = 0;
  for (const s of SLOTS) {
    const item = items[s][equipped[s]];
    if (item && !item.id.endsWith("5")) { filledSlots++; }
  }
  const basePts = filledSlots * 10;
  total += basePts;
  details.push(`基础搭配: ${filledSlots} 件 x 10 = ${basePts}`);

  // Color harmony: count matching colors across slots
  const usedColors: string[] = [];
  for (const s of SLOTS) {
    const item = items[s][equipped[s]];
    if (item && item.colors[0] !== "transparent") {
      usedColors.push(item.colors[0]);
    }
  }
  const colorCounts: Record<string, number> = {};
  usedColors.forEach(c => { colorCounts[c] = (colorCounts[c] || 0) + 1; });
  const maxMatch = Math.max(0, ...Object.values(colorCounts));
  if (maxMatch >= 3) { total += 20; details.push("色彩和谐 +20"); }
  else if (maxMatch >= 2) { total += 10; details.push("色彩搭配 +10"); }

  // Style combos
  for (const combo of STYLE_COMBOS) {
    let match = true;
    for (const [slot, validIds] of Object.entries(combo.slots)) {
      const item = items[slot as Slot][equipped[slot as keyof EquipState]];
      if (!item || !validIds!.includes(item.id)) { match = false; break; }
    }
    if (match) { total += combo.bonus; combos.push(combo.name); details.push(`${combo.name} +${combo.bonus}`); }
  }

  // Variety bonus
  if (filledSlots >= 5) { total += 15; details.push("全面搭配 +15"); }

  return { total: Math.min(total, 100), combos, details };
}

// ─── Draw Character ──────────────────────────────────────────────────────────
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  model: CharacterModel,
  equipped: EquipState,
  colorState: ColorState,
  items: Record<Slot, ClothingItem[]>,
  cx: number, cy: number,
) {
  const { skinColor, bodyWidth, bodyHeight, headRadius } = model;
  const hw = bodyWidth / 2;

  // Head
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(cx, cy + headRadius, headRadius, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillRect(cx - 6, cy + headRadius * 2 - 4, 12, 12);

  // Torso
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.roundRect(cx - hw, cy + 48, bodyWidth, bodyHeight * 0.45, 4);
  ctx.fill();

  // Arms
  ctx.fillRect(cx - hw - 10, cy + 50, 10, 36);
  ctx.fillRect(cx + hw, cy + 50, 10, 36);

  // Legs
  const legW = hw * 0.45;
  ctx.fillRect(cx - hw + 2, cy + 48 + bodyHeight * 0.45, legW, bodyHeight * 0.55);
  ctx.fillRect(cx + hw - 2 - legW, cy + 48 + bodyHeight * 0.45, legW, bodyHeight * 0.55);

  // Underwear (drawn under clothes)
  const uwItem = items.underwear[equipped.underwear];
  if (uwItem) uwItem.drawFn(ctx, cx, cy, uwItem.colors[colorState.underwear] || uwItem.colors[0]);

  // Bottom
  const btItem = items.bottom[equipped.bottom];
  if (btItem) btItem.drawFn(ctx, cx, cy, btItem.colors[colorState.bottom] || btItem.colors[0]);

  // Top
  const tpItem = items.top[equipped.top];
  if (tpItem) tpItem.drawFn(ctx, cx, cy, tpItem.colors[colorState.top] || tpItem.colors[0]);

  // Shoes
  const shItem = items.shoes[equipped.shoes];
  if (shItem) shItem.drawFn(ctx, cx, cy, shItem.colors[colorState.shoes] || shItem.colors[0]);

  // Face
  ctx.fillStyle = "#333";
  ctx.beginPath(); ctx.arc(cx - 8, cy + headRadius - 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 8, cy + headRadius - 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#ff6b81"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy + headRadius + 6, 5, 0.1, Math.PI - 0.1); ctx.stroke();

  // Hair (on top)
  const hrItem = items.hair[equipped.hair];
  if (hrItem) hrItem.drawFn(ctx, cx, cy, hrItem.colors[colorState.hair] || hrItem.colors[0]);

  // Accessory (on top of everything)
  const acItem = items.accessory[equipped.accessory];
  if (acItem) acItem.drawFn(ctx, cx, cy, acItem.colors[colorState.accessory] || acItem.colors[0]);
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdultDressUp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const rafRef = useRef(0);
  const itemsRef = useRef<Record<Slot, ClothingItem[]>>(makeItems());

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [muted, setMuted] = useState(false);
  const [modelIdx, setModelIdx] = useState(0);
  const [activeSlot, setActiveSlot] = useState<Slot>("hair");
  const [equipped, setEquipped] = useState<EquipState>({ hair: 0, top: 0, bottom: 0, shoes: 0, accessory: 0, underwear: 0 });
  const [colorState, setColorState] = useState<ColorState>({ hair: 0, top: 0, bottom: 0, shoes: 0, accessory: 0, underwear: 0 });
  const [score, setScore] = useState(0);
  const [scoreDetails, setScoreDetails] = useState<string[]>([]);
  const [combos, setCombos] = useState<string[]>([]);
  const [showScorePanel, setShowScorePanel] = useState(false);

  // Refs for render loop
  const phaseRef = useRef(phase);
  const modelIdxRef = useRef(modelIdx);
  const equippedRef = useRef(equipped);
  const colorStateRef = useRef(colorState);
  const activeSlotRef = useRef(activeSlot);
  const animFrameRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { modelIdxRef.current = modelIdx; }, [modelIdx]);
  useEffect(() => { equippedRef.current = equipped; }, [equipped]);
  useEffect(() => { colorStateRef.current = colorState; }, [colorState]);
  useEffect(() => { activeSlotRef.current = activeSlot; }, [activeSlot]);

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ageGate.canAccess("NC-17")) { setBlocked(true); return; }
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  // ─── Score Calculation ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const result = calcScore(equipped, itemsRef.current);
    setScore(result.total);
    setScoreDetails(result.details);
    setCombos(result.combos);
  }, [equipped, phase]);

  // ─── Canvas Render Loop ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = `${CW}px`;
    canvas.style.height = `${CH}px`;

    const render = () => {
      animFrameRef.current++;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, CW, CH);

      const p = phaseRef.current;

      if (p === "title") {
        drawTitleScreen(ctx);
      } else if (p === "select") {
        drawSelectScreen(ctx);
      } else if (p === "playing" || p === "photo") {
        drawPlayingScreen(ctx, p === "photo");
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  // ─── Draw Functions ──────────────────────────────────────────────────────
  function drawTitleScreen(ctx: CanvasRenderingContext2D) {
    const t = animFrameRef.current;
    // Background shimmer
    const grad = ctx.createLinearGradient(0, 0, CW, CH);
    grad.addColorStop(0, "#1a0a2e");
    grad.addColorStop(0.5, "#0f0f0f");
    grad.addColorStop(1, "#1a0a2e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);

    // Floating particles
    for (let i = 0; i < 20; i++) {
      const px = (i * 67 + t * 0.3) % CW;
      const py = (i * 43 + t * 0.2) % CH;
      ctx.fillStyle = `rgba(165, 94, 234, ${0.2 + Math.sin(t * 0.02 + i) * 0.15})`;
      ctx.beginPath();
      ctx.arc(px, py, 2 + Math.sin(t * 0.03 + i) * 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Title
    ctx.fillStyle = PRIMARY;
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("魅影衣橱", CW / 2, 200);

    ctx.fillStyle = "#888";
    ctx.font = "14px sans-serif";
    ctx.fillText("成人换装游戏 (NC-17)", CW / 2, 235);

    // Start button
    const btnY = 300;
    const pulse = Math.sin(t * 0.05) * 3;
    ctx.fillStyle = PRIMARY;
    ctx.beginPath();
    ctx.roundRect(CW / 2 - 80, btnY - 20 + pulse, 160, 44, 22);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("开始游戏", CW / 2, btnY + 6 + pulse);

    // Instructions
    ctx.fillStyle = "#666";
    ctx.font = "12px sans-serif";
    ctx.fillText("选择角色模型，自由搭配服装", CW / 2, 400);
    ctx.fillText("获得搭配评分，拍照保存", CW / 2, 420);
  }

  function drawSelectScreen(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#1a0a2e";
    ctx.fillRect(0, 0, CW, CH);

    ctx.fillStyle = ACCENT;
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("选择角色模型", CW / 2, 50);

    for (let i = 0; i < MODELS.length; i++) {
      const m = MODELS[i];
      const bx = 40 + i * 150, by = 80;
      const sel = modelIdxRef.current === i;

      // Card
      ctx.fillStyle = sel ? "#2a1a3e" : "#1a1a2e";
      ctx.beginPath();
      ctx.roundRect(bx, by, 130, 320, 10);
      ctx.fill();
      ctx.strokeStyle = sel ? PRIMARY : "#333";
      ctx.lineWidth = sel ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, 130, 320, 10);
      ctx.stroke();

      // Mini character preview
      const pcx = bx + 65, pcy = by + 40;
      ctx.fillStyle = m.skinColor;
      ctx.beginPath(); ctx.arc(pcx, pcy + 20, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(pcx - m.bodyWidth / 3, pcy + 38, m.bodyWidth * 0.66, 50);
      ctx.fillRect(pcx - 10, pcy + 88, 8, 35);
      ctx.fillRect(pcx + 2, pcy + 88, 8, 35);
      // Eyes
      ctx.fillStyle = "#333";
      ctx.beginPath(); ctx.arc(pcx - 6, pcy + 18, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pcx + 6, pcy + 18, 2, 0, Math.PI * 2); ctx.fill();

      // Labels
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(m.name, bx + 65, by + 200);

      ctx.fillStyle = "#aaa";
      ctx.font = "12px sans-serif";
      ctx.fillText(m.desc, bx + 65, by + 222);
      ctx.fillText(`体型: ${m.bodyType}`, bx + 65, by + 244);

      // Select indicator
      if (sel) {
        ctx.fillStyle = PRIMARY;
        ctx.beginPath();
        ctx.roundRect(bx + 25, by + 270, 80, 30, 15);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("已选择", bx + 65, by + 290);
      }
    }

    // Confirm button
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.roundRect(CW / 2 - 70, 440, 140, 40, 20);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("确认选择", CW / 2, 465);

    // Back
    ctx.fillStyle = "#666";
    ctx.font = "12px sans-serif";
    ctx.fillText("点击角色卡片选择", CW / 2, 520);
  }

  function drawPlayingScreen(ctx: CanvasRenderingContext2D, isPhoto: boolean) {
    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, "#1a0a2e");
    grad.addColorStop(1, "#0f0f0f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);

    const model = MODELS[modelIdxRef.current];
    const eq = equippedRef.current;
    const cs = colorStateRef.current;

    // Draw character centered on left side
    const charX = 140, charY = 60;
    drawCharacter(ctx, model, eq, cs, itemsRef.current, charX, charY);

    if (isPhoto) {
      // Photo mode: just character + watermark
      ctx.fillStyle = "rgba(165, 94, 234, 0.6)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("魅影衣橱", CW - 20, CH - 20);
      return;
    }

    // Right panel: slot tabs
    const panelX = 280;
    ctx.fillStyle = "rgba(26, 26, 46, 0.8)";
    ctx.beginPath();
    ctx.roundRect(panelX - 10, 10, CW - panelX + 5, CH - 20, 10);
    ctx.fill();

    // Slot tabs
    const slotAS = activeSlotRef.current;
    for (let i = 0; i < SLOTS.length; i++) {
      const s = SLOTS[i];
      const tx = panelX, ty = 20 + i * 34;
      ctx.fillStyle = slotAS === s ? "#2a1a3e" : "#1a1a2e";
      ctx.beginPath(); ctx.roundRect(tx, ty, 90, 28, 6); ctx.fill();
      ctx.strokeStyle = slotAS === s ? PRIMARY : "#444";
      ctx.lineWidth = slotAS === s ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(tx, ty, 90, 28, 6); ctx.stroke();
      ctx.fillStyle = slotAS === s ? "#fff" : "#aaa";
      ctx.font = slotAS === s ? "bold 12px sans-serif" : "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(SLOT_LABELS[s], tx + 45, ty + 18);
    }

    // Items for active slot
    const slotItems = itemsRef.current[slotAS];
    const itemStartY = 240;
    for (let i = 0; i < slotItems.length; i++) {
      const item = slotItems[i];
      const ix = panelX, iy = itemStartY + i * 42;
      const sel = eq[slotAS] === i;

      ctx.fillStyle = sel ? "#2a1a3e" : "#151520";
      ctx.beginPath(); ctx.roundRect(ix, iy, 185, 36, 6); ctx.fill();
      ctx.strokeStyle = sel ? PRIMARY : "#333";
      ctx.lineWidth = sel ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(ix, iy, 185, 36, 6); ctx.stroke();

      // Color swatch
      const c = item.colors[cs[slotAS] % item.colors.length];
      if (c !== "transparent") {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(ix + 18, iy + 18, 8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ix + 18, iy + 18, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix + 12, iy + 12); ctx.lineTo(ix + 24, iy + 24); ctx.stroke();
      }

      // Name
      ctx.fillStyle = sel ? "#fff" : "#aaa";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(item.name, ix + 34, iy + 22);

      // Color cycle arrow (if multiple colors)
      if (item.colors.length > 1 && sel) {
        ctx.fillStyle = ACCENT;
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("换色 >", ix + 178, iy + 22);
      }
    }

    // Score display at bottom
    ctx.fillStyle = "rgba(62, 166, 255, 0.15)";
    ctx.beginPath(); ctx.roundRect(10, CH - 60, 260, 50, 8); ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`搭配评分: ${calcScore(eq, itemsRef.current).total}`, 20, CH - 32);
    const comboResult = calcScore(eq, itemsRef.current);
    if (comboResult.combos.length > 0) {
      ctx.fillStyle = "#ffd700";
      ctx.font = "11px sans-serif";
      ctx.fillText(comboResult.combos.join(" / "), 20, CH - 16);
    }
  }

  // ─── Canvas Click Handler ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (mx: number, my: number) => {
      const p = phaseRef.current;

      if (p === "title") {
        // Start button
        const pulse = Math.sin(animFrameRef.current * 0.05) * 3;
        if (mx >= CW / 2 - 80 && mx <= CW / 2 + 80 && my >= 280 + pulse && my <= 324 + pulse) {
          soundRef.current?.playClick();
          setPhase("select");
        }
        return;
      }

      if (p === "select") {
        // Model cards
        for (let i = 0; i < MODELS.length; i++) {
          const bx = 40 + i * 150, by = 80;
          if (mx >= bx && mx <= bx + 130 && my >= by && my <= by + 320) {
            soundRef.current?.playClick();
            setModelIdx(i);
            return;
          }
        }
        // Confirm button
        if (mx >= CW / 2 - 70 && mx <= CW / 2 + 70 && my >= 440 && my <= 480) {
          soundRef.current?.playLevelUp();
          setPhase("playing");
        }
        return;
      }

      if (p === "playing") {
        const panelX = 280;

        // Slot tabs
        for (let i = 0; i < SLOTS.length; i++) {
          const tx = panelX, ty = 20 + i * 34;
          if (mx >= tx && mx <= tx + 90 && my >= ty && my <= ty + 28) {
            soundRef.current?.playClick();
            setActiveSlot(SLOTS[i]);
            return;
          }
        }

        // Items
        const slotAS = activeSlotRef.current;
        const slotItems = itemsRef.current[slotAS];
        const itemStartY = 240;
        for (let i = 0; i < slotItems.length; i++) {
          const ix = panelX, iy = itemStartY + i * 42;
          if (mx >= ix && mx <= ix + 185 && my >= iy && my <= iy + 36) {
            const currentEq = equippedRef.current[slotAS];
            if (currentEq === i) {
              // Already selected: cycle color
              const item = slotItems[i];
              if (item.colors.length > 1) {
                soundRef.current?.playMove();
                setColorState(prev => ({
                  ...prev,
                  [slotAS]: (prev[slotAS] + 1) % item.colors.length,
                }));
              }
            } else {
              soundRef.current?.playScore(10);
              setEquipped(prev => ({ ...prev, [slotAS]: i }));
              // Reset color for new item
              setColorState(prev => ({ ...prev, [slotAS]: 0 }));
            }
            return;
          }
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (CW / rect.width);
      const my = (e.clientY - rect.top) * (CH / rect.height);
      handleClick(mx, my);
    };

    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      const mx = (touch.clientX - rect.left) * (CW / rect.width);
      const my = (touch.clientY - rect.top) * (CH / rect.height);
      handleClick(mx, my);
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchend", onTouch);
    };
  }, []);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(!!m);
  }, []);

  const handleReset = useCallback(() => {
    soundRef.current?.playClick();
    setEquipped({ hair: 0, top: 0, bottom: 0, shoes: 0, accessory: 0, underwear: 0 });
    setColorState({ hair: 0, top: 0, bottom: 0, shoes: 0, accessory: 0, underwear: 0 });
  }, []);

  const handlePhoto = useCallback(() => {
    soundRef.current?.playLevelUp();
    setPhase("photo");
    // Delay to let one frame render in photo mode, then capture
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `魅影衣橱_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setPhase("playing");
      }, "image/png");
    }, 100);
  }, []);

  const submitScore = useCallback(async (s: number) => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: s }),
      });
    } catch { /* ignore */ }
  }, []);

  const handleSubmitScore = useCallback(() => {
    soundRef.current?.playCombo(3);
    submitScore(score);
    setShowScorePanel(true);
  }, [score, submitScore]);

  // ─── Save / Load ─────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    return {
      modelIdx: modelIdxRef.current,
      equipped: equippedRef.current,
      colorState: colorStateRef.current,
      activeSlot: activeSlotRef.current,
      phase: phaseRef.current === "photo" ? "playing" : phaseRef.current,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    if (typeof d.modelIdx === "number") setModelIdx(d.modelIdx);
    if (d.equipped && typeof d.equipped === "object") setEquipped(d.equipped as EquipState);
    if (d.colorState && typeof d.colorState === "object") setColorState(d.colorState as ColorState);
    if (typeof d.activeSlot === "string") setActiveSlot(d.activeSlot as Slot);
    if (typeof d.phase === "string") setPhase(d.phase as Phase);
    soundRef.current?.playClick();
  }, []);

  // ─── Blocked Screen ──────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Lock size={48} className="mx-auto text-gray-600 mb-4" />
          <h1 className="text-xl font-bold mb-2">访问受限</h1>
          <p className="text-gray-400 mb-4">需要 NC-17 成人模式才能访问此内容。</p>
          <Link href="/zone/games" className="text-[#3ea6ff] hover:underline">
            返回游戏专区
          </Link>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Nav */}
        <Link
          href="/zone/games"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"
        >
          <ChevronLeft size={16} /> 返回游戏专区
        </Link>

        {/* Title bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shirt size={24} className="text-[#a55eea]" />
            <h1 className="text-xl font-bold">魅影衣橱</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800/50">
              NC-17
            </span>
          </div>
          <button
            onClick={toggleMute}
            className="p-2 rounded-lg hover:bg-white/10 transition"
            title={muted ? "取消静音" : "静音"}
          >
            {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full max-w-[480px] mx-auto rounded-lg border border-white/10 cursor-pointer"
          style={{ touchAction: "none" }}
        />

        {/* Controls (playing phase) */}
        {phase === "playing" && (
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-[#1a1a2e] border border-[#333] text-sm hover:bg-[#2a1a3e] transition inline-flex items-center gap-1.5"
            >
              <RotateCcw size={14} /> 重置
            </button>
            <button
              onClick={handlePhoto}
              className="px-4 py-2 rounded-lg bg-[#1a1a2e] border border-[#333] text-sm hover:bg-[#2a1a3e] transition inline-flex items-center gap-1.5"
            >
              <Camera size={14} /> 拍照保存
            </button>
            <button
              onClick={handleSubmitScore}
              className="px-4 py-2 rounded-lg bg-[#a55eea] text-sm font-medium hover:bg-[#a55eea]/80 transition inline-flex items-center gap-1.5"
            >
              <Star size={14} /> 提交评分 ({score})
            </button>
            <button
              onClick={() => { soundRef.current?.playClick(); setPhase("select"); }}
              className="px-4 py-2 rounded-lg bg-[#1a1a2e] border border-[#333] text-sm hover:bg-[#2a1a3e] transition inline-flex items-center gap-1.5"
            >
              <User size={14} /> 换角色
            </button>
          </div>
        )}

        {/* Score detail panel */}
        {showScorePanel && (
          <div className="mt-4 rounded-xl bg-[#1a1a2e] border border-[#333] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#ffd700] inline-flex items-center gap-1.5">
                <Sparkles size={14} /> 搭配评分详情
              </h3>
              <button
                onClick={() => setShowScorePanel(false)}
                className="text-xs text-gray-500 hover:text-white"
              >
                关闭
              </button>
            </div>
            <div className="text-3xl font-bold text-center text-[#3ea6ff] mb-3">{score} 分</div>
            {combos.length > 0 && (
              <div className="mb-3 text-center">
                {combos.map((c, i) => (
                  <span key={i} className="inline-block px-2 py-0.5 rounded-full bg-[#ffd700]/20 text-[#ffd700] text-xs mr-1 mb-1">
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="space-y-1">
              {scoreDetails.map((d, i) => (
                <div key={i} className="text-xs text-gray-400">{d}</div>
              ))}
            </div>
          </div>
        )}

        {/* Save/Load + Leaderboard */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}
