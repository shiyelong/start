export interface Video {
  id: number; title: string; category: string;
  author: string; avatar: string; avatarBg: string;
  views: number; likes: number; duration: string;
  date: string; desc: string; thumb: string;
  bvid: string;
  isOwner?: boolean;
}

// 站长视频 - 从你B站空间截图提取的（后续你自己加BV号）
// 获取BV号方法：打开B站视频页，地址栏 bilibili.com/video/BVxxxxxx 就是BV号
export const ownerVideos: Video[] = [
  { id:101, title:'反差', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:72, likes:0, duration:'00:16', date:'4小时前', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:102, title:'泳池比基尼展示', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:0, likes:0, duration:'01:09', date:'昨天', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:103, title:'喜欢吗?', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:280, likes:0, duration:'00:30', date:'04-07', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:104, title:'谁，我又没钱了', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:156, likes:0, duration:'00:04', date:'04-07', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:105, title:'更新看，赶紧来围观吧！', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:192, likes:0, duration:'00:05', date:'04-07', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:106, title:'女生宿舍真的乱', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:83, likes:0, duration:'00:12', date:'04-07', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:107, title:'推沙滩', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:43, likes:0, duration:'00:11', date:'04-07', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:108, title:'AI生成很多', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:66, likes:0, duration:'00:36', date:'04-07', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:109, title:'她爸爸说这样最好看', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:64, likes:0, duration:'00:08', date:'04-07', desc:'', thumb:'', bvid:'', isOwner:true },
  { id:110, title:'多学多看多实战', category:'owner', author:'Undefinde_NaN', avatar:'U', avatarBg:'bg-accent', views:56, likes:0, duration:'00:15', date:'04-07', desc:'', thumb:'', bvid:'', isOwner:true },
];

// 热门推荐视频（用真实B站热门BV号，播放器可嵌入）
export const hotVideos: Video[] = [
  { id:1, title:'永远不要满足于现状', category:'life', author:'热门精选', avatar:'H', avatarBg:'bg-pink-600', views:352000, likes:18200, duration:'12:20', date:'2026-04-09', desc:'', thumb:'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80', bvid:'BV1GJ411x7h7' },
  { id:2, title:'游戏高光时刻合集', category:'game', author:'游戏前线', avatar:'G', avatarBg:'bg-red-600', views:580000, likes:32000, duration:'25:30', date:'2026-04-08', desc:'', thumb:'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400&q=80', bvid:'BV1Hx411w7X3' },
  { id:3, title:'超好听音乐合集', category:'music', author:'音乐频道', avatar:'M', avatarBg:'bg-cyan-600', views:420000, likes:21000, duration:'58:00', date:'2026-04-07', desc:'', thumb:'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80', bvid:'BV1uT4y1P7CX' },
  { id:4, title:'搞笑视频大合集', category:'funny', author:'搞笑频道', avatar:'F', avatarBg:'bg-amber-600', views:670000, likes:45000, duration:'10:30', date:'2026-04-06', desc:'', thumb:'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80', bvid:'BV1x54y1e7zf' },
  { id:5, title:'健身训练日常', category:'life', author:'健身达人', avatar:'J', avatarBg:'bg-orange-600', views:189000, likes:9800, duration:'15:20', date:'2026-04-05', desc:'', thumb:'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80', bvid:'BV1bK4y1C7yA' },
  { id:6, title:'独立游戏推荐TOP10', category:'game', author:'游戏观察', avatar:'Y', avatarBg:'bg-emerald-600', views:310000, likes:16000, duration:'42:15', date:'2026-04-04', desc:'', thumb:'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80', bvid:'BV1aS4y1P7Gj' },
  { id:7, title:'深夜Lo-Fi音乐', category:'music', author:'ChillBeats', avatar:'C', avatarBg:'bg-indigo-600', views:156000, likes:8900, duration:'3:00:00', date:'2026-03-28', desc:'', thumb:'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&q=80', bvid:'BV1GJ411x7h7' },
  { id:8, title:'街头美食探店', category:'life', author:'吃货旅行', avatar:'C', avatarBg:'bg-yellow-600', views:120000, likes:5800, duration:'25:30', date:'2026-04-02', desc:'', thumb:'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&q=80', bvid:'BV1x54y1e7zf' },
];

// Pornhub视频
export const pornhubVideos: Video[] = [
  { id:101, title:'Amateur couple having fun', category:'pornhub', author:'Pornhub', avatar:'P', avatarBg:'bg-purple-600', views:1250000, likes:45000, duration:'15:30', date:'2026-04-09', desc:'', thumb:'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=80', bvid:'ph123456' },
  { id:102, title:'Sensual massage', category:'pornhub', author:'Pornhub', avatar:'P', avatarBg:'bg-purple-600', views:980000, likes:32000, duration:'20:15', date:'2026-04-08', desc:'', thumb:'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=400&q=80', bvid:'ph123457' },
  { id:103, title:'Hardcore action', category:'pornhub', author:'Pornhub', avatar:'P', avatarBg:'bg-purple-600', views:1560000, likes:58000, duration:'18:45', date:'2026-04-07', desc:'', thumb:'https://images.unsplash.com/photo-1524659270455-3f859d87e55d?w=400&q=80', bvid:'ph123458' },
  { id:104, title:'lesbian love', category:'pornhub', author:'Pornhub', avatar:'P', avatarBg:'bg-purple-600', views:870000, likes:29000, duration:'12:20', date:'2026-04-06', desc:'', thumb:'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=400&q=80', bvid:'ph123459' },
  { id:105, title:'Threesome fun', category:'pornhub', author:'Pornhub', avatar:'P', avatarBg:'bg-purple-600', views:1120000, likes:41000, duration:'25:30', date:'2026-04-05', desc:'', thumb:'https://images.unsplash.com/photo-1526509867277-5034758c18c0?w=400&q=80', bvid:'ph123460' },
  { id:106, title:'Anal adventure', category:'pornhub', author:'Pornhub', avatar:'P', avatarBg:'bg-purple-600', views:950000, likes:35000, duration:'16:40', date:'2026-04-04', desc:'', thumb:'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=400&q=80', bvid:'ph123461' },
  { id:107, title:'Blowjob compilation', category:'pornhub', author:'Pornhub', avatar:'P', avatarBg:'bg-purple-600', views:1320000, likes:48000, duration:'30:15', date:'2026-04-03', desc:'', thumb:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80', bvid:'ph123462' },
  { id:108, title:'Creampie action', category:'pornhub', author:'Pornhub', avatar:'P', avatarBg:'bg-purple-600', views:1080000, likes:39000, duration:'14:25', date:'2026-04-02', desc:'', thumb:'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&q=80', bvid:'ph123463' },
];

export interface Post {
  id: number; title: string; category: string;
  author: string; avatarBg: string;
  content: string; likes: number; date: string;
  comments: { author: string; avatarBg: string; content: string; date: string }[];
}
export interface ChatMessage { user: string; color: string; msg: string; time: string; }

export const posts: Post[] = [
  { id:1, title:'欢迎来到星聚社区！', category:'announce', author:'管理员', avatarBg:'bg-blue-500', content:'这是我们全新的社区平台！\n视频 / 聊天 / 社区 / 小游戏 / AI\n\n欢迎大家！', likes:256, date:'2026-04-09', comments:[
    { author:'小明', avatarBg:'bg-blue-500', content:'界面好看！', date:'2026-04-09' },
    { author:'游戏迷', avatarBg:'bg-green-500', content:'小游戏太上头了', date:'2026-04-09' },
  ]},
  { id:2, title:'你们觉得GTA6能超越前作吗？', category:'discuss', author:'游戏达人', avatarBg:'bg-red-600', content:'GTA6实机演示出来了，画面确实炸裂。大家怎么看？', likes:142, date:'2026-04-08', comments:[] },
  { id:3, title:'分享几个超好听的宝藏歌单', category:'share', author:'音乐控', avatarBg:'bg-cyan-600', content:'1. 深夜Lo-Fi合集\n2. 2026华语新歌精选\n3. 日系City Pop\n4. 欧美电音串烧', likes:98, date:'2026-04-07', comments:[] },
  { id:4, title:'2048最高分多少？晒成绩！', category:'discuss', author:'游戏王', avatarBg:'bg-amber-600', content:'刚在小游戏里玩2048打到了32768！有没有更高的？', likes:76, date:'2026-04-06', comments:[
    { author:'数学天才', avatarBg:'bg-blue-500', content:'我最高65536', date:'2026-04-06' },
  ]},
];

export const chatChannels = [
  { id:'lobby', name:'大厅', icon:'fa-home', desc:'公共聊天' },
  { id:'game', name:'游戏交流', icon:'fa-gamepad', desc:'聊游戏' },
  { id:'music', name:'音乐分享', icon:'fa-music', desc:'分享好歌' },
  { id:'funny', name:'搞笑专区', icon:'fa-face-laugh', desc:'快乐源泉' },
  { id:'random', name:'水区', icon:'fa-dice', desc:'随便聊' },
];

export const chatMessages: Record<string, ChatMessage[]> = {
  lobby: [
    { user:'小明', color:'bg-blue-500', msg:'大家好！新来的', time:'14:20' },
    { user:'游戏迷', color:'bg-green-500', msg:'欢迎！先去玩个2048', time:'14:21' },
    { user:'音乐控', color:'bg-pink-500', msg:'刚听完那个音乐合集，太棒了', time:'14:23' },
    { user:'搞笑王', color:'bg-orange-500', msg:'猫咪那个视频笑死我了', time:'14:25' },
    { user:'摸鱼专家', color:'bg-yellow-500', msg:'周五了！周末什么计划？', time:'14:35' },
  ],
  game: [
    { user:'硬核玩家', color:'bg-violet-500', msg:'贪吃蛇我打了200分！', time:'13:10' },
    { user:'MC大神', color:'bg-green-500', msg:'有人一起玩吗', time:'13:15' },
  ],
  music: [
    { user:'音乐控', color:'bg-pink-500', msg:'推荐一首新歌，超好听', time:'12:00' },
  ],
  funny: [
    { user:'搞笑王', color:'bg-orange-500', msg:'今天又看了三遍猫咪视频', time:'10:00' },
  ],
  random: [
    { user:'摸鱼专家', color:'bg-yellow-500', msg:'今天咖啡特别好喝', time:'10:00' },
  ],
};

export const onlineUsers = [
  { name:'小明', color:'bg-blue-500' },
  { name:'游戏迷', color:'bg-green-500' },
  { name:'音乐控', color:'bg-pink-500' },
  { name:'搞笑王', color:'bg-orange-500' },
  { name:'摸鱼专家', color:'bg-yellow-500' },
  { name:'硬核玩家', color:'bg-violet-500' },
];

export const aiSuggestions = [
  '推荐今天最火的视频',
  '有什么好玩的小游戏',
  '帮我写一段社区自我介绍',
  '最近有什么热门话题',
];

export const games = [
  // 经典三巨头
  { id:'2048', name:'2048', icon:'fa-hashtag', desc:'经典数字合并', color:'from-amber-500 to-orange-600', hot:true },
  { id:'snake', name:'贪吃蛇', icon:'fa-worm', desc:'经典贪吃蛇', color:'from-green-500 to-emerald-600', hot:true },
  { id:'tetris', name:'俄罗斯方块', icon:'fa-cubes', desc:'经典方块消除', color:'from-purple-500 to-violet-600', hot:true },
  // 大型游戏
  { id:'pokemon', name:'宠物大冒险', icon:'fa-dragon', desc:'探索世界收集宠物回合制战斗', color:'from-violet-500 to-purple-600', hot:true },
  { id:'civilization', name:'文明崛起', icon:'fa-landmark', desc:'4X策略建城征服世界', color:'from-amber-500 to-red-700', hot:true },
  // 横版闯关
  { id:'forest', name:'森林冒险', icon:'fa-tree', desc:'横版闯关探索神秘森林', color:'from-green-500 to-emerald-600', hot:true },
  { id:'mecha', name:'机械城堡', icon:'fa-gear', desc:'科技风横版闯关冒险', color:'from-slate-500 to-blue-600', hot:true },
  { id:'shadow', name:'暗影地牢', icon:'fa-ghost', desc:'黑暗主题横版闯关挑战', color:'from-purple-600 to-zinc-800', hot:true },
  // 动作射击
  { id:'spaceshoot', name:'太空射击', icon:'fa-rocket', desc:'弹幕射击打Boss', color:'from-blue-600 to-cyan-500', hot:true },
  { id:'tower', name:'塔防守卫', icon:'fa-chess-rook', desc:'建塔防御怪物入侵', color:'from-orange-500 to-red-600', hot:true },
  // 益智
  { id:'match3', name:'宝石消消乐', icon:'fa-gem', desc:'三消益智停不下来', color:'from-fuchsia-500 to-pink-600', hot:true },
  { id:'sudoku', name:'数独', icon:'fa-table-cells', desc:'经典9宫格逻辑推理', color:'from-blue-500 to-sky-600', hot:true },
  { id:'huarong', name:'华容道', icon:'fa-chess-board', desc:'滑块解谜经典益智', color:'from-red-600 to-amber-600', hot:true },
  { id:'logic', name:'逻辑推理', icon:'fa-brain', desc:'烧脑逻辑谜题挑战', color:'from-rose-500 to-red-700', hot:true },
  // 休闲
  { id:'fishing', name:'钓鱼达人', icon:'fa-fish', desc:'休闲钓鱼收集图鉴', color:'from-teal-500 to-cyan-600', hot:false },
];
