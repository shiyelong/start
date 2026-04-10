"use client";
import { useState, useEffect } from "react";
import Header from "@/components/Header";

type Platform = "ios" | "android" | "harmonyos" | "windows" | "macos" | "linux";

const platforms: { id: Platform; label: string; icon: string; desc: string; version: string; date: string; size: string }[] = [
  { id: "ios", label: "iOS", icon: "fa-apple", desc: "iPhone / iPad", version: "v1.0.0", date: "2026-04-10", size: "45MB" },
  { id: "android", label: "Android", icon: "fa-android", desc: "Android 8.0+", version: "v1.0.0", date: "2026-04-10", size: "38MB" },
  { id: "harmonyos", label: "HarmonyOS", icon: "fa-mobile-screen", desc: "HarmonyOS NEXT", version: "v1.0.0", date: "2026-04-10", size: "42MB" },
  { id: "windows", label: "Windows", icon: "fa-windows", desc: "Windows 10+", version: "v1.0.0", date: "2026-04-10", size: "68MB" },
  { id: "macos", label: "macOS", icon: "fa-apple", desc: "Intel + Apple Silicon", version: "v1.0.0", date: "2026-04-10", size: "72MB" },
  { id: "linux", label: "Linux", icon: "fa-linux", desc: "Ubuntu / Debian / Fedora", version: "v1.0.0", date: "2026-04-10", size: "65MB" },
];

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (/harmonyos/i.test(ua)) return "harmonyos";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/macintosh|mac os/.test(ua)) return "macos";
  if (/linux/.test(ua)) return "linux";
  return "windows";
}

export default function DownloadPage() {
  const [current, setCurrent] = useState<Platform>("windows");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setCurrent(detectPlatform());
    setIsMobile(window.innerWidth < 768);
  }, []);

  const p = platforms.find(x => x.id === current)!;

  const handleDownload = () => {
    // PWA: 手机端提示添加到主屏幕
    if (isMobile) {
      alert("手机用户请使用浏览器的「添加到主屏幕」功能安装APP\n\niOS: Safari 分享按钮 → 添加到主屏幕\nAndroid: 菜单 → 添加到主屏幕\n鸿蒙: 菜单 → 添加到桌面");
    } else {
      alert("桌面版即将推出，敬请期待！\n\n目前可通过浏览器直接访问使用全部功能。");
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-screen relative overflow-hidden">
        {/* 背景 */}
        <div className="absolute inset-0">
          {/* 动态渐变条纹背景 - 类似QQ */}
          <div className="absolute inset-0 bg-[#0a0a0a]" />
          <div className="absolute inset-0 opacity-40" style={{
            background: `
              linear-gradient(180deg, 
                rgba(62,166,255,0.15) 0%, 
                rgba(139,92,246,0.1) 30%, 
                rgba(236,72,153,0.08) 50%, 
                rgba(62,166,255,0.12) 70%, 
                rgba(16,185,129,0.08) 100%
              )
            `
          }} />
          {/* 竖条纹光效 */}
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="absolute top-0 bottom-0 opacity-[0.03]" style={{
              left: `${i * 5 + Math.random() * 2}%`,
              width: `${2 + Math.random() * 3}%`,
              background: `linear-gradient(180deg, 
                ${["#3ea6ff", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"][i % 5]} 0%, 
                transparent 40%, 
                ${["#8b5cf6", "#ec4899", "#3ea6ff", "#f59e0b", "#10b981"][i % 5]} 60%, 
                transparent 100%
              )`,
              animationDelay: `${i * 0.2}s`,
            }} />
          ))}
          {/* 光晕 */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#3ea6ff]/[0.04] rounded-full blur-[150px]" />
          <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-purple-500/[0.03] rounded-full blur-[120px]" />
        </div>

        {/* 内容 */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-16 md:py-20">
          {/* Logo + 标语 */}
          <div className="text-center mb-10 md:mb-14">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl overflow-hidden mx-auto mb-6 shadow-2xl shadow-[#3ea6ff]/20">
              <img src="/logo.svg" alt="星聚" className="w-full h-full" />
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-4 tracking-tight">
              星<span className="text-[#3ea6ff]">聚</span>
            </h1>
            <p className="text-[#8a8a8a] text-lg md:text-xl">你的一站式内容平台</p>
          </div>

          {/* 主下载按钮 */}
          <button onClick={handleDownload} className="group flex items-center gap-3 px-10 py-4 md:px-14 md:py-5 rounded-full bg-white text-[#0f0f0f] font-bold text-base md:text-lg hover:shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-all active:scale-95 mb-4">
            <i className={`fab ${p.icon} text-xl md:text-2xl`} />
            <span>{p.label} 版下载</span>
            <i className="fas fa-download text-sm opacity-50 group-hover:opacity-100 transition" />
          </button>

          {/* 版本信息 */}
          <p className="text-[#666] text-xs md:text-sm mb-12 md:mb-16">
            {p.version} ({p.desc}) {p.date} · {p.size}
          </p>

          {/* 全平台入口 */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-8">
            {platforms.map(pl => (
              <button key={pl.id} onClick={() => setCurrent(pl.id)} className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-95 ${
                current === pl.id ? "text-white" : "text-[#666] hover:text-[#aaa]"
              }`}>
                <i className={`fab ${pl.icon} text-lg md:text-xl`} />
                <span className="text-xs md:text-sm">{pl.label}</span>
              </button>
            ))}
          </div>

          {/* 手机端额外提示 */}
          <div className="md:hidden mt-10 p-4 rounded-2xl bg-white/5 border border-white/10 max-w-sm w-full">
            <h3 className="font-bold text-sm mb-3 text-center">快速安装到手机</h3>
            <div className="space-y-3 text-xs text-[#aaa]">
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-[#3ea6ff]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[#3ea6ff] text-[10px] font-bold">1</span>
                </div>
                <p>点击浏览器底部的 <i className="fas fa-share-from-square mx-0.5 text-[#3ea6ff]" /> 分享按钮</p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-[#3ea6ff]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[#3ea6ff] text-[10px] font-bold">2</span>
                </div>
                <p>选择「添加到主屏幕」或「安装应用」</p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-[#3ea6ff]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[#3ea6ff] text-[10px] font-bold">3</span>
                </div>
                <p>桌面出现图标，像原生APP一样使用</p>
              </div>
            </div>
          </div>

          {/* 特性亮点 */}
          <div className="hidden md:grid grid-cols-4 gap-6 mt-16 max-w-3xl w-full">
            {[
              { icon: "fa-bolt", label: "极速加载", desc: "PWA技术，秒开体验" },
              { icon: "fa-mobile-screen", label: "全平台", desc: "iOS/安卓/鸿蒙/PC" },
              { icon: "fa-arrows-rotate", label: "热更新", desc: "无需重装自动更新" },
              { icon: "fa-shield-halved", label: "安全可靠", desc: "HTTPS加密传输" },
            ].map(f => (
              <div key={f.label} className="text-center">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-2">
                  <i className={`fas ${f.icon} text-[#3ea6ff]`} />
                </div>
                <h4 className="text-sm font-semibold mb-0.5">{f.label}</h4>
                <p className="text-[11px] text-[#666]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 底部 */}
        <div className="relative z-10 text-center py-6 text-[#666] text-xs border-t border-white/5">
          <p>Copyright 2026 星聚 All Rights Reserved</p>
        </div>
      </main>
    </>
  );
}
