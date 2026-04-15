"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, RotateCcw, KeyRound, Lightbulb,
  Volume2, VolumeX, Clock, Package
} from "lucide-react";

/* ========== 常量 ========== */
const GAME_ID = "escape-room";
const W = 480, H = 520;

/* ========== 类型 ========== */
type Phase = "title" | "playing" | "win" | "gameover";
type Difficulty = "easy" | "normal" | "hard";
type RoomId = "living" | "study" | "basement";
type ItemId = "key_brass" | "key_silver" | "key_gold" | "note_code" | "note_hint" | "screwdriver" | "lens" | "battery" | "wire" | "fuse";
type PuzzleType = "code_lock" | "jigsaw" | "logic" | "combine";

const DIFF_LABELS: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };
const DIFF_HINTS: Record<Difficulty, number> = { easy: 5, normal: 3, hard: 1 };
const DIFF_TIME: Record<Difficulty, number> = { easy: 600, normal: 420, hard: 240 };
const ROOM_LABELS: Record<RoomId, string> = { living: "客厅", study: "书房", basement: "地下室" };
const ROOM_ORDER: RoomId[] = ["living", "study", "basement"];

interface Item {
  id: ItemId;
  name: string;
  desc: string;
  icon: string; // single char for canvas drawing
  found: boolean;
}

interface Hotspot {
  x: number; y: number; w: number; h: number;
  id: string;
  label: string;
  action: "item" | "puzzle" | "door" | "inspect" | "combine";
  itemId?: ItemId;
  puzzleIdx?: number;
  requireItem?: ItemId;
  targetRoom?: RoomId;
}

interface Puzzle {
  type: PuzzleType;
  solved: boolean;
  label: string;
  // code_lock
  code?: number[];
  codeAnswer?: number[];
  codeLen?: number;
  // jigsaw
  tiles?: number[];
  tileAnswer?: number[];
  tileSize?: number;
  // logic
  switches?: boolean[];
  switchAnswer?: boolean[];
  // combine
  requiredItems?: ItemId[];
  reward?: ItemId;
}

interface RoomState {
  id: RoomId;
  hotspots: Hotspot[];
  puzzles: Puzzle[];
  bgColor: string;
  wallColor: string;
  floorColor: string;
}

interface GameState {
  rooms: Record<RoomId, RoomState>;
  currentRoom: RoomId;
  inventory: Item[];
  selectedItem: ItemId | null;
  hintsLeft: number;
  currentHint: string;
  hintTimer: number;
  timeLeft: number;
  score: number;
  difficulty: Difficulty;
  activePuzzle: number | null; // index into current room puzzles
  roomsCleared: number;
  totalPuzzlesSolved: number;
}

/* ========== 音效 ========== */
class SoundManager {
  private ctx: AudioContext | null = null;
  muted = false;
  private init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  private beep(freq: number, dur: number, type: OscillatorType = "square", vol = 0.12) {
    if (this.muted) return;
    this.init();
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  playClick() { this.beep(600, 0.06, "square", 0.08); }
  playUnlock() {
    this.beep(523, 0.12, "sine", 0.15);
    setTimeout(() => this.beep(659, 0.12, "sine", 0.15), 100);
    setTimeout(() => this.beep(784, 0.2, "sine", 0.15), 200);
  }
  playFind() {
    this.beep(880, 0.1, "triangle", 0.12);
    setTimeout(() => this.beep(1100, 0.15, "triangle", 0.12), 80);
  }
  playError() { this.beep(200, 0.2, "sawtooth", 0.1); }
  playHint() { this.beep(440, 0.15, "sine", 0.1); }
  playDoor() {
    this.beep(300, 0.15, "square", 0.1);
    setTimeout(() => this.beep(400, 0.15, "square", 0.1), 120);
    setTimeout(() => this.beep(500, 0.2, "square", 0.1), 240);
  }
  playWin() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.3, "sine", 0.15), i * 150));
  }
  playGameOver() {
    [400, 350, 300, 200].forEach((f, i) => setTimeout(() => this.beep(f, 0.3, "sawtooth", 0.1), i * 200));
  }
}


/* ========== 房间生成 ========== */
function createItems(): Item[] {
  return [
    { id: "key_brass", name: "铜钥匙", desc: "一把老旧的铜钥匙", icon: "K", found: false },
    { id: "key_silver", name: "银钥匙", desc: "一把闪亮的银钥匙", icon: "K", found: false },
    { id: "key_gold", name: "金钥匙", desc: "一把华丽的金钥匙", icon: "K", found: false },
    { id: "note_code", name: "密码纸条", desc: "上面写着一串数字", icon: "N", found: false },
    { id: "note_hint", name: "提示信", desc: "一封神秘的信件", icon: "N", found: false },
    { id: "screwdriver", name: "螺丝刀", desc: "一把十字螺丝刀", icon: "T", found: false },
    { id: "lens", name: "放大镜", desc: "可以看清细小文字", icon: "L", found: false },
    { id: "battery", name: "电池", desc: "一节AA电池", icon: "B", found: false },
    { id: "wire", name: "电线", desc: "一段铜线", icon: "W", found: false },
    { id: "fuse", name: "保险丝", desc: "替换用保险丝", icon: "F", found: false },
  ];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCodeAnswer(len: number): number[] {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 10));
}

function generateJigsaw(size: number): { tiles: number[]; answer: number[] } {
  const answer = Array.from({ length: size * size }, (_, i) => i);
  const tiles = shuffleArray(answer);
  // Make sure it's not already solved
  if (tiles.every((v, i) => v === answer[i])) {
    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
  }
  return { tiles, answer };
}

function generateLogic(len: number): { switches: boolean[]; answer: boolean[] } {
  const answer = Array.from({ length: len }, () => Math.random() > 0.5);
  return { switches: Array(len).fill(false), answer };
}

function createLivingRoom(diff: Difficulty): RoomState {
  const codeLen = diff === "easy" ? 3 : diff === "normal" ? 4 : 5;
  const codeAns = generateCodeAnswer(codeLen);
  const { tiles, answer: tileAns } = generateJigsaw(3);
  const { switches, answer: switchAns } = generateLogic(diff === "easy" ? 3 : 4);

  const puzzles: Puzzle[] = [
    { type: "code_lock", solved: false, label: "保险箱密码锁", code: Array(codeLen).fill(0), codeAnswer: codeAns, codeLen },
    { type: "jigsaw", solved: false, label: "墙上拼图", tiles: [...tiles], tileAnswer: tileAns, tileSize: 3 },
    { type: "logic", solved: false, label: "电路开关", switches: [...switches], switchAnswer: switchAns },
  ];

  const hotspots: Hotspot[] = [
    { x: 30, y: 80, w: 120, h: 100, id: "safe", label: "保险箱", action: "puzzle", puzzleIdx: 0 },
    { x: 180, y: 60, w: 120, h: 120, id: "painting", label: "墙上画框", action: "puzzle", puzzleIdx: 1 },
    { x: 330, y: 80, w: 120, h: 100, id: "panel", label: "电路面板", action: "puzzle", puzzleIdx: 2 },
    { x: 60, y: 220, w: 60, h: 50, id: "drawer", label: "抽屉", action: "item", itemId: "note_code" },
    { x: 200, y: 240, w: 80, h: 40, id: "sofa", label: "沙发垫下", action: "item", itemId: "key_brass" },
    { x: 360, y: 230, w: 60, h: 50, id: "vase", label: "花瓶", action: "item", itemId: "screwdriver" },
    { x: 190, y: 340, w: 100, h: 60, id: "door_study", label: "通往书房", action: "door", requireItem: "key_brass", targetRoom: "study" },
  ];

  return { id: "living", hotspots, puzzles, bgColor: "#1a1520", wallColor: "#2a2030", floorColor: "#151015" };
}

function createStudyRoom(diff: Difficulty): RoomState {
  const codeLen = diff === "easy" ? 3 : diff === "normal" ? 4 : 5;
  const codeAns = generateCodeAnswer(codeLen);
  const { switches, answer: switchAns } = generateLogic(diff === "easy" ? 4 : 5);

  const puzzles: Puzzle[] = [
    { type: "code_lock", solved: false, label: "书柜暗格", code: Array(codeLen).fill(0), codeAnswer: codeAns, codeLen },
    { type: "logic", solved: false, label: "书架机关", switches: [...switches], switchAnswer: switchAns },
    { type: "combine", solved: false, label: "修理手电筒", requiredItems: ["battery", "wire"], reward: "key_silver" },
  ];

  const hotspots: Hotspot[] = [
    { x: 30, y: 70, w: 130, h: 110, id: "bookcase", label: "书柜暗格", action: "puzzle", puzzleIdx: 0 },
    { x: 180, y: 60, w: 120, h: 120, id: "shelf", label: "书架机关", action: "puzzle", puzzleIdx: 1 },
    { x: 340, y: 70, w: 110, h: 110, id: "desk_puzzle", label: "修理手电筒", action: "puzzle", puzzleIdx: 2 },
    { x: 50, y: 220, w: 60, h: 50, id: "desk_drawer", label: "书桌抽屉", action: "item", itemId: "battery" },
    { x: 200, y: 240, w: 80, h: 40, id: "globe", label: "地球仪底部", action: "item", itemId: "wire" },
    { x: 370, y: 230, w: 60, h: 50, id: "lamp", label: "台灯底座", action: "item", itemId: "note_hint" },
    { x: 40, y: 340, w: 100, h: 60, id: "door_back", label: "返回客厅", action: "door", targetRoom: "living" },
    { x: 340, y: 340, w: 100, h: 60, id: "door_base", label: "通往地下室", action: "door", requireItem: "key_silver", targetRoom: "basement" },
  ];

  return { id: "study", hotspots, puzzles, bgColor: "#151a20", wallColor: "#1f2a30", floorColor: "#101518" };
}

function createBasementRoom(diff: Difficulty): RoomState {
  const codeLen = diff === "easy" ? 4 : diff === "normal" ? 5 : 6;
  const codeAns = generateCodeAnswer(codeLen);
  const { tiles, answer: tileAns } = generateJigsaw(diff === "easy" ? 3 : 4);
  const { switches, answer: switchAns } = generateLogic(diff === "easy" ? 4 : 6);

  const puzzles: Puzzle[] = [
    { type: "code_lock", solved: false, label: "铁门密码", code: Array(codeLen).fill(0), codeAnswer: codeAns, codeLen },
    { type: "jigsaw", solved: false, label: "地板拼图", tiles: [...tiles], tileAnswer: tileAns, tileSize: diff === "easy" ? 3 : 4 },
    { type: "logic", solved: false, label: "配电箱", switches: [...switches], switchAnswer: switchAns },
    { type: "combine", solved: false, label: "修理保险丝盒", requiredItems: ["fuse", "screwdriver"], reward: "key_gold" },
  ];

  const hotspots: Hotspot[] = [
    { x: 20, y: 60, w: 110, h: 100, id: "iron_door", label: "铁门密码", action: "puzzle", puzzleIdx: 0 },
    { x: 150, y: 50, w: 120, h: 120, id: "floor_puzzle", label: "地板拼图", action: "puzzle", puzzleIdx: 1 },
    { x: 300, y: 60, w: 110, h: 100, id: "fuse_box", label: "配电箱", action: "puzzle", puzzleIdx: 2 },
    { x: 420, y: 80, w: 40, h: 80, id: "repair", label: "保险丝盒", action: "puzzle", puzzleIdx: 3 },
    { x: 50, y: 210, w: 60, h: 50, id: "crate", label: "木箱", action: "item", itemId: "fuse" },
    { x: 200, y: 230, w: 80, h: 40, id: "pipe", label: "管道后面", action: "item", itemId: "lens" },
    { x: 370, y: 220, w: 60, h: 50, id: "shelf_b", label: "架子", action: "item", itemId: "key_gold" },
    { x: 40, y: 340, w: 100, h: 60, id: "door_back2", label: "返回书房", action: "door", targetRoom: "study" },
    { x: 190, y: 340, w: 100, h: 60, id: "exit_door", label: "逃出大门", action: "door", requireItem: "key_gold", targetRoom: undefined as unknown as RoomId },
  ];

  return { id: "basement", hotspots, puzzles, bgColor: "#121210", wallColor: "#1a1a15", floorColor: "#0e0e0a" };
}

function createGameState(diff: Difficulty): GameState {
  return {
    rooms: {
      living: createLivingRoom(diff),
      study: createStudyRoom(diff),
      basement: createBasementRoom(diff),
    },
    currentRoom: "living",
    inventory: createItems(),
    selectedItem: null,
    hintsLeft: DIFF_HINTS[diff],
    currentHint: "",
    hintTimer: 0,
    timeLeft: DIFF_TIME[diff],
    score: 0,
    difficulty: diff,
    activePuzzle: null,
    roomsCleared: 0,
    totalPuzzlesSolved: 0,
  };
}


/* ========== 提示系统 ========== */
function getHintForRoom(gs: GameState): string {
  const room = gs.rooms[gs.currentRoom];
  // Find first unsolved puzzle
  for (const p of room.puzzles) {
    if (p.solved) continue;
    if (p.type === "code_lock" && p.codeAnswer) {
      const revealed = p.codeAnswer.slice(0, 2).join("");
      return `${p.label}: 密码开头是 ${revealed}...`;
    }
    if (p.type === "jigsaw") return `${p.label}: 试试交换左上角的方块`;
    if (p.type === "logic" && p.switchAnswer) {
      const first = p.switchAnswer[0] ? "开" : "关";
      return `${p.label}: 第一个开关应该是「${first}」`;
    }
    if (p.type === "combine" && p.requiredItems) {
      const names = p.requiredItems.map(id => {
        const it = gs.inventory.find(i => i.id === id);
        return it ? it.name : id;
      });
      return `${p.label}: 需要 ${names.join(" + ")}`;
    }
  }
  // Check for unfound items
  const unfound = gs.inventory.filter(i => !i.found);
  if (unfound.length > 0) {
    const hotspot = room.hotspots.find(h => h.action === "item" && h.itemId && !gs.inventory.find(i => i.id === h.itemId)?.found);
    if (hotspot) return `试试检查「${hotspot.label}」`;
  }
  return "所有谜题已解开，找到出口吧！";
}

/* ========== 渲染辅助 ========== */
function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawHotspot(ctx: CanvasRenderingContext2D, h: Hotspot, highlight: boolean) {
  ctx.save();
  const alpha = highlight ? 0.35 : 0.15;
  if (h.action === "door") {
    ctx.fillStyle = `rgba(46, 213, 115, ${alpha})`;
    ctx.strokeStyle = highlight ? "#2ed573" : "#2ed57366";
  } else if (h.action === "puzzle") {
    ctx.fillStyle = `rgba(62, 166, 255, ${alpha})`;
    ctx.strokeStyle = highlight ? "#3ea6ff" : "#3ea6ff66";
  } else if (h.action === "item") {
    ctx.fillStyle = `rgba(255, 165, 2, ${alpha})`;
    ctx.strokeStyle = highlight ? "#ffa502" : "#ffa50266";
  } else {
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.strokeStyle = highlight ? "#fff" : "#ffffff44";
  }
  ctx.lineWidth = highlight ? 2 : 1;
  drawRoundRect(ctx, h.x, h.y, h.w, h.h, 6);
  ctx.fill(); ctx.stroke();
  // Label
  ctx.fillStyle = "#ddd";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(h.label, h.x + h.w / 2, h.y + h.h + 3);
  ctx.restore();
}

function drawPuzzleOverlay(ctx: CanvasRenderingContext2D, puzzle: Puzzle, _gs: GameState) {
  // Dark overlay
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#3ea6ff";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(puzzle.label, W / 2, 35);

  if (puzzle.type === "code_lock" && puzzle.code && puzzle.codeLen) {
    const len = puzzle.codeLen;
    const slotW = 44, gap = 8;
    const totalW = len * slotW + (len - 1) * gap;
    const startX = (W - totalW) / 2;
    const y = 80;
    ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif";
    ctx.fillText("点击数字切换 (0-9)", W / 2, 60);
    for (let i = 0; i < len; i++) {
      const x = startX + i * (slotW + gap);
      // Slot bg
      drawRoundRect(ctx, x, y, slotW, 60, 8);
      ctx.fillStyle = "#1a2a3a"; ctx.fill();
      ctx.strokeStyle = "#3ea6ff"; ctx.lineWidth = 2; ctx.stroke();
      // Number
      ctx.fillStyle = "#fff"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(`${puzzle.code[i]}`, x + slotW / 2, y + 30);
      // Up arrow
      ctx.fillStyle = "#3ea6ff66"; ctx.font = "16px sans-serif";
      ctx.fillText("\u25B2", x + slotW / 2, y - 10);
      // Down arrow
      ctx.fillText("\u25BC", x + slotW / 2, y + 75);
    }
    // Confirm button
    drawRoundRect(ctx, W / 2 - 60, 180, 120, 36, 8);
    ctx.fillStyle = "#3ea6ff"; ctx.fill();
    ctx.fillStyle = "#0f0f0f"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("确认", W / 2, 198);
    // Close
    ctx.fillStyle = "#666"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("点击空白处关闭", W / 2, 240);
  }

  if (puzzle.type === "jigsaw" && puzzle.tiles && puzzle.tileSize) {
    const size = puzzle.tileSize;
    const tileW = 60, gap = 4;
    const totalW = size * tileW + (size - 1) * gap;
    const startX = (W - totalW) / 2, startY = 70;
    ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif";
    ctx.fillText("点击两个方块交换位置", W / 2, 55);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const val = puzzle.tiles[idx];
        const x = startX + c * (tileW + gap);
        const y = startY + r * (tileW + gap);
        const correct = val === idx;
        drawRoundRect(ctx, x, y, tileW, tileW, 6);
        ctx.fillStyle = correct ? "#1a3a1a" : "#1a1a2e"; ctx.fill();
        ctx.strokeStyle = correct ? "#2ed573" : "#3ea6ff"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(`${val + 1}`, x + tileW / 2, y + tileW / 2);
      }
    }
    ctx.fillStyle = "#666"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    const bottomY = startY + size * (tileW + gap) + 15;
    ctx.fillText("点击空白处关闭", W / 2, bottomY);
  }

  if (puzzle.type === "logic" && puzzle.switches) {
    const len = puzzle.switches.length;
    const slotW = 50, gap = 10;
    const totalW = len * slotW + (len - 1) * gap;
    const startX = (W - totalW) / 2;
    const y = 80;
    ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif";
    ctx.fillText("点击开关切换状态", W / 2, 60);
    for (let i = 0; i < len; i++) {
      const x = startX + i * (slotW + gap);
      const on = puzzle.switches[i];
      drawRoundRect(ctx, x, y, slotW, 70, 8);
      ctx.fillStyle = on ? "#1a3a1a" : "#2a1a1a"; ctx.fill();
      ctx.strokeStyle = on ? "#2ed573" : "#ff4757"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = on ? "#2ed573" : "#ff4757";
      ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(on ? "开" : "关", x + slotW / 2, y + 35);
      ctx.fillStyle = "#888"; ctx.font = "10px sans-serif";
      ctx.fillText(`#${i + 1}`, x + slotW / 2, y + 58);
    }
    // Confirm
    drawRoundRect(ctx, W / 2 - 60, 180, 120, 36, 8);
    ctx.fillStyle = "#3ea6ff"; ctx.fill();
    ctx.fillStyle = "#0f0f0f"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("确认", W / 2, 198);
    ctx.fillStyle = "#666"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("点击空白处关闭", W / 2, 240);
  }

  if (puzzle.type === "combine" && puzzle.requiredItems) {
    ctx.fillStyle = "#aaa"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("需要组合以下物品:", W / 2, 70);
    const items = puzzle.requiredItems;
    const slotW = 100, gap = 20;
    const totalW = items.length * slotW + (items.length - 1) * gap;
    const startX = (W - totalW) / 2;
    for (let i = 0; i < items.length; i++) {
      const x = startX + i * (slotW + gap);
      drawRoundRect(ctx, x, 90, slotW, 60, 8);
      ctx.fillStyle = "#1a1a2e"; ctx.fill();
      ctx.strokeStyle = "#ffa502"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#ffa502"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(items[i].replace("_", " "), x + slotW / 2, 120);
    }
    // Combine button
    drawRoundRect(ctx, W / 2 - 60, 180, 120, 36, 8);
    ctx.fillStyle = "#ffa502"; ctx.fill();
    ctx.fillStyle = "#0f0f0f"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("组合", W / 2, 198);
    ctx.fillStyle = "#666"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("点击空白处关闭", W / 2, 240);
  }
}


/* ========== 主组件 ========== */
export default function EscapeRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [showInv, setShowInv] = useState(false);
  const gsRef = useRef<GameState>(createGameState("normal"));
  const soundRef = useRef(new SoundManager());
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mouseRef = useRef({ x: -1, y: -1 });
  const jigsawSelRef = useRef<number | null>(null);
  // Force re-render triggers
  const [tick, setTick] = useState(0);

  const forceUpdate = useCallback(() => setTick(t => t + 1), []);

  /* ========== 分数提交 ========== */
  const submitScore = useCallback(async (finalScore: number) => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* ignore */ }
  }, []);

  /* ========== 开始游戏 ========== */
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    gsRef.current = createGameState(diff);
    jigsawSelRef.current = null;
    setPhase("playing");
    soundRef.current.playClick();
    forceUpdate();
  }, [forceUpdate]);

  /* ========== 计时器 ========== */
  useEffect(() => {
    if (phase === "playing") {
      timerRef.current = setInterval(() => {
        const gs = gsRef.current;
        gs.timeLeft--;
        if (gs.timeLeft <= 0) {
          gs.timeLeft = 0;
          setPhase("gameover");
          soundRef.current.playGameOver();
          submitScore(gs.score);
        }
        if (gs.hintTimer > 0) gs.hintTimer--;
        forceUpdate();
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, forceUpdate, submitScore]);

  /* ========== 提示 ========== */
  const useHint = useCallback(() => {
    const gs = gsRef.current;
    if (gs.hintsLeft <= 0) return;
    gs.hintsLeft--;
    gs.currentHint = getHintForRoom(gs);
    gs.hintTimer = 8;
    soundRef.current.playHint();
    forceUpdate();
  }, [forceUpdate]);

  /* ========== 谜题交互 ========== */
  const handlePuzzleClick = useCallback((mx: number, my: number) => {
    const gs = gsRef.current;
    if (gs.activePuzzle === null) return false;
    const room = gs.rooms[gs.currentRoom];
    const puzzle = room.puzzles[gs.activePuzzle];
    if (puzzle.solved) { gs.activePuzzle = null; forceUpdate(); return true; }

    if (puzzle.type === "code_lock" && puzzle.code && puzzle.codeLen && puzzle.codeAnswer) {
      const len = puzzle.codeLen;
      const slotW = 44, gap = 8;
      const totalW = len * slotW + (len - 1) * gap;
      const startX = (W - totalW) / 2;
      // Check up/down arrows or slot clicks
      for (let i = 0; i < len; i++) {
        const x = startX + i * (slotW + gap);
        // Up arrow area
        if (mx >= x && mx <= x + slotW && my >= 65 && my <= 80) {
          puzzle.code[i] = (puzzle.code[i] + 1) % 10;
          soundRef.current.playClick();
          forceUpdate(); return true;
        }
        // Down arrow area
        if (mx >= x && mx <= x + slotW && my >= 140 && my <= 160) {
          puzzle.code[i] = (puzzle.code[i] + 9) % 10;
          soundRef.current.playClick();
          forceUpdate(); return true;
        }
        // Slot click - cycle up
        if (mx >= x && mx <= x + slotW && my >= 80 && my <= 140) {
          puzzle.code[i] = (puzzle.code[i] + 1) % 10;
          soundRef.current.playClick();
          forceUpdate(); return true;
        }
      }
      // Confirm button
      if (mx >= W / 2 - 60 && mx <= W / 2 + 60 && my >= 180 && my <= 216) {
        if (puzzle.code.every((v, i) => v === puzzle.codeAnswer![i])) {
          puzzle.solved = true;
          gs.totalPuzzlesSolved++;
          gs.score += 100;
          soundRef.current.playUnlock();
        } else {
          soundRef.current.playError();
          gs.currentHint = "密码错误！";
          gs.hintTimer = 3;
        }
        forceUpdate(); return true;
      }
      // Close on empty area
      if (my > 250 || my < 20) { gs.activePuzzle = null; forceUpdate(); return true; }
      return true;
    }

    if (puzzle.type === "jigsaw" && puzzle.tiles && puzzle.tileSize) {
      const size = puzzle.tileSize;
      const tileW = 60, gap = 4;
      const totalW = size * tileW + (size - 1) * gap;
      const startX = (W - totalW) / 2, startY = 70;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const x = startX + c * (tileW + gap);
          const y = startY + r * (tileW + gap);
          if (mx >= x && mx <= x + tileW && my >= y && my <= y + tileW) {
            const idx = r * size + c;
            if (jigsawSelRef.current === null) {
              jigsawSelRef.current = idx;
              soundRef.current.playClick();
            } else {
              const prev = jigsawSelRef.current;
              [puzzle.tiles[prev], puzzle.tiles[idx]] = [puzzle.tiles[idx], puzzle.tiles[prev]];
              jigsawSelRef.current = null;
              soundRef.current.playClick();
              // Check solved
              if (puzzle.tiles.every((v, i) => v === i)) {
                puzzle.solved = true;
                gs.totalPuzzlesSolved++;
                gs.score += 150;
                soundRef.current.playUnlock();
              }
            }
            forceUpdate(); return true;
          }
        }
      }
      const bottomY = startY + size * (tileW + gap) + 30;
      if (my > bottomY || my < 20) { gs.activePuzzle = null; jigsawSelRef.current = null; forceUpdate(); return true; }
      return true;
    }

    if (puzzle.type === "logic" && puzzle.switches && puzzle.switchAnswer) {
      const len = puzzle.switches.length;
      const slotW = 50, gap = 10;
      const totalW = len * slotW + (len - 1) * gap;
      const startX = (W - totalW) / 2;
      const y = 80;
      for (let i = 0; i < len; i++) {
        const x = startX + i * (slotW + gap);
        if (mx >= x && mx <= x + slotW && my >= y && my <= y + 70) {
          puzzle.switches[i] = !puzzle.switches[i];
          soundRef.current.playClick();
          forceUpdate(); return true;
        }
      }
      // Confirm
      if (mx >= W / 2 - 60 && mx <= W / 2 + 60 && my >= 180 && my <= 216) {
        if (puzzle.switches.every((v, i) => v === puzzle.switchAnswer![i])) {
          puzzle.solved = true;
          gs.totalPuzzlesSolved++;
          gs.score += 120;
          soundRef.current.playUnlock();
        } else {
          soundRef.current.playError();
          gs.currentHint = "开关组合错误！";
          gs.hintTimer = 3;
        }
        forceUpdate(); return true;
      }
      if (my > 250 || my < 20) { gs.activePuzzle = null; forceUpdate(); return true; }
      return true;
    }

    if (puzzle.type === "combine" && puzzle.requiredItems) {
      // Combine button
      if (mx >= W / 2 - 60 && mx <= W / 2 + 60 && my >= 180 && my <= 216) {
        const hasAll = puzzle.requiredItems.every(id => gs.inventory.find(i => i.id === id)?.found);
        if (hasAll) {
          puzzle.solved = true;
          gs.totalPuzzlesSolved++;
          gs.score += 80;
          if (puzzle.reward) {
            const rewardItem = gs.inventory.find(i => i.id === puzzle.reward);
            if (rewardItem) rewardItem.found = true;
          }
          soundRef.current.playUnlock();
          gs.currentHint = puzzle.reward ? `获得了 ${gs.inventory.find(i => i.id === puzzle.reward)?.name}！` : "组合成功！";
          gs.hintTimer = 4;
        } else {
          soundRef.current.playError();
          gs.currentHint = "缺少必要物品！";
          gs.hintTimer = 3;
        }
        forceUpdate(); return true;
      }
      if (my > 250 || my < 20) { gs.activePuzzle = null; forceUpdate(); return true; }
      return true;
    }

    // Default close
    gs.activePuzzle = null;
    forceUpdate();
    return true;
  }, [forceUpdate]);

  /* ========== 房间交互 ========== */
  const handleRoomClick = useCallback((mx: number, my: number) => {
    const gs = gsRef.current;
    const room = gs.rooms[gs.currentRoom];

    for (const h of room.hotspots) {
      if (mx < h.x || mx > h.x + h.w || my < h.y || my > h.y + h.h) continue;

      if (h.action === "item" && h.itemId) {
        const item = gs.inventory.find(i => i.id === h.itemId);
        if (item && !item.found) {
          item.found = true;
          gs.score += 30;
          gs.currentHint = `发现了「${item.name}」！`;
          gs.hintTimer = 4;
          soundRef.current.playFind();
        } else {
          gs.currentHint = "这里已经搜索过了";
          gs.hintTimer = 2;
        }
        forceUpdate(); return;
      }

      if (h.action === "puzzle" && h.puzzleIdx !== undefined) {
        const puzzle = room.puzzles[h.puzzleIdx];
        if (puzzle.solved) {
          gs.currentHint = `「${puzzle.label}」已经解开了`;
          gs.hintTimer = 2;
        } else {
          gs.activePuzzle = h.puzzleIdx;
          jigsawSelRef.current = null;
        }
        soundRef.current.playClick();
        forceUpdate(); return;
      }

      if (h.action === "door") {
        if (h.requireItem) {
          const hasKey = gs.inventory.find(i => i.id === h.requireItem)?.found;
          if (!hasKey) {
            gs.currentHint = `需要「${gs.inventory.find(i => i.id === h.requireItem)?.name || "钥匙"}」才能打开`;
            gs.hintTimer = 3;
            soundRef.current.playError();
            forceUpdate(); return;
          }
        }
        if (h.targetRoom) {
          gs.currentRoom = h.targetRoom;
          gs.activePuzzle = null;
          gs.currentHint = `进入了${ROOM_LABELS[h.targetRoom]}`;
          gs.hintTimer = 3;
          soundRef.current.playDoor();
          forceUpdate(); return;
        } else {
          // Exit - win!
          const allSolved = Object.values(gs.rooms).every(r => r.puzzles.every(p => p.solved));
          const timeBonus = Math.floor(gs.timeLeft * 2);
          gs.score += timeBonus + (allSolved ? 500 : 200);
          setPhase("win");
          soundRef.current.playWin();
          submitScore(gs.score);
          forceUpdate(); return;
        }
      }

      soundRef.current.playClick();
      forceUpdate(); return;
    }
  }, [forceUpdate, submitScore]);

  /* ========== 点击处理 ========== */
  const handleClick = useCallback((mx: number, my: number) => {
    if (phase !== "playing") return;
    const gs = gsRef.current;
    if (gs.activePuzzle !== null) {
      handlePuzzleClick(mx, my);
      return;
    }
    handleRoomClick(mx, my);
  }, [phase, handlePuzzleClick, handleRoomClick]);

  /* ========== 键盘 ========== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "title") {
        if (e.key === "Enter" || e.key === " ") startGame("normal");
        if (e.key === "1") startGame("easy");
        if (e.key === "2") startGame("normal");
        if (e.key === "3") startGame("hard");
        return;
      }
      if (phase === "playing") {
        if (e.key === "h" || e.key === "H") useHint();
        if (e.key === "i" || e.key === "I") setShowInv(v => !v);
        if (e.key === "Escape") {
          const gs = gsRef.current;
          if (gs.activePuzzle !== null) {
            gs.activePuzzle = null;
            jigsawSelRef.current = null;
            forceUpdate();
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame, useHint, forceUpdate]);


  /* ========== Canvas 渲染 ========== */
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
      const gs = gsRef.current;

      if (phase === "title") {
        // Title screen
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("密室逃脱", W / 2, 120);
        ctx.fillStyle = "#888"; ctx.font = "14px sans-serif";
        ctx.fillText("解开谜题，收集钥匙，逃出密室！", W / 2, 155);

        // Difficulty buttons
        const diffs: Difficulty[] = ["easy", "normal", "hard"];
        const btnW = 120, btnH = 44, gap = 16;
        const totalW = diffs.length * btnW + (diffs.length - 1) * gap;
        const startX = (W - totalW) / 2;
        for (let i = 0; i < diffs.length; i++) {
          const x = startX + i * (btnW + gap);
          const y = 200;
          const hovered = mouseRef.current.x >= x && mouseRef.current.x <= x + btnW && mouseRef.current.y >= y && mouseRef.current.y <= y + btnH;
          drawRoundRect(ctx, x, y, btnW, btnH, 8);
          ctx.fillStyle = hovered ? "#3ea6ff" : "#1a2a3a"; ctx.fill();
          ctx.strokeStyle = "#3ea6ff"; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = hovered ? "#0f0f0f" : "#3ea6ff";
          ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(DIFF_LABELS[diffs[i]], x + btnW / 2, y + btnH / 2);
        }

        // Instructions
        ctx.fillStyle = "#555"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("点击物品/区域探索 | H 提示 | I 背包 | ESC 关闭谜题", W / 2, 290);
        ctx.fillText("键盘 1/2/3 选择难度", W / 2, 310);

        // Decorative key icon
        ctx.fillStyle = "#3ea6ff33";
        ctx.font = "120px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("\u{1F5DD}", W / 2, 440);
        // Override with SVG-style key drawing
        ctx.strokeStyle = "#3ea6ff44"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(W / 2, 400, 25, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W / 2 + 25, 400); ctx.lineTo(W / 2 + 70, 400); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W / 2 + 55, 400); ctx.lineTo(W / 2 + 55, 415); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W / 2 + 65, 400); ctx.lineTo(W / 2 + 65, 410); ctx.stroke();

      } else if (phase === "playing") {
        const room = gs.rooms[gs.currentRoom];

        // Room background
        ctx.fillStyle = room.bgColor; ctx.fillRect(0, 0, W, H);
        // Walls
        ctx.fillStyle = room.wallColor;
        ctx.fillRect(10, 10, W - 20, 300);
        // Floor
        ctx.fillStyle = room.floorColor;
        ctx.fillRect(10, 310, W - 20, 110);
        // Wall border
        ctx.strokeStyle = "#333"; ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, W - 20, 400);
        // Floor line
        ctx.strokeStyle = "#222"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(10, 310); ctx.lineTo(W - 10, 310); ctx.stroke();

        // Room label
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(ROOM_LABELS[gs.currentRoom], 20, 30);

        // Draw hotspots
        for (const h of room.hotspots) {
          const hovered = mouseRef.current.x >= h.x && mouseRef.current.x <= h.x + h.w &&
                          mouseRef.current.y >= h.y && mouseRef.current.y <= h.y + h.h;
          // Check if item already found
          if (h.action === "item" && h.itemId) {
            const item = gs.inventory.find(i => i.id === h.itemId);
            if (item?.found) {
              // Draw dimmed
              ctx.save();
              ctx.globalAlpha = 0.3;
              drawHotspot(ctx, h, false);
              ctx.restore();
              continue;
            }
          }
          // Check if puzzle solved
          if (h.action === "puzzle" && h.puzzleIdx !== undefined) {
            const puzzle = room.puzzles[h.puzzleIdx];
            if (puzzle.solved) {
              ctx.save();
              ctx.globalAlpha = 0.3;
              drawHotspot(ctx, h, false);
              // Solved checkmark
              ctx.globalAlpha = 1;
              ctx.fillStyle = "#2ed573"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.fillText("\u2713", h.x + h.w / 2, h.y + h.h / 2);
              ctx.restore();
              continue;
            }
          }
          // Check door lock status
          if (h.action === "door" && h.requireItem) {
            const hasKey = gs.inventory.find(i => i.id === h.requireItem)?.found;
            if (!hasKey) {
              drawHotspot(ctx, h, hovered);
              // Lock icon
              ctx.fillStyle = "#ff4757"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.fillText("\u{1F512}", h.x + h.w / 2, h.y + h.h / 2);
              continue;
            }
          }
          drawHotspot(ctx, h, hovered);
          // Door arrow
          if (h.action === "door") {
            ctx.fillStyle = "#2ed573"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("\u2192", h.x + h.w / 2, h.y + h.h / 2);
          }
        }

        // HUD bar
        ctx.fillStyle = "rgba(15,15,15,0.9)";
        ctx.fillRect(0, H - 100, W, 100);
        ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, H - 100); ctx.lineTo(W, H - 100); ctx.stroke();

        // Timer
        const mins = Math.floor(gs.timeLeft / 60);
        const secs = gs.timeLeft % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
        ctx.fillStyle = gs.timeLeft <= 60 ? "#ff4757" : "#fff";
        ctx.font = "bold 16px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`\u23F1 ${timeStr}`, 15, H - 78);

        // Score
        ctx.fillStyle = "#ffd700"; ctx.font = "bold 14px sans-serif";
        ctx.fillText(`\u2605 ${gs.score}`, 120, H - 78);

        // Hints
        ctx.fillStyle = gs.hintsLeft > 0 ? "#3ea6ff" : "#555";
        ctx.font = "12px sans-serif";
        ctx.fillText(`\u{1F4A1} 提示: ${gs.hintsLeft}`, 210, H - 78);

        // Puzzles solved
        const totalPuzzles = Object.values(gs.rooms).reduce((sum, r) => sum + r.puzzles.length, 0);
        ctx.fillStyle = "#2ed573"; ctx.font = "12px sans-serif";
        ctx.fillText(`\u2713 ${gs.totalPuzzlesSolved}/${totalPuzzles}`, 310, H - 78);

        // Room indicator
        ctx.fillStyle = "#888"; ctx.font = "12px sans-serif"; ctx.textAlign = "right";
        ctx.fillText(`${ROOM_LABELS[gs.currentRoom]}`, W - 15, H - 78);

        // Inventory bar (bottom)
        const foundItems = gs.inventory.filter(i => i.found);
        if (foundItems.length > 0) {
          const itemW = 36, itemGap = 4;
          const itemStartX = 15;
          ctx.fillStyle = "#aaa"; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
          ctx.fillText("背包:", itemStartX, H - 55);
          for (let i = 0; i < foundItems.length; i++) {
            const x = itemStartX + 35 + i * (itemW + itemGap);
            const y = H - 65;
            drawRoundRect(ctx, x, y, itemW, itemW, 4);
            ctx.fillStyle = gs.selectedItem === foundItems[i].id ? "#3ea6ff33" : "#1a1a2e";
            ctx.fill();
            ctx.strokeStyle = gs.selectedItem === foundItems[i].id ? "#3ea6ff" : "#333";
            ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = "#ffa502"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(foundItems[i].icon, x + itemW / 2, y + itemW / 2);
          }
        } else {
          ctx.fillStyle = "#555"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
          ctx.fillText("背包为空 - 探索房间寻找物品", 15, H - 45);
        }

        // Hint text
        if (gs.hintTimer > 0 && gs.currentHint) {
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          const hintY = H - 18;
          ctx.fillRect(0, hintY - 14, W, 20);
          ctx.fillStyle = "#ffd700"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(gs.currentHint, W / 2, hintY);
        }

        // Puzzle overlay
        if (gs.activePuzzle !== null) {
          const puzzle = room.puzzles[gs.activePuzzle];
          drawPuzzleOverlay(ctx, puzzle, gs);
        }

      } else if (phase === "win") {
        ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
        // Victory
        ctx.fillStyle = "#2ed573"; ctx.font = "bold 36px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("逃脱成功！", W / 2, 120);

        ctx.fillStyle = "#fff"; ctx.font = "16px sans-serif";
        ctx.fillText(`最终得分: ${gsRef.current.score}`, W / 2, 170);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText(`难度: ${DIFF_LABELS[gsRef.current.difficulty]}`, W / 2, 200);
        ctx.fillText(`解开谜题: ${gsRef.current.totalPuzzlesSolved}`, W / 2, 225);
        const mins = Math.floor(gsRef.current.timeLeft / 60);
        const secs = gsRef.current.timeLeft % 60;
        ctx.fillText(`剩余时间: ${mins}:${secs.toString().padStart(2, "0")}`, W / 2, 250);

        // Decorative
        ctx.strokeStyle = "#2ed57344"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(W / 2, 340, 40, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#2ed573"; ctx.font = "bold 40px sans-serif";
        ctx.fillText("\u2713", W / 2, 355);

        ctx.fillStyle = "#666"; ctx.font = "12px sans-serif";
        ctx.fillText("点击重新开始", W / 2, 420);

      } else if (phase === "gameover") {
        ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ff4757"; ctx.font = "bold 36px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("时间耗尽！", W / 2, 120);

        ctx.fillStyle = "#fff"; ctx.font = "16px sans-serif";
        ctx.fillText(`得分: ${gsRef.current.score}`, W / 2, 170);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText(`难度: ${DIFF_LABELS[gsRef.current.difficulty]}`, W / 2, 200);
        ctx.fillText(`解开谜题: ${gsRef.current.totalPuzzlesSolved}`, W / 2, 225);

        ctx.strokeStyle = "#ff475744"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(W / 2, 320, 40, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#ff4757"; ctx.font = "bold 40px sans-serif";
        ctx.fillText("\u2717", W / 2, 335);

        ctx.fillStyle = "#666"; ctx.font = "12px sans-serif";
        ctx.fillText("点击重新开始", W / 2, 400);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    // Mouse move for hover
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);
      if (phase === "title") {
        // Check difficulty buttons
        const diffs: Difficulty[] = ["easy", "normal", "hard"];
        const btnW = 120, btnH = 44, gap = 16;
        const totalW = diffs.length * btnW + (diffs.length - 1) * gap;
        const startX = (W - totalW) / 2;
        for (let i = 0; i < diffs.length; i++) {
          const x = startX + i * (btnW + gap);
          if (mx >= x && mx <= x + btnW && my >= 200 && my <= 244) {
            startGame(diffs[i]);
            return;
          }
        }
        return;
      }
      if (phase === "win" || phase === "gameover") {
        startGame(difficulty);
        return;
      }
      handleClick(mx, my);
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = (t.clientX - rect.left) * (W / rect.width);
      const my = (t.clientY - rect.top) * (H / rect.height);
      mouseRef.current = { x: mx, y: my };
      if (phase === "title") {
        const diffs: Difficulty[] = ["easy", "normal", "hard"];
        const btnW = 120, btnH = 44, gap = 16;
        const totalW = diffs.length * btnW + (diffs.length - 1) * gap;
        const startX = (W - totalW) / 2;
        for (let i = 0; i < diffs.length; i++) {
          const x = startX + i * (btnW + gap);
          if (mx >= x && mx <= x + btnW && my >= 200 && my <= 244) {
            startGame(diffs[i]);
            return;
          }
        }
        return;
      }
      if (phase === "win" || phase === "gameover") {
        startGame(difficulty);
        return;
      }
      handleClick(mx, my);
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchend", onTouch);
    };
  }, [phase, difficulty, tick, startGame, handleClick]);


  /* ========== 存档 ========== */
  const handleSave = useCallback(() => {
    const gs = gsRef.current;
    return {
      rooms: gs.rooms,
      currentRoom: gs.currentRoom,
      inventory: gs.inventory,
      hintsLeft: gs.hintsLeft,
      timeLeft: gs.timeLeft,
      score: gs.score,
      difficulty: gs.difficulty,
      totalPuzzlesSolved: gs.totalPuzzlesSolved,
      roomsCleared: gs.roomsCleared,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Partial<GameState>;
    if (d.rooms) gsRef.current.rooms = d.rooms;
    if (d.currentRoom) gsRef.current.currentRoom = d.currentRoom;
    if (d.inventory) gsRef.current.inventory = d.inventory;
    if (d.hintsLeft !== undefined) gsRef.current.hintsLeft = d.hintsLeft;
    if (d.timeLeft !== undefined) gsRef.current.timeLeft = d.timeLeft;
    if (d.score !== undefined) gsRef.current.score = d.score;
    if (d.difficulty) gsRef.current.difficulty = d.difficulty;
    if (d.totalPuzzlesSolved !== undefined) gsRef.current.totalPuzzlesSolved = d.totalPuzzlesSolved;
    gsRef.current.activePuzzle = null;
    gsRef.current.hintTimer = 0;
    setPhase("playing");
    forceUpdate();
  }, [forceUpdate]);

  /* ========== 音效切换 ========== */
  useEffect(() => { soundRef.current.muted = muted; }, [muted]);

  /* ========== UI ========== */
  const gs = gsRef.current;
  const foundItems = gs.inventory.filter(i => i.found);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <KeyRound size={24} className="text-[#3ea6ff]" />
            <h1 className="text-xl font-bold">密室逃脱</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMuted(m => !m)}
              className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff] transition"
              title={muted ? "开启音效" : "关闭音效"}
            >
              {muted ? <VolumeX size={16} className="text-gray-500" /> : <Volume2 size={16} className="text-[#3ea6ff]" />}
            </button>
            {phase === "playing" && (
              <>
                <button
                  onClick={useHint}
                  disabled={gs.hintsLeft <= 0}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff] transition text-xs disabled:opacity-40"
                  title="使用提示 (H)"
                >
                  <Lightbulb size={14} className="text-[#ffd700]" />
                  <span>提示 ({gs.hintsLeft})</span>
                </button>
                <button
                  onClick={() => setShowInv(v => !v)}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff] transition text-xs"
                  title="背包 (I)"
                >
                  <Package size={14} className="text-[#ffa502]" />
                  <span>背包 ({foundItems.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inventory panel */}
        {showInv && phase === "playing" && (
          <div className="mb-4 p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
            <h3 className="text-sm font-bold text-[#ffa502] mb-2">背包物品</h3>
            {foundItems.length === 0 ? (
              <p className="text-xs text-gray-500">还没有找到任何物品</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {foundItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#212121] text-xs">
                    <span className="text-[#ffa502] font-bold text-lg w-6 text-center">{item.icon}</span>
                    <div>
                      <div className="text-white font-medium">{item.name}</div>
                      <div className="text-gray-500 text-[10px]">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Room navigation */}
        {phase === "playing" && (
          <div className="flex items-center gap-2 mb-3">
            {ROOM_ORDER.map(rid => (
              <div
                key={rid}
                className={`px-3 py-1 rounded-full text-xs border transition ${
                  gs.currentRoom === rid
                    ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold"
                    : "text-[#666] border-[#333]"
                }`}
              >
                {ROOM_LABELS[rid]}
              </div>
            ))}
            <div className="flex-1" />
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock size={12} />
              <span className={gs.timeLeft <= 60 ? "text-red-400 font-bold" : ""}>
                {Math.floor(gs.timeLeft / 60)}:{(gs.timeLeft % 60).toString().padStart(2, "0")}
              </span>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="w-full max-w-[480px] mx-auto rounded-lg border border-white/10 cursor-pointer"
          style={{ touchAction: "none" }}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => startGame(difficulty)}
            className="flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80 transition"
          >
            <RotateCcw size={14} /> 重新开始
          </button>
          {phase === "playing" && (
            <span className="text-xs text-gray-500 ml-2">
              难度: {DIFF_LABELS[difficulty]} | 得分: {gs.score}
            </span>
          )}
        </div>

        {/* Save/Load + Leaderboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>

        {/* Game instructions */}
        <div className="mt-6 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]">
          <h3 className="text-sm font-bold text-[#3ea6ff] mb-2">游戏说明</h3>
          <div className="text-xs text-gray-400 space-y-1">
            <p>你被困在一间密室中，需要解开各种谜题、收集钥匙，最终逃出密室。</p>
            <p>游戏包含3个房间：客厅、书房、地下室，每个房间有不同的谜题和隐藏物品。</p>
            <p className="text-gray-500">操作：点击高亮区域探索 | H 使用提示 | I 打开背包 | ESC 关闭谜题</p>
            <p className="text-gray-500">谜题类型：密码锁、拼图、逻辑开关、物品组合</p>
          </div>
        </div>
      </div>
    </div>
  );
}
