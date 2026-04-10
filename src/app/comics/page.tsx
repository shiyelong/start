"use client";
import { useState } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

const cats = [
  { id: "hot", label: "热门" },
  { id: "new", label: "最新" },
  { id: "ehentai", label: "E-Hentai" },
  { id: "romance", label: "恋爱" },
  { id: "action", label: "热血" },
  { id: "fantasy", label: "奇幻" },
  { id: "funny", label: "搞笑" },
  { id: "suspense", label: "悬疑" },
];

const comics = [
  { id: 1, title: "独自升级", cat: "action", cover: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=300&q=80", author: "DUBU", status: "连载中", chapters: 210, views: 1520000 },
  { id: 2, title: "咒术回战", cat: "action", cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80", author: "芥见下下", status: "已完结", chapters: 271, views: 2800000 },
  { id: 3, title: "间谍过家家", cat: "funny", cover: "https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=300&q=80", author: "远藤达哉", status: "连载中", chapters: 105, views: 1900000 },
  { id: 4, title: "药屋少女的呢喃", cat: "romance", cover: "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=300&q=80", author: "日向夏", status: "连载中", chapters: 86, views: 980000 },
  { id: 5, title: "葬送的芙莉莲", cat: "fantasy", cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80", author: "山田�的�的", status: "连载中", chapters: 135, views: 1650000 },
  { id: 6, title: "电锯人", cat: "action", cover: "https://images.unsplash.com/photo-1611457194403-d3f8c5154dc2?w=300&q=80", author: "藤本树", status: "连载中", chapters: 178, views: 3200000 },
  { id: 7, title: "我推的孩子", cat: "suspense", cover: "https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=300&q=80", author: "�的推知", status: "已完结", chapters: 162, views: 2100000 },
  { id: 8, title: "蓝色监狱", cat: "action", cover: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=300&q=80", author: "金城宗幸", status: "连载中", chapters: 280, views: 1800000 },
  { id: 9, title: "怪兽8号", cat: "action", cover: "https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=300&q=80", author: "松本直也", status: "连载中", chapters: 115, views: 1200000 },
  { id: 10, title: "恋爱代行", cat: "romance", cover: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&q=80", author: "宫岛礼吏", status: "连载中", chapters: 340, views: 2500000 },
  { id: 11, title: "异世界归来的舅舅", cat: "funny", cover: "https://images.unsplash.com/photo-1635805737707-575885ab0820?w=300&q=80", author: "殆不死", status: "连载中", chapters: 62, views: 760000 },
  { id: 12, title: "迷宫饭", cat: "fantasy", cover: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80", author: "九井谅子", status: "已完结", chapters: 97, views: 1400000 },
];

// E-Hentai内容
const ehentaiComics = [
  { id: 101, title: "Hentai Comic", cat: "ehentai", cover: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&q=80", author: "E-Hentai", status: "完结", chapters: 1, views: 580000 },
  { id: 102, title: "Adult Manga", cat: "ehentai", cover: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=300&q=80", author: "E-Hentai", status: "完结", chapters: 1, views: 420000 },
  { id: 103, title: "Anime Hentai", cat: "ehentai", cover: "https://images.unsplash.com/photo-1524659270455-3f859d87e55d?w=300&q=80", author: "E-Hentai", status: "完结", chapters: 1, views: 650000 },
  { id: 104, title: "Doujinshi", cat: "ehentai", cover: "https://images.unsplash.com/photo-1547949003-9792a18a2601?w=300&q=80", author: "E-Hentai", status: "完结", chapters: 1, views: 380000 },
  { id: 105, title: "Ecchi Manga", cat: "ehentai", cover: "https://images.unsplash.com/photo-1526509867277-5034758c18c0?w=300&q=80", author: "E-Hentai", status: "完结", chapters: 1, views: 510000 },
  { id: 106, title: "Hentai Doujin", cat: "ehentai", cover: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=300&q=80", author: "E-Hentai", status: "完结", chapters: 1, views: 470000 },
  { id: 107, title: "Adult Comic", cat: "ehentai", cover: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80", author: "E-Hentai", status: "完结", chapters: 1, views: 530000 },
  { id: 108, title: "Hentai Collection", cat: "ehentai", cover: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&q=80", author: "E-Hentai", status: "完结", chapters: 1, views: 610000 },
];

function fmtNum(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return String(n);
}

export default function ComicsPage() {
  const [cat, setCat] = useState("hot");
  const [selected, setSelected] = useState<typeof comics[0] | null>(null);

  const filtered = cat === "ehentai" ? ehentaiComics : (cat === "hot" || cat === "new" ? comics : comics.filter(c => c.cat === cat));

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        <h1 className="text-xl font-bold mb-4"><i className="fas fa-book-open mr-2 text-[#3ea6ff]" />漫画中心</h1>

        <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
          {cats.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} className={clsx(
              "px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition",
              cat === c.id ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold" : "bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white"
            )}>{c.label}</button>
          ))}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          {filtered.map(c => (
            <div key={c.id} onClick={() => setSelected(c)} className="group cursor-pointer transition hover:-translate-y-1">
              <div className="relative aspect-[3/4] bg-[#1a1a1a] rounded-xl overflow-hidden">
                <img src={c.cover} alt={c.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${c.status === "连载中" ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#2ba640] text-white"}`}>{c.status}</span>
                </div>
              </div>
              <div className="pt-2">
                <h3 className="text-sm font-medium text-white line-clamp-1">{c.title}</h3>
                <p className="text-[11px] text-[#8a8a8a]">{c.author} · {c.chapters}话</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* 漫画详情弹窗 */}
      {selected && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg bg-[#1a1a1a] border border-[#333] rounded-t-2xl md:rounded-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex gap-4 mb-4">
              <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden shrink-0 bg-[#212121]">
                <img src={selected.cover} alt={selected.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold mb-1">{selected.title}</h2>
                <p className="text-sm text-[#aaa] mb-2">{selected.author}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded ${selected.status === "连载中" ? "bg-[#3ea6ff]/15 text-[#3ea6ff]" : "bg-[#2ba640]/15 text-[#2ba640]"}`}>{selected.status}</span>
                  <span className="px-2 py-0.5 rounded bg-[#333] text-[#aaa]">{selected.chapters} 话</span>
                  <span className="px-2 py-0.5 rounded bg-[#333] text-[#aaa]">{fmtNum(selected.views)} 阅读</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              {selected.cat === "ehentai" ? (
                <a 
                  href="https://e-hentai.org/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 transition flex items-center justify-center"
                >
                  <i className="fas fa-external-link-alt mr-1" /> 去E-Hentai查看
                </a>
              ) : (
                <button className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition">
                  <i className="fas fa-book-open mr-1" /> 开始阅读
                </button>
              )}
              <button onClick={() => setSelected(null)} className="px-6 py-3 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa] hover:bg-[#2a2a2a] transition">
                关闭
              </button>
            </div>
            <p className="text-center text-xs text-[#8a8a8a] mt-3">
              {selected.cat === "ehentai" ? "点击按钮跳转到E-Hentai查看" : "漫画阅读功能即将上线"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
