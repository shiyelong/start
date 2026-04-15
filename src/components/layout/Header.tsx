'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Play, Music, BookOpen, FileText, Tv, Gamepad2, Radio, Podcast,
  Search, MessageCircle, Menu, X, Shield, Settings, Download,
  Video, Heart, Briefcase, ShieldAlert, MessagesSquare, MessageSquare,
  Users, ChevronDown, ChevronUp,
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
  { href: '/videos',   label: '视频', icon: <Play size={18} /> },
  { href: '/music',    label: '音乐', icon: <Music size={18} /> },
  { href: '/comics',   label: '漫画', icon: <BookOpen size={18} /> },
  { href: '/novels',   label: '小说', icon: <FileText size={18} /> },
  { href: '/anime',    label: '动漫', icon: <Tv size={18} /> },
  { href: '/games',    label: '游戏', icon: <Gamepad2 size={18} /> },
  { href: '/live',     label: '直播', icon: <Radio size={18} /> },
  { href: '/podcasts', label: '播客', icon: <Podcast size={18} /> },
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

/** Adult zone sub-sections */
const ZONE_SUBNAV: NavItem[] = [
  { href: '/zone/videos',   label: '成人视频', icon: <Video size={18} /> },
  { href: '/zone/anime',    label: '成人动漫', icon: <Tv size={18} /> },
  { href: '/zone/comics',   label: '成人漫画', icon: <BookOpen size={18} /> },
  { href: '/zone/novels',   label: '成人小说', icon: <FileText size={18} /> },
  { href: '/zone/live',     label: '成人直播', icon: <Radio size={18} /> },
  { href: '/zone/music',    label: '成人音乐', icon: <Music size={18} /> },
  { href: '/zone/podcasts', label: '成人播客', icon: <Podcast size={18} /> },
  { href: '/zone/games',    label: '成人游戏', icon: <Gamepad2 size={18} /> },
  { href: '/zone/services', label: '服务验证', icon: <ShieldAlert size={18} /> },
  { href: '/zone/jobs',     label: '求职招聘', icon: <Briefcase size={18} /> },
  { href: '/zone/safety',   label: '安全中心', icon: <Shield size={18} /> },
  { href: '/zone/forum',    label: '论坛',     icon: <MessagesSquare size={18} /> },
  { href: '/zone/chat',     label: '私聊',     icon: <MessageSquare size={18} /> },
  { href: '/zone/dating',   label: '约会交友', icon: <Heart size={18} /> },
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
      // teen, mature, adult all see the full main nav + utilities
      return [...MAIN_NAV, ...UTIL_NAV];
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);

  const mode = ageGate.getMode();
  const navItems = getNavForMode(mode);
  const isAdult = mode === 'adult';

  return (
    <header className="sticky top-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-b border-white/5">
      <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#3ea6ff] flex items-center justify-center">
            <Play size={16} className="text-white fill-white" />
          </div>
          <span className="text-white font-bold text-lg hidden sm:block">星聚</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-0.5 overflow-x-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors whitespace-nowrap"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}

          {/* Adult zone dropdown */}
          {isAdult && (
            <div className="relative">
              <button
                onClick={() => setZoneOpen(!zoneOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-[#ff6b6b] hover:text-[#ff8a8a] hover:bg-white/5 transition-colors whitespace-nowrap"
              >
                <Shield size={18} />
                成人专区
                {zoneOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {zoneOpen && (
                <div className="absolute top-full right-0 mt-1 w-56 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-2 max-h-[70vh] overflow-y-auto z-50">
                  {/* Portal link */}
                  <Link
                    href="/zone"
                    onClick={() => setZoneOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#3ea6ff] hover:bg-white/5 transition-colors font-medium"
                  >
                    <Users size={16} />
                    专区首页
                  </Link>
                  <div className="border-t border-white/5 my-1" />
                  {ZONE_SUBNAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setZoneOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Right side utilities */}
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            className="p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
            title="设置"
          >
            <Settings size={20} />
          </Link>
          <Link
            href="/download"
            className="p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
            title="下载"
          >
            <Download size={20} />
          </Link>

          {/* Mobile hamburger */}
          <button
            onClick={() => { setMobileOpen(!mobileOpen); setZoneOpen(false); }}
            className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
            aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav — scrollable list */}
      {mobileOpen && (
        <nav className="lg:hidden border-t border-white/5 bg-[#0f0f0f] max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-2 space-y-0.5">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}

            {/* Adult zone section in mobile */}
            {isAdult && (
              <>
                <div className="border-t border-white/5 my-2" />
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
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#3ea6ff] hover:bg-white/5 transition-colors text-sm font-medium"
                    >
                      <Users size={16} />
                      专区首页
                    </Link>
                    {ZONE_SUBNAV.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors text-sm"
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Settings & Download in mobile */}
            <div className="border-t border-white/5 my-2" />
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
            >
              <Settings size={18} />
              设置
            </Link>
            <Link
              href="/download"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
            >
              <Download size={18} />
              下载客户端
            </Link>
          </div>
        </nav>
      )}

      {/* Click-away overlay for zone dropdown (desktop) */}
      {zoneOpen && !mobileOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setZoneOpen(false)}
        />
      )}
    </header>
  );
}
