"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import clsx from "clsx";
import { Home, PlayCircle, Flame, MessageCircle, Bot, Search, Bell, Gamepad2, BookOpen, X, Download, Menu, ShieldCheck, Radio, BookText, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/videos", label: "视频", icon: PlayCircle },
  { href: "/live", label: "直播", icon: Radio },
  { href: "/comics", label: "漫画", icon: BookOpen },
  { href: "/novels", label: "小说", icon: BookText },
  { href: "/games", label: "游戏", icon: Gamepad2 },
  { href: "/verify", label: "验证", icon: ShieldCheck },
  { href: "/community", label: "社区", icon: Flame },
  { href: "/chat", label: "聊天", icon: MessageCircle },
  { href: "/ai", label: "AI", icon: Bot },
];

// 手机底部只显示5个，其余放"更多"
const mobileMain = [
  { href: "/", label: "首页", icon: Home },
  { href: "/videos", label: "视频", icon: PlayCircle },
  { href: "/games", label: "游戏", icon: Gamepad2 },
  { href: "/verify", label: "验证", icon: ShieldCheck },
];
const mobileMore = [
  { href: "/live", label: "直播", icon: Radio },
  { href: "/comics", label: "漫画", icon: BookOpen },
  { href: "/novels", label: "小说", icon: BookText },
  { href: "/community", label: "社区", icon: Flame },
  { href: "/chat", label: "聊天", icon: MessageCircle },
  { href: "/ai", label: "AI", icon: Bot },
  { href: "/download", label: "下载APP", icon: Download },
];

export default function Header() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const { user, isLoggedIn, logout } = useAuth();

  const displayName = user?.nickname || user?.username || "";
  const avatarLetter = displayName.charAt(0).toUpperCase();

  // PWA 安装提示
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    // 如果已经是 standalone 模式就不显示
    if (window.matchMedia("(display-mode: standalone)").matches) setShowInstall(false);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const installApp = async () => {
    if (deferredPrompt && "prompt" in deferredPrompt) {
      (deferredPrompt as { prompt: () => void }).prompt();
    }
    setShowInstall(false);
  };

  return (
    <>
      {/* APP 安装横幅 */}
      {showInstall && (
        <div className="fixed top-0 left-0 right-0 z-[70] bg-gradient-to-r from-[#3ea6ff] to-[#2563eb] px-4 py-2.5 flex items-center justify-between text-[#0f0f0f] text-sm md:hidden animate-slide-down">
          <div className="flex items-center gap-2">
            <Download size={16} />
            <span className="font-semibold">安装星聚APP</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={installApp} className="px-3 py-1 rounded-full bg-white/20 text-xs font-bold hover:bg-white/30 transition">安装</button>
            <button onClick={() => setShowInstall(false)} className="p-1"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* 桌面顶部导航 */}
      <header className={`sticky top-0 z-50 h-14 px-4 lg:px-6 flex items-center justify-between gap-4 bg-[#0f0f0f]/92 backdrop-blur-xl border-b border-[#333]/50 ${showInstall ? "md:top-0 top-10" : ""}`}>
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img src="/logo.svg" alt="星聚" className="w-8 h-8 rounded-lg shadow-lg shadow-[#3ea6ff]/25" />
          <span className="text-lg font-bold hidden sm:block">星<span className="text-[#3ea6ff]">聚</span></span>
        </Link>

        <div className="hidden sm:flex items-center max-w-md flex-1">
          <input type="text" placeholder="搜索..." className="flex-1 h-9 px-4 bg-[#0f0f0f] border border-[#333] rounded-l-lg text-sm text-white placeholder-[#8a8a8a] outline-none focus:border-[#3ea6ff]" />
          <button className="h-9 px-4 bg-[#212121] border border-[#333] border-l-0 rounded-r-lg text-[#aaa] hover:bg-[#2a2a2a] hover:text-white transition"><Search size={14} /></button>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition",
              (pathname === href || (href !== "/" && pathname.startsWith(href))) ? "text-[#3ea6ff] bg-[#3ea6ff]/10" : "text-[#aaa] hover:text-white hover:bg-[#2a2a2a]"
            )}><Icon size={15} /><span>{label}</span></Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {/* 手机搜索按钮 */}
          <button className="sm:hidden w-9 h-9 rounded-full bg-[#212121] flex items-center justify-center text-[#aaa] hover:text-white transition">
            <Search size={15} />
          </button>
          <button className="relative w-9 h-9 rounded-full bg-[#212121] flex items-center justify-center text-[#aaa] hover:text-white transition">
            <Bell size={15} />
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-[#ff4444] text-[10px] font-bold flex items-center justify-center px-1 text-white">3</span>
          </button>
          {isLoggedIn && user ? (
            <div className="hidden sm:flex items-center gap-2">
              {user.avatar ? (
                <img src={user.avatar} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-[#3ea6ff]/40" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#3ea6ff] flex items-center justify-center text-[#0f0f0f] text-sm font-bold">
                  {avatarLetter}
                </div>
              )}
              <span className="text-xs text-[#ccc] max-w-[80px] truncate">{displayName}</span>
              <button
                onClick={logout}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[#aaa] hover:text-white hover:bg-[#2a2a2a] transition"
              >
                <LogOut size={13} />
                <span>退出</span>
              </button>
            </div>
          ) : (
            <Link href="/login" className="px-3 py-1.5 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-xs font-semibold hover:bg-[#65b8ff] transition hidden sm:block">登录</Link>
          )}
        </div>
      </header>

      {/* 手机底部导航 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f]/95 backdrop-blur-xl border-t border-[#333]/50 safe-bottom">
        <div className="flex justify-around py-1 px-1">
          {mobileMain.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={clsx(
              "flex flex-col items-center gap-0.5 py-1.5 min-w-[56px] text-[10px] transition active:scale-95",
              (pathname === href || (href !== "/" && pathname.startsWith(href))) ? "text-[#3ea6ff]" : "text-[#8a8a8a]"
            )}>
              <Icon size={20} strokeWidth={pathname === href ? 2.5 : 1.5} />
              <span>{label}</span>
            </Link>
          ))}
          {/* 更多按钮 */}
          <button onClick={() => setMoreOpen(!moreOpen)} className={clsx(
            "flex flex-col items-center gap-0.5 py-1.5 min-w-[56px] text-[10px] transition active:scale-95",
            moreOpen ? "text-[#3ea6ff]" : "text-[#8a8a8a]"
          )}>
            <Menu size={20} strokeWidth={1.5} />
            <span>更多</span>
          </button>
        </div>
      </nav>

      {/* 更多菜单弹出 */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm" onClick={() => setMoreOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-[#1a1a1a] border-t border-[#333] rounded-t-2xl p-4 animate-slide-up safe-bottom" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-[#333] mx-auto mb-4" />
            <div className="grid grid-cols-4 gap-4">
              {mobileMore.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setMoreOpen(false)} className="flex flex-col items-center gap-2 py-3 rounded-xl hover:bg-[#212121] transition active:scale-95">
                  <div className="w-11 h-11 rounded-2xl bg-[#212121] flex items-center justify-center">
                    <Icon size={20} className="text-[#3ea6ff]" />
                  </div>
                  <span className="text-xs text-[#aaa]">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        .animate-slide-down { animation: slide-down 0.3s ease; }
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
        @supports (padding: max(0px)) {
          .safe-bottom { padding-bottom: max(0px, env(safe-area-inset-bottom)); }
        }
      `}</style>
    </>
  );
}
