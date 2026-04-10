"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

// Classic Huarong Dao: 4x5 grid, pieces of different sizes
interface Piece { id: string; name: string; x: number; y: number; w: number; h: number; color: string; }

const LEVELS = [
  { name: "横刀立马", pieces: [
    { id: "cao", name: "曹操", x: 1, y: 0, w: 2, h: 2, color: "#ff4444" },
    { id: "guan", name: "关羽", x: 0, y: 2, w: 2, h: 1, color: "#2ba640" },
    { id: "zhang", name: "张飞", x: 0, y: 0, w: 1, h: 2, color: "#3ea6ff" },
    { id: "zhao", name: "赵云", x: 3, y: 0, w: 1, h: 2, color: "#3ea6ff" },
    { id: "ma", name: "马超", x: 0, y: 3, w: 1, h: 2, color: "#3ea6ff" },
    { id: "huang", name: "黄忠", x: 3, y: 2, w: 1, h: 2, color: "#3ea6ff" },
    { id: "s1", name: "兵", x: 1, y: 2, w: 1, h: 1, color: "#f0b90b" },
    { id: "s2", name: "兵", x: 2, y: 2, w: 1, h: 1, color: "#f0b90b" },
    { id: "s3", name: "兵", x: 1, y: 3, w: 1, h: 1, color: "#f0b90b" },
    { id: "s4", name: "兵", x: 2, y: 3, w: 1, h: 1, color: "#f0b90b" },
  ]},
  { name: "近在咫尺", pieces: [
    { id: "cao", name: "曹操", x: 1, y: 0, w: 2, h: 2, color: "#ff4444" },
    { id: "guan", name: "关羽", x: 1, y: 2, w: 2, h: 1, color: "#2ba640" },
    { id: "zhang", name: "张飞", x: 0, y: 0, w: 1, h: 2, color: "#3ea6ff" },
    { id: "zhao", name: "赵云", x: 3, y: 0, w: 1, h: 2, color: "#3ea6ff" },
    { id: "ma", name: "马超", x: 0, y: 2, w: 1, h: 2, color: "#3ea6ff" },
    { id: "huang", name: "黄忠", x: 3, y: 2, w: 1, h: 2, color: "#3ea6ff" },
    { id: "s1", name: "兵", x: 0, y: 4, w: 1, h: 1, color: "#f0b90b" },
    { id: "s2", name: "兵", x: 1, y: 3, w: 1, h: 1, color: "#f0b90b" },
    { id: "s3", name: "兵", x: 2, y: 3, w: 1, h: 1, color: "#f0b90b" },
    { id: "s4", name: "兵", x: 3, y: 4, w: 1, h: 1, color: "#f0b90b" },
  ]},
];

const GRID_W = 4, GRID_H = 5, CELL = 70;

export default function HuarongPage() {
  const [levelIdx, setLevelIdx] = useState(0);
  const [pieces, setPieces] = useState<Piece[]>(() => LEVELS[0].pieces.map(p => ({ ...p })));
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const isOccupied = useCallback((pieces: Piece[], x: number, y: number, ignoreId: string) => {
    return pieces.some(p => p.id !== ignoreId && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  }, []);

  const canMove = useCallback((pieces: Piece[], piece: Piece, dx: number, dy: number): boolean => {
    const nx = piece.x + dx, ny = piece.y + dy;
    if (nx < 0 || nx + piece.w > GRID_W || ny < 0 || ny + piece.h > GRID_H) return false;
    for (let px = nx; px < nx + piece.w; px++) {
      for (let py = ny; py < ny + piece.h; py++) {
        if (isOccupied(pieces, px, py, piece.id)) return false;
      }
    }
    return true;
  }, [isOccupied]);

  const movePiece = useCallback((id: string, dx: number, dy: number) => {
    if (won) return;
    const np = pieces.map(p => ({ ...p }));
    const piece = np.find(p => p.id === id);
    if (!piece || !canMove(np, piece, dx, dy)) return;
    piece.x += dx;
    piece.y += dy;
    setPieces(np);
    setMoves(m => m + 1);
    // Win: 曹操 at (1,3)
    const cao = np.find(p => p.id === "cao");
    if (cao && cao.x === 1 && cao.y === 3) setWon(true);
  }, [pieces, won, canMove]);

  const changeLevel = (idx: number) => {
    setLevelIdx(idx);
    setPieces(LEVELS[idx].pieces.map(p => ({ ...p })));
    setMoves(0);
    setWon(false);
  };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-chess-board mr-2 text-[#ff4444]" />华容道</h1>
        <p className="text-[#8a8a8a] text-xs text-center mb-3">移动棋子，让曹操（红色大块）从底部中间逃出</p>

        <div className="flex justify-center gap-2 mb-3">
          {LEVELS.map((l, i) => (
            <button key={i} onClick={() => changeLevel(i)} className={clsx(
              "px-3 py-1 rounded-full text-[12px] border transition",
              levelIdx === i ? "bg-[#ff4444] text-white border-[#ff4444] font-bold" : "text-[#aaa] border-[#333]"
            )}>{l.name}</button>
          ))}
        </div>

        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#3ea6ff]"><i className="fas fa-shoe-prints mr-1" />{moves}步</span>
        </div>

        {/* 棋盘 */}
        <div className="flex justify-center mb-4">
          <div className="relative bg-[#1a1a1a] border-2 border-[#555] rounded-xl" style={{ width: GRID_W * CELL + 16, height: GRID_H * CELL + 16, padding: 8 }}>
            {/* 出口标记 */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[140px] h-1 bg-[#ff4444]/50 rounded" />
            {/* 棋子 */}
            {pieces.map(p => (
              <div key={p.id}
                className={clsx("absolute rounded-lg border-2 flex items-center justify-center font-bold text-sm cursor-pointer select-none transition-all duration-150",
                  dragging === p.id ? "z-10 scale-105 shadow-lg" : "z-0",
                  p.id === "cao" ? "border-[#ff6666]" : "border-[#555]"
                )}
                style={{
                  left: p.x * CELL, top: p.y * CELL,
                  width: p.w * CELL - 4, height: p.h * CELL - 4,
                  backgroundColor: p.color,
                }}
                onMouseDown={() => setDragging(p.id)}
                onMouseUp={() => setDragging(null)}
                onTouchStart={() => setDragging(p.id)}
                onTouchEnd={() => setDragging(null)}>
                <span className="text-white/90 text-xs">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 方向键 */}
        {dragging && (
          <div className="flex flex-col items-center gap-1 mb-3">
            <p className="text-[11px] text-[#f0b90b] mb-1">移动: {pieces.find(p => p.id === dragging)?.name}</p>
            <button onClick={() => movePiece(dragging, 0, -1)} className="w-12 h-12 rounded-lg bg-[#212121] border border-[#333] active:bg-[#3ea6ff]/20">↑</button>
            <div className="flex gap-1">
              <button onClick={() => movePiece(dragging, -1, 0)} className="w-12 h-12 rounded-lg bg-[#212121] border border-[#333] active:bg-[#3ea6ff]/20">←</button>
              <button onClick={() => movePiece(dragging, 0, 1)} className="w-12 h-12 rounded-lg bg-[#212121] border border-[#333] active:bg-[#3ea6ff]/20">↓</button>
              <button onClick={() => movePiece(dragging, 1, 0)} className="w-12 h-12 rounded-lg bg-[#212121] border border-[#333] active:bg-[#3ea6ff]/20">→</button>
            </div>
          </div>
        )}
        {!dragging && !won && <p className="text-[11px] text-[#666] text-center">点击棋子选中，然后用方向键移动</p>}

        {won && (
          <div className="text-center py-4">
            <p className="text-3xl mb-2">🏆</p>
            <p className="text-lg font-bold text-[#ff4444]">曹操逃出！</p>
            <p className="text-[#8a8a8a] text-sm">用了 {moves} 步</p>
          </div>
        )}
      </main>
    </>
  );
}
