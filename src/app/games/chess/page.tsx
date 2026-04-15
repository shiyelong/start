"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import {
  ChevronLeft, RotateCcw, Volume2, VolumeX, Play, Circle,
  Undo2, Trophy
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

function cloneBoard(b: Stone[][]): Stone[][] {
  return b.map(row => [...row]);
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
  // 从 (r,c) 沿 (dr,dc) 方向提取长度为6的窗口
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
      // 也检查反转模式
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
  // 中心偏好
  const centerDist = Math.abs(r - 7) + Math.abs(c - 7);
  score += Math.max(0, 14 - centerDist) * 2;
  return score;
}

function aiMove(board: Stone[][], difficulty: Difficulty): Pos | null {
  const empty: Pos[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) {
        // 只考虑周围有棋子的位置（优化搜索范围）
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
    // 棋盘空，下中心
    if (board[7][7] === 0) return { r: 7, c: 7 };
    return null;
  }

  // 难度系数
  const depthMap: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
  const depth = depthMap[difficulty];
  const noise: Record<Difficulty, number> = { easy: 800, normal: 200, hard: 20 };

  let bestScore = -Infinity;
  let bestMove: Pos = empty[0];

  for (const pos of empty) {
    // 检查 AI 是否能直接赢
    board[pos.r][pos.c] = 2;
    if (checkWin(board, pos.r, pos.c)) {
      board[pos.r][pos.c] = 0;
      return pos;
    }
    board[pos.r][pos.c] = 0;

    // 检查玩家是否能直接赢（必须堵）
    board[pos.r][pos.c] = 1;
    if (checkWin(board, pos.r, pos.c)) {
      board[pos.r][pos.c] = 0;
      // 标记为高优先级
      const blockScore = 900000 + Math.random() * noise[difficulty];
      if (blockScore > bestScore) { bestScore = blockScore; bestMove = pos; }
      continue;
    }
    board[pos.r][pos.c] = 0;

    // 评分：攻击分 + 防守分
    board[pos.r][pos.c] = 2;
    let attackScore = evaluatePosition(board, pos.r, pos.c, 2);
    board[pos.r][pos.c] = 0;

    board[pos.r][pos.c] = 1;
    let defendScore = evaluatePosition(board, pos.r, pos.c, 1);
    board[pos.r][pos.c] = 0;

    // 深度搜索加成（简化版）
    if (depth >= 2) {
      attackScore *= 1.5;
      defendScore *= 1.2;
    }
    if (depth >= 3) {
      // 额外考虑对手下一步的最佳位置
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
  const rafRef = useRef(0);
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
        // 分数：难度加成 * (225 - 步数)
        const diffBonus: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
        const score = (225 - gs.moveCount) * 10 * diffBonus[difficulty];
        submitScore(score);
      } else {
        playLose();
      }
      setPhase("gameover");
      return true;
    }

    // 检查平局
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
    // 撤销 AI 的最后一步和玩家的最后一步
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
    // 将像素坐标转换为棋盘坐标
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
     Canvas 渲染循环
     ---------------------------------------------------------------- */
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

    let animFrame = 0;
    const render = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0f0f0f";
      ctx.fillRect(0, 0, W, H);

      if (phase === "title") {
        renderTitle(ctx);
      } else {
        renderBoard(ctx);
        renderStatus(ctx);
        if (phase === "gameover") {
          renderGameOver(ctx);
        }
      }

      ctx.restore();
      animFrame = requestAnimationFrame(render);
    };

    const renderTitle = (c: CanvasRenderingContext2D) => {
      // 背景棋盘装饰
      c.globalAlpha = 0.15;
      c.strokeStyle = "#3ea6ff";
      for (let i = 0; i < BOARD_SIZE; i++) {
        c.beginPath();
        c.moveTo(PAD + i * CELL, PAD);
        c.lineTo(PAD + i * CELL, PAD + (BOARD_SIZE - 1) * CELL);
        c.stroke();
        c.beginPath();
        c.moveTo(PAD, PAD + i * CELL);
        c.lineTo(PAD + (BOARD_SIZE - 1) * CELL, PAD + i * CELL);
        c.stroke();
      }
      c.globalAlpha = 1;

      // 标题
      c.fillStyle = "#3ea6ff";
      c.font = "bold 36px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("五子棋", W / 2, H / 2 - 60);

      // 副标题
      c.fillStyle = "#aaa";
      c.font = "14px sans-serif";
      c.fillText("黑白对弈 · AI 对战", W / 2, H / 2 - 25);

      // 难度选择
      const diffs: { label: string; value: Difficulty; y: number }[] = [
        { label: "简单", value: "easy", y: H / 2 + 20 },
        { label: "普通", value: "normal", y: H / 2 + 55 },
        { label: "困难", value: "hard", y: H / 2 + 90 },
      ];
      for (const d of diffs) {
        const selected = d.value === difficulty;
        c.fillStyle = selected ? "#3ea6ff" : "#555";
        c.beginPath();
        const bw = 120, bh = 28;
        const bx = W / 2 - bw / 2, by = d.y - bh / 2;
        c.roundRect(bx, by, bw, bh, 6);
        c.fill();
        c.fillStyle = selected ? "#fff" : "#aaa";
        c.font = selected ? "bold 14px sans-serif" : "14px sans-serif";
        c.fillText(d.label, W / 2, d.y);
      }

      // 提示
      c.fillStyle = "#888";
      c.font = "12px sans-serif";
      c.fillText("点击难度开始对局 / 按回车开始", W / 2, H / 2 + 130);
      c.fillText("方向键移动光标 · 回车落子 · U键悔棋", W / 2, H / 2 + 150);
    };

    const renderBoard = (c: CanvasRenderingContext2D) => {
      const gs = gsRef.current;

      // 棋盘背景
      c.fillStyle = "#1a1a2e";
      c.beginPath();
      c.roundRect(PAD - 12, PAD - 12, (BOARD_SIZE - 1) * CELL + 24, (BOARD_SIZE - 1) * CELL + 24, 4);
      c.fill();

      // 网格线
      c.strokeStyle = "#444";
      c.lineWidth = 1;
      for (let i = 0; i < BOARD_SIZE; i++) {
        c.beginPath();
        c.moveTo(PAD + i * CELL, PAD);
        c.lineTo(PAD + i * CELL, PAD + (BOARD_SIZE - 1) * CELL);
        c.stroke();
        c.beginPath();
        c.moveTo(PAD, PAD + i * CELL);
        c.lineTo(PAD + (BOARD_SIZE - 1) * CELL, PAD + i * CELL);
        c.stroke();
      }

      // 星位点
      const stars = [3, 7, 11];
      c.fillStyle = "#666";
      for (const sr of stars) {
        for (const sc of stars) {
          c.beginPath();
          c.arc(PAD + sc * CELL, PAD + sr * CELL, 3, 0, Math.PI * 2);
          c.fill();
        }
      }

      // 光标（仅在 playing 阶段显示）
      if (phase === "playing" && gs.board[gs.cursorR][gs.cursorC] === 0) {
        const cx = PAD + gs.cursorC * CELL;
        const cy = PAD + gs.cursorR * CELL;
        c.strokeStyle = "#3ea6ff";
        c.lineWidth = 2;
        const sz = 10;
        // 四角标记
        c.beginPath();
        c.moveTo(cx - sz, cy - sz); c.lineTo(cx - sz + 6, cy - sz);
        c.moveTo(cx - sz, cy - sz); c.lineTo(cx - sz, cy - sz + 6);
        c.moveTo(cx + sz, cy - sz); c.lineTo(cx + sz - 6, cy - sz);
        c.moveTo(cx + sz, cy - sz); c.lineTo(cx + sz, cy - sz + 6);
        c.moveTo(cx - sz, cy + sz); c.lineTo(cx - sz + 6, cy + sz);
        c.moveTo(cx - sz, cy + sz); c.lineTo(cx - sz, cy + sz - 6);
        c.moveTo(cx + sz, cy + sz); c.lineTo(cx + sz - 6, cy + sz);
        c.moveTo(cx + sz, cy + sz); c.lineTo(cx + sz, cy + sz - 6);
        c.stroke();
      }

      // 棋子
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const s = gs.board[r][col];
          if (s === 0) continue;
          const cx = PAD + col * CELL;
          const cy = PAD + r * CELL;

          // 阴影
          c.fillStyle = "rgba(0,0,0,0.3)";
          c.beginPath();
          c.arc(cx + 2, cy + 2, STONE_R, 0, Math.PI * 2);
          c.fill();

          // 棋子本体
          const grad = c.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, STONE_R);
          if (s === 1) {
            grad.addColorStop(0, "#555");
            grad.addColorStop(1, "#111");
          } else {
            grad.addColorStop(0, "#fff");
            grad.addColorStop(1, "#bbb");
          }
          c.fillStyle = grad;
          c.beginPath();
          c.arc(cx, cy, STONE_R, 0, Math.PI * 2);
          c.fill();

          // 最后一步标记
          if (lastStoneRef.current && lastStoneRef.current.r === r && lastStoneRef.current.c === col) {
            c.fillStyle = s === 1 ? "#3ea6ff" : "#ff4757";
            c.beginPath();
            c.arc(cx, cy, 4, 0, Math.PI * 2);
            c.fill();
          }
        }
      }

      // 获胜连线高亮
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
            c.strokeStyle = gs.winner === 1 ? "rgba(62,166,255,0.7)" : "rgba(255,71,87,0.7)";
            c.lineWidth = 4;
            c.lineCap = "round";
            // 排序连线
            line.sort((a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c);
            c.beginPath();
            c.moveTo(PAD + line[0].c * CELL, PAD + line[0].r * CELL);
            c.lineTo(PAD + line[line.length - 1].c * CELL, PAD + line[line.length - 1].r * CELL);
            c.stroke();
          }
        }
      }
    };

    const renderStatus = (c: CanvasRenderingContext2D) => {
      const gs = gsRef.current;
      const statusY = PAD + (BOARD_SIZE - 1) * CELL + 30;
      c.textAlign = "center";
      c.textBaseline = "middle";

      if (phase === "cpu") {
        c.fillStyle = "#aaa";
        c.font = "14px sans-serif";
        c.fillText("白方思考中...", W / 2, statusY);
      } else if (phase === "playing") {
        c.fillStyle = gs.turn === 1 ? "#fff" : "#ccc";
        c.font = "14px sans-serif";
        c.fillText(gs.turn === 1 ? "黑方回合" : "白方回合", W / 2, statusY);
      }

      // 步数显示
      c.fillStyle = "#666";
      c.font = "11px sans-serif";
      c.textAlign = "left";
      c.fillText(`第 ${gs.moveCount} 手`, PAD, statusY);
      c.textAlign = "right";
      const diffLabel: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };
      c.fillText(diffLabel[difficulty], W - PAD, statusY);
    };

    const renderGameOver = (c: CanvasRenderingContext2D) => {
      const gs = gsRef.current;
      c.fillStyle = "rgba(0,0,0,0.65)";
      c.fillRect(0, 0, W, H);

      const isWin = gs.winner === 1;
      const isDraw = gs.winner === 0 && gs.moveCount >= BOARD_SIZE * BOARD_SIZE;

      c.textAlign = "center";
      c.textBaseline = "middle";

      if (isDraw) {
        c.fillStyle = "#aaa";
        c.font = "bold 28px sans-serif";
        c.fillText("平局", W / 2, H / 2 - 20);
      } else {
        c.fillStyle = isWin ? "#2ed573" : "#ff4757";
        c.font = "bold 28px sans-serif";
        c.fillText(isWin ? "黑方胜利!" : "白方胜利!", W / 2, H / 2 - 20);
      }

      c.fillStyle = "#aaa";
      c.font = "13px sans-serif";
      c.fillText(`共 ${gs.moveCount} 手`, W / 2, H / 2 + 15);
      c.fillText("点击 新局 或按回车重新开始", W / 2, H / 2 + 40);
    };

    animFrame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchend", onTouch);
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
