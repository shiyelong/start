"use client";
import { useState } from "react";
import Header from "@/components/Header";
import { hotVideos } from "@/lib/mock-data";
import clsx from "clsx";

const cats = [
  { id: "owner", label: "站长推荐", icon: "fa-star" },
  { id: "all", label: "热门", icon: "fa-fire" },
  { id: "game", label: "游戏", icon: "fa-gamepad" },
  { id: "music", label: "音乐", icon: "fa-music" },
  { id: "life", label: "生活", icon: "fa-heart" },
  { id: "funny", label: "搞笑", icon: "fa-face-laugh" },
];

function fmtNum(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

const ownerBiliVideos = [
  { bvid: "BV1GJ411x7h7", title: "反差", duration: "00:16", views: 72 },
  { bvid: "BV1bK4y1C7yA", title: "泳池比基尼展示", duration: "01:09", views: 156 },
  { bvid: "BV1x54y1e7zf", title: "喜欢吗?", duration: "00:30", views: 280 },
  { bvid: "BV1uT4y1P7CX", title: "谁，我又没钱了", duration: "00:04", views: 156 },
  { bvid: "BV1Hx411w7X3", title: "更新看，赶紧来围观吧", duration: "00:05", views: 192 },
  { bvid: "BV1aS4y1P7Gj", title: "女生宿舍真的乱", duration: "00:12", views: 83 },
  { bvid: "BV1GJ411x7h7", title: "推沙滩", duration: "00:11", views: 43 },
  { bvid: "BV1bK4y1C7yA", title: "AI生成很多", duration: "00:36", views: 66 },
  { bvid: "BV1x54y1e7zf", title: "她爸爸说这样最好看", duration: "00:08", views: 64 },
  { bvid: "BV1uT4y1P7CX", title: "多学多看多实战", duration: "00:15", views: 56 },
  { bvid: "BV1Hx411w7X3", title: "更多精彩内容", duration: "03:20", views: 320 },
  { bvid: "BV1aS4y1P7Gj", title: "日常分享", duration: "05:10", views: 210 },
];

/* 渐变色封面（因为B站API封面跨域无法直接用） */
const coverGradients = [
  "from-[#1a0a2e] to-[#2a1a3e]", "from-[#0a1a2e] to-[#1a2a3e]",
  "from-[#2a0a0a] to-[#3a1a1a]", "from-[#0a2a1a] to-[#1a3a2a]",
  "from-[#1a1a0e] to-[#2a2a1e]", "from-[#2a1a0a] to-[#3a2a1a]",
  "from-[#0a0a2a] to-[#1a1a3a]", "from-[#2a0a1a] to-[#3a1a2a]",
  "from-[#1a0a1a] to-[#2a1a2a]", "from-[#0a1a1a] to-[#1a2a2a]",
  "from-[#1a1a2e] to-[#0a2a3e]", "from-[#2a1a1a] to-[#3a0a2a]",
];

export default function VideosPage() {
  const [cat, setCat] = useState("owner");
  const [playing, setPlaying] = useState<{ bvid: string; title: string } | null>(null);
  const [search, setSearch] = useState("");

  const filtered = (() => {
    if (cat === "owner") return null; // 站长视频单独处理
    const list = cat === "all" ? hotVideos : hotVideos.filter(v => v.category === cat);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(v => v.title.toLowerCase().includes(q) || v.author.toLowerCase().includes(q));
  })();

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold"><i className="fas fa-play-circle mr-2 text-[#3ea6ff]" />视频中心</h1>
          <div className="flex items-center gap-2">
            {cat === "owner" && (
              <a href="https://space.bilibili.com/385144618" target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[#fb7299] text-white text-xs font-semibold hover:bg-[#fc8bab] transition flex items-center gap-1.5">
                <i className="fab fa-bilibili" /> B站关注
              </a>
            )}
          </div>
        </div>

        {/* 分类 */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {cats.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} className={clsx(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition shrink-0",
              cat === c.id ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold" : "bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white"
            )}>
              <i className={`fas ${c.icon} text-[10px]`} />{c.label}
            </button>
          ))}
        </div>

        {/* 搜索（非站长模式） */}
        {cat !== "owner" && (
          <div className="relative mb-4">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-xs" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索视频..."
              className="w-full h-9 pl-9 pr-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
          </div>
        )}

        {/* ===== 站长视频 ===== */}
        {cat === "owner" && (
          <>
            {/* 站长横幅 */}
            <div className="mb-5 p-5 rounded-2xl bg-gradient-to-br from-[#0a0a2e] via-[#1a0a3e] to-[#0a1a3e] border border-[#333]/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#3ea6ff]/[0.05] rounded-full blur-[60px]" />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#3ea6ff] flex items-center justify-center text-[#0f0f0f] text-xl font-black shrink-0 shadow-lg shadow-[#3ea6ff]/30">U</div>
                <div>
                  <h2 className="font-bold text-lg">Undefinde_NaN</h2>
                  <p className="text-[#8a8a8a] text-xs mt-0.5">{ownerBiliVideos.length} 个视频 · B站创作者</p>
                </div>
                <a href="https://space.bilibili.com/385144618" target="_blank" rel="noopener noreferrer"
                  className="ml-auto px-4 py-2 rounded-lg bg-[#fb7299] text-white text-xs font-bold hover:bg-[#fc8bab] transition shrink-0">
                  <i className="fab fa-bilibili mr-1" />访问B站
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {ownerBiliVideos.map((v, i) => (
                <div key={i} onClick={() => setPlaying({ bvid: v.bvid, title: v.title })}
                  className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1">
                  <div className={`relative aspect-video bg-gradient-to-br ${coverGradients[i % coverGradients.length]} rounded-xl overflow-hidden`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 group-hover:scale-110 transition-all">
                        <i className="fas fa-play text-white text-sm ml-0.5" />
                      </div>
                    </div>
                    <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">{v.duration}</span>
                    <span className="absolute top-1.5 left-1.5 bg-[#3ea6ff] text-[#0f0f0f] text-[9px] px-1.5 py-0.5 rounded font-bold">
                      <i className="fas fa-star mr-0.5" />站长
                    </span>
                  </div>
                  <div className="pt-2 pb-1">
                    <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">{v.title}</h3>
                    <p className="text-[12px] text-[#8a8a8a] mt-1">{fmtNum(v.views)} 播放</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== 其他分类 ===== */}
        {filtered && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {filtered.map(v => (
              <div key={v.id} onClick={() => setPlaying({ bvid: v.bvid, title: v.title })}
                className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1">
                <div className="relative aspect-video bg-[#1a1a1a] overflow-hidden rounded-xl">
                  {v.thumb ? (
                    <img src={v.thumb} alt={v.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center">
                      <i className="fas fa-play-circle text-3xl text-white/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                      <i className="fas fa-play text-white text-lg ml-0.5" />
                    </div>
                  </div>
                  <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">{v.duration}</span>
                </div>
                <div className="pt-2 pb-1">
                  <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">{v.title}</h3>
                  <p className="text-[12px] text-[#8a8a8a] mt-1">{v.author} · {fmtNum(v.views)} 播放</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered && filtered.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <i className="fas fa-video text-4xl mb-4 opacity-30" />
            <p>暂无该分类视频</p>
          </div>
        )}
      </main>

      {/* ===== 播放弹窗 ===== */}
      {playing && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3 md:p-6" onClick={() => setPlaying(null)}>
          <div className="w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold text-base md:text-lg truncate pr-4">{playing.title}</h2>
              <button onClick={() => setPlaying(null)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition shrink-0">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
              <iframe
                src={`//player.bilibili.com/player.html?bvid=${playing.bvid}&high_quality=1&danmaku=0&autoplay=1`}
                className="w-full h-full border-0"
                allowFullScreen
                allow="autoplay; fullscreen; picture-in-picture"
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-[#8a8a8a]">
              <span>Undefinde_NaN</span>
              <a href={`https://www.bilibili.com/video/${playing.bvid}`} target="_blank" rel="noopener noreferrer"
                className="text-[#fb7299] hover:text-[#fc8bab] text-xs flex items-center gap-1">
                <i className="fab fa-bilibili" /> 在B站观看
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
