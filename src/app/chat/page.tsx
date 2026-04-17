"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Header from "@/components/layout/Header";
import { fetchWithAuth, useAuth } from "@/lib/auth";
import {
  MessageCircle, Users, Hash, Gamepad2, Music, Laugh, Coffee,
  Send, Image, Smile, Plus, ArrowLeft, Search, MoreVertical,
  Phone, Video, Pin, Bell, BellOff, Loader2, Check, CheckCheck,
  Mic, Paperclip, ChevronDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string | number;
  user: string;
  userId?: number;
  content: string;
  time: string;
  timestamp: number;
  isMe: boolean;
  status?: "sending" | "sent" | "read";
}

interface Conversation {
  id: string;
  type: "channel" | "private";
  name: string;
  icon: React.ElementType;
  desc: string;
  lastMessage?: string;
  lastTime?: string;
  unread: number;
  online?: boolean;
  avatar?: string;
  pinned?: boolean;
}

// ---------------------------------------------------------------------------
// Channel definitions
// ---------------------------------------------------------------------------

const CHANNELS: Conversation[] = [
  { id: "lobby", type: "channel", name: "大厅", icon: Users, desc: "公共聊天", unread: 0, pinned: true },
  { id: "game", type: "channel", name: "游戏交流", icon: Gamepad2, desc: "聊游戏", unread: 0 },
  { id: "music", type: "channel", name: "音乐分享", icon: Music, desc: "分享好歌", unread: 0 },
  { id: "funny", type: "channel", name: "搞笑专区", icon: Laugh, desc: "快乐源泉", unread: 0 },
  { id: "random", type: "channel", name: "水区", icon: Coffee, desc: "随便聊", unread: 0 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-pink-500", "bg-orange-500",
  "bg-violet-500", "bg-red-500", "bg-cyan-500", "bg-amber-500",
];

function pickColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function formatMsgTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------

function Avatar({ name, size = "md", online }: { name: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-10 h-10 text-sm";
  return (
    <div className="relative shrink-0">
      <div className={`${sizeClass} rounded-xl ${pickColor(name)} flex items-center justify-center text-white font-bold`}>
        {name[0]?.toUpperCase()}
      </div>
      {online !== undefined && (
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0f0f0f] ${online ? "bg-emerald-400" : "bg-gray-500"}`} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation list item
// ---------------------------------------------------------------------------

function ConversationItem({
  conv, active, onClick,
}: { conv: Conversation; active: boolean; onClick: () => void }) {
  const Icon = conv.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
        active
          ? "bg-[#3ea6ff]/10 border border-[#3ea6ff]/20"
          : "hover:bg-white/[0.04] border border-transparent"
      }`}
    >
      {conv.type === "channel" ? (
        <div className={`w-10 h-10 rounded-xl ${active ? "bg-[#3ea6ff]/20" : "bg-white/[0.06]"} flex items-center justify-center shrink-0`}>
          <Icon size={18} className={active ? "text-[#3ea6ff]" : "text-white/50"} />
        </div>
      ) : (
        <Avatar name={conv.name} online={conv.online} />
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium truncate ${active ? "text-[#3ea6ff]" : "text-white"}`}>
            {conv.name}
          </span>
          {conv.lastTime && (
            <span className="text-[10px] text-white/25 shrink-0 ml-2">{conv.lastTime}</span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-white/30 truncate">
            {conv.lastMessage || conv.desc}
          </span>
          {conv.unread > 0 && (
            <span className="ml-2 shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {conv.unread > 99 ? "99+" : conv.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg, showAvatar, showTime }: { msg: ChatMessage; showAvatar: boolean; showTime: boolean }) {
  return (
    <>
      {showTime && (
        <div className="flex justify-center my-3">
          <span className="text-[10px] text-white/20 bg-white/[0.04] px-3 py-1 rounded-full">{msg.time}</span>
        </div>
      )}
      <div className={`flex gap-2 ${msg.isMe ? "flex-row-reverse" : ""} ${showAvatar ? "mt-3" : "mt-0.5"}`}>
        {/* Avatar */}
        {showAvatar ? (
          <Avatar name={msg.user} size="sm" />
        ) : (
          <div className="w-8 shrink-0" />
        )}

        {/* Bubble */}
        <div className={`max-w-[75%] sm:max-w-[65%] ${msg.isMe ? "items-end" : "items-start"} flex flex-col`}>
          {showAvatar && !msg.isMe && (
            <span className="text-[11px] text-white/30 mb-1 ml-1">{msg.user}</span>
          )}
          <div
            className={`relative px-3 py-2 text-sm leading-relaxed break-words ${
              msg.isMe
                ? "bg-[#3ea6ff] text-white rounded-2xl rounded-tr-md"
                : "bg-[#1e1e1e] text-white/90 rounded-2xl rounded-tl-md"
            }`}
          >
            {msg.content}
          </div>
          {msg.isMe && msg.status && (
            <div className="flex items-center gap-0.5 mt-0.5 mr-1 self-end">
              {msg.status === "sending" && <Loader2 size={10} className="text-white/20 animate-spin" />}
              {msg.status === "sent" && <Check size={10} className="text-white/20" />}
              {msg.status === "read" && <CheckCheck size={10} className="text-[#3ea6ff]/60" />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================

export default function ChatPage() {
  const { isLoggedIn, user } = useAuth();

  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>(CHANNELS);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConvId) || null,
    [conversations, activeConvId],
  );

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q),
    );
  }, [conversations, searchQuery]);

  // Pinned vs unpinned
  const pinnedConvs = useMemo(() => filteredConversations.filter((c) => c.pinned), [filteredConversations]);
  const unpinnedConvs = useMemo(() => filteredConversations.filter((c) => !c.pinned), [filteredConversations]);

  // -----------------------------------------------------------------------
  // Fetch messages
  // -----------------------------------------------------------------------

  const fetchMessages = useCallback(async (convId: string) => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/chat/${convId}`);
      if (!res.ok) throw new Error("加载失败");
      const data = (await res.json()) as { messages: Record<string, unknown>[] };
      const mapped: ChatMessage[] = (data.messages || []).map((m, i) => {
        const created = m.created_at as string;
        const username = (m.username as string) || "匿名";
        const isMe = user ? (m.user_id as number) === user.id || username === user.username : false;
        return {
          id: (m.id as number) || i,
          user: username,
          userId: m.user_id as number | undefined,
          content: m.content as string,
          time: formatMsgTime(created),
          timestamp: new Date(created).getTime(),
          isMe,
          status: "read" as const,
        };
      });
      setMessages(mapped);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Select conversation
  const selectConversation = useCallback((convId: string) => {
    setActiveConvId(convId);
    setShowMobileChat(true);
    fetchMessages(convId);
    // Clear unread
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)),
    );
  }, [fetchMessages]);

  // Auto-select first conversation on desktop
  useEffect(() => {
    if (!activeConvId && conversations.length > 0 && window.innerWidth >= 768) {
      selectConversation(conversations[0].id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for new messages
  useEffect(() => {
    if (!activeConvId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`/api/chat/${activeConvId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: Record<string, unknown>[] };
        const mapped: ChatMessage[] = (data.messages || []).map((m, i) => {
          const created = m.created_at as string;
          const username = (m.username as string) || "匿名";
          const isMe = user ? (m.user_id as number) === user.id || username === user.username : false;
          return {
            id: (m.id as number) || i,
            user: username,
            userId: m.user_id as number | undefined,
            content: m.content as string,
            time: formatMsgTime(created),
            timestamp: new Date(created).getTime(),
            isMe,
            status: "read" as const,
          };
        });
        if (mapped.length !== messages.length) {
          setMessages(mapped);
        }
      } catch { /* silent */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeConvId, user, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !activeConvId) return;
    if (!isLoggedIn) {
      window.location.href = `/login?redirect=${encodeURIComponent("/chat")}`;
      return;
    }

    // Optimistic add
    const tempId = `temp-${Date.now()}`;
    const now = new Date();
    const optimistic: ChatMessage = {
      id: tempId,
      user: user?.username || "我",
      userId: user?.id,
      content: text,
      time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      timestamp: now.getTime(),
      isMe: true,
      status: "sending",
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);

    // Update conversation last message
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvId
          ? { ...c, lastMessage: text, lastTime: formatTime(now.toISOString()) }
          : c,
      ),
    );

    try {
      const res = await fetchWithAuth(`/api/chat/${activeConvId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error("发送失败");
      // Mark as sent
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "sent" as const } : m)),
      );
      // Refresh to get server-assigned ID
      setTimeout(() => fetchMessages(activeConvId), 500);
    } catch {
      // Mark as sent anyway (optimistic)
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "sent" as const } : m)),
      );
    } finally {
      setSending(false);
    }
  }, [input, sending, activeConvId, isLoggedIn, user, fetchMessages]);

  // Handle Enter key (Shift+Enter for newline)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  // Back to list (mobile)
  const handleBack = useCallback(() => {
    setShowMobileChat(false);
    setActiveConvId(null);
  }, []);

  // -----------------------------------------------------------------------
  // Determine if we should show time separator between messages
  // -----------------------------------------------------------------------

  function shouldShowTime(msgs: ChatMessage[], idx: number): boolean {
    if (idx === 0) return true;
    return msgs[idx].timestamp - msgs[idx - 1].timestamp > 5 * 60 * 1000; // 5 min gap
  }

  function shouldShowAvatar(msgs: ChatMessage[], idx: number): boolean {
    if (idx === 0) return true;
    return msgs[idx].user !== msgs[idx - 1].user || shouldShowTime(msgs, idx);
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto md:px-4 lg:px-6 md:py-4 pb-0 md:pb-4">
        <div
          className="flex bg-[#0f0f0f] md:bg-[#1a1a1a]/40 md:border md:border-white/[0.06] md:rounded-2xl overflow-hidden"
          style={{ height: "calc(100vh - 3.5rem - 1rem)" }}
        >
          {/* ===== Left: Conversation List ===== */}
          <div
            className={`w-full md:w-80 lg:w-96 flex flex-col border-r border-white/[0.04] bg-[#0f0f0f] md:bg-transparent shrink-0 ${
              showMobileChat ? "hidden md:flex" : "flex"
            }`}
          >
            {/* Search bar */}
            <div className="p-3 pb-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索聊天"
                  className="w-full h-9 pl-9 pr-3 bg-white/[0.04] border border-white/[0.06] rounded-xl text-sm text-white placeholder-white/20 outline-none focus:border-[#3ea6ff]/30 transition"
                />
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-hide">
              {pinnedConvs.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-[10px] text-white/20 font-medium uppercase tracking-wider flex items-center gap-1">
                    <Pin size={10} />
                    置顶
                  </div>
                  {pinnedConvs.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      active={activeConvId === conv.id}
                      onClick={() => selectConversation(conv.id)}
                    />
                  ))}
                </>
              )}
              {unpinnedConvs.length > 0 && (
                <>
                  {pinnedConvs.length > 0 && (
                    <div className="px-2 py-1.5 text-[10px] text-white/20 font-medium uppercase tracking-wider">
                      频道
                    </div>
                  )}
                  {unpinnedConvs.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      active={activeConvId === conv.id}
                      onClick={() => selectConversation(conv.id)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ===== Right: Chat Window ===== */}
          <div
            className={`flex-1 flex flex-col min-w-0 ${
              showMobileChat ? "flex" : "hidden md:flex"
            }`}
          >
            {activeConv ? (
              <>
                {/* Chat header */}
                <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.04] shrink-0 bg-[#0f0f0f]/50 backdrop-blur-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Back button (mobile) */}
                    <button
                      onClick={handleBack}
                      className="md:hidden p-1.5 -ml-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition"
                      aria-label="返回"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    {activeConv.type === "channel" ? (
                      <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center">
                        <Hash size={16} className="text-white/40" />
                      </div>
                    ) : (
                      <Avatar name={activeConv.name} online={activeConv.online} />
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{activeConv.name}</h3>
                      <p className="text-[11px] text-white/30 truncate">{activeConv.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition hidden sm:block" aria-label="语音通话">
                      <Phone size={16} />
                    </button>
                    <button className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition hidden sm:block" aria-label="视频通话">
                      <Video size={16} />
                    </button>
                    <button className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition" aria-label="更多">
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </div>

                {/* Messages area */}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto px-4 py-3 scrollbar-hide relative"
                  style={{ backgroundImage: "radial-gradient(circle at 50% 0%, rgba(62,166,255,0.02) 0%, transparent 50%)" }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                    setShowScrollDown(!atBottom);
                  }}
                >
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 text-[#3ea6ff]/40 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <MessageCircle size={40} className="text-white/[0.06] mb-3" />
                      <p className="text-sm text-white/20">暂无消息</p>
                      <p className="text-xs text-white/10 mt-1">发送第一条消息开始聊天</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        showAvatar={shouldShowAvatar(messages, idx)}
                        showTime={shouldShowTime(messages, idx)}
                      />
                    ))
                  )}
                  <div ref={bottomRef} />

                  {/* Scroll to bottom button */}
                  {showScrollDown && (
                    <button
                      onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
                      className="sticky bottom-3 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-[#1e1e1e] border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:border-white/20 transition shadow-lg z-10"
                      aria-label="滚动到底部"
                    >
                      <ChevronDown size={16} />
                    </button>
                  )}
                </div>

                {/* Input area */}
                <div className="border-t border-white/[0.04] bg-[#0f0f0f]/50 backdrop-blur-sm">
                  {/* Toolbar */}
                  <div className="flex items-center gap-1 px-3 pt-2">
                    <button className="p-1.5 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/5 transition" aria-label="表情">
                      <Smile size={18} />
                    </button>
                    <button className="p-1.5 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/5 transition" aria-label="图片">
                      <Image size={18} />
                    </button>
                    <button className="p-1.5 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/5 transition" aria-label="文件">
                      <Paperclip size={18} />
                    </button>
                    <button className="p-1.5 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/5 transition hidden sm:block" aria-label="语音">
                      <Mic size={18} />
                    </button>
                  </div>

                  {/* Text input */}
                  {isLoggedIn ? (
                    <div className="px-3 pb-3 pt-1">
                      <div className="flex items-end gap-2">
                        <textarea
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="输入消息..."
                          rows={1}
                          className="flex-1 min-h-[40px] max-h-[120px] px-3 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-sm text-white placeholder-white/20 outline-none focus:border-[#3ea6ff]/30 resize-none transition leading-relaxed"
                          disabled={sending}
                          style={{ height: "40px" }}
                          onInput={(e) => {
                            const el = e.currentTarget;
                            el.style.height = "40px";
                            el.style.height = Math.min(el.scrollHeight, 120) + "px";
                          }}
                        />
                        <button
                          onClick={sendMessage}
                          disabled={sending || !input.trim()}
                          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            input.trim()
                              ? "bg-[#3ea6ff] text-white hover:bg-[#65b8ff] shadow-lg shadow-[#3ea6ff]/20"
                              : "bg-white/[0.04] text-white/15"
                          }`}
                          aria-label="发送"
                        >
                          <Send size={16} className={input.trim() ? "" : ""} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 px-1">
                        <span className="text-[10px] text-white/15">
                          Enter 发送 · Shift+Enter 换行
                        </span>
                        <span className="text-[10px] text-white/15">
                          {input.length}/2000
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 pb-3 pt-2 text-center">
                      <a
                        href={`/login?redirect=${encodeURIComponent("/chat")}`}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-white text-sm font-medium hover:bg-[#65b8ff] transition"
                      >
                        <MessageCircle size={16} />
                        登录后发送消息
                      </a>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* No conversation selected (desktop) */
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <MessageCircle size={56} className="text-white/[0.04] mb-4" />
                <h3 className="text-lg font-semibold text-white/20">星聚聊天</h3>
                <p className="text-sm text-white/10 mt-1 max-w-xs">
                  选择一个频道开始聊天
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
