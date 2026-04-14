'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Play, Music, BookOpen, FileText, Tv, Gamepad2, Radio, Podcast,
  Search, User, Menu, X, Shield
} from 'lucide-react';
import { getMode } from '@/lib/age-gate';
import type { UserMode } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  modes: UserMode[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/videos', label: '视频', icon: <Play size={18} />, modes: ['child', 'teen', 'mature', 'adult'] },
  { href: '/music', label: '音乐', icon: <Music size={18} />, modes: ['child', 'teen', 'mature', 'adult', 'elder'] },
  { href: '/comics', label: '漫画', icon: <BookOpen size={18} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/novels', label: '小说', icon: <FileText size={18} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/anime', label: '动漫', icon: <Tv size={18} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/games', label: '游戏', icon: <Gamepad2 size={18} />, modes: ['child', 'teen', 'mature', 'adult'] },
  { href: '/live', label: '直播', icon: <Radio size={18} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/podcasts', label: '播客', icon: <Podcast size={18} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/zone', label: '专区', icon: <Shield size={18} />, modes: ['adult'] },
];

const ELDER_NAV: NavItem[] = [
  { href: '/videos', label: '看电视', icon: <Tv size={18} />, modes: ['elder'] },
  { href: '/music', label: '听音乐', icon: <Music size={18} />, modes: ['elder'] },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mode = getMode();
  const navItems = mode === 'elder' ? ELDER_NAV : NAV_ITEMS.filter(item => item.modes.includes(mode));

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
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Link href="/search" className="p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors">
            <Search size={20} />
          </Link>
          <Link href="/profile" className="p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors">
            <User size={20} />
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-white/5 bg-[#0f0f0f] px-4 py-2">
          {navItems.map(item => (
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
        </nav>
      )}
    </header>
  );
}
