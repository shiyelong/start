'use client';

import Link from 'next/link';
import { Play, Settings, Info, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#0a0a0a] mt-12">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo + copyright */}
          <div className="flex items-center gap-2 text-sm text-[#666]">
            <div className="w-6 h-6 rounded-md bg-[#3ea6ff] flex items-center justify-center">
              <Play size={12} className="text-white fill-white" />
            </div>
            <span className="text-[#888]">星聚</span>
            <span className="text-[#444]">|</span>
            <span>&copy; {new Date().getFullYear()} StarHub. All rights reserved.</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-4 text-xs text-[#666]">
            <Link href="/settings" className="flex items-center gap-1 hover:text-[#3ea6ff] transition">
              <Settings size={12} />
              设置
            </Link>
            <Link href="/about" className="flex items-center gap-1 hover:text-[#3ea6ff] transition">
              <Info size={12} />
              关于
            </Link>
            <Link href="/contact" className="flex items-center gap-1 hover:text-[#3ea6ff] transition">
              <Mail size={12} />
              联系我们
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
