"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import {
  ChevronLeft, RotateCcw, Swords, Volume2, VolumeX,
  Shield, Target, Map, Play, Trophy, SkipForward
} from "lucide-react";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "tactics";
const COLS = 8, ROWS = 8, CELL = 52;
const W = COLS * CELL, H = ROWS * CELL + 80;
const PRIMARY = "#3ea6ff", BG = "#0f0f0f";
const COLORS = {
  plains: "#1a2a1a", forest: "#0d3b0d", mountain: "#3a3a3a", water: "#0a1a3a",
  plainsLight: "#223322", forestLight: "#1a4a1a", mountainLight: "#4a4a4a", waterLight: "#1a2a4a",
};

// ─── Types ───────────────────────────────────────────────────────────────────
type UnitType = "infantry" | "cavalry" | "archer" | "mage";
type Team = "player" | "enemy";
type Terrain = "plains" | "forest" | "mountain" | "water";
type Difficulty = "easy" | "normal" | "hard";
type Screen = "title" | "playing" | "victory" | "defeat";

interface Unit {
  id: number;
  type: UnitType;
  team: Team;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  moveRange: number;
  atkRange: number;
  moved: boolean;
  attacked: boolean;
}

interface MapData {
  name: string;
  terrain: Terrain[][];
  playerSpawns: [number, number][];
  enemySpawns: [number, number][];
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface DamagePopup {
  x: number; y: number; value: number; life: number; color: string;
}

interface GameState {
  units: Unit[];
  turn: "player" | "enemy";
  selectedId: number;
  moveTargets: Set<string>;
  atkTargets: Set<string>;
  mapIndex: number;
  difficulty: Difficulty;
  level: number;
  score: number;
  turnCount: number;
  unitsKilled: number;
  unitsLost: number;
}

// ─── Unit Stats ──────────────────────────────────────────────────────────────
const UNIT_DEFS: Record<UnitType, {
  hp: number; atk: number; def: number; moveRange: number; atkRange: number;
  label: string; color: string; enemyColor: string;
}> = {
  infantry: { hp: 12, atk: 4, def: 3, moveRange: 3, atkRange: 1, label: "Infantry", color: "#3ea6ff", enemyColor: "#ff4757" },
  cavalry:  { hp: 10, atk: 5, def: 2, moveRange: 5, atkRange: 1, label: "Cavalry",  color: "#ff9f43", enemyColor: "#e84393" },
  archer:   { hp: 7,  atk: 5, def: 1, moveRange: 2, atkRange: 3, label: "Archer",   color: "#2ed573", enemyColor: "#fd79a8" },
  mage:     { hp: 6,  atk: 7, def: 1, moveRange: 2, atkRange: 2, label: "Mage",     color: "#a55eea", enemyColor: "#e17055" },
};

// Bonus damage matrix: attacker -> defender bonus
const BONUS: Partial<Record<UnitType, Partial<Record<UnitType, number>>>> = {
  infantry: { mage: 2 },
  cavalry:  { infantry: 3, archer: 2 },
  archer:   { cavalry: 2, mage: 2 },
  mage:     { infantry: 2 },
};

// Terrain defense bonus
const TERRAIN_DEF: Record<Terrain, number> = { plains: 0, forest: 2, mountain: 3, water: -1 };
const TERRAIN_PASSABLE: Record<Terrain, boolean> = { plains: true, forest: true, mountain: true, water: false };

// ─── Maps ────────────────────────────────────────────────────────────────────
function makeMap(name: string, layout: string[], pSpawns: [number, number][], eSpawns: [number, number][]): MapData {
  const terrain: Terrain[][] = [];
  const charMap: Record<string, Terrain> = { ".": "plains", "F": "forest", "M": "mountain", "W": "water" };
  for (let r = 0; r < ROWS; r++) {
    terrain[r] = [];
    for (let c = 0; c < COLS; c++) {
      terrain[r][c] = charMap[layout[r]?.[c] || "."] || "plains";
    }
  }
  return { name, terrain, playerSpawns: pSpawns, enemySpawns: eSpawns };
}

const MAPS: MapData[] = [
  makeMap("Green Valley", [
    "..F.....",
    ".F.F....",
    "........",
    "...WW...",
    "...WW...",
    "........",
    "....F.F.",
    "..F.....",
  ], [[0,6],[1,7],[2,6],[3,7]], [[4,0],[5,1],[6,0],[7,1],[5,0],[6,1]]),
  makeMap("Mountain Pass", [
    "..MM....",
    "..M.....",
    "........",
    ".MMM.MM.",
    ".M...MM.",
    "........",
    ".....M..",
    "....MM..",
  ], [[0,6],[1,7],[2,7],[1,6]], [[5,0],[6,0],[7,1],[6,1],[4,0],[7,0]]),
  makeMap("River Crossing", [
    "........",
    "..F..F..",
    "WWWW.WWW",
    "........",
    "........",
    "WWW.WWWW",
    "..F..F..",
    "........",
  ], [[0,7],[1,7],[2,7],[3,7]], [[4,0],[5,0],[6,0],[7,0],[3,0],[4,1]]),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
let nextUnitId = 1;
function createUnit(type: UnitType, team: Team, x: number, y: number): Unit {
  const d = UNIT_DEFS[type];
  return {
    id: nextUnitId++, type, team, x, y,
    hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def,
    moveRange: d.moveRange, atkRange: d.atkRange,
    moved: false, attacked: false,
  };
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function key(x: number, y: number) { return `${x},${y}`; }

function getReachable(unit: Unit, units: Unit[], map: MapData): Set<string> {
  const result = new Set<string>();
  const visited: Record<string, number> = {};
  const queue: [number, number, number][] = [[unit.x, unit.y, 0]];
  visited[key(unit.x, unit.y)] = 0;
  while (queue.length > 0) {
    const [cx, cy, cost] = queue.shift()!;
    if (cost > 0) {
      const occupied = units.some(u => u.hp > 0 && u.x === cx && u.y === cy);
      if (!occupied) result.add(key(cx, cy));
    }
    if (cost >= unit.moveRange) continue;
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const t = map.terrain[ny][nx];
      if (!TERRAIN_PASSABLE[t]) continue;
      const moveCost = t === "mountain" ? 2 : 1;
      const newCost = cost + moveCost;
      if (newCost > unit.moveRange) continue;
      const k = key(nx, ny);
      if (!(k in visited) || visited[k] > newCost) {
        visited[k] = newCost;
        queue.push([nx, ny, newCost]);
      }
    }
  }
  return result;
}

function getAttackTargets(unit: Unit, units: Unit[]): Set<string> {
  const result = new Set<string>();
  for (const u of units) {
    if (u.hp <= 0 || u.team === unit.team) continue;
    const d = manhattan(unit, u);
    const minRange = unit.type === "archer" ? 2 : 1;
    if (d >= minRange && d <= unit.atkRange) result.add(key(u.x, u.y));
  }
  return result;
}

function calcDamage(attacker: Unit, defender: Unit, terrain: Terrain): number {
  const bonus = BONUS[attacker.type]?.[defender.type] || 0;
  const terrainDef = TERRAIN_DEF[terrain];
  const dmg = Math.max(1, attacker.atk + bonus - defender.def - terrainDef);
  return dmg;
}

function getEnemyUnitsForDifficulty(diff: Difficulty, mapData: MapData, level: number): Unit[] {
  const types: UnitType[] = ["infantry", "cavalry", "archer", "mage"];
  const spawns = mapData.enemySpawns;
  let count: number;
  if (diff === "easy") count = Math.min(3 + Math.floor(level / 2), spawns.length);
  else if (diff === "normal") count = Math.min(4 + Math.floor(level / 2), spawns.length);
  else count = Math.min(spawns.length, 4 + level);
  const enemies: Unit[] = [];
  for (let i = 0; i < count; i++) {
    const [sx, sy] = spawns[i % spawns.length];
    const t = types[i % types.length];
    const u = createUnit(t, "enemy", sx, sy);
    if (diff === "hard" && level > 1) { u.hp += level; u.maxHp += level; u.atk += Math.floor(level / 2); }
    enemies.push(u);
  }
  return enemies;
}

// ─── Sound Engine ────────────────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  muted = false;
  private init() { if (!this.ctx) this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); }
  private tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.15) {
    if (this.muted) return;
    this.init();
    const c = this.ctx!;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(); osc.stop(c.currentTime + dur);
  }
  move() { this.tone(300, 0.1, "sine", 0.1); setTimeout(() => this.tone(400, 0.1, "sine", 0.1), 60); }
  attack() { this.tone(200, 0.15, "sawtooth", 0.12); setTimeout(() => this.tone(150, 0.2, "sawtooth", 0.1), 80); }
  death() { this.tone(400, 0.1, "square", 0.1); setTimeout(() => this.tone(300, 0.15, "square", 0.08), 100); setTimeout(() => this.tone(200, 0.3, "square", 0.06), 200); }
  victory() { [523,659,784,1047].forEach((f,i) => setTimeout(() => this.tone(f, 0.3, "sine", 0.12), i * 150)); }
  defeat() { [400,350,300,200].forEach((f,i) => setTimeout(() => this.tone(f, 0.4, "sawtooth", 0.08), i * 200)); }
  select() { this.tone(500, 0.08, "sine", 0.08); }
}

// ─── PixiJS color helper ─────────────────────────────────────────────────────
function colorToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

// ─── PixiJS draw function ────────────────────────────────────────────────────
function drawGamePixi(
  gfx: PixiGraphics,
  texts: Map<string, PixiText>,
  g: GameState,
  particles: Particle[],
  popups: DamagePopup[],
  animTime: number,
  cursorX: number,
  cursorY: number,
  screenState: Screen,
  dt: number,
) {
  gfx.clear();
  texts.forEach(t => { t.visible = false; });

  let textIdx = 0;
  const showText = (text: string, x: number, y: number, ax = 0, ay = 0, opts?: { fill?: string; fontSize?: number }) => {
    const k = `pool_${textIdx++}`;
    const t = texts.get(k);
    if (!t) return;
    t.text = text; t.x = x; t.y = y; t.anchor.set(ax, ay); t.alpha = 1; t.visible = true;
    if (opts?.fill) t.style.fill = opts.fill;
  };

  const map = MAPS[g.mapIndex];

  // Background
  gfx.rect(0, 0, W, H).fill({ color: colorToNum(BG) });

  // Draw terrain
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = map.terrain[r][c];
      const isLight = (r + c) % 2 === 0;
      const tColor = isLight ? COLORS[`${t}Light` as keyof typeof COLORS] || COLORS[t] : COLORS[t];
      gfx.rect(c * CELL, r * CELL, CELL, CELL).fill({ color: colorToNum(tColor) });

      // Terrain decorations
      if (t === "forest") {
        gfx.circle(c * CELL + CELL * 0.3, r * CELL + CELL * 0.6, 6).fill({ color: 0x0a5a0a });
        gfx.circle(c * CELL + CELL * 0.7, r * CELL + CELL * 0.5, 7).fill({ color: 0x0a5a0a });
      } else if (t === "mountain") {
        gfx.moveTo(c * CELL + CELL * 0.5, r * CELL + CELL * 0.2)
          .lineTo(c * CELL + CELL * 0.2, r * CELL + CELL * 0.8)
          .lineTo(c * CELL + CELL * 0.8, r * CELL + CELL * 0.8)
          .closePath().fill({ color: 0x5a5a5a });
      } else if (t === "water") {
        const wave = Math.sin(animTime * 2 + c + r) * 2;
        gfx.moveTo(c * CELL + 5, r * CELL + CELL * 0.5 + wave)
          .quadraticCurveTo(c * CELL + CELL * 0.5, r * CELL + CELL * 0.3 + wave, c * CELL + CELL - 5, r * CELL + CELL * 0.5 + wave)
          .stroke({ color: 0x1a3a6a, width: 1 });
      }

      // Grid lines
      gfx.rect(c * CELL, r * CELL, CELL, CELL).stroke({ color: 0xffffff, width: 1, alpha: 0.05 });
    }
  }

  // Draw move range highlights
  for (const k of Array.from(g.moveTargets)) {
    const [mx, my] = k.split(",").map(Number);
    gfx.rect(mx * CELL + 1, my * CELL + 1, CELL - 2, CELL - 2).fill({ color: 0x3ea6ff, alpha: 0.2 });
    gfx.rect(mx * CELL + 1, my * CELL + 1, CELL - 2, CELL - 2).stroke({ color: 0x3ea6ff, width: 1, alpha: 0.5 });
  }

  // Draw attack range highlights
  for (const k of Array.from(g.atkTargets)) {
    const [ax, ay] = k.split(",").map(Number);
    gfx.rect(ax * CELL + 1, ay * CELL + 1, CELL - 2, CELL - 2).fill({ color: 0xff4757, alpha: 0.25 });
    gfx.rect(ax * CELL + 1, ay * CELL + 1, CELL - 2, CELL - 2).stroke({ color: 0xff4757, width: 1.5, alpha: 0.6 });
  }

  // Draw keyboard cursor
  if (screenState === "playing") {
    gfx.rect(cursorX * CELL + 2, cursorY * CELL + 2, CELL - 4, CELL - 4)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.4 });
  }

  // Draw units
  const labels: Record<UnitType, string> = { infantry: "I", cavalry: "C", archer: "A", mage: "M" };
  for (const u of g.units) {
    if (u.hp <= 0) continue;
    const def = UNIT_DEFS[u.type];
    const ux = u.x * CELL + CELL / 2;
    const uy = u.y * CELL + CELL / 2;
    const baseColor = u.team === "player" ? def.color : def.enemyColor;
    const isSelected = u.id === g.selectedId;
    const isDimmed = u.team === "player" && u.moved && u.attacked;
    const alpha = isDimmed ? 0.5 : 1;

    // Unit body
    gfx.circle(ux, uy, CELL / 2 - 5).fill({ color: colorToNum(baseColor), alpha });

    // Selection ring
    if (isSelected) {
      const pulse = 1 + Math.sin(animTime * 4) * 0.08;
      gfx.circle(ux, uy, (CELL / 2 - 3) * pulse).stroke({ color: 0xffffff, width: 2.5, alpha });
    }

    // Team indicator ring
    const teamColor = u.team === "player" ? 0x3ea6ff : 0xff4757;
    gfx.circle(ux, uy, CELL / 2 - 5).stroke({ color: teamColor, width: 1.5, alpha: 0.6 * alpha });

    // Unit type letter
    showText(labels[u.type], ux, uy, 0.5, 0.5);

    // HP bar
    const barW = CELL - 12, barH = 4;
    const barX = u.x * CELL + 6, barY = u.y * CELL + CELL - 8;
    gfx.rect(barX, barY, barW, barH).fill({ color: 0x000000, alpha: 0.6 });
    const hpRatio = u.hp / u.maxHp;
    const hpColor = hpRatio > 0.6 ? 0x2ed573 : hpRatio > 0.3 ? 0xffa502 : 0xff4757;
    gfx.rect(barX, barY, barW * hpRatio, barH).fill({ color: hpColor });
  }

  // Draw particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.1;
    p.life -= dt / p.maxLife;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    gfx.circle(p.x, p.y, p.size * p.life).fill({ color: colorToNum(p.color), alpha: p.life });
  }

  // Draw damage popups
  for (let i = popups.length - 1; i >= 0; i--) {
    const pop = popups[i];
    pop.y -= 1;
    pop.life -= dt * 1.5;
    if (pop.life <= 0) { popups.splice(i, 1); continue; }
    showText(`-${pop.value}`, pop.x, pop.y, 0.5, 0.5, { fill: pop.color });
  }

  // HUD bar at bottom
  const hudY = ROWS * CELL;
  gfx.rect(0, hudY, W, 80).fill({ color: 0x0f0f0f, alpha: 0.95 });
  gfx.moveTo(0, hudY).lineTo(W, hudY).stroke({ color: 0x3ea6ff, width: 1, alpha: 0.3 });

  showText(`Wave ${g.level}/3`, 10, hudY + 12, 0, 0);
  showText(`Score: ${g.score}`, 10, hudY + 28, 0, 0, { fill: "#aaaaaa" });
  showText(`Turn: ${g.turnCount}`, 10, hudY + 44, 0, 0, { fill: "#aaaaaa" });

  // Turn indicator
  const turnColor = g.turn === "player" ? PRIMARY : "#ff4757";
  showText(g.turn === "player" ? "Your Turn" : "Enemy Turn", W - 10, hudY + 12, 1, 0, { fill: turnColor });

  // Selected unit info
  const sel = g.units.find(u => u.id === g.selectedId);
  if (sel) {
    showText(`${UNIT_DEFS[sel.type].label} HP:${sel.hp}/${sel.maxHp} ATK:${sel.atk} DEF:${sel.def}`, W - 10, hudY + 28, 1, 0, { fill: "#cccccc" });
    showText(`Move:${sel.moveRange} Range:${sel.atkRange}`, W - 10, hudY + 44, 1, 0, { fill: "#cccccc" });
  }

  // Controls hint
  showText("WASD/Arrows: Move cursor | Enter: Select | E: End turn | Esc: Deselect", W / 2, hudY + 66, 0.5, 0.5, { fill: "#555555" });
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TacticsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef(new SoundEngine());
  const particlesRef = useRef<Particle[]>([]);
  const popupsRef = useRef<DamagePopup[]>([]);
  const animTimeRef = useRef(0);

  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());

  const [screen, setScreen] = useState<Screen>("title");
  const [muted, setMuted] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [selectedMap, setSelectedMap] = useState(0);

  const gameRef = useRef<GameState>({
    units: [], turn: "player", selectedId: -1,
    moveTargets: new Set(), atkTargets: new Set(),
    mapIndex: 0, difficulty: "normal", level: 1,
    score: 0, turnCount: 0, unitsKilled: 0, unitsLost: 0,
  });

  const [, forceUpdate] = useState(0);
  const rerender = useCallback(() => forceUpdate(n => n + 1), []);

  // Keyboard cursor
  const cursorRef = useRef({ x: 0, y: 4 });

  // ─── Spawn particles ────────────────────────────────────────────────────────
  const spawnParticles = useCallback((px: number, py: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particlesRef.current.push({
        x: px, y: py,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, maxLife: 0.4 + Math.random() * 0.4,
        color, size: 2 + Math.random() * 3,
      });
    }
  }, []);

  const spawnDamagePopup = useCallback((px: number, py: number, value: number, color: string) => {
    popupsRef.current.push({ x: px, y: py, value, life: 1, color });
  }, []);

  // ─── Start Game ─────────────────────────────────────────────────────────────
  const startGame = useCallback((mapIdx: number, diff: Difficulty) => {
    nextUnitId = 1;
    const map = MAPS[mapIdx];
    const types: UnitType[] = ["infantry", "cavalry", "archer", "mage"];
    const playerUnits = map.playerSpawns.slice(0, 4).map(([sx, sy], i) =>
      createUnit(types[i], "player", sx, sy)
    );
    const enemyUnits = getEnemyUnitsForDifficulty(diff, map, 1);
    gameRef.current = {
      units: [...playerUnits, ...enemyUnits],
      turn: "player", selectedId: -1,
      moveTargets: new Set(), atkTargets: new Set(),
      mapIndex: mapIdx, difficulty: diff, level: 1,
      score: 0, turnCount: 1, unitsKilled: 0, unitsLost: 0,
    };
    particlesRef.current = [];
    popupsRef.current = [];
    setScreen("playing");
    rerender();
  }, [rerender]);

  // ─── Select Unit ────────────────────────────────────────────────────────────
  const selectUnit = useCallback((unitId: number) => {
    const g = gameRef.current;
    const map = MAPS[g.mapIndex];
    const unit = g.units.find(u => u.id === unitId);
    if (!unit || unit.team !== "player" || unit.hp <= 0) return;
    soundRef.current.select();
    g.selectedId = unitId;
    g.moveTargets = unit.moved ? new Set() : getReachable(unit, g.units, map);
    g.atkTargets = unit.attacked ? new Set() : getAttackTargets(unit, g.units);
    rerender();
  }, [rerender]);

  // ─── Move Unit ──────────────────────────────────────────────────────────────
  const moveUnit = useCallback((tx: number, ty: number) => {
    const g = gameRef.current;
    const unit = g.units.find(u => u.id === g.selectedId);
    if (!unit) return;
    soundRef.current.move();
    const cx = unit.x * CELL + CELL / 2, cy = unit.y * CELL + CELL / 2;
    spawnParticles(cx, cy, "#3ea6ff44", 5);
    unit.x = tx; unit.y = ty; unit.moved = true;
    // Recalculate attack targets from new position
    g.atkTargets = unit.attacked ? new Set() : getAttackTargets(unit, g.units);
    g.moveTargets = new Set();
    if (g.atkTargets.size === 0) {
      unit.attacked = true;
      g.selectedId = -1; g.atkTargets = new Set();
    }
    rerender();
  }, [rerender, spawnParticles]);

  // ─── Attack Unit ────────────────────────────────────────────────────────────
  const attackUnit = useCallback((tx: number, ty: number) => {
    const g = gameRef.current;
    const map = MAPS[g.mapIndex];
    const attacker = g.units.find(u => u.id === g.selectedId);
    const defender = g.units.find(u => u.hp > 0 && u.x === tx && u.y === ty && u.team !== attacker?.team);
    if (!attacker || !defender) return;

    const terrain = map.terrain[ty][tx];
    const dmg = calcDamage(attacker, defender, terrain);
    defender.hp -= dmg;
    attacker.attacked = true;
    attacker.moved = true;

    soundRef.current.attack();
    const px = tx * CELL + CELL / 2, py = ty * CELL + CELL / 2;
    spawnParticles(px, py, "#ff4757", 12);
    spawnDamagePopup(px, py - 10, dmg, "#ff4757");

    g.score += dmg * 10;

    if (defender.hp <= 0) {
      soundRef.current.death();
      spawnParticles(px, py, "#ffaa00", 20);
      g.unitsKilled++;
      g.score += 50;
    }

    g.selectedId = -1; g.moveTargets = new Set(); g.atkTargets = new Set();
    rerender();

    // Check win/lose
    setTimeout(() => checkEndConditions(), 100);
  }, [rerender, spawnParticles, spawnDamagePopup]);

  // ─── End Turn ───────────────────────────────────────────────────────────────
  const endPlayerTurn = useCallback(() => {
    const g = gameRef.current;
    g.selectedId = -1; g.moveTargets = new Set(); g.atkTargets = new Set();
    g.turn = "enemy";
    rerender();
    setTimeout(() => runEnemyTurn(), 400);
  }, [rerender]);

  // ─── Check End Conditions ───────────────────────────────────────────────────
  const checkEndConditions = useCallback(() => {
    const g = gameRef.current;
    const alive = g.units.filter(u => u.hp > 0);
    const playerAlive = alive.filter(u => u.team === "player");
    const enemyAlive = alive.filter(u => u.team === "enemy");

    if (playerAlive.length === 0) {
      soundRef.current.defeat();
      setScreen("defeat");
      return true;
    }
    if (enemyAlive.length === 0) {
      // Next wave or victory
      const nextLevel = g.level + 1;
      if (nextLevel > 3) {
        soundRef.current.victory();
        setScreen("victory");
        return true;
      }
      // Advance to next level
      g.level = nextLevel;
      g.turnCount++;
      g.score += 200;
      // Heal player units
      playerAlive.forEach(u => {
        u.hp = Math.min(u.hp + 3, u.maxHp);
        u.moved = false; u.attacked = false;
      });
      // Next map
      const nextMapIdx = (g.mapIndex + 1) % MAPS.length;
      g.mapIndex = nextMapIdx;
      const map = MAPS[nextMapIdx];
      // Reposition player units
      playerAlive.forEach((u, i) => {
        const [sx, sy] = map.playerSpawns[i % map.playerSpawns.length];
        u.x = sx; u.y = sy;
      });
      // Spawn new enemies
      const newEnemies = getEnemyUnitsForDifficulty(g.difficulty, map, nextLevel);
      g.units = [...playerAlive, ...newEnemies];
      g.turn = "player";
      rerender();
      return true;
    }
    return false;
  }, [rerender]);

  // ─── Enemy AI ───────────────────────────────────────────────────────────────
  const runEnemyTurn = useCallback(() => {
    const g = gameRef.current;
    const map = MAPS[g.mapIndex];
    const enemies = g.units.filter(u => u.team === "enemy" && u.hp > 0);
    const players = g.units.filter(u => u.team === "player" && u.hp > 0);

    if (players.length === 0 || enemies.length === 0) {
      g.turn = "player";
      g.units.filter(u => u.team === "player" && u.hp > 0).forEach(u => { u.moved = false; u.attacked = false; });
      g.turnCount++;
      rerender();
      return;
    }

    let delay = 0;
    const isHard = g.difficulty === "hard";

    for (const enemy of enemies) {
      delay += 300;
      setTimeout(() => {
        if (screen !== "playing") return;
        const alivePlayers = g.units.filter(u => u.team === "player" && u.hp > 0);
        if (alivePlayers.length === 0) return;

        // Pick target: hard AI targets weakest, others target nearest
        let target: Unit;
        if (isHard) {
          target = alivePlayers.reduce((a, b) => a.hp < b.hp ? a : b);
        } else {
          target = alivePlayers.reduce((a, b) => manhattan(enemy, a) < manhattan(enemy, b) ? a : b);
        }

        // Try to attack first if in range
        const d = manhattan(enemy, target);
        const minRange = enemy.type === "archer" ? 2 : 1;
        if (d >= minRange && d <= enemy.atkRange) {
          const terrain = map.terrain[target.y][target.x];
          const dmg = calcDamage(enemy, target, terrain);
          target.hp -= dmg;
          soundRef.current.attack();
          const px = target.x * CELL + CELL / 2, py = target.y * CELL + CELL / 2;
          spawnParticles(px, py, "#ff4757", 10);
          spawnDamagePopup(px, py - 10, dmg, "#ff6b6b");
          if (target.hp <= 0) {
            soundRef.current.death();
            spawnParticles(px, py, "#ffaa00", 15);
            g.unitsLost++;
          }
        } else {
          // Move toward target
          const reachable = getReachable(enemy, g.units, map);
          let bestPos = { x: enemy.x, y: enemy.y };
          let bestDist = manhattan(enemy, target);
          for (const k of Array.from(reachable)) {
            const [nx, ny] = k.split(",").map(Number);
            const nd = manhattan({ x: nx, y: ny }, target);
            if (nd < bestDist) { bestDist = nd; bestPos = { x: nx, y: ny }; }
          }
          if (bestPos.x !== enemy.x || bestPos.y !== enemy.y) {
            enemy.x = bestPos.x; enemy.y = bestPos.y;
          }
          // Try attack after moving
          const newD = manhattan(enemy, target);
          if (newD >= minRange && newD <= enemy.atkRange && target.hp > 0) {
            const terrain = map.terrain[target.y][target.x];
            const dmg = calcDamage(enemy, target, terrain);
            target.hp -= dmg;
            soundRef.current.attack();
            const px = target.x * CELL + CELL / 2, py = target.y * CELL + CELL / 2;
            spawnParticles(px, py, "#ff4757", 10);
            spawnDamagePopup(px, py - 10, dmg, "#ff6b6b");
            if (target.hp <= 0) {
              soundRef.current.death();
              spawnParticles(px, py, "#ffaa00", 15);
              g.unitsLost++;
            }
          }
        }
        rerender();
      }, delay);
    }

    // After all enemies act
    setTimeout(() => {
      if (screen !== "playing") return;
      // Remove dead
      g.units = g.units.filter(u => u.hp > 0);
      if (checkEndConditions()) return;
      g.turn = "player";
      g.units.filter(u => u.team === "player" && u.hp > 0).forEach(u => { u.moved = false; u.attacked = false; });
      g.turnCount++;
      g.selectedId = -1; g.moveTargets = new Set(); g.atkTargets = new Set();
      rerender();
    }, delay + 400);
  }, [screen, rerender, spawnParticles, spawnDamagePopup, checkEndConditions]);

  // ─── Handle Grid Click ─────────────────────────────────────────────────────
  const handleGridClick = useCallback((gx: number, gy: number) => {
    const g = gameRef.current;
    if (g.turn !== "player" || screen !== "playing") return;
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return;

    const k = key(gx, gy);

    // If we have a selected unit
    if (g.selectedId >= 0) {
      const sel = g.units.find(u => u.id === g.selectedId);
      if (!sel) return;

      // Attack target?
      if (g.atkTargets.has(k)) {
        attackUnit(gx, gy);
        return;
      }
      // Move target?
      if (g.moveTargets.has(k)) {
        moveUnit(gx, gy);
        return;
      }
      // Click on another player unit?
      const clickedUnit = g.units.find(u => u.hp > 0 && u.x === gx && u.y === gy && u.team === "player");
      if (clickedUnit && clickedUnit.id !== g.selectedId) {
        selectUnit(clickedUnit.id);
        return;
      }
      // Deselect
      g.selectedId = -1; g.moveTargets = new Set(); g.atkTargets = new Set();
      rerender();
      return;
    }

    // No selection — try to select a player unit
    const clickedUnit = g.units.find(u => u.hp > 0 && u.x === gx && u.y === gy && u.team === "player");
    if (clickedUnit && (!clickedUnit.moved || !clickedUnit.attacked)) {
      selectUnit(clickedUnit.id);
    }
  }, [screen, selectUnit, moveUnit, attackUnit, rerender]);

  // ─── Canvas Click Handler ───────────────────────────────────────────────────
  const handleCanvasClick = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * (W / rect.width);
    const my = (clientY - rect.top) * (H / rect.height);
    const gx = Math.floor(mx / CELL);
    const gy = Math.floor(my / CELL);
    handleGridClick(gx, gy);
  }, [handleGridClick]);

  // ─── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      const c = cursorRef.current;
      switch (e.key) {
        case "ArrowUp": case "w": c.y = Math.max(0, c.y - 1); e.preventDefault(); break;
        case "ArrowDown": case "s": c.y = Math.min(ROWS - 1, c.y + 1); e.preventDefault(); break;
        case "ArrowLeft": case "a": c.x = Math.max(0, c.x - 1); e.preventDefault(); break;
        case "ArrowRight": case "d": c.x = Math.min(COLS - 1, c.x + 1); e.preventDefault(); break;
        case "Enter": case " ": handleGridClick(c.x, c.y); e.preventDefault(); break;
        case "Escape":
          gameRef.current.selectedId = -1;
          gameRef.current.moveTargets = new Set();
          gameRef.current.atkTargets = new Set();
          rerender();
          e.preventDefault();
          break;
        case "e":
          endPlayerTurn();
          e.preventDefault();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, handleGridClick, endPlayerTurn, rerender]);

  // ─── PixiJS Rendering ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || screen !== "playing") return;
    let destroyed = false;
    let lastTime = 0;

    async function initAndRun() {
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: colorToNum(BG) });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      // Pre-create text pool (70 texts: ~10 units labels + ~10 damage popups + ~10 HUD + buffer)
      const TEXT_POOL_SIZE = 70;
      for (let i = 0; i < TEXT_POOL_SIZE; i++) {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: 13,
          fill: "#ffffff",
          fontWeight: "bold",
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(`pool_${i}`, t);
      }

      app.ticker.add(() => {
        if (destroyed) return;
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        animTimeRef.current = now / 1000;

        drawGamePixi(
          gfx, texts, gameRef.current,
          particlesRef.current, popupsRef.current,
          animTimeRef.current,
          cursorRef.current.x, cursorRef.current.y,
          screen, dt,
        );
      });
      lastTime = performance.now();
    }

    initAndRun();

    return () => {
      destroyed = true;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
        pixiGfxRef.current = null;
        pixiTextsRef.current.clear();
      }
    };
  }, [screen]);

  // ─── Canvas event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || screen !== "playing") return;
    const onClick = (e: MouseEvent) => handleCanvasClick(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      handleCanvasClick(t.clientX, t.clientY);
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchend", onTouch);
    };
  }, [screen, handleCanvasClick]);

  // ─── Save / Load ────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const g = gameRef.current;
    return {
      units: g.units, mapIndex: g.mapIndex, difficulty: g.difficulty,
      level: g.level, score: g.score, turnCount: g.turnCount,
      unitsKilled: g.unitsKilled, unitsLost: g.unitsLost,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as {
      units: Unit[]; mapIndex: number; difficulty: Difficulty;
      level: number; score: number; turnCount: number;
      unitsKilled: number; unitsLost: number;
    };
    gameRef.current = {
      units: d.units, turn: "player", selectedId: -1,
      moveTargets: new Set(), atkTargets: new Set(),
      mapIndex: d.mapIndex, difficulty: d.difficulty, level: d.level,
      score: d.score, turnCount: d.turnCount,
      unitsKilled: d.unitsKilled, unitsLost: d.unitsLost,
    };
    // Reset moved/attacked
    gameRef.current.units.filter(u => u.team === "player" && u.hp > 0).forEach(u => { u.moved = false; u.attacked = false; });
    setScreen("playing");
    rerender();
  }, [rerender]);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      soundRef.current.muted = !m;
      return !m;
    });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────
  const g = gameRef.current;
  const playerUnitsAlive = g.units.filter(u => u.team === "player" && u.hp > 0);
  const allPlayerDone = playerUnitsAlive.every(u => u.moved && u.attacked);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white pb-20">
        <div className="max-w-lg mx-auto px-4 py-4">
          <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-3 transition">
            <ChevronLeft className="w-4 h-4" /> Back to Games
          </Link>

          <div className="flex items-center gap-2 mb-4">
            <Swords className="w-6 h-6 text-[#3ea6ff]" />
            <h1 className="text-xl font-bold">Turn-Based Tactics</h1>
          </div>

          {/* ─── Title Screen ─── */}
          {screen === "title" && (
            <div className="space-y-4">
              <div className="bg-[#1a1a2e] rounded-xl p-6 border border-white/10 text-center">
                <Swords className="w-16 h-16 text-[#3ea6ff] mx-auto mb-3" />
                <h2 className="text-2xl font-bold mb-2">Turn-Based Tactics</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Command your army across 3 battlefields. Use terrain, exploit unit weaknesses, and defeat the enemy forces.
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs text-left mb-4">
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full" style={{ background: UNIT_DEFS.infantry.color }} /><span>Infantry - Balanced, melee</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full" style={{ background: UNIT_DEFS.cavalry.color }} /><span>Cavalry - Fast, strong vs infantry</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full" style={{ background: UNIT_DEFS.archer.color }} /><span>Archer - Ranged, fragile</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full" style={{ background: UNIT_DEFS.mage.color }} /><span>Mage - Area damage, low HP</span></div>
                </div>
              </div>

              {/* Map Select */}
              <div className="bg-[#111] rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <Map className="w-4 h-4 text-[#3ea6ff]" />
                  <span className="text-sm font-semibold">Select Starting Map</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MAPS.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedMap(i)}
                      className={`p-2 rounded-lg text-xs border transition ${
                        selectedMap === i
                          ? "border-[#3ea6ff] bg-[#3ea6ff]/10 text-[#3ea6ff]"
                          : "border-white/10 text-gray-400 hover:border-white/20"
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="bg-[#111] rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-[#3ea6ff]" />
                  <span className="text-sm font-semibold">Difficulty</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`p-2 rounded-lg text-xs border transition capitalize ${
                        difficulty === d
                          ? "border-[#3ea6ff] bg-[#3ea6ff]/10 text-[#3ea6ff]"
                          : "border-white/10 text-gray-400 hover:border-white/20"
                      }`}
                    >
                      {d === "easy" ? "Easy" : d === "normal" ? "Normal" : "Hard"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => startGame(selectedMap, difficulty)}
                className="w-full py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-2 shadow-lg shadow-[#3ea6ff]/20"
              >
                <Play className="w-5 h-5" /> Start Battle
              </button>
            </div>
          )}

          {/* ─── Playing Screen ─── */}
          {screen === "playing" && (
            <>
              {/* Top bar */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <button onClick={toggleMute} className="p-1.5 rounded-lg border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition">
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <span className="text-xs text-gray-500">Wave {g.level}/3</span>
                  <span className="text-xs text-gray-500">|</span>
                  <span className="text-xs text-gray-500">{MAPS[g.mapIndex].name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {g.turn === "player" && (
                    <button
                      onClick={endPlayerTurn}
                      disabled={allPlayerDone}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-[#3ea6ff]/20 text-[#3ea6ff] border border-[#3ea6ff]/30 hover:bg-[#3ea6ff]/30 transition disabled:opacity-40"
                    >
                      <SkipForward className="w-3.5 h-3.5" /> End Turn
                    </button>
                  )}
                  <button
                    onClick={() => setScreen("title")}
                    className="p-1.5 rounded-lg border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Turn indicator */}
              <div className={`text-center text-xs font-semibold py-1 rounded-lg mb-2 ${
                g.turn === "player" ? "bg-[#3ea6ff]/10 text-[#3ea6ff]" : "bg-[#ff4757]/10 text-[#ff4757]"
              }`}>
                {g.turn === "player" ? "Your Turn" : "Enemy Turn..."}
              </div>

              {/* Canvas */}
              <div className="w-full touch-none select-none">
                <canvas ref={canvasRef} className="w-full rounded-xl border border-white/10" style={{ touchAction: "none" }} />
              </div>

              {/* Unit roster */}
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {g.units.filter(u => u.team === "player" && u.hp > 0).map(u => {
                  const def = UNIT_DEFS[u.type];
                  const isSelected = u.id === g.selectedId;
                  const isDone = u.moved && u.attacked;
                  return (
                    <button
                      key={u.id}
                      onClick={() => !isDone && selectUnit(u.id)}
                      className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs border transition ${
                        isSelected ? "border-[#3ea6ff] bg-[#3ea6ff]/10" :
                        isDone ? "border-[#333] opacity-40" :
                        "border-[#333] hover:border-[#555]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full" style={{ background: def.color }} />
                        <span className="text-gray-300">{def.label}</span>
                        <span className="text-gray-500">{u.hp}/{u.maxHp}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-center text-[10px] text-[#555] mt-2">
                Click unit to select, then click to move/attack. Press E to end turn.
              </p>
            </>
          )}

          {/* ─── Victory Screen ─── */}
          {screen === "victory" && (
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#3ea6ff]/30 text-center">
              <Trophy className="w-16 h-16 text-[#ffd700] mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-[#ffd700] mb-2">Victory!</h2>
              <p className="text-sm text-gray-400 mb-4">All enemy forces have been defeated.</p>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">Score</div>
                  <div className="text-[#3ea6ff] font-bold text-lg">{g.score}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">Turns</div>
                  <div className="text-white font-bold text-lg">{g.turnCount}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">Enemies Defeated</div>
                  <div className="text-[#2ed573] font-bold text-lg">{g.unitsKilled}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">Units Lost</div>
                  <div className="text-[#ff4757] font-bold text-lg">{g.unitsLost}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startGame(selectedMap, difficulty)}
                  className="flex-1 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Play Again
                </button>
                <button
                  onClick={() => setScreen("title")}
                  className="flex-1 py-2.5 rounded-xl border border-[#333] text-gray-300 font-semibold text-sm hover:border-[#555] transition"
                >
                  Title Screen
                </button>
              </div>
            </div>
          )}

          {/* ─── Defeat Screen ─── */}
          {screen === "defeat" && (
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#ff4757]/30 text-center">
              <Shield className="w-16 h-16 text-[#ff4757] mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-[#ff4757] mb-2">Defeat</h2>
              <p className="text-sm text-gray-400 mb-4">Your army has been wiped out.</p>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">Score</div>
                  <div className="text-[#3ea6ff] font-bold text-lg">{g.score}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">Waves Cleared</div>
                  <div className="text-white font-bold text-lg">{g.level - 1}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">Enemies Defeated</div>
                  <div className="text-[#2ed573] font-bold text-lg">{g.unitsKilled}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">Turns Survived</div>
                  <div className="text-white font-bold text-lg">{g.turnCount}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startGame(selectedMap, difficulty)}
                  className="flex-1 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Try Again
                </button>
                <button
                  onClick={() => setScreen("title")}
                  className="flex-1 py-2.5 rounded-xl border border-[#333] text-gray-300 font-semibold text-sm hover:border-[#555] transition"
                >
                  Title Screen
                </button>
              </div>
            </div>
          )}

          {/* Leaderboard & Save/Load */}
          <div className="mt-4 space-y-3">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </div>
      </main>
    </>
  );
}
