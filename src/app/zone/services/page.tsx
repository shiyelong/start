'use client';

import { useState, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import { ageGate } from '@/lib/age-gate';
import type { ContentRating } from '@/lib/types';
import {
  Search,
  X,
  Eye,
  Filter,
  ShieldAlert,
  Lock,
  SlidersHorizontal,
  ArrowUpDown,
  Flame,
  CalendarDays,
  Star,
  Shuffle,
  Globe,
  MapPin,
  BadgeCheck,
  ShieldCheck,
  Heart,
  MessageSquare,
  UserCheck,
  Briefcase,
  Sparkles,
  Video,
  Phone,
  Home,
  Users,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Flag,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// AgeGate access check
// ---------------------------------------------------------------------------

function useAdultAccess(): boolean {
  return ageGate.canAccess('NC-17');
}

// ---------------------------------------------------------------------------
// Filter definitions
// ---------------------------------------------------------------------------

interface FilterOption { id: string; label: string; }

const NATIONALITY_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部国籍' },
  { id: 'cn', label: '中国' },
  { id: 'jp', label: '日本' },
  { id: 'kr', label: '韩国' },
  { id: 'sea', label: '东南亚' },
  { id: 'ru', label: '俄罗斯' },
  { id: 'eu', label: '欧洲' },
  { id: 'us', label: '美国' },
  { id: 'latam', label: '拉美' },
  { id: 'af', label: '非洲' },
];

const REGION_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部地区' },
  { id: 'beijing', label: '北京' },
  { id: 'shanghai', label: '上海' },
  { id: 'guangzhou', label: '广州' },
  { id: 'shenzhen', label: '深圳' },
  { id: 'chengdu', label: '成都' },
  { id: 'hangzhou', label: '杭州' },
  { id: 'tokyo', label: '东京' },
  { id: 'bangkok', label: '曼谷' },
  { id: 'other', label: '其他' },
];

const SERVICE_TYPE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部服务' },
  { id: 'spa', label: 'SPA/按摩' },
  { id: 'companion', label: '陪伴服务' },
  { id: 'performance', label: '表演/娱乐' },
  { id: 'health-beauty', label: '健康/美容' },
  { id: 'full-service', label: '全套服务' },
  { id: 'special', label: '特殊服务' },
  { id: 'multi', label: '多人服务' },
  { id: 'long-term', label: '长期关系' },
  { id: 'online', label: '线上服务' },
  { id: 'venue', label: '场所服务' },
];

const VERIFICATION_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部状态' },
  { id: 'full', label: '全验证(钻石)' },
  { id: 'community', label: '社区验证(金色)' },
  { id: 'health', label: '健康验证(绿色)' },
  { id: 'video', label: '视频验证(蓝色)' },
  { id: 'none', label: '未验证(灰色)' },
];

const RATING_FILTER_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部评分' },
  { id: '4.5+', label: '4.5分以上' },
  { id: '4.0+', label: '4.0分以上' },
  { id: '3.5+', label: '3.5分以上' },
  { id: '3.0+', label: '3.0分以上' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'hot', label: '热度' },
  { id: 'latest', label: '最新' },
  { id: 'rating', label: '评分' },
  { id: 'reviews', label: '点评数' },
  { id: 'random', label: '随机' },
];

// ---------------------------------------------------------------------------
// Verification badge component
// ---------------------------------------------------------------------------

function VerificationBadge({ level }: { level: string }) {
  const config: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    full: { color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30', label: '全验证', icon: <Sparkles size={10} /> },
    community: { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', label: '社区验证', icon: <Users size={10} /> },
    health: { color: 'text-green-400 bg-green-400/10 border-green-400/30', label: '健康验证', icon: <ShieldCheck size={10} /> },
    video: { color: 'text-blue-400 bg-blue-400/10 border-blue-400/30', label: '视频验证', icon: <Video size={10} /> },
    none: { color: 'text-gray-500 bg-gray-500/10 border-gray-500/30', label: '未验证', icon: <AlertTriangle size={10} /> },
  };
  const c = config[level] || config.none;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-medium ${c.color}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface ServiceProvider {
  id: string;
  name: string;
  avatar: string;
  nationality: string;
  region: string;
  city: string;
  serviceType: string;
  verificationLevel: string;
  score: number;
  reviewCount: number;
  views: number;
  age: number;
  description: string;
  price: string;
  date: string;
}

function generateMockProviders(): ServiceProvider[] {
  const names = [
    '小樱', '美月', 'Lily', 'Anna', '小雪', 'Mia', '佳琪', 'Yuki',
    'Sofia', '小美', 'Emma', '心怡', 'Natasha', '小凤', 'Luna', 'Coco',
    '雅婷', 'Suki', 'Bella', '小蝶', 'Jade', '梦琪', 'Rose', '小燕',
  ];
  const nationalities = NATIONALITY_OPTIONS.filter(n => n.id !== 'all').map(n => n.id);
  const regions = REGION_OPTIONS.filter(r => r.id !== 'all').map(r => r.id);
  const serviceTypes = SERVICE_TYPE_OPTIONS.filter(s => s.id !== 'all').map(s => s.id);
  const verLevels = ['full', 'community', 'health', 'video', 'none'];
  const avatars = [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&q=80',
    'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200&q=80',
  ];

  return names.map((name, i) => ({
    id: `sp-${i + 1}`,
    name,
    avatar: avatars[i % avatars.length],
    nationality: nationalities[i % nationalities.length],
    region: regions[i % regions.length],
    city: REGION_OPTIONS.find(r => r.id === regions[i % regions.length])?.label || '其他',
    serviceType: serviceTypes[i % serviceTypes.length],
    verificationLevel: verLevels[i % verLevels.length],
    score: Math.round((Math.random() * 2 + 3) * 10) / 10,
    reviewCount: Math.floor(Math.random() * 500) + 5,
    views: Math.floor(Math.random() * 50000) + 100,
    age: Math.floor(Math.random() * 15) + 20,
    description: `提供专业${SERVICE_TYPE_OPTIONS.find(s => s.id === serviceTypes[i % serviceTypes.length])?.label || ''}服务，经验丰富，服务周到。`,
    price: `${Math.floor(Math.random() * 5 + 1) * 100}-${Math.floor(Math.random() * 10 + 5) * 100}`,
    date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  }));
}

const ALL_PROVIDERS = generateMockProviders();

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// ---------------------------------------------------------------------------
// Filter row component
// ---------------------------------------------------------------------------

interface FilterRowProps {
  label: string;
  icon: React.ReactNode;
  options: FilterOption[];
  value: string;
  onChange: (id: string) => void;
}

function FilterRow({ label, icon, options, value, onChange }: FilterRowProps) {
  return (
    <div>
      <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
        {icon} {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1 rounded-full text-[12px] border transition ${
              value === opt.id
                ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium'
                : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access Denied component
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <>
      <Header />
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <Lock size={36} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">访问受限</h1>
          <p className="text-[#8a8a8a] text-sm leading-relaxed mb-6">
            此区域包含 NC-17 级内容，仅限成人模式访问。请在设置中切换到成人模式后再访问。
          </p>
          <div className="flex items-center justify-center gap-2 text-[#666] text-xs">
            <ShieldAlert size={14} />
            <span>需要成人模式权限</span>
          </div>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Provider Detail Modal
// ---------------------------------------------------------------------------

function ProviderDetail({ provider, onClose }: { provider: ServiceProvider; onClose: () => void }) {
  const [reviewText, setReviewText] = useState('');
  const [reviewScore, setReviewScore] = useState(5);

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-start justify-center overflow-y-auto py-8 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#1a1a1a] rounded-2xl border border-[#333] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h2 className="text-lg font-bold text-white">服务者详情</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition">
            <X size={16} />
          </button>
        </div>

        {/* Profile */}
        <div className="p-4 flex gap-4">
          <img src={provider.avatar} alt={provider.name} className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-white font-bold text-lg">{provider.name}</h3>
              <VerificationBadge level={provider.verificationLevel} />
              <RatingBadge rating="NC-17" />
            </div>
            <div className="flex flex-wrap gap-2 text-[12px] text-[#8a8a8a] mb-2">
              <span className="flex items-center gap-1"><Globe size={10} /> {NATIONALITY_OPTIONS.find(n => n.id === provider.nationality)?.label}</span>
              <span className="flex items-center gap-1"><MapPin size={10} /> {provider.city}</span>
              <span className="flex items-center gap-1"><Clock size={10} /> {provider.age}岁</span>
              <span className="flex items-center gap-1"><DollarSign size={10} /> {provider.price}元</span>
            </div>
            <p className="text-[13px] text-[#aaa]">{provider.description}</p>
            <div className="flex items-center gap-3 mt-2 text-[12px] text-[#8a8a8a]">
              <span className="flex items-center gap-1"><Star size={10} className="text-yellow-400" /> {provider.score}分</span>
              <span className="flex items-center gap-1"><MessageSquare size={10} /> {provider.reviewCount}条点评</span>
              <span className="flex items-center gap-1"><Eye size={10} /> {fmtNum(provider.views)}浏览</span>
            </div>
          </div>
        </div>

        {/* Verification info */}
        <div className="px-4 pb-3">
          <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-1"><BadgeCheck size={14} /> 验证信息</h4>
          <div className="grid grid-cols-2 gap-2">
            {['video', 'health', 'community', 'full'].map(level => (
              <div key={level} className={`p-2 rounded-lg border text-[11px] ${provider.verificationLevel === level || (level === 'video' && ['video','health','community','full'].includes(provider.verificationLevel)) ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-[#333] text-[#555]'}`}>
                <VerificationBadge level={level} />
              </div>
            ))}
          </div>
        </div>

        {/* Review form */}
        <div className="p-4 border-t border-[#333]">
          <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-1"><MessageSquare size={14} /> 匿名点评</h4>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] text-[#888]">评分:</span>
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} onClick={() => setReviewScore(s)} className={`p-1 ${s <= reviewScore ? 'text-yellow-400' : 'text-[#555]'}`}>
                <Star size={16} fill={s <= reviewScore ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="分享你的体验（匿名发布）..."
            className="w-full h-20 bg-[#0f0f0f] border border-[#333] rounded-lg p-2 text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff] resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <button className="flex items-center gap-1 text-[12px] text-red-400 hover:text-red-300 transition">
              <Flag size={12} /> 举报
            </button>
            <button className="px-4 py-1.5 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg text-[13px] font-medium hover:bg-[#3ea6ff]/80 transition">
              提交点评
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function ZoneServicesPage() {
  const hasAccess = useAdultAccess();

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeNationality, setActiveNationality] = useState('all');
  const [activeRegion, setActiveRegion] = useState('all');
  const [activeServiceType, setActiveServiceType] = useState('all');
  const [activeVerification, setActiveVerification] = useState('all');
  const [activeRating, setActiveRating] = useState('all');
  const [activeSort, setActiveSort] = useState('hot');
  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);

  if (!hasAccess) return <AccessDenied />;

  const activeFilterCount = [
    activeNationality !== 'all',
    activeRegion !== 'all',
    activeServiceType !== 'all',
    activeVerification !== 'all',
    activeRating !== 'all',
  ].filter(Boolean).length;

  const filteredProviders = useMemo(() => {
    let list = [...ALL_PROVIDERS];
    if (activeNationality !== 'all') list = list.filter(p => p.nationality === activeNationality);
    if (activeRegion !== 'all') list = list.filter(p => p.region === activeRegion);
    if (activeServiceType !== 'all') list = list.filter(p => p.serviceType === activeServiceType);
    if (activeVerification !== 'all') list = list.filter(p => p.verificationLevel === activeVerification);
    if (activeRating !== 'all') {
      const min = parseFloat(activeRating.replace('+', ''));
      list = list.filter(p => p.score >= min);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    switch (activeSort) {
      case 'latest': list.sort((a, b) => b.date.localeCompare(a.date)); break;
      case 'rating': list.sort((a, b) => b.score - a.score); break;
      case 'reviews': list.sort((a, b) => b.reviewCount - a.reviewCount); break;
      case 'random': list.sort(() => Math.random() - 0.5); break;
      default: list.sort((a, b) => b.views * b.score - a.views * a.score); break;
    }
    return list;
  }, [activeNationality, activeRegion, activeServiceType, activeVerification, activeRating, searchQuery, activeSort]);

  const clearFilters = useCallback(() => {
    setActiveNationality('all');
    setActiveRegion('all');
    setActiveServiceType('all');
    setActiveVerification('all');
    setActiveRating('all');
    setSearchQuery('');
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UserCheck size={22} className="text-red-400" />
            <span>服务点评</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索服务者..." className="w-full h-9 pl-9 pr-24 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
          <button onClick={() => setShowFilters(!showFilters)} className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition ${showFilters || activeFilterCount > 0 ? 'bg-[#3ea6ff]/20 text-[#3ea6ff]' : 'bg-[#2a2a2a] text-[#aaa] hover:text-white'}`}>
            <Filter size={11} /> 筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <ArrowUpDown size={12} className="text-[#666] shrink-0" />
          {SORT_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => setActiveSort(opt.id)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] whitespace-nowrap border transition shrink-0 ${activeSort === opt.id ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold' : 'bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white'}`}>
              {opt.id === 'hot' && <Flame size={11} />}
              {opt.id === 'latest' && <CalendarDays size={11} />}
              {opt.id === 'rating' && <Star size={11} />}
              {opt.id === 'reviews' && <MessageSquare size={11} />}
              {opt.id === 'random' && <Shuffle size={11} />}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
            <FilterRow label="国籍" icon={<Globe size={11} />} options={NATIONALITY_OPTIONS} value={activeNationality} onChange={setActiveNationality} />
            <FilterRow label="地区/城市" icon={<MapPin size={11} />} options={REGION_OPTIONS} value={activeRegion} onChange={setActiveRegion} />
            <FilterRow label="服务类型" icon={<Briefcase size={11} />} options={SERVICE_TYPE_OPTIONS} value={activeServiceType} onChange={setActiveServiceType} />
            <FilterRow label="验证状态" icon={<BadgeCheck size={11} />} options={VERIFICATION_OPTIONS} value={activeVerification} onChange={setActiveVerification} />
            <FilterRow label="评分" icon={<Star size={11} />} options={RATING_FILTER_OPTIONS} value={activeRating} onChange={setActiveRating} />
            {activeFilterCount > 0 && (
              <div className="pt-2 border-t border-[#333]/50">
                <button onClick={clearFilters} className="text-[12px] text-[#888] hover:text-[#3ea6ff] transition flex items-center gap-1"><X size={11} /> 清除所有筛选</button>
              </div>
            )}
          </div>
        )}

        {/* Active filter summary */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
            <SlidersHorizontal size={12} />
            <span>{filteredProviders.length} 个结果</span>
          </div>
        )}

        {/* Provider Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {filteredProviders.map(p => (
            <div key={p.id} onClick={() => setSelectedProvider(p)} className="group cursor-pointer rounded-xl bg-[#1a1a1a] border border-[#333]/50 overflow-hidden hover:border-[#3ea6ff]/30 transition">
              <div className="flex gap-3 p-3">
                <img src={p.avatar} alt={p.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm font-medium text-white truncate group-hover:text-[#3ea6ff] transition">{p.name}</span>
                    <VerificationBadge level={p.verificationLevel} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-[#8a8a8a] mb-1">
                    <span className="flex items-center gap-0.5"><Globe size={9} /> {NATIONALITY_OPTIONS.find(n => n.id === p.nationality)?.label}</span>
                    <span className="flex items-center gap-0.5"><MapPin size={9} /> {p.city}</span>
                  </div>
                  <span className="text-[10px] bg-[#2a2a2a] text-[#aaa] px-1.5 py-0.5 rounded">{SERVICE_TYPE_OPTIONS.find(s => s.id === p.serviceType)?.label}</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-[#333]/30 text-[11px] text-[#8a8a8a]">
                <span className="flex items-center gap-1"><Star size={10} className="text-yellow-400" /> {p.score}</span>
                <span className="flex items-center gap-1"><MessageSquare size={10} /> {p.reviewCount}</span>
                <span className="flex items-center gap-1"><DollarSign size={10} /> {p.price}</span>
                <RatingBadge rating="NC-17" />
              </div>
            </div>
          ))}
        </div>

        {filteredProviders.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <UserCheck size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的服务者</p>
            <p className="text-xs mt-1 text-[#555]">尝试调整筛选条件或搜索关键词</p>
          </div>
        )}
      </main>

      {selectedProvider && <ProviderDetail provider={selectedProvider} onClose={() => setSelectedProvider(null)} />}
    </>
  );
}
