"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { fetchWithAuth, useAuth } from "@/lib/auth";
import clsx from "clsx";

interface ChatMessage { user: string; color: string; msg: string; time: string; }

const chatChannels = [
  { id: "lobby", name: "大厅", icon: "fa-home", desc: "公共聊天" },
  { id: "game", name: "游戏交流", icon: "fa-gamepad", desc: "聊游戏" },
  { id: "music", name: "音乐分享", icon: "fa-music", desc: "分享好歌" },
  { id: "funny", name: "搞笑专区", icon: "fa-face-laugh", desc: "快乐源泉" },
  { id: "random", name: "水区", icon: "fa-dice", desc: "随便聊" },
];

const USER_COLORS = ["bg-blue-500","bg-green-500","bg-pink-500","bg-orange-500","bg-yellow-500","bg-violet-500","bg-red-500","bg-cyan-500"];

function pickColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % USER_COLORS.length;
  return USER_COLORS[h];
}

export default function ChatPage() {
  const { isLoggedIn, user } = useAuth();
  const [channel, setChannel] = useState("lobby");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [onlineCount] = useState(Math.floor(Math.random() * 10) + 5);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Fetch messages from API */
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`/api/chat/${channel}`);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json() as { messages: Record<string, unknown>[] };
      const mapped: ChatMessage[] = (data.messages || []).map((m) => {
        const created = m.created_at as string;
        const d = new Date(created);
        const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        const username = (m.username as string) || "匿名";
        return { user: username, color: pickColor(username), msg: m.content as string, time };
      });
      setMessages(mapped);
    } catch {
      setError("加载消息失败");
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  /* Poll for new messages every 5 seconds */
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`/api/chat/${channel}`);
        if (!res.ok) return;
        const data = await res.json() as { messages: Record<string, unknown>[] };
        const mapped: ChatMessage[] = (data.messages || []).map((m) => {
          const created = m.created_at as string;
          const d = new Date(created);
          const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
          const username = (m.username as string) || "匿名";
          return { user: username, color: pickColor(username), msg: m.content as string, time };
        });
        setMessages(mapped);
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [channel]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const ch = chatChannels.find(c => c.id === channel);

  /* Send message via POST */
  async function send() {
    if (!input.trim() || sending) return;
    if (!isLoggedIn) {
      window.location.href = `/login?redirect=${encodeURIComponent("/chat")}`;
      return;
    }
    setSending(true);
    try {
      const res = await fetchWithAuth(`/api/chat/${channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      });
      if (!res.ok) throw new Error("发送失败");
      setInput("");
      // Refresh messages after sending
      await fetchMessages();
    } catch {
      // Optimistic: add locally on failure
      const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      setMessages(prev => [...prev, { user: user?.username || "我", color: "bg-accent", msg: input.trim(), time }]);
      setInput("");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Header />
      <main className="max-w-[1200px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3" style={{ height: "calc(100vh - 7rem)" }}>
          {/* Sidebar */}
          <div className="md:col-span-3 bg-bg-card/50 border border-border rounded-xl p-4 flex flex-col overflow-hidden">
            <h3 className="font-bold text-sm mb-3"><i className="fas fa-hashtag text-accent mr-2" />频道</h3>
            <div className="space-y-0.5 mb-4">
              {chatChannels.map(c => (
                <button key={c.id} onClick={() => setChannel(c.id)} className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2",
                  channel === c.id ? "bg-accent-glow text-accent" : "text-subtle hover:bg-bg-hover hover:text-white"
                )}>
                  <span><i className={`fas ${c.icon}`} /></span>
                  <div><div className="text-sm">{c.name}</div><div className="text-[10px] text-muted">{c.desc}</div></div>
                </button>
              ))}
            </div>
            <hr className="border-border mb-3" />
            <h3 className="font-bold text-sm mb-3"><span className="inline-block w-2 h-2 rounded-full bg-success mr-2" />在线 ({onlineCount})</h3>
            <div className="space-y-2 overflow-y-auto flex-1">
              {isLoggedIn && user && (
                <div className="flex items-center gap-2 text-xs text-subtle">
                  <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-white text-[9px] font-bold">{user.username[0]}</div>
                  {user.username} (我)
                </div>
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className="md:col-span-9 bg-bg-card/50 border border-border rounded-xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm"><i className={`fas ${ch?.icon} mr-1`} /> {ch?.name}</h3>
              <span className="text-xs text-muted">{onlineCount} 人在线</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && (
                <div className="text-center py-10 text-[#8a8a8a]">
                  <i className="fas fa-spinner fa-spin text-lg mb-2" />
                  <p className="text-xs">加载消息中...</p>
                </div>
              )}
              {error && !loading && (
                <div className="text-center py-10 text-[#ff4444]">
                  <p className="text-xs">{error}</p>
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div className="text-center py-10 text-[#8a8a8a]">
                  <p className="text-xs">暂无消息，来说点什么吧！</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className="flex gap-3 animate-slide-up">
                  <div className={`w-8 h-8 rounded-full ${m.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{m.user[0]}</div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium">{m.user}</span>
                      <span className="text-[11px] text-muted">{m.time}</span>
                    </div>
                    <p className="text-sm text-subtle">{m.msg}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-border">
              {isLoggedIn ? (
                <div className="flex gap-2">
                  <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                    className="flex-1 h-10 px-4 bg-bg border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent" placeholder="输入消息..." disabled={sending} />
                  <button onClick={send} disabled={sending || !input.trim()} className={clsx(
                    "px-4 h-10 rounded-lg text-sm font-semibold transition",
                    sending || !input.trim() ? "bg-[#333] text-[#666]" : "bg-accent text-bg hover:bg-accent-hover"
                  )}>
                    <i className="fas fa-paper-plane" />
                  </button>
                </div>
              ) : (
                <div className="text-center py-2">
                  <a href={`/login?redirect=${encodeURIComponent("/chat")}`} className="text-sm text-accent hover:underline">
                    <i className="fas fa-sign-in-alt mr-1" />登录后发送消息
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
