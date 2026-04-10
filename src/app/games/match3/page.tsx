"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

const COLS = 7, ROWS = 7;
const GEMS = ["💎", "🔴", "🟡", "🟢", "🔵", "🟣", "🟠"];

function createBoard(): string[][] {
  const b: string[][] = [];
  for (let r = 0; r < ROWS; r++) {
    b.push([]);
    for (let c = 0; c < COLS; c++) {
      let gem: string;
      do { gem = GEMS[Math.floor(Math.random() * GEMS.length)]; }
      while ((c >= 2 && b[r][c - 1] === gem && b[r][c - 2] === gem) || (r >= 2 && b[r - 1]?.[c] === gem && b[r - 2]?.[c] === gem));
      b[r].push(gem);
    }
  }
  return b;
}

function findMatches(board: string[][]): [number, number][] {
  const matched = new Set<string>();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 2; c++) {
    if (board[r][c] && board[r][c] === board[r][c + 1] && board[r][c] === board[r][c + 2]) {
      matched.add(`${r},${c}`); matched.add(`${r},${c + 1}`); matched.add(`${r},${c + 2}`);
    }
  }
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS - 2; r++) {
    if (board[r][c] && board[r][c] === board[r + 1][c] && board[r][c] === board[r + 2][c]) {
      matched.add(`${r},${c}`); matched.add(`${r + 1},${c}`); matched.add(`${r + 2},${c}`);
    }
  }
  return Array.from(matched).map(s => { const [r, c] = s.split(",").map(Number); return [r, c] as [number, number]; });
}

export default function Match3Page() {
  const [board, setBoard] = useState(() => createBoard());
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(30);
  const [combo, setCombo] = useState(0);

  const processBoard = useCallback((b: string[][], addScore: number, comboN: number) => {
    const matches = findMatches(b);
    if (matches.length === 0) { setBoard([...b]); setCombo(0); return; }
    const pts = matches.length * 10 * (comboN + 1);
    setScore(prev => prev + pts + addScore);
    setCombo(comboN + 1);
    // Remove matches
    matches.forEach(([r, c]) => { b[r][c] = ""; });
    // Gravity
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (b[r][c]) { b[writeRow][c] = b[r][c]; if (writeRow !== r) b[r][c] = ""; writeRow--; }
      }
      for (let r = writeRow; r >= 0; r--) b[r][c] = GEMS[Math.floor(Math.random() * GEMS.length)];
    }
    setTimeout(() => processBoard([...b.map(r => [...r])], 0, comboN + 1), 200);
  }, []);

  const handleClick = useCallback((r: number, c: number) => {
    if (moves <= 0) return;
    if (!selected) { setSelected([r, c]); return; }
    const [sr, sc] = selected;
    if (Math.abs(sr - r) + Math.abs(sc - c) !== 1) { setSelected([r, c]); return; }
    // Swap
    const nb = board.map(row => [...row]);
    [nb[sr][sc], nb[r][c]] = [nb[r][c], nb[sr][sc]];
    const matches = findMatches(nb);
    if (matches.length === 0) { setSelected(null); return; }
    setMoves(prev => prev - 1);
    setSelected(null);
    processBoard(nb, 0, 0);
  }, [selected, board, moves, processBoard]);

  const restart = () => { setBoard(createBoard()); setScore(0); setMoves(30); setCombo(0); setSelected(null); };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2"><i className="fas fa-gem mr-2 text-[#ec4899]" />宝石消消乐</h1>
        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#f0b90b]"><i className="fas fa-star mr-1" />{score}</span>
          <span className="text-[#3ea6ff]"><i className="fas fa-hand-pointer mr-1" />{moves}步</span>
          {combo > 1 && <span className="text-[#ff4444] font-bold animate-pulse">{combo}x连击!</span>}
        </div>
        <div className="inline-grid gap-1 p-3 rounded-xl bg-[#1a1a1a] border border-[#333]" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {board.map((row, r) => row.map((gem, c) => (
            <button key={`${r}-${c}`} onClick={() => handleClick(r, c)}
              className={clsx(
                "w-10 h-10 sm:w-12 sm:h-12 rounded-lg text-xl sm:text-2xl flex items-center justify-center transition-all active:scale-90 select-none",
                selected && selected[0] === r && selected[1] === c ? "bg-[#3ea6ff]/30 ring-2 ring-[#3ea6ff] scale-110" : "bg-[#212121] hover:bg-[#2a2a2a]"
              )}>
              {gem}
            </button>
          )))}
        </div>
        {moves <= 0 && (
          <div className="mt-4">
            <p className="text-lg font-bold text-[#f0b90b] mb-2">游戏结束！得分：{score}</p>
            <button onClick={restart} className="px-6 py-2 rounded-xl bg-[#ec4899] text-white font-bold">再来一局</button>
          </div>
        )}
        <p className="text-[11px] text-[#666] mt-3">点击两个相邻宝石交换 · 三个相同消除得分</p>
      </main>
    </>
  );
}
