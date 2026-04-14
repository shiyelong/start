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
  Send,
  Image,
  Phone,
  Video,
  MoreVertical,
  Circle,
  Ban,
  Flag,
  Trash2,
  Clock,
  Check,
  CheckCheck,
  MessageCircle,
  UserCircle,
  Settings,
  Smile,
  Paperclip,
  Mic,
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

type OnlineStatus = 'online' | 'busy' | 'away' | 'offline';

interface ChatContact {
  id: string;
  name: string;
  avatar: string;
  status: OnlineStatus;
  lastMessage: string;
  lastTime: string;
  unread: number;
}

interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'image';
  timestamp: string;
  read: boolean;
}

const STATUS_COLORS: Record<OnlineStatus, string> = {
  online: 'bg-green-400',
  busy: 'bg-red-400',
  away: 'bg-yellow-400',
  offline: 'bg-gray-500',
};

const STATUS_LABELS: Record<OnlineStatus, string> = {
  online: '在线',
  busy: '忙碌',
  away: '隐身',
  offline: '离线',
};

function generateMockContacts(): ChatContact[] {
  const names = ['小樱', 'Lily', '美月', 'Anna', '小雪', 'Mia', '佳琪', 'Yuki', 'Sofia', '小美'];
  const statuses: OnlineStatus[] = ['online', 'busy', 'away', 'offline'];
  const avatars = [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&q=80',
    'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=100&q=80',
  ];

  return names.map((name, i) => ({
    id: `contact-${i + 1}`,
    name,
    avatar: avatars[i % avatars.length],
    status: statuses[i % statuses.length],
    lastMessage: i % 2 === 0 ? '你好，在吗？' : '好的，明天见',
    lastTime: `${(i % 12) + 1}:${String(i * 5 % 60).padStart(2, '0')}`,
    unread: i < 3 ? i + 1 : 0,
  }));
}

function generateMockMessages(contactId: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const contents = [
    '你好！', '在吗？', '最近怎么样？', '挺好的，你呢？',
    '我也不错', '周末有空吗？', '有的，什么事？', '一起出来玩吧',
    '好啊，去哪里？', '我想想...', '那就这么定了', '好的，到时候见',
  ];
  for (let i = 0; i < contents.length; i++) {
    messages.push({
      id: `msg-${contactId}-${i}`,
      senderId: i % 2 === 0 ? contactId : 'me',
      content: contents[i],
      type: 'text',
      timestamp: `2026-01-15 ${10 + Math.floor(i / 2)}:${String(i * 5 % 60).padStart(2, '0')}`,
      read: i < contents.length - 2,
    });
  }
  return messages;
}

const ALL_CONTACTS = generateMockContacts();

export default function ZoneChatPage() {
  const hasAccess = useAdultAccess();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  if (!hasAccess) return <AccessDenied />;

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return ALL_CONTACTS;
    const q = searchQuery.toLowerCase();
    return ALL_CONTACTS.filter(c => c.name.toLowerCase().includes(q));
  }, [searchQuery]);

  const messages = selectedContact ? generateMockMessages(selectedContact.id) : [];

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-0 md:px-4 lg:px-6 py-0 md:py-4">
        <div className="flex h-[calc(100vh-56px)] md:h-[calc(100vh-88px)] bg-[#0f0f0f] md:rounded-xl md:border md:border-[#333]/50 overflow-hidden">
          {/* Contact list */}
          <div className={`w-full md:w-80 border-r border-[#333]/50 flex flex-col ${selectedContact ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-3 border-b border-[#333]/50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
                  <MessageCircle size={18} className="text-[#3ea6ff]" /> 私聊
                  <RatingBadge rating="NC-17" />
                </h2>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索联系人..." className="w-full h-8 pl-9 pr-4 bg-[#1a1a1a] border border-[#333] rounded-lg text-[12px] text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredContacts.map(c => (
                <div key={c.id} onClick={() => setSelectedContact(c)} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition ${selectedContact?.id === c.id ? 'bg-[#3ea6ff]/10' : 'hover:bg-white/5'}`}>
                  <div className="relative shrink-0">
                    <img src={c.avatar} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0f0f0f] ${STATUS_COLORS[c.status]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-white truncate">{c.name}</span>
                      <span className="text-[10px] text-[#666]">{c.lastTime}</span>
                    </div>
                    <p className="text-[11px] text-[#666] truncate">{c.lastMessage}</p>
                  </div>
                  {c.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#3ea6ff] text-[10px] text-[#0f0f0f] font-bold flex items-center justify-center shrink-0">{c.unread}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chat area */}
          <div className={`flex-1 flex flex-col ${!selectedContact ? 'hidden md:flex' : 'flex'}`}>
            {selectedContact ? (
              <>
                {/* Chat header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#333]/50">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedContact(null)} className="md:hidden p-1 text-[#888] hover:text-white"><X size={18} /></button>
                    <img src={selectedContact.avatar} alt={selectedContact.name} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <span className="text-[13px] font-medium text-white">{selectedContact.name}</span>
                      <p className="text-[10px] text-[#666] flex items-center gap-1">
                        <Circle size={6} className={`fill-current ${STATUS_COLORS[selectedContact.status].replace('bg-', 'text-')}`} />
                        {STATUS_LABELS[selectedContact.status]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-[#888] hover:text-[#3ea6ff] transition"><Video size={18} /></button>
                    <div className="relative">
                      <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-[#888] hover:text-white transition"><MoreVertical size={18} /></button>
                      {showMenu && (
                        <div className="absolute right-0 top-full mt-1 w-36 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl z-10 py-1">
                          <button className="w-full px-3 py-2 text-left text-[12px] text-[#888] hover:text-white hover:bg-white/5 flex items-center gap-2"><Ban size={12} /> 屏蔽用户</button>
                          <button className="w-full px-3 py-2 text-left text-[12px] text-red-400 hover:bg-white/5 flex items-center gap-2"><Flag size={12} /> 举报</button>
                          <button className="w-full px-3 py-2 text-left text-[12px] text-red-400 hover:bg-white/5 flex items-center gap-2"><Trash2 size={12} /> 删除聊天</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderId === 'me' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-[13px] ${msg.senderId === 'me' ? 'bg-[#3ea6ff] text-[#0f0f0f] rounded-br-md' : 'bg-[#1a1a1a] text-white rounded-bl-md'}`}>
                        <p>{msg.content}</p>
                        <div className={`flex items-center gap-1 mt-0.5 text-[9px] ${msg.senderId === 'me' ? 'text-[#0f0f0f]/60 justify-end' : 'text-[#666]'}`}>
                          <span>{msg.timestamp.split(' ')[1]}</span>
                          {msg.senderId === 'me' && (msg.read ? <CheckCheck size={10} /> : <Check size={10} />)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t border-[#333]/50">
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-[#888] hover:text-[#3ea6ff] transition"><Image size={18} /></button>
                    <input type="text" value={messageText} onChange={e => setMessageText(e.target.value)} placeholder="输入消息..." className="flex-1 h-9 px-3 bg-[#1a1a1a] border border-[#333] rounded-full text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff] transition" />
                    <button className="w-9 h-9 bg-[#3ea6ff] rounded-full flex items-center justify-center text-[#0f0f0f] hover:bg-[#3ea6ff]/80 transition"><Send size={16} /></button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-[#666]">
                  <MessageCircle size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">选择一个联系人开始聊天</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
