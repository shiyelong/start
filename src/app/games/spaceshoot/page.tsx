"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, Zap, Shield, Crosshair, Rocket, Play,
  RotateCcw, Trophy, Target, Flame, Wind, Star, User
} from "lucide-react";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

/* ========== 常量 ========== */
const GAME_ID = "spaceshoot";
const W = 400, H = 640;
const PLAYER_W = 32, PLAYER_H = 24;
const STAR_COUNT = 80;
const MAX_BULLETS = 40;
const MAX_ENEMIES = 14;
const MAX_PARTICLES = 80;
const MAX_POWERUPS = 4;


/* ========== 角色定义 ========== */
type CharacterId = "speed" | "power" | "defense";
interface CharacterDef {
  id: CharacterId;
  name: string;
  desc: string;
  color: string;
  speed: number;
  fireRate: number;
  damage: number;
  hp: number;
  shieldMax: number;
  icon: "wind" | "flame" | "shield";
}
const CHARACTERS: CharacterDef[] = [
  { id: "speed", name: "疾风号", desc: "速度+40% 射速+30%", color: "#2ba640", speed: 5.6, fireRate: 5, damage: 10, hp: 80, shieldMax: 30, icon: "wind" },
  { id: "power", name: "烈焰号", desc: "伤害+50% 穿透弹", color: "#f0b90b", speed: 3.8, fireRate: 8, damage: 18, hp: 90, shieldMax: 40, icon: "flame" },
  { id: "defense", name: "堡垒号", desc: "生命+60% 护盾+100%", color: "#3ea6ff", speed: 3.2, fireRate: 9, damage: 11, hp: 160, shieldMax: 80, icon: "shield" },
];

/* ========== 难度定义 ========== */
type DifficultyId = "easy" | "normal" | "hard";
interface DifficultyDef { id: DifficultyId; name: string; enemyHpMul: number; enemySpdMul: number; enemyFireMul: number; scoreMul: number; }
const DIFFICULTIES: DifficultyDef[] = [
  { id: "easy", name: "简单", enemyHpMul: 0.7, enemySpdMul: 0.8, enemyFireMul: 0.6, scoreMul: 0.8 },
  { id: "normal", name: "普通", enemyHpMul: 1, enemySpdMul: 1, enemyFireMul: 1, scoreMul: 1 },
  { id: "hard", name: "困难", enemyHpMul: 1.5, enemySpdMul: 1.3, enemyFireMul: 1.5, scoreMul: 1.5 },
];

/* ========== 武器升级定义 ========== */
type WeaponType = "normal" | "spread" | "laser" | "missile";
interface WeaponDef { name: string; energyCost: number; color: string; }
const WEAPONS: Record<WeaponType, WeaponDef> = {
  normal: { name: "普通", energyCost: 0, color: "#3ea6ff" },
  spread: { name: "散射", energyCost: 30, color: "#f0b90b" },
  laser: { name: "激光", energyCost: 60, color: "#a855f7" },
  missile: { name: "导弹", energyCost: 100, color: "#ff4444" },
};
const WEAPON_ORDER: WeaponType[] = ["normal", "spread", "laser", "missile"];

/* ========== 关卡定义 ========== */
interface LevelDef {
  id: number; name: string; waves: number; bossHp: number;
  enemyTypes: EnemyType[]; bgColor: string; starColor: string;
}
type EnemyType = "scout" | "fighter" | "tank" | "sniper" | "boss";
const LEVELS: LevelDef[] = [
  { id: 1, name: "近地轨道", waves: 5, bossHp: 300, enemyTypes: ["scout", "fighter"], bgColor: "#050510", starColor: "#ffffff" },
  { id: 2, name: "小行星带", waves: 6, bossHp: 500, enemyTypes: ["scout", "fighter", "tank"], bgColor: "#0a0515", starColor: "#ccccff" },
  { id: 3, name: "星云深处", waves: 7, bossHp: 750, enemyTypes: ["scout", "fighter", "tank", "sniper"], bgColor: "#100510", starColor: "#ffccdd" },
  { id: 4, name: "虫洞边缘", waves: 8, bossHp: 1000, enemyTypes: ["fighter", "tank", "sniper"], bgColor: "#051005", starColor: "#ccffcc" },
  { id: 5, name: "母舰核心", waves: 10, bossHp: 1500, enemyTypes: ["scout", "fighter", "tank", "sniper"], bgColor: "#150505", starColor: "#ffddcc" },
];

/* ========== 类型 ========== */
interface StarObj { x: number; y: number; speed: number; size: number; brightness: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; damage: number; piercing: boolean; type: WeaponType; life: number; }
interface EBullet { x: number; y: number; vx: number; vy: number; size: number; color: string; }
interface Enemy {
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number; speed: number; type: EnemyType;
  shootTimer: number; shootRate: number; reward: number;
  color: string; pattern: number; age: number; energy: number;
}
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}
interface PowerUp {
  x: number; y: number; type: "energy" | "shield" | "hp" | "bomb";
  vy: number;
}

type GameScreen = "title" | "playing" | "paused" | "levelClear" | "gameOver" | "victory";

interface GameState {
  screen: GameScreen;
  character: CharacterDef;
  difficulty: DifficultyDef;
  level: number;
  // Player
  px: number; py: number;
  hp: number; maxHp: number;
  shield: number; shieldMax: number;
  weapon: WeaponType; weaponLevel: number;
  energy: number; maxEnergy: number;
  invincible: number;
  // Game
  score: number; combo: number; maxCombo: number;
  wave: number; waveTimer: number; waveEnemiesLeft: number;
  bossActive: boolean; levelCleared: boolean;
  // Collections
  bullets: Bullet[]; eBullets: EBullet[];
  enemies: Enemy[]; particles: Particle[];
  stars: StarObj[]; powerups: PowerUp[];
  // Input
  keys: Set<string>; touchX: number | null;
  // Timing
  frame: number; shootCooldown: number;
  startTime: number; elapsedTime: number;
  // Stats
  enemiesKilled: number; bossesKilled: number;
  totalDamageDealt: number;
}

/* ========== 工具函数 ========== */
function initStars(): StarObj[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    speed: 0.5 + Math.random() * 2.5, size: 0.5 + Math.random() * 1.5,
    brightness: 0.3 + Math.random() * 0.7,
  }));
}

function spawnEnemy(wave: number, isBoss: boolean, level: LevelDef, diff: DifficultyDef): Enemy {
  if (isBoss) {
    const bossHp = Math.round(level.bossHp * diff.enemyHpMul);
    return {
      x: W / 2 - 40, y: -80, w: 80, h: 60,
      hp: bossHp, maxHp: bossHp,
      speed: 0.5 * diff.enemySpdMul, type: "boss",
      shootTimer: 0, shootRate: Math.max(10, Math.round(15 / diff.enemyFireMul)),
      reward: Math.round((500 + wave * 50) * diff.scoreMul),
      color: "#ff4444", pattern: 0, age: 0, energy: 20,
    };
  }
  const available = level.enemyTypes.filter(t => t !== "boss");
  const typeKey = available[Math.floor(Math.random() * available.length)] || "scout";
  const templates: Record<string, { w: number; h: number; hp: number; speed: number; rate: number; reward: number; color: string; energy: number }> = {
    scout:   { w: 20, h: 16, hp: 15 + wave * 3, speed: 2 + wave * 0.1, rate: 80, reward: 10, color: "#3ea6ff", energy: 3 },
    fighter: { w: 24, h: 20, hp: 30 + wave * 5, speed: 1.5 + wave * 0.08, rate: 50, reward: 25, color: "#f0b90b", energy: 5 },
    tank:    { w: 30, h: 26, hp: 60 + wave * 8, speed: 0.8, rate: 40, reward: 50, color: "#a855f7", energy: 8 },
    sniper:  { w: 22, h: 18, hp: 20 + wave * 4, speed: 1, rate: 60, reward: 35, color: "#ff4444", energy: 6 },
  };
  const t = templates[typeKey];
  return {
    x: 20 + Math.random() * (W - 40 - t.w), y: -t.h - Math.random() * 100,
    w: t.w, h: t.h,
    hp: Math.round(t.hp * diff.enemyHpMul), maxHp: Math.round(t.hp * diff.enemyHpMul),
    speed: t.speed * diff.enemySpdMul,
    type: typeKey as EnemyType,
    shootTimer: Math.random() * t.rate, shootRate: Math.max(15, Math.round(t.rate / diff.enemyFireMul)),
    reward: Math.round(t.reward * diff.scoreMul),
    color: t.color, pattern: Math.floor(Math.random() * 3), age: 0, energy: t.energy,
  };
}

function spawnParticles(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 20 + Math.random() * 20, maxLife: 40, color,
      size: 1 + Math.random() * 3,
    });
  }
}

function fireBullets(s: GameState) {
  const { px, py, weapon, character } = s;
  const dmg = character.damage + s.weaponLevel * 3;
  const yOff = py - PLAYER_H / 2;
  switch (weapon) {
    case "spread":
      for (let a = -2; a <= 2; a++) {
        s.bullets.push({ x: px, y: yOff, vx: a * 1.5, vy: -8, damage: Math.round(dmg * 0.7), piercing: false, type: "spread", life: 120 });
      }
      break;
    case "laser":
      s.bullets.push({ x: px, y: yOff, vx: 0, vy: -12, damage: Math.round(dmg * 1.8), piercing: true, type: "laser", life: 60 });
      break;
    case "missile":
      // Find nearest enemy
      let nearest: Enemy | null = null; let minDist = Infinity;
      for (const e of s.enemies) {
        const d = Math.hypot(e.x + e.w / 2 - px, e.y + e.h / 2 - py);
        if (d < minDist) { minDist = d; nearest = e; }
      }
      if (nearest) {
        const dx = (nearest.x + nearest.w / 2) - px;
        const dy = (nearest.y + nearest.h / 2) - py;
        const dist = Math.hypot(dx, dy) || 1;
        s.bullets.push({ x: px, y: yOff, vx: (dx / dist) * 7, vy: (dy / dist) * 7, damage: Math.round(dmg * 2.5), piercing: false, type: "missile", life: 90 });
      } else {
        s.bullets.push({ x: px, y: yOff, vx: 0, vy: -7, damage: Math.round(dmg * 2.5), piercing: false, type: "missile", life: 90 });
      }
      break;
    default:
      s.bullets.push({ x: px, y: yOff, vx: 0, vy: -9, damage: dmg, piercing: false, type: "normal", life: 120 });
  }
}

/* ========== PixiJS 绘制函数 ========== */
function colorToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

function drawGamePixi(g: PixiGraphics, texts: Map<string, PixiText>, s: GameState) {
  const level = LEVELS[s.level - 1] || LEVELS[0];
  g.clear();
  texts.forEach(t => { t.visible = false; });

  const showText = (key: string, text: string, x: number, y: number, ax = 0, ay = 0) => {
    const t = texts.get(key);
    if (!t) return;
    t.text = text; t.x = x; t.y = y; t.anchor.set(ax, ay); t.alpha = 1; t.visible = true;
  };

  // 背景
  g.rect(0, 0, W, H).fill({ color: colorToNum(level.bgColor) });

  // 星空
  for (const star of s.stars) {
    g.rect(star.x, star.y, star.size, star.size).fill({ color: colorToNum(level.starColor), alpha: star.brightness });
  }

  // 粒子
  for (const p of s.particles) {
    g.circle(p.x, p.y, p.size).fill({ color: colorToNum(p.color), alpha: p.life / p.maxLife });
  }

  // 能量道具
  const puColors: Record<string, string> = { energy: "#f0b90b", shield: "#3ea6ff", hp: "#2ba640", bomb: "#ff4444" };
  const puIcons: Record<string, string> = { energy: "E", shield: "S", hp: "+", bomb: "B" };
  s.powerups.forEach((pu, i) => {
    g.circle(pu.x, pu.y, 10).fill({ color: colorToNum(puColors[pu.type] || "#ffffff"), alpha: 0.8 });
    if (i < 4) showText(`pu_${i}`, puIcons[pu.type] || "?", pu.x, pu.y, 0.5, 0.5);
  });

  // 敌人
  for (const e of s.enemies) {
    if (e.type === "boss") {
      g.rect(e.x, e.y, e.w, e.h).fill({ color: 0xff4444 });
      g.rect(e.x + 5, e.y + 5, e.w - 10, e.h - 10).fill({ color: 0xcc0000 });
      g.rect(e.x + 15, e.y + 15, 8, 8).fill({ color: 0xffffff });
      g.rect(e.x + e.w - 23, e.y + 15, 8, 8).fill({ color: 0xffffff });
      g.rect(e.x + 17, e.y + 17, 4, 4).fill({ color: 0xffff00 });
      g.rect(e.x + e.w - 21, e.y + 17, 4, 4).fill({ color: 0xffff00 });
      const hpRatio = e.hp / e.maxHp;
      g.rect(W / 2 - 80, 8, 160, 6).fill({ color: 0x333333 });
      g.rect(W / 2 - 80, 8, 160 * hpRatio, 6).fill({ color: hpRatio > 0.5 ? 0x2ba640 : hpRatio > 0.25 ? 0xf0b90b : 0xff4444 });
      showText("boss_label", `BOSS - ${level.name}`, W / 2, 14, 0.5, 0);
    } else {
      const ec = colorToNum(e.color);
      g.moveTo(e.x + e.w / 2, e.y + e.h).lineTo(e.x, e.y).lineTo(e.x + e.w, e.y).closePath().fill({ color: ec });
      g.rect(e.x + e.w / 2 - 3, e.y - 4, 6, 4).fill({ color: ec, alpha: 0.5 });
      if (e.hp < e.maxHp) {
        const ratio = e.hp / e.maxHp;
        g.rect(e.x, e.y - 6, e.w, 3).fill({ color: 0x333333 });
        g.rect(e.x, e.y - 6, e.w * ratio, 3).fill({ color: ratio > 0.5 ? 0x2ba640 : 0xff4444 });
      }
    }
  }

  // 敌人子弹
  for (const b of s.eBullets) {
    const bc = colorToNum(b.color);
    g.circle(b.x, b.y, b.size).fill({ color: bc });
    g.circle(b.x, b.y, b.size * 2).fill({ color: bc, alpha: 0.3 });
  }

  // 玩家子弹
  for (const b of s.bullets) {
    const wc = colorToNum(WEAPONS[b.type]?.color || "#3ea6ff");
    if (b.type === "laser") {
      g.rect(b.x - 2, b.y - 8, 4, 16).fill({ color: wc });
      g.rect(b.x - 4, b.y - 10, 8, 20).fill({ color: wc, alpha: 0.4 });
    } else if (b.type === "missile") {
      g.circle(b.x, b.y, 4).fill({ color: wc });
      g.circle(b.x - b.vx * 0.3, b.y - b.vy * 0.3, 3).fill({ color: 0xf0b90b, alpha: 0.6 });
    } else {
      g.rect(b.x - 1.5, b.y - 4, 3, 8).fill({ color: wc });
      g.rect(b.x - 3, b.y - 6, 6, 12).fill({ color: wc, alpha: 0.4 });
    }
  }

  // 玩家飞船
  if (s.invincible <= 0 || s.frame % 4 < 2) {
    const px = s.px, py = s.py;
    const pc = colorToNum(s.character.color);
    if (s.shield > 0) {
      g.circle(px, py, 22).stroke({ color: pc, width: 1.5, alpha: 0.4 + 0.2 * Math.sin(s.frame * 0.1) });
    }
    g.moveTo(px, py - PLAYER_H / 2)
      .lineTo(px - PLAYER_W / 2, py + PLAYER_H / 2)
      .lineTo(px - PLAYER_W / 4, py + PLAYER_H / 3)
      .lineTo(px + PLAYER_W / 4, py + PLAYER_H / 3)
      .lineTo(px + PLAYER_W / 2, py + PLAYER_H / 2)
      .closePath().fill({ color: pc });
    g.circle(px, py, 4).fill({ color: 0xffffff });
    const flameH = 6 + Math.sin(s.frame * 0.5) * 3;
    g.moveTo(px - 5, py + PLAYER_H / 3)
      .lineTo(px, py + PLAYER_H / 3 + flameH)
      .lineTo(px + 5, py + PLAYER_H / 3)
      .closePath().fill({ color: 0xf0b90b });
  }

  // HUD
  showText("hud_score", `分数: ${s.score}`, 8, H - 16);
  showText("hud_wave", `关卡${s.level} 波${s.wave}/${(LEVELS[s.level - 1] || LEVELS[0]).waves}`, W - 8, H - 16, 1, 0);
  // HP条
  g.rect(8, H - 24, 70, 5).fill({ color: 0x333333 });
  g.rect(8, H - 24, 70 * (s.hp / s.maxHp), 5).fill({ color: s.hp > s.maxHp * 0.3 ? 0x2ba640 : 0xff4444 });
  showText("hud_hp", "HP", 8, H - 36);
  // 能量条
  g.rect(8, H - 38, 70, 5).fill({ color: 0x333333 });
  g.rect(8, H - 38, 70 * (s.energy / s.maxEnergy), 5).fill({ color: 0xf0b90b });
  showText("hud_energy", "能量", 8, H - 50);
  // 武器
  showText("hud_weapon", `[${WEAPONS[s.weapon].name}] Lv${s.weaponLevel}`, W - 8, H - 30, 1, 0);
  // Combo
  if (s.combo > 1) showText("hud_combo", `${s.combo}x`, W / 2, H - 16, 0.5, 0);
}

/* ========== 主组件 ========== */
export default function SpaceShootPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const [screen, setScreen] = useState<"title" | "playing" | "result">("title");
  const [selectedChar, setSelectedChar] = useState<CharacterId>("defense");
  const [selectedDiff, setSelectedDiff] = useState<DifficultyId>("normal");
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [unlockedLevels, setUnlockedLevels] = useState(1);
  const [resultStats, setResultStats] = useState({ score: 0, wave: 0, killed: 0, bosses: 0, combo: 0, time: 0, level: 1, victory: false });
  const sRef = useRef<GameState | null>(null);

  // Load unlocked levels from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("spaceshoot_unlocked");
      if (saved) setUnlockedLevels(Math.max(1, Math.min(5, parseInt(saved))));
    } catch { /* ignore */ }
  }, []);

  const initState = useCallback((charId: CharacterId, diffId: DifficultyId, levelId: number): GameState => {
    const character = CHARACTERS.find(c => c.id === charId) || CHARACTERS[2];
    const difficulty = DIFFICULTIES.find(d => d.id === diffId) || DIFFICULTIES[1];
    return {
      screen: "playing", character, difficulty, level: levelId,
      px: W / 2, py: H - 60, hp: character.hp, maxHp: character.hp,
      shield: 0, shieldMax: character.shieldMax,
      weapon: "normal", weaponLevel: 1, energy: 0, maxEnergy: 100,
      invincible: 120,
      score: 0, combo: 0, maxCombo: 0,
      wave: 0, waveTimer: 90, waveEnemiesLeft: 0, bossActive: false, levelCleared: false,
      bullets: [], eBullets: [], enemies: [], particles: [],
      stars: initStars(), powerups: [],
      keys: new Set(), touchX: null, frame: 0, shootCooldown: 0,
      startTime: Date.now(), elapsedTime: 0,
      enemiesKilled: 0, bossesKilled: 0, totalDamageDealt: 0,
    };
  }, []);

  const startGame = useCallback(() => {
    sRef.current = initState(selectedChar, selectedDiff, selectedLevel);
    setScreen("playing");
  }, [initState, selectedChar, selectedDiff, selectedLevel]);

  const handleSave = useCallback(() => {
    const s = sRef.current;
    if (!s) return {};
    return {
      character: s.character.id, difficulty: s.difficulty.id, level: s.level,
      hp: s.hp, maxHp: s.maxHp, shield: s.shield, weapon: s.weapon,
      weaponLevel: s.weaponLevel, energy: s.energy, score: s.score,
      wave: s.wave, enemiesKilled: s.enemiesKilled, bossesKilled: s.bossesKilled,
      unlockedLevels,
    };
  }, [unlockedLevels]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    const charId = (d.character as CharacterId) || "defense";
    const diffId = (d.difficulty as DifficultyId) || "normal";
    const levelId = (d.level as number) || 1;
    const s = initState(charId, diffId, levelId);
    s.hp = (d.hp as number) || s.hp;
    s.maxHp = (d.maxHp as number) || s.maxHp;
    s.shield = (d.shield as number) || 0;
    s.weapon = (d.weapon as WeaponType) || "normal";
    s.weaponLevel = (d.weaponLevel as number) || 1;
    s.energy = (d.energy as number) || 0;
    s.score = (d.score as number) || 0;
    s.wave = (d.wave as number) || 0;
    s.enemiesKilled = (d.enemiesKilled as number) || 0;
    s.bossesKilled = (d.bossesKilled as number) || 0;
    if (d.unlockedLevels) {
      const ul = d.unlockedLevels as number;
      setUnlockedLevels(Math.max(unlockedLevels, ul));
    }
    sRef.current = s;
    setScreen("playing");
  }, [initState, unlockedLevels]);

  // Submit score
  const submitScore = useCallback(async (finalScore: number) => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* ignore */ }
  }, []);

  /* ========== 游戏循环 (PixiJS) ========== */
  useEffect(() => {
    if (screen !== "playing" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const s = sRef.current!;
    let destroyed = false;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","a","d","w","s"," ","1","2","3","4"].includes(e.key)) {
        e.preventDefault();
        if (down) s.keys.add(e.key); else s.keys.delete(e.key);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      s.touchX = (e.touches[0].clientX - rect.left) * (W / rect.width);
    };
    const onTouchEnd = () => { s.touchX = null; };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("touchmove", onTouch, { passive: false });
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    const levelDef = LEVELS[s.level - 1] || LEVELS[0];

    async function initAndRun() {
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x050510, antialias: false });
      if (destroyed) { app.destroy(); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 11,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      makeText("hud_score", { fontSize: 11, fontWeight: "bold" });
      makeText("hud_wave", { fontSize: 11, fontWeight: "bold" });
      makeText("hud_hp", { fontSize: 8 });
      makeText("hud_energy", { fontSize: 8 });
      makeText("hud_weapon", { fontSize: 9, fill: "#3ea6ff", fontWeight: "bold" });
      makeText("hud_combo", { fontSize: 14, fill: "#f0b90b", fontWeight: "bold" });
      makeText("boss_label", { fontSize: 8, fontWeight: "bold" });
      for (let i = 0; i < 4; i++) makeText(`pu_${i}`, { fontSize: 10, fontWeight: "bold" });

      app.ticker.add(() => {
        if (destroyed) return;
      s.frame++;
      s.elapsedTime = Date.now() - s.startTime;

      // 星空滚动
      for (const star of s.stars) {
        star.y += star.speed;
        if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
      }

      // 武器切换 (数字键)
      if (s.keys.has("1")) { s.weapon = "normal"; s.keys.delete("1"); }
      if (s.keys.has("2") && s.energy >= WEAPONS.spread.energyCost) { s.weapon = "spread"; s.keys.delete("2"); }
      if (s.keys.has("3") && s.energy >= WEAPONS.laser.energyCost) { s.weapon = "laser"; s.keys.delete("3"); }
      if (s.keys.has("4") && s.energy >= WEAPONS.missile.energyCost) { s.weapon = "missile"; s.keys.delete("4"); }

      // 玩家移动
      const spd = s.character.speed;
      if (s.keys.has("ArrowLeft") || s.keys.has("a")) s.px -= spd;
      if (s.keys.has("ArrowRight") || s.keys.has("d")) s.px += spd;
      if (s.keys.has("ArrowUp") || s.keys.has("w")) s.py -= spd;
      if (s.keys.has("ArrowDown") || s.keys.has("s")) s.py += spd;
      if (s.touchX !== null) {
        const diff = s.touchX - s.px;
        s.px += Math.sign(diff) * Math.min(Math.abs(diff), spd);
      }
      s.px = Math.max(PLAYER_W / 2, Math.min(W - PLAYER_W / 2, s.px));
      s.py = Math.max(PLAYER_H, Math.min(H - PLAYER_H, s.py));
      if (s.invincible > 0) s.invincible--;
      // 自动射击
      s.shootCooldown--;
      const rate = s.character.fireRate;
      if (s.shootCooldown <= 0 && s.bullets.length < MAX_BULLETS) {
        s.shootCooldown = rate;
        fireBullets(s);
      }

      // 波次管理
      s.waveTimer--;
      if (s.waveTimer <= 0 && s.enemies.length === 0 && s.waveEnemiesLeft <= 0 && !s.levelCleared) {
        s.wave++;
        if (s.wave > levelDef.waves) {
          // Boss wave
          if (!s.bossActive) {
            s.enemies.push(spawnEnemy(s.wave, true, levelDef, s.difficulty));
            s.bossActive = true;
          }
        } else {
          s.waveEnemiesLeft = 3 + Math.floor(s.wave * 1.2) + (s.level - 1) * 2;
        }
        s.waveTimer = 60;
      }
      if (s.waveEnemiesLeft > 0 && s.enemies.length < MAX_ENEMIES && s.frame % 25 === 0) {
        s.enemies.push(spawnEnemy(s.wave, false, levelDef, s.difficulty));
        s.waveEnemiesLeft--;
      }

      // 更新子弹
      s.bullets = s.bullets.filter(b => {
        b.x += b.vx; b.y += b.vy; b.life--;
        return b.life > 0 && b.y > -10 && b.y < H + 10 && b.x > -10 && b.x < W + 10;
      });
      s.eBullets = s.eBullets.filter(b => {
        b.x += b.vx; b.y += b.vy;
        return b.y > -10 && b.y < H + 10 && b.x > -10 && b.x < W + 10;
      });

      // 更新敌人
      for (const e of s.enemies) {
        e.age++;
        if (e.type === "boss") {
          if (e.y < 60) e.y += e.speed;
          else e.x += Math.sin(e.age * 0.02) * 2;
          e.shootTimer--;
          if (e.shootTimer <= 0) {
            e.shootTimer = e.shootRate;
            e.pattern = (e.pattern + 1) % 3;
            if (e.pattern === 0) {
              for (let a = -3; a <= 3; a++) {
                const angle = Math.PI / 2 + a * 0.2;
                s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3, size: 4, color: "#ff4444" });
              }
            } else if (e.pattern === 1) {
              const dx = s.px - (e.x + e.w / 2), dy = s.py - (e.y + e.h);
              const dist = Math.hypot(dx, dy) || 1;
              s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: dx / dist * 4, vy: dy / dist * 4, size: 5, color: "#f0b90b" });
            } else {
              for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 / 8) * i + e.age * 0.05;
                s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5, size: 3, color: "#a855f7" });
              }
            }
          }
        } else {
          e.y += e.speed;
          if (e.pattern === 1) e.x += Math.sin(e.age * 0.05) * 1.5;
          else if (e.pattern === 2) e.x += Math.cos(e.age * 0.03) * 2;
          e.x = Math.max(0, Math.min(W - e.w, e.x));
          e.shootTimer--;
          if (e.shootTimer <= 0 && e.y > 0) {
            e.shootTimer = e.shootRate;
            if (e.type === "sniper") {
              const dx = s.px - (e.x + e.w / 2), dy = s.py - (e.y + e.h);
              const dist = Math.hypot(dx, dy) || 1;
              s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: dx / dist * 4, vy: dy / dist * 4, size: 3, color: "#ff4444" });
            } else {
              s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: 0, vy: 3, size: 3, color: e.color });
            }
          }
        }
      }
      s.enemies = s.enemies.filter(e => e.y < H + 50 || e.type === "boss");

      // 碰撞：玩家子弹 vs 敌人
      for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
        const b = s.bullets[bi];
        for (let ei = s.enemies.length - 1; ei >= 0; ei--) {
          const e = s.enemies[ei];
          if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
            e.hp -= b.damage;
            s.totalDamageDealt += b.damage;
            if (!b.piercing) s.bullets.splice(bi, 1);
            spawnParticles(s.particles, b.x, b.y, e.color, 3);
            if (e.hp <= 0) {
              s.score += e.reward * (1 + Math.floor(s.combo / 5));
              s.combo++;
              if (s.combo > s.maxCombo) s.maxCombo = s.combo;
              s.enemiesKilled++;
              s.energy = Math.min(s.maxEnergy, s.energy + e.energy);
              spawnParticles(s.particles, e.x + e.w / 2, e.y + e.h / 2, e.color, 12);
              if (e.type === "boss") {
                s.bossActive = false;
                s.bossesKilled++;
                s.levelCleared = true;
              }
              // 掉落道具
              if (Math.random() < 0.18 && s.powerups.length < MAX_POWERUPS) {
                const types: PowerUp["type"][] = ["energy", "shield", "hp", "bomb"];
                s.powerups.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, type: types[Math.floor(Math.random() * types.length)], vy: 1.5 });
              }
              s.enemies.splice(ei, 1);
            }
            break;
          }
        }
      }

      // 碰撞：敌人子弹 vs 玩家
      if (s.invincible <= 0) {
        for (let i = s.eBullets.length - 1; i >= 0; i--) {
          const b = s.eBullets[i];
          if (Math.hypot(b.x - s.px, b.y - s.py) < 14) {
            s.eBullets.splice(i, 1);
            if (s.shield > 0) { s.shield -= 10; spawnParticles(s.particles, s.px, s.py, s.character.color, 5); }
            else { s.hp -= 15; s.combo = 0; s.invincible = 60; spawnParticles(s.particles, s.px, s.py, "#ff4444", 8); }
          }
        }
        for (const e of s.enemies) {
          if (s.px > e.x - 10 && s.px < e.x + e.w + 10 && s.py > e.y - 10 && s.py < e.y + e.h + 10) {
            s.hp -= 25; s.combo = 0; s.invincible = 90;
            spawnParticles(s.particles, s.px, s.py, "#ff4444", 10);
          }
        }
      }

      // 道具拾取
      for (let i = s.powerups.length - 1; i >= 0; i--) {
        const pu = s.powerups[i];
        pu.y += pu.vy;
        if (pu.y > H + 20) { s.powerups.splice(i, 1); continue; }
        if (Math.hypot(pu.x - s.px, pu.y - s.py) < 20) {
          s.powerups.splice(i, 1);
          if (pu.type === "energy") { s.energy = Math.min(s.maxEnergy, s.energy + 25); }
          else if (pu.type === "hp") { s.hp = Math.min(s.maxHp, s.hp + 20); }
          else if (pu.type === "shield") { s.shield = Math.min(s.shield + 30, s.shieldMax); }
          else if (pu.type === "bomb") {
            for (const e of s.enemies) { if (e.type !== "boss") e.hp = 0; }
            s.eBullets = [];
            spawnParticles(s.particles, W / 2, H / 2, "#f0b90b", 30);
          }
        }
      }

      // 武器升级（能量满时自动升级）
      if (s.energy >= s.maxEnergy) {
        s.energy = 0;
        s.weaponLevel = Math.min(s.weaponLevel + 1, 5);
        // Auto-upgrade weapon
        const idx = WEAPON_ORDER.indexOf(s.weapon);
        if (idx < WEAPON_ORDER.length - 1) {
          s.weapon = WEAPON_ORDER[idx + 1];
        }
        spawnParticles(s.particles, s.px, s.py, "#f0b90b", 15);
      }

      // 更新粒子
      s.particles = s.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.life--;
        p.vx *= 0.96; p.vy *= 0.96;
        return p.life > 0;
      });

      // 关卡通关检测
      if (s.levelCleared) {
        const elapsed = Math.round(s.elapsedTime / 1000);
        const isVictory = true;
        setResultStats({ score: s.score, wave: s.wave, killed: s.enemiesKilled, bosses: s.bossesKilled, combo: s.maxCombo, time: elapsed, level: s.level, victory: isVictory });
        // Unlock next level
        if (s.level < 5) {
          const newUnlocked = Math.max(unlockedLevels, s.level + 1);
          setUnlockedLevels(newUnlocked);
          try { localStorage.setItem("spaceshoot_unlocked", String(newUnlocked)); } catch { /* ignore */ }
        }
        submitScore(s.score);
        setScreen("result");
        return;
      }

      // 死亡检测
      if (s.hp <= 0) {
        const elapsed = Math.round(s.elapsedTime / 1000);
        setResultStats({ score: s.score, wave: s.wave, killed: s.enemiesKilled, bosses: s.bossesKilled, combo: s.maxCombo, time: elapsed, level: s.level, victory: false });
        submitScore(s.score);
        setScreen("result");
        return;
      }

        // === DRAW (PixiJS) ===
        drawGamePixi(gfx, texts, s);
      });
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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [screen, submitScore, unlockedLevels]);

  /* ========== 角色图标 ========== */
  const CharIcon = ({ icon }: { icon: string }) => {
    if (icon === "wind") return <Wind size={20} />;
    if (icon === "flame") return <Flame size={20} />;
    return <Shield size={20} />;
  };

  /* ========== 标题画面 ========== */
  if (screen === "title") {
    return (
      <>
        <Header />
        <main className="max-w-[500px] mx-auto px-4 py-4 pb-20 md:pb-8">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-[#3ea6ff] transition"><ChevronLeft size={16} /></Link>
            <h1 className="text-lg font-bold">太空射击</h1>
          </div>

          <div className="bg-[#1a1a1a] rounded-2xl border border-[#333]/50 p-5 space-y-5">
            {/* 标题 */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#3ea6ff]/15 flex items-center justify-center mx-auto mb-2">
                <Rocket size={24} className="text-[#3ea6ff]" />
              </div>
              <h2 className="text-xl font-black text-[#3ea6ff]">太空射击</h2>
              <p className="text-[#666] text-xs mt-1">选择角色、难度和关卡开始战斗</p>
            </div>

            {/* 角色选择 */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5"><User size={14} className="text-[#3ea6ff]" />选择角色</h3>
              <div className="grid grid-cols-3 gap-2">
                {CHARACTERS.map(c => (
                  <button key={c.id} onClick={() => setSelectedChar(c.id)}
                    className={`p-3 rounded-xl border text-center transition ${selectedChar === c.id ? "border-[#3ea6ff] bg-[#3ea6ff]/10" : "border-[#333] hover:border-[#555]"}`}>
                    <div className="flex justify-center mb-1" style={{ color: c.color }}><CharIcon icon={c.icon} /></div>
                    <p className="text-xs font-bold" style={{ color: c.color }}>{c.name}</p>
                    <p className="text-[10px] text-[#888] mt-0.5">{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 难度选择 */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5"><Target size={14} className="text-[#f0b90b]" />选择难度</h3>
              <div className="flex gap-2">
                {DIFFICULTIES.map(d => (
                  <button key={d.id} onClick={() => setSelectedDiff(d.id)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-bold transition ${selectedDiff === d.id ? "border-[#f0b90b] bg-[#f0b90b]/10 text-[#f0b90b]" : "border-[#333] text-[#888] hover:border-[#555]"}`}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 关卡选择 */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5"><Star size={14} className="text-[#a855f7]" />选择关卡</h3>
              <div className="grid grid-cols-5 gap-1.5">
                {LEVELS.map(l => {
                  const locked = l.id > unlockedLevels;
                  return (
                    <button key={l.id} onClick={() => !locked && setSelectedLevel(l.id)}
                      disabled={locked}
                      className={`py-2 rounded-lg border text-xs font-bold transition ${locked ? "border-[#222] text-[#444] cursor-not-allowed" : selectedLevel === l.id ? "border-[#a855f7] bg-[#a855f7]/10 text-[#a855f7]" : "border-[#333] text-[#888] hover:border-[#555]"}`}>
                      {locked ? "?" : l.id}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-[#666] mt-1 text-center">
                {LEVELS[selectedLevel - 1]?.name || ""}
                {selectedLevel <= unlockedLevels ? ` - ${LEVELS[selectedLevel - 1]?.waves}波` : " - 未解锁"}
              </p>
            </div>

            {/* 操作说明 */}
            <div className="text-[10px] text-[#666] text-center space-y-0.5">
              <p>方向键/WASD移动 | 自动射击 | 1234切换武器</p>
              <p>手机触摸左右移动 | 击杀获取能量升级武器</p>
            </div>

            {/* 开始按钮 */}
            <button onClick={startGame}
              className="w-full py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95 flex items-center justify-center gap-2">
              <Play size={16} /> 开始战斗
            </button>
          </div>

          {/* Leaderboard & Save/Load */}
          <div className="mt-4 space-y-3">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </main>
      </>
    );
  }

  /* ========== 结算画面 ========== */
  if (screen === "result") {
    const r = resultStats;
    const timeStr = `${Math.floor(r.time / 60)}:${(r.time % 60).toString().padStart(2, "0")}`;
    return (
      <>
        <Header />
        <main className="max-w-[500px] mx-auto px-4 py-4 pb-20 md:pb-8">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-[#3ea6ff] transition"><ChevronLeft size={16} /></Link>
            <h1 className="text-lg font-bold">太空射击</h1>
          </div>

          <div className="bg-[#1a1a1a] rounded-2xl border border-[#333]/50 p-5">
            <div className="text-center mb-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 ${r.victory ? "bg-[#f0b90b]/15" : "bg-[#ff4444]/15"}`}>
                {r.victory ? <Trophy size={24} className="text-[#f0b90b]" /> : <Crosshair size={24} className="text-[#ff4444]" />}
              </div>
              <h2 className={`text-xl font-black ${r.victory ? "text-[#f0b90b]" : "text-[#ff4444]"}`}>
                {r.victory ? "关卡通过" : "任务失败"}
              </h2>
              <p className="text-[#888] text-xs mt-1">关卡 {r.level} - {LEVELS[r.level - 1]?.name}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="p-3 rounded-xl bg-[#212121] border border-[#333]/50 text-center">
                <p className="text-xl font-black text-[#3ea6ff]">{r.score.toLocaleString()}</p>
                <p className="text-[10px] text-[#888]">总分</p>
              </div>
              <div className="p-3 rounded-xl bg-[#212121] border border-[#333]/50 text-center">
                <p className="text-xl font-black text-[#2ba640]">{r.killed}</p>
                <p className="text-[10px] text-[#888]">击杀</p>
              </div>
              <div className="p-3 rounded-xl bg-[#212121] border border-[#333]/50 text-center">
                <p className="text-xl font-black text-[#f0b90b]">{timeStr}</p>
                <p className="text-[10px] text-[#888]">用时</p>
              </div>
              <div className="p-3 rounded-xl bg-[#212121] border border-[#333]/50 text-center">
                <p className="text-xl font-black text-[#a855f7]">{r.combo}x</p>
                <p className="text-[10px] text-[#888]">最高连击</p>
              </div>
              <div className="p-3 rounded-xl bg-[#212121] border border-[#333]/50 text-center">
                <p className="text-xl font-black text-[#ff4444]">{r.bosses}</p>
                <p className="text-[10px] text-[#888]">Boss击杀</p>
              </div>
              <div className="p-3 rounded-xl bg-[#212121] border border-[#333]/50 text-center">
                <p className="text-xl font-black text-[#3ea6ff]">{r.wave}</p>
                <p className="text-[10px] text-[#888]">波次</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setSelectedLevel(r.level); setScreen("title"); }}
                className="flex-1 py-3 rounded-xl border border-[#333] text-[#ccc] font-bold text-sm hover:bg-[#333]/30 transition flex items-center justify-center gap-1.5">
                <RotateCcw size={14} /> 返回
              </button>
              <button onClick={() => { sRef.current = initState(selectedChar, selectedDiff, r.level); setScreen("playing"); }}
                className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-1.5">
                <Play size={14} /> 再来一局
              </button>
              {r.victory && r.level < 5 && r.level < unlockedLevels && (
                <button onClick={() => { setSelectedLevel(r.level + 1); sRef.current = initState(selectedChar, selectedDiff, r.level + 1); setScreen("playing"); }}
                  className="flex-1 py-3 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm hover:bg-[#f0b90b]/80 transition flex items-center justify-center gap-1.5">
                  <Zap size={14} /> 下一关
                </button>
              )}
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
        <div className="flex items-center gap-2 mb-3">
          <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-[#3ea6ff] transition"><ChevronLeft size={16} /></Link>
          <h1 className="text-lg font-bold">太空射击</h1>
          <span className="text-[10px] text-[#666] ml-auto">关卡{sRef.current?.level || 1} - {LEVELS[(sRef.current?.level || 1) - 1]?.name}</span>
        </div>

        <div className="relative bg-black rounded-2xl overflow-hidden border border-[#333]/50 shadow-2xl">
          <canvas ref={canvasRef} width={W} height={H} className="w-full block" style={{ imageRendering: "pixelated" }} />
        </div>

        {/* 武器栏 */}
        <div className="mt-2 flex gap-1.5">
          {WEAPON_ORDER.map((wt, i) => {
            const wd = WEAPONS[wt];
            const current = sRef.current;
            const isActive = current?.weapon === wt;
            const hasEnergy = (current?.energy || 0) >= wd.energyCost || wt === "normal";
            return (
              <button key={wt}
                onClick={() => {
                  if (sRef.current && hasEnergy) sRef.current.weapon = wt;
                }}
                disabled={!hasEnergy}
                className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition ${isActive ? "border-[#3ea6ff] bg-[#3ea6ff]/10 text-[#3ea6ff]" : hasEnergy ? "border-[#333] text-[#888] hover:border-[#555]" : "border-[#222] text-[#444] cursor-not-allowed"}`}>
                {i + 1}. {wd.name}
              </button>
            );
          })}
        </div>

        <div className="mt-2 text-[10px] text-[#666] text-center">
          方向键/WASD移动 | 1234切换武器 | 击杀获取能量
        </div>
      </main>
    </>
  );
}
