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
  Briefcase,
  PlusCircle,
  Clock,
  DollarSign,
  Tag,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Users,
  Building,
  GraduationCap,
  Heart,
} from 'lucide-react';

function useAdultAccess(): boolean {
  return ageGate.canAccess('NC-17');
}

interface FilterOption { id: string; label: string; }

const JOB_TYPE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部类型' },
  { id: 'performer', label: '表演者' },
  { id: 'model', label: '模特' },
  { id: 'massage', label: '按摩师' },
  { id: 'companion', label: '陪伴服务' },
  { id: 'dancer', label: '舞者' },
  { id: 'host', label: '主播' },
  { id: 'manager', label: '管理/运营' },
  { id: 'security', label: '安保' },
  { id: 'other', label: '其他' },
];

const REGION_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部地区' },
  { id: 'beijing', label: '北京' },
  { id: 'shanghai', label: '上海' },
  { id: 'guangzhou', label: '广州' },
  { id: 'shenzhen', label: '深圳' },
  { id: 'chengdu', label: '成都' },
  { id: 'overseas', label: '海外' },
  { id: 'other', label: '其他' },
];

const SALARY_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部薪资' },
  { id: 'low', label: '5K以下' },
  { id: 'mid', label: '5K-15K' },
  { id: 'high', label: '15K-30K' },
  { id: 'top', label: '30K以上' },
  { id: 'negotiable', label: '面议' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'latest', label: '最新' },
  { id: 'salary', label: '薪资' },
  { id: 'hot', label: '热度' },
];

interface JobListing {
  id: string;
  title: string;
  company: string;
  jobType: string;
  region: string;
  salary: string;
  salaryCategory: string;
  description: string;
  requirements: string;
  views: number;
  applicants: number;
  verified: boolean;
  date: string;
}

function generateMockJobs(): JobListing[] {
  const titles = [
    '高薪招聘按摩师', '招聘女主播', '模特招募', '舞蹈演员招聘',
    '陪伴服务人员', '会所管理经理', '安保人员', '运营专员',
    '高端SPA技师', '私人教练', '化妆师', '摄影师',
    '前台接待', '客服专员', '市场推广', '活动策划',
  ];
  const companies = ['星辰会所', '月光SPA', '梦幻娱乐', '皇家会所', '天使之翼', '金色年华', '紫罗兰', '蓝色海岸'];
  const jobTypes = JOB_TYPE_OPTIONS.filter(j => j.id !== 'all').map(j => j.id);
  const regions = REGION_OPTIONS.filter(r => r.id !== 'all').map(r => r.id);
  const salaryCategories = SALARY_OPTIONS.filter(s => s.id !== 'all').map(s => s.id);

  return titles.map((title, i) => ({
    id: `job-${i + 1}`,
    title,
    company: companies[i % companies.length],
    jobType: jobTypes[i % jobTypes.length],
    region: regions[i % regions.length],
    salary: salaryCategories[i % salaryCategories.length] === 'negotiable' ? '面议' : `${(i % 5 + 1) * 5}K-${(i % 5 + 2) * 5}K`,
    salaryCategory: salaryCategories[i % salaryCategories.length],
    description: `${title}，待遇优厚，工作环境好。`,
    requirements: '年龄18-35岁，形象气质佳，有相关经验优先。',
    views: Math.floor(Math.random() * 10000) + 100,
    applicants: Math.floor(Math.random() * 50) + 1,
    verified: i % 3 === 0,
    date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  }));
}

const ALL_JOBS = generateMockJobs();

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

export default function ZoneJobsPage() {
  const hasAccess = useAdultAccess();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeJobType, setActiveJobType] = useState('all');
  const [activeRegion, setActiveRegion] = useState('all');
  const [activeSalary, setActiveSalary] = useState('all');
  const [activeSort, setActiveSort] = useState('latest');

  if (!hasAccess) return <AccessDenied />;

  const activeFilterCount = [activeJobType !== 'all', activeRegion !== 'all', activeSalary !== 'all'].filter(Boolean).length;

  const filtered = useMemo(() => {
    let list = [...ALL_JOBS];
    if (activeJobType !== 'all') list = list.filter(j => j.jobType === activeJobType);
    if (activeRegion !== 'all') list = list.filter(j => j.region === activeRegion);
    if (activeSalary !== 'all') list = list.filter(j => j.salaryCategory === activeSalary);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q));
    }
    switch (activeSort) {
      case 'salary': list.sort((a, b) => b.salary.localeCompare(a.salary)); break;
      case 'hot': list.sort((a, b) => b.views - a.views); break;
      default: list.sort((a, b) => b.date.localeCompare(a.date)); break;
    }
    return list;
  }, [activeJobType, activeRegion, activeSalary, searchQuery, activeSort]);

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Briefcase size={22} className="text-purple-400" />
            <span>求职招聘</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
        </div>

        {/* Safety tips */}
        <div className="mb-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] text-yellow-400 font-medium mb-1">安全提示</p>
              <ul className="text-[11px] text-[#8a8a8a] space-y-0.5">
                <li className="flex items-center gap-1"><ShieldCheck size={9} /> 优先选择已验证的招聘方</li>
                <li className="flex items-center gap-1"><ShieldCheck size={9} /> 面试选择公共场所，告知朋友你的行踪</li>
                <li className="flex items-center gap-1"><ShieldCheck size={9} /> 不要提前支付任何费用</li>
                <li className="flex items-center gap-1"><ShieldCheck size={9} /> 遇到可疑情况立即举报</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索职位..." className="w-full h-9 pl-9 pr-24 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
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
              {opt.id === 'salary' && <DollarSign size={11} />}
              {opt.id === 'hot' && <Flame size={11} />}
              {opt.label}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
            <FilterRow label="职位类型" icon={<Briefcase size={11} />} options={JOB_TYPE_OPTIONS} value={activeJobType} onChange={setActiveJobType} />
            <FilterRow label="地区" icon={<MapPin size={11} />} options={REGION_OPTIONS} value={activeRegion} onChange={setActiveRegion} />
            <FilterRow label="薪资" icon={<DollarSign size={11} />} options={SALARY_OPTIONS} value={activeSalary} onChange={setActiveSalary} />
            {activeFilterCount > 0 && (
              <div className="pt-2 border-t border-[#333]/50">
                <button onClick={() => { setActiveJobType('all'); setActiveRegion('all'); setActiveSalary('all'); }} className="text-[12px] text-[#888] hover:text-[#3ea6ff] transition flex items-center gap-1"><X size={11} /> 清除筛选</button>
              </div>
            )}
          </div>
        )}

        {/* Job listings */}
        <div className="space-y-2">
          {filtered.map(j => (
            <div key={j.id} className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 hover:border-[#3ea6ff]/30 transition cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-white">{j.title}</h3>
                    {j.verified && <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5"><ShieldCheck size={8} /> 已验证</span>}
                    <RatingBadge rating="NC-17" />
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[#8a8a8a] mb-2">
                    <span className="flex items-center gap-0.5"><Building size={10} /> {j.company}</span>
                    <span className="flex items-center gap-0.5"><MapPin size={10} /> {REGION_OPTIONS.find(r => r.id === j.region)?.label}</span>
                    <span className="flex items-center gap-0.5"><Tag size={10} /> {JOB_TYPE_OPTIONS.find(t => t.id === j.jobType)?.label}</span>
                  </div>
                  <p className="text-[12px] text-[#666] line-clamp-1">{j.requirements}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[#3ea6ff] font-bold text-sm">{j.salary}</p>
                  <div className="flex items-center gap-2 text-[11px] text-[#666] mt-1">
                    <span className="flex items-center gap-0.5"><Eye size={9} /> {fmtNum(j.views)}</span>
                    <span className="flex items-center gap-0.5"><Users size={9} /> {j.applicants}</span>
                  </div>
                  <p className="text-[10px] text-[#555] mt-1">{j.date}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <Briefcase size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的职位</p>
          </div>
        )}
      </main>
    </>
  );
}
