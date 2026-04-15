'use client';

import Link from 'next/link';
import { Play, Music, BookOpen, Tv, Gamepad2, Radio } from 'lucide-react';
import { FocusProvider, useFocusable } from './FocusNavigation';
import type { ReactNode } from 'react';

// =============================================================================
// TV Layout — large font, large cards, high contrast layout for TV screens
// =============================================================================

// ---------------------------------------------------------------------------
// TV Navigation Item
// ---------------------------------------------------------------------------

interface TVNavItemProps {
  href: string;
  label: string;
  icon: ReactNode;
  row: number;
  col: number;
}

function TVNavItem({ href, label, icon, row, col }: TVNavItemProps) {
  const { ref, focusProps } = useFocusable({
    id: `nav-${row}-${col}`,
    row,
    col,
    onSelect: () => {
      // Navigation handled by Link
    },
  });

  return (
    <Link
      href={href}
      ref={ref as React.Ref<HTMLAnchorElement>}
      {...focusProps}
      className={`
        flex flex-col items-center justify-center gap-4
        w-48 h-48 rounded-2xl
        bg-white/5 hover:bg-white/10
        text-white text-2xl font-bold
        transition-all duration-200
        ${focusProps.className}
      `}
    >
      <span className="text-[#3ea6ff]">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// TV Content Card
// ---------------------------------------------------------------------------

interface TVContentCardProps {
  id: string;
  title: string;
  cover?: string;
  subtitle?: string;
  row: number;
  col: number;
  onSelect?: () => void;
}

export function TVContentCard({
  id,
  title,
  cover,
  subtitle,
  row,
  col,
  onSelect,
}: TVContentCardProps) {
  const { ref, isFocused, focusProps } = useFocusable({
    id,
    row,
    col,
    onSelect,
  });

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      {...focusProps}
      className={`
        flex flex-col rounded-2xl overflow-hidden
        bg-white/5 cursor-pointer
        w-72 transition-all duration-200
        ${isFocused ? 'ring-4 ring-[#3ea6ff] scale-105 bg-white/10' : ''}
      `}
    >
      {/* Cover image */}
      <div className="w-full h-40 bg-white/10 flex items-center justify-center">
        {cover ? (
          <img
            src={cover}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Play size={48} className="text-white/30" />
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-xl font-bold text-white truncate">{title}</h3>
        {subtitle && (
          <p className="text-lg text-gray-400 mt-1 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TV Home Navigation Grid
// ---------------------------------------------------------------------------

const TV_NAV_ITEMS = [
  { href: '/videos', label: '视频', icon: <Play size={48} /> },
  { href: '/music', label: '音乐', icon: <Music size={48} /> },
  { href: '/comics', label: '漫画', icon: <BookOpen size={48} /> },
  { href: '/anime', label: '动漫', icon: <Tv size={48} /> },
  { href: '/games', label: '游戏', icon: <Gamepad2 size={48} /> },
  { href: '/live', label: '直播', icon: <Radio size={48} /> },
];

function TVHomeNav() {
  return (
    <div className="flex flex-wrap justify-center gap-8 p-12">
      {TV_NAV_ITEMS.map((item, idx) => (
        <TVNavItem
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          row={0}
          col={idx}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TV Layout Shell
// ---------------------------------------------------------------------------

interface TVLayoutProps {
  children: ReactNode;
  /** Show the TV home navigation grid */
  showNav?: boolean;
  /** Title displayed in the top bar */
  title?: string;
}

export default function TVLayout({
  children,
  showNav = true,
  title = '星聚',
}: TVLayoutProps) {
  return (
    <FocusProvider onBack={() => window.history.back()}>
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        {/* Top bar */}
        <header className="flex items-center justify-between px-12 py-6 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#3ea6ff] flex items-center justify-center">
              <Play size={24} className="text-white fill-white" />
            </div>
            <h1 className="text-3xl font-bold">{title}</h1>
          </div>
          <div className="text-xl text-gray-400">
            {new Date().toLocaleDateString('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </div>
        </header>

        {/* Navigation grid */}
        {showNav && <TVHomeNav />}

        {/* Content area */}
        <main className="px-12 pb-12">{children}</main>
      </div>
    </FocusProvider>
  );
}
