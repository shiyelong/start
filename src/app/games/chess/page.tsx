"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";
import {
  ChevronLeft, RotateCcw, Volume2, VolumeX, Circle,
  Undo2,
} from "lucide-react";

/* ================================================================
   常量 & 类型
   ================================================================ */
const GAME_ID = "gomoku";
const BOARD_SIZE = 15;
const CELL = 32;
const PAD = 24;
const W = CELL * (BOARD_SIZE - 1) + PAD * 2;
const H = W + 48; // extra space for status bar
const STONE_R = 13;

type Stone = 0 | 1 | 2; // 0=empty, 1=black, 2=white
type Phase = "title" | "playing" | "cpu" | "gameover";
type Difficulty = "easy" | "normal" | "hard";

interface Pos { r: number; c: number }

interface GameState {
  board: Stone[][];
  turn: Stone; // 1=black(player), 2=white(cpu)
  history: Pos[];
  winner: Stone;
  cursorR: number;
  cursorC: number;
  undoLeft: number;
  moveCount: number;
}

/* ================================================================
   AI 评分表 — 用于五子棋 AI
   ================================================================ */
const SCORE_TABLE: Record<string, number> = {
  "11111": 1000000,
  "011110": 50000,
  "011112": 5000, "211110": 5000,
  "01110": 5000, "01112": 500, "21110": 500,
  "011010": 3000, "010110": 3000,
  "0110": 500, "01100": 500, "00110": 500,
  "010": 50, "0100": 50, "0010": 50,
  "01010": 800,
  "010010": 400,
};

function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}

function createBoard(): Stone[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    new Array<Stone>(BOARD_SIZE).fill(0)
  );
}

function createGameState(): GameState {
  return {
    board: createBoard(),
    turn: 1,
    history: [],
    winner: 0,
    cursorR: 7,
    cursorC: 7,
    undoLeft: 3,
    moveCount: 0,
  };
}

/* ================================================================
   胜负判定：检查 (r,c) 处是否形成五子连珠
   ================================================================ */
const DIRS: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];

function checkWin(board: Stone[][], r: number, c: number): boolean {
  const s = board[r][c];
  if (s === 0) return false;
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (let i = 1; i < 5; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
      if (board[nr][nc] !== s) break;
      count++;
    }
    for (let i = 1; i < 5; i++) {
      const nr = r - dr * i, nc = c - dc * i;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
      if (board[nr][nc] !== s) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

/* ================================================================
   AI 评分逻辑
   ================================================================ */
function evaluateLine(board: Stone[][], r: number, c: number, dr: number, dc: number, stone: Stone): number {
  let score = 0;
  for (let start = -4; start <= 0; start++) {
    for (const len of [5, 6]) {
      let pattern = "";
      let valid = true;
      for (let i = start; i < start + len; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) { valid = false; break; }
        const v = board[nr][nc];
        if (v === 0) pattern += "0";
        else if (v === stone) pattern += "1";
        else pattern += "2";
      }
      if (!valid) continue;
      const s = SCORE_TABLE[pattern];
      if (s) score += s;
      const rev = pattern.split("").reverse().join("");
      const sr = SCORE_TABLE[rev];
      if (sr) score += sr;
    }
  }
  return score;
}

function evaluatePosition(board: Stone[][], r: number, c: number, stone: Stone): number {
  let score = 0;
  for (const [dr, dc] of DIRS) {
    score += evaluateLine(board, r, c, dr, dc, stone);
  }
  const centerDist = Math.abs(r - 7) + Math.abs(c - 7);
  score += Math.max(0, 14 - centerDist) * 2;
  return score;
}

function aiMove(board: Stone[][], difficulty: Difficulty): Pos | null {
  const empty: Pos[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) {
        let near = false;
        for (let dr = -2; dr <= 2 && !near; dr++) {
          for (let dc = -2; dc <= 2 && !near; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] !== 0) {
              near = true;
            }
          }
        }
        if (near) empty.push({ r, c });
      }
    }
  }
  if (empty.length === 0) {
    if (board[7][7] === 0) return { r: 7, c: 7 };
    return null;
  }

  const depthMap: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
  const depth = depthMap[difficulty];
  const noise: Record<Difficulty, number> = { easy: 800, normal: 200, hard: 20 };

  let bestScore = -Infinity;
  let bestMove: Pos = empty[0];

  for (const pos of empty) {
    board[pos.r][pos.c] = 2;
    if (checkWin(board, pos.r, pos.c)) {
      board[pos.r][pos.c] = 0;
      return pos;
    }
    board[pos.r][pos.c] = 0;

    board[pos.r][pos.c] = 1;
    if (checkWin(board, pos.r, pos.c)) {
      board[pos.r][pos.c] = 0;
      const blockScore = 900000 + Math.random() * noise[difficulty];
      if (blockScore > bestScore) { bestScore = blockScore; bestMove = pos; }
      continue;
    }
    board[pos.r][pos.c] = 0;

    board[pos.r][pos.c] = 2;
    let attackScore = evaluatePosition(board, pos.r, pos.c, 2);
    board[pos.r][pos.c] = 0;

    board[pos.r][pos.c] = 1;
    let defendScore = evaluatePosition(board, pos.r, pos.c, 1);
    board[pos.r][pos.c] = 0;

    if (depth >= 2) {
      attackScore *= 1.5;
      defendScore *= 1.2;
    }
    if (depth >= 3) {
      board[pos.r][pos.c] = 2;
      let maxThreat = 0;
      for (const p2 of empty) {
        if (p2.r === pos.r && p2.c === pos.c) continue;
        board[p2.r][p2.c] = 2;
        const t = evaluatePosition(board, p2.r, p2.c, 2);
        if (t > maxThreat) maxThreat = t;
        board[p2.r][p2.c] = 0;
      }
      attackScore += maxThreat * 0.3;
      board[pos.r][pos.c] = 0;
    }

    const total = attackScore * 1.1 + defendScore + Math.random() * noise[difficulty];
    if (total > bestScore) { bestScore = total; bestMove = pos; }
  }

  return bestMove;
}

/* ================================================================
   主组件
   ================================================================ */
export default function GomokuGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const gsRef = useRef<GameState>(createGameState());
  const soundRef = useRef<SoundEngine | null>(null);
  const lastStoneRef = useRef<Pos | null>(null);

  // React state mirrors for UI
  const [turnDisplay, setTurnDisplay] = useState<Stone>(1);
  const [winnerDisplay, setWinnerDisplay] = useState<Stone>(0);
  const [undoLeft, setUndoLeft] = useState(3);
  const [moveCount, setMoveCount] = useState(0);

  /* ----------------------------------------------------------------
     音效
     ---------------------------------------------------------------- */
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playPlace = useCallback(() => {
    if (muted) return;
    soundRef.current?.playClick();
  }, [muted]);

  const playWin = useCallback(() => {
    if (muted) return;
    soundRef.current?.playLevelUp();
  }, [muted]);

  const playLose = useCallback(() => {
    if (muted) return;
    soundRef.current?.playGameOver();
  }, [muted]);

  /* ----------------------------------------------------------------
     提交分数
     ---------------------------------------------------------------- */
  const submitScore = useCallback(async (score: number) => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score }),
      });
    } catch { /* ignore */ }
  }, []);

  /* ----------------------------------------------------------------
     存档/读档
     ---------------------------------------------------------------- */
  const handleSave = useCallback(() => {
    const gs = gsRef.current;
    return {
      board: gs.board.map(r => [...r]),
      turn: gs.turn,
      history: [...gs.history],
      winner: gs.winner,
      cursorR: gs.cursorR,
      cursorC: gs.cursorC,
      undoLeft: gs.undoLeft,
      moveCount: gs.moveCount,
      difficulty,
      phase,
    };
  }, [difficulty, phase]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || !d.board) return;
    const gs = gsRef.current;
    gs.board = (d.board as Stone[][]).map(r => [...r]);
    gs.turn = (d.turn as Stone) || 1;
    gs.history = (d.history as Pos[]) || [];
    gs.winner = (d.winner as Stone) || 0;
    gs.cursorR = (d.cursorR as number) ?? 7;
    gs.cursorC = (d.cursorC as number) ?? 7;
    gs.undoLeft = (d.undoLeft as number) ?? 3;
    gs.moveCount = (d.moveCount as number) || 0;
    setDifficulty((d.difficulty as Difficulty) || "normal");
    setTurnDisplay(gs.turn);
    setWinnerDisplay(gs.winner);
    setUndoLeft(gs.undoLeft);
    setMoveCount(gs.moveCount);
    if (gs.winner !== 0) {
      setPhase("gameover");
    } else {
      setPhase((d.phase as Phase) || "playing");
    }
  }, []);

  /* ----------------------------------------------------------------
     开始游戏
     ---------------------------------------------------------------- */
  const startGame = useCallback((diff: Difficulty) => {
    const gs = createGameState();
    gsRef.current = gs;
    lastStoneRef.current = null;
    setDifficulty(diff);
    setTurnDisplay(1);
    setWinnerDisplay(0);
    setUndoLeft(3);
    setMoveCount(0);
    setPhase("playing");
  }, []);

  /* ----------------------------------------------------------------
     落子逻辑
     ---------------------------------------------------------------- */
  const placeStone = useCallback((r: number, c: number) => {
    const gs = gsRef.current;
    if (gs.board[r][c] !== 0 || gs.winner !== 0) return false;
    gs.board[r][c] = gs.turn;
    gs.history.push({ r, c });
    gs.moveCount++;
    lastStoneRef.current = { r, c };
    playPlace();

    if (checkWin(gs.board, r, c)) {
      gs.winner = gs.turn;
      setWinnerDisplay(gs.turn);
      setMoveCount(gs.moveCount);
      if (gs.turn === 1) {
        playWin();
        const diffBonus: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
        const score = (225 - gs.moveCount) * 10 * diffBonus[difficulty];
        submitScore(score);
      } else {
        playLose();
      }
      setPhase("gameover");
      return true;
    }

    if (gs.moveCount >= BOARD_SIZE * BOARD_SIZE) {
      gs.winner = 0;
      setPhase("gameover");
      return true;
    }

    gs.turn = gs.turn === 1 ? 2 : 1;
    setTurnDisplay(gs.turn);
    setMoveCount(gs.moveCount);
    return true;
  }, [difficulty, playPlace, playWin, playLose, submitScore]);

  /* ----------------------------------------------------------------
     AI 回合
     ---------------------------------------------------------------- */
  const doCpuMove = useCallback(() => {
    setPhase("cpu");
    setTimeout(() => {
      const gs = gsRef.current;
      if (gs.winner !== 0) return;
      const move = aiMove(gs.board, difficulty);
      if (move) {
        placeStone(move.r, move.c);
      }
      if (gs.winner === 0) {
        setPhase("playing");
      }
    }, 300);
  }, [difficulty, placeStone]);

  /* ----------------------------------------------------------------
     悔棋
     ---------------------------------------------------------------- */
  const handleUndo = useCallback(() => {
    const gs = gsRef.current;
    if (gs.undoLeft <= 0 || gs.history.length < 2 || gs.winner !== 0) return;
    if (phase !== "playing") return;
    for (let i = 0; i < 2 && gs.history.length > 0; i++) {
      const last = gs.history.pop()!;
      gs.board[last.r][last.c] = 0;
      gs.moveCount--;
    }
    gs.undoLeft--;
    gs.turn = 1;
    lastStoneRef.current = gs.history.length > 0 ? gs.history[gs.history.length - 1] : null;
    setTurnDisplay(1);
    setUndoLeft(gs.undoLeft);
    setMoveCount(gs.moveCount);
  }, [phase]);

  /* ----------------------------------------------------------------
     点击/触摸处理
     ---------------------------------------------------------------- */
  const handleBoardClick = useCallback((mx: number, my: number) => {
    if (phase === "title") return;
    if (phase === "gameover") return;
    if (phase === "cpu") return;

    const gs = gsRef.current;
    const c = Math.round((mx - PAD) / CELL);
    const r = Math.round((my - PAD) / CELL);
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return;
    if (gs.board[r][c] !== 0) return;

    gs.cursorR = r;
    gs.cursorC = c;

    if (placeStone(r, c)) {
      if (gs.winner === 0) {
        doCpuMove();
      }
    }
  }, [phase, placeStone, doCpuMove]);

  /* ----------------------------------------------------------------
     键盘处理
     ---------------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "title" || phase === "gameover") {
        if (e.key === "Enter" || e.key === " ") {
          startGame(difficulty);
          e.preventDefault();
        }
        return;
      }
      if (phase !== "playing") return;

      const gs = gsRef.current;
      let moved = false;
      switch (e.key) {
        case "ArrowUp":
          gs.cursorR = Math.max(0, gs.cursorR - 1);
          moved = true;
          break;
        case "ArrowDown":
          gs.cursorR = Math.min(BOARD_SIZE - 1, gs.cursorR + 1);
          moved = true;
          break;
        case "ArrowLeft":
          gs.cursorC = Math.max(0, gs.cursorC - 1);
          moved = true;
          break;
        case "ArrowRight":
          gs.cursorC = Math.min(BOARD_SIZE - 1, gs.cursorC + 1);
          moved = true;
          break;
        case "Enter":
        case " ":
          if (gs.board[gs.cursorR][gs.cursorC] === 0) {
            if (placeStone(gs.cursorR, gs.cursorC)) {
              if (gs.winner === 0) doCpuMove();
            }
          }
          moved = true;
          break;
        case "u":
        case "z":
          handleUndo();
          moved = true;
          break;
      }
      if (moved) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, difficulty, startGame, placeStone, doCpuMove, handleUndo]);

  /* ----------------------------------------------------------------
     PixiJS 渲染循环
     ---------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;
    let app: Application | null = null;

    (async () => {
      const pixi = await loadPixi();
      if (destroyed) return;
      app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0f0f0f, antialias: true });
      if (destroyed) { app.destroy(true); return; }

      const g = new pixi.Graphics();
      app.stage.addChild(g);

      // Text pool
      const TEXT_POOL_SIZE = 70;
      const texts: PixiText[] = [];
      for (let i = 0; i < TEXT_POOL_SIZE; i++) {
        const t = new pixi.Text({ text: "", style: { fontSize: 14, fill: 0xffffff, fontFamily: "sans-serif" } });
        t.visible = false;
        app.stage.addChild(t);
        texts.push(t);
      }
      let textIdx = 0;

      function nextText(str: string, x: number, y: number, opts: {
        fontSize?: number; fill?: number | string; fontWeight?: string;
        align?: "left" | "center" | "right"; alpha?: number;
      } = {}): void {
        if (textIdx >= TEXT_POOL_SIZE) return;
        const t = texts[textIdx++];
        t.text = str;
        t.visible = true;
        t.alpha = opts.alpha ?? 1;
        const fillVal = typeof opts.fill === "string" ? hexToNum(opts.fill) : (opts.fill ?? 0xffffff);
        t.style.fontSize = opts.fontSize ?? 14;
        t.style.fill = fillVal;
        t.style.fontWeight = (opts.fontWeight ?? "normal") as "normal" | "bold";
        t.style.fontFamily = "sans-serif";
        const anchor = opts.align ?? "left";
        if (anchor === "center") { t.anchor.set(0.5, 0.5); t.x = x; }
        else if (anchor === "right") { t.anchor.set(1, 0.5); t.x = x; }
        else { t.anchor.set(0, 0.5); t.x = x; }
        t.y = y;
      }

      // Stroke helpers
      function strokeLine(gfx: PixiGraphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, lineW: number) {
        gfx.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, alpha, width: lineW });
      }

      // Click / touch handlers
      const onClick = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (W / rect.width);
        const my = (e.clientY - rect.top) * (H / rect.height);
        handleBoardClick(mx, my);
      };
      const onTouch = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = (t.clientX - rect.left) * (W / rect.width);
        const my = (t.clientY - rect.top) * (H / rect.height);
        handleBoardClick(mx, my);
      };
      canvas.addEventListener("click", onClick);
      canvas.addEventListener("touchend", onTouch, { passive: false });

      app.ticker.add(() => {
        if (destroyed) return;
        const gs = gsRef.current;

        g.clear();
        textIdx = 0;
        for (const t of texts) t.visible = false;

        // Background
        g.rect(0, 0, W, H).fill(0x0f0f0f);

        if (phase === "title") {
          /* ============ TITLE SCREEN ============ */
          // Decorative board grid
          for (let i = 0; i < BOARD_SIZE; i++) {
            strokeLine(g, PAD + i * CELL, PAD, PAD + i * CELL, PAD + (BOARD_SIZE - 1) * CELL, 0x3ea6ff, 0.15, 1);
            strokeLine(g, PAD, PAD + i * CELL, PAD + (BOARD_SIZE - 1) * CELL, PAD + i * CELL, 0x3ea6ff, 0.15, 1);
          }

          // Title
          nextText("五子棋", W / 2, H / 2 - 60, { fontSize: 36, fill: 0x3ea6ff, fontWeight: "bold", align: "center" });
          // Subtitle
          nextText("黑白对弈 · AI 对战", W / 2, H / 2 - 25, { fontSize: 14, fill: 0xaaaaaa, align: "center" });

          // Difficulty buttons
          const diffs: { label: string; value: Difficulty; y: number }[] = [
            { label: "简单", value: "easy", y: H / 2 + 20 },
            { label: "普通", value: "normal", y: H / 2 + 55 },
            { label: "困难", value: "hard", y: H / 2 + 90 },
          ];
          for (const d of diffs) {
            const selected = d.value === difficulty;
            const bw = 120, bh = 28;
            const bx = W / 2 - bw / 2, by = d.y - bh / 2;
            g.roundRect(bx, by, bw, bh, 6).fill(selected ? 0x3ea6ff : 0x555555);
            nextText(d.label, W / 2, d.y, {
              fontSize: 14, fill: selected ? 0xffffff : 0xaaaaaa,
              fontWeight: selected ? "bold" : "normal", align: "center",
            });
          }

          // Hints
          nextText("点击难度开始对局 / 按回车开始", W / 2, H / 2 + 130, { fontSize: 12, fill: 0x888888, align: "center" });
          nextText("方向键移动光标 · 回车落子 · U键悔棋", W / 2, H / 2 + 150, { fontSize: 12, fill: 0x888888, align: "center" });

        } else {
          /* ============ GAME BOARD ============ */
          // Board background
          g.roundRect(PAD - 12, PAD - 12, (BOARD_SIZE - 1) * CELL + 24, (BOARD_SIZE - 1) * CELL + 24, 4).fill(0x1a1a2e);

          // Grid lines
          for (let i = 0; i < BOARD_SIZE; i++) {
            strokeLine(g, PAD + i * CELL, PAD, PAD + i * CELL, PAD + (BOARD_SIZE - 1) * CELL, 0x444444, 1, 1);
            strokeLine(g, PAD, PAD + i * CELL, PAD + (BOARD_SIZE - 1) * CELL, PAD + i * CELL, 0x444444, 1, 1);
          }

          // Star points
          const stars = [3, 7, 11];
          for (const sr of stars) {
            for (const sc of stars) {
              g.circle(PAD + sc * CELL, PAD + sr * CELL, 3).fill(0x666666);
            }
          }

          // Cursor (playing phase only)
          if (phase === "playing" && gs.board[gs.cursorR][gs.cursorC] === 0) {
            const cx = PAD + gs.cursorC * CELL;
            const cy = PAD + gs.cursorR * CELL;
            const sz = 10;
            // Four corner marks
            g.moveTo(cx - sz, cy - sz).lineTo(cx - sz + 6, cy - sz).stroke({ color: 0x3ea6ff, width: 2 });
            g.moveTo(cx - sz, cy - sz).lineTo(cx - sz, cy - sz + 6).stroke({ color: 0x3ea6ff, width: 2 });
            g.moveTo(cx + sz, cy - sz).lineTo(cx + sz - 6, cy - sz).stroke({ color: 0x3ea6ff, width: 2 });
            g.moveTo(cx + sz, cy - sz).lineTo(cx + sz, cy - sz + 6).stroke({ color: 0x3ea6ff, width: 2 });
            g.moveTo(cx - sz, cy + sz).lineTo(cx - sz + 6, cy + sz).stroke({ color: 0x3ea6ff, width: 2 });
            g.moveTo(cx - sz, cy + sz).lineTo(cx - sz, cy + sz - 6).stroke({ color: 0x3ea6ff, width: 2 });
            g.moveTo(cx + sz, cy + sz).lineTo(cx + sz - 6, cy + sz).stroke({ color: 0x3ea6ff, width: 2 });
            g.moveTo(cx + sz, cy + sz).lineTo(cx + sz, cy + sz - 6).stroke({ color: 0x3ea6ff, width: 2 });
          }

          // Stones
          for (let r = 0; r < BOARD_SIZE; r++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
              const s = gs.board[r][col];
              if (s === 0) continue;
              const cx = PAD + col * CELL;
              const cy = PAD + r * CELL;

              // Shadow
              g.circle(cx + 2, cy + 2, STONE_R).fill({ color: 0x000000, alpha: 0.3 });

              // Stone body (flat color since PixiJS Graphics doesn't support radial gradients easily)
              if (s === 1) {
                g.circle(cx, cy, STONE_R).fill(0x222222);
                // Highlight
                g.circle(cx - 3, cy - 3, 4).fill({ color: 0x555555, alpha: 0.6 });
              } else {
                g.circle(cx, cy, STONE_R).fill(0xdddddd);
                // Highlight
                g.circle(cx - 3, cy - 3, 4).fill({ color: 0xffffff, alpha: 0.6 });
              }

              // Last stone marker
              if (lastStoneRef.current && lastStoneRef.current.r === r && lastStoneRef.current.c === col) {
                g.circle(cx, cy, 4).fill(s === 1 ? 0x3ea6ff : 0xff4757);
              }
            }
          }

          // Winning line highlight
          if (gs.winner !== 0 && lastStoneRef.current) {
            const lr = lastStoneRef.current.r, lc = lastStoneRef.current.c;
            for (const [dr, dc] of DIRS) {
              const line: Pos[] = [{ r: lr, c: lc }];
              for (let i = 1; i < 5; i++) {
                const nr = lr + dr * i, nc = lc + dc * i;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                if (gs.board[nr][nc] !== gs.winner) break;
                line.push({ r: nr, c: nc });
              }
              for (let i = 1; i < 5; i++) {
                const nr = lr - dr * i, nc = lc - dc * i;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                if (gs.board[nr][nc] !== gs.winner) break;
                line.push({ r: nr, c: nc });
              }
              if (line.length >= 5) {
                line.sort((a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c);
                const winColor = gs.winner === 1 ? 0x3ea6ff : 0xff4757;
                g.moveTo(PAD + line[0].c * CELL, PAD + line[0].r * CELL)
                  .lineTo(PAD + line[line.length - 1].c * CELL, PAD + line[line.length - 1].r * CELL)
                  .stroke({ color: winColor, alpha: 0.7, width: 4 });
              }
            }
          }

          // Status bar
          const statusY = PAD + (BOARD_SIZE - 1) * CELL + 30;
          if (phase === "cpu") {
            nextText("白方思考中...", W / 2, statusY, { fontSize: 14, fill: 0xaaaaaa, align: "center" });
          } else if (phase === "playing") {
            nextText(gs.turn === 1 ? "黑方回合" : "白方回合", W / 2, statusY, {
              fontSize: 14, fill: gs.turn === 1 ? 0xffffff : 0xcccccc, align: "center",
            });
          }

          // Move count & difficulty
          const diffLabel: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };
          nextText(`第 ${gs.moveCount} 手`, PAD, statusY, { fontSize: 11, fill: 0x666666, align: "left" });
          nextText(diffLabel[difficulty], W - PAD, statusY, { fontSize: 11, fill: 0x666666, align: "right" });

          // Game over overlay
          if (phase === "gameover") {
            g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.65 });

            const isWin = gs.winner === 1;
            const isDraw = gs.winner === 0 && gs.moveCount >= BOARD_SIZE * BOARD_SIZE;

            if (isDraw) {
              nextText("平局", W / 2, H / 2 - 20, { fontSize: 28, fill: 0xaaaaaa, fontWeight: "bold", align: "center" });
            } else {
              nextText(isWin ? "黑方胜利!" : "白方胜利!", W / 2, H / 2 - 20, {
                fontSize: 28, fill: isWin ? 0x2ed573 : 0xff4757, fontWeight: "bold", align: "center",
              });
            }

            nextText(`共 ${gs.moveCount} 手`, W / 2, H / 2 + 15, { fontSize: 13, fill: 0xaaaaaa, align: "center" });
            nextText("点击 新局 或按回车重新开始", W / 2, H / 2 + 40, { fontSize: 13, fill: 0xaaaaaa, align: "center" });
          }
        }
      });
    })();

    return () => {
      destroyed = true;
      if (app) { app.destroy(true); app = null; }
    };
  }, [phase, difficulty, handleBoardClick]);

  /* ----------------------------------------------------------------
     标题画面难度选择点击
     ---------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || phase !== "title") return;

    const onTitleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const my = (e.clientY - rect.top) * (H / rect.height);
      const diffs: { value: Difficulty; y: number }[] = [
        { value: "easy", y: H / 2 + 20 },
        { value: "normal", y: H / 2 + 55 },
        { value: "hard", y: H / 2 + 90 },
      ];
      for (const d of diffs) {
        if (Math.abs(my - d.y) < 16) {
          startGame(d.value);
          return;
        }
      }
    };
    const onTitleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const my = (t.clientY - rect.top) * (H / rect.height);
      const diffs: { value: Difficulty; y: number }[] = [
        { value: "easy", y: H / 2 + 20 },
        { value: "normal", y: H / 2 + 55 },
        { value: "hard", y: H / 2 + 90 },
      ];
      for (const d of diffs) {
        if (Math.abs(my - d.y) < 16) {
          startGame(d.value);
          return;
        }
      }
    };
    canvas.addEventListener("click", onTitleClick);
    canvas.addEventListener("touchend", onTitleTouch, { passive: false });
    return () => {
      canvas.removeEventListener("click", onTitleClick);
      canvas.removeEventListener("touchend", onTitleTouch);
    };
  }, [phase, startGame]);

  /* ----------------------------------------------------------------
     JSX 渲染
     ---------------------------------------------------------------- */
  const diffLabel: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link
          href="/games"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"
        >
          <ChevronLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center gap-2 mb-4">
          <Circle size={24} className="text-[#3ea6ff]" />
          <h1 className="text-xl font-bold">五子棋</h1>
          {phase !== "title" && (
            <span className="ml-2 text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
              {diffLabel[difficulty]}
            </span>
          )}
        </div>

        {/* Canvas */}
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-white/10 max-w-full"
            style={{ touchAction: "none" }}
          />
        </div>

        {/* 控制按钮 */}
        {phase !== "title" && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={() => startGame(difficulty)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80 transition-colors"
            >
              <RotateCcw size={14} /> 新局
            </button>
            <button
              onClick={handleUndo}
              disabled={phase !== "playing" || undoLeft <= 0 || gsRef.current.history.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Undo2 size={14} /> 悔棋 ({undoLeft})
            </button>
            <button
              onClick={() => {
                setMuted(!muted);
                soundRef.current?.toggleMute();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {muted ? "静音" : "音效"}
            </button>

            {/* 难度切换 */}
            <div className="flex items-center gap-1 ml-auto">
              {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => startGame(d)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    d === difficulty
                      ? "bg-[#3ea6ff] text-white"
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {diffLabel[d]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 状态信息 */}
        {phase !== "title" && (
          <div className="flex items-center justify-between mt-3 text-sm text-gray-400">
            <span>
              {phase === "gameover"
                ? winnerDisplay === 1
                  ? "黑方胜利!"
                  : winnerDisplay === 2
                  ? "白方胜利!"
                  : "平局"
                : phase === "cpu"
                ? "白方思考中..."
                : turnDisplay === 1
                ? "黑方回合"
                : "白方回合"}
            </span>
            <span>第 {moveCount} 手</span>
          </div>
        )}

        {/* 操作说明 */}
        {phase === "playing" && (
          <div className="mt-3 text-xs text-gray-600 space-y-0.5">
            <p>鼠标/触摸点击落子 | 方向键移动光标 + 回车落子 | U键悔棋</p>
          </div>
        )}

        {/* 存档 & 排行榜 */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}