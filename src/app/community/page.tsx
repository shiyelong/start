"use client";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { fetchWithAuth, useAuth } from "@/lib/auth";
import clsx from "clsx";

/* ========== 常量 ========== */
const cats = [
  { id: "all", label: "全部" }, { id: "discuss", label: "讨论" }, { id: "share", label: "分享" },
  { id: "question", label: "提问" }, { id: "announce", label: "公告" },
];
const catNames: Record<string, string> = { discuss: "讨论", share: "分享", question: "提问", announce: "公告" };
const catColors: Record<string, string> = { discuss: "bg-blue-500/15 text-blue-400", share: "bg-emerald-500/15 text-emerald-400", question: "bg-yellow-500/15 text-yellow-400", announce: "bg-red-500/15 text-red-400" };

/* ========== 类型 ========== */
interface ApiPost {
  id: number;
  title: string;
  content: string;
  category: string;
  author_id: number;
  author_name: string;
  likes: number;
  views: number;
  pinned: number;
  created_at: string;
  updated_at: string;
}

interface ApiComment {
  id: number;
  post_id: number;
  author_id: number;
  author_name: string;
  content: string;
  likes: number;
  created_at: string;
}

/* ========== 工具函数 ========== */
const avatarBgColors = [
  "bg-blue-500", "bg-red-600", "bg-cyan-600", "bg-amber-600",
  "bg-green-500", "bg-purple-500", "bg-pink-500", "bg-indigo-500",
];

function getAvatarBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarBgColors[Math.abs(hash) % avatarBgColors.length];
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ========== 主组件 ========== */
export default function CommunityPage() {
  const { isLoggedIn } = useAuth();
  const [cat, setCat] = useState("all");
  const [selected, setSelected] = useState<number | null>(null);

  // API data
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail modal state
  const [detailPost, setDetailPost] = useState<ApiPost | null>(null);
  const [detailComments, setDetailComments] = useState<ApiComment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [liking, setLiking] = useState(false);

  // New post modal
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("discuss");
  const [postSubmitting, setPostSubmitting] = useState(false);

  // Fetch posts from API
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catParam = cat === "all" ? "" : cat;
      const url = `/api/community/posts?category=${catParam}&sort=newest&page=1&pageSize=50`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      const data = await res.json() as { posts?: typeof posts };
      setPosts(data.posts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [cat]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Fetch post detail with comments
  const openDetail = useCallback(async (id: number) => {
    setSelected(id);
    setDetailLoading(true);
    setDetailPost(null);
    setDetailComments([]);
    setCommentText("");
    try {
      const res = await fetchWithAuth(`/api/community/posts/${id}`);
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      const data = await res.json() as Record<string, unknown>;
      setDetailPost((data.post || data) as typeof detailPost);
      setDetailComments(((data.comments || (data.post as Record<string, unknown>)?.comments || []) as typeof detailComments));
    } catch {
      // If detail fetch fails, use the list data as fallback
      const fallback = posts.find(p => p.id === id) || null;
      setDetailPost(fallback);
    } finally {
      setDetailLoading(false);
    }
  }, [posts]);

  // Like toggle
  const handleLike = useCallback(async () => {
    if (!isLoggedIn || !detailPost || liking) return;
    setLiking(true);
    try {
      const res = await fetchWithAuth(`/api/community/posts/${detailPost.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("点赞失败");
      const data = await res.json() as { likes?: number };
      const newLikes = data.likes ?? detailPost.likes;
      setDetailPost(prev => prev ? { ...prev, likes: newLikes } : prev);
      // Also update in list
      setPosts(prev => prev.map(p => p.id === detailPost.id ? { ...p, likes: newLikes } : p));
    } catch { /* silently fail */ }
    finally { setLiking(false); }
  }, [isLoggedIn, detailPost, liking]);

  // Submit comment
  const handleComment = useCallback(async () => {
    if (!isLoggedIn || !detailPost || !commentText.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/community/posts/${detailPost.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (!res.ok) throw new Error("评论失败");
      const data = await res.json() as { comment?: typeof detailComments[number] };
      if (data.comment) {
        setDetailComments(prev => [...prev, data.comment!]);
      }
      setCommentText("");
    } catch { /* silently fail */ }
    finally { setCommentSubmitting(false); }
  }, [isLoggedIn, detailPost, commentText, commentSubmitting]);

  // Submit new post
  const handleNewPost = useCallback(async () => {
    if (!isLoggedIn || !newTitle.trim() || !newContent.trim() || postSubmitting) return;
    setPostSubmitting(true);
    try {
      const res = await fetchWithAuth("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim(), category: newCategory }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "发帖失败");
      }
      setShowNewPost(false);
      setNewTitle("");
      setNewContent("");
      setNewCategory("discuss");
      fetchPosts(); // Refresh list
    } catch { /* silently fail */ }
    finally { setPostSubmitting(false); }
  }, [isLoggedIn, newTitle, newContent, newCategory, postSubmitting, fetchPosts]);

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-6 pb-20 md:pb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">社区广场</h1>
          <button
            onClick={() => {
              if (!isLoggedIn) {
                window.location.href = `/login?redirect=${encodeURIComponent("/community")}`;
                return;
              }
              setShowNewPost(true);
            }}
            className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-semibold hover:bg-accent-hover transition"
          >
            <i className="fas fa-pen mr-1" /> 发帖
          </button>
        </div>
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {cats.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} className={clsx(
              "px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition",
              cat === c.id ? "bg-accent text-bg border-accent font-semibold" : "bg-transparent text-subtle border-border hover:bg-bg-hover hover:text-white"
            )}>{c.label}</button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center text-muted py-20">
            <i className="fas fa-spinner fa-spin text-4xl mb-4 text-accent opacity-40" />
            <p className="text-sm">加载中...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="text-center text-red-400 py-20">
            <i className="fas fa-circle-exclamation text-4xl mb-4 opacity-40" />
            <p className="text-sm mb-3">{error}</p>
            <button onClick={fetchPosts} className="px-4 py-1.5 rounded-lg bg-accent/15 text-accent text-xs border border-accent/30 hover:bg-accent/25 transition">
              重试
            </button>
          </div>
        )}

        {/* Posts list */}
        {!loading && !error && (
          <div className="space-y-3">
            {posts.map(p => (
              <div key={p.id} onClick={() => openDetail(p.id)} className="p-5 rounded-xl bg-bg-card/50 border border-border hover:border-accent/20 transition cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${catColors[p.category] || ""}`}>{catNames[p.category] || p.category}</span>
                  {p.pinned === 1 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">置顶</span>}
                  <h3 className="font-medium">{p.title}</h3>
                </div>
                <p className="text-sm text-muted line-clamp-2 mb-3">{p.content}</p>
                <div className="flex items-center justify-between text-xs text-muted">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <div className={`w-4 h-4 rounded-full ${getAvatarBg(p.author_name)} text-[8px] text-white font-bold flex items-center justify-center`}>{p.author_name[0]}</div>
                      {p.author_name}
                    </span>
                    <span>{formatDate(p.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span><i className="fas fa-heart mr-1" />{p.likes}</span>
                    <span><i className="fas fa-eye mr-1" />{p.views}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && posts.length === 0 && (
          <div className="text-center text-muted py-20">
            <i className="fas fa-comments text-4xl mb-4 opacity-20" />
            <p className="text-sm">暂无帖子</p>
          </div>
        )}
      </main>

      {/* Post Detail Modal */}
      {selected !== null && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <div className="text-center py-12">
                <i className="fas fa-spinner fa-spin text-2xl text-accent opacity-40" />
                <p className="text-sm text-muted mt-3">加载中...</p>
              </div>
            ) : detailPost ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${catColors[detailPost.category] || ""}`}>{catNames[detailPost.category] || detailPost.category}</span>
                  <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-bg-card flex items-center justify-center text-muted hover:text-white transition"><i className="fas fa-times" /></button>
                </div>
                <h2 className="text-lg font-bold mb-3">{detailPost.title}</h2>
                <div className="flex items-center gap-3 text-sm text-muted mb-4">
                  <span className="flex items-center gap-1">
                    <div className={`w-5 h-5 rounded-full ${getAvatarBg(detailPost.author_name)} text-[9px] text-white font-bold flex items-center justify-center`}>{detailPost.author_name[0]}</div>
                    {detailPost.author_name}
                  </span>
                  <span>{formatDate(detailPost.created_at)}</span>
                  <span className="ml-auto flex items-center gap-1 cursor-pointer hover:text-accent transition" onClick={handleLike}>
                    <i className={`fas fa-heart mr-1 ${liking ? "animate-pulse" : ""}`} />{detailPost.likes}
                  </span>
                </div>
                <div className="text-sm text-subtle leading-relaxed whitespace-pre-wrap mb-6">{detailPost.content}</div>
                <hr className="border-border mb-4" />
                <h3 className="font-bold text-sm mb-3">评论 ({detailComments.length})</h3>
                <div className="space-y-3 mb-4">
                  {detailComments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <div className={`w-7 h-7 rounded-full ${getAvatarBg(c.author_name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{c.author_name[0]}</div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium">{c.author_name}</span>
                          <span className="text-xs text-muted">{formatDate(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-subtle">{c.content}</p>
                      </div>
                    </div>
                  ))}
                  {detailComments.length === 0 && (
                    <p className="text-sm text-muted text-center py-4">暂无评论</p>
                  )}
                </div>
                {isLoggedIn ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleComment(); }}
                      className="flex-1 h-10 px-4 bg-bg-card border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent"
                      placeholder="写评论..."
                    />
                    <button
                      onClick={handleComment}
                      disabled={commentSubmitting || !commentText.trim()}
                      className="px-4 h-10 rounded-lg bg-accent text-bg text-sm font-semibold hover:bg-accent-hover transition disabled:opacity-50"
                    >
                      {commentSubmitting ? "发送中..." : "发送"}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <a href={`/login?redirect=${encodeURIComponent("/community")}`} className="text-sm text-accent hover:underline">登录后发表评论</a>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted">
                <p className="text-sm">加载失败</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Post Modal */}
      {showNewPost && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowNewPost(false)}>
          <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-full max-w-lg animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">发布新帖</h2>
              <button onClick={() => setShowNewPost(false)} className="w-8 h-8 rounded-full bg-bg-card flex items-center justify-center text-muted hover:text-white transition"><i className="fas fa-times" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1 block">分类</label>
                <div className="flex gap-2">
                  {cats.filter(c => c.id !== "all").map(c => (
                    <button key={c.id} onClick={() => setNewCategory(c.id)} className={clsx(
                      "px-3 py-1 rounded-full text-xs border transition",
                      newCategory === c.id ? "bg-accent text-bg border-accent font-semibold" : "bg-transparent text-subtle border-border hover:text-white"
                    )}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">标题</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full h-10 px-4 bg-bg-card border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent"
                  placeholder="输入标题..."
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">内容</label>
                <textarea
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 bg-bg-card border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent resize-none"
                  placeholder="输入内容..."
                />
              </div>
              <button
                onClick={handleNewPost}
                disabled={postSubmitting || !newTitle.trim() || !newContent.trim()}
                className="w-full h-10 rounded-lg bg-accent text-bg text-sm font-semibold hover:bg-accent-hover transition disabled:opacity-50"
              >
                {postSubmitting ? "发布中..." : "发布"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
