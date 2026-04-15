"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import {
  ChevronLeft, Volume2, VolumeX, Swords, Shield, Heart,
  Zap, Star, Package, User, TreePine, Castle, Skull,
  Play, RotateCcw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Trophy, Crosshair, Flame, Wind
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "pixel-rpg";
const TILE = 32;
const MAP_W = 16, MAP_H = 12;
const CW = MAP_W * TILE, CH = MAP_H * TILE;
const PRIMARY = "#3ea6ff", BG = "#0f0f0f";
const FONT = "monospace";
const FPS = 60;

// ─── Types ───────────────────────────────────────────────────────────────────
type Difficulty = "easy" | "normal" | "hard";
type Screen = "title" | "explore" | "combat" | "inventory" | "skills" | "dialogue" | "gameover" | "victory";
type Area = "village" | "forest" | "dungeon";
type SkillBranch = "warrior" | "mage" | "rogue";
type Direction = "up" | "down" | "left" | "right";

interface Stats {
  hp: number; maxHp: number; mp: number; maxMp: number;
  atk: number; def: number; spd: number; crit: number;
  xp: number; xpNext: number; level: number; gold: number;
  skillPoints: number;
}

interface Equipment { weapon: Item | null; armor: Item | null; accessory: Item | null; }

interface Item {
  id: string; name: string; type: "weapon" | "armor" | "accessory" | "potion" | "mpPotion";
  atk?: number; def?: number; spd?: number; crit?: number;
  heal?: number; mpHeal?: number; desc: string;
}

interface Skill {
  id: string; name: string; branch: SkillBranch;
  cost: number; mpCost: number; damage: number;
  effect?: string; unlocked: boolean; tier: number; desc: string;
}

interface Enemy {
  name: string; hp: number; maxHp: number; atk: number; def: number;
  spd: number; xpReward: number; goldReward: number;
  isBoss: boolean; color: string; drops: Item[];
  pattern?: number; poisoned?: number; stunned?: boolean; slowed?: boolean;
}

interface NPC { x: number; y: number; name: string; lines: string[]; color: string; }
interface Chest { x: number; y: number; opened: boolean; item: Item; }
interface MapTile { walkable: boolean; type: "grass" | "path" | "wall" | "water" | "floor" | "door" | "tree" | "rock"; }

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface DamagePopup { x: number; y: number; text: string; life: number; color: string; }

interface CombatState {
  enemy: Enemy; turn: "player" | "enemy"; log: string[];
  animating: boolean; selectedAction: number;
  skillSelect: boolean; itemSelect: boolean; fled: boolean;
}

// ─── Difficulty Scaling ──────────────────────────────────────────────────────
const DIFF_SCALE: Record<Difficulty, number> = { easy: 0.7, normal: 1.0, hard: 1.4 };
const DIFF_LABELS: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };

// ─── Items Database (Chinese names) ──────────────────────────────────────────
const ITEMS: Record<string, Item> = {
  woodSword:    { id: "woodSword",    name: "木剑",     type: "weapon",    atk: 3,  desc: "基础木制短剑" },
  ironSword:    { id: "ironSword",    name: "铁剑",     type: "weapon",    atk: 6,  desc: "坚固的铁制长剑" },
  flameBlade:   { id: "flameBlade",   name: "炎之刃",   type: "weapon",    atk: 10, crit: 5, desc: "燃烧着内焰的魔剑" },
  shadowDagger: { id: "shadowDagger", name: "暗影匕首", type: "weapon",    atk: 8,  spd: 3, crit: 8, desc: "暗杀者的利器" },
  leatherArmor: { id: "leatherArmor", name: "皮甲",     type: "armor",     def: 3,  desc: "基础皮革护甲" },
  chainMail:    { id: "chainMail",    name: "锁子甲",   type: "armor",     def: 6,  desc: "环环相扣的金属甲" },
  plateArmor:   { id: "plateArmor",   name: "板甲",     type: "armor",     def: 10, desc: "厚重的全身板甲" },
  speedRing:    { id: "speedRing",    name: "疾风戒",   type: "accessory", spd: 5,  desc: "提升敏捷的魔法戒指" },
  critAmulet:   { id: "critAmulet",   name: "暴击护符", type: "accessory", crit: 10, desc: "提升暴击率的护符" },
  lifeGem:      { id: "lifeGem",      name: "生命宝石", type: "accessory", def: 3, spd: 2, desc: "蕴含生命力的宝石" },
  hpPotion:     { id: "hpPotion",     name: "血瓶",     type: "potion",    heal: 30, desc: "恢复30点生命" },
  mpPotion:     { id: "mpPotion",     name: "蓝瓶",     type: "mpPotion",  mpHeal: 20, desc: "恢复20点魔力" },
  hiPotion:     { id: "hiPotion",     name: "高级血瓶", type: "potion",    heal: 80, desc: "恢复80点生命" },
  hiMpPotion:   { id: "hiMpPotion",   name: "高级蓝瓶", type: "mpPotion",  mpHeal: 50, desc: "恢复50点魔力" },
};

// ─── Skills Database (Chinese) ───────────────────────────────────────────────
function makeSkills(): Skill[] {
  return [
    { id: "powerStrike", name: "猛力斩",   branch: "warrior", cost: 1, mpCost: 5,  damage: 15, tier: 1, unlocked: false, desc: "强力物理攻击" },
    { id: "shieldBash",  name: "盾击",     branch: "warrior", cost: 1, mpCost: 8,  damage: 10, effect: "stun", tier: 2, unlocked: false, desc: "击晕敌人一回合" },
    { id: "warCry",      name: "战吼",     branch: "warrior", cost: 1, mpCost: 6,  damage: 8,  effect: "atkUp", tier: 2, unlocked: false, desc: "提升自身攻击力" },
    { id: "berserk",     name: "狂暴",     branch: "warrior", cost: 2, mpCost: 12, damage: 25, tier: 3, unlocked: false, desc: "毁灭性的暴怒一击" },
    { id: "fireball",    name: "火球术",   branch: "mage",    cost: 1, mpCost: 8,  damage: 20, tier: 1, unlocked: false, desc: "释放火焰弹" },
    { id: "iceSpear",    name: "冰矛",     branch: "mage",    cost: 1, mpCost: 10, damage: 18, effect: "slow", tier: 2, unlocked: false, desc: "冰冻之矛减速敌人" },
    { id: "heal",        name: "治愈术",   branch: "mage",    cost: 1, mpCost: 12, damage: -30, tier: 2, unlocked: false, desc: "恢复30点生命" },
    { id: "thunder",     name: "雷霆",     branch: "mage",    cost: 2, mpCost: 15, damage: 35, tier: 3, unlocked: false, desc: "召唤天雷轰击" },
    { id: "quickSlash",  name: "疾风斩",   branch: "rogue",   cost: 1, mpCost: 4,  damage: 12, tier: 1, unlocked: false, desc: "快速双重斩击" },
    { id: "poisonDart",  name: "毒镖",     branch: "rogue",   cost: 1, mpCost: 6,  damage: 8,  effect: "poison", tier: 2, unlocked: false, desc: "使敌人中毒" },
    { id: "smokeScreen",name: "烟雾弹",   branch: "rogue",   cost: 1, mpCost: 7,  damage: 0,  effect: "evade", tier: 2, unlocked: false, desc: "提升闪避率" },
    { id: "assassinate", name: "暗杀",     branch: "rogue",   cost: 2, mpCost: 14, damage: 30, tier: 3, unlocked: false, desc: "致命暗杀一击" },
  ];
}

// ─── Enemy Factories ─────────────────────────────────────────────────────────
const sc = (v: number, s: number) => Math.floor(v * s);
function makeSlime(s: number): Enemy {
  return { name: "史莱姆", hp: sc(15,s), maxHp: sc(15,s), atk: sc(4,s), def: sc(2,s), spd: 3, xpReward: 8, goldReward: 5, isBoss: false, color: "#2ed573", drops: [ITEMS.hpPotion] };
}
function makeGoblin(s: number): Enemy {
  return { name: "哥布林", hp: sc(25,s), maxHp: sc(25,s), atk: sc(7,s), def: sc(3,s), spd: 5, xpReward: 15, goldReward: 10, isBoss: false, color: "#ff9f43", drops: [ITEMS.mpPotion] };
}
function makeWolf(s: number): Enemy {
  return { name: "灰狼", hp: sc(30,s), maxHp: sc(30,s), atk: sc(9,s), def: sc(4,s), spd: 7, xpReward: 20, goldReward: 12, isBoss: false, color: "#a0a0a0", drops: [ITEMS.hpPotion, ITEMS.ironSword] };
}
function makeSkeleton(s: number): Enemy {
  return { name: "骷髅兵", hp: sc(35,s), maxHp: sc(35,s), atk: sc(10,s), def: sc(6,s), spd: 4, xpReward: 25, goldReward: 15, isBoss: false, color: "#dfe6e9", drops: [ITEMS.chainMail, ITEMS.mpPotion] };
}
function makeDarkKnight(s: number): Enemy {
  return { name: "暗黑骑士", hp: sc(45,s), maxHp: sc(45,s), atk: sc(12,s), def: sc(8,s), spd: 5, xpReward: 35, goldReward: 20, isBoss: false, color: "#6c5ce7", drops: [ITEMS.hiPotion, ITEMS.shadowDagger] };
}
function makeDragonLord(s: number): Enemy {
  return { name: "龙王", hp: sc(200,s), maxHp: sc(200,s), atk: sc(20,s), def: sc(12,s), spd: 6, xpReward: 300, goldReward: 150, isBoss: true, color: "#e74c3c", drops: [ITEMS.plateArmor, ITEMS.flameBlade, ITEMS.critAmulet], pattern: 0 };
}

// ─── Map Generation ──────────────────────────────────────────────────────────
const T = (type: MapTile["type"], walkable = true): MapTile => ({ type, walkable });

function genVillage(): MapTile[][] {
  const m: MapTile[][] = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => T("grass")));
  // paths
  for (let x = 0; x < MAP_W; x++) { m[6][x] = T("path"); m[5][x] = T("path"); }
  for (let y = 0; y < MAP_H; y++) { m[y][8] = T("path"); }
  // buildings (walls)
  for (let x = 2; x <= 5; x++) for (let y = 2; y <= 4; y++) m[y][x] = T("wall", false);
  for (let x = 10; x <= 13; x++) for (let y = 2; y <= 4; y++) m[y][x] = T("wall", false);
  // doors
  m[4][3] = T("door"); m[4][11] = T("door");
  // water
  for (let x = 0; x <= 1; x++) for (let y = 9; y <= 11; y++) m[y][x] = T("water", false);
  // trees
  m[0][0] = T("tree", false); m[0][15] = T("tree", false); m[11][15] = T("tree", false);
  m[1][7] = T("tree", false); m[8][3] = T("tree", false); m[9][12] = T("tree", false);
  // exit to forest (right edge)
  m[6][15] = T("door");
  return m;
}

function genForest(): MapTile[][] {
  const m: MapTile[][] = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => T("grass")));
  // dense trees
  const treePos = [[0,0],[0,3],[0,7],[0,11],[0,15],[1,1],[1,5],[1,9],[1,13],[2,3],[2,7],[2,11],
    [3,0],[3,5],[3,14],[4,2],[4,9],[4,13],[5,0],[5,6],[5,11],[7,1],[7,5],[7,10],[7,14],
    [8,3],[8,8],[8,12],[9,0],[9,6],[9,14],[10,2],[10,9],[10,13],[11,1],[11,5],[11,11],[11,15]];
  for (const [y,x] of treePos) if (y < MAP_H && x < MAP_W) m[y][x] = T("tree", false);
  // path through forest
  for (let x = 0; x < MAP_W; x++) m[6][x] = T("path");
  for (let y = 3; y <= 9; y++) m[y][8] = T("path");
  // rocks
  m[3][3] = T("rock", false); m[9][12] = T("rock", false);
  // exit left (back to village)
  m[6][0] = T("door");
  // exit right (to dungeon)
  m[6][15] = T("door");
  return m;
}

function genDungeon(): MapTile[][] {
  const m: MapTile[][] = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => T("wall", false)));
  // carve rooms and corridors
  // Room 1 (entrance)
  for (let x = 1; x <= 5; x++) for (let y = 4; y <= 8; y++) m[y][x] = T("floor");
  // Corridor
  for (let x = 5; x <= 10; x++) m[6][x] = T("floor");
  // Room 2 (middle)
  for (let x = 7; x <= 10; x++) for (let y = 2; y <= 5; y++) m[y][x] = T("floor");
  // Corridor to boss
  for (let y = 2; y <= 6; y++) m[y][10] = T("floor");
  for (let x = 10; x <= 14; x++) m[6][x] = T("floor");
  // Boss room
  for (let x = 11; x <= 14; x++) for (let y = 3; y <= 9; y++) m[y][x] = T("floor");
  // entrance door
  m[6][1] = T("door");
  return m;
}

// ─── Area Data ───────────────────────────────────────────────────────────────
function getAreaData(area: Area, diff: number): { tiles: MapTile[][]; npcs: NPC[]; chests: Chest[]; enemies: (() => Enemy)[]; encounterRate: number; bgColor: string; label: string; } {
  switch (area) {
    case "village": return {
      tiles: genVillage(), bgColor: "#1a3a1a", label: "村庄",
      npcs: [
        { x: 3, y: 5, name: "村长", lines: ["欢迎来到和平村！", "东边的森林里有怪物出没...", "穿过森林就是地牢，龙王就在那里！", "做好准备再出发吧。"], color: "#f1c40f" },
        { x: 11, y: 5, name: "商人", lines: ["我这里有好东西卖哦！", "可惜现在商店还没开张...", "打怪掉落的装备也很不错！"], color: "#e67e22" },
        { x: 8, y: 3, name: "战士", lines: ["我曾经也是一名冒险者...", "记住，战士的技能靠力量取胜！", "法师的魔法虽强但耗蓝多。", "盗贼速度快，暴击高。"], color: "#3498db" },
      ],
      chests: [
        { x: 14, y: 10, opened: false, item: ITEMS.hpPotion },
        { x: 1, y: 1, opened: false, item: ITEMS.mpPotion },
      ],
      enemies: [], encounterRate: 0,
    };
    case "forest": return {
      tiles: genForest(), bgColor: "#0d2a0d", label: "森林",
      npcs: [
        { x: 8, y: 3, name: "猎人", lines: ["小心这片森林的怪物！", "灰狼很凶猛，注意防御。", "往东走就是地牢入口。"], color: "#27ae60" },
      ],
      chests: [
        { x: 4, y: 4, opened: false, item: ITEMS.ironSword },
        { x: 12, y: 8, opened: false, item: ITEMS.leatherArmor },
        { x: 2, y: 10, opened: false, item: ITEMS.hiPotion },
      ],
      enemies: [() => makeSlime(diff), () => makeGoblin(diff), () => makeWolf(diff)],
      encounterRate: 0.12,
    };
    case "dungeon": return {
      tiles: genDungeon(), bgColor: "#0a0a1a", label: "地牢",
      npcs: [],
      chests: [
        { x: 9, y: 3, opened: false, item: ITEMS.chainMail },
        { x: 7, y: 4, opened: false, item: ITEMS.hiMpPotion },
        { x: 14, y: 8, opened: false, item: ITEMS.speedRing },
      ],
      enemies: [() => makeSkeleton(diff), () => makeDarkKnight(diff)],
      encounterRate: 0.18,
    };
  }
}

// ─── Audio Manager ───────────────────────────────────────────────────────────
class AudioMgr {
  private ctx: AudioContext | null = null;
  muted = false;
  private init() { if (!this.ctx) this.ctx = new AudioContext(); }
  play(freq: number, dur: number, type: OscillatorType = "square", vol = 0.08) {
    if (this.muted) return;
    this.init();
    const c = this.ctx!;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  hit()    { this.play(200, 0.1, "sawtooth", 0.1); }
  crit()   { this.play(400, 0.15, "sawtooth", 0.12); this.play(600, 0.1, "square", 0.08); }
  magic()  { this.play(500, 0.2, "sine", 0.08); this.play(700, 0.15, "sine", 0.06); }
  heal()   { this.play(400, 0.15, "sine", 0.06); this.play(500, 0.15, "sine", 0.06); this.play(600, 0.15, "sine", 0.06); }
  chest()  { this.play(500, 0.1, "square", 0.06); this.play(700, 0.1, "square", 0.06); }
  levelUp(){ this.play(400, 0.15, "square", 0.08); this.play(500, 0.15, "square", 0.08); this.play(600, 0.15, "square", 0.08); this.play(800, 0.2, "square", 0.1); }
  defeat() { this.play(300, 0.3, "sawtooth", 0.08); this.play(200, 0.3, "sawtooth", 0.08); }
  victory(){ this.play(500, 0.15, "square", 0.08); this.play(600, 0.15, "square", 0.08); this.play(700, 0.15, "square", 0.08); this.play(800, 0.3, "square", 0.1); }
  step()   { this.play(100, 0.05, "triangle", 0.03); }
  flee()   { this.play(300, 0.1, "triangle", 0.06); this.play(250, 0.1, "triangle", 0.06); }
  boss()   { this.play(150, 0.3, "sawtooth", 0.1); this.play(100, 0.4, "sawtooth", 0.08); }
}

// ─── Pixel Drawing Helpers ───────────────────────────────────────────────────
function drawPixelChar(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Direction, frame: number) {
  const s = TILE;
  // body
  ctx.fillStyle = "#4a90d9";
  ctx.fillRect(x + 8, y + 8, 16, 14);
  // head
  ctx.fillStyle = "#ffd5a0";
  ctx.fillRect(x + 10, y + 2, 12, 10);
  // eyes
  ctx.fillStyle = "#222";
  if (dir === "left") { ctx.fillRect(x + 11, y + 5, 2, 2); }
  else if (dir === "right") { ctx.fillRect(x + 19, y + 5, 2, 2); }
  else { ctx.fillRect(x + 12, y + 5, 2, 2); ctx.fillRect(x + 18, y + 5, 2, 2); }
  // legs (animated)
  ctx.fillStyle = "#3a3a8a";
  const legOff = Math.sin(frame * 0.3) * 2;
  ctx.fillRect(x + 10, y + 22, 5, 8 + legOff);
  ctx.fillRect(x + 17, y + 22, 5, 8 - legOff);
  // weapon hint
  ctx.fillStyle = "#aaa";
  if (dir === "right") ctx.fillRect(x + 26, y + 12, 4, 10);
  else if (dir === "left") ctx.fillRect(x + 2, y + 12, 4, 10);
}

function drawPixelEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, isBoss: boolean, frame: number) {
  const sz = isBoss ? 80 : 48;
  const ox = x - sz / 2, oy = y - sz / 2 + Math.sin(frame * 0.05) * 3;
  // body
  ctx.fillStyle = color;
  ctx.fillRect(ox + sz * 0.15, oy + sz * 0.2, sz * 0.7, sz * 0.6);
  // head
  ctx.fillStyle = color;
  ctx.fillRect(ox + sz * 0.25, oy, sz * 0.5, sz * 0.35);
  // eyes
  ctx.fillStyle = "#fff";
  ctx.fillRect(ox + sz * 0.3, oy + sz * 0.1, sz * 0.12, sz * 0.1);
  ctx.fillRect(ox + sz * 0.55, oy + sz * 0.1, sz * 0.12, sz * 0.1);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(ox + sz * 0.33, oy + sz * 0.12, sz * 0.06, sz * 0.06);
  ctx.fillRect(ox + sz * 0.58, oy + sz * 0.12, sz * 0.06, sz * 0.06);
  if (isBoss) {
    // horns
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(ox + sz * 0.15, oy - sz * 0.1, sz * 0.1, sz * 0.15);
    ctx.fillRect(ox + sz * 0.75, oy - sz * 0.1, sz * 0.1, sz * 0.15);
    // wings
    ctx.fillStyle = color + "88";
    ctx.fillRect(ox - sz * 0.15, oy + sz * 0.15, sz * 0.2, sz * 0.4);
    ctx.fillRect(ox + sz * 0.95, oy + sz * 0.15, sz * 0.2, sz * 0.4);
  }
}

const TILE_COLORS: Record<MapTile["type"], string> = {
  grass: "#1a3a1a", path: "#3a3020", wall: "#4a4a4a", water: "#1a2a5a",
  floor: "#2a2a3a", door: "#6a4a2a", tree: "#0a2a0a", rock: "#5a5a5a",
};

function drawTile(ctx: CanvasRenderingContext2D, tile: MapTile, x: number, y: number) {
  ctx.fillStyle = TILE_COLORS[tile.type];
  ctx.fillRect(x, y, TILE, TILE);
  // detail
  if (tile.type === "tree") {
    ctx.fillStyle = "#4a2a0a"; ctx.fillRect(x + 13, y + 20, 6, 12);
    ctx.fillStyle = "#1a5a1a"; ctx.fillRect(x + 6, y + 4, 20, 18);
    ctx.fillStyle = "#2a7a2a"; ctx.fillRect(x + 10, y + 2, 12, 8);
  } else if (tile.type === "rock") {
    ctx.fillStyle = "#7a7a7a"; ctx.fillRect(x + 4, y + 8, 24, 20);
    ctx.fillStyle = "#8a8a8a"; ctx.fillRect(x + 8, y + 6, 16, 8);
  } else if (tile.type === "water") {
    ctx.fillStyle = "#2a3a7a"; ctx.fillRect(x + 2, y + 10, 28, 4);
    ctx.fillStyle = "#3a4a8a"; ctx.fillRect(x + 8, y + 20, 20, 3);
  } else if (tile.type === "wall") {
    ctx.fillStyle = "#5a5a5a"; ctx.fillRect(x, y, TILE, 4);
    ctx.fillStyle = "#3a3a3a"; ctx.fillRect(x, y + TILE - 4, TILE, 4);
    ctx.strokeStyle = "#555"; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
  } else if (tile.type === "door") {
    ctx.fillStyle = "#8a6a3a"; ctx.fillRect(x + 8, y + 4, 16, 24);
    ctx.fillStyle = "#aa8a4a"; ctx.fillRect(x + 10, y + 6, 12, 20);
    ctx.fillStyle = "#ffd700"; ctx.fillRect(x + 20, y + 16, 3, 3);
  } else if (tile.type === "grass") {
    ctx.fillStyle = "#1e4a1e";
    ctx.fillRect(x + 4, y + 24, 2, 6); ctx.fillRect(x + 14, y + 22, 2, 8);
    ctx.fillRect(x + 24, y + 26, 2, 4);
  } else if (tile.type === "floor") {
    ctx.fillStyle = "#333348";
    ctx.fillRect(x, y, 1, TILE); ctx.fillRect(x, y, TILE, 1);
  }
}

function drawNPC(ctx: CanvasRenderingContext2D, npc: NPC, frame: number) {
  const px = npc.x * TILE, py = npc.y * TILE;
  ctx.fillStyle = npc.color;
  ctx.fillRect(px + 8, py + 4, 16, 12);
  ctx.fillStyle = "#ffd5a0";
  ctx.fillRect(px + 10, py + 0, 12, 8);
  ctx.fillStyle = "#222";
  ctx.fillRect(px + 12, py + 3, 2, 2); ctx.fillRect(px + 18, py + 3, 2, 2);
  // bob
  const bob = Math.sin(frame * 0.03) * 1;
  ctx.fillStyle = npc.color;
  ctx.fillRect(px + 10, py + 16, 5, 10 + bob);
  ctx.fillRect(px + 17, py + 16, 5, 10 - bob);
  // name tag
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px " + FONT;
  ctx.textAlign = "center";
  ctx.fillText(npc.name, px + 16, py - 2);
}

function drawChest(ctx: CanvasRenderingContext2D, chest: Chest) {
  const px = chest.x * TILE, py = chest.y * TILE;
  ctx.fillStyle = chest.opened ? "#5a4a2a" : "#c8a84a";
  ctx.fillRect(px + 4, py + 10, 24, 16);
  ctx.fillStyle = chest.opened ? "#4a3a1a" : "#a08030";
  ctx.fillRect(px + 4, py + 6, 24, 8);
  if (!chest.opened) {
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(px + 14, py + 14, 4, 4);
  }
}

// ─── Initial State ───────────────────────────────────────────────────────────
function initStats(): Stats {
  return { hp: 100, maxHp: 100, mp: 30, maxMp: 30, atk: 8, def: 4, spd: 5, crit: 5, xp: 0, xpNext: 30, level: 1, gold: 0, skillPoints: 0 };
}

function calcTotalStats(base: Stats, eq: Equipment): { atk: number; def: number; spd: number; crit: number } {
  let atk = base.atk, def = base.def, spd = base.spd, crit = base.crit;
  for (const item of [eq.weapon, eq.armor, eq.accessory]) {
    if (item) { atk += item.atk || 0; def += item.def || 0; spd += item.spd || 0; crit += item.crit || 0; }
  }
  return { atk, def, spd, crit };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function PixelRPGPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef(new AudioMgr());
  const frameRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const moveTimerRef = useRef(0);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [area, setArea] = useState<Area>("village");
  const [playerX, setPlayerX] = useState(8);
  const [playerY, setPlayerY] = useState(8);
  const [playerDir, setPlayerDir] = useState<Direction>("down");
  const [stats, setStats] = useState<Stats>(initStats);
  const [equipment, setEquipment] = useState<Equipment>({ weapon: null, armor: null, accessory: null });
  const [inventory, setInventory] = useState<Item[]>([ITEMS.hpPotion, ITEMS.hpPotion, ITEMS.mpPotion]);
  const [skills, setSkills] = useState<Skill[]>(makeSkills);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [dialogueNpc, setDialogueNpc] = useState<NPC | null>(null);
  const [dialogueLine, setDialogueLine] = useState(0);
  const [bossDefeated, setBossDefeated] = useState(false);
  const [score, setScore] = useState(0);
  const [enemiesKilled, setEnemiesKilled] = useState(0);
  const [chestsOpened, setChestsOpened] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [popups, setPopups] = useState<DamagePopup[]>([]);
  const [muted, setMuted] = useState(false);
  const [showInv, setShowInv] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [combatSkillIdx, setCombatSkillIdx] = useState(0);
  const [combatItemIdx, setCombatItemIdx] = useState(0);
  const [atkBuff, setAtkBuff] = useState(0);
  const [evadeBuff, setEvadeBuff] = useState(0);
  const [stepsToEncounter, setStepsToEncounter] = useState(8);
  const [areaChests, setAreaChests] = useState<Chest[]>([]);

  // Refs for game loop access
  const stateRef = useRef({ screen, area, playerX, playerY, playerDir, stats, equipment, inventory, skills, combat, dialogueNpc, dialogueLine, bossDefeated, score, enemiesKilled, chestsOpened, particles, popups, difficulty, showInv, showSkills, combatSkillIdx, combatItemIdx, atkBuff, evadeBuff, stepsToEncounter, areaChests });
  useEffect(() => {
    stateRef.current = { screen, area, playerX, playerY, playerDir, stats, equipment, inventory, skills, combat, dialogueNpc, dialogueLine, bossDefeated, score, enemiesKilled, chestsOpened, particles, popups, difficulty, showInv, showSkills, combatSkillIdx, combatItemIdx, atkBuff, evadeBuff, stepsToEncounter, areaChests };
  });

  // ─── Toggle mute ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setMuted(m => { audioRef.current.muted = !m; return !m; });
  }, []);

  // ─── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    setStats(initStats());
    setEquipment({ weapon: null, armor: null, accessory: null });
    setInventory([ITEMS.hpPotion, ITEMS.hpPotion, ITEMS.mpPotion]);
    setSkills(makeSkills());
    setArea("village");
    setPlayerX(8); setPlayerY(8);
    setPlayerDir("down");
    setCombat(null); setDialogueNpc(null); setDialogueLine(0);
    setBossDefeated(false); setScore(0); setEnemiesKilled(0); setChestsOpened(0);
    setParticles([]); setPopups([]);
    setShowInv(false); setShowSkills(false);
    setAtkBuff(0); setEvadeBuff(0);
    setStepsToEncounter(Math.floor(Math.random() * 6) + 4);
    const ad = getAreaData("village", DIFF_SCALE[diff]);
    setAreaChests(ad.chests);
    setScreen("explore");
  }, []);

  // ─── Area Transition ───────────────────────────────────────────────────────
  const changeArea = useCallback((newArea: Area, spawnX: number, spawnY: number) => {
    const diff = DIFF_SCALE[stateRef.current.difficulty];
    const ad = getAreaData(newArea, diff);
    setArea(newArea);
    setAreaChests(ad.chests);
    setPlayerX(spawnX); setPlayerY(spawnY);
    setStepsToEncounter(Math.floor(Math.random() * 6) + 4);
  }, []);

  // ─── Spawn Particles ──────────────────────────────────────────────────────
  const spawnParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const newP: Particle[] = Array.from({ length: count }, () => ({
      x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
      life: 30 + Math.random() * 20, maxLife: 50, color, size: 2 + Math.random() * 3,
    }));
    setParticles(p => [...p, ...newP]);
  }, []);

  const addPopup = useCallback((x: number, y: number, text: string, color: string) => {
    setPopups(p => [...p, { x, y, text, life: 40, color }]);
  }, []);

  // ─── Level Up ──────────────────────────────────────────────────────────────
  const checkLevelUp = useCallback((st: Stats): Stats => {
    let s = { ...st };
    while (s.xp >= s.xpNext) {
      s.xp -= s.xpNext;
      s.level++;
      s.xpNext = Math.floor(s.xpNext * 1.5);
      s.maxHp += 12; s.maxMp += 5; s.atk += 2; s.def += 1; s.spd += 1;
      s.hp = s.maxHp; s.mp = s.maxMp;
      s.skillPoints += 1;
      audioRef.current.levelUp();
    }
    return s;
  }, []);

  // ─── Combat System ─────────────────────────────────────────────────────────
  const startCombat = useCallback((enemy: Enemy) => {
    if (enemy.isBoss) audioRef.current.boss();
    setCombat({
      enemy: { ...enemy }, turn: "player", log: [`${enemy.name} 出现了！`],
      animating: false, selectedAction: 0, skillSelect: false, itemSelect: false, fled: false,
    });
    setCombatSkillIdx(0); setCombatItemIdx(0);
    setScreen("combat");
  }, []);

  const playerAttack = useCallback(() => {
    setCombat(prev => {
      if (!prev || prev.animating || prev.turn !== "player") return prev;
      const s = stateRef.current.stats;
      const eq = stateRef.current.equipment;
      const total = calcTotalStats(s, eq);
      const atk = total.atk + stateRef.current.atkBuff;
      const isCrit = Math.random() * 100 < total.crit;
      let dmg = Math.max(1, atk - prev.enemy.def + Math.floor(Math.random() * 4));
      if (isCrit) { dmg = Math.floor(dmg * 1.8); audioRef.current.crit(); }
      else audioRef.current.hit();
      const enemy = { ...prev.enemy, hp: Math.max(0, prev.enemy.hp - dmg) };
      const log = [...prev.log, `你${isCrit ? "暴击" : "攻击"}了${enemy.name}，造成 ${dmg} 点伤害！`];
      addPopup(CW * 0.65, CH * 0.35, `-${dmg}`, isCrit ? "#ffd700" : "#ff4757");
      spawnParticles(CW * 0.65, CH * 0.35, "#ff4757", 6);
      return { ...prev, enemy, log, turn: enemy.hp <= 0 ? "player" : "enemy", animating: true };
    });
    setTimeout(() => {
      setCombat(prev => {
        if (!prev) return prev;
        if (prev.enemy.hp <= 0) return prev; // handled in effect
        return { ...prev, animating: false };
      });
    }, 500);
  }, [addPopup, spawnParticles]);

  const playerUseSkill = useCallback((skill: Skill) => {
    setCombat(prev => {
      if (!prev || prev.animating || prev.turn !== "player") return prev;
      const s = stateRef.current.stats;
      if (s.mp < skill.mpCost) {
        return { ...prev, log: [...prev.log, "魔力不足！"] };
      }
      setStats(st => ({ ...st, mp: st.mp - skill.mpCost }));
      audioRef.current.magic();

      if (skill.damage < 0) {
        // heal
        const healAmt = Math.abs(skill.damage);
        setStats(st => ({ ...st, hp: Math.min(st.maxHp, st.hp + healAmt) }));
        audioRef.current.heal();
        addPopup(CW * 0.25, CH * 0.5, `+${healAmt}`, "#2ed573");
        spawnParticles(CW * 0.25, CH * 0.5, "#2ed573", 8);
        return { ...prev, log: [...prev.log, `你使用了${skill.name}，恢复了 ${healAmt} 点生命！`], turn: "enemy", animating: true, skillSelect: false };
      }

      const eq = stateRef.current.equipment;
      const total = calcTotalStats(s, eq);
      let dmg = Math.max(1, skill.damage + total.atk * 0.3 - prev.enemy.def * 0.5 + Math.floor(Math.random() * 5));
      dmg = Math.floor(dmg);
      const enemy = { ...prev.enemy, hp: Math.max(0, prev.enemy.hp - dmg) };

      // effects
      if (skill.effect === "stun") enemy.stunned = true;
      if (skill.effect === "slow") enemy.slowed = true;
      if (skill.effect === "poison") enemy.poisoned = 3;
      if (skill.effect === "atkUp") setAtkBuff(b => b + 5);
      if (skill.effect === "evade") setEvadeBuff(3);

      const log = [...prev.log, `你使用了${skill.name}，造成 ${dmg} 点伤害！`];
      if (skill.effect === "stun") log.push(`${enemy.name} 被击晕了！`);
      if (skill.effect === "poison") log.push(`${enemy.name} 中毒了！`);
      if (skill.effect === "slow") log.push(`${enemy.name} 被减速了！`);
      if (skill.effect === "atkUp") log.push("你的攻击力提升了！");
      if (skill.effect === "evade") log.push("你的闪避率提升了！");

      addPopup(CW * 0.65, CH * 0.35, `-${dmg}`, "#a855f7");
      spawnParticles(CW * 0.65, CH * 0.35, "#a855f7", 10);
      return { ...prev, enemy, log, turn: enemy.hp <= 0 ? "player" : "enemy", animating: true, skillSelect: false };
    });
    setTimeout(() => setCombat(prev => prev ? { ...prev, animating: false } : prev), 500);
  }, [addPopup, spawnParticles]);

  const playerUseItem = useCallback((item: Item, idx: number) => {
    setCombat(prev => {
      if (!prev || prev.animating || prev.turn !== "player") return prev;
      setInventory(inv => { const n = [...inv]; n.splice(idx, 1); return n; });
      if (item.type === "potion") {
        const healAmt = item.heal || 0;
        setStats(st => ({ ...st, hp: Math.min(st.maxHp, st.hp + healAmt) }));
        audioRef.current.heal();
        addPopup(CW * 0.25, CH * 0.5, `+${healAmt}`, "#2ed573");
        return { ...prev, log: [...prev.log, `你使用了${item.name}，恢复了 ${healAmt} 点生命！`], turn: "enemy", animating: true, itemSelect: false };
      } else {
        const healAmt = item.mpHeal || 0;
        setStats(st => ({ ...st, mp: Math.min(st.maxMp, st.mp + healAmt) }));
        audioRef.current.heal();
        addPopup(CW * 0.25, CH * 0.5, `+${healAmt}MP`, "#3ea6ff");
        return { ...prev, log: [...prev.log, `你使用了${item.name}，恢复了 ${healAmt} 点魔力！`], turn: "enemy", animating: true, itemSelect: false };
      }
    });
    setTimeout(() => setCombat(prev => prev ? { ...prev, animating: false } : prev), 500);
  }, [addPopup]);

  const playerFlee = useCallback(() => {
    setCombat(prev => {
      if (!prev || prev.animating || prev.turn !== "player") return prev;
      const s = stateRef.current.stats;
      const eq = stateRef.current.equipment;
      const total = calcTotalStats(s, eq);
      const chance = prev.enemy.isBoss ? 0.1 : 0.4 + total.spd * 0.02;
      if (Math.random() < chance) {
        audioRef.current.flee();
        return { ...prev, log: [...prev.log, "你成功逃跑了！"], fled: true, animating: true };
      }
      audioRef.current.hit();
      return { ...prev, log: [...prev.log, "逃跑失败！"], turn: "enemy", animating: true };
    });
    setTimeout(() => setCombat(prev => prev ? { ...prev, animating: false } : prev), 500);
  }, []);

  // ─── Enemy Turn ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!combat || combat.turn !== "enemy" || combat.animating || combat.enemy.hp <= 0 || combat.fled) return;
    const timer = setTimeout(() => {
      setCombat(prev => {
        if (!prev) return prev;
        const enemy = { ...prev.enemy };
        const log = [...prev.log];

        // poison tick
        if (enemy.poisoned && enemy.poisoned > 0) {
          const poisonDmg = Math.floor(enemy.maxHp * 0.05);
          enemy.hp = Math.max(0, enemy.hp - poisonDmg);
          enemy.poisoned--;
          log.push(`${enemy.name} 受到毒素伤害 ${poisonDmg}！`);
          if (enemy.hp <= 0) return { ...prev, enemy, log, turn: "player", animating: false };
        }

        // stunned skip
        if (enemy.stunned) {
          enemy.stunned = false;
          log.push(`${enemy.name} 处于眩晕状态，无法行动！`);
          return { ...prev, enemy, log, turn: "player", animating: false };
        }

        // evade check
        if (stateRef.current.evadeBuff > 0) {
          if (Math.random() < 0.4) {
            setEvadeBuff(b => b - 1);
            log.push(`你闪避了${enemy.name}的攻击！`);
            return { ...prev, enemy, log, turn: "player", animating: false };
          }
          setEvadeBuff(b => b - 1);
        }

        // boss special pattern
        let atkMult = 1;
        if (enemy.isBoss && enemy.pattern !== undefined) {
          enemy.pattern = (enemy.pattern + 1) % 4;
          if (enemy.pattern === 0) { atkMult = 1.5; log.push(`${enemy.name} 释放了龙息！`); }
          else if (enemy.pattern === 2) { atkMult = 0.5; log.push(`${enemy.name} 正在蓄力...`); }
          else if (enemy.pattern === 3) { atkMult = 2.0; log.push(`${enemy.name} 发动了毁灭之爪！`); }
        }

        const spdMod = enemy.slowed ? 0.7 : 1;
        const s = stateRef.current.stats;
        const eq = stateRef.current.equipment;
        const total = calcTotalStats(s, eq);
        let dmg = Math.max(1, Math.floor(enemy.atk * atkMult * spdMod) - total.def + Math.floor(Math.random() * 3));
        dmg = Math.max(1, dmg);

        audioRef.current.hit();
        addPopup(CW * 0.25, CH * 0.5, `-${dmg}`, "#ff4757");
        spawnParticles(CW * 0.25, CH * 0.5, "#ff6b6b", 5);
        log.push(`${enemy.name} 攻击了你，造成 ${dmg} 点伤害！`);

        setStats(st => {
          const newHp = Math.max(0, st.hp - dmg);
          if (newHp <= 0) {
            audioRef.current.defeat();
            setTimeout(() => setScreen("gameover"), 800);
          }
          return { ...st, hp: newHp };
        });

        return { ...prev, enemy, log, turn: "player", animating: false };
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [combat?.turn, combat?.animating, combat?.enemy.hp, combat?.fled, addPopup, spawnParticles]);

  // ─── Combat Victory ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!combat || combat.enemy.hp > 0 || combat.fled) return;
    const enemy = combat.enemy;
    const timer = setTimeout(() => {
      // rewards
      setStats(st => {
        let s = { ...st, xp: st.xp + enemy.xpReward, gold: st.gold + enemy.goldReward };
        s = checkLevelUp(s);
        return s;
      });
      setScore(sc => sc + enemy.xpReward * 10);
      setEnemiesKilled(k => k + 1);

      // drops
      if (enemy.drops.length > 0) {
        const drop = enemy.drops[Math.floor(Math.random() * enemy.drops.length)];
        setInventory(inv => [...inv, { ...drop }]);
        addPopup(CW / 2, CH / 2, `获得 ${drop.name}！`, "#ffd700");
      }

      audioRef.current.victory();

      if (enemy.isBoss) {
        setBossDefeated(true);
        setScreen("victory");
      } else {
        setScreen("explore");
        setCombat(null);
      }
      setAtkBuff(0); setEvadeBuff(0);
    }, 1000);
    return () => clearTimeout(timer);
  }, [combat?.enemy.hp, combat?.fled, checkLevelUp, addPopup]);

  // ─── Fled ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!combat?.fled) return;
    const timer = setTimeout(() => { setScreen("explore"); setCombat(null); setAtkBuff(0); setEvadeBuff(0); }, 600);
    return () => clearTimeout(timer);
  }, [combat?.fled]);

  // ─── Movement & Interaction ────────────────────────────────────────────────
  const tryMove = useCallback((dx: number, dy: number) => {
    const s = stateRef.current;
    if (s.screen !== "explore") return;
    const diff = DIFF_SCALE[s.difficulty];
    const ad = getAreaData(s.area, diff);
    const nx = s.playerX + dx, ny = s.playerY + dy;
    const dir: Direction = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
    setPlayerDir(dir);

    // area transitions
    if (s.area === "village" && nx >= MAP_W && ny === 6) { changeArea("forest", 1, 6); return; }
    if (s.area === "forest" && nx < 0 && ny === 6) { changeArea("village", 14, 6); return; }
    if (s.area === "forest" && nx >= MAP_W && ny === 6) { changeArea("dungeon", 1, 6); return; }
    if (s.area === "dungeon" && nx <= 0 && ny === 6) { changeArea("forest", 14, 6); return; }

    if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return;
    if (!ad.tiles[ny][nx].walkable) return;

    // NPC interaction
    for (const npc of ad.npcs) {
      if (npc.x === nx && npc.y === ny) {
        setDialogueNpc(npc); setDialogueLine(0); setScreen("dialogue");
        return;
      }
    }

    // Chest interaction
    const chestIdx = s.areaChests.findIndex(c => c.x === nx && c.y === ny && !c.opened);
    if (chestIdx >= 0) {
      const chest = s.areaChests[chestIdx];
      setAreaChests(ch => { const n = [...ch]; n[chestIdx] = { ...n[chestIdx], opened: true }; return n; });
      setInventory(inv => [...inv, { ...chest.item }]);
      setChestsOpened(c => c + 1);
      setScore(sc => sc + 50);
      audioRef.current.chest();
      addPopup(nx * TILE + 16, ny * TILE, `获得 ${chest.item.name}！`, "#ffd700");
      return;
    }

    setPlayerX(nx); setPlayerY(ny);
    audioRef.current.step();

    // Random encounter
    if (ad.encounterRate > 0 && ad.enemies.length > 0) {
      setStepsToEncounter(prev => {
        const next = prev - 1;
        if (next <= 0) {
          const factory = ad.enemies[Math.floor(Math.random() * ad.enemies.length)];
          const enemy = factory();
          startCombat(enemy);
          return Math.floor(Math.random() * 6) + 4;
        }
        return next;
      });
    }

    // Boss trigger in dungeon
    if (s.area === "dungeon" && nx >= 12 && ny >= 4 && ny <= 8 && !s.bossDefeated) {
      startCombat(makeDragonLord(diff));
    }
  }, [changeArea, startCombat, addPopup]);

  // ─── Keyboard Input ────────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      const s = stateRef.current;

      if (s.screen === "dialogue") {
        if (e.key === "Enter" || e.key === " ") {
          if (s.dialogueNpc && s.dialogueLine < s.dialogueNpc.lines.length - 1) {
            setDialogueLine(l => l + 1);
          } else {
            setDialogueNpc(null); setScreen("explore");
          }
        }
        return;
      }

      if (s.screen === "combat" && !s.combat?.animating && s.combat?.turn === "player") {
        if (s.combat.skillSelect) {
          const unlocked = s.skills.filter(sk => sk.unlocked);
          if (e.key === "Escape") setCombat(p => p ? { ...p, skillSelect: false } : p);
          else if (e.key === "ArrowUp" || e.key === "w") setCombatSkillIdx(i => Math.max(0, i - 1));
          else if (e.key === "ArrowDown" || e.key === "s") setCombatSkillIdx(i => Math.min(unlocked.length - 1, i + 1));
          else if (e.key === "Enter" || e.key === " ") { if (unlocked[stateRef.current.combatSkillIdx]) playerUseSkill(unlocked[stateRef.current.combatSkillIdx]); }
          return;
        }
        if (s.combat.itemSelect) {
          const usable = s.inventory.filter(it => it.type === "potion" || it.type === "mpPotion");
          if (e.key === "Escape") setCombat(p => p ? { ...p, itemSelect: false } : p);
          else if (e.key === "ArrowUp" || e.key === "w") setCombatItemIdx(i => Math.max(0, i - 1));
          else if (e.key === "ArrowDown" || e.key === "s") setCombatItemIdx(i => Math.min(usable.length - 1, i + 1));
          else if (e.key === "Enter" || e.key === " ") {
            const item = usable[stateRef.current.combatItemIdx];
            if (item) {
              const realIdx = s.inventory.indexOf(item);
              playerUseItem(item, realIdx);
            }
          }
          return;
        }
        // main combat menu
        if (e.key === "1" || (e.key === "Enter" && s.combat.selectedAction === 0)) playerAttack();
        else if (e.key === "2" || (e.key === "Enter" && s.combat.selectedAction === 1)) setCombat(p => p ? { ...p, skillSelect: true } : p);
        else if (e.key === "3" || (e.key === "Enter" && s.combat.selectedAction === 2)) setCombat(p => p ? { ...p, itemSelect: true } : p);
        else if (e.key === "4" || (e.key === "Enter" && s.combat.selectedAction === 3)) playerFlee();
        else if (e.key === "ArrowLeft" || e.key === "a") setCombat(p => p ? { ...p, selectedAction: Math.max(0, p.selectedAction - 1) } : p);
        else if (e.key === "ArrowRight" || e.key === "d") setCombat(p => p ? { ...p, selectedAction: Math.min(3, p.selectedAction + 1) } : p);
        return;
      }

      // explore shortcuts
      if (s.screen === "explore") {
        if (e.key === "i") setShowInv(v => !v);
        if (e.key === "k") setShowSkills(v => !v);
      }
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [tryMove, playerAttack, playerUseSkill, playerUseItem, playerFlee]);

  // ─── Movement polling (for held keys) ──────────────────────────────────────
  useEffect(() => {
    if (screen !== "explore") return;
    const interval = setInterval(() => {
      moveTimerRef.current++;
      if (moveTimerRef.current % 8 !== 0) return; // throttle movement
      const keys = keysRef.current;
      if (keys.has("arrowup") || keys.has("w")) tryMove(0, -1);
      else if (keys.has("arrowdown") || keys.has("s")) tryMove(0, 1);
      else if (keys.has("arrowleft") || keys.has("a")) tryMove(-1, 0);
      else if (keys.has("arrowright") || keys.has("d")) tryMove(1, 0);
    }, 1000 / FPS);
    return () => clearInterval(interval);
  }, [screen, tryMove]);

  // ─── Canvas Render Loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;

    const render = () => {
      frameRef.current++;
      const f = frameRef.current;
      const s = stateRef.current;
      ctx.imageSmoothingEnabled = false;

      if (s.screen === "explore") {
        const diff = DIFF_SCALE[s.difficulty];
        const ad = getAreaData(s.area, diff);
        // draw tiles
        for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) drawTile(ctx, ad.tiles[y][x], x * TILE, y * TILE);
        // draw chests
        for (const chest of s.areaChests) drawChest(ctx, chest);
        // draw NPCs
        for (const npc of ad.npcs) drawNPC(ctx, npc, f);
        // draw player
        drawPixelChar(ctx, s.playerX * TILE, s.playerY * TILE, s.playerDir, f);
        // HUD overlay
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, CW, 28);
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px " + FONT; ctx.textAlign = "left";
        ctx.fillText(`Lv.${s.stats.level} ${getAreaData(s.area, 1).label}`, 4, 12);
        // HP bar
        ctx.fillStyle = "#333"; ctx.fillRect(100, 4, 80, 8);
        ctx.fillStyle = "#e74c3c"; ctx.fillRect(100, 4, 80 * (s.stats.hp / s.stats.maxHp), 8);
        ctx.fillStyle = "#fff"; ctx.font = "9px " + FONT;
        ctx.fillText(`${s.stats.hp}/${s.stats.maxHp}`, 102, 11);
        // MP bar
        ctx.fillStyle = "#333"; ctx.fillRect(100, 16, 80, 8);
        ctx.fillStyle = PRIMARY; ctx.fillRect(100, 16, 80 * (s.stats.mp / s.stats.maxMp), 8);
        ctx.fillText(`${s.stats.mp}/${s.stats.maxMp}`, 102, 23);
        // XP
        ctx.fillStyle = "#aaa"; ctx.textAlign = "right";
        ctx.fillText(`XP:${s.stats.xp}/${s.stats.xpNext}  G:${s.stats.gold}`, CW - 4, 12);
        // area indicator
        ctx.fillStyle = "#aaa"; ctx.font = "9px " + FONT; ctx.textAlign = "right";
        ctx.fillText("[I]背包 [K]技能", CW - 4, 24);
      }

      if (s.screen === "combat" && s.combat) {
        const c = s.combat;
        // background
        ctx.fillStyle = "#0a0a1a";
        ctx.fillRect(0, 0, CW, CH);
        // ground
        ctx.fillStyle = "#1a1a2a";
        ctx.fillRect(0, CH * 0.6, CW, CH * 0.4);
        // enemy
        drawPixelEnemy(ctx, CW * 0.65, CH * 0.35, c.enemy.color, c.enemy.isBoss, f);
        // enemy HP bar
        ctx.fillStyle = "#333"; ctx.fillRect(CW * 0.4, CH * 0.08, CW * 0.5, 12);
        ctx.fillStyle = c.enemy.isBoss ? "#e74c3c" : "#ff6b6b";
        ctx.fillRect(CW * 0.4, CH * 0.08, CW * 0.5 * (c.enemy.hp / c.enemy.maxHp), 12);
        ctx.fillStyle = "#fff"; ctx.font = "bold 10px " + FONT; ctx.textAlign = "center";
        ctx.fillText(`${c.enemy.name} ${c.enemy.hp}/${c.enemy.maxHp}`, CW * 0.65, CH * 0.07);
        // player sprite (small)
        drawPixelChar(ctx, CW * 0.15, CH * 0.45, "right", f);
        // player HP/MP
        ctx.fillStyle = "#333"; ctx.fillRect(10, CH * 0.42, 100, 8);
        ctx.fillStyle = "#e74c3c"; ctx.fillRect(10, CH * 0.42, 100 * (s.stats.hp / s.stats.maxHp), 8);
        ctx.fillStyle = "#333"; ctx.fillRect(10, CH * 0.42 + 10, 100, 8);
        ctx.fillStyle = PRIMARY; ctx.fillRect(10, CH * 0.42 + 10, 100 * (s.stats.mp / s.stats.maxMp), 8);
        ctx.fillStyle = "#fff"; ctx.font = "9px " + FONT; ctx.textAlign = "left";
        ctx.fillText(`HP:${s.stats.hp}/${s.stats.maxHp}`, 12, CH * 0.42 + 7);
        ctx.fillText(`MP:${s.stats.mp}/${s.stats.maxMp}`, 12, CH * 0.42 + 17);
        // combat log
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(0, CH * 0.65, CW, CH * 0.15);
        ctx.fillStyle = "#ccc"; ctx.font = "10px " + FONT; ctx.textAlign = "left";
        const visibleLog = c.log.slice(-3);
        visibleLog.forEach((line, i) => ctx.fillText(line, 8, CH * 0.68 + i * 14));
        // action menu
        if (c.turn === "player" && !c.animating && !c.fled) {
          ctx.fillStyle = "rgba(0,0,0,0.85)";
          ctx.fillRect(0, CH * 0.82, CW, CH * 0.18);
          if (!c.skillSelect && !c.itemSelect) {
            const actions = ["攻击", "技能", "道具", "逃跑"];
            const icons = ["swords", "zap", "package", "wind"];
            actions.forEach((a, i) => {
              const bx = 10 + i * (CW / 4 - 5), by = CH * 0.84;
              ctx.fillStyle = c.selectedAction === i ? PRIMARY : "#333";
              ctx.fillRect(bx, by, CW / 4 - 15, 24);
              ctx.fillStyle = c.selectedAction === i ? "#000" : "#fff";
              ctx.font = "bold 11px " + FONT; ctx.textAlign = "center";
              ctx.fillText(a, bx + (CW / 4 - 15) / 2, by + 16);
              void icons;
            });
          } else if (c.skillSelect) {
            const unlocked = s.skills.filter(sk => sk.unlocked);
            if (unlocked.length === 0) {
              ctx.fillStyle = "#aaa"; ctx.font = "11px " + FONT; ctx.textAlign = "center";
              ctx.fillText("还没有解锁技能！按ESC返回", CW / 2, CH * 0.92);
            } else {
              unlocked.forEach((sk, i) => {
                const by = CH * 0.84 + i * 16;
                ctx.fillStyle = i === s.combatSkillIdx ? PRIMARY : "transparent";
                ctx.fillRect(8, by - 2, CW - 16, 14);
                ctx.fillStyle = i === s.combatSkillIdx ? "#000" : "#fff";
                ctx.font = "10px " + FONT; ctx.textAlign = "left";
                ctx.fillText(`${sk.name} (MP:${sk.mpCost})`, 12, by + 9);
              });
            }
          } else if (c.itemSelect) {
            const usable = s.inventory.filter(it => it.type === "potion" || it.type === "mpPotion");
            if (usable.length === 0) {
              ctx.fillStyle = "#aaa"; ctx.font = "11px " + FONT; ctx.textAlign = "center";
              ctx.fillText("没有可用道具！按ESC返回", CW / 2, CH * 0.92);
            } else {
              usable.forEach((it, i) => {
                const by = CH * 0.84 + i * 16;
                ctx.fillStyle = i === s.combatItemIdx ? PRIMARY : "transparent";
                ctx.fillRect(8, by - 2, CW - 16, 14);
                ctx.fillStyle = i === s.combatItemIdx ? "#000" : "#fff";
                ctx.font = "10px " + FONT; ctx.textAlign = "left";
                ctx.fillText(`${it.name} - ${it.desc}`, 12, by + 9);
              });
            }
          }
        }
      }

      if (s.screen === "dialogue" && s.dialogueNpc) {
        // draw map behind
        const diff = DIFF_SCALE[s.difficulty];
        const ad = getAreaData(s.area, diff);
        for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) drawTile(ctx, ad.tiles[y][x], x * TILE, y * TILE);
        for (const chest of s.areaChests) drawChest(ctx, chest);
        for (const npc of ad.npcs) drawNPC(ctx, npc, f);
        drawPixelChar(ctx, s.playerX * TILE, s.playerY * TILE, s.playerDir, f);
        // dialogue box
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(10, CH - 90, CW - 20, 80);
        ctx.strokeStyle = PRIMARY; ctx.lineWidth = 2;
        ctx.strokeRect(10, CH - 90, CW - 20, 80);
        ctx.fillStyle = PRIMARY; ctx.font = "bold 12px " + FONT; ctx.textAlign = "left";
        ctx.fillText(s.dialogueNpc.name, 20, CH - 72);
        ctx.fillStyle = "#fff"; ctx.font = "11px " + FONT;
        ctx.fillText(s.dialogueNpc.lines[s.dialogueLine] || "", 20, CH - 50);
        ctx.fillStyle = "#aaa"; ctx.font = "9px " + FONT; ctx.textAlign = "right";
        ctx.fillText("按Enter继续", CW - 20, CH - 18);
      }

      // particles
      setParticles(prev => {
        const next: Particle[] = [];
        for (const p of prev) {
          p.x += p.vx; p.y += p.vy; p.life--;
          if (p.life > 0) {
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
            next.push(p);
          }
        }
        ctx.globalAlpha = 1;
        return next;
      });

      // damage popups
      setPopups(prev => {
        const next: DamagePopup[] = [];
        for (const p of prev) {
          p.y -= 1; p.life--;
          if (p.life > 0) {
            ctx.globalAlpha = p.life / 40;
            ctx.fillStyle = p.color;
            ctx.font = "bold 14px " + FONT; ctx.textAlign = "center";
            ctx.fillText(p.text, p.x, p.y);
            next.push(p);
          }
        }
        ctx.globalAlpha = 1;
        return next;
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [screen]);

  // ─── Equip Item ────────────────────────────────────────────────────────────
  const equipItem = useCallback((item: Item, idx: number) => {
    setInventory(inv => {
      const n = [...inv];
      n.splice(idx, 1);
      return n;
    });
    setEquipment(eq => {
      const slot = item.type === "weapon" ? "weapon" : item.type === "armor" ? "armor" : "accessory";
      const old = eq[slot];
      if (old) setInventory(inv => [...inv, old]);
      return { ...eq, [slot]: item };
    });
  }, []);

  const unequipItem = useCallback((slot: "weapon" | "armor" | "accessory") => {
    setEquipment(eq => {
      if (!eq[slot]) return eq;
      setInventory(inv => [...inv, eq[slot]!]);
      return { ...eq, [slot]: null };
    });
  }, []);

  // ─── Unlock Skill ──────────────────────────────────────────────────────────
  const unlockSkill = useCallback((skillId: string) => {
    const s = stateRef.current;
    const skill = s.skills.find(sk => sk.id === skillId);
    if (!skill || skill.unlocked || s.stats.skillPoints < skill.cost) return;
    // check tier prerequisite
    if (skill.tier > 1) {
      const prevTier = s.skills.filter(sk => sk.branch === skill.branch && sk.tier < skill.tier && sk.unlocked);
      if (prevTier.length === 0) return;
    }
    setStats(st => ({ ...st, skillPoints: st.skillPoints - skill.cost }));
    setSkills(sk => sk.map(s => s.id === skillId ? { ...s, unlocked: true } : s));
  }, []);

  // ─── Save / Load ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const s = stateRef.current;
    return {
      screen: s.screen === "combat" ? "explore" : s.screen,
      area: s.area, playerX: s.playerX, playerY: s.playerY, playerDir: s.playerDir,
      stats: s.stats, equipment: s.equipment, inventory: s.inventory, skills: s.skills,
      difficulty: s.difficulty, bossDefeated: s.bossDefeated, score: s.score,
      enemiesKilled: s.enemiesKilled, chestsOpened: s.chestsOpened,
      areaChests: s.areaChests,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    setScreen((d.screen as Screen) || "explore");
    setArea((d.area as Area) || "village");
    setPlayerX((d.playerX as number) || 8);
    setPlayerY((d.playerY as number) || 8);
    setPlayerDir((d.playerDir as Direction) || "down");
    setStats((d.stats as Stats) || initStats());
    setEquipment((d.equipment as Equipment) || { weapon: null, armor: null, accessory: null });
    setInventory((d.inventory as Item[]) || []);
    setSkills((d.skills as Skill[]) || makeSkills());
    setDifficulty((d.difficulty as Difficulty) || "normal");
    setBossDefeated((d.bossDefeated as boolean) || false);
    setScore((d.score as number) || 0);
    setEnemiesKilled((d.enemiesKilled as number) || 0);
    setChestsOpened((d.chestsOpened as number) || 0);
    setAreaChests((d.areaChests as Chest[]) || []);
    setCombat(null); setDialogueNpc(null);
    setShowInv(false); setShowSkills(false);
  }, []);

  // ─── Touch Controls ────────────────────────────────────────────────────────
  const touchMove = useCallback((dir: Direction) => {
    if (screen === "explore") {
      const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
      const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
      tryMove(dx, dy);
    }
  }, [screen, tryMove]);

  // ─── Total Stats ───────────────────────────────────────────────────────────
  const totalStats = calcTotalStats(stats, equipment);

  // ─── Branch Labels ─────────────────────────────────────────────────────────
  const branchLabel: Record<SkillBranch, string> = { warrior: "战士", mage: "法师", rogue: "盗贼" };
  const branchColor: Record<SkillBranch, string> = { warrior: "#e74c3c", mage: "#a855f7", rogue: "#2ed573" };
  const areaLabel: Record<Area, string> = { village: "村庄", forest: "森林", dungeon: "地牢" };

  // ═══════════════════════════════════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white pb-20">
        <div className="max-w-2xl mx-auto px-4 pt-4">
          {/* Nav */}
          <div className="flex items-center justify-between mb-3">
            <Link href="/games" className="flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] transition">
              <ChevronLeft className="w-4 h-4" /> 游戏中心
            </Link>
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="p-1.5 rounded-lg hover:bg-[#222] transition" aria-label={muted ? "开启音效" : "关闭音效"}>
                {muted ? <VolumeX className="w-4 h-4 text-gray-500" /> : <Volume2 className="w-4 h-4 text-[#3ea6ff]" />}
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="relative mx-auto" style={{ width: CW, maxWidth: "100%" }}>
            <canvas
              ref={canvasRef}
              width={CW}
              height={CH}
              className="w-full rounded-xl border border-[#222] bg-[#0a0a0a]"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {/* ─── Title Screen ─── */}
          {screen === "title" && (
            <div className="mt-4 bg-[#111] rounded-xl p-6 border border-[#222] text-center">
              <Swords className="w-16 h-16 text-[#3ea6ff] mx-auto mb-3" />
              <h1 className="text-3xl font-bold text-[#3ea6ff] mb-1">像素冒险</h1>
              <p className="text-sm text-gray-400 mb-6">探索村庄、森林与地牢，击败龙王！</p>

              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">选择难度</p>
                <div className="flex gap-2 justify-center">
                  {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => setDifficulty(d)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${difficulty === d ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#1a1a1a] text-gray-400 hover:bg-[#222]"}`}>
                      {DIFF_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => startGame(difficulty)}
                className="w-full py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-lg hover:bg-[#65b8ff] transition flex items-center justify-center gap-2">
                <Play className="w-5 h-5" /> 开始冒险
              </button>

              <div className="mt-4 text-xs text-gray-600 space-y-1">
                <p>WASD/方向键移动 | I 背包 | K 技能</p>
                <p>靠近NPC/宝箱自动交互 | 回合制战斗</p>
              </div>
            </div>
          )}

          {/* ─── Explore UI (below canvas) ─── */}
          {screen === "explore" && (
            <div className="mt-3 space-y-3">
              {/* Quick stats */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-[#111] rounded-lg p-2 border border-[#222]">
                  <Heart className="w-3.5 h-3.5 text-[#e74c3c] mx-auto mb-0.5" />
                  <div className="text-gray-400">生命</div>
                  <div className="text-white font-bold">{stats.hp}/{stats.maxHp}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-2 border border-[#222]">
                  <Zap className="w-3.5 h-3.5 text-[#3ea6ff] mx-auto mb-0.5" />
                  <div className="text-gray-400">魔力</div>
                  <div className="text-white font-bold">{stats.mp}/{stats.maxMp}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-2 border border-[#222]">
                  <Swords className="w-3.5 h-3.5 text-[#ff9f43] mx-auto mb-0.5" />
                  <div className="text-gray-400">攻击</div>
                  <div className="text-white font-bold">{totalStats.atk}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-2 border border-[#222]">
                  <Shield className="w-3.5 h-3.5 text-[#2ed573] mx-auto mb-0.5" />
                  <div className="text-gray-400">防御</div>
                  <div className="text-white font-bold">{totalStats.def}</div>
                </div>
              </div>

              {/* Area & Level info */}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  {area === "village" ? <Castle className="w-3.5 h-3.5" /> : area === "forest" ? <TreePine className="w-3.5 h-3.5" /> : <Skull className="w-3.5 h-3.5" />}
                  {areaLabel[area]}
                </span>
                <span>Lv.{stats.level} | XP:{stats.xp}/{stats.xpNext} | 金币:{stats.gold}</span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button onClick={() => setShowInv(v => !v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1 ${showInv ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#1a1a1a] text-gray-300 hover:bg-[#222]"}`}>
                  <Package className="w-4 h-4" /> 背包
                </button>
                <button onClick={() => setShowSkills(v => !v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1 ${showSkills ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#1a1a1a] text-gray-300 hover:bg-[#222]"}`}>
                  <Star className="w-4 h-4" /> 技能树
                </button>
              </div>

              {/* Touch D-pad */}
              <div className="flex justify-center">
                <div className="grid grid-cols-3 gap-1 w-32">
                  <div />
                  <button onPointerDown={() => touchMove("up")} className="bg-[#1a1a1a] rounded-lg p-2 flex items-center justify-center active:bg-[#333] transition" aria-label="上">
                    <ArrowUp className="w-5 h-5 text-gray-400" />
                  </button>
                  <div />
                  <button onPointerDown={() => touchMove("left")} className="bg-[#1a1a1a] rounded-lg p-2 flex items-center justify-center active:bg-[#333] transition" aria-label="左">
                    <ArrowLeft className="w-5 h-5 text-gray-400" />
                  </button>
                  <div className="bg-[#111] rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4 text-gray-600" />
                  </div>
                  <button onPointerDown={() => touchMove("right")} className="bg-[#1a1a1a] rounded-lg p-2 flex items-center justify-center active:bg-[#333] transition" aria-label="右">
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </button>
                  <div />
                  <button onPointerDown={() => touchMove("down")} className="bg-[#1a1a1a] rounded-lg p-2 flex items-center justify-center active:bg-[#333] transition" aria-label="下">
                    <ArrowDown className="w-5 h-5 text-gray-400" />
                  </button>
                  <div />
                </div>
              </div>

              {/* ─── Inventory Panel ─── */}
              {showInv && (
                <div className="bg-[#111] rounded-xl p-4 border border-[#222]">
                  <h3 className="text-sm font-bold text-[#3ea6ff] mb-3 flex items-center gap-1"><Package className="w-4 h-4" /> 背包</h3>

                  {/* Equipment slots */}
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">装备栏</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {(["weapon", "armor", "accessory"] as const).map(slot => (
                        <div key={slot} className="bg-[#0a0a0a] rounded-lg p-2 border border-[#333]">
                          <div className="text-gray-500 mb-1">{slot === "weapon" ? "武器" : slot === "armor" ? "防具" : "饰品"}</div>
                          {equipment[slot] ? (
                            <div>
                              <div className="text-white font-semibold">{equipment[slot]!.name}</div>
                              <div className="text-gray-400 text-[10px]">{equipment[slot]!.desc}</div>
                              <button onClick={() => unequipItem(slot)} className="mt-1 text-[10px] text-[#ff4757] hover:underline">卸下</button>
                            </div>
                          ) : <div className="text-gray-600">空</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inventory items */}
                  <p className="text-xs text-gray-500 mb-1">物品 ({inventory.length})</p>
                  {inventory.length === 0 ? (
                    <p className="text-xs text-gray-600">背包空空如也</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {inventory.map((item, i) => (
                        <div key={`${item.id}-${i}`} className="flex items-center justify-between bg-[#0a0a0a] rounded-lg px-3 py-1.5 text-xs">
                          <div>
                            <span className="text-white font-semibold">{item.name}</span>
                            <span className="text-gray-500 ml-2">{item.desc}</span>
                          </div>
                          {(item.type === "weapon" || item.type === "armor" || item.type === "accessory") && (
                            <button onClick={() => equipItem(item, i)} className="text-[#3ea6ff] hover:underline text-[10px]">装备</button>
                          )}
                          {(item.type === "potion" || item.type === "mpPotion") && screen === "explore" && (
                            <button onClick={() => {
                              setInventory(inv => { const n = [...inv]; n.splice(i, 1); return n; });
                              if (item.type === "potion") setStats(st => ({ ...st, hp: Math.min(st.maxHp, st.hp + (item.heal || 0)) }));
                              else setStats(st => ({ ...st, mp: Math.min(st.maxMp, st.mp + (item.mpHeal || 0)) }));
                              audioRef.current.heal();
                            }} className="text-[#2ed573] hover:underline text-[10px]">使用</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Stats detail */}
                  <div className="mt-3 pt-3 border-t border-[#222]">
                    <p className="text-xs text-gray-500 mb-1">详细属性</p>
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div className="text-gray-400">速度: <span className="text-white">{totalStats.spd}</span></div>
                      <div className="text-gray-400">暴击: <span className="text-white">{totalStats.crit}%</span></div>
                      <div className="text-gray-400">技能点: <span className="text-[#ffd700]">{stats.skillPoints}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Skills Panel ─── */}
              {showSkills && (
                <div className="bg-[#111] rounded-xl p-4 border border-[#222]">
                  <h3 className="text-sm font-bold text-[#3ea6ff] mb-1 flex items-center gap-1"><Star className="w-4 h-4" /> 技能树</h3>
                  <p className="text-[10px] text-gray-500 mb-3">技能点: {stats.skillPoints}</p>
                  {(["warrior", "mage", "rogue"] as SkillBranch[]).map(branch => (
                    <div key={branch} className="mb-3">
                      <div className="flex items-center gap-1 mb-1">
                        {branch === "warrior" ? <Swords className="w-3.5 h-3.5" style={{ color: branchColor[branch] }} /> :
                         branch === "mage" ? <Flame className="w-3.5 h-3.5" style={{ color: branchColor[branch] }} /> :
                         <Wind className="w-3.5 h-3.5" style={{ color: branchColor[branch] }} />}
                        <span className="text-xs font-bold" style={{ color: branchColor[branch] }}>{branchLabel[branch]}</span>
                      </div>
                      <div className="space-y-1">
                        {skills.filter(s => s.branch === branch).map(skill => {
                          const canUnlock = !skill.unlocked && stats.skillPoints >= skill.cost &&
                            (skill.tier === 1 || skills.some(s => s.branch === skill.branch && s.tier < skill.tier && s.unlocked));
                          return (
                            <div key={skill.id} className={`flex items-center justify-between px-2 py-1 rounded text-xs ${skill.unlocked ? "bg-[#1a2a1a]" : "bg-[#0a0a0a]"}`}>
                              <div>
                                <span className={skill.unlocked ? "text-white" : "text-gray-500"}>{skill.name}</span>
                                <span className="text-gray-600 ml-1">T{skill.tier} MP:{skill.mpCost}</span>
                                <span className="text-gray-600 ml-1">{skill.desc}</span>
                              </div>
                              {skill.unlocked ? (
                                <span className="text-[#2ed573] text-[10px]">已解锁</span>
                              ) : (
                                <button onClick={() => unlockSkill(skill.id)} disabled={!canUnlock}
                                  className={`text-[10px] px-2 py-0.5 rounded ${canUnlock ? "bg-[#3ea6ff] text-[#0f0f0f] hover:bg-[#65b8ff]" : "bg-[#222] text-gray-600"}`}>
                                  解锁({skill.cost}点)
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Combat UI (below canvas) ─── */}
          {screen === "combat" && combat && (
            <div className="mt-3 space-y-2">
              {/* Touch combat actions */}
              {combat.turn === "player" && !combat.animating && !combat.fled && !combat.skillSelect && !combat.itemSelect && (
                <div className="grid grid-cols-4 gap-2">
                  <button onClick={playerAttack} className="bg-[#1a1a1a] rounded-lg py-2.5 text-sm font-semibold text-white hover:bg-[#333] transition flex flex-col items-center gap-1">
                    <Swords className="w-4 h-4 text-[#e74c3c]" /> 攻击
                  </button>
                  <button onClick={() => setCombat(p => p ? { ...p, skillSelect: true } : p)} className="bg-[#1a1a1a] rounded-lg py-2.5 text-sm font-semibold text-white hover:bg-[#333] transition flex flex-col items-center gap-1">
                    <Crosshair className="w-4 h-4 text-[#a855f7]" /> 技能
                  </button>
                  <button onClick={() => setCombat(p => p ? { ...p, itemSelect: true } : p)} className="bg-[#1a1a1a] rounded-lg py-2.5 text-sm font-semibold text-white hover:bg-[#333] transition flex flex-col items-center gap-1">
                    <Package className="w-4 h-4 text-[#2ed573]" /> 道具
                  </button>
                  <button onClick={playerFlee} className="bg-[#1a1a1a] rounded-lg py-2.5 text-sm font-semibold text-white hover:bg-[#333] transition flex flex-col items-center gap-1">
                    <Wind className="w-4 h-4 text-gray-400" /> 逃跑
                  </button>
                </div>
              )}

              {/* Touch skill select */}
              {combat.turn === "player" && !combat.animating && combat.skillSelect && (
                <div className="bg-[#111] rounded-xl p-3 border border-[#222]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#a855f7]">选择技能</span>
                    <button onClick={() => setCombat(p => p ? { ...p, skillSelect: false } : p)} className="text-xs text-gray-500 hover:text-white">返回</button>
                  </div>
                  {skills.filter(s => s.unlocked).length === 0 ? (
                    <p className="text-xs text-gray-500">还没有解锁技能</p>
                  ) : (
                    <div className="space-y-1">
                      {skills.filter(s => s.unlocked).map(sk => (
                        <button key={sk.id} onClick={() => playerUseSkill(sk)} disabled={stats.mp < sk.mpCost}
                          className={`w-full text-left px-3 py-1.5 rounded text-xs transition ${stats.mp >= sk.mpCost ? "bg-[#1a1a2a] hover:bg-[#2a2a3a] text-white" : "bg-[#0a0a0a] text-gray-600"}`}>
                          {sk.name} <span className="text-gray-500">MP:{sk.mpCost} | {sk.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Touch item select */}
              {combat.turn === "player" && !combat.animating && combat.itemSelect && (
                <div className="bg-[#111] rounded-xl p-3 border border-[#222]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#2ed573]">选择道具</span>
                    <button onClick={() => setCombat(p => p ? { ...p, itemSelect: false } : p)} className="text-xs text-gray-500 hover:text-white">返回</button>
                  </div>
                  {inventory.filter(it => it.type === "potion" || it.type === "mpPotion").length === 0 ? (
                    <p className="text-xs text-gray-500">没有可用道具</p>
                  ) : (
                    <div className="space-y-1">
                      {inventory.filter(it => it.type === "potion" || it.type === "mpPotion").map((it, i) => {
                        const realIdx = inventory.indexOf(it);
                        return (
                          <button key={`${it.id}-${i}`} onClick={() => playerUseItem(it, realIdx)}
                            className="w-full text-left px-3 py-1.5 rounded text-xs bg-[#1a1a2a] hover:bg-[#2a2a3a] text-white transition">
                            {it.name} <span className="text-gray-500">{it.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Combat log (touch) */}
              <div className="bg-[#111] rounded-lg p-2 border border-[#222] max-h-20 overflow-y-auto">
                {combat.log.slice(-4).map((line, i) => (
                  <p key={i} className="text-[10px] text-gray-400">{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* ─── Dialogue UI ─── */}
          {screen === "dialogue" && dialogueNpc && (
            <div className="mt-3">
              <button onClick={() => {
                if (dialogueLine < dialogueNpc.lines.length - 1) setDialogueLine(l => l + 1);
                else { setDialogueNpc(null); setScreen("explore"); }
              }} className="w-full bg-[#111] rounded-xl p-4 border border-[#3ea6ff]/30 text-left hover:bg-[#1a1a1a] transition">
                <div className="text-[#3ea6ff] font-bold text-sm mb-1">{dialogueNpc.name}</div>
                <div className="text-white text-sm">{dialogueNpc.lines[dialogueLine]}</div>
                <div className="text-gray-500 text-[10px] mt-2 text-right">点击继续 ({dialogueLine + 1}/{dialogueNpc.lines.length})</div>
              </button>
            </div>
          )}

          {/* ─── Game Over Screen ─── */}
          {screen === "gameover" && (
            <div className="mt-4 bg-[#1a1a2e] rounded-xl p-6 border border-[#ff4757]/30 text-center">
              <Skull className="w-16 h-16 text-[#ff4757] mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-[#ff4757] mb-2">你倒下了</h2>
              <p className="text-sm text-gray-400 mb-4">冒险者的旅途在此终结...</p>
              <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">得分</div>
                  <div className="text-[#3ea6ff] font-bold text-lg">{score}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">等级</div>
                  <div className="text-white font-bold text-lg">Lv.{stats.level}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">击杀</div>
                  <div className="text-[#2ed573] font-bold text-lg">{enemiesKilled}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startGame(difficulty)}
                  className="flex-1 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" /> 重新冒险
                </button>
                <button onClick={() => setScreen("title")}
                  className="flex-1 py-2.5 rounded-xl border border-[#333] text-gray-300 font-semibold text-sm hover:border-[#555] transition">
                  返回标题
                </button>
              </div>
            </div>
          )}

          {/* ─── Victory Screen ─── */}
          {screen === "victory" && (
            <div className="mt-4 bg-[#1a2a1a] rounded-xl p-6 border border-[#2ed573]/30 text-center">
              <Trophy className="w-16 h-16 text-[#ffd700] mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-[#ffd700] mb-2">胜利！</h2>
              <p className="text-sm text-gray-400 mb-4">你击败了龙王，拯救了世界！</p>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">最终得分</div>
                  <div className="text-[#ffd700] font-bold text-lg">{score + 1000}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">最终等级</div>
                  <div className="text-white font-bold text-lg">Lv.{stats.level}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">击杀数</div>
                  <div className="text-[#2ed573] font-bold text-lg">{enemiesKilled}</div>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <div className="text-gray-500 text-xs">宝箱</div>
                  <div className="text-[#ff9f43] font-bold text-lg">{chestsOpened}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startGame(difficulty)}
                  className="flex-1 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" /> 新游戏
                </button>
                <button onClick={() => setScreen("title")}
                  className="flex-1 py-2.5 rounded-xl border border-[#333] text-gray-300 font-semibold text-sm hover:border-[#555] transition">
                  返回标题
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
