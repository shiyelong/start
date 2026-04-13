"use client";
import { useState, useMemo } from "react";
import Header from "@/components/Header";
import { games } from "@/lib/mock-data";
import Link from "next/link";
import clsx from "clsx";

/* ========== 分类 ========== */
const categories = [
  { id: "all", label: "全部", icon: "fa-fire" },
  { id: "hot", label: "热门", icon: "fa-fire" },
  { id: "classic", label: "经典模拟", icon: "fa-gamepad" },
  { id: "puzzle", label: "益智解谜", icon: "fa-puzzle-piece" },
  { id: "action", label: "动作冒险", icon: "fa-sword" },
  { id: "strategy", label: "策略经营", icon: "fa-chess" },
  { id: "casual", label: "休闲", icon: "fa-dice" },
];

/* 给游戏打分类标签 */
const gameCategories: Record<string, string> = {
  "2048": "puzzle", snake: "casual", tetris: "puzzle",
  pokemon: "action", civilization: "strategy",
  forest: "action", mecha: "action", shadow: "action",
  spaceshoot: "action", tower: "strategy",
  match3: "puzzle", sudoku: "puzzle", huarong: "puzzle", logic: "puzzle",
  fishing: "casual",
};

/* 精选推荐 */
const featured = ["pokemon", "civilization", "spaceshoot", "shadow", "mecha", "forest"];

export default function GamesPage() {
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "name">("default");

  const filtered = useMemo(() => {
    let list = [...games];
    if (cat === "hot") list = list.filter(g => g.hot);
    else if (cat !== "all" && cat !== "classic") list = list.filter(g => gameCategories[g.id] === cat);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(g => g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q));
    }
    if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    return list;
  }, [cat, search, sortBy]);

  const featuredGames = games.filter(g => featured.includes(g.id));

  return (
    <>
      <Header />
      <main className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 pb-20 md:pb-8">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold"><i className="fas fa-gamepad mr-2 text-[#3ea6ff]" />游戏中心</h1>
          <span className="text-xs text-[#8a8a8a]">{games.length} 款游戏</span>
        </div>
        <p className="text-[#8a8a8a] text-sm mb-6">手机电脑都能玩，随时随地开一局</p>

        {/* ===== 经典模拟器 + Homebrew ===== */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3"><i className="fas fa-gamepad mr-2 text-[#a855f7]" />经典游戏</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/games/classic"
              className="group flex items-center gap-4 p-5 rounded-xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/20 hover:border-[#3ea6ff]/40 hover:-translate-y-0.5 transition overflow-hidden">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                <i className="fas fa-gamepad text-white text-xl" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">经典主机模拟器</h3>
                <p className="text-xs text-[#8a8a8a] mt-1">FC / SFC / GBA / 街机等11种经典主机，上传ROM在线畅玩</p>
              </div>
            </Link>
            <Link href="/games/homebrew"
              className="group flex items-center gap-4 p-5 rounded-xl bg-gradient-to-br from-green-600/20 to-cyan-600/20 border border-green-500/20 hover:border-[#3ea6ff]/40 hover:-translate-y-0.5 transition overflow-hidden">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-cyan-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                <i className="fas fa-house-chimney text-white text-xl" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Homebrew NES 游戏</h3>
                <p className="text-xs text-[#8a8a8a] mt-1">免费合法的自制NES游戏，下载ROM即可在浏览器中畅玩</p>
              </div>
            </Link>
          </div>
        </section>

        {/* ===== 精选大作 ===== */}
        {cat === "all" && !search && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-3"><i className="fas fa-star mr-2 text-[#f0b90b]" />精选推荐</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {featuredGames.map(g => (
                <Link key={g.id} href={`/games/${g.id}`}
                  className="group relative p-4 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-[#333]/50 hover:border-[#3ea6ff]/40 hover:-translate-y-1 transition text-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#3ea6ff]/[0.03] to-purple-500/[0.03] opacity-0 group-hover:opacity-100 transition" />
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${g.color} flex items-center justify-center text-xl mx-auto mb-2 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg`}>
                    <i className={`fas ${g.icon} text-white`} />
                  </div>
                  <h3 className="font-bold text-xs group-hover:text-[#3ea6ff] transition">{g.name}</h3>
                  <p className="text-[10px] text-[#666] mt-0.5 line-clamp-1">{g.desc}</p>
                  <div className="absolute top-1.5 right-1.5">
                    <span className="text-[8px] px-1 py-0.5 rounded bg-[#f0b90b]/15 text-[#f0b90b] font-bold">精选</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ===== 搜索 + 分类 + 排序 ===== */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold"><i className="fas fa-th-large mr-2 text-[#3ea6ff]" />全部游戏</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setSortBy(s => s === "default" ? "name" : "default")}
                className="text-[11px] text-[#8a8a8a] hover:text-white transition">
                <i className={`fas fa-${sortBy === "name" ? "sort-alpha-down" : "sort"} mr-1`} />
                {sortBy === "name" ? "按名称" : "默认"}
              </button>
            </div>
          </div>

          {/* 搜索 */}
          <div className="relative mb-3">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-xs" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索游戏名称..."
              className="w-full h-9 pl-9 pr-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
          </div>

          {/* 分类标签 */}
          <div className="flex gap-1.5 mb-5 overflow-x-auto pb-2 -mx-4 px-4">
            {categories.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)} className={clsx(
                "px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap border transition shrink-0",
                cat === c.id
                  ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold"
                  : "bg-transparent text-[#aaa] border-[#333]/50 hover:bg-[#212121] hover:text-white"
              )}>{c.label}</button>
            ))}
          </div>

          {/* 游戏网格 */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {filtered.map(g => (
              <Link key={g.id} href={`/games/${g.id}`}
                className="group relative p-4 rounded-xl bg-[#1a1a1a]/50 border border-[#333]/50 hover:border-[#3ea6ff]/30 hover:-translate-y-1 transition text-center overflow-hidden">
                {g.hot && <span className="absolute top-1.5 right-1.5 text-[8px] bg-[#ff4444] text-white px-1.5 py-0.5 rounded font-bold">HOT</span>}
                <div className="absolute inset-0 bg-gradient-to-br from-[#3ea6ff]/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${g.color} flex items-center justify-center text-xl mx-auto mb-2 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg`}>
                  <i className={`fas ${g.icon} text-white`} />
                </div>
                <h3 className="font-semibold text-xs group-hover:text-[#3ea6ff] transition">{g.name}</h3>
                <p className="text-[10px] text-[#666] mt-0.5 line-clamp-1">{g.desc}</p>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center text-[#8a8a8a] py-16">
              <i className="fas fa-gamepad text-4xl mb-4 opacity-20" />
              <p className="text-sm">没有找到匹配的游戏</p>
            </div>
          )}

          {/* 统计 */}
          <div className="mt-6 text-center text-[11px] text-[#666]">
            显示 {filtered.length} / {games.length} 款游戏
          </div>
        </section>
      </main>
    </>
  );
}
