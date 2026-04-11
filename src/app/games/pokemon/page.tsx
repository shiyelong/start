"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";

import {
  type PetType,
  type Direction,
  type TileMap,
  type Portal,
  type PetEncounter,
  type Skill,
  type Pet,
  type BattleState,
  type Dialog,
  type NPC,
  type MapArea,
  type Quest,
  type ItemStack,
  type QuestProgress,
  type GameState,
  type PetTemplate,
  type EvolutionChain,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  MAP_COLS,
  MAP_ROWS,
  TILE_TYPES,
  COLLISION_TILES,
  ENCOUNTER_TILES,
  TYPE_EFFECTIVENESS,
  PLAYER_SPEED,
  ENCOUNTER_RATE,
  MAX_PARTY_SIZE,
  BASE_CATCH_RATE,
  INVINCIBLE_FRAMES,
  getTypeMultiplier,
  calculateDamage,
  calculateCatchRate,
  calculateExp,
  shouldLevelUp,
  calculateFleeRate,
  determineTurnOrder,
  advanceDialog,
  checkEncounter,
  selectWildPet,
  calculateStars,
  SKILLS,
  PET_TEMPLATES,
  EVOLUTION_CHAINS,
  getEvolutionChain,
  getNextEvolution,
  applyLevelUp,
  createPetFromTemplate,
  MAP_AREAS,
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

// ─── Canvas Rendering Functions ──────────────────────────

/** Draw a single 32×32 tile at grid position (col, row) */
function drawTile(ctx: CanvasRenderingContext2D, tileType: number, col: number, row: number) {
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;

  switch (tileType) {
    case TILE_TYPES.GRASS: {
      // Green base
      ctx.fillStyle = "#4a8c3f";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Small grass detail dots
      ctx.fillStyle = "#5ca04e";
      for (let i = 0; i < 3; i++) {
        const dx = 6 + i * 10;
        const dy = 8 + ((i * 7) % 16);
        ctx.fillRect(x + dx, y + dy, 2, 2);
      }
      break;
    }
    case TILE_TYPES.ROAD: {
      // Brown/tan path
      ctx.fillStyle = "#c4a46c";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Subtle texture
      ctx.fillStyle = "#b89860";
      ctx.fillRect(x + 4, y + 4, 3, 2);
      ctx.fillRect(x + 18, y + 14, 4, 2);
      ctx.fillRect(x + 10, y + 24, 3, 2);
      break;
    }
    case TILE_TYPES.WATER: {
      // Blue base
      ctx.fillStyle = "#3a7bd5";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Wave pattern
      ctx.strokeStyle = "#5a9be5";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 10);
      ctx.quadraticCurveTo(x + 8, y + 6, x + 16, y + 10);
      ctx.quadraticCurveTo(x + 24, y + 14, x + 30, y + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 22);
      ctx.quadraticCurveTo(x + 12, y + 18, x + 20, y + 22);
      ctx.quadraticCurveTo(x + 28, y + 26, x + 30, y + 22);
      ctx.stroke();
      break;
    }
    case TILE_TYPES.TREE: {
      // Grass base
      ctx.fillStyle = "#4a8c3f";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Tree trunk
      ctx.fillStyle = "#6b4226";
      ctx.fillRect(x + 13, y + 20, 6, 12);
      // Tree canopy (dark green triangle/circle)
      ctx.fillStyle = "#2d6b1e";
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 2);
      ctx.lineTo(x + 6, y + 22);
      ctx.lineTo(x + 26, y + 22);
      ctx.closePath();
      ctx.fill();
      // Lighter highlight
      ctx.fillStyle = "#3a8a28";
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 6);
      ctx.lineTo(x + 10, y + 18);
      ctx.lineTo(x + 22, y + 18);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case TILE_TYPES.ROCK: {
      // Dark ground base
      ctx.fillStyle = "#555555";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Rock body
      ctx.fillStyle = "#888888";
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 28);
      ctx.lineTo(x + 8, y + 10);
      ctx.lineTo(x + 16, y + 4);
      ctx.lineTo(x + 24, y + 8);
      ctx.lineTo(x + 28, y + 24);
      ctx.lineTo(x + 20, y + 30);
      ctx.closePath();
      ctx.fill();
      // Highlight
      ctx.fillStyle = "#aaaaaa";
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 12);
      ctx.lineTo(x + 16, y + 8);
      ctx.lineTo(x + 22, y + 12);
      ctx.lineTo(x + 16, y + 16);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case TILE_TYPES.TALL_GRASS: {
      // Green base
      ctx.fillStyle = "#4a8c3f";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Darker grass tufts
      ctx.strokeStyle = "#2d6b1e";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const bx = x + 3 + i * 6;
        const by = y + 28;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - 2, by - 12 - (i % 2) * 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + 2, by);
        ctx.lineTo(bx + 4, by - 10 - (i % 3) * 3);
        ctx.stroke();
      }
      break;
    }
    case TILE_TYPES.BUILDING: {
      // Brown/red building
      ctx.fillStyle = "#8b4513";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Roof
      ctx.fillStyle = "#a0522d";
      ctx.fillRect(x, y, TILE_SIZE, 10);
      // Door
      ctx.fillStyle = "#5a2d0c";
      ctx.fillRect(x + 12, y + 18, 8, 14);
      // Window
      ctx.fillStyle = "#87ceeb";
      ctx.fillRect(x + 4, y + 12, 6, 6);
      ctx.fillRect(x + 22, y + 12, 6, 6);
      // Window cross
      ctx.strokeStyle = "#5a2d0c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 12);
      ctx.lineTo(x + 7, y + 18);
      ctx.moveTo(x + 4, y + 15);
      ctx.lineTo(x + 10, y + 15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 25, y + 12);
      ctx.lineTo(x + 25, y + 18);
      ctx.moveTo(x + 22, y + 15);
      ctx.lineTo(x + 28, y + 15);
      ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = "#4a8c3f";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }
  }
}

/** Draw the player sprite at pixel position (px, py) with direction and animation frame */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  direction: Direction,
  animFrame: number,
) {
  const size = 24;
  // Center sprite in tile
  const ox = px + (TILE_SIZE - size) / 2;
  const oy = py + (TILE_SIZE - size) / 2;

  // Walking bob offset (simple 2-frame animation)
  const bob = animFrame % 2 === 0 ? 0 : -1;

  // Body
  ctx.fillStyle = "#e74c3c";
  ctx.fillRect(ox + 4, oy + 8 + bob, 16, 12);

  // Head
  ctx.fillStyle = "#fdd9b5";
  ctx.fillRect(ox + 6, oy + bob, 12, 10);

  // Hair
  ctx.fillStyle = "#333333";
  ctx.fillRect(ox + 6, oy + bob, 12, 4);

  // Eyes (based on direction)
  ctx.fillStyle = "#222222";
  switch (direction) {
    case "down":
      ctx.fillRect(ox + 8, oy + 5 + bob, 2, 2);
      ctx.fillRect(ox + 14, oy + 5 + bob, 2, 2);
      break;
    case "up":
      // Facing away — no eyes visible
      ctx.fillStyle = "#333333";
      ctx.fillRect(ox + 6, oy + bob, 12, 6);
      break;
    case "left":
      ctx.fillRect(ox + 7, oy + 5 + bob, 2, 2);
      break;
    case "right":
      ctx.fillRect(ox + 15, oy + 5 + bob, 2, 2);
      break;
  }

  // Legs (animate walking)
  ctx.fillStyle = "#2c3e50";
  if (animFrame % 4 < 2) {
    // Frame A: legs together
    ctx.fillRect(ox + 7, oy + 20 + bob, 4, 4);
    ctx.fillRect(ox + 13, oy + 20 + bob, 4, 4);
  } else {
    // Frame B: legs apart
    ctx.fillRect(ox + 5, oy + 20 + bob, 4, 4);
    ctx.fillRect(ox + 15, oy + 20 + bob, 4, 4);
  }

  // Direction indicator (small arrow)
  ctx.fillStyle = "#f0b90b";
  const arrowSize = 3;
  switch (direction) {
    case "down":
      ctx.beginPath();
      ctx.moveTo(ox + size / 2, oy + size + 2);
      ctx.lineTo(ox + size / 2 - arrowSize, oy + size - 1);
      ctx.lineTo(ox + size / 2 + arrowSize, oy + size - 1);
      ctx.closePath();
      ctx.fill();
      break;
    case "up":
      ctx.beginPath();
      ctx.moveTo(ox + size / 2, oy - 2 + bob);
      ctx.lineTo(ox + size / 2 - arrowSize, oy + 1 + bob);
      ctx.lineTo(ox + size / 2 + arrowSize, oy + 1 + bob);
      ctx.closePath();
      ctx.fill();
      break;
    case "left":
      ctx.beginPath();
      ctx.moveTo(ox - 2, oy + size / 2 + bob);
      ctx.lineTo(ox + 1, oy + size / 2 - arrowSize + bob);
      ctx.lineTo(ox + 1, oy + size / 2 + arrowSize + bob);
      ctx.closePath();
      ctx.fill();
      break;
    case "right":
      ctx.beginPath();
      ctx.moveTo(ox + size + 2, oy + size / 2 + bob);
      ctx.lineTo(ox + size - 1, oy + size / 2 - arrowSize + bob);
      ctx.lineTo(ox + size - 1, oy + size / 2 + arrowSize + bob);
      ctx.closePath();
      ctx.fill();
      break;
  }
}

/** Draw an NPC sprite at tile position (tileX, tileY) */
function drawNPC(ctx: CanvasRenderingContext2D, npc: NPC) {
  const px = npc.x * TILE_SIZE;
  const py = npc.y * TILE_SIZE;
  const size = 24;
  const ox = px + (TILE_SIZE - size) / 2;
  const oy = py + (TILE_SIZE - size) / 2;

  // Body (blue to distinguish from player)
  ctx.fillStyle = "#3498db";
  ctx.fillRect(ox + 4, oy + 8, 16, 12);

  // Head
  ctx.fillStyle = "#fdd9b5";
  ctx.fillRect(ox + 6, oy, 12, 10);

  // Hair (varies by NPC — use a hash of the id for color)
  const hairColors = ["#8b4513", "#ffd700", "#c0c0c0", "#ff6347", "#9370db"];
  const hashIdx = npc.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % hairColors.length;
  ctx.fillStyle = hairColors[hashIdx];
  ctx.fillRect(ox + 6, oy, 12, 4);

  // Eyes (always facing down / toward player)
  ctx.fillStyle = "#222222";
  ctx.fillRect(ox + 8, oy + 5, 2, 2);
  ctx.fillRect(ox + 14, oy + 5, 2, 2);

  // Legs
  ctx.fillStyle = "#2c3e50";
  ctx.fillRect(ox + 7, oy + 20, 4, 4);
  ctx.fillRect(ox + 13, oy + 20, 4, 4);

  // Name tag above NPC
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(npc.name, px + TILE_SIZE / 2, py - 2);
  ctx.textAlign = "start";
}

/** Render the full map: clear canvas, draw tiles, NPCs, and player */
function renderMap(
  ctx: CanvasRenderingContext2D,
  area: MapArea,
  playerX: number,
  playerY: number,
  playerDirection: Direction,
  animFrame: number,
) {
  // 1. Clear canvas
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 2. Draw all tiles
  const { tiles } = area.tileMap;
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      drawTile(ctx, tiles[row][col], col, row);
    }
  }

  // 3. Draw portals (subtle shimmer markers)
  ctx.fillStyle = "rgba(240, 185, 11, 0.35)";
  for (const portal of area.portals) {
    ctx.fillRect(portal.x * TILE_SIZE + 4, portal.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
  }

  // 4. Draw NPCs
  for (const npc of area.npcs) {
    drawNPC(ctx, npc);
  }

  // 5. Draw player
  drawPlayer(ctx, playerX * TILE_SIZE, playerY * TILE_SIZE, playerDirection, animFrame);
}

// ─── Battle Rendering ────────────────────────────────────

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

/** Draw a pet sprite at (x, y) with given size, using type-based pixel art */
function drawPetSprite(
  ctx: CanvasRenderingContext2D,
  pet: Pet,
  x: number,
  y: number,
  size: number,
) {
  const color = PET_TYPE_COLORS[pet.type];
  const dark = PET_TYPE_COLORS_DARK[pet.type];
  const s = size; // alias for brevity
  const u = Math.floor(s / 8); // unit size for pixel art

  // Body (main oval shape)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x + s / 2, y + s * 0.55, s * 0.38, s * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head (circle on top)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s * 0.28, s * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (white + black pupils)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x + s * 0.38, y + s * 0.24, u * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + s * 0.62, y + s * 0.24, u * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(x + s * 0.40, y + s * 0.25, u * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + s * 0.64, y + s * 0.25, u * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Type-specific features
  switch (pet.type) {
    case "fire": {
      // Flame tail
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.moveTo(x + s * 0.8, y + s * 0.5);
      ctx.lineTo(x + s * 0.95, y + s * 0.3);
      ctx.lineTo(x + s * 0.85, y + s * 0.45);
      ctx.lineTo(x + s, y + s * 0.2);
      ctx.lineTo(x + s * 0.88, y + s * 0.42);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "water": {
      // Water droplet on head
      ctx.fillStyle = "#85c1e9";
      ctx.beginPath();
      ctx.moveTo(x + s * 0.5, y + s * 0.02);
      ctx.quadraticCurveTo(x + s * 0.58, y + s * 0.1, x + s * 0.5, y + s * 0.15);
      ctx.quadraticCurveTo(x + s * 0.42, y + s * 0.1, x + s * 0.5, y + s * 0.02);
      ctx.fill();
      break;
    }
    case "grass": {
      // Leaf on head
      ctx.fillStyle = "#1abc9c";
      ctx.beginPath();
      ctx.moveTo(x + s * 0.5, y);
      ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.05, x + s * 0.65, y + s * 0.12);
      ctx.quadraticCurveTo(x + s * 0.55, y + s * 0.08, x + s * 0.5, y);
      ctx.fill();
      break;
    }
    case "electric": {
      // Lightning bolt ears
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath();
      ctx.moveTo(x + s * 0.3, y + s * 0.12);
      ctx.lineTo(x + s * 0.22, y - s * 0.05);
      ctx.lineTo(x + s * 0.35, y + s * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.7, y + s * 0.12);
      ctx.lineTo(x + s * 0.78, y - s * 0.05);
      ctx.lineTo(x + s * 0.65, y + s * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "dark": {
      // Shadow wisps
      ctx.fillStyle = "rgba(100, 50, 150, 0.5)";
      ctx.beginPath();
      ctx.arc(x + s * 0.2, y + s * 0.6, u * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + s * 0.85, y + s * 0.55, u * 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  // Feet / legs
  ctx.fillStyle = dark;
  ctx.fillRect(x + s * 0.28, y + s * 0.78, u * 2, u * 1.5);
  ctx.fillRect(x + s * 0.58, y + s * 0.78, u * 2, u * 1.5);

  // Rarity indicator (small star for rare/epic)
  if (pet.rarity === "rare" || pet.rarity === "epic") {
    ctx.fillStyle = pet.rarity === "epic" ? "#f0b90b" : "#bdc3c7";
    ctx.font = `${u * 2}px sans-serif`;
    ctx.fillText("★", x + s * 0.02, y + s * 0.15);
  }
}

/** Draw an HP or MP bar */
function drawStatBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  current: number,
  max: number,
  fillColor: string,
  bgColor: string = "#333333",
) {
  const ratio = Math.max(0, Math.min(1, current / max));
  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, width, height);
  // Fill
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, width * ratio, height);
  // Border
  ctx.strokeStyle = "#555555";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}

/** Battle menu button layout — used for both rendering and hit detection */
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

/** Build the battle menu button layout for the current battle state */
function buildBattleButtons(battle: BattleState): BattleButton[] {
  const buttons: BattleButton[] = [];
  const pet = battle.playerPet;

  // Skill buttons: 2×2 grid in the left portion of the menu area
  // Menu area: y starts at 350, full width 640
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
        label: `${skill.name} (${skill.mpCost}MP)`,
        type: "skill",
        skillIndex: i,
        disabled,
        color: PET_TYPE_COLORS[skill.type],
      });
    }
  }

  // Action buttons: right side column
  const actionX = 348;
  const actionW = 130;
  const actionH = 34;
  const actionGap = 6;

  buttons.push({
    x: actionX,
    y: skillStartY,
    w: actionW,
    h: actionH,
    label: "道具",
    type: "item",
    color: "#f39c12",
  });
  buttons.push({
    x: actionX,
    y: skillStartY + actionH + actionGap,
    w: actionW,
    h: actionH,
    label: "捕捉",
    type: "capture",
    color: "#e74c3c",
  });
  buttons.push({
    x: actionX + actionW + 8,
    y: skillStartY,
    w: actionW,
    h: actionH,
    label: "逃跑",
    type: "flee",
    color: "#95a5a6",
  });

  return buttons;
}

/** Render the full battle scene on the canvas */
function renderBattle(
  ctx: CanvasRenderingContext2D,
  battle: BattleState,
) {
  // 1. Background gradient (arena)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  bgGrad.addColorStop(0, "#1a1a2e");
  bgGrad.addColorStop(0.5, "#16213e");
  bgGrad.addColorStop(1, "#0f3460");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Arena floor ellipse
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.ellipse(CANVAS_WIDTH / 2, 260, 280, 60, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Enemy pet (top-right area)
  const enemy = battle.enemyPet;
  const enemySpriteX = 420;
  const enemySpriteY = 50;
  const spriteSize = 64;

  drawPetSprite(ctx, enemy, enemySpriteX, enemySpriteY, spriteSize);

  // Enemy info panel (above/beside sprite)
  const enemyInfoX = 380;
  const enemyInfoY = 20;
  // Name + Level
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`${enemy.name}`, enemyInfoX, enemyInfoY);
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "12px monospace";
  ctx.fillText(`Lv.${enemy.level}`, enemyInfoX + ctx.measureText(enemy.name).width + 8, enemyInfoY);
  // HP bar
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "10px monospace";
  ctx.fillText("HP", enemyInfoX, enemyInfoY + 16);
  drawStatBar(ctx, enemyInfoX + 22, enemyInfoY + 8, 140, 10, enemy.hp, enemy.maxHp, "#2ecc71");
  ctx.fillStyle = "#cccccc";
  ctx.font = "9px monospace";
  ctx.fillText(`${enemy.hp}/${enemy.maxHp}`, enemyInfoX + 166, enemyInfoY + 16);
  // MP bar
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "10px monospace";
  ctx.fillText("MP", enemyInfoX, enemyInfoY + 30);
  drawStatBar(ctx, enemyInfoX + 22, enemyInfoY + 22, 140, 10, enemy.mp, enemy.maxMp, "#3498db");
  ctx.fillStyle = "#cccccc";
  ctx.font = "9px monospace";
  ctx.fillText(`${enemy.mp}/${enemy.maxMp}`, enemyInfoX + 166, enemyInfoY + 30);

  // 3. Player pet (bottom-left area)
  const player = battle.playerPet;
  const playerSpriteX = 100;
  const playerSpriteY = 170;

  drawPetSprite(ctx, player, playerSpriteX, playerSpriteY, spriteSize);

  // Player info panel
  const playerInfoX = 30;
  const playerInfoY = 160;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`${player.name}`, playerInfoX, playerInfoY);
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "12px monospace";
  ctx.fillText(`Lv.${player.level}`, playerInfoX + ctx.measureText(player.name).width + 8, playerInfoY);
  // HP bar
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "10px monospace";
  ctx.fillText("HP", playerInfoX, playerInfoY + 16);
  drawStatBar(ctx, playerInfoX + 22, playerInfoY + 8, 140, 10, player.hp, player.maxHp, "#2ecc71");
  ctx.fillStyle = "#cccccc";
  ctx.font = "9px monospace";
  ctx.fillText(`${player.hp}/${player.maxHp}`, playerInfoX + 166, playerInfoY + 16);
  // MP bar
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "10px monospace";
  ctx.fillText("MP", playerInfoX, playerInfoY + 30);
  drawStatBar(ctx, playerInfoX + 22, playerInfoY + 22, 140, 10, player.mp, player.maxMp, "#3498db");
  ctx.fillStyle = "#cccccc";
  ctx.font = "9px monospace";
  ctx.fillText(`${player.mp}/${player.maxMp}`, playerInfoX + 166, playerInfoY + 30);

  // 4. Battle log (middle-bottom area, above menu)
  const logY = 270;
  const logH = 78;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(10, logY, CANVAS_WIDTH - 20, logH);
  ctx.strokeStyle = "#444444";
  ctx.lineWidth = 1;
  ctx.strokeRect(10, logY, CANVAS_WIDTH - 20, logH);

  ctx.fillStyle = "#dddddd";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  const visibleLogs = battle.log.slice(-4); // show last 4 messages
  visibleLogs.forEach((msg, i) => {
    ctx.fillText(msg, 20, logY + 18 + i * 18, CANVAS_WIDTH - 40);
  });

  // 5. Battle menu (when phase is "select")
  if (battle.phase === "select") {
    // Menu background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(8, 350, CANVAS_WIDTH - 16, CANVAS_HEIGHT - 354);
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 350, CANVAS_WIDTH - 16, CANVAS_HEIGHT - 354);

    const buttons = buildBattleButtons(battle);
    for (const btn of buttons) {
      // Button background
      if (btn.disabled) {
        ctx.fillStyle = "#444444";
      } else {
        ctx.fillStyle = btn.color ? btn.color + "33" : "rgba(255,255,255,0.1)";
      }
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

      // Button border
      ctx.strokeStyle = btn.disabled ? "#555555" : (btn.color ?? "#888888");
      ctx.lineWidth = btn.disabled ? 1 : 2;
      ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

      // Button text
      ctx.fillStyle = btn.disabled ? "#666666" : "#ffffff";
      ctx.font = btn.type === "skill" ? "bold 11px monospace" : "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    }

    // Reset text alignment
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

// ─── Battle Animation System ─────────────────────────────

/** A single particle in a battle animation */
interface BattleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

/** State for the battle animation system */
interface BattleAnimState {
  type: PetType;
  particles: BattleParticle[];
  startTime: number;
  duration: number; // ms
  targetX: number;
  targetY: number;
  /** Phase to transition to after animation completes */
  nextPhase: "select" | "result";
}

/** Create particles for a type-based attack animation */
function createBattleParticles(type: PetType, targetX: number, targetY: number): BattleParticle[] {
  const particles: BattleParticle[] = [];
  const count = 12;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 1 + Math.random() * 2;
    const base: Omit<BattleParticle, "color" | "vx" | "vy" | "size"> = {
      x: targetX + (Math.random() - 0.5) * 20,
      y: targetY + (Math.random() - 0.5) * 20,
      life: 1,
      maxLife: 1,
    };

    switch (type) {
      case "fire":
        particles.push({
          ...base,
          vx: (Math.random() - 0.5) * 2,
          vy: -(1.5 + Math.random() * 2),
          size: 4 + Math.random() * 4,
          color: Math.random() > 0.5 ? "#e74c3c" : "#f39c12",
        });
        break;
      case "water":
        particles.push({
          ...base,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 5 + Math.random() * 5,
          color: Math.random() > 0.5 ? "#3498db" : "#85c1e9",
        });
        break;
      case "grass":
        particles.push({
          ...base,
          vx: (Math.random() - 0.5) * 3,
          vy: -(0.5 + Math.random() * 1.5),
          size: 4 + Math.random() * 3,
          color: Math.random() > 0.5 ? "#2ecc71" : "#1abc9c",
        });
        break;
      case "electric":
        particles.push({
          ...base,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          size: 2 + Math.random() * 3,
          color: Math.random() > 0.5 ? "#f1c40f" : "#f9e547",
        });
        break;
      case "dark":
        particles.push({
          ...base,
          vx: Math.cos(angle) * speed * 0.7,
          vy: Math.sin(angle) * speed * 0.7,
          size: 6 + Math.random() * 4,
          color: Math.random() > 0.5 ? "#9b59b6" : "#6c3483",
        });
        break;
    }
  }
  return particles;
}

/** Render battle animation particles on top of the battle scene */
function renderBattleAnimation(
  ctx: CanvasRenderingContext2D,
  anim: BattleAnimState,
  elapsed: number,
): boolean {
  const progress = Math.min(1, elapsed / anim.duration);
  const alive = progress < 1;

  for (const p of anim.particles) {
    // Update particle
    p.x += p.vx;
    p.y += p.vy;
    p.life = Math.max(0, 1 - progress);

    const alpha = p.life;
    if (alpha <= 0) continue;

    ctx.globalAlpha = alpha;

    switch (anim.type) {
      case "fire": {
        // Orange/red circles moving upward
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "water": {
        // Blue expanding circles (ripples)
        const radius = p.size * (1 + progress * 1.5);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "grass": {
        // Green leaf shapes floating
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(progress * Math.PI * 2 + p.vx);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case "electric": {
        // Yellow zigzag lines
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.size, p.y - p.size);
        ctx.lineTo(p.x - p.size * 0.5, p.y - p.size * 2);
        ctx.lineTo(p.x + p.size * 1.5, p.y - p.size * 3);
        ctx.stroke();
        break;
      }
      case "dark": {
        // Purple shadow circles
        const r = p.size * (0.5 + progress * 0.8);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  ctx.globalAlpha = 1;
  return alive;
}

/** Detect which battle button was clicked given canvas-relative coordinates */
function detectBattleButtonClick(
  battle: BattleState,
  canvasX: number,
  canvasY: number,
): BattleButton | null {
  if (battle.phase !== "select") return null;
  const buttons = buildBattleButtons(battle);
  for (const btn of buttons) {
    if (
      canvasX >= btn.x &&
      canvasX <= btn.x + btn.w &&
      canvasY >= btn.y &&
      canvasY <= btn.y + btn.h
    ) {
      return btn;
    }
  }
  return null;
}

// ─── Battle Action Processing ────────────────────────────

/** Result of processing a battle action */
interface BattleActionResult {
  /** Whether the battle has ended */
  battleEnded: boolean;
  /** Outcome if battle ended */
  outcome?: "win" | "lose" | "flee";
  /** Exp gained (only on win) */
  expGained?: number;
}

/**
 * Select a random usable skill for the enemy AI.
 * If no skills are usable (not enough MP), returns a basic attack with power 30 and the pet's type.
 */
function selectEnemySkill(enemy: Pet): Skill {
  const usable = enemy.skills.filter((s) => s.mpCost <= enemy.mp);
  if (usable.length > 0) {
    return usable[Math.floor(Math.random() * usable.length)];
  }
  // Fallback: basic attack (power 30, same type as pet, 0 MP cost)
  return { name: "普通攻击", type: enemy.type, power: 30, mpCost: 0, learnLevel: 1 };
}

/**
 * Execute one combatant's attack on the other.
 * Deducts MP, calculates damage, applies to defender HP, adds log messages.
 * Returns the damage dealt.
 */
function executeAttack(
  attacker: Pet,
  defender: Pet,
  skill: Skill,
  log: string[],
  attackerLabel: string,
): number {
  // Deduct MP
  attacker.mp = Math.max(0, attacker.mp - skill.mpCost);

  // Calculate damage
  const damage = calculateDamage(attacker.atk, defender.def, skill.power, skill.type, defender.type);

  // Apply damage
  defender.hp = Math.max(0, defender.hp - damage);

  // Type effectiveness message
  const multiplier = getTypeMultiplier(skill.type, defender.type);
  let effectMsg = "";
  if (multiplier > 1) effectMsg = " 效果拔群！";
  else if (multiplier < 1) effectMsg = " 效果不佳...";

  log.push(`${attackerLabel}的${attacker.name}使用了${skill.name}，造成${damage}点伤害！${effectMsg}`);

  return damage;
}

/**
 * Process a battle action from the player.
 * Handles skill usage, flee attempts, enemy turns, defeat checking, and battle end.
 *
 * @param battle - Current battle state (mutated in place)
 * @param action - The action type: "skill" or "flee"
 * @param skillIndex - Index of the skill to use (only for "skill" action)
 * @param party - Player's full party (for switching on defeat)
 * @returns BattleActionResult indicating if battle ended and outcome
 */
function processBattleAction(
  battle: BattleState,
  action: "skill" | "flee",
  party: Pet[],
  skillIndex?: number,
): BattleActionResult {
  const { playerPet, enemyPet } = battle;

  // ── Flee action ──
  if (action === "flee") {
    const fleeRate = calculateFleeRate(playerPet.spd, enemyPet.spd);
    const roll = Math.random() * 100;
    if (roll < fleeRate) {
      battle.log.push("逃跑成功！");
      battle.phase = "result";
      return { battleEnded: true, outcome: "flee" };
    } else {
      battle.log.push("逃跑失败！");
      // Enemy gets a free turn
      const enemySkill = selectEnemySkill(enemyPet);
      executeAttack(enemyPet, playerPet, enemySkill, battle.log, "野生");

      // Check if player pet fainted from enemy's free turn
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
  }

  // ── Skill action ──
  if (skillIndex === undefined || skillIndex < 0 || skillIndex >= playerPet.skills.length) {
    return { battleEnded: false };
  }

  const playerSkill = playerPet.skills[skillIndex];

  // Verify MP is sufficient (should already be checked by UI, but double-check)
  if (playerSkill.mpCost > playerPet.mp) {
    battle.log.push(`MP不足，无法使用${playerSkill.name}！`);
    return { battleEnded: false };
  }

  // Determine turn order
  const firstMover = determineTurnOrder(playerPet.spd, enemyPet.spd);

  if (firstMover === "player") {
    // ── Player attacks first ──
    executeAttack(playerPet, enemyPet, playerSkill, battle.log, "我方");

    // Check if enemy is defeated
    if (enemyPet.hp <= 0) {
      battle.log.push(`野生的${enemyPet.name}倒下了！`);
      const expGained = calculateExp(enemyPet.level);
      battle.log.push(`获得了${expGained}点经验值！`);
      battle.phase = "result";
      return { battleEnded: true, outcome: "win", expGained };
    }

    // ── Enemy turn ──
    const enemySkill = selectEnemySkill(enemyPet);
    executeAttack(enemyPet, playerPet, enemySkill, battle.log, "野生");

    // Check if player pet fainted
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
    // ── Enemy attacks first ──
    const enemySkill = selectEnemySkill(enemyPet);
    executeAttack(enemyPet, playerPet, enemySkill, battle.log, "野生");

    // Check if player pet fainted before player can act
    if (playerPet.hp <= 0) {
      battle.log.push(`${playerPet.name}倒下了！`);
      const nextPet = party.find((p) => p.hp > 0 && p !== playerPet);
      if (nextPet) {
        battle.playerPet = nextPet;
        battle.log.push(`${nextPet.name}，上场！`);
        // Player still gets their turn with the new pet
        // But the selected skill might not be available on the new pet, so skip
        return { battleEnded: false };
      } else {
        battle.log.push("所有宠物都倒下了...战斗失败！");
        battle.phase = "result";
        return { battleEnded: true, outcome: "lose" };
      }
    }

    // ── Player attacks second ──
    executeAttack(playerPet, enemyPet, playerSkill, battle.log, "我方");

    // Check if enemy is defeated
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

// ─── Dialog Rendering (Task 7.2) ─────────────────────────

/** Render dialog box at canvas bottom with NPC name, portrait, and typewriter text */
function renderDialog(
  ctx: CanvasRenderingContext2D,
  npc: NPC,
  dialogIndex: number,
  charIndex: number,
) {
  const boxH = 100;
  const boxY = CANVAS_HEIGHT - boxH - 8;
  const boxX = 8;
  const boxW = CANVAS_WIDTH - 16;

  // Semi-transparent background
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = "#f0b90b";
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // NPC portrait (small colored circle)
  const portraitX = boxX + 16;
  const portraitY = boxY + 20;
  const hairColors = ["#8b4513", "#ffd700", "#c0c0c0", "#ff6347", "#9370db"];
  const hashIdx = npc.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % hairColors.length;
  ctx.fillStyle = "#3498db";
  ctx.beginPath();
  ctx.arc(portraitX, portraitY + 12, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fdd9b5";
  ctx.beginPath();
  ctx.arc(portraitX, portraitY + 6, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hairColors[hashIdx];
  ctx.fillRect(portraitX - 8, portraitY - 2, 16, 4);

  // NPC name
  ctx.fillStyle = "#f0b90b";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "left";
  ctx.fillText(npc.name, boxX + 40, boxY + 18);

  // Dialog text with typewriter effect
  const dialog = npc.dialogs[dialogIndex];
  if (dialog) {
    const visibleText = dialog.text.substring(0, charIndex);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px monospace";
    // Word wrap
    const maxLineW = boxW - 56;
    const lines: string[] = [];
    let line = "";
    for (const ch of visibleText) {
      line += ch;
      if (ctx.measureText(line).width > maxLineW) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((l, i) => {
      ctx.fillText(l, boxX + 40, boxY + 38 + i * 18);
    });
  }

  // Advance hint
  ctx.fillStyle = "#888888";
  ctx.font = "10px monospace";
  ctx.textAlign = "right";
  ctx.fillText("按 Z 继续", boxX + boxW - 8, boxY + boxH - 8);
  ctx.textAlign = "left";
}

// ─── HUD Rendering (Task 7.3) ────────────────────────────

/** Render HUD bar at top of canvas during explore phase */
function renderHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  areaName: string,
  fps: number,
) {
  const hudH = 28;
  // Background bar
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, hudH);

  ctx.font = "bold 11px monospace";
  ctx.textAlign = "left";

  // Player name
  ctx.fillStyle = "#f0b90b";
  ctx.fillText("训练师", 8, 18);

  // Gold
  ctx.fillStyle = "#ffd700";
  ctx.fillText(`💰${state.gold}`, 70, 18);

  // Area name
  ctx.fillStyle = "#aaaaaa";
  ctx.fillText(`📍${areaName}`, 140, 18);

  // Quest hint (if any active quest)
  const activeQuest = state.quests.find((q) => !q.completed);
  if (activeQuest) {
    const questDef = QUESTS.find((q) => q.id === activeQuest.questId);
    if (questDef) {
      ctx.fillStyle = "#88ccff";
      ctx.font = "9px monospace";
      ctx.fillText(`📋${questDef.name}`, 240, 18);
    }
  }

  // Party pet thumbnails (right side)
  const thumbSize = 16;
  const thumbY = 6;
  for (let i = 0; i < state.party.length; i++) {
    const pet = state.party[i];
    const tx = CANVAS_WIDTH - 8 - (state.party.length - i) * (thumbSize + 4);
    ctx.fillStyle = PET_TYPE_COLORS[pet.type];
    ctx.beginPath();
    ctx.arc(tx + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2, 0, Math.PI * 2);
    ctx.fill();
    // HP indicator: green if healthy, red if low
    const hpRatio = pet.hp / pet.maxHp;
    ctx.fillStyle = hpRatio > 0.5 ? "#2ecc71" : hpRatio > 0.2 ? "#f39c12" : "#e74c3c";
    ctx.fillRect(tx + 2, thumbY + thumbSize + 1, (thumbSize - 4) * hpRatio, 2);
  }

  // FPS counter (small, top-right corner)
  ctx.fillStyle = "#555555";
  ctx.font = "8px monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${fps}fps`, CANVAS_WIDTH - 4, hudH + 10);
  ctx.textAlign = "left";
}

// ─── Menu Rendering (Task 7.3) ───────────────────────────

/** Render pause menu overlay */
function renderMenu(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  selectedIndex: number,
) {
  // Full-screen overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Title
  ctx.fillStyle = "#f0b90b";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.fillText("暂停菜单", CANVAS_WIDTH / 2, 36);

  const menuItems = ["宠物队伍", "背包道具", "任务列表", "返回游戏"];
  const menuY = 60;
  const itemH = 32;

  for (let i = 0; i < menuItems.length; i++) {
    const y = menuY + i * (itemH + 8);
    const isSelected = i === selectedIndex;
    // Background
    ctx.fillStyle = isSelected ? "rgba(240, 185, 11, 0.2)" : "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(CANVAS_WIDTH / 2 - 120, y, 240, itemH);
    ctx.strokeStyle = isSelected ? "#f0b90b" : "#444444";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(CANVAS_WIDTH / 2 - 120, y, 240, itemH);
    // Text
    ctx.fillStyle = isSelected ? "#f0b90b" : "#cccccc";
    ctx.font = "bold 14px monospace";
    ctx.fillText(menuItems[i], CANVAS_WIDTH / 2, y + 21);
  }

  // Content panel below menu items
  const panelY = menuY + menuItems.length * (itemH + 8) + 10;
  ctx.textAlign = "left";

  if (selectedIndex === 0) {
    // Pet party list
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px monospace";
    ctx.fillText("宠物队伍:", 30, panelY + 16);
    state.party.forEach((pet, i) => {
      const py = panelY + 34 + i * 36;
      // Type color dot
      ctx.fillStyle = PET_TYPE_COLORS[pet.type];
      ctx.beginPath();
      ctx.arc(42, py + 6, 6, 0, Math.PI * 2);
      ctx.fill();
      // Name, level, type
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px monospace";
      ctx.fillText(`${pet.name}  Lv.${pet.level}  [${pet.type}]`, 54, py + 10);
      // HP bar
      drawStatBar(ctx, 54, py + 16, 120, 6, pet.hp, pet.maxHp, "#2ecc71");
      ctx.fillStyle = "#aaaaaa";
      ctx.font = "9px monospace";
      ctx.fillText(`HP ${pet.hp}/${pet.maxHp}`, 180, py + 22);
    });
  } else if (selectedIndex === 1) {
    // Items
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px monospace";
    ctx.fillText("背包道具:", 30, panelY + 16);
    state.items.forEach((item, i) => {
      ctx.fillStyle = "#cccccc";
      ctx.font = "11px monospace";
      ctx.fillText(`${item.name} × ${item.count}`, 42, panelY + 36 + i * 20);
    });
  } else if (selectedIndex === 2) {
    // Quests
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px monospace";
    ctx.fillText("任务列表:", 30, panelY + 16);
    QUESTS.forEach((quest, i) => {
      const progress = state.quests.find((q) => q.questId === quest.id);
      const completed = progress?.completed ?? false;
      ctx.fillStyle = completed ? "#2ecc71" : "#f39c12";
      ctx.font = "11px monospace";
      ctx.fillText(
        `${completed ? "✅" : "⬜"} ${quest.name}`,
        42,
        panelY + 36 + i * 22,
      );
      ctx.fillStyle = "#888888";
      ctx.font = "9px monospace";
      ctx.fillText(quest.description, 62, panelY + 48 + i * 22);
    });
  }

  // Controls hint
  ctx.fillStyle = "#666666";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("↑↓ 选择 · Z 确认 · ESC 返回游戏", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 12);
  ctx.textAlign = "left";
}

// ─── Component ───────────────────────────────────────────

export default function PokemonPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());

  const [, setGamePhase] = useState<GameState["phase"]>("explore");
  const animFrameRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const battleRef = useRef<BattleState | null>(null);
  const battleAnimRef = useRef<BattleAnimState | null>(null);

  // ── Dialog state refs (Task 7.2) ──
  const dialogNpcRef = useRef<NPC | null>(null);
  const dialogIndexRef = useRef(0);
  const dialogCharIndexRef = useRef(0);
  const dialogLastCharTimeRef = useRef(0);

  // ── Menu state ref (Task 7.3) ──
  const menuSelectedRef = useRef(0); // 0=pets, 1=items, 2=quests, 3=return

  // ── FPS monitoring refs (Task 7.4) ──
  const fpsFrameTimesRef = useRef<number[]>([]);
  const lowFpsCountRef = useRef(0);
  const reduceParticlesRef = useRef(false);
  const lastFrameTimeRef = useRef(0);

  /** Movement cooldown in ms — controls tile-based movement speed */
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

    // Convert to canvas coordinates (account for CSS scaling)
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    const btn = detectBattleButtonClick(battleRef.current, canvasX, canvasY);
    if (!btn) return;

    // Don't act on disabled buttons
    if (btn.disabled) return;

    const state = gameRef.current;
    if (!state) return;
    const battle = battleRef.current;

    if (btn.type === "skill" && btn.skillIndex !== undefined) {
      // Start animation phase before processing the action
      const skill = battle.playerPet.skills[btn.skillIndex];
      if (!skill || skill.mpCost > battle.playerPet.mp) return;

      // Set battle to animate phase (disables input via detectBattleButtonClick)
      battle.phase = "animate";

      // Create animation targeting the enemy pet position
      const enemyTargetX = 452; // center of enemy sprite area
      const enemyTargetY = 82;
      battleAnimRef.current = {
        type: skill.type,
        particles: createBattleParticles(skill.type, enemyTargetX, enemyTargetY),
        startTime: performance.now(),
        duration: 600,
        targetX: enemyTargetX,
        targetY: enemyTargetY,
        nextPhase: "select", // will be overridden if battle ends
      };

      // Process the actual battle action after animation completes
      setTimeout(() => {
        if (!battleRef.current || !gameRef.current) return;
        const result = processBattleAction(battleRef.current, "skill", gameRef.current.party, btn.skillIndex);
        if (result.battleEnded) {
          battleRef.current.phase = "result";
          battleAnimRef.current = null;
          // Delay returning to explore to let player read the log
          setTimeout(() => {
            if (!battleRef.current || !gameRef.current) return;
            const bState = gameRef.current;
            if (result.outcome === "win" && result.expGained) {
              // Award exp to the active player pet and apply level-up/evolution
              const activePet = battleRef.current.playerPet;
              activePet.exp += result.expGained;
              const levelUpLogs = applyLevelUp(activePet);
              // Append level-up messages to battle log for display
              if (battleRef.current) {
                battleRef.current.log.push(...levelUpLogs);
              }
            } else if (result.outcome === "lose") {
              // Teleport to village (recovery point) and restore party HP
              bState.currentArea = "village";
              bState.player.x = 9;
              bState.player.y = 9;
              for (const pet of bState.party) {
                pet.hp = pet.maxHp;
                pet.mp = pet.maxMp;
              }
            }
            // Return to explore mode
            bState.phase = "explore";
            battleRef.current = null;
            battleAnimRef.current = null;
            setGamePhase("explore");
          }, 1500);
        } else {
          // Battle continues — return to select phase
          if (battleRef.current) {
            battleRef.current.phase = "select";
          }
          battleAnimRef.current = null;
        }
      }, 650); // slightly after animation duration (600ms)
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
      // ── Item usage: use first available potion ──
      const potionStack = state.items.find((i) => i.id === "potion" && i.count > 0);
      if (!potionStack) {
        battle.log.push("没有可用的道具！");
        return;
      }
      // Deduct one potion
      potionStack.count--;
      // Restore 25% maxHp to active pet
      const healAmount = Math.floor(battle.playerPet.maxHp * 0.25);
      const oldHp = battle.playerPet.hp;
      battle.playerPet.hp = Math.min(battle.playerPet.maxHp, battle.playerPet.hp + healAmount);
      const actualHeal = battle.playerPet.hp - oldHp;
      battle.log.push(`使用了回复药水，${battle.playerPet.name}恢复了${actualHeal}点HP！`);

      // Enemy gets a free turn after item use
      const enemySkill = selectEnemySkill(battle.enemyPet);
      executeAttack(battle.enemyPet, battle.playerPet, enemySkill, battle.log, "野生");

      // Check if player pet fainted from enemy's turn
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
            // Teleport to village and restore party
            gameRef.current.currentArea = "village";
            gameRef.current.player.x = 9;
            gameRef.current.player.y = 9;
            for (const pet of gameRef.current.party) {
              pet.hp = pet.maxHp;
              pet.mp = pet.maxMp;
            }
            gameRef.current.phase = "explore";
            battleRef.current = null;
            battleAnimRef.current = null;
            setGamePhase("explore");
          }, 1500);
        }
      }
    } else if (btn.type === "capture") {
      // ── Capture: use a capture ball ──
      const ballStack = state.items.find((i) => i.id === "pokeball" && i.count > 0);
      if (!ballStack) {
        battle.log.push("没有捕捉球了！");
        return;
      }
      // Deduct one ball
      ballStack.count--;
      // Calculate catch rate
      const catchRate = calculateCatchRate(BASE_CATCH_RATE, battle.enemyPet.hp, battle.enemyPet.maxHp, 1.0);
      const roll = Math.random();
      battle.log.push(`投出了捕捉球...（成功率${Math.floor(catchRate * 100)}%）`);

      if (roll < catchRate) {
        // ── Capture success ──
        const capturedPet: Pet = { ...battle.enemyPet, exp: 0 };
        if (state.party.length < MAX_PARTY_SIZE) {
          state.party.push(capturedPet);
          state.allPets.push(capturedPet);
          battle.log.push(`捕捉成功！${capturedPet.name}加入了队伍！`);
        } else {
          // Party full — add to allPets storage only
          state.allPets.push(capturedPet);
          battle.log.push(`捕捉成功！但队伍已满，${capturedPet.name}已存入仓库。`);
        }
        // End battle
        battle.phase = "result";
        setTimeout(() => {
          if (!gameRef.current) return;
          gameRef.current.phase = "explore";
          battleRef.current = null;
          battleAnimRef.current = null;
          setGamePhase("explore");
        }, 1500);
      } else {
        // ── Capture failed — enemy gets a free turn ──
        battle.log.push("捕捉失败！球被弹开了...");
        const enemySkill = selectEnemySkill(battle.enemyPet);
        executeAttack(battle.enemyPet, battle.playerPet, enemySkill, battle.log, "野生");

        // Check if player pet fainted
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
              for (const pet of gameRef.current.party) {
                pet.hp = pet.maxHp;
                pet.mp = pet.maxMp;
              }
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

      // ── Dialog phase: Z advances dialog ──
      if (state.phase === "dialog" && e.code === "KeyZ") {
        const npc = dialogNpcRef.current;
        if (!npc) return;
        const dialog = npc.dialogs[dialogIndexRef.current];
        // If typewriter hasn't finished, complete it instantly
        if (dialog && dialogCharIndexRef.current < dialog.text.length) {
          dialogCharIndexRef.current = dialog.text.length;
          return;
        }
        // Advance to next dialog
        const next = advanceDialog(npc.dialogs.length, dialogIndexRef.current);
        if (next === -1) {
          // Dialog ended — check quest completion
          if (npc.questId && state) {
            const qp = state.quests.find((q) => q.questId === npc.questId);
            const questDef = QUESTS.find((q) => q.id === npc.questId);
            if (qp && !qp.completed && questDef && questDef.condition(state)) {
              qp.completed = true;
              // Apply rewards
              if (questDef.reward.exp) {
                for (const pet of state.party) {
                  pet.exp += questDef.reward.exp;
                  applyLevelUp(pet);
                }
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
          // Close dialog
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

      // ── Menu phase: navigation ──
      if (state.phase === "menu") {
        if (e.code === "Escape" || (e.code === "KeyZ" && menuSelectedRef.current === 3)) {
          state.phase = "explore";
          setGamePhase("explore");
          return;
        }
        if (e.code === "ArrowUp") {
          menuSelectedRef.current = Math.max(0, menuSelectedRef.current - 1);
        } else if (e.code === "ArrowDown") {
          menuSelectedRef.current = Math.min(3, menuSelectedRef.current + 1);
        }
        return;
      }

      // ── Explore phase: ESC opens menu, Z interacts with NPC ──
      if (state.phase === "explore") {
        if (e.code === "Escape") {
          menuSelectedRef.current = 0;
          state.phase = "menu";
          setGamePhase("menu");
          return;
        }
        if (e.code === "KeyZ") {
          // Check for adjacent NPC
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
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [setGamePhase]);

  // Game loop: movement, collision, portals, rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const gameLoop = (timestamp: number) => {
      if (!running) return;
      const state = gameRef.current;
      if (!state) {
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ── FPS monitoring (Task 7.4) ──
      const deltaMs = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;
      const currentFps = deltaMs > 0 ? Math.round(1000 / deltaMs) : 60;
      fpsFrameTimesRef.current.push(currentFps);
      if (fpsFrameTimesRef.current.length > 60) fpsFrameTimesRef.current.shift();
      // Check for 10 consecutive frames below 30fps
      const recent10 = fpsFrameTimesRef.current.slice(-10);
      if (recent10.length >= 10 && recent10.every((f) => f < 30)) {
        if (!reduceParticlesRef.current) {
          reduceParticlesRef.current = true;
          lowFpsCountRef.current++;
        }
      } else if (recent10.length >= 10 && recent10.every((f) => f >= 30)) {
        reduceParticlesRef.current = false;
      }
      const avgFps = fpsFrameTimesRef.current.length > 0
        ? Math.round(fpsFrameTimesRef.current.reduce((a, b) => a + b, 0) / fpsFrameTimesRef.current.length)
        : 60;

      // Battle phase rendering
      if (state.phase === "battle" && battleRef.current) {
        renderBattle(ctx, battleRef.current);

        // Handle animation phase
        if (battleRef.current.phase === "animate" && battleAnimRef.current) {
          const elapsed = performance.now() - battleAnimRef.current.startTime;
          const stillAlive = renderBattleAnimation(ctx, battleAnimRef.current, elapsed);
          if (!stillAlive) {
            // Animation complete — transition to next phase
            battleRef.current.phase = battleAnimRef.current.nextPhase;
            battleAnimRef.current = null;
          }
        }

        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ── Menu phase rendering (Task 7.3) ──
      if (state.phase === "menu") {
        renderMenu(ctx, state, menuSelectedRef.current);
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ── Dialog phase rendering (Task 7.2) ──
      if (state.phase === "dialog") {
        const area = getMapArea(state.currentArea ?? "village");
        if (area) {
          renderMap(ctx, area, state.player.x, state.player.y, state.player.direction, animFrameRef.current);
          renderHUD(ctx, state, area.name, avgFps);
        }
        // Typewriter effect: advance charIndex at 50ms per character
        const npc = dialogNpcRef.current;
        if (npc) {
          const dialog = npc.dialogs[dialogIndexRef.current];
          if (dialog && dialogCharIndexRef.current < dialog.text.length) {
            const charElapsed = performance.now() - dialogLastCharTimeRef.current;
            if (charElapsed >= 50) {
              dialogCharIndexRef.current++;
              dialogLastCharTimeRef.current = performance.now();
            }
          }
          renderDialog(ctx, npc, dialogIndexRef.current, dialogCharIndexRef.current);
        }
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      if (state.phase !== "explore") {
        // Still render map for other phases
        const area = getMapArea(state.currentArea ?? "village");
        if (area) {
          renderMap(ctx, area, state.player.x, state.player.y, state.player.direction, animFrameRef.current);
        }
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const area = getMapArea(state.currentArea);
      if (!area) {
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Tile-based movement with cooldown
      const elapsed = timestamp - lastMoveTimeRef.current;
      if (elapsed >= MOVE_COOLDOWN) {
        const keys = keysRef.current;
        let dx = 0;
        let dy = 0;
        let newDirection: Direction | null = null;

        // Determine movement direction (last-pressed priority via checking order)
        if (keys.has("ArrowUp")) {
          dy = -1;
          newDirection = "up";
        } else if (keys.has("ArrowDown")) {
          dy = 1;
          newDirection = "down";
        } else if (keys.has("ArrowLeft")) {
          dx = -1;
          newDirection = "left";
        } else if (keys.has("ArrowRight")) {
          dx = 1;
          newDirection = "right";
        }

        if (newDirection) {
          state.player.direction = newDirection;
          const targetX = state.player.x + dx;
          const targetY = state.player.y + dy;

          // Bounds check
          if (targetX >= 0 && targetX < area.tileMap.width && targetY >= 0 && targetY < area.tileMap.height) {
            // Collision check: use the collisions array from the tileMap
            const isBlocked = area.tileMap.collisions[targetY][targetX];

            if (!isBlocked) {
              // Move player
              state.player.x = targetX;
              state.player.y = targetY;
              animFrameRef.current++;

              // Check for portal at new position
              const portal = area.portals.find(
                (p) => p.x === targetX && p.y === targetY,
              );
              if (portal) {
                // Teleport to target area
                state.currentArea = portal.targetArea;
                state.player.x = portal.targetX;
                state.player.y = portal.targetY;
              } else {
                // Check for wild encounter on tall grass tiles
                const isEncounterTile = area.tileMap.encounters[targetY][targetX];
                if (checkEncounter(isEncounterTile)) {
                  // Select wild pet from area distribution table
                  const wildPetId = selectWildPet(area.petTable);
                  const wildTemplate = PET_TEMPLATES.find((t) => t.id === wildPetId);
                  if (wildTemplate) {
                    // Determine wild pet level based on area
                    const levelRange = AREA_LEVEL_RANGE[state.currentArea] ?? { min: 3, max: 6 };
                    const wildLevel = levelRange.min + Math.floor(Math.random() * (levelRange.max - levelRange.min + 1));
                    const wildPet = createPetFromTemplate(wildTemplate, wildLevel);

                    // Set up battle state
                    battleRef.current = {
                      playerPet: state.party[0],
                      enemyPet: wildPet,
                      turn: determineTurnOrder(state.party[0].spd, wildPet.spd),
                      phase: "select",
                      log: [`野生的 ${wildPet.name} (Lv.${wildLevel}) 出现了！`],
                    };

                    // Switch to battle phase
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

      // Render
      const currentArea = getMapArea(state.currentArea)!;
      renderMap(
        ctx,
        currentArea,
        state.player.x,
        state.player.y,
        state.player.direction,
        animFrameRef.current,
      );

      // HUD overlay (Task 7.3)
      renderHUD(ctx, state, currentArea.name, avgFps);

      rafRef.current = requestAnimationFrame(gameLoop);
    };

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4 pb-24 md:pb-8">
        <h1 className="text-xl font-bold text-white mb-3">
          <span className="text-[#f0b90b]">🐉 宠物大冒险</span>
        </h1>

        {/* Canvas */}
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

        {/* Mobile touch controls */}
        <div className="flex justify-between items-center mt-3 md:hidden">
          {/* D-pad */}
          <div className="grid grid-cols-3 gap-1 w-32">
            <div />
            <button
              className="w-10 h-10 rounded-lg bg-[#222] border border-[#444] text-white text-lg active:bg-[#333] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("ArrowUp")}
              onTouchEnd={() => keysRef.current.delete("ArrowUp")}
              aria-label="上移"
            >
              ▲
            </button>
            <div />
            <button
              className="w-10 h-10 rounded-lg bg-[#222] border border-[#444] text-white text-lg active:bg-[#333] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("ArrowLeft")}
              onTouchEnd={() => keysRef.current.delete("ArrowLeft")}
              aria-label="左移"
            >
              ◀
            </button>
            <div />
            <button
              className="w-10 h-10 rounded-lg bg-[#222] border border-[#444] text-white text-lg active:bg-[#333] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("ArrowRight")}
              onTouchEnd={() => keysRef.current.delete("ArrowRight")}
              aria-label="右移"
            >
              ▶
            </button>
            <div />
            <button
              className="w-10 h-10 rounded-lg bg-[#222] border border-[#444] text-white text-lg active:bg-[#333] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("ArrowDown")}
              onTouchEnd={() => keysRef.current.delete("ArrowDown")}
              aria-label="下移"
            >
              ▼
            </button>
            <div />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              className="w-12 h-12 rounded-full bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm active:bg-[#d4a30a] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("KeyZ")}
              onTouchEnd={() => keysRef.current.delete("KeyZ")}
              aria-label="确认"
            >
              A
            </button>
            <button
              className="w-12 h-12 rounded-full bg-[#333] text-white font-bold text-sm active:bg-[#444] flex items-center justify-center"
              onTouchStart={() => keysRef.current.add("Escape")}
              onTouchEnd={() => keysRef.current.delete("Escape")}
              aria-label="菜单"
            >
              B
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-[#666] mt-3">
          方向键移动 · Z 确认/交互 · ESC 菜单
        </p>
      </main>
    </>
  );
}
