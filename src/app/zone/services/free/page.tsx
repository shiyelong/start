'use client';

import { useState, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import { ageGate } from '@/lib/age-gate';
import {
  Search,
  X,
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
  Eye,
  MessageSquare,
  Gift,
  PlusCircle,
  Clock,
  Heart,
  Tag,
} from 'lucide-react';

function useAdultAccess(): boolean {
  return ageGate.canAccess('NC-17');
}

interface FilterOption { id: string; label: string; }

const CATEGORY_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部分类' },
  { id: 'meetup', label: '约会见面' },
  { id: 'companion', label: '免费陪伴' },
  { id: 'exchange', label: '技能交换' },
  { id: 'activity', label: '活动邀约' },
  { id: 'other', label: '其他' },
];

const REGION_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部地区' },
  { id: 'beijing', label: '北京' },
  { id: 'shanghai', label: '上海' },
  { id: 'guangzhou', label: '广州' },
  { id: 'shenzhen', label: '深圳' },
  { id: 'chengdu', label: '成都' },
  { id: 'other', label: '其他' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'latest', label: '最新' },
  { id: 'hot', label: '热度' },
  { id: 'random', label: '随机' },
];

interface FreeService {
  id: string;
  title: string;
  category: string;
  region: string;
  author: string;
  description: string;
  views: number;
  replies: number;
  date: string;
}

function generateMockFreeServices(): FreeService[] {
  const titles = [
    '周末一起看电影', '免费瑜伽教学', '寻找旅行伙伴', '技能交换：摄影换按摩',
    '周五聚餐AA制', '免费健身指导', '一起学日语', '周末户外徒步',
    '免费化妆教学', '寻找舞伴', '一起打羽毛球', '免费心理咨询',
    '周末烧烤聚会', '免费吉他教学', '寻找读书伙伴', '一起逛展览',
  ];
  const categories = CATEGORY_OPTIONS.filter(c => c.id !== 'all').map(c => c.id);
  const regions = REGION_OPTIONS.filter(r => r.id !== 'all').map(r => r.id);

  return titles.map((title, i) => ({
    id: `fs-${i + 1}`,
    title,
    category: categories[i % categories.length],
    region: regions[i % regions.length],
    author: `匿名用户${i + 1}`,
    description: `${title}，有兴趣的朋友可以联系我。安全第一，公共场所见面。`,
    views: Math.floor(Math.random() * 5000) + 50,
    replies: Math.floor(Math.random() * 50) + 1,
    date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  }));
}

const ALL_FREE_SERVICES = generateMockFreeServices();

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

function FilterRow({ label, icon, options, value, onChange }: { label: string; icon: React.ReactNode; options: FilterOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">{icon} {label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button key={opt.id} onClick={() => onChange(opt.id)} className={`px-3 py-1 rounded-full text-[12px] border transition ${value === opt.id ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium' : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'}`}>{opt.label}</button>
        ))}
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <>
      <Header />
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6"><Lock size={36} className="text-red-400" /></div>
          <h1 className="text-2xl font-bold text-white mb-3">访问受限</h1>
          <p className="text-[#8a8a8a] text-sm leading-relaxed mb-6">此区域包含 NC-17 级内容，仅限成人模式访问。</p>
          <div className="flex items-center justify-center gap-2 text-[#666] text-xs"><ShieldAlert size={14} /><span>需要成人模式权限</span></div>
        </div>
      </main>
    </>
  );
}

export default function ZoneFreeServicesPage() {
  const hasAccess = useAdultAccess();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeRegion, setActiveRegion] = useState('all');
  const [activeSort, setActiveSort] = useState('latest');
  const [showPostForm, setShowPostForm] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');

  if (!hasAccess) return <AccessDenied />;

  const activeFilterCount = [activeCategory !== 'all', activeRegion !== 'all'].filter(Boolean).length;

  const filtered = useMemo(() => {
    let list = [...ALL_FREE_SERVICES];
    if (activeCategory !== 'all') list = list.filter(s => s.category === activeCategory);
    if (activeRegion !== 'all') list = list.filter(s => s.region === activeRegion);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }
    switch (activeSort) {
      case 'hot': list.sort((a, b) => b.views - a.views); break;
      case 'random': list.sort(() => Math.random() - 0.5); break;
      default: list.sort((a, b) => b.date.localeCompare(a.date)); break;
    }
    return list;
  }, [activeCategory, activeRegion, searchQuery, activeSort]);

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gift size={22} className="text-green-400" />
            <span>免费服务板块</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
          <button onClick={() => setShowPostForm(!showPostForm)} className="flex items-center gap-1 px-3 py-1.5 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg text-[13px] font-medium hover:bg-[#3ea6ff]/80 transition">
            <PlusCircle size={14} /> 发布
          </button>
        </div>

        {/* Post form */}
        {showPostForm && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
            <input type="text" value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="标题" className="w-full h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff]" />
            <textarea value={postContent} onChange={e => setPostContent(e.target.value)} placeholder="描述你的免费服务信息..." className="w-full h-24 px-3 py-2 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff] resize-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowPostForm(false)} className="px-3 py-1.5 text-[13px] text-[#888] hover:text-white transition">取消</button>
              <button className="px-4 py-1.5 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg text-[13px] font-medium hover:bg-[#3ea6ff]/80 transition">发布</button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索免费服务..." className="w-full h-9 pl-9 pr-24 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
          <button onClick={() => setShowFilters(!showFilters)} className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition ${showFilters || activeFilterCount > 0 ? 'bg-[#3ea6ff]/20 text-[#3ea6ff]' : 'bg-[#2a2a2a] text-[#aaa] hover:text-white'}`}>
            <Filter size={11} /> 筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <ArrowUpDown size={12} className="text-[#666] shrink-0" />
          {SORT_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => setActiveSort(opt.id)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] whitespace-nowrap border transition shrink-0 ${activeSort === opt.id ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold' : 'bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white'}`}>
              {opt.id === 'latest' && <CalendarDays size={11} />}
              {opt.id === 'hot' && <Flame size={11} />}
              {opt.id === 'random' && <Shuffle size={11} />}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
            <FilterRow label="分类" icon={<Tag size={11} />} options={CATEGORY_OPTIONS} value={activeCategory} onChange={setActiveCategory} />
            <FilterRow label="地区" icon={<MapPin size={11} />} options={REGION_OPTIONS} value={activeRegion} onChange={setActiveRegion} />
            {activeFilterCount > 0 && (
              <div className="pt-2 border-t border-[#333]/50">
                <button onClick={() => { setActiveCategory('all'); setActiveRegion('all'); setSearchQuery(''); }} className="text-[12px] text-[#888] hover:text-[#3ea6ff] transition flex items-center gap-1"><X size={11} /> 清除筛选</button>
              </div>
            )}
          </div>
        )}

        {/* Listings */}
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s.id} className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50 hover:border-[#3ea6ff]/30 transition cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white mb-1">{s.title}</h3>
                  <p className="text-[12px] text-[#8a8a8a] line-clamp-2 mb-2">{s.description}</p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-[#666]">
                    <span className="flex items-center gap-0.5"><MapPin size={9} /> {REGION_OPTIONS.find(r => r.id === s.region)?.label}</span>
                    <span className="flex items-center gap-0.5"><Tag size={9} /> {CATEGORY_OPTIONS.find(c => c.id === s.category)?.label}</span>
                    <span className="flex items-center gap-0.5"><Clock size={9} /> {s.date}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-[11px] text-[#666] shrink-0">
                  <span className="flex items-center gap-0.5"><Eye size={9} /> {fmtNum(s.views)}</span>
                  <span className="flex items-center gap-0.5"><MessageSquare size={9} /> {s.replies}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <Gift size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的免费服务</p>
          </div>
        )}
      </main>
    </>
  );
}
