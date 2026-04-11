"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";

// ─── Type Definitions ────────────────────────────────────

export type PetType = "fire" | "water" | "grass" | "electric" | "dark";

export type Direction = "up" | "down" | "left" | "right";

export interface TileMap {
  width: number;
  height: number;
  tiles: number[][];
  collisions: boolean[][];
  encounters: boolean[][];
}

export interface Portal {
  x: number;
  y: number;
  targetArea: string;
  targetX: number;
  targetY: number;
}

export interface PetEncounter {
  petId: string;
  weight: number;
}

export interface Skill {
  name: string;
  type: PetType;
  power: number;
  mpCost: number;
  learnLevel: number;
}

export interface Pet {
  id: string;
  name: string;
  type: PetType;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  skills: Skill[];
  rarity: "common" | "rare" | "epic";
  evolutionStage: number;
  evolutionLevel?: number;
  spriteId: string;
}

export interface BattleState {
  playerPet: Pet;
  enemyPet: Pet;
  turn: "player" | "enemy";
  phase: "select" | "animate" | "result";
  log: string[];
}

export interface Dialog {
  text: string;
  condition?: (state: GameState) => boolean;
}

export interface NPC {
  id: string;
  name: string;
  x: number;
  y: number;
  dialogs: Dialog[];
  questId?: string;
}

export interface MapArea {
  id: string;
  name: string;
  tileMap: TileMap;
  npcs: NPC[];
  portals: Portal[];
  petTable: PetEncounter[];
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  condition: (state: GameState) => boolean;
  reward: { exp?: number; items?: string[]; unlockArea?: string };
}

export interface ItemStack {
  id: string;
  name: string;
  count: number;
}

export interface QuestProgress {
  questId: string;
  completed: boolean;
}

export interface GameState {
  phase: "explore" | "battle" | "dialog" | "menu";
  player: { x: number; y: number; direction: Direction };
  currentArea: string;
  party: Pet[];
  allPets: Pet[];
  items: ItemStack[];
  quests: QuestProgress[];
  gold: number;
  unlockedAreas: string[];
}

// ─── Constants ───────────────────────────────────────────

export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 480;
export const TILE_SIZE = 32;
export const MAP_COLS = 20;
export const MAP_ROWS = 15;

/** Tile type enum: 0=grass, 1=road, 2=water, 3=tree, 4=rock, 5=tallgrass, 6=building */
export const TILE_TYPES = {
  GRASS: 0,
  ROAD: 1,
  WATER: 2,
  TREE: 3,
  ROCK: 4,
  TALL_GRASS: 5,
  BUILDING: 6,
} as const;

/** Tiles that block movement */
export const COLLISION_TILES: Set<number> = new Set([
  TILE_TYPES.WATER,
  TILE_TYPES.TREE,
  TILE_TYPES.ROCK,
  TILE_TYPES.BUILDING,
]);

/** Tiles that trigger wild encounters */
export const ENCOUNTER_TILES: Set<number> = new Set([TILE_TYPES.TALL_GRASS]);

/** Type effectiveness table: attacker → defender → multiplier */
export const TYPE_EFFECTIVENESS: Record<PetType, Record<PetType, number>> = {
  fire:     { fire: 1, water: 0.67, grass: 1.5, electric: 1, dark: 1 },
  water:    { fire: 1.5, water: 1, grass: 0.67, electric: 1, dark: 1 },
  grass:    { fire: 0.67, water: 1.5, grass: 1, electric: 1, dark: 1 },
  electric: { fire: 1, water: 1.5, grass: 1, electric: 1, dark: 0.67 },
  dark:     { fire: 1, water: 1, grass: 1, electric: 1.5, dark: 1 },
};

/** Physics / gameplay parameters */
export const PLAYER_SPEED = 3; // pixels per frame (within 2-4 range)
export const ENCOUNTER_RATE = 0.15; // 15% per grass tile step
export const MAX_PARTY_SIZE = 6;
export const BASE_CATCH_RATE = 0.5;
export const INVINCIBLE_FRAMES = 60;

// ─── Pure Functions (exported for testing) ───────────────

/** Get type effectiveness multiplier */
export function getTypeMultiplier(attackerType: PetType, defenderType: PetType): number {
  return TYPE_EFFECTIVENESS[attackerType][defenderType];
}

/** Calculate damage: (atk * power / 50 - def * 0.5) * typeMultiplier * randomFactor, min 1 */
export function calculateDamage(
  atk: number,
  def: number,
  power: number,
  attackerType: PetType,
  defenderType: PetType,
  randomFactor?: number,
): number {
  const rf = randomFactor ?? (0.9 + Math.random() * 0.2);
  const multiplier = getTypeMultiplier(attackerType, defenderType);
  const raw = (atk * power / 50 - def * 0.5) * multiplier * rf;
  return Math.max(1, Math.floor(raw));
}

/** Calculate catch rate: baseCatchRate * (1 - currentHp/maxHp) * ballBonus, clamped [0, 1] */
export function calculateCatchRate(
  baseCatchRate: number,
  currentHp: number,
  maxHp: number,
  ballBonus: number,
): number {
  const rate = baseCatchRate * (1 - currentHp / maxHp) * ballBonus;
  return Math.min(1, Math.max(0, rate));
}

/** Calculate exp gained from defeating an enemy: enemyLevel * 10 + 20 */
export function calculateExp(enemyLevel: number): number {
  return enemyLevel * 10 + 20;
}

/** Check if pet should level up: exp >= level^2 * 15 */
export function shouldLevelUp(level: number, exp: number): boolean {
  return exp >= level * level * 15;
}

/** Calculate flee rate: min(max(50 + (mySpeed - enemySpeed) * 2, 10), 90) */
export function calculateFleeRate(mySpeed: number, enemySpeed: number): number {
  return Math.min(Math.max(50 + (mySpeed - enemySpeed) * 2, 10), 90);
}

/** Determine turn order: higher speed goes first, player wins ties */
export function determineTurnOrder(
  playerSpeed: number,
  enemySpeed: number,
): "player" | "enemy" {
  return playerSpeed >= enemySpeed ? "player" : "enemy";
}

/** Advance dialog: returns next index or -1 if dialog ended */
export function advanceDialog(dialogCount: number, currentIndex: number): number {
  const next = currentIndex + 1;
  return next >= dialogCount ? -1 : next;
}

/** Check if a wild encounter triggers on an encounter tile */
export function checkEncounter(isEncounterTile: boolean, rate: number = ENCOUNTER_RATE): boolean {
  if (!isEncounterTile) return false;
  return Math.random() < rate;
}

/** Weighted random selection from a pet distribution table, returns petId */
export function selectWildPet(petTable: PetEncounter[]): string {
  const totalWeight = petTable.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of petTable) {
    roll -= entry.weight;
    if (roll <= 0) return entry.petId;
  }
  // Fallback: return last entry (should not reach here with valid data)
  return petTable[petTable.length - 1].petId;
}

/** Calculate star rating for level completion */
export function calculateStars(
  remainingHpPercent: number,
  time: number,
  parTime: number,
): 1 | 2 | 3 {
  if (remainingHpPercent > 70 && time < parTime) return 3;
  if (remainingHpPercent > 40) return 2;
  return 1;
}

// ─── Skill Definitions ───────────────────────────────────

export const SKILLS: Record<string, Skill> = {
  // Fire skills
  ember:       { name: "火花", type: "fire", power: 40, mpCost: 5, learnLevel: 1 },
  flameWhip:   { name: "烈焰鞭", type: "fire", power: 60, mpCost: 10, learnLevel: 8 },
  inferno:     { name: "地狱火", type: "fire", power: 85, mpCost: 18, learnLevel: 15 },
  blazeStorm:  { name: "炎暴风", type: "fire", power: 110, mpCost: 25, learnLevel: 22 },
  // Water skills
  bubble:      { name: "泡沫", type: "water", power: 40, mpCost: 5, learnLevel: 1 },
  aquaJet:     { name: "水流喷射", type: "water", power: 60, mpCost: 10, learnLevel: 8 },
  tidal:       { name: "潮汐冲击", type: "water", power: 85, mpCost: 18, learnLevel: 15 },
  tsunami:     { name: "海啸", type: "water", power: 110, mpCost: 25, learnLevel: 22 },
  // Grass skills
  vineWhip:    { name: "藤鞭", type: "grass", power: 40, mpCost: 5, learnLevel: 1 },
  razorLeaf:   { name: "飞叶快刀", type: "grass", power: 60, mpCost: 10, learnLevel: 8 },
  solarBeam:   { name: "阳光烈焰", type: "grass", power: 85, mpCost: 18, learnLevel: 15 },
  forestWrath: { name: "森林之怒", type: "grass", power: 110, mpCost: 25, learnLevel: 22 },
  // Electric skills
  spark:       { name: "电火花", type: "electric", power: 40, mpCost: 5, learnLevel: 1 },
  thunderBolt: { name: "十万伏特", type: "electric", power: 60, mpCost: 10, learnLevel: 8 },
  lightning:   { name: "闪电链", type: "electric", power: 85, mpCost: 18, learnLevel: 15 },
  thunderGod:  { name: "雷神之怒", type: "electric", power: 110, mpCost: 25, learnLevel: 22 },
  // Dark skills
  shadowClaw:  { name: "暗影爪", type: "dark", power: 40, mpCost: 5, learnLevel: 1 },
  nightSlash:  { name: "暗夜斩", type: "dark", power: 60, mpCost: 10, learnLevel: 8 },
  darkPulse:   { name: "暗黑脉冲", type: "dark", power: 85, mpCost: 18, learnLevel: 15 },
  voidStrike:  { name: "虚空打击", type: "dark", power: 110, mpCost: 25, learnLevel: 22 },
};

// ─── Pet Template Definitions ────────────────────────────

/** Base pet template used to create pet instances */
export interface PetTemplate {
  id: string;
  name: string;
  type: PetType;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpd: number;
  baseMp: number;
  rarity: "common" | "rare" | "epic";
  skills: Skill[];
  evolutionStage: number;
  evolutionLevel?: number;
  spriteId: string;
}

/** Evolution chain: base → stage1 (level 10) → stage2 (level 20) */
export interface EvolutionChain {
  base: string;       // pet template id
  stage1: string;     // evolved form id (level 10)
  stage2: string;     // final form id (level 20)
}

// ── Fire Pets ──
const firePup: PetTemplate = {
  id: "fire_pup", name: "焰犬", type: "fire",
  baseHp: 45, baseAtk: 52, baseDef: 35, baseSpd: 50, baseMp: 30,
  rarity: "common",
  skills: [SKILLS.ember, SKILLS.flameWhip, SKILLS.inferno, SKILLS.blazeStorm],
  evolutionStage: 0, evolutionLevel: 10, spriteId: "fire_pup",
};
const fireHound: PetTemplate = {
  id: "fire_hound", name: "烈焰猎犬", type: "fire",
  baseHp: 60, baseAtk: 68, baseDef: 46, baseSpd: 65, baseMp: 40,
  rarity: "common",
  skills: [SKILLS.ember, SKILLS.flameWhip, SKILLS.inferno, SKILLS.blazeStorm],
  evolutionStage: 1, evolutionLevel: 20, spriteId: "fire_hound",
};
const infernoWolf: PetTemplate = {
  id: "inferno_wolf", name: "地狱炎狼", type: "fire",
  baseHp: 80, baseAtk: 90, baseDef: 60, baseSpd: 85, baseMp: 55,
  rarity: "common",
  skills: [SKILLS.ember, SKILLS.flameWhip, SKILLS.inferno, SKILLS.blazeStorm],
  evolutionStage: 2, spriteId: "inferno_wolf",
};

const magmaLizard: PetTemplate = {
  id: "magma_lizard", name: "岩浆蜥", type: "fire",
  baseHp: 50, baseAtk: 58, baseDef: 42, baseSpd: 40, baseMp: 28,
  rarity: "rare",
  skills: [SKILLS.ember, SKILLS.flameWhip, SKILLS.inferno, SKILLS.blazeStorm],
  evolutionStage: 0, evolutionLevel: 10, spriteId: "magma_lizard",
};
const lavaDrake: PetTemplate = {
  id: "lava_drake", name: "熔岩龙蜥", type: "fire",
  baseHp: 68, baseAtk: 76, baseDef: 55, baseSpd: 52, baseMp: 38,
  rarity: "rare",
  skills: [SKILLS.ember, SKILLS.flameWhip, SKILLS.inferno, SKILLS.blazeStorm],
  evolutionStage: 1, evolutionLevel: 20, spriteId: "lava_drake",
};
const volcanoTitan: PetTemplate = {
  id: "volcano_titan", name: "火山巨龙", type: "fire",
  baseHp: 90, baseAtk: 100, baseDef: 72, baseSpd: 68, baseMp: 50,
  rarity: "rare",
  skills: [SKILLS.ember, SKILLS.flameWhip, SKILLS.inferno, SKILLS.blazeStorm],
  evolutionStage: 2, spriteId: "volcano_titan",
};

const phoenixChick: PetTemplate = {
  id: "phoenix_chick", name: "凤凰雏", type: "fire",
  baseHp: 42, baseAtk: 60, baseDef: 30, baseSpd: 65, baseMp: 35,
  rarity: "epic",
  skills: [SKILLS.ember, SKILLS.flameWhip, SKILLS.inferno, SKILLS.blazeStorm],
  evolutionStage: 0, spriteId: "phoenix_chick",
};

// ── Water Pets ──
const aquaFrog: PetTemplate = {
  id: "aqua_frog", name: "水蛙", type: "water",
  baseHp: 50, baseAtk: 45, baseDef: 40, baseSpd: 48, baseMp: 32,
  rarity: "common",
  skills: [SKILLS.bubble, SKILLS.aquaJet, SKILLS.tidal, SKILLS.tsunami],
  evolutionStage: 0, evolutionLevel: 10, spriteId: "aqua_frog",
};
const tidalToad: PetTemplate = {
  id: "tidal_toad", name: "潮汐蟾蜍", type: "water",
  baseHp: 68, baseAtk: 60, baseDef: 54, baseSpd: 62, baseMp: 42,
  rarity: "common",
  skills: [SKILLS.bubble, SKILLS.aquaJet, SKILLS.tidal, SKILLS.tsunami],
  evolutionStage: 1, evolutionLevel: 20, spriteId: "tidal_toad",
};
const oceanKing: PetTemplate = {
  id: "ocean_king", name: "海洋霸主", type: "water",
  baseHp: 90, baseAtk: 80, baseDef: 70, baseSpd: 80, baseMp: 55,
  rarity: "common",
  skills: [SKILLS.bubble, SKILLS.aquaJet, SKILLS.tidal, SKILLS.tsunami],
  evolutionStage: 2, spriteId: "ocean_king",
};

const coralShell: PetTemplate = {
  id: "coral_shell", name: "珊瑚贝", type: "water",
  baseHp: 55, baseAtk: 38, baseDef: 60, baseSpd: 30, baseMp: 35,
  rarity: "rare",
  skills: [SKILLS.bubble, SKILLS.aquaJet, SKILLS.tidal, SKILLS.tsunami],
  evolutionStage: 0, evolutionLevel: 10, spriteId: "coral_shell",
};
const pearlGuard: PetTemplate = {
  id: "pearl_guard", name: "珍珠守卫", type: "water",
  baseHp: 72, baseAtk: 50, baseDef: 78, baseSpd: 40, baseMp: 45,
  rarity: "rare",
  skills: [SKILLS.bubble, SKILLS.aquaJet, SKILLS.tidal, SKILLS.tsunami],
  evolutionStage: 1, evolutionLevel: 20, spriteId: "pearl_guard",
};
const abyssLord: PetTemplate = {
  id: "abyss_lord", name: "深渊领主", type: "water",
  baseHp: 95, baseAtk: 65, baseDef: 100, baseSpd: 52, baseMp: 60,
  rarity: "rare",
  skills: [SKILLS.bubble, SKILLS.aquaJet, SKILLS.tidal, SKILLS.tsunami],
  evolutionStage: 2, spriteId: "abyss_lord",
};

// ── Grass Pets ──
const sproutling: PetTemplate = {
  id: "sproutling", name: "嫩芽仔", type: "grass",
  baseHp: 48, baseAtk: 44, baseDef: 42, baseSpd: 52, baseMp: 30,
  rarity: "common",
  skills: [SKILLS.vineWhip, SKILLS.razorLeaf, SKILLS.solarBeam, SKILLS.forestWrath],
  evolutionStage: 0, evolutionLevel: 10, spriteId: "sproutling",
};
const thornVine: PetTemplate = {
  id: "thorn_vine", name: "荆棘藤", type: "grass",
  baseHp: 64, baseAtk: 58, baseDef: 56, baseSpd: 68, baseMp: 40,
  rarity: "common",
  skills: [SKILLS.vineWhip, SKILLS.razorLeaf, SKILLS.solarBeam, SKILLS.forestWrath],
  evolutionStage: 1, evolutionLevel: 20, spriteId: "thorn_vine",
};
const ancientTree: PetTemplate = {
  id: "ancient_tree", name: "远古树灵", type: "grass",
  baseHp: 85, baseAtk: 76, baseDef: 74, baseSpd: 88, baseMp: 55,
  rarity: "common",
  skills: [SKILLS.vineWhip, SKILLS.razorLeaf, SKILLS.solarBeam, SKILLS.forestWrath],
  evolutionStage: 2, spriteId: "ancient_tree",
};

const mushroom: PetTemplate = {
  id: "mushroom", name: "毒蘑菇", type: "grass",
  baseHp: 52, baseAtk: 48, baseDef: 50, baseSpd: 35, baseMp: 34,
  rarity: "rare",
  skills: [SKILLS.vineWhip, SKILLS.razorLeaf, SKILLS.solarBeam, SKILLS.forestWrath],
  evolutionStage: 0, evolutionLevel: 10, spriteId: "mushroom",
};
const sporeMaster: PetTemplate = {
  id: "spore_master", name: "孢子大师", type: "grass",
  baseHp: 70, baseAtk: 64, baseDef: 66, baseSpd: 46, baseMp: 44,
  rarity: "rare",
  skills: [SKILLS.vineWhip, SKILLS.razorLeaf, SKILLS.solarBeam, SKILLS.forestWrath],
  evolutionStage: 1, evolutionLevel: 20, spriteId: "spore_master",
};
const fungalKing: PetTemplate = {
  id: "fungal_king", name: "菌王", type: "grass",
  baseHp: 92, baseAtk: 84, baseDef: 86, baseSpd: 60, baseMp: 58,
  rarity: "rare",
  skills: [SKILLS.vineWhip, SKILLS.razorLeaf, SKILLS.solarBeam, SKILLS.forestWrath],
  evolutionStage: 2, spriteId: "fungal_king",
};

// ── Electric Pets ──
const sparkMouse: PetTemplate = {
  id: "spark_mouse", name: "电光鼠", type: "electric",
  baseHp: 40, baseAtk: 50, baseDef: 32, baseSpd: 65, baseMp: 30,
  rarity: "common",
  skills: [SKILLS.spark, SKILLS.thunderBolt, SKILLS.lightning, SKILLS.thunderGod],
  evolutionStage: 0, evolutionLevel: 10, spriteId: "spark_mouse",
};
const voltFox: PetTemplate = {
  id: "volt_fox", name: "雷狐", type: "electric",
  baseHp: 55, baseAtk: 66, baseDef: 42, baseSpd: 85, baseMp: 40,
  rarity: "common",
  skills: [SKILLS.spark, SKILLS.thunderBolt, SKILLS.lightning, SKILLS.thunderGod],
  evolutionStage: 1, evolutionLevel: 20, spriteId: "volt_fox",
};
const thunderLion: PetTemplate = {
  id: "thunder_lion", name: "雷霆狮王", type: "electric",
  baseHp: 72, baseAtk: 88, baseDef: 55, baseSpd: 110, baseMp: 55,
  rarity: "common",
  skills: [SKILLS.spark, SKILLS.thunderBolt, SKILLS.lightning, SKILLS.thunderGod],
  evolutionStage: 2, spriteId: "thunder_lion",
};

const crystalBat: PetTemplate = {
  id: "crystal_bat", name: "晶翼蝠", type: "electric",
  baseHp: 38, baseAtk: 55, baseDef: 28, baseSpd: 70, baseMp: 32,
  rarity: "epic",
  skills: [SKILLS.spark, SKILLS.thunderBolt, SKILLS.lightning, SKILLS.thunderGod],
  evolutionStage: 0, spriteId: "crystal_bat",
};

// ── Dark Pets ──
const shadowCat: PetTemplate = {
  id: "shadow_cat", name: "暗影猫", type: "dark",
  baseHp: 42, baseAtk: 55, baseDef: 34, baseSpd: 60, baseMp: 30,
  rarity: "common",
  skills: [SKILLS.shadowClaw, SKILLS.nightSlash, SKILLS.darkPulse, SKILLS.voidStrike],
  evolutionStage: 0, evolutionLevel: 10, spriteId: "shadow_cat",
};
const nightPanther: PetTemplate = {
  id: "night_panther", name: "夜豹", type: "dark",
  baseHp: 58, baseAtk: 72, baseDef: 45, baseSpd: 78, baseMp: 40,
  rarity: "common",
  skills: [SKILLS.shadowClaw, SKILLS.nightSlash, SKILLS.darkPulse, SKILLS.voidStrike],
  evolutionStage: 1, evolutionLevel: 20, spriteId: "night_panther",
};
const voidTiger: PetTemplate = {
  id: "void_tiger", name: "虚空魔虎", type: "dark",
  baseHp: 78, baseAtk: 95, baseDef: 58, baseSpd: 100, baseMp: 55,
  rarity: "common",
  skills: [SKILLS.shadowClaw, SKILLS.nightSlash, SKILLS.darkPulse, SKILLS.voidStrike],
  evolutionStage: 2, spriteId: "void_tiger",
};

const ghostWisp: PetTemplate = {
  id: "ghost_wisp", name: "幽灵火", type: "dark",
  baseHp: 35, baseAtk: 62, baseDef: 25, baseSpd: 72, baseMp: 38,
  rarity: "epic",
  skills: [SKILLS.shadowClaw, SKILLS.nightSlash, SKILLS.darkPulse, SKILLS.voidStrike],
  evolutionStage: 0, spriteId: "ghost_wisp",
};

// ─── Exported Pet Templates Array ────────────────────────

export const PET_TEMPLATES: PetTemplate[] = [
  // Fire (7 templates: 2 evolution chains + 1 standalone)
  firePup, fireHound, infernoWolf,
  magmaLizard, lavaDrake, volcanoTitan,
  phoenixChick,
  // Water (6 templates: 2 evolution chains)
  aquaFrog, tidalToad, oceanKing,
  coralShell, pearlGuard, abyssLord,
  // Grass (6 templates: 2 evolution chains)
  sproutling, thornVine, ancientTree,
  mushroom, sporeMaster, fungalKing,
  // Electric (4 templates: 1 evolution chain + 1 standalone)
  sparkMouse, voltFox, thunderLion,
  crystalBat,
  // Dark (4 templates: 1 evolution chain + 1 standalone)
  shadowCat, nightPanther, voidTiger,
  ghostWisp,
];

// ─── Evolution Chains ────────────────────────────────────

export const EVOLUTION_CHAINS: EvolutionChain[] = [
  // Fire chains
  { base: "fire_pup",     stage1: "fire_hound",   stage2: "inferno_wolf" },
  { base: "magma_lizard", stage1: "lava_drake",    stage2: "volcano_titan" },
  // Water chains
  { base: "aqua_frog",    stage1: "tidal_toad",    stage2: "ocean_king" },
  { base: "coral_shell",  stage1: "pearl_guard",   stage2: "abyss_lord" },
  // Grass chains
  { base: "sproutling",   stage1: "thorn_vine",    stage2: "ancient_tree" },
  { base: "mushroom",     stage1: "spore_master",  stage2: "fungal_king" },
  // Electric chain
  { base: "spark_mouse",  stage1: "volt_fox",      stage2: "thunder_lion" },
  // Dark chain
  { base: "shadow_cat",   stage1: "night_panther", stage2: "void_tiger" },
];

/** Helper: get the evolution chain for a given pet id, or undefined if not part of a chain */
export function getEvolutionChain(petId: string): EvolutionChain | undefined {
  return EVOLUTION_CHAINS.find(
    (c) => c.base === petId || c.stage1 === petId || c.stage2 === petId,
  );
}

/** Helper: get the next evolution template for a pet, or null if fully evolved / no chain */
export function getNextEvolution(petId: string, level: number): PetTemplate | null {
  const chain = getEvolutionChain(petId);
  if (!chain) return null;
  if (petId === chain.base && level >= 10) {
    return PET_TEMPLATES.find((t) => t.id === chain.stage1) ?? null;
  }
  if (petId === chain.stage1 && level >= 20) {
    return PET_TEMPLATES.find((t) => t.id === chain.stage2) ?? null;
  }
  return null;
}

/**
 * Apply level-up logic to a pet: stat growth (5%-10%), skill learning, and evolution check.
 * Mutates the pet in place. Returns an array of log messages describing what happened.
 */
export function applyLevelUp(pet: Pet): string[] {
  const logs: string[] = [];

  while (shouldLevelUp(pet.level, pet.exp)) {
    pet.level++;
    // Attribute growth 5%-10%
    const growth = 1 + 0.05 + Math.random() * 0.05;
    pet.maxHp = Math.floor(pet.maxHp * growth);
    pet.hp = Math.min(pet.hp + 10, pet.maxHp);
    pet.maxMp = Math.floor(pet.maxMp * growth);
    pet.atk = Math.floor(pet.atk * growth);
    pet.def = Math.floor(pet.def * growth);
    pet.spd = Math.floor(pet.spd * growth);
    logs.push(`${pet.name}升到了${pet.level}级！`);

    // Check for new skills to learn
    const template = PET_TEMPLATES.find((t) => t.id === pet.id);
    if (template) {
      for (const skill of template.skills) {
        if (skill.learnLevel === pet.level && !pet.skills.some((s) => s.name === skill.name)) {
          if (pet.skills.length < 4) {
            pet.skills.push(skill);
            logs.push(`${pet.name}学会了${skill.name}！`);
          } else {
            // Replace the weakest skill (lowest power) automatically
            const weakestIdx = pet.skills.reduce(
              (minIdx, s, idx, arr) => (s.power < arr[minIdx].power ? idx : minIdx),
              0,
            );
            const forgotten = pet.skills[weakestIdx];
            pet.skills[weakestIdx] = skill;
            logs.push(`${pet.name}遗忘了${forgotten.name}，学会了${skill.name}！`);
          }
        }
      }
    }

    // Check for evolution at level 10 or 20
    const evo = getNextEvolution(pet.id, pet.level);
    if (evo) {
      logs.push(`${pet.name}正在进化...`);
      // Update pet to evolved form: name, sprite, stats +30%
      pet.id = evo.id;
      pet.name = evo.name;
      pet.spriteId = evo.spriteId;
      pet.evolutionStage = evo.evolutionStage;
      pet.evolutionLevel = evo.evolutionLevel;
      // Stat boost +30%
      pet.maxHp = Math.floor(pet.maxHp * 1.3);
      pet.hp = pet.maxHp;
      pet.maxMp = Math.floor(pet.maxMp * 1.3);
      pet.mp = pet.maxMp;
      pet.atk = Math.floor(pet.atk * 1.3);
      pet.def = Math.floor(pet.def * 1.3);
      pet.spd = Math.floor(pet.spd * 1.3);
      logs.push(`进化成了${pet.name}！`);
    }
  }

  return logs;
}

/** Helper: create a Pet instance from a PetTemplate at a given level */
export function createPetFromTemplate(template: PetTemplate, level: number): Pet {
  const scale = 1 + (level - 1) * 0.07; // ~7% growth per level
  return {
    id: template.id,
    name: template.name,
    type: template.type,
    level,
    exp: 0,
    hp: Math.floor(template.baseHp * scale),
    maxHp: Math.floor(template.baseHp * scale),
    mp: Math.floor(template.baseMp * scale),
    maxMp: Math.floor(template.baseMp * scale),
    atk: Math.floor(template.baseAtk * scale),
    def: Math.floor(template.baseDef * scale),
    spd: Math.floor(template.baseSpd * scale),
    skills: template.skills.filter((s) => s.learnLevel <= level),
    rarity: template.rarity,
    evolutionStage: template.evolutionStage,
    evolutionLevel: template.evolutionLevel,
    spriteId: template.spriteId,
  };
}

// ─── Map Area Data ───────────────────────────────────────

/** Helper: generate collisions and encounters arrays from a tile grid */
function buildTileMapMeta(tiles: number[][]): { collisions: boolean[][]; encounters: boolean[][] } {
  const collisions = tiles.map(row => row.map(t => COLLISION_TILES.has(t)));
  const encounters = tiles.map(row => row.map(t => ENCOUNTER_TILES.has(t)));
  return { collisions, encounters };
}

// ── Village (新手村) ── peaceful starting area with roads, buildings, some water
const VILLAGE_TILES: number[][] = [
  [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
  [3,0,0,0,1,1,1,0,0,6,6,0,0,1,1,1,0,0,0,3],
  [3,0,5,0,1,0,1,0,0,6,6,0,0,1,0,1,0,5,0,3],
  [3,0,0,0,1,0,1,0,0,0,0,0,0,1,0,1,0,0,0,3],
  [3,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,1,3],
  [3,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,3],
  [3,0,6,6,0,0,0,0,0,1,0,0,0,0,0,6,6,0,0,3],
  [3,0,6,6,0,0,0,0,0,1,0,0,0,0,0,6,6,0,0,3],
  [3,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,3],
  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3],
  [3,0,0,0,0,0,2,2,0,1,0,2,2,0,0,0,0,0,0,3],
  [3,0,5,5,0,0,2,2,0,1,0,2,2,0,0,5,5,0,0,3],
  [3,0,5,5,0,0,0,0,0,1,0,0,0,0,0,5,5,0,0,3],
  [3,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,3],
  [3,3,3,3,3,3,3,3,3,1,3,3,3,3,3,3,3,3,3,3],
];

// ── Forest (森林) ── dense trees, lots of tall grass, winding paths
const FOREST_TILES: number[][] = [
  [3,3,3,3,3,3,3,3,3,1,3,3,3,3,3,3,3,3,3,3],
  [3,5,5,0,0,3,3,5,0,1,0,5,3,3,0,0,5,5,0,3],
  [3,5,5,5,0,3,5,5,0,1,0,5,5,3,0,5,5,5,0,3],
  [3,0,5,0,0,0,0,0,0,1,0,0,0,0,0,0,5,0,0,3],
  [3,0,0,0,3,0,0,0,1,1,1,0,0,0,3,0,0,0,0,3],
  [3,3,0,0,3,3,0,0,1,0,1,0,0,3,3,0,0,3,0,3],
  [3,0,0,5,5,0,0,0,1,0,1,0,0,0,5,5,0,0,0,3],
  [3,0,5,5,5,5,0,0,1,0,1,0,0,5,5,5,5,0,0,3],
  [3,0,0,5,5,0,0,0,1,0,1,0,0,0,5,5,0,0,0,3],
  [3,3,0,0,0,0,3,0,1,1,1,0,3,0,0,0,0,3,0,3],
  [3,0,0,0,3,0,0,0,0,1,0,0,0,0,3,0,0,0,0,3],
  [3,0,5,0,0,0,0,5,0,1,0,5,0,0,0,0,5,0,0,3],
  [3,5,5,5,0,3,5,5,0,1,0,5,5,3,0,5,5,5,0,3],
  [3,5,5,0,0,3,3,0,0,1,0,0,3,3,0,0,5,5,0,3],
  [3,3,3,3,3,3,3,3,3,1,3,3,3,3,3,3,3,3,3,3],
];

// ── Cave (洞穴) ── rocky terrain, narrow passages, dark feel
const CAVE_TILES: number[][] = [
  [4,4,4,4,4,4,4,4,4,1,4,4,4,4,4,4,4,4,4,4],
  [4,0,0,4,4,0,0,0,0,1,0,0,0,0,4,4,0,0,0,4],
  [4,0,0,0,4,0,4,0,0,1,0,0,4,0,4,0,0,5,0,4],
  [4,0,5,0,0,0,4,0,0,1,0,0,4,0,0,0,5,5,0,4],
  [4,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,4],
  [4,4,0,0,4,4,0,0,1,0,1,0,0,4,4,0,0,4,0,4],
  [4,0,0,5,0,0,0,0,1,0,1,0,0,0,0,5,0,0,0,4],
  [4,0,5,5,0,4,0,0,1,0,1,0,0,4,0,5,5,0,0,4],
  [4,0,0,5,0,0,0,0,1,0,1,0,0,0,0,5,0,0,0,4],
  [4,4,0,0,4,0,0,0,1,1,1,0,0,0,4,0,0,4,0,4],
  [4,0,0,0,0,0,4,0,0,1,0,0,4,0,0,0,0,0,0,4],
  [4,0,5,0,4,0,0,0,0,1,0,0,0,0,4,0,5,0,0,4],
  [4,0,0,0,4,4,0,0,0,1,0,0,0,4,4,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,4],
  [4,4,4,4,4,4,4,4,4,1,4,4,4,4,4,4,4,4,4,4],
];

// ── Volcano (火山) ── lava (water tiles repurposed), rocks, dangerous terrain
const VOLCANO_TILES: number[][] = [
  [4,4,4,4,4,4,4,4,4,1,4,4,4,4,4,4,4,4,4,4],
  [4,0,0,2,2,4,0,0,0,1,0,0,0,4,2,2,0,0,0,4],
  [4,0,0,2,2,0,0,5,0,1,0,5,0,0,2,2,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,4],
  [4,2,0,0,0,0,4,0,1,1,1,0,4,0,0,0,0,2,0,4],
  [4,2,2,0,0,4,4,0,1,0,1,0,4,4,0,0,2,2,0,4],
  [4,0,0,0,5,0,0,0,1,0,1,0,0,0,5,0,0,0,0,4],
  [4,0,5,5,5,0,0,0,1,0,1,0,0,0,5,5,5,0,0,4],
  [4,0,0,0,5,0,0,0,1,0,1,0,0,0,5,0,0,0,0,4],
  [4,2,2,0,0,4,0,0,1,1,1,0,0,4,0,0,2,2,0,4],
  [4,2,0,0,0,0,4,0,0,1,0,0,4,0,0,0,0,2,0,4],
  [4,0,0,0,0,0,0,5,0,1,0,5,0,0,0,0,0,0,0,4],
  [4,0,0,2,2,0,0,0,0,1,0,0,0,0,2,2,0,0,0,4],
  [4,0,0,2,2,4,0,0,0,1,0,0,0,4,2,2,0,0,0,4],
  [4,4,4,4,4,4,4,4,4,1,4,4,4,4,4,4,4,4,4,4],
];

// ── Build TileMaps ──
const villageMeta = buildTileMapMeta(VILLAGE_TILES);
const forestMeta = buildTileMapMeta(FOREST_TILES);
const caveMeta = buildTileMapMeta(CAVE_TILES);
const volcanoMeta = buildTileMapMeta(VOLCANO_TILES);

const VILLAGE_MAP: TileMap = { width: MAP_COLS, height: MAP_ROWS, tiles: VILLAGE_TILES, ...villageMeta };
const FOREST_MAP: TileMap = { width: MAP_COLS, height: MAP_ROWS, tiles: FOREST_TILES, ...forestMeta };
const CAVE_MAP: TileMap = { width: MAP_COLS, height: MAP_ROWS, tiles: CAVE_TILES, ...caveMeta };
const VOLCANO_MAP: TileMap = { width: MAP_COLS, height: MAP_ROWS, tiles: VOLCANO_TILES, ...volcanoMeta };

// ── NPC Definitions ──
const VILLAGE_NPCS: NPC[] = [
  {
    id: "village_elder", name: "村长", x: 3, y: 5,
    dialogs: [
      { text: "欢迎来到新手村！这里是你冒险的起点。" },
      { text: "村外的草丛里有野生宠物出没，小心行事。" },
      { text: "向北穿过森林，可以到达神秘的洞穴。" },
    ],
  },
  {
    id: "village_healer", name: "治疗师", x: 15, y: 5,
    dialogs: [
      { text: "你的宠物看起来需要休息一下。" },
      { text: "我可以帮你恢复宠物的体力，随时来找我吧！" },
    ],
  },
  {
    id: "village_merchant", name: "商人", x: 9, y: 7,
    dialogs: [
      { text: "欢迎光临！我这里有各种道具出售。" },
      { text: "捕捉球和回复药水是冒险必备品哦。" },
      { text: "祝你旅途顺利！" },
    ],
  },
];

const FOREST_NPCS: NPC[] = [
  {
    id: "forest_ranger", name: "森林守卫", x: 5, y: 3,
    dialogs: [
      { text: "这片森林里栖息着许多草属性和火属性的宠物。" },
      { text: "深处的草丛里偶尔能遇到稀有宠物。" },
      { text: "小心别迷路了，沿着道路走就不会有问题。" },
    ],
  },
  {
    id: "forest_trainer", name: "训练师小明", x: 14, y: 7,
    dialogs: [
      { text: "嘿！你也是宠物训练师吗？" },
      { text: "我在这片森林里训练了很久，想和我切磋一下吗？" },
      { text: "击败我的话，我会告诉你通往洞穴的秘密通道！" },
    ],
    questId: "defeat_forest_trainer",
  },
];

const CAVE_NPCS: NPC[] = [
  {
    id: "cave_explorer", name: "探险家", x: 3, y: 3,
    dialogs: [
      { text: "这个洞穴里有很多电属性和暗属性的宠物。" },
      { text: "越往深处走，遇到的宠物就越强。" },
      { text: "听说洞穴的尽头连接着一座火山……" },
    ],
  },
  {
    id: "cave_miner", name: "矿工老张", x: 16, y: 7,
    dialogs: [
      { text: "我在这里挖矿已经很多年了。" },
      { text: "有时候会挖到一些稀有的宝石，可以用来强化宠物。" },
    ],
  },
];

const VOLCANO_NPCS: NPC[] = [
  {
    id: "volcano_sage", name: "火山贤者", x: 5, y: 6,
    dialogs: [
      { text: "你竟然到达了火山区域，真是了不起！" },
      { text: "这里是最危险的地方，火属性和暗属性的宠物非常强大。" },
      { text: "传说中的凤凰雏就栖息在这座火山的深处。" },
    ],
  },
  {
    id: "volcano_guardian", name: "火山守护者", x: 14, y: 8,
    dialogs: [
      { text: "我守护这座火山已经数百年了。" },
      { text: "只有真正的强者才能征服这里的宠物。" },
      { text: "证明你的实力吧，年轻的训练师！" },
    ],
  },
];

// ── Portal Connections ──
// village ↔ forest: village south exit → forest north entrance, and vice versa
// forest ↔ cave: forest south exit → cave north entrance, and vice versa
// cave ↔ volcano: cave south exit → volcano north entrance, and vice versa

const VILLAGE_PORTALS: Portal[] = [
  { x: 9, y: 14, targetArea: "forest", targetX: 9, targetY: 1 },
];

const FOREST_PORTALS: Portal[] = [
  { x: 9, y: 0, targetArea: "village", targetX: 9, targetY: 13 },
  { x: 9, y: 14, targetArea: "cave", targetX: 9, targetY: 1 },
];

const CAVE_PORTALS: Portal[] = [
  { x: 9, y: 0, targetArea: "forest", targetX: 9, targetY: 13 },
  { x: 9, y: 14, targetArea: "volcano", targetX: 9, targetY: 1 },
];

const VOLCANO_PORTALS: Portal[] = [
  { x: 9, y: 0, targetArea: "cave", targetX: 9, targetY: 13 },
];

// ── Pet Distribution Tables ──
// village: common grass/water pets (low level area)
const VILLAGE_PET_TABLE: PetEncounter[] = [
  { petId: "sproutling", weight: 35 },
  { petId: "aqua_frog", weight: 35 },
  { petId: "fire_pup", weight: 20 },
  { petId: "spark_mouse", weight: 10 },
];

// forest: grass/fire pets
const FOREST_PET_TABLE: PetEncounter[] = [
  { petId: "sproutling", weight: 25 },
  { petId: "mushroom", weight: 20 },
  { petId: "fire_pup", weight: 25 },
  { petId: "magma_lizard", weight: 15 },
  { petId: "shadow_cat", weight: 10 },
  { petId: "phoenix_chick", weight: 5 },
];

// cave: electric/dark pets
const CAVE_PET_TABLE: PetEncounter[] = [
  { petId: "spark_mouse", weight: 30 },
  { petId: "crystal_bat", weight: 15 },
  { petId: "shadow_cat", weight: 25 },
  { petId: "ghost_wisp", weight: 15 },
  { petId: "mushroom", weight: 10 },
  { petId: "coral_shell", weight: 5 },
];

// volcano: fire/dark pets (high level area)
const VOLCANO_PET_TABLE: PetEncounter[] = [
  { petId: "magma_lizard", weight: 25 },
  { petId: "fire_pup", weight: 15 },
  { petId: "shadow_cat", weight: 20 },
  { petId: "ghost_wisp", weight: 20 },
  { petId: "phoenix_chick", weight: 10 },
  { petId: "crystal_bat", weight: 10 },
];

// ── Assembled Map Areas ──
export const MAP_AREAS: MapArea[] = [
  {
    id: "village",
    name: "新手村",
    tileMap: VILLAGE_MAP,
    npcs: VILLAGE_NPCS,
    portals: VILLAGE_PORTALS,
    petTable: VILLAGE_PET_TABLE,
  },
  {
    id: "forest",
    name: "森林",
    tileMap: FOREST_MAP,
    npcs: FOREST_NPCS,
    portals: FOREST_PORTALS,
    petTable: FOREST_PET_TABLE,
  },
  {
    id: "cave",
    name: "洞穴",
    tileMap: CAVE_MAP,
    npcs: CAVE_NPCS,
    portals: CAVE_PORTALS,
    petTable: CAVE_PET_TABLE,
  },
  {
    id: "volcano",
    name: "火山",
    tileMap: VOLCANO_MAP,
    npcs: VOLCANO_NPCS,
    portals: VOLCANO_PORTALS,
    petTable: VOLCANO_PET_TABLE,
  },
];

/** Helper: get a MapArea by id */
export function getMapArea(areaId: string): MapArea | undefined {
  return MAP_AREAS.find(a => a.id === areaId);
}

/** Area level ranges for wild pet generation */
export const AREA_LEVEL_RANGE: Record<string, { min: number; max: number }> = {
  village: { min: 2, max: 5 },
  forest: { min: 4, max: 8 },
  cave: { min: 7, max: 12 },
  volcano: { min: 10, max: 16 },
};

// ─── Quest Data ──────────────────────────────────────────

export const QUESTS: Quest[] = [
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
export function renderMap(
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
export interface BattleButton {
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
export function buildBattleButtons(battle: BattleState): BattleButton[] {
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
export function renderBattle(
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
export interface BattleParticle {
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
export interface BattleAnimState {
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
export function createBattleParticles(type: PetType, targetX: number, targetY: number): BattleParticle[] {
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
export function renderBattleAnimation(
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
export function detectBattleButtonClick(
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
export interface BattleActionResult {
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
export function selectEnemySkill(enemy: Pet): Skill {
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
export function executeAttack(
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
export function processBattleAction(
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

  const [gamePhase, setGamePhase] = useState<GameState["phase"]>("explore");
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
