'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import { ageGate } from '@/lib/age-gate';
import {
  Search,
  X,
  ShieldAlert,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Phone,
  BookOpen,
  Eye,
  Flag,
  Star,
  Users,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  Siren,
  Ban,
  Fingerprint,
  Scale,
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

// Anti-fraud guide data
const FRAUD_TYPES = [
  { icon: <Fingerprint size={16} />, title: '照片欺诈', desc: '使用他人照片或严重修图，实际外貌与照片不符。', tips: '要求视频验证，查看社区验证报告。' },
  { icon: <Ban size={16} />, title: '预付费骗局', desc: '要求提前支付定金或全款后消失。', tips: '不要提前转账，选择当面交易。' },
  { icon: <AlertCircle size={16} />, title: '仙人跳', desc: '设局敲诈勒索。', tips: '选择正规场所，告知朋友行踪，保留证据。' },
  { icon: <XCircle size={16} />, title: '服务缩水', desc: '实际服务与承诺不符。', tips: '查看点评，选择高评分和已验证的服务者。' },
  { icon: <Scale size={16} />, title: '法律风险', desc: '涉及违法活动。', tips: '了解当地法律法规，避免违法行为。' },
];

// Mock blacklist data
const MOCK_BLACKLIST = [
  { id: 'bl-1', name: '骗子A', reason: '预付费后消失', reports: 15, date: '2026-01-15' },
  { id: 'bl-2', name: '骗子B', reason: '照片严重不符', reports: 8, date: '2026-02-20' },
  { id: 'bl-3', name: '骗子C', reason: '仙人跳', reports: 22, date: '2026-03-10' },
  { id: 'bl-4', name: '骗子D', reason: '服务缩水+态度恶劣', reports: 12, date: '2026-01-28' },
  { id: 'bl-5', name: '骗子E', reason: '多次爽约', reports: 6, date: '2026-04-05' },
];

export default function ZoneSafetyPage() {
  const hasAccess = useAdultAccess();
  const [activeTab, setActiveTab] = useState<'guide' | 'blacklist' | 'report' | 'reputation'>('guide');
  const [blacklistQuery, setBlacklistQuery] = useState('');
  const [reportText, setReportText] = useState('');
  const [reportType, setReportType] = useState('fraud');

  if (!hasAccess) return <AccessDenied />;

  const filteredBlacklist = MOCK_BLACKLIST.filter(b =>
    !blacklistQuery.trim() || b.name.toLowerCase().includes(blacklistQuery.toLowerCase()) || b.reason.toLowerCase().includes(blacklistQuery.toLowerCase())
  );

  const tabs = [
    { id: 'guide' as const, label: '防骗指南', icon: <BookOpen size={14} /> },
    { id: 'blacklist' as const, label: '黑名单查询', icon: <Ban size={14} /> },
    { id: 'report' as const, label: '举报', icon: <Flag size={14} /> },
    { id: 'reputation' as const, label: '信誉积分', icon: <Star size={14} /> },
  ];

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck size={22} className="text-green-400" />
            <span>安全中心</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
          {/* Emergency button */}
          <button className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-[13px] font-medium hover:bg-red-500 transition animate-pulse">
            <Siren size={16} /> 紧急求助
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] whitespace-nowrap transition ${activeTab === tab.id ? 'bg-[#3ea6ff] text-[#0f0f0f] font-semibold' : 'bg-[#1a1a1a] text-[#aaa] hover:text-white'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Guide tab */}
        {activeTab === 'guide' && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
              <h2 className="text-[15px] font-bold text-yellow-400 mb-2 flex items-center gap-2"><AlertTriangle size={16} /> 常见欺诈手段与防范</h2>
              <p className="text-[12px] text-[#8a8a8a] mb-3">了解常见骗局，保护自身安全。</p>
            </div>
            {FRAUD_TYPES.map((fraud, i) => (
              <div key={i} className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">{fraud.icon}</div>
                  <div>
                    <h3 className="text-sm font-medium text-white mb-1">{fraud.title}</h3>
                    <p className="text-[12px] text-[#8a8a8a] mb-2">{fraud.desc}</p>
                    <div className="flex items-start gap-1 text-[11px] text-green-400">
                      <CheckCircle size={12} className="mt-0.5 shrink-0" />
                      <span>{fraud.tips}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Blacklist tab */}
        {activeTab === 'blacklist' && (
          <div>
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
              <input type="text" value={blacklistQuery} onChange={e => setBlacklistQuery(e.target.value)} placeholder="搜索黑名单..." className="w-full h-9 pl-9 pr-4 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
            </div>
            <div className="space-y-2">
              {filteredBlacklist.map(b => (
                <div key={b.id} className="p-3 rounded-xl bg-[#1a1a1a] border border-red-500/20 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-red-400">{b.name}</span>
                      <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded">黑名单</span>
                    </div>
                    <p className="text-[12px] text-[#8a8a8a]">{b.reason}</p>
                  </div>
                  <div className="text-right text-[11px] text-[#666]">
                    <p className="flex items-center gap-1"><Flag size={9} /> {b.reports}次举报</p>
                    <p>{b.date}</p>
                  </div>
                </div>
              ))}
              {filteredBlacklist.length === 0 && (
                <div className="text-center py-10 text-[#666]">
                  <CheckCircle size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">未找到匹配的黑名单记录</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Report tab */}
        {activeTab === 'report' && (
          <div className="max-w-xl">
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
              <h2 className="text-[15px] font-bold text-white flex items-center gap-2"><Flag size={16} className="text-red-400" /> 提交举报</h2>
              <div>
                <label className="text-[12px] text-[#888] mb-1 block">举报类型</label>
                <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white outline-none focus:border-[#3ea6ff]">
                  <option value="fraud">欺诈</option>
                  <option value="violence">暴力威胁</option>
                  <option value="underage">涉及未成年</option>
                  <option value="blackmail">敲诈勒索</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] text-[#888] mb-1 block">详细描述</label>
                <textarea value={reportText} onChange={e => setReportText(e.target.value)} placeholder="请详细描述情况，提供尽可能多的信息..." className="w-full h-32 px-3 py-2 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff] resize-none" />
              </div>
              <button className="w-full py-2 bg-red-600 text-white rounded-lg text-[13px] font-medium hover:bg-red-500 transition">提交举报</button>
              <p className="text-[11px] text-[#555] text-center">举报信息将匿名处理，我们会尽快审核。</p>
            </div>
          </div>
        )}

        {/* Reputation tab */}
        {activeTab === 'reputation' && (
          <div className="max-w-xl space-y-4">
            <div className="p-6 rounded-xl bg-[#1a1a1a] border border-[#333]/50 text-center">
              <div className="w-24 h-24 rounded-full bg-green-500/10 border-4 border-green-500/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl font-bold text-green-400">85</span>
              </div>
              <p className="text-white font-medium mb-1">你的信誉积分</p>
              <p className="text-[12px] text-[#8a8a8a]">信誉良好</p>
            </div>
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
              <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2"><Info size={14} /> 积分规则</h3>
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center justify-between text-[#8a8a8a]">
                  <span className="flex items-center gap-1"><CheckCircle size={10} className="text-green-400" /> 完成验证</span>
                  <span className="text-green-400">+10分</span>
                </div>
                <div className="flex items-center justify-between text-[#8a8a8a]">
                  <span className="flex items-center gap-1"><CheckCircle size={10} className="text-green-400" /> 获得好评</span>
                  <span className="text-green-400">+5分</span>
                </div>
                <div className="flex items-center justify-between text-[#8a8a8a]">
                  <span className="flex items-center gap-1"><CheckCircle size={10} className="text-green-400" /> 提交有效举报</span>
                  <span className="text-green-400">+3分</span>
                </div>
                <div className="flex items-center justify-between text-[#8a8a8a]">
                  <span className="flex items-center gap-1"><XCircle size={10} className="text-red-400" /> 被举报</span>
                  <span className="text-red-400">-10分</span>
                </div>
                <div className="flex items-center justify-between text-[#8a8a8a]">
                  <span className="flex items-center gap-1"><XCircle size={10} className="text-red-400" /> 获得差评</span>
                  <span className="text-red-400">-5分</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
