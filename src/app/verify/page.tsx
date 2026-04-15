"use client";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { fetchWithAuth } from "@/lib/auth";
import clsx from "clsx";

/* ========== 通用类型 ========== */
type VerifyStatus = "unverified" | "verified";
interface Tag { label: string; color: string; }
const TC = [
  "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/30",
  "bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30",
  "bg-[#2ba640]/15 text-[#2ba640] border-[#2ba640]/30",
  "bg-[#ff4444]/15 text-[#ff4444] border-[#ff4444]/30",
  "bg-[#a855f7]/15 text-[#a855f7] border-[#a855f7]/30",
  "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30",
  "bg-[#f97316]/15 text-[#f97316] border-[#f97316]/30",
];

/* ========== 大分类 + 子分类 ========== */
interface SubCat { id: string; label: string; }
interface Category { id: string; label: string; icon: string; subs: SubCat[]; }

const categories: Category[] = [
  { id: "person", label: "人员", icon: "fa-user", subs: [
    { id: "all", label: "全部" }, { id: "freelance", label: "在野" }, { id: "parttime", label: "兼职" },
    { id: "contractor", label: "包工头" }, { id: "team", label: "团队" }, { id: "agency", label: "机构" },
    { id: "expert", label: "专家" }, { id: "intern", label: "实习" }, { id: "remote", label: "远程" },
  ]},
  { id: "company", label: "公司", icon: "fa-building", subs: [
    { id: "all", label: "全部" }, { id: "large", label: "大型" }, { id: "medium", label: "中型" },
    { id: "small", label: "小型" }, { id: "micro", label: "微型" },
  ]},
  { id: "restaurant", label: "饭店", icon: "fa-utensils", subs: [
    { id: "all", label: "全部" }, { id: "chinese", label: "中餐" }, { id: "western", label: "西餐" },
    { id: "japanese", label: "日韩料理" }, { id: "hotpot", label: "火锅" }, { id: "fastfood", label: "快餐" }, { id: "cafe", label: "咖啡茶饮" },
  ]},
  { id: "hotel", label: "酒店", icon: "fa-hotel", subs: [
    { id: "all", label: "全部" }, { id: "5star", label: "五星级" }, { id: "4star", label: "四星级" },
    { id: "3star", label: "三星级" }, { id: "budget", label: "经济型" }, { id: "bnb", label: "民宿" },
  ]},
  { id: "shop", label: "商铺", icon: "fa-store", subs: [
    { id: "all", label: "全部" }, { id: "digital", label: "数码" }, { id: "clothing", label: "服饰" },
    { id: "food", label: "食品" }, { id: "general", label: "综合" },
  ]},
  { id: "school", label: "学校", icon: "fa-graduation-cap", subs: [
    { id: "all", label: "全部" }, { id: "vocational", label: "职业培训" }, { id: "hobby", label: "兴趣班" },
    { id: "k12", label: "K12" }, { id: "higher", label: "高等院校" },
  ]},
  { id: "hospital", label: "医院", icon: "fa-hospital", subs: [
    { id: "all", label: "全部" }, { id: "3a", label: "三甲" }, { id: "3b", label: "三乙" },
    { id: "2a", label: "二甲" }, { id: "clinic", label: "专科诊所" },
  ]},
];

/* ========== 验证记录系统 ========== */
interface VerifyRecord {
  id: number;
  verifier: string;       // 验证人
  time: string;           // 验证时间
  field: string;          // 修改的字段
  oldValue: string;       // 原始值
  newValue: string;       // 验证后的值
  reason: string;         // 修改原因
  likes: number;          // 点赞数
  dislikes: number;       // 踩数
}

// 根据验证记录投票决定最终值（供后续筛选使用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resolveFieldValue(records: VerifyRecord[], field: string, selfReported: string): string {
  const fieldRecords = records.filter(r => r.field === field);
  if (fieldRecords.length === 0) return selfReported;
  if (fieldRecords.length === 1) return fieldRecords[0].newValue;
  // 统计每个值的出现次数
  const valueCounts: Record<string, { count: number; totalLikes: number }> = {};
  fieldRecords.forEach(r => {
    if (!valueCounts[r.newValue]) valueCounts[r.newValue] = { count: 0, totalLikes: 0 };
    valueCounts[r.newValue].count++;
    valueCounts[r.newValue].totalLikes += r.likes;
  });
  const entries = Object.entries(valueCounts);
  if (entries.length === 1) return entries[0][0]; // 所有人一致
  // 2个不同值：用点赞多的
  // 3个以上：少数服从多数
  entries.sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count; // 多数优先
    return b[1].totalLikes - a[1].totalLikes; // 同数量看点赞
  });
  return entries[0][0];
}

/* ========== 数据类型 ========== */
interface PersonSkill { name: string; level?: "入门" | "熟练" | "精通" | "专家"; }
interface PersonItem {
  id: number; type: "person"; subType: string; name: string; avatar?: string;
  // 自报信息（可能不真实）
  gender?: string; age?: number; height?: number; weight?: number; location?: string;
  face?: Record<string, string | undefined>; body?: Record<string, string | undefined>;
  skills: PersonSkill[]; tags: Tag[]; advantages?: string; bio?: string;
  // 验证后的实际信息（以此为准）
  verifiedAge?: number;
  verifiedHeight?: number;
  verifiedWeight?: number;
  verifiedGender?: string;
  verifiedLocation?: string;
  verifiedFace?: Record<string, string | undefined>;
  verifiedBody?: Record<string, string | undefined>;
  verifiedNote?: string;
  // 验证记录
  verifyRecords?: VerifyRecord[];
  status: VerifyStatus; publishTime: string; verifiedBy?: string; verifiedTime?: string;
}
interface CompanyItem {
  id: number; type: "company"; subType: string; name: string; logo?: string;
  industry?: string; scale?: string; location?: string;
  legalPerson?: string; regCapital?: string; foundDate?: string; businessScope?: string; tags: Tag[];
  // 验证后实际信息
  verifiedScale?: string; verifiedLocation?: string; verifiedRegCapital?: string;
  verifiedLegalPerson?: string; verifiedBusinessScope?: string; verifiedNote?: string;
  status: VerifyStatus; publishTime: string; verifiedBy?: string; verifiedTime?: string;
}
interface RestaurantItem {
  id: number; type: "restaurant"; subType: string; name: string; cover?: string;
  cuisine?: string; location?: string; priceRange?: string;
  rating?: number; hygiene?: string; license?: string; specialties?: string[]; tags: Tag[];
  // 验证后实际信息
  verifiedCuisine?: string; verifiedLocation?: string; verifiedPriceRange?: string;
  verifiedHygiene?: string; verifiedRating?: number; verifiedNote?: string;
  status: VerifyStatus; publishTime: string; verifiedBy?: string; verifiedTime?: string;
}
interface HotelItem {
  id: number; type: "hotel"; subType: string; name: string; cover?: string;
  starLevel?: string; location?: string; priceRange?: string;
  rating?: number; roomTypes?: string; facilities?: string[]; tags: Tag[];
  // 验证后实际信息
  verifiedStarLevel?: string; verifiedLocation?: string; verifiedPriceRange?: string;
  verifiedRating?: number; verifiedFacilities?: string[]; verifiedNote?: string;
  status: VerifyStatus; publishTime: string; verifiedBy?: string; verifiedTime?: string;
}
interface ShopItem {
  id: number; type: "shop"; subType: string; name: string; cover?: string;
  category?: string; location?: string; owner?: string; mainProducts?: string; tags: Tag[];
  // 验证后实际信息
  verifiedLocation?: string; verifiedOwner?: string; verifiedMainProducts?: string; verifiedNote?: string;
  status: VerifyStatus; publishTime: string; verifiedBy?: string; verifiedTime?: string;
}
interface SchoolItem {
  id: number; type: "school"; subType: string; name: string; cover?: string;
  level?: string; location?: string; studentCount?: string; features?: string; tags: Tag[];
  // 验证后实际信息
  verifiedLevel?: string; verifiedLocation?: string; verifiedStudentCount?: string; verifiedNote?: string;
  status: VerifyStatus; publishTime: string; verifiedBy?: string; verifiedTime?: string;
}
interface HospitalItem {
  id: number; type: "hospital"; subType: string; name: string; cover?: string;
  grade?: string; location?: string; departments?: string[]; features?: string; tags: Tag[];
  // 验证后实际信息
  verifiedGrade?: string; verifiedLocation?: string; verifiedDepartments?: string[]; verifiedNote?: string;
  status: VerifyStatus; publishTime: string; verifiedBy?: string; verifiedTime?: string;
}
type VerifyItem = PersonItem | CompanyItem | RestaurantItem | HotelItem | ShopItem | SchoolItem | HospitalItem;

const skillLevelColors: Record<string, string> = { "入门": "text-[#8a8a8a]", "熟练": "text-[#3ea6ff]", "精通": "text-[#f0b90b]", "专家": "text-[#ff4444]" };

/* ========== API → 前端类型映射 ========== */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiItemToVerifyItem(raw: any): VerifyItem {
  const info = typeof raw.info === "object" && raw.info ? raw.info : {};
  const resolved = typeof raw.resolved_fields === "object" && raw.resolved_fields ? raw.resolved_fields : {};
  const rawTags: Tag[] = Array.isArray(raw.tags)
    ? raw.tags.map((t: unknown, i: number) => {
        if (typeof t === "object" && t !== null && "label" in t) return t as Tag;
        if (typeof t === "string") return { label: t, color: TC[i % TC.length] };
        return { label: String(t), color: TC[i % TC.length] };
      })
    : [];
  const base = {
    id: raw.id, type: raw.type, subType: raw.sub_type || "all", name: raw.name,
    status: raw.status as VerifyStatus, tags: rawTags,
    publishTime: raw.created_at || "",
    verifiedBy: info.verifiedBy || resolved.verifiedBy,
    verifiedTime: info.verifiedTime || resolved.verifiedTime,
  };
  switch (raw.type) {
    case "person": return { ...base, gender: info.gender, age: info.age, height: info.height, weight: info.weight, location: info.location, avatar: info.avatar, face: info.face, body: info.body, skills: Array.isArray(info.skills) ? info.skills : [], advantages: info.advantages, bio: info.bio, verifiedAge: resolved.age != null ? Number(resolved.age) : info.verifiedAge, verifiedHeight: resolved.height != null ? Number(resolved.height) : info.verifiedHeight, verifiedWeight: resolved.weight != null ? Number(resolved.weight) : info.verifiedWeight, verifiedGender: resolved.gender || info.verifiedGender, verifiedLocation: resolved.location || info.verifiedLocation, verifiedFace: resolved.face || info.verifiedFace, verifiedBody: resolved.body || info.verifiedBody, verifiedNote: resolved.verifiedNote || info.verifiedNote, verifyRecords: info.verifyRecords } as PersonItem;
    case "company": return { ...base, location: info.location, logo: info.logo, industry: info.industry, scale: info.scale, legalPerson: info.legalPerson, regCapital: info.regCapital, foundDate: info.foundDate, businessScope: info.businessScope, verifiedScale: resolved.scale || info.verifiedScale, verifiedLocation: resolved.location || info.verifiedLocation, verifiedRegCapital: resolved.regCapital || info.verifiedRegCapital, verifiedLegalPerson: resolved.legalPerson || info.verifiedLegalPerson, verifiedBusinessScope: resolved.businessScope || info.verifiedBusinessScope, verifiedNote: resolved.verifiedNote || info.verifiedNote } as CompanyItem;
    case "restaurant": return { ...base, location: info.location, cover: info.cover, cuisine: info.cuisine, priceRange: info.priceRange, rating: info.rating, hygiene: info.hygiene, license: info.license, specialties: info.specialties, verifiedCuisine: resolved.cuisine || info.verifiedCuisine, verifiedLocation: resolved.location || info.verifiedLocation, verifiedPriceRange: resolved.priceRange || info.verifiedPriceRange, verifiedHygiene: resolved.hygiene || info.verifiedHygiene, verifiedRating: resolved.rating != null ? Number(resolved.rating) : info.verifiedRating, verifiedNote: resolved.verifiedNote || info.verifiedNote } as RestaurantItem;
    case "hotel": return { ...base, location: info.location, cover: info.cover, starLevel: info.starLevel, priceRange: info.priceRange, rating: info.rating, roomTypes: info.roomTypes, facilities: info.facilities, verifiedStarLevel: resolved.starLevel || info.verifiedStarLevel, verifiedLocation: resolved.location || info.verifiedLocation, verifiedPriceRange: resolved.priceRange || info.verifiedPriceRange, verifiedRating: resolved.rating != null ? Number(resolved.rating) : info.verifiedRating, verifiedFacilities: resolved.facilities || info.verifiedFacilities, verifiedNote: resolved.verifiedNote || info.verifiedNote } as HotelItem;
    case "shop": return { ...base, location: info.location, cover: info.cover, category: info.category, owner: info.owner, mainProducts: info.mainProducts, verifiedLocation: resolved.location || info.verifiedLocation, verifiedOwner: resolved.owner || info.verifiedOwner, verifiedMainProducts: resolved.mainProducts || info.verifiedMainProducts, verifiedNote: resolved.verifiedNote || info.verifiedNote } as ShopItem;
    case "school": return { ...base, location: info.location, cover: info.cover, level: info.level, studentCount: info.studentCount, features: info.features, verifiedLevel: resolved.level || info.verifiedLevel, verifiedLocation: resolved.location || info.verifiedLocation, verifiedStudentCount: resolved.studentCount || info.verifiedStudentCount, verifiedNote: resolved.verifiedNote || info.verifiedNote } as SchoolItem;
    case "hospital": return { ...base, location: info.location, cover: info.cover, grade: info.grade, departments: info.departments, features: info.features, verifiedGrade: resolved.grade || info.verifiedGrade, verifiedLocation: resolved.location || info.verifiedLocation, verifiedDepartments: resolved.departments || info.verifiedDepartments, verifiedNote: resolved.verifiedNote || info.verifiedNote } as HospitalItem;
    default: return { ...base, skills: [], tags: rawTags } as unknown as VerifyItem;
  }
}



/* ========== 主组件 ========== */
export default function VerifyPage() {
  const [cat, setCat] = useState("person");
  const [subCat, setSubCat] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | VerifyStatus>("all");
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<VerifyItem | null>(null);
  const [genderFilter, setGenderFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  // API data state
  const [items, setItems] = useState<VerifyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch items from API when filters change
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("type", cat);
      if (subCat !== "all") params.set("sub_type", subCat);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchText) params.set("search", searchText);
      params.set("page", "1");
      params.set("pageSize", "50");
      const res = await fetchWithAuth(`/api/verify?${params.toString()}`);
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      const data = await res.json() as { items?: Record<string, unknown>[] };
      const mapped = (data.items || []).map(mapApiItemToVerifyItem);
      setItems(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [cat, subCat, statusFilter, searchText]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const currentCat = categories.find(c => c.id === cat)!;

  // 收集人员地区用于筛选
  const personLocations = cat === "person"
    ? Array.from(new Set((items as PersonItem[]).map(p => p.location).filter(Boolean) as string[]))
    : [];

  // Client-side filtering for person-specific filters (gender, age, location)
  const filtered = items.filter(item => {
    if (cat === "person") {
      const p = item as PersonItem;
      const actualGender = p.status === "verified" && p.verifiedGender ? p.verifiedGender : p.gender;
      const actualAge = p.status === "verified" && p.verifiedAge ? p.verifiedAge : p.age;
      const actualLocation = p.status === "verified" && p.verifiedLocation ? p.verifiedLocation : p.location;
      if (genderFilter !== "all" && actualGender !== genderFilter) return false;
      if (ageFilter !== "all") {
        if (!actualAge) return false;
        if (ageFilter === "18-25" && (actualAge < 18 || actualAge > 25)) return false;
        if (ageFilter === "26-35" && (actualAge < 26 || actualAge > 35)) return false;
        if (ageFilter === "36-45" && (actualAge < 36 || actualAge > 45)) return false;
        if (ageFilter === "45+" && actualAge < 45) return false;
      }
      if (locationFilter !== "all" && actualLocation !== locationFilter) return false;
    }
    return true;
  });

  const totalUnverified = items.filter(i => i.status === "unverified").length;
  const totalVerified = items.filter(i => i.status === "verified").length;

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-4 pb-20 md:pb-8">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">
            信息验证
          </h1>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-[#f0b90b]/10 border border-[#f0b90b]/20 text-[#f0b90b] font-semibold">
              {totalUnverified} 待验证
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#2ba640]/10 border border-[#2ba640]/20 text-[#2ba640] font-semibold">
              {totalVerified} 已验证
            </span>
          </div>
        </div>
        <p className="text-[#8a8a8a] text-xs mb-4">每天更新海量信息，社区共同验证真实性。</p>

        {/* 大分类 tab */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2 -mx-4 px-4">
          {categories.map(c => (
            <button key={c.id} onClick={() => { setCat(c.id); setSubCat("all"); setStatusFilter("all"); setSearchText(""); setSelected(null); setGenderFilter("all"); setAgeFilter("all"); setLocationFilter("all"); }} className={clsx(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] whitespace-nowrap border transition shrink-0",
              cat === c.id
                ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold shadow-lg shadow-[#3ea6ff]/20"
                : "bg-[#1a1a1a] text-[#aaa] border-[#333]/50 hover:bg-[#212121] hover:text-white"
            )}>
              <i className={`fas ${c.icon} text-[11px]`} />{c.label}
            </button>
          ))}
        </div>

        {/* 子分类 */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-4 px-4">
          {currentCat.subs.map(s => (
            <button key={s.id} onClick={() => setSubCat(s.id)} className={clsx(
              "px-3 py-1 rounded-full text-[12px] whitespace-nowrap border transition shrink-0",
              subCat === s.id
                ? "bg-[#a855f7]/15 text-[#a855f7] border-[#a855f7]/30 font-semibold"
                : "bg-transparent text-[#8a8a8a] border-[#333]/40 hover:text-white hover:border-[#555]"
            )}>{s.label}</button>
          ))}
        </div>

        {/* 搜索 + 状态筛选 */}

        {/* 人员专属筛选：性别 / 年龄 / 地区 */}
        {cat === "person" && (
          <div className="flex gap-4 mb-4 overflow-x-auto pb-1 -mx-4 px-4 text-[12px]">
            {/* 性别 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[#666]">性别</span>
              {["all", "男", "女"].map(g => (
                <button key={g} onClick={() => setGenderFilter(g)} className={clsx(
                  "px-2.5 py-0.5 rounded-md border transition",
                  genderFilter === g
                    ? "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30 font-semibold"
                    : "text-[#8a8a8a] border-[#333]/40 hover:text-white"
                )}>{g === "all" ? "不限" : g}</button>
              ))}
            </div>
            {/* 年龄 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[#666]">年龄</span>
              {["all", "18-25", "26-35", "36-45", "45+"].map(a => (
                <button key={a} onClick={() => setAgeFilter(a)} className={clsx(
                  "px-2.5 py-0.5 rounded-md border transition",
                  ageFilter === a
                    ? "bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30 font-semibold"
                    : "text-[#8a8a8a] border-[#333]/40 hover:text-white"
                )}>{a === "all" ? "不限" : a}</button>
              ))}
            </div>
            {/* 地区 */}
            {personLocations.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[#666]">地区</span>
                <button onClick={() => setLocationFilter("all")} className={clsx(
                  "px-2.5 py-0.5 rounded-md border transition",
                  locationFilter === "all"
                    ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/30 font-semibold"
                    : "text-[#8a8a8a] border-[#333]/40 hover:text-white"
                )}>不限</button>
                {personLocations.map(loc => (
                  <button key={loc} onClick={() => setLocationFilter(loc)} className={clsx(
                    "px-2.5 py-0.5 rounded-md border transition whitespace-nowrap",
                    locationFilter === loc
                      ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/30 font-semibold"
                      : "text-[#8a8a8a] border-[#333]/40 hover:text-white"
                  )}>{loc}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex-1 relative">
            
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder={`搜索${currentCat.label}名称、标签、地区...`}
              className="w-full h-9 pl-9 pr-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition" />
          </div>
          <div className="flex gap-1.5">
            {(["all", "unverified", "verified"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={clsx(
                "px-3 py-1.5 rounded-lg text-xs border transition",
                statusFilter === s
                  ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/30 font-semibold"
                  : "bg-transparent text-[#8a8a8a] border-[#333]/50 hover:text-white"
              )}>{s === "all" ? "全部" : s === "unverified" ? "未验证" : "已验证"}</button>
            ))}
          </div>
        </div>

        {/* 卡片列表 */}
        {loading && (
          <div className="text-center text-[#8a8a8a] py-20">
            
            <p className="text-sm">加载中...</p>
          </div>
        )}
        {error && !loading && (
          <div className="text-center text-[#ff4444] py-20">
            
            <p className="text-sm mb-3">{error}</p>
            <button onClick={fetchItems} className="px-4 py-1.5 rounded-lg bg-[#3ea6ff]/15 text-[#3ea6ff] text-xs border border-[#3ea6ff]/30 hover:bg-[#3ea6ff]/25 transition">
              重试
            </button>
          </div>
        )}
        {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(item => <ItemCard key={item.id} item={item} onClick={() => setSelected(item)} />)}
        </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <i className={`fas ${currentCat.icon} text-4xl mb-4 opacity-20`} />
            <p className="text-sm">暂无{currentCat.label}数据</p>
          </div>
        )}
      </main>

      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

/* ========== 通用组件 ========== */
function StatusBadge({ status }: { status: VerifyStatus }) {
  return (
    <span className={clsx(
      "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
      status === "verified" ? "bg-[#2ba640]/15 text-[#2ba640] border-[#2ba640]/30" : "bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30"
    )}>
      <i className={`fas ${status === "verified" ? "fa-circle-check" : "fa-clock"} mr-0.5`} />
      {status === "verified" ? "已验证" : "未验证"}
    </span>
  );
}

function SubTypeBadge({ item }: { item: VerifyItem }) {
  const cat = categories.find(c => c.id === item.type);
  const sub = cat?.subs.find(s => s.id === item.subType);
  if (!sub || sub.id === "all") return null;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/20">{sub.label}</span>;
}

function ItemCard({ item, onClick }: { item: VerifyItem; onClick: () => void }) {
  const icon = categories.find(c => c.id === item.type)?.icon || "fa-circle";
  const getSubInfo = (): string[] => {
    const info: string[] = [];
    if (item.type === "person") {
      const p = item as PersonItem;
      const g = p.status === "verified" && p.verifiedGender ? p.verifiedGender : p.gender;
      const a = p.status === "verified" && p.verifiedAge ? p.verifiedAge : p.age;
      if (g) info.push(g);
      if (a) info.push(a + "岁");
    }
    if ("location" in item && item.location) {
      if (item.type === "person") {
        const p = item as PersonItem;
        info.push(p.status === "verified" && p.verifiedLocation ? p.verifiedLocation : p.location || "");
      } else {
        // 所有类型都优先用验证后的 location
        const vLoc = item.status === "verified" && "verifiedLocation" in item ? (item as { verifiedLocation?: string }).verifiedLocation : undefined;
        info.push(vLoc || item.location);
      }
    }
    if (item.type === "company") {
      const c = item as CompanyItem;
      if (c.industry) info.push(c.industry);
      const scale = c.status === "verified" && c.verifiedScale ? c.verifiedScale : c.scale;
      if (scale) info.push(scale);
    }
    if (item.type === "restaurant") {
      const r = item as RestaurantItem;
      const cuisine = r.status === "verified" && r.verifiedCuisine ? r.verifiedCuisine : r.cuisine;
      const price = r.status === "verified" && r.verifiedPriceRange ? r.verifiedPriceRange : r.priceRange;
      if (cuisine) info.push(cuisine);
      if (price) info.push(price);
    }
    if (item.type === "hotel") {
      const h = item as HotelItem;
      const star = h.status === "verified" && h.verifiedStarLevel ? h.verifiedStarLevel : h.starLevel;
      const price = h.status === "verified" && h.verifiedPriceRange ? h.verifiedPriceRange : h.priceRange;
      if (star) info.push(star);
      if (price) info.push(price);
    }
    if (item.type === "shop") { const s = item as ShopItem; if (s.category) info.push(s.category); }
    if (item.type === "school") {
      const s = item as SchoolItem;
      const lv = s.status === "verified" && s.verifiedLevel ? s.verifiedLevel : s.level;
      if (lv) info.push(lv);
    }
    if (item.type === "hospital") {
      const h = item as HospitalItem;
      const gr = h.status === "verified" && h.verifiedGrade ? h.verifiedGrade : h.grade;
      if (gr) info.push(gr);
    }
    return info;
  };
  const getDesc = (): string => {
    if (item.type === "person") return (item as PersonItem).advantages || (item as PersonItem).bio || "";
    if (item.type === "company") return (item as CompanyItem).businessScope || "";
    if (item.type === "restaurant") return (item as RestaurantItem).specialties?.join("、") || "";
    if (item.type === "hotel") return (item as HotelItem).facilities?.join("、") || "";
    if (item.type === "shop") return (item as ShopItem).mainProducts || "";
    if (item.type === "school") return (item as SchoolItem).features || "";
    if (item.type === "hospital") return (item as HospitalItem).features || "";
    return "";
  };
  const getRating = (): number | undefined => {
    if (item.type === "restaurant") { const r = item as RestaurantItem; return r.status === "verified" && r.verifiedRating ? r.verifiedRating : r.rating; }
    if (item.type === "hotel") { const h = item as HotelItem; return h.status === "verified" && h.verifiedRating ? h.verifiedRating : h.rating; }
    return undefined;
  };
  const subInfo = getSubInfo();
  const desc = getDesc();
  const rating = getRating();

  return (
    <div onClick={onClick} className="p-4 rounded-xl bg-[#1a1a1a]/50 border border-[#333]/50 hover:border-[#3ea6ff]/30 transition cursor-pointer active:scale-[0.99] group">
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#3ea6ff]/15 to-[#a855f7]/15 border border-[#333] flex items-center justify-center shrink-0">
            <i className={`fas ${icon} text-[#aaa] text-sm`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm group-hover:text-[#3ea6ff] transition truncate">{item.name}</h3>
              <SubTypeBadge item={item} />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#8a8a8a] mt-0.5 flex-wrap">
              {subInfo.map((s, i) => <span key={i}>{i > 0 && "·"} {s}</span>)}
            </div>
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>
      {item.type === "person" && (item as PersonItem).skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(item as PersonItem).skills.slice(0, 3).map((s, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-[#212121] border border-[#333]/50 text-[#ccc]">
              {s.name}{s.level && <span className={`ml-1 ${skillLevelColors[s.level]}`}>·{s.level}</span>}
            </span>
          ))}
        </div>
      )}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {item.tags.slice(0, 3).map((t, i) => (
            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${t.color}`}>{t.label}</span>
          ))}
        </div>
      )}
      {desc && <p className="text-[12px] text-[#8a8a8a] line-clamp-2 mb-2">{desc}</p>}
      <div className="flex items-center justify-between text-[11px] text-[#666] pt-2 border-t border-[#333]/30">
        <div className="flex items-center gap-3">
          <span>{item.publishTime.split(" ")[0]}</span>
          {rating && <span className="text-[#f0b90b]">{rating.toFixed(1)}</span>}
        </div>
        <span className="text-[#3ea6ff]">详情 </span>
      </div>
    </div>
  );
}

/* ========== 详情弹窗 ========== */
function DetailModal({ item, onClose }: { item: VerifyItem; onClose: () => void }) {
  const icon = categories.find(c => c.id === item.type)?.icon || "fa-circle";
  const catLabel = categories.find(c => c.id === item.type)?.label || "";

  // Fetch verify records from API
  const [records, setRecords] = useState<VerifyRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/verify/${item.id}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { records?: Record<string, unknown>[] };
        if (cancelled) return;
        const recs = (data.records || []).map((r: Record<string, unknown>) => ({
          id: r.id,
          verifier: r.verifier_name || "匿名",
          time: r.created_at || "",
          field: r.field || "",
          oldValue: r.old_value || "",
          newValue: r.new_value || "",
          reason: r.reason || "",
          likes: r.likes || 0,
          dislikes: r.dislikes || 0,
        })) as VerifyRecord[];
        setRecords(recs);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [item.id]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#1a1a1a] border border-[#333] rounded-t-2xl md:rounded-2xl p-5 max-h-[90vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#3ea6ff]/15 to-[#a855f7]/15 border border-[#333] flex items-center justify-center shrink-0">
              <i className={`fas ${icon} text-[#aaa] text-lg`} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg truncate">{item.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-[#8a8a8a] px-1.5 py-0.5 rounded bg-[#212121]">{catLabel}</span>
                <SubTypeBadge item={item} />
                <StatusBadge status={item.status} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white transition shrink-0">
            
          </button>
        </div>

        {item.type === "person" && <PersonDetail data={item as PersonItem} />}
        {item.type === "company" && <CompanyDetail data={item as CompanyItem} />}
        {item.type === "restaurant" && <RestaurantDetail data={item as RestaurantItem} />}
        {item.type === "hotel" && <HotelDetail data={item as HotelItem} />}
        {item.type === "shop" && <ShopDetail data={item as ShopItem} />}
        {item.type === "school" && <SchoolDetail data={item as SchoolItem} />}
        {item.type === "hospital" && <HospitalDetail data={item as HospitalItem} />}

        {/* 验证记录 */}
        <VerifyRecordsPanel records={records.length > 0 ? records : (item.type === "person" ? (item as PersonItem).verifyRecords || [] : [])} />

        {item.tags.length > 0 && (
          <Section icon="fa-tags" iconColor="text-[#a855f7]" title="标签">
            <div className="flex flex-wrap gap-2">
              {item.tags.map((t, i) => <span key={i} className={`text-xs px-3 py-1 rounded-full border font-medium ${t.color}`}>{t.label}</span>)}
            </div>
          </Section>
        )}

        <div className="mb-4 p-3 rounded-xl bg-[#212121]/50 border border-[#333]/30 text-xs text-[#8a8a8a]">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span>发布：{item.publishTime}</span>
            {item.verifiedBy && <span>{item.verifiedBy}</span>}
          </div>
          {item.verifiedTime && <div className="mt-1">验证于：{item.verifiedTime}</div>}
          {item.type === "person" && (item as PersonItem).verifyRecords && (item as PersonItem).verifyRecords!.length > 0 && (
            <div className="mt-1">共 {records.length || (item as PersonItem).verifyRecords!.length} 条验证记录</div>
          )}
        </div>

        {/* 已验证也可以再次验证 */}
        <button onClick={() => { alert("提交验证修改（需要填写修改字段、新值和原因）。实际功能需要后端支持。"); }}
          className="w-full py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95 mb-2">
           {item.status === "verified" ? "再次验证/修正信息" : "提交验证"}
        </button>
        {item.status === "verified" && (
          <p className="text-[10px] text-[#666] text-center">已验证的信息也可以再次验证修正，多人验证结果以多数为准</p>
        )}
      </div>
    </div>
  );
}

/* ========== 详情子组件 ========== */
function Section({ icon, iconColor, title, children }: { icon: string; iconColor: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
        <i className={`fas ${icon} text-xs ${iconColor}`} /> {title}
      </h3>
      {children}
    </div>
  );
}

function InfoGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it, i) => (
        <div key={i} className="p-2 rounded-lg bg-[#212121]/80 border border-[#333]/30">
          <div className="text-[10px] text-[#666] mb-0.5">{it.label}</div>
          <div className="text-xs text-[#ccc]">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function VerifiedNoteBanner({ note }: { note: string }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-[#2ba640]/10 border border-[#2ba640]/20 text-sm text-[#2ba640]">
      验证说明：{note}
    </div>
  );
}

function DiffWarning() {
  return (
    <div className="mb-4 p-3 rounded-xl bg-[#ff4444]/10 border border-[#ff4444]/20 text-sm text-[#ff4444]">
      部分自报信息与实际不符，已标注差异
    </div>
  );
}

function WarnGrid({ items }: { items: { label: string; value: string; warn?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it, i) => (
        <div key={i} className={clsx("p-2 rounded-lg border", it.warn ? "bg-[#ff4444]/5 border-[#ff4444]/20" : "bg-[#212121]/80 border-[#333]/30")}>
          <div className="text-[10px] text-[#666] mb-0.5 flex items-center gap-1">
            {it.label}
            {it.warn && <span className="text-[#ff4444]">!</span>}
          </div>
          <div className={clsx("text-xs", it.warn ? "text-[#ff4444]" : "text-[#ccc]")}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function PersonDetail({ data }: { data: PersonItem }) {
  const isV = data.status === "verified";

  // 实际值（验证后优先）
  const actualAge = isV && data.verifiedAge ? data.verifiedAge : data.age;
  const actualHeight = isV && data.verifiedHeight ? data.verifiedHeight : data.height;
  const actualWeight = isV && data.verifiedWeight ? data.verifiedWeight : data.weight;
  const actualGender = isV && data.verifiedGender ? data.verifiedGender : data.gender;
  const actualLocation = isV && data.verifiedLocation ? data.verifiedLocation : data.location;

  // 是否有差异（谎报检测）
  const ageDiff = isV && data.verifiedAge && data.age && data.verifiedAge !== data.age;
  const heightDiff = isV && data.verifiedHeight && data.height && data.verifiedHeight !== data.height;
  const weightDiff = isV && data.verifiedWeight && data.weight && data.verifiedWeight !== data.weight;
  const genderDiff = isV && data.verifiedGender && data.gender && data.verifiedGender !== data.gender;

  const basicInfo: { label: string; value: string; warn?: boolean }[] = [];
  if (actualGender) basicInfo.push({ label: "性别", value: genderDiff ? `${actualGender}（自报：${data.gender}）` : actualGender, warn: !!genderDiff });
  if (actualAge) basicInfo.push({ label: "年龄", value: ageDiff ? `${actualAge}岁（自报：${data.age}岁）` : actualAge + "岁", warn: !!ageDiff });
  if (actualHeight) basicInfo.push({ label: "身高", value: heightDiff ? `${actualHeight}cm（自报：${data.height}cm）` : actualHeight + "cm", warn: !!heightDiff });
  if (actualWeight) basicInfo.push({ label: "体重", value: weightDiff ? `${actualWeight}kg（自报：${data.weight}kg）` : actualWeight + "kg", warn: !!weightDiff });
  if (actualLocation) basicInfo.push({ label: "所在地", value: actualLocation });

  const actualFace = isV && data.verifiedFace ? data.verifiedFace : data.face;
  const faceInfo: { label: string; value: string }[] = [];
  if (actualFace) {
    const fl: Record<string, string> = { eyes: "眼睛", nose: "鼻子", mouth: "嘴巴", ears: "耳朵", faceShape: "脸型", skinColor: "肤色", hairStyle: "发型", hairColor: "发色" };
    Object.entries(actualFace).forEach(([k, v]) => { if (v) faceInfo.push({ label: fl[k] || k, value: v }); });
  }

  const actualBody = isV && data.verifiedBody ? data.verifiedBody : data.body;
  const bodyInfo: { label: string; value: string }[] = [];
  if (actualBody) {
    const bl: Record<string, string> = { bodyType: "体型", hands: "手部", feet: "脚部", specialMarks: "特殊标记" };
    Object.entries(actualBody).forEach(([k, v]) => { if (v) bodyInfo.push({ label: bl[k] || k, value: v }); });
  }

  return (
    <>
      {/* 验证备注 */}
      {isV && data.verifiedNote && (
        <div className="mb-4 p-3 rounded-xl bg-[#2ba640]/10 border border-[#2ba640]/20 text-sm text-[#2ba640]">
          验证说明：{data.verifiedNote}
        </div>
      )}

      {/* 谎报提醒 */}
      {isV && (ageDiff || heightDiff || weightDiff || genderDiff) && (
        <div className="mb-4 p-3 rounded-xl bg-[#ff4444]/10 border border-[#ff4444]/20 text-sm text-[#ff4444]">
          部分自报信息与实际不符，已标注差异
        </div>
      )}

      {(data.bio || data.advantages) && (
        <div className="mb-4">
          {data.bio && <p className="text-sm text-[#ccc] mb-1">{data.bio}</p>}
          {data.advantages && (
            <div className="p-3 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa]">
              {data.advantages}
            </div>
          )}
        </div>
      )}

      {basicInfo.length > 0 && (
        <Section icon="fa-id-card" iconColor="text-[#3ea6ff]" title={isV ? "基本信息（已核实）" : "基本信息（自报）"}>
          <div className="grid grid-cols-2 gap-2">
            {basicInfo.map((it, i) => (
              <div key={i} className={clsx("p-2 rounded-lg border", it.warn ? "bg-[#ff4444]/5 border-[#ff4444]/20" : "bg-[#212121]/80 border-[#333]/30")}>
                <div className="text-[10px] text-[#666] mb-0.5 flex items-center gap-1">
                  {it.label}
                  {it.warn && <span className="text-[#ff4444]">!</span>}
                </div>
                <div className={clsx("text-xs", it.warn ? "text-[#ff4444]" : "text-[#ccc]")}>{it.value}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {faceInfo.length > 0 && (
        <Section icon="fa-face-smile" iconColor="text-[#ec4899]" title={isV && data.verifiedFace ? "外貌特征（已核实）" : "外貌特征（自报）"}>
          <InfoGrid items={faceInfo} />
        </Section>
      )}
      {bodyInfo.length > 0 && (
        <Section icon="fa-person" iconColor="text-[#f97316]" title={isV && data.verifiedBody ? "身体特征（已核实）" : "身体特征（自报）"}>
          <InfoGrid items={bodyInfo} />
        </Section>
      )}
      {data.skills.length > 0 && (
        <Section icon="fa-bolt" iconColor="text-[#f0b90b]" title="技能">
          <div className="space-y-2">
            {data.skills.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-[#212121] border border-[#333]/50">
                <span className="text-sm text-[#ccc]">{s.name}</span>
                {s.level && (
                  <span className={`text-xs font-semibold ${skillLevelColors[s.level]}`}>
                    {s.level}
                    <span className="ml-1.5 inline-flex gap-0.5">
                      {Array.from({ length: ["入门", "熟练", "精通", "专家"].indexOf(s.level) + 1 }).map((_, j) => (
                        <span key={j} className="w-1 h-1 rounded-full bg-[#3ea6ff] inline-block" />
                      ))}
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function CompanyDetail({ data }: { data: CompanyItem }) {
  const isV = data.status === "verified";
  const scaleDiff = isV && data.verifiedScale && data.scale && data.verifiedScale !== data.scale;
  const capDiff = isV && data.verifiedRegCapital && data.regCapital && data.verifiedRegCapital !== data.regCapital;
  const locDiff = isV && data.verifiedLocation && data.location && data.verifiedLocation !== data.location;

  const info: { label: string; value: string; warn?: boolean }[] = [];
  if (data.industry) info.push({ label: "行业", value: data.industry });
  const scale = isV && data.verifiedScale ? data.verifiedScale : data.scale;
  if (scale) info.push({ label: "规模", value: scaleDiff ? `${data.verifiedScale}（自报：${data.scale}）` : scale, warn: !!scaleDiff });
  const loc = isV && data.verifiedLocation ? data.verifiedLocation : data.location;
  if (loc) info.push({ label: "地址", value: locDiff ? `${data.verifiedLocation}（自报：${data.location}）` : loc, warn: !!locDiff });
  const lp = isV && data.verifiedLegalPerson ? data.verifiedLegalPerson : data.legalPerson;
  if (lp) info.push({ label: "法人", value: lp });
  const cap = isV && data.verifiedRegCapital ? data.verifiedRegCapital : data.regCapital;
  if (cap) info.push({ label: "注册资本", value: capDiff ? `${data.verifiedRegCapital}（自报：${data.regCapital}）` : cap, warn: !!capDiff });
  if (data.foundDate) info.push({ label: "成立日期", value: data.foundDate });

  const hasDiff = scaleDiff || capDiff || locDiff;
  const scope = isV && data.verifiedBusinessScope ? data.verifiedBusinessScope : data.businessScope;
  return (
    <>
      {isV && data.verifiedNote && <VerifiedNoteBanner note={data.verifiedNote} />}
      {isV && hasDiff && <DiffWarning />}
      <Section icon="fa-building" iconColor="text-[#3ea6ff]" title={isV ? "企业信息（已核实）" : "企业信息（自报）"}>
        <WarnGrid items={info} />
      </Section>
      {scope && (
        <Section icon="fa-briefcase" iconColor="text-[#f0b90b]" title="经营范围">
          <p className="text-sm text-[#aaa] p-3 rounded-xl bg-[#212121] border border-[#333]">{scope}</p>
        </Section>
      )}
    </>
  );
}

function RestaurantDetail({ data }: { data: RestaurantItem }) {
  const isV = data.status === "verified";
  const priceDiff = isV && data.verifiedPriceRange && data.priceRange && data.verifiedPriceRange !== data.priceRange;
  const hygieneDiff = isV && data.verifiedHygiene && data.hygiene && data.verifiedHygiene !== data.hygiene;
  const ratingDiff = isV && data.verifiedRating != null && data.rating != null && data.verifiedRating !== data.rating;

  const info: { label: string; value: string; warn?: boolean }[] = [];
  const cuisine = isV && data.verifiedCuisine ? data.verifiedCuisine : data.cuisine;
  if (cuisine) info.push({ label: "菜系", value: cuisine });
  const loc = isV && data.verifiedLocation ? data.verifiedLocation : data.location;
  if (loc) info.push({ label: "地址", value: loc });
  const price = isV && data.verifiedPriceRange ? data.verifiedPriceRange : data.priceRange;
  if (price) info.push({ label: "价位", value: priceDiff ? `${data.verifiedPriceRange}（自报：${data.priceRange}）` : price, warn: !!priceDiff });
  const rating = isV && data.verifiedRating != null ? data.verifiedRating : data.rating;
  if (rating != null) info.push({ label: "评分", value: ratingDiff ? `${data.verifiedRating!.toFixed(1)} ⭐（自报：${data.rating!.toFixed(1)}）` : rating.toFixed(1) + " ⭐", warn: !!ratingDiff });
  const hyg = isV && data.verifiedHygiene ? data.verifiedHygiene : data.hygiene;
  if (hyg) info.push({ label: "卫生等级", value: hygieneDiff ? `${data.verifiedHygiene}（自报：${data.hygiene}）` : hyg, warn: !!hygieneDiff });
  if (data.license) info.push({ label: "营业执照", value: data.license });

  const hasDiff = priceDiff || hygieneDiff || ratingDiff;
  return (
    <>
      {isV && data.verifiedNote && <VerifiedNoteBanner note={data.verifiedNote} />}
      {isV && hasDiff && <DiffWarning />}
      <Section icon="fa-utensils" iconColor="text-[#f97316]" title={isV ? "餐厅信息（已核实）" : "餐厅信息（自报）"}>
        <WarnGrid items={info} />
      </Section>
      {data.specialties && data.specialties.length > 0 && (
        <Section icon="fa-fire" iconColor="text-[#ff4444]" title="招牌菜">
          <div className="flex flex-wrap gap-2">
            {data.specialties.map((s, i) => <span key={i} className="text-xs px-3 py-1 rounded-full bg-[#212121] border border-[#333] text-[#ccc]">{s}</span>)}
          </div>
        </Section>
      )}
    </>
  );
}

function HotelDetail({ data }: { data: HotelItem }) {
  const isV = data.status === "verified";
  const starDiff = isV && data.verifiedStarLevel && data.starLevel && data.verifiedStarLevel !== data.starLevel;
  const priceDiff = isV && data.verifiedPriceRange && data.priceRange && data.verifiedPriceRange !== data.priceRange;
  const ratingDiff = isV && data.verifiedRating != null && data.rating != null && data.verifiedRating !== data.rating;

  const info: { label: string; value: string; warn?: boolean }[] = [];
  const star = isV && data.verifiedStarLevel ? data.verifiedStarLevel : data.starLevel;
  if (star) info.push({ label: "星级", value: starDiff ? `${data.verifiedStarLevel}（自报：${data.starLevel}）` : star, warn: !!starDiff });
  const loc = isV && data.verifiedLocation ? data.verifiedLocation : data.location;
  if (loc) info.push({ label: "地址", value: loc });
  const price = isV && data.verifiedPriceRange ? data.verifiedPriceRange : data.priceRange;
  if (price) info.push({ label: "价位", value: priceDiff ? `${data.verifiedPriceRange}（自报：${data.priceRange}）` : price, warn: !!priceDiff });
  const rating = isV && data.verifiedRating != null ? data.verifiedRating : data.rating;
  if (rating != null) info.push({ label: "评分", value: ratingDiff ? `${data.verifiedRating!.toFixed(1)} ⭐（自报：${data.rating!.toFixed(1)}）` : rating.toFixed(1) + " ⭐", warn: !!ratingDiff });
  if (data.roomTypes) info.push({ label: "房型", value: data.roomTypes });

  const hasDiff = starDiff || priceDiff || ratingDiff;
  const fac = isV && data.verifiedFacilities ? data.verifiedFacilities : data.facilities;
  return (
    <>
      {isV && data.verifiedNote && <VerifiedNoteBanner note={data.verifiedNote} />}
      {isV && hasDiff && <DiffWarning />}
      <Section icon="fa-hotel" iconColor="text-[#a855f7]" title={isV ? "酒店信息（已核实）" : "酒店信息（自报）"}>
        <WarnGrid items={info} />
      </Section>
      {fac && fac.length > 0 && (
        <Section icon="fa-concierge-bell" iconColor="text-[#3ea6ff]" title="设施">
          <div className="flex flex-wrap gap-2">
            {fac.map((f, i) => <span key={i} className="text-xs px-3 py-1 rounded-full bg-[#212121] border border-[#333] text-[#ccc]">{f}</span>)}
          </div>
        </Section>
      )}
    </>
  );
}

function ShopDetail({ data }: { data: ShopItem }) {
  const isV = data.status === "verified";
  const info: { label: string; value: string; warn?: boolean }[] = [];
  if (data.category) info.push({ label: "类别", value: data.category });
  const loc = isV && data.verifiedLocation ? data.verifiedLocation : data.location;
  if (loc) info.push({ label: "地址", value: loc });
  const owner = isV && data.verifiedOwner ? data.verifiedOwner : data.owner;
  if (owner) info.push({ label: "店主", value: owner });
  const products = isV && data.verifiedMainProducts ? data.verifiedMainProducts : data.mainProducts;
  if (products) info.push({ label: "主营", value: products });
  return (
    <>
      {isV && data.verifiedNote && <VerifiedNoteBanner note={data.verifiedNote} />}
      <Section icon="fa-store" iconColor="text-[#ec4899]" title={isV ? "商铺信息（已核实）" : "商铺信息（自报）"}>
        <WarnGrid items={info} />
      </Section>
    </>
  );
}

function SchoolDetail({ data }: { data: SchoolItem }) {
  const isV = data.status === "verified";
  const countDiff = isV && data.verifiedStudentCount && data.studentCount && data.verifiedStudentCount !== data.studentCount;

  const info: { label: string; value: string; warn?: boolean }[] = [];
  const lv = isV && data.verifiedLevel ? data.verifiedLevel : data.level;
  if (lv) info.push({ label: "类型", value: lv });
  const loc = isV && data.verifiedLocation ? data.verifiedLocation : data.location;
  if (loc) info.push({ label: "地址", value: loc });
  const count = isV && data.verifiedStudentCount ? data.verifiedStudentCount : data.studentCount;
  if (count) info.push({ label: "学员", value: countDiff ? `${data.verifiedStudentCount}（自报：${data.studentCount}）` : count, warn: !!countDiff });
  return (
    <>
      {isV && data.verifiedNote && <VerifiedNoteBanner note={data.verifiedNote} />}
      {isV && countDiff && <DiffWarning />}
      <Section icon="fa-graduation-cap" iconColor="text-[#f0b90b]" title={isV ? "学校信息（已核实）" : "学校信息（自报）"}>
        <WarnGrid items={info} />
      </Section>
      {data.features && (
        <Section icon="fa-star" iconColor="text-[#f0b90b]" title="特色">
          <p className="text-sm text-[#aaa] p-3 rounded-xl bg-[#212121] border border-[#333]">{data.features}</p>
        </Section>
      )}
    </>
  );
}

function HospitalDetail({ data }: { data: HospitalItem }) {
  const isV = data.status === "verified";
  const gradeDiff = isV && data.verifiedGrade && data.grade && data.verifiedGrade !== data.grade;

  const info: { label: string; value: string; warn?: boolean }[] = [];
  const gr = isV && data.verifiedGrade ? data.verifiedGrade : data.grade;
  if (gr) info.push({ label: "等级", value: gradeDiff ? `${data.verifiedGrade}（自报：${data.grade}）` : gr, warn: !!gradeDiff });
  const loc = isV && data.verifiedLocation ? data.verifiedLocation : data.location;
  if (loc) info.push({ label: "地址", value: loc });

  const depts = isV && data.verifiedDepartments ? data.verifiedDepartments : data.departments;
  return (
    <>
      {isV && data.verifiedNote && <VerifiedNoteBanner note={data.verifiedNote} />}
      {isV && gradeDiff && <DiffWarning />}
      <Section icon="fa-hospital" iconColor="text-[#2ba640]" title={isV ? "医院信息（已核实）" : "医院信息（自报）"}>
        <WarnGrid items={info} />
      </Section>
      {depts && depts.length > 0 && (
        <Section icon="fa-stethoscope" iconColor="text-[#3ea6ff]" title="科室">
          <div className="flex flex-wrap gap-2">
            {depts.map((d, i) => <span key={i} className="text-xs px-3 py-1 rounded-full bg-[#212121] border border-[#333] text-[#ccc]">{d}</span>)}
          </div>
        </Section>
      )}
      {data.features && (
        <Section icon="fa-star" iconColor="text-[#f0b90b]" title="特色">
          <p className="text-sm text-[#aaa] p-3 rounded-xl bg-[#212121] border border-[#333]">{data.features}</p>
        </Section>
      )}
    </>
  );
}

/* ========== 验证记录面板 ========== */
function VerifyRecordsPanel({ records }: { records: VerifyRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  if (records.length === 0) return null;

  // 按字段分组统计
  const fieldGroups: Record<string, { values: Record<string, { count: number; totalLikes: number; records: VerifyRecord[] }> }> = {};
  records.forEach(r => {
    if (!fieldGroups[r.field]) fieldGroups[r.field] = { values: {} };
    if (!fieldGroups[r.field].values[r.newValue]) fieldGroups[r.field].values[r.newValue] = { count: 0, totalLikes: 0, records: [] };
    fieldGroups[r.field].values[r.newValue].count++;
    fieldGroups[r.field].values[r.newValue].totalLikes += r.likes;
    fieldGroups[r.field].values[r.newValue].records.push(r);
  });

  return (
    <div className="mb-4">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 text-sm font-semibold mb-2 w-full text-left">
        
        验证记录（{records.length}条）
        
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* 字段共识摘要 */}
          <div className="p-3 rounded-xl bg-[#212121]/50 border border-[#3ea6ff]/10">
            <p className="text-[10px] text-[#3ea6ff] font-bold mb-2">共识结果（多数/点赞决定）</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(fieldGroups).map(([field, group]) => {
                const entries = Object.entries(group.values).sort((a, b) => {
                  if (b[1].count !== a[1].count) return b[1].count - a[1].count;
                  return b[1].totalLikes - a[1].totalLikes;
                });
                const winner = entries[0];
                const hasConflict = entries.length > 1;
                return (
                  <div key={field} className={clsx("p-2 rounded-lg border text-[11px]",
                    hasConflict ? "bg-[#f0b90b]/5 border-[#f0b90b]/20" : "bg-[#2ba640]/5 border-[#2ba640]/20"
                  )}>
                    <span className="text-[#8a8a8a]">{field}：</span>
                    <span className={hasConflict ? "text-[#f0b90b] font-bold" : "text-[#2ba640] font-bold"}>{winner[0]}</span>
                    <span className="text-[#666] ml-1">({winner[1].count}人{hasConflict ? " ?" + winner[1].totalLikes : ""})</span>
                    {hasConflict && <span className="text-[#ff4444] text-[9px] ml-1">有争议</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 详细记录 */}
          <div className="space-y-2">
            {records.map(r => (
              <div key={r.id} className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#212121] flex items-center justify-center text-[10px] text-[#aaa]">{r.verifier[0]}</span>
                    <span className="text-[11px] font-bold text-[#ccc]">{r.verifier}</span>
                    <span className="text-[10px] text-[#666]">{r.time}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#2ba640]">{r.likes}</span>
                    <span className="text-[#ff4444]">{r.dislikes}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[12px] mb-1">
                  <span className="px-1.5 py-0.5 rounded bg-[#3ea6ff]/10 text-[#3ea6ff] text-[10px] font-bold">{r.field}</span>
                  <span className="text-[#ff4444] line-through">{r.oldValue}</span>
                  
                  <span className="text-[#2ba640] font-bold">{r.newValue}</span>
                </div>
                <p className="text-[11px] text-[#8a8a8a]">{r.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
