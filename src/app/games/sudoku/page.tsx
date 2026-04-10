"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

// Simple sudoku generator
function generateSudoku(difficulty: number): { puzzle: number[][]; solution: number[][] } {
  const solution: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  function isValid(board: number[][], r: number, c: number, num: number): boolean {
    for (let i = 0; i < 9; i++) { if (board[r][i] === num || board[i][c] === num) return false; }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let i = br; i < br + 3; i++) for (let j = bc; j < bc + 3; j++) { if (board[i][j] === num) return false; }
    return true;
  }
  function solve(board: number[][]): boolean {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        const nums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
        for (const n of nums) {
          if (isValid(board, r, c, n)) { board[r][c] = n; if (solve(board)) return true; board[r][c] = 0; }
        }
        return false;
      }
    }
    return true;
  }
  solve(solution);
  const puzzle = solution.map(r => [...r]);
  // Remove cells based on difficulty
  const remove = difficulty === 0 ? 35 : difficulty === 1 ? 45 : 55;
  const cells = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5);
  for (let i = 0; i < remove; i++) {
    const r = Math.floor(cells[i] / 9), c = cells[i] % 9;
    puzzle[r][c] = 0;
  }
  return { puzzle, solution };
}

const DIFFS = ["简单", "中等", "困难"];

export default function SudokuPage() {
  const [diff, setDiff] = useState(0);
  const [{ puzzle, solution }, setGame] = useState(() => generateSudoku(0));
  const [board, setBoard] = useState<number[][]>(() => puzzle.map(r => [...r]));
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [won, setWon] = useState(false);
  const [notes, setNotes] = useState(false);
  const [noteGrid, setNoteGrid] = useState<Set<number>[][]>(() => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set())));

  const isOriginal = useCallback((r: number, c: number) => puzzle[r][c] !== 0, [puzzle]);

  const newGame = (d: number) => {
    setDiff(d);
    const g = generateSudoku(d);
    setGame(g);
    setBoard(g.puzzle.map(r => [...r]));
    setSelected(null);
    setErrors(new Set());
    setWon(false);
    setNoteGrid(Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set())));
  };

  const placeNumber = useCallback((num: number) => {
    if (!selected || won) return;
    const [r, c] = selected;
    if (isOriginal(r, c)) return;

    if (notes) {
      const ng = noteGrid.map(row => row.map(s => new Set(s)));
      if (ng[r][c].has(num)) ng[r][c].delete(num); else ng[r][c].add(num);
      setNoteGrid(ng);
      return;
    }

    const nb = board.map(row => [...row]);
    nb[r][c] = num === nb[r][c] ? 0 : num;
    setBoard(nb);

    // Check errors
    const newErrors = new Set<string>();
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      if (nb[i][j] !== 0 && nb[i][j] !== solution[i][j]) newErrors.add(`${i},${j}`);
    }
    setErrors(newErrors);

    // Check win
    if (nb.every((row, ri) => row.every((cell, ci) => cell === solution[ri][ci]))) setWon(true);
  }, [selected, board, solution, won, isOriginal, notes, noteGrid]);

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-table-cells mr-2 text-[#3ea6ff]" />数独</h1>
        <div className="flex justify-center gap-2 mb-3">
          {DIFFS.map((d, i) => (
            <button key={i} onClick={() => newGame(i)} className={clsx(
              "px-3 py-1 rounded-full text-[12px] border transition",
              diff === i ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold" : "text-[#aaa] border-[#333]"
            )}>{d}</button>
          ))}
        </div>

        {/* 棋盘 */}
        <div className="flex justify-center mb-3">
          <div className="inline-grid border-2 border-[#555]" style={{ gridTemplateColumns: "repeat(9, 1fr)" }}>
            {board.map((row, r) => row.map((cell, c) => {
              const isSel = selected?.[0] === r && selected?.[1] === c;
              const isErr = errors.has(`${r},${c}`);
              const isOrig = isOriginal(r, c);
              const sameNum = selected && cell !== 0 && cell === board[selected[0]][selected[1]];
              const sameRow = selected?.[0] === r;
              const sameCol = selected?.[1] === c;
              const sameBox = selected && Math.floor(selected[0] / 3) === Math.floor(r / 3) && Math.floor(selected[1] / 3) === Math.floor(c / 3);
              return (
                <button key={`${r}-${c}`} onClick={() => setSelected([r, c])}
                  className={clsx(
                    "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-sm font-bold transition border border-[#333]",
                    r % 3 === 0 && "border-t-[#555] border-t-2",
                    c % 3 === 0 && "border-l-[#555] border-l-2",
                    r === 8 && "border-b-2 border-b-[#555]",
                    c === 8 && "border-r-2 border-r-[#555]",
                    isSel ? "bg-[#3ea6ff]/25" :
                    sameNum ? "bg-[#3ea6ff]/10" :
                    (sameRow || sameCol || sameBox) ? "bg-[#1a1a2e]" : "bg-[#111]",
                    isErr ? "text-[#ff4444]" : isOrig ? "text-white" : "text-[#3ea6ff]",
                  )}>
                  {cell !== 0 ? cell : (
                    noteGrid[r][c].size > 0 ? (
                      <span className="text-[7px] text-[#666] leading-none grid grid-cols-3 gap-0">
                        {[1,2,3,4,5,6,7,8,9].map(n => <span key={n}>{noteGrid[r][c].has(n) ? n : " "}</span>)}
                      </span>
                    ) : ""
                  )}
                </button>
              );
            }))}
          </div>
        </div>

        {/* 数字键盘 */}
        <div className="flex justify-center gap-1.5 mb-2">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => placeNumber(n)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#212121] border border-[#333] text-sm font-bold text-[#ccc] hover:bg-[#2a2a2a] active:scale-90 transition">{n}</button>
          ))}
        </div>
        <div className="flex justify-center gap-2 mb-3">
          <button onClick={() => { if (selected && !isOriginal(selected[0], selected[1])) { const nb = board.map(r => [...r]); nb[selected[0]][selected[1]] = 0; setBoard(nb); } }}
            className="px-4 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white">🗑️ 清除</button>
          <button onClick={() => setNotes(!notes)}
            className={clsx("px-4 py-1.5 rounded-lg text-xs border transition", notes ? "border-[#f0b90b]/30 text-[#f0b90b] bg-[#f0b90b]/10" : "border-[#333] text-[#aaa]")}>
            ✏️ 笔记{notes ? " ON" : ""}
          </button>
        </div>

        {won && (
          <div className="text-center py-4">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-lg font-bold text-[#2ba640]">完美解答！</p>
            <button onClick={() => newGame(diff)} className="mt-2 px-6 py-2 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm">新游戏</button>
          </div>
        )}
      </main>
    </>
  );
}
