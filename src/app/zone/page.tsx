'use client';

import Link from 'next/link';
import Header from '@/components/layout/Header';
import { ageGate } from '@/lib/age-gate';
import {
  Video, Tv, BookOpen, FileText, Radio, Music, Podcast, Gamepad2,
  ShieldAlert, Gift, Briefcase, Shield, MessagesSquare, MessageSquare,
  Heart, ShieldOff,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Zone section data                                                  */
/* ------------------------------------------------------------------ */

interface ZoneSection {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const CONTENT_SECTIONS: ZoneSection[] = [
  {
    href: '/zone/videos',
    title: '成人视频',
    description: '16个聚合源，高清流媒体',
    icon: <Video size={28} />,
    color: '#ef4444',
  },
  {
    href: '/zone/anime',
    title: '成人动漫',
    description: '7个聚合源，日韩精选',
    icon: <Tv size={28} />,
    color: '#f97316',
  },
  {
    href: '/zone/comics',
    title: '成人漫画',
    description: '11个聚合源，全彩连载',
    icon: <BookOpen size={28} />,
    color: '#eab308',
  },
  {
    href: '/zone/novels',
    title: '成人小说',
    description: '7个聚合源，多分类阅读',
    icon: <FileText size={28} />,
    color: '#22c55e',
  },
  {
    href: '/zone/live',
    title: '成人直播',
    description: '7个聚合源，实时互动',
    icon: <Radio size={28} />,
    color: '#ec4899',
  },
  {
    href: '/zone/music',
    title: '成人音乐',
    description: '6个聚合源，ASMR/氛围',
    icon: <Music size={28} />,
    color: '#8b5cf6',
  },
  {
    href: '/zone/podcasts',
    title: '成人播客',
    description: '深夜电台，情感访谈',
    icon: <Podcast size={28} />,
    color: '#06b6d4',
  },
  {
    href: '/zone/games',
    title: '成人游戏',
    description: '10款自研 + 9个聚合源',
    icon: <Gamepad2 size={28} />,
    color: '#3b82f6',
  },
];

const COMMUNITY_SECTIONS: ZoneSection[] = [
  {
    href: '/zone/services',
    title: '服务点评',
    description: '成人服务者验证与匿名点评',
    icon: <ShieldAlert size={28} />,
    color: '#14b8a6',
  },
  {
    href: '/zone/services/free',
    title: '免费交友',
    description: '免费约会信息发布',
    icon: <Gift size={28} />,
    color: '#a3e635',
  },
  {
    href: '/zone/jobs',
    title: '行业招聘',
    description: '成人行业求职招聘',
    icon: <Briefcase size={28} />,
    color: '#f59e0b',
  },
  {
    href: '/zone/safety',
    title: '安全中心',
    description: '防骗 / 黑名单 / 举报',
    icon: <Shield size={28} />,
    color: '#10b981',
  },
  {
    href: '/zone/forum',
    title: '成人论坛',
    description: '6个分区，自由讨论',
    icon: <MessagesSquare size={28} />,
    color: '#6366f1',
  },
  {
    href: '/zone/chat',
    title: '私聊',
    description: '文字 / 视频聊天',
    icon: <MessageSquare size={28} />,
    color: '#d946ef',
  },
  {
    href: '/zone/dating',
    title: '自由约会',
    description: '约会交友，附近的人',
    icon: <Heart size={28} />,
    color: '#f43f5e',
  },
];

/* ------------------------------------------------------------------ */
/*  Section card component                                             */
/* ------------------------------------------------------------------ */

function SectionCard({ section }: { section: ZoneSection }) {
  return (
    <Link
      href={section.href}
      className="group relative flex flex-col gap-3 p-5 rounded-2xl bg-[#1a1a1a] border border-white/5 hover:border-white/15 hover:bg-[#222] transition-all duration-200"
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
        style={{ backgroundColor: `${section.color}20`, color: section.color }}
      >
        {section.icon}
      </div>
      <div>
        <h3 className="text-white font-semibold text-base">{section.title}</h3>
        <p className="text-gray-500 text-sm mt-1 leading-relaxed">{section.description}</p>
      </div>
      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${section.color}08 0%, transparent 70%)`,
        }}
      />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Access denied view                                                 */
/* ------------------------------------------------------------------ */

function AccessDenied() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <ShieldOff size={40} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">访问受限</h1>
          <p className="text-gray-400 mb-6 leading-relaxed">
            成人专区仅限成人模式访问。请在设置中切换到成人模式后再试。
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3ea6ff] text-white font-medium hover:bg-[#3ea6ff]/80 transition-colors"
          >
            前往设置
          </Link>
        </div>
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function ZonePage() {
  const canAccess = ageGate.canAccess('NC-17');

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        {/* Hero */}
        <section className="px-4 pt-8 pb-6 max-w-[1400px] mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Shield size={22} className="text-red-500" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">成人专区</h1>
          </div>
          <p className="text-gray-500 text-sm sm:text-base ml-[52px]">
            NC-17 级内容，仅限成人模式访问
          </p>
        </section>

        {/* Content sections */}
        <section className="px-4 pb-8 max-w-[1400px] mx-auto">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">内容频道</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {CONTENT_SECTIONS.map((section) => (
              <SectionCard key={section.href} section={section} />
            ))}
          </div>
        </section>

        {/* Community sections */}
        <section className="px-4 pb-12 max-w-[1400px] mx-auto">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">社区服务</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {COMMUNITY_SECTIONS.map((section) => (
              <SectionCard key={section.href} section={section} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
