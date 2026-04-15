"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import {
  ChevronLeft, RotateCcw, Box, Play, Volume2, VolumeX,
  Heart, Pickaxe, Shield
} from "lucide-react";

/* ================================================================
   常量 & 类型
   ================================================================ */
const GAME_ID = "sandbox";
const W = 640, H = 480;
const GRID = 16;
const COLS = 80, ROWS = 60;
const VIEW_COLS = W / GRID, VIEW_ROWS = H / GRID;

type Phase = "title" | "playing" | "paused" | "gameover";
type GameMode = "creative" | "survival";
type Difficulty = "easy" | "normal" | "hard";
type BlockType =
  | "air" | "dirt" | "stone" | "wood" | "water" | "sand"
  | "grass" | "brick" | "glass" | "leaf" | "ore" | "bedrock";

interface BlockDef {
  name: string;
  color: string;
  solid: boolean;
  breakTime: number;
  drops?: BlockType;
  gravity?: boolean;
  liquid?: boolean;
}

const BLOCK_DEFS: Record<BlockType, BlockDef> = {
  air:     { name: "空气",   color: "transparent", solid: false, breakTime: 0 },
  dirt:    { name: "泥土",   color: "#8B6914",     solid: true,  breakTime: 3 },
  stone:   { name: "石头",   color: "#808080",     solid: true,  breakTime: 8 },
  wood:    { name: "木头",   color: "#A0522D",     solid: true,  breakTime: 4 },
  water:   { name: "水",     color: "#1E90FF",     solid: false, breakTime: 0, liquid: true },
  sand:    { name: "沙子",   color: "#F4D03F",     solid: true,  breakTime: 2, gravity: true },
  grass:   { name: "草地",   color: "#228B22",     solid: true,  breakTime: 3, drops: "dirt" },
  brick:   { name: "砖块",   color: "#B22222",     solid: true,  breakTime: 10 },
  glass:   { name: "玻璃",   color: "#87CEEB",     solid: true,  breakTime: 1 },
  leaf:    { name: "树叶",   color: "#2E8B57",     solid: true,  breakTime: 1 },
  ore:     { name: "矿石",   color: "#DAA520",     solid: true,  breakTime: 12 },
  bedrock: { name: "基岩",   color: "#333333",     solid: true,  breakTime: 999 },
};

const PLACEABLE_BLOCKS: BlockType[] = [
  "dirt", "stone", "wood", "water", "sand", "grass", "brick", "glass", "leaf", "ore",
];

const DIFF_SETTINGS: Record<Difficulty, { hpMax: number; hungerRate: number; dmgMul: number }> = {
  easy:   { hpMax: 20, hungerRate: 0.003, dmgMul: 0.5 },
  normal: { hpMax: 15, hungerRate: 0.005, dmgMul: 1.0 },
  hard:   { hpMax: 10, hungerRate: 0.008, dmgMul: 1.5 },
};

interface Inventory {
  [key: string]: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface GameState {
  grid: BlockType[][];
  camX: number; camY: number;
  mode: GameMode;
  difficulty: Difficulty;
  hp: number; hpMax: number;
  hunger: number;
  score: number;
  inventory: Inventory;
  selectedBlock: BlockType;
  dayTime: number;
  dayLength: number;
  totalTime: number;
  particles: Particle[];
  breakProgress: number;
  breakX: number; breakY: number;
}

/* ================================================================
   世界生成
   ================================================================ */
function generateWorld(): BlockType[][] {
  const grid: BlockType[][] = Array.from({ length: ROWS }, () =>
    Array(COLS).fill("air") as BlockType[]
  );
  // Terrain height using simple noise
  const heights: number[] = [];
  let h = ROWS * 0.45;
  for (let x = 0; x < COLS; x++) {
    h += (Math.random() - 0.5) * 2;
    h = Math.max(ROWS * 0.3, Math.min(ROWS * 0.6, h));
    heights.push(Math.floor(h));
  }
  // Smooth pass
  for (let i = 1; i < COLS - 1; i++) {
    heights[i] = Math.floor((heights[i - 1] + heights[i] + heights[i + 1]) / 3);
  }

  for (let x = 0; x < COLS; x++) {
    const surfaceY = heights[x];
    for (let y = 0; y < ROWS; y++) {
      if (y === ROWS - 1) {
        grid[y][x] = "bedrock";
      } else if (y > surfaceY + 8) {
        grid[y][x] = Math.random() < 0.05 ? "ore" : "stone";
      } else if (y > surfaceY + 1) {
        grid[y][x] = "dirt";
      } else if (y === surfaceY || y === surfaceY + 1) {
        grid[y][x] = "grass";
      }
    }
    // Trees
    if (Math.random() < 0.08 && surfaceY > 5) {
      const treeH = 3 + Math.floor(Math.random() * 3);
      for (let ty = 1; ty <= treeH; ty++) {
        if (surfaceY - ty >= 0) grid[surfaceY - ty][x] = "wood";
      }
      // Leaves
      for (let ly = -2; ly <= 0; ly++) {
        for (let lx = -2; lx <= 2; lx++) {
          const px = x + lx, py = surfaceY - treeH + ly;
          if (px >= 0 && px < COLS && py >= 0 && py < ROWS && grid[py][px] === "air") {
            if (Math.abs(lx) + Math.abs(ly) < 4) grid[py][px] = "leaf";
          }
        }
      }
    }
    // Water pools
    if (surfaceY > ROWS * 0.5 && Math.random() < 0.03) {
      for (let wy = surfaceY; wy < surfaceY + 3 && wy < ROWS - 1; wy++) {
        for (let wx = x - 2; wx <= x + 2; wx++) {
          if (wx >= 0 && wx < COLS && grid[wy][wx] === "air") {
            grid[wy][wx] = "water";
          }
        }
      }
    }
  }
  return grid;
}

function createDefaultState(mode: GameMode, diff: Difficulty): GameState {
  const ds = DIFF_SETTINGS[diff];
  const inv: Inventory = {};
  if (mode === "creative") {
    PLACEABLE_BLOCKS.forEach(b => { inv[b] = 9999; });
  } else {
    inv["wood"] = 5;
    inv["dirt"] = 10;
  }
  return {
    grid: generateWorld(),
    camX: COLS / 2 - VIEW_COLS / 2,
    camY: ROWS * 0.35,
    mode, difficulty: diff,
    hp: ds.hpMax, hpMax: ds.hpMax,
    hunger: 100,
    score: 0,
    inventory: inv,
    selectedBlock: "dirt",
    dayTime: 0,
    dayLength: 1200,
    totalTime: 0,
    particles: [],
    breakProgress: 0,
    breakX: -1, breakY: -1,
  };
}

/* ================================================================
   主组件
   ================================================================ */
export default function SandboxGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [mode, setMode] = useState<GameMode>("creative");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [score, setScore] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<BlockType>("dirt");
  const [showInventory, setShowInventory] = useState(false);

  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef({ x: 0, y: 0, down: false, right: false });
  const rafRef = useRef(0);
  const soundRef = useRef<SoundEngine | null>(null);
  const lastTimeRef = useRef(0);

  /* ---- Sound ---- */
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playSound = useCallback((type: "click" | "score" | "error" | "levelUp" | "gameOver" | "move") => {
    if (muted || !soundRef.current) return;
    const s = soundRef.current;
    switch (type) {
      case "click": s.playClick(); break;
      case "score": s.playScore(10); break;
      case "error": s.playError(); break;
      case "levelUp": s.playLevelUp(); break;
      case "gameOver": s.playGameOver(); break;
      case "move": s.playMove(); break;
    }
  }, [muted]);

  /* ---- Start game ---- */
  const startGame = useCallback((m: GameMode, d: Difficulty) => {
    stateRef.current = createDefaultState(m, d);
    setMode(m);
    setDifficulty(d);
    setPhase("playing");
    setSelectedBlock("dirt");
    setScore(0);
    playSound("click");
  }, [playSound]);

  /* ---- Submit score ---- */
  const submitScore = useCallback(async (s: number) => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: s }),
      });
    } catch { /* ignore */ }
  }, []);

  /* ---- Save / Load ---- */
  const handleSave = useCallback(() => {
    if (!stateRef.current) return null;
    const s = stateRef.current;
    return {
      grid: s.grid, camX: s.camX, camY: s.camY,
      mode: s.mode, difficulty: s.difficulty,
      hp: s.hp, hpMax: s.hpMax, hunger: s.hunger,
      score: s.score, inventory: s.inventory,
      selectedBlock: s.selectedBlock,
      dayTime: s.dayTime, totalTime: s.totalTime,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Partial<GameState>;
    if (!d || !d.grid) return;
    stateRef.current = {
      grid: d.grid,
      camX: d.camX ?? 0, camY: d.camY ?? 0,
      mode: d.mode ?? "creative",
      difficulty: d.difficulty ?? "normal",
      hp: d.hp ?? 15, hpMax: d.hpMax ?? 15,
      hunger: d.hunger ?? 100,
      score: d.score ?? 0,
      inventory: d.inventory ?? {},
      selectedBlock: d.selectedBlock ?? "dirt",
      dayTime: d.dayTime ?? 0,
      dayLength: 1200,
      totalTime: d.totalTime ?? 0,
      particles: [],
      breakProgress: 0, breakX: -1, breakY: -1,
    };
    setMode(d.mode ?? "creative");
    setDifficulty(d.difficulty ?? "normal");
    setSelectedBlock(d.selectedBlock ?? "dirt");
    setScore(d.score ?? 0);
    setPhase("playing");
    playSound("click");
  }, [playSound]);


  /* ---- Physics tick ---- */
  const physicsTick = useCallback((gs: GameState) => {
    const { grid } = gs;
    // Sand gravity + water flow (bottom-up for gravity)
    for (let y = ROWS - 2; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        const b = grid[y][x];
        if (b === "sand") {
          if (y + 1 < ROWS && grid[y + 1][x] === "air") {
            grid[y + 1][x] = "sand"; grid[y][x] = "air";
          } else if (y + 1 < ROWS && grid[y + 1][x] === "water") {
            grid[y + 1][x] = "sand"; grid[y][x] = "water";
          } else if (y + 1 < ROWS) {
            // Try diagonal
            const dl = x > 0 && grid[y + 1][x - 1] === "air";
            const dr = x < COLS - 1 && grid[y + 1][x + 1] === "air";
            if (dl && dr) {
              const nx = Math.random() < 0.5 ? x - 1 : x + 1;
              grid[y + 1][nx] = "sand"; grid[y][x] = "air";
            } else if (dl) {
              grid[y + 1][x - 1] = "sand"; grid[y][x] = "air";
            } else if (dr) {
              grid[y + 1][x + 1] = "sand"; grid[y][x] = "air";
            }
          }
        } else if (b === "water") {
          if (y + 1 < ROWS && grid[y + 1][x] === "air") {
            grid[y + 1][x] = "water"; grid[y][x] = "air";
          } else {
            // Spread horizontally
            const dir = Math.random() < 0.5 ? -1 : 1;
            const nx = x + dir;
            if (nx >= 0 && nx < COLS && grid[y][nx] === "air" && Math.random() < 0.15) {
              grid[y][nx] = "water"; grid[y][x] = "air";
            }
          }
        }
      }
    }
  }, []);

  /* ---- Particles ---- */
  const spawnParticles = useCallback((gs: GameState, px: number, py: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      gs.particles.push({
        x: px, y: py,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3 - 1,
        life: 20 + Math.random() * 20,
        maxLife: 40,
        color, size: 2 + Math.random() * 2,
      });
    }
  }, []);

  const updateParticles = useCallback((gs: GameState) => {
    gs.particles = gs.particles.filter(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.1;
      p.life--;
      return p.life > 0;
    });
  }, []);

  /* ---- Main game loop ---- */
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    let physicsTimer = 0;

    const loop = (timestamp: number) => {
      const gs = stateRef.current;
      if (!gs || phase !== "playing") return;

      const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 16.67 : 1;
      lastTimeRef.current = timestamp;

      // ---- Input: camera movement ----
      const speed = 0.3 * dt;
      if (keysRef.current.has("w") || keysRef.current.has("arrowup")) gs.camY -= speed;
      if (keysRef.current.has("s") || keysRef.current.has("arrowdown")) gs.camY += speed;
      if (keysRef.current.has("a") || keysRef.current.has("arrowleft")) gs.camX -= speed;
      if (keysRef.current.has("d") || keysRef.current.has("arrowright")) gs.camX += speed;
      gs.camX = Math.max(0, Math.min(COLS - VIEW_COLS, gs.camX));
      gs.camY = Math.max(0, Math.min(ROWS - VIEW_ROWS, gs.camY));

      // ---- Mouse interaction ----
      const mx = mouseRef.current.x, my = mouseRef.current.y;
      const worldX = Math.floor(mx / GRID + gs.camX);
      const worldY = Math.floor(my / GRID + gs.camY);

      if (mouseRef.current.down && worldX >= 0 && worldX < COLS && worldY >= 0 && worldY < ROWS) {
        if (mouseRef.current.right) {
          // Break block
          const target = gs.grid[worldY][worldX];
          if (target !== "air" && target !== "bedrock") {
            if (gs.breakX !== worldX || gs.breakY !== worldY) {
              gs.breakProgress = 0;
              gs.breakX = worldX; gs.breakY = worldY;
            }
            const bDef = BLOCK_DEFS[target];
            gs.breakProgress += dt * (gs.mode === "creative" ? 5 : 1);
            if (gs.breakProgress >= bDef.breakTime) {
              const dropType = bDef.drops || target;
              if (gs.mode === "survival") {
                gs.inventory[dropType] = (gs.inventory[dropType] || 0) + 1;
                gs.score += target === "ore" ? 10 : target === "stone" ? 3 : 1;
              }
              spawnParticles(gs, (worldX - gs.camX) * GRID + GRID / 2, (worldY - gs.camY) * GRID + GRID / 2, bDef.color, 6);
              gs.grid[worldY][worldX] = "air";
              gs.breakProgress = 0;
              gs.breakX = -1; gs.breakY = -1;
              playSound("click");
            }
          }
        } else {
          // Place block
          if (gs.grid[worldY][worldX] === "air" || gs.grid[worldY][worldX] === "water") {
            const block = gs.selectedBlock;
            if (gs.mode === "creative" || (gs.inventory[block] && gs.inventory[block] > 0)) {
              gs.grid[worldY][worldX] = block;
              if (gs.mode === "survival") {
                gs.inventory[block]--;
                if (gs.inventory[block] <= 0) delete gs.inventory[block];
              }
              gs.score += 1;
              playSound("move");
            }
          }
        }
      } else {
        gs.breakProgress = 0;
        gs.breakX = -1; gs.breakY = -1;
      }

      // ---- Physics (every 3 frames) ----
      physicsTimer += dt;
      if (physicsTimer >= 3) {
        physicsTick(gs);
        physicsTimer = 0;
      }

      // ---- Day/night cycle ----
      gs.dayTime = (gs.dayTime + dt * 0.5) % gs.dayLength;
      gs.totalTime += dt;

      // ---- Survival mechanics ----
      if (gs.mode === "survival") {
        const ds = DIFF_SETTINGS[gs.difficulty];
        gs.hunger -= ds.hungerRate * dt;
        if (gs.hunger <= 0) {
          gs.hunger = 0;
          gs.hp -= 0.01 * ds.dmgMul * dt;
        }
        // Eating wood restores hunger (simplified)
        if (keysRef.current.has("e") && gs.inventory["wood"] && gs.inventory["wood"] > 0 && gs.hunger < 80) {
          gs.inventory["wood"]--;
          if (gs.inventory["wood"] <= 0) delete gs.inventory["wood"];
          gs.hunger = Math.min(100, gs.hunger + 25);
          gs.hp = Math.min(gs.hpMax, gs.hp + 2);
          playSound("score");
        }
        if (gs.hp <= 0) {
          gs.hp = 0;
          setPhase("gameover");
          setScore(gs.score);
          submitScore(gs.score);
          playSound("gameOver");
          return;
        }
      }

      setScore(gs.score);
      updateParticles(gs);

      // ---- Render ----
      ctx.save();
      ctx.scale(dpr, dpr);

      // Sky with day/night cycle
      const dayProgress = gs.dayTime / gs.dayLength;
      const isNight = dayProgress > 0.5;
      const nightFactor = isNight
        ? Math.min(1, (dayProgress - 0.5) * 4, (1 - dayProgress) * 4)
        : 0;
      const dayFactor = !isNight
        ? Math.min(1, dayProgress * 4, (0.5 - dayProgress) * 4)
        : 0;

      const skyR = Math.floor(10 + 100 * dayFactor);
      const skyG = Math.floor(10 + 150 * dayFactor);
      const skyB = Math.floor(30 + 200 * dayFactor);
      ctx.fillStyle = `rgb(${skyR},${skyG},${skyB})`;
      ctx.fillRect(0, 0, W, H);

      // Stars at night
      if (nightFactor > 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${nightFactor * 0.8})`;
        for (let i = 0; i < 30; i++) {
          const sx = ((i * 137 + 50) % W);
          const sy = ((i * 97 + 30) % (H * 0.4));
          ctx.fillRect(sx, sy, 1.5, 1.5);
        }
      }

      // Sun / Moon
      const celestialX = dayProgress * W * 1.2 - W * 0.1;
      const celestialY = 30 + Math.sin(dayProgress * Math.PI) * -20 + 40;
      if (!isNight) {
        ctx.fillStyle = "#FFD700";
        ctx.beginPath();
        ctx.arc(celestialX, celestialY, 12, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(200,200,220,${nightFactor})`;
        ctx.beginPath();
        ctx.arc(W - celestialX + W * 0.1, celestialY, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Blocks
      const startCol = Math.floor(gs.camX);
      const startRow = Math.floor(gs.camY);
      const offX = (gs.camX - startCol) * GRID;
      const offY = (gs.camY - startRow) * GRID;

      for (let vy = -1; vy <= VIEW_ROWS + 1; vy++) {
        for (let vx = -1; vx <= VIEW_COLS + 1; vx++) {
          const gx = startCol + vx;
          const gy = startRow + vy;
          if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue;
          const block = gs.grid[gy][gx];
          if (block === "air") continue;

          const bDef = BLOCK_DEFS[block];
          const px = vx * GRID - offX;
          const py = vy * GRID - offY;

          if (block === "water") {
            ctx.fillStyle = `rgba(30,144,255,${0.5 + Math.sin(gs.totalTime * 0.05 + gx) * 0.1})`;
          } else if (block === "glass") {
            ctx.fillStyle = "rgba(135,206,235,0.4)";
          } else {
            ctx.fillStyle = bDef.color;
          }
          ctx.fillRect(px, py, GRID, GRID);

          // Block shading (top highlight, bottom shadow)
          if (block !== "water" && block !== "glass") {
            ctx.fillStyle = "rgba(255,255,255,0.08)";
            ctx.fillRect(px, py, GRID, 2);
            ctx.fillStyle = "rgba(0,0,0,0.15)";
            ctx.fillRect(px, py + GRID - 2, GRID, 2);
            ctx.fillRect(px + GRID - 1, py, 1, GRID);
          }

          // Ore sparkle
          if (block === "ore") {
            ctx.fillStyle = "#FFD700";
            ctx.fillRect(px + 4, py + 4, 3, 3);
            ctx.fillRect(px + 10, py + 8, 2, 2);
            ctx.fillRect(px + 6, py + 11, 2, 2);
          }
        }
      }

      // Break progress indicator
      if (gs.breakX >= 0 && gs.breakY >= 0) {
        const bx = (gs.breakX - gs.camX) * GRID;
        const by = (gs.breakY - gs.camY) * GRID;
        const target = gs.grid[gs.breakY]?.[gs.breakX];
        if (target && target !== "air") {
          const pct = gs.breakProgress / BLOCK_DEFS[target].breakTime;
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.lineWidth = 2;
          ctx.strokeRect(bx + 1, by + 1, GRID - 2, GRID - 2);
          // Crack overlay
          ctx.fillStyle = `rgba(0,0,0,${pct * 0.5})`;
          ctx.fillRect(bx, by, GRID, GRID);
          // Progress bar
          ctx.fillStyle = "#3ea6ff";
          ctx.fillRect(bx, by - 4, GRID * pct, 3);
        }
      }

      // Cursor highlight
      if (worldX >= 0 && worldX < COLS && worldY >= 0 && worldY < ROWS) {
        const cx = (worldX - gs.camX) * GRID;
        const cy = (worldY - gs.camY) * GRID;
        ctx.strokeStyle = "rgba(62,166,255,0.6)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx, cy, GRID, GRID);
      }

      // Particles
      for (const p of gs.particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // Night overlay
      if (nightFactor > 0) {
        ctx.fillStyle = `rgba(0,0,20,${nightFactor * 0.5})`;
        ctx.fillRect(0, 0, W, H);
      }

      // HUD
      if (gs.mode === "survival") {
        // HP bar
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(8, 8, 104, 14);
        ctx.fillStyle = gs.hp > gs.hpMax * 0.3 ? "#e74c3c" : "#ff0000";
        ctx.fillRect(10, 10, (gs.hp / gs.hpMax) * 100, 10);
        ctx.fillStyle = "#fff";
        ctx.font = "9px monospace";
        ctx.fillText(`HP ${Math.ceil(gs.hp)}/${gs.hpMax}`, 12, 18);

        // Hunger bar
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(8, 26, 104, 14);
        ctx.fillStyle = gs.hunger > 30 ? "#f39c12" : "#e67e22";
        ctx.fillRect(10, 28, gs.hunger, 10);
        ctx.fillStyle = "#fff";
        ctx.fillText(`饥饿 ${Math.ceil(gs.hunger)}%`, 12, 36);
      }

      // Score
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W - 100, 8, 92, 16);
      ctx.fillStyle = "#3ea6ff";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`分数: ${gs.score}`, W - 96, 20);

      // Day/night indicator
      const timeIcon = isNight ? "夜" : "昼";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W - 100, 28, 92, 16);
      ctx.fillStyle = isNight ? "#7f8fa6" : "#FFD700";
      ctx.fillText(`${timeIcon} ${Math.floor(dayProgress * 24)}:00`, W - 96, 40);

      // Selected block indicator
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W / 2 - 60, H - 28, 120, 24);
      ctx.fillStyle = BLOCK_DEFS[gs.selectedBlock].color;
      ctx.fillRect(W / 2 - 54, H - 24, 16, 16);
      ctx.fillStyle = "#fff";
      ctx.font = "10px sans-serif";
      ctx.fillText(BLOCK_DEFS[gs.selectedBlock].name, W / 2 - 34, H - 12);

      // Mini inventory count for survival
      if (gs.mode === "survival") {
        const cnt = gs.inventory[gs.selectedBlock] || 0;
        ctx.fillStyle = "#aaa";
        ctx.fillText(`x${cnt}`, W / 2 + 30, H - 12);
      }

      // Controls hint
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, H - 14, W, 14);
      ctx.fillStyle = "#666";
      ctx.font = "9px sans-serif";
      const hint = gs.mode === "survival"
        ? "WASD移动 | 左键放置 | 右键挖掘 | E吃木头 | Q切换方块"
        : "WASD移动 | 左键放置 | 右键移除 | Q切换方块";
      ctx.fillText(hint, 8, H - 4);

      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [phase, physicsTick, spawnParticles, updateParticles, playSound, submitScore, selectedBlock]);


  /* ---- Keyboard ---- */
  useEffect(() => {
    if (phase !== "playing") return;
    const onDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.add(key);
      if (key === "q") {
        // Cycle selected block
        const gs = stateRef.current;
        if (!gs) return;
        const available = gs.mode === "creative"
          ? PLACEABLE_BLOCKS
          : PLACEABLE_BLOCKS.filter(b => gs.inventory[b] && gs.inventory[b] > 0);
        if (available.length === 0) return;
        const idx = available.indexOf(gs.selectedBlock);
        const next = available[(idx + 1) % available.length];
        gs.selectedBlock = next;
        setSelectedBlock(next);
        playSound("click");
      }
      if (key === "escape") {
        setPhase("paused");
      }
      // Number keys 1-9 for quick block select
      const num = parseInt(key);
      if (num >= 1 && num <= 9) {
        const gs = stateRef.current;
        if (!gs) return;
        const available = gs.mode === "creative"
          ? PLACEABLE_BLOCKS
          : PLACEABLE_BLOCKS.filter(b => gs.inventory[b] && gs.inventory[b] > 0);
        if (num - 1 < available.length) {
          gs.selectedBlock = available[num - 1];
          setSelectedBlock(available[num - 1]);
          playSound("click");
        }
      }
      if (key === "tab") {
        e.preventDefault();
        setShowInventory(prev => !prev);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      keysRef.current.clear();
    };
  }, [phase, playSound]);

  /* ---- Mouse / Touch ---- */
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    };

    const onMouseDown = (e: MouseEvent) => {
      const p = getPos(e);
      mouseRef.current = { x: p.x, y: p.y, down: true, right: e.button === 2 };
    };
    const onMouseMove = (e: MouseEvent) => {
      const p = getPos(e);
      mouseRef.current.x = p.x;
      mouseRef.current.y = p.y;
    };
    const onMouseUp = () => {
      mouseRef.current.down = false;
      mouseRef.current.right = false;
    };
    const onContext = (e: Event) => e.preventDefault();

    // Touch: single tap = place, long press = break
    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    let touchIsLong = false;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const p = getPos(e.touches[0]);
      mouseRef.current = { x: p.x, y: p.y, down: true, right: false };
      touchIsLong = false;
      touchTimer = setTimeout(() => {
        touchIsLong = true;
        mouseRef.current.right = true;
      }, 300);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const p = getPos(e.touches[0]);
      mouseRef.current.x = p.x;
      mouseRef.current.y = p.y;
      // If moved significantly, cancel long press
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      mouseRef.current.down = false;
      mouseRef.current.right = false;
      touchIsLong = false;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContext);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      if (touchTimer) clearTimeout(touchTimer);
    };
  }, [phase]);

  /* ---- Block selection from UI ---- */
  const selectBlock = useCallback((b: BlockType) => {
    const gs = stateRef.current;
    if (!gs) return;
    gs.selectedBlock = b;
    setSelectedBlock(b);
    playSound("click");
  }, [playSound]);

  /* ---- Resume / Restart ---- */
  const resume = useCallback(() => {
    setPhase("playing");
    playSound("click");
  }, [playSound]);

  const restart = useCallback(() => {
    startGame(mode, difficulty);
  }, [startGame, mode, difficulty]);

  /* ================================================================
     RENDER
     ================================================================ */

  // Title screen
  if (phase === "title") {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-6">
            <ChevronLeft size={16} /> 返回游戏中心
          </Link>

          <div className="text-center py-8">
            <Box size={48} className="text-[#3ea6ff] mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">2D 沙盒建造</h1>
            <p className="text-gray-400 mb-8">自由建造你的世界，探索、采集、生存</p>

            {/* Mode selection */}
            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-3">选择模式</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setMode("creative")}
                  className={`px-5 py-3 rounded-lg border text-sm font-medium transition ${
                    mode === "creative"
                      ? "border-[#3ea6ff] bg-[#3ea6ff]/20 text-[#3ea6ff]"
                      : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                  }`}
                >
                  <Pickaxe size={18} className="inline mr-2" />
                  创意模式
                  <span className="block text-xs text-gray-500 mt-1">无限资源自由建造</span>
                </button>
                <button
                  onClick={() => setMode("survival")}
                  className={`px-5 py-3 rounded-lg border text-sm font-medium transition ${
                    mode === "survival"
                      ? "border-[#3ea6ff] bg-[#3ea6ff]/20 text-[#3ea6ff]"
                      : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                  }`}
                >
                  <Shield size={18} className="inline mr-2" />
                  生存模式
                  <span className="block text-xs text-gray-500 mt-1">采集资源、管理生命</span>
                </button>
              </div>
            </div>

            {/* Difficulty */}
            <div className="mb-8">
              <p className="text-sm text-gray-400 mb-3">选择难度</p>
              <div className="flex justify-center gap-2">
                {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`px-4 py-2 rounded-lg border text-xs font-medium transition ${
                      difficulty === d
                        ? "border-[#3ea6ff] bg-[#3ea6ff]/20 text-[#3ea6ff]"
                        : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                    }`}
                  >
                    {d === "easy" ? "简单" : d === "normal" ? "普通" : "困难"}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => startGame(mode, difficulty)}
              className="px-8 py-3 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg font-bold text-lg hover:bg-[#3ea6ff]/80 transition"
            >
              <Play size={20} className="inline mr-2" />
              开始游戏
            </button>

            {/* Controls */}
            <div className="mt-8 text-left max-w-md mx-auto bg-[#1a1a1a] rounded-xl border border-[#333] p-4">
              <h3 className="text-sm font-bold text-[#3ea6ff] mb-2">操作说明</h3>
              <div className="text-xs text-gray-400 space-y-1">
                <p>WASD / 方向键 — 移动视角</p>
                <p>鼠标左键 / 触摸 — 放置方块</p>
                <p>鼠标右键 / 长按 — 挖掘方块</p>
                <p>Q / 数字键1-9 — 切换方块类型</p>
                <p>E — 吃木头恢复饥饿（生存模式）</p>
                <p>Tab — 打开背包</p>
                <p>Esc — 暂停</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </div>
      </div>
    );
  }


  // Paused screen
  if (phase === "paused") {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="text-center py-12">
            <Box size={36} className="text-[#3ea6ff] mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">游戏暂停</h2>
            <p className="text-gray-400 text-sm mb-2">
              模式: {mode === "creative" ? "创意" : "生存"} |
              难度: {difficulty === "easy" ? "简单" : difficulty === "normal" ? "普通" : "困难"}
            </p>
            <p className="text-[#3ea6ff] font-bold mb-6">分数: {score}</p>
            <div className="flex justify-center gap-3">
              <button onClick={resume}
                className="px-6 py-2 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg font-bold hover:bg-[#3ea6ff]/80 transition">
                继续游戏
              </button>
              <button onClick={restart}
                className="px-6 py-2 bg-white/10 rounded-lg font-medium hover:bg-white/20 transition">
                <RotateCcw size={14} className="inline mr-1" /> 重新开始
              </button>
              <button onClick={() => setPhase("title")}
                className="px-6 py-2 bg-white/10 rounded-lg font-medium hover:bg-white/20 transition">
                返回标题
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </div>
      </div>
    );
  }

  // Game over screen (survival only)
  if (phase === "gameover") {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="text-center py-12">
            <Heart size={36} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">你倒下了</h2>
            <p className="text-gray-400 text-sm mb-2">
              难度: {difficulty === "easy" ? "简单" : difficulty === "normal" ? "普通" : "困难"}
            </p>
            <p className="text-3xl font-bold text-[#f0b90b] mb-6">{score} 分</p>
            <div className="flex justify-center gap-3">
              <button onClick={restart}
                className="px-6 py-2 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg font-bold hover:bg-[#3ea6ff]/80 transition">
                <RotateCcw size={14} className="inline mr-1" /> 再来一次
              </button>
              <button onClick={() => setPhase("title")}
                className="px-6 py-2 bg-white/10 rounded-lg font-medium hover:bg-white/20 transition">
                返回标题
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </div>
      </div>
    );
  }

  // Playing screen
  const gs = stateRef.current;
  const availableBlocks = gs
    ? (gs.mode === "creative"
        ? PLACEABLE_BLOCKS
        : PLACEABLE_BLOCKS.filter(b => gs.inventory[b] && gs.inventory[b] > 0))
    : PLACEABLE_BLOCKS;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff]">
            <ChevronLeft size={16} /> 返回
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {mode === "creative" ? "创意模式" : "生存模式"} |
              {difficulty === "easy" ? " 简单" : difficulty === "normal" ? " 普通" : " 困难"}
            </span>
            <button onClick={() => setMuted(!muted)}
              className="p-1.5 rounded hover:bg-white/10 transition text-gray-400">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button onClick={() => setPhase("paused")}
              className="px-3 py-1 text-xs bg-white/10 rounded hover:bg-white/20 transition">
              暂停
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Canvas */}
          <div className="flex-shrink-0">
            <canvas
              ref={canvasRef}
              className="rounded-lg border border-white/10 cursor-crosshair"
              style={{ width: W, height: H }}
            />

            {/* Block palette */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {availableBlocks.map((b, i) => (
                <button
                  key={b}
                  onClick={() => selectBlock(b)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition ${
                    selectedBlock === b
                      ? "border-[#3ea6ff] bg-[#3ea6ff]/20 text-white"
                      : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                  }`}
                  title={`${i + 1}: ${BLOCK_DEFS[b].name}`}
                >
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: BLOCK_DEFS[b].color }}
                  />
                  {BLOCK_DEFS[b].name}
                  {gs?.mode === "survival" && (
                    <span className="text-gray-500 text-[10px]">
                      x{gs.inventory[b] || 0}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Inventory overlay */}
            {showInventory && gs && (
              <div className="mt-2 bg-[#1a1a1a] border border-[#333] rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-[#3ea6ff]">背包</h3>
                  <button onClick={() => setShowInventory(false)} className="text-gray-500 hover:text-white">
                    <span className="text-xs">关闭</span>
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(gs.inventory).map(([block, count]) => (
                    <button
                      key={block}
                      onClick={() => selectBlock(block as BlockType)}
                      className={`flex flex-col items-center p-2 rounded border text-xs ${
                        selectedBlock === block
                          ? "border-[#3ea6ff] bg-[#3ea6ff]/10"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-sm mb-1"
                        style={{ backgroundColor: BLOCK_DEFS[block as BlockType]?.color || "#666" }}
                      />
                      <span className="text-gray-400">{BLOCK_DEFS[block as BlockType]?.name || block}</span>
                      <span className="text-[#f0b90b]">{count as number}</span>
                    </button>
                  ))}
                  {Object.keys(gs.inventory).length === 0 && (
                    <p className="col-span-5 text-center text-gray-500 text-xs py-2">背包为空</p>
                  )}
                </div>
              </div>
            )}

            {/* Mobile controls */}
            <div className="mt-3 flex justify-center gap-2 md:hidden">
              <div className="grid grid-cols-3 gap-1">
                <div />
                <button
                  onTouchStart={() => keysRef.current.add("w")}
                  onTouchEnd={() => keysRef.current.delete("w")}
                  className="w-10 h-10 bg-white/10 rounded flex items-center justify-center text-xs font-bold"
                >
                  W
                </button>
                <div />
                <button
                  onTouchStart={() => keysRef.current.add("a")}
                  onTouchEnd={() => keysRef.current.delete("a")}
                  className="w-10 h-10 bg-white/10 rounded flex items-center justify-center text-xs font-bold"
                >
                  A
                </button>
                <button
                  onTouchStart={() => keysRef.current.add("s")}
                  onTouchEnd={() => keysRef.current.delete("s")}
                  className="w-10 h-10 bg-white/10 rounded flex items-center justify-center text-xs font-bold"
                >
                  S
                </button>
                <button
                  onTouchStart={() => keysRef.current.add("d")}
                  onTouchEnd={() => keysRef.current.delete("d")}
                  className="w-10 h-10 bg-white/10 rounded flex items-center justify-center text-xs font-bold"
                >
                  D
                </button>
              </div>
              <div className="flex flex-col gap-1 ml-4">
                <button
                  onClick={() => {
                    const g = stateRef.current;
                    if (!g) return;
                    const avail = g.mode === "creative"
                      ? PLACEABLE_BLOCKS
                      : PLACEABLE_BLOCKS.filter(bl => g.inventory[bl] && g.inventory[bl] > 0);
                    if (avail.length === 0) return;
                    const idx = avail.indexOf(g.selectedBlock);
                    const next = avail[(idx + 1) % avail.length];
                    g.selectedBlock = next;
                    setSelectedBlock(next);
                  }}
                  className="w-10 h-10 bg-[#3ea6ff]/20 border border-[#3ea6ff] rounded flex items-center justify-center text-xs font-bold text-[#3ea6ff]"
                >
                  Q
                </button>
                {mode === "survival" && (
                  <button
                    onClick={() => keysRef.current.add("e")}
                    onTouchEnd={() => keysRef.current.delete("e")}
                    className="w-10 h-10 bg-[#f39c12]/20 border border-[#f39c12] rounded flex items-center justify-center text-xs font-bold text-[#f39c12]"
                  >
                    E
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Side panel (desktop) */}
          <div className="hidden md:flex flex-col gap-4 w-64 flex-shrink-0">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </div>

        {/* Side panel (mobile) */}
        <div className="md:hidden grid grid-cols-1 gap-4 mt-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </div>
    </div>
  );
}
