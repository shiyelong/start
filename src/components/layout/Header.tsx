'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import {
  Play, Music, BookOpen, FileText, Tv, Gamepad2, Radio, Podcast,
  Search, MessageCircle, X, Shield, Settings, Download,
  Video, Heart, Briefcase, ShieldAlert, MessagesSquare, MessageSquare,
  Users, ChevronDown, ChevronUp, User, MoreHorizontal, Gift,
} from 'lucide-react';
import { ageGate } from '@/lib/age-gate';
import type { UserMode } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Navigation data                                                    */
/* ------------------------------------------------------------------ */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

/** Main content sections — visible in teen / mature / adult modes */
const MAIN_NAV: NavItem[] = [
  { href: '/videos',    label: '视频', icon: <Play size={18} /> },
  { href: '/music',     label: '音乐', icon: <Music size={18} /> },
  { href: '/comics',    label: '漫画', icon: <BookOpen size={18} /> },
  { href: '/novels',    label: '小说', icon: <FileText size={18} /> },
  { href: '/anime',     label: '动漫', icon: <Tv size={18} /> },
  { href: '/games',     label: '游戏', icon: <Gamepad2 size={18} /> },
  { href: '/live',      label: '直播', icon: <Radio size={18} /> },
  { href: '/podcasts',  label: '播客', icon: <Podcast size={18} /> },
  { href: '/community', label: '社区', icon: <Users size={18} /> },
];

/** Utility links shown in all non-elder modes */
const UTIL_NAV: NavItem[] = [
  { href: '/search', label: '搜索',   icon: <Search size={18} /> },
  { href: '/ai',     label: 'AI聊天', icon: <MessageCircle size={18} /> },
];

/** Child mode — restricted set */
const CHILD_NAV: NavItem[] = [
  { href: '/videos', label: '视频', icon: <Play size={18} /> },
  { href: '/music',  label: '音乐', icon: <Music size={18} /> },
  { href: '/games',  label: '游戏', icon: <Gamepad2 size={18} /> },
];

/** Elder mode — simplified labels */
const ELDER_NAV: NavItem[] = [
  { href: '/videos', label: '看电视', icon: <Tv size={18} /> },
  { href: '/music',  label: '听音乐', icon: <Music size={18} /> },
];

/** Adult zone — content channels */
const ZONE_CONTENT: NavItem[] = [
  { href: '/zone/videos',   label: '成人视频', icon: <Video size={18} /> },
  { href: '/zone/anime',    label: '成人动漫', icon: <Tv size={18} /> },
  { href: '/zone/comics',   label: '成人漫画', icon: <BookOpen size={18} /> },
  { href: '/zone/novels',   label: '成人小说', icon: <FileText size={18} /> },
  { href: '/zone/live',     label: '成人直播', icon: <Radio size={18} /> },
  { href: '/zone/music',    label: '成人音乐', icon: <Music size={18} /> },
  { href: '/zone/podcasts', label: '成人播客', icon: <Podcast size={18} /> },
  { href: '/zone/games',    label: '成人游戏', icon: <Gamepad2 size={18} /> },
];

/** Adult zone — community services */
const ZONE_COMMUNITY: NavItem[] = [
  { href: '/zone/services',      label: '服务验证', icon: <ShieldAlert size={18} /> },
  { href: '/zone/services/free', label: '免费交友', icon: <Gift size={18} /> },
  { href: '/zone/jobs',          label: '行业招聘', icon: <Briefcase size={18} /> },
  { href: '/zone/safety',        label: '安全中心', icon: <Shield size={18} /> },
  { href: '/zone/forum',         label: '论坛',     icon: <MessagesSquare size={18} /> },
  { href: '/zone/chat',          label: '私聊',     icon: <MessageSquare size={18} /> },
  { href: '/zone/dating',        label: '自由约会', icon: <Heart size={18} /> },
];

/** Mobile bottom tab items (5 most important) */
const MOBILE_TABS: NavItem[] = [
  { href: '/videos', label: '视频', icon: <Play size={20} /> },
  { href: '/music',  label: '音乐', icon: <Music size={20} /> },
  { href: '/games',  label: '游戏', icon: <Gamepad2 size={20} /> },
  { href: '/search', label: '搜索', icon: <Search size={20} /> },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getNavForMode(mode: UserMode): NavItem[] {
  switch (mode) {
    case 'child':
      return CHILD_NAV;
    case 'elder':
      return ELDER_NAV;
    default:
      return [...MAIN_NAV, ...UTIL_NAV];
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Header() {
  const pathname = usePathname();
  const [mobileOverlayOpen, setMobileOverlayOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const mode = ageGate.getMode();
  const navItems = getNavForMode(mode);
  const isAdult = mode === 'adult';

  // Check if a nav item is active
  const isActive = useCallback((href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }, [pathname]);

  // Desktop nav scroll fade indicators
  const updateScrollFades = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    updateScrollFades();
    el.addEventListener('scroll', updateScrollFades, { passive: true });
    const ro = new ResizeObserver(updateScrollFades);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollFades);
      ro.disconnect();
    };
  }, [updateScrollFades]);

  // Keyboard accessibility — Escape closes menus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOverlayOpen(false);
        setZoneOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close mobile overlay on route change
  useEffect(() => {
    setMobileOverlayOpen(false);
    setZoneOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#3ea6ff] flex items-center justify-center">
              <Play size={16} className="text-white fill-white" />
            </div>
            <span className="text-white font-bold text-lg hidden sm:block">星聚</span>
          </Link>

          {/* Desktop Nav — scrollable with gradient fades + adult zone */}
          <div className="hidden lg:flex relative flex-1 min-w-0 mx-4 items-center gap-1">
            {/* Scrollable nav links */}
            <div className="relative flex-1 min-w-0">
              {showLeftFade && (
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0f0f0f] to-transparent z-10 pointer-events-none" />
              )}
              {showRightFade && (
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0f0f0f] to-transparent z-10 pointer-events-none" />
              )}
            <nav
              ref={navScrollRef}
              className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide scroll-smooth"
            >
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all duration-200 ${
                      active
                        ? 'text-[#3ea6ff] bg-[#3ea6ff]/10 font-medium'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                    {active && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#3ea6ff] rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
            </div>

            {/* Adult zone dropdown — OUTSIDE nav to avoid overflow clip */}
            {isAdult && (
              <div className="relative flex-shrink-0 ml-1">
                <button
                  onClick={() => setZoneOpen(!zoneOpen)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    pathname.startsWith('/zone')
                      ? 'text-[#ff6b6b] bg-[#ff6b6b]/10'
                      : 'text-[#ff6b6b] hover:text-[#ff8a8a] hover:bg-white/5'
                  }`}
                >
                  <Shield size={18} />
                  成人专区
                  {zoneOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {zoneOpen && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-2 max-h-[70vh] overflow-y-auto z-[60]">
                    <Link
                      href="/zone"
                      onClick={() => setZoneOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#3ea6ff] hover:bg-white/5 transition-colors font-medium"
                    >
                      <Users size={16} />
                      专区首页
                    </Link>

                    {/* Content channels group */}
                    <div className="border-t border-white/5 my-1" />
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 tracking-wider">内容频道</div>
                    {ZONE_CONTENT.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setZoneOpen(false)}
                        className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                          isActive(item.href)
                            ? 'text-[#3ea6ff] bg-[#3ea6ff]/5'
                            : 'text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}

                    {/* Community services group */}
                    <div className="border-t border-white/5 my-1" />
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 tracking-wider">社区服务</div>
                    {ZONE_COMMUNITY.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setZoneOpen(false)}
                        className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                          isActive(item.href)
                            ? 'text-[#3ea6ff] bg-[#3ea6ff]/5'
                            : 'text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right side utilities */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link
              href="/profile"
              className={`p-2 rounded-lg transition-colors ${
                isActive('/profile')
                  ? 'text-[#3ea6ff] bg-[#3ea6ff]/10'
                  : 'text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5'
              }`}
              title="个人中心"
            >
              <User size={20} />
            </Link>
            <Link
              href="/settings"
              className={`p-2 rounded-lg transition-colors hidden sm:flex ${
                isActive('/settings')
                  ? 'text-[#3ea6ff] bg-[#3ea6ff]/10'
                  : 'text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5'
              }`}
              title="设置"
            >
              <Settings size={20} />
            </Link>
            <Link
              href="/download"
              className={`p-2 rounded-lg transition-colors hidden sm:flex ${
                isActive('/download')
                  ? 'text-[#3ea6ff] bg-[#3ea6ff]/10'
                  : 'text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5'
              }`}
              title="下载"
            >
              <Download size={20} />
            </Link>
          </div>
        </div>
      </header>

      {/* ===== Mobile Bottom Tab Bar ===== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f]/95 backdrop-blur-lg border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-14">
          {MOBILE_TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-200 ${
                  active ? 'text-[#3ea6ff]' : 'text-gray-500 active:text-gray-300'
                }`}
              >
                {active && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-[#3ea6ff]" />
                )}
                <div className={`transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
                  {tab.icon}
                </div>
                <span className={`text-[10px] transition-all ${active ? 'font-semibold' : ''}`}>{tab.label}</span>
              </Link>
            );
          })}
          {/* "更多" button opens full overlay */}
          <button
            onClick={() => setMobileOverlayOpen(true)}
            className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-200 ${
              mobileOverlayOpen ? 'text-[#3ea6ff]' : 'text-gray-500 active:text-gray-300'
            }`}
            aria-label="更多导航"
          >
            {mobileOverlayOpen && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-[#3ea6ff]" />
            )}
            <MoreHorizontal size={20} />
            <span className="text-[10px]">更多</span>
          </button>
        </div>
      </nav>

      {/* ===== Mobile Full-Screen Overlay ===== */}
      {mobileOverlayOpen && (
        <div className="lg:hidden fixed inset-0 z-[55] bg-[#0f0f0f] overflow-y-auto animate-in fade-in duration-200">
          {/* Overlay header */}
          <div className="sticky top-0 bg-[#0f0f0f]/95 backdrop-blur border-b border-white/5 px-4 h-14 flex items-center justify-between">
            <span className="text-white font-bold text-lg">全部导航</span>
            <button
              onClick={() => setMobileOverlayOpen(false)}
              className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition"
              aria-label="关闭导航"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-4 py-4 pb-24 space-y-1">
            {/* All nav items */}
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOverlayOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                    active
                      ? 'text-[#3ea6ff] bg-[#3ea6ff]/10'
                      : 'text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5'
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#3ea6ff]" />}
                </Link>
              );
            })}

            {/* Adult zone section */}
            {isAdult && (
              <>
                <div className="border-t border-white/5 my-3" />
                <button
                  onClick={() => setZoneOpen(!zoneOpen)}
                  className="flex items-center justify-between w-full px-3 py-3 rounded-lg text-[#ff6b6b] hover:bg-white/5 transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <Shield size={18} />
                    成人专区
                  </span>
                  {zoneOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {zoneOpen && (
                  <div className="pl-4 space-y-0.5">
                    <Link
                      href="/zone"
                      onClick={() => setMobileOverlayOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#3ea6ff] hover:bg-white/5 transition-colors text-sm font-medium"
                    >
                      <Users size={16} />
                      专区首页
                    </Link>

                    {/* Content channels group */}
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">内容频道</div>
                    {ZONE_CONTENT.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOverlayOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          isActive(item.href)
                            ? 'text-[#3ea6ff] bg-[#3ea6ff]/5'
                            : 'text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}

                    {/* Community services group */}
                    <div className="border-t border-white/5 my-2" />
                    <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">社区服务</div>
                    {ZONE_COMMUNITY.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOverlayOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          isActive(item.href)
                            ? 'text-[#3ea6ff] bg-[#3ea6ff]/5'
                            : 'text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Utility links */}
            <div className="border-t border-white/5 my-3" />
            <Link
              href="/profile"
              onClick={() => setMobileOverlayOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                isActive('/profile') ? 'text-[#3ea6ff] bg-[#3ea6ff]/10' : 'text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5'
              }`}
            >
              <User size={18} />
              个人中心
            </Link>
            <Link
              href="/settings"
              onClick={() => setMobileOverlayOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                isActive('/settings') ? 'text-[#3ea6ff] bg-[#3ea6ff]/10' : 'text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5'
              }`}
            >
              <Settings size={18} />
              设置
            </Link>
            <Link
              href="/download"
              onClick={() => setMobileOverlayOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors relative overflow-hidden ${
                isActive('/download')
                  ? 'text-[#3ea6ff] bg-[#3ea6ff]/10'
                  : 'text-white bg-gradient-to-r from-[#3ea6ff]/10 to-[#3ea6ff]/5 hover:from-[#3ea6ff]/20 hover:to-[#3ea6ff]/10 border border-[#3ea6ff]/20'
              }`}
            >
              <Download size={18} className="text-[#3ea6ff]" />
              下载客户端
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3ea6ff] text-white">NEW</span>
            </Link>
          </div>
        </div>
      )}

      {/* Click-away overlay for zone dropdown (desktop) */}
      {zoneOpen && !mobileOverlayOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setZoneOpen(false)}
        />
      )}
    </>
  );
}
