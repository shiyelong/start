"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Type Definitions ────────────────────────────────────

interface Platform {
  x: number; y: number;
  width: number; height: number;
  type: "solid" | "oneway";
}

interface EnemySpawn {
  x: number; y: number;
  type: string;
  behavior: "patrol" | "chase" | "fly";
  hp: number;
  patrolRange?: number;
}

interface BossAttack {
  name: string;
  duration: number;
  cooldown: number;
}

interface BossPhase {
  hpThreshold: number;
  attacks: BossAttack[];
  speed: number;
}

interface BossConfig {
  name: string;
  hp: number;
  width: number;
  height: number;
  phases: BossPhase[];
}

interface ItemSpawn {
  x: number; y: number;
  type: "heal" | "atkBoost" | "shield" | "coin";
}

interface HiddenArea {
  x: number; y: number;
  width: number; height: number;
  reward: ItemSpawn[];
}

interface BgLayer {
  color: string;
  elements: { type: string; x: number; y: number; scale: number }[];
  speed: number;
}

interface Level {
  id: number;
  platforms: Platform[];
  enemies: EnemySpawn[];
  items: ItemSpawn[];
  boss?: BossConfig;
  hiddenAreas?: HiddenArea[];
  parTime: number;
  bgLayers: BgLayer[];
  width: number;
}

interface Player {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  attacking: boolean;
  attackTimer: number;
  invincible: number;
  doubleJumpUsed: boolean;
  onGround: boolean;
  facing: "left" | "right";
  animFrame: number;
  animTimer: number;
  coins: number;
  score: number;
  atkBoostTimer: number;
  shieldActive: boolean;
  abilities: { maxHpBonus: number; atkBonus: number; jumpBonus: number };
}

interface Enemy {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  type: string;
  behavior: "patrol" | "chase" | "fly";
  originX: number;
  patrolRange: number;
  dead: boolean;
  deathTimer: number;
  flyAngle: number;
  width: number;
  height: number;
}

interface Boss {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  width: number; height: number;
  name: string;
  phases: BossPhase[];
  currentPhase: number;
  attackTimer: number;
  currentAttack: number;
  dead: boolean;
  deathTimer: number;
  projectiles: Projectile[];
}

interface Projectile {
  x: number; y: number;
  vx: number; vy: number;
  width: number; height: number;
  active: boolean;
}

interface ActiveItem {
  x: number; y: number;
  type: "heal" | "atkBoost" | "shield" | "coin";
  collected: boolean;
}

interface HudNotification {
  text: string;
  timer: number;
}

interface LevelResult {
  stars: 1 | 2 | 3;
  time: number;
  remainingHp: number;
  score: number;
}

// ─── Physics Constants ───────────────────────────────────

const GRAVITY = 0.5;
const JUMP_SPEED = -10;
const MOVE_SPEED = 4;
const DOUBLE_JUMP_SPEED = -8;
const INVINCIBLE_FRAMES = 60;
const CANVAS_W = 800;
const CANVAS_H = 500;
const ATTACK_DURATION = 15;
const ATTACK_RANGE = 40;
const PLAYER_W = 28;
const PLAYER_H = 36;

// ─── Pure Functions (exported for testing) ───────────────

function calculateStars(
  remainingHpPercent: number,
  time: number,
  parTime: number
): 1 | 2 | 3 {
  if (remainingHpPercent > 70 && time < parTime) return 3;
  if (remainingHpPercent > 40) return 2;
  return 1;
}

function applyGravity(vy: number): number {
  return vy + GRAVITY;
}

function applyJump(onGround: boolean, doubleJumpUsed: boolean, jumpBonus: number): { vy: number; onGround: boolean; doubleJumpUsed: boolean } | null {
  if (onGround) {
    return { vy: JUMP_SPEED - jumpBonus, onGround: false, doubleJumpUsed: false };
  } else if (!doubleJumpUsed) {
    return { vy: DOUBLE_JUMP_SPEED - jumpBonus, onGround: false, doubleJumpUsed: true };
  }
  return null;
}

function checkPlatformCollision(
  px: number, py: number, pw: number, ph: number,
  vy: number,
  platform: Platform
): { y: number; vy: number; onGround: boolean } | null {
  const playerBottom = py + ph;
  const playerTop = py;
  const playerLeft = px;
  const playerRight = px + pw;
  const platTop = platform.y;
  const platBottom = platform.y + platform.height;
  const platLeft = platform.x;
  const platRight = platform.x + platform.width;

  if (playerRight <= platLeft || playerLeft >= platRight) return null;

  if (platform.type === "oneway") {
    if (vy >= 0 && playerBottom >= platTop && playerBottom <= platTop + vy + 8 && playerTop < platTop) {
      return { y: platTop - ph, vy: 0, onGround: true };
    }
    return null;
  }

  // solid platform
  if (vy >= 0 && playerBottom >= platTop && playerBottom <= platTop + vy + 8 && playerTop < platTop) {
    return { y: platTop - ph, vy: 0, onGround: true };
  }
  if (vy < 0 && playerTop <= platBottom && playerTop >= platBottom + vy - 4) {
    return { y: platBottom, vy: 0, onGround: false };
  }
  return null;
}

function applyItemEffect(
  player: Pick<Player, "hp" | "maxHp" | "atkBoostTimer" | "shieldActive" | "coins" | "score">,
  itemType: "heal" | "atkBoost" | "shield" | "coin"
): Pick<Player, "hp" | "maxHp" | "atkBoostTimer" | "shieldActive" | "coins" | "score"> {
  const result = { ...player };
  switch (itemType) {
    case "heal":
      result.hp = Math.min(result.maxHp, result.hp + Math.floor(result.maxHp * 0.25));
      break;
    case "atkBoost":
      result.atkBoostTimer = 900;
      break;
    case "shield":
      result.shieldActive = true;
      break;
    case "coin":
      result.coins += 1;
      result.score += 100;
      break;
  }
  return result;
}

function checkRectCollision(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}


// ─── Shadow Enemy Types ──────────────────────────────────

const ENEMY_TYPES = {
  specter: { width: 24, height: 22, color: "#8a5cf5" },
  wraith: { width: 30, height: 28, color: "#c44dff" },
  phantom: { width: 28, height: 20, color: "#6b3fa0" },
};

// ─── Background Layers (dark mist, ruined pillars, ghostly wisps) ─

const makeBgLayers = (variant: number): BgLayer[] => [
  {
    color: variant < 3 ? "#1a0a2e" : "#0d0618",
    elements: [
      { type: "mist", x: 80, y: 50, scale: 1.2 },
      { type: "mist", x: 350, y: 30, scale: 0.8 },
      { type: "mist", x: 620, y: 60, scale: 1.0 },
    ],
    speed: 0.1,
  },
  {
    color: variant < 3 ? "#2a1a3e" : "#1a0a2e",
    elements: [
      { type: "pillar", x: 0, y: 200, scale: 1 },
      { type: "pillar", x: 280, y: 180, scale: 1.3 },
      { type: "pillar", x: 560, y: 210, scale: 0.9 },
    ],
    speed: 0.3,
  },
  {
    color: "#3a1a5e",
    elements: [
      { type: "wisp", x: 60, y: 310, scale: 1 },
      { type: "wisp", x: 220, y: 290, scale: 0.7 },
      { type: "wisp", x: 480, y: 320, scale: 1.1 },
      { type: "tombstone", x: 370, y: 360, scale: 1 },
    ],
    speed: 0.5,
  },
];

// ─── Level Data ──────────────────────────────────────────

const LEVELS: Level[] = [
  // Level 1 - Haunted Entrance
  {
    id: 1, width: 3000, parTime: 60,
    bgLayers: makeBgLayers(1),
    platforms: [
      { x: 0, y: 460, width: 600, height: 40, type: "solid" },
      { x: 250, y: 370, width: 120, height: 16, type: "oneway" },
      { x: 500, y: 320, width: 100, height: 16, type: "oneway" },
      { x: 700, y: 460, width: 500, height: 40, type: "solid" },
      { x: 850, y: 360, width: 100, height: 16, type: "oneway" },
      { x: 1050, y: 300, width: 120, height: 16, type: "oneway" },
      { x: 1300, y: 460, width: 600, height: 40, type: "solid" },
      { x: 1500, y: 350, width: 100, height: 16, type: "oneway" },
      { x: 1700, y: 280, width: 120, height: 16, type: "oneway" },
      { x: 2000, y: 460, width: 500, height: 40, type: "solid" },
      { x: 2200, y: 370, width: 100, height: 16, type: "oneway" },
      { x: 2500, y: 460, width: 500, height: 40, type: "solid" },
    ],
    enemies: [
      { x: 300, y: 436, type: "specter", behavior: "patrol", hp: 2, patrolRange: 100 },
      { x: 800, y: 436, type: "specter", behavior: "patrol", hp: 2, patrolRange: 80 },
      { x: 1500, y: 436, type: "wraith", behavior: "chase", hp: 3 },
    ],
    items: [
      { x: 280, y: 340, type: "coin" },
      { x: 520, y: 290, type: "coin" },
      { x: 870, y: 330, type: "heal" },
      { x: 1520, y: 320, type: "coin" },
      { x: 2250, y: 340, type: "coin" },
    ],
    hiddenAreas: [
      { x: 1700, y: 240, width: 80, height: 40, reward: [{ x: 1720, y: 250, type: "coin" }, { x: 1750, y: 250, type: "coin" }] },
    ],
  },
  // Level 2 - Crypt Corridors
  {
    id: 2, width: 3500, parTime: 75,
    bgLayers: makeBgLayers(2),
    platforms: [
      { x: 0, y: 460, width: 400, height: 40, type: "solid" },
      { x: 200, y: 370, width: 80, height: 16, type: "oneway" },
      { x: 350, y: 300, width: 80, height: 16, type: "oneway" },
      { x: 500, y: 400, width: 150, height: 60, type: "solid" },
      { x: 700, y: 350, width: 100, height: 16, type: "oneway" },
      { x: 900, y: 460, width: 400, height: 40, type: "solid" },
      { x: 1000, y: 340, width: 100, height: 16, type: "oneway" },
      { x: 1200, y: 280, width: 80, height: 16, type: "oneway" },
      { x: 1400, y: 460, width: 500, height: 40, type: "solid" },
      { x: 1600, y: 360, width: 120, height: 16, type: "oneway" },
      { x: 1800, y: 300, width: 100, height: 16, type: "oneway" },
      { x: 2000, y: 460, width: 400, height: 40, type: "solid" },
      { x: 2200, y: 380, width: 80, height: 16, type: "oneway" },
      { x: 2400, y: 320, width: 100, height: 16, type: "oneway" },
      { x: 2600, y: 460, width: 500, height: 40, type: "solid" },
      { x: 2800, y: 350, width: 120, height: 16, type: "oneway" },
      { x: 3100, y: 460, width: 400, height: 40, type: "solid" },
    ],
    enemies: [
      { x: 200, y: 436, type: "specter", behavior: "patrol", hp: 3, patrolRange: 100 },
      { x: 600, y: 376, type: "specter", behavior: "patrol", hp: 3, patrolRange: 60 },
      { x: 1100, y: 436, type: "wraith", behavior: "chase", hp: 4 },
      { x: 1600, y: 436, type: "wraith", behavior: "chase", hp: 4 },
      { x: 2100, y: 436, type: "specter", behavior: "patrol", hp: 3, patrolRange: 80 },
      { x: 2700, y: 300, type: "phantom", behavior: "fly", hp: 2 },
    ],
    items: [
      { x: 220, y: 340, type: "coin" },
      { x: 370, y: 270, type: "coin" },
      { x: 720, y: 320, type: "atkBoost" },
      { x: 1020, y: 310, type: "coin" },
      { x: 1620, y: 330, type: "heal" },
      { x: 2220, y: 350, type: "coin" },
      { x: 2820, y: 320, type: "shield" },
    ],
  },
  // Level 3 - Shadow Throne (Boss: Shadow Lord)
  {
    id: 3, width: 4000, parTime: 90,
    bgLayers: makeBgLayers(3),
    platforms: [
      { x: 0, y: 460, width: 500, height: 40, type: "solid" },
      { x: 200, y: 360, width: 100, height: 16, type: "oneway" },
      { x: 400, y: 300, width: 80, height: 16, type: "oneway" },
      { x: 600, y: 400, width: 200, height: 60, type: "solid" },
      { x: 850, y: 340, width: 100, height: 16, type: "oneway" },
      { x: 1050, y: 460, width: 500, height: 40, type: "solid" },
      { x: 1200, y: 350, width: 120, height: 16, type: "oneway" },
      { x: 1400, y: 280, width: 100, height: 16, type: "oneway" },
      { x: 1600, y: 460, width: 400, height: 40, type: "solid" },
      { x: 1800, y: 370, width: 80, height: 16, type: "oneway" },
      { x: 2000, y: 300, width: 100, height: 16, type: "oneway" },
      { x: 2200, y: 460, width: 400, height: 40, type: "solid" },
      { x: 2400, y: 360, width: 120, height: 16, type: "oneway" },
      { x: 2700, y: 460, width: 300, height: 40, type: "solid" },
      // Boss arena
      { x: 3100, y: 460, width: 900, height: 40, type: "solid" },
      { x: 3300, y: 360, width: 100, height: 16, type: "oneway" },
      { x: 3600, y: 320, width: 100, height: 16, type: "oneway" },
    ],
    enemies: [
      { x: 250, y: 436, type: "specter", behavior: "patrol", hp: 3, patrolRange: 100 },
      { x: 700, y: 376, type: "wraith", behavior: "chase", hp: 5 },
      { x: 1200, y: 436, type: "wraith", behavior: "chase", hp: 5 },
      { x: 1800, y: 300, type: "phantom", behavior: "fly", hp: 3 },
      { x: 2300, y: 436, type: "specter", behavior: "patrol", hp: 4, patrolRange: 80 },
      { x: 2500, y: 280, type: "phantom", behavior: "fly", hp: 3 },
    ],
    items: [
      { x: 220, y: 330, type: "coin" },
      { x: 420, y: 270, type: "coin" },
      { x: 870, y: 310, type: "heal" },
      { x: 1220, y: 320, type: "coin" },
      { x: 1820, y: 340, type: "atkBoost" },
      { x: 2420, y: 330, type: "coin" },
      { x: 2750, y: 430, type: "heal" },
    ],
    boss: {
      name: "Shadow Lord",
      hp: 30,
      width: 50,
      height: 60,
      phases: [
        {
          hpThreshold: 50,
          attacks: [
            { name: "dark_bolt", duration: 60, cooldown: 90 },
            { name: "shadow_charge", duration: 40, cooldown: 120 },
            { name: "summon_shades", duration: 30, cooldown: 150 },
          ],
          speed: 1.5,
        },
        {
          hpThreshold: 0,
          attacks: [
            { name: "void_barrage", duration: 80, cooldown: 60 },
            { name: "dark_slam", duration: 50, cooldown: 80 },
            { name: "shadow_storm", duration: 90, cooldown: 100 },
          ],
          speed: 2.5,
        },
      ],
    },
    hiddenAreas: [
      { x: 2000, y: 250, width: 80, height: 50, reward: [{ x: 2020, y: 260, type: "coin" }, { x: 2050, y: 260, type: "heal" }] },
    ],
  },
  // Level 4 - Abyssal Depths
  {
    id: 4, width: 4000, parTime: 90,
    bgLayers: makeBgLayers(4),
    platforms: [
      { x: 0, y: 460, width: 300, height: 40, type: "solid" },
      { x: 150, y: 370, width: 80, height: 16, type: "oneway" },
      { x: 350, y: 320, width: 100, height: 16, type: "oneway" },
      { x: 500, y: 260, width: 80, height: 16, type: "oneway" },
      { x: 650, y: 400, width: 200, height: 60, type: "solid" },
      { x: 900, y: 340, width: 100, height: 16, type: "oneway" },
      { x: 1100, y: 460, width: 400, height: 40, type: "solid" },
      { x: 1250, y: 350, width: 100, height: 16, type: "oneway" },
      { x: 1450, y: 280, width: 80, height: 16, type: "oneway" },
      { x: 1600, y: 460, width: 300, height: 40, type: "solid" },
      { x: 1750, y: 370, width: 100, height: 16, type: "oneway" },
      { x: 1950, y: 300, width: 80, height: 16, type: "oneway" },
      { x: 2100, y: 460, width: 400, height: 40, type: "solid" },
      { x: 2300, y: 360, width: 120, height: 16, type: "oneway" },
      { x: 2500, y: 280, width: 100, height: 16, type: "oneway" },
      { x: 2700, y: 460, width: 400, height: 40, type: "solid" },
      { x: 2900, y: 350, width: 100, height: 16, type: "oneway" },
      { x: 3100, y: 460, width: 500, height: 40, type: "solid" },
      { x: 3400, y: 370, width: 80, height: 16, type: "oneway" },
      { x: 3600, y: 460, width: 400, height: 40, type: "solid" },
    ],
    enemies: [
      { x: 200, y: 436, type: "specter", behavior: "patrol", hp: 4, patrolRange: 80 },
      { x: 700, y: 376, type: "wraith", behavior: "chase", hp: 6 },
      { x: 1200, y: 436, type: "wraith", behavior: "chase", hp: 6 },
      { x: 1500, y: 280, type: "phantom", behavior: "fly", hp: 4 },
      { x: 1900, y: 436, type: "specter", behavior: "patrol", hp: 5, patrolRange: 100 },
      { x: 2400, y: 300, type: "phantom", behavior: "fly", hp: 4 },
      { x: 2800, y: 436, type: "wraith", behavior: "chase", hp: 6 },
      { x: 3200, y: 436, type: "specter", behavior: "patrol", hp: 5, patrolRange: 80 },
    ],
    items: [
      { x: 170, y: 340, type: "coin" },
      { x: 370, y: 290, type: "coin" },
      { x: 520, y: 230, type: "shield" },
      { x: 920, y: 310, type: "coin" },
      { x: 1270, y: 320, type: "heal" },
      { x: 1770, y: 340, type: "coin" },
      { x: 1970, y: 270, type: "atkBoost" },
      { x: 2320, y: 330, type: "coin" },
      { x: 2920, y: 320, type: "heal" },
    ],
    hiddenAreas: [
      { x: 500, y: 210, width: 80, height: 50, reward: [{ x: 520, y: 220, type: "coin" }, { x: 550, y: 220, type: "coin" }] },
    ],
  },
  // Level 5 - Void Sanctum (Final Boss: Void King)
  {
    id: 5, width: 4500, parTime: 120,
    bgLayers: makeBgLayers(5),
    platforms: [
      { x: 0, y: 460, width: 400, height: 40, type: "solid" },
      { x: 200, y: 360, width: 100, height: 16, type: "oneway" },
      { x: 400, y: 300, width: 80, height: 16, type: "oneway" },
      { x: 550, y: 400, width: 200, height: 60, type: "solid" },
      { x: 800, y: 340, width: 100, height: 16, type: "oneway" },
      { x: 1000, y: 460, width: 400, height: 40, type: "solid" },
      { x: 1150, y: 350, width: 100, height: 16, type: "oneway" },
      { x: 1350, y: 280, width: 80, height: 16, type: "oneway" },
      { x: 1500, y: 460, width: 300, height: 40, type: "solid" },
      { x: 1650, y: 370, width: 100, height: 16, type: "oneway" },
      { x: 1850, y: 300, width: 80, height: 16, type: "oneway" },
      { x: 2000, y: 460, width: 400, height: 40, type: "solid" },
      { x: 2200, y: 360, width: 120, height: 16, type: "oneway" },
      { x: 2400, y: 280, width: 100, height: 16, type: "oneway" },
      { x: 2600, y: 460, width: 400, height: 40, type: "solid" },
      { x: 2800, y: 350, width: 100, height: 16, type: "oneway" },
      { x: 3000, y: 460, width: 300, height: 40, type: "solid" },
      // Boss arena
      { x: 3400, y: 460, width: 1100, height: 40, type: "solid" },
      { x: 3600, y: 360, width: 120, height: 16, type: "oneway" },
      { x: 3900, y: 300, width: 100, height: 16, type: "oneway" },
      { x: 4100, y: 360, width: 120, height: 16, type: "oneway" },
    ],
    enemies: [
      { x: 250, y: 436, type: "wraith", behavior: "chase", hp: 7 },
      { x: 600, y: 376, type: "specter", behavior: "patrol", hp: 5, patrolRange: 80 },
      { x: 1100, y: 436, type: "wraith", behavior: "chase", hp: 7 },
      { x: 1400, y: 280, type: "phantom", behavior: "fly", hp: 5 },
      { x: 1700, y: 436, type: "wraith", behavior: "chase", hp: 7 },
      { x: 2100, y: 300, type: "phantom", behavior: "fly", hp: 5 },
      { x: 2500, y: 436, type: "specter", behavior: "patrol", hp: 6, patrolRange: 100 },
      { x: 2900, y: 436, type: "wraith", behavior: "chase", hp: 8 },
    ],
    items: [
      { x: 220, y: 330, type: "heal" },
      { x: 420, y: 270, type: "coin" },
      { x: 820, y: 310, type: "atkBoost" },
      { x: 1170, y: 320, type: "coin" },
      { x: 1670, y: 340, type: "heal" },
      { x: 1870, y: 270, type: "shield" },
      { x: 2220, y: 330, type: "coin" },
      { x: 2820, y: 320, type: "heal" },
      { x: 3050, y: 430, type: "heal" },
    ],
    boss: {
      name: "Void King",
      hp: 50,
      width: 60,
      height: 70,
      phases: [
        {
          hpThreshold: 50,
          attacks: [
            { name: "void_strike", duration: 50, cooldown: 80 },
            { name: "dark_storm", duration: 70, cooldown: 100 },
            { name: "shadow_whip", duration: 40, cooldown: 90 },
          ],
          speed: 1.2,
        },
        {
          hpThreshold: 0,
          attacks: [
            { name: "mega_void", duration: 60, cooldown: 60 },
            { name: "abyss_fury", duration: 90, cooldown: 70 },
            { name: "dark_slam", duration: 50, cooldown: 50 },
          ],
          speed: 2.0,
        },
      ],
    },
    hiddenAreas: [
      { x: 1850, y: 250, width: 80, height: 50, reward: [{ x: 1870, y: 260, type: "coin" }, { x: 1870, y: 260, type: "heal" }] },
    ],
  },
];


// ─── Game State Types ────────────────────────────────────

type GamePhase = "menu" | "levelSelect" | "playing" | "paused" | "victory" | "gameOver" | "upgrade";

interface GameStateRef {
  phase: GamePhase;
  level: number;
  player: Player;
  enemies: Enemy[];
  boss: Boss | null;
  items: ActiveItem[];
  camera: { x: number };
  time: number;
  frameCount: number;
  notifications: HudNotification[];
  levelResults: (LevelResult | null)[];
  unlockedLevels: number;
  keys: Set<string>;
  touchControls: { left: boolean; right: boolean; jump: boolean; attack: boolean };
  victoryTimer: number;
}

// ─── Helper: Create initial player ──────────────────────

function createPlayer(abilities?: Player["abilities"]): Player {
  const ab = abilities || { maxHpBonus: 0, atkBonus: 0, jumpBonus: 0 };
  return {
    x: 50, y: 400, vx: 0, vy: 0,
    hp: 100 + ab.maxHpBonus, maxHp: 100 + ab.maxHpBonus,
    atk: 10 + ab.atkBonus,
    attacking: false, attackTimer: 0,
    invincible: 0, doubleJumpUsed: false, onGround: false,
    facing: "right", animFrame: 0, animTimer: 0,
    coins: 0, score: 0, atkBoostTimer: 0, shieldActive: false,
    abilities: ab,
  };
}

function spawnEnemies(spawns: EnemySpawn[]): Enemy[] {
  return spawns.map(s => {
    const info = ENEMY_TYPES[s.type as keyof typeof ENEMY_TYPES] || ENEMY_TYPES.specter;
    return {
      x: s.x, y: s.y, vx: s.behavior === "patrol" ? 1 : 0, vy: 0,
      hp: s.hp, maxHp: s.hp, type: s.type,
      behavior: s.behavior, originX: s.x,
      patrolRange: s.patrolRange || 80,
      dead: false, deathTimer: 0, flyAngle: 0,
      width: info.width, height: info.height,
    };
  });
}

function spawnBoss(config: BossConfig, levelWidth: number): Boss {
  return {
    x: levelWidth - 300, y: 400, vx: 0, vy: 0,
    hp: config.hp, maxHp: config.hp,
    width: config.width, height: config.height,
    name: config.name, phases: config.phases,
    currentPhase: 0, attackTimer: 60, currentAttack: 0,
    dead: false, deathTimer: 0, projectiles: [],
  };
}

function spawnItems(spawns: ItemSpawn[], hidden?: HiddenArea[]): ActiveItem[] {
  const items: ActiveItem[] = spawns.map(s => ({ ...s, collected: false }));
  if (hidden) {
    hidden.forEach(h => h.reward.forEach(r => items.push({ ...r, collected: false })));
  }
  return items;
}

// ─── Hex color to PixiJS number ──────────────────────────
function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}


// ─── Main Component ──────────────────────────────────────

export default function ShadowDungeonPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameStateRef | null>(null);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);
  const [uiPhase, setUiPhase] = useState<GamePhase>("menu");
  const [, setUiLevel] = useState(1);
  const [, setUiHp] = useState(100);
  const [, setUiMaxHp] = useState(100);
  const [, setUiCoins] = useState(0);
  const [uiScore, setUiScore] = useState(0);
  const [, setUiTime] = useState(0);
  const [uiResults, setUiResults] = useState<(LevelResult | null)[]>([null, null, null, null, null]);
  const [uiUnlocked, setUiUnlocked] = useState(1);
  const [upgradeChoices, setUpgradeChoices] = useState<string[]>([]);

  const initLevel = useCallback((levelIdx: number, abilities?: Player["abilities"]) => {
    const level = LEVELS[levelIdx];
    if (!level) return;
    const player = createPlayer(abilities);
    const gs: GameStateRef = {
      phase: "playing",
      level: levelIdx,
      player,
      enemies: spawnEnemies(level.enemies),
      boss: level.boss ? spawnBoss(level.boss, level.width) : null,
      items: spawnItems(level.items, level.hiddenAreas),
      camera: { x: 0 },
      time: 0,
      frameCount: 0,
      notifications: [],
      levelResults: gsRef.current?.levelResults || [null, null, null, null, null],
      unlockedLevels: gsRef.current?.unlockedLevels || 1,
      keys: new Set(),
      touchControls: { left: false, right: false, jump: false, attack: false },
      victoryTimer: 0,
    };
    gsRef.current = gs;
    setUiPhase("playing");
    setUiLevel(level.id);
  }, []);


  // ─── PixiJS Render Loop ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: CANVAS_W, height: CANVAS_H, backgroundColor: 0x0d0618, antialias: true });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const g = new pixi.Graphics();
      app.stage.addChild(g);
      pixiGfxRef.current = g;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 12,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "monospace",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (70 objects)
      for (let i = 0; i < 70; i++) makeText(`t${i}`, { fontSize: 12 });

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: { fill?: string; fontSize?: number; fontWeight?: string; alpha?: number }) => {
        if (textIdx >= 70) return;
        const t = texts.get(`t${textIdx}`)!;
        textIdx++;
        t.text = text;
        t.x = x; t.y = y;
        t.anchor.set(0, 0);
        t.alpha = opts?.alpha ?? 1;
        t.style.fill = opts?.fill ?? "#ffffff";
        t.style.fontSize = opts?.fontSize ?? 12;
        t.style.fontWeight = (opts?.fontWeight ?? "normal") as "normal" | "bold";
        t.visible = true;
      };

      const cn = hexToNum;

      app.ticker.add(() => {
        if (destroyed) return;
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        const gs = gsRef.current;
        if (!gs || gs.phase !== "playing") return;

        const level = LEVELS[gs.level];
        gs.frameCount++;
        gs.time += 1 / 60;

        const p = gs.player;
        const keys = gs.keys;
        const tc = gs.touchControls;

        // ── Input ──
        const moveLeft = keys.has("ArrowLeft") || tc.left;
        const moveRight = keys.has("ArrowRight") || tc.right;
        const jumpPressed = keys.has("z") || keys.has("Z") || keys.has("ArrowUp") || tc.jump;
        const attackPressed = keys.has("x") || keys.has("X") || tc.attack;

        // ── Player Movement ──
        p.vx = 0;
        if (moveLeft) { p.vx = -(MOVE_SPEED); p.facing = "left"; }
        if (moveRight) { p.vx = MOVE_SPEED; p.facing = "right"; }

        // Jump
        if (jumpPressed && !keys.has("_jumpHeld")) {
          keys.add("_jumpHeld");
          const result = applyJump(p.onGround, p.doubleJumpUsed, p.abilities.jumpBonus);
          if (result) {
            p.vy = result.vy;
            p.onGround = result.onGround;
            p.doubleJumpUsed = result.doubleJumpUsed;
          }
        }
        if (!jumpPressed) keys.delete("_jumpHeld");

        // Attack
        if (attackPressed && !p.attacking) {
          p.attacking = true;
          p.attackTimer = ATTACK_DURATION;
        }
        if (p.attacking) {
          p.attackTimer--;
          if (p.attackTimer <= 0) p.attacking = false;
        }

        // Gravity
        p.vy = applyGravity(p.vy);
        p.x += p.vx;
        p.y += p.vy;
        p.onGround = false;

        // Platform collision
        for (const plat of level.platforms) {
          const result = checkPlatformCollision(p.x, p.y, PLAYER_W, PLAYER_H, p.vy, plat);
          if (result) {
            p.y = result.y;
            p.vy = result.vy;
            if (result.onGround) {
              p.onGround = true;
              p.doubleJumpUsed = false;
            }
          }
          if (plat.type === "solid") {
            if (p.x + PLAYER_W > plat.x && p.x < plat.x + plat.width &&
                p.y + PLAYER_H > plat.y + 6 && p.y < plat.y + plat.height) {
              if (p.vx > 0 && p.x + PLAYER_W - p.vx <= plat.x) {
                p.x = plat.x - PLAYER_W;
              } else if (p.vx < 0 && p.x - p.vx >= plat.x + plat.width) {
                p.x = plat.x + plat.width;
              }
            }
          }
        }

        // Bounds
        if (p.x < 0) p.x = 0;
        if (p.x > level.width - PLAYER_W) p.x = level.width - PLAYER_W;
        if (p.y > CANVAS_H + 50) p.hp = 0;
        if (p.invincible > 0) p.invincible--;
        if (p.atkBoostTimer > 0) p.atkBoostTimer--;
        p.animTimer++;
        if (p.animTimer > 8) { p.animTimer = 0; p.animFrame++; }

        // ── Enemy AI ──
        gs.enemies.forEach(e => {
          if (e.dead) { e.deathTimer--; return; }
          switch (e.behavior) {
            case "patrol":
              e.x += e.vx;
              if (Math.abs(e.x - e.originX) > e.patrolRange) e.vx = -e.vx;
              break;
            case "chase": {
              const dx = p.x - e.x;
              e.vx = dx > 0 ? 1.5 : -1.5;
              if (Math.abs(dx) < 300) e.x += e.vx;
              break;
            }
            case "fly":
              e.flyAngle += 0.03;
              e.y = e.originX + Math.sin(e.flyAngle) * 30;
              const fdx = p.x - e.x;
              if (Math.abs(fdx) < 350) e.x += (fdx > 0 ? 1 : -1);
              break;
          }

          if (p.invincible <= 0 && !e.dead &&
              checkRectCollision(p.x, p.y, PLAYER_W, PLAYER_H, e.x, e.y, e.width, e.height)) {
            if (p.shieldActive) {
              p.shieldActive = false;
              gs.notifications.push({ text: "Shield broken!", timer: 120 });
            } else {
              p.hp -= 15;
              p.score -= 50;
            }
            p.invincible = INVINCIBLE_FRAMES;
          }

          if (p.attacking && p.attackTimer === ATTACK_DURATION - 1 && !e.dead) {
            const atkX = p.facing === "right" ? p.x + PLAYER_W : p.x - ATTACK_RANGE;
            if (checkRectCollision(atkX, p.y + 4, ATTACK_RANGE, 20, e.x, e.y, e.width, e.height)) {
              const dmg = p.atkBoostTimer > 0 ? p.atk * 2 : p.atk;
              e.hp -= dmg;
              if (e.hp <= 0) {
                e.dead = true;
                e.deathTimer = 30;
                p.score += 200;
                p.coins += 1;
              }
            }
          }
        });
        gs.enemies = gs.enemies.filter(e => !e.dead || e.deathTimer > 0);

        // ── Boss AI ──
        if (gs.boss && !gs.boss.dead) {
          const b = gs.boss;
          const hpPct = (b.hp / b.maxHp) * 100;
          const phaseIdx = hpPct > 50 ? 0 : 1;
          if (phaseIdx !== b.currentPhase) {
            b.currentPhase = phaseIdx;
            b.attackTimer = 30;
            gs.notifications.push({ text: `${b.name} enraged!`, timer: 120 });
          }
          const phase = b.phases[b.currentPhase];
          b.attackTimer--;

          if (b.attackTimer <= 0) {
            const attack = phase.attacks[b.currentAttack % phase.attacks.length];
            if (attack.name.includes("charge") || attack.name.includes("slam") || attack.name.includes("strike") || attack.name.includes("whip")) {
              b.vx = p.x > b.x ? phase.speed * 3 : -phase.speed * 3;
            } else if (attack.name.includes("bolt") || attack.name.includes("storm") || attack.name.includes("barrage") || attack.name.includes("fury") || attack.name.includes("void")) {
              for (let i = 0; i < 3; i++) {
                b.projectiles.push({
                  x: b.x + b.width / 2, y: b.y + 20,
                  vx: (p.x > b.x ? 3 : -3) + (Math.random() - 0.5) * 2,
                  vy: -2 + Math.random() * 2,
                  width: 10, height: 10, active: true,
                });
              }
            } else {
              b.vx = p.x > b.x ? phase.speed : -phase.speed;
            }
            b.currentAttack++;
            b.attackTimer = attack.cooldown;
          }

          b.x += b.vx;
          b.vx *= 0.95;
          const arenaStart = level.width - 1100;
          if (b.x < arenaStart) b.x = arenaStart;
          if (b.x > level.width - b.width - 50) b.x = level.width - b.width - 50;

          b.projectiles.forEach(proj => {
            if (!proj.active) return;
            proj.x += proj.vx;
            proj.y += proj.vy;
            proj.vy += 0.1;
            if (proj.y > CANVAS_H || proj.x < 0 || proj.x > level.width) proj.active = false;
            if (p.invincible <= 0 && checkRectCollision(p.x, p.y, PLAYER_W, PLAYER_H, proj.x, proj.y, proj.width, proj.height)) {
              if (p.shieldActive) { p.shieldActive = false; } else { p.hp -= 10; }
              p.invincible = INVINCIBLE_FRAMES;
              proj.active = false;
            }
          });
          b.projectiles = b.projectiles.filter(proj => proj.active);

          if (p.invincible <= 0 && checkRectCollision(p.x, p.y, PLAYER_W, PLAYER_H, b.x, b.y, b.width, b.height)) {
            if (p.shieldActive) { p.shieldActive = false; } else { p.hp -= 20; }
            p.invincible = INVINCIBLE_FRAMES;
          }

          if (p.attacking && p.attackTimer === ATTACK_DURATION - 1) {
            const atkX = p.facing === "right" ? p.x + PLAYER_W : p.x - ATTACK_RANGE;
            if (checkRectCollision(atkX, p.y + 4, ATTACK_RANGE, 20, b.x, b.y, b.width, b.height)) {
              const dmg = p.atkBoostTimer > 0 ? p.atk * 2 : p.atk;
              b.hp -= dmg;
              if (b.hp <= 0) {
                b.dead = true;
                b.deathTimer = 60;
                p.score += 1000;
                gs.victoryTimer = 120;
                gs.notifications.push({ text: `${b.name} defeated!`, timer: 180 });
              }
            }
          }
        }

        // ── Items ──
        gs.items.forEach(item => {
          if (item.collected) return;
          if (checkRectCollision(p.x, p.y, PLAYER_W, PLAYER_H, item.x, item.y, 16, 16)) {
            item.collected = true;
            const effect = applyItemEffect(p, item.type);
            p.hp = effect.hp;
            p.atkBoostTimer = effect.atkBoostTimer;
            p.shieldActive = effect.shieldActive;
            p.coins = effect.coins;
            p.score = effect.score;
            const names: Record<string, string> = { heal: "+HP", atkBoost: "ATK UP!", shield: "Shield!", coin: "+Coin" };
            gs.notifications.push({ text: names[item.type] || "Item!", timer: 120 });
          }
        });

        // ── Notifications ──
        gs.notifications = gs.notifications.filter(n => { n.timer--; return n.timer > 0; });

        // ── Camera ──
        gs.camera.x = Math.max(0, Math.min(p.x - CANVAS_W / 2 + PLAYER_W / 2, level.width - CANVAS_W));

        // ── Victory check ──
        const allEnemiesDead = gs.enemies.every(e => e.dead);
        const bossDefeated = !gs.boss || gs.boss.dead;
        if (allEnemiesDead && bossDefeated && p.x > level.width - 100) {
          if (gs.victoryTimer > 0) {
            gs.victoryTimer--;
          } else {
            const hpPct = (p.hp / p.maxHp) * 100;
            const stars = calculateStars(hpPct, gs.time, level.parTime);
            const result: LevelResult = { stars, time: gs.time, remainingHp: p.hp, score: p.score };
            gs.levelResults[gs.level] = result;
            if (gs.level + 1 < LEVELS.length && gs.unlockedLevels <= gs.level + 1) {
              gs.unlockedLevels = gs.level + 2;
            }
            gs.phase = "victory";
            setUiPhase("victory");
            setUiResults([...gs.levelResults]);
            setUiUnlocked(gs.unlockedLevels);
            setUiScore(p.score);
          }
        }

        // ── Game Over ──
        if (p.hp <= 0) {
          gs.phase = "gameOver";
          setUiPhase("gameOver");
        }

        // ── Update UI state ──
        if (gs.frameCount % 10 === 0) {
          setUiHp(p.hp);
          setUiMaxHp(p.maxHp);
          setUiCoins(p.coins);
          setUiScore(p.score);
          setUiTime(gs.time);
        }

        // ── Render (PixiJS) ──
        const camX = gs.camera.x;

        // ── Parallax Background ──
        // Dark sky gradient (approximated with layered rects)
        g.rect(0, 0, CANVAS_W, CANVAS_H * 0.4).fill({ color: 0x0d0618 });
        g.rect(0, CANVAS_H * 0.4, CANVAS_W, CANVAS_H * 0.4).fill({ color: 0x1a0a2e });
        g.rect(0, CANVAS_H * 0.8, CANVAS_W, CANVAS_H * 0.2).fill({ color: 0x2a1a3e });

        level.bgLayers.forEach(layer => {
          const offset = camX * layer.speed;
          layer.elements.forEach(el => {
            const ex = ((el.x - offset) % (CANVAS_W + 200)) - 100;
            const ey = el.y;
            if (el.type === "mist") {
              g.circle(ex, ey, 50 * el.scale).fill({ color: cn("#6b3fa0"), alpha: 0.3 });
              g.circle(ex + 30, ey + 5, 35 * el.scale).fill({ color: cn("#6b3fa0"), alpha: 0.3 });
            } else if (el.type === "pillar") {
              g.rect(ex - 15 * el.scale, ey, 30 * el.scale, CANVAS_H - ey).fill({ color: cn("#3a2a4e") });
              g.rect(ex - 5, ey + 20, 3, 30).fill({ color: cn("#2a1a3e") });
              g.rect(ex + 5, ey + 50, 2, 20).fill({ color: cn("#2a1a3e") });
              // Broken top triangle
              g.poly([
                ex - 18 * el.scale, ey,
                ex - 5, ey - 10 * el.scale,
                ex + 8, ey - 5 * el.scale,
                ex + 18 * el.scale, ey,
              ]).fill({ color: cn("#4a3a5e") });
            } else if (el.type === "wisp") {
              g.circle(ex + 8, ey, 5 * el.scale).fill({ color: cn("#a855f7"), alpha: 0.5 });
              g.circle(ex + 2, ey + 3, 3 * el.scale).fill({ color: cn("#7c3aed"), alpha: 0.3 });
            } else if (el.type === "tombstone") {
              g.rect(ex, ey, 16 * el.scale, 24 * el.scale).fill({ color: cn("#4a3a5e") });
              g.circle(ex + 8 * el.scale, ey, 8 * el.scale).fill({ color: cn("#4a3a5e") });
              g.rect(ex + 6 * el.scale, ey + 4, 4, 12).fill({ color: cn("#6b5a7e") });
              g.rect(ex + 3 * el.scale, ey + 8, 10, 3).fill({ color: cn("#6b5a7e") });
            }
          });
        });

        // ── Platforms ──
        level.platforms.forEach(pl => {
          const sx = pl.x - camX;
          if (sx > CANVAS_W + 50 || sx + pl.width < -50) return;
          if (pl.type === "solid") {
            g.rect(sx, pl.y, pl.width, pl.height).fill({ color: cn("#2a1a3e") });
            g.rect(sx, pl.y, pl.width, 6).fill({ color: cn("#4a2a6e") });
            for (let i = 0; i < pl.width; i += 30) {
              g.rect(sx + i + 5, pl.y - 2, 4, 4).fill({ color: cn("#5a3a7e") });
              g.rect(sx + i + 15, pl.y - 1, 3, 3).fill({ color: cn("#5a3a7e") });
            }
          } else {
            g.rect(sx, pl.y, pl.width, pl.height).fill({ color: cn("#3a2a4e") });
            g.rect(sx, pl.y, pl.width, 4).fill({ color: cn("#6b3fa0") });
            for (let i = 10; i < pl.width; i += 25) {
              g.moveTo(sx + i, pl.y + pl.height).lineTo(sx + i + 3, pl.y + pl.height + 8).stroke({ color: cn("#4a2a6e"), width: 1 });
            }
          }
        });

        // ── Items ──
        gs.items.forEach(item => {
          if (item.collected) return;
          const sx = item.x - camX;
          const bob = Math.sin(gs.frameCount * 0.05) * 3;
          switch (item.type) {
            case "heal":
              g.rect(sx + 2, item.y + bob, 12, 4).fill({ color: cn("#ff4444") });
              g.rect(sx + 6, item.y + bob - 4, 4, 12).fill({ color: cn("#ff4444") });
              break;
            case "atkBoost":
              g.poly([sx + 8, item.y + bob - 4, sx + 14, item.y + bob + 6, sx + 2, item.y + bob + 6]).fill({ color: cn("#c44dff") });
              break;
            case "shield":
              g.poly([sx + 8, item.y + bob - 4, sx + 16, item.y + bob + 2, sx + 8, item.y + bob + 12, sx, item.y + bob + 2]).fill({ color: cn("#a855f7") });
              break;
            case "coin":
              g.circle(sx + 8, item.y + bob + 4, 6).fill({ color: cn("#d8b4fe") });
              showText("$", sx + 5, item.y + bob, { fill: "#7c3aed", fontSize: 8 });
              break;
          }
        });

        // ── Enemies ──
        gs.enemies.forEach(e => {
          const sx = e.x - camX;
          const alpha = e.dead ? Math.max(0, e.deathTimer / 30) : 1;
          const info = ENEMY_TYPES[e.type as keyof typeof ENEMY_TYPES] || ENEMY_TYPES.specter;

          if (e.type === "specter") {
            g.circle(sx + e.width / 2, e.y + e.height / 2, e.width / 2).fill({ color: cn(info.color), alpha });
            g.rect(sx + 2, e.y + e.height / 2, e.width - 4, e.height / 2).fill({ color: cn(info.color), alpha });
            g.rect(sx + 5, e.y + 5, 5, 5).fill({ color: cn("#1a0a2e"), alpha });
            g.rect(sx + 14, e.y + 5, 5, 5).fill({ color: cn("#1a0a2e"), alpha });
            g.rect(sx + 6, e.y + 6, 3, 3).fill({ color: cn("#ff44ff"), alpha });
            g.rect(sx + 15, e.y + 6, 3, 3).fill({ color: cn("#ff44ff"), alpha });
          } else if (e.type === "wraith") {
            g.rect(sx, e.y, e.width, e.height).fill({ color: cn(info.color), alpha });
            g.poly([sx, e.y + 10, sx + e.width / 2, e.y - 4, sx + e.width, e.y + 10]).fill({ color: cn("#2a0a4e"), alpha });
            g.rect(sx + 8, e.y + 10, 4, 4).fill({ color: cn("#ff2222"), alpha });
            g.rect(sx + e.width - 12, e.y + 10, 4, 4).fill({ color: cn("#ff2222"), alpha });
          } else if (e.type === "phantom") {
            const pAlpha = Math.max(alpha * 0.8, 0.3);
            g.rect(sx + 6, e.y + 2, 16, 14).fill({ color: cn(info.color), alpha: pAlpha });
            const wingOff = Math.sin(e.flyAngle * 3) * 5;
            g.rect(sx, e.y + 4 + wingOff, 10, 8).fill({ color: cn(info.color), alpha: pAlpha });
            g.rect(sx + 18, e.y + 4 - wingOff, 10, 8).fill({ color: cn(info.color), alpha: pAlpha });
            g.rect(sx + 9, e.y + 6, 3, 3).fill({ color: cn("#00ffcc"), alpha: pAlpha });
            g.rect(sx + 16, e.y + 6, 3, 3).fill({ color: cn("#00ffcc"), alpha: pAlpha });
          }

          // HP bar
          if (e.hp < e.maxHp && !e.dead) {
            g.rect(sx, e.y - 8, e.width, 4).fill({ color: cn("#400040") });
            g.rect(sx, e.y - 8, e.width * (e.hp / e.maxHp), 4).fill({ color: cn("#c44dff") });
          }
        });

        // ── Boss ──
        if (gs.boss && (gs.boss.deathTimer > 0 || !gs.boss.dead)) {
          const b = gs.boss;
          const sx = b.x - camX;
          const bAlpha = b.dead ? Math.max(0, b.deathTimer / 60) : 1;
          const bodyColor = b.name === "Shadow Lord" ? "#2a0a4e" : "#0d0618";
          const crownColor = b.name === "Shadow Lord" ? "#6b3fa0" : "#3a0a6e";
          g.rect(sx, b.y, b.width, b.height).fill({ color: cn(bodyColor), alpha: bAlpha });
          g.poly([sx, b.y, sx + b.width / 2, b.y - 18, sx + b.width, b.y]).fill({ color: cn(crownColor), alpha: bAlpha });
          g.rect(sx + 10, b.y + 15, 8, 8).fill({ color: cn("#ff44ff"), alpha: bAlpha });
          g.rect(sx + b.width - 18, b.y + 15, 8, 8).fill({ color: cn("#ff44ff"), alpha: bAlpha });
          g.rect(sx + 12, b.y + 17, 4, 4).fill({ color: cn("#ff0066"), alpha: bAlpha });
          g.rect(sx + b.width - 16, b.y + 17, 4, 4).fill({ color: cn("#ff0066"), alpha: bAlpha });
          // HP bar
          g.rect(sx, b.y - 14, b.width, 6).fill({ color: cn("#400040") });
          g.rect(sx, b.y - 14, b.width * (b.hp / b.maxHp), 6).fill({ color: cn("#c44dff") });
          showText(b.name, sx, b.y - 26, { fill: "#e0c0ff", fontSize: 10 });
          // Projectiles
          b.projectiles.forEach(proj => {
            if (!proj.active) return;
            g.circle(proj.x - camX + proj.width / 2, proj.y + proj.height / 2, proj.width / 2).fill({ color: cn("#9333ea") });
          });
        }

        // ── Player ──
        {
          const sx = p.x - camX;
          const sy = p.y;
          if (!(p.invincible > 0 && Math.floor(p.invincible / 4) % 2 === 0)) {
            // Body - dark cloak
            g.rect(sx + 4, sy + 8, 20, 20).fill({ color: cn("#4a2a6e") });
            // Head
            g.rect(sx + 6, sy, 16, 14).fill({ color: cn("#d4b8e8") });
            // Eyes
            const eyeX = p.facing === "right" ? sx + 16 : sx + 10;
            g.rect(eyeX, sy + 4, 3, 3).fill({ color: cn("#c44dff") });
            // Legs
            const legOff = p.onGround ? Math.sin(p.animFrame * 0.3) * 3 : 0;
            g.rect(sx + 6, sy + 28, 6, 8 + legOff).fill({ color: cn("#2a1a3e") });
            g.rect(sx + 16, sy + 28, 6, 8 - legOff).fill({ color: cn("#2a1a3e") });
            // Attack slash
            if (p.attacking) {
              const atkX = p.facing === "right" ? sx + PLAYER_W : sx - ATTACK_RANGE;
              g.rect(atkX, sy + 4, ATTACK_RANGE, 20).fill({ color: cn("#c44dff"), alpha: 0.6 });
            }
            // Shield aura
            if (p.shieldActive) {
              g.circle(sx + PLAYER_W / 2, sy + PLAYER_H / 2, 22).stroke({ color: cn("#a855f7"), width: 2 });
            }
          }
        }

        // ── HUD ──
        {
          g.rect(10, 10, 154, 20).fill({ color: 0x000000, alpha: 0.6 });
          g.rect(12, 12, 150, 16).fill({ color: cn("#400040") });
          const hpPct = p.hp / p.maxHp;
          const hpColor = hpPct > 0.5 ? "#a855f7" : hpPct > 0.25 ? "#c44dff" : "#ff0000";
          g.rect(12, 12, 150 * hpPct, 16).fill({ color: cn(hpColor) });
          showText(`HP: ${p.hp}/${p.maxHp}`, 16, 13, { fill: "#e0c0ff", fontSize: 11 });
          // Coins
          g.circle(190, 20, 8).fill({ color: cn("#d8b4fe") });
          showText(`×${p.coins}`, 202, 16, { fill: "#e0c0ff", fontSize: 12 });
          showText(`Level ${level.id}`, 260, 16, { fill: "#e0c0ff", fontSize: 12 });
          showText(`Score: ${p.score}`, 340, 16, { fill: "#e0c0ff", fontSize: 12 });
          showText(`Time: ${Math.floor(gs.time)}s`, 460, 16, { fill: "#e0c0ff", fontSize: 12 });
          if (p.atkBoostTimer > 0) {
            showText(`ATK UP ${Math.ceil(p.atkBoostTimer / 60)}s`, 580, 16, { fill: "#c44dff", fontSize: 12 });
          }
          if (p.shieldActive) {
            showText("SHIELD", 700, 16, { fill: "#a855f7", fontSize: 12 });
          }
        }

        // ── Notifications ──
        gs.notifications.forEach((n, i) => {
          showText(n.text, CANVAS_W / 2 - 40, 60 + i * 20, { fill: "#e0c0ff", fontSize: 14, alpha: Math.min(1, n.timer / 30) });
        });
      }); // end app.ticker.add
    } // end initPixi

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


  // ─── Keyboard Events ─────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gsRef.current) gsRef.current.keys.add(e.key);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (gsRef.current) gsRef.current.keys.delete(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ─── Upgrade handler ─────────────────────────────────
  const handleUpgrade = useCallback((choice: string) => {
    const gs = gsRef.current;
    if (!gs) return;
    const ab = { ...gs.player.abilities };
    if (choice === "hp") ab.maxHpBonus += 25;
    else if (choice === "atk") ab.atkBonus += 5;
    else if (choice === "jump") ab.jumpBonus += 1;
    const nextLevel = gs.level + 1;
    if (nextLevel < LEVELS.length) {
      initLevel(nextLevel, ab);
    } else {
      setUiPhase("levelSelect");
    }
  }, [initLevel]);

  // ─── Touch handlers ──────────────────────────────────
  const setTouch = (key: keyof GameStateRef["touchControls"], val: boolean) => {
    if (gsRef.current) gsRef.current.touchControls[key] = val;
  };

  // ─── Render UI Screens ───────────────────────────────

  const renderMenu = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-950/90 to-gray-950/90 text-white z-10">
      <h1 className="text-4xl font-bold mb-2 drop-shadow-lg">Shadow Dungeon</h1>
      <p className="text-lg mb-8 text-purple-300">Brave the darkness within!</p>
      <button onClick={() => { setUiPhase("levelSelect"); }} className="px-8 py-3 bg-purple-700 hover:bg-purple-600 rounded-lg text-xl font-bold transition-colors mb-4">
        Enter Dungeon
      </button>
    </div>
  );

  const renderLevelSelect = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-950/90 to-gray-950/90 text-white z-10 p-4">
      <h2 className="text-2xl font-bold mb-6">Select Level</h2>
      <div className="grid grid-cols-5 gap-3 mb-6">
        {LEVELS.map((lv, i) => {
          const locked = i + 1 > uiUnlocked;
          const result = uiResults[i];
          return (
            <button key={lv.id} disabled={locked}
              onClick={() => { if (!locked) initLevel(i, gsRef.current?.player.abilities); }}
              className={`w-20 h-24 rounded-lg flex flex-col items-center justify-center text-sm font-bold transition-all ${locked ? "bg-gray-800 opacity-50 cursor-not-allowed" : "bg-purple-800 hover:bg-purple-700 cursor-pointer"}`}>
              <span className="text-lg">{locked ? "" : `${lv.id}`}</span>
              <span className="text-xs mt-1">{lv.boss ? "Boss" : "Stage"}</span>
              {result && <span className="text-purple-300 text-xs">{"★".repeat(result.stars)}{"☆".repeat(3 - result.stars)}</span>}
            </button>
          );
        })}
      </div>
      <button onClick={() => setUiPhase("menu")} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
        Back
      </button>
    </div>
  );

  const renderVictory = () => {
    const result = uiResults[gsRef.current?.level ?? 0];
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-950/90 to-violet-900/90 text-white z-10">
        <h2 className="text-3xl font-bold mb-4">Level Complete!</h2>
        {result && (
          <div className="text-center mb-6">
            <p className="text-2xl text-purple-300 mb-2">{"★".repeat(result.stars)}{"☆".repeat(3 - result.stars)}</p>
            <p>Time: {Math.floor(result.time)}s</p>
            <p>Score: {result.score}</p>
            <p>HP: {result.remainingHp}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={() => {
            setUpgradeChoices(["hp", "atk", "jump"]);
            setUiPhase("upgrade");
          }} className="px-6 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg font-bold transition-colors">
            Continue
          </button>
          <button onClick={() => setUiPhase("levelSelect")} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
            Level Select
          </button>
        </div>
      </div>
    );
  };

  const renderGameOver = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-red-950/90 to-gray-950/90 text-white z-10">
      <h2 className="text-3xl font-bold mb-4">Game Over</h2>
      <p className="mb-6 text-gray-400">Score: {uiScore}</p>
      <div className="flex gap-3">
        <button onClick={() => initLevel(gsRef.current?.level ?? 0, gsRef.current?.player.abilities)} className="px-6 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg font-bold transition-colors">
          Retry
        </button>
        <button onClick={() => setUiPhase("levelSelect")} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
          Level Select
        </button>
      </div>
    </div>
  );

  const renderUpgrade = () => {
    const labels: Record<string, { icon: string; name: string; desc: string }> = {
      hp: { icon: "HP", name: "Max HP +25", desc: "Increase maximum health" },
      atk: { icon: "ATK", name: "ATK +5", desc: "Increase attack power" },
      jump: { icon: "JMP", name: "Jump +1", desc: "Jump higher" },
    };
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-950/90 to-indigo-950/90 text-white z-10">
        <h2 className="text-2xl font-bold mb-6">Choose an Upgrade</h2>
        <div className="flex gap-4">
          {upgradeChoices.map(c => {
            const l = labels[c];
            return (
              <button key={c} onClick={() => handleUpgrade(c)}
                className="w-36 h-40 bg-purple-900 hover:bg-purple-800 rounded-xl flex flex-col items-center justify-center p-3 transition-all hover:scale-105">
                <span className="text-3xl mb-2">{l?.icon}</span>
                <span className="font-bold">{l?.name}</span>
                <span className="text-xs text-purple-300 mt-1">{l?.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-950 to-gray-950">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H, margin: "0 auto" }}>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
            className="rounded-xl border-2 border-purple-800 bg-black block" />
          {uiPhase === "menu" && renderMenu()}
          {uiPhase === "levelSelect" && renderLevelSelect()}
          {uiPhase === "victory" && renderVictory()}
          {uiPhase === "gameOver" && renderGameOver()}
          {uiPhase === "upgrade" && renderUpgrade()}
        </div>

        {/* Touch Controls */}
        <div className="flex justify-between mt-4 select-none" style={{ touchAction: "none" }}>
          <div className="flex gap-2">
            <button className="w-14 h-14 bg-purple-900 rounded-xl text-white text-2xl active:bg-purple-700 select-none"
              onTouchStart={() => setTouch("left", true)} onTouchEnd={() => setTouch("left", false)}
              onMouseDown={() => setTouch("left", true)} onMouseUp={() => setTouch("left", false)}>
              ◀
            </button>
            <button className="w-14 h-14 bg-purple-900 rounded-xl text-white text-2xl active:bg-purple-700 select-none"
              onTouchStart={() => setTouch("right", true)} onTouchEnd={() => setTouch("right", false)}
              onMouseDown={() => setTouch("right", true)} onMouseUp={() => setTouch("right", false)}>
              ▶
            </button>
          </div>
          <div className="flex gap-2">
            <button className="w-14 h-14 bg-indigo-900 rounded-xl text-white text-lg font-bold active:bg-indigo-700 select-none"
              onTouchStart={() => setTouch("jump", true)} onTouchEnd={() => setTouch("jump", false)}
              onMouseDown={() => setTouch("jump", true)} onMouseUp={() => setTouch("jump", false)}>
              Jump
            </button>
            <button className="w-14 h-14 bg-violet-900 rounded-xl text-white text-lg font-bold active:bg-violet-700 select-none"
              onTouchStart={() => setTouch("attack", true)} onTouchEnd={() => setTouch("attack", false)}
              onMouseDown={() => setTouch("attack", true)} onMouseUp={() => setTouch("attack", false)}>
              Atk
            </button>
          </div>
        </div>

        <div className="text-center text-purple-400 text-sm mt-3">
          ← → Move | Z Jump | X Attack | Touch buttons for mobile
        </div>
      </div>
    </div>
  );
}
