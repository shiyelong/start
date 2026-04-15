"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import {
  ChevronLeft, Shield, RotateCcw, Play, Volume2, VolumeX,
  ArrowUp, Crosshair, Snowflake, Skull, Zap, Trophy
} from "lucide-react";

/* ================================================================
   常量 & 类型
   ================================================================ */
const GAME_ID = "tower-defense";
const W = 480, H = 560;
const GRID = 40, COLS = 12, ROWS = 10;
const HUD_Y = ROWS * GRID;
const FPS_INTERVAL = 1000 / 60;

type Phase = "title" | "mapselect" | "playing" | "paused" | "victory" | "gameover";
type Difficulty = "easy" | "normal" | "hard";
type TowerType = "arrow" | "cannon" | "ice" | "poison" | "laser";
type EnemyType = "minion" | "fast" | "heavy" | "flying" | "boss";

interface TowerDef {
  name: string; cost: number; damage: number; range: number;
  rate: number; color: string; desc: string;
  upgradeCost: [number, number]; upgradeDmg: [number, number];
  splash?: number; slow?: number; dot?: number; pierce?: boolean;
}

interface Tower {
  type: TowerType; x: number; y: number; cooldown: number;
  level: number; kills: number;
}

interface EnemyDef {
  name: string; hp: number; speed: number; reward: number;
  color: string; radius: number; flying?: boolean;
}

interface Enemy {
  type: EnemyType; x: number; y: number; hp: number; maxHp: number;
  speed: number; baseSpeed: number; pathIdx: number; reward: number;
  color: string; radius: number; flying: boolean;
  slowTimer: number; dotTimer: number; dotDmg: number;
}

interface Bullet {
  x: number; y: number; tx: number; ty: number;
  speed: number; damage: number; color: string;
  splash: number; slow: number; dot: number; pierce: boolean;
  hit: boolean;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface WaveDef { enemies: { type: EnemyType; count: number }[]; delay: number; }

interface GameState {
  towers: Tower[]; enemies: Enemy[]; bullets: Bullet[]; particles: Particle[];
  gold: number; lives: number; wave: number; maxWave: number;
  score: number; spawnQueue: { type: EnemyType; delay: number }[];
  spawnTimer: number; waveDelay: number; waveActive: boolean;
  difficulty: Difficulty; mapIndex: number;
}

/* ================================================================
   塔定义
   ================================================================ */
const TOWER_DEFS: Record<TowerType, TowerDef> = {
  arrow: {
    name: "箭塔", cost: 15, damage: 8, range: 3.5, rate: 0.5,
    color: "#3ea6ff", desc: "快速单体攻击",
    upgradeCost: [25, 50], upgradeDmg: [14, 22],
  },
  cannon: {
    name: "炮塔", cost: 30, damage: 25, range: 2.5, rate: 1.8,
    color: "#ff6348", desc: "慢速范围伤害", splash: 50,
    upgradeCost: [45, 80], upgradeDmg: [40, 65],
  },
  ice: {
    name: "冰塔", cost: 20, damage: 4, range: 3, rate: 0.8,
    color: "#70a1ff", desc: "减速敌人", slow: 0.5,
    upgradeCost: [30, 55], upgradeDmg: [7, 12],
  },
  poison: {
    name: "毒塔", cost: 25, damage: 3, range: 3, rate: 1.0,
    color: "#7bed9f", desc: "持续毒伤害", dot: 5,
    upgradeCost: [35, 65], upgradeDmg: [5, 9],
  },
  laser: {
    name: "激光塔", cost: 40, damage: 15, range: 4, rate: 1.2,
    color: "#eccc68", desc: "穿透攻击", pierce: true,
    upgradeCost: [55, 90], upgradeDmg: [25, 40],
  },
};

const TOWER_TYPES: TowerType[] = ["arrow", "cannon", "ice", "poison", "laser"];

/* ================================================================
   敌人定义
   ================================================================ */
const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  minion: { name: "小兵", hp: 30, speed: 55, reward: 5, color: "#ff4757", radius: 8 },
  fast:   { name: "快速兵", hp: 18, speed: 100, reward: 7, color: "#ffa502", radius: 6 },
  heavy:  { name: "重甲兵", hp: 120, speed: 30, reward: 15, color: "#a4b0be", radius: 12 },
  flying: { name: "飞行兵", hp: 25, speed: 70, reward: 10, color: "#cf6a87", radius: 7, flying: true },
  boss:   { name: "Boss", hp: 500, speed: 25, reward: 80, color: "#8854d0", radius: 16 },
};

/* ================================================================
   难度乘数
   ================================================================ */
const DIFF_DEFS: Record<Difficulty, { name: string; hpMul: number; spdMul: number; goldMul: number; startGold: number; startLives: number }> = {
  easy:   { name: "简单", hpMul: 0.7, spdMul: 0.85, goldMul: 1.3, startGold: 120, startLives: 25 },
  normal: { name: "普通", hpMul: 1.0, spdMul: 1.0,  goldMul: 1.0, startGold: 80,  startLives: 20 },
  hard:   { name: "困难", hpMul: 1.5, spdMul: 1.2,  goldMul: 0.8, startGold: 60,  startLives: 15 },
};

/* ================================================================
   地图定义 (3张)
   ================================================================ */
type MapDef = { name: string; path: [number, number][]; };

const MAPS: MapDef[] = [
  {
    name: "草原小径",
    path: [[0,2],[1,2],[2,2],[3,2],[3,3],[3,4],[3,5],[4,5],[5,5],[6,5],[7,5],[7,4],[7,3],[7,2],[8,2],[9,2],[10,2],[10,3],[10,4],[10,5],[10,6],[10,7],[9,7],[8,7],[7,7],[6,7],[5,7],[4,7],[3,7],[2,7],[1,7],[0,7]],
  },
  {
    name: "蛇形峡谷",
    path: [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[11,2],[11,3],[10,3],[9,3],[8,3],[7,3],[6,3],[5,3],[4,3],[3,3],[2,3],[1,3],[0,3],[0,4],[0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],[11,6],[11,7],[11,8],[10,8],[9,8],[8,8],[7,8],[6,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]],
  },
  {
    name: "十字要塞",
    path: [[0,4],[1,4],[2,4],[2,3],[2,2],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[9,2],[9,3],[9,4],[9,5],[9,6],[9,7],[9,8],[8,8],[7,8],[6,8],[5,8],[5,7],[5,6],[5,5],[5,4],[5,3],[5,2],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[11,2],[11,3],[11,4],[11,5]],
  },
];

/* ================================================================
   波次定义 (12波)
   ================================================================ */
function generateWaves(): WaveDef[] {
  return [
    { enemies: [{ type: "minion", count: 6 }], delay: 0.5 },
    { enemies: [{ type: "minion", count: 8 }, { type: "fast", count: 3 }], delay: 0.45 },
    { enemies: [{ type: "minion", count: 6 }, { type: "fast", count: 5 }], delay: 0.4 },
    { enemies: [{ type: "heavy", count: 3 }, { type: "minion", count: 8 }], delay: 0.45 },
    { enemies: [{ type: "flying", count: 6 }, { type: "fast", count: 5 }], delay: 0.4 },
    { enemies: [{ type: "heavy", count: 5 }, { type: "flying", count: 4 }, { type: "minion", count: 6 }], delay: 0.35 },
    { enemies: [{ type: "boss", count: 1 }, { type: "minion", count: 10 }], delay: 0.5 },
    { enemies: [{ type: "fast", count: 12 }, { type: "flying", count: 6 }], delay: 0.3 },
    { enemies: [{ type: "heavy", count: 6 }, { type: "fast", count: 8 }, { type: "flying", count: 4 }], delay: 0.35 },
    { enemies: [{ type: "boss", count: 2 }, { type: "heavy", count: 4 }, { type: "minion", count: 8 }], delay: 0.4 },
    { enemies: [{ type: "fast", count: 15 }, { type: "flying", count: 8 }, { type: "heavy", count: 5 }], delay: 0.25 },
    { enemies: [{ type: "boss", count: 3 }, { type: "heavy", count: 6 }, { type: "fast", count: 10 }, { type: "flying", count: 6 }], delay: 0.3 },
  ];
}


/* ================================================================
   辅助函数
   ================================================================ */
function isOnPath(path: [number, number][], gx: number, gy: number): boolean {
  return path.some(([px, py]) => px === gx && py === gy);
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function towerDamage(def: TowerDef, level: number): number {
  if (level <= 1) return def.damage;
  return def.upgradeDmg[level - 2] ?? def.damage;
}

function towerUpgradeCost(def: TowerDef, level: number): number {
  if (level >= 3) return 0;
  return def.upgradeCost[level - 1] ?? 0;
}

function spawnEnemy(type: EnemyType, path: [number, number][], diff: Difficulty, waveNum: number): Enemy {
  const def = ENEMY_DEFS[type];
  const d = DIFF_DEFS[diff];
  const waveScale = 1 + (waveNum - 1) * 0.12;
  const hp = Math.round(def.hp * d.hpMul * waveScale);
  const speed = def.speed * d.spdMul;
  return {
    type, x: path[0][0] * GRID + GRID / 2, y: path[0][1] * GRID + GRID / 2,
    hp, maxHp: hp, speed, baseSpeed: speed, pathIdx: 0,
    reward: Math.round(def.reward * d.goldMul), color: def.color,
    radius: def.radius, flying: !!def.flying,
    slowTimer: 0, dotTimer: 0, dotDmg: 0,
  };
}

function createInitialState(diff: Difficulty, mapIndex: number): GameState {
  const d = DIFF_DEFS[diff];
  const waves = generateWaves();
  return {
    towers: [], enemies: [], bullets: [], particles: [],
    gold: d.startGold, lives: d.startLives, wave: 0, maxWave: waves.length,
    score: 0, spawnQueue: [], spawnTimer: 0, waveDelay: 2,
    waveActive: false, difficulty: diff, mapIndex,
  };
}

function addParticles(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 30 + Math.random() * 80;
    particles.push({
      x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
      life: 0.3 + Math.random() * 0.4, maxLife: 0.3 + Math.random() * 0.4,
      color, size: 2 + Math.random() * 3,
    });
  }
}

/* ================================================================
   主组件
   ================================================================ */
export default function TowerDefense() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [mapIndex, setMapIndex] = useState(0);
  const [selectedTower, setSelectedTower] = useState<TowerType>("arrow");
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [, setTick] = useState(0);

  const gsRef = useRef<GameState>(createInitialState("normal", 0));
  const wavesRef = useRef<WaveDef[]>(generateWaves());
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const soundRef = useRef<SoundEngine>(new SoundEngine(GAME_ID));

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
  const startGame = useCallback((diff: Difficulty, mi: number) => {
    setDifficulty(diff);
    setMapIndex(mi);
    gsRef.current = createInitialState(diff, mi);
    wavesRef.current = generateWaves();
    setSelectedCell(null);
    setPhase("playing");
    lastRef.current = 0;
    soundRef.current.playClick();
    forceUpdate();
  }, [forceUpdate]);

  /* ========== 下一波 ========== */
  const startNextWave = useCallback(() => {
    const gs = gsRef.current;
    if (gs.wave >= gs.maxWave || gs.waveActive) return;
    gs.wave++;
    const waveDef = wavesRef.current[gs.wave - 1];
    if (!waveDef) return;
    const queue: { type: EnemyType; delay: number }[] = [];
    let t = 0;
    for (const group of waveDef.enemies) {
      for (let i = 0; i < group.count; i++) {
        queue.push({ type: group.type, delay: t });
        t += waveDef.delay;
      }
    }
    gs.spawnQueue = queue;
    gs.spawnTimer = 0;
    gs.waveActive = true;
    gs.waveDelay = 0;
    soundRef.current.playLevelUp();
  }, []);

  /* ========== 游戏主循环 ========== */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const loop = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const dt = Math.min((ts - lastRef.current) / 1000, 0.05);
      lastRef.current = ts;
      const gs = gsRef.current;
      const path = MAPS[gs.mapIndex]?.path ?? MAPS[0].path;

      /* ---- UPDATE ---- */
      if (phase === "playing") {
        // Auto-start wave
        if (!gs.waveActive && gs.spawnQueue.length === 0 && gs.enemies.length === 0) {
          gs.waveDelay -= dt;
          if (gs.waveDelay <= 0 && gs.wave < gs.maxWave) {
            startNextWave();
          }
        }

        // Spawn enemies
        if (gs.spawnQueue.length > 0) {
          gs.spawnTimer += dt;
          while (gs.spawnQueue.length > 0 && gs.spawnTimer >= gs.spawnQueue[0].delay) {
            const item = gs.spawnQueue.shift()!;
            gs.enemies.push(spawnEnemy(item.type, path, gs.difficulty, gs.wave));
          }
          if (gs.spawnQueue.length === 0) {
            gs.spawnTimer = 0;
          }
        }

        // Move enemies
        for (const e of gs.enemies) {
          if (e.hp <= 0) continue;
          // Slow effect
          if (e.slowTimer > 0) {
            e.slowTimer -= dt;
            e.speed = e.baseSpeed * 0.4;
          } else {
            e.speed = e.baseSpeed;
          }
          // DOT effect
          if (e.dotTimer > 0) {
            e.dotTimer -= dt;
            e.hp -= e.dotDmg * dt;
            if (e.hp <= 0) {
              gs.gold += e.reward;
              gs.score += e.reward * 10;
              addParticles(gs.particles, e.x, e.y, "#7bed9f", 6);
              soundRef.current.playScore(e.reward * 10);
              continue;
            }
          }
          const nextPt = path[e.pathIdx + 1];
          if (!nextPt) {
            e.hp = 0;
            gs.lives--;
            soundRef.current.playError();
            addParticles(gs.particles, e.x, e.y, "#ff4757", 4);
            continue;
          }
          const tx = nextPt[0] * GRID + GRID / 2;
          const ty = nextPt[1] * GRID + GRID / 2;
          const dx = tx - e.x, dy = ty - e.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 4) {
            e.pathIdx++;
          } else {
            e.x += (dx / d) * e.speed * dt;
            e.y += (dy / d) * e.speed * dt;
          }
        }

        // Tower shooting
        for (const t of gs.towers) {
          t.cooldown -= dt;
          if (t.cooldown > 0) continue;
          const def = TOWER_DEFS[t.type];
          const dmg = towerDamage(def, t.level);
          const range = (def.range + (t.level - 1) * 0.3) * GRID;
          const cx = t.x * GRID + GRID / 2, cy = t.y * GRID + GRID / 2;
          const target = gs.enemies.find(e =>
            e.hp > 0 && (!e.flying || t.type === "arrow" || t.type === "laser") &&
            dist(e.x, e.y, cx, cy) < range
          );
          if (target) {
            t.cooldown = def.rate / (1 + (t.level - 1) * 0.15);
            gs.bullets.push({
              x: cx, y: cy, tx: target.x, ty: target.y,
              speed: 350, damage: dmg, color: def.color,
              splash: def.splash ?? 0, slow: def.slow ?? 0,
              dot: def.dot ? def.dot * (1 + (t.level - 1) * 0.5) : 0,
              pierce: !!def.pierce, hit: false,
            });
            soundRef.current.playTone(300 + Math.random() * 200, 0.05, "square");
          }
        }

        // Move bullets
        for (const b of gs.bullets) {
          if (b.hit) continue;
          const dx = b.tx - b.x, dy = b.ty - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 10) {
            b.hit = true;
            // Apply damage
            if (b.splash > 0) {
              for (const e of gs.enemies) {
                if (e.hp > 0 && dist(e.x, e.y, b.tx, b.ty) < b.splash) {
                  e.hp -= b.damage;
                  if (b.slow > 0) e.slowTimer = Math.max(e.slowTimer, b.slow);
                  if (b.dot > 0) { e.dotTimer = 3; e.dotDmg = b.dot; }
                  if (e.hp <= 0) {
                    gs.gold += e.reward;
                    gs.score += e.reward * 10;
                    addParticles(gs.particles, e.x, e.y, e.color, 8);
                    soundRef.current.playScore(e.reward * 10);
                  }
                }
              }
              addParticles(gs.particles, b.tx, b.ty, b.color, 5);
            } else if (b.pierce) {
              // Pierce: hit all enemies in a line
              for (const e of gs.enemies) {
                if (e.hp > 0 && dist(e.x, e.y, b.tx, b.ty) < 30) {
                  e.hp -= b.damage;
                  if (e.hp <= 0) {
                    gs.gold += e.reward;
                    gs.score += e.reward * 10;
                    addParticles(gs.particles, e.x, e.y, e.color, 8);
                    soundRef.current.playScore(e.reward * 10);
                  }
                }
              }
            } else {
              const hit = gs.enemies.find(e => e.hp > 0 && dist(e.x, e.y, b.tx, b.ty) < 20);
              if (hit) {
                hit.hp -= b.damage;
                if (b.slow > 0) hit.slowTimer = Math.max(hit.slowTimer, b.slow);
                if (b.dot > 0) { hit.dotTimer = 3; hit.dotDmg = b.dot; }
                if (hit.hp <= 0) {
                  gs.gold += hit.reward;
                  gs.score += hit.reward * 10;
                  addParticles(gs.particles, hit.x, hit.y, hit.color, 8);
                  soundRef.current.playScore(hit.reward * 10);
                }
              }
            }
          } else {
            b.x += (dx / d) * b.speed * dt;
            b.y += (dy / d) * b.speed * dt;
          }
        }

        // Cleanup
        gs.bullets = gs.bullets.filter(b => !b.hit);
        gs.enemies = gs.enemies.filter(e => e.hp > 0);

        // Particles
        for (const p of gs.particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        gs.particles = gs.particles.filter(p => p.life > 0);

        // Wave complete check
        if (gs.waveActive && gs.spawnQueue.length === 0 && gs.enemies.length === 0) {
          gs.waveActive = false;
          gs.waveDelay = 3;
          if (gs.wave >= gs.maxWave) {
            setPhase("victory");
            gs.score += gs.lives * 50;
            soundRef.current.playLevelUp();
            submitScore(gs.score);
            forceUpdate();
          }
        }

        // Game over
        if (gs.lives <= 0) {
          gs.lives = 0;
          setPhase("gameover");
          soundRef.current.playGameOver();
          submitScore(gs.score);
          forceUpdate();
        }
      }


      /* ---- RENDER ---- */
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0f0f0f";
      ctx.fillRect(0, 0, W, H);

      if (phase === "title") {
        // Title screen
        ctx.fillStyle = "#0f0f0f";
        ctx.fillRect(0, 0, W, H);
        // Decorative grid
        ctx.globalAlpha = 0.08;
        for (let r = 0; r < 14; r++) for (let c = 0; c < 12; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? "#3ea6ff" : "#1a1a2e";
          ctx.fillRect(c * GRID, r * GRID, GRID - 1, GRID - 1);
        }
        ctx.globalAlpha = 1;
        // Title
        ctx.fillStyle = "#3ea6ff";
        ctx.font = "bold 36px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("塔防战争", W / 2, 160);
        ctx.fillStyle = "#aaa";
        ctx.font = "14px sans-serif";
        ctx.fillText("建造防御塔，抵御敌人入侵", W / 2, 195);
        // Difficulty buttons
        const diffs: Difficulty[] = ["easy", "normal", "hard"];
        for (let i = 0; i < 3; i++) {
          const bx = W / 2 - 150 + i * 105, by = 240;
          const isSelected = difficulty === diffs[i];
          ctx.fillStyle = isSelected ? "#3ea6ff" : "#1a1a2e";
          ctx.strokeStyle = "#3ea6ff";
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, 95, 36, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = isSelected ? "#0f0f0f" : "#ccc";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(DIFF_DEFS[diffs[i]].name, bx + 47, by + 23);
        }
        // Map select button
        ctx.fillStyle = "#1a1a2e";
        ctx.strokeStyle = "#3ea6ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 100, 310, 200, 40, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#3ea6ff";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText("选择地图", W / 2, 335);
        // Start button
        ctx.fillStyle = "#3ea6ff";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 100, 380, 200, 48, 8);
        ctx.fill();
        ctx.fillStyle = "#0f0f0f";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("开始游戏", W / 2, 410);
        // Controls
        ctx.fillStyle = "#666";
        ctx.font = "12px sans-serif";
        ctx.fillText("点击空地放置塔 | 点击塔升级 | 1-5 选择塔类型", W / 2, 470);
        ctx.fillText("S: 开始下一波 | M: 静音 | P: 暂停", W / 2, 490);
      } else if (phase === "mapselect") {
        ctx.fillStyle = "#0f0f0f";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#3ea6ff";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("选择地图", W / 2, 60);
        for (let mi = 0; mi < MAPS.length; mi++) {
          const map = MAPS[mi];
          const bx = 40, by = 90 + mi * 150, bw = W - 80, bh = 130;
          const isSelected = mapIndex === mi;
          ctx.fillStyle = isSelected ? "#1a2a3e" : "#111";
          ctx.strokeStyle = isSelected ? "#3ea6ff" : "#333";
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 8);
          ctx.fill();
          ctx.stroke();
          // Mini map preview
          const scale = 8;
          const ox = bx + 15, oy = by + 30;
          ctx.strokeStyle = "#3ea6ff44";
          ctx.lineWidth = 1;
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            ctx.strokeRect(ox + c * scale, oy + r * scale, scale, scale);
          }
          ctx.strokeStyle = "#3ea6ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ox + map.path[0][0] * scale + scale / 2, oy + map.path[0][1] * scale + scale / 2);
          for (const [px, py] of map.path) {
            ctx.lineTo(ox + px * scale + scale / 2, oy + py * scale + scale / 2);
          }
          ctx.stroke();
          // Map name
          ctx.fillStyle = "#fff";
          ctx.font = "bold 16px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(map.name, bx + 130, by + 55);
          ctx.fillStyle = "#aaa";
          ctx.font = "12px sans-serif";
          ctx.fillText(`路径长度: ${map.path.length} 格`, bx + 130, by + 80);
        }
        // Back button
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 60, H - 60, 120, 36, 6);
        ctx.fill();
        ctx.fillStyle = "#ccc";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("返回", W / 2, H - 37);
      } else {
        // Game rendering
        // Grid
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const onP = isOnPath(path, c, r);
          ctx.fillStyle = onP ? "#1a1208" : "#0d0d0d";
          ctx.fillRect(c * GRID, r * GRID, GRID - 1, GRID - 1);
          if (!onP) {
            ctx.strokeStyle = "#1a1a1a";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(c * GRID, r * GRID, GRID - 1, GRID - 1);
          }
        }

        // Path line
        ctx.strokeStyle = "#3a2a0a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(path[0][0] * GRID + GRID / 2, path[0][1] * GRID + GRID / 2);
        for (const [px, py] of path) ctx.lineTo(px * GRID + GRID / 2, py * GRID + GRID / 2);
        ctx.stroke();

        // Start/End markers
        ctx.fillStyle = "#2ed57344";
        ctx.beginPath();
        ctx.arc(path[0][0] * GRID + GRID / 2, path[0][1] * GRID + GRID / 2, 12, 0, Math.PI * 2);
        ctx.fill();
        const lastP = path[path.length - 1];
        ctx.fillStyle = "#ff475744";
        ctx.beginPath();
        ctx.arc(lastP[0] * GRID + GRID / 2, lastP[1] * GRID + GRID / 2, 12, 0, Math.PI * 2);
        ctx.fill();

        // Selected cell highlight
        if (selectedCell && phase === "playing") {
          const sc = selectedCell;
          ctx.strokeStyle = "#3ea6ff";
          ctx.lineWidth = 2;
          ctx.strokeRect(sc.x * GRID + 1, sc.y * GRID + 1, GRID - 3, GRID - 3);
          // Show range for tower at this cell
          const existingTower = gs.towers.find(t => t.x === sc.x && t.y === sc.y);
          if (existingTower) {
            const def = TOWER_DEFS[existingTower.type];
            const range = (def.range + (existingTower.level - 1) * 0.3) * GRID;
            ctx.strokeStyle = "#3ea6ff33";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sc.x * GRID + GRID / 2, sc.y * GRID + GRID / 2, range, 0, Math.PI * 2);
            ctx.stroke();
          } else if (!isOnPath(path, sc.x, sc.y)) {
            const def = TOWER_DEFS[selectedTower];
            ctx.strokeStyle = "#3ea6ff22";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sc.x * GRID + GRID / 2, sc.y * GRID + GRID / 2, def.range * GRID, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // Towers
        for (const t of gs.towers) {
          const def = TOWER_DEFS[t.type];
          const cx = t.x * GRID + GRID / 2, cy = t.y * GRID + GRID / 2;
          // Base
          ctx.fillStyle = "#1a1a2e";
          ctx.beginPath();
          ctx.arc(cx, cy, GRID / 2 - 2, 0, Math.PI * 2);
          ctx.fill();
          // Tower body
          ctx.fillStyle = def.color;
          ctx.beginPath();
          ctx.arc(cx, cy, GRID / 2 - 6, 0, Math.PI * 2);
          ctx.fill();
          // Level indicator
          if (t.level > 1) {
            ctx.fillStyle = "#fff";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (let s = 0; s < t.level - 1; s++) {
              ctx.fillText("*", cx - 4 + s * 8, cy - 12);
            }
          }
          // Tower letter
          ctx.fillStyle = "#0f0f0f";
          ctx.font = "bold 13px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const letters: Record<TowerType, string> = { arrow: "A", cannon: "C", ice: "I", poison: "P", laser: "L" };
          ctx.fillText(letters[t.type], cx, cy + 1);
        }

        // Enemies
        for (const e of gs.enemies) {
          if (e.hp <= 0) continue;
          // Shadow for flying
          if (e.flying) {
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath();
            ctx.ellipse(e.x + 3, e.y + 5, e.radius, e.radius * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          // Body
          ctx.fillStyle = e.slowTimer > 0 ? "#70a1ff" : e.color;
          ctx.beginPath();
          ctx.arc(e.x, e.flying ? e.y - 4 : e.y, e.radius, 0, Math.PI * 2);
          ctx.fill();
          // DOT indicator
          if (e.dotTimer > 0) {
            ctx.strokeStyle = "#7bed9f";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(e.x, e.flying ? e.y - 4 : e.y, e.radius + 2, 0, Math.PI * 2);
            ctx.stroke();
          }
          // HP bar
          const barW = e.radius * 2 + 4;
          const barY = (e.flying ? e.y - 4 : e.y) - e.radius - 6;
          ctx.fillStyle = "#333";
          ctx.fillRect(e.x - barW / 2, barY, barW, 3);
          const hpRatio = Math.max(0, e.hp / e.maxHp);
          ctx.fillStyle = hpRatio > 0.5 ? "#2ed573" : hpRatio > 0.25 ? "#ffa502" : "#ff4757";
          ctx.fillRect(e.x - barW / 2, barY, barW * hpRatio, 3);
        }

        // Bullets
        for (const b of gs.bullets) {
          if (b.hit) continue;
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.pierce ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
          if (b.pierce) {
            ctx.strokeStyle = b.color + "88";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(b.x - (b.tx - b.x) * 0.3, b.y - (b.ty - b.y) * 0.3);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }

        // Particles
        for (const p of gs.particles) {
          ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;


        // HUD background
        ctx.fillStyle = "rgba(15,15,15,0.95)";
        ctx.fillRect(0, HUD_Y, W, H - HUD_Y);
        ctx.strokeStyle = "#3ea6ff33";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, HUD_Y);
        ctx.lineTo(W, HUD_Y);
        ctx.stroke();

        // HUD info
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`波次: ${gs.wave}/${gs.maxWave}`, 8, HUD_Y + 6);
        ctx.fillStyle = "#ffd700";
        ctx.fillText(`金币: ${gs.gold}`, 130, HUD_Y + 6);
        ctx.fillStyle = "#ff4757";
        ctx.fillText(`生命: ${gs.lives}`, 250, HUD_Y + 6);
        ctx.fillStyle = "#3ea6ff";
        ctx.fillText(`分数: ${gs.score}`, 360, HUD_Y + 6);

        // Tower selection buttons
        const btnY = HUD_Y + 28;
        const btnW = (W - 20) / 5;
        for (let i = 0; i < TOWER_TYPES.length; i++) {
          const tt = TOWER_TYPES[i];
          const def = TOWER_DEFS[tt];
          const bx = 6 + i * (btnW + 2);
          const isSelected = selectedTower === tt;
          const canAfford = gs.gold >= def.cost;
          ctx.fillStyle = isSelected ? "#1a2a4e" : "#111";
          ctx.strokeStyle = isSelected ? def.color : (canAfford ? "#333" : "#222");
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.beginPath();
          ctx.roundRect(bx, btnY, btnW, 50, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = canAfford ? def.color : "#555";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(def.name, bx + btnW / 2, btnY + 14);
          ctx.fillStyle = canAfford ? "#ccc" : "#444";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${def.cost}G`, bx + btnW / 2, btnY + 30);
          ctx.fillText(def.desc, bx + btnW / 2, btnY + 42);
        }

        // Upgrade info for selected tower
        if (selectedCell) {
          const tower = gs.towers.find(t => t.x === selectedCell.x && t.y === selectedCell.y);
          if (tower && tower.level < 3) {
            const def = TOWER_DEFS[tower.type];
            const cost = towerUpgradeCost(def, tower.level);
            const infoY = HUD_Y + 84;
            ctx.fillStyle = "#1a1a2e";
            ctx.beginPath();
            ctx.roundRect(6, infoY, W - 12, 30, 4);
            ctx.fill();
            ctx.fillStyle = gs.gold >= cost ? "#3ea6ff" : "#666";
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
              `升级 ${def.name} Lv${tower.level} -> Lv${tower.level + 1} (${cost}G) | 伤害: ${towerDamage(def, tower.level)} -> ${towerDamage(def, tower.level + 1)}`,
              W / 2, infoY + 19
            );
          }
        }

        // Wave start hint
        if (!gs.waveActive && gs.wave < gs.maxWave && gs.enemies.length === 0 && phase === "playing") {
          ctx.fillStyle = "#3ea6ff88";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`按 S 或点击此处开始第 ${gs.wave + 1} 波`, W / 2, HUD_Y + 122);
        }

        // Paused overlay
        if (phase === "paused") {
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(0, 0, W, HUD_Y);
          ctx.fillStyle = "#3ea6ff";
          ctx.font = "bold 32px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("暂停", W / 2, HUD_Y / 2 - 10);
          ctx.fillStyle = "#aaa";
          ctx.font = "14px sans-serif";
          ctx.fillText("按 P 或点击继续", W / 2, HUD_Y / 2 + 20);
        }

        // Victory overlay
        if (phase === "victory") {
          ctx.fillStyle = "rgba(0,0,0,0.75)";
          ctx.fillRect(0, 0, W, HUD_Y);
          ctx.fillStyle = "#2ed573";
          ctx.font = "bold 36px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("胜利", W / 2, HUD_Y / 2 - 40);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 18px sans-serif";
          ctx.fillText(`最终分数: ${gs.score}`, W / 2, HUD_Y / 2);
          ctx.fillStyle = "#aaa";
          ctx.font = "14px sans-serif";
          ctx.fillText(`难度: ${DIFF_DEFS[gs.difficulty].name} | 地图: ${MAPS[gs.mapIndex].name}`, W / 2, HUD_Y / 2 + 30);
          ctx.fillText(`剩余生命: ${gs.lives} | 波次: ${gs.wave}/${gs.maxWave}`, W / 2, HUD_Y / 2 + 55);
          ctx.fillStyle = "#3ea6ff";
          ctx.beginPath();
          ctx.roundRect(W / 2 - 80, HUD_Y / 2 + 75, 160, 40, 8);
          ctx.fill();
          ctx.fillStyle = "#0f0f0f";
          ctx.font = "bold 16px sans-serif";
          ctx.fillText("再来一局", W / 2, HUD_Y / 2 + 100);
        }

        // Game over overlay
        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.75)";
          ctx.fillRect(0, 0, W, HUD_Y);
          ctx.fillStyle = "#ff4757";
          ctx.font = "bold 36px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("防线失守", W / 2, HUD_Y / 2 - 40);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 18px sans-serif";
          ctx.fillText(`分数: ${gs.score}`, W / 2, HUD_Y / 2);
          ctx.fillStyle = "#aaa";
          ctx.font = "14px sans-serif";
          ctx.fillText(`坚持到第 ${gs.wave} 波 | ${DIFF_DEFS[gs.difficulty].name}`, W / 2, HUD_Y / 2 + 30);
          ctx.fillStyle = "#3ea6ff";
          ctx.beginPath();
          ctx.roundRect(W / 2 - 80, HUD_Y / 2 + 60, 160, 40, 8);
          ctx.fill();
          ctx.fillStyle = "#0f0f0f";
          ctx.font = "bold 16px sans-serif";
          ctx.fillText("再来一局", W / 2, HUD_Y / 2 + 85);
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, selectedTower, selectedCell, difficulty, mapIndex, startNextWave, submitScore, forceUpdate]);


  /* ========== 点击处理 ========== */
  const handleCanvasClick = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * (W / rect.width);
    const my = (clientY - rect.top) * (H / rect.height);
    const gs = gsRef.current;
    const path = MAPS[gs.mapIndex]?.path ?? MAPS[0].path;

    if (phase === "title") {
      // Difficulty buttons
      const diffs: Difficulty[] = ["easy", "normal", "hard"];
      for (let i = 0; i < 3; i++) {
        const bx = W / 2 - 150 + i * 105, by = 240;
        if (mx >= bx && mx <= bx + 95 && my >= by && my <= by + 36) {
          setDifficulty(diffs[i]);
          soundRef.current.playClick();
          return;
        }
      }
      // Map select button
      if (mx >= W / 2 - 100 && mx <= W / 2 + 100 && my >= 310 && my <= 350) {
        setPhase("mapselect");
        soundRef.current.playClick();
        return;
      }
      // Start button
      if (mx >= W / 2 - 100 && mx <= W / 2 + 100 && my >= 380 && my <= 428) {
        startGame(difficulty, mapIndex);
        return;
      }
      return;
    }

    if (phase === "mapselect") {
      // Map selection
      for (let mi = 0; mi < MAPS.length; mi++) {
        const by = 90 + mi * 150, bh = 130;
        if (mx >= 40 && mx <= W - 40 && my >= by && my <= by + bh) {
          setMapIndex(mi);
          soundRef.current.playClick();
          return;
        }
      }
      // Back button
      if (mx >= W / 2 - 60 && mx <= W / 2 + 60 && my >= H - 60 && my <= H - 24) {
        setPhase("title");
        soundRef.current.playClick();
        return;
      }
      return;
    }

    if (phase === "victory" || phase === "gameover") {
      // Restart button
      const btnY = phase === "victory" ? HUD_Y / 2 + 75 : HUD_Y / 2 + 60;
      if (mx >= W / 2 - 80 && mx <= W / 2 + 80 && my >= btnY && my <= btnY + 40) {
        setPhase("title");
        soundRef.current.playClick();
        return;
      }
      return;
    }

    if (phase === "paused") {
      setPhase("playing");
      return;
    }

    if (phase !== "playing") return;

    // Wave start hint area
    if (!gs.waveActive && gs.wave < gs.maxWave && gs.enemies.length === 0 && my >= HUD_Y + 108 && my <= HUD_Y + 140) {
      startNextWave();
      return;
    }

    // Tower selection buttons
    const btnY = HUD_Y + 28;
    const btnW = (W - 20) / 5;
    for (let i = 0; i < TOWER_TYPES.length; i++) {
      const bx = 6 + i * (btnW + 2);
      if (mx >= bx && mx <= bx + btnW && my >= btnY && my <= btnY + 50) {
        setSelectedTower(TOWER_TYPES[i]);
        setSelectedCell(null);
        soundRef.current.playClick();
        return;
      }
    }

    // Upgrade button area
    if (selectedCell && my >= HUD_Y + 84 && my <= HUD_Y + 114) {
      const tower = gs.towers.find(t => t.x === selectedCell.x && t.y === selectedCell.y);
      if (tower && tower.level < 3) {
        const def = TOWER_DEFS[tower.type];
        const cost = towerUpgradeCost(def, tower.level);
        if (gs.gold >= cost) {
          gs.gold -= cost;
          tower.level++;
          soundRef.current.playLevelUp();
          forceUpdate();
          return;
        } else {
          soundRef.current.playError();
        }
      }
      return;
    }

    // Grid click
    if (my < HUD_Y) {
      const gx = Math.floor(mx / GRID);
      const gy = Math.floor(my / GRID);
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return;

      const existingTower = gs.towers.find(t => t.x === gx && t.y === gy);
      if (existingTower) {
        setSelectedCell({ x: gx, y: gy });
        soundRef.current.playClick();
        return;
      }

      if (!isOnPath(path, gx, gy)) {
        const def = TOWER_DEFS[selectedTower];
        if (gs.gold >= def.cost) {
          gs.gold -= def.cost;
          gs.towers.push({
            type: selectedTower, x: gx, y: gy,
            cooldown: 0, level: 1, kills: 0,
          });
          soundRef.current.playMove();
          setSelectedCell({ x: gx, y: gy });
          forceUpdate();
        } else {
          soundRef.current.playError();
        }
      }
    }
  }, [phase, selectedTower, selectedCell, difficulty, mapIndex, startGame, startNextWave, forceUpdate]);

  /* ========== Canvas 事件 ========== */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
  }, [handleCanvasClick]);

  /* ========== 键盘 ========== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "m") {
        setMuted(m => {
          soundRef.current.toggleMute();
          return !m;
        });
        return;
      }
      if (phase === "title" && (key === "enter" || key === " ")) {
        startGame(difficulty, mapIndex);
        return;
      }
      if (phase === "playing") {
        if (key === "p") {
          setPhase("paused");
          return;
        }
        if (key === "s") {
          startNextWave();
          return;
        }
        const numMap: Record<string, TowerType> = { "1": "arrow", "2": "cannon", "3": "ice", "4": "poison", "5": "laser" };
        if (numMap[key]) {
          setSelectedTower(numMap[key]);
          setSelectedCell(null);
          soundRef.current.playClick();
        }
        // Upgrade with U key
        if (key === "u" && selectedCell) {
          const gs = gsRef.current;
          const tower = gs.towers.find(t => t.x === selectedCell.x && t.y === selectedCell.y);
          if (tower && tower.level < 3) {
            const def = TOWER_DEFS[tower.type];
            const cost = towerUpgradeCost(def, tower.level);
            if (gs.gold >= cost) {
              gs.gold -= cost;
              tower.level++;
              soundRef.current.playLevelUp();
              forceUpdate();
            }
          }
        }
      }
      if (phase === "paused" && key === "p") {
        setPhase("playing");
        return;
      }
      if ((phase === "victory" || phase === "gameover") && (key === "enter" || key === " ")) {
        setPhase("title");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, difficulty, mapIndex, selectedCell, startGame, startNextWave, forceUpdate]);

  /* ========== 音效 ========== */
  useEffect(() => {
    return () => soundRef.current.dispose();
  }, []);

  /* ========== 存档 ========== */
  const handleSave = useCallback(() => {
    const gs = gsRef.current;
    return {
      towers: gs.towers,
      gold: gs.gold,
      lives: gs.lives,
      wave: gs.wave,
      score: gs.score,
      difficulty: gs.difficulty,
      mapIndex: gs.mapIndex,
      waveActive: gs.waveActive,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d) return;
    const diff = (d.difficulty as Difficulty) || "normal";
    const mi = (d.mapIndex as number) || 0;
    const gs = createInitialState(diff, mi);
    if (Array.isArray(d.towers)) gs.towers = d.towers as Tower[];
    if (typeof d.gold === "number") gs.gold = d.gold;
    if (typeof d.lives === "number") gs.lives = d.lives;
    if (typeof d.wave === "number") gs.wave = d.wave;
    if (typeof d.score === "number") gs.score = d.score;
    gsRef.current = gs;
    wavesRef.current = generateWaves();
    setDifficulty(diff);
    setMapIndex(mi);
    setPhase("playing");
    forceUpdate();
  }, [forceUpdate]);


  /* ========== UI ========== */
  const gs = gsRef.current;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield size={24} className="text-[#3ea6ff]" />
            <h1 className="text-xl font-bold">塔防战争</h1>
          </div>
          <div className="flex items-center gap-2">
            {phase === "playing" && (
              <button
                onClick={() => setPhase("paused")}
                className="px-3 py-1.5 text-xs bg-[#1a1a2e] border border-white/10 rounded hover:bg-[#2a2a4e]"
              >
                暂停
              </button>
            )}
            <button
              onClick={() => setMuted(m => { soundRef.current.toggleMute(); return !m; })}
              className="p-2 text-gray-400 hover:text-[#3ea6ff]"
              title={muted ? "开启音效" : "关闭音效"}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full max-w-[480px] mx-auto rounded-lg border border-white/10 touch-none"
          style={{ aspectRatio: `${W}/${H}` }}
        />

        {/* Tower info panel */}
        {phase === "playing" && (
          <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px] text-gray-500">
            {TOWER_TYPES.map(tt => {
              const def = TOWER_DEFS[tt];
              return (
                <div key={tt} className="leading-tight">
                  <span className="font-bold" style={{ color: def.color }}>{def.name}</span>
                  <br />
                  伤害:{def.damage} 范围:{def.range}
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {(phase === "victory" || phase === "gameover") && (
            <button
              onClick={() => setPhase("title")}
              className="flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"
            >
              <RotateCcw size={14} /> 返回标题
            </button>
          )}
          {phase === "playing" && !gs.waveActive && gs.wave < gs.maxWave && gs.enemies.length === 0 && (
            <button
              onClick={startNextWave}
              className="flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"
            >
              <Play size={14} /> 开始第 {gs.wave + 1} 波
            </button>
          )}
        </div>

        {/* Save/Load + Leaderboard */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}
