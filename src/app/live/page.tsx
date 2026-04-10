"use client";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { fetchWithAuth } from "@/lib/auth";
import clsx from "clsx";

/* ========== 分类 ========== */
const categories = [
  { id: "all", label: "全部", icon: "fa-fire" },
  { id: "gaming", label: "游戏", icon: "fa-gamepad" },
  { id: "music", label: "音乐", icon: "fa-music" },
  { id: "chat", label: "聊天", icon: "fa-comments" },
  { id: "study", label: "学习", icon: "fa-book" },
  { id: "outdoor", label: "户外", icon: "fa-mountain-sun" },
  { id: "food", label: "美食", icon: "fa-utensils" },
  { id: "tech", label: "科技", icon: "fa-microchip" },
  { id: "art", label: "绘画", icon: "fa-palette" },
];

/* ========== 直播间接口 ========== */
interface LiveRoom {
  id: number;
  title: string;
  streamer: string;
  avatar: string;
  category: string;
  viewers: number;
  tags: string[];
  isLive: boolean;
  thumbnail: string;
  startTime?: string;
  description?: string;
}

/* Map API row → LiveRoom */
const THUMB_GRADIENTS = [
  "from-[#1a0a2e] to-[#2a1a3e]", "from-[#0a1a2e] to-[#1a2a3e]",
  "from-[#1a1a0e] to-[#2a2a1e]", "from-[#2a0a0a] to-[#3a1a1a]",
  "from-[#2a1a0a] to-[#3a2a1a]", "from-[#0a0a2a] to-[#1a1a3a]",
  "from-[#2a0a1a] to-[#3a1a2a]", "from-[#0a2a1a] to-[#1a3a2a]",
  "from-[#0a0a1a] to-[#1a0a2a]", "from-[#1a1a2e] to-[#0a2a3e]",
];
const AVATARS = ["🎮","🎸","📚","⚔️","🍖","💻","🎨","🚴","🌙","⭐","🎹","🐍"];

function mapApiRoom(row: Record<string, unknown>, idx: number): LiveRoom {
  const tags = (() => { try { return JSON.parse(row.tags as string); } catch { return []; } })();
  return {
    id: row.id as number,
    title: row.title as string,
    streamer: (row.streamer_name as string) || "主播",
    avatar: AVATARS[idx % AVATARS.length],
    category: (row.category as string) || "chat",
    viewers: (row.viewer_count as number) || 0,
    tags,
    isLive: row.status === "live",
    thumbnail: THUMB_GRADIENTS[idx % THUMB_GRADIENTS.length],
    description: (row.description as string) || undefined,
  };
}

function fmtViewers(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

export default function LivePage() {
  const [cat, setCat] = useState("all");
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [watching, setWatching] = useState<LiveRoom | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<{ user: string; msg: string; color: string }[]>([]);
  const [showStartLive, setShowStartLive] = useState(false);
  const [searchText, setSearchText] = useState("");

  /* Fetch rooms from API */
  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = cat === "all" ? "/api/live/rooms" : `/api/live/rooms?category=${cat}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json() as { items: Record<string, unknown>[] };
      setRooms((data.items || []).map(mapApiRoom));
    } catch {
      setError("加载直播间失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [cat]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const filtered = rooms.filter(r => {
    if (searchText && !r.title.includes(searchText) && !r.streamer.includes(searchText) && !r.tags.some(t => t.includes(searchText))) return false;
    return true;
  });

  const totalViewers = rooms.reduce((s, r) => s + r.viewers, 0);
  const CHAT_COLORS = ["#3ea6ff", "#2ba640", "#f0b90b", "#ff4444", "#a855f7", "#ec4899", "#f97316"];

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const color = CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)];
    setChatMsgs(prev => [...prev.slice(-50), { user: "我", msg: chatInput, color }]);
    setChatInput("");
    // 模拟其他人回复
    setTimeout(() => {
      const bots = ["路人甲", "小明", "观众A", "粉丝1号", "游客", "老王"];
      const replies = ["666", "好厉害！", "主播加油", "哈哈哈", "太强了", "学到了", "❤️", "🔥🔥🔥", "第一次来", "关注了"];
      setChatMsgs(prev => [...prev.slice(-50), {
        user: bots[Math.floor(Math.random() * bots.length)],
        msg: replies[Math.floor(Math.random() * replies.length)],
        color: CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)],
      }]);
    }, 500 + Math.random() * 2000);
  };

  // 自动弹幕
  const startAutoChat = (room: LiveRoom) => {
    setWatching(room);
    setChatMsgs([
      { user: "系统", msg: `欢迎来到 ${room.streamer} 的直播间！`, color: "#f0b90b" },
      { user: "系统", msg: "请文明发言，友善互动 ❤️", color: "#8a8a8a" },
    ]);
  };

  return (
    <>
      <Header />
      {!watching ? (
        <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-8">
          {/* 头部 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">
                <i className="fas fa-tower-broadcast mr-2 text-[#ff4444]" />直播
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ff4444]/10 border border-[#ff4444]/20 text-[#ff4444] font-semibold animate-pulse">
                <i className="fas fa-circle text-[6px] mr-1" />{rooms.length}个直播中
              </span>
              <span className="text-[11px] text-[#8a8a8a]">{fmtViewers(totalViewers)}人在看</span>
            </div>
            <button onClick={() => setShowStartLive(true)} className="px-4 py-2 rounded-lg bg-[#ff4444] text-white text-xs font-semibold hover:bg-[#ff6666] transition active:scale-95">
              <i className="fas fa-video mr-1.5" />我要开播
            </button>
          </div>

          {/* 分类 */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-4 px-4">
            {categories.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)} className={clsx(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] whitespace-nowrap border transition shrink-0",
                cat === c.id
                  ? "bg-[#ff4444] text-white border-[#ff4444] font-semibold"
                  : "bg-[#1a1a1a] text-[#aaa] border-[#333]/50 hover:bg-[#212121] hover:text-white"
              )}>
                <i className={`fas ${c.icon} text-[11px]`} />{c.label}
              </button>
            ))}
          </div>

          {/* 搜索 */}
          <div className="relative mb-4">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-xs" />
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="搜索直播间、主播、标签..."
              className="w-full h-9 pl-9 pr-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#ff4444] transition" />
          </div>

          {/* Loading / Error */}
          {loading && (
            <div className="text-center py-20 text-[#8a8a8a]">
              <i className="fas fa-spinner fa-spin text-2xl mb-3" />
              <p className="text-sm">加载中...</p>
            </div>
          )}
          {error && !loading && (
            <div className="text-center py-20 text-[#ff4444]">
              <i className="fas fa-exclamation-circle text-2xl mb-3" />
              <p className="text-sm">{error}</p>
              <button onClick={fetchRooms} className="mt-3 px-4 py-1.5 rounded-lg bg-[#333] text-white text-xs hover:bg-[#444] transition">重试</button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* 推荐横幅 */}
              {cat === "all" && filtered.length > 0 && (
                <div onClick={() => startAutoChat(filtered[0])}
                  className="relative mb-5 rounded-2xl overflow-hidden cursor-pointer group">
                  <div className={`h-48 md:h-64 bg-gradient-to-br ${filtered[0].thumbnail} relative`}>
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-white/15 backdrop-blur flex items-center justify-center group-hover:scale-110 transition">
                        <i className="fas fa-play text-white text-2xl ml-1" />
                      </div>
                    </div>
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#ff4444] text-white text-[10px] font-bold animate-pulse">
                        <i className="fas fa-circle text-[6px] mr-1" />LIVE
                      </span>
                      <span className="px-2 py-0.5 rounded bg-black/50 text-white text-[10px]">
                        <i className="fas fa-eye mr-1" />{fmtViewers(filtered[0].viewers)}
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{filtered[0].avatar}</span>
                        <div>
                          <h2 className="font-bold text-white">{filtered[0].title}</h2>
                          <p className="text-[12px] text-[#aaa]">{filtered[0].streamer}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 直播间列表 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(room => (
                  <div key={room.id} onClick={() => startAutoChat(room)}
                    className="rounded-xl overflow-hidden cursor-pointer group hover:-translate-y-1 transition-all">
                    <div className={`relative aspect-video bg-gradient-to-br ${room.thumbnail}`}>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                        <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                          <i className="fas fa-play text-white text-lg ml-0.5" />
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[#ff4444] text-white text-[9px] font-bold">
                          <i className="fas fa-circle text-[5px] mr-0.5" />LIVE
                        </span>
                      </div>
                      <div className="absolute bottom-2 right-2">
                        <span className="px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px]">
                          <i className="fas fa-eye mr-1" />{fmtViewers(room.viewers)}
                        </span>
                      </div>
                      <div className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-[#212121] border-2 border-[#ff4444] flex items-center justify-center text-sm">
                        {room.avatar}
                      </div>
                    </div>
                    <div className="p-3 bg-[#1a1a1a]/50">
                      <h3 className="text-sm font-semibold line-clamp-1 group-hover:text-[#ff4444] transition">{room.title}</h3>
                      <p className="text-[11px] text-[#8a8a8a] mt-0.5">{room.streamer}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {room.tags.slice(0, 2).map((t: string, i: number) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[#212121] text-[#8a8a8a] border border-[#333]/50">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="text-center text-[#8a8a8a] py-20">
                  <i className="fas fa-tower-broadcast text-4xl mb-4 opacity-20" />
                  <p className="text-sm">暂无该分类的直播</p>
                </div>
              )}
            </>
          )}
        </main>
      ) : (
        /* ========== 观看直播 ========== */
        <main className="h-[calc(100vh-3.5rem)] flex flex-col md:flex-row">
          {/* 视频区 */}
          <div className="flex-1 flex flex-col bg-black">
            <div className="flex-1 relative bg-gradient-to-br from-[#0a0a1a] to-[#1a0a2a] flex items-center justify-center min-h-[200px]">
              <div className="text-center">
                <div className="text-6xl mb-4">{watching.avatar}</div>
                <p className="text-[#8a8a8a] text-sm">直播画面加载中...</p>
                <p className="text-[#666] text-xs mt-1">（实际部署需接入推流服务）</p>
              </div>
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setWatching(null)} className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition">
                    <i className="fas fa-arrow-left text-sm" />
                  </button>
                  <span className="px-2 py-0.5 rounded bg-[#ff4444] text-white text-[10px] font-bold animate-pulse">
                    <i className="fas fa-circle text-[5px] mr-1" />LIVE
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/50 text-white text-[10px]">
                    <i className="fas fa-eye mr-1" />{fmtViewers(watching.viewers)}
                  </span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#212121] border-2 border-[#ff4444] flex items-center justify-center text-xl">{watching.avatar}</div>
                    <div>
                      <h2 className="font-bold text-white text-sm">{watching.title}</h2>
                      <p className="text-[11px] text-[#aaa]">{watching.streamer} · {categories.find(c => c.id === watching.category)?.label}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-lg bg-[#ff4444] text-white text-xs font-bold hover:bg-[#ff6666] transition">
                      <i className="fas fa-heart mr-1" />关注
                    </button>
                    <button className="px-3 py-1.5 rounded-lg bg-[#f0b90b] text-[#0f0f0f] text-xs font-bold hover:bg-[#f0b90b]/80 transition">
                      <i className="fas fa-gift mr-1" />打赏
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 聊天区 */}
          <div className="w-full md:w-80 lg:w-96 flex flex-col bg-[#0f0f0f] border-l border-[#333]/50 h-64 md:h-auto">
            <div className="px-3 py-2 border-b border-[#333]/50 flex items-center justify-between">
              <span className="text-sm font-bold"><i className="fas fa-comments mr-1.5 text-[#3ea6ff]" />聊天</span>
              <span className="text-[10px] text-[#8a8a8a]">{fmtViewers(watching.viewers)}人在看</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
              {chatMsgs.map((m, i) => (
                <div key={i} className="text-[12px]">
                  <span className="font-bold mr-1.5" style={{ color: m.color }}>{m.user}</span>
                  <span className="text-[#ccc]">{m.msg}</span>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-[#333]/50 flex gap-2">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendChat(); }}
                placeholder="说点什么..."
                className="flex-1 h-9 px-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-xs text-white placeholder-[#666] outline-none focus:border-[#3ea6ff]" />
              <button onClick={sendChat} className="px-3 h-9 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-xs font-bold hover:bg-[#65b8ff] transition">
                发送
              </button>
            </div>
          </div>
        </main>
      )}

      {/* 开播弹窗 */}
      {showStartLive && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowStartLive(false)}>
          <div className="w-full max-w-md bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold"><i className="fas fa-video mr-2 text-[#ff4444]" />开始直播</h2>
              <button onClick={() => setShowStartLive(false)} className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white"><i className="fas fa-times" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#8a8a8a] mb-1 block">直播标题</label>
                <input type="text" placeholder="给你的直播起个标题" className="w-full h-10 px-3 bg-[#212121] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#ff4444]" />
              </div>
              <div>
                <label className="text-xs text-[#8a8a8a] mb-1 block">直播分类</label>
                <select className="w-full h-10 px-3 bg-[#212121] border border-[#333] rounded-lg text-sm text-white outline-none focus:border-[#ff4444]">
                  {categories.filter(c => c.id !== "all").map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8a8a8a] mb-1 block">直播简介</label>
                <textarea placeholder="介绍一下你的直播内容..." rows={3}
                  className="w-full bg-[#212121] border border-[#333] rounded-lg p-3 text-sm text-white placeholder-[#666] outline-none focus:border-[#ff4444] resize-none" />
              </div>
              <div>
                <label className="text-xs text-[#8a8a8a] mb-1 block">推流方式</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-[#212121] border border-[#333] text-center">
                    <i className="fas fa-camera text-[#3ea6ff] text-lg mb-1" />
                    <p className="text-xs font-bold">摄像头直播</p>
                    <p className="text-[10px] text-[#666]">浏览器直接开播</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#212121] border border-[#333] text-center">
                    <i className="fas fa-desktop text-[#a855f7] text-lg mb-1" />
                    <p className="text-xs font-bold">OBS推流</p>
                    <p className="text-[10px] text-[#666]">专业推流软件</p>
                  </div>
                </div>
              </div>
              <button onClick={() => { setShowStartLive(false); alert("开播功能需要接入推流服务（如SRS/LiveKit），当前为演示模式。"); }}
                className="w-full py-3 rounded-xl bg-[#ff4444] text-white font-bold text-sm hover:bg-[#ff6666] transition active:scale-95">
                <i className="fas fa-tower-broadcast mr-1.5" />开始直播
              </button>
            </div>
            <p className="text-[10px] text-[#666] mt-3 text-center">实际开播需要接入推流服务（SRS/LiveKit等）</p>
          </div>
        </div>
      )}
    </>
  );
}
