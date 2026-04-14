/**
 * 成人内容详细标签系统
 *
 * 用于 NAS 影片和所有成人专区内容的标签分类。
 * 支持多标签组合搜索，标签按分组展示。
 *
 * 标签 ID 使用英文短横线格式，label 使用中文显示名。
 * 所有标签仅在 NC-17 成人模式下可见。
 */

export interface TagOption {
  id: string;
  label: string;
}

export interface TagGroup {
  id: string;
  label: string;
  tags: TagOption[];
}

// ═══════════════════════════════════════════════════════════════
// 题材/关系标签 — 最详细的分类维度
// ═══════════════════════════════════════════════════════════════

export const THEME_TAGS: TagGroup = {
  id: 'theme',
  label: '题材/关系',
  tags: [
    // 家庭关系类
    { id: 'incest', label: '乱伦' },
    { id: 'brother-sister', label: '兄妹' },
    { id: 'mother-son', label: '母子' },
    { id: 'father-daughter', label: '父女' },
    { id: 'step-family', label: '继父母/继子女' },
    { id: 'sister-sister', label: '姐妹' },
    { id: 'brother-brother', label: '兄弟' },
    { id: 'aunt-nephew', label: '姑侄/姨侄' },
    { id: 'uncle-niece', label: '叔侄' },
    { id: 'cousin', label: '表兄妹/堂兄妹' },
    { id: 'family-affair', label: '家庭聚会' },
    // 人妻/熟女类
    { id: 'wife', label: '人妻' },
    { id: 'milf', label: '熟女' },
    { id: 'widow', label: '寡妇' },
    { id: 'ntr', label: 'NTR/寝取' },
    { id: 'cheating', label: '出轨/偷情' },
    { id: 'cuckold', label: '绿帽' },
    { id: 'wife-swap', label: '换妻' },
    { id: 'neighbor-wife', label: '邻居人妻' },
    // 校园/职场类
    { id: 'school', label: '校园' },
    { id: 'teacher-student', label: '师生' },
    { id: 'classmate', label: '同学' },
    { id: 'senpai-kouhai', label: '前辈后辈' },
    { id: 'office', label: '职场/OL' },
    { id: 'boss-secretary', label: '上司秘书' },
    { id: 'colleague', label: '同事' },
    // 制服/角色扮演类
    { id: 'nurse', label: '护士' },
    { id: 'maid', label: '女仆' },
    { id: 'teacher-uniform', label: '教师' },
    { id: 'stewardess', label: '空姐' },
    { id: 'jk', label: 'JK制服' },
    { id: 'police', label: '警察/女警' },
    { id: 'cheerleader', label: '啦啦队' },
    { id: 'bunny-girl', label: '兔女郎' },
    { id: 'cosplay', label: 'Cosplay' },
    { id: 'idol', label: '偶像' },
    { id: 'shrine-maiden', label: '巫女' },
    { id: 'nun', label: '修女' },
    // SM/BDSM类
    { id: 'bdsm', label: 'SM/BDSM' },
    { id: 'bondage', label: '捆绑' },
    { id: 'whipping', label: '鞭打' },
    { id: 'candle', label: '蜡烛' },
    { id: 'choking', label: '窒息' },
    { id: 'domination', label: '支配/调教' },
    { id: 'submission', label: '服从' },
    { id: 'slave', label: '奴隶' },
    { id: 'queen', label: '女王' },
    { id: 'pet-play', label: '宠物Play' },
    // 性行为类
    { id: 'oral', label: '口交' },
    { id: 'deepthroat', label: '深喉' },
    { id: 'anal', label: '肛交' },
    { id: 'facial', label: '颜射' },
    { id: 'creampie', label: '中出/内射' },
    { id: 'footjob', label: '足交' },
    { id: 'paizuri', label: '乳交' },
    { id: 'handjob', label: '手交' },
    { id: 'sixty-nine', label: '69式' },
    { id: 'squirting', label: '潮吹' },
    { id: 'double-penetration', label: '双插' },
    // 群体类
    { id: 'threesome', label: '3P' },
    { id: 'foursome', label: '4P' },
    { id: 'orgy', label: '群交/乱交' },
    { id: 'gangbang', label: '轮奸' },
    { id: 'bukake', label: '颜射集合' },
    // 同性类
    { id: 'lesbian', label: '女同/百合' },
    { id: 'gay', label: '男同' },
    { id: 'bisexual', label: '双性恋' },
    { id: 'transgender', label: '跨性别/人妖' },
    { id: 'crossdress', label: '变装/伪娘' },
    // 恋物/特殊类
    { id: 'stockings', label: '丝袜' },
    { id: 'pantyhose', label: '连裤袜' },
    { id: 'feet', label: '恋足' },
    { id: 'lingerie', label: '内衣' },
    { id: 'swimsuit', label: '泳装' },
    { id: 'latex', label: '乳胶/皮革' },
    { id: 'glasses', label: '眼镜' },
    { id: 'tattoo', label: '纹身' },
    { id: 'piercing', label: '穿环' },
    // 场景类
    { id: 'outdoor', label: '户外' },
    { id: 'public', label: '公共场所' },
    { id: 'bathroom', label: '浴室' },
    { id: 'kitchen', label: '厨房' },
    { id: 'car', label: '车内' },
    { id: 'hotel', label: '酒店' },
    { id: 'onsen', label: '温泉' },
    { id: 'pool', label: '泳池' },
    { id: 'beach', label: '海滩' },
    { id: 'train', label: '电车/地铁' },
    // 情境类
    { id: 'massage', label: '按摩' },
    { id: 'hypnosis', label: '催眠' },
    { id: 'sleeping', label: '睡眠/迷奸' },
    { id: 'drunk', label: '醉酒' },
    { id: 'voyeur', label: '偷窥' },
    { id: 'exhibitionism', label: '露出' },
    { id: 'chikan', label: '痴汉/电车痴汉' },
    { id: 'chijo', label: '痴女' },
    { id: 'delivery', label: '外卖/快递' },
    { id: 'casting', label: '面试/试镜' },
    // 特殊题材
    { id: 'pregnant', label: '怀孕' },
    { id: 'lactation', label: '母乳' },
    { id: 'virgin', label: '处女' },
    { id: 'first-time', label: '初体验' },
    { id: 'age-gap', label: '老少配' },
    { id: 'ugly-man', label: '丑男' },
    { id: 'netorare', label: '被寝取' },
    { id: 'netori', label: '寝取' },
    { id: 'revenge', label: '复仇' },
    { id: 'blackmail', label: '胁迫' },
    // 动画特有
    { id: 'tentacle', label: '触手' },
    { id: 'monster', label: '怪物/人外' },
    { id: 'elf', label: '精灵' },
    { id: 'demon', label: '恶魔/魅魔' },
    { id: 'robot', label: '机器人' },
    { id: 'furry', label: '兽人' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 身体特征标签
// ═══════════════════════════════════════════════════════════════

export const BODY_TAGS: TagGroup = {
  id: 'body',
  label: '身体特征',
  tags: [
    // 胸部
    { id: 'big-breasts', label: '巨乳' },
    { id: 'huge-breasts', label: '超巨乳' },
    { id: 'small-breasts', label: '贫乳' },
    { id: 'medium-breasts', label: '普通胸' },
    { id: 'natural-breasts', label: '天然胸' },
    { id: 'fake-breasts', label: '假胸' },
    // 臀部
    { id: 'big-ass', label: '大臀' },
    { id: 'small-ass', label: '翘臀' },
    // 体型
    { id: 'slim', label: '纤细' },
    { id: 'fit', label: '匀称' },
    { id: 'curvy', label: '丰满' },
    { id: 'bbw', label: 'BBW/胖' },
    { id: 'muscular', label: '肌肉' },
    { id: 'petite', label: '娇小' },
    { id: 'tall', label: '高挑' },
    // 毛发
    { id: 'shaved', label: '剃毛' },
    { id: 'hairy', label: '多毛' },
    { id: 'blonde', label: '金发' },
    { id: 'brunette', label: '棕发' },
    { id: 'redhead', label: '红发' },
    { id: 'black-hair', label: '黑发' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 人种/民族标签
// ═══════════════════════════════════════════════════════════════

export const ETHNICITY_TAGS: TagGroup = {
  id: 'ethnicity',
  label: '人种/民族',
  tags: [
    { id: 'asian', label: '亚洲人' },
    { id: 'japanese', label: '日本人' },
    { id: 'chinese', label: '中国人' },
    { id: 'korean', label: '韩国人' },
    { id: 'thai', label: '泰国人' },
    { id: 'caucasian', label: '白人' },
    { id: 'black', label: '黑人' },
    { id: 'latina', label: '拉丁裔' },
    { id: 'indian', label: '印度人' },
    { id: 'middle-eastern', label: '中东人' },
    { id: 'mixed', label: '混血' },
    { id: 'russian', label: '俄罗斯人' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 年龄段标签
// ═══════════════════════════════════════════════════════════════

export const AGE_TAGS: TagGroup = {
  id: 'age',
  label: '年龄段',
  tags: [
    { id: 'age-18-20', label: '18-20岁' },
    { id: 'age-20-25', label: '20-25岁' },
    { id: 'age-25-30', label: '25-30岁' },
    { id: 'age-30-40', label: '30-40岁' },
    { id: 'age-40-plus', label: '40岁以上' },
    { id: 'mature', label: '熟女' },
    { id: 'young', label: '年轻' },
    { id: 'teen-legal', label: '刚成年(18+)' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 所有标签组合
// ═══════════════════════════════════════════════════════════════

export const ALL_TAG_GROUPS: TagGroup[] = [
  THEME_TAGS,
  BODY_TAGS,
  ETHNICITY_TAGS,
  AGE_TAGS,
];

/**
 * 获取所有标签的扁平列表
 */
export function getAllTags(): TagOption[] {
  return ALL_TAG_GROUPS.flatMap((g) => g.tags);
}

/**
 * 根据 ID 查找标签
 */
export function getTagById(id: string): TagOption | undefined {
  return getAllTags().find((t) => t.id === id);
}

/**
 * 根据 ID 列表获取标签显示名
 */
export function getTagLabels(ids: string[]): string[] {
  return ids
    .map((id) => getTagById(id)?.label)
    .filter((label): label is string => !!label);
}

/**
 * 搜索标签（模糊匹配）
 */
export function searchTags(query: string): TagOption[] {
  const q = query.toLowerCase();
  return getAllTags().filter(
    (t) => t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
  );
}
