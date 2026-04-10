"use client";
import { useState } from "react";
import Header from "@/components/Header";
import { hotVideos } from "@/lib/mock-data";
import clsx from "clsx";

const cats = [
  { id: "owner", label: "站长推荐" },
  { id: "all", label: "热门" },
  { id: "Pornhub", label: "P站" },
  { id: "Afun", label: "A站" },
  { id: "game", label: "游戏" },
  { id: "music", label: "音乐" },
  { id: "life", label: "生活" },
  { id: "funny", label: "搞笑" },
];

function fmtNum(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// 站长视频 - 直接写BV号和标题，不依赖任何API
// 你只需要在B站视频页地址栏复制BV号填这里，以后可以做个后台管理
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

export default function VideosPage() {
  const [cat, setCat] = useState("owner");
  const [playing, setPlaying] = useState<{ bvid: string; title: string } | null>(null);

  const filtered = cat === "owner" ? null
    : cat === "all" ? hotVideos
    : hotVideos.filter(v => v.category === cat);

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold"><i className="fas fa-play-circle mr-2 text-[#3ea6ff]" />视频中心</h1>
          {cat === "owner" && (
            <a href="https://space.bilibili.com/385144618" target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-[#fb7299] text-white text-xs font-semibold hover:bg-[#fc8bab] transition flex items-center gap-1.5">
              <i className="fab fa-bilibili" /> B站关注
            </a>
          )}
        </div>

        <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
          {cats.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} className={clsx(
              "px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition",
              cat === c.id ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold" : "bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white"
            )}>{c.label}</button>
          ))}
        </div>

        {/* 站长视频 - 用B站封面图+自己的UI */}
        {cat === "owner" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {ownerBiliVideos.map((v, i) => (
              <div key={i} onClick={() => setPlaying({ bvid: v.bvid, title: v.title })}
                className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                <div className="relative aspect-video bg-[#1a1a1a] overflow-hidden rounded-xl">
                  {/* B站封面图：通过BV号拼接 */}
                  <img
                    src={`https://api.bilibili.com/x/web-interface/view?bvid=${v.bvid}`}
                    alt={v.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {/* 备用渐变背景 */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] -z-10 flex items-center justify-center">
                    <i className="fas fa-play-circle text-3xl text-white/20" />
                  </div>
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                      <i className="fas fa-play text-white text-lg ml-0.5" />
                    </div>
                  </div>
                  <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">{v.duration}</span>
                  <span className="absolute top-1.5 left-1.5 bg-[#3ea6ff] text-[#0f0f0f] text-[9px] px-1.5 py-0.5 rounded font-bold"><i className="fas fa-star mr-0.5" />站长</span>
                </div>
                <div className="pt-2 pb-1 px-0.5">
                  <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">{v.title}</h3>
                  <p className="text-[12px] text-[#8a8a8a] mt-1">{fmtNum(v.views)} 播放 · {v.duration}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 其他分类 */}
        {filtered && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {filtered.map(v => (
              <div key={v.id} onClick={() => setPlaying({ bvid: v.bvid, title: v.title })}
                className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                <div className="relative aspect-video bg-[#1a1a1a] overflow-hidden rounded-xl">
                  {v.thumb && <img src={v.thumb} alt={v.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                      <i className="fas fa-play text-white text-lg ml-0.5" />
                    </div>
                  </div>
                  <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">{v.duration}</span>
                </div>
                <div className="pt-2 pb-1 px-0.5">
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

      {/* 播放弹窗 - B站官方播放器（这个是允许嵌入的） */}
      {playing && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3 md:p-6" onClick={() => setPlaying(null)}>
          <div className="w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-white font-bold text-base md:text-lg truncate pr-4">{playing.title}</h2>
              <button onClick={() => setPlaying(null)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition shrink-0">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              <iframe
                src={`//player.bilibili.com/player.html?bvid=${playing.bvid}&high_quality=1&danmaku=0&autoplay=1`}
                className="w-full h-full border-0"
                allowFullScreen
                allow="autoplay; fullscreen; picture-in-picture"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-[#8a8a8a]">
              <span>Undefinde_NaN</span>
              <a href="https://space.bilibili.com/385144618" target="_blank" rel="noopener noreferrer"
                className="text-[#fb7299] hover:text-[#fc8bab] text-xs flex items-center gap-1">
                <i className="fab fa-bilibili" /> B站看更多
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
