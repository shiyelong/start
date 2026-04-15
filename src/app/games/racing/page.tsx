"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, RotateCcw, Car, Play, Trophy, Clock,
  Gauge, Flag, Volume2, VolumeX, ChevronUp, ChevronDown
} from "lucide-react";

/* ========== 常量 ========== */
const GAME_ID = "racing";
const W = 600, H = 600;
const TWO_PI = Math.PI * 2;
const TOTAL_LAPS = 3;

/* ========== 赛车定义 ========== */
type CarId = "speed" | "balanced" | "handling";
interface CarDef {
  id: CarId; name: string; desc: string; color: string;
  topSpeed: number; accel: number; brake: number; turnRate: number; grip: number;
}
const CARS: CarDef[] = [
  { id: "speed", name: "闪电号", desc: "极速型 - 最高速度快，操控一般", color: "#ff4444", topSpeed: 280, accel: 120, brake: 200, turnRate: 2.4, grip: 0.85 },
  { id: "balanced", name: "风暴号", desc: "平衡型 - 各项属性均衡", color: "#3ea6ff", topSpeed: 250, accel: 140, brake: 220, turnRate: 2.8, grip: 0.90 },
  { id: "handling", name: "幽灵号", desc: "操控型 - 转向灵活，抓地力强", color: "#2ba640", topSpeed: 230, accel: 130, brake: 240, turnRate: 3.4, grip: 0.96 },
];

/* ========== 赛道定义 ========== */
type TrackId = "city" | "mountain" | "desert";
interface TrackPoint { x: number; y: number; }
interface TrackZone { start: number; end: number; type: "boost" | "slow"; }
interface TrackDef {
  id: TrackId; name: string; desc: string; difficulty: number;
  bgColor: string; roadColor: string; edgeColor: string; grassColor: string;
  points: TrackPoint[]; width: number; zones: TrackZone[];
}

function makeOvalTrack(cx: number, cy: number, rx: number, ry: number, n: number): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

function makeMountainTrack(): TrackPoint[] {
  const cx = W / 2, cy = H / 2;
  const pts: TrackPoint[] = [];
  const n = 60;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const r = 180 + Math.sin(a * 3) * 50 + Math.cos(a * 5) * 30;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.85 });
  }
  return pts;
}

function makeDesertTrack(): TrackPoint[] {
  const cx = W / 2, cy = H / 2;
  const pts: TrackPoint[] = [];
  const n = 60;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const r = 200 + Math.sin(a * 2) * 60 + Math.cos(a * 4) * 25 + Math.sin(a * 7) * 15;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.8 });
  }
  return pts;
}

const TRACKS: TrackDef[] = [
  {
    id: "city", name: "城市赛道", desc: "简单 - 宽阔的椭圆赛道", difficulty: 1,
    bgColor: "#1a1a2e", roadColor: "#333", edgeColor: "#f0b90b", grassColor: "#0a1a0a",
    points: makeOvalTrack(W / 2, H / 2, 220, 180, 48), width: 70,
    zones: [{ start: 0, end: 4, type: "boost" }, { start: 24, end: 28, type: "slow" }],
  },
  {
    id: "mountain", name: "山路赛道", desc: "普通 - 弯道多变的山路", difficulty: 2,
    bgColor: "#0f1a0f", roadColor: "#3a3a2a", edgeColor: "#8B4513", grassColor: "#1a2a0a",
    points: makeMountainTrack(), width: 58,
    zones: [{ start: 10, end: 14, type: "boost" }, { start: 30, end: 35, type: "slow" }, { start: 45, end: 49, type: "slow" }],
  },
  {
    id: "desert", name: "沙漠赛道", desc: "困难 - 狭窄弯曲的沙漠赛道", difficulty: 3,
    bgColor: "#1a1508", roadColor: "#4a3a20", edgeColor: "#ff6600", grassColor: "#2a2008",
    points: makeDesertTrack(), width: 50,
    zones: [{ start: 5, end: 9, type: "boost" }, { start: 20, end: 24, type: "slow" }, { start: 40, end: 45, type: "slow" }],
  },
];

/* ========== 难度定义 ========== */
type DiffId = "easy" | "normal" | "hard";
interface DiffDef { id: DiffId; name: string; aiSpeedMul: number; aiSkill: number; }
const DIFFS: DiffDef[] = [
  { id: "easy", name: "简单", aiSpeedMul: 0.75, aiSkill: 0.5 },
  { id: "normal", name: "普通", aiSpeedMul: 0.9, aiSkill: 0.75 },
  { id: "hard", name: "困难", aiSpeedMul: 1.05, aiSkill: 0.95 },
];

/* ========== AI 对手 ========== */
const AI_COLORS = ["#ff8800", "#aa44ff", "#ff44aa"];
const AI_NAMES = ["橙风", "紫电", "粉雷"];

/* ========== 游戏状态类型 ========== */
interface RacerState {
  x: number; y: number; angle: number; speed: number;
  trackIdx: number; lap: number; lapProgress: number;
  bestLap: number; lapTimes: number[]; totalTime: number;
  drifting: boolean; driftAngle: number;
  isAI: boolean; name: string; color: string;
  carDef: CarDef; finished: boolean; finishTime: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }

interface GameState {
  racers: RacerState[];
  particles: Particle[];
  countdown: number;
  raceStarted: boolean;
  raceTime: number;
  allFinished: boolean;
}

/* ========== 音效系统 ========== */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  muted = false;

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 80;
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    } catch { /* ignore */ }
  }

  updateEngine(speed: number, maxSpeed: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || this.muted) return;
    const ratio = Math.abs(speed) / maxSpeed;
    this.engineOsc.frequency.value = 60 + ratio * 200;
    this.engineGain.gain.value = Math.min(0.06, ratio * 0.08);
  }

  playDrift() {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 100 + Math.random() * 50;
      g.gain.value = 0.03;
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(); osc.stop(this.ctx.currentTime + 0.3);
    } catch { /* ignore */ }
  }

  playCollision() {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 200;
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.15);
      g.gain.value = 0.1;
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(); osc.stop(this.ctx.currentTime + 0.15);
    } catch { /* ignore */ }
  }

  playCountdown(final = false) {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = final ? 880 : 440;
      g.gain.value = 0.08;
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(); osc.stop(this.ctx.currentTime + 0.3);
    } catch { /* ignore */ }
  }

  playFinish() {
    if (!this.ctx || this.muted) return;
    try {
      [523, 659, 784].forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        osc.type = "sine"; osc.frequency.value = f;
        g.gain.value = 0.06;
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + 0.15 * i + 0.4);
        osc.connect(g); g.connect(this.ctx!.destination);
        osc.start(this.ctx!.currentTime + 0.15 * i);
        osc.stop(this.ctx!.currentTime + 0.15 * i + 0.4);
      });
    } catch { /* ignore */ }
  }

  silence() {
    if (this.engineGain) this.engineGain.gain.value = 0;
  }

  destroy() {
    this.silence();
    try { this.engineOsc?.stop(); } catch { /* ignore */ }
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null; this.engineOsc = null; this.engineGain = null;
  }
}

/* ========== 工具函数 ========== */
function dist(a: TrackPoint, b: TrackPoint) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function angleDiff(a: number, b: number) { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; }

function getTrackSegment(track: TrackDef, idx: number): { p1: TrackPoint; p2: TrackPoint } {
  const pts = track.points;
  const p1 = pts[idx % pts.length];
  const p2 = pts[(idx + 1) % pts.length];
  return { p1, p2 };
}

function closestPointOnTrack(track: TrackDef, px: number, py: number): { idx: number; dist: number; onTrack: boolean } {
  let bestDist = Infinity, bestIdx = 0;
  const pts = track.points;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.sqrt((pts[i].x - px) ** 2 + (pts[i].y - py) ** 2);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return { idx: bestIdx, dist: bestDist, onTrack: bestDist < track.width / 2 + 10 };
}

function isInZone(track: TrackDef, idx: number, type: "boost" | "slow"): boolean {
  const n = track.points.length;
  const ni = ((idx % n) + n) % n;
  return track.zones.some(z => z.type === type && ((z.start <= z.end) ? (ni >= z.start && ni <= z.end) : (ni >= z.start || ni <= z.end)));
}

function formatTime(ms: number): string {
  if (ms <= 0 || ms >= 999999) return "--:--.---";
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toFixed(3).padStart(6, "0")}`;
}



/* ========== 主组件（占位） ========== */
export default function RacingPage() {
  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-6 pb-20 text-center">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回游戏中心
        </Link>
        <div className="py-20">
          <Car size={48} className="mx-auto text-[#3ea6ff] mb-4" />
          <h1 className="text-2xl font-bold mb-2">极速狂飙</h1>
          <p className="text-gray-400 text-sm">2D 赛车游戏 — 开发中</p>
        </div>
      </main>
    </>
  );
}
