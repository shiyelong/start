"use client";
import { useState } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

/* ========== 分类 ========== */
const genres = [
  { id: "all", label: "全部" },
  { id: "fantasy", label: "玄幻" },
  { id: "wuxia", label: "武侠" },
  { id: "urban", label: "都市" },
  { id: "romance", label: "言情" },
  { id: "scifi", label: "科幻" },
  { id: "mystery", label: "悬疑" },
  { id: "history", label: "历史" },
  { id: "game", label: "游戏" },
  { id: "horror", label: "恐怖" },
];

const statusFilters = [
  { id: "all", label: "全部" },
  { id: "ongoing", label: "连载中" },
  { id: "completed", label: "已完结" },
];

/* ========== 数据 ========== */
interface Novel {
  id: number;
  title: string;
  author: string;
  genre: string;
  cover?: string;
  desc: string;
  tags: string[];
  wordCount: string;
  chapters: number;
  status: "ongoing" | "completed";
  rating: number;
  views: string;
  lastUpdate: string;
  preview: string[]; // 前几段
}

const novels: Novel[] = [
  {
    id: 1, title: "星域征途", author: "银河笔客", genre: "scifi",
    desc: "2340年，人类踏入星际时代。退役军人陈锋意外获得远古文明遗物，卷入银河系最大的阴谋之中。",
    tags: ["星际", "硬科幻", "热血"], wordCount: "186万", chapters: 892, status: "ongoing",
    rating: 4.7, views: "3200万", lastUpdate: "2026-04-10",
    preview: [
      "深空站的警报声划破了寂静。陈锋从冷冻舱中醒来，眼前的全息屏幕上闪烁着刺眼的红色警告。",
      "「未知能量波动检测——距离：0.3光年——威胁等级：S」",
      "他揉了揉太阳穴，冷冻休眠的后遗症让他的大脑还有些迟钝。但多年的军旅生涯让他的身体比意识更快地做出了反应——他已经穿好了作战服，手指搭在了控制台上。",
    ],
  },
  {
    id: 2, title: "九天剑帝", author: "剑舞苍穹", genre: "fantasy",
    desc: "少年林逸身怀废脉，被家族驱逐。偶得上古剑帝传承，从此踏上逆天修炼之路，剑斩苍穹。",
    tags: ["修仙", "逆袭", "爽文"], wordCount: "320万", chapters: 1560, status: "ongoing",
    rating: 4.5, views: "5800万", lastUpdate: "2026-04-10",
    preview: [
      "青云城外，少年跪在暴雨中。",
      "林家大门紧闭，门上的金色匾额在闪电中格外刺眼。",
      "「废脉之人，不配姓林。」长老的话还回荡在耳边。林逸攥紧了拳头，雨水混着血从指缝间滴落。",
    ],
  },
  {
    id: 3, title: "重生之都市仙尊", author: "墨染青衫", genre: "urban",
    desc: "修仙界大能渡劫失败，重生回到都市少年时代。这一世，他要弥补所有遗憾，站在世界之巅。",
    tags: ["重生", "都市", "修仙"], wordCount: "245万", chapters: 1203, status: "completed",
    rating: 4.6, views: "4100万", lastUpdate: "2026-03-15",
    preview: [
      "苏辰睁开眼，看到的是一间破旧的出租屋。",
      "墙上的日历写着2026年4月1日。他愣了三秒，然后疯狂地笑了起来。",
      "上一世，他在修仙界苦修三千年，最终在渡劫时功亏一篑。而现在，他回来了——带着三千年的记忆和修为。",
    ],
  },
  {
    id: 4, title: "锦绣医妃", author: "浅墨轻烟", genre: "romance",
    desc: "现代女医生穿越成将军府废材嫡女，凭借医术和智慧，在后宅争斗中步步为营，收获真爱。",
    tags: ["穿越", "医术", "宫斗"], wordCount: "198万", chapters: 956, status: "completed",
    rating: 4.8, views: "6200万", lastUpdate: "2026-02-20",
    preview: [
      "沈清歌再次睁眼时，入目的是一顶绣着金凤的床帐。",
      "「小姐醒了！小姐醒了！」一个梳着双丫髻的小丫鬟惊喜地叫了起来。",
      "沈清歌看着自己纤细白嫩的手，又看了看铜镜中那张陌生而精致的脸，沉默了。她是三甲医院的主刀医生，怎么就穿越了？",
    ],
  },
  {
    id: 5, title: "诡秘档案", author: "深渊观察者", genre: "mystery",
    desc: "刑警队长接手一桩离奇失踪案，随着调查深入，他发现这座城市隐藏着一个存在了百年的秘密组织。",
    tags: ["刑侦", "悬疑", "烧脑"], wordCount: "156万", chapters: 743, status: "ongoing",
    rating: 4.9, views: "2800万", lastUpdate: "2026-04-09",
    preview: [
      "档案室的灯忽明忽暗。",
      "李沉翻开那份尘封了二十年的卷宗，照片上的失踪者面带微笑，仿佛在看着他。",
      "「又是这个表情。」他喃喃自语。过去三个月，他经手的七起失踪案，受害者最后留下的照片里，都是同样诡异的微笑。",
    ],
  },
  {
    id: 6, title: "大唐风华录", author: "长安故人", genre: "history",
    desc: "开元盛世，一个落魄书生凭借超前的见识，在长安城中搅动风云，见证大唐最辉煌的时代。",
    tags: ["唐朝", "权谋", "历史"], wordCount: "210万", chapters: 1024, status: "ongoing",
    rating: 4.6, views: "1900万", lastUpdate: "2026-04-08",
    preview: [
      "长安，天下之中。",
      "春日的朱雀大街上人流如织，胡商、僧侣、文人、武将，各色人等汇聚于此。",
      "李墨站在城门下，看着这座他只在史书中读到过的城市，深吸了一口气。空气中混着胡饼的香气和马粪的味道——这就是真实的大唐。",
    ],
  },
  {
    id: 7, title: "剑来", author: "烽火戏诸侯", genre: "wuxia",
    desc: "少年陈平安出身贫寒小镇，一步步走出小镇，行走天下，以一把剑问道苍天。",
    tags: ["江湖", "成长", "经典"], wordCount: "580万", chapters: 2800, status: "completed",
    rating: 4.9, views: "1.2亿", lastUpdate: "2025-12-01",
    preview: [
      "小镇很小，小到只有一条街。",
      "陈平安蹲在泥瓶巷的墙根下，手里攥着几枚铜钱，盘算着今天的晚饭。",
      "他不知道的是，这座不起眼的小镇，即将迎来一场改变所有人命运的风暴。",
    ],
  },
  {
    id: 8, title: "全球游戏：开局百亿灵能", author: "氪金大佬", genre: "game",
    desc: "全球进入游戏时代，林凡开局获得百亿灵能点，当别人还在新手村挣扎时，他已经碾压全服。",
    tags: ["网游", "无敌", "爽文"], wordCount: "167万", chapters: 810, status: "ongoing",
    rating: 4.3, views: "2400万", lastUpdate: "2026-04-10",
    preview: [
      "【叮！全球游戏《神域》正式上线，所有人类将强制进入游戏世界】",
      "林凡看着眼前的全息面板，嘴角微微上扬。",
      "【恭喜您触发SSS级隐藏天赋——无限灵能】\n【初始灵能点：10,000,000,000】",
      "别人的初始灵能是10点。他的是一百亿。",
    ],
  },
  {
    id: 9, title: "午夜凶铃", author: "暗夜行者", genre: "horror",
    desc: "每到午夜十二点，手机都会收到一条来自未知号码的短信。看过短信的人，都会在七天后离奇死亡。",
    tags: ["灵异", "恐怖", "都市"], wordCount: "89万", chapters: 420, status: "completed",
    rating: 4.4, views: "1500万", lastUpdate: "2026-01-30",
    preview: [
      "00:00。",
      "手机屏幕亮了。张伟迷迷糊糊地拿起手机，看到一条新短信。",
      "发件人：未知号码\n内容只有一行字：「你还有七天。」",
      "他以为是垃圾短信，翻了个身继续睡。他不知道，从这一刻起，倒计时已经开始了。",
    ],
  },
];

/* ========== 主组件 ========== */
export default function NovelsPage() {
  const [genre, setGenre] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [reading, setReading] = useState<Novel | null>(null);
  const [searchText, setSearchText] = useState("");

  const filtered = novels.filter(n => {
    if (genre !== "all" && n.genre !== genre) return false;
    if (statusF !== "all" && n.status !== statusF) return false;
    if (searchText && !n.title.includes(searchText) && !n.author.includes(searchText) && !n.tags.some(t => t.includes(searchText))) return false;
    return true;
  });

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-4 pb-20 md:pb-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">
            <i className="fas fa-book-open mr-2 text-[#f0b90b]" />小说
          </h1>
          <span className="text-[11px] text-[#8a8a8a]">{novels.length} 部作品</span>
        </div>
        <p className="text-[#8a8a8a] text-xs mb-4">海量小说免费阅读，玄幻、都市、言情、悬疑应有尽有。</p>

        {/* 分类 */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-2 -mx-4 px-4">
          {genres.map(g => (
            <button key={g.id} onClick={() => setGenre(g.id)} className={clsx(
              "px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap border transition shrink-0",
              genre === g.id
                ? "bg-[#f0b90b] text-[#0f0f0f] border-[#f0b90b] font-semibold"
                : "bg-transparent text-[#aaa] border-[#333]/50 hover:bg-[#212121] hover:text-white"
            )}>{g.label}</button>
          ))}
        </div>

        {/* 状态 + 搜索 */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex-1 relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-xs" />
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="搜索书名、作者、标签..."
              className="w-full h-9 pl-9 pr-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#f0b90b] transition" />
          </div>
          <div className="flex gap-1.5">
            {statusFilters.map(s => (
              <button key={s.id} onClick={() => setStatusF(s.id)} className={clsx(
                "px-3 py-1.5 rounded-lg text-xs border transition",
                statusF === s.id
                  ? "bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30 font-semibold"
                  : "bg-transparent text-[#8a8a8a] border-[#333]/50 hover:text-white"
              )}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* 小说列表 */}
        <div className="space-y-3">
          {filtered.map(n => (
            <div key={n.id} onClick={() => setReading(n)}
              className="flex gap-4 p-4 rounded-xl bg-[#1a1a1a]/50 border border-[#333]/50 hover:border-[#f0b90b]/30 transition cursor-pointer active:scale-[0.995] group">
              {/* 封面 */}
              <div className="w-20 h-28 sm:w-24 sm:h-32 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-[#333] flex items-center justify-center shrink-0 overflow-hidden">
                <div className="text-center px-2">
                  <i className="fas fa-book text-[#f0b90b]/30 text-2xl mb-1" />
                  <p className="text-[10px] text-[#aaa] font-bold line-clamp-2 leading-tight">{n.title}</p>
                </div>
              </div>
              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm group-hover:text-[#f0b90b] transition truncate">{n.title}</h3>
                  <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",
                    n.status === "completed" ? "bg-[#2ba640]/15 text-[#2ba640]" : "bg-[#3ea6ff]/15 text-[#3ea6ff]"
                  )}>{n.status === "completed" ? "完结" : "连载"}</span>
                </div>
                <p className="text-[11px] text-[#8a8a8a] mb-1.5">{n.author} · {n.wordCount}字 · {n.chapters}章</p>
                <p className="text-[12px] text-[#8a8a8a] line-clamp-2 mb-2">{n.desc}</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {n.tags.map((t, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0b90b]/10 text-[#f0b90b] border border-[#f0b90b]/20">{t}</span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#666]">
                  <span className="text-[#f0b90b]"><i className="fas fa-star text-[9px] mr-0.5" />{n.rating.toFixed(1)}</span>
                  <span><i className="fas fa-eye mr-1" />{n.views}</span>
                  <span><i className="fas fa-clock mr-1" />{n.lastUpdate}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <i className="fas fa-book text-4xl mb-4 opacity-20" />
            <p className="text-sm">没有找到相关小说</p>
          </div>
        )}
      </main>

      {/* 阅读弹窗 */}
      {reading && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setReading(null)}>
          <div className="w-full max-w-2xl bg-[#141414] border border-[#333] rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div className="sticky top-0 z-10 bg-[#141414]/95 backdrop-blur-xl border-b border-[#333]/50 px-5 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="font-bold text-base truncate">{reading.title}</h2>
                <p className="text-[11px] text-[#8a8a8a]">{reading.author} · {genres.find(g => g.id === reading.genre)?.label}</p>
              </div>
              <button onClick={() => setReading(null)} className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white transition shrink-0 ml-3">
                <i className="fas fa-times" />
              </button>
            </div>

            {/* 书籍信息 */}
            <div className="px-5 py-4 border-b border-[#333]/30">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {reading.tags.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0b90b]/10 text-[#f0b90b] border border-[#f0b90b]/20">{t}</span>
                ))}
                <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-bold",
                  reading.status === "completed" ? "bg-[#2ba640]/15 text-[#2ba640]" : "bg-[#3ea6ff]/15 text-[#3ea6ff]"
                )}>{reading.status === "completed" ? "已完结" : "连载中"}</span>
              </div>
              <p className="text-sm text-[#aaa] mb-3">{reading.desc}</p>
              <div className="flex items-center gap-4 text-[11px] text-[#666]">
                <span className="text-[#f0b90b]"><i className="fas fa-star mr-0.5" />{reading.rating.toFixed(1)}</span>
                <span>{reading.wordCount}字</span>
                <span>{reading.chapters}章</span>
                <span><i className="fas fa-eye mr-1" />{reading.views}</span>
              </div>
            </div>

            {/* 试读内容 */}
            <div className="px-5 py-5">
              <h3 className="text-xs font-semibold text-[#f0b90b] mb-4"><i className="fas fa-book-open mr-1.5" />第一章 · 试读</h3>
              <div className="space-y-4 text-[15px] leading-[1.9] text-[#ccc] font-[serif]">
                {reading.preview.map((p, i) => (
                  <p key={i} className="indent-8">{p}</p>
                ))}
              </div>
              <div className="mt-6 text-center text-[#666] text-sm py-4 border-t border-[#333]/30">
                <i className="fas fa-lock mr-1.5" />试读结束，加入书架继续阅读
              </div>
            </div>

            {/* 底部操作 */}
            <div className="sticky bottom-0 bg-[#141414]/95 backdrop-blur-xl border-t border-[#333]/50 px-5 py-3 flex gap-2">
              <button className="flex-1 py-2.5 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm hover:bg-[#f0b90b]/80 transition active:scale-95">
                <i className="fas fa-book-bookmark mr-1.5" />加入书架
              </button>
              <button className="flex-1 py-2.5 rounded-xl bg-[#212121] border border-[#333] text-[#ccc] font-semibold text-sm hover:bg-[#2a2a2a] transition active:scale-95">
                <i className="fas fa-play mr-1.5" />开始阅读
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
