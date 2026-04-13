"use client";
import { useState, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft } from "lucide-react";

/**
 * Homebrew NES 游戏浏览器
 *
 * 合法免费的自制NES游戏，来源：
 * - https://neshomebrew.net/
 * - https://www.nesdev.org/wiki/Homebrew_games
 *
 * 用户可以下载 .nes ROM 文件后直接在已有的经典游戏模拟器中运行
 */

interface HomebrewGame {
  id: string;
  title: string;
  author: string;
  year: string;
  description: string;
  genre: string;
  players: string;
  downloadUrl?: string;
  sourceUrl: string;
  featured?: boolean;
}

const genres = [
  { id: "all", label: "全部" },
  { id: "platformer", label: "平台跳跃" },
  { id: "puzzle", label: "益智" },
  { id: "action", label: "动作" },
  { id: "adventure", label: "冒险" },
  { id: "shooter", label: "射击" },
  { id: "rpg", label: "RPG" },
  { id: "racing", label: "竞速" },
  { id: "music", label: "音乐" },
  { id: "demo", label: "Demo" },
];

const homebrewGames: HomebrewGame[] = [
  { id: "micro-mages", title: "Micro Mages", author: "Morphcat Games", year: "2019", description: "支持4人同时游玩的平台跳跃游戏，画面精美，关卡设计巧妙。仅40KB的ROM中塞入了完整的游戏体验。", genre: "platformer", players: "1-4P", sourceUrl: "https://morphcat.de/micromages/", featured: true },
  { id: "battle-kid", title: "Battle Kid: Fortress of Peril", author: "Sivak Games", year: "2010", description: "高难度平台动作游戏，灵感来自I Wanna Be The Guy。550+个房间的巨大地图等你探索。", genre: "platformer", players: "1P", sourceUrl: "https://www.retrousb.com/product_info.php?products_id=84", featured: true },
  { id: "alter-ego", title: "Alter Ego", author: "Shiru", year: "2011", description: "创意益智平台游戏。你控制一个角色，但有一个镜像分身会做出相反的动作。利用这个机制解谜通关。", genre: "puzzle", players: "1P", sourceUrl: "https://shiru.untergrund.net/software.shtml" },
  { id: "blade-buster", title: "Blade Buster", author: "High Level Challenge", year: "2011", description: "纵向卷轴射击游戏，画面效果惊人，展示了NES硬件的极限能力。", genre: "shooter", players: "1P", sourceUrl: "http://hlc6502.web.fc2.com/Bbuster.htm", featured: true },
  { id: "from-below", title: "From Below", author: "Mhughson", year: "2020", description: "俄罗斯方块风格的益智游戏，但加入了海怪攻击的元素！在消除方块的同时还要对抗从下方升起的怪物。", genre: "puzzle", players: "1P", sourceUrl: "https://mhughson.itch.io/from-below" },
  { id: "nebs-n-debs", title: "Nebs 'n Debs", author: "Dullahan Software", year: "2018", description: "色彩丰富的平台冒险游戏，两个外星人在地球上的冒险。支持双人合作。", genre: "platformer", players: "1-2P", sourceUrl: "https://www.dullahansoftware.com/" },
  { id: "super-tilt-bro", title: "Super Tilt Bro", author: "Sgadrat", year: "2021", description: "NES上的格斗游戏，灵感来自任天堂明星大乱斗！支持在线对战（通过WiFi适配器）。", genre: "action", players: "1-2P", sourceUrl: "https://sgadrat.itch.io/super-tilt-bro", featured: true },
  { id: "gruniozerca", title: "Gruniożerca", author: "M-Tee & Łukasz Kur", year: "2016", description: "可爱的吃豆人风格游戏，你控制一只小猪在迷宫中收集食物。", genre: "action", players: "1P", sourceUrl: "https://www.romhacking.net/" },
  { id: "twin-dragons", title: "Twin Dragons", author: "Broke Studio", year: "2018", description: "双人合作平台游戏，两条小龙的冒险之旅。精美的像素画风和流畅的操作。", genre: "platformer", players: "1-2P", sourceUrl: "https://www.brokestudio.fr/twin-dragons/" },
  { id: "assimilate", title: "Assimilate", author: "Nessylum Games", year: "2013", description: "快节奏的动作游戏，你需要在不断变化的环境中生存。简单但上瘾。", genre: "action", players: "1P", sourceUrl: "https://nessylum.wordpress.com/" },
  { id: "solar-wars", title: "Solar Wars", author: "Aetherbyte", year: "2014", description: "太空策略射击游戏，在太阳系中进行星际战争。", genre: "shooter", players: "1-2P", sourceUrl: "https://aetherbyte.com/" },
  { id: "spacegulls", title: "Spacegulls", author: "Morphcat Games", year: "2022", description: "Micro Mages团队的新作，太空主题的平台游戏，支持多人合作。", genre: "platformer", players: "1-4P", sourceUrl: "https://morphcat.de/spacegulls/", featured: true },
];

export default function HomebrewPage() {
  const [genre, setGenre] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<HomebrewGame | null>(null);
  const [loadingRom, setLoadingRom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = homebrewGames.filter(g => {
    if (genre !== "all" && g.genre !== genre) return false;
    if (search && !g.title.toLowerCase().includes(search.toLowerCase()) && !g.author.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const featured = homebrewGames.filter(g => g.featured);

  // 处理用户上传的ROM文件 — 跳转到经典游戏模拟器
  const handleRomFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".nes")) {
      alert("请选择 .nes 格式的ROM文件");
      return;
    }
    setLoadingRom(true);
    try {
      // 使用已有的 RomManager 存储到 IndexedDB
      const { RomManager } = await import("@/lib/rom/rom-manager");
      const rm = new RomManager();
      const data = await file.arrayBuffer();
      const hash = await rm.computeHash(data);
      const title = file.name.replace(/\.nes$/i, "");
      await rm.storeLocal(hash, data, "NES", title);
      // 跳转到模拟器页面
      window.location.href = `/games/classic/${hash}`;
    } catch (err) {
      console.error("ROM加载失败:", err);
      alert("ROM加载失败，请重试");
    } finally {
      setLoadingRom(false);
      e.target.value = "";
    }
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 pb-20 md:pb-8">
        {/* 面包屑 */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/games" className="flex items-center gap-1 text-sm text-[#8a8a8a] hover:text-[#3ea6ff] transition">
            <ChevronLeft size={16} /><span>游戏中心</span>
          </Link>
        </div>

        {/* 标题区 */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold"><i className="fas fa-gamepad mr-2 text-[#3ea6ff]" />Homebrew NES 游戏</h1>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loadingRom}
              className="px-4 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-sm font-semibold hover:bg-[#65b8ff] transition flex items-center gap-2 disabled:opacity-50"
            >
              {loadingRom ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-play" />}
              {loadingRom ? "加载中..." : "加载ROM开玩"}
            </button>
            <input ref={fileInputRef} type="file" accept=".nes" className="hidden" onChange={handleRomFile} />
          </div>
        </div>
        <p className="text-[#8a8a8a] text-sm mb-6">
          合法免费的自制NES游戏。从下方网站下载ROM后点击"加载ROM开玩"即可在浏览器中游玩。
        </p>

        {/* ROM下载源 */}
        <div className="p-4 rounded-xl bg-[#1a1a1a]/50 border border-[#333]/50 mb-6">
          <h3 className="text-sm font-bold mb-3"><i className="fas fa-download mr-2 text-[#3ea6ff]" />ROM下载源</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a href="https://neshomebrew.net/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg bg-[#212121] border border-[#333]/50 hover:border-[#3ea6ff]/30 transition group">
              <div className="w-10 h-10 rounded-lg bg-[#3ea6ff]/15 flex items-center justify-center shrink-0">
                <i className="fas fa-globe text-[#3ea6ff]" />
              </div>
              <div>
                <p className="text-sm font-medium group-hover:text-[#3ea6ff] transition">NES Homebrew</p>
                <p className="text-[11px] text-[#666]">neshomebrew.net — 精选自制游戏合集</p>
              </div>
              <i className="fas fa-external-link-alt text-[#666] text-xs ml-auto" />
            </a>
            <a href="https://www.nesdev.org/wiki/Homebrew_games" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg bg-[#212121] border border-[#333]/50 hover:border-[#3ea6ff]/30 transition group">
              <div className="w-10 h-10 rounded-lg bg-[#f0b90b]/15 flex items-center justify-center shrink-0">
                <i className="fas fa-code text-[#f0b90b]" />
              </div>
              <div>
                <p className="text-sm font-medium group-hover:text-[#f0b90b] transition">NESDev Wiki</p>
                <p className="text-[11px] text-[#666]">nesdev.org — 开发者社区 Homebrew 列表</p>
              </div>
              <i className="fas fa-external-link-alt text-[#666] text-xs ml-auto" />
            </a>
          </div>
          <p className="text-[10px] text-[#666] mt-3">
            <i className="fas fa-info-circle mr-1" />
            这些都是开发者自制的免费游戏，下载 .nes 文件后点击上方"加载ROM开玩"即可游玩。
          </p>
        </div>

        {/* 精选推荐 */}
        {genre === "all" && !search && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-4"><i className="fas fa-star mr-2 text-[#f0b90b]" />精选推荐</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {featured.map(g => (
                <div key={g.id} onClick={() => setSelected(g)}
                  className="group p-4 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-[#333]/50 hover:border-[#3ea6ff]/30 cursor-pointer transition hover:-translate-y-0.5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-[#3ea6ff]/15 flex items-center justify-center"><i className="fas fa-gamepad text-[#3ea6ff] text-xl" /></div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm group-hover:text-[#3ea6ff] transition truncate">{g.title}</h3>
                      <p className="text-[11px] text-[#8a8a8a]">{g.author} · {g.year}</p>
                    </div>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-[#3ea6ff]/15 text-[#3ea6ff] font-bold shrink-0">{g.players}</span>
                  </div>
                  <p className="text-[12px] text-[#aaa] line-clamp-2">{g.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 搜索 + 分类 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-xs" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索游戏名或作者..."
              className="w-full h-9 pl-9 pr-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
          </div>
        </div>
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-2">
          {genres.map(g => (
            <button key={g.id} onClick={() => setGenre(g.id)} className={clsx(
              "px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap border transition shrink-0",
              genre === g.id ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold" : "bg-transparent text-[#aaa] border-[#333]/50 hover:bg-[#212121] hover:text-white"
            )}>{g.label}</button>
          ))}
        </div>

        {/* 游戏列表 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(g => (
            <div key={g.id} onClick={() => setSelected(g)}
              className="group p-4 rounded-xl bg-[#1a1a1a]/50 border border-[#333]/50 hover:border-[#3ea6ff]/30 cursor-pointer transition hover:-translate-y-0.5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-[#212121] flex items-center justify-center"><i className="fas fa-gamepad text-[#3ea6ff]" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm group-hover:text-[#3ea6ff] transition truncate">{g.title}</h3>
                  <p className="text-[11px] text-[#8a8a8a]">{g.author} · {g.year}</p>
                </div>
              </div>
              <p className="text-[12px] text-[#8a8a8a] line-clamp-2 mb-2">{g.description}</p>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-[#212121] text-[#aaa]">{genres.find(ge => ge.id === g.genre)?.label}</span>
                <span className="px-2 py-0.5 rounded bg-[#3ea6ff]/15 text-[#3ea6ff] font-bold">{g.players}</span>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <i className="fas fa-gamepad text-4xl mb-4 opacity-20" />
            <p className="text-sm">没有找到匹配的游戏</p>
          </div>
        )}
      </main>

      {/* 游戏详情弹窗 */}
      {selected && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md bg-[#141414] border border-[#333] rounded-t-2xl md:rounded-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center"><i className="fas fa-gamepad text-[#3ea6ff] text-2xl" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold">{selected.title}</h2>
                <p className="text-sm text-[#aaa]">{selected.author} · {selected.year}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#212121] text-[#aaa]">{genres.find(g => g.id === selected.genre)?.label}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#3ea6ff]/15 text-[#3ea6ff] font-bold">{selected.players}</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-[#aaa] mb-4 leading-relaxed">{selected.description}</p>

            <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50 mb-4">
              <p className="text-xs text-[#8a8a8a] mb-2"><i className="fas fa-info-circle mr-1 text-[#3ea6ff]" />如何游玩</p>
              <ol className="text-[12px] text-[#aaa] space-y-1.5 list-decimal list-inside">
                <li>点击下方链接前往游戏官网下载 .nes ROM文件</li>
                <li>回到本页面点击"加载ROM开玩"选择下载的文件</li>
                <li>游戏将自动在浏览器模拟器中启动</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition text-center">
                <i className="fas fa-external-link-alt mr-1.5" />前往下载
              </a>
              <button
                onClick={() => { setSelected(null); fileInputRef.current?.click(); }}
                className="flex-1 py-3 rounded-xl bg-[#2ba640] text-white font-bold text-sm hover:bg-[#2ba640]/80 transition">
                <i className="fas fa-play mr-1.5" />加载ROM
              </button>
            </div>
            <button onClick={() => setSelected(null)} className="w-full mt-2 py-2 text-sm text-[#666] hover:text-white transition">关闭</button>
          </div>
        </div>
      )}
    </>
  );
}
