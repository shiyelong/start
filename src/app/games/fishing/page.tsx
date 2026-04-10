"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

interface Fish { name: string; emoji: string; rarity: "common" | "rare" | "epic" | "legendary"; weight: string; price: number; chance: number; }

const FISH_POOL: Fish[] = [
  { name: "鲫鱼", emoji: "🐟", rarity: "common", weight: "0.3-1.2kg", price: 5, chance: 30 },
  { name: "草鱼", emoji: "🐠", rarity: "common", weight: "1-3kg", price: 10, chance: 25 },
  { name: "鲤鱼", emoji: "🐡", rarity: "common", weight: "0.5-2kg", price: 8, chance: 20 },
  { name: "鲈鱼", emoji: "🎣", rarity: "rare", weight: "1-4kg", price: 25, chance: 10 },
  { name: "金枪鱼", emoji: "🦈", rarity: "rare", weight: "5-20kg", price: 50, chance: 7 },
  { name: "河豚", emoji: "🐡", rarity: "epic", weight: "0.5-2kg", price: 100, chance: 4 },
  { name: "龙虾", emoji: "🦞", rarity: "epic", weight: "0.8-3kg", price: 80, chance: 3 },
  { name: "金龙鱼", emoji: "✨", rarity: "legendary", weight: "2-5kg", price: 500, chance: 0.8 },
  { name: "美人鱼", emoji: "🧜", rarity: "legendary", weight: "???", price: 1000, chance: 0.2 },
];

const RARITY_COLORS: Record<string, string> = { common: "text-[#aaa]", rare: "text-[#3ea6ff]", epic: "text-[#a855f7]", legendary: "text-[#f0b90b]" };
const RARITY_BG: Record<string, string> = { common: "border-[#333]", rare: "border-[#3ea6ff]/30", epic: "border-[#a855f7]/30", legendary: "border-[#f0b90b]/30 bg-[#f0b90b]/5" };
const RARITY_LABELS: Record<string, string> = { common: "普通", rare: "稀有", epic: "史诗", legendary: "传说" };

export default function FishingPage() {
  const [fishing, setFishing] = useState(false);
  const [caught, setCaught] = useState<(Fish & { actualWeight: string })[]>([]);
  const [lastCatch, setLastCatch] = useState<(Fish & { actualWeight: string }) | null>(null);
  const [gold, setGold] = useState(0);
  const [bait, setBait] = useState(20);
  const [collection, setCollection] = useState<Set<string>>(new Set());

  const castLine = useCallback(() => {
    if (bait <= 0 || fishing) return;
    setFishing(true);
    setBait(prev => prev - 1);
    setLastCatch(null);
    const delay = 1500 + Math.random() * 2000;
    setTimeout(() => {
      const roll = Math.random() * 100;
      let cumulative = 0;
      let fish = FISH_POOL[0];
      for (const f of FISH_POOL) { cumulative += f.chance; if (roll < cumulative) { fish = f; break; } }
      const [minW, maxW] = fish.weight.includes("?") ? [0, 0] : fish.weight.replace("kg", "").split("-").map(Number);
      const w = minW > 0 ? (minW + Math.random() * (maxW - minW)).toFixed(1) + "kg" : "???";
      const result = { ...fish, actualWeight: w };
      setCaught(prev => [result, ...prev]);
      setLastCatch(result);
      setGold(prev => prev + fish.price);
      setCollection(prev => new Set(Array.from(prev).concat(fish.name)));
      setFishing(false);
    }, delay);
  }, [bait, fishing]);

  const buyBait = () => { if (gold >= 20) { setGold(prev => prev - 20); setBait(prev => prev + 10); } };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-fish mr-2 text-[#3ea6ff]" />钓鱼达人</h1>
        <div className="flex justify-center gap-4 text-sm mb-4">
          <span className="text-[#f0b90b]"><i className="fas fa-coins mr-1" />{gold}</span>
          <span className="text-[#3ea6ff]"><i className="fas fa-worm mr-1" />{bait}饵</span>
          <span className="text-[#aaa]"><i className="fas fa-book mr-1" />{collection.size}/{FISH_POOL.length}种</span>
        </div>

        {/* 钓鱼区 */}
        <div className="relative h-48 rounded-xl bg-gradient-to-b from-[#0a1628] to-[#0a2a4a] border border-[#333] mb-4 overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 opacity-20">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="absolute text-xl animate-pulse" style={{ left: `${10 + i * 12}%`, top: `${30 + Math.sin(i) * 20}%`, animationDelay: `${i * 0.3}s` }}>🐟</div>
            ))}
          </div>
          {fishing ? (
            <div className="text-center z-10">
              <div className="text-4xl mb-2 animate-bounce">🎣</div>
              <p className="text-[#3ea6ff] text-sm animate-pulse">等待鱼上钩...</p>
            </div>
          ) : lastCatch ? (
            <div className="text-center z-10 animate-slide-up">
              <div className="text-5xl mb-2">{lastCatch.emoji}</div>
              <p className={`font-bold ${RARITY_COLORS[lastCatch.rarity]}`}>{lastCatch.name}</p>
              <p className="text-[11px] text-[#8a8a8a]">{lastCatch.actualWeight} · {RARITY_LABELS[lastCatch.rarity]} · +{lastCatch.price}金</p>
            </div>
          ) : (
            <div className="text-center z-10">
              <div className="text-4xl mb-2">🌊</div>
              <p className="text-[#8a8a8a] text-sm">点击下方按钮开始钓鱼</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={castLine} disabled={fishing || bait <= 0}
            className={clsx("flex-1 py-3 rounded-xl font-bold text-sm transition active:scale-95",
              fishing || bait <= 0 ? "bg-[#333] text-[#666]" : "bg-[#3ea6ff] text-[#0f0f0f] hover:bg-[#65b8ff]"
            )}>
            <i className="fas fa-water mr-1.5" />{fishing ? "钓鱼中..." : bait <= 0 ? "没有鱼饵了" : "抛竿"}
          </button>
          <button onClick={buyBait} disabled={gold < 20}
            className={clsx("px-4 py-3 rounded-xl text-sm font-semibold border transition",
              gold < 20 ? "border-[#333] text-[#666]" : "border-[#f0b90b]/30 text-[#f0b90b] hover:bg-[#f0b90b]/10"
            )}>
            买饵(20金)
          </button>
        </div>

        {/* 图鉴 */}
        <h3 className="text-sm font-bold mb-2"><i className="fas fa-book mr-1 text-[#f0b90b]" />鱼类图鉴</h3>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {FISH_POOL.map(f => (
            <div key={f.name} className={clsx("p-2 rounded-lg border text-center", collection.has(f.name) ? RARITY_BG[f.rarity] : "border-[#333] opacity-40")}>
              <div className="text-xl">{collection.has(f.name) ? f.emoji : "❓"}</div>
              <p className={`text-[10px] font-bold ${collection.has(f.name) ? RARITY_COLORS[f.rarity] : "text-[#666]"}`}>
                {collection.has(f.name) ? f.name : "???"}
              </p>
            </div>
          ))}
        </div>

        {/* 钓鱼记录 */}
        {caught.length > 0 && (
          <>
            <h3 className="text-sm font-bold mb-2"><i className="fas fa-list mr-1 text-[#3ea6ff]" />最近钓获</h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {caught.slice(0, 10).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] p-1.5 rounded-lg bg-[#1a1a1a]">
                  <span>{f.emoji}</span>
                  <span className={`font-bold ${RARITY_COLORS[f.rarity]}`}>{f.name}</span>
                  <span className="text-[#8a8a8a]">{f.actualWeight}</span>
                  <span className="text-[#f0b90b] ml-auto">+{f.price}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
