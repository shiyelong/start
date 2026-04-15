"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, RotateCcw, Car, Play, Trophy, Clock,
  Gauge, Flag, Volume2, VolumeX, ChevronUp, ChevronDown,
  ChevronRight
} from "lucide-react";

/* ========== 常量 ========== */
const GAME_ID = "racing";
const W = 600, H = 600;
const TWO_PI = Math.PI * 2;
const TOTAL_LAPS = 3;
const DT = 1 / 60;

/* ========== 赛车定义 ========== */
type CarId = "speed" | "balanced" | "handling";
interface CarDef {
  id: CarId; name: string; desc: string; color: string;
  topSpeed: number; accel: number; brake: number; turnRate: number; grip: number;
}
const CARS: CarDef[] = [
  { id: "speed", name: "闪电号", desc: "极速型 - 最高速度快，操控一般", color: "#ff4444", topSpeed: 280, accel: 120, brake: 200, turnRate: 2.4, grip: 0.85 },
  { id: "balanced", name: "均衡号", desc: "平衡型 - 各项属性均衡", color: "#3ea6ff", topSpeed: 250, accel: 140, brake: 220, turnRate: 2.8, grip: 0.90 },
  { id: "handling", name: "灵巧号", desc: "操控型 - 转向灵活，抓地力强", color: "#2ba640", topSpeed: 230, accel: 130, brake: 240, turnRate: 3.4, grip: 0.96 },
];

/* ========== 赛道定义 ========== */
type TrackId = "oval" | "scurve" | "extreme";
interface TrackPoint { x: number; y: number; }
interface TrackZone { start: number; end: number; type: "boost" | "slow"; }
interface TrackDef {
  id: TrackId; name: string; desc: string; difficulty: number;
  bgColor: string; roadColor: string; edgeColor: string;
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

function makeSCurveTrack(): TrackPoint[] {
  const cx = W / 2, cy = H / 2;
  const pts: TrackPoint[] = [];
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const r = 200 + Math.sin(a * 3) * 55 + Math.cos(a * 5) * 25;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.82 });
  }
  return pts;
}

function makeExtremeTrack(): TrackPoint[] {
  const cx = W / 2, cy = H / 2;
  const pts: TrackPoint[] = [];
  const n = 72;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const r = 210 + Math.sin(a * 2) * 65 + Math.cos(a * 4) * 30 + Math.sin(a * 7) * 18;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.78 });
  }
  return pts;
}

const TRACKS: TrackDef[] = [
  {
    id: "oval", name: "椭圆赛道", desc: "简单 - 宽阔的椭圆赛道", difficulty: 1,
    bgColor: "#0a1a0a", roadColor: "#333", edgeColor: "#f0b90b",
    points: makeOvalTrack(W / 2, H / 2, 220, 180, 48), width: 72,
    zones: [{ start: 0, end: 4, type: "boost" }, { start: 24, end: 28, type: "slow" }],
  },
  {
    id: "scurve", name: "S弯赛道", desc: "普通 - 弯道多变的S弯", difficulty: 2,
    bgColor: "#0f1a0f", roadColor: "#3a3a2a", edgeColor: "#8B4513",
    points: makeSCurveTrack(), width: 60,
    zones: [{ start: 10, end: 14, type: "boost" }, { start: 32, end: 37, type: "slow" }, { start: 50, end: 54, type: "boost" }],
  },
  {
    id: "extreme", name: "极限赛道", desc: "困难 - 狭窄弯曲的极限赛道", difficulty: 3,
    bgColor: "#1a1508", roadColor: "#4a3a20", edgeColor: "#ff6600",
    points: makeExtremeTrack(), width: 50,
    zones: [{ start: 5, end: 9, type: "boost" }, { start: 25, end: 30, type: "slow" }, { start: 50, end: 55, type: "slow" }, { start: 65, end: 69, type: "boost" }],
  },
];

/* ========== 难度定义 ========== */
type DiffId = "easy" | "normal" | "hard";
interface DiffDef { id: DiffId; name: string; aiSpeedMul: number; aiSkill: number; }
const DIFFS: DiffDef[] = [
  { id: "easy", name: "简单", aiSpeedMul: 0.72, aiSkill: 0.45 },
  { id: "normal", name: "普通", aiSpeedMul: 0.88, aiSkill: 0.72 },
  { id: "hard", name: "困难", aiSpeedMul: 1.02, aiSkill: 0.92 },
];

/* ========== AI 对手 ========== */
const AI_COLORS = ["#ff8800", "#aa44ff"];
const AI_NAMES = ["橙风", "紫电"];

/* ========== 游戏状态类型 ========== */
interface RacerState {
  x: number; y: number; angle: number; speed: number;
  trackIdx: number; lap: number; lapProgress: number;
  bestLap: number; lapTimes: number[]; totalTime: number;
  isAI: boolean; name: string; color: string;
  carDef: CarDef; finished: boolean; finishTime: number;
  lapStartTime: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface GameState {
  racers: RacerState[];
  particles: Particle[];
  countdown: number;
  raceStarted: boolean;
  raceTime: number;
  allFinished: boolean;
  keys: Set<string>;
  touchControls: { up: boolean; down: boolean; left: boolean; right: boolean };
  frame: number;
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
    this.engineGain.gain.value = Math.min(0.05, ratio * 0.07);
  }

  playCollision() {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "square"; osc.frequency.value = 200;
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.15);
      g.gain.value = 0.08;
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
      osc.type = "sine"; osc.frequency.value = final ? 880 : 440;
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

  playBoost() {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 600;
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.2);
      g.gain.value = 0.04;
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(); osc.stop(this.ctx.currentTime + 0.2);
    } catch { /* ignore */ }
  }

  silence() { if (this.engineGain) this.engineGain.gain.value = 0; }

  destroy() {
    this.silence();
    try { this.engineOsc?.stop(); } catch { /* ignore */ }
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null; this.engineOsc = null; this.engineGain = null;
  }
}

/* ========== 工具函数 ========== */
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

function closestTrackIdx(track: TrackDef, px: number, py: number): { idx: number; dist: number } {
  let bestDist = Infinity, bestIdx = 0;
  const pts = track.points;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.sqrt((pts[i].x - px) ** 2 + (pts[i].y - py) ** 2);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return { idx: bestIdx, dist: bestDist };
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

function spawnParticles(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TWO_PI;
    const sp = 0.5 + Math.random() * 2;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 20 + Math.random() * 20, maxLife: 40, color, size: 1.5 + Math.random() * 2,
    });
  }
}

/* ========== 初始化赛车手 ========== */
function initRacer(
  track: TrackDef, carDef: CarDef, name: string, color: string,
  isAI: boolean, startOffset: number
): RacerState {
  const pts = track.points;
  const startIdx = startOffset % pts.length;
  const p = pts[startIdx];
  const pNext = pts[(startIdx + 1) % pts.length];
  const angle = Math.atan2(pNext.y - p.y, pNext.x - p.x);
  return {
    x: p.x, y: p.y, angle, speed: 0,
    trackIdx: startIdx, lap: 0, lapProgress: 0,
    bestLap: Infinity, lapTimes: [], totalTime: 0,
    isAI, name, color, carDef,
    finished: false, finishTime: 0, lapStartTime: 0,
  };
}

/* ========== 更新赛车手 ========== */
function updateRacer(
  racer: RacerState, track: TrackDef, diff: DiffDef,
  accelInput: number, turnInput: number, brakeInput: boolean,
  raceTime: number
) {
  if (racer.finished) return;
  const car = racer.carDef;
  const pts = track.points;
  const n = pts.length;

  // 检查是否在赛道上
  const closest = closestTrackIdx(track, racer.x, racer.y);
  const onTrack = closest.dist < track.width / 2 + 5;
  const inBoost = isInZone(track, closest.idx, "boost");
  const inSlow = isInZone(track, closest.idx, "slow");

  // 速度系数
  let speedMul = 1.0;
  if (!onTrack) speedMul = 0.45;
  else if (inSlow) speedMul = 0.65;
  else if (inBoost) speedMul = 1.25;

  const grip = onTrack ? car.grip : car.grip * 0.5;
  const maxSpeed = car.topSpeed * speedMul * (racer.isAI ? diff.aiSpeedMul : 1.0);

  // 加速/刹车
  if (brakeInput) {
    racer.speed -= car.brake * DT;
    if (racer.speed < -car.topSpeed * 0.3) racer.speed = -car.topSpeed * 0.3;
  } else if (accelInput > 0) {
    racer.speed += car.accel * accelInput * DT;
    if (racer.speed > maxSpeed) racer.speed = lerp(racer.speed, maxSpeed, 0.05);
  } else {
    // 自然减速
    racer.speed *= 0.985;
  }

  // 转向
  const turnFactor = car.turnRate * (1 - Math.abs(racer.speed) / (car.topSpeed * 1.5) * 0.4);
  racer.angle += turnInput * turnFactor * DT;

  // 抓地力（侧向摩擦）
  racer.speed *= lerp(1, grip, 0.1);

  // 移动
  racer.x += Math.cos(racer.angle) * racer.speed * DT;
  racer.y += Math.sin(racer.angle) * racer.speed * DT;

  // 边界限制
  racer.x = Math.max(5, Math.min(W - 5, racer.x));
  racer.y = Math.max(5, Math.min(H - 5, racer.y));

  // 更新赛道进度
  const newClosest = closestTrackIdx(track, racer.x, racer.y);
  const oldIdx = racer.trackIdx;
  const newIdx = newClosest.idx;

  // 检测圈数（跨越起点线）
  const crossForward = oldIdx > n * 0.75 && newIdx < n * 0.25;
  const crossBackward = oldIdx < n * 0.25 && newIdx > n * 0.75;

  if (crossForward && racer.speed > 0) {
    racer.lap++;
    const lapTime = raceTime - racer.lapStartTime;
    racer.lapTimes.push(lapTime);
    if (lapTime < racer.bestLap) racer.bestLap = lapTime;
    racer.lapStartTime = raceTime;
    if (racer.lap >= TOTAL_LAPS) {
      racer.finished = true;
      racer.finishTime = raceTime;
      racer.totalTime = raceTime;
    }
  } else if (crossBackward && racer.speed < 0) {
    if (racer.lap > 0) racer.lap--;
  }

  racer.trackIdx = newIdx;
  racer.lapProgress = newIdx / n;
}

/* ========== AI 控制 ========== */
function updateAI(racer: RacerState, track: TrackDef, diff: DiffDef, raceTime: number) {
  if (racer.finished) return;
  const pts = track.points;
  const n = pts.length;
  const lookAhead = Math.max(3, Math.floor(6 * diff.aiSkill));
  const targetIdx = (racer.trackIdx + lookAhead) % n;
  const target = pts[targetIdx];

  const dx = target.x - racer.x;
  const dy = target.y - racer.y;
  const targetAngle = Math.atan2(dy, dx);
  const diff2 = angleDiff(racer.angle, targetAngle);

  let turnInput = 0;
  if (Math.abs(diff2) > 0.05) {
    turnInput = Math.sign(diff2) * Math.min(1, Math.abs(diff2) * 2);
  }

  // AI 加速逻辑：弯道减速
  let accelInput = 1.0;
  const curveLookAhead = Math.min(10, n - 1);
  let totalCurve = 0;
  for (let i = 0; i < curveLookAhead; i++) {
    const i1 = (racer.trackIdx + i) % n;
    const i2 = (racer.trackIdx + i + 1) % n;
    const a1 = Math.atan2(pts[i2].y - pts[i1].y, pts[i2].x - pts[i1].x);
    const i3 = (i2 + 1) % n;
    const a2 = Math.atan2(pts[i3].y - pts[i2].y, pts[i3].x - pts[i2].x);
    totalCurve += Math.abs(angleDiff(a1, a2));
  }
  if (totalCurve > 0.8) accelInput = 0.5;
  else if (totalCurve > 0.4) accelInput = 0.7;

  // 随机性（低技能AI更不稳定）
  const jitter = (1 - diff.aiSkill) * 0.15;
  turnInput += (Math.random() - 0.5) * jitter;

  const brakeInput = racer.speed > racer.carDef.topSpeed * 0.8 && totalCurve > 1.0;

  updateRacer(racer, track, diff, accelInput, turnInput, brakeInput, raceTime);
}

/* ========== 绘制函数 ========== */
function drawGame(ctx: CanvasRenderingContext2D, gs: GameState, track: TrackDef) {
  const pts = track.points;
  const n = pts.length;

  // 背景
  ctx.fillStyle = track.bgColor;
  ctx.fillRect(0, 0, W, H);

  // 赛道草地纹理
  ctx.strokeStyle = "#1a3a1a";
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = (i * 37 + gs.frame * 0.1) % W;
    const y = (i * 53 + gs.frame * 0.05) % H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - 5);
    ctx.stroke();
  }

  // 赛道路面
  ctx.lineWidth = track.width;
  ctx.strokeStyle = track.roadColor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n];
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();

  // 赛道边线
  ctx.lineWidth = track.width + 6;
  ctx.strokeStyle = track.edgeColor;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i <= n; i++) ctx.lineTo(pts[i % n].x, pts[i % n].y);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 赛道中线（虚线）
  ctx.setLineDash([8, 12]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ffffff30";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i <= n; i++) ctx.lineTo(pts[i % n].x, pts[i % n].y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // 加速带/减速带
  for (const zone of track.zones) {
    const color = zone.type === "boost" ? "#3ea6ff" : "#ff4444";
    ctx.globalAlpha = 0.3 + Math.sin(gs.frame * 0.1) * 0.1;
    for (let i = zone.start; i <= zone.end && i < n; i++) {
      const p = pts[i % n];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, track.width / 3, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 起点/终点线
  const sp = pts[0];
  const sp2 = pts[1];
  const sa = Math.atan2(sp2.y - sp.y, sp2.x - sp.x) + Math.PI / 2;
  const hw = track.width / 2;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sp.x + Math.cos(sa) * hw, sp.y + Math.sin(sa) * hw);
  ctx.lineTo(sp.x - Math.cos(sa) * hw, sp.y - Math.sin(sa) * hw);
  ctx.stroke();
  // 棋盘格
  const checkSize = 6;
  for (let ci = -3; ci <= 3; ci++) {
    for (let cj = 0; cj < 2; cj++) {
      const cx = sp.x + Math.cos(sa) * ci * checkSize + Math.cos(sa + Math.PI / 2) * cj * checkSize;
      const cy = sp.y + Math.sin(sa) * ci * checkSize + Math.sin(sa + Math.PI / 2) * cj * checkSize;
      ctx.fillStyle = (ci + cj) % 2 === 0 ? "#fff" : "#000";
      ctx.fillRect(cx - checkSize / 2, cy - checkSize / 2, checkSize, checkSize);
    }
  }

  // 粒子
  for (const p of gs.particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 赛车
  for (const racer of gs.racers) {
    drawCar(ctx, racer, gs.frame);
  }

  // 倒计时
  if (gs.countdown > 0) {
    const num = Math.ceil(gs.countdown / 60);
    ctx.fillStyle = "#00000080";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = num > 0 ? "#f0b90b" : "#2ba640";
    ctx.font = "bold 72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(num > 0 ? String(num) : "GO!", W / 2, H / 2);
  }

  // HUD
  if (gs.raceStarted) {
    drawHUD(ctx, gs);
  }
}

function drawCar(ctx: CanvasRenderingContext2D, racer: RacerState, frame: number) {
  ctx.save();
  ctx.translate(racer.x, racer.y);
  ctx.rotate(racer.angle);

  // 车身
  const cw = 20, ch = 10;
  ctx.fillStyle = racer.color;
  ctx.beginPath();
  ctx.moveTo(cw / 2 + 4, 0);
  ctx.lineTo(-cw / 2, -ch / 2);
  ctx.lineTo(-cw / 2 - 2, 0);
  ctx.lineTo(-cw / 2, ch / 2);
  ctx.closePath();
  ctx.fill();

  // 车身高光
  ctx.fillStyle = "#ffffff30";
  ctx.beginPath();
  ctx.moveTo(cw / 2 + 2, 0);
  ctx.lineTo(0, -ch / 4);
  ctx.lineTo(-cw / 4, 0);
  ctx.lineTo(0, ch / 4);
  ctx.closePath();
  ctx.fill();

  // 尾灯
  if (racer.speed < 0 || Math.abs(racer.speed) < 5) {
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(-cw / 2 - 3, -ch / 3, 3, 2);
    ctx.fillRect(-cw / 2 - 3, ch / 3 - 2, 3, 2);
  }

  // 排气粒子效果（加速时）
  if (racer.speed > 50) {
    ctx.globalAlpha = 0.4 + Math.sin(frame * 0.3) * 0.2;
    ctx.fillStyle = "#ff880080";
    ctx.beginPath();
    ctx.arc(-cw / 2 - 4, 0, 2 + Math.random() * 2, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // 名字标签
  ctx.fillStyle = racer.color;
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(racer.name, racer.x, racer.y - 14);
}

function drawHUD(ctx: CanvasRenderingContext2D, gs: GameState) {
  const player = gs.racers[0];
  if (!player) return;

  // 半透明背景
  ctx.fillStyle = "#00000080";
  ctx.fillRect(0, 0, W, 52);

  // 圈数
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "left";
  const lapText = player.finished ? `${TOTAL_LAPS}/${TOTAL_LAPS}` : `${Math.min(player.lap + 1, TOTAL_LAPS)}/${TOTAL_LAPS}`;
  ctx.fillText(`圈: ${lapText}`, 10, 18);

  // 时间
  ctx.textAlign = "center";
  ctx.fillStyle = "#3ea6ff";
  ctx.fillText(formatTime(gs.raceTime), W / 2, 18);

  // 速度
  ctx.textAlign = "right";
  ctx.fillStyle = "#f0b90b";
  ctx.fillText(`${Math.abs(Math.round(player.speed))} km/h`, W - 10, 18);

  // 排名
  const sorted = [...gs.racers].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.lapProgress - a.lapProgress;
  });
  const rank = sorted.findIndex(r => !r.isAI) + 1;
  ctx.textAlign = "left";
  ctx.fillStyle = rank === 1 ? "#f0b90b" : "#fff";
  ctx.fillText(`P${rank}`, 10, 38);

  // 最快圈
  ctx.textAlign = "center";
  ctx.fillStyle = "#aaa";
  ctx.font = "11px sans-serif";
  ctx.fillText(`最快圈: ${formatTime(player.bestLap)}`, W / 2, 38);

  // 小地图
  drawMinimap(ctx, gs);
}

function drawMinimap(ctx: CanvasRenderingContext2D, gs: GameState) {
  const mx = W - 90, my = H - 90, ms = 80;
  ctx.fillStyle = "#00000060";
  ctx.fillRect(mx, my, ms, ms);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, ms, ms);

  const scale = ms / W * 0.9;
  const ox = mx + ms / 2;
  const oy = my + ms / 2;

  for (const r of gs.racers) {
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(ox + (r.x - W / 2) * scale, oy + (r.y - H / 2) * scale, r.isAI ? 2 : 3, 0, TWO_PI);
    ctx.fill();
  }
}

/* ========== 完整绘制（含赛道参数） ========== */
function drawGameFull(ctx: CanvasRenderingContext2D, gs: GameState, track: TrackDef) {
  drawGame(ctx, gs, track);

  // 偏离赛道提示（覆盖在HUD上）
  if (gs.raceStarted) {
    const player = gs.racers[0];
    if (player && player.speed > 0) {
      const closest = closestTrackIdx(track, player.x, player.y);
      if (closest.dist > track.width / 2 + 5) {
        ctx.fillStyle = "#ff4444";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("偏离赛道!", W - 10, 48);
      }
    }
  }
}

/* ========== 主组件 ========== */
export default function RacingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<"title" | "playing" | "result">("title");
  const [selectedCar, setSelectedCar] = useState<CarId>("balanced");
  const [selectedTrack, setSelectedTrack] = useState<TrackId>("oval");
  const [selectedDiff, setSelectedDiff] = useState<DiffId>("normal");
  const [muted, setMuted] = useState(false);
  const [resultData, setResultData] = useState<{
    rank: number; totalTime: number; bestLap: number;
    lapTimes: number[]; rankings: { name: string; color: string; time: number; bestLap: number }[];
  } | null>(null);

  const gsRef = useRef<GameState | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const trackRef = useRef<TrackDef>(TRACKS[0]);

  // 初始化游戏状态
  const initGame = useCallback((carId: CarId, trackId: TrackId, diffId: DiffId): GameState => {
    const car = CARS.find(c => c.id === carId) || CARS[1];
    const track = TRACKS.find(t => t.id === trackId) || TRACKS[0];
    const diff = DIFFS.find(d => d.id === diffId) || DIFFS[1];
    trackRef.current = track;

    const n = track.points.length;
    const racers: RacerState[] = [];

    // 玩家
    racers.push(initRacer(track, car, car.name, car.color, false, 0));

    // AI 对手
    const aiCars = CARS.filter(c => c.id !== carId);
    for (let i = 0; i < 2; i++) {
      const aiCar = { ...aiCars[i % aiCars.length] };
      aiCar.topSpeed *= diff.aiSpeedMul;
      const offset = Math.floor(n - 3 - i * 3);
      racers.push(initRacer(track, aiCar, AI_NAMES[i], AI_COLORS[i], true, offset));
    }

    return {
      racers, particles: [],
      countdown: 180, // 3 seconds at 60fps
      raceStarted: false, raceTime: 0, allFinished: false,
      keys: new Set(), touchControls: { up: false, down: false, left: false, right: false },
      frame: 0,
    };
  }, []);

  const startGame = useCallback(() => {
    const gs = initGame(selectedCar, selectedTrack, selectedDiff);
    gsRef.current = gs;

    if (!soundRef.current) soundRef.current = new SoundEngine();
    soundRef.current.muted = muted;
    soundRef.current.init();

    setScreen("playing");
  }, [initGame, selectedCar, selectedTrack, selectedDiff, muted]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      if (soundRef.current) soundRef.current.muted = next;
      if (next && soundRef.current) soundRef.current.silence();
      return next;
    });
  }, []);

  // 存档
  const handleSave = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return {};
    const player = gs.racers[0];
    return {
      car: selectedCar, track: selectedTrack, diff: selectedDiff,
      bestLap: player.bestLap === Infinity ? 0 : player.bestLap,
      lapTimes: player.lapTimes, totalTime: player.totalTime,
    };
  }, [selectedCar, selectedTrack, selectedDiff]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d) return;
    if (d.car) setSelectedCar(d.car as CarId);
    if (d.track) setSelectedTrack(d.track as TrackId);
    if (d.diff) setSelectedDiff(d.diff as DiffId);
  }, []);

  // 提交分数
  const submitScore = useCallback(async (score: number) => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score }),
      });
    } catch { /* ignore */ }
  }, []);

  /* ========== 游戏循环 ========== */
  useEffect(() => {
    if (screen !== "playing" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let lastCountdownSound = 4;

    const gs = gsRef.current!;
    const track = trackRef.current;
    const diff = DIFFS.find(d => d.id === selectedDiff) || DIFFS[1];
    const sound = soundRef.current;

    // 键盘事件
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        gs.keys.add(k);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      gs.keys.delete(e.key.toLowerCase());
    };

    // 触摸事件
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      updateTouches(e.touches);
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      updateTouches(e.touches);
    };
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      updateTouches(e.touches);
    };

    function updateTouches(touches: TouchList) {
      gs.touchControls = { up: false, down: false, left: false, right: false };
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < touches.length; i++) {
        const tx = (touches[i].clientX - rect.left) / rect.width;
        const ty = (touches[i].clientY - rect.top) / rect.height;
        // 左半屏 = 转向，右半屏 = 加速/刹车
        if (tx < 0.5) {
          if (tx < 0.25) gs.touchControls.left = true;
          else gs.touchControls.right = true;
        } else {
          if (ty < 0.5) gs.touchControls.up = true;
          else gs.touchControls.down = true;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    function gameLoop() {
      gs.frame++;

      // 倒计时
      if (gs.countdown > 0) {
        gs.countdown--;
        const num = Math.ceil(gs.countdown / 60);
        if (num < lastCountdownSound) {
          sound?.playCountdown(num === 0);
          lastCountdownSound = num;
        }
        if (gs.countdown <= 0) {
          gs.raceStarted = true;
          for (const r of gs.racers) r.lapStartTime = 0;
        }
      }

      if (gs.raceStarted && !gs.allFinished) {
        gs.raceTime += 1000 / 60;

        // 玩家输入
        const player = gs.racers[0];
        if (!player.finished) {
          let accel = 0, turn = 0, brake = false;
          if (gs.keys.has("arrowup") || gs.keys.has("w") || gs.touchControls.up) accel = 1;
          if (gs.keys.has("arrowdown") || gs.keys.has("s") || gs.touchControls.down) brake = true;
          if (gs.keys.has("arrowleft") || gs.keys.has("a") || gs.touchControls.left) turn = -1;
          if (gs.keys.has("arrowright") || gs.keys.has("d") || gs.touchControls.right) turn = 1;

          const prevLap = player.lap;
          updateRacer(player, track, diff, accel, turn, brake, gs.raceTime);

          // 检测完赛
          if (player.finished && !player.isAI) {
            sound?.playFinish();
          }
          // 检测新圈
          if (player.lap > prevLap && !player.finished) {
            sound?.playBoost();
          }

          // 排气粒子
          if (player.speed > 30 && gs.frame % 3 === 0) {
            const bx = player.x - Math.cos(player.angle) * 12;
            const by = player.y - Math.sin(player.angle) * 12;
            spawnParticles(gs.particles, bx, by, "#ff880060", 1);
          }

          sound?.updateEngine(player.speed, player.carDef.topSpeed);
        }

        // AI 更新
        for (let i = 1; i < gs.racers.length; i++) {
          const ai = gs.racers[i];
          if (!ai.finished) {
            updateAI(ai, track, diff, gs.raceTime);
            // AI 排气粒子
            if (ai.speed > 30 && gs.frame % 5 === 0) {
              const bx = ai.x - Math.cos(ai.angle) * 12;
              const by = ai.y - Math.sin(ai.angle) * 12;
              spawnParticles(gs.particles, bx, by, ai.color + "40", 1);
            }
          }
        }

        // 碰撞检测（赛车之间）
        for (let i = 0; i < gs.racers.length; i++) {
          for (let j = i + 1; j < gs.racers.length; j++) {
            const a = gs.racers[i], b = gs.racers[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 18 && d > 0) {
              const nx = dx / d, ny = dy / d;
              const overlap = 18 - d;
              a.x -= nx * overlap * 0.5;
              a.y -= ny * overlap * 0.5;
              b.x += nx * overlap * 0.5;
              b.y += ny * overlap * 0.5;
              // 速度交换
              const relSpeed = (a.speed - b.speed) * 0.3;
              a.speed -= relSpeed;
              b.speed += relSpeed;
              if (i === 0 || j === 0) sound?.playCollision();
              spawnParticles(gs.particles, (a.x + b.x) / 2, (a.y + b.y) / 2, "#fff", 3);
            }
          }
        }

        // 检查是否全部完赛
        if (gs.racers.every(r => r.finished)) {
          gs.allFinished = true;
          sound?.silence();

          // 计算排名
          const sorted = [...gs.racers].sort((a, b) => a.finishTime - b.finishTime);
          const playerRank = sorted.findIndex(r => !r.isAI) + 1;
          const player = gs.racers[0];
          const rankings = sorted.map(r => ({
            name: r.name, color: r.color,
            time: r.finishTime, bestLap: r.bestLap,
          }));

          setResultData({
            rank: playerRank,
            totalTime: player.totalTime,
            bestLap: player.bestLap,
            lapTimes: player.lapTimes,
            rankings,
          });

          // 分数 = 基于排名和时间
          const score = Math.max(0, Math.round(100000 / (player.totalTime / 1000) * (4 - playerRank)));
          submitScore(score);

          setTimeout(() => setScreen("result"), 1500);
        }
      }

      // 更新粒子
      gs.particles = gs.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.life--;
        p.vx *= 0.95; p.vy *= 0.95;
        return p.life > 0;
      });

      // 绘制
      drawGameFull(ctx, gs, track);

      raf = requestAnimationFrame(gameLoop);
    }

    raf = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      sound?.silence();
    };
  }, [screen, selectedDiff, submitScore]);

  /* ========== 标题画面 ========== */
  if (screen === "title") {
    return (
      <>
        <Header />
        <main className="max-w-[500px] mx-auto px-4 py-4 pb-20 md:pb-8">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-[#3ea6ff] transition"><ChevronLeft size={16} /></Link>
            <h1 className="text-lg font-bold">极速狂飙</h1>
          </div>

          <div className="bg-[#1a1a1a] rounded-2xl border border-[#333]/50 p-5 space-y-5">
            {/* 标题 */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#3ea6ff]/15 flex items-center justify-center mx-auto mb-2">
                <Car size={24} className="text-[#3ea6ff]" />
              </div>
              <h2 className="text-xl font-black text-[#3ea6ff]">极速狂飙</h2>
              <p className="text-[#666] text-xs mt-1">选择赛车、赛道和难度开始比赛</p>
            </div>

            {/* 赛车选择 */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                <Gauge size={14} className="text-[#3ea6ff]" />选择赛车
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {CARS.map(c => (
                  <button key={c.id} onClick={() => setSelectedCar(c.id)}
                    className={`p-3 rounded-xl border text-center transition ${selectedCar === c.id ? "border-[#3ea6ff] bg-[#3ea6ff]/10" : "border-[#333] hover:border-[#555]"}`}>
                    <div className="w-6 h-3 rounded mx-auto mb-1.5" style={{ backgroundColor: c.color }} />
                    <p className="text-xs font-bold" style={{ color: c.color }}>{c.name}</p>
                    <p className="text-[10px] text-[#888] mt-0.5">{c.desc}</p>
                    <div className="mt-1.5 space-y-0.5 text-[9px] text-[#666]">
                      <div className="flex justify-between"><span>速度</span><span>{c.topSpeed}</span></div>
                      <div className="flex justify-between"><span>加速</span><span>{c.accel}</span></div>
                      <div className="flex justify-between"><span>操控</span><span>{Math.round(c.turnRate * 100)}</span></div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 赛道选择 */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                <Flag size={14} className="text-[#f0b90b]" />选择赛道
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {TRACKS.map(t => (
                  <button key={t.id} onClick={() => setSelectedTrack(t.id)}
                    className={`p-3 rounded-xl border text-center transition ${selectedTrack === t.id ? "border-[#f0b90b] bg-[#f0b90b]/10" : "border-[#333] hover:border-[#555]"}`}>
                    <p className="text-xs font-bold" style={{ color: t.edgeColor }}>{t.name}</p>
                    <p className="text-[10px] text-[#888] mt-0.5">{t.desc}</p>
                    <div className="flex justify-center mt-1 gap-0.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full ${i < t.difficulty ? "bg-[#f0b90b]" : "bg-[#333]"}`} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 难度选择 */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                <Trophy size={14} className="text-[#a855f7]" />选择难度
              </h3>
              <div className="flex gap-2">
                {DIFFS.map(d => (
                  <button key={d.id} onClick={() => setSelectedDiff(d.id)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-bold transition ${selectedDiff === d.id ? "border-[#a855f7] bg-[#a855f7]/10 text-[#a855f7]" : "border-[#333] text-[#888] hover:border-[#555]"}`}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 操作说明 */}
            <div className="text-[10px] text-[#666] text-center space-y-0.5">
              <p>方向键/WASD 控制赛车 | 上/W 加速 | 下/S 刹车</p>
              <p>左/A 右/D 转向 | 手机触摸左半屏转向，右半屏加速/刹车</p>
              <p>完成 {TOTAL_LAPS} 圈计时赛，与 AI 对手竞速</p>
            </div>

            {/* 音效开关 + 开始 */}
            <div className="flex gap-2">
              <button onClick={toggleMute}
                className="px-4 py-3 rounded-xl border border-[#333] text-[#888] hover:border-[#555] transition">
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button onClick={startGame}
                className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95 flex items-center justify-center gap-2">
                <Play size={16} /> 开始比赛
              </button>
            </div>
          </div>

          {/* 存档 & 排行榜 */}
          <div className="mt-4 space-y-3">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </main>
      </>
    );
  }

  /* ========== 结算画面 ========== */
  if (screen === "result" && resultData) {
    const r = resultData;
    return (
      <>
        <Header />
        <main className="max-w-[500px] mx-auto px-4 py-4 pb-20 md:pb-8">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-[#3ea6ff] transition"><ChevronLeft size={16} /></Link>
            <h1 className="text-lg font-bold">极速狂飙</h1>
          </div>

          <div className="bg-[#1a1a1a] rounded-2xl border border-[#333]/50 p-5">
            {/* 标题 */}
            <div className="text-center mb-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 ${r.rank === 1 ? "bg-[#f0b90b]/15" : "bg-[#3ea6ff]/15"}`}>
                {r.rank === 1 ? <Trophy size={24} className="text-[#f0b90b]" /> : <Flag size={24} className="text-[#3ea6ff]" />}
              </div>
              <h2 className={`text-xl font-black ${r.rank === 1 ? "text-[#f0b90b]" : "text-[#3ea6ff]"}`}>
                {r.rank === 1 ? "冠军" : `第 ${r.rank} 名`}
              </h2>
              <p className="text-[#888] text-xs mt-1">
                {TRACKS.find(t => t.id === selectedTrack)?.name} - {DIFFS.find(d => d.id === selectedDiff)?.name}
              </p>
            </div>

            {/* 统计 */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="p-3 rounded-xl bg-[#212121] border border-[#333]/50 text-center">
                <p className="text-lg font-black text-[#3ea6ff]">{formatTime(r.totalTime)}</p>
                <p className="text-[10px] text-[#888]">总用时</p>
              </div>
              <div className="p-3 rounded-xl bg-[#212121] border border-[#333]/50 text-center">
                <p className="text-lg font-black text-[#f0b90b]">{formatTime(r.bestLap)}</p>
                <p className="text-[10px] text-[#888]">最快单圈</p>
              </div>
            </div>

            {/* 每圈时间 */}
            <div className="mb-4">
              <h3 className="text-xs font-bold text-[#aaa] mb-2 flex items-center gap-1">
                <Clock size={12} /> 单圈时间
              </h3>
              <div className="space-y-1">
                {r.lapTimes.map((lt, i) => (
                  <div key={i} className="flex justify-between text-xs px-2 py-1 rounded bg-[#212121]">
                    <span className="text-[#888]">第 {i + 1} 圈</span>
                    <span className={lt === r.bestLap ? "text-[#f0b90b] font-bold" : "text-[#ccc]"}>
                      {formatTime(lt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 排名 */}
            <div className="mb-5">
              <h3 className="text-xs font-bold text-[#aaa] mb-2 flex items-center gap-1">
                <Trophy size={12} /> 最终排名
              </h3>
              <div className="space-y-1">
                {r.rankings.map((rk, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-[#212121]">
                    <span className={`font-bold w-5 ${i === 0 ? "text-[#f0b90b]" : "text-[#888]"}`}>
                      P{i + 1}
                    </span>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rk.color }} />
                    <span className="flex-1 text-[#ccc]">{rk.name}</span>
                    <span className="text-[#888]">{formatTime(rk.time)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 按钮 */}
            <div className="flex gap-2">
              <button onClick={() => setScreen("title")}
                className="flex-1 py-3 rounded-xl border border-[#333] text-[#ccc] font-bold text-sm hover:bg-[#333]/30 transition flex items-center justify-center gap-1.5">
                <RotateCcw size={14} /> 返回
              </button>
              <button onClick={startGame}
                className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-1.5">
                <Play size={14} /> 再来一局
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </main>
      </>
    );
  }

  /* ========== 游戏画面 ========== */
  return (
    <>
      <Header />
      <main className="max-w-[500px] mx-auto px-4 py-4 pb-20 md:pb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-[#3ea6ff] transition"><ChevronLeft size={16} /></Link>
            <h1 className="text-lg font-bold">极速狂飙</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-[#888] hover:text-[#ccc] transition">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button onClick={() => { soundRef.current?.silence(); setScreen("title"); }}
              className="text-[#888] hover:text-[#ccc] transition text-xs">
              退出
            </button>
          </div>
        </div>

        <div className="relative bg-black rounded-2xl overflow-hidden border border-[#333]/50 shadow-2xl">
          <canvas ref={canvasRef} width={W} height={H} className="w-full block" style={{ imageRendering: "auto" }} />
        </div>

        {/* 触摸控制按钮 */}
        <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
          <div className="grid grid-cols-3 gap-1">
            <div />
            <button
              onTouchStart={() => { if (gsRef.current) gsRef.current.touchControls.up = true; }}
              onTouchEnd={() => { if (gsRef.current) gsRef.current.touchControls.up = false; }}
              className="py-3 rounded-lg bg-[#212121] border border-[#333] flex items-center justify-center active:bg-[#3ea6ff]/20">
              <ChevronUp size={20} className="text-[#888]" />
            </button>
            <div />
            <button
              onTouchStart={() => { if (gsRef.current) gsRef.current.touchControls.left = true; }}
              onTouchEnd={() => { if (gsRef.current) gsRef.current.touchControls.left = false; }}
              className="py-3 rounded-lg bg-[#212121] border border-[#333] flex items-center justify-center active:bg-[#3ea6ff]/20">
              <ChevronLeft size={20} className="text-[#888]" />
            </button>
            <button
              onTouchStart={() => { if (gsRef.current) gsRef.current.touchControls.down = true; }}
              onTouchEnd={() => { if (gsRef.current) gsRef.current.touchControls.down = false; }}
              className="py-3 rounded-lg bg-[#212121] border border-[#333] flex items-center justify-center active:bg-[#3ea6ff]/20">
              <ChevronDown size={20} className="text-[#888]" />
            </button>
            <button
              onTouchStart={() => { if (gsRef.current) gsRef.current.touchControls.right = true; }}
              onTouchEnd={() => { if (gsRef.current) gsRef.current.touchControls.right = false; }}
              className="py-3 rounded-lg bg-[#212121] border border-[#333] flex items-center justify-center active:bg-[#3ea6ff]/20">
              <ChevronRight size={20} className="text-[#888]" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <button
              onTouchStart={() => { if (gsRef.current) gsRef.current.touchControls.up = true; }}
              onTouchEnd={() => { if (gsRef.current) gsRef.current.touchControls.up = false; }}
              className="flex-1 rounded-lg bg-[#2ba640]/20 border border-[#2ba640]/40 flex items-center justify-center active:bg-[#2ba640]/40">
              <span className="text-[#2ba640] font-bold text-sm">加速</span>
            </button>
            <button
              onTouchStart={() => { if (gsRef.current) gsRef.current.touchControls.down = true; }}
              onTouchEnd={() => { if (gsRef.current) gsRef.current.touchControls.down = false; }}
              className="flex-1 rounded-lg bg-[#ff4444]/20 border border-[#ff4444]/40 flex items-center justify-center active:bg-[#ff4444]/40">
              <span className="text-[#ff4444] font-bold text-sm">刹车</span>
            </button>
          </div>
        </div>

        <div className="mt-2 text-[10px] text-[#666] text-center">
          方向键/WASD 控制 | 上/W 加速 | 下/S 刹车 | 左右转向
        </div>
      </main>
    </>
  );
}
