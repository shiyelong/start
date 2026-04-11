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

