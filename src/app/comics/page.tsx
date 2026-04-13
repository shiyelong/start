"use client";
import { useState } from "react";
import Header from "@/components/Header";
import { useAuth } from "@/lib/auth";
import QRVerify from "@/components/QRVerify";
import GeoVerify from "@/components/GeoVerify";
import clsx from "clsx";
import type { VerifyStatus, GeoLocation } from "@/lib/content-verify";
import { fmtNum, isMobile } from "@/lib/content-verify";

/* ========== 分类 ========== */
const cats = [
  { id: "hot", label: "热门" },
  { id: "new", label: "最新" },
  { id: "verified", label: "? 已验证" },
  { id: "unverified", label: "? 待验证" },
  { id: "romance", label: "恋爱" },
  { id: "action", label: "热血" },
  { id: "fantasy", label: "奇幻" },
  { id: "funny", label: "搞笑" },
  { id: "suspense", label: "悬疑" },
];

/* ========== 评论类型 ========== */
interface ComicComment {
  id: number;
  userName: string;
  content: string;
  rating: number;
  isVerifier: boolean;
  geoVerified: boolean;
  photos?: string[];
  createdAt: string;
  likes: number;
}

/* ========== 漫画数据 ========== */
interface Comic {
  id: number;
  title: string;
  cat: string;
  cover: string;
  author: string;
  status: string;
  chapters: number;
  views: number;
  verifyStatus: VerifyStatus;
  uploadedBy: string;
  targetLocation?: GeoLocation;
  comments: ComicComment[];
  verifyCount: number;
  rating: number;
  description?: string;
}

const comics: Comic[] = [
  { id: 1, title: "独自升级", cat: "action", cover: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=300&q=80", author: "DUBU", status: "连载中", chapters: 210, views: 1520000, verifyStatus: "verified", uploadedBy: "站长", targetLocation: { lat: 31.2304, lng: 121.4737, address: "上海市黄浦区" }, comments: [{ id: 1, userName: "漫画迷A", content: "画风超棒，剧情紧凑！实地确认过出版信息。", rating: 5, isVerifier: true, geoVerified: true, createdAt: "2026-03-15", likes: 42 }, { id: 2, userName: "路人B", content: "追了好久了，强推！", rating: 4, isVerifier: false, geoVerified: false, createdAt: "2026-03-20", likes: 15 }], verifyCount: 3, rating: 4.7, description: "一个普通猎人在获得系统后逐渐成长为最强猎人的故事。" },
  { id: 2, title: "咒术回战", cat: "action", cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80", author: "芥见下下", status: "已完结", chapters: 271, views: 2800000, verifyStatus: "verified", uploadedBy: "用户C", targetLocation: { lat: 35.6762, lng: 139.6503, address: "东京都涩谷区" }, comments: [{ id: 3, userName: "验证员X", content: "已确认为正版授权，内容完整。", rating: 5, isVerifier: true, geoVerified: true, createdAt: "2026-02-10", likes: 88 }], verifyCount: 5, rating: 4.8, description: "虎杖悠仁吞下诅咒之王两面宿傩的手指后的冒险故事。" },
  { id: 3, title: "间谍过家家", cat: "funny", cover: "https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=300&q=80", author: "远藤达哉", status: "连载中", chapters: 105, views: 1900000, verifyStatus: "verified", uploadedBy: "站长", comments: [{ id: 4, userName: "家庭漫画爱好者", content: "温馨又搞笑，全家都能看。", rating: 5, isVerifier: false, geoVerified: false, createdAt: "2026-04-01", likes: 33 }], verifyCount: 2, rating: 4.6 },
  { id: 4, title: "药屋少女的呢喃", cat: "romance", cover: "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=300&q=80", author: "日向夏", status: "连载中", chapters: 86, views: 980000, verifyStatus: "unverified", uploadedBy: "用户D", targetLocation: { lat: 39.9042, lng: 116.4074, address: "北京市东城区" }, comments: [], verifyCount: 0, rating: 0, description: "用户上传，等待验证。" },
  { id: 5, title: "葬送的芙莉莲", cat: "fantasy", cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80", author: "山田�的", status: "连载中", chapters: 135, views: 1650000, verifyStatus: "unverified", uploadedBy: "用户E", comments: [], verifyCount: 0, rating: 0, description: "用户上传，等待社区验证。" },
  { id: 6, title: "电锯人", cat: "action", cover: "https://images.unsplash.com/photo-1611457194403-d3f8c5154dc2?w=300&q=80", author: "藤本树", status: "连载中", chapters: 178, views: 3200000, verifyStatus: "verified", uploadedBy: "站长", comments: [{ id: 5, userName: "硬核读者", content: "藤本树的画风太独特了，剧情反转不断。", rating: 5, isVerifier: true, geoVerified: true, createdAt: "2026-01-20", likes: 120 }], verifyCount: 8, rating: 4.9 },
  { id: 7, title: "我推的孩子", cat: "suspense", cover: "https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=300&q=80", author: "赤坂明", status: "已完结", chapters: 162, views: 2100000, verifyStatus: "verified", uploadedBy: "用户F", comments: [{ id: 6, userName: "追番达人", content: "结局有点争议但整体很棒。", rating: 4, isVerifier: false, geoVerified: false, createdAt: "2026-03-05", likes: 56 }], verifyCount: 4, rating: 4.5 },
  { id: 8, title: "蓝色监狱", cat: "action", cover: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=300&q=80", author: "金城宗幸", status: "连载中", chapters: 280, views: 1800000, verifyStatus: "pending", uploadedBy: "用户G", targetLocation: { lat: 34.6937, lng: 135.5023, address: "大阪市中央区" }, comments: [{ id: 7, userName: "足球迷", content: "验证中，内容看起来是正版。", rating: 4, isVerifier: true, geoVerified: false, createdAt: "2026-04-05", likes: 8 }], verifyCount: 1, rating: 4.0, description: "正在验证中..." },
  { id: 9, title: "怪兽8号", cat: "action", cover: "https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=300&q=80", author: "松本直也", status: "连载中", chapters: 115, views: 1200000, verifyStatus: "unverified", uploadedBy: "用户H", comments: [], verifyCount: 0, rating: 0, description: "用户上传，等待验证。" },
  { id: 10, title: "恋爱代行", cat: "romance", cover: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&q=80", author: "宫岛礼吏", status: "连载中", chapters: 340, views: 2500000, verifyStatus: "verified", uploadedBy: "站长", comments: [{ id: 8, userName: "恋爱漫画控", content: "甜到掉牙！", rating: 5, isVerifier: false, geoVerified: false, createdAt: "2026-02-14", likes: 200 }], verifyCount: 6, rating: 4.7 },
];

/* ========== 验证状态徽章 ========== */
function VerifyBadge({ status, count }: { status: VerifyStatus; count: number }) {
  const cfg = {
    verified: { icon: "fa-check-circle", text: "已验证", cls: "bg-[#2ba640]/15 text-[#2ba640] border-[#2ba640]/30" },
    pending: { icon: "fa-clock", text: "验证中", cls: "bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30" },
    unverified: { icon: "fa-question-circle", text: "未验证", cls: "bg-[#8a8a8a]/15 text-[#8a8a8a] border-[#8a8a8a]/30" },
    rejected: { icon: "fa-times-circle", text: "已驳回", cls: "bg-[#ff4444]/15 text-[#ff4444] border-[#ff4444]/30" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-bold ${cfg.cls}`}>
      <i className={`fas ${cfg.icon}`} />
      {cfg.text}{count > 0 && ` (${count})`}
    </span>
  );
}

/* ========== 评论组件 ========== */
function CommentItem({ c }: { c: ComicComment }) {
  return (
    <div className="p-3 rounded-xl bg-[#1a1a1a]/50 border border-[#333]/30">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-6 h-6 rounded-full bg-[#3ea6ff] flex items-center justify-center text-[10px] font-bold text-[#0f0f0f]">
          {c.userName.charAt(0)}
        </div>
        <span className="text-xs font-medium">{c.userName}</span>
        {c.isVerifier && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#2ba640]/15 text-[#2ba640] border border-[#2ba640]/30 font-bold">
            <i className="fas fa-shield-check mr-0.5" />验证者
          </span>
        )}
        {c.geoVerified && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3ea6ff]/15 text-[#3ea6ff] border border-[#3ea6ff]/30 font-bold">
            <i className="fas fa-map-marker-alt mr-0.5" />实地
          </span>
        )}
        <div className="flex gap-0.5 ml-auto">
          {[1,2,3,4,5].map(s => (
            <i key={s} className={`fas fa-star text-[8px] ${s <= c.rating ? "text-[#f0b90b]" : "text-[#333]"}`} />
          ))}
        </div>
      </div>
      <p className="text-[12px] text-[#aaa] leading-relaxed">{c.content}</p>
      {c.photos && c.photos.length > 0 && (
        <div className="flex gap-1.5 mt-2">
          {c.photos.map((p, i) => (
            <div key={i} className="w-16 h-16 rounded-lg bg-[#212121] overflow-hidden">
              <img src={p} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-[#666]">
        <span>{c.createdAt}</span>
        <span><i className="fas fa-heart mr-0.5" />{c.likes}</span>
      </div>
    </div>
  );
}

/* ========== 上传弹窗 ========== */
function UploadModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { title: string; author: string; cat: string; desc: string }) => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [cat, setCat] = useState("action");
  const [desc, setDesc] = useState("");

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#141414] border border-[#333] rounded-t-2xl md:rounded-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4"><i className="fas fa-upload mr-2 text-[#3ea6ff]" />上传漫画</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#8a8a8a] mb-1 block">漫画名称 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="输入漫画名称" className="w-full h-9 px-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff]" />
          </div>
          <div>
            <label className="text-xs text-[#8a8a8a] mb-1 block">作者 *</label>
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="输入作者名" className="w-full h-9 px-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff]" />
          </div>
          <div>
            <label className="text-xs text-[#8a8a8a] mb-1 block">分类</label>
            <select value={cat} onChange={e => setCat(e.target.value)} className="w-full h-9 px-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white outline-none focus:border-[#3ea6ff]">
              {cats.filter(c => !["hot","new","verified","unverified"].includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#8a8a8a] mb-1 block">简介</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="简单描述一下这部漫画..." rows={3} className="w-full p-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] resize-none" />
          </div>
        </div>
        <p className="text-[10px] text-[#666] mt-3 mb-4"><i className="fas fa-info-circle mr-1" />上传后状态为"未验证"，需要其他用户实地验证后才会标记为"已验证"。</p>
        <div className="flex gap-2">
          <button onClick={() => { if (title && author) onSubmit({ title, author, cat, desc }); }} disabled={!title || !author} className="flex-1 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition disabled:opacity-50">
            <i className="fas fa-cloud-upload-alt mr-1.5" />提交
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa]">取消</button>
        </div>
      </div>
    </div>
  );
}

/* ========== 主组件 ========== */
export default function ComicsPage() {
  const { isLoggedIn } = useAuth();
  const [cat, setCat] = useState("hot");
  const [selected, setSelected] = useState<Comic | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showQR, setShowQR] = useState<Comic | null>(null);
  const [showGeo, setShowGeo] = useState<Comic | null>(null);
  const [commentText, setCommentText] = useState("");
  const [allComics, setAllComics] = useState(comics);

  const filtered = (() => {
    if (cat === "verified") return allComics.filter(c => c.verifyStatus === "verified");
    if (cat === "unverified") return allComics.filter(c => c.verifyStatus === "unverified" || c.verifyStatus === "pending");
    if (cat === "hot") return [...allComics].sort((a, b) => b.views - a.views);
    if (cat === "new") return [...allComics].sort((a, b) => b.id - a.id);
    return allComics.filter(c => c.cat === cat);
  })();

  const handleUpload = (data: { title: string; author: string; cat: string; desc: string }) => {
    const newComic: Comic = {
      id: allComics.length + 1, title: data.title, cat: data.cat,
      cover: "https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=300&q=80",
      author: data.author, status: "连载中", chapters: 0, views: 0,
      verifyStatus: "unverified", uploadedBy: "我", comments: [],
      verifyCount: 0, rating: 0, description: data.desc,
    };
    setAllComics(prev => [newComic, ...prev]);
    setShowUpload(false);
  };

  const handleStartVerify = (comic: Comic) => {
    if (isMobile()) {
      setShowGeo(comic);
    } else {
      setShowQR(comic);
    }
  };

  const handleGeoSubmit = (data: { comment: string; rating: number; status: "approved" | "rejected" }) => {
    if (!showGeo) return;
    const newComment: ComicComment = {
      id: Date.now(), userName: "我", content: data.comment, rating: data.rating,
      isVerifier: true, geoVerified: true, createdAt: new Date().toISOString().slice(0, 10), likes: 0,
    };
    setAllComics(prev => prev.map(c =>
      c.id === showGeo.id ? {
        ...c,
        comments: [...c.comments, newComment],
        verifyCount: c.verifyCount + 1,
        verifyStatus: data.status === "approved" ? "verified" as VerifyStatus : c.verifyStatus,
        rating: c.comments.length > 0
          ? (c.comments.reduce((s, cm) => s + cm.rating, 0) + data.rating) / (c.comments.length + 1)
          : data.rating,
      } : c
    ));
    if (selected?.id === showGeo.id) {
      setSelected(prev => prev ? { ...prev, comments: [...prev.comments, newComment], verifyCount: prev.verifyCount + 1 } : prev);
    }
    setShowGeo(null);
  };

  const handleAddComment = () => {
    if (!selected || !commentText.trim()) return;
    const newComment: ComicComment = {
      id: Date.now(), userName: "我", content: commentText, rating: 4,
      isVerifier: false, geoVerified: false, createdAt: new Date().toISOString().slice(0, 10), likes: 0,
    };
    setAllComics(prev => prev.map(c =>
      c.id === selected.id ? { ...c, comments: [...c.comments, newComment] } : c
    ));
    setSelected(prev => prev ? { ...prev, comments: [...prev.comments, newComment] } : prev);
    setCommentText("");
  };

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold"><i className="fas fa-book-open mr-2 text-[#3ea6ff]" />漫画中心</h1>
          {isLoggedIn && (
            <button onClick={() => setShowUpload(true)} className="px-3 py-1.5 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-xs font-semibold hover:bg-[#65b8ff] transition">
              <i className="fas fa-plus mr-1" />上传漫画
            </button>
          )}
        </div>

        {/* 分类标签 */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
          {cats.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} className={clsx(
              "px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition",
              cat === c.id ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold" : "bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white"
            )}>{c.label}</button>
          ))}
        </div>

        {/* 漫画网格 */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          {filtered.map(c => (
            <div key={c.id} onClick={() => setSelected(c)} className="group cursor-pointer transition hover:-translate-y-1">
              <div className="relative aspect-[3/4] bg-[#1a1a1a] rounded-xl overflow-hidden">
                <img src={c.cover} alt={c.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {/* 验证状态 */}
                <div className="absolute top-1.5 left-1.5">
                  <VerifyBadge status={c.verifyStatus} count={c.verifyCount} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${c.status === "连载中" ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#2ba640] text-white"}`}>{c.status}</span>
                  {c.rating > 0 && (
                    <span className="text-[9px] text-[#f0b90b]"><i className="fas fa-star mr-0.5" />{c.rating.toFixed(1)}</span>
                  )}
                </div>
              </div>
              <div className="pt-2">
                <h3 className="text-sm font-medium text-white line-clamp-1">{c.title}</h3>
                <p className="text-[11px] text-[#8a8a8a]">{c.author} · {c.chapters}话 · {fmtNum(c.views)}阅读</p>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <i className="fas fa-book-open text-4xl mb-4 opacity-20" />
            <p className="text-sm">该分类暂无漫画</p>
          </div>
        )}
      </main>

      {/* ===== 详情弹窗 ===== */}
      {selected && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg bg-[#141414] border border-[#333] rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div className="sticky top-0 z-10 bg-[#141414]/95 backdrop-blur-xl border-b border-[#333]/50 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-bold text-base truncate">{selected.title}</h2>
                <VerifyBadge status={selected.verifyStatus} count={selected.verifyCount} />
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white transition shrink-0 ml-3">
                <i className="fas fa-times" />
              </button>
            </div>

            {/* 漫画信息 */}
            <div className="px-5 py-4 border-b border-[#333]/30">
              <div className="flex gap-4 mb-3">
                <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden shrink-0 bg-[#212121]">
                  <img src={selected.cover} alt={selected.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#aaa] mb-2">{selected.author}</p>
                  <div className="flex flex-wrap gap-2 text-xs mb-2">
                    <span className={`px-2 py-0.5 rounded ${selected.status === "连载中" ? "bg-[#3ea6ff]/15 text-[#3ea6ff]" : "bg-[#2ba640]/15 text-[#2ba640]"}`}>{selected.status}</span>
                    <span className="px-2 py-0.5 rounded bg-[#333] text-[#aaa]">{selected.chapters} 话</span>
                    <span className="px-2 py-0.5 rounded bg-[#333] text-[#aaa]">{fmtNum(selected.views)} 阅读</span>
                  </div>
                  {selected.rating > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      {[1,2,3,4,5].map(s => <i key={s} className={`fas fa-star text-xs ${s <= Math.round(selected.rating) ? "text-[#f0b90b]" : "text-[#333]"}`} />)}
                      <span className="text-xs text-[#f0b90b] ml-1">{selected.rating.toFixed(1)}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-[#666]">上传者: {selected.uploadedBy}</p>
                </div>
              </div>
              {selected.description && <p className="text-sm text-[#8a8a8a]">{selected.description}</p>}
            </div>

            {/* 验证操作区 */}
            {selected.verifyStatus !== "verified" && isLoggedIn && (
              <div className="px-5 py-3 border-b border-[#333]/30 bg-[#f0b90b]/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#f0b90b]"><i className="fas fa-shield-check mr-1.5" />需要验证</p>
                    <p className="text-[11px] text-[#8a8a8a]">前往实地拍照验证，帮助社区确认信息真实性</p>
                  </div>
                  <button onClick={() => handleStartVerify(selected)} className="px-3 py-2 rounded-lg bg-[#f0b90b] text-[#0f0f0f] text-xs font-bold hover:bg-[#f0b90b]/80 transition">
                    <i className="fas fa-camera mr-1" />去验证
                  </button>
                </div>
              </div>
            )}

            {/* 评论区 */}
            <div className="px-5 py-4">
              <h3 className="text-sm font-bold mb-3">
                <i className="fas fa-comments mr-1.5 text-[#3ea6ff]" />
                评论 ({selected.comments.length})
              </h3>

              {selected.comments.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {selected.comments.map(c => <CommentItem key={c.id} c={c} />)}
                </div>
              ) : (
                <div className="text-center py-6 text-[#666] text-sm mb-4">
                  <i className="fas fa-comment-slash text-2xl mb-2 opacity-30" />
                  <p>暂无评论，来说两句吧</p>
                </div>
              )}

              {/* 发表评论 */}
              {isLoggedIn && (
                <div className="flex gap-2">
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="写下你的评论..."
                    className="flex-1 h-9 px-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff]"
                    onKeyDown={e => e.key === "Enter" && handleAddComment()}
                  />
                  <button onClick={handleAddComment} disabled={!commentText.trim()} className="px-4 h-9 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-xs font-bold hover:bg-[#65b8ff] transition disabled:opacity-50">
                    发送
                  </button>
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="sticky bottom-0 bg-[#141414]/95 backdrop-blur-xl border-t border-[#333]/50 px-5 py-3 flex gap-2">
              <button className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition">
                <i className="fas fa-book-open mr-1" /> 开始阅读
              </button>
              <button onClick={() => setSelected(null)} className="px-6 py-3 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa] hover:bg-[#2a2a2a] transition">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 上传弹窗 */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSubmit={handleUpload} />}

      {/* QR验证弹窗（PC端） */}
      {showQR && (
        <QRVerify
          contentId={showQR.id}
          contentType="comic"
          contentTitle={showQR.title}
          onClose={() => setShowQR(null)}
          onMobileVerify={() => { setShowQR(null); setShowGeo(showQR); }}
        />
      )}

      {/* 地理验证弹窗（移动端） */}
      {showGeo && showGeo.targetLocation && (
        <GeoVerify
          targetLocation={showGeo.targetLocation}
          contentTitle={showGeo.title}
          onSubmit={handleGeoSubmit}
          onClose={() => setShowGeo(null)}
        />
      )}
    </>
  );
}
