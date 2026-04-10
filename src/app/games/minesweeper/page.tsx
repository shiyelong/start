"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

const DIFFS = [
  { label: "简单", rows: 9, cols: 9, mines: 10 },
  { label: "中等", rows: 12, cols: 12, mines: 25 },
  { label: "困难", rows: 16, cols: 16, mines: 50 },
];

type Cell = { mine: boolean; revealed: boolean; flagged: boolean; adjacent: number; };

function createBoard(rows: number, cols: number, mines: number, safeR: number, safeC: number): Cell[][] {
  const board: Cell[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 })));
  // Place mines (not on safe cell or neighbors)
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols);
    if (board[r][c].mine) continue;
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
    board[r][c].mine = true;
    placed++;
  }
  // Count adjacents
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (board[r][c].mine) continue;
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) count++;
    }
    board[r][c].adjacent = count;
  }
  return board;
}

const NUM_COLORS = ["", "#3ea6ff", "#2ba640", "#ff4444", "#1a1a8e", "#8b0000", "#008080", "#000", "#888"];

export default function MinesweeperPage() {
  const [diffIdx, setDiffIdx] = useState(0);
  const diff = DIFFS[diffIdx];
  const [board, setBoard] = useState<Cell[][] | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [firstClick, setFirstClick] = useState(true);
  const [flagMode, setFlagMode] = useState(false);
  const [, setTime] = useState(0);

  const flagCount = board ? board.flat().filter(c => c.flagged).length : 0;

  const newGame = (d: number) => {
    setDiffIdx(d);
    setBoard(null);
    setGameOver(false);
    setWon(false);
    setFirstClick(true);
    setTime(0);
  };

  const reveal = useCallback((b: Cell[][], r: number, c: number, rows: number, cols: number) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    const cell = b[r][c];
    if (cell.revealed || cell.flagged) return;
    cell.revealed = true;
    if (cell.adjacent === 0 && !cell.mine) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) reveal(b, r + dr, c + dc, rows, cols);
    }
  }, []);

  const handleClick = useCallback((r: number, c: number) => {
    if (gameOver || won) return;

    if (firstClick) {
      const b = createBoard(diff.rows, diff.cols, diff.mines, r, c);
      reveal(b, r, c, diff.rows, diff.cols);
      setBoard(b.map(row => row.map(cell => ({ ...cell }))));
      setFirstClick(false);
      return;
    }

    if (!board) return;
    const nb = board.map(row => row.map(cell => ({ ...cell })));

    if (flagMode) {
      if (nb[r][c].revealed) return;
      nb[r][c].flagged = !nb[r][c].flagged;
      setBoard(nb);
      return;
    }

    if (nb[r][c].flagged) return;

    if (nb[r][c].mine) {
      // Game over - reveal all mines
      nb.forEach(row => row.forEach(cell => { if (cell.mine) cell.revealed = true; }));
      setBoard(nb);
      setGameOver(true);
      return;
    }

    reveal(nb, r, c, diff.rows, diff.cols);
    setBoard(nb.map(row => row.map(cell => ({ ...cell }))));

    // Check win
    const unrevealed = nb.flat().filter(c => !c.revealed && !c.mine).length;
    if (unrevealed === 0) setWon(true);
  }, [board, gameOver, won, firstClick, diff, flagMode, reveal]);

  const handleRightClick = useCallback((e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (gameOver || won || firstClick || !board) return;
    const nb = board.map(row => row.map(cell => ({ ...cell })));
    if (nb[r][c].revealed) return;
    nb[r][c].flagged = !nb[r][c].flagged;
    setBoard(nb);
  }, [board, gameOver, won, firstClick]);

  const displayBoard = board || Array.from({ length: diff.rows }, () => Array.from({ length: diff.cols }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 })));
  const cellSize = Math.min(28, Math.floor(340 / diff.cols));

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-bomb mr-2 text-[#8a8a8a]" />扫雷</h1>
        <div className="flex justify-center gap-2 mb-3">
          {DIFFS.map((d, i) => (
            <button key={i} onClick={() => newGame(i)} className={clsx(
              "px-3 py-1 rounded-full text-[12px] border transition",
              diffIdx === i ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold" : "text-[#aaa] border-[#333]"
            )}>{d.label} ({d.rows}×{d.cols})</button>
          ))}
        </div>
        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#ff4444]"><i className="fas fa-bomb mr-1" />{diff.mines - flagCount}</span>
          <button onClick={() => setFlagMode(!flagMode)} className={clsx("px-3 py-1 rounded-lg text-xs border transition",
            flagMode ? "bg-[#ff4444]/15 text-[#ff4444] border-[#ff4444]/30 font-bold" : "text-[#aaa] border-[#333]"
          )}>🚩 {flagMode ? "标旗中" : "标旗"}</button>
        </div>

        <div className="flex justify-center mb-4 overflow-x-auto">
          <div className="inline-grid gap-0 border border-[#555]" style={{ gridTemplateColumns: `repeat(${diff.cols}, ${cellSize}px)` }}
            onContextMenu={e => e.preventDefault()}>
            {displayBoard.map((row, r) => row.map((cell, c) => (
              <button key={`${r}-${c}`}
                onClick={() => handleClick(r, c)}
                onContextMenu={e => handleRightClick(e, r, c)}
                className={clsx(
                  "border border-[#333]/50 flex items-center justify-center font-bold transition-all",
                  cell.revealed
                    ? cell.mine ? "bg-[#ff4444]/30" : "bg-[#1a1a1a]"
                    : "bg-[#2a2a2a] hover:bg-[#333] active:bg-[#1a1a1a]",
                )}
                style={{ width: cellSize, height: cellSize, fontSize: cellSize * 0.45 }}>
                {cell.revealed
                  ? cell.mine ? "💣"
                  : cell.adjacent > 0 ? <span style={{ color: NUM_COLORS[cell.adjacent] }}>{cell.adjacent}</span> : ""
                  : cell.flagged ? "🚩" : ""}
              </button>
            )))}
          </div>
        </div>

        {(gameOver || won) && (
          <div className="text-center py-3">
            <p className="text-2xl mb-1">{won ? "🎉" : "💥"}</p>
            <p className={`text-lg font-bold ${won ? "text-[#2ba640]" : "text-[#ff4444]"}`}>{won ? "扫雷成功！" : "踩雷了！"}</p>
            <button onClick={() => newGame(diffIdx)} className="mt-2 px-6 py-2 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm">新游戏</button>
          </div>
        )}
        <p className="text-[11px] text-[#666] text-center">左键揭开 · 右键/标旗模式插旗 · 数字=周围雷数</p>
      </main>
    </>
  );
}
