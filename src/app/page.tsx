"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Footer from "@/components/layout/Footer";
import { ownerVideos, hotVideos, posts, games } from "@/lib/mock-data";
import Link from "next/link";
import {
  Play, Gamepad2, BookOpen, Users, MessageCircle, Sparkles,
  TrendingUp, Video, Eye, Heart, ChevronRight, Flame, Star,
  Zap, Crown, ArrowRight,
} from "lucide-react";

const catNames: Record<string, string> = { discuss: "讨论", share: "分享", question: "提问", announce: "公告" };
const catColors: Record<string, string> = { discuss: "bg-blue-500/15 text-blue-400", share: "bg-emerald-500/15 text-emerald-400", question: "bg-yellow-500/15 text-yellow-400", announce: "bg-red-500/15 text-red-400" };

function fmtNum(n: number) { if (n >= 10000) return (n / 10000).toFixed(1) + "万"; return String(n); }

// ---------------------------------------------------------------------------
// Animated counter with intersection observer
// ---------------------------------------------------------------------------
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
  return <div ref={ref} className="text-3xl md:text-5xl font-black bg-gradient-to-r from-[#3ea6ff] to-[#a78bfa] bg-clip-text text-transparent">{val.toLocaleString()}{suffix}</div>;
}

// ---------------------------------------------------------------------------
// Canvas particle background
// ---------------------------------------------------------------------------
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; color: string; }
    const particles: P[] = [];
    const count = Math.min(80, Math.floor(window.innerWidth / 20));
    const colors = ["#3ea6ff", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"];

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        a: Math.random() * 0.5 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(62, 166, 255, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > window.innerWidth) p.vx *= -1;
        if (p.y < 0 || p.y > window.innerHeight) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.a;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
}

// ---------------------------------------------------------------------------
// Glowing orb decoration
// ---------------------------------------------------------------------------
function GlowOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-[#3ea6ff]/[0.06] rounded-full blur-[150px] animate-pulse" />
      <div className="absolute top-1/3 -right-20 w-[500px] h-[500px] bg-purple-500/[0.05] rounded-full blur-[130px] animate-pulse" style={{ animationDelay: "1.5s" }} />
      <div className="absolute -bottom-40 left-1/3 w-[400px] h-[400px] bg-pink-500/[0.04] rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "3s" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero banners
// ---------------------------------------------------------------------------
const banners = [
  { title: "星聚 — 你的一站式内容平台", sub: "视频 / 游戏 / 漫画 / 社区 / AI", gradient: "from-[#0a0a2e] via-[#1a0a3e] to-[#0a1a3e]", cta: "/videos", ctaText: "开始探索", accent: "#3ea6ff" },
  { title: "50+ 款精品游戏等你来战", sub: "RPG / 射击 / 棋牌 / 策略 / 养成 / 解谜", gradient: "from-[#1a0a0a] via-[#2a0a1a] to-[#1a0a2a]", cta: "/games", ctaText: "立即开玩", accent: "#f472b6" },
  { title: "漫画中心全新上线", sub: "热血 / 恋爱 / 奇幻 / 悬疑 — 海量漫画", gradient: "from-[#0a1a0a] via-[#0a2a1a] to-[#0a1a2a]", cta: "/comics", ctaText: "去看漫画", accent: "#34d399" },
  { title: "AI 智能助手", sub: "聊天 / 字幕 / 配音 / 翻译 — 一键搞定", gradient: "from-[#0a0a1a] via-[#1a1a3a] to-[#0a0a2a]", cta: "/ai", ctaText: "体验 AI", accent: "#a78bfa" },
];

// ---------------------------------------------------------------------------
// Quick entry items (SVG icons, no emoji)
// ---------------------------------------------------------------------------
const quickEntries = [
  { href: "/videos", icon: Play, label: "视频", color: "from-blue-500 to-cyan-500", glow: "shadow-blue-500/20" },
  { href: "/games", icon: Gamepad2, label: "游戏", color: "from-pink-500 to-orange-500", glow: "shadow-pink-500/20" },
  { href: "/comics", icon: BookOpen, label: "漫画", color: "from-purple-500 to-violet-500", glow: "shadow-purple-500/20" },
  { href: "/community", icon: Users, label: "社区", color: "from-orange-500 to-red-500", glow: "shadow-orange-500/20" },
  { href: "/chat", icon: MessageCircle, label: "聊天", color: "from-green-500 to-emerald-500", glow: "shadow-green-500/20" },
  { href: "/ai", icon: Sparkles, label: "AI", color: "from-indigo-500 to-blue-500", glow: "shadow-indigo-500/20" },
];

// ---------------------------------------------------------------------------
// Stats data (SVG icons)
// ---------------------------------------------------------------------------
const statsData = [
  { target: 453, suffix: "+", label: "站长视频", icon: Video },
  { target: 50, suffix: "+", label: "精品游戏", icon: Gamepad2 },
  { target: 12, suffix: "+", label: "热门漫画", icon: BookOpen },
  { target: 8600, suffix: "+", label: "活跃用户", icon: Users },
];

// ===========================================================================
// HOME PAGE
// ===========================================================================
export default function HomePage() {
  const [bannerIdx, setBannerIdx] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  // Auto-rotate banners
  useEffect(() => {
    const t = setInterval(() => setBannerIdx(i => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, []);

  // Parallax mouse tracking on hero
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width - 0.5,
      y: (e.clientY - rect.top) / rect.height - 0.5,
    });
  }, []);

  const banner = banners[bannerIdx];

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8 relative">

        {/* ===== Hero Section ===== */}
        <section
          ref={heroRef}
          onMouseMove={handleMouseMove}
          className="relative overflow-hidden"
        >
          <ParticleCanvas />
          <GlowOrbs />

          <div className={`relative bg-gradient-to-br ${banner.gradient} transition-all duration-1000`}>
            {/* Animated grid overlay */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                backgroundSize: "60px 60px",
                transform: `translate(${mousePos.x * 10}px, ${mousePos.y * 10}px)`,
                transition: "transform 0.3s ease-out",
              }}
            />

            <div className="relative max-w-[1400px] mx-auto px-4 lg:px-6 py-24 md:py-36 text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] backdrop-blur-sm text-xs text-[#aaa] mb-8 animate-fade-in">
                <Zap size={12} className="text-[#3ea6ff]" />
                全新体验 · 持续更新中
              </div>

              {/* Title */}
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-6 leading-tight">
                {banner.title.includes("星聚") ? (
                  <>
                    <span className="inline-block animate-float">星</span>
                    <span className="inline-block text-[#3ea6ff] animate-float" style={{ animationDelay: "0.1s" }}>聚</span>
                    <span className="text-[#666] mx-3">—</span>
                    <br className="md:hidden" />
                    <span className="text-[#aaa] text-2xl md:text-4xl lg:text-5xl">你的一站式内容平台</span>
                  </>
                ) : (
                  <span className="bg-gradient-to-r from-white via-[#3ea6ff] to-purple-400 bg-clip-text text-transparent animate-gradient-x bg-[length:200%_auto]">
                    {banner.title}
                  </span>
                )}
              </h1>

              {/* Subtitle */}
              <p className="text-[#8a8a8a] text-base md:text-xl mb-10 max-w-xl mx-auto leading-relaxed">
                {banner.sub}
              </p>

              {/* CTA buttons */}
              <div className="flex justify-center gap-4 flex-wrap mb-10">
                <Link
                  href={banner.cta}
                  className="group relative px-10 py-3.5 rounded-full bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm overflow-hidden transition-all hover:shadow-[0_0_40px_rgba(62,166,255,0.4)]"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {banner.ctaText}
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#3ea6ff] to-[#65b8ff] opacity-0 group-hover:opacity-100 transition" />
                </Link>
                <Link
                  href="/ai"
                  className="px-10 py-3.5 rounded-full border border-white/10 text-white text-sm hover:bg-white/5 hover:border-white/20 transition-all flex items-center gap-2"
                >
                  <Sparkles size={16} className="text-[#a78bfa]" />
                  AI 助手
                </Link>
              </div>

              {/* Banner indicators */}
              <div className="flex justify-center gap-2">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setBannerIdx(i)}
                    className={`h-1.5 rounded-full transition-all duration-500 ${i === bannerIdx ? "w-10 bg-[#3ea6ff]" : "w-3 bg-white/15 hover:bg-white/25"}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0f0f0f] to-transparent" />
        </section>

        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 relative">

          {/* ===== Stats Section ===== */}
          <section className="py-12 -mt-12 relative z-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statsData.map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="group relative p-6 rounded-2xl bg-[#1a1a1a]/60 border border-white/[0.06] backdrop-blur-sm text-center overflow-hidden hover:border-[#3ea6ff]/20 transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#3ea6ff]/[0.04] to-purple-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Icon size={20} className="text-[#3ea6ff]/40 mx-auto mb-3 group-hover:text-[#3ea6ff]/60 transition" />
                    <AnimatedNumber target={s.target} suffix={s.suffix} />
                    <div className="text-xs text-[#8a8a8a] mt-2 tracking-wide">{s.label}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ===== Quick Entry Grid ===== */}
          <section className="pb-10">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {quickEntries.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex flex-col items-center gap-3 p-5 rounded-2xl bg-[#1a1a1a]/30 border border-white/[0.04] hover:border-[#3ea6ff]/20 hover:-translate-y-1.5 transition-all duration-300`}
                  >
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg ${item.glow} group-hover:scale-110 group-hover:shadow-xl transition-all duration-300`}>
                      <Icon size={22} className="text-white" />
                    </div>
                    <span className="text-xs text-[#aaa] group-hover:text-white transition font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ===== Hot Games ===== */}
          <section className="pb-12">
            <SectionHeader title="热门游戏" href="/games" icon={<Flame size={18} className="text-orange-400" />} />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {games.filter(g => g.hot).slice(0, 5).map(g => (
                <Link
                  key={g.id}
                  href={`/games/${g.id}`}
                  className="group relative p-5 rounded-2xl bg-[#1a1a1a]/40 border border-white/[0.04] hover:border-[#3ea6ff]/20 transition-all duration-300 text-center overflow-hidden hover:-translate-y-1.5"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[#3ea6ff]/[0.03] to-purple-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${g.color} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg`}>
                    <Gamepad2 size={24} className="text-white" />
                  </div>
                  <h3 className="font-semibold text-sm">{g.name}</h3>
                  <p className="text-[10px] text-[#666] mt-1 line-clamp-1">{g.desc}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* ===== Owner Videos ===== */}
          <section className="pb-12">
            <SectionHeader
              title="站长视频"
              href="/videos"
              icon={<Crown size={18} className="text-[#3ea6ff]" />}
              extra={
                <a href="https://space.bilibili.com/385144618" target="_blank" rel="noopener noreferrer" className="text-sm text-[#fb7299] hover:text-[#fc8bab] transition flex items-center gap-1">
                  <Video size={14} />
                  B站
                </a>
              }
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {ownerVideos.slice(0, 5).map(v => (
                <Link key={v.id} href="/videos" className="group block rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1.5">
                  <div className="relative aspect-video bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#3ea6ff]/30 group-hover:scale-110 transition-all duration-300 backdrop-blur-sm">
                        <Play size={18} className="text-white ml-0.5" />
                      </div>
                    </div>
                    <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">{v.duration}</span>
                    <span className="absolute top-1.5 left-1.5 bg-[#3ea6ff] text-[#0f0f0f] text-[8px] px-2 py-0.5 rounded-full font-bold">站长</span>
                  </div>
                  <div className="pt-2.5 pb-1">
                    <h3 className="text-xs font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition">{v.title}</h3>
                    <p className="text-[10px] text-[#666] mt-1 flex items-center gap-1">
                      <Eye size={10} />
                      {fmtNum(v.views)} 播放
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* ===== Trending Videos ===== */}
          <section className="pb-12">
            <SectionHeader title="热门推荐" href="/videos" icon={<TrendingUp size={18} className="text-emerald-400" />} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {hotVideos.slice(0, 4).map(v => (
                <Link key={v.id} href="/videos" className="group block rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1.5">
                  <div className="relative aspect-video bg-[#1a1a1a] rounded-2xl overflow-hidden">
                    <img src={v.thumb} alt={v.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-12 h-12 rounded-full bg-[#3ea6ff]/80 flex items-center justify-center backdrop-blur-sm">
                        <Play size={20} className="text-white ml-0.5" />
                      </div>
                    </div>
                    <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">{v.duration}</span>
                  </div>
                  <div className="pt-2.5 pb-1">
                    <h3 className="text-xs font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition">{v.title}</h3>
                    <p className="text-[10px] text-[#666] mt-1 flex items-center gap-2">
                      <span>{v.author}</span>
                      <span className="flex items-center gap-0.5"><Eye size={10} />{fmtNum(v.views)}</span>
                      <span className="flex items-center gap-0.5"><Heart size={10} />{fmtNum(v.likes)}</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <div className="h-px bg-gradient-to-r from-transparent via-[#333]/50 to-transparent my-2" />

          {/* ===== Community Feed ===== */}
          <section className="py-10">
            <SectionHeader title="社区动态" href="/community" icon={<Users size={18} className="text-violet-400" />} />
            <div className="space-y-3">
              {posts.slice(0, 3).map(p => (
                <Link key={p.id} href="/community" className="block p-4 rounded-2xl bg-[#1a1a1a]/30 border border-white/[0.04] hover:border-[#3ea6ff]/15 transition-all duration-300 group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catColors[p.category] || "bg-gray-500/15 text-gray-400"}`}>
                      {catNames[p.category] || p.category}
                    </span>
                    <h3 className="font-medium text-sm group-hover:text-[#3ea6ff] transition">{p.title}</h3>
                  </div>
                  <p className="text-xs text-[#666] line-clamp-1 mb-2">{p.content}</p>
                  <div className="flex items-center justify-between text-[11px] text-[#555]">
                    <span>{p.author} · {p.date}</span>
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-0.5"><Heart size={10} />{p.likes}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle size={10} />{p.comments.length}</span>
                    </span>
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

// ---------------------------------------------------------------------------
// Section header component
// ---------------------------------------------------------------------------
function SectionHeader({ title, href, icon, extra }: { title: string; href: string; icon: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-bold flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="flex items-center gap-3">
        {extra}
        <Link href={href} className="text-sm text-[#3ea6ff] hover:text-[#65b8ff] transition flex items-center gap-1">
          全部 <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
