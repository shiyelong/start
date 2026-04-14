'use client';

import { useState, useMemo, useCallback } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import { ageGate } from '@/lib/age-gate';
import {
  Search,
  X,
  ShieldAlert,
  Lock,
  Heart,
  ThumbsDown,
  MapPin,
  Globe,
  Eye,
  Filter,
  Star,
  Calendar,
  Clock,
  Users,
  ArrowUpDown,
  Flame,
  CalendarDays,
  Shuffle,
  SlidersHorizontal,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  UserCircle,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
  Info,
} from 'lucide-react';

function useAdultAccess(): boolean {
  return ageGate.canAccess('NC-17');
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

interface FilterOption { id: string; label: string; }

const GENDER_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部' },
  { id: 'female', label: '女性' },
  { id: 'male', label: '男性' },
  { id: 'trans', label: '跨性别' },
  { id: 'nonbinary', label: '非二元' },
];

const AGE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部年龄' },
  { id: '18-22', label: '18-22' },
  { id: '23-28', label: '23-28' },
  { id: '29-35', label: '29-35' },
  { id: '36-45', label: '36-45' },
  { id: '46+', label: '46+' },
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

const INTEREST_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部兴趣' },
  { id: 'casual', label: '随缘约会' },
  { id: 'serious', label: '认真交往' },
  { id: 'friends', label: '交友' },
  { id: 'activity', label: '活动伙伴' },
  { id: 'travel', label: '旅行伴侣' },
];

interface DatingProfile {
  id: string;
  name: string;
  avatar: string;
  age: number;
  gender: string;
  region: string;
  interest: string;
  bio: string;
  photos: string[];
  verified: boolean;
  online: boolean;
  distance: string;
}

interface DatingEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  attendees: number;
  maxAttendees: number;
  description: string;
}

function generateMockProfiles(): DatingProfile[] {
  const names = ['小樱', 'Lily', '美月', 'Anna', '小雪', 'Mia', '佳琪', 'Yuki', 'Sofia', '小美', 'Emma', '心怡', 'Luna', 'Coco', '雅婷', 'Bella'];
  const genders = GENDER_OPTIONS.filter(g => g.id !== 'all').map(g => g.id);
  const regions = REGION_OPTIONS.filter(r => r.id !== 'all').map(r => r.id);
  const interests = INTEREST_OPTIONS.filter(i => i.id !== 'all').map(i => i.id);
  const avatars = [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80',
    'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&q=80',
  ];
  const bios = [
    '喜欢旅行和美食，寻找有趣的灵魂', '热爱运动和音乐，希望找到志同道合的人',
    '安静的人，喜欢读书和看电影', '开朗活泼，喜欢交朋友',
    '工作之余喜欢探索新事物', '简单生活，真诚交友',
  ];

  return names.map((name, i) => ({
    id: `dp-${i + 1}`,
    name,
    avatar: avatars[i % avatars.length],
    age: Math.floor(Math.random() * 15) + 20,
    gender: genders[i % genders.length],
    region: regions[i % regions.length],
    interest: interests[i % interests.length],
    bio: bios[i % bios.length],
    photos: [avatars[i % avatars.length], avatars[(i + 1) % avatars.length]],
    verified: i % 3 === 0,
    online: i % 2 === 0,
    distance: `${(i % 10) + 1}km`,
  }));
}

function generateMockEvents(): DatingEvent[] {
  return [
    { id: 'ev-1', title: '周末单身派对', date: '2026-02-15', location: '北京朝阳区', attendees: 18, maxAttendees: 30, description: '轻松愉快的单身交友活动' },
    { id: 'ev-2', title: '户外徒步交友', date: '2026-02-22', location: '上海浦东', attendees: 12, maxAttendees: 20, description: '一起徒步，认识新朋友' },
    { id: 'ev-3', title: '美食品鉴会', date: '2026-03-01', location: '广州天河区', attendees: 8, maxAttendees: 15, description: '品尝美食，结交好友' },
    { id: 'ev-4', title: '电影之夜', date: '2026-03-08', location: '深圳南山区', attendees: 22, maxAttendees: 25, description: '一起看电影，分享感受' },
  ];
}

const ALL_PROFILES = generateMockProfiles();
const ALL_EVENTS = generateMockEvents();

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

export default function ZoneDatingPage() {
  const hasAccess = useAdultAccess();
  const [activeTab, setActiveTab] = useState<'discover' | 'events' | 'matches'>('discover');
  const [showFilters, setShowFilters] = useState(false);
  const [activeGender, setActiveGender] = useState('all');
  const [activeAge, setActiveAge] = useState('all');
  const [activeRegion, setActiveRegion] = useState('all');
  const [activeInterest, setActiveInterest] = useState('all');
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!hasAccess) return <AccessDenied />;

  const activeFilterCount = [activeGender !== 'all', activeAge !== 'all', activeRegion !== 'all', activeInterest !== 'all'].filter(Boolean).length;

  const filteredProfiles = useMemo(() => {
    let list = [...ALL_PROFILES];
    if (activeGender !== 'all') list = list.filter(p => p.gender === activeGender);
    if (activeRegion !== 'all') list = list.filter(p => p.region === activeRegion);
    if (activeInterest !== 'all') list = list.filter(p => p.interest === activeInterest);
    return list;
  }, [activeGender, activeRegion, activeInterest]);

  const currentProfile = filteredProfiles[currentIndex % filteredProfiles.length];

  const handleLike = useCallback(() => {
    setCurrentIndex(prev => prev + 1);
  }, []);

  const handleDislike = useCallback(() => {
    setCurrentIndex(prev => prev + 1);
  }, []);

  const tabs = [
    { id: 'discover' as const, label: '发现', icon: <Sparkles size={14} /> },
    { id: 'events' as const, label: '活动', icon: <PartyPopper size={14} /> },
    { id: 'matches' as const, label: '匹配', icon: <Heart size={14} /> },
  ];

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Heart size={22} className="text-pink-400" />
            <span>约会交友</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] transition ${showFilters || activeFilterCount > 0 ? 'bg-[#3ea6ff]/20 text-[#3ea6ff]' : 'bg-[#1a1a1a] text-[#aaa] hover:text-white'}`}>
            <Filter size={14} /> 筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>

        {/* Safety tips */}
        <div className="mb-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
            <div className="text-[11px] text-[#8a8a8a]">
              <span className="text-yellow-400 font-medium">安全提示：</span>
              首次见面选择公共场所，告知朋友你的行踪，不要透露过多个人信息。
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] transition ${activeTab === tab.id ? 'bg-[#3ea6ff] text-[#0f0f0f] font-semibold' : 'bg-[#1a1a1a] text-[#aaa] hover:text-white'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
            <FilterRow label="性别" icon={<Users size={11} />} options={GENDER_OPTIONS} value={activeGender} onChange={setActiveGender} />
            <FilterRow label="年龄" icon={<Calendar size={11} />} options={AGE_OPTIONS} value={activeAge} onChange={setActiveAge} />
            <FilterRow label="地区" icon={<MapPin size={11} />} options={REGION_OPTIONS} value={activeRegion} onChange={setActiveRegion} />
            <FilterRow label="目的" icon={<Heart size={11} />} options={INTEREST_OPTIONS} value={activeInterest} onChange={setActiveInterest} />
            {activeFilterCount > 0 && (
              <div className="pt-2 border-t border-[#333]/50">
                <button onClick={() => { setActiveGender('all'); setActiveAge('all'); setActiveRegion('all'); setActiveInterest('all'); }} className="text-[12px] text-[#888] hover:text-[#3ea6ff] transition flex items-center gap-1"><X size={11} /> 清除筛选</button>
              </div>
            )}
          </div>
        )}

        {/* Discover tab - Swipe cards */}
        {activeTab === 'discover' && currentProfile && (
          <div className="max-w-md mx-auto">
            <div className="relative rounded-2xl overflow-hidden bg-[#1a1a1a] border border-[#333]/50">
              <div className="aspect-[3/4] relative">
                <img src={currentProfile.avatar} alt={currentProfile.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                {currentProfile.online && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-full border border-green-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> 在线
                  </span>
                )}
                {currentProfile.verified && (
                  <span className="absolute top-3 left-3 flex items-center gap-1 bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30">
                    <ShieldCheck size={10} /> 已验证
                  </span>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-white">{currentProfile.name}</h3>
                    <span className="text-white/80 text-lg">{currentProfile.age}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-white/70 mb-2">
                    <span className="flex items-center gap-0.5"><MapPin size={10} /> {REGION_OPTIONS.find(r => r.id === currentProfile.region)?.label}</span>
                    <span className="flex items-center gap-0.5"><Sparkles size={10} /> {currentProfile.distance}</span>
                  </div>
                  <p className="text-[13px] text-white/80">{currentProfile.bio}</p>
                  <span className="inline-block mt-2 text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
                    {INTEREST_OPTIONS.find(i => i.id === currentProfile.interest)?.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <button onClick={handleDislike} className="w-14 h-14 rounded-full bg-[#1a1a1a] border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/10 transition">
                <ThumbsDown size={24} />
              </button>
              <button onClick={handleLike} className="w-16 h-16 rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 hover:bg-pink-500/30 transition">
                <Heart size={28} />
              </button>
              <button className="w-14 h-14 rounded-full bg-[#1a1a1a] border border-[#3ea6ff]/30 flex items-center justify-center text-[#3ea6ff] hover:bg-[#3ea6ff]/10 transition">
                <MessageCircle size={24} />
              </button>
            </div>
          </div>
        )}

        {/* Events tab */}
        {activeTab === 'events' && (
          <div className="space-y-3">
            {ALL_EVENTS.map(ev => (
              <div key={ev.id} className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 hover:border-[#3ea6ff]/30 transition">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-white mb-1 flex items-center gap-2">
                      <PartyPopper size={14} className="text-pink-400" /> {ev.title}
                    </h3>
                    <p className="text-[12px] text-[#8a8a8a] mb-2">{ev.description}</p>
                    <div className="flex flex-wrap gap-2 text-[11px] text-[#666]">
                      <span className="flex items-center gap-0.5"><Calendar size={9} /> {ev.date}</span>
                      <span className="flex items-center gap-0.5"><MapPin size={9} /> {ev.location}</span>
                      <span className="flex items-center gap-0.5"><Users size={9} /> {ev.attendees}/{ev.maxAttendees}</span>
                    </div>
                  </div>
                  <button className="px-3 py-1.5 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg text-[12px] font-medium hover:bg-[#3ea6ff]/80 transition shrink-0">
                    报名
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Matches tab */}
        {activeTab === 'matches' && (
          <div className="text-center py-16">
            <Heart size={48} className="mx-auto mb-4 text-pink-400/30" />
            <p className="text-sm text-[#8a8a8a]">暂无匹配</p>
            <p className="text-[12px] text-[#555] mt-1">继续浏览，找到心仪的人</p>
          </div>
        )}
      </main>
    </>
  );
}
