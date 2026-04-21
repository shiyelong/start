# 需求文档 — 星聚娱乐平台整合

## 简介

星聚（StarHub）平台娱乐功能大规模升级，涵盖十二大核心模块：视频平台整合（本站+B站+A站+YouTube+Twitch+Dailymotion+Vimeo+抖音+快手+西瓜视频+成人视频源+免费影视聚合）、动漫聚合平台、漫画聚合平台（主流漫画源+成人漫画源）、小说聚合平台（主流小说源+成人小说源）、游戏全面重构（经典游戏视觉升级+多平台分类+成人游戏含网页可玩）、音乐聚合播放应用（多源音乐聚合+成人音乐）、播客聚合、直播聚合（主流直播+成人直播）、全平台适配（Web/PC桌面/macOS/Android/iOS/Android TV）、美国MPAA式内容分级与未成年人保护系统、老人模式（仅电视端）、成人服务生态（验证点评+求职招聘+安全保障+黑名单）。所有内容类型均严格区分MPAA分级（G/PG/PG-13/R/NC-17），所有成人内容仅限NC-17成人模式访问。平台以非盈利为目的，免费为所有用户提供服务，通过聚合保护用户不被第三方不良网站欺骗。所有模块遵循星聚项目宪法：深色主题、SVG图标、Cloudflare架构、Canvas游戏渲染、NAS零公网端口。

### 架构关键决策

1. **NAS 已到位**：NAS 存储设备已部署就绪，通过 Cloudflare Tunnel 安全连接，作为内容缓存和永久存储层正式投入使用。缓存/存储架构从"规划中"更新为"已部署运行"状态。
2. **前后端聚合全部收归后端**：所有内容聚合逻辑（视频、音乐、漫画、小说、动漫、直播、播客等）全部在后端（Cloudflare Pages Functions）实现，前端仅通过后端 API 获取聚合结果，前端不直接访问任何第三方数据源。
3. **视频下载刮削**：新增视频下载和网页刮削（scraping）功能，后端可主动从第三方网站抓取和下载视频资源，缓存到 NAS 永久存储。
4. **后端 API 直接代理第三方网站**：后端 API 层作为统一代理网关，前端通过后端 API 间接访问所有第三方网站内容，前端永远不直接请求第三方域名，确保用户隐私和平台安全。

## 术语表

- **Video_Aggregator**: 视频聚合引擎，负责统一搜索和播放来自多个视频源的内容
- **Video_Player**: 自有视频播放器组件，支持本站视频和第三方视频源的统一播放体验
- **Bilibili_Adapter**: 哔哩哔哩视频接入适配器，通过iframe嵌入或API代理获取B站视频
- **YouTube_Proxy**: YouTube视频代理服务，通过Cloudflare Workers反向代理实现大陆无梯子访问
- **AutoPlay_Engine**: 自动播放引擎，根据规则决定下一个播放的视频（下一集/推荐/UP主视频）
- **Game_Engine**: 游戏引擎基础框架，提供Canvas渲染、游戏循环、输入处理等通用能力
- **Game_Catalog**: 游戏目录系统，管理PC/手机/NS/PS/Xbox等多平台游戏分类和元数据
- **Music_Player**: 自有音乐播放应用，支持播放列表、歌词显示、后台播放等功能
- **Music_Aggregator**: 音乐聚合引擎，聚合多个免费音乐源的搜索和播放能力
- **Age_Gate**: 年龄验证与内容分级系统，基于美国MPAA分级制度区分内容访问权限
- **Content_Rating**: 美国MPAA式内容分级标签体系，包含G（大众级）、PG（辅导级）、PG-13（特别辅导级）、R（限制级）、NC-17（成人级）五个等级
- **Podcast_Aggregator**: 播客聚合引擎，聚合多个播客平台的节目搜索和收听能力
- **Live_Aggregator**: 直播聚合引擎，聚合多个直播平台的直播间内容
- **Anime_Aggregator**: 动漫聚合引擎，专门聚合番剧/动漫资源站的搜索和播放能力
- **Adult_Anime_Adapter**: 成人动漫源适配器，聚合里番/成人向动漫资源（仅限成人，NC-17级）
- **Novel_Aggregator**: 小说聚合引擎，聚合多个免费小说源的搜索和在线阅读能力
- **Novel_Reader**: 自有小说阅读器组件，支持翻页、字体调节、夜间模式和书签功能
- **Adult_Novel_Adapter**: 成人小说源适配器，聚合多个成人小说网站内容（仅限成人，NC-17级）
- **Adult_Live_Adapter**: 成人直播源适配器，聚合多个成人直播平台内容（仅限成人，NC-17级）
- **Download_Manager**: 离线下载管理器，支持视频/音乐/漫画/小说的离线缓存
- **Search_Hub**: 全局统一搜索引擎，一个搜索框同时搜索视频、音乐、漫画、小说、游戏等所有内容类型
- **AI_Subtitle**: AI字幕引擎，自动为无字幕视频生成多语言字幕
- **AI_Dubbing**: AI配音引擎，自动为视频生成多语言配音
- **AI_Chat**: 无限制AI聊天助手，通过OpenRouter API提供无审查的AI对话能力
- **Region_Filter**: 地区筛选系统，支持按国家/地区分类和筛选视频内容
- **Platform_Shell**: 多平台外壳层，通过Capacitor/Electron/PWA实现Web/PC/macOS/Android/iOS/TV统一分发
- **TV_App**: 电视端应用，适配遥控器操作和大屏显示的专用界面
- **Cloudflare_Proxy**: Cloudflare Workers代理层，用于转发第三方视频请求以绕过地域限制
- **EmulatorWrapper**: 经典主机模拟器封装层，基于Nostalgist库实现浏览器内模拟器运行
- **Free_Video_Source**: 免费视频网站数据源，通过爬虫或API聚合多个免费视频站点的内容
- **Telegram_Adapter**: Telegram公开频道适配器，通过Bot API抓取Telegram频道中的视频/图片资源
- **NAS_Cache**: NAS安全缓存层（已部署运行），通过Cloudflare Tunnel加密连接，对缓存内容AES-256加密存储并混淆文件名，作为平台内容的永久存储和加速缓存层
- **AcFun_Adapter**: AcFun（A站）视频接入适配器，聚合A站视频内容（全年龄，G级）
- **Adult_Video_Adapter**: 成人视频源适配器，聚合Pornhub等成人视频网站内容（仅限成人，NC-17级）
- **Adult_Music_Adapter**: 成人音乐源适配器，聚合含有露骨歌词/内容的音乐平台（仅限成人，NC-17级）
- **Adult_Game_Adapter**: 成人游戏源适配器，聚合成人向游戏平台和资源（仅限成人，NC-17级）
- **Adult_Service_Platform**: 成人服务验证与点评平台，提供SPA/按摩等成人服务的社区验证、匿名点评、求职招聘、社交约会和安全保障系统，防止用户被骗
- **Adult_Social**: 成人社交系统，提供成人帖子论坛、私聊、视频聊天和线下约会功能
- **Privacy_Shield**: 隐私防护盾，多层匿名和反审查机制，保护用户身份和平台安全
- **Elder_Mode**: 老人模式（仅电视端），为老年用户提供超大字体、简化界面和语音操控的专用体验
- **Comic_Aggregator**: 漫画聚合引擎，聚合多个漫画源的搜索和在线阅读能力
- **Comic_Reader**: 自有漫画阅读器组件，支持翻页/条漫模式、缩放和书签功能
- **Adult_Comic_Adapter**: 成人漫画源适配器，聚合E-Hentai、nhentai等成人漫画网站内容（仅限成人，NC-17级）
- **Playback_Queue**: 播放队列，管理视频/音乐的播放顺序和自动连播逻辑
- **Focus_Navigation**: 焦点导航系统，电视端遥控器方向键导航的焦点管理框架
- **Content_Scraper**: 全品类内容刮削引擎，后端主动从第三方网站抓取所有类型内容（视频、漫画、小说、音乐、动漫）的元数据和资源文件，支持定时刮削和按需刮削，每种内容类型有专用的刮削适配器
- **Video_Scraper**: 视频刮削适配器，Content_Scraper 的子组件，专门负责从第三方视频网站抓取视频元数据和资源链接
- **Comic_Scrape_Adapter**: 漫画刮削适配器，Content_Scraper 的子组件，专门负责从第三方漫画网站抓取漫画图片页面并批量下载到 NAS
- **Novel_Scrape_Adapter**: 小说刮削适配器，Content_Scraper 的子组件，专门负责从第三方小说网站抓取章节文本内容并存储到 NAS
- **Music_Scrape_Adapter**: 音乐刮削适配器，Content_Scraper 的子组件，专门负责从第三方音乐网站抓取音频文件并下载到 NAS
- **Anime_Scrape_Adapter**: 动漫刮削适配器，Content_Scraper 的子组件，专门负责从第三方动漫网站抓取动漫视频文件并下载到 NAS
- **Adult_Scrape_Scheduler**: 成人内容刮削调度器，Content_Scraper 的子组件，专门负责定时调度所有成人内容源的主动刮削任务，支持按内容类型独立配置刮削频率
- **Backend_Proxy**: 后端统一代理网关，所有第三方网站的内容请求均通过后端 API 代理转发，前端永远不直接访问第三方域名
- **Aggregation_Engine**: 后端聚合引擎总称，涵盖所有内容类型（视频、音乐、漫画、小说、动漫、直播、播客）的聚合逻辑，全部在后端实现
- **TTS_Engine**: AI有声小说引擎，后端通过 Cloudflare Workers 调用 TTS API（OpenAI TTS / Edge TTS 等）将小说章节文本转换为音频文件，支持多语音风格、多语言、章节自动连播，生成的音频加密存储到 NAS
- **TTS_Audio_Cache**: TTS音频缓存层，NAS_Cache 的子组件，专门管理 TTS 生成的音频文件的加密存储、缓存命中和去重逻辑，避免重复生成相同章节的音频

## 需求

---

### 需求 1: 本站视频播放器

**用户故事:** 作为星聚用户，我希望在平台内直接播放本站上传的视频，以获得流畅的原生播放体验而无需跳转到第三方平台。

#### 验收标准

1. WHEN 用户点击本站视频卡片, THE Video_Player SHALL 在当前页面内打开播放器并开始播放该视频
2. WHILE 视频正在播放, THE Video_Player SHALL 显示播放进度条、音量控制、全屏切换、画质选择和播放速度调节控件
3. WHEN 视频播放完毕且存在下一集, THE AutoPlay_Engine SHALL 在5秒倒计时后自动播放下一集
4. WHEN 视频播放完毕且不存在下一集, THE AutoPlay_Engine SHALL 在5秒倒计时后自动播放推荐视频列表中的第一个视频
5. IF 视频文件加载失败, THEN THE Video_Player SHALL 显示错误提示并提供重试按钮
6. THE Video_Player SHALL 支持键盘快捷键操作（空格暂停、左右箭头快进快退、上下箭头调节音量）
7. THE Video_Player SHALL 支持触摸手势操作（左右滑动快进快退、上下滑动调节音量和亮度）
8. WHEN 用户在移动端观看视频, THE Video_Player SHALL 支持画中画模式以便用户浏览其他页面

---

### 需求 2: 哔哩哔哩视频接入

**用户故事:** 作为星聚用户，我希望在平台内直接观看哔哩哔哩的视频内容，以便在一个平台上聚合我常看的B站内容。

#### 验收标准

1. WHEN 用户在视频中心选择B站分类, THE Bilibili_Adapter SHALL 展示站长B站账号的视频列表和热门推荐视频
2. WHEN 用户点击B站视频卡片, THE Video_Player SHALL 通过B站嵌入播放器在当前页面内播放该视频
3. WHEN B站视频播放完毕且该视频属于多集系列, THE AutoPlay_Engine SHALL 自动播放该系列的下一集
4. WHEN B站视频播放完毕且该视频不属于多集系列, THE AutoPlay_Engine SHALL 自动播放该UP主的下一个视频或推荐视频
5. THE Bilibili_Adapter SHALL 展示每个视频的标题、封面、播放量、时长和UP主信息
6. WHEN 用户搜索B站视频, THE Bilibili_Adapter SHALL 通过关键词在B站视频库中检索并返回匹配结果
7. IF B站嵌入播放器加载失败, THEN THE Bilibili_Adapter SHALL 显示错误提示并提供"在B站打开"的跳转链接

---

### 需求 3: YouTube视频接入

**用户故事:** 作为中国大陆用户，我希望在星聚平台上无需梯子即可观看YouTube视频，以便获取海外优质内容。

#### 验收标准

1. THE YouTube_Proxy SHALL 通过Cloudflare Workers反向代理YouTube视频流，使大陆用户无需VPN即可访问
2. WHEN 用户在视频中心选择YouTube分类, THE Video_Aggregator SHALL 展示热门YouTube视频和频道推荐
3. WHEN 用户点击YouTube视频卡片, THE Video_Player SHALL 通过代理服务在当前页面内播放该视频
4. WHEN YouTube视频播放完毕且存在下一集, THE AutoPlay_Engine SHALL 自动播放下一集
5. WHEN YouTube视频播放完毕且不存在下一集, THE AutoPlay_Engine SHALL 自动播放该频道的下一个视频或推荐视频
6. WHEN 用户搜索YouTube视频, THE YouTube_Proxy SHALL 通过Cloudflare Workers代理搜索请求并返回结果
7. IF YouTube代理请求失败, THEN THE YouTube_Proxy SHALL 返回明确的错误信息并建议用户稍后重试
8. THE YouTube_Proxy SHALL 将所有代理请求通过Cloudflare Workers处理，确保NAS真实IP不暴露

---

### 需求 4: 免费视频网站聚合

**用户故事:** 作为星聚用户，我希望在一个搜索框中搜索多个免费视频网站的内容，以便快速找到想看的影视资源。

#### 验收标准

1. THE Video_Aggregator SHALL 聚合尽可能多的免费视频网站内容作为数据源（包括但不限于影视资源站、动漫站、纪录片站等），初始至少配置3个源
2. WHEN 用户在聚合搜索框中输入关键词, THE Video_Aggregator SHALL 在后端同时向所有已配置的免费视频源发起搜索并合并结果，前端仅调用后端聚合搜索 API
3. THE Video_Aggregator SHALL 在搜索结果中标注每个视频的来源站点名称
4. WHEN 用户点击聚合搜索结果中的视频, THE Backend_Proxy SHALL 通过后端 API 代理获取视频流 URL，前端通过后端返回的代理 URL 播放视频，前端不直接请求第三方域名
5. WHEN 聚合视频播放完毕且存在下一集, THE AutoPlay_Engine SHALL 自动播放下一集
6. WHEN 聚合视频播放完毕且不存在下一集, THE AutoPlay_Engine SHALL 自动播放推荐视频
7. IF 某个免费视频源响应超时（超过10秒）, THEN THE Video_Aggregator SHALL 跳过该源并展示其他源的结果
8. THE Video_Aggregator SHALL 对搜索结果进行去重处理，相同视频仅展示来源质量最高的一条

---

### 需求 5: 自动播放引擎

**用户故事:** 作为星聚用户，我希望视频播放完毕后能自动播放下一个合适的视频，以获得连续的观看体验。

#### 验收标准

1. THE AutoPlay_Engine SHALL 遵循以下优先级规则决定下一个播放内容：(a) 同系列下一集 > (b) 同UP主/频道推荐视频 > (c) 平台推荐视频
2. WHEN 当前视频播放完毕, THE AutoPlay_Engine SHALL 显示5秒倒计时界面，展示即将播放的下一个视频信息
3. WHILE 倒计时进行中, THE AutoPlay_Engine SHALL 提供"立即播放"和"取消自动播放"按钮
4. WHEN 用户点击"取消自动播放", THE AutoPlay_Engine SHALL 停止倒计时并保持在当前视频结束画面
5. THE AutoPlay_Engine SHALL 在播放器侧边栏或底部展示即将自动播放的视频队列（至少5个）
6. WHEN 用户手动关闭自动播放开关, THE AutoPlay_Engine SHALL 停止所有自动播放行为直到用户重新开启
7. THE AutoPlay_Engine SHALL 跨视频源工作，无论当前视频来自本站、B站、YouTube还是免费视频源

---

### 需求 6: 自研大型网页游戏矩阵

**用户故事:** 作为星聚用户，我希望平台上每个游戏类型都有一款完整的、高质量的大型网页游戏，以展示平台的诚意和实力。

#### 验收标准

1. THE Game_Engine SHALL 使用Canvas/WebGL渲染所有游戏画面，帧率保持在60fps
2. THE Game_Engine SHALL 为每款游戏提供完整的游戏循环（初始化、更新、渲染、销毁）
3. THE Game_Engine SHALL 同时支持键盘输入和触摸屏输入
4. THE Game_Engine SHALL 为以下每个游戏类型各自研一款完整的大型网页游戏（G/PG级，所有用户可玩）：
   - 益智类：2048升级版（多模式、排行榜、每日挑战）
   - 策略类：回合制战棋游戏（多关卡、兵种系统、AI对战）
   - RPG类：像素风冒险RPG（剧情、装备、技能树、Boss战）
   - 动作类：横版格斗/射击游戏（多角色、连招系统、关卡模式）
   - 模拟经营类：城市/农场经营游戏（建造、资源管理、NPC互动）
   - 赛车类：2D/3D赛车游戏（多赛道、车辆升级、计时赛）
   - 卡牌类：卡牌对战游戏（收集、组卡组、PVE/PVP）
   - 解谜类：密室逃脱/物理解谜游戏（多关卡、提示系统）
   - 音乐类：节奏游戏（多歌曲、难度等级、评分系统）
   - 塔防类：塔防游戏（多塔种、升级、波次挑战）
   - 沙盒类：2D沙盒建造游戏（自由建造、生存模式）
   - 体育类：足球/篮球小游戏（快节奏、计分、联赛模式）
   - 棋牌类：象棋/围棋/五子棋（AI对战、在线对战）
   - 射击类：太空射击/僵尸射击游戏（武器升级、无尽模式）
   - 休闲类：消除/跑酷/钓鱼游戏（简单上手、排行榜）
5. WHEN 游戏启动, THE Game_Engine SHALL 显示游戏标题画面，包含游戏名称、操作说明和开始按钮
6. WHEN 游戏结束, THE Game_Engine SHALL 显示结算画面，包含得分、统计数据和重新开始按钮
7. THE Game_Engine SHALL 为每款游戏提供粒子特效、动画过渡和音效反馈
8. THE Game_Engine SHALL 为每款游戏提供至少3个难度等级（简单、普通、困难）
9. WHEN 用户在移动端玩游戏, THE Game_Engine SHALL 自动显示虚拟操控按钮并适配屏幕尺寸
10. THE Game_Engine SHALL 为每款游戏支持存档功能，游戏进度保存在IndexedDB中并支持跨设备同步
11. THE Game_Engine SHALL 为每款游戏提供全球排行榜（存储在D1数据库中）

---

### 需求 7: 多平台游戏分类目录

**用户故事:** 作为星聚用户，我希望游戏中心按照PC、手机、NS、PS、Xbox等平台进行分类，以便快速找到我感兴趣的平台游戏。

#### 验收标准

1. THE Game_Catalog SHALL 提供以下游戏平台分类：PC游戏、手机游戏、Nintendo Switch游戏、PlayStation游戏、Xbox游戏、网页游戏
2. WHEN 用户选择某个平台分类, THE Game_Catalog SHALL 展示该平台下的所有游戏列表
3. THE Game_Catalog SHALL 为每款游戏展示名称、封面图、平台标签、游戏类型、评分和简介
4. WHEN 用户在游戏目录中搜索, THE Game_Catalog SHALL 支持按游戏名称、类型和平台进行筛选
5. THE Game_Catalog SHALL 支持按热度、评分、最新上架和名称排序
6. WHEN 用户点击网页游戏, THE Game_Catalog SHALL 直接在浏览器内启动该游戏
7. WHEN 用户点击非网页游戏（PC/NS/PS/Xbox）, THE Game_Catalog SHALL 展示该游戏的详情页，包含介绍、截图、下载或购买链接
8. THE Game_Catalog SHALL 在游戏中心首页展示"精选推荐"和"最近更新"板块

---

### 需求 8: 音乐聚合播放应用

**用户故事:** 作为星聚用户，我希望在平台内拥有一个聚合多个音乐源的播放器，以便在一个地方搜索和播放来自不同平台的音乐，同时在浏览其他内容时后台听歌。

#### 验收标准

1. THE Music_Aggregator SHALL 在后端聚合尽可能多的免费音乐源（包括但不限于网易云音乐、QQ音乐、酷狗音乐、酷我音乐、虾米音乐、咪咕音乐、Spotify、SoundCloud、Bandcamp、Jamendo、Free Music Archive、YouTube Music音频提取等公开接口或第三方聚合API），所有聚合逻辑在后端实现，前端仅调用后端 API
2. WHEN 用户在音乐搜索框中输入关键词, THE Music_Aggregator SHALL 在后端同时向所有已配置的音乐源发起搜索并合并结果，前端通过 `GET /api/music/search` 获取聚合结果
3. THE Music_Aggregator SHALL 在搜索结果中标注每首歌曲的来源平台名称
4. WHEN 用户点击一首歌曲, THE Music_Player SHALL 通过后端 API 代理获取音频流并开始播放，前端不直接请求第三方音乐平台域名，同时在页面底部显示迷你播放条
5. WHILE 音乐正在播放, THE Music_Player SHALL 在迷你播放条中显示歌曲名称、歌手、专辑封面、播放进度、暂停/播放按钮和上一首/下一首按钮
6. WHEN 用户点击迷你播放条, THE Music_Player SHALL 展开为全屏播放界面，显示专辑封面、歌词和完整控制面板
7. THE Music_Player SHALL 支持播放模式切换：顺序播放、单曲循环、随机播放和列表循环
8. THE Music_Player SHALL 支持创建、编辑和删除自定义播放列表
9. WHILE 用户浏览星聚平台的其他页面, THE Music_Player SHALL 在后台持续播放音乐不中断
10. WHEN 用户上传本地音乐文件（MP3/FLAC/WAV）, THE Music_Player SHALL 将文件存储到用户的音乐库中（R2存储）
11. IF 某个音乐源的歌曲加载失败, THEN THE Music_Player SHALL 自动尝试从其他音乐源获取同一首歌曲，若全部失败则跳过并播放下一首
12. THE Music_Player SHALL 支持歌词显示（LRC格式），并在播放时同步滚动歌词
13. IF 某个音乐源响应超时（超过8秒）, THEN THE Music_Aggregator SHALL 跳过该源并展示其他源的结果
14. THE Music_Aggregator SHALL 对搜索结果进行去重处理，相同歌曲仅展示音质最高的一条
15. THE Content_Rating SHALL 对音乐内容按MPAA分级区分：纯音乐/儿歌默认G级、流行/摇滚/民谣默认PG级、含轻微粗口或暗示歌词默认PG-13级、含明显粗口或性暗示歌词（Explicit标记）默认R级、成人ASMR/音声作品/成人广播剧强制NC-17级

---

### 需求 9: 电视端APP适配

**用户故事:** 作为星聚用户，我希望在电视上使用星聚APP观看视频和听音乐，以获得大屏沉浸式体验；作为老年用户，我希望有专门的老人模式让操作更简单。

#### 验收标准

1. THE TV_App SHALL 提供适配电视大屏的专用布局，使用大字体、大卡片和高对比度设计
2. THE TV_App SHALL 通过Focus_Navigation支持遥控器方向键（上下左右）和确认键进行所有操作
3. WHEN 用户在电视端打开视频, THE TV_App SHALL 使用自有Video_Player播放视频，禁止跳转到第三方应用
4. WHEN 用户在电视端打开音乐, THE TV_App SHALL 使用自有Music_Player播放音乐
5. THE TV_App SHALL 在首页展示视频推荐、游戏入口、音乐入口、漫画入口和直播入口
6. WHILE 电视端播放视频, THE TV_App SHALL 支持遥控器快捷操作（确认键暂停/播放、左右键快进快退、上下键调节音量）
7. THE TV_App SHALL 通过Capacitor打包为Android TV APK，安装包大小不超过30MB
8. IF 电视端网络连接中断, THEN THE TV_App SHALL 显示网络断开提示并在网络恢复后自动重连
9. THE TV_App SHALL 在启动时显示星聚品牌启动画面，加载时间不超过3秒
10. THE TV_App SHALL 提供老人模式（Elder_Mode），可在设置中切换或首次启动时选择
11. WHEN 老人模式激活, THE Elder_Mode SHALL 使用超大字体（至少24px基础字号）、超大按钮和极简布局，每屏最多展示4-6个大卡片
12. WHEN 老人模式激活, THE Elder_Mode SHALL 将导航简化为：看电视（视频）、听音乐、听戏曲、看新闻四大入口
13. WHEN 老人模式激活, THE Elder_Mode SHALL 支持语音搜索和语音控制（"播放xxx"、"下一个"、"暂停"等语音指令）
14. WHEN 老人模式激活, THE Elder_Mode SHALL 自动过滤所有PG-13及以上内容，仅展示G和PG级内容
15. WHEN 老人模式激活, THE Elder_Mode SHALL 在视频播放结束后自动播放下一个推荐内容，无需用户操作
16. THE Elder_Mode SHALL 提供大号遥控器按键映射说明页面，用简单图示教老人如何操作

---

### 需求 10: 视频源管理与配置

**用户故事:** 作为星聚管理员，我希望能够管理和配置视频聚合的数据源，以便灵活添加或移除免费视频网站。

#### 验收标准

1. THE Video_Aggregator SHALL 支持通过配置文件定义视频源，每个源包含名称、搜索API地址、解析规则和优先级
2. WHEN 管理员添加新的视频源配置, THE Video_Aggregator SHALL 在下次搜索时包含该新源
3. WHEN 管理员禁用某个视频源, THE Video_Aggregator SHALL 在搜索时跳过该源
4. THE Video_Aggregator SHALL 为每个视频源维护健康状态，记录最近的响应时间和成功率
5. IF 某个视频源连续3次请求失败, THEN THE Video_Aggregator SHALL 自动将该源标记为不可用并在1小时后重试

---

### 需求 11: 统一播放历史与收藏

**用户故事:** 作为星聚用户，我希望在一个地方查看我在所有视频源上的播放历史和收藏，以便快速找到之前看过或收藏的内容。

#### 验收标准

1. THE Video_Player SHALL 在用户观看视频时自动记录播放历史，包含视频标题、来源、观看时间和播放进度
2. WHEN 用户打开播放历史页面, THE Video_Player SHALL 按时间倒序展示所有来源的播放记录
3. WHEN 用户点击收藏按钮, THE Video_Player SHALL 将当前视频添加到收藏列表
4. THE Video_Player SHALL 支持按视频来源（本站/B站/YouTube/免费源）筛选播放历史和收藏
5. WHEN 用户从播放历史中点击某个视频, THE Video_Player SHALL 从上次播放进度处继续播放
6. THE Video_Player SHALL 将播放历史和收藏数据存储在Cloudflare D1数据库中，支持跨设备同步

---

### 需求 12: 经典模拟器游戏增强

**用户故事:** 作为星聚用户，我希望经典模拟器（FC/SFC/GBA等）的游戏体验更加完善，包括更好的视觉滤镜和操控体验。

#### 验收标准

1. THE EmulatorWrapper SHALL 继续使用Nostalgist库作为模拟器核心，支持NES、SNES、GBA、Genesis、Arcade等11种平台
2. THE EmulatorWrapper SHALL 提供至少4种视觉滤镜（原始像素、CRT扫描线、平滑插值、LCD效果）
3. WHEN 用户在移动端使用模拟器, THE EmulatorWrapper SHALL 显示可自定义布局的虚拟按键
4. THE EmulatorWrapper SHALL 支持即时存档和读档，存档数据保存在IndexedDB中
5. WHEN 用户上传ROM文件, THE EmulatorWrapper SHALL 自动识别ROM平台类型并选择对应的模拟器核心
6. THE EmulatorWrapper SHALL 支持金手指代码的添加和管理
7. THE EmulatorWrapper SHALL 支持多人联机游戏（通过WebRTC P2P连接）

---

### 需求 13: 全平台适配与分发

**用户故事:** 作为星聚用户，我希望在Web浏览器、PC桌面（Windows）、macOS、Android手机、iPhone、Android TV等所有设备上都能使用星聚平台，以获得一致的跨设备体验。

#### 验收标准

1. THE Platform_Shell SHALL 以Web（Next.js PWA）为核心，通过Capacitor打包Android/iOS/Android TV原生应用，通过Electron打包Windows/macOS桌面应用
2. THE Platform_Shell SHALL 确保所有平台共享同一套核心业务代码，仅在平台特定功能（如通知、文件系统、硬件加速）上使用平台适配层
3. WHEN 用户在Android/iOS设备上安装星聚APP, THE Platform_Shell SHALL 支持推送通知、后台音乐播放和本地文件访问
4. WHEN 用户在PC/macOS桌面端使用星聚, THE Platform_Shell SHALL 支持系统托盘常驻、全局快捷键和窗口管理
5. THE Platform_Shell SHALL 在所有平台上保持一致的深色主题UI和交互体验
6. WHEN 用户在移动端（Android/iOS）使用星聚, THE Platform_Shell SHALL 适配安全区域（safe-area）、手势导航和屏幕旋转
7. WHEN 用户在桌面端（Web/PC/macOS）使用星聚, THE Platform_Shell SHALL 提供侧边栏导航布局，充分利用大屏空间
8. THE Platform_Shell SHALL 支持自动更新检测，桌面端和移动端在有新版本时提示用户更新
9. THE Platform_Shell SHALL 确保Android APK不超过30MB、iOS IPA不超过50MB、桌面安装包不超过80MB

---

### 需求 14: 美国MPAA式内容分级与未成年人保护

**用户故事:** 作为星聚平台的家长用户，我希望平台采用美国MPAA式内容分级制度，为未成年人设置内容访问限制，确保孩子只能看到适龄内容；同时作为成人用户，我希望有完整的内容导航入口。

#### 验收标准

1. THE Content_Rating SHALL 采用美国MPAA五级分级制度为所有内容（视频、游戏、音乐、漫画、小说、直播、播客）标记分级：
   - G（General Audiences / 大众级）：所有年龄段均可观看，无任何不适内容
   - PG（Parental Guidance / 辅导级）：建议家长陪同观看，可能含轻微不适内容
   - PG-13（Parents Strongly Cautioned / 特别辅导级）：13岁以下儿童不宜，可能含较强暴力或轻微性暗示
   - R（Restricted / 限制级）：17岁以下需家长陪同，含暴力、粗口或性相关内容
   - NC-17（Adults Only / 成人级）：仅限18岁以上成人，含明确成人内容
2. THE Age_Gate SHALL 在用户首次使用时要求选择用户模式：
   - 儿童模式（12岁以下）：仅可访问G级内容
   - 青少年模式（13-16岁）：可访问G、PG、PG-13级内容
   - 成熟模式（17岁）：可访问G、PG、PG-13、R级内容
   - 成人模式（18岁以上）：可访问所有级别内容（G、PG、PG-13、R、NC-17）
   - 老人模式（60岁以上）：可访问所有G、PG级内容，使用超大字体简化界面
3. WHEN 用户选择儿童模式, THE Age_Gate SHALL 仅展示G级内容，隐藏所有PG及以上内容，并使用简化的儿童友好界面
4. WHEN 用户选择青少年模式, THE Age_Gate SHALL 展示G、PG、PG-13级内容，隐藏R和NC-17级内容
5. WHEN 用户选择成熟模式, THE Age_Gate SHALL 展示G、PG、PG-13、R级内容，隐藏NC-17级内容
6. WHEN 用户选择成人模式, THE Age_Gate SHALL 展示所有级别内容，并在导航栏提供完整的分类入口（包含成人专区）
7. THE Age_Gate SHALL 支持通过6位数字密码锁定当前模式，防止未成年人自行切换到更高级别模式
8. WHEN 管理员上传或添加内容, THE Content_Rating SHALL 要求为该内容设置MPAA分级标签
9. THE Content_Rating SHALL 对聚合源内容自动分级：A站默认G级、B站默认PG级、YouTube默认PG级、免费影视源默认PG-13级、主流游戏默认PG级、主流动漫默认PG-13级、成人视频源强制NC-17级、成人漫画源强制NC-17级、成人小说源强制NC-17级、成人直播源强制NC-17级、成人音乐源强制NC-17级、成人游戏源强制NC-17级、成人动漫源强制NC-17级、成人服务/社交/约会板块强制NC-17级
10. WHILE 儿童模式或青少年模式激活, THE Age_Gate SHALL 限制每日使用时长（可由家长配置，默认儿童1.5小时、青少年3小时）
11. WHEN 每日使用时长达到限制, THE Age_Gate SHALL 显示时间到期提示并锁定平台，需要家长密码解锁
12. THE Age_Gate SHALL 在所有平台（Web/PC/macOS/Android/iOS/TV）上保持一致的保护行为
13. WHEN 成人模式用户打开平台, THE Age_Gate SHALL 在导航栏展示完整的内容分区入口，包括视频中心、游戏中心、音乐中心、漫画中心、小说中心、动漫中心、直播中心、播客中心和成人专区（成人视频、成人动漫、成人漫画、成人小说、成人直播、成人音乐、成人游戏、服务验证、求职招聘、成人社交、约会交友）
14. THE Content_Rating SHALL 在每个内容卡片上显示对应的MPAA分级标签图标（G/PG/PG-13/R/NC-17）
15. WHILE 儿童模式激活, THE Age_Gate SHALL 禁用搜索功能中的成人关键词，并对搜索结果进行二次过滤
16. THE Age_Gate SHALL 提供家长控制面板，支持查看使用时长统计、内容访问记录和手动调整允许的最高分级
17. THE Content_Rating SHALL 对每种内容类型执行以下细化分级标准：
    - 视频分级：无暴力无性暗示→G、轻微暴力或轻微粗口→PG、较强暴力或轻微性暗示或频繁粗口→PG-13、明显暴力或性场景或大量粗口→R、明确色情内容→NC-17
    - 音乐分级：纯音乐/儿歌→G、流行/摇滚/民谣→PG、含轻微粗口或暗示歌词→PG-13、含明显粗口或性暗示歌词（Explicit标记）→R、成人ASMR/音声作品/成人广播剧→NC-17
    - 漫画分级：儿童漫画/全年龄→G、少年漫画/轻微暴力→PG、较强暴力或轻微性暗示→PG-13、明显暴力或性暗示→R、成人漫画/里番→NC-17
    - 小说分级：儿童文学→G、青少年文学→PG、含暴力或轻微性描写→PG-13、含明显暴力或性描写→R、成人小说/情色文学→NC-17
    - 游戏分级：ESRB E→G、ESRB E10+→PG、ESRB T→PG-13、ESRB M→R、ESRB AO或成人游戏→NC-17
    - 直播分级：教育/知识/户外→G、娱乐/游戏→PG、含轻微暴力游戏或擦边内容→PG-13、含明显暴力或性暗示→R、成人直播→NC-17
    - 播客分级：教育/科技/新闻→G、娱乐/访谈→PG、含粗口或敏感话题→PG-13、含明显粗口或性话题（Explicit标记）→R、成人播客/性教育/成人故事→NC-17
18. THE Content_Rating SHALL 影响搜索行为：搜索引擎在返回结果前根据用户当前分级模式过滤超出权限的内容，搜索建议和热门搜索词同样按分级过滤，儿童模式下搜索关键词黑名单包含所有成人相关词汇
19. THE Content_Rating SHALL 影响推荐行为：推荐引擎仅推荐用户当前分级模式允许的内容，推荐算法不使用超出用户分级的内容作为协同过滤输入，儿童模式下推荐仅基于G级内容的观看历史
20. THE Content_Rating SHALL 影响导航和UI展示：
    - 儿童模式：隐藏所有PG及以上内容入口，导航仅显示"动画片"、"儿歌"、"益智游戏"三大入口，使用圆角大卡片和明亮配色
    - 青少年模式：隐藏R和NC-17内容入口，导航显示视频/音乐/漫画/小说/动漫/游戏/直播/播客，不显示成人专区
    - 成熟模式：隐藏NC-17内容入口，导航显示所有主流频道，不显示成人专区
    - 成人模式：显示所有入口，导航包含成人专区及其所有子模块
    - 老人模式：仅显示"看电视"、"听音乐"、"听戏曲"、"看新闻"四大入口，超大字体
21. THE Content_Rating SHALL 影响内容卡片展示：G级卡片使用绿色分级标签、PG级使用蓝色、PG-13使用黄色、R级使用橙色、NC-17使用红色，每个卡片右上角固定显示分级标签
22. THE Age_Gate SHALL 在模式切换时执行以下安全机制：
    - 从低级模式切换到高级模式（如儿童→青少年、青少年→成人）必须输入6位PIN验证
    - 从高级模式切换到低级模式（如成人→儿童）无需PIN，立即生效
    - 连续3次PIN输入错误后锁定切换功能30分钟
    - 切换模式后立即刷新当前页面，重新过滤所有可见内容
    - 模式切换记录写入家长控制面板的操作日志
23. THE Age_Gate SHALL 提供完整的家长控制面板功能：
    - 使用时长统计：按日/周/月展示各内容类型的使用时长图表
    - 内容访问记录：展示最近30天的内容访问日志（标题、类型、分级、时间）
    - 手动调整最高分级：家长可在当前模式基础上进一步限制最高分级（如青少年模式下限制为仅PG）
    - 时段限制：设置允许使用的时间段（如仅允许18:00-21:00使用）
    - 内容黑名单：家长可手动屏蔽特定内容或特定来源
    - 应用锁定：家长可锁定特定模块（如锁定游戏中心）
    - 家长控制面板本身需要PIN验证才能进入

---

### 需求 15: 音乐源管理与配置

**用户故事:** 作为星聚管理员，我希望能够管理和配置音乐聚合的数据源，以便灵活添加或移除音乐平台接口。

#### 验收标准

1. THE Music_Aggregator SHALL 支持通过配置文件定义音乐源，每个源包含名称、搜索API地址、解析规则和优先级
2. WHEN 管理员添加新的音乐源配置, THE Music_Aggregator SHALL 在下次搜索时包含该新源
3. WHEN 管理员禁用某个音乐源, THE Music_Aggregator SHALL 在搜索时跳过该源
4. THE Music_Aggregator SHALL 为每个音乐源维护健康状态，记录最近的响应时间和成功率
5. IF 某个音乐源连续3次请求失败, THEN THE Music_Aggregator SHALL 自动将该源标记为不可用并在1小时后重试

---

### 需求 16: AcFun（A站）视频接入

**用户故事:** 作为星聚用户，我希望在平台内直接观看AcFun的视频内容，以便聚合更多国内二次元和创作者视频。

#### 验收标准

1. WHEN 用户在视频中心选择A站分类, THE AcFun_Adapter SHALL 展示A站热门视频列表和推荐内容
2. WHEN 用户点击A站视频卡片, THE Video_Player SHALL 通过A站嵌入播放器或Cloudflare代理在当前页面内播放该视频
3. WHEN A站视频播放完毕且该视频属于多集系列, THE AutoPlay_Engine SHALL 自动播放该系列的下一集
4. WHEN A站视频播放完毕且该视频不属于多集系列, THE AutoPlay_Engine SHALL 自动播放该UP主的下一个视频或推荐视频
5. THE AcFun_Adapter SHALL 展示每个视频的标题、封面、播放量、时长和UP主信息
6. WHEN 用户搜索A站视频, THE AcFun_Adapter SHALL 通过关键词在A站视频库中检索并返回匹配结果
7. THE Content_Rating SHALL 将所有A站视频默认标记为大众级（G级），所有用户模式均可访问
8. IF A站嵌入播放器加载失败, THEN THE AcFun_Adapter SHALL 显示错误提示并提供"在A站打开"的跳转链接

---

### 需求 17: 成人视频源聚合

**用户故事:** 作为星聚成人用户，我希望在成人专区内聚合多个成人视频网站的内容，以便在一个平台上搜索和观看。

#### 验收标准

1. THE Adult_Video_Adapter SHALL 在后端聚合尽可能多的成人视频网站（包括但不限于Pornhub、XVideos、XNXX、YouPorn、RedTube、Tube8、SpankBang、EPorner、HQPorner、Naughty America、Brazzers免费区、xHamster、ThisAV、JAVHD、Missav、Jable等），所有聚合和代理逻辑在后端实现，通过Cloudflare Workers代理访问
2. WHEN 成人模式用户在成人专区搜索视频, THE Adult_Video_Adapter SHALL 在后端同时向所有已配置的成人视频源发起搜索并合并结果，前端仅调用后端 API
3. THE Adult_Video_Adapter SHALL 在搜索结果中标注每个视频的来源站点名称
4. WHEN 用户点击成人视频搜索结果, THE Backend_Proxy SHALL 通过后端 API 代理视频流，前端通过后端返回的代理 URL 在当前页面内播放该视频，前端不直接请求成人网站域名
5. THE Content_Rating SHALL 将所有成人视频源内容自动标记为成人级（NC-17）
6. WHEN 非成人模式用户尝试访问成人专区, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
7. THE Adult_Video_Adapter SHALL 支持多标签组合筛选，用户可同时选择多个标签进行精确筛选：
   - 地区/产地：日本AV、欧美、国产、韩国、东南亚、印度、拉美、俄罗斯、非洲
   - 视频类型：剧情片、纯色情、动画/3D/CG、业余自拍、直播录像、偷拍、VR、ASMR、按摩店实拍、酒店偷拍
   - 题材标签：校园、职场/OL、家庭/人妻、户外、制服（护士/女仆/教师/空姐/JK）、角色扮演、SM/BDSM（捆绑/鞭打/蜡烛/窒息）、群交/乱交、同性（男同/女同）、变装/伪娘、人妖/跨性别、老少配、黑人、巨乳、贫乳、肛交、口交/深喉、颜射、中出/内射、足交、丝袜、乳交、按摩、催眠、NTR/寝取、痴女、痴汉、露出、触手（动画）、怀孕、母乳
   - 演员特征：人种（亚洲/白人/黑人/拉丁/混血）、体型（纤细/匀称/丰满/BBW/肌肉）、年龄段（18-20/20-25/25-30/30-40/40+/熟女）、胸部（贫乳/普通/巨乳/超巨乳）
   - 画质：4K/1080p/720p/480p
   - 时长：短片（<10分钟）、中片（10-30分钟）、长片（30-60分钟）、全片电影（>60分钟）
   - 排序：热度、最新、评分、播放量、时长、随机
8. IF 某个成人视频源响应超时（超过10秒）, THEN THE Adult_Video_Adapter SHALL 跳过该源并展示其他源的结果
9. THE Adult_Video_Adapter SHALL 将所有代理请求通过Cloudflare Workers处理，确保NAS真实IP不暴露

---

### 需求 18: 漫画聚合阅读平台

**用户故事:** 作为星聚用户，我希望在平台内聚合多个漫画源进行在线阅读，以便在一个地方搜索和阅读来自不同网站的漫画。

#### 验收标准

1. THE Comic_Aggregator SHALL 在后端聚合尽可能多的主流漫画源（包括但不限于漫画柜、动漫之家、拷贝漫画、包子漫画、奇妙漫画、漫画DB、MangaDex、MangaReader、MangaKakalot、MangaPark、Webtoon、快看漫画、腾讯动漫、有妖气等），所有聚合逻辑在后端实现，前端仅调用后端 API
2. WHEN 用户在漫画搜索框中输入关键词, THE Comic_Aggregator SHALL 在后端同时向所有已配置的漫画源发起搜索并合并结果，前端通过 `GET /api/comic/search` 获取聚合结果
3. THE Comic_Aggregator SHALL 在搜索结果中标注每部漫画的来源站点名称
4. WHEN 用户点击漫画搜索结果, THE Comic_Reader SHALL 在当前页面内打开漫画阅读器并加载该漫画章节
5. THE Comic_Reader SHALL 支持两种阅读模式：翻页模式（左右翻页）和条漫模式（上下滚动）
6. THE Comic_Reader SHALL 支持双指缩放、双击放大和拖拽平移手势
7. WHEN 用户阅读完当前章节, THE Comic_Reader SHALL 自动提示并加载下一章节
8. THE Comic_Reader SHALL 支持书签功能，记录用户阅读进度并支持跨设备同步（D1数据库存储）
9. THE Comic_Aggregator SHALL 为每部漫画展示封面、标题、作者、类型标签、更新状态和章节列表
10. THE Comic_Aggregator SHALL 支持按类型（热血、恋爱、搞笑、冒险等）和更新状态（连载中/已完结）筛选
11. IF 某个漫画源响应超时（超过10秒）, THEN THE Comic_Aggregator SHALL 跳过该源并展示其他源的结果
12. THE Comic_Aggregator SHALL 对搜索结果进行去重处理，相同漫画仅展示画质最高的一条
13. THE Content_Rating SHALL 将主流漫画源内容默认标记为大众级（G级）或辅导级（PG级），由管理员按需调整

---

### 需求 19: 成人漫画源聚合

**用户故事:** 作为星聚成人用户，我希望在成人专区内聚合多个成人漫画网站的内容，以便在一个平台上搜索和阅读。

#### 验收标准

1. THE Adult_Comic_Adapter SHALL 在后端聚合尽可能多的成人漫画网站（包括但不限于E-Hentai、nhentai、Hitomi、Pururin、HentaiNexus、Tsumino、Hentai2Read、MangaHentai、Luscious、HentaiFox、IMHentai等），所有聚合和代理逻辑在后端实现，通过Cloudflare Workers代理访问
2. WHEN 成人模式用户在成人漫画专区搜索, THE Adult_Comic_Adapter SHALL 在后端同时向所有已配置的成人漫画源发起搜索并合并结果，前端仅调用后端 API
3. THE Adult_Comic_Adapter SHALL 在搜索结果中标注每部漫画的来源站点名称
4. WHEN 用户点击成人漫画搜索结果, THE Comic_Reader SHALL 在当前页面内打开阅读器并加载该漫画
5. THE Content_Rating SHALL 将所有成人漫画源内容自动标记为成人级（NC-17）
6. WHEN 非成人模式用户尝试访问成人漫画专区, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
7. THE Adult_Comic_Adapter SHALL 支持多标签组合筛选：
   - 类型/题材：纯爱、后宫、触手、NTR/寝取、百合、耽美/BL、校园、奇幻、调教/SM、凌辱、痴女、人妻/熟女、巨乳、贫乳、萝莉风、正太风、怀孕、母乳、催眠、肛交、群交、人外/怪物、全彩、黑白
   - 语言：中文翻译、英文翻译、日文原版、韩文原版
   - 画风：日漫、韩漫（竖屏彩漫）、欧美、国漫、同人志
   - 页数：短篇（<30页）、中篇（30-100页）、长篇（>100页）
   - 排序：热度、最新、评分、收藏数、随机
8. IF 某个成人漫画源响应超时（超过10秒）, THEN THE Adult_Comic_Adapter SHALL 跳过该源并展示其他源的结果
9. THE Adult_Comic_Adapter SHALL 将所有代理请求通过Cloudflare Workers处理，确保NAS真实IP不暴露

---

### 需求 20: 漫画源管理与配置

**用户故事:** 作为星聚管理员，我希望能够管理和配置漫画聚合的数据源，以便灵活添加或移除漫画网站接口。

#### 验收标准

1. THE Comic_Aggregator SHALL 支持通过配置文件定义漫画源，每个源包含名称、搜索API地址、解析规则、内容分级和优先级
2. WHEN 管理员添加新的漫画源配置, THE Comic_Aggregator SHALL 在下次搜索时包含该新源
3. WHEN 管理员禁用某个漫画源, THE Comic_Aggregator SHALL 在搜索时跳过该源
4. THE Comic_Aggregator SHALL 为每个漫画源维护健康状态，记录最近的响应时间和成功率
5. IF 某个漫画源连续3次请求失败, THEN THE Comic_Aggregator SHALL 自动将该源标记为不可用并在1小时后重试
6. THE Comic_Aggregator SHALL 在源配置中支持设置默认MPAA分级（G/PG/PG-13/R/NC-17），成人漫画源强制为NC-17级

---

### 需求 21: 更多视频平台接入

**用户故事:** 作为星聚用户，我希望平台尽可能多地聚合各种视频网站，以便在一个入口看到所有平台的内容。

#### 验收标准

1. THE Video_Aggregator SHALL 在后端接入尽可能多的视频平台（通过Cloudflare Workers代理），所有聚合和代理逻辑在后端实现，前端仅调用后端 API，包括但不限于：
   - Twitch（游戏直播和VOD回放）
   - Dailymotion（海外视频平台）
   - Vimeo（高质量创作者视频）
   - 抖音/TikTok（短视频）
   - 快手（短视频）
   - 西瓜视频（中长视频）
   - 优酷/爱奇艺/腾讯视频/芒果TV（通过免费资源站间接聚合）
   - Niconico（日本弹幕视频）
   - Rumble（海外替代视频平台）
   - PeerTube（去中心化视频平台）
   - Odysee/LBRY（区块链视频平台）
   - 搜狐视频、PPTV、乐视视频（国内长视频）
   - 好看视频、微视（国内短视频）
   - 韩剧TV、人人视频（海外剧集资源）
   - 低端影视、茶杯狐、电影天堂等（免费影视聚合站）
   - 以及管理员后续通过配置文件新增的任意视频源
2. THE Video_Aggregator SHALL 为每个视频平台提供独立的分类标签页，用户可按平台浏览
3. THE Video_Aggregator SHALL 在全局搜索中同时搜索所有已接入的视频平台
4. WHEN 用户点击任意平台的视频, THE Video_Player SHALL 在当前页面内统一播放，保持一致的播放体验
5. THE AutoPlay_Engine SHALL 对所有新接入的视频平台同样生效（下一集/推荐/频道视频）
6. THE Content_Rating SHALL 为每个新接入平台设置默认MPAA分级：Twitch默认PG-13、抖音/快手默认PG、Niconico默认PG

---

### 需求 22: 动漫聚合平台

**用户故事:** 作为星聚用户，我希望有一个专门的动漫频道，聚合多个番剧/动漫资源站，以便追番和补番。

#### 验收标准

1. THE Anime_Aggregator SHALL 在后端聚合尽可能多的动漫资源站（包括但不限于樱花动漫、AGE动漫、OmoFun、Anime1、AnimePahe、GoGoAnime、9Anime、AnimeDao、Zoro.to、Crunchyroll免费区、动漫花园、萌番组、简单动漫等），所有聚合逻辑在后端实现，前端仅调用后端 API
2. WHEN 用户在动漫频道搜索, THE Anime_Aggregator SHALL 在后端同时向所有已配置的动漫源发起搜索并合并结果，前端通过 `GET /api/anime/search` 获取聚合结果
3. THE Anime_Aggregator SHALL 提供新番时间表，按星期展示当季新番的更新时间
4. THE Anime_Aggregator SHALL 为每部动漫展示封面、标题、集数、类型标签、评分、更新状态和简介
5. WHEN 用户点击动漫搜索结果, THE Video_Player SHALL 在当前页面内播放该动漫集数
6. WHEN 动漫播放完毕, THE AutoPlay_Engine SHALL 自动播放下一集
7. THE Anime_Aggregator SHALL 支持多标签组合筛选，用户可同时选择多个类型标签（如"热血+机甲"、"恋爱+校园"等），按类型（热血、恋爱、搞笑、机甲、异世界、后宫、百合、耽美、恐怖、运动、音乐、日常、奇幻、科幻、悬疑、治愈等）、年份、产地（日漫/国漫/美漫/韩漫）和状态（连载中/已完结）筛选
8. THE Anime_Aggregator SHALL 提供"追番列表"功能，用户可将动漫加入追番列表并在有新集更新时收到提醒
9. THE Content_Rating SHALL 将动漫内容默认标记为PG-13级，由管理员按需调整
10. IF 某个动漫源响应超时（超过10秒）, THEN THE Anime_Aggregator SHALL 跳过该源并展示其他源的结果

---

### 需求 23: 小说聚合阅读平台

**用户故事:** 作为星聚用户，我希望在平台内聚合多个免费小说源进行在线阅读，以便在一个地方搜索和阅读网络小说。

#### 验收标准

1. THE Novel_Aggregator SHALL 在后端聚合尽可能多的免费小说源（包括但不限于笔趣阁、69书吧、全本小说网、顶点小说、八一中文网、书趣阁、飘天文学、UU看书、小说旗、无错小说网、落秋中文、Novel Updates、Light Novel World、ReadNovelFull等），所有聚合逻辑在后端实现，前端仅调用后端 API
2. WHEN 用户在小说搜索框中输入关键词, THE Novel_Aggregator SHALL 在后端同时向所有已配置的小说源发起搜索并合并结果，前端通过 `GET /api/novel/search` 获取聚合结果
3. THE Novel_Aggregator SHALL 在搜索结果中标注每部小说的来源站点名称
4. WHEN 用户点击小说搜索结果, THE Novel_Reader SHALL 在当前页面内打开阅读器并加载该小说章节
5. THE Novel_Reader SHALL 支持字体大小调节（至少5档）、字体选择、行间距调节和页面背景色切换（白天/夜间/护眼/羊皮纸）
6. THE Novel_Reader SHALL 支持翻页模式（左右翻页）和滚动模式（上下滚动）
7. WHEN 用户阅读完当前章节, THE Novel_Reader SHALL 自动提示并加载下一章节
8. THE Novel_Reader SHALL 支持书签功能，记录用户阅读进度并支持跨设备同步（D1数据库存储）
9. THE Novel_Aggregator SHALL 为每部小说展示封面、标题、作者、类型标签、字数、更新状态和章节列表
10. THE Novel_Aggregator SHALL 支持按类型（玄幻、都市、科幻、历史、言情等）和更新状态筛选
11. THE Novel_Reader SHALL 支持TTS语音朗读功能，用户可选择朗读语速和语音类型
12. IF 某个小说源响应超时（超过10秒）, THEN THE Novel_Aggregator SHALL 跳过该源并展示其他源的结果
13. THE Content_Rating SHALL 将小说内容默认标记为PG级，由管理员按需调整

---

### 需求 24: 播客聚合平台

**用户故事:** 作为星聚用户，我希望在平台内收听来自多个播客平台的节目，以便在一个地方发现和收听播客。

#### 验收标准

1. THE Podcast_Aggregator SHALL 在后端聚合尽可能多的播客平台（包括但不限于Apple Podcasts、Spotify Podcasts、小宇宙、喜马拉雅、蜻蜓FM、荔枝FM、Google Podcasts、Pocket Casts、Overcast、Castbox、Podcast Addict等）的节目目录，所有聚合逻辑在后端实现，前端仅调用后端 API
2. WHEN 用户在播客搜索框中输入关键词, THE Podcast_Aggregator SHALL 在后端搜索所有已配置的播客源并合并结果，前端通过 `GET /api/podcast/search` 获取聚合结果
3. THE Podcast_Aggregator SHALL 为每个播客节目展示封面、标题、主播、节目描述、单集列表和订阅数
4. WHEN 用户点击播客单集, THE Music_Player SHALL 在迷你播放条中播放该音频（复用音乐播放器组件）
5. THE Podcast_Aggregator SHALL 支持订阅播客节目，新单集更新时在用户的订阅列表中显示
6. THE Podcast_Aggregator SHALL 支持按分类（科技、商业、教育、娱乐、新闻等）浏览
7. WHILE 播客正在播放, THE Music_Player SHALL 支持1.0x/1.25x/1.5x/2.0x倍速播放
8. THE Podcast_Aggregator SHALL 记录用户的收听进度，支持断点续听
9. THE Content_Rating SHALL 将播客内容默认标记为PG级

---

### 需求 25: 直播聚合平台

**用户故事:** 作为星聚用户，我希望在平台内观看来自多个直播平台的直播内容，以便在一个地方浏览所有直播。

#### 验收标准

1. THE Live_Aggregator SHALL 在后端聚合尽可能多的直播平台（包括但不限于斗鱼、虎牙、B站直播、Twitch、YouTube Live、抖音直播、快手直播、花椒直播、映客直播、企鹅电竞、CC直播、AfreecaTV、Kick、Facebook Gaming等）的直播间列表，所有聚合逻辑在后端实现，前端仅调用后端 API
2. WHEN 用户在直播中心浏览, THE Live_Aggregator SHALL 通过后端 API 展示各平台正在直播的热门直播间
3. THE Live_Aggregator SHALL 为每个直播间展示封面、主播名称、直播标题、观看人数和平台来源标签
4. WHEN 用户点击直播间, THE Backend_Proxy SHALL 通过后端 API 代理直播流，前端通过后端返回的代理 URL 在当前页面内播放该直播流，前端不直接请求直播平台域名
5. THE Live_Aggregator SHALL 支持按分类（游戏、娱乐、户外、学习、音乐等）和平台筛选
6. THE Live_Aggregator SHALL 支持关注主播，关注的主播开播时在用户的关注列表中高亮显示
7. WHILE 直播正在播放, THE Video_Player SHALL 显示实时弹幕（如果源平台支持）
8. THE Content_Rating SHALL 将直播内容默认标记为PG-13级
9. IF 某个直播平台的代理连接失败, THEN THE Live_Aggregator SHALL 显示错误提示并提供"在原平台打开"的跳转链接

---

### 需求 26: 离线下载与缓存

**用户故事:** 作为星聚用户，我希望能够将视频、音乐、漫画和小说下载到本地，以便在没有网络时也能使用。

#### 验收标准

1. THE Download_Manager SHALL 支持将视频、音乐、漫画章节和小说章节下载到本地设备
2. WHEN 用户点击下载按钮, THE Download_Manager SHALL 在后台开始下载并在下载管理页面显示进度
3. THE Download_Manager SHALL 支持同时下载多个任务，并允许暂停、恢复和取消下载
4. WHEN 下载完成, THE Download_Manager SHALL 将内容存储在设备本地（移动端使用Capacitor文件系统，桌面端使用Electron本地存储，Web端使用IndexedDB/Cache API）
5. WHEN 用户在离线状态下打开已下载的内容, THE Download_Manager SHALL 直接从本地加载播放/阅读
6. THE Download_Manager SHALL 在下载管理页面展示所有已下载内容，支持按类型（视频/音乐/漫画/小说）筛选
7. THE Download_Manager SHALL 支持设置下载画质（视频：360p/720p/1080p）和下载音质（音乐：标准/高品质/无损）
8. THE Download_Manager SHALL 显示已下载内容占用的存储空间，并支持批量删除

---

### 需求 27: 全局统一搜索

**用户故事:** 作为星聚用户，我希望在一个搜索框中同时搜索所有类型的内容（视频、音乐、漫画、小说、游戏、直播、播客），以便快速找到想要的内容。

#### 验收标准

1. THE Search_Hub SHALL 在平台顶部提供全局搜索框，一次搜索同时查询所有内容类型
2. WHEN 用户输入搜索关键词, THE Search_Hub SHALL 同时向视频、音乐、漫画、小说、游戏、直播、播客等所有聚合引擎发起搜索
3. THE Search_Hub SHALL 将搜索结果按内容类型分组展示（视频区、音乐区、漫画区、小说区、游戏区、直播区、播客区）
4. THE Search_Hub SHALL 在每个分组中展示前5条结果，并提供"查看更多"链接跳转到对应频道的完整搜索结果
5. THE Search_Hub SHALL 支持搜索历史记录和热门搜索推荐
6. THE Search_Hub SHALL 支持搜索建议（输入时实时显示匹配的关键词建议）
7. THE Search_Hub SHALL 根据当前用户的MPAA分级模式过滤搜索结果，不展示超出用户权限的内容
8. THE Search_Hub SHALL 支持按内容类型筛选搜索结果（仅看视频/仅看音乐/仅看漫画等）

---

### 需求 28: 用户个性化推荐

**用户故事:** 作为星聚用户，我希望平台能根据我的观看/收听/阅读历史推荐我可能感兴趣的内容。

#### 验收标准

1. THE Search_Hub SHALL 在平台首页展示个性化推荐内容，基于用户的播放历史、收藏和浏览行为
2. THE Search_Hub SHALL 为每个内容频道（视频、音乐、漫画、小说）提供"猜你喜欢"推荐板块
3. THE Search_Hub SHALL 支持"不感兴趣"反馈，用户可标记不想看到的推荐内容
4. THE Search_Hub SHALL 根据用户的MPAA分级模式限制推荐内容的范围
5. THE Search_Hub SHALL 在用户无历史数据时展示热门内容和编辑精选作为默认推荐

---

### 需求 29: 弹幕与评论系统

**用户故事:** 作为星聚用户，我希望在观看视频时能发送和查看弹幕，以及在所有内容下方发表评论，以获得社交互动体验。

#### 验收标准

1. THE Video_Player SHALL 支持弹幕功能，用户可在视频播放时发送实时弹幕
2. THE Video_Player SHALL 支持弹幕样式设置（颜色、字体大小、滚动/顶部/底部位置）
3. THE Video_Player SHALL 支持弹幕密度调节和一键关闭弹幕
4. THE Video_Player SHALL 将弹幕数据存储在Cloudflare D1数据库中，同一视频的弹幕对所有用户可见
5. THE Search_Hub SHALL 为所有内容（视频、音乐、漫画、小说、游戏）提供评论区
6. THE Search_Hub SHALL 支持评论的点赞、回复和举报功能
7. THE Content_Rating SHALL 对弹幕和评论内容进行基础关键词过滤，屏蔽违规内容

---

### 需求 30: 成人小说源聚合

**用户故事:** 作为星聚成人用户，我希望在成人专区内聚合多个成人小说网站的内容，以便在一个平台上搜索和阅读成人小说。

#### 验收标准

1. THE Adult_Novel_Adapter SHALL 在后端聚合尽可能多的成人小说网站（包括但不限于禁忌书屋、69书吧成人区、H小说网、成人文学城、Literotica、AO3成人分区、Novelcool成人区等），所有聚合和代理逻辑在后端实现，通过Cloudflare Workers代理访问
2. WHEN 成人模式用户在成人小说专区搜索, THE Adult_Novel_Adapter SHALL 在后端同时向所有已配置的成人小说源发起搜索并合并结果，前端仅调用后端 API
3. THE Adult_Novel_Adapter SHALL 在搜索结果中标注每部小说的来源站点名称
4. WHEN 用户点击成人小说搜索结果, THE Novel_Reader SHALL 在当前页面内打开阅读器并加载该小说（复用小说阅读器组件）
5. THE Content_Rating SHALL 将所有成人小说源内容自动标记为成人级（NC-17）
6. WHEN 非成人模式用户尝试访问成人小说专区, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
7. THE Adult_Novel_Adapter SHALL 支持多标签组合筛选：
   - 类型/题材：纯爱、后宫、NTR/寝取、百合、耽美/BL、校园、奇幻、都市、古代/宫廷、科幻、调教/SM、凌辱、人妻、催眠、换妻、群交、人外/怪物、穿越+色情、修仙+色情、末日+色情
   - 语言：中文、英文、日文
   - 字数范围：短篇（<5万字）、中篇（5-20万字）、长篇（20-100万字）、超长篇（>100万字）
   - 状态：连载中/已完结
   - 排序：热度、最新、评分、字数、收藏数
8. IF 某个成人小说源响应超时（超过10秒）, THEN THE Adult_Novel_Adapter SHALL 跳过该源并展示其他源的结果
9. THE Adult_Novel_Adapter SHALL 将所有代理请求通过Cloudflare Workers处理，确保NAS真实IP不暴露

---

### 需求 31: 成人直播源聚合

**用户故事:** 作为星聚成人用户，我希望在成人专区内聚合多个成人直播平台的内容，以便在一个平台上浏览和观看成人直播。

#### 验收标准

1. THE Adult_Live_Adapter SHALL 在后端聚合尽可能多的成人直播平台（包括但不限于Chaturbate、StripChat、BongaCams、LiveJasmin、CamSoda、MyFreeCams、Flirt4Free等），所有聚合和代理逻辑在后端实现，通过Cloudflare Workers代理访问
2. WHEN 成人模式用户在成人直播专区浏览, THE Adult_Live_Adapter SHALL 通过后端 API 展示各平台正在直播的热门直播间
3. THE Adult_Live_Adapter SHALL 为每个直播间展示封面、主播名称、直播标题、观看人数和平台来源标签
4. WHEN 用户点击成人直播间, THE Video_Player SHALL 通过Cloudflare代理在当前页面内播放该直播流
5. THE Content_Rating SHALL 将所有成人直播源内容自动标记为成人级（NC-17）
6. WHEN 非成人模式用户尝试访问成人直播专区, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
7. THE Adult_Live_Adapter SHALL 支持按以下完整维度筛选：
   - 主播性别：女主播、男主播、跨性别、情侣
   - 主播特征：人种（亚洲/白人/黑人/拉丁/混血）、体型（纤细/匀称/丰满/BBW/肌肉）、年龄段（18-20/20-25/25-30/30-40/40+/熟女）
   - 直播类型：脱衣秀、聊天互动、情侣表演、群体表演、SM表演、户外直播、ASMR
   - 平台来源：Chaturbate/StripChat/BongaCams/LiveJasmin/CamSoda/MyFreeCams/Flirt4Free
   - 排序：观看人数、最新开播、评分
8. IF 某个成人直播平台的代理连接失败, THEN THE Adult_Live_Adapter SHALL 显示错误提示并提供"在原平台打开"的跳转链接
9. THE Adult_Live_Adapter SHALL 将所有代理请求通过Cloudflare Workers处理，确保NAS真实IP不暴露

---

### 需求 32: 统一源管理后台

**用户故事:** 作为星聚管理员，我希望有一个统一的后台界面来管理所有聚合源（视频、音乐、漫画、小说、动漫、直播、播客），而不是分散在多个配置文件中。

#### 验收标准

1. THE Search_Hub SHALL 提供统一的源管理后台页面，集中管理所有类型的聚合源
2. THE Search_Hub SHALL 在源管理后台中按类型分组展示所有已配置的源：视频源、音乐源、漫画源、小说源、动漫源、直播源、播客源
3. THE Search_Hub SHALL 为每个源展示名称、类型、MPAA分级、健康状态（在线/离线/降级）、平均响应时间和成功率
4. WHEN 管理员在后台添加新源, THE Search_Hub SHALL 要求填写源名称、类型、搜索API地址、解析规则、MPAA分级和优先级
5. THE Search_Hub SHALL 支持一键测试源的连通性和搜索功能
6. THE Search_Hub SHALL 支持批量启用/禁用源
7. THE Search_Hub SHALL 提供源健康监控仪表盘，展示所有源的实时状态和历史可用性图表

---

### 需求 33: 成人音乐源聚合

**用户故事:** 作为星聚成人用户，我希望在成人专区内聚合含有露骨内容的音乐资源，以便在一个安全的平台上收听而不被第三方网站欺骗。

#### 验收标准

1. THE Adult_Music_Adapter SHALL 在后端聚合含有露骨歌词/内容的音乐源（包括但不限于各平台的Explicit标记歌曲、成人向ASMR音频、成人广播剧、DLsite音声作品、Pornhub音频区等），所有聚合和代理逻辑在后端实现，通过Cloudflare Workers代理访问
2. WHEN 成人模式用户在成人音乐专区搜索, THE Adult_Music_Adapter SHALL 在后端同时向所有已配置的成人音乐源发起搜索并合并结果，前端仅调用后端 API
3. THE Adult_Music_Adapter SHALL 在搜索结果中标注每首音频的来源平台名称
4. WHEN 用户点击成人音乐搜索结果, THE Music_Player SHALL 在迷你播放条中播放该音频（复用音乐播放器组件）
5. THE Content_Rating SHALL 将所有成人音乐源内容自动标记为成人级（NC-17）
6. WHEN 非成人模式用户尝试访问成人音乐专区, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
7. THE Adult_Music_Adapter SHALL 支持多标签组合筛选：
   - 类型：成人ASMR（耳语/舔耳/心跳/呼吸/触发音）、成人广播剧（纯爱/NTR/SM/百合/耽美）、音声作品（催眠/调教/女友体验/姐姐体验）、Explicit歌曲（说唱/R&B/流行）、成人催眠音频、性爱环境音
   - 语言：中文、英文、日文、韩文
   - 声优性别：女声、男声、双人、多人
   - 时长：短音频（<10分钟）、中音频（10-30分钟）、长音频（>30分钟）
   - 排序：热度、最新、评分、时长
8. IF 某个成人音乐源响应超时（超过8秒）, THEN THE Adult_Music_Adapter SHALL 跳过该源并展示其他源的结果
9. THE Adult_Music_Adapter SHALL 将所有代理请求通过Cloudflare Workers处理，确保NAS真实IP不暴露

---

### 需求 34: 成人游戏源聚合

**用户故事:** 作为星聚成人用户，我希望在成人专区内聚合成人向游戏资源，以便在一个安全的平台上发现和游玩成人游戏而不被第三方网站欺骗。

#### 验收标准

1. THE Adult_Game_Adapter SHALL 在后端聚合尽可能多的成人游戏平台和资源站（包括但不限于DLsite、DMM Games、Nutaku、Itch.io成人区、F95Zone、Lewdzone、Newgrounds成人区、成人HTML5游戏站、成人Flash游戏站、成人WebGL游戏站等），所有聚合和代理逻辑在后端实现，通过Cloudflare Workers代理访问
2. WHEN 成人模式用户在成人游戏专区浏览, THE Adult_Game_Adapter SHALL 展示各平台的成人游戏列表，按游戏类型分类（视觉小说、RPG、模拟经营、动作、解谜、卡牌、格斗、射击、策略、养成、换装等）
3. THE Adult_Game_Adapter SHALL 为每款成人游戏展示封面、标题、开发者、类型标签、评分、简介和是否支持网页在线玩
4. WHEN 用户点击网页可玩的成人游戏（HTML5/WebGL/Ren'Py Web等）, THE Adult_Game_Adapter SHALL 直接在浏览器内启动该游戏，支持全屏和键盘/触摸操控
5. WHEN 用户点击非网页成人游戏, THE Adult_Game_Adapter SHALL 展示该游戏的详情页，包含介绍、截图和下载链接
6. THE Adult_Game_Adapter SHALL 优先收录可在网页内直接游玩的成人游戏，确保每个游戏类型都有网页可玩的成人游戏
7. THE Game_Engine SHALL 为以下每个游戏类型各自研一款完整的成人版网页游戏（NC-17级，仅成人模式可玩）：
   - 成人视觉小说：多分支剧情、CG回收、多结局
   - 成人RPG：冒险+色情剧情、装备系统、Boss战+色情奖励
   - 成人模拟经营：经营成人场所、NPC互动、剧情解锁
   - 成人动作格斗：格斗+色情奖励、多角色、连招系统
   - 成人卡牌对战：收集成人卡牌、对战、卡牌升级
   - 成人解谜：解谜+色情奖励、多关卡
   - 成人养成：角色养成+亲密度系统、多角色路线
   - 成人换装：角色换装/脱衣、自定义外观
   - 成人沙盒：自由建造+成人互动元素
   - 纯色情休闲：简单操作的纯色情小游戏合集
6. THE Content_Rating SHALL 将所有成人游戏源内容自动标记为成人级（NC-17）
7. WHEN 非成人模式用户尝试访问成人游戏专区, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
8. THE Adult_Game_Adapter SHALL 支持多标签组合筛选，用户可同时选择多个标签精确筛选：
   - 游戏类型：视觉小说、RPG、模拟经营、动作、解谜、卡牌、格斗、射击、策略、养成、换装/脱衣、沙盒、跑酷、消除、节奏、塔防
   - 题材标签：纯色情、热血+色情、恋爱+色情、奇幻+色情、校园+色情、后宫、NTR、百合、耽美、触手、调教/SM、凌辱、人妻、催眠、怀孕、人外/怪物
   - 画风：2D日式动漫、3D写实、像素风、欧美卡通、Live2D
   - 语言：中文、英文、日文、韩文
   - 是否网页可玩：仅看网页游戏 / 仅看下载游戏 / 全部
   - 排序：热度、评分、最新、随机
9. IF 某个成人游戏源响应超时（超过10秒）, THEN THE Adult_Game_Adapter SHALL 跳过该源并展示其他源的结果
10. THE Adult_Game_Adapter SHALL 将所有代理请求通过Cloudflare Workers处理，确保NAS真实IP不暴露

---

### 需求 35: 游戏内容MPAA分级

**用户故事:** 作为星聚用户，我希望游戏中心的所有游戏都有明确的MPAA分级标签，以便根据年龄选择合适的游戏。

#### 验收标准

1. THE Game_Catalog SHALL 为所有游戏（网页游戏、经典模拟器游戏、PC/NS/PS/Xbox游戏）标记MPAA分级
2. THE Game_Catalog SHALL 对网页小游戏（2048、贪吃蛇、俄罗斯方块等）默认标记为G级
3. THE Game_Catalog SHALL 对经典模拟器游戏根据原始游戏内容标记分级：大部分FC/SFC/GBA游戏默认PG级，含暴力内容的默认PG-13级
4. THE Game_Catalog SHALL 对PC/NS/PS/Xbox游戏参考原始ESRB分级映射到MPAA分级：E→G、E10+→PG、T→PG-13、M→R、AO→NC-17
5. WHEN 用户在儿童模式下浏览游戏中心, THE Game_Catalog SHALL 仅展示G级游戏
6. WHEN 用户在青少年模式下浏览游戏中心, THE Game_Catalog SHALL 展示G、PG、PG-13级游戏
7. THE Game_Catalog SHALL 在每个游戏卡片上显示MPAA分级标签图标

---

### 需求 36: 成人服务验证与点评平台

**用户故事:** 作为星聚成人用户，我希望平台提供一个成人服务（如SPA、按摩等）的验证与点评系统，所有内容均为第三方自由投稿（非平台提供），包含服务者的详细资料（外貌、技能、人种等），以便通过真实用户的验证和评价来辨别真假，避免被骗。

#### 验收标准

0. THE Adult_Service_Platform SHALL 在板块顶部明确声明：所有服务信息均为第三方用户自由投稿，平台仅提供信息展示和验证工具，不直接提供任何服务，不对服务质量和安全性负责

1. THE Adult_Service_Platform SHALL 在成人专区内提供"服务验证"板块，用户可浏览和搜索已提交的成人服务者/商家信息
2. THE Adult_Service_Platform SHALL 为每个服务者/商家展示以下信息：
   - 基本信息：艺名/昵称、国籍、所在国家/地区/城市、服务类型标签、验证状态（已验证/未验证/待验证）
   - 外貌特征：人种/族裔（亚洲人、白人、黑人、拉丁裔、混血等）、身高、体重、体型（纤细/匀称/丰满/健壮等）、发色、瞳色、五官描述、胸围/腰围/臀围三围数据
   - 年龄范围（如20-25岁）
   - 语言能力（如中文、英文、日文、韩文等，标注流利程度）
   - 服务类型大类和技能标签（结构化分类）：
     - SPA/按摩类：精油按摩、泰式按摩、足疗、全身按摩、头部按摩、热石按摩、淋巴排毒、四手按摩、情侣按摩、前列腺按摩
     - 陪伴类：陪聊、陪玩、陪逛街、陪旅行、陪健身、陪看电影、商务陪同、宴会陪同、翻译陪同、旅游向导
     - 表演/娱乐类：舞蹈表演、脱衣舞、钢管舞、唱歌、DJ、模特、私人派对表演、生日派对表演
     - 健康/美容类：瑜伽教练、私人教练、美容护理、美甲、身体护理、减压理疗
     - 成人全套服务类：全套服务（GFE女友体验）、半套服务（手交/口交）、口交服务、肛交服务、69服务、多次服务、过夜服务
     - 特殊服务类：SM/BDSM服务（女王/奴隶/捆绑/鞭打/蜡烛）、角色扮演（护士/女仆/教师/秘书/学生）、制服诱惑、足交服务、丝袜服务、乳交服务、颜射服务、吞精服务、深喉服务
     - 多人服务类：双人服务（双飞）、多人服务（3P/群交）、情侣交换、双性服务
     - 长期关系类：包月包养、长期情人、固定约会、Sugar Daddy/Sugar Baby关系、旅行伴侣（长期）
     - 线上服务类：视频聊天、语音陪聊、在线表演、定制视频/照片、sexting（文字调情）、虚拟女友/男友体验、在线SM指导
     - 场所服务类：上门服务（酒店/住宅）、到店服务（会所/工作室）、车内服务、户外服务
   - 特殊技能/卖点描述（自由文本）
   - 服务价格范围（按时计费/按次计费/套餐价格）
   - 可用时间段和预约方式
   - 服务地点类型（上门服务/到店服务/均可）
   - 照片（已验证照片带验证标记，未验证照片带未验证水印）
   - 综合评分和评价数量
   - 入驻时间和最近活跃时间
3. WHEN 服务者提交个人资料, THE Adult_Service_Platform SHALL 要求填写以上所有必填字段，并将状态标记为"待验证"
4. THE Adult_Service_Platform SHALL 支持服务者上传个人照片（最多10张），照片存储在R2中
5. THE Adult_Service_Platform SHALL 要求服务者完成以下多级验证流程：
   - 第一级 — 视频实人验证：服务者必须上传一段实时自拍视频（至少10秒），视频中需手持当日日期手写纸条并做指定动作（如挥手/转头），系统通过AI人脸比对验证视频中的人与上传照片是否一致
   - 第二级 — 健康检测验证：服务者可上传近期（30天内）的性病/STD检测报告照片或试纸检测结果照片，上传后标记为"已提供健康证明"，过期30天后自动标记为"健康证明已过期"
   - 第三级 — 社区验证：已注册用户可对服务者提交验证报告（包含真实性评价：照片是否与本人一致、服务描述准确度、安全性评估、健康状况评价）
6. THE Adult_Service_Platform SHALL 在服务者资料页醒目展示验证等级徽章：
   - 未验证（灰色）：未完成任何验证
   - 视频已验证（蓝色）：已通过视频实人验证
   - 健康已验证（绿色）：已提供有效期内的健康证明
   - 社区已验证（金色）：收到至少3个正面社区验证报告
   - 全验证（钻石）：同时通过视频验证+健康验证+社区验证
7. WHEN 一个服务者收到至少3个正面社区验证报告, THE Adult_Service_Platform SHALL 将该服务者的社区验证状态更新为"已验证"
8. WHEN 一个服务者收到多个负面验证报告或被举报为欺诈, THE Adult_Service_Platform SHALL 将该服务者标记为"警告"或"已标记为欺诈"，并在列表中醒目提示
9. THE Adult_Service_Platform SHALL 对长期关系类服务（包月包养/Sugar Daddy-Baby等）强制要求完成视频实人验证和健康检测验证后才能发布
10. THE Adult_Service_Platform SHALL 支持消费者在交易前要求服务者进行实时视频通话验证（通过平台内WebRTC视频聊天），确认本人与照片一致
8. THE Adult_Service_Platform SHALL 支持用户对服务者发表匿名点评，包含评分（1-5星）、文字评价和标签（如"真实可靠"、"照片与本人一致"、"与描述不符"、"疑似欺诈"、"服务专业"等）
9. THE Adult_Service_Platform SHALL 在服务者详情页展示所有点评，按时间倒序排列，并显示验证报告摘要
10. THE Adult_Service_Platform SHALL 支持按国籍、所在国家/地区/城市、人种/族裔、服务类型、验证状态、评分、价格范围和语言筛选服务者
11. THE Adult_Service_Platform SHALL 支持举报功能，用户可举报虚假信息、照片欺骗或欺诈行为
12. THE Content_Rating SHALL 将成人服务验证板块自动标记为成人级（NC-17），仅成人模式可访问
13. WHEN 非成人模式用户尝试访问服务验证板块, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
14. THE Adult_Service_Platform SHALL 严格保护用户隐私，所有点评和验证报告默认匿名，不展示用户真实身份
15. THE Adult_Service_Platform SHALL 将所有数据存储在Cloudflare D1数据库中，图片存储在R2中
16. THE Adult_Service_Platform SHALL 支持服务者自主更新个人资料，更新后验证状态不变但新增内容标记为"待验证"

---

### 需求 37: 视频地区分类与筛选

**用户故事:** 作为星聚用户，我希望视频内容按地区/国家分类，以便快速找到特定地区的视频内容。

#### 验收标准

1. THE Region_Filter SHALL 为所有视频内容提供地区/国家标签，包括但不限于：中国大陆、中国港台、日本、韩国、美国、欧洲、东南亚、印度、拉美、其他
2. THE Region_Filter SHALL 在视频中心提供地区筛选栏，用户可按地区快速筛选视频
3. THE Region_Filter SHALL 对聚合源内容自动标记地区：B站/A站/抖音/快手默认"中国大陆"、YouTube默认"海外"（可细分）、Niconico默认"日本"、韩剧TV默认"韩国"
4. WHEN 用户在视频搜索中选择地区筛选, THE Video_Aggregator SHALL 仅展示匹配该地区的搜索结果
5. THE Region_Filter SHALL 在成人视频专区同样生效，支持按地区筛选成人视频内容
6. THE Region_Filter SHALL 支持多选地区（如同时选择"日本"和"韩国"）
7. THE Region_Filter SHALL 在动漫频道同样生效，支持按产地（日漫、国漫、美漫、韩漫等）筛选

---

### 需求 38: AI字幕与AI配音

**用户故事:** 作为星聚用户，我希望平台能为无字幕的视频自动生成AI字幕，并为外语视频自动生成中文配音，以便无障碍观看所有语言的视频内容。

#### 验收标准

1. THE AI_Subtitle SHALL 支持自动语音识别（ASR），为无字幕的视频自动生成原语言字幕
2. THE AI_Subtitle SHALL 支持自动翻译，将原语言字幕翻译为用户选择的目标语言（至少支持中文、英文、日文、韩文）
3. WHEN 用户在播放器中开启AI字幕, THE Video_Player SHALL 在视频底部显示AI生成的实时字幕
4. THE AI_Subtitle SHALL 支持字幕样式设置（字体大小、颜色、背景透明度、位置）
5. THE AI_Dubbing SHALL 支持为视频自动生成多语言AI配音，用户可选择目标语言
6. WHEN 用户在播放器中开启AI配音, THE Video_Player SHALL 将原始音轨音量降低并叠加AI配音音轨
7. THE AI_Dubbing SHALL 支持多种语音风格选择（男声/女声、语速调节）
8. THE AI_Subtitle SHALL 特别为成人视频创作者提供字幕补全功能，自动为无字幕的成人视频生成字幕
9. THE AI_Dubbing SHALL 特别为成人视频创作者提供配音补全功能，自动为无配音的成人视频生成配音
10. THE AI_Subtitle SHALL 通过Cloudflare Workers调用AI模型API（如Whisper、DeepL等），确保处理过程不暴露NAS真实IP
11. THE AI_Subtitle SHALL 支持用户手动校正AI生成的字幕，校正后的字幕可保存供其他用户使用
12. IF AI字幕或AI配音生成失败, THEN THE Video_Player SHALL 显示提示信息并允许用户手动上传字幕文件（SRT/ASS格式）

---

### 需求 39: 成人服务求职与招聘平台

**用户故事:** 作为成人服务从业者，我希望在星聚平台上安全地发布求职信息和寻找工作机会，以便在一个受保护的环境中发展职业而不被欺骗。

#### 验收标准

1. THE Adult_Service_Platform SHALL 在成人专区内提供"求职招聘"板块，分为"求职者"和"招聘方"两个子板块
2. THE Adult_Service_Platform SHALL 为求职者提供个人求职档案，包含以下字段：
   - 基本信息：艺名/昵称、国籍、当前所在国家/地区/城市、期望工作地区
   - 外貌特征：人种/族裔、身高、体重、体型、三围、发色、瞳色、五官描述
   - 年龄范围
   - 语言能力（语种及流利程度）
   - 工作经验描述（从业年限、曾任职场所类型）
   - 技能标签（复用需求36的结构化服务类型分类：SPA/按摩类、陪伴类、表演/娱乐类、健康/美容类、成人全套服务类、特殊服务类、多人服务类、长期关系类、线上服务类、场所服务类）
   - 期望薪资范围
   - 期望工作时间（全职/兼职/弹性）
   - 个人照片（最多10张）
   - 健康证明上传（可选，已上传标记为"已提供健康证明"）
   - 求职状态（求职中/已就业/暂停求职）
3. THE Adult_Service_Platform SHALL 为招聘方提供招聘信息发布功能，包含以下字段：
   - 商家/场所名称、所在国家/地区/城市
   - 场所类型标签（SPA会所、按摩店、夜总会、酒吧、私人会所等）
   - 招聘岗位描述和要求
   - 薪资范围和福利说明
   - 工作时间要求
   - 对求职者的外貌/技能/语言要求
   - 商家验证状态（已验证/未验证）
   - 联系方式（平台内私信，不暴露真实联系方式）
4. THE Adult_Service_Platform SHALL 支持求职者和招聘方通过平台内私信系统沟通，保护双方隐私
5. THE Adult_Service_Platform SHALL 支持求职者按国籍、地区、场所类型、薪资范围筛选招聘信息
6. THE Adult_Service_Platform SHALL 支持招聘方按国籍、人种/族裔、技能、语言、地区筛选求职者
7. THE Adult_Service_Platform SHALL 对招聘方实施验证机制：已验证的招聘方带验证标记，未验证的带警示提示
8. THE Adult_Service_Platform SHALL 支持用户对招聘方发表匿名点评（工作环境、薪资兑现、安全性等）
9. THE Adult_Service_Platform SHALL 提供安全提示板块，展示防骗指南、常见欺诈手段和维权信息
10. THE Adult_Service_Platform SHALL 支持举报虚假招聘信息和欺诈行为，被多次举报的招聘方自动标记为"警告"
11. THE Content_Rating SHALL 将求职招聘板块自动标记为成人级（NC-17），仅成人模式可访问
12. THE Adult_Service_Platform SHALL 严格保护求职者隐私，真实联系方式仅在双方同意后通过平台私信交换

---

### 需求 40: 成人服务安全保障体系

**用户故事:** 作为成人服务从业者或消费者，我希望平台提供完善的安全保障机制，包括防骗指南、黑名单系统和紧急求助功能，以确保交易安全。

#### 验收标准

1. THE Adult_Service_Platform SHALL 提供"安全中心"板块，包含防骗指南、常见欺诈手段识别教程和维权途径说明
2. THE Adult_Service_Platform SHALL 维护公开的黑名单系统，被多次举报并确认为欺诈的服务者/招聘方/消费者将被列入黑名单
3. THE Adult_Service_Platform SHALL 在黑名单中展示被拉黑者的基本信息（艺名、地区、欺诈类型描述），但不展示真实身份
4. THE Adult_Service_Platform SHALL 支持用户查询某个服务者/招聘方是否在黑名单中
5. THE Adult_Service_Platform SHALL 提供紧急求助按钮，从业者在遇到危险时可一键发送求助信息（包含当前位置）给预设的紧急联系人
6. THE Adult_Service_Platform SHALL 提供交易安全建议，包括建议在公共场所首次见面、告知朋友行程、保留沟通记录等
7. THE Adult_Service_Platform SHALL 对新注册的服务者和招聘方显示"新用户"标签，提醒消费者注意甄别
8. THE Adult_Service_Platform SHALL 支持信誉积分系统，根据验证状态、点评评分、活跃时长和举报记录计算信誉分

---

### 需求 41: 用户账户与多设备同步

**用户故事:** 作为星聚用户，我希望注册账户后在所有设备上登录都能同步我的数据（播放历史、收藏、书签、播放列表、设置等）。

#### 验收标准

1. THE Platform_Shell SHALL 支持用户注册和登录（仅支持邮箱注册，禁止第三方登录以保护用户隐私），密码使用bcrypt哈希存储
2. THE Platform_Shell SHALL 在用户登录后自动同步以下数据到所有设备：播放历史、收藏列表、书签、自定义播放列表、追番列表、MPAA分级模式设置、下载记录
3. THE Platform_Shell SHALL 支持游客模式，未登录用户可使用所有功能但数据仅保存在本地
4. THE Platform_Shell SHALL 禁止接入任何第三方登录（微信、QQ、Google、Apple ID等），避免第三方平台获取用户数据或被政府通过第三方追踪用户
5. THE Platform_Shell SHALL 注册时仅要求邮箱和密码，不强制要求手机号、真实姓名或任何身份信息
6. THE Platform_Shell SHALL 支持用户使用匿名邮箱（如ProtonMail、Tutanota等）注册
7. THE Platform_Shell SHALL 在用户设置页面提供账户管理功能：修改密码、导出个人数据、注销账户（注销后彻底删除所有数据）

---

### 需求 42: 通知与消息系统

**用户故事:** 作为星聚用户，我希望收到追番更新、关注主播开播、求职回复等通知，以便及时获取重要信息。

#### 验收标准

1. THE Platform_Shell SHALL 提供站内通知中心，展示所有未读通知
2. THE Platform_Shell SHALL 支持以下通知类型：追番/追剧更新提醒、关注主播开播提醒、求职招聘私信回复、系统公告、评论回复提醒
3. WHEN 用户在移动端（Android/iOS）安装星聚APP, THE Platform_Shell SHALL 支持推送通知
4. THE Platform_Shell SHALL 支持用户自定义通知偏好，可选择开启/关闭每种通知类型
5. THE Platform_Shell SHALL 在成人服务板块支持私信通知，求职者和招聘方的私信实时推送

---

### 需求 43: 成人社交帖子论坛

**用户故事:** 作为星聚成人用户，我希望在成人专区内有一个帖子论坛，以便与其他成人用户交流、分享经验和发布信息。

#### 验收标准

1. THE Adult_Social SHALL 在成人专区内提供"成人论坛"板块，用户可发布帖子、回复和互动
2. THE Adult_Social SHALL 支持以下论坛分区，每个分区有明确的主题定位：
   - 综合交流区：成人话题自由讨论、新人报到、平台建议
   - 经验分享区：服务体验分享、技巧交流、评测报告
   - 资源分享区：成人内容资源推荐、链接分享、字幕/翻译分享
   - 约会交友区：线上交友、线下约会邀约、活动组织
   - 从业者交流区：从业者互助、行业动态、安全经验
   - 安全提醒区：防骗预警、黑名单曝光、维权经验
   - 地区板块：按城市/地区细分的本地化讨论（如北京/上海/广州/深圳/成都/东京/曼谷/首尔等）
   - 兴趣小组：按兴趣细分（BDSM/角色扮演/情侣交换/同性交友等）
3. THE Adult_Social SHALL 为每个帖子展示标题、内容、发帖人（匿名或昵称）、发布时间、回复数和点赞数
4. THE Adult_Social SHALL 支持帖子内嵌图片和视频（图片存储在R2中）
5. THE Adult_Social SHALL 支持帖子置顶、加精和分类标签
6. THE Adult_Social SHALL 支持用户匿名发帖，默认使用随机生成的匿名ID
7. THE Adult_Social SHALL 支持举报违规帖子和用户
8. THE Content_Rating SHALL 将成人论坛自动标记为成人级（NC-17），仅成人模式可访问
9. THE Adult_Social SHALL 对帖子内容进行基础关键词过滤，屏蔽涉及未成年人的违规内容

---

### 需求 44: 成人私聊与视频聊天

**用户故事:** 作为星聚成人用户，我希望能与其他成人用户进行私聊和视频聊天，以便在安全的平台环境中社交。

#### 验收标准

1. THE Adult_Social SHALL 在成人专区内提供一对一私聊功能，支持文字、图片和语音消息
2. THE Adult_Social SHALL 支持一对一视频聊天功能，通过WebRTC P2P连接实现低延迟视频通话
3. THE Adult_Social SHALL 在视频聊天中支持虚拟背景和美颜滤镜
4. THE Adult_Social SHALL 支持用户设置在线状态（在线/忙碌/隐身/离线）
5. THE Adult_Social SHALL 支持聊天消息的阅后即焚功能（发送方可设置消息在对方阅读后自动删除的时间）
6. THE Adult_Social SHALL 支持屏蔽/拉黑用户功能，被屏蔽的用户无法发送消息或发起视频聊天
7. THE Adult_Social SHALL 将所有聊天消息端到端加密，平台服务器不存储明文消息内容
8. THE Content_Rating SHALL 将私聊和视频聊天功能自动标记为成人级（NC-17），仅成人模式可访问
9. THE Adult_Social SHALL 支持举报骚扰行为，被多次举报的用户将被限制社交功能

---

### 需求 45: 成人约会交友平台

**用户故事:** 作为星聚成人用户，我希望在平台上自由约会交友，包括线下见面，以便在安全的环境中认识新朋友。

#### 验收标准

1. THE Adult_Social SHALL 在成人专区内提供"约会交友"板块，用户可创建约会档案并浏览其他用户
2. THE Adult_Social SHALL 为约会档案提供以下字段：昵称、国籍、所在城市、年龄范围、性别、性取向（异性恋/同性恋/双性恋/泛性恋/其他）、人种/族裔、身高、体型（纤细/匀称/丰满/健壮/BBW）、兴趣标签、自我介绍、照片（最多6张）
3. THE Adult_Social SHALL 支持按以下完整维度筛选约会对象：
   - 地理位置：国家/城市、距离范围（同城/同省/同国/不限）
   - 基本条件：年龄范围、性别、性取向
   - 外貌特征：人种/族裔（亚洲/白人/黑人/拉丁/混血/不限）、身高范围、体型
   - 兴趣标签：运动/旅行/美食/电影/音乐/游戏/阅读/摄影/BDSM/角色扮演等
   - 约会目的：一夜情/短期约会/长期关系/开放关系/Sugar Daddy-Baby/纯聊天交友
   - 验证状态：仅看已验证用户/全部
   - 在线状态：仅看在线用户/全部
   - 排序：距离最近、最近活跃、信誉最高、最新注册
4. THE Adult_Social SHALL 支持"喜欢/不喜欢"滑动匹配机制，双方互相喜欢后自动开启聊天，并支持"超级喜欢"功能（对方会收到特别通知）
5. THE Adult_Social SHALL 支持发布约会活动（如聚会、派对等），其他用户可报名参加
6. THE Adult_Social SHALL 在约会档案中显示用户的信誉积分和验证状态
7. THE Adult_Social SHALL 提供线下见面安全提示：建议在公共场所见面、告知朋友行程、分享实时位置等
8. THE Content_Rating SHALL 将约会交友板块自动标记为成人级（NC-17），仅成人模式可访问
9. THE Adult_Social SHALL 严格保护用户隐私，真实联系方式仅在双方同意后交换

---

### 需求 46: 免费成人服务板块

**用户故事:** 作为星聚成人用户，我希望平台提供一个免费成人服务信息板块，以便从业者发布免费或公益性质的服务信息，消费者也能找到免费资源。

#### 验收标准

1. THE Adult_Service_Platform SHALL 在成人专区内提供"免费服务"板块，从业者可发布免费或公益性质的服务信息
2. THE Adult_Service_Platform SHALL 为免费服务信息提供以下字段：服务者昵称、国籍、所在城市、服务类型、服务描述、可用时间、联系方式（平台内私信）
3. THE Adult_Service_Platform SHALL 对免费服务信息同样实施社区验证机制，防止虚假信息
4. THE Adult_Service_Platform SHALL 在免费服务板块中明确标注"免费"标签，与付费服务区分
5. THE Adult_Service_Platform SHALL 支持用户对免费服务发表匿名点评
6. THE Adult_Service_Platform SHALL 支持按地区/城市、服务类型和验证状态筛选免费服务
7. THE Content_Rating SHALL 将免费服务板块自动标记为成人级（NC-17），仅成人模式可访问

---

### 需求 47: 隐私防护与反审查机制

**用户故事:** 作为星聚平台运营者，我希望平台具备多层隐私防护和反审查能力，确保用户数据安全、平台不被恶意攻击或审查，同时让所有地区的用户都能安全访问。

#### 验收标准

1. THE Privacy_Shield SHALL 确保所有用户流量通过Cloudflare CDN和Tunnel传输，NAS真实IP永远不可见（遵循项目宪法第二章）
2. THE Privacy_Shield SHALL 对所有用户数据进行加密存储，敏感数据（密码、私聊内容、联系方式）使用强加密算法
3. THE Privacy_Shield SHALL 不记录用户的真实IP地址，仅存储Cloudflare分配的匿名标识，服务器日志中禁止出现任何可追溯到用户真实身份的信息
4. THE Privacy_Shield SHALL 支持用户使用匿名账户，注册时不强制要求真实身份信息，不接入任何第三方登录以防止政府通过第三方平台追踪用户
5. THE Privacy_Shield SHALL 在成人专区的所有页面使用无痕模式提示，建议用户使用浏览器隐私模式访问
6. THE Privacy_Shield SHALL 支持多域名访问策略：平台使用多个备用域名（至少3个不同注册商的域名），当主域名被封锁时自动切换到备用域名
7. THE Privacy_Shield SHALL 通过Cloudflare Workers实现智能路由，自动检测用户所在地区并选择最优的访问路径，对受限地区自动启用额外的混淆层
8. THE Privacy_Shield SHALL 对敏感地区的用户提供额外的访问保护：
   - 成人专区入口不在首页直接展示，需要通过特定路径或搜索进入
   - 页面标题和URL不包含敏感关键词，使用中性化的路径命名（如用"/zone"代替敏感词）
   - 支持快速隐藏功能（快捷键一键切换到安全页面，如新闻或天气页面）
   - 浏览器标签页标题显示为中性内容（如"星聚 - 娱乐平台"）
   - 对来自敏感地区的流量不返回任何可被DPI（深度包检测）识别的敏感内容特征
9. THE Privacy_Shield SHALL 在Cloudflare层面启用DDoS防护、WAF防火墙和Bot管理，防止恶意攻击和政府级别的网络扫描
10. THE Privacy_Shield SHALL 确保平台代码中零硬编码IP、零明文密钥、零敏感信息（遵循项目宪法第二章和第七章）
11. THE Privacy_Shield SHALL 支持定期自动备份所有数据到多个地理位置的Cloudflare R2存储桶（至少2个不同地区），防止数据丢失
12. THE Privacy_Shield SHALL 提供平台运营者紧急响应方案：当检测到大规模攻击或审查时，自动启用备用域名和备用Cloudflare账户，并通知管理员
13. THE Privacy_Shield SHALL 对所有API请求实施速率限制，防止爬虫和暴力破解
14. THE Privacy_Shield SHALL 支持Tor浏览器访问，不屏蔽Tor出口节点的请求
15. THE Privacy_Shield SHALL 确保用户之间交换的联系方式（微信、QQ、Telegram、WhatsApp等）仅存储在端到端加密的私聊中，平台服务器无法读取
16. THE Privacy_Shield SHALL 对用户注销请求在72小时内彻底删除所有用户数据，不保留任何备份
17. THE Privacy_Shield SHALL 确保运营者身份完全匿名：
    - 域名注册使用隐私保护服务（Whois Privacy），注册信息不可查
    - Cloudflare账户使用匿名邮箱注册，不绑定真实身份
    - 所有域名通过不同注册商注册，避免单点关联
    - NAS通过Cloudflare Tunnel连接，运营商只能看到与Cloudflare的加密流量，无法识别NAS用途
    - 平台不设置任何"关于我们"、"联系方式"、"公司地址"等可追溯运营者身份的信息
    - 管理员登录入口使用隐蔽路径（非标准的/admin），且仅允许特定IP或Cloudflare Access授权访问
18. THE Privacy_Shield SHALL 确保NAS对运营商完全隐身：
    - NAS零公网端口，仅通过Cloudflare Tunnel出站连接
    - NAS的DNS请求通过加密DNS（DoH/DoT）发出，运营商无法看到DNS查询内容
    - NAS与Cloudflare之间的Tunnel流量与普通HTTPS流量无法区分
    - NAS上不运行任何可被端口扫描发现的服务
    - NAS的MAC地址和设备指纹不暴露给外部网络
19. THE Privacy_Shield SHALL 对所有用户生成内容（帖子、点评、验证报告、照片）进行EXIF元数据清除，防止通过照片元数据追踪用户位置

---

### 需求 48: 成人动漫（里番）聚合

**用户故事:** 作为星聚成人用户，我希望在成人专区内聚合多个成人动漫/里番资源站，以便在一个安全的平台上搜索和观看成人动漫。

#### 验收标准

1. THE Adult_Anime_Adapter SHALL 在后端聚合尽可能多的成人动漫/里番资源站（包括但不限于Hanime.tv、HentaiHaven、HentaiStream、Ohentai、Hentai.tv、AnimeidhentaI、9hentai等），所有聚合和代理逻辑在后端实现，通过Cloudflare Workers代理访问
2. WHEN 成人模式用户在成人动漫专区搜索, THE Adult_Anime_Adapter SHALL 在后端同时向所有已配置的成人动漫源发起搜索并合并结果，前端仅调用后端 API
3. THE Adult_Anime_Adapter SHALL 在搜索结果中标注每部动漫的来源站点名称
4. WHEN 用户点击成人动漫搜索结果, THE Video_Player SHALL 通过Cloudflare代理在当前页面内播放
5. THE Adult_Anime_Adapter SHALL 为每部成人动漫展示封面、标题、集数、类型标签、评分和简介
6. THE Adult_Anime_Adapter SHALL 支持多标签组合筛选，用户可同时选择多个类型标签（如"热血+色情"、"校园+后宫"、"奇幻+触手"等），按以下完整维度筛选：
   - 类型/题材：纯爱、后宫、触手、NTR/寝取、百合（女同）、耽美/BL（男同）、校园、奇幻/异世界、调教/SM、凌辱、痴女、痴汉、人妻/熟女、巨乳、贫乳、萝莉风、正太风、怀孕、母乳、催眠、肛交、群交/乱交、人外/怪物、机甲+色情、热血+色情、恐怖+色情、搞笑+色情、泳装、女仆、护士、教师、修女
   - 画风：日式动漫、3D/CG、像素风、欧美卡通
   - 集数：单集OVA、短篇（2-4集）、长篇（5集以上）
   - 年份：按年份筛选
   - 状态：连载中/已完结
   - 字幕：中文字幕/英文字幕/日文原声/无字幕
   - 排序：热度、最新、评分、随机
7. WHEN 成人动漫播放完毕, THE AutoPlay_Engine SHALL 自动播放下一集
8. THE Content_Rating SHALL 将所有成人动漫源内容自动标记为成人级（NC-17）
9. WHEN 非成人模式用户尝试访问成人动漫专区, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
10. IF 某个成人动漫源响应超时（超过10秒）, THEN THE Adult_Anime_Adapter SHALL 跳过该源并展示其他源的结果
11. THE Adult_Anime_Adapter SHALL 将所有代理请求通过Cloudflare Workers处理，确保NAS真实IP不暴露

---

### 需求 49: 所有视频类型的成人/非成人细分

**用户故事:** 作为星聚用户，我希望每种视频类型（电影、电视剧、综艺、纪录片、短视频等）都有明确的成人/非成人区分，以便在分级系统下精确筛选内容。

#### 验收标准

1. THE Video_Aggregator SHALL 为所有视频内容提供以下一级分类，每个分类内部再按MPAA分级区分：
   - 电影（G/PG/PG-13/R/NC-17）
   - 电视剧（G/PG/PG-13/R/NC-17）
   - 综艺/真人秀（G/PG/PG-13/R）
   - 纪录片（G/PG/PG-13/R）
   - 短视频（G/PG/PG-13/R/NC-17）
   - 动漫（G/PG/PG-13/R/NC-17，NC-17即里番）
   - MV/音乐视频（G/PG/PG-13/R/NC-17）
   - 教程/知识（G/PG/PG-13）
   - 体育/赛事（G/PG）
   - ASMR（G/PG/PG-13/R/NC-17）
   - Vlog/生活（G/PG/PG-13）
2. THE Video_Aggregator SHALL 在视频中心提供一级分类标签栏，用户可按视频类型浏览
3. WHEN 用户选择某个视频类型, THE Video_Aggregator SHALL 根据用户当前MPAA分级模式自动过滤不可见的分级内容
4. THE Video_Aggregator SHALL 在搜索结果中同时展示视频类型标签和MPAA分级标签
5. THE Content_Rating SHALL 对聚合源视频自动识别视频类型并标记，无法自动识别的默认标记为PG-13级

---

### 需求 50: 成人播客与音频内容

**用户故事:** 作为星聚成人用户，我希望播客频道也区分成人/非成人内容，以便在成人专区收听成人向播客和音频节目。

#### 验收标准

1. THE Podcast_Aggregator SHALL 对播客内容按MPAA分级区分，含有露骨内容的播客标记为R级或NC-17级
2. THE Podcast_Aggregator SHALL 在成人专区提供"成人播客"入口，展示NC-17级的播客节目（如成人访谈、性教育、成人故事等）
3. THE Podcast_Aggregator SHALL 对来自主流播客平台的Explicit标记节目自动标记为R级
4. WHEN 非成人模式用户浏览播客频道, THE Podcast_Aggregator SHALL 自动过滤R和NC-17级播客
5. THE Podcast_Aggregator SHALL 支持按分级筛选播客内容

---

### 需求 51: Telegram频道视频聚合

**用户故事:** 作为星聚用户，我希望平台能聚合Telegram公开频道中的视频和图片资源，以便不翻墙就能浏览和观看Telegram上的内容。

#### 验收标准

1. THE Video_Aggregator SHALL 支持在后端接入Telegram公开频道作为视频/图片源，通过Cloudflare Workers代理Telegram Bot API获取频道内容，前端仅调用后端 API
2. THE Video_Aggregator SHALL 支持管理员配置Telegram频道列表，每个频道包含频道ID、名称、内容类型和MPAA分级
3. THE Video_Aggregator SHALL 定期（可配置间隔，默认每30分钟）自动抓取已配置频道的新内容
4. THE Video_Aggregator SHALL 为Telegram频道内容自动提取视频、图片和文字描述，并按MPAA分级分类
5. WHEN 用户在视频中心选择Telegram分类, THE Video_Aggregator SHALL 展示所有已配置Telegram频道的内容列表
6. WHEN 用户点击Telegram视频, THE Video_Player SHALL 通过Cloudflare代理在当前页面内播放该视频
7. THE Video_Aggregator SHALL 对Telegram频道内容支持按频道名称、内容类型和MPAA分级筛选
8. THE Content_Rating SHALL 对Telegram频道内容按管理员配置的分级标记：普通频道默认PG级、成人频道强制NC-17级
9. THE Video_Aggregator SHALL 将所有Telegram API请求通过Cloudflare Workers处理，确保NAS真实IP不暴露
10. THE Video_Aggregator SHALL 支持Telegram频道内容的全文搜索

---

### 需求 52: NAS安全缓存与永久存储

**用户故事:** 作为星聚平台运营者，NAS 存储设备已部署到位，我希望将热门内容和重要资源安全地缓存到NAS上做永久存储，以提高访问速度并防止源站失效导致内容丢失，同时确保NAS数据不被发现。

#### 验收标准

1. THE NAS_Cache SHALL 已通过Cloudflare Tunnel部署就绪，作为平台内容缓存和永久存储层正式运行，所有缓存请求经过Cloudflare CDN → Cloudflare Tunnel → NAS，NAS零公网端口
2. THE NAS_Cache SHALL 支持管理员将热门视频/音乐/漫画/小说资源下载到NAS本地存储作为永久缓存，支持手动触发和自动策略两种缓存方式
3. THE NAS_Cache SHALL 对NAS上的所有缓存内容进行AES-256-GCM加密存储，加密密钥存储在Cloudflare Workers Secrets（`NAS_ENCRYPTION_KEY`），每个文件使用随机IV，即使NAS硬盘被物理获取也无法直接读取内容
4. THE NAS_Cache SHALL 将NAS缓存内容的文件名通过SHA-256哈希混淆处理，目录结构使用哈希前两位分桶（如 `a1/b2/a1b2c3d4.enc`），避免单目录文件过多
5. THE NAS_Cache SHALL 在Cloudflare D1的 `cache_index` 表中维护混淆文件名与原始内容的映射关系，支持快速查找和缓存命中判断
6. WHEN 用户请求已缓存的内容, THE NAS_Cache SHALL 查询 `cache_index` 表判断缓存命中，命中时从NAS读取加密文件并解密返回，同时更新 `access_count` 和 `last_accessed` 字段
7. WHEN NAS缓存未命中, THE NAS_Cache SHALL 从源站获取内容并返回给用户，同时异步将内容加密后缓存到NAS
8. THE NAS_Cache SHALL 支持管理员设置缓存策略：按内容类型设置缓存优先级、最大缓存空间（默认500GB）、自动清理策略（LRU/按时间/按访问频率）
9. THE NAS_Cache SHALL 对NAS的网络流量进行伪装，使运营商无法通过流量特征识别NAS上存储的内容类型：
   - 所有流量通过Cloudflare Tunnel加密传输，运营商只能看到与Cloudflare的加密连接
   - 流量速率限制和随机化延迟（默认500ms随机延迟），避免大量持续下载引起运营商注意
   - 支持设置每日最大带宽使用量（默认100GB/天），分散在全天各时段
10. THE NAS_Cache SHALL 支持NAS缓存数据的紧急销毁功能：管理员可通过 `POST /api/admin/cache/destroy` 远程一键删除所有缓存内容和索引数据库
11. THE NAS_Cache SHALL 支持NAS缓存数据的异地备份：定期将加密的缓存索引备份到Cloudflare R2，NAS损坏时可从R2恢复索引（内容需重新缓存）
12. THE NAS_Cache SHALL 确保NAS上不存储任何用户个人数据，仅存储内容缓存文件
13. THE NAS_Cache SHALL 与Video_Scraper协同工作，刮削下载的视频资源自动加密存储到NAS，并在 `cache_index` 中建立索引
14. THE NAS_Cache SHALL 提供缓存状态监控 API（`GET /api/admin/cache/status`），返回总文件数、总大小、命中率、NAS连接状态和按内容类型的分布统计

---

### 需求 53: 全局多标签组合筛选系统

**用户故事:** 作为星聚用户，我希望在所有内容频道中都能使用多标签组合筛选，以便精确找到我想要的内容组合（如"热血+色情动漫"或"纯色情网页游戏"）。

#### 验收标准

1. THE Search_Hub SHALL 提供统一的多标签筛选组件，所有内容频道（视频、动漫、漫画、小说、游戏、音乐、直播、播客）共用同一套筛选UI
2. THE Search_Hub SHALL 支持用户同时选择多个标签进行AND组合筛选（如选择"热血"+"色情"只展示同时包含两个标签的内容）
3. THE Search_Hub SHALL 支持标签分组展示：
   - 内容类型标签（电影/电视剧/动漫/短视频/MV等）
   - 题材/风格标签（热血/恋爱/搞笑/恐怖/色情/纯爱/NTR等）
   - 地区标签（日本/韩国/欧美/国产等）
   - MPAA分级标签（G/PG/PG-13/R/NC-17）
   - 平台来源标签（B站/YouTube/Telegram等）
4. THE Search_Hub SHALL 在用户选择标签后实时更新搜索结果，无需手动点击搜索
5. THE Search_Hub SHALL 记住用户最近使用的标签组合，方便快速复用
6. THE Search_Hub SHALL 根据用户当前MPAA分级模式自动隐藏不可见的标签（如儿童模式下隐藏"色情"、"R级"、"NC-17"等标签）
7. THE Search_Hub SHALL 在标签旁显示匹配的内容数量，帮助用户判断筛选结果
8. THE Search_Hub SHALL 支持保存自定义标签组合为"快捷筛选"，用户可一键应用常用的标签组合

---

### 需求 54: 自研成人网页游戏矩阵

**用户故事:** 作为星聚成人用户，我希望平台上每个游戏类型都有一款完整的成人版网页游戏，以展示平台的诚意。

#### 验收标准

1. THE Game_Engine SHALL 为所有自研成人网页游戏使用Canvas/WebGL渲染，帧率保持在60fps
2. THE Game_Engine SHALL 为每款成人游戏提供完整的游戏循环、存档系统和排行榜
3. THE Content_Rating SHALL 将所有自研成人游戏标记为NC-17级，仅成人模式可玩
4. WHEN 非成人模式用户尝试启动成人游戏, THE Age_Gate SHALL 拒绝访问并提示需要切换到成人模式
5. THE Game_Engine SHALL 为每款成人游戏提供至少2个难度等级
6. THE Game_Engine SHALL 为每款成人游戏支持键盘和触摸屏操控
7. THE Game_Engine SHALL 确保成人游戏的CG/图片资源存储在R2中，通过Cloudflare代理加载

---

### 需求 55: 后台管理系统

**用户故事:** 作为星聚平台管理员，我希望有一个完整的后台管理系统，以便集中管理平台的所有内容、用户、聚合源、分级和安全设置。

#### 验收标准

1. THE Admin_Panel SHALL 提供独立的管理员登录入口（/admin），使用独立的管理员账户体系，支持多管理员和权限分级
2. THE Admin_Panel SHALL 提供以下管理模块：
   - 仪表盘：平台总览（用户数、内容数、日活、带宽使用、NAS缓存状态）
   - 用户管理：查看用户列表、封禁/解封用户、查看用户举报记录、重置用户密码
   - 内容管理：查看/编辑/删除所有用户发布的内容（帖子、评论、弹幕、点评）
   - 聚合源管理：统一管理所有类型的聚合源（复用需求32的源管理后台）
   - MPAA分级管理：批量调整内容分级、设置聚合源默认分级、审核分级争议
   - 成人服务管理：审核服务者/招聘方资料、处理举报、管理黑名单、查看验证报告
   - 游戏管理：管理自研游戏配置、排行榜管理、游戏数据统计
   - 通知管理：发送系统公告、管理通知模板
   - 安全管理：查看安全日志、管理备用域名、配置WAF规则、管理速率限制
   - NAS缓存管理：查看缓存状态（文件数/总大小/命中率/NAS连接状态）、手动触发缓存/清理、配置缓存策略、紧急销毁
   - 视频刮削管理：查看刮削任务列表及状态、手动触发刮削、配置刮削规则（目标源/深度/画质/并发数/每日限额）、查看刮削统计（已刮削数量/已下载大小/成功率）、暂停/恢复/取消刮削任务
   - Telegram频道管理：添加/删除/配置Telegram频道、查看抓取状态
   - 数据统计：各频道访问量、搜索热词、用户行为分析、内容热度排行
3. THE Admin_Panel SHALL 支持管理员操作日志，记录所有管理操作的时间、操作者和操作内容
4. THE Admin_Panel SHALL 支持管理员权限分级：超级管理员（全部权限）、内容管理员（内容+分级）、源管理员（聚合源+缓存）、社区管理员（用户+举报+成人服务）
5. THE Admin_Panel SHALL 使用独立的认证token，与普通用户认证系统隔离
6. THE Admin_Panel SHALL 在所有管理操作前进行二次确认，敏感操作（删除数据、封禁用户、紧急销毁）需要输入管理员密码
7. THE Admin_Panel SHALL 支持移动端响应式布局，管理员可在手机上进行紧急操作
8. THE Admin_Panel SHALL 将所有管理数据存储在Cloudflare D1数据库中，管理员密码使用bcrypt哈希存储

---

### 需求 56: 无限制AI聊天助手

**用户故事:** 作为星聚用户，我希望平台内置一个无限制的AI聊天助手，可以回答任何问题、生成任何内容（包括成人内容），以获得完全自由的AI对话体验。

#### 验收标准

1. THE AI_Chat SHALL 在平台内提供AI聊天页面（`/ai`），用户可与AI进行无限制对话
2. THE AI_Chat SHALL 通过Cloudflare Workers代理调用OpenRouter API（使用环境变量`OPENROUTER_API_KEY`，禁止硬编码密钥）
3. THE AI_Chat SHALL 支持多轮对话，保持上下文连贯
4. THE AI_Chat SHALL 支持流式输出（Server-Sent Events），实时显示AI回复
5. THE AI_Chat SHALL 在成人模式下支持生成成人向内容（文字、故事、角色扮演等）
6. WHEN 非成人模式用户使用AI聊天, THE AI_Chat SHALL 自动添加内容安全提示词，过滤成人内容输出
7. THE AI_Chat SHALL 支持选择不同AI模型（通过OpenRouter的模型路由能力）
8. THE AI_Chat SHALL 支持保存聊天历史（存储在D1数据库中），用户可查看和继续之前的对话
9. THE AI_Chat SHALL 支持清除聊天历史
10. THE Content_Rating SHALL 将AI聊天的成人模式功能标记为NC-17级
11. THE AI_Chat SHALL 将所有API请求通过Cloudflare Workers处理，确保OpenRouter API Key不暴露给前端


---

### 需求 57: 后端统一聚合架构

**用户故事:** 作为星聚平台架构师，我希望所有内容聚合逻辑（视频、音乐、漫画、小说、动漫、直播、播客等）全部在后端实现，前端仅通过后端 API 获取聚合结果，以确保架构清晰、安全可控、便于维护。

#### 验收标准

1. THE Aggregation_Engine SHALL 将所有内容类型（视频、音乐、漫画、小说、动漫、直播、播客）的聚合逻辑全部在后端（Cloudflare Pages Functions）实现，前端代码中不包含任何直接访问第三方数据源的逻辑
2. THE Aggregation_Engine SHALL 为每种内容类型提供统一的后端搜索 API（如 `GET /api/video/search`、`GET /api/music/search`、`GET /api/comic/search` 等），前端通过这些 API 获取聚合搜索结果
3. THE Aggregation_Engine SHALL 为每种内容类型提供统一的后端详情 API（如 `GET /api/video/[id]`、`GET /api/comic/[id]` 等），前端通过这些 API 获取内容详情
4. THE Aggregation_Engine SHALL 为每种内容类型提供统一的后端流代理 API（如 `GET /api/video/stream/[id]`、`GET /api/music/stream/[id]` 等），前端通过后端返回的代理 URL 播放/加载内容
5. THE Aggregation_Engine SHALL 在后端统一处理源适配器的注册、搜索并发、结果合并、去重、超时处理和健康状态管理，前端无需关心聚合细节
6. THE Aggregation_Engine SHALL 确保前端代码中不存在任何第三方数据源的域名、API 地址或解析规则，所有源配置仅存储在后端（D1 数据库的 `source_config` 表）
7. WHEN 前端需要展示聚合内容, THE Aggregation_Engine SHALL 通过后端 API 返回已处理的标准化数据结构（`AggregatedItem`），前端仅负责 UI 渲染
8. IF 后端聚合 API 返回错误, THEN THE Aggregation_Engine SHALL 返回标准化错误响应（包含错误码和中文错误描述），前端统一展示错误提示

---

### 需求 58: 全品类内容刮削引擎

**用户故事:** 作为星聚平台运营者，我希望后端能主动从第三方网站刮削（scraping）和下载所有类型的内容资源（视频、漫画、小说、音乐、动漫），缓存到 NAS 永久存储，以防止源站失效导致内容丢失，并提高用户访问速度。

#### 验收标准

1. THE Content_Scraper SHALL 在后端实现通用内容刮削引擎，支持从已配置的第三方网站自动抓取以下所有内容类型的元数据和资源文件：
   - 视频：标题、封面、描述、标签、时长、分辨率、视频文件
   - 漫画：标题、封面、作者、标签、章节列表、漫画图片页面
   - 小说：标题、封面、作者、标签、章节列表、章节文本内容
   - 音乐：标题、封面、歌手、专辑、标签、音频文件
   - 动漫：标题、封面、集数、标签、评分、视频文件
2. THE Content_Scraper SHALL 支持两种刮削模式：
   - 定时刮削：按管理员配置的时间间隔（视频默认每6小时、漫画默认每4小时、小说默认每3小时、音乐默认每12小时、动漫默认每6小时）自动刮削已配置源的最新内容
   - 按需刮削：管理员通过 `POST /api/admin/scraper/trigger` 手动触发对指定源、指定内容类型或指定关键词的刮削任务
3. THE Content_Scraper SHALL 支持从刮削到的资源链接下载文件，下载后加密存储到 NAS（复用 NAS_Cache 的 AES-256-GCM 加密和文件名混淆机制）
4. WHEN Content_Scraper 完成内容下载, THE Content_Scraper SHALL 在 `cache_index` 表中建立索引记录，包含原始 URL、混淆文件名、内容类型、文件大小、刮削时间和来源站点
5. THE Content_Scraper SHALL 支持管理员配置刮削规则：
   - 目标源列表（从 `source_config` 表中选择，支持按内容类型筛选）
   - 刮削深度（仅首页/前N页/全站）
   - 内容筛选条件（关键词、分类、分级、最低评分）
   - 下载画质/音质偏好（视频优先1080p回退720p/480p、音乐优先无损回退320kbps/128kbps、漫画优先高清原图）
   - 最大并发下载数（默认3）
   - 每日最大下载量（默认50GB，防止运营商注意）
   - 按内容类型独立配置刮削间隔和每日限额
6. THE Content_Scraper SHALL 对刮削和下载流量进行伪装处理：
   - 所有请求通过 Cloudflare Workers 代理发出，不暴露 NAS 真实 IP
   - 请求间隔随机化（默认2-10秒），模拟正常用户浏览行为
   - 支持设置 User-Agent 轮换和请求头伪装
   - 遵守每日最大带宽限制，分散在全天各时段
7. THE Content_Scraper SHALL 提供刮削任务管理 API：
   - `GET /api/admin/scraper/tasks`（查看所有刮削任务及状态，支持按内容类型筛选）
   - `POST /api/admin/scraper/trigger`（手动触发刮削，支持指定内容类型）
   - `PUT /api/admin/scraper/tasks/[id]`（暂停/恢复/取消任务）
   - `GET /api/admin/scraper/stats`（刮削统计：按内容类型分组的已刮削数量、已下载大小、成功率）
   - `GET /api/admin/scraper/rules`（获取所有刮削规则配置）
   - `PUT /api/admin/scraper/rules/[id]`（更新刮削规则）
8. IF 刮削目标网站返回反爬虫响应（如 403/429/CAPTCHA）, THEN THE Content_Scraper SHALL 自动暂停该源的刮削任务，等待冷却期（默认30分钟）后重试，连续3次失败后标记该源为"刮削受阻"并通知管理员
9. THE Content_Scraper SHALL 对已下载的资源自动标记 MPAA 分级（复用 `autoRate` 分级映射逻辑），成人源内容强制标记为 NC-17 级
10. WHEN 用户请求已被刮削缓存的内容, THE NAS_Cache SHALL 优先从 NAS 本地返回内容，避免重复请求源站
11. THE Content_Scraper SHALL 支持增量刮削，仅抓取上次刮削后新增的内容，避免重复下载
12. THE Content_Scraper SHALL 将所有刮削操作记录到管理员日志（`admin_logs` 表），包含刮削时间、目标源、内容类型、抓取数量和下载大小
13. THE Content_Scraper SHALL 为每种内容类型提供专用的刮削适配器接口：
    - Video_Scrape_Adapter：解析视频页面，提取视频流 URL 和元数据，下载视频文件
    - Comic_Scrape_Adapter：解析漫画章节页面，提取所有图片 URL，批量下载图片并按章节组织存储
    - Novel_Scrape_Adapter：解析小说章节页面，提取章节文本内容，存储为加密文本文件
    - Music_Scrape_Adapter：解析音乐页面，提取音频流 URL，下载音频文件
    - Anime_Scrape_Adapter：解析动漫集数页面，提取视频流 URL，下载动漫视频文件
14. THE Content_Scraper SHALL 为漫画刮削支持批量图片下载和章节完整性校验（确保每章所有页面都已下载）
15. THE Content_Scraper SHALL 为小说刮削支持全本下载（自动遍历所有章节并合并存储）和章节完整性校验

---

### 需求 60: NAS 主动抓取成人内容

**用户故事:** 作为星聚平台运营者，我希望 NAS 能主动去各成人源刮削和下载所有类型的成人内容（成人视频、成人动漫、成人漫画、成人小说、成人音乐、成人直播录像），保持成人内容库持续更新，而不是等用户请求才缓存。

#### 验收标准

1. THE Content_Scraper SHALL 主动定时刮削所有已配置的成人内容源，覆盖以下全部成人内容类型：
   - 成人视频：从 Pornhub、XVideos、XNXX、xHamster、Missav、Jable 等成人视频源主动抓取热门/最新视频
   - 成人动漫：从 Hanime.tv、HentaiHaven 等成人动漫源主动抓取最新里番
   - 成人漫画：从 E-Hentai、nhentai、Hitomi 等成人漫画源主动抓取热门/最新漫画图片
   - 成人小说：从禁忌书屋、Literotica、AO3 成人分区等成人小说源主动抓取热门/最新章节文本
   - 成人音乐：从 DLsite 音声作品、成人 ASMR 源等主动抓取热门/最新音频
   - 成人直播录像：从 Chaturbate、StripChat 等成人直播源主动抓取热门直播录像回放
2. THE Content_Scraper SHALL 为成人内容刮削提供独立的定时调度器（Adult_Scrape_Scheduler），支持管理员为每种成人内容类型独立配置刮削频率：
   - 成人视频：默认每4小时刮削一次
   - 成人动漫：默认每6小时刮削一次
   - 成人漫画：默认每3小时刮削一次
   - 成人小说：默认每2小时刮削一次
   - 成人音乐：默认每12小时刮削一次
   - 成人直播录像：默认每1小时刮削一次
3. THE Content_Scraper SHALL 对所有主动抓取的成人内容自动标记为 NC-17 级，并在 `cache_index` 表中记录内容类型、来源站点、标签和分级
4. WHEN 成人模式用户请求成人内容, THE NAS_Cache SHALL 优先从 NAS 本地已刮削的内容返回，仅在 NAS 未命中时才从源站实时获取
5. THE Content_Scraper SHALL 支持管理员为成人内容刮削配置以下规则：
   - 目标成人源列表（从 `source_config` 表中筛选 NC-17 级源）
   - 每种内容类型的刮削数量上限（如每次最多抓取100个视频/50本漫画/200章小说）
   - 内容筛选条件（标签、热度阈值、评分阈值）
   - 存储空间配额（为成人内容分配独立的 NAS 存储空间上限，默认200GB）
   - 自动清理策略（超出配额时按 LRU 清理最久未访问的成人内容）
6. THE Content_Scraper SHALL 在管理后台提供成人内容刮削专用仪表盘，展示：
   - 各成人内容类型的已刮削数量和存储占用
   - 各成人源的刮削状态（正常/受阻/暂停）
   - 最近24小时的刮削活动时间线
   - 成人内容 NAS 存储空间使用率
7. IF 成人内容源的刮削被反爬虫机制阻止, THEN THE Content_Scraper SHALL 自动切换到备用刮削策略（降低频率、更换 User-Agent、增加随机延迟），并通知管理员
8. THE Content_Scraper SHALL 确保成人内容刮削流量与普通内容刮削流量分开统计和限制，避免成人内容刮削占用过多带宽影响普通内容服务

---

### 需求 61: 成人内容与 NAS 深度集成

**用户故事:** 作为星聚平台运营者，我希望所有成人内容模块（视频/动漫/漫画/小说/音乐）都与 NAS 深度集成，实现 NAS 本地存储优先、后端主动刮削、定时更新和管理员可配置的完整闭环。

#### 验收标准

1. WHEN 成人模式用户请求任何成人内容（视频/动漫/漫画/小说/音乐/直播录像）, THE NAS_Cache SHALL 首先查询 `cache_index` 表判断该内容是否已在 NAS 本地存储，命中时直接从 NAS 解密返回，未命中时从源站获取并异步缓存到 NAS
2. THE NAS_Cache SHALL 为成人内容维护独立的缓存优先级队列：成人视频 > 成人动漫 > 成人漫画 > 成人小说 > 成人音乐 > 成人直播录像
3. THE Content_Scraper SHALL 在每次定时刮削完成后自动更新 `cache_index` 表中的索引，确保新刮削的内容立即可被用户请求命中
4. THE NAS_Cache SHALL 为成人内容提供独立的存储空间管理：
   - 管理员可设置成人内容总存储上限（默认200GB）
   - 管理员可按内容类型设置子配额（如成人视频100GB、成人漫画50GB、成人小说10GB、成人音乐20GB、成人动漫20GB）
   - 超出配额时按 LRU 策略自动清理最久未访问的内容
5. THE Content_Scraper SHALL 支持管理员通过后台一键触发对所有成人源的全量刮削（首次部署时填充内容库）
6. THE Content_Scraper SHALL 支持管理员暂停/恢复所有成人内容的定时刮削（如遇到带宽紧张或安全事件时）
7. THE NAS_Cache SHALL 在成人内容的 API 响应中添加 `X-Cache-Source: nas` 或 `X-Cache-Source: origin` 头，方便管理员监控缓存命中率
8. THE Content_Scraper SHALL 确保所有成人内容刮削和存储操作遵循项目宪法第二章（NAS 零公网端口、所有流量走 Cloudflare、真实 IP 不可见）

---

### 需求 59: 后端 API 统一代理网关

**用户故事:** 作为星聚用户，我希望平台前端永远不直接访问第三方网站，所有第三方内容都通过后端 API 代理获取，以保护我的隐私（浏览器不泄露我访问了哪些第三方网站）并确保平台安全。

#### 验收标准

1. THE Backend_Proxy SHALL 作为统一代理网关，所有第三方网站的内容请求（视频流、音频流、图片、漫画页面、小说章节、直播流等）均通过后端 API 代理转发，前端永远不直接请求第三方域名
2. THE Backend_Proxy SHALL 为每种内容类型提供专用的流代理端点：
   - `GET /api/video/stream/[id]`（视频流代理）
   - `GET /api/music/stream/[id]`（音频流代理）
   - `GET /api/comic/[id]/chapter/[chapterId]/page/[pageNum]`（漫画图片代理）
   - `GET /api/novel/[id]/chapter/[chapterId]`（小说内容代理）
   - `GET /api/live/stream/[roomId]`（直播流代理）
   - `GET /api/podcast/stream/[episodeId]`（播客音频代理）
   - `GET /api/proxy/image`（通用图片代理，用于封面等静态资源）
3. THE Backend_Proxy SHALL 在代理请求时自动添加必要的请求头（Referer、Cookie、User-Agent等），模拟正常浏览器访问，确保第三方网站正常响应
4. THE Backend_Proxy SHALL 对代理响应进行缓存优化：
   - 静态资源（封面图片、字幕文件等）通过 Cloudflare KV 缓存，TTL 默认24小时
   - 视频/音频流不缓存（实时代理转发），但支持通过 NAS_Cache 进行永久缓存
   - 搜索结果通过 Cloudflare KV 缓存，TTL 默认10分钟
5. THE Backend_Proxy SHALL 确保前端代码中不包含任何第三方网站的域名或 URL，所有外部资源引用均通过后端代理 URL
6. WHEN 前端需要展示第三方网站的图片（如视频封面、漫画封面等）, THE Backend_Proxy SHALL 通过 `GET /api/proxy/image?url=<encoded_url>` 代理获取，前端使用代理 URL 作为图片 `src`
7. THE Backend_Proxy SHALL 对所有代理请求实施速率限制（通过 Cloudflare KV），防止单个用户过度请求导致第三方网站封禁平台 IP
8. IF 后端代理请求第三方网站失败（超时/403/500等）, THEN THE Backend_Proxy SHALL 返回标准化错误响应，前端展示友好的错误提示并提供重试按钮
9. THE Backend_Proxy SHALL 在代理请求时剥离用户的真实 IP 和浏览器指纹信息，确保第三方网站无法追踪到具体用户
10. THE Backend_Proxy SHALL 支持管理员配置代理规则：按源站设置自定义请求头、Cookie、代理超时时间和重试策略
11. THE Backend_Proxy SHALL 将所有代理请求通过 Cloudflare Workers 处理，确保 NAS 真实 IP 不暴露（遵循项目宪法第二章）
12. THE Backend_Proxy SHALL 支持 NAS_Cache 集成：当代理请求的内容已在 NAS 缓存中存在时，直接从 NAS 返回而不请求第三方网站

---

### 需求 62: AI 有声小说（TTS 听书）

**用户故事:** 作为星聚用户，我希望在阅读小说时可以一键切换到"听书模式"，由 AI 将章节文本转换为语音朗读，以便在通勤、做家务等场景下解放双眼继续享受小说内容。

#### 验收标准

1. THE TTS_Engine SHALL 在后端通过 Cloudflare Workers 调用 TTS API（支持 OpenAI TTS、Edge TTS 等多种 TTS 服务提供商），将小说章节文本转换为音频文件
2. WHEN 用户在 Novel_Reader 中点击"听书模式"按钮, THE TTS_Engine SHALL 将当前章节文本提交到后端 TTS API，生成音频后返回给前端播放
3. THE TTS_Engine SHALL 支持多种语音风格选择：
   - 性别：男声、女声
   - 语速：0.5x / 0.75x / 1.0x / 1.25x / 1.5x / 2.0x
   - 情感风格：标准朗读、温柔、激昂、低沉、活泼（取决于 TTS 服务支持的风格）
4. THE TTS_Engine SHALL 支持多语言 TTS 转换：中文、英文、日文，根据小说内容语言自动选择对应的 TTS 语音模型
5. WHEN TTS 音频生成完成, THE TTS_Audio_Cache SHALL 将音频文件加密存储到 NAS（复用 NAS_Cache 的 AES-256-GCM 加密和文件名混淆机制），并在 `cache_index` 表中建立索引记录
6. WHEN 用户再次请求同一章节的 TTS 音频, THE TTS_Audio_Cache SHALL 直接从 NAS 返回已缓存的音频文件，避免重复调用 TTS API 生成
7. THE TTS_Engine SHALL 支持管理员通过后台触发对热门小说的批量 TTS 转换，预生成音频缓存到 NAS
8. THE Content_Rating SHALL 将成人小说（NC-17 级）的 TTS 音频同样标记为 NC-17 级，非成人模式用户无法访问成人小说的听书功能
9. WHILE 听书模式激活, THE Music_Player SHALL 以迷你播放条形式展示当前朗读状态（章节标题、朗读进度、暂停/播放、上一章/下一章按钮），复用音乐播放器的迷你播放条 UI
10. WHEN 当前章节 TTS 音频播放完毕且存在下一章, THE TTS_Engine SHALL 自动加载并播放下一章节的 TTS 音频，实现章节自动连播
11. THE TTS_Engine SHALL 在后台预加载下一章节的 TTS 音频（当前章节播放到 80% 时触发预加载），确保章节切换无缝衔接
12. THE TTS_Audio_Cache SHALL 使用章节内容哈希 + 语音配置（语音风格+语速+语言）的组合作为缓存键，相同章节不同语音配置生成独立的缓存文件
13. THE TTS_Engine SHALL 将所有 TTS API 调用通过 Cloudflare Workers 处理，TTS API Key 存储在 Cloudflare Workers Secrets，禁止硬编码（遵循项目宪法第二章）
14. IF TTS API 调用失败（超时/配额耗尽/服务不可用）, THEN THE TTS_Engine SHALL 返回明确的错误信息并建议用户稍后重试，同时自动尝试备用 TTS 服务提供商
15. THE TTS_Engine SHALL 将所有 TTS 生成操作记录到管理员日志（`admin_logs` 表），包含生成时间、小说ID、章节ID、语音配置、音频时长和文件大小

