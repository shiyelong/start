"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Crown } from "lucide-react";

const W = 400, H = 440, CELL = 48, BOARD = 8;
type Piece = "K" | "Q" | "R" | "B" | "N" | "P" | "k" | "q" | "r" | "b" | "n" | "p" | "";
type Phase = "title" | "player" | "cpu" | "gameover";

const INIT_BOARD: Piece[][] = [
  ["r","n","b","q","k","b","n","r"],
  ["p","p","p","p","p","p","p","p"],
  ["","","","","","","",""],["","","","","","","",""],
  ["","","","","","","",""],["","","","","","","",""],
  ["P","P","P","P","P","P","P","P"],
  ["R","N","B","Q","K","B","N","R"],
];

function isWhite(p: Piece) { return p >= "A" && p <= "Z"; }
function isBlack(p: Piece) { return p >= "a" && p <= "z"; }
function pieceValue(p: Piece): number {
  const v: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100, P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };
  return v[p] || 0;
}

function getMoves(board: Piece[][], r: number, c: number): [number, number][] {
  const p = board[r][c]; if (!p) return [];
  const moves: [number, number][] = [];
  const white = isWhite(p);
  const canGo = (nr: number, nc: number) => nr >= 0 && nr < 8 && nc >= 0 && nc < 8;
  const enemy = (nr: number, nc: number) => canGo(nr, nc) && (white ? isBlack(board[nr][nc]) : isWhite(board[nr][nc]));
  const empty = (nr: number, nc: number) => canGo(nr, nc) && board[nr][nc] === "";
  const addSlide = (dr: number, dc: number) => {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (!canGo(nr, nc)) break;
      if (empty(nr, nc)) moves.push([nr, nc]);
      else { if (enemy(nr, nc)) moves.push([nr, nc]); break; }
    }
  };
  const type = p.toLowerCase();
  if (type === "p") {
    const dir = white ? -1 : 1;
    if (empty(r + dir, c)) { moves.push([r + dir, c]); if ((white && r === 6) || (!white && r === 1)) if (empty(r + dir * 2, c)) moves.push([r + dir * 2, c]); }
    if (enemy(r + dir, c - 1)) moves.push([r + dir, c - 1]);
    if (enemy(r + dir, c + 1)) moves.push([r + dir, c + 1]);
  } else if (type === "n") {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nc = c + dc;
      if (canGo(nr, nc) && (empty(nr, nc) || enemy(nr, nc))) moves.push([nr, nc]);
    }
  } else if (type === "b") { addSlide(-1,-1); addSlide(-1,1); addSlide(1,-1); addSlide(1,1); }
  else if (type === "r") { addSlide(-1,0); addSlide(1,0); addSlide(0,-1); addSlide(0,1); }
  else if (type === "q") { addSlide(-1,-1); addSlide(-1,1); addSlide(1,-1); addSlide(1,1); addSlide(-1,0); addSlide(1,0); addSlide(0,-1); addSlide(0,1); }
  else if (type === "k") {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (canGo(nr, nc) && (empty(nr, nc) || enemy(nr, nc))) moves.push([nr, nc]);
    }
  }
  return moves;
}

function cpuMove(board: Piece[][]): { fr: number; fc: number; tr: number; tc: number } | null {
  let bestScore = -Infinity, bestMove: { fr: number; fc: number; tr: number; tc: number } | null = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (!isBlack(board[r][c])) continue;
    for (const [tr, tc] of getMoves(board, r, c)) {
      let score = Math.random() * 0.5;
      if (board[tr][tc]) score += pieceValue(board[tr][tc]) * 10;
      if (tr === 3 || tr === 4) score += 0.5;
      if (tc === 3 || tc === 4) score += 0.5;
      if (score > bestScore) { bestScore = score; bestMove = { fr: r, fc: c, tr, tc }; }
    }
  }
  return bestMove;
}

export default function ChessGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [validMoves, setValidMoves] = useState<[number, number][]>([]);
  const [msg, setMsg] = useState("");
  const boardRef = useRef<Piece[][]>(INIT_BOARD.map(r => [...r]));
  const rafRef = useRef(0);

  const startGame = useCallback(() => {
    boardRef.current = INIT_BOARD.map(r => [...r]);
    setSelected(null); setValidMoves([]); setMsg(""); setPhase("player");
  }, []);

  const doCpuMove = useCallback(() => {
    setPhase("cpu");
    setTimeout(() => {
      const move = cpuMove(boardRef.current);
      if (!move) { setPhase("gameover"); setMsg("You Win!"); return; }
      const b = boardRef.current;
      const captured = b[move.tr][move.tc];
      b[move.tr][move.tc] = b[move.fr][move.fc];
      b[move.fr][move.fc] = "";
      if (b[move.tr][move.tc] === "p" && move.tr === 7) b[move.tr][move.tc] = "q";
      if (captured === "K") { setPhase("gameover"); setMsg("CPU Wins"); return; }
      setPhase("player");
    }, 400);
  }, []);

  const handleClick = useCallback((mx: number, my: number) => {
    if (phase === "title" || phase === "gameover") { startGame(); return; }
    if (phase !== "player") return;
    const ox = (W - BOARD * CELL) / 2, oy = 8;
    const c = Math.floor((mx - ox) / CELL), r = Math.floor((my - oy) / CELL);
    if (r < 0 || r >= 8 || c < 0 || c >= 8) return;
    const b = boardRef.current;
    if (selected) {
      const vm = validMoves.find(([vr, vc]) => vr === r && vc === c);
      if (vm) {
        const captured = b[r][c];
        b[r][c] = b[selected[0]][selected[1]]; b[selected[0]][selected[1]] = "";
        if (b[r][c] === "P" && r === 0) b[r][c] = "Q";
        setSelected(null); setValidMoves([]);
        if (captured === "k") { setPhase("gameover"); setMsg("You Win!"); return; }
        doCpuMove();
      } else if (isWhite(b[r][c])) {
        setSelected([r, c]); setValidMoves(getMoves(b, r, c));
      } else { setSelected(null); setValidMoves([]); }
    } else if (isWhite(b[r][c])) {
      setSelected([r, c]); setValidMoves(getMoves(b, r, c));
    }
  }, [phase, selected, validMoves, startGame, doCpuMove]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    const PIECE_CHARS: Record<string, string> = { K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658", P: "\u2659", k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };

    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
      const ox = (W - BOARD * CELL) / 2, oy = 8;

      if (phase === "title") {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Chess", W / 2, H / 2 - 30);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Simple AI opponent", W / 2, H / 2);
        ctx.fillText("Click to Start", W / 2, H / 2 + 30);
      } else {
        const b = boardRef.current;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const light = (r + c) % 2 === 0;
          ctx.fillStyle = selected && selected[0] === r && selected[1] === c ? "#4a6a3a" : light ? "#2a2a3e" : "#1a1a2e";
          ctx.fillRect(ox + c * CELL, oy + r * CELL, CELL, CELL);
          // Valid move dots
          if (validMoves.some(([vr, vc]) => vr === r && vc === c)) {
            ctx.fillStyle = "rgba(62,166,255,0.4)";
            ctx.beginPath(); ctx.arc(ox + c * CELL + CELL / 2, oy + r * CELL + CELL / 2, 8, 0, Math.PI * 2); ctx.fill();
          }
          if (b[r][c]) {
            ctx.fillStyle = isWhite(b[r][c]) ? "#fff" : "#ff4757";
            ctx.font = "32px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(PIECE_CHARS[b[r][c]] || b[r][c], ox + c * CELL + CELL / 2, oy + r * CELL + CELL / 2 + 2);
          }
        }
        // Border
        ctx.strokeStyle = "#333"; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, BOARD * CELL, BOARD * CELL);
        // Status
        ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(phase === "cpu" ? "CPU thinking..." : "Your turn (White)", W / 2, oy + BOARD * CELL + 24);

        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = msg.includes("Win") ? "#2ed573" : "#ff4757";
          ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(msg, W / 2, H / 2 - 10);
          ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
          ctx.fillText("Click to Restart", W / 2, H / 2 + 24);
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    const onClick = (e: MouseEvent) => { const rect = canvas.getBoundingClientRect(); handleClick((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)); };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); const t = e.changedTouches[0]; const rect = canvas.getBoundingClientRect(); handleClick((t.clientX - rect.left) * (W / rect.width), (t.clientY - rect.top) * (H / rect.height)); };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, selected, validMoves, msg, handleClick]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><Crown size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Chess</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> New Game</button>
      </div>
    </div>
  );
}
