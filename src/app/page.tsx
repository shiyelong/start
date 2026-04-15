"use client";
import { useState, useEffect, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/layout/Footer";
import { ownerVideos, hotVideos, posts, games } from "@/lib/mock-data";
import Link from "next/link";

const catNames: Record<string,string> = { discuss:"讨论", share:"分享", question:"提问", announce:"公告" };
const catColors: Record<string,string> = { discuss:"bg-blue-500/15 text-blue-400", share:"bg-emerald-500/15 text-emerald-400", question:"bg-yellow-500/15 text-yellow-400", announce:"bg-red-500/15 text-red-400" };

function fmtNum(n: number) { if (n >= 10000) return (n/10000).toFixed(1)+"万"; return String(n); }

// 数字滚动动画
function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0;
        const step = Math.max(1, Math.floor(target / 40));
        const timer = setInterval(() => {
          start += step;
          if (start >= target) { setVal(target); clearInterval(timer); }
          else setVal(start);
        }, 30);
        observer.disconnect();
      }
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);
  return <div ref={ref} className="text-3xl md:text-4xl font-black text-[#3ea6ff]">{val.toLocaleString()}{suffix}</div>;
}

// 轮播横幅
const banners = [
  { title: "星聚 — 你的一站式内容平台", sub: "视频 / 游戏 / 漫画 / 社区 / AI", bg: "from-[#0a0a2e] via-[#1a0a3e] to-[#0a1a3e]", cta: "/videos", ctaText: "开始探索" },
  { title: "11款小游戏等你来战", sub: "2048 / 贪吃蛇 / 抓宠物 / 性格测试...", bg: "from-[#1a0a0a] via-[#2a0a1a] to-[#1a0a2a]", cta: "/games", ctaText: "立即开玩" },
  { title: "漫画中心全新上线", sub: "热血 / 恋爱 / 奇幻 / 悬疑 — 海量漫画", bg: "from-[#0a1a0a] via-[#0a2a1a] to-[#0a1a2a]", cta: "/comics", ctaText: "去看漫画" },
];

export default function HomePage() {
  const [bannerIdx, setBannerIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setBannerIdx(i => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">

        {/* ===== Hero 轮播 ===== */}
        <section className="relative overflow-hidden">
          {/* 动态光效 */}
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#3ea6ff]/[0.04] rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-500/[0.03] rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "2s" }} />

          <div className={`relative bg-gradient-to-br ${banners[bannerIdx].bg} transition-all duration-1000`}>
            <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-20 md:py-28 text-center">
              <div className="inline-block px-4 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-[#aaa] mb-6">
                 全新体验 · 持续更新中
              </div>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-black mb-4 leading-tight transition-all duration-500">
                {banners[bannerIdx].title.includes("星聚") ? (
                  <>星<span className="text-[#3ea6ff]">聚</span> — <span className="text-[#aaa] text-2xl md:text-4xl">你的一站式内容平台</span></>
                ) : (
                  <span className="bg-gradient-to-r from-white via-[#3ea6ff] to-purple-400 bg-clip-text text-transparent">{banners[bannerIdx].title}</span>
                )}
              </h1>
              <p className="text-[#8a8a8a] text-base md:text-lg mb-8 max-w-lg mx-auto">{banners[bannerIdx].sub}</p>
              <div className="flex justify-center gap-3 flex-wrap mb-8">
                <Link href={banners[bannerIdx].cta} className="px-8 py-3 rounded-full bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] hover:shadow-[0_0_30px_rgba(62,166,255,0.3)] transition-all">
                  {banners[bannerIdx].ctaText}
                </Link>
                <Link href="/ai" className="px-8 py-3 rounded-full border border-white/10 text-white text-sm hover:bg-white/5 transition">
                   AI 助手
                </Link>
              </div>
              {/* 轮播指示器 */}
              <div className="flex justify-center gap-2">
                {banners.map((_, i) => (
                  <button key={i} onClick={() => setBannerIdx(i)} className={`h-1 rounded-full transition-all duration-300 ${i === bannerIdx ? "w-8 bg-[#3ea6ff]" : "w-2 bg-white/20"}`} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">

          {/* ===== 数据统计 ===== */}
          <section className="py-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { target: 453, suffix: "+", label: "站长视频", icon: "fa-video" },
                { target: 11, suffix: "", label: "小游戏", icon: "fa-gamepad" },
                { target: 12, suffix: "+", label: "热门漫画", icon: "fa-book-open" },
                { target: 8600, suffix: "+", label: "活跃用户", icon: "fa-users" },
              ].map(s => (
                <div key={s.label} className="relative group p-5 rounded-2xl bg-[#1a1a1a]/50 border border-[#333]/50 text-center overflow-hidden hover:border-[#3ea6ff]/20 transition">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#3ea6ff]/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition" />
                  <i className={`fas ${s.icon} text-[#3ea6ff]/30 text-lg mb-2`} />
                  <AnimatedNumber target={s.target} suffix={s.suffix} />
                  <div className="text-xs text-[#8a8a8a] mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ===== 快捷入口 ===== */}
          <section className="pb-8">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {[
                { href: "/videos", icon: "fa-play-circle", label: "视频", color: "from-blue-500 to-cyan-500" },
                { href: "/games", icon: "fa-gamepad", label: "游戏", color: "from-pink-500 to-orange-500" },
                { href: "/comics", icon: "fa-book-open", label: "漫画", color: "from-purple-500 to-violet-500" },
                { href: "/community", icon: "fa-fire", label: "社区", color: "from-orange-500 to-red-500" },
                { href: "/chat", icon: "fa-comments", label: "聊天", color: "from-green-500 to-emerald-500" },
                { href: "/ai", icon: "fa-robot", label: "AI", color: "from-indigo-500 to-blue-500" },
              ].map(item => (
                <Link key={item.href} href={item.href} className="group flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#1a1a1a]/30 border border-[#333]/30 hover:border-[#3ea6ff]/30 hover:-translate-y-1 transition-all">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all`}>
                    <i className={`fas ${item.icon} text-white text-lg`} />
                  </div>
                  <span className="text-xs text-[#aaa] group-hover:text-white transition">{item.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* ===== 热门游戏 ===== */}
          <section className="pb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">热门游戏</h2>
              <Link href="/games" className="text-sm text-[#3ea6ff] hover:text-[#65b8ff]">全部 </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {games.filter(g => g.hot).slice(0, 5).map(g => (
                <Link key={g.id} href={`/games/${g.id}`} className="group relative p-5 rounded-2xl bg-[#1a1a1a]/50 border border-[#333]/50 hover:border-[#3ea6ff]/30 transition-all text-center overflow-hidden hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#3ea6ff]/[0.02] to-purple-500/[0.02] opacity-0 group-hover:opacity-100 transition" />
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${g.color} flex items-center justify-center text-xl mx-auto mb-3 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg`}>
                    <i className={`fas ${g.icon} text-white`} />
                  </div>
                  <h3 className="font-semibold text-sm">{g.name}</h3>
                  <p className="text-[10px] text-[#8a8a8a] mt-1">{g.desc}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* ===== 站长视频 ===== */}
          <section className="pb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">站长视频</h2>
              <div className="flex items-center gap-3">
                <Link href="/videos" className="text-sm text-[#3ea6ff] hover:text-[#65b8ff]">全部 </Link>
                <a href="https://space.bilibili.com/385144618" target="_blank" rel="noopener noreferrer" className="text-sm text-[#fb7299] hover:text-[#fc8bab]"><i className="fab fa-bilibili" /></a>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {ownerVideos.slice(0, 5).map(v => (
                <Link key={v.id} href="/videos" className="group block rounded-2xl overflow-hidden transition hover:-translate-y-1">
                  <div className="relative aspect-video bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 group-hover:scale-110 transition-all">
                        
                      </div>
                    </div>
                    <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded">{v.duration}</span>
                    <span className="absolute top-1.5 left-1.5 bg-[#3ea6ff] text-[#0f0f0f] text-[8px] px-1.5 py-0.5 rounded font-bold">站长</span>
                  </div>
                  <div className="pt-2 pb-1">
                    <h3 className="text-xs font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition">{v.title}</h3>
                    <p className="text-[10px] text-[#8a8a8a] mt-0.5">{fmtNum(v.views)} 播放</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* ===== 热门推荐 ===== */}
          <section className="pb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">热门推荐</h2>
              <Link href="/videos" className="text-sm text-[#3ea6ff] hover:text-[#65b8ff]">全部 </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {hotVideos.slice(0, 4).map(v => (
                <Link key={v.id} href="/videos" className="group block rounded-2xl overflow-hidden transition hover:-translate-y-1">
                  <div className="relative aspect-video bg-[#1a1a1a] rounded-2xl overflow-hidden">
                    <img src={v.thumb} alt={v.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition" />
                    <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded">{v.duration}</span>
                  </div>
                  <div className="pt-2 pb-1">
                    <h3 className="text-xs font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition">{v.title}</h3>
                    <p className="text-[10px] text-[#8a8a8a] mt-0.5">{v.author} · {fmtNum(v.views)} 播放</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <div className="h-px bg-gradient-to-r from-transparent via-[#333] to-transparent my-4" />

          {/* ===== 社区动态 ===== */}
          <section className="py-8">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">社区动态</h2>
              <Link href="/community" className="text-sm text-[#3ea6ff] hover:text-[#65b8ff]">全部 </Link>
            </div>
            <div className="space-y-3">
              {posts.slice(0, 3).map(p => (
                <Link key={p.id} href="/community" className="block p-4 rounded-2xl bg-[#1a1a1a]/30 border border-[#333]/30 hover:border-[#3ea6ff]/20 transition group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${catColors[p.category] || "bg-gray-500/15 text-gray-400"}`}>{catNames[p.category] || p.category}</span>
                    <h3 className="font-medium text-sm group-hover:text-[#3ea6ff] transition">{p.title}</h3>
                  </div>
                  <p className="text-xs text-[#8a8a8a] line-clamp-1 mb-2">{p.content}</p>
                  <div className="flex items-center justify-between text-[11px] text-[#666]">
                    <span>{p.author} · {p.date}</span>
                    <span>{p.likes} · {p.comments.length}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
