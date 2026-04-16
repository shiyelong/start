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

// ─── Helper: hex color to number ─────────────────────────

function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}

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


// ─── Level Data ──────────────────────────────────────────

const ENEMY_TYPES = {
  drone: { width: 26, height: 20, color: "#4af" },
  "mech-walker": { width: 32, height: 28, color: "#8a8a9a" },
  "hover-bot": { width: 24, height: 22, color: "#a4f" },
};

const makeBgLayers = (variant: number): BgLayer[] => [
  {
    color: variant < 3 ? "#0a1628" : "#0d0d1a",
    elements: [
      { type: "circuit", x: 80, y: 50, scale: 1 },
      { type: "circuit", x: 350, y: 30, scale: 0.7 },
      { type: "circuit", x: 620, y: 60, scale: 0.9 },
    ],
    speed: 0.1,
  },
  {
    color: variant < 3 ? "#1a2a4a" : "#1a1a2e",
    elements: [
      { type: "tower", x: 0, y: 200, scale: 1 },
      { type: "tower", x: 300, y: 180, scale: 1.2 },
      { type: "tower", x: 600, y: 210, scale: 0.8 },
    ],
    speed: 0.3,
  },
  {
    color: "#2a3a5a",
    elements: [
      { type: "gear", x: 50, y: 300, scale: 1 },
      { type: "gear", x: 200, y: 320, scale: 0.8 },
      { type: "pipe", x: 400, y: 340, scale: 1 },
      { type: "pipe", x: 600, y: 310, scale: 1.1 },
    ],
    speed: 0.5,
  },
];

const LEVELS: Level[] = [
  // Level 1 - Assembly Line
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
      { x: 300, y: 436, type: "drone", behavior: "patrol", hp: 2, patrolRange: 100 },
      { x: 800, y: 436, type: "drone", behavior: "patrol", hp: 2, patrolRange: 80 },
      { x: 1500, y: 436, type: "mech-walker", behavior: "chase", hp: 3 },
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
  // Level 2 - Reactor Core
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
      { x: 200, y: 436, type: "drone", behavior: "patrol", hp: 3, patrolRange: 100 },
      { x: 600, y: 376, type: "drone", behavior: "patrol", hp: 3, patrolRange: 60 },
      { x: 1100, y: 436, type: "mech-walker", behavior: "chase", hp: 4 },
      { x: 1600, y: 436, type: "mech-walker", behavior: "chase", hp: 4 },
      { x: 2100, y: 436, type: "drone", behavior: "patrol", hp: 3, patrolRange: 80 },
      { x: 2700, y: 300, type: "hover-bot", behavior: "fly", hp: 2 },
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
  // Level 3 - Steel Guardian (Boss)
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
      { x: 250, y: 436, type: "drone", behavior: "patrol", hp: 3, patrolRange: 100 },
      { x: 700, y: 376, type: "mech-walker", behavior: "chase", hp: 5 },
      { x: 1200, y: 436, type: "mech-walker", behavior: "chase", hp: 5 },
      { x: 1800, y: 300, type: "hover-bot", behavior: "fly", hp: 3 },
      { x: 2300, y: 436, type: "drone", behavior: "patrol", hp: 4, patrolRange: 80 },
      { x: 2500, y: 280, type: "hover-bot", behavior: "fly", hp: 3 },
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
      name: "Steel Guardian",
      hp: 30,
      width: 50,
      height: 60,
      phases: [
        {
          hpThreshold: 50,
          attacks: [
            { name: "laser_sweep", duration: 60, cooldown: 90 },
            { name: "charge", duration: 40, cooldown: 120 },
            { name: "summon_drones", duration: 30, cooldown: 150 },
          ],
          speed: 1.5,
        },
        {
          hpThreshold: 0,
          attacks: [
            { name: "laser_barrage", duration: 80, cooldown: 60 },
            { name: "mega_charge", duration: 50, cooldown: 80 },
            { name: "plasma_storm", duration: 90, cooldown: 100 },
          ],
          speed: 2.5,
        },
      ],
    },
    hiddenAreas: [
      { x: 2000, y: 250, width: 80, height: 50, reward: [{ x: 2020, y: 260, type: "coin" }, { x: 2050, y: 260, type: "heal" }] },
    ],
  },
  // Level 4 - Neon Corridor
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
      { x: 200, y: 436, type: "drone", behavior: "patrol", hp: 4, patrolRange: 80 },
      { x: 700, y: 376, type: "mech-walker", behavior: "chase", hp: 6 },
      { x: 1200, y: 436, type: "mech-walker", behavior: "chase", hp: 6 },
      { x: 1500, y: 280, type: "hover-bot", behavior: "fly", hp: 4 },
      { x: 1900, y: 436, type: "drone", behavior: "patrol", hp: 5, patrolRange: 100 },
      { x: 2400, y: 300, type: "hover-bot", behavior: "fly", hp: 4 },
      { x: 2800, y: 436, type: "mech-walker", behavior: "chase", hp: 6 },
      { x: 3200, y: 436, type: "drone", behavior: "patrol", hp: 5, patrolRange: 80 },
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
  // Level 5 - Core Reactor (Final Boss)
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
      { x: 250, y: 436, type: "mech-walker", behavior: "chase", hp: 7 },
      { x: 600, y: 376, type: "drone", behavior: "patrol", hp: 5, patrolRange: 80 },
      { x: 1100, y: 436, type: "mech-walker", behavior: "chase", hp: 7 },
      { x: 1400, y: 280, type: "hover-bot", behavior: "fly", hp: 5 },
      { x: 1700, y: 436, type: "mech-walker", behavior: "chase", hp: 7 },
      { x: 2100, y: 300, type: "hover-bot", behavior: "fly", hp: 5 },
      { x: 2500, y: 436, type: "drone", behavior: "patrol", hp: 6, patrolRange: 100 },
      { x: 2900, y: 436, type: "mech-walker", behavior: "chase", hp: 8 },
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
      name: "Core Reactor",
      hp: 50,
      width: 60,
      height: 70,
      phases: [
        {
          hpThreshold: 50,
          attacks: [
            { name: "plasma_strike", duration: 50, cooldown: 80 },
            { name: "laser_storm", duration: 70, cooldown: 100 },
            { name: "emp_pulse", duration: 40, cooldown: 90 },
          ],
          speed: 1.2,
        },
        {
          hpThreshold: 0,
          attacks: [
            { name: "mega_laser", duration: 60, cooldown: 60 },
            { name: "reactor_fury", duration: 90, cooldown: 70 },
            { name: "overload_slam", duration: 50, cooldown: 50 },
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
    const info = ENEMY_TYPES[s.type as keyof typeof ENEMY_TYPES] || ENEMY_TYPES.drone;
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


// ─── PixiJS Drawing (replaces Canvas 2D draw functions) ──

function drawGamePixi(g: PixiGraphics, texts: Map<string, PixiText>, gs: GameStateRef) {
  g.clear();
  texts.forEach(t => { t.visible = false; });

  const showText = (key: string, str: string, x: number, y: number, anchorX = 0, anchorY = 0) => {
    const t = texts.get(key);
    if (t) {
      t.text = str;
      t.x = x; t.y = y;
      t.anchor.set(anchorX, anchorY);
      t.visible = true;
    }
  };

  const level = LEVELS[gs.level];
  const camX = gs.camera.x;
  const p = gs.player;
  const frame = gs.frameCount;

  // ── Background gradient (dark sci-fi sky) ──
  g.rect(0, 0, CANVAS_W, CANVAS_H * 0.4).fill({ color: 0x050a18 });
  g.rect(0, CANVAS_H * 0.4, CANVAS_W, CANVAS_H * 0.6).fill({ color: 0x0a1628 });

  // Distant stars
  for (let i = 0; i < 30; i++) {
    const starX = ((i * 97 + 13) % CANVAS_W);
    const starY = ((i * 53 + 7) % (CANVAS_H * 0.4));
    g.rect(starX, starY, 1, 1).fill({ color: 0xffffff, alpha: 0.3 + (i % 3) * 0.2 });
  }

  // ── Parallax background layers ──
  level.bgLayers.forEach(layer => {
    const offset = camX * layer.speed;
    const layerColor = hexToNum(layer.color);
    layer.elements.forEach(el => {
      const ex = ((el.x - offset) % (CANVAS_W + 200)) - 100;
      const ey = el.y;

      if (el.type === "circuit") {
        // Circuit board pattern - simplified as lines + dots
        g.rect(ex - 2, ey - 2, 4, 4).fill({ color: 0x00ffff, alpha: 0.3 });
        g.rect(ex, ey, 40 * el.scale, 2).fill({ color: 0x00aaff, alpha: 0.3 });
        g.rect(ex + 40 * el.scale, ey, 2, 20 * el.scale).fill({ color: 0x00aaff, alpha: 0.3 });
        g.rect(ex + 40 * el.scale, ey + 20 * el.scale, 20 * el.scale, 2).fill({ color: 0x00aaff, alpha: 0.3 });
        g.rect(ex + 60 * el.scale - 2, ey + 20 * el.scale - 2, 4, 4).fill({ color: 0x00ffff, alpha: 0.3 });
      } else if (el.type === "tower") {
        // Metal tower silhouette
        g.rect(ex - 20 * el.scale, ey, 40 * el.scale, CANVAS_H - ey).fill({ color: layerColor });
        // Windows
        for (let wy = ey + 10; wy < CANVAS_H - 20; wy += 25) {
          g.rect(ex - 12 * el.scale, wy, 8 * el.scale, 5).fill({ color: 0x00aaff, alpha: 0.4 });
          g.rect(ex + 4 * el.scale, wy, 8 * el.scale, 5).fill({ color: 0x00aaff, alpha: 0.4 });
        }
        // Antenna
        g.rect(ex - 2, ey - 20 * el.scale, 4, 20 * el.scale).fill({ color: 0x3a4a6a });
        // Blinking light
        const blinkOn = Math.sin(Date.now() * 0.003) > 0;
        g.rect(ex - 2, ey - 22 * el.scale, 4, 4).fill({ color: blinkOn ? 0xff0000 : 0x660000 });
      } else if (el.type === "gear") {
        // Rotating gear decoration
        g.circle(ex + 15, ey + 15, 15 * el.scale).fill({ color: 0x3a4a5a, alpha: 0.5 });
        g.circle(ex + 15, ey + 15, 6 * el.scale).fill({ color: 0x1a2a3a, alpha: 0.5 });
      } else if (el.type === "pipe") {
        // Industrial pipe
        g.rect(ex, ey, 60 * el.scale, 8).fill({ color: 0x4a5a6a, alpha: 0.6 });
        g.rect(ex + 10, ey - 2, 6, 12).fill({ color: 0x6a7a8a, alpha: 0.6 });
        g.rect(ex + 40 * el.scale, ey - 2, 6, 12).fill({ color: 0x6a7a8a, alpha: 0.6 });
      }
    });
  });

  // ── Platforms ──
  level.platforms.forEach(plat => {
    const sx = plat.x - camX;
    if (sx > CANVAS_W + 50 || sx + plat.width < -50) return;
    if (plat.type === "solid") {
      g.rect(sx, plat.y, plat.width, plat.height).fill({ color: 0x3a4a5a });
      // Top edge neon accent
      g.rect(sx, plat.y, plat.width, 3).fill({ color: 0x00aaff });
      // Rivet details
      for (let i = 0; i < plat.width; i += 24) {
        g.rect(sx + i + 4, plat.y + 6, 4, 4).fill({ color: 0x5a6a7a });
        g.rect(sx + i + 14, plat.y + 6, 4, 4).fill({ color: 0x5a6a7a });
      }
    } else {
      g.rect(sx, plat.y, plat.width, plat.height).fill({ color: 0x4a5a6a });
      g.rect(sx, plat.y, plat.width, 2).fill({ color: 0x00aaff });
      // Grate lines
      for (let i = 8; i < plat.width; i += 12) {
        g.rect(sx + i, plat.y + 4, 1, plat.height - 4).fill({ color: 0x3a4a5a });
      }
    }
  });

  // ── Items ──
  gs.items.forEach(item => {
    if (item.collected) return;
    const sx = item.x - camX;
    const bob = Math.sin(frame * 0.05) * 3;
    switch (item.type) {
      case "heal":
        g.rect(sx + 2, item.y + bob, 12, 4).fill({ color: 0xff4444 });
        g.rect(sx + 6, item.y + bob - 4, 4, 12).fill({ color: 0xff4444 });
        break;
      case "atkBoost":
        // Triangle approximated as small rect
        g.rect(sx + 4, item.y + bob - 2, 8, 10).fill({ color: 0xffaa00 });
        break;
      case "shield":
        // Diamond approximated as small rect
        g.rect(sx + 2, item.y + bob, 12, 10).fill({ color: 0x00aaff });
        break;
      case "coin":
        g.circle(sx + 8, item.y + bob + 4, 6).fill({ color: 0x00ffff });
        break;
    }
  });

  // ── Enemies ──
  gs.enemies.forEach(e => {
    if (e.dead && e.deathTimer <= 0) return;
    const sx = e.x - camX;
    const alpha = e.dead ? Math.max(0, e.deathTimer / 30) : 1;

    if (e.type === "drone") {
      g.rect(sx + 4, e.y + 6, 18, 10).fill({ color: 0x44aaff, alpha });
      const propOff = Math.sin(e.flyAngle * 5 + Date.now() * 0.02) * 2;
      g.rect(sx, e.y + 2 + propOff, 8, 4).fill({ color: 0x66ccff, alpha });
      g.rect(sx + 18, e.y + 2 - propOff, 8, 4).fill({ color: 0x66ccff, alpha });
      g.rect(sx + 10, e.y + 9, 4, 3).fill({ color: 0xff0000, alpha });
    } else if (e.type === "mech-walker") {
      g.rect(sx + 4, e.y, 24, 18).fill({ color: 0x8a8a9a, alpha });
      g.rect(sx + 6, e.y + 18, 6, 10).fill({ color: 0x6a6a7a, alpha });
      g.rect(sx + 20, e.y + 18, 6, 10).fill({ color: 0x6a6a7a, alpha });
      g.rect(sx + 10, e.y + 4, 12, 6).fill({ color: 0xff8800, alpha });
      g.rect(sx, e.y - 2, 6, 6).fill({ color: 0x5a5a6a, alpha });
      g.rect(sx + 26, e.y - 2, 6, 6).fill({ color: 0x5a5a6a, alpha });
    } else if (e.type === "hover-bot") {
      g.circle(sx + e.width / 2, e.y + e.height / 2, e.width / 2).fill({ color: 0xaa44ff, alpha });
      g.circle(sx + e.width / 2, e.y + e.height / 2, e.width / 3).stroke({ color: 0xcc66ff, width: 2, alpha });
      g.rect(sx + 9, e.y + 8, 6, 4).fill({ color: 0xffffff, alpha });
    }

    // HP bar
    if (e.hp < e.maxHp && !e.dead) {
      g.rect(sx, e.y - 8, e.width, 4).fill({ color: 0x660000 });
      g.rect(sx, e.y - 8, e.width * (e.hp / e.maxHp), 4).fill({ color: 0x00ffff });
    }
  });

  // ── Boss ──
  if (gs.boss && (gs.boss.deathTimer > 0 || !gs.boss.dead)) {
    const b = gs.boss;
    const sx = b.x - camX;
    const alpha = b.dead ? Math.max(0, b.deathTimer / 60) : 1;

    if (b.name === "Steel Guardian") {
      g.rect(sx, b.y, b.width, b.height).fill({ color: 0x5a6a7a, alpha });
      g.rect(sx - 6, b.y + 5, 12, 20).fill({ color: 0x4a5a6a, alpha });
      g.rect(sx + b.width - 6, b.y + 5, 12, 20).fill({ color: 0x4a5a6a, alpha });
      g.rect(sx + 8, b.y + 12, b.width - 16, 10).fill({ color: 0xff4444, alpha });
      g.circle(sx + b.width / 2, b.y + 40, 8).fill({ color: 0x00aaff, alpha });
    } else {
      // Core Reactor
      g.rect(sx, b.y, b.width, b.height).fill({ color: 0x2a2a4a, alpha });
      g.circle(sx + b.width / 2, b.y + b.height / 2, 18).fill({ color: 0x00ffff, alpha });
      g.circle(sx + b.width / 2, b.y + b.height / 2, 25).stroke({ color: 0x44aaff, width: 3, alpha });
      const pulseAlpha = (0.3 + Math.sin(Date.now() * 0.005) * 0.2) * alpha;
      g.circle(sx + b.width / 2, b.y + b.height / 2, 30).fill({ color: 0x00ffff, alpha: pulseAlpha });
    }

    // Eyes
    g.rect(sx + 10, b.y + 15, 8, 8).fill({ color: 0x00ffff, alpha });
    g.rect(sx + b.width - 18, b.y + 15, 8, 8).fill({ color: 0x00ffff, alpha });
    g.rect(sx + 12, b.y + 17, 4, 4).fill({ color: 0xffffff, alpha });
    g.rect(sx + b.width - 16, b.y + 17, 4, 4).fill({ color: 0xffffff, alpha });

    // HP bar
    g.rect(sx, b.y - 14, b.width, 6).fill({ color: 0x333333 });
    g.rect(sx, b.y - 14, b.width * (b.hp / b.maxHp), 6).fill({ color: 0x00ffff });

    // Boss name text
    showText("boss_name", b.name, sx, b.y - 20);

    // Projectiles
    b.projectiles.forEach(proj => {
      if (!proj.active) return;
      g.rect(proj.x - camX, proj.y, proj.width, proj.height).fill({ color: 0x00ffff });
    });
  }

  // ── Player ──
  if (!(p.invincible > 0 && Math.floor(p.invincible / 4) % 2 === 0)) {
    const sx = p.x - camX;
    const sy = p.y;
    // Mech suit body
    g.rect(sx + 4, sy + 8, 20, 20).fill({ color: 0x4a6a8a });
    // Visor/helmet
    g.rect(sx + 4, sy, 20, 14).fill({ color: 0x2a3a5a });
    const eyeX = p.facing === "right" ? sx + 14 : sx + 8;
    g.rect(eyeX, sy + 4, 6, 3).fill({ color: 0x00ffff });
    // Legs
    const legOff = p.onGround ? Math.sin(p.animFrame * 0.3) * 3 : 0;
    g.rect(sx + 6, sy + 28, 6, 8 + legOff).fill({ color: 0x5a6a7a });
    g.rect(sx + 16, sy + 28, 6, 8 - legOff).fill({ color: 0x5a6a7a });
    // Attack (energy blade)
    if (p.attacking) {
      const atkX = p.facing === "right" ? sx + PLAYER_W : sx - ATTACK_RANGE;
      g.rect(atkX, sy + 4, ATTACK_RANGE, 20).fill({ color: 0x00ffff, alpha: 0.7 });
    }
    // Shield (energy field)
    if (p.shieldActive) {
      g.circle(sx + PLAYER_W / 2, sy + PLAYER_H / 2, 22).stroke({ color: 0x00ffff, width: 2 });
    }
  }

  // ── HUD ──
  // HP bar background
  g.rect(10, 10, 154, 20).fill({ color: 0x000000, alpha: 0.6 });
  g.rect(12, 12, 150, 16).fill({ color: 0x333333 });
  const hpPct = p.hp / p.maxHp;
  const hpColor = hpPct > 0.5 ? 0x00ccff : hpPct > 0.25 ? 0xffaa00 : 0xff0000;
  g.rect(12, 12, 150 * hpPct, 16).fill({ color: hpColor });
  showText("hud_hp", `HP: ${p.hp}/${p.maxHp}`, 16, 25, 0, 0.5);

  // Coins
  g.circle(190, 20, 8).fill({ color: 0x00ffff });
  showText("hud_coins", `×${p.coins}`, 202, 24, 0, 0.5);

  // Level
  showText("hud_level", `Sector ${level.id}`, 260, 24, 0, 0.5);

  // Score
  showText("hud_score", `Score: ${p.score}`, 340, 24, 0, 0.5);

  // Time
  showText("hud_time", `Time: ${Math.floor(gs.time)}s`, 460, 24, 0, 0.5);

  // Atk boost indicator
  if (p.atkBoostTimer > 0) {
    showText("hud_power", `POWER UP ${Math.ceil(p.atkBoostTimer / 60)}s`, 580, 24, 0, 0.5);
  }
  if (p.shieldActive) {
    showText("hud_shield", "SHIELD", 700, 24, 0, 0.5);
  }

  // ── Notifications ──
  gs.notifications.forEach((n, i) => {
    const key = `notif_${i}`;
    const t = texts.get(key);
    if (t) {
      t.text = n.text;
      t.x = CANVAS_W / 2 - 40;
      t.y = 60 + i * 20;
      t.alpha = Math.min(1, n.timer / 30);
      t.visible = true;
    }
  });
}


// ─── Main Component ──────────────────────────────────────

export default function MechaCastlePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const gsRef = useRef<GameStateRef | null>(null);
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

  // ─── PixiJS Game Loop ────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let destroyed = false;

    async function initAndRun() {
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas, width: CANVAS_W, height: CANVAS_H, backgroundColor: 0x050a18, antialias: false });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      // Pre-create text pool (70 texts)
      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 11,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "monospace",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // HUD texts
      makeText("hud_hp", { fontSize: 11, fontWeight: "bold" });
      makeText("hud_coins", { fontSize: 12, fontWeight: "bold" });
      makeText("hud_level", { fontSize: 12, fontWeight: "bold" });
      makeText("hud_score", { fontSize: 12, fontWeight: "bold" });
      makeText("hud_time", { fontSize: 12, fontWeight: "bold" });
      makeText("hud_power", { fontSize: 12, fill: "#ffaa00", fontWeight: "bold" });
      makeText("hud_shield", { fontSize: 12, fill: "#00aaff", fontWeight: "bold" });
      makeText("boss_name", { fontSize: 10, fontWeight: "bold" });
      // Notification texts (up to 10)
      for (let i = 0; i < 10; i++) {
        makeText(`notif_${i}`, { fontSize: 14, fill: "#00ffff", fontWeight: "bold" });
      }

      app.ticker.add(() => {
        if (destroyed) return;
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
          // Horizontal collision for solid platforms
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

        // Fall death
        if (p.y > CANVAS_H + 50) {
          p.hp = 0;
        }

        // Invincibility
        if (p.invincible > 0) p.invincible--;

        // Atk boost timer
        if (p.atkBoostTimer > 0) p.atkBoostTimer--;

        // Animation
        p.animTimer++;
        if (p.animTimer > 8) { p.animTimer = 0; p.animFrame++; }

        // ── Enemy AI ──
        gs.enemies.forEach(e => {
          if (e.dead) {
            e.deathTimer--;
            return;
          }
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

          // Enemy hits player
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

          // Player attack hits enemy
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
          const hpPctB = (b.hp / b.maxHp) * 100;
          const phaseIdx = hpPctB > 50 ? 0 : 1;
          if (phaseIdx !== b.currentPhase) {
            b.currentPhase = phaseIdx;
            b.attackTimer = 30;
            gs.notifications.push({ text: `${b.name} overloading!`, timer: 120 });
          }
          const phase = b.phases[b.currentPhase];
          b.attackTimer--;

          if (b.attackTimer <= 0) {
            const attack = phase.attacks[b.currentAttack % phase.attacks.length];
            if (attack.name.includes("charge") || attack.name.includes("slam") || attack.name.includes("strike")) {
              b.vx = p.x > b.x ? phase.speed * 3 : -phase.speed * 3;
            } else if (attack.name.includes("sweep") || attack.name.includes("storm") || attack.name.includes("barrage") || attack.name.includes("fury")) {
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

          // Boss movement
          b.x += b.vx;
          b.vx *= 0.95;
          const arenaStart = level.width - 1100;
          if (b.x < arenaStart) b.x = arenaStart;
          if (b.x > level.width - b.width - 50) b.x = level.width - b.width - 50;

          // Projectiles
          b.projectiles.forEach(proj => {
            if (!proj.active) return;
            proj.x += proj.vx;
            proj.y += proj.vy;
            proj.vy += 0.1;
            if (proj.y > CANVAS_H || proj.x < 0 || proj.x > level.width) {
              proj.active = false;
            }
            if (p.invincible <= 0 && checkRectCollision(p.x, p.y, PLAYER_W, PLAYER_H, proj.x, proj.y, proj.width, proj.height)) {
              if (p.shieldActive) {
                p.shieldActive = false;
              } else {
                p.hp -= 10;
              }
              p.invincible = INVINCIBLE_FRAMES;
              proj.active = false;
            }
          });
          b.projectiles = b.projectiles.filter(proj => proj.active);

          // Boss hits player (contact)
          if (p.invincible <= 0 && checkRectCollision(p.x, p.y, PLAYER_W, PLAYER_H, b.x, b.y, b.width, b.height)) {
            if (p.shieldActive) {
              p.shieldActive = false;
            } else {
              p.hp -= 20;
            }
            p.invincible = INVINCIBLE_FRAMES;
          }

          // Player attack hits boss
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
                gs.notifications.push({ text: `${b.name} destroyed!`, timer: 180 });
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
            const names: Record<string, string> = { heal: "+HP", atkBoost: "POWER UP!", shield: "Shield!", coin: "+Credit" };
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
            const hpPctV = (p.hp / p.maxHp) * 100;
            const stars = calculateStars(hpPctV, gs.time, level.parTime);
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

        // ── Render ──
        drawGamePixi(gfx, texts, gs);
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
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900/90 to-blue-900/90 text-white z-10">
      <h1 className="text-4xl font-bold mb-2 drop-shadow-lg">Mecha Castle</h1>
      <p className="text-lg mb-8 text-blue-300">Conquer the mechanical fortress!</p>
      <button onClick={() => { setUiPhase("levelSelect"); }} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-xl font-bold transition-colors mb-4">
        Start Game
      </button>
    </div>
  );

  const renderLevelSelect = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900/90 to-blue-900/90 text-white z-10 p-4">
      <h2 className="text-2xl font-bold mb-6">Select Sector</h2>
      <div className="grid grid-cols-5 gap-3 mb-6">
        {LEVELS.map((lv, i) => {
          const locked = i + 1 > uiUnlocked;
          const result = uiResults[i];
          return (
            <button key={lv.id} disabled={locked}
              onClick={() => { if (!locked) initLevel(i, gsRef.current?.player.abilities); }}
              className={`w-20 h-24 rounded-lg flex flex-col items-center justify-center text-sm font-bold transition-all ${locked ? "bg-gray-700 opacity-50 cursor-not-allowed" : "bg-blue-800 hover:bg-blue-700 cursor-pointer"}`}>
              <span className="text-lg">{locked ? "" : `${lv.id}`}</span>
              <span className="text-xs mt-1">{lv.boss ? "Boss" : "Sector"}</span>
              {result && <span className="text-cyan-300 text-xs">{"★".repeat(result.stars)}{"☆".repeat(3 - result.stars)}</span>}
            </button>
          );
        })}
      </div>
      <button onClick={() => setUiPhase("menu")} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
        Back
      </button>
    </div>
  );

  const renderVictory = () => {
    const result = uiResults[gsRef.current?.level ?? 0];
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900/90 to-cyan-800/90 text-white z-10">
        <h2 className="text-3xl font-bold mb-4">Sector Clear!</h2>
        {result && (
          <div className="text-center mb-6">
            <p className="text-2xl text-cyan-300 mb-2">{"★".repeat(result.stars)}{"☆".repeat(3 - result.stars)}</p>
            <p>Time: {Math.floor(result.time)}s</p>
            <p>Score: {result.score}</p>
            <p>HP: {result.remainingHp}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={() => {
            setUpgradeChoices(["hp", "atk", "jump"]);
            setUiPhase("upgrade");
          }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-colors">
            Continue →
          </button>
          <button onClick={() => setUiPhase("levelSelect")} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
            Sector Select
          </button>
        </div>
      </div>
    );
  };

  const renderGameOver = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-red-900/90 to-gray-900/90 text-white z-10">
      <h2 className="text-3xl font-bold mb-4">System Failure</h2>
      <p className="mb-6 text-gray-300">Score: {uiScore}</p>
      <div className="flex gap-3">
        <button onClick={() => initLevel(gsRef.current?.level ?? 0, gsRef.current?.player.abilities)} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold transition-colors">
          Retry
        </button>
        <button onClick={() => setUiPhase("levelSelect")} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
          Sector Select
        </button>
      </div>
    </div>
  );

  const renderUpgrade = () => {
    const labels: Record<string, { name: string; desc: string }> = {
      hp: { name: "Max HP +25", desc: "Increase energy capacity" },
      atk: { name: "ATK +5", desc: "Increase weapon power" },
      jump: { name: "Jump +1", desc: "Boost thrusters" },
    };
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900/90 to-blue-900/90 text-white z-10">
        <h2 className="text-2xl font-bold mb-6">System Upgrade</h2>
        <div className="flex gap-4">
          {upgradeChoices.map(c => {
            const l = labels[c];
            return (
              <button key={c} onClick={() => handleUpgrade(c)}
                className="w-36 h-40 bg-blue-900 hover:bg-blue-800 rounded-xl flex flex-col items-center justify-center p-3 transition-all hover:scale-105 border border-cyan-700">
                <span className="font-bold">{l?.name}</span>
                <span className="text-xs text-cyan-300 mt-1">{l?.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-gray-950">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H, margin: "0 auto" }}>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
            className="rounded-xl border-2 border-blue-700 bg-black block" />
          {uiPhase === "menu" && renderMenu()}
          {uiPhase === "levelSelect" && renderLevelSelect()}
          {uiPhase === "victory" && renderVictory()}
          {uiPhase === "gameOver" && renderGameOver()}
          {uiPhase === "upgrade" && renderUpgrade()}
        </div>

        {/* Touch Controls */}
        <div className="flex justify-between mt-4 select-none" style={{ touchAction: "none" }}>
          <div className="flex gap-2">
            <button className="w-14 h-14 bg-slate-800 rounded-xl text-white text-2xl active:bg-slate-600 select-none"
              onTouchStart={() => setTouch("left", true)} onTouchEnd={() => setTouch("left", false)}
              onMouseDown={() => setTouch("left", true)} onMouseUp={() => setTouch("left", false)}>
              ◀
            </button>
            <button className="w-14 h-14 bg-slate-800 rounded-xl text-white text-2xl active:bg-slate-600 select-none"
              onTouchStart={() => setTouch("right", true)} onTouchEnd={() => setTouch("right", false)}
              onMouseDown={() => setTouch("right", true)} onMouseUp={() => setTouch("right", false)}>
              ▶
            </button>
          </div>
          <div className="flex gap-2">
            <button className="w-14 h-14 bg-blue-800 rounded-xl text-white text-lg font-bold active:bg-blue-600 select-none"
              onTouchStart={() => setTouch("jump", true)} onTouchEnd={() => setTouch("jump", false)}
              onMouseDown={() => setTouch("jump", true)} onMouseUp={() => setTouch("jump", false)}>
              Jump
            </button>
            <button className="w-14 h-14 bg-cyan-800 rounded-xl text-white text-lg font-bold active:bg-cyan-600 select-none"
              onTouchStart={() => setTouch("attack", true)} onTouchEnd={() => setTouch("attack", false)}
              onMouseDown={() => setTouch("attack", true)} onMouseUp={() => setTouch("attack", false)}>
              Atk
            </button>
          </div>
        </div>

        <div className="text-center text-blue-400 text-sm mt-3">
          ← → Move | Z Jump | X Attack | Touch buttons for mobile
        </div>
      </div>
    </div>
  );
}
