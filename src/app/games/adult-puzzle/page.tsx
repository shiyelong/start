"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, Volume2, VolumeX, Gem, Lock, Play, RotateCcw,
  Trophy, Star, Sparkles, Bomb, Palette, Target, Zap
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-puzzle";
const W = 480, H = 580;
const GRID = 8;
const CELL = 48;
const BOARD_OX = (W - GRID * CELL) / 2;
const BOARD_OY = 90;
const PRIMARY = "#a55eea", ACCENT = "#3ea6ff", BG = "#0f0f0f";
const GEM_COLORS = ["#ff4757", "#3ea6ff", "#2ed573", "#ffa502", "#a55eea", "#ff6b81"];
const GEM_NAMES = ["红宝石", "蓝宝石", "翡翠", "琥珀", "紫晶", "粉钻"];
const NUM_COLORS = GEM_COLORS.length;
// Special gem types: -2 = bomb, -3 = rainbow
const BOMB_GEM = -2;
const RAINBOW_GEM = -3;

// ─── Types ───────────────────────────────────────────────────────────────────
type Difficulty = "easy" | "normal" | "hard";
type Phase = "title" | "diffSelect" | "playing" | "animating" | "levelComplete" | "gameOver" | "gameComplete";

interface LevelConfig {
  targetScore: number;
  maxMoves: number;
  bombChance: number;
  rainbowChance: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}

interface AnimGem {
  r: number; c: number;
  fromR: number; fromC: number;
  progress: number;
}

interface GameState {
  board: number[][];
  score: number;
  totalScore: number;
  level: number;
  moves: number;
  maxMoves: number;
  targetScore: number;
  selected: [number, number] | null;
  combo: number;
  msg: string;
  msgTimer: number;
  particles: Particle[];
  animGems: AnimGem[];
  swapAnim: { r1: number; c1: number; r2: number; c2: number; progress: number; reverting: boolean } | null;
  rewardScene: number;
}

// ─── Level Configs ───────────────────────────────────────────────────────────
function getLevelConfigs(diff: Difficulty): LevelConfig[] {
  const mult = diff === "easy" ? 0.7 : diff === "hard" ? 1.5 : 1.0;
  const moveMult = diff === "easy" ? 1.4 : diff === "hard" ? 0.7 : 1.0;
  return Array.from({ length: 10 }, (_, i) => ({
    targetScore: Math.floor((800 + i * 600) * mult),
    maxMoves: Math.floor((25 + Math.max(0, 5 - i)) * moveMult),
    bombChance: 0.02 + i * 0.005,
    rainbowChance: 0.01 + i * 0.003,
  }));
}

// ─── Board Helpers ───────────────────────────────────────────────────────────
function randomGem(): number {
  return Math.floor(Math.random() * NUM_COLORS);
}

function makeBoard(): number[][] {
  const b: number[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => randomGem())
  );
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      while (
        (c >= 2 && b[r][c] === b[r][c - 1] && b[r][c] === b[r][c - 2]) ||
        (r >= 2 && b[r][c] === b[r - 1][c] && b[r][c] === b[r - 2][c])
      ) {
        b[r][c] = randomGem();
      }
    }
  }
  return b;
}

function findMatches(b: number[][]): Set<string> {
  const matched = new Set<string>();
  // Horizontal
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID - 2; c++) {
      if (b[r][c] >= 0 && b[r][c] === b[r][c + 1] && b[r][c] === b[r][c + 2]) {
        matched.add(`${r},${c}`);
        matched.add(`${r},${c + 1}`);
        matched.add(`${r},${c + 2}`);
        // Extend
        let e = c + 3;
        while (e < GRID && b[r][e] === b[r][c]) { matched.add(`${r},${e}`); e++; }
      }
    }
  }
  // Vertical
  for (let r = 0; r < GRID - 2; r++) {
    for (let c = 0; c < GRID; c++) {
      if (b[r][c] >= 0 && b[r][c] === b[r + 1][c] && b[r][c] === b[r + 2][c]) {
        matched.add(`${r},${c}`);
        matched.add(`${r + 1},${c}`);
        matched.add(`${r + 2},${c}`);
        let e = r + 3;
        while (e < GRID && b[e][c] === b[r][c]) { matched.add(`${e},${c}`); e++; }
      }
    }
  }
  return matched;
}

function parseCoord(s: string): [number, number] {
  const [r, c] = s.split(",").map(Number);
  return [r, c];
}


// ─── Check if any valid moves exist ──────────────────────────────────────────
function hasValidMoves(b: number[][]): boolean {
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      // Try swap right
      if (c < GRID - 1) {
        [b[r][c], b[r][c + 1]] = [b[r][c + 1], b[r][c]];
        if (findMatches(b).size > 0) { [b[r][c], b[r][c + 1]] = [b[r][c + 1], b[r][c]]; return true; }
        [b[r][c], b[r][c + 1]] = [b[r][c + 1], b[r][c]];
      }
      // Try swap down
      if (r < GRID - 1) {
        [b[r][c], b[r + 1][c]] = [b[r + 1][c], b[r][c]];
        if (findMatches(b).size > 0) { [b[r][c], b[r + 1][c]] = [b[r + 1][c], b[r][c]]; return true; }
        [b[r][c], b[r + 1][c]] = [b[r + 1][c], b[r][c]];
      }
      // Special gems always count as valid
      if (b[r][c] === BOMB_GEM || b[r][c] === RAINBOW_GEM) return true;
    }
  }
  return false;
}

// ─── Apply gravity and fill ──────────────────────────────────────────────────
function applyGravity(b: number[][], levelCfg: LevelConfig): AnimGem[] {
  const anims: AnimGem[] = [];
  for (let c = 0; c < GRID; c++) {
    let writeRow = GRID - 1;
    for (let r = GRID - 1; r >= 0; r--) {
      if (b[r][c] !== -1) {
        if (writeRow !== r) {
          b[writeRow][c] = b[r][c];
          b[r][c] = -1;
          anims.push({ r: writeRow, c, fromR: r, fromC: c, progress: 0 });
        }
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 0; r--) {
      // Chance for special gems
      const rng = Math.random();
      if (rng < levelCfg.rainbowChance) {
        b[r][c] = RAINBOW_GEM;
      } else if (rng < levelCfg.rainbowChance + levelCfg.bombChance) {
        b[r][c] = BOMB_GEM;
      } else {
        b[r][c] = randomGem();
      }
      anims.push({ r, c, fromR: r - (writeRow - r + 1), fromC: c, progress: 0 });
    }
  }
  return anims;
}

// ─── Spawn particles ─────────────────────────────────────────────────────────
function spawnParticles(particles: Particle[], r: number, c: number, color: string, count: number) {
  const cx = BOARD_OX + c * CELL + CELL / 2;
  const cy = BOARD_OY + r * CELL + CELL / 2;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

// ─── Reward scene descriptions ───────────────────────────────────────────────
const REWARD_SCENES = [
  "月光花园 - 神秘的月光洒落在宝石花园中",
  "深海秘境 - 海底宫殿的宝石闪烁着幽蓝光芒",
  "火焰神殿 - 熔岩中诞生的稀世红宝石",
  "星空密室 - 银河中漂浮的紫晶星尘",
  "翡翠迷宫 - 被翡翠藤蔓环绕的秘密花园",
  "琥珀时光 - 封存万年记忆的琥珀宫殿",
  "钻石瀑布 - 流淌着液态钻石的瀑布",
  "彩虹桥 - 连接七色宝石世界的彩虹之桥",
  "暗影宝库 - 暗影中闪耀的终极宝藏",
  "宝石王座 - 由万千宝石铸就的至高王座",
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdultPuzzle() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [displayScore, setDisplayScore] = useState(0);

  const gameRef = useRef<GameState>({
    board: makeBoard(),
    score: 0,
    totalScore: 0,
    level: 0,
    moves: 25,
    maxMoves: 25,
    targetScore: 800,
    selected: null,
    combo: 0,
    msg: "",
    msgTimer: 0,
    particles: [],
    animGems: [],
    swapAnim: null,
    rewardScene: 0,
  });

  const stateRef = useRef({ phase, difficulty, muted });
  useEffect(() => { stateRef.current = { phase, difficulty, muted }; });

  // ─── Age Gate ──────────────────────────────────────────────────────────────
  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  // ─── Sound ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playSound = useCallback((type: "click" | "match" | "combo" | "swap" | "bomb" | "rainbow" | "levelup" | "gameover" | "special") => {
    const s = soundRef.current;
    if (!s || stateRef.current.muted) return;
    switch (type) {
      case "click": s.playClick(); break;
      case "match": s.playScore(10); break;
      case "combo": s.playCombo(3); break;
      case "swap": s.playMove(); break;
      case "bomb": s.playTone(120, 0.3, "sawtooth"); break;
      case "rainbow": s.playCombo(5); break;
      case "levelup": s.playLevelUp(); break;
      case "gameover": s.playGameOver(); break;
      case "special": s.playTone(880, 0.15, "sine"); break;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(m ?? false);
  }, []);


  // ─── Process matches (recursive cascade) ───────────────────────────────────
  const processMatches = useCallback((g: GameState, levelCfg: LevelConfig): number => {
    let totalCleared = 0;
    let cascadeCount = 0;
    const maxCascades = 20;

    const doOneCascade = (): boolean => {
      const matches = findMatches(g.board);
      if (matches.size === 0) return false;

      cascadeCount++;
      const matchArr = Array.from(matches).map(parseCoord);
      totalCleared += matchArr.length;

      // Check for special gem triggers in matched cells
      const extraClears = new Set<string>();
      for (const [mr, mc] of matchArr) {
        const val = g.board[mr][mc];
        if (val === BOMB_GEM) {
          // Bomb: clear 3x3 around it
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = mr + dr, nc = mc + dc;
              if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
                extraClears.add(`${nr},${nc}`);
              }
            }
          }
          playSound("bomb");
        }
        if (val === RAINBOW_GEM) {
          // Rainbow: clear all gems of a random color present on board
          const colorCounts: number[] = Array(NUM_COLORS).fill(0);
          for (let rr = 0; rr < GRID; rr++) {
            for (let cc = 0; cc < GRID; cc++) {
              if (g.board[rr][cc] >= 0 && g.board[rr][cc] < NUM_COLORS) colorCounts[g.board[rr][cc]]++;
            }
          }
          const maxColor = colorCounts.indexOf(Math.max(...colorCounts));
          for (let rr = 0; rr < GRID; rr++) {
            for (let cc = 0; cc < GRID; cc++) {
              if (g.board[rr][cc] === maxColor) extraClears.add(`${rr},${cc}`);
            }
          }
          playSound("rainbow");
        }
      }

      // Merge extra clears
      for (const ec of extraClears) {
        if (!matches.has(ec)) {
          totalCleared++;
          matches.add(ec);
        }
      }

      // Spawn particles for cleared gems
      for (const coord of matches) {
        const [mr, mc] = parseCoord(coord);
        const val = g.board[mr][mc];
        const color = val >= 0 && val < NUM_COLORS ? GEM_COLORS[val] : val === BOMB_GEM ? "#ff8800" : "#ffffff";
        spawnParticles(g.particles, mr, mc, color, 6);
        g.board[mr][mc] = -1;
      }

      // Gravity
      applyGravity(g.board, levelCfg);

      if (cascadeCount > 1) {
        g.combo = cascadeCount;
        playSound("combo");
      } else {
        playSound("match");
      }

      return cascadeCount < maxCascades;
    };

    while (doOneCascade()) { /* cascade loop */ }

    return totalCleared;
  }, [playSound]);

  // ─── Start Level ───────────────────────────────────────────────────────────
  const startLevel = useCallback((level: number, diff: Difficulty, keepTotalScore?: number) => {
    const configs = getLevelConfigs(diff);
    const cfg = configs[Math.min(level, configs.length - 1)];
    const g = gameRef.current;
    g.board = makeBoard();
    g.score = 0;
    g.totalScore = keepTotalScore ?? g.totalScore;
    g.level = level;
    g.moves = cfg.maxMoves;
    g.maxMoves = cfg.maxMoves;
    g.targetScore = cfg.targetScore;
    g.selected = null;
    g.combo = 0;
    g.msg = `第 ${level + 1} 关 - 目标: ${cfg.targetScore}分`;
    g.msgTimer = 90;
    g.particles = [];
    g.animGems = [];
    g.swapAnim = null;
    g.rewardScene = level;

    // Process any initial matches
    processMatches(g, cfg);

    // Ensure valid moves exist
    if (!hasValidMoves(g.board)) {
      g.board = makeBoard();
      processMatches(g, cfg);
    }

    setPhase("playing");
    setDisplayScore(g.totalScore);
  }, [processMatches]);

  // ─── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    gameRef.current.totalScore = 0;
    startLevel(0, diff, 0);
    playSound("click");
  }, [startLevel, playSound]);

  // ─── Perform Swap ──────────────────────────────────────────────────────────
  const performSwap = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    const g = gameRef.current;
    const b = g.board;
    const diff = stateRef.current.difficulty;
    const configs = getLevelConfigs(diff);
    const cfg = configs[Math.min(g.level, configs.length - 1)];

    // Swap
    [b[r1][c1], b[r2][c2]] = [b[r2][c2], b[r1][c1]];

    // Check for special gem swap (bomb or rainbow clicked)
    const isSpecialSwap = b[r1][c1] === BOMB_GEM || b[r1][c1] === RAINBOW_GEM ||
                          b[r2][c2] === BOMB_GEM || b[r2][c2] === RAINBOW_GEM;

    const matches = findMatches(b);
    if (matches.size === 0 && !isSpecialSwap) {
      // Revert swap
      [b[r1][c1], b[r2][c2]] = [b[r2][c2], b[r1][c1]];
      g.msg = "无法消除";
      g.msgTimer = 40;
      playSound("click");
      return;
    }

    g.moves--;
    g.combo = 0;
    playSound("swap");

    // If special gem was swapped but no natural match, trigger it manually
    if (matches.size === 0 && isSpecialSwap) {
      // Trigger the special gem
      for (const [sr, sc] of [[r1, c1], [r2, c2]] as [number, number][]) {
        if (b[sr][sc] === BOMB_GEM) {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = sr + dr, nc = sc + dc;
              if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
                spawnParticles(g.particles, nr, nc, "#ff8800", 6);
                b[nr][nc] = -1;
              }
            }
          }
          playSound("bomb");
        } else if (b[sr][sc] === RAINBOW_GEM) {
          const targetColor = b[sr === r1 ? r2 : r1][sc === c1 ? c2 : c1];
          if (targetColor >= 0 && targetColor < NUM_COLORS) {
            for (let rr = 0; rr < GRID; rr++) {
              for (let cc = 0; cc < GRID; cc++) {
                if (b[rr][cc] === targetColor) {
                  spawnParticles(g.particles, rr, cc, GEM_COLORS[targetColor], 6);
                  b[rr][cc] = -1;
                }
              }
            }
          }
          b[sr][sc] = -1;
          playSound("rainbow");
        }
      }
      applyGravity(b, cfg);
    }

    // Process all cascading matches
    const cleared = processMatches(g, cfg);
    const comboBonus = g.combo > 1 ? g.combo * 15 : 0;
    const points = cleared * 25 + comboBonus;
    g.score += points;
    g.totalScore += points;
    setDisplayScore(g.totalScore);

    if (points > 0) {
      g.msg = `+${points}分${g.combo > 1 ? ` (${g.combo}连击)` : ""}`;
      g.msgTimer = 50;
    }

    // Check level complete
    if (g.score >= g.targetScore) {
      if (g.level >= 9) {
        setPhase("gameComplete");
        playSound("levelup");
      } else {
        setPhase("levelComplete");
        playSound("levelup");
      }
      return;
    }

    // Check game over
    if (g.moves <= 0) {
      setPhase("gameOver");
      playSound("gameover");
      return;
    }

    // Check if valid moves exist
    if (!hasValidMoves(b)) {
      // Reshuffle board
      g.board = makeBoard();
      processMatches(g, cfg);
      g.msg = "棋盘重排";
      g.msgTimer = 60;
    }
  }, [processMatches, playSound]);

  // ─── Handle Click ──────────────────────────────────────────────────────────
  const handleClick = useCallback((mx: number, my: number) => {
    const p = stateRef.current.phase;
    const g = gameRef.current;

    if (p === "title") {
      setPhase("diffSelect");
      playSound("click");
      return;
    }

    if (p === "diffSelect") {
      const diffs: { d: Difficulty; y: number }[] = [
        { d: "easy", y: 370 },
        { d: "normal", y: 410 },
        { d: "hard", y: 450 },
      ];
      for (const df of diffs) {
        if (mx > W / 2 - 120 && mx < W / 2 + 120 && my > df.y - 18 && my < df.y + 14) {
          startGame(df.d);
          return;
        }
      }
      return;
    }

    if (p === "levelComplete") {
      // Next level
      startLevel(g.level + 1, stateRef.current.difficulty);
      playSound("click");
      return;
    }

    if (p === "gameOver" || p === "gameComplete") {
      setPhase("title");
      playSound("click");
      return;
    }

    if (p !== "playing") return;

    // Board click
    const c = Math.floor((mx - BOARD_OX) / CELL);
    const r = Math.floor((my - BOARD_OY) / CELL);
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) {
      g.selected = null;
      return;
    }

    if (g.selected) {
      const [sr, sc] = g.selected;
      if (sr === r && sc === c) {
        g.selected = null;
        return;
      }
      if (Math.abs(sr - r) + Math.abs(sc - c) === 1) {
        g.selected = null;
        performSwap(sr, sc, r, c);
      } else {
        g.selected = [r, c];
        playSound("click");
      }
    } else {
      g.selected = [r, c];
      playSound("click");
    }
  }, [startGame, startLevel, performSwap, playSound]);


  // ─── Save / Load ───────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const g = gameRef.current;
    return {
      difficulty: stateRef.current.difficulty,
      phase: stateRef.current.phase,
      board: g.board.map(row => [...row]),
      score: g.score,
      totalScore: g.totalScore,
      level: g.level,
      moves: g.moves,
      maxMoves: g.maxMoves,
      targetScore: g.targetScore,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d) return;
    const g = gameRef.current;
    setDifficulty((d.difficulty as Difficulty) || "normal");
    g.board = (d.board as number[][]) || makeBoard();
    g.score = (d.score as number) || 0;
    g.totalScore = (d.totalScore as number) || 0;
    g.level = (d.level as number) || 0;
    g.moves = (d.moves as number) || 25;
    g.maxMoves = (d.maxMoves as number) || 25;
    g.targetScore = (d.targetScore as number) || 800;
    g.selected = null;
    g.combo = 0;
    g.msg = "存档已加载";
    g.msgTimer = 60;
    g.particles = [];
    g.animGems = [];
    g.swapAnim = null;
    setDisplayScore(g.totalScore);
    setPhase((d.phase as Phase) || "playing");
    playSound("click");
  }, [playSound]);

  // ─── Submit Score ──────────────────────────────────────────────────────────
  const submitScore = useCallback(async () => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: gameRef.current.totalScore }),
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (phase === "gameComplete" || phase === "gameOver") submitScore();
  }, [phase, submitScore]);

  // ─── Draw gem helper ───────────────────────────────────────────────────────
  const drawGem = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, val: number, size: number, glow: boolean) => {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size / 2 - 6;

    if (val === BOMB_GEM) {
      // Bomb gem
      ctx.fillStyle = "#ff8800";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Inner circle
      ctx.fillStyle = "#cc4400";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      // Cross lines
      ctx.strokeStyle = "#ffcc00";
      ctx.lineWidth = 2;
      for (let a = 0; a < 4; a++) {
        const angle = (a * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r * 0.4, cy + Math.sin(angle) * r * 0.4);
        ctx.lineTo(cx + Math.cos(angle) * r * 1.1, cy + Math.sin(angle) * r * 1.1);
        ctx.stroke();
      }
      return;
    }

    if (val === RAINBOW_GEM) {
      // Rainbow gem - rotating colors
      const t = frameRef.current * 0.05;
      for (let i = 0; i < 6; i++) {
        const angle = t + (i * Math.PI * 2) / 6;
        ctx.fillStyle = GEM_COLORS[i];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, angle, angle + Math.PI / 3);
        ctx.closePath();
        ctx.fill();
      }
      // White center
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (val < 0 || val >= NUM_COLORS) return;

    const color = GEM_COLORS[val];

    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }

    // Gem body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Inner shadow
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.arc(cx + r * 0.1, cy + r * 0.15, r * 0.7, 0, Math.PI * 2);
    ctx.fill();

    if (glow) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
  }, []);

  // ─── Canvas Render ─────────────────────────────────────────────────────────
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

    const render = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      frameRef.current++;
      const g = gameRef.current;
      const p = stateRef.current.phase;
      const t = frameRef.current * 0.03;

      // Update particles
      g.particles = g.particles.filter(pt => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.05;
        pt.life--;
        return pt.life > 0;
      });

      // Decrease msg timer
      if (g.msgTimer > 0) g.msgTimer--;

      if (p === "title" || p === "diffSelect") {
        // ─── Title Screen ────────────────────────────────────────────
        // Background floating gems
        for (let i = 0; i < 15; i++) {
          const gx = W / 2 + Math.cos(t + i * 0.7) * (100 + i * 12);
          const gy = 140 + Math.sin(t + i * 0.5) * 50 + i * 8;
          ctx.globalAlpha = 0.08 + 0.04 * Math.sin(t + i);
          ctx.fillStyle = GEM_COLORS[i % NUM_COLORS];
          ctx.beginPath();
          ctx.arc(gx, gy, 15 + i * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = PRIMARY;
        ctx.font = "bold 38px monospace";
        ctx.textAlign = "center";
        ctx.fillText("宝石秘境", W / 2, 90);

        ctx.fillStyle = "#ff4757";
        ctx.font = "13px monospace";
        ctx.fillText("NC-17 三消解谜", W / 2, 118);

        ctx.fillStyle = "#888";
        ctx.font = "12px monospace";
        ctx.fillText("8x8棋盘 / 6种宝石 / 10关挑战", W / 2, 142);
        ctx.fillText("特殊宝石: 炸弹 + 彩虹", W / 2, 160);

        // Preview gems
        for (let i = 0; i < 6; i++) {
          const gx = 80 + i * 60;
          const gy = 195 + Math.sin(t + i * 0.8) * 6;
          drawGem(ctx, gx, gy, i, 40, false);
          ctx.fillStyle = "#aaa";
          ctx.font = "9px monospace";
          ctx.textAlign = "center";
          ctx.fillText(GEM_NAMES[i], gx + 20, gy + 48);
        }

        // Special gem preview
        const bx = W / 2 - 60, by = 270;
        drawGem(ctx, bx, by, BOMB_GEM, 36, false);
        ctx.fillStyle = "#ff8800";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("炸弹", bx + 18, by + 44);

        drawGem(ctx, bx + 80, by, RAINBOW_GEM, 36, false);
        ctx.fillStyle = "#fff";
        ctx.fillText("彩虹", bx + 98, by + 44);

        if (p === "title") {
          const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.06);
          ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
          ctx.font = "16px monospace";
          ctx.textAlign = "center";
          ctx.fillText("点击开始", W / 2, 370);
        }

        if (p === "diffSelect") {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 16px monospace";
          ctx.textAlign = "center";
          ctx.fillText("选择难度", W / 2, 345);

          const diffs: { label: string; desc: string; d: Difficulty; color: string; y: number }[] = [
            { label: "简单", desc: "低目标分/多步数", d: "easy", color: "#2ed573", y: 370 },
            { label: "普通", desc: "标准挑战", d: "normal", color: "#ffa502", y: 410 },
            { label: "困难", desc: "高目标分/少步数", d: "hard", color: "#ff4757", y: 450 },
          ];
          diffs.forEach(df => {
            ctx.fillStyle = "#1a1a2e";
            ctx.beginPath();
            ctx.roundRect(W / 2 - 120, df.y - 18, 240, 32, 8);
            ctx.fill();
            ctx.strokeStyle = df.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 120, df.y - 18, 240, 32, 8);
            ctx.stroke();
            ctx.fillStyle = df.color;
            ctx.font = "bold 13px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${df.label} - ${df.desc}`, W / 2, df.y + 2);
          });
        }

      } else if (p === "playing" || p === "animating") {
        // ─── Playing Screen ──────────────────────────────────────────

        // HUD top bar
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, W, 82);

        // Level
        ctx.fillStyle = PRIMARY;
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`第 ${g.level + 1} 关`, 12, 20);

        // Score
        ctx.fillStyle = "#fff";
        ctx.font = "12px monospace";
        ctx.fillText(`分数: ${g.score} / ${g.targetScore}`, 12, 40);

        // Moves
        ctx.fillStyle = g.moves <= 5 ? "#ff4757" : "#aaa";
        ctx.fillText(`步数: ${g.moves} / ${g.maxMoves}`, 12, 58);

        // Total score
        ctx.fillStyle = "#ffd700";
        ctx.font = "12px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`总分: ${g.totalScore}`, W - 12, 20);

        // Combo
        if (g.combo > 1) {
          ctx.fillStyle = "#ff4757";
          ctx.font = "bold 12px monospace";
          ctx.textAlign = "right";
          ctx.fillText(`${g.combo}连击!`, W - 12, 40);
        }

        // Progress bar
        const progW = W - 24;
        const progRatio = Math.min(1, g.score / g.targetScore);
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.roundRect(12, 66, progW, 10, 4);
        ctx.fill();
        ctx.fillStyle = progRatio >= 1 ? "#2ed573" : ACCENT;
        ctx.beginPath();
        ctx.roundRect(12, 66, progW * progRatio, 10, 4);
        ctx.fill();

        // Board background
        ctx.fillStyle = "#0d0d1a";
        ctx.beginPath();
        ctx.roundRect(BOARD_OX - 4, BOARD_OY - 4, GRID * CELL + 8, GRID * CELL + 8, 8);
        ctx.fill();

        // Draw grid cells and gems
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            const x = BOARD_OX + c * CELL;
            const y = BOARD_OY + r * CELL;
            const isSelected = g.selected && g.selected[0] === r && g.selected[1] === c;

            // Cell background
            ctx.fillStyle = isSelected ? "#2a2a4e" : ((r + c) % 2 === 0 ? "#151528" : "#1a1a30");
            ctx.fillRect(x, y, CELL, CELL);

            if (isSelected) {
              ctx.strokeStyle = "#fff";
              ctx.lineWidth = 2;
              ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
            }

            // Draw gem
            const val = g.board[r][c];
            if (val !== -1) {
              drawGem(ctx, x + 2, y + 2, val, CELL - 4, isSelected || false);
            }
          }
        }

        // Message
        if (g.msgTimer > 0 && g.msg) {
          const alpha = Math.min(1, g.msgTimer / 20);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "#ffd700";
          ctx.font = "bold 16px monospace";
          ctx.textAlign = "center";
          ctx.fillText(g.msg, W / 2, BOARD_OY + GRID * CELL + 30);
          ctx.globalAlpha = 1;
        }

        // Draw particles
        for (const pt of g.particles) {
          const alpha = pt.life / pt.maxLife;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Controls hint
        ctx.fillStyle = "#555";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("点击选择宝石，再点击相邻宝石交换", W / 2, H - 10);

      } else if (p === "levelComplete") {
        // ─── Level Complete Screen ───────────────────────────────────
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#2ed573";
        ctx.font = "bold 32px monospace";
        ctx.textAlign = "center";
        ctx.fillText("过关", W / 2, 100);

        ctx.fillStyle = PRIMARY;
        ctx.font = "bold 18px monospace";
        ctx.fillText(`第 ${g.level + 1} 关完成`, W / 2, 140);

        ctx.fillStyle = "#ffd700";
        ctx.font = "14px monospace";
        ctx.fillText(`本关得分: ${g.score}`, W / 2, 175);
        ctx.fillText(`总分: ${g.totalScore}`, W / 2, 200);

        // Reward scene
        ctx.fillStyle = "#1a1a2e";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 160, 225, 320, 120, 12);
        ctx.fill();
        ctx.strokeStyle = PRIMARY;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 160, 225, 320, 120, 12);
        ctx.stroke();

        // Reward scene visual
        const sceneIdx = g.level % REWARD_SCENES.length;
        const sceneText = REWARD_SCENES[sceneIdx];
        const [sceneName, sceneDesc] = sceneText.split(" - ");

        // Animated gem shower in reward box
        for (let i = 0; i < 8; i++) {
          const gx = (W / 2 - 140) + ((frameRef.current * 0.5 + i * 40) % 280);
          const gy = 240 + Math.sin(t + i * 1.2) * 30 + 30;
          ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t + i);
          ctx.fillStyle = GEM_COLORS[i % NUM_COLORS];
          ctx.beginPath();
          ctx.arc(gx, gy, 8 + Math.sin(t + i) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`奖励场景: ${sceneName}`, W / 2, 270);
        ctx.fillStyle = "#aaa";
        ctx.font = "11px monospace";
        ctx.fillText(sceneDesc || "", W / 2, 295);
        ctx.fillStyle = "#ff6b81";
        ctx.font = "10px monospace";
        ctx.fillText("解锁秘密宝石收藏", W / 2, 320);

        // Next level button
        const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.06);
        ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
        ctx.font = "16px monospace";
        ctx.fillText("点击进入下一关", W / 2, 400);

      } else if (p === "gameOver") {
        // ─── Game Over Screen ────────────────────────────────────────
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#ff4757";
        ctx.font = "bold 32px monospace";
        ctx.textAlign = "center";
        ctx.fillText("游戏结束", W / 2, H / 2 - 60);

        ctx.fillStyle = "#aaa";
        ctx.font = "14px monospace";
        ctx.fillText(`第 ${g.level + 1} 关未通过`, W / 2, H / 2 - 25);
        ctx.fillText(`本关: ${g.score} / ${g.targetScore}`, W / 2, H / 2 + 5);

        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 16px monospace";
        ctx.fillText(`最终总分: ${g.totalScore}`, W / 2, H / 2 + 40);

        const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.06);
        ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
        ctx.font = "14px monospace";
        ctx.fillText("点击返回标题", W / 2, H / 2 + 80);

      } else if (p === "gameComplete") {
        // ─── Game Complete Screen ────────────────────────────────────
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, W, H);

        // Celebration particles
        for (let i = 0; i < 20; i++) {
          const px = (frameRef.current * 1.5 + i * 50) % W;
          const py = (frameRef.current * 0.8 + i * 30) % H;
          ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t + i);
          ctx.fillStyle = GEM_COLORS[i % NUM_COLORS];
          ctx.beginPath();
          ctx.arc(px, py, 4 + Math.sin(t + i) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 36px monospace";
        ctx.textAlign = "center";
        ctx.fillText("全部通关", W / 2, 120);

        ctx.fillStyle = PRIMARY;
        ctx.font = "bold 18px monospace";
        ctx.fillText("宝石秘境 - 征服完成", W / 2, 160);

        ctx.fillStyle = "#fff";
        ctx.font = "14px monospace";
        ctx.fillText(`最终总分: ${g.totalScore}`, W / 2, 200);

        ctx.fillStyle = "#aaa";
        ctx.font = "12px monospace";
        ctx.fillText("所有10个奖励场景已解锁", W / 2, 230);

        // Show all reward scenes
        ctx.fillStyle = "#1a1a2e";
        ctx.beginPath();
        ctx.roundRect(30, 250, W - 60, 220, 8);
        ctx.fill();

        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("已解锁场景", W / 2, 272);

        ctx.fillStyle = "#aaa";
        ctx.font = "10px monospace";
        for (let i = 0; i < 10; i++) {
          const name = REWARD_SCENES[i].split(" - ")[0];
          const col = i < 5 ? 0 : 1;
          const row = i % 5;
          const tx = col === 0 ? W / 2 - 90 : W / 2 + 90;
          ctx.fillText(`${i + 1}. ${name}`, tx, 295 + row * 18);
        }

        const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.06);
        ctx.fillStyle = `rgba(62, 166, 255, ${glow})`;
        ctx.font = "14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("点击返回标题", W / 2, 510);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleClick(
        (e.clientX - rect.left) * (W / rect.width),
        (e.clientY - rect.top) * (H / rect.height)
      );
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      handleClick(
        (touch.clientX - rect.left) * (W / rect.width),
        (touch.clientY - rect.top) * (H / rect.height)
      );
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchend", onTouch);
    };
  }, [phase, handleClick, drawGem]);


  // ─── Blocked Screen ────────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Lock size={48} className="mx-auto text-gray-600 mb-4" />
          <h1 className="text-xl font-bold mb-2">访问受限</h1>
          <p className="text-gray-400">需要 NC-17 成人模式才能访问此内容。</p>
          <Link href="/zone/games" className="mt-4 inline-block text-[#3ea6ff]">
            返回游戏中心
          </Link>
        </div>
      </div>
    );
  }

  // ─── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Top nav */}
        <Link
          href="/zone/games"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"
        >
          <ChevronLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gem size={24} className="text-[#a55eea]" />
            <h1 className="text-xl font-bold">宝石秘境</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800">
              NC-17
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff] transition"
              title={muted ? "开启音效" : "关闭音效"}
            >
              {muted ? <VolumeX size={16} className="text-gray-500" /> : <Volume2 size={16} className="text-[#3ea6ff]" />}
            </button>
            <button
              onClick={() => {
                setPhase("title");
                playSound("click");
              }}
              className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff] transition"
              title="重新开始"
            >
              <RotateCcw size={16} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Game info bar */}
        <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><Target size={12} /> 三消+特殊宝石</span>
          <span className="flex items-center gap-1"><Sparkles size={12} /> 10关挑战</span>
          <span className="flex items-center gap-1"><Bomb size={12} /> 炸弹宝石</span>
          <span className="flex items-center gap-1"><Palette size={12} /> 彩虹宝石</span>
        </div>

        {/* Canvas */}
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-white/10 max-w-full"
            style={{ touchAction: "none" }}
          />
        </div>

        {/* Score display */}
        {(phase === "playing" || phase === "animating") && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-gray-400">
              第 {gameRef.current.level + 1} 关 | 难度: {difficulty === "easy" ? "简单" : difficulty === "hard" ? "困难" : "普通"}
            </span>
            <span className="text-[#ffd700] font-bold">总分: {displayScore}</span>
          </div>
        )}

        {/* Save/Load and Leaderboard */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad
            gameId={GAME_ID}
            onSave={handleSave}
            onLoad={handleLoad}
          />
          <GameLeaderboard gameId={GAME_ID} />
        </div>

        {/* Game description */}
        <div className="mt-6 rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
          <h3 className="text-sm font-bold mb-2 text-[#3ea6ff]">游戏说明</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>
              <Gem size={10} className="inline mr-1 text-[#a55eea]" />
              点击选择一颗宝石，再点击相邻宝石进行交换
            </li>
            <li>
              <Target size={10} className="inline mr-1 text-[#3ea6ff]" />
              三个或更多相同宝石连成一线即可消除得分
            </li>
            <li>
              <Bomb size={10} className="inline mr-1 text-[#ff8800]" />
              炸弹宝石: 消除时清除周围3x3范围内所有宝石
            </li>
            <li>
              <Sparkles size={10} className="inline mr-1 text-[#ffd700]" />
              彩虹宝石: 消除时清除棋盘上数量最多的同色宝石
            </li>
            <li>
              <Star size={10} className="inline mr-1 text-[#2ed573]" />
              连续消除触发连击加分，达到目标分数即可过关
            </li>
            <li>
              <Trophy size={10} className="inline mr-1 text-[#ffd700]" />
              每关过关解锁一个奖励场景，共10关10个场景
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
