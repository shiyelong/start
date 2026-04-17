'use client';

import Link from 'next/link';
import {
  Play, Settings, Info, Mail, Shield, FileText,
  Globe, Gamepad2, Music, BookOpen, Tv, Code2,
} from 'lucide-react';

const CONTENT_LINKS = [
  { href: '/videos', label: '视频', icon: Play },
  { href: '/music', label: '音乐', icon: Music },
  { href: '/comics', label: '漫画', icon: BookOpen },
  { href: '/anime', label: '动漫', icon: Tv },
  { href: '/games', label: '游戏', icon: Gamepad2 },
];

const ABOUT_LINKS = [
  { href: '/settings', label: '设置', icon: Settings },
  { href: '/about', label: '关于', icon: Info },
  { href: '/contact', label: '联系我们', icon: Mail },
  { href: '/privacy', label: '隐私政策', icon: Shield },
  { href: '/terms', label: '使用条款', icon: FileText },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.04] bg-[#0a0a0a] mt-12">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-10">
        {/* Top section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[#3ea6ff] flex items-center justify-center">
                <Play size={14} className="text-white fill-white" />
              </div>
              <span className="text-white font-bold text-lg">星聚</span>
            </div>
            <p className="text-xs text-[#555] leading-relaxed max-w-xs">
              一站式内容平台 — 视频、游戏、漫画、音乐、社区、AI 助手，所有娱乐需求一个平台搞定。
            </p>
          </div>

          {/* Content links */}
          <div>
            <h3 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">内容</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {CONTENT_LINKS.map(link => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-1.5 text-xs text-[#666] hover:text-[#3ea6ff] transition py-1"
                  >
                    <Icon size={12} />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* About links */}
          <div>
            <h3 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">关于</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {ABOUT_LINKS.map(link => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-1.5 text-xs text-[#666] hover:text-[#3ea6ff] transition py-1"
                  >
                    <Icon size={12} />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-6" />

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#444]">
          <span>&copy; {new Date().getFullYear()} StarHub. All rights reserved.</span>
          <div className="flex items-center gap-3">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#3ea6ff] transition">
              <Code2 size={14} />
            </a>
            <a href="https://space.bilibili.com/385144618" target="_blank" rel="noopener noreferrer" className="hover:text-[#fb7299] transition">
              <Tv size={14} />
            </a>
            <a href="#" className="hover:text-[#3ea6ff] transition">
              <Globe size={14} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
