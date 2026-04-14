'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import { ageGate } from '@/lib/age-gate';
import {
  Search,
  X,
  ShieldAlert,
  Lock,
  Eye,
  MessageSquare,
  Heart,
  Flag,
  PlusCircle,
  Clock,
  ArrowUpDown,
  Flame,
  CalendarDays,
  Star,
  Users,
  MessageCircle,
  ThumbsUp,
  Send,
  UserCircle,
  Hash,
  Shield,
  Bookmark,
  Share2,
  MoreHorizontal,
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

interface ForumSection { id: string; label: string; icon: React.ReactNode; color: string; }

const SECTIONS: ForumSection[] = [
  { id: 'all', label: '全部', icon: <Hash size={14} />, color: 'text-[#3ea6ff]' },
  { id: 'discuss', label: '交流', icon: <MessageCircle size={14} />, color: 'text-blue-400' },
  { id: 'experience', label: '经验分享', icon: <Star size={14} />, color: 'text-yellow-400' },
  { id: 'resource', label: '资源', icon: <Bookmark size={14} />, color: 'text-green-400' },
  { id: 'dating', label: '约会', icon: <Heart size={14} />, color: 'text-pink-400' },
  { id: 'worker', label: '从业者', icon: <Users size={14} />, color: 'text-purple-400' },
  { id: 'safety', label: '安全提醒', icon: <Shield size={14} />, color: 'text-red-400' },
];

interface ForumPost {
  id: string;
  title: string;
  content: string;
  section: string;
  author: string;
  isAnonymous: boolean;
  likes: number;
  replies: number;
  views: number;
  pinned: boolean;
  date: string;
}

function generateMockPosts(): ForumPost[] {
  const titles = [
    '新人报到，请多关照', '分享一次难忘的体验', '推荐一个靠谱的SPA',
    '周末有人一起吗', '从业三年的一些心得', '注意这个骗子',
    '如何辨别照片真假', '最近有什么好资源', '约会安全指南',
    '新手入门必读', '分享一些防骗技巧', '求推荐靠谱的服务',
    '这个地方大家去过吗', '从业者如何保护自己', '举报一个黑心商家',
    '周末活动召集', '分享我的验证经历', '新开的会所怎么样',
    '安全第一，经验分享', '求助：遇到了问题', '好评推荐', '吐槽帖',
    '新人求指导', '分享一个好去处',
  ];
  const sections = SECTIONS.filter(s => s.id !== 'all').map(s => s.id);

  return titles.map((title, i) => ({
    id: `fp-${i + 1}`,
    title,
    content: `${title}的详细内容...这是一个关于${SECTIONS.find(s => s.id === sections[i % sections.length])?.label}的帖子。`,
    section: sections[i % sections.length],
    author: i % 3 === 0 ? `匿名${Math.floor(Math.random() * 9999)}` : `用户${i + 1}`,
    isAnonymous: i % 3 === 0,
    likes: Math.floor(Math.random() * 500),
    replies: Math.floor(Math.random() * 100),
    views: Math.floor(Math.random() * 10000) + 50,
    pinned: i < 2,
    date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  }));
}

const ALL_POSTS = generateMockPosts();

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export default function ZoneForumPage() {
  const hasAccess = useAdultAccess();
  const [activeSection, setActiveSection] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSort, setActiveSort] = useState('latest');
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newSection, setNewSection] = useState('discuss');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [replyText, setReplyText] = useState('');

  if (!hasAccess) return <AccessDenied />;

  const filtered = useMemo(() => {
    let list = [...ALL_POSTS];
    if (activeSection !== 'all') list = list.filter(p => p.section === activeSection);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q));
    }
    // Pinned first
    const pinned = list.filter(p => p.pinned);
    const unpinned = list.filter(p => !p.pinned);
    switch (activeSort) {
      case 'hot': unpinned.sort((a, b) => b.likes + b.replies * 2 - (a.likes + a.replies * 2)); break;
      case 'replies': unpinned.sort((a, b) => b.replies - a.replies); break;
      default: unpinned.sort((a, b) => b.date.localeCompare(a.date)); break;
    }
    return [...pinned, ...unpinned];
  }, [activeSection, searchQuery, activeSort]);

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare size={22} className="text-blue-400" />
            <span>成人论坛</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
          <button onClick={() => setShowNewPost(!showNewPost)} className="flex items-center gap-1 px-3 py-1.5 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg text-[13px] font-medium hover:bg-[#3ea6ff]/80 transition">
            <PlusCircle size={14} /> 发帖
          </button>
        </div>

        {/* New post form */}
        {showNewPost && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="帖子标题" className="w-full h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff]" />
            <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="帖子内容..." className="w-full h-28 px-3 py-2 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff] resize-none" />
            <div className="flex items-center gap-3">
              <select value={newSection} onChange={e => setNewSection(e.target.value)} className="h-8 px-2 bg-[#0f0f0f] border border-[#333] rounded-lg text-[12px] text-white outline-none">
                {SECTIONS.filter(s => s.id !== 'all').map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-[12px] text-[#888] cursor-pointer">
                <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="rounded" />
                <UserCircle size={12} /> 匿名发帖
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewPost(false)} className="px-3 py-1.5 text-[13px] text-[#888] hover:text-white transition">取消</button>
              <button className="px-4 py-1.5 bg-[#3ea6ff] text-[#0f0f0f] rounded-lg text-[13px] font-medium hover:bg-[#3ea6ff]/80 transition">发布</button>
            </div>
          </div>
        )}

        {/* Sections */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap transition ${activeSection === s.id ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] font-medium' : 'bg-[#1a1a1a] text-[#888] hover:text-white'}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索帖子..." className="w-full h-9 pl-9 pr-4 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
          </div>
          <div className="flex items-center gap-1">
            {[{ id: 'latest', label: '最新', icon: <CalendarDays size={11} /> }, { id: 'hot', label: '热门', icon: <Flame size={11} /> }, { id: 'replies', label: '回复', icon: <MessageCircle size={11} /> }].map(opt => (
              <button key={opt.id} onClick={() => setActiveSort(opt.id)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition ${activeSort === opt.id ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold' : 'bg-transparent text-[#aaa] border-[#333] hover:text-white'}`}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Posts */}
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} onClick={() => setSelectedPost(p)} className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50 hover:border-[#3ea6ff]/30 transition cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {p.pinned && <span className="text-[9px] bg-[#3ea6ff]/10 text-[#3ea6ff] border border-[#3ea6ff]/30 px-1.5 py-0.5 rounded font-medium">置顶</span>}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${SECTIONS.find(s => s.id === p.section)?.color || 'text-[#888]'} bg-white/5 border-white/10`}>
                      {SECTIONS.find(s => s.id === p.section)?.label}
                    </span>
                    <h3 className="text-sm font-medium text-white truncate">{p.title}</h3>
                  </div>
                  <p className="text-[12px] text-[#666] line-clamp-1 mb-1.5">{p.content}</p>
                  <div className="flex items-center gap-3 text-[11px] text-[#666]">
                    <span className="flex items-center gap-0.5">{p.isAnonymous ? <UserCircle size={10} /> : <Users size={10} />} {p.author}</span>
                    <span className="flex items-center gap-0.5"><Clock size={9} /> {p.date}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-[11px] text-[#666] shrink-0">
                  <span className="flex items-center gap-0.5"><ThumbsUp size={9} /> {fmtNum(p.likes)}</span>
                  <span className="flex items-center gap-0.5"><MessageCircle size={9} /> {p.replies}</span>
                  <span className="flex items-center gap-0.5"><Eye size={9} /> {fmtNum(p.views)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无帖子</p>
          </div>
        )}
      </main>

      {/* Post detail modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-start justify-center overflow-y-auto py-8 px-4" onClick={() => setSelectedPost(null)}>
          <div className="w-full max-w-2xl bg-[#1a1a1a] rounded-2xl border border-[#333] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#333]">
              <h2 className="text-lg font-bold text-white truncate">{selectedPost.title}</h2>
              <button onClick={() => setSelectedPost(null)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"><X size={16} /></button>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3 text-[12px] text-[#8a8a8a]">
                <span className="flex items-center gap-1">{selectedPost.isAnonymous ? <UserCircle size={12} /> : <Users size={12} />} {selectedPost.author}</span>
                <span className="text-[#555]">·</span>
                <span>{selectedPost.date}</span>
                <span className="text-[#555]">·</span>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] ${SECTIONS.find(s => s.id === selectedPost.section)?.color} bg-white/5 border-white/10`}>
                  {SECTIONS.find(s => s.id === selectedPost.section)?.label}
                </span>
              </div>
              <p className="text-[14px] text-[#ccc] leading-relaxed mb-4">{selectedPost.content}</p>
              <div className="flex items-center gap-4 text-[12px] text-[#888] pb-4 border-b border-[#333]">
                <button className="flex items-center gap-1 hover:text-[#3ea6ff] transition"><ThumbsUp size={14} /> {selectedPost.likes}</button>
                <button className="flex items-center gap-1 hover:text-[#3ea6ff] transition"><MessageCircle size={14} /> {selectedPost.replies}</button>
                <button className="flex items-center gap-1 hover:text-[#3ea6ff] transition"><Share2 size={14} /> 分享</button>
                <button className="flex items-center gap-1 hover:text-red-400 transition"><Flag size={14} /> 举报</button>
              </div>
              {/* Reply input */}
              <div className="flex items-center gap-2 mt-4">
                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="写回复..." className="flex-1 h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff]" />
                <button className="w-9 h-9 bg-[#3ea6ff] rounded-lg flex items-center justify-center text-[#0f0f0f] hover:bg-[#3ea6ff]/80 transition"><Send size={14} /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
