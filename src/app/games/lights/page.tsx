"use client";
import { useState, useCallback, useMemo } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

function generatePuzzle(size: number, moves: number): boolean[][] {
  const grid = Array.from({ length: size }, () => Array(size).fill(false));
  // Apply random moves to create a solvable puzzle
  for (let i = 0; i < moves; i++) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    toggle(grid, r, c, size);
  }
  // Make sure it's not already solved
  if (grid.every(row => row.every(cell => !cell))) return generatePuzzle(size, moves);
  return grid;
}

function toggle(grid: boolean[][], r: number, c: number, size: number) {
  grid[r][c] = !grid[r][c];
  if (r > 0) grid[r - 1][c] = !grid[r - 1][c];
  if (r < size - 1) grid[r + 1][c] = !grid[r + 1][c];
  if (c > 0) grid[r][c - 1] = !grid[r][c - 1];
  if (c < size - 1) grid[r][c + 1] = !grid[r][c + 1];
}

const LEVELS = [
  { size: 3, moves: 3, label: "3×3 简单" },
  { size: 4, moves: 5, label: "4×4 中等" },
  { size: 5, moves: 8, label: "5×5 困难" },
  { size: 6, moves: 12, label: "6×6 地狱" },
  { size: 7, moves: 16, label: "7×7 噩梦" },
];

export default function LightsPage() {
  const [levelIdx, setLevelIdx] = useState(0);
  const level = LEVELS[levelIdx];
  const [grid, setGrid] = useState(() => generatePuzzle(level.size, level.moves));
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);

  const lightsOn = useMemo(() => grid.flat().filter(Boolean).length, [grid]);

  const handleClick = useCallback((r: number, c: number) => {
    if (won) return;
    const ng = grid.map(row => [...row]);
    toggle(ng, r, c, level.size);
    setGrid(ng);
    setMoves(m => m + 1);
    if (ng.every(row => row.every(cell => !cell))) setWon(true);
  }, [grid, won, level.size]);

  const changeLevel = (idx: number) => {
    setLevelIdx(idx);
    const l = LEVELS[idx];
    setGrid(generatePuzzle(l.size, l.moves));
    setMoves(0);
    setWon(false);
  };

  const restart = () => {
    setGrid(generatePuzzle(level.size, level.moves));
    setMoves(0);
    setWon(false);
  };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-lightbulb mr-2 text-[#f0b90b]" />关灯游戏</h1>
        <p className="text-[#8a8a8a] text-xs text-center mb-3">点击一个灯，它和上下左右的灯都会翻转。目标：全部关掉。</p>

        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 justify-center">
          {LEVELS.map((l, i) => (
            <button key={i} onClick={() => changeLevel(i)} className={clsx(
              "px-3 py-1 rounded-full text-[12px] border transition shrink-0",
              levelIdx === i ? "bg-[#f0b90b] text-[#0f0f0f] border-[#f0b90b] font-bold" : "text-[#aaa] border-[#333] hover:text-white"
            )}>{l.label}</button>
          ))}
        </div>

        <div className="flex justify-center gap-4 text-sm mb-4">
          <span className="text-[#f0b90b]"><i className="fas fa-lightbulb mr-1" />{lightsOn}亮</span>
          <span className="text-[#3ea6ff]"><i className="fas fa-hand-pointer mr-1" />{moves}步</span>
        </div>

        <div className="flex justify-center mb-4">
          <div className="inline-grid gap-1.5" style={{ gridTemplateColumns: `repeat(${level.size}, 1fr)` }}>
            {grid.map((row, r) => row.map((on, c) => (
              <button key={`${r}-${c}`} onClick={() => handleClick(r, c)}
                className={clsx(
                  "rounded-lg transition-all duration-200 active:scale-90 border-2",
                  on
                    ? "bg-[#f0b90b] border-[#f0b90b] shadow-[0_0_12px_rgba(240,185,11,0.5)]"
                    : "bg-[#1a1a1a] border-[#333] hover:border-[#555]"
                )}
                style={{ width: Math.min(60, 300 / level.size), height: Math.min(60, 300 / level.size) }}>
                {on && <i className="fas fa-sun text-[#0f0f0f]" style={{ fontSize: Math.min(20, 120 / level.size) }} />}
              </button>
            )))}
          </div>
        </div>

        {won && (
          <div className="text-center py-4">
            <p className="text-3xl mb-2">🌙</p>
            <p className="text-lg font-bold text-[#f0b90b]">全部关灯！</p>
            <p className="text-[#8a8a8a] text-sm mb-3">用了 {moves} 步</p>
            <div className="flex justify-center gap-2">
              <button onClick={restart} className="px-4 py-2 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa]">再来一次</button>
              {levelIdx < LEVELS.length - 1 && (
                <button onClick={() => changeLevel(levelIdx + 1)} className="px-4 py-2 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm">下一难度</button>
              )}
            </div>
          </div>
        )}
        {!won && <button onClick={restart} className="block mx-auto text-[11px] text-[#666] hover:text-[#aaa] transition">🔄 重新生成</button>}
      </main>
    </>
  );
}
