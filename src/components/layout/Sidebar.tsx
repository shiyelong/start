'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Play, Music, BookOpen, FileText, Tv, Gamepad2, Radio, Podcast,
  Shield, Download, Settings
} from 'lucide-react';
import { getMode } from '@/lib/age-gate';
import type { UserMode } from '@/lib/types';

interface SidebarItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  modes: UserMode[];
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { href: '/videos', label: '视频中心', icon: <Play size={20} />, modes: ['child', 'teen', 'mature', 'adult'] },
  { href: '/music', label: '音乐中心', icon: <Music size={20} />, modes: ['child', 'teen', 'mature', 'adult', 'elder'] },
  { href: '/comics', label: '漫画中心', icon: <BookOpen size={20} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/novels', label: '小说中心', icon: <FileText size={20} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/anime', label: '动漫中心', icon: <Tv size={20} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/games', label: '游戏中心', icon: <Gamepad2 size={20} />, modes: ['child', 'teen', 'mature', 'adult'] },
  { href: '/live', label: '直播中心', icon: <Radio size={20} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/podcasts', label: '播客中心', icon: <Podcast size={20} />, modes: ['teen', 'mature', 'adult'] },
  { href: '/zone', label: '成人专区', icon: <Shield size={20} />, modes: ['adult'] },
  { href: '/download', label: '下载管理', icon: <Download size={20} />, modes: ['child', 'teen', 'mature', 'adult', 'elder'] },
  { href: '/settings', label: '设置', icon: <Settings size={20} />, modes: ['child', 'teen', 'mature', 'adult', 'elder'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const mode = getMode();
  const items = SIDEBAR_ITEMS.filter(item => item.modes.includes(mode));

  return (
    <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 bg-[#0f0f0f] border-r border-white/5 h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto">
      <nav className="flex flex-col gap-0.5 p-2">
        {items.map(item => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-[#3ea6ff]/10 text-[#3ea6ff]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
