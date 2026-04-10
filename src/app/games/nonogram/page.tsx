"use client";
import { useState, useMemo, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

// Puzzles: 1 = filled, 0 = empty
const PUZZLES = [
  { name: "爱心", size: 5, solution: [
    [0,1,0,1,0],
    [1,1,1,1,1],
    [1,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ]},
  { name: "十字", size: 5, solution: [
    [0,0,1,0,0],
    [0,0,1,0,0],
    [1,1,1,1,1],
    [0,0,1,0,0],
    [0,0,1,0,0],
  ]},
  { name: "箭头", size: 7, solution: [
    [0,0,0,1,0,0,0],
    [0,0,1,1,1,0,0],
    [0,1,1,1,1,1,0],
    [1,1,1,1,1,1,1],
    [0,0,0,1,0,0,0],
    [0,0,0,1,0,0,0],
    [0,0,0,1,0,0,0],
  ]},
  { name: "钻石", size: 7, solution: [
    [0,0,0,1,0,0,0],
    [0,0,1,0,1,0,0],
    [0,1,0,0,0,1,0],
    [1,0,0,0,0,0,1],
    [0,1,0,0,0,1,0],
    [0,0,1,0,1,0,0],
    [0,0,0,1,0,0,0],
  ]},
  { name: "城堡", size: 8, solution: [
    [1,0,1,0,0,1,0,1],
    [1,1,1,0,0,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
    [0,1,0,1,1,0,1,0],
    [0,1,0,1,1,0,1,0],
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
  ]},
  { name: "飞机", size: 8, solution: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,0],
  ]},
];

function getClues(line: number[]): number[] {
  const clues: number[] = [];
  let count = 0;
  for (const c of line) {
    if (c === 1) count++;
    else { if (count > 0) clues.push(count); count = 0; }
  }
  if (count > 0) clues.push(count);
  return clues.length ? clues : [0];
}

export default function NonogramPage() {
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const puzzle = PUZZLES[puzzleIdx];
  const size = puzzle.size;

  const [grid, setGrid] = useState<number[][]>(() => Array.from({ length: size }, () => Array(size).fill(0)));
  const [marks, setMarks] = useState<boolean[][]>(() => Array.from({ length: size }, () => Array(size).fill(false)));
  const [won, setWon] = useState(false);
  const [mode, setMode] = useState<"fill" | "mark">("fill");

  const rowClues = useMemo(() => puzzle.solution.map(row => getClues(row)), [puzzle]);
  const colClues = useMemo(() => {
    const cols: number[][] = [];
    for (let c = 0; c < size; c++) {
      const col = puzzle.solution.map(row => row[c]);
      cols.push(getClues(col));
    }
    return cols;
  }, [puzzle, size]);

  const maxRowClue = Math.max(...rowClues.map(c => c.length));
  const maxColClue = Math.max(...colClues.map(c => c.length));

  const handleCell = useCallback((r: number, c: number) => {
    if (won) return;
    if (mode === "fill") {
      const ng = grid.map(row => [...row]);
      ng[r][c] = ng[r][c] === 1 ? 0 : 1;
      setGrid(ng);
      // Check win
      const isWin = puzzle.solution.every((row, ri) => row.every((cell, ci) => (ng[ri][ci] === 1) === (cell === 1)));
      if (isWin) setWon(true);
    } else {
      const nm = marks.map(row => [...row]);
      nm[r][c] = !nm[r][c];
      setMarks(nm);
    }
  }, [grid, marks, mode, won, puzzle]);

  const changePuzzle = (idx: number) => {
    setPuzzleIdx(idx);
    const s = PUZZLES[idx].size;
    setGrid(Array.from({ length: s }, () => Array(s).fill(0)));
    setMarks(Array.from({ length: s }, () => Array(s).fill(false)));
    setWon(false);
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-border-all mr-2 text-[#14b8a6]" />数织 Nonogram</h1>
        <p className="text-[#8a8a8a] text-xs text-center mb-3">根据行列数字提示，推理出哪些格子需要填色</p>

        {/* 关卡选择 */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 justify-center">
          {PUZZLES.map((p, i) => (
            <button key={i} onClick={() => changePuzzle(i)} className={clsx(
              "px-3 py-1 rounded-full text-[12px] border transition shrink-0",
              puzzleIdx === i ? "bg-[#14b8a6] text-[#0f0f0f] border-[#14b8a6] font-bold" : "text-[#aaa] border-[#333] hover:text-white"
            )}>{p.name} ({p.size}x{p.size})</button>
          ))}
        </div>

        {/* 模式切换 */}
        <div className="flex justify-center gap-2 mb-3">
          <button onClick={() => setMode("fill")} className={clsx("px-3 py-1.5 rounded-lg text-xs border transition",
            mode === "fill" ? "bg-[#14b8a6]/15 text-[#14b8a6] border-[#14b8a6]/30 font-bold" : "text-[#aaa] border-[#333]"
          )}>✏️ 填色</button>
          <button onClick={() => setMode("mark")} className={clsx("px-3 py-1.5 rounded-lg text-xs border transition",
            mode === "mark" ? "bg-[#ff4444]/15 text-[#ff4444] border-[#ff4444]/30 font-bold" : "text-[#aaa] border-[#333]"
          )}>✖️ 标记</button>
        </div>

        {/* 棋盘 */}
        <div className="flex justify-center mb-4">
          <div className="inline-block">
            {/* 列提示 */}
            <div className="flex" style={{ marginLeft: maxRowClue * 20 + 4 }}>
              {colClues.map((clue, c) => (
                <div key={c} className="flex flex-col items-center justify-end" style={{ width: size <= 5 ? 36 : 30, height: maxColClue * 16 }}>
                  {clue.map((n, i) => <span key={i} className="text-[11px] text-[#8a8a8a] leading-tight font-mono">{n}</span>)}
                </div>
              ))}
            </div>
            {/* 行 */}
            {grid.map((row, r) => (
              <div key={r} className="flex items-center">
                {/* 行提示 */}
                <div className="flex items-center justify-end gap-1 pr-1" style={{ width: maxRowClue * 20 }}>
                  {rowClues[r].map((n, i) => <span key={i} className="text-[11px] text-[#8a8a8a] font-mono">{n}</span>)}
                </div>
                {/* 格子 */}
                {row.map((cell, c) => (
                  <button key={c} onClick={() => handleCell(r, c)}
                    className={clsx(
                      "border border-[#333] transition-all active:scale-90 flex items-center justify-center",
                      cell === 1 ? "bg-[#14b8a6]" : "bg-[#1a1a1a] hover:bg-[#212121]",
                      r % (size <= 5 ? 5 : 4) === 0 && "border-t-[#555]",
                      c % (size <= 5 ? 5 : 4) === 0 && "border-l-[#555]",
                    )}
                    style={{ width: size <= 5 ? 36 : 30, height: size <= 5 ? 36 : 30 }}>
                    {cell === 0 && marks[r][c] && <span className="text-[#ff4444] text-xs font-bold">✕</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {won && (
          <div className="text-center py-4">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-lg font-bold text-[#14b8a6]">完美解答！</p>
            {puzzleIdx < PUZZLES.length - 1 && (
              <button onClick={() => changePuzzle(puzzleIdx + 1)} className="mt-3 px-6 py-2 rounded-xl bg-[#14b8a6] text-[#0f0f0f] font-bold text-sm">下一关</button>
            )}
          </div>
        )}
        <p className="text-[11px] text-[#666] text-center">行列数字表示连续填色格数 · 用逻辑推理确定每个格子</p>
      </main>
    </>
  );
}
