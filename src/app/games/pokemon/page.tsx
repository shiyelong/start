"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

import {
  type PetType,
  type Direction,
  type Skill,
  type Pet,
  type BattleState,
  type NPC,
  type MapArea,
  type Quest,
  type GameState,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  MAP_COLS,
  MAP_ROWS,
  TILE_TYPES,
  ENCOUNTER_RATE,
  MAX_PARTY_SIZE,
  BASE_CATCH_RATE,
  getTypeMultiplier,
  calculateDamage,
  calculateCatchRate,
  calculateExp,
  calculateFleeRate,
  determineTurnOrder,
  advanceDialog,
  checkEncounter,
  selectWildPet,
  PET_TEMPLATES,
  applyLevelUp,
  createPetFromTemplate,
  getMapArea,
  AREA_LEVEL_RANGE,
} from "./game-utils";

// ─── Quest Data ──────────────────────────────────────────

const QUESTS: Quest[] = [
  {
    id: "defeat_forest_trainer",
    name: "击败森林训练师",
    description: "在森林中找到训练师小明并击败他，获得通往洞穴的通行证。",
    condition: (state: GameState) =>
      state.quests.some(
        (q) => q.questId === "defeat_forest_trainer" && q.completed,
      ),
    reward: { exp: 200, unlockArea: "cave" },
  },
  {
    id: "collect_three_types",
    name: "收集三属性宠物",
    description: "收集 3 只不同属性类型的宠物，证明你是合格的训练师。",
    condition: (state: GameState) => {
      const types = new Set(state.party.map((p) => p.type));
      return types.size >= 3;
    },
    reward: { exp: 300, items: ["rare_ball", "super_potion", "exp_candy"] },
  },
  {
    id: "reach_volcano",
    name: "到达火山区域",
    description: "穿越洞穴，到达传说中的火山区域。",
    condition: (state: GameState) =>
      state.unlockedAreas.includes("volcano"),
    reward: { exp: 500, items: ["master_ball", "full_restore"] },
  },
];

// ─── Color Helpers ───────────────────────────────────────

/** Convert hex color string to number for PixiJS */
function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}

/** Color map for pet types */
const PET_TYPE_COLORS: Record<PetType, string> = {
  fire: "#e74c3c",
  water: "#3498db",
  grass: "#2ecc71",
  electric: "#f1c40f",
  dark: "#9b59b6",
};

const PET_TYPE_COLORS_DARK: Record<PetType, string> = {
  fire: "#c0392b",
  water: "#2980b9",
  grass: "#27ae60",
  electric: "#d4a30a",
  dark: "#7d3c98",
};

// ─── Battle Button Layout ────────────────────────────────

interface BattleButton {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  type: "skill" | "item" | "capture" | "flee";
  skillIndex?: number;
  disabled?: boolean;
  color?: string;
}

function buildBattleButtons(battle: BattleState): BattleButton[] {
  const buttons: BattleButton[] = [];
  const pet = battle.playerPet;

  const skillStartX = 16;
  const skillStartY = 358;
  const skillW = 148;
  const skillH = 36;
  const skillGapX = 8;
  const skillGapY = 6;

  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const skill = pet.skills[i];
    if (skill) {
      const disabled = skill.mpCost > pet.mp;
      buttons.push({
        x: skillStartX + col * (skillW + skillGapX),
        y: skillStartY + row * (skillH + skillGapY),
        w: skillW,
        h: skillH,
        label: `${skill.name} (消耗${skill.mpCost})`,
        type: "skill",
        skillIndex: i,
        disabled,
        color: PET_TYPE_COLORS[skill.type],
      });
    }
  }

  const actionX = 348;
  const actionW = 130;
  const actionH = 34;
  const actionGap = 6;

  buttons.push({
    x: actionX, y: skillStartY, w: actionW, h: actionH,
    label: "道具", type: "item", color: "#f39c12",
  });
  buttons.push({
    x: actionX, y: skillStartY + actionH + actionGap, w: actionW, h: actionH,
    label: "捕捉", type: "capture", color: "#e74c3c",
  });
  buttons.push({
    x: actionX + actionW + 8, y: skillStartY, w: actionW, h: actionH,
    label: "逃跑", type: "flee", color: "#95a5a6",
  });

  return buttons;
}

function detectBattleButtonClick(
  battle: BattleState, canvasX: number, canvasY: number,
): BattleButton | null {
  if (battle.phase !== "select") return null;
  const buttons = buildBattleButtons(battle);
  for (const btn of buttons) {
    if (canvasX >= btn.x && canvasX <= btn.x + btn.w &&
        canvasY >= btn.y && canvasY <= btn.y + btn.h) {
      return btn;
    }
  }
  return null;
}

// ─── Battle Animation System ─────────────────────────────

interface BattleParticle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
}

interface BattleAnimState {
  type: PetType;
  particles: BattleParticle[];
  startTime: number;
  duration: number;
  targetX: number;
  targetY: number;
  nextPhase: "select" | "result";
}

function createBattleParticles(type: PetType, targetX: number, targetY: number): BattleParticle[] {
  const particles: BattleParticle[] = [];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 1 + Math.random() * 2;
    const base: Omit<BattleParticle, "color" | "vx" | "vy" | "size"> = {
      x: targetX + (Math.random() - 0.5) * 20,
      y: targetY + (Math.random() - 0.5) * 20,
      life: 1, maxLife: 1,
    };
    switch (type) {
      case "fire":
        particles.push({ ...base, vx: (Math.random() - 0.5) * 2, vy: -(1.5 + Math.random() * 2), size: 4 + Math.random() * 4, color: Math.random() > 0.5 ? "#e74c3c" : "#f39c12" });
        break;
      case "water":
        particles.push({ ...base, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 5 + Math.random() * 5, color: Math.random() > 0.5 ? "#3498db" : "#85c1e9" });
        break;
      case "grass":
        particles.push({ ...base, vx: (Math.random() - 0.5) * 3, vy: -(0.5 + Math.random() * 1.5), size: 4 + Math.random() * 3, color: Math.random() > 0.5 ? "#2ecc71" : "#1abc9c" });
        break;
      case "electric":
        particles.push({ ...base, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, size: 2 + Math.random() * 3, color: Math.random() > 0.5 ? "#f1c40f" : "#f9e547" });
        break;
      case "dark":
        particles.push({ ...base, vx: Math.cos(angle) * speed * 0.7, vy: Math.sin(angle) * speed * 0.7, size: 6 + Math.random() * 4, color: Math.random() > 0.5 ? "#9b59b6" : "#6c3483" });
        break;
    }
  }
  return particles;
}

// ─── Battle Action Processing ────────────────────────────

interface BattleActionResult {
  battleEnded: boolean;
  outcome?: "win" | "lose" | "flee";
  expGained?: number;
}

function selectEnemySkill(enemy: Pet): Skill {
  const usable = enemy.skills.filter((s) => s.mpCost <= enemy.mp);
  if (usable.length > 0) return usable[Math.floor(Math.random() * usable.length)];
  return { name: "普通攻击", type: enemy.type, power: 30, mpCost: 0, learnLevel: 1 };
}

function executeAttack(
  attacker: Pet, defender: Pet, skill: Skill, log: string[], attackerLabel: string,
): number {
  attacker.mp = Math.max(0, attacker.mp - skill.mpCost);
  const damage = calculateDamage(attacker.atk, defender.def, skill.power, skill.type, defender.type);
  defender.hp = Math.max(0, defender.hp - damage);
  const multiplier = getTypeMultiplier(skill.type, defender.type);
  let effectMsg = "";
  if (multiplier > 1) effectMsg = " 效果拔群！";
  else if (multiplier < 1) effectMsg = " 效果不佳...";
  log.push(`${attackerLabel}的${attacker.name}使用了${skill.name}，造成${damage}点伤害！${effectMsg}`);
  return damage;
}

function processBattleAction(
  battle: BattleState, action: "skill" | "flee", party: Pet[], skillIndex?: number,
): BattleActionResult {
  const { playerPet, enemyPet } = battle;

  if (action === "flee") {
    const fleeRate = calculateFleeRate(playerPet.spd, enemyPet.spd);
    if (Math.random() * 100 < fleeRate) {
      battle.log.push("逃跑成功！");
      battle.phase = "result";
      return { battleEnded: true, outcome: "flee" };
    }
    battle.log.push("逃跑失败！");
    const enemySkill = selectEnemySkill(enemyPet);
    executeAttack(enemyPet, playerPet, enemySkill, battle.log, "野生");
    if (playerPet.hp <= 0) {
      battle.log.push(`${playerPet.name}倒下了！`);
      const nextPet = party.find((p) => p.hp > 0 && p !== playerPet);
      if (nextPet) {
        battle.playerPet = nextPet;
        battle.log.push(`${nextPet.name}，上场！`);
      } else {
        battle.log.push("所有宠物都倒下了...战斗失败！");
        battle.phase = "result";
        return { battleEnded: true, outcome: "lose" };
      }
    }
    return { battleEnded: false };
  }

  if (skillIndex === undefined || skillIndex < 0 || skillIndex >= playerPet.skills.length) {
    return { battleEnded: false };
  }
  const playerSkill = playerPet.skills[skillIndex];
  if (playerSkill.mpCost > playerPet.mp) {
    battle.log.push(`MP不足，无法使用${playerSkill.name}！`);
    return { battleEnded: false };
  }

  const firstMover = determineTurnOrder(playerPet.spd, enemyPet.spd);

  if (firstMover === "player") {
    executeAttack(playerPet, enemyPet, playerSkill, battle.log, "我方");
    if (enemyPet.hp <= 0) {
      battle.log.push(`野生的${enemyPet.name}倒下了！`);
      const expGained = calculateExp(enemyPet.level);
      battle.log.push(`获得了${expGained}点经验值！`);
      battle.phase = "result";
      return { battleEnded: true, outcome: "win", expGained };
    }
    const enemySkill = selectEnemySkill(enemyPet);
    executeAttack(enemyPet, playerPet, enemySkill, battle.log, "野生");
    if (playerPet.hp <= 0) {
      battle.log.push(`${playerPet.name}倒下了！`);
      const nextPet = party.find((p) => p.hp > 0 && p !== playerPet);
      if (nextPet) {
        battle.playerPet = nextPet;
        battle.log.push(`${nextPet.name}，上场！`);
      } else {
        battle.log.push("所有宠物都倒下了...战斗失败！");
        battle.phase = "result";
        return { battleEnded: true, outcome: "lose" };
      }
    }
  } else {
    const enemySkill = selectEnemySkill(enemyPet);
    executeAttack(enemyPet, playerPet, enemySkill, battle.log, "野生");
    if (playerPet.hp <= 0) {
      battle.log.push(`${playerPet.name}倒下了！`);
      const nextPet = party.find((p) => p.hp > 0 && p !== playerPet);
      if (nextPet) {
        battle.playerPet = nextPet;
        battle.log.push(`${nextPet.name}，上场！`);
        return { battleEnded: false };
      } else {
        battle.log.push("所有宠物都倒下了...战斗失败！");
        battle.phase = "result";
        return { battleEnded: true, outcome: "lose" };
      }
    }
    executeAttack(playerPet, enemyPet, playerSkill, battle.log, "我方");
    if (enemyPet.hp <= 0) {
      battle.log.push(`野生的${enemyPet.name}倒下了！`);
      const expGained = calculateExp(enemyPet.level);
      battle.log.push(`获得了${expGained}点经验值！`);
      battle.phase = "result";
      return { battleEnded: true, outcome: "win", expGained };
    }
  }

  return { battleEnded: false };
}

// ─── PixiJS Rendering Functions ──────────────────────────

/** Draw a single tile at grid position using PixiJS Graphics */
function drawTilePixi(g: PixiGraphics, tileType: number, col: number, row: number) {
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;

  switch (tileType) {
    case TILE_TYPES.GRASS:
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(hexToNum("#4a8c3f"));
      g.rect(x + 6, y + 8, 2, 2).fill(hexToNum("#5ca04e"));
      g.rect(x + 16, y + 15, 2, 2).fill(hexToNum("#5ca04e"));
      g.rect(x + 26, y + 22, 2, 2).fill(hexToNum("#5ca04e"));
      break;
    case TILE_TYPES.ROAD:
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(hexToNum("#c4a46c"));
      g.rect(x + 4, y + 4, 3, 2).fill(hexToNum("#b89860"));
      g.rect(x + 18, y + 14, 4, 2).fill(hexToNum("#b89860"));
      g.rect(x + 10, y + 24, 3, 2).fill(hexToNum("#b89860"));
      break;
    case TILE_TYPES.WATER:
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(hexToNum("#3a7bd5"));
      // Simplified wave lines as thin rects
      g.rect(x + 2, y + 9, 28, 2).fill(hexToNum("#5a9be5"));
      g.rect(x + 4, y + 21, 26, 2).fill(hexToNum("#5a9be5"));
      break;
    case TILE_TYPES.TREE:
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(hexToNum("#4a8c3f"));
      // Trunk
      g.rect(x + 13, y + 20, 6, 12).fill(hexToNum("#6b4226"));
      // Canopy (triangle approximated as rects)
      g.rect(x + 8, y + 6, 16, 4).fill(hexToNum("#2d6b1e"));
      g.rect(x + 6, y + 10, 20, 4).fill(hexToNum("#2d6b1e"));
      g.rect(x + 4, y + 14, 24, 6).fill(hexToNum("#2d6b1e"));
      // Highlight
      g.rect(x + 10, y + 8, 12, 4).fill(hexToNum("#3a8a28"));
      g.rect(x + 8, y + 12, 16, 4).fill(hexToNum("#3a8a28"));
      break;
    case TILE_TYPES.ROCK:
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(hexToNum("#555555"));
      // Rock body (approximated as rects)
      g.rect(x + 6, y + 8, 20, 20).fill(hexToNum("#888888"));
      g.rect(x + 10, y + 10, 12, 8).fill(hexToNum("#aaaaaa"));
      break;
    case TILE_TYPES.TALL_GRASS:
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(hexToNum("#4a8c3f"));
      // Grass tufts as thin rects
      for (let i = 0; i < 5; i++) {
        const bx = x + 3 + i * 6;
        g.rect(bx, y + 16, 2, 12).fill(hexToNum("#2d6b1e"));
        g.rect(bx + 2, y + 18, 2, 10).fill(hexToNum("#2d6b1e"));
      }
      break;
    case TILE_TYPES.BUILDING:
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(hexToNum("#8b4513"));
      g.rect(x, y, TILE_SIZE, 10).fill(hexToNum("#a0522d"));
      g.rect(x + 12, y + 18, 8, 14).fill(hexToNum("#5a2d0c"));
      g.rect(x + 4, y + 12, 6, 6).fill(hexToNum("#87ceeb"));
      g.rect(x + 22, y + 12, 6, 6).fill(hexToNum("#87ceeb"));
      break;
    default:
      g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(hexToNum("#4a8c3f"));
  }
}

/** Draw player sprite using PixiJS Graphics */
function drawPlayerPixi(g: PixiGraphics, px: number, py: number, direction: Direction, animFrame: number) {
  const size = 24;
  const ox = px + (TILE_SIZE - size) / 2;
  const oy = py + (TILE_SIZE - size) / 2;
  const bob = animFrame % 2 === 0 ? 0 : -1;

  // Body
  g.rect(ox + 4, oy + 8 + bob, 16, 12).fill(hexToNum("#e74c3c"));
  // Head
  g.rect(ox + 6, oy + bob, 12, 10).fill(hexToNum("#fdd9b5"));
  // Hair
  g.rect(ox + 6, oy + bob, 12, 4).fill(hexToNum("#333333"));

  // Eyes
  switch (direction) {
    case "down":
      g.rect(ox + 8, oy + 5 + bob, 2, 2).fill(hexToNum("#222222"));
      g.rect(ox + 14, oy + 5 + bob, 2, 2).fill(hexToNum("#222222"));
      break;
    case "up":
      g.rect(ox + 6, oy + bob, 12, 6).fill(hexToNum("#333333"));
      break;
    case "left":
      g.rect(ox + 7, oy + 5 + bob, 2, 2).fill(hexToNum("#222222"));
      break;
    case "right":
      g.rect(ox + 15, oy + 5 + bob, 2, 2).fill(hexToNum("#222222"));
      break;
  }

  // Legs
  if (animFrame % 4 < 2) {
    g.rect(ox + 7, oy + 20 + bob, 4, 4).fill(hexToNum("#2c3e50"));
    g.rect(ox + 13, oy + 20 + bob, 4, 4).fill(hexToNum("#2c3e50"));
  } else {
    g.rect(ox + 5, oy + 20 + bob, 4, 4).fill(hexToNum("#2c3e50"));
    g.rect(ox + 15, oy + 20 + bob, 4, 4).fill(hexToNum("#2c3e50"));
  }

  // Direction indicator (small diamond)
  const arrowColor = hexToNum("#f0b90b");
  switch (direction) {
    case "down":
      g.rect(ox + size / 2 - 2, oy + size, 4, 3).fill(arrowColor);
      break;
    case "up":
      g.rect(ox + size / 2 - 2, oy - 3 + bob, 4, 3).fill(arrowColor);
      break;
    case "left":
      g.rect(ox - 3, oy + size / 2 - 2 + bob, 3, 4).fill(arrowColor);
      break;
    case "right":
      g.rect(ox + size, oy + size / 2 - 2 + bob, 3, 4).fill(arrowColor);
      break;
  }
}

/** Draw NPC sprite using PixiJS Graphics */
function drawNPCPixi(g: PixiGraphics, npc: NPC) {
  const px = npc.x * TILE_SIZE;
  const py = npc.y * TILE_SIZE;
  const size = 24;
  const ox = px + (TILE_SIZE - size) / 2;
  const oy = py + (TILE_SIZE - size) / 2;

  // Body
  g.rect(ox + 4, oy + 8, 16, 12).fill(hexToNum("#3498db"));
  // Head
  g.rect(ox + 6, oy, 12, 10).fill(hexToNum("#fdd9b5"));
  // Hair
  const hairColors = ["#8b4513", "#ffd700", "#c0c0c0", "#ff6347", "#9370db"];
  const hashIdx = npc.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % hairColors.length;
  g.rect(ox + 6, oy, 12, 4).fill(hexToNum(hairColors[hashIdx]));
  // Eyes
  g.rect(ox + 8, oy + 5, 2, 2).fill(hexToNum("#222222"));
  g.rect(ox + 14, oy + 5, 2, 2).fill(hexToNum("#222222"));
  // Legs
  g.rect(ox + 7, oy + 20, 4, 4).fill(hexToNum("#2c3e50"));
  g.rect(ox + 13, oy + 20, 4, 4).fill(hexToNum("#2c3e50"));
}

/** Draw pet sprite using PixiJS Graphics */
function drawPetSpritePixi(g: PixiGraphics, pet: Pet, x: number, y: number, size: number) {
  const color = hexToNum(PET_TYPE_COLORS[pet.type]);
  const dark = hexToNum(PET_TYPE_COLORS_DARK[pet.type]);
  const s = size;
  const u = Math.floor(s / 8);

  // Body (ellipse)
  g.ellipse(x + s / 2, y + s * 0.55, s * 0.38, s * 0.35).fill(color);
  // Head
  g.circle(x + s / 2, y + s * 0.28, s * 0.25).fill(color);
  // Eyes white
  g.circle(x + s * 0.38, y + s * 0.24, u * 1.2).fill(0xffffff);
  g.circle(x + s * 0.62, y + s * 0.24, u * 1.2).fill(0xffffff);
  // Pupils
  g.circle(x + s * 0.40, y + s * 0.25, u * 0.7).fill(0x111111);
  g.circle(x + s * 0.64, y + s * 0.25, u * 0.7).fill(0x111111);

  // Type-specific features (simplified to rects/circles)
  switch (pet.type) {
    case "fire":
      g.rect(x + s * 0.8, y + s * 0.3, u * 2, s * 0.2).fill(hexToNum("#f39c12"));
      break;
    case "water":
      g.circle(x + s * 0.5, y + s * 0.08, u * 1.5).fill(hexToNum("#85c1e9"));
      break;
    case "grass":
      g.ellipse(x + s * 0.58, y + s * 0.04, u * 2, u * 1).fill(hexToNum("#1abc9c"));
      break;
    case "electric":
      g.rect(x + s * 0.22, y - s * 0.05, u * 1.5, s * 0.15).fill(hexToNum("#f1c40f"));
      g.rect(x + s * 0.68, y - s * 0.05, u * 1.5, s * 0.15).fill(hexToNum("#f1c40f"));
      break;
    case "dark":
      g.circle(x + s * 0.2, y + s * 0.6, u * 1.5).fill({ color: hexToNum("#643296"), alpha: 0.5 });
      g.circle(x + s * 0.85, y + s * 0.55, u * 1.2).fill({ color: hexToNum("#643296"), alpha: 0.5 });
      break;
  }

  // Feet
  g.rect(x + s * 0.28, y + s * 0.78, u * 2, u * 1.5).fill(dark);
  g.rect(x + s * 0.58, y + s * 0.78, u * 2, u * 1.5).fill(dark);
}

/** Draw stat bar (HP/MP) using PixiJS Graphics */
function drawStatBarPixi(
  g: PixiGraphics, x: number, y: number, width: number, height: number,
  current: number, max: number, fillColor: number, bgColor: number = 0x333333,
) {
  const ratio = Math.max(0, Math.min(1, current / max));
  g.rect(x, y, width, height).fill(bgColor);
  g.rect(x, y, width * ratio, height).fill(fillColor);
  g.rect(x, y, width, height).stroke({ color: 0x555555, width: 1 });
}

// ─── Text Pool Management ────────────────────────────────

interface TextPool {
  texts: PixiText[];
  index: number;
}

function resetTextPool(pool: TextPool) {
  pool.index = 0;
  for (const t of pool.texts) {
    t.visible = false;
  }
}

function acquireText(pool: TextPool): PixiText | null {
  if (pool.index >= pool.texts.length) return null;
  const t = pool.texts[pool.index++];
  t.visible = true;
  t.alpha = 1;
  t.scale.set(1);
  t.anchor.set(0, 0);
  return t;
}

function setTextProps(
  t: PixiText, text: string, x: number, y: number,
  opts?: { fontSize?: number; fill?: number; fontWeight?: string; align?: "left" | "center" | "right" },
) {
  t.text = text;
  t.x = x;
  t.y = y;
  t.style.fontSize = opts?.fontSize ?? 12;
  t.style.fill = opts?.fill ?? 0xffffff;
  t.style.fontWeight = (opts?.fontWeight ?? "normal") as "normal" | "bold";
  if (opts?.align === "center") {
    t.anchor.set(0.5, 0);
  } else if (opts?.align === "right") {
    t.anchor.set(1, 0);
  } else {
    t.anchor.set(0, 0);
  }
}

// ─── Composite Rendering (PixiJS) ────────────────────────

function renderMapPixi(
  g: PixiGraphics, pool: TextPool, area: MapArea,
  playerX: number, playerY: number, playerDirection: Direction, animFrame: number,
) {
  // Draw all tiles
  const { tiles } = area.tileMap;
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      drawTilePixi(g, tiles[row][col], col, row);
    }
  }

  // Portals
  for (const portal of area.portals) {
    g.rect(portal.x * TILE_SIZE + 4, portal.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8)
      .fill({ color: hexToNum("#f0b90b"), alpha: 0.35 });
  }

  // NPCs
  for (const npc of area.npcs) {
    drawNPCPixi(g, npc);
    // NPC name tag
    const t = acquireText(pool);
    if (t) {
      setTextProps(t, npc.name, npc.x * TILE_SIZE + TILE_SIZE / 2, npc.y * TILE_SIZE - 12,
        { fontSize: 8, fill: 0xffffff, fontWeight: "bold", align: "center" });
    }
  }

  // Player
  drawPlayerPixi(g, playerX * TILE_SIZE, playerY * TILE_SIZE, playerDirection, animFrame);
}

function renderHUDPixi(
  g: PixiGraphics, pool: TextPool, state: GameState, areaName: string, fps: number,
) {
  const hudH = 28;
  g.rect(0, 0, CANVAS_WIDTH, hudH).fill({ color: 0x000000, alpha: 0.7 });

  let t = acquireText(pool);
  if (t) setTextProps(t, "训练师", 8, 6, { fontSize: 11, fill: hexToNum("#f0b90b"), fontWeight: "bold" });

  t = acquireText(pool);
  if (t) setTextProps(t, `金${state.gold}`, 70, 6, { fontSize: 11, fill: hexToNum("#ffd700"), fontWeight: "bold" });

  t = acquireText(pool);
  if (t) setTextProps(t, areaName, 140, 6, { fontSize: 11, fill: 0xaaaaaa, fontWeight: "bold" });

  const activeQuest = state.quests.find((q) => !q.completed);
  if (activeQuest) {
    const questDef = QUESTS.find((q) => q.id === activeQuest.questId);
    if (questDef) {
      t = acquireText(pool);
      if (t) setTextProps(t, `任务:${questDef.name}`, 240, 8, { fontSize: 9, fill: hexToNum("#88ccff") });
    }
  }

  // Party pet thumbnails
  const thumbSize = 16;
  const thumbY = 6;
  for (let i = 0; i < state.party.length; i++) {
    const pet = state.party[i];
    const tx = CANVAS_WIDTH - 8 - (state.party.length - i) * (thumbSize + 4);
    g.circle(tx + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2).fill(hexToNum(PET_TYPE_COLORS[pet.type]));
    const hpRatio = pet.hp / pet.maxHp;
    const hpColor = hpRatio > 0.5 ? 0x2ecc71 : hpRatio > 0.2 ? 0xf39c12 : 0xe74c3c;
    g.rect(tx + 2, thumbY + thumbSize + 1, (thumbSize - 4) * hpRatio, 2).fill(hpColor);
  }

  // FPS
  t = acquireText(pool);
  if (t) setTextProps(t, `${fps}fps`, CANVAS_WIDTH - 4, hudH + 2, { fontSize: 8, fill: 0x555555, align: "right" });
}

function renderDialogPixi(
  g: PixiGraphics, pool: TextPool, npc: NPC, dialogIndex: number, charIndex: number,
) {
  const boxH = 100;
  const boxY = CANVAS_HEIGHT - boxH - 8;
  const boxX = 8;
  const boxW = CANVAS_WIDTH - 16;

  g.rect(boxX, boxY, boxW, boxH).fill({ color: 0x000000, alpha: 0.85 });
  g.rect(boxX, boxY, boxW, boxH).stroke({ color: hexToNum("#f0b90b"), width: 2 });

  // NPC portrait
  const portraitX = boxX + 16;
  const portraitY = boxY + 20;
  g.circle(portraitX, portraitY + 12, 14).fill(hexToNum("#3498db"));
  g.circle(portraitX, portraitY + 6, 8).fill(hexToNum("#fdd9b5"));
  const hairColors = ["#8b4513", "#ffd700", "#c0c0c0", "#ff6347", "#9370db"];
  const hashIdx = npc.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % hairColors.length;
  g.rect(portraitX - 8, portraitY - 2, 16, 4).fill(hexToNum(hairColors[hashIdx]));

  // NPC name
  let t = acquireText(pool);
  if (t) setTextProps(t, npc.name, boxX + 40, boxY + 6, { fontSize: 13, fill: hexToNum("#f0b90b"), fontWeight: "bold" });

  // Dialog text
  const dialog = npc.dialogs[dialogIndex];
  if (dialog) {
    const visibleText = dialog.text.substring(0, charIndex);
    // Simple line splitting (approx 30 chars per line)
    const maxCharsPerLine = 30;
    const lines: string[] = [];
    for (let i = 0; i < visibleText.length; i += maxCharsPerLine) {
      lines.push(visibleText.slice(i, i + maxCharsPerLine));
    }
    lines.slice(0, 3).forEach((line, i) => {
      t = acquireText(pool);
      if (t) setTextProps(t, line, boxX + 40, boxY + 26 + i * 18, { fontSize: 12, fill: 0xffffff });
    });
  }

  // Advance hint
  t = acquireText(pool);
  if (t) setTextProps(t, "按 Z 继续", boxX + boxW - 8, boxY + boxH - 18, { fontSize: 10, fill: 0x888888, align: "right" });
}

function renderMenuPixi(
  g: PixiGraphics, pool: TextPool, state: GameState, selectedIndex: number,
) {
  g.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.85 });

  let t = acquireText(pool);
  if (t) setTextProps(t, "暂停菜单", CANVAS_WIDTH / 2, 20, { fontSize: 18, fill: hexToNum("#f0b90b"), fontWeight: "bold", align: "center" });

  const menuItems = ["宠物队伍", "背包道具", "任务列表", "返回游戏"];
  const menuY = 60;
  const itemH = 32;

  for (let i = 0; i < menuItems.length; i++) {
    const y = menuY + i * (itemH + 8);
    const isSelected = i === selectedIndex;
    g.rect(CANVAS_WIDTH / 2 - 120, y, 240, itemH)
      .fill({ color: isSelected ? hexToNum("#f0b90b") : 0xffffff, alpha: isSelected ? 0.2 : 0.05 });
    g.rect(CANVAS_WIDTH / 2 - 120, y, 240, itemH)
      .stroke({ color: isSelected ? hexToNum("#f0b90b") : 0x444444, width: isSelected ? 2 : 1 });
    t = acquireText(pool);
    if (t) setTextProps(t, menuItems[i], CANVAS_WIDTH / 2, y + 8, {
      fontSize: 14, fill: isSelected ? hexToNum("#f0b90b") : 0xcccccc, fontWeight: "bold", align: "center",
    });
  }

  // Content panel
  const panelY = menuY + menuItems.length * (itemH + 8) + 10;

  if (selectedIndex === 0) {
    t = acquireText(pool);
    if (t) setTextProps(t, "宠物队伍:", 30, panelY, { fontSize: 12, fill: 0xffffff, fontWeight: "bold" });
    state.party.forEach((pet, i) => {
      const py = panelY + 18 + i * 36;
      g.circle(42, py + 6, 6).fill(hexToNum(PET_TYPE_COLORS[pet.type]));
      const typeNameMap: Record<string, string> = { fire: "火", water: "水", grass: "草", electric: "电", dark: "暗" };
      t = acquireText(pool);
      if (t) setTextProps(t, `${pet.name}  等级${pet.level}  [${typeNameMap[pet.type] ?? pet.type}]`, 54, py, { fontSize: 11, fill: 0xffffff });
      drawStatBarPixi(g, 54, py + 16, 120, 6, pet.hp, pet.maxHp, 0x2ecc71);
      t = acquireText(pool);
      if (t) setTextProps(t, `生命 ${pet.hp}/${pet.maxHp}`, 180, py + 12, { fontSize: 9, fill: 0xaaaaaa });
    });
  } else if (selectedIndex === 1) {
    t = acquireText(pool);
    if (t) setTextProps(t, "背包道具:", 30, panelY, { fontSize: 12, fill: 0xffffff, fontWeight: "bold" });
    state.items.forEach((item, i) => {
      t = acquireText(pool);
      if (t) setTextProps(t, `${item.name} × ${item.count}`, 42, panelY + 20 + i * 20, { fontSize: 11, fill: 0xcccccc });
    });
  } else if (selectedIndex === 2) {
    t = acquireText(pool);
    if (t) setTextProps(t, "任务列表:", 30, panelY, { fontSize: 12, fill: 0xffffff, fontWeight: "bold" });
    QUESTS.forEach((quest, i) => {
      const progress = state.quests.find((q) => q.questId === quest.id);
      const completed = progress?.completed ?? false;
      t = acquireText(pool);
      if (t) setTextProps(t, `${completed ? "✓" : "○"} ${quest.name}`, 42, panelY + 20 + i * 22, {
        fontSize: 11, fill: completed ? 0x2ecc71 : 0xf39c12,
      });
      t = acquireText(pool);
      if (t) setTextProps(t, quest.description, 62, panelY + 34 + i * 22, { fontSize: 9, fill: 0x888888 });
    });
  }

  t = acquireText(pool);
  if (t) setTextProps(t, "↑↓ 选择 · Z 确认 · ESC 返回游戏", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20, {
    fontSize: 10, fill: 0x666666, align: "center",
  });
}

function renderBattlePixi(
  g: PixiGraphics, pool: TextPool, battle: BattleState,
) {
  // Background gradient approximation
  g.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT / 2).fill(hexToNum("#1a1a2e"));
  g.rect(0, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT / 2).fill(hexToNum("#0f3460"));

  // Arena floor
  g.ellipse(CANVAS_WIDTH / 2, 260, 280, 60).fill({ color: 0xffffff, alpha: 0.06 });

  // Enemy pet
  const enemy = battle.enemyPet;
  drawPetSpritePixi(g, enemy, 420, 50, 64);

  // Enemy info
  const enemyInfoX = 380;
  const enemyInfoY = 8;
  let t = acquireText(pool);
  if (t) setTextProps(t, enemy.name, enemyInfoX, enemyInfoY, { fontSize: 14, fill: 0xffffff, fontWeight: "bold" });
  t = acquireText(pool);
  if (t) setTextProps(t, `等级${enemy.level}`, enemyInfoX + 80, enemyInfoY, { fontSize: 12, fill: 0xaaaaaa });
  t = acquireText(pool);
  if (t) setTextProps(t, "HP", enemyInfoX, enemyInfoY + 16, { fontSize: 10, fill: 0xaaaaaa });
  drawStatBarPixi(g, enemyInfoX + 22, enemyInfoY + 14, 140, 10, enemy.hp, enemy.maxHp, 0x2ecc71);
  t = acquireText(pool);
  if (t) setTextProps(t, `${enemy.hp}/${enemy.maxHp}`, enemyInfoX + 166, enemyInfoY + 14, { fontSize: 9, fill: 0xcccccc });
  t = acquireText(pool);
  if (t) setTextProps(t, "MP", enemyInfoX, enemyInfoY + 30, { fontSize: 10, fill: 0xaaaaaa });
  drawStatBarPixi(g, enemyInfoX + 22, enemyInfoY + 28, 140, 10, enemy.mp, enemy.maxMp, 0x3498db);
  t = acquireText(pool);
  if (t) setTextProps(t, `${enemy.mp}/${enemy.maxMp}`, enemyInfoX + 166, enemyInfoY + 28, { fontSize: 9, fill: 0xcccccc });

  // Player pet
  const player = battle.playerPet;
  drawPetSpritePixi(g, player, 100, 170, 64);

  // Player info
  const playerInfoX = 30;
  const playerInfoY = 148;
  t = acquireText(pool);
  if (t) setTextProps(t, player.name, playerInfoX, playerInfoY, { fontSize: 14, fill: 0xffffff, fontWeight: "bold" });
  t = acquireText(pool);
  if (t) setTextProps(t, `等级${player.level}`, playerInfoX + 80, playerInfoY, { fontSize: 12, fill: 0xaaaaaa });
  t = acquireText(pool);
  if (t) setTextProps(t, "HP", playerInfoX, playerInfoY + 16, { fontSize: 10, fill: 0xaaaaaa });
  drawStatBarPixi(g, playerInfoX + 22, playerInfoY + 14, 140, 10, player.hp, player.maxHp, 0x2ecc71);
  t = acquireText(pool);
  if (t) setTextProps(t, `${player.hp}/${player.maxHp}`, playerInfoX + 166, playerInfoY + 14, { fontSize: 9, fill: 0xcccccc });
  t = acquireText(pool);
  if (t) setTextProps(t, "MP", playerInfoX, playerInfoY + 30, { fontSize: 10, fill: 0xaaaaaa });
  drawStatBarPixi(g, playerInfoX + 22, playerInfoY + 28, 140, 10, player.mp, player.maxMp, 0x3498db);
  t = acquireText(pool);
  if (t) setTextProps(t, `${player.mp}/${player.maxMp}`, playerInfoX + 166, playerInfoY + 28, { fontSize: 9, fill: 0xcccccc });

  // Battle log
  const logY = 270;
  const logH = 78;
  g.rect(10, logY, CANVAS_WIDTH - 20, logH).fill({ color: 0x000000, alpha: 0.6 });
  g.rect(10, logY, CANVAS_WIDTH - 20, logH).stroke({ color: 0x444444, width: 1 });

  const visibleLogs = battle.log.slice(-4);
  visibleLogs.forEach((msg, i) => {
    t = acquireText(pool);
    if (t) setTextProps(t, msg.length > 40 ? msg.slice(0, 40) + "…" : msg, 20, logY + 6 + i * 18, { fontSize: 12, fill: 0xdddddd });
  });

  // Battle menu
  if (battle.phase === "select") {
    g.rect(8, 350, CANVAS_WIDTH - 16, CANVAS_HEIGHT - 354).fill({ color: 0x000000, alpha: 0.7 });
    g.rect(8, 350, CANVAS_WIDTH - 16, CANVAS_HEIGHT - 354).stroke({ color: 0x555555, width: 1 });

    const buttons = buildBattleButtons(battle);
    for (const btn of buttons) {
      if (btn.disabled) {
        g.rect(btn.x, btn.y, btn.w, btn.h).fill(0x444444);
      } else {
        const btnColor = btn.color ? hexToNum(btn.color) : 0xffffff;
        g.rect(btn.x, btn.y, btn.w, btn.h).fill({ color: btnColor, alpha: 0.2 });
      }
      g.rect(btn.x, btn.y, btn.w, btn.h).stroke({
        color: btn.disabled ? 0x555555 : (btn.color ? hexToNum(btn.color) : 0x888888),
        width: btn.disabled ? 1 : 2,
      });
      t = acquireText(pool);
      if (t) setTextProps(t, btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 - 6, {
        fontSize: btn.type === "skill" ? 11 : 12,
        fill: btn.disabled ? 0x666666 : 0xffffff,
        fontWeight: "bold",
        align: "center",
      });
    }
  }
}

function renderBattleAnimationPixi(
  g: PixiGraphics, anim: BattleAnimState, elapsed: number,
): boolean {
  const progress = Math.min(1, elapsed / anim.duration);
  const alive = progress < 1;

  for (const p of anim.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life = Math.max(0, 1 - progress);
    const alpha = p.life;
    if (alpha <= 0) continue;

    const pColor = hexToNum(p.color);

    switch (anim.type) {
      case "fire":
        g.circle(p.x, p.y, p.size * p.life).fill({ color: pColor, alpha });
        break;
      case "water": {
        const radius = p.size * (1 + progress * 1.5);
        g.circle(p.x, p.y, radius).stroke({ color: pColor, width: 2, alpha });
        break;
      }
      case "grass":
        g.ellipse(p.x, p.y, p.size, p.size * 0.4).fill({ color: pColor, alpha });
        break;
      case "electric":
        g.rect(p.x, p.y, p.size * 2, 2).fill({ color: pColor, alpha });
        g.rect(p.x + p.size, p.y - p.size, 2, p.size).fill({ color: pColor, alpha });
        break;
      case "dark":
        g.circle(p.x, p.y, p.size * (0.5 + progress * 0.8)).fill({ color: pColor, alpha });
        break;
    }
  }

  return alive;
}

// ─── Component ───────────────────────────────────────────

export default function PokemonPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());

  const [, setGamePhase] = useState<GameState["phase"]>("explore");
  const animFrameRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const battleRef = useRef<BattleState | null>(null);
  const battleAnimRef = useRef<BattleAnimState | null>(null);

  // Dialog state refs
  const dialogNpcRef = useRef<NPC | null>(null);
  const dialogIndexRef = useRef(0);
  const dialogCharIndexRef = useRef(0);
  const dialogLastCharTimeRef = useRef(0);

  // Menu state ref
  const menuSelectedRef = useRef(0);

  // FPS monitoring refs
  const fpsFrameTimesRef = useRef<number[]>([]);
  const reduceParticlesRef = useRef(false);
  const lastFrameTimeRef = useRef(0);

  const MOVE_COOLDOWN = 150;

  /** Handle canvas click/touch for battle menu interaction */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !battleRef.current) return;
    if (battleRef.current.phase !== "select") return;

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("touches" in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    const btn = detectBattleButtonClick(battleRef.current, canvasX, canvasY);
    if (!btn || btn.disabled) return;

    const state = gameRef.current;
    if (!state) return;
    const battle = battleRef.current;

    if (btn.type === "skill" && btn.skillIndex !== undefined) {
      const skill = battle.playerPet.skills[btn.skillIndex];
      if (!skill || skill.mpCost > battle.playerPet.mp) return;

      battle.phase = "animate";
      const enemyTargetX = 452;
      const enemyTargetY = 82;
      battleAnimRef.current = {
        type: skill.type,
        particles: createBattleParticles(skill.type, enemyTargetX, enemyTargetY),
        startTime: performance.now(),
        duration: 600,
        targetX: enemyTargetX,
        targetY: enemyTargetY,
        nextPhase: "select",
      };

      setTimeout(() => {
        if (!battleRef.current || !gameRef.current) return;
        const result = processBattleAction(battleRef.current, "skill", gameRef.current.party, btn.skillIndex);
        if (result.battleEnded) {
          battleRef.current.phase = "result";
          battleAnimRef.current = null;
          setTimeout(() => {
            if (!battleRef.current || !gameRef.current) return;
            const bState = gameRef.current;
            if (result.outcome === "win" && result.expGained) {
              const activePet = battleRef.current.playerPet;
              activePet.exp += result.expGained;
              const levelUpLogs = applyLevelUp(activePet);
              if (battleRef.current) battleRef.current.log.push(...levelUpLogs);
            } else if (result.outcome === "lose") {
              bState.currentArea = "village";
              bState.player.x = 9;
              bState.player.y = 9;
              for (const pet of bState.party) { pet.hp = pet.maxHp; pet.mp = pet.maxMp; }
            }
            bState.phase = "explore";
            battleRef.current = null;
            battleAnimRef.current = null;
            setGamePhase("explore");
          }, 1500);
        } else {
          if (battleRef.current) battleRef.current.phase = "select";
          battleAnimRef.current = null;
        }
      }, 650);
    } else if (btn.type === "flee") {
      const result = processBattleAction(battle, "flee", state.party);
      if (result.battleEnded) {
        setTimeout(() => {
          state.phase = "explore";
          battleRef.current = null;
          setGamePhase("explore");
        }, 800);
      }
    } else if (btn.type === "item") {
      const potionStack = state.items.find((i) => i.id === "potion" && i.count > 0);
      if (!potionStack) { battle.log.push("没有可用的道具！"); return; }
      potionStack.count--;
      const healAmount = Math.floor(battle.playerPet.maxHp * 0.25);
      const oldHp = battle.playerPet.hp;
      battle.playerPet.hp = Math.min(battle.playerPet.maxHp, battle.playerPet.hp + healAmount);
      battle.log.push(`使用了回复药水，${battle.playerPet.name}恢复了${battle.playerPet.hp - oldHp}点HP！`);

      const enemySkill = selectEnemySkill(battle.enemyPet);
      executeAttack(battle.enemyPet, battle.playerPet, enemySkill, battle.log, "野生");

      if (battle.playerPet.hp <= 0) {
        battle.log.push(`${battle.playerPet.name}倒下了！`);
        const nextPet = state.party.find((p) => p.hp > 0 && p !== battle.playerPet);
        if (nextPet) {
          battle.playerPet = nextPet;
          battle.log.push(`${nextPet.name}，上场！`);
        } else {
          battle.log.push("所有宠物都倒下了...战斗失败！");
          battle.phase = "result";
          setTimeout(() => {
            if (!gameRef.current) return;
            gameRef.current.currentArea = "village";
            gameRef.current.player.x = 9;
            gameRef.current.player.y = 9;
            for (const pet of gameRef.current.party) { pet.hp = pet.maxHp; pet.mp = pet.maxMp; }
            gameRef.current.phase = "explore";
            battleRef.current = null;
            battleAnimRef.current = null;
            setGamePhase("explore");
          }, 1500);
        }
      }
    } else if (btn.type === "capture") {
      const ballStack = state.items.find((i) => i.id === "pokeball" && i.count > 0);
      if (!ballStack) { battle.log.push("没有捕捉球了！"); return; }
      ballStack.count--;
      const catchRate = calculateCatchRate(BASE_CATCH_RATE, battle.enemyPet.hp, battle.enemyPet.maxHp, 1.0);
      battle.log.push(`投出了捕捉球...（成功率${Math.floor(catchRate * 100)}%）`);

      if (Math.random() < catchRate) {
        const capturedPet: Pet = { ...battle.enemyPet, exp: 0 };
        if (state.party.length < MAX_PARTY_SIZE) {
          state.party.push(capturedPet);
          state.allPets.push(capturedPet);
          battle.log.push(`捕捉成功！${capturedPet.name}加入了队伍！`);
        } else {
          state.allPets.push(capturedPet);
          battle.log.push(`捕捉成功！但队伍已满，${capturedPet.name}已存入仓库。`);
        }
        battle.phase = "result";
        setTimeout(() => {
          if (!gameRef.current) return;
          gameRef.current.phase = "explore";
          battleRef.current = null;
          battleAnimRef.current = null;
          setGamePhase("explore");
        }, 1500);
      } else {
        battle.log.push("捕捉失败！球被弹开了...");
        const enemySkill = selectEnemySkill(battle.enemyPet);
        executeAttack(battle.enemyPet, battle.playerPet, enemySkill, battle.log, "野生");

        if (battle.playerPet.hp <= 0) {
          battle.log.push(`${battle.playerPet.name}倒下了！`);
          const nextPet = state.party.find((p) => p.hp > 0 && p !== battle.playerPet);
          if (nextPet) {
            battle.playerPet = nextPet;
            battle.log.push(`${nextPet.name}，上场！`);
          } else {
            battle.log.push("所有宠物都倒下了...战斗失败！");
            battle.phase = "result";
            setTimeout(() => {
              if (!gameRef.current) return;
              gameRef.current.currentArea = "village";
              gameRef.current.player.x = 9;
              gameRef.current.player.y = 9;
              for (const pet of gameRef.current.party) { pet.hp = pet.maxHp; pet.mp = pet.maxMp; }
              gameRef.current.phase = "explore";
              battleRef.current = null;
              battleAnimRef.current = null;
              setGamePhase("explore");
            }, 1500);
          }
        }
      }
    }
  }, [setGamePhase]);

  // Initialize game state
  useEffect(() => {
    if (!gameRef.current) {
      const starterPet = createPetFromTemplate(
        PET_TEMPLATES.find((t) => t.id === "fire_pup")!,
        5,
      );
      gameRef.current = {
        phase: "explore",
        player: { x: 9, y: 9, direction: "down" },
        currentArea: "village",
        party: [starterPet],
        allPets: [starterPet],
        items: [
          { id: "potion", name: "回复药水", count: 5 },
          { id: "pokeball", name: "捕捉球", count: 10 },
        ],
        quests: QUESTS.map((q) => ({ questId: q.id, completed: false })),
        gold: 100,
        unlockedAreas: ["village", "forest"],
      };
    }
  }, []);

  // Keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      const state = gameRef.current;
      if (!state) return;

      if (state.phase === "dialog" && e.code === "KeyZ") {
        const npc = dialogNpcRef.current;
        if (!npc) return;
        const dialog = npc.dialogs[dialogIndexRef.current];
        if (dialog && dialogCharIndexRef.current < dialog.text.length) {
          dialogCharIndexRef.current = dialog.text.length;
          return;
        }
        const next = advanceDialog(npc.dialogs.length, dialogIndexRef.current);
        if (next === -1) {
          if (npc.questId && state) {
            const qp = state.quests.find((q) => q.questId === npc.questId);
            const questDef = QUESTS.find((q) => q.id === npc.questId);
            if (qp && !qp.completed && questDef && questDef.condition(state)) {
              qp.completed = true;
              if (questDef.reward.exp) {
                for (const pet of state.party) { pet.exp += questDef.reward.exp; applyLevelUp(pet); }
              }
              if (questDef.reward.unlockArea && !state.unlockedAreas.includes(questDef.reward.unlockArea)) {
                state.unlockedAreas.push(questDef.reward.unlockArea);
              }
              if (questDef.reward.items) {
                for (const itemId of questDef.reward.items) {
                  const existing = state.items.find((i) => i.id === itemId);
                  if (existing) existing.count++;
                  else state.items.push({ id: itemId, name: itemId, count: 1 });
                }
              }
            }
          }
          dialogNpcRef.current = null;
          state.phase = "explore";
          setGamePhase("explore");
        } else {
          dialogIndexRef.current = next;
          dialogCharIndexRef.current = 0;
          dialogLastCharTimeRef.current = performance.now();
        }
        return;
      }

      if (state.phase === "menu") {
        if (e.code === "Escape" || (e.code === "KeyZ" && menuSelectedRef.current === 3)) {
          state.phase = "explore";
          setGamePhase("explore");
          return;
        }
        if (e.code === "ArrowUp") menuSelectedRef.current = Math.max(0, menuSelectedRef.current - 1);
        else if (e.code === "ArrowDown") menuSelectedRef.current = Math.min(3, menuSelectedRef.current + 1);
        return;
      }

      if (state.phase === "explore") {
        if (e.code === "Escape") {
          menuSelectedRef.current = 0;
          state.phase = "menu";
          setGamePhase("menu");
          return;
        }
        if (e.code === "KeyZ") {
          const area = getMapArea(state.currentArea);
          if (!area) return;
          const px = state.player.x;
          const py = state.player.y;
          const dir = state.player.direction;
          let nx = px, ny = py;
          if (dir === "up") ny--;
          else if (dir === "down") ny++;
          else if (dir === "left") nx--;
          else if (dir === "right") nx++;
          const npc = area.npcs.find((n) => n.x === nx && n.y === ny);
          if (npc) {
            dialogNpcRef.current = npc;
            dialogIndexRef.current = 0;
            dialogCharIndexRef.current = 0;
            dialogLastCharTimeRef.current = performance.now();
            state.phase = "dialog";
            setGamePhase("dialog");
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.code); };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [setGamePhase]);

  // PixiJS game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    let app: Application | null = null;
    let gfx: PixiGraphics | null = null;
    let textPool: TextPool | null = null;

    const TEXT_POOL_SIZE = 70;

    async function init() {
      if (destroyed) return;
      const pixi = await loadPixi();
      if (destroyed) return;

      app = await createPixiApp({
        canvas: canvas!,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 0x0f0f0f,
      });
      if (destroyed) { app.destroy(true); return; }

      gfx = new pixi.Graphics();
      app.stage.addChild(gfx);

      // Pre-create text pool
      const texts: PixiText[] = [];
      for (let i = 0; i < TEXT_POOL_SIZE; i++) {
        const t = new pixi.Text({
          text: "",
          style: {
            fontSize: 12,
            fill: 0xffffff,
            fontFamily: "monospace",
            fontWeight: "normal",
          },
        });
        t.visible = false;
        app.stage.addChild(t);
        texts.push(t);
      }
      textPool = { texts, index: 0 };

      app.ticker.add(() => {
        if (destroyed || !gfx || !textPool) return;
        const state = gameRef.current;
        if (!state) return;

        // Clear graphics each frame
        gfx.clear();
        resetTextPool(textPool);

        const now = performance.now();

        // FPS monitoring
        const deltaMs = now - lastFrameTimeRef.current;
        lastFrameTimeRef.current = now;
        const currentFps = deltaMs > 0 ? Math.round(1000 / deltaMs) : 60;
        fpsFrameTimesRef.current.push(currentFps);
        if (fpsFrameTimesRef.current.length > 60) fpsFrameTimesRef.current.shift();
        const recent10 = fpsFrameTimesRef.current.slice(-10);
        if (recent10.length >= 10 && recent10.every((f) => f < 30)) {
          reduceParticlesRef.current = true;
        } else if (recent10.length >= 10 && recent10.every((f) => f >= 30)) {
          reduceParticlesRef.current = false;
        }
        const avgFps = fpsFrameTimesRef.current.length > 0
          ? Math.round(fpsFrameTimesRef.current.reduce((a, b) => a + b, 0) / fpsFrameTimesRef.current.length)
          : 60;

        // Battle phase
        if (state.phase === "battle" && battleRef.current) {
          renderBattlePixi(gfx, textPool, battleRef.current);
          if (battleRef.current.phase === "animate" && battleAnimRef.current) {
            const elapsed = now - battleAnimRef.current.startTime;
            const stillAlive = renderBattleAnimationPixi(gfx, battleAnimRef.current, elapsed);
            if (!stillAlive) {
              battleRef.current.phase = battleAnimRef.current.nextPhase;
              battleAnimRef.current = null;
            }
          }
          return;
        }

        // Menu phase
        if (state.phase === "menu") {
          renderMenuPixi(gfx, textPool, state, menuSelectedRef.current);
          return;
        }

        // Dialog phase
        if (state.phase === "dialog") {
          const area = getMapArea(state.currentArea ?? "village");
          if (area) {
            renderMapPixi(gfx, textPool, area, state.player.x, state.player.y, state.player.direction, animFrameRef.current);
            renderHUDPixi(gfx, textPool, state, area.name, avgFps);
          }
          const npc = dialogNpcRef.current;
          if (npc) {
            const dialog = npc.dialogs[dialogIndexRef.current];
            if (dialog && dialogCharIndexRef.current < dialog.text.length) {
              const charElapsed = now - dialogLastCharTimeRef.current;
              if (charElapsed >= 50) {
                dialogCharIndexRef.current++;
                dialogLastCharTimeRef.current = now;
              }
            }
            renderDialogPixi(gfx, textPool, npc, dialogIndexRef.current, dialogCharIndexRef.current);
          }
          return;
        }

        if (state.phase !== "explore") {
          const area = getMapArea(state.currentArea ?? "village");
          if (area) {
            renderMapPixi(gfx, textPool, area, state.player.x, state.player.y, state.player.direction, animFrameRef.current);
          }
          return;
        }

        const area = getMapArea(state.currentArea);
        if (!area) return;

        // Tile-based movement with cooldown
        const timestamp = now;
        const elapsed = timestamp - lastMoveTimeRef.current;
        if (elapsed >= MOVE_COOLDOWN) {
          const keys = keysRef.current;
          let dx = 0;
          let dy = 0;
          let newDirection: Direction | null = null;

          if (keys.has("ArrowUp")) { dy = -1; newDirection = "up"; }
          else if (keys.has("ArrowDown")) { dy = 1; newDirection = "down"; }
          else if (keys.has("ArrowLeft")) { dx = -1; newDirection = "left"; }
          else if (keys.has("ArrowRight")) { dx = 1; newDirection = "right"; }

          if (newDirection) {
            state.player.direction = newDirection;
            const targetX = state.player.x + dx;
            const targetY = state.player.y + dy;

            if (targetX >= 0 && targetX < area.tileMap.width && targetY >= 0 && targetY < area.tileMap.height) {
              const isBlocked = area.tileMap.collisions[targetY][targetX];
              if (!isBlocked) {
                state.player.x = targetX;
                state.player.y = targetY;
                animFrameRef.current++;

                const portal = area.portals.find((p) => p.x === targetX && p.y === targetY);
                if (portal) {
                  state.currentArea = portal.targetArea;
                  state.player.x = portal.targetX;
                  state.player.y = portal.targetY;
                } else {
                  const isEncounterTile = area.tileMap.encounters[targetY][targetX];
                  if (checkEncounter(isEncounterTile)) {
                    const wildPetId = selectWildPet(area.petTable);
                    const wildTemplate = PET_TEMPLATES.find((t) => t.id === wildPetId);
                    if (wildTemplate) {
                      const levelRange = AREA_LEVEL_RANGE[state.currentArea] ?? { min: 3, max: 6 };
                      const wildLevel = levelRange.min + Math.floor(Math.random() * (levelRange.max - levelRange.min + 1));
                      const wildPet = createPetFromTemplate(wildTemplate, wildLevel);
                      battleRef.current = {
                        playerPet: state.party[0],
                        enemyPet: wildPet,
                        turn: determineTurnOrder(state.party[0].spd, wildPet.spd),
                        phase: "select",
                        log: [`野生的 ${wildPet.name} (等级${wildLevel}) 出现了！`],
                      };
                      state.phase = "battle";
                      setGamePhase("battle");
                    }
                  }
                }
              }
            }
            lastMoveTimeRef.current = timestamp;
          }
        }

        // Render explore
        const currentArea = getMapArea(state.currentArea)!;
        renderMapPixi(gfx, textPool, currentArea, state.player.x, state.player.y, state.player.direction, animFrameRef.current);
        renderHUDPixi(gfx, textPool, state, currentArea.name, avgFps);
      });
    }

    init();

    return () => {
      destroyed = true;
      if (app) {
        app.destroy(true);
        app = null;
      }
    };
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4 pb-24 md:pb-8">
        <h1 className="text-xl font-bold text-white mb-3">
          <span className="text-[#f0b90b]">宠物大冒险</span>
        </h1>

        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full rounded-xl bg-[#111] border border-[#333]"
            style={{ touchAction: "none", imageRendering: "pixelated" }}
            onClick={handleCanvasClick}
            onTouchStart={handleCanvasClick}
          />
        </div>

        <div className="flex justify-between items-center mt-3 md:hidden">
          <div className="grid grid-cols-3 gap-1 w-32">
            <div />
            <button
              className="w-10 h-10 rounded-lg bg-[#222] border border-[#444] text-white text-lg active:bg-[#333] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("ArrowUp")}
              onTouchEnd={() => keysRef.current.delete("ArrowUp")}
              aria-label="上移"
            >▲</button>
            <div />
            <button
              className="w-10 h-10 rounded-lg bg-[#222] border border-[#444] text-white text-lg active:bg-[#333] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("ArrowLeft")}
              onTouchEnd={() => keysRef.current.delete("ArrowLeft")}
              aria-label="左移"
            >◀</button>
            <div />
            <button
              className="w-10 h-10 rounded-lg bg-[#222] border border-[#444] text-white text-lg active:bg-[#333] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("ArrowRight")}
              onTouchEnd={() => keysRef.current.delete("ArrowRight")}
              aria-label="右移"
            >▶</button>
            <div />
            <button
              className="w-10 h-10 rounded-lg bg-[#222] border border-[#444] text-white text-lg active:bg-[#333] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("ArrowDown")}
              onTouchEnd={() => keysRef.current.delete("ArrowDown")}
              aria-label="下移"
            >▼</button>
            <div />
          </div>

          <div className="flex gap-2">
            <button
              className="w-12 h-12 rounded-full bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm active:bg-[#d4a30a] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("KeyZ")}
              onTouchEnd={() => keysRef.current.delete("KeyZ")}
              aria-label="确认"
            >A</button>
            <button
              className="w-12 h-12 rounded-full bg-[#333] text-white font-bold text-sm active:bg-[#444] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("Escape")}
              onTouchEnd={() => keysRef.current.delete("Escape")}
              aria-label="菜单"
            >B</button>
          </div>
        </div>

        <p className="text-center text-[10px] text-[#666] mt-3">
          方向键移动 · Z 确认/交互 · ESC 菜单
        </p>
      </main>
    </>
  );
}
