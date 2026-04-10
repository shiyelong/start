"use client";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

// W=wall, .=floor, P=player, B=box, T=target, X=box on target, Q=player on target
type Cell = "W" | "." | "P" | "B" | "T" | "X" | "Q";

const LEVELS: { name: string; map: string[] }[] = [
  { name: "第1关", map: [
    "  WWW ",
    "WWW.W ",
    "W.B.W ",
    "WWW.WW",
    " WT..W",
    " W...W",
    " WWWWW",
  ]},
  { name: "第2关", map: [
    "WWWWW ",
    "W...WW",
    "W.BB.W",
    "WW.WWW",
    " WT..W",
    " WT..W",
    " WWWWW",
  ]},
  { name: "第3关", map: [
    "  WWWWW",
    "WWW...W",
    "W.PB..W",
    "WWW.B.W",
    "W.WW..W",
    "W.W.T.W",
    "WB.XB.W",
    "W..T..W",
    "WWWWWWW",
  ]},
  { name: "第4关", map: [
    "WWWWWWWW",
    "W......W",
    "W.WBBW.W",
    "W..BT..W",
    "WW.TT.WW",
    " W....W ",
    " WWWWWW ",
  ]},
  { name: "第5关", map: [
    " WWWWWW ",
    "WW....WW",
    "W..WB..W",
    "W.BWBW.W",
    "WT.BTT.W",
    "WTWW.T.W",
    "W......W",
    "WWWWWWWW",
  ]},
];

function parseMap(lines: string[]): { grid: Cell[][]; playerPos: [number, number] } {
  const maxW = Math.max(...lines.map(l => l.length));
  const grid: Cell[][] = lines.map(line => {
    const row: Cell[] = [];
    for (let i = 0; i < maxW; i++) {
      const ch = line[i] || " ";
      if (ch === "W") row.push("W");
      else if (ch === "P") row.push("P");
      else if (ch === "B") row.push("B");
      else if (ch === "T") row.push("T");
      else if (ch === "X") row.push("X");
      else if (ch === "Q") row.push("Q");
      else if (ch === ".") row.push(".");
      else row.push("W"); // space = wall
    }
    return row;
  });
  let playerPos: [number, number] = [0, 0];
  grid.forEach((row, r) => row.forEach((cell, c) => { if (cell === "P" || cell === "Q") playerPos = [r, c]; }));
  return { grid, playerPos };
}

const CELL_SIZE = 40;
const EMOJIS: Record<Cell, string> = { W: "🧱", ".": "", P: "🧑", B: "📦", T: "⭕", X: "✅", Q: "🧑" };

export default function SokobanPage() {
  const [levelIdx, setLevelIdx] = useState(0);
  const [{ grid, playerPos }, setState] = useState(() => parseMap(LEVELS[0].map));
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const [history, setHistory] = useState<{ grid: Cell[][]; playerPos: [number, number] }[]>([]);

  const changeLevel = (idx: number) => {
    setLevelIdx(idx);
    setState(parseMap(LEVELS[idx].map));
    setMoves(0);
    setWon(false);
    setHistory([]);
  };

  const move = useCallback((dr: number, dc: number) => {
    if (won) return;
    const [pr, pc] = playerPos;
    const nr = pr + dr, nc = pc + dc;
    if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) return;
    const target = grid[nr][nc];
    if (target === "W") return;

    // Save history for undo
    setHistory(prev => [...prev, { grid: grid.map(r => [...r]), playerPos: [...playerPos] as [number, number] }]);

    const ng = grid.map(r => [...r]);

    if (target === "B" || target === "X") {
      // Push box
      const br = nr + dr, bc = nc + dc;
      if (br < 0 || br >= ng.length || bc < 0 || bc >= ng[0].length) return;
      const behind = ng[br][bc];
      if (behind === "W" || behind === "B" || behind === "X") return;
      ng[br][bc] = behind === "T" ? "X" : "B";
      ng[nr][nc] = (target === "X") ? "T" : ".";
    }

    // Move player
    const currentCell = ng[pr][pc];
    ng[pr][pc] = (currentCell === "P") ? "." : (currentCell === "Q") ? "T" : ".";
    const destCell = ng[nr][nc];
    ng[nr][nc] = (destCell === "T") ? "Q" : "P";

    setState({ grid: ng, playerPos: [nr, nc] });
    setMoves(m => m + 1);

    // Check win: no remaining targets (all should be X)
    const hasUnfinished = ng.some(row => row.some(c => c === "T" || c === "Q"));
    if (!hasUnfinished) setWon(true);
  }, [grid, playerPos, won]);

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setState({ grid: prev.grid, playerPos: prev.playerPos });
    setHistory(h => h.slice(0, -1));
    setMoves(m => m - 1);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") move(-1, 0);
      if (e.key === "ArrowDown" || e.key === "s") move(1, 0);
      if (e.key === "ArrowLeft" || e.key === "a") move(0, -1);
      if (e.key === "ArrowRight" || e.key === "d") move(0, 1);
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) undo();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [move]);

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-box mr-2 text-[#f0b90b]" />推箱子</h1>
        <div className="flex justify-center gap-1.5 mb-3 overflow-x-auto">
          {LEVELS.map((l, i) => (
            <button key={i} onClick={() => changeLevel(i)} className={clsx(
              "px-3 py-1 rounded-full text-[12px] border transition shrink-0",
              levelIdx === i ? "bg-[#f0b90b] text-[#0f0f0f] border-[#f0b90b] font-bold" : "text-[#aaa] border-[#333]"
            )}>{l.name}</button>
          ))}
        </div>
        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#3ea6ff]"><i className="fas fa-shoe-prints mr-1" />{moves}步</span>
          <button onClick={undo} disabled={history.length === 0} className="text-[11px] text-[#aaa] hover:text-white disabled:opacity-30">↩️ 撤销</button>
          <button onClick={() => changeLevel(levelIdx)} className="text-[11px] text-[#aaa] hover:text-white">🔄 重置</button>
        </div>

        {/* 棋盘 */}
        <div className="flex justify-center mb-4 overflow-x-auto">
          <div className="inline-grid gap-0" style={{ gridTemplateColumns: `repeat(${grid[0]?.length || 1}, ${CELL_SIZE}px)` }}>
            {grid.map((row, r) => row.map((cell, c) => (
              <div key={`${r}-${c}`}
                className={clsx("flex items-center justify-center text-lg select-none",
                  cell === "W" ? "bg-[#2a2a2a]" : cell === "T" || cell === "Q" ? "bg-[#1a2a1a]" : cell === "X" ? "bg-[#2ba640]/20" : "bg-[#1a1a1a]",
                )}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}>
                {EMOJIS[cell]}
              </div>
            )))}
          </div>
        </div>

        {/* 手机方向键 */}
        <div className="flex flex-col items-center gap-1 mb-3 md:hidden">
          <button onClick={() => move(-1, 0)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-lg active:bg-[#f0b90b]/20">↑</button>
          <div className="flex gap-1">
            <button onClick={() => move(0, -1)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-lg active:bg-[#f0b90b]/20">←</button>
            <button onClick={() => move(1, 0)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-lg active:bg-[#f0b90b]/20">↓</button>
            <button onClick={() => move(0, 1)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-lg active:bg-[#f0b90b]/20">→</button>
          </div>
        </div>

        {won && (
          <div className="text-center py-4">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-lg font-bold text-[#2ba640]">过关！</p>
            <p className="text-[#8a8a8a] text-sm mb-3">用了 {moves} 步</p>
            {levelIdx < LEVELS.length - 1 && (
              <button onClick={() => changeLevel(levelIdx + 1)} className="px-6 py-2 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm">下一关</button>
            )}
          </div>
        )}
        <p className="text-[11px] text-[#666] text-center">方向键/WASD移动 · 把📦推到⭕上变✅ · Ctrl+Z撤销</p>
      </main>
    </>
  );
}
