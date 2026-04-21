# 实施计划：星聚娱乐平台整合（NAS 核心架构版）

## 概述

本任务列表以 **NAS 为核心存储层**重新编排所有实施任务。NAS 通过 Cloudflare Tunnel 安全连接，作为平台内容的永久存储和加速缓存层。所有内容模块的后端 API 都遵循统一的缓存策略：**查 NAS 缓存 → 命中返回 / 未命中从源站获取并异步缓存**。刮削引擎与聚合引擎紧密关联，主动从源站抓取内容到 NAS。

前端技术栈：Next.js 14 App Router + Tailwind CSS + TypeScript
后端技术栈：Cloudflare Pages Functions + D1 + KV + R2
NAS 层：Cloudflare Tunnel + AES-256-GCM 加密 + SHA-256 文件名混淆
打包技术栈：Capacitor (Android/iOS/TV) + Electron (Windows/macOS)
测试技术栈：Vitest + fast-check

---

## Phase 1: 基础架构（类型定义 + API客户端 + AgeGate + 路由骨架 + 数据库Schema + 中间件）

- [x] 1. 前端基础架构搭建
  - [x] 1.1 创建共享类型定义和 API 客户端
    - 创建 `src/lib/types.ts`，定义 `ContentRating`、`SourceType`、`SourceConfig`、`AggregatedItem`、`SearchRequest`、`SearchResponse`、`UserMode`、`ScrapeContentType`、`ScrapeRule`、`ScrapeTask`、`NASCacheStatus` 等前后端共享类型
    - 创建 `src/lib/api-client.ts`，实现 `fetchAPI<T>()` 统一 API 调用封装，自动处理 JWT 认证、401 重定向、429 速率限制和网络错误
    - _需求: 13.2, 41.1_

  - [x] 1.2 实现 AgeGate 分级控制核心逻辑
    - 创建 `src/lib/age-gate.ts`，实现 `IAgeGate` 接口：`getMode()`、`canAccess(rating)`、`filterContent(items)`、`switchMode(newMode, pin)`、`checkDailyLimit()`、`getNavConfig()`、`getPinLockStatus()`、`logModeSwitch()`
    - 实现 `MODE_MAX_RATING` 映射（child=G, teen=PG-13, mature=R, adult=NC-17, elder=PG）
    - 实现 `RATING_COLORS` 映射（G=绿色, PG=蓝色, PG-13=黄色, R=橙色, NC-17=红色）
    - 实现各模式导航配置 `NavConfig`：
      - 儿童模式：仅显示"动画片"、"儿歌"、"益智游戏"，圆角大卡片明亮配色
      - 青少年模式：显示视频/音乐/漫画/小说/动漫/游戏/直播/播客，隐藏成人专区
      - 成熟模式：显示所有主流频道，隐藏成人专区
      - 成人模式：显示所有入口含成人专区全部子模块
      - 老人模式：仅显示"看电视"、"听音乐"、"听戏曲"、"看新闻"
    - 实现PIN安全机制：连续3次错误锁定30分钟，从低级切换到高级需PIN，高级切换到低级无需PIN
    - 实现模式切换后立即刷新页面重新过滤内容
    - 使用 localStorage 存储用户模式和加密 PIN，支持每日时长限制
    - _需求: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.10, 14.11, 14.17, 14.20, 14.21, 14.22_

  - [ ]* 1.3 编写 AgeGate 属性测试
    - **Property 8: 用户模式内容过滤** — 验证 `filterContent` 对任意内容列表和用户模式，返回结果中每项分级 ≤ 该模式允许的最高分级，且不遗漏符合条件的项
    - **验证需求: 14.3, 14.4, 14.5, 14.6, 27.7, 35.5, 35.6**
    - **Property 9: PIN 设置/验证往返一致性** — 验证任意 6 位数字 PIN 设置后用相同 PIN 验证返回 true，不同 PIN 返回 false
    - **验证需求: 14.7**

  - [x] 1.4 搭建前端页面路由骨架和导航组件
    - 创建所有页面路由目录：`src/app/videos/`、`src/app/music/`、`src/app/comics/`、`src/app/novels/`、`src/app/anime/`、`src/app/live/`、`src/app/podcasts/`、`src/app/search/`、`src/app/zone/`、`src/app/admin/`、`src/app/profile/`、`src/app/settings/`、`src/app/download/`、`src/app/ai/`
    - 创建 `src/components/layout/Header.tsx` 导航头组件，根据 AgeGate 模式动态显示/隐藏导航入口
    - 创建 `src/components/layout/Sidebar.tsx` 侧边栏组件（桌面端使用）
    - 创建 `src/components/ui/ContentCard.tsx` 通用内容卡片组件，显示 MPAA 分级标签图标
    - 创建 `src/components/ui/RatingBadge.tsx` 分级标签组件（G=绿色/PG=蓝色/PG-13=黄色/R=橙色/NC-17=红色五种样式）
    - 所有图标使用 Lucide React SVG，禁止 Emoji（遵循项目宪法第一章）
    - _需求: 14.13, 14.14, 14.20, 14.21, 13.5, 13.7_

  - [ ]* 1.5 编写前端基础组件单元测试
    - 测试 `RatingBadge` 渲染五种分级标签
    - 测试 `ContentCard` 根据分级显示正确标签
    - 测试 `Header` 根据不同 AgeGate 模式显示/隐藏导航入口
    - _需求: 14.13, 14.14_

- [x] 2. 后端基础架构搭建
  - [x] 2.1 扩展数据库 Schema（含 NAS 缓存表和刮削表）
    - 在 `functions/api/_schema.sql` 中新增所有表：`source_config`、`playback_history`、`favorites`、`bookmarks`、`playlists`、`following`、`danmaku`、`notifications`、`user_settings`（含PIN锁定字段、家长控制字段）、`parental_access_log`、`parental_usage`、`mode_switch_log`、`service_providers`、`service_reviews`、`verification_reports`、`job_listings`、`blacklist`、`private_messages`、`dating_profiles`、`dating_matches`、`adult_posts`、`admins`、`admin_logs`、`telegram_channels`、`ai_conversations`、`ai_messages`
    - 新增 NAS 缓存核心表 `cache_index`（id, content_type, source_id, source_url, encrypted_path, file_size, access_count, last_accessed, created_at, rating, tags, metadata）
    - 新增刮削相关表 `scrape_rules`、`scrape_tasks`、`adult_storage_quota`
    - 创建所有索引（按设计文档定义）
    - _需求: 11.6, 14.22, 14.23, 18.8, 23.8, 29.4, 32.3, 36.15, 42.1, 52.5, 58.5, 60.5, 61.4_

  - [x] 2.2 实现后端核心中间件和工具库
    - 更新 `functions/api/_middleware.ts`，添加 CORS 处理、JWT 认证解析、MPAA 分级权限校验中间件链
    - 创建 `functions/api/_lib/errors.ts`，实现 `APIError`、`SourceError` 错误类和 `handleError()` 统一错误处理
    - 创建 `functions/api/_lib/cache.ts`，实现 KV 缓存读写和速率限制逻辑
    - 创建 `functions/api/_lib/rating.ts`，实现 MPAA 分级工具函数：`autoRate(sourceName)` 自动分级映射、`esrbToMpaa(esrb)` ESRB→MPAA 映射、`canAccess(userMode, contentRating)` 权限检查、`getContentRatingRules(contentType)` 获取每种内容类型的细化分级规则、`getRatingColor(rating)` 获取分级标签颜色
    - 创建 `functions/api/_lib/validate.ts`，实现输入校验工具
    - _需求: 14.9, 14.17, 14.18, 14.19, 35.4, 47.13_

  - [ ]* 2.3 编写后端分级工具属性测试
    - **Property 10: 聚合源自动分级映射** — 验证 `autoRate` 对已知源名称返回正确的默认 MPAA 分级，映射结果确定性
    - **验证需求: 14.9, 8.15**
    - **Property 11: ESRB 到 MPAA 分级映射** — 验证 `esrbToMpaa` 对所有合法 ESRB 值返回正确的 MPAA 分级，映射是双射的
    - **验证需求: 35.4**

  - [x] 2.4 实现用户认证 API
    - 实现 `POST /api/auth/register`（邮箱+密码注册，bcrypt 哈希，禁止第三方登录）
    - 实现 `POST /api/auth/login`（JWT 签发）
    - 实现 `GET /api/auth/me`（获取当前用户信息）
    - 实现 `PUT /api/users/me`（更新昵称/头像/简介）
    - 实现 `PUT /api/users/me/password`（修改密码）
    - 实现 `DELETE /api/users/me`（注销账户，72小时内彻底删除）
    - 实现 `PUT /api/users/me/settings`（AgeGate 模式、PIN、每日时长限制、通知偏好）
    - 实现 `GET /api/users/me/sync`（跨设备数据同步）
    - _需求: 41.1, 41.2, 41.4, 41.5, 41.6, 41.7, 47.4_

  - [ ]* 2.5 编写认证 API 单元测试
    - 测试注册流程（邮箱格式校验、密码强度、重复注册）
    - 测试登录流程（正确/错误密码、JWT 签发）
    - 测试 JWT 认证中间件（有效/过期/无效 token）
    - _需求: 41.1_

- [x] 3. 检查点 — 确保基础架构测试通过
  - 确保所有测试通过，如有问题请询问用户。

---


## Phase 2: NAS 核心层（Tunnel连接 + AES加密 + 文件名混淆 + 缓存命中逻辑 + 缓存管理API）

- [ ] 4. NAS 安全缓存核心系统（后端）
  - [ ] 4.1 实现 Cloudflare Tunnel 连接与 AES-256 加密模块
    - 创建 `functions/api/_lib/crypto.ts`，使用 Web Crypto API 实现 AES-256-GCM 加密/解密
    - 加密密钥存储在 Cloudflare Workers Secrets（`NAS_ENCRYPTION_KEY`）
    - 每个文件使用随机 IV（初始化向量），IV 与密文一起存储
    - 加密流程：原始内容 → AES-256-GCM 加密 → 存储到 NAS
    - 解密流程：从 NAS 读取 → AES-256-GCM 解密 → 返回给用户
    - **Cloudflare Tunnel连接方案**：
      - NAS 上运行 `cloudflared tunnel`，创建命名隧道连接到 Cloudflare
      - 隧道配置文件 `config.yml` 将 NAS 本地的缓存服务（如 `localhost:8080`）映射到 Cloudflare 子域名
      - Cloudflare Workers 通过该子域名访问 NAS 缓存服务
      - NAS 防火墙仅允许 `cloudflared` 的出站 443 连接，拒绝所有入站
    - _需求: 52.1, 52.2, 52.3, 52.4_

  - [ ]* 4.2 编写 AES-256 加密属性测试
    - **Property 13: AES-256 加密往返一致性** — 验证任意字节序列加密后用相同密钥解密与原始数据完全相同
    - **验证需求: 52.3**

  - [ ] 4.3 实现 NAS 缓存代理层（核心缓存命中/未命中逻辑）
    - 创建 `functions/api/_lib/nas-cache.ts`，实现 NAS 缓存代理层
    - **文件名混淆方案**：
      - 原始文件名通过 SHA-256 哈希生成混淆文件名（如 `a1b2c3d4.enc`）
      - 目录结构使用哈希前两位分桶（如 `a1/b2/a1b2c3d4.enc`），避免单目录文件过多
      - 混淆文件名与原始内容的映射关系存储在 D1 的 `cache_index` 表中
    - **缓存命中/未命中逻辑**（所有聚合模块复用此逻辑）：
      - 用户请求内容 → 查询 `cache_index` 表 → 命中则从 NAS 读取解密返回 → 未命中则从源站获取返回并异步缓存到 NAS
      - 缓存命中时更新 `access_count` 和 `last_accessed` 字段
      - 在响应头中添加 `X-Cache-Source: nas` 或 `X-Cache-Source: origin` 标识
    - **缓存策略方案**：
      - 支持按内容类型设置缓存优先级（视频 > 音乐 > 漫画 > 小说）
      - 支持设置最大缓存空间（如 500GB），超出时按 LRU 策略清理
      - 支持按时间清理（如清理 30 天未访问的内容）
      - 支持按访问频率清理（保留访问次数最多的内容）
    - **流量伪装方案**：
      - 实现速率限制器：NAS 下载速度限制在配置的最大值内（如 50Mbps）
      - 实现随机化延迟：每次请求添加 0-500ms 随机延迟，避免流量模式被识别
      - 实现每日带宽上限：超过上限后停止缓存新内容，仅从源站获取
      - 实现分时段带宽分配：白天低带宽、夜间高带宽，模拟正常使用模式
    - _需求: 52.1, 52.2, 52.5, 52.6, 52.7, 52.8, 52.9_

  - [ ] 4.4 实现 NAS 缓存管理 API
    - 实现 `GET /api/admin/cache/status`（缓存状态：总大小、文件数、命中率、各类型占比、NAS连接状态）
    - 实现 `POST /api/admin/cache/clear`（清理缓存：支持按类型/按时间/按访问频率清理）
    - 实现 `POST /api/admin/cache/destroy`（紧急销毁：需确认管理员密码，删除NAS上所有加密文件+D1索引表所有记录+R2备份索引）
    - 实现 `PUT /api/admin/cache/config`（更新缓存策略：最大空间/清理策略/带宽限制/分时段配置）
    - 实现 `GET /api/admin/cache/logs`（缓存操作日志：缓存/清理/销毁记录）
    - 实现 `POST /api/admin/cache/prefetch`（手动预缓存：指定URL列表批量缓存到NAS）
    - _需求: 52.8, 52.10, 52.11_

- [ ] 5. 检查点 — 确保 NAS 核心层测试通过
  - 确保 NAS 缓存读写、加密解密、缓存命中/未命中逻辑全部测试通过，如有问题请询问用户。

---

## Phase 3: 后端统一代理网关 + 聚合引擎核心 + 源适配器基类 + 刮削引擎核心

- [ ] 6. 聚合引擎核心框架（后端）
  - [ ] 6.1 实现源适配器基类和聚合引擎
    - 创建 `functions/api/_lib/source-adapter.ts`，实现 `ISourceAdapter` 接口（search/getDetail/getStreamUrl/healthCheck）
    - 创建 `functions/api/_lib/aggregator.ts`，实现 `IAggregatorEngine` 接口
    - 实现并发搜索所有启用源、合并结果、去重（保留最高质量项）
    - 实现超时处理（单个源超时不影响整体，跳过该源）
    - 实现源健康状态管理（连续 3 次失败标记为 offline，1 小时后自动重试）
    - **NAS 缓存集成**：聚合引擎在返回结果时，对每个结果项查询 `cache_index` 标记是否已缓存（`cached: true/false`），前端可据此显示"本地加速"标识
    - _需求: 4.2, 4.7, 4.8, 10.4, 10.5_

  - [ ]* 6.2 编写聚合引擎属性测试
    - **Property 1: 聚合引擎合并保留所有唯一项** — 验证合并操作包含所有源中所有唯一项，不丢失
    - **验证需求: 4.2, 8.2, 18.2, 22.2, 23.2, 24.2, 25.2**
    - **Property 2: 去重保留最高质量唯一项** — 验证去重后无重复项，且保留的是优先级最高的
    - **验证需求: 4.8, 8.14, 18.12**
    - **Property 3: 超时源被排除在结果之外** — 验证超时源的结果不出现在最终结果中
    - **验证需求: 4.7, 8.13, 10.5, 18.11, 22.10, 23.12, 25.9**
    - **Property 7: 源健康状态机** — 验证连续 3 次失败后状态变为 offline，小于 3 次保持 online/degraded
    - **验证需求: 10.5, 15.5, 20.5**

  - [ ] 6.3 实现聚合源管理 API（管理员）
    - 实现 `GET /api/admin/sources`（获取所有源列表，支持 type/health 筛选）
    - 实现 `POST /api/admin/sources`（添加新源）
    - 实现 `PUT /api/admin/sources/[id]`（更新源配置）
    - 实现 `DELETE /api/admin/sources/[id]`（删除源）
    - 实现 `POST /api/admin/sources/[id]/test`（测试源连通性）
    - 实现 `POST /api/admin/sources/batch-toggle`（批量启用/禁用）
    - 实现 `GET /api/admin/sources/health`（源健康监控）
    - _需求: 10.1, 10.2, 10.3, 10.4, 10.5, 15.1, 15.2, 15.3, 15.4, 15.5, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7_

- [ ] 7. 全品类内容刮削引擎核心框架（后端）
  - [ ] 7.1 实现 Content_Scraper 通用刮削引擎核心
    - 创建 `functions/api/_lib/content-scraper.ts`，实现 `IContentScraper` 接口
    - 实现刮削任务队列管理（创建/暂停/恢复/取消任务）
    - 实现刮削任务调度器（基于 Cloudflare Cron Triggers 定时触发）
    - 实现增量刮削逻辑（通过 `scrape_rules.last_scraped_at` 判断，仅抓取新增内容）
    - 实现流量伪装处理（User-Agent 轮换、请求间隔随机化 2-10 秒、每日带宽限制）
    - 实现反爬虫应对策略（403/429/CAPTCHA 检测、自动暂停冷却 30 分钟、连续 3 次失败标记为"刮削受阻"）
    - 实现刮削操作日志记录（写入 `admin_logs` 表）
    - **NAS 存储集成**：复用 NAS_Cache 的 AES-256-GCM 加密和文件名混淆机制存储下载内容，刮削完成后自动写入 `cache_index` 表
    - _需求: 58.1, 58.2, 58.3, 58.4, 58.6, 58.8, 58.11, 58.12_

  - [ ] 7.2 实现刮削任务管理 API
    - 实现 `GET /api/admin/scraper/tasks`（查看所有刮削任务及状态，支持按内容类型筛选）
    - 实现 `POST /api/admin/scraper/trigger`（手动触发刮削，支持指定内容类型/源/关键词）
    - 实现 `PUT /api/admin/scraper/tasks/[id]`（暂停/恢复/取消任务）
    - 实现 `GET /api/admin/scraper/stats`（刮削统计：按内容类型分组）
    - 实现 `GET /api/admin/scraper/rules`（获取所有刮削规则配置）
    - 实现 `PUT /api/admin/scraper/rules/[id]`（更新刮削规则）
    - _需求: 58.7, 58.5_

- [ ] 8. 检查点 — 确保聚合引擎和刮削引擎核心测试通过
  - 确保所有测试通过，如有问题请询问用户。

---


## Phase 4: 全品类刮削引擎（通用框架 + 视频/漫画/小说/音乐/动漫适配器）

- [ ] 9. 视频刮削适配器（后端）
  - [ ] 9.1 实现 Video_Scrape_Adapter
    - 创建 `functions/api/_lib/scraper/video-scrape-adapter.ts`，实现 `IVideoScrapeAdapter` 接口
    - 实现视频页面解析（提取标题、封面、描述、标签、时长、分辨率等元数据）
    - 实现视频流 URL 提取（支持多清晰度：1080p > 720p > 480p）
    - 实现视频文件下载到 NAS（AES-256 加密存储 + SHA-256 文件名混淆 + cache_index 索引写入）
    - 支持从所有已配置的视频源（包括成人视频源）刮削
    - 成人视频源内容自动标记 NC-17 级
    - _需求: 58.1, 58.3, 58.9, 58.13_

- [ ] 10. 漫画刮削适配器（后端）
  - [ ] 10.1 实现 Comic_Scrape_Adapter
    - 创建 `functions/api/_lib/scraper/comic-scrape-adapter.ts`，实现 `IComicScrapeAdapter` 接口
    - 实现漫画章节页面解析（提取所有图片 URL）
    - 实现批量图片下载到 NAS（按章节组织存储，每章一个加密目录）
    - 实现章节完整性校验（确保每章所有页面都已下载）
    - 支持从所有已配置的漫画源（包括成人漫画源 E-Hentai/nhentai/Hitomi 等）刮削
    - 成人漫画源内容自动标记 NC-17 级
    - _需求: 58.1, 58.13, 58.14_

- [ ] 11. 小说刮削适配器（后端）
  - [ ] 11.1 实现 Novel_Scrape_Adapter
    - 创建 `functions/api/_lib/scraper/novel-scrape-adapter.ts`，实现 `INovelScrapeAdapter` 接口
    - 实现小说章节页面解析（提取章节文本内容，清理广告和无关 HTML）
    - 实现章节文本存储到 NAS（AES-256 加密文本文件）
    - 实现全本下载（自动遍历所有章节并合并存储）
    - 实现全本完整性校验（所有章节是否已下载）
    - 支持从所有已配置的小说源（包括成人小说源 禁忌书屋/Literotica/AO3 等）刮削
    - 成人小说源内容自动标记 NC-17 级
    - _需求: 58.1, 58.13, 58.15_

- [ ] 12. 音乐刮削适配器（后端）
  - [ ] 12.1 实现 Music_Scrape_Adapter
    - 创建 `functions/api/_lib/scraper/music-scrape-adapter.ts`，实现 `IMusicScrapeAdapter` 接口
    - 实现音乐页面解析（提取标题、歌手、专辑、标签等元数据）
    - 实现音频流 URL 提取（支持多音质：无损 > 320kbps > 128kbps）
    - 实现音频文件下载到 NAS（AES-256 加密存储 + cache_index 索引写入）
    - 支持从所有已配置的音乐源（包括成人音乐源 DLsite/成人 ASMR 等）刮削
    - 成人音乐源内容自动标记 NC-17 级
    - _需求: 58.1, 58.13_

- [ ] 13. 动漫刮削适配器（后端）
  - [ ] 13.1 实现 Anime_Scrape_Adapter
    - 创建 `functions/api/_lib/scraper/anime-scrape-adapter.ts`，实现 `IAnimeScrapeAdapter` 接口
    - 实现动漫集数页面解析（提取视频流 URL）
    - 实现动漫视频文件下载到 NAS（按动漫/集数组织存储，AES-256 加密）
    - 实现全集批量下载
    - 支持从所有已配置的动漫源（包括成人动漫源 Hanime.tv/HentaiHaven 等）刮削
    - 成人动漫源内容自动标记 NC-17 级
    - _需求: 58.1, 58.13_

- [ ] 14. NAS 主动抓取成人内容调度器（后端）
  - [ ] 14.1 实现 Adult_Scrape_Scheduler 成人内容刮削调度器
    - 创建 `functions/api/_lib/scraper/adult-scrape-scheduler.ts`，实现 `IAdultScrapeScheduler` 接口
    - 实现成人内容定时刮削调度（基于 Cloudflare Cron Triggers）：
      - 成人视频：默认每4小时刮削一次
      - 成人动漫：默认每6小时刮削一次
      - 成人漫画：默认每3小时刮削一次
      - 成人小说：默认每2小时刮削一次
      - 成人音乐：默认每12小时刮削一次
      - 成人直播录像：默认每1小时刮削一次
    - 实现管理员可独立配置每种成人内容类型的刮削频率
    - 实现一键暂停/恢复所有成人内容定时刮削
    - 实现一键触发所有成人源全量刮削（首次部署填充内容库）
    - _需求: 60.1, 60.2, 61.5, 61.6_

  - [ ] 14.2 实现成人内容存储空间管理
    - 实现成人内容独立存储配额管理（默认总计200GB）
    - 实现按内容类型子配额（成人视频100GB、成人漫画50GB、成人小说10GB、成人音乐20GB、成人动漫20GB）
    - 实现超出配额时 LRU 自动清理最久未访问的成人内容
    - 实现 `adult_storage_quota` 表的 CRUD 操作
    - _需求: 60.5, 61.4_

  - [ ] 14.3 实现成人内容刮削管理 API
    - 实现 `GET /api/admin/scraper/adult-dashboard`（成人内容刮削仪表盘：各类型已刮削数量/存储占用/源状态/最近活动）
    - 实现 `POST /api/admin/scraper/adult/toggle`（一键暂停/恢复所有成人刮削）
    - 实现 `POST /api/admin/scraper/adult/full-scrape`（触发全量刮削）
    - _需求: 60.6, 61.5, 61.6_

- [ ] 15. 检查点 — 确保所有刮削适配器测试通过
  - 确保所有刮削引擎相关测试通过，如有问题请询问用户。

---

## Phase 5: 核心前端组件（播放器/阅读器/搜索/游戏引擎）

- [ ] 16. 视频播放器与自动播放引擎（前端）
  - [ ] 16.1 实现 VideoPlayer 视频播放器组件
    - 创建 `src/components/player/VideoPlayer.tsx`，实现 `VideoPlayerProps` 接口
    - 支持播放控件：进度条、音量、全屏、画质选择、播放速度调节
    - 支持键盘快捷键（空格暂停、左右快进快退、上下音量）
    - 支持触摸手势（左右滑动快进快退、上下滑动音量亮度）
    - 支持画中画模式（移动端）
    - 支持字幕轨道显示（SRT/ASS）
    - 显示 NAS 缓存标识（当 `X-Cache-Source: nas` 时显示"本地加速"图标）
    - _需求: 1.1, 1.2, 1.5, 1.6, 1.7, 1.8_

  - [ ] 16.2 实现弹幕层组件
    - 创建 `src/components/player/DanmakuLayer.tsx`，支持滚动/顶部/底部弹幕
    - 支持弹幕样式设置（颜色、字体大小、位置）
    - 支持弹幕密度调节和一键关闭
    - 支持发送弹幕
    - _需求: 29.1, 29.2, 29.3_

  - [ ] 16.3 实现 AutoPlayEngine 自动播放引擎
    - 创建 `src/lib/player/autoplay-engine.ts`，实现 `IAutoPlayEngine` 接口
    - 实现优先级规则：同系列下一集 > 同频道推荐 > 平台推荐
    - 实现 5 秒倒计时界面组件 `src/components/player/AutoPlayOverlay.tsx`
    - 支持"立即播放"和"取消自动播放"按钮
    - 支持播放队列侧边栏展示（至少 5 个候选）
    - 支持全局开关
    - 跨视频源工作（本站/B站/YouTube/免费源/NAS缓存）
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 1.3, 1.4_

  - [ ]* 16.4 编写自动播放引擎属性测试
    - **Property 4: 自动播放优先级排序** — 验证对任意候选项组合，AutoPlayEngine 选择的下一个播放项始终是优先级最高的候选项
    - **验证需求: 5.1**

  - [ ]* 16.5 编写视频播放器单元测试
    - 测试播放控件交互逻辑
    - 测试键盘快捷键映射
    - 测试自动播放倒计时和取消逻辑
    - _需求: 1.2, 1.6, 5.2, 5.4_

- [ ] 17. 视频播放器后端 API
  - [ ] 17.1 实现视频播放历史和收藏 API
    - 实现 `GET /api/video/history`（按时间倒序，支持按来源筛选）
    - 实现 `POST /api/video/history`（记录播放进度）
    - 实现 `POST /api/video/favorite`（添加收藏）
    - 实现 `GET /api/video/favorites`（获取收藏列表，支持按来源筛选）
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ] 17.2 实现弹幕 API
    - 实现 `GET /api/danmaku/[videoId]`（获取弹幕列表，支持时间范围查询）
    - 实现 `POST /api/danmaku/[videoId]`（发送弹幕，含基础关键词过滤）
    - _需求: 29.4, 29.7_

  - [ ]* 17.3 编写视频 API 单元测试
    - 测试播放历史 CRUD 和分页
    - 测试收藏添加/删除/查询
    - 测试弹幕发送和关键词过滤
    - _需求: 11.1, 29.4_

- [ ] 18. 音乐播放器（前端）
  - [ ] 18.1 实现 MusicPlayer 音乐播放器组件
    - 创建 `src/components/player/MusicPlayer.tsx`，实现 `MusicPlayerProps` 接口
    - 实现迷你播放条（页面底部常驻）：歌曲名称、歌手、专辑封面、进度、暂停/播放、上一首/下一首
    - 实现全屏播放界面（点击迷你播放条展开）：专辑封面、歌词、完整控制面板
    - 支持播放模式切换：顺序播放、单曲循环、随机播放、列表循环
    - 支持倍速播放（1.0x/1.25x/1.5x/2.0x，播客场景）
    - 实现跨页面持久化播放状态（使用 React Context + localStorage）
    - 支持 LRC 歌词同步滚动显示
    - 显示 NAS 缓存标识
    - _需求: 8.4, 8.5, 8.6, 8.7, 8.9, 8.12, 24.7_

  - [ ] 18.2 实现播放列表管理
    - 支持创建、编辑、删除自定义播放列表
    - 支持本地音乐文件上传（MP3/FLAC/WAV → R2 存储）
    - _需求: 8.8, 8.10_

  - [ ]* 18.3 编写音乐播放器单元测试
    - 测试播放模式切换逻辑
    - 测试播放队列管理
    - 测试歌词同步逻辑
    - _需求: 8.7, 8.12_

- [ ] 19. 音乐播放器后端 API
  - [ ] 19.1 实现音乐 API
    - 实现 `POST /api/music/playlist`（创建播放列表）
    - 实现 `GET /api/music/playlists`（获取用户播放列表）
    - 实现 `PUT /api/music/playlist/[id]`（更新播放列表）
    - 实现 `DELETE /api/music/playlist/[id]`（删除播放列表）
    - _需求: 8.8_

- [ ] 20. 漫画阅读器（前端）
  - [ ] 20.1 实现 ComicReader 漫画阅读器组件
    - 创建 `src/components/reader/ComicReader.tsx`，实现 `ComicReaderProps` 接口
    - 支持翻页模式（左右翻页）和条漫模式（上下滚动）
    - 支持双指缩放、双击放大、拖拽平移手势
    - 支持章节结束自动提示加载下一章
    - 支持书签功能（记录阅读进度）
    - _需求: 18.5, 18.6, 18.7, 18.8_

  - [ ]* 20.2 编写漫画阅读器单元测试
    - 测试翻页/条漫模式切换
    - 测试手势交互逻辑
    - _需求: 18.5, 18.6_

- [ ] 21. 小说阅读器（前端）
  - [ ] 21.1 实现 NovelReader 小说阅读器组件
    - 创建 `src/components/reader/NovelReader.tsx`，实现 `NovelReaderProps` 和 `NovelReaderAPI` 接口
    - 支持字体大小调节（5 档：14/16/18/20/24）、字体选择、行间距调节
    - 支持页面背景色切换（dark/light/sepia/green）
    - 支持翻页模式和滚动模式
    - 支持章节结束自动加载下一章
    - 支持书签功能
    - 支持 TTS 语音朗读（Web Speech API）
    - _需求: 23.4, 23.5, 23.6, 23.7, 23.8, 23.11_

  - [ ]* 21.2 编写小说阅读器单元测试
    - 测试字体/主题切换
    - 测试翻页/滚动模式
    - _需求: 23.5, 23.6_

- [ ] 22. 阅读器后端 API
  - [ ] 22.1 实现漫画和小说 API
    - 实现 `POST /api/comic/bookmark`（保存漫画阅读进度）
    - 实现 `POST /api/novel/bookmark`（保存小说阅读进度）
    - 实现 `GET /api/comic/[id]/chapter/[chapterId]`（获取漫画章节页面，**走 NAS 缓存**：查 cache_index → 命中从 NAS 解密返回图片 → 未命中从源站获取并异步缓存）
    - 实现 `GET /api/novel/[id]/chapter/[chapterId]`（获取小说章节内容，**走 NAS 缓存**：查 cache_index → 命中从 NAS 解密返回文本 → 未命中从源站获取并异步缓存）
    - _需求: 18.8, 23.8_

- [ ] 23. 全局搜索组件（前端）
  - [ ] 23.1 实现 SearchHub 全局搜索组件
    - 创建 `src/components/search/SearchHub.tsx`，实现 `SearchHubProps` 接口
    - 在平台顶部提供全局搜索框
    - 搜索结果按内容类型分组展示（视频/音乐/漫画/小说/游戏/直播/播客）
    - 每组展示前 5 条结果 + "查看更多"链接
    - 支持搜索历史记录和热门搜索推荐
    - 支持搜索建议（实时匹配关键词）
    - 根据 AgeGate 模式过滤搜索结果
    - 支持按内容类型筛选
    - 对已缓存到 NAS 的结果显示"本地加速"标识
    - _需求: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8_

  - [ ] 23.2 实现多标签组合筛选组件
    - 创建 `src/components/search/TagFilter.tsx`，实现统一多标签筛选 UI
    - 支持标签分组展示（内容类型/题材风格/地区/MPAA分级/平台来源）
    - 支持 AND 组合筛选（同时选多个标签）
    - 实时更新搜索结果
    - 根据 AgeGate 模式隐藏不可见标签
    - 支持保存自定义标签组合为"快捷筛选"
    - _需求: 53.1, 53.2, 53.3, 53.4, 53.6, 53.8_

  - [ ]* 23.3 编写多标签筛选属性测试
    - **Property 14: 多标签 AND 组合筛选** — 验证对任意内容列表和标签子集，AND 筛选结果中每项包含所有选中标签，且不遗漏
    - **验证需求: 53.2**

- [ ] 24. 全局搜索后端 API
  - [ ] 24.1 实现搜索 API
    - 实现 `GET /api/search`（全局聚合搜索，支持 type/rating/tags/region/sortBy 参数，结果标记 NAS 缓存状态）
    - 实现 `GET /api/search/suggestions`（搜索建议）
    - 实现 `GET /api/search/hot`（热门搜索词）
    - _需求: 27.1, 27.5, 27.6_

- [ ] 25. 游戏引擎基础框架（前端）
  - [ ] 25.1 实现游戏引擎核心框架
    - 创建 `src/lib/game-engine/core.ts`，实现游戏循环（初始化→更新→渲染→销毁）
    - 实现 Canvas/WebGL 渲染器，保持 60fps
    - 实现统一输入处理（键盘 + 触摸屏）
    - 实现移动端虚拟操控按钮自动显示
    - 实现粒子特效系统、动画过渡和音效管理
    - _需求: 6.1, 6.2, 6.3, 6.7, 6.9_

  - [ ] 25.2 实现游戏存档系统
    - 创建 `src/lib/game-engine/save-system.ts`，实现 IndexedDB 存档读写
    - 支持序列化/反序列化游戏状态
    - 支持跨设备同步（通过 D1 数据库）
    - _需求: 6.10_

  - [ ]* 25.3 编写游戏存档属性测试
    - **Property 5: 游戏存档保存/加载往返一致性** — 验证任意合法游戏状态对象序列化后反序列化与原始状态等价
    - **验证需求: 6.10**

  - [ ] 25.4 实现游戏目录和分类系统
    - 创建 `src/app/games/page.tsx` 游戏中心首页，展示"精选推荐"和"最近更新"
    - 实现平台分类标签页（PC/手机/NS/PS/Xbox/网页游戏）
    - 实现游戏卡片组件（名称、封面、平台标签、类型、评分、MPAA 分级标签）
    - 支持按名称/类型/平台筛选和排序（热度/评分/最新/名称）
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 35.1, 35.7_

  - [ ]* 25.5 编写游戏目录筛选属性测试
    - **Property 6: 游戏目录筛选正确性** — 验证对任意游戏列表和筛选条件组合，结果中每项满足所有条件且不遗漏
    - **验证需求: 7.4, 7.5**

- [ ] 26. 游戏后端 API
  - [ ] 26.1 实现游戏数据 API
    - 实现 `GET /api/games/catalog`（游戏目录，支持 platform/type/rating/sortBy 筛选）
    - 实现 `GET /api/games/scores/[gameId]`（排行榜）
    - 实现 `POST /api/games/scores`（提交分数）
    - 实现 `GET /api/games/saves`（获取存档）
    - 实现 `POST /api/games/saves`（保存存档）
    - 实现 `GET /api/games/achievements`（成就列表）
    - _需求: 6.10, 6.11, 7.4_

- [ ] 27. 检查点 — 确保核心前端组件测试通过
  - 确保所有测试通过，如有问题请询问用户。

---


## Phase 6: 主流内容聚合（视频/音乐/漫画/小说/动漫/直播/播客 — 前端+后端，全部走NAS缓存）

- [ ] 28. 视频聚合引擎（前端 + 后端）
  - [ ] 28.1 实现视频中心前端页面
    - 创建 `src/app/videos/page.tsx` 视频中心首页
    - 实现视频平台分类标签页（本站/B站/A站/YouTube/Twitch/抖音/快手/Telegram 等）
    - 实现视频搜索和聚合结果展示
    - 实现地区筛选栏（中国大陆/港台/日本/韩国/美国/欧洲/东南亚等）
    - 实现视频类型分类（电影/电视剧/综艺/纪录片/短视频/动漫/MV 等）
    - 集成 VideoPlayer、DanmakuLayer、AutoPlayOverlay 组件
    - 对 NAS 已缓存的视频显示"本地加速"标识
    - _需求: 2.1, 3.2, 4.1, 16.1, 21.2, 37.1, 37.2, 49.1, 49.2_

  - [ ] 28.2 实现视频聚合后端 API（全部走 NAS 缓存）
    - 实现 `GET /api/video/search`（视频聚合搜索，支持 source/rating/region/type 筛选，结果标记 NAS 缓存状态）
    - 实现 `GET /api/video/[id]`（视频详情 + 相关推荐）
    - 实现 `GET /api/video/stream/[id]`（代理视频流 URL，**NAS 缓存优先**：查 cache_index → 命中从 NAS 解密返回流 → 未命中从源站获取并异步缓存到 NAS）
    - 实现 B站适配器（Bilibili_Adapter）：视频列表、搜索、嵌入播放
    - 实现 YouTube 代理适配器（YouTube_Proxy）：通过 Cloudflare Workers 反向代理
    - 实现 A站适配器（AcFun_Adapter）：视频列表、搜索
    - 实现以下免费视频源适配器（每个适配器关联对应的视频刮削适配器）：
      - 低端影视适配器、茶杯狐适配器、电影天堂适配器
      - Twitch VOD 适配器、Dailymotion 适配器、Vimeo 适配器
      - 抖音/TikTok 适配器、快手适配器、西瓜视频适配器
      - Niconico 适配器、Rumble 适配器、PeerTube 适配器
      - Odysee/LBRY 适配器、搜狐视频适配器、好看视频适配器
      - 韩剧TV 适配器、人人视频适配器
    - _需求: 2.1, 2.2, 2.5, 2.6, 3.1, 3.2, 3.3, 3.6, 3.8, 4.1, 4.2, 4.3, 4.4, 16.1, 16.2, 16.5, 16.6, 21.1_

  - [ ]* 28.3 编写视频聚合 API 单元测试
    - 测试各适配器的搜索和解析逻辑
    - 测试聚合搜索合并和去重
    - 测试视频流代理 URL 生成和 NAS 缓存命中逻辑
    - _需求: 2.6, 3.6, 4.2_

- [ ] 29. 音乐聚合引擎（前端 + 后端）
  - [ ] 29.1 实现音乐中心前端页面
    - 创建 `src/app/music/page.tsx` 音乐中心首页
    - 实现音乐搜索和聚合结果展示（标注来源平台）
    - 集成 MusicPlayer 组件
    - 实现播放列表管理界面
    - 对 NAS 已缓存的音乐显示"本地加速"标识
    - _需求: 8.1, 8.2, 8.3_

  - [ ] 29.2 实现音乐聚合后端 API（全部走 NAS 缓存）
    - 实现 `GET /api/music/search`（音乐聚合搜索，结果标记 NAS 缓存状态）
    - 实现 `GET /api/music/stream/[id]`（代理音频流，**NAS 缓存优先**：查 cache_index → 命中从 NAS 解密返回 → 未命中从源站获取并异步缓存）
    - 实现以下音乐源适配器（每个适配器关联对应的音乐刮削适配器）：
      - 网易云音乐适配器、QQ音乐适配器、酷狗音乐适配器
      - 酷我音乐适配器、咪咕音乐适配器
      - Spotify 适配器、SoundCloud 适配器、Bandcamp 适配器
      - Jamendo 适配器、Free Music Archive 适配器
      - YouTube Music 音频提取适配器
    - 实现音乐内容 MPAA 分级（纯音乐 G 级、流行 PG 级、Explicit R 级、成人 ASMR NC-17 级）
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.11, 8.13, 8.14, 8.15_

- [ ] 30. 漫画聚合引擎（前端 + 后端）
  - [ ] 30.1 实现漫画中心前端页面
    - 创建 `src/app/comics/page.tsx` 漫画中心首页
    - 实现漫画搜索和聚合结果展示（封面/标题/作者/类型/更新状态/章节列表）
    - 实现按类型（热血/恋爱/搞笑/冒险等）和更新状态筛选
    - 集成 ComicReader 组件
    - 对 NAS 已缓存的漫画章节显示"本地加速"标识
    - _需求: 18.1, 18.2, 18.3, 18.4, 18.9, 18.10_

  - [ ] 30.2 实现漫画聚合后端 API（全部走 NAS 缓存）
    - 实现 `GET /api/comic/search`（漫画聚合搜索，结果标记 NAS 缓存状态）
    - 实现 `GET /api/comic/[id]`（漫画详情 + 章节列表，标记各章节 NAS 缓存状态）
    - 章节图片获取 API **走 NAS 缓存**：查 cache_index → 命中从 NAS 解密返回 → 未命中从源站获取并异步缓存
    - 实现以下漫画源适配器（每个适配器关联对应的漫画刮削适配器）：
      - 漫画柜适配器、动漫之家适配器、拷贝漫画适配器
      - 包子漫画适配器、奇妙漫画适配器、漫画DB适配器
      - MangaDex 适配器、MangaReader 适配器、MangaKakalot 适配器
      - MangaPark 适配器、Webtoon 适配器
      - 快看漫画适配器、腾讯动漫适配器、有妖气适配器
    - _需求: 18.1, 18.2, 18.3, 18.11, 18.12, 18.13_

- [ ] 31. 小说聚合引擎（前端 + 后端）
  - [ ] 31.1 实现小说中心前端页面
    - 创建 `src/app/novels/page.tsx` 小说中心首页
    - 实现小说搜索和聚合结果展示（封面/标题/作者/类型/字数/更新状态）
    - 实现按类型（玄幻/都市/科幻/历史/言情等）和更新状态筛选
    - 集成 NovelReader 组件
    - 对 NAS 已缓存的小说章节显示"本地加速"标识
    - _需求: 23.1, 23.2, 23.3, 23.9, 23.10_

  - [ ] 31.2 实现小说聚合后端 API（全部走 NAS 缓存）
    - 实现 `GET /api/novel/search`（小说聚合搜索，结果标记 NAS 缓存状态）
    - 实现 `GET /api/novel/[id]`（小说详情 + 章节列表，标记各章节 NAS 缓存状态）
    - 章节内容获取 API **走 NAS 缓存**：查 cache_index → 命中从 NAS 解密返回 → 未命中从源站获取并异步缓存
    - 实现以下小说源适配器（每个适配器关联对应的小说刮削适配器）：
      - 笔趣阁适配器、69书吧适配器、全本小说网适配器
      - 顶点小说适配器、八一中文网适配器、书趣阁适配器
      - 飘天文学适配器、UU看书适配器、小说旗适配器
      - 无错小说网适配器、落秋中文适配器
      - Novel Updates 适配器、Light Novel World 适配器、ReadNovelFull 适配器
    - _需求: 23.1, 23.2, 23.3, 23.12, 23.13_

- [ ] 32. 动漫聚合引擎（前端 + 后端）
  - [ ] 32.1 实现动漫中心前端页面
    - 创建 `src/app/anime/page.tsx` 动漫中心首页
    - 实现新番时间表（按星期展示当季新番更新时间）
    - 实现动漫搜索和聚合结果展示（封面/标题/集数/类型/评分/更新状态）
    - 实现多标签组合筛选（热血+机甲、恋爱+校园等）
    - 实现"追番列表"功能
    - 集成 VideoPlayer + AutoPlayEngine
    - 对 NAS 已缓存的动漫集数显示"本地加速"标识
    - _需求: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8_

  - [ ] 32.2 实现动漫聚合后端 API（全部走 NAS 缓存）
    - 实现 `GET /api/anime/search`（动漫聚合搜索，支持 tags/year/status/region 筛选，结果标记 NAS 缓存状态）
    - 实现 `GET /api/anime/schedule`（新番时间表）
    - 实现 `GET /api/anime/[id]`（动漫详情 + 集数列表，标记各集 NAS 缓存状态）
    - 实现 `POST /api/anime/follow`（追番）
    - 实现 `GET /api/anime/following`（追番列表）
    - 动漫视频流 API **走 NAS 缓存**：查 cache_index → 命中从 NAS 解密返回 → 未命中从源站获取并异步缓存
    - 实现以下动漫源适配器（每个适配器关联对应的动漫刮削适配器）：
      - 樱花动漫适配器、AGE动漫适配器、OmoFun 适配器
      - Anime1 适配器、AnimePahe 适配器、GoGoAnime 适配器
      - 9Anime 适配器、AnimeDao 适配器、Zoro.to 适配器
      - Crunchyroll 免费区适配器
      - 动漫花园适配器、萌番组适配器、简单动漫适配器
    - _需求: 22.1, 22.2, 22.3, 22.4, 22.7, 22.8, 22.9, 22.10_

- [ ] 33. 直播聚合引擎（前端 + 后端）
  - [ ] 33.1 实现直播中心前端页面
    - 创建 `src/app/live/page.tsx` 直播中心首页
    - 实现直播间列表展示（封面/主播/标题/观看人数/平台来源）
    - 实现按分类（游戏/娱乐/户外/学习/音乐等）和平台筛选
    - 实现关注主播功能（开播高亮显示）
    - 集成 VideoPlayer（支持实时弹幕）
    - _需求: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

  - [ ] 33.2 实现直播聚合后端 API
    - 实现 `GET /api/live/rooms`（直播间列表，支持 category/platform 筛选）
    - 实现 `GET /api/live/stream/[roomId]`（代理直播流，直播为实时流不走 NAS 缓存，但录像回放走 NAS 缓存）
    - 实现 `POST /api/live/follow`（关注主播）
    - 实现 `GET /api/live/following`（关注列表）
    - 实现以下直播源适配器：
      - 斗鱼适配器、虎牙适配器、B站直播适配器
      - Twitch 适配器、YouTube Live 适配器
      - 抖音直播适配器、快手直播适配器
      - 花椒直播适配器、映客直播适配器
      - 企鹅电竞适配器、CC直播适配器
      - AfreecaTV 适配器、Kick 适配器、Facebook Gaming 适配器
    - _需求: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.8, 25.9_

- [ ] 34. 播客聚合引擎（前端 + 后端）
  - [ ] 34.1 实现播客中心前端页面
    - 创建 `src/app/podcasts/page.tsx` 播客中心首页
    - 实现播客搜索和节目展示（封面/标题/主播/描述/单集列表）
    - 实现按分类（科技/商业/教育/娱乐/新闻等）浏览
    - 实现订阅功能
    - 集成 MusicPlayer（复用音乐播放器播放播客音频）
    - 对 NAS 已缓存的播客单集显示"本地加速"标识
    - _需求: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.8_

  - [ ] 34.2 实现播客聚合后端 API（全部走 NAS 缓存）
    - 实现 `GET /api/podcast/search`（播客搜索，结果标记 NAS 缓存状态）
    - 实现 `GET /api/podcast/[id]`（播客详情 + 单集列表）
    - 实现 `POST /api/podcast/subscribe`（订阅）
    - 实现 `GET /api/podcast/subscriptions`（订阅列表）
    - 播客音频流 API **走 NAS 缓存**：查 cache_index → 命中从 NAS 解密返回 → 未命中从源站获取并异步缓存
    - 实现以下播客源适配器：
      - Apple Podcasts 适配器、Spotify Podcasts 适配器
      - 小宇宙适配器、喜马拉雅适配器、蜻蜓FM 适配器、荔枝FM 适配器
      - Google Podcasts 适配器、Pocket Casts 适配器
      - Overcast 适配器、Castbox 适配器、Podcast Addict 适配器
    - _需求: 24.1, 24.2, 24.3, 24.5, 24.9_

- [ ] 35. 检查点 — 确保所有主流内容聚合模块测试通过
  - 确保所有测试通过，如有问题请询问用户。

---


## Phase 7: 成人专区（成人内容聚合 + NAS主动抓取 + 服务平台 + 社交 + 约会）

- [ ] 36. 成人视频聚合（前端 + 后端，NAS 主动抓取优先返回）
  - [ ] 36.1 实现成人视频专区前端页面
    - 创建 `src/app/zone/videos/page.tsx` 成人视频专区
    - 实现 AgeGate 访问拦截（非成人模式拒绝访问）
    - 实现成人视频搜索和聚合结果展示
    - 实现完整的多标签组合筛选维度（地区/视频类型/题材标签/演员特征/画质/时长/排序）
    - 集成 VideoPlayer + AutoPlayEngine
    - 对 NAS 已缓存的成人视频显示"本地加速"标识
    - _需求: 17.1, 17.2, 17.3, 17.4, 17.6, 17.7_

  - [ ] 36.2 实现成人视频聚合后端 API（NAS 优先返回）
    - 实现以下成人视频源适配器（每个源通过 Cloudflare Workers 代理，关联视频刮削适配器）：
      - Pornhub 适配器、XVideos 适配器、XNXX 适配器
      - YouPorn 适配器、RedTube 适配器、Tube8 适配器
      - SpankBang 适配器、EPorner 适配器、HQPorner 适配器
      - Naughty America 免费区适配器、Brazzers 免费区适配器
      - xHamster 适配器、ThisAV 适配器
      - JAVHD 适配器、Missav 适配器、Jable 适配器
    - 所有成人视频源自动标记 NC-17 级
    - 实现多标签组合筛选 API（地区/类型/题材/演员特征/画质/时长/排序）
    - 成人视频流 API **NAS 优先返回**：查 cache_index → 命中从 NAS 解密返回 → 未命中从源站获取并异步触发刮削缓存到 NAS
    - _需求: 17.1, 17.2, 17.3, 17.5, 17.7, 17.8, 17.9_

- [ ] 37. 成人动漫聚合（前端 + 后端，NAS 主动抓取优先返回）
  - [ ] 37.1 实现成人动漫专区前端页面
    - 创建 `src/app/zone/anime/page.tsx` 成人动漫专区
    - 实现 AgeGate 访问拦截
    - 实现成人动漫搜索和完整多标签筛选维度（类型/画风/集数/年份/状态/字幕/排序）
    - 集成 VideoPlayer + AutoPlayEngine
    - 对 NAS 已缓存的成人动漫显示"本地加速"标识
    - _需求: 48.1, 48.2, 48.3, 48.4, 48.5, 48.6, 48.7, 48.9_

  - [ ] 37.2 实现成人动漫聚合后端 API（NAS 优先返回）
    - 实现以下成人动漫/里番源适配器（每个源通过 Cloudflare Workers 代理，关联动漫刮削适配器）：
      - Hanime.tv 适配器、HentaiHaven 适配器、HentaiStream 适配器
      - Ohentai 适配器、Hentai.tv 适配器
      - AnimeidhentaI 适配器、9hentai 适配器
    - 所有成人动漫源自动标记 NC-17 级
    - 实现多标签组合筛选（纯爱/后宫/触手/NTR/百合/耽美/校园/奇幻/调教等）
    - 成人动漫流 API **NAS 优先返回**
    - _需求: 48.1, 48.6, 48.8, 48.10, 48.11_

- [ ] 38. 成人漫画聚合（前端 + 后端，NAS 主动抓取优先返回）
  - [ ] 38.1 实现成人漫画专区前端页面
    - 创建 `src/app/zone/comics/page.tsx` 成人漫画专区
    - 实现 AgeGate 访问拦截
    - 实现成人漫画搜索和完整多标签筛选维度（类型/语言/画风/页数/排序）
    - 集成 ComicReader
    - 对 NAS 已缓存的成人漫画显示"本地加速"标识
    - _需求: 19.1, 19.2, 19.3, 19.4, 19.6, 19.7_

  - [ ] 38.2 实现成人漫画聚合后端 API（NAS 优先返回）
    - 实现以下成人漫画源适配器（每个源通过 Cloudflare Workers 代理，关联漫画刮削适配器）：
      - E-Hentai 适配器、nhentai 适配器、Hitomi 适配器
      - Pururin 适配器、HentaiNexus 适配器、Tsumino 适配器
      - Hentai2Read 适配器、MangaHentai 适配器
      - Luscious 适配器、HentaiFox 适配器、IMHentai 适配器
    - 所有成人漫画源自动标记 NC-17 级
    - 实现多标签组合筛选（类型/语言/画风/排序）
    - 成人漫画图片 API **NAS 优先返回**
    - _需求: 19.1, 19.5, 19.7, 19.8, 19.9_

- [ ] 39. 成人小说聚合（前端 + 后端，NAS 主动抓取优先返回）
  - [ ] 39.1 实现成人小说专区前端页面
    - 创建 `src/app/zone/novels/page.tsx` 成人小说专区
    - 实现 AgeGate 访问拦截
    - 实现成人小说搜索和完整多标签筛选维度（类型/语言/字数/状态/排序）
    - 集成 NovelReader
    - 对 NAS 已缓存的成人小说显示"本地加速"标识
    - _需求: 30.1, 30.2, 30.3, 30.4, 30.6, 30.7_

  - [ ] 39.2 实现成人小说聚合后端 API（NAS 优先返回）
    - 实现以下成人小说源适配器（每个源通过 Cloudflare Workers 代理，关联小说刮削适配器）：
      - 禁忌书屋适配器、69书吧成人区适配器、H小说网适配器
      - 成人文学城适配器、Literotica 适配器
      - AO3 成人分区适配器、Novelcool 成人区适配器
    - 所有成人小说源自动标记 NC-17 级
    - 实现多标签组合筛选（类型/语言/字数/排序）
    - 成人小说章节 API **NAS 优先返回**
    - _需求: 30.1, 30.5, 30.7, 30.8, 30.9_

- [ ] 40. 成人直播聚合（前端 + 后端）
  - [ ] 40.1 实现成人直播专区前端页面
    - 创建 `src/app/zone/live/page.tsx` 成人直播专区
    - 实现 AgeGate 访问拦截
    - 实现成人直播间列表和完整筛选维度（主播性别/特征/直播类型/平台来源/排序）
    - 集成 VideoPlayer
    - _需求: 31.1, 31.2, 31.3, 31.4, 31.6, 31.7_

  - [ ] 40.2 实现成人直播聚合后端 API
    - 实现以下成人直播源适配器（每个源通过 Cloudflare Workers 代理）：
      - Chaturbate 适配器、StripChat 适配器、BongaCams 适配器
      - LiveJasmin 适配器、CamSoda 适配器
      - MyFreeCams 适配器、Flirt4Free 适配器
    - 所有成人直播源自动标记 NC-17 级
    - 实现按分类和平台筛选
    - 直播为实时流不走 NAS 缓存，但录像回放走 NAS 缓存
    - _需求: 31.1, 31.5, 31.7, 31.8, 31.9_

- [ ] 41. 成人音乐聚合（前端 + 后端，NAS 主动抓取优先返回）
  - [ ] 41.1 实现成人音乐专区前端页面
    - 创建 `src/app/zone/music/page.tsx` 成人音乐专区
    - 实现 AgeGate 访问拦截
    - 实现成人音乐搜索和完整多标签筛选维度（类型/语言/声优性别/时长/排序）
    - 集成 MusicPlayer
    - 对 NAS 已缓存的成人音乐显示"本地加速"标识
    - _需求: 33.1, 33.2, 33.3, 33.4, 33.6, 33.7_

  - [ ] 41.2 实现成人音乐聚合后端 API（NAS 优先返回）
    - 实现以下成人音乐源适配器（每个源通过 Cloudflare Workers 代理，关联音乐刮削适配器）：
      - 各平台 Explicit 标记歌曲聚合适配器
      - 成人向 ASMR 音频适配器、成人广播剧适配器
      - DLsite 音声作品适配器、Pornhub 音频区适配器
      - 成人催眠音频适配器
    - 所有成人音乐源自动标记 NC-17 级
    - 实现多标签组合筛选（类型/语言/声优性别/排序）
    - 成人音乐流 API **NAS 优先返回**
    - _需求: 33.1, 33.5, 33.7, 33.8, 33.9_

- [ ] 42. 成人播客（前端 + 后端）
  - [ ] 42.1 实现成人播客入口
    - 在 `src/app/zone/` 下添加成人播客入口，展示 NC-17 级播客节目
    - 实现 AgeGate 访问拦截
    - 集成 MusicPlayer
    - 播客音频 **走 NAS 缓存**
    - _需求: 50.1, 50.2, 50.3, 50.4, 50.5_

- [ ] 43. 成人服务验证与点评平台（前端 + 后端）
  - [ ] 43.1 实现成人服务验证前端页面
    - 创建 `src/app/zone/services/page.tsx` 服务验证板块
    - 实现 AgeGate 访问拦截
    - 实现服务者列表展示（基本信息/外貌特征/技能/价格/验证状态/评分）
    - 实现结构化服务类型分类筛选（SPA按摩/陪伴/表演娱乐/健康美容/成人全套/特殊服务/多人服务/长期关系/线上服务/场所服务）
    - 实现多维度筛选（国籍/地区/城市/人种/服务大类/具体服务类型/验证状态/评分/价格/语言）
    - 实现服务者详情页（完整资料+照片+点评列表+验证报告摘要）
    - 实现服务者资料提交表单
    - 实现多级验证流程UI（视频实人验证/健康检测验证/社区验证）
    - 实现验证等级徽章展示（未验证灰色/视频蓝色/健康绿色/社区金色/全验证钻石）
    - 实现匿名点评功能（1-5星评分+文字+标签）
    - 实现举报功能
    - _需求: 36.1, 36.2, 36.3, 36.4, 36.5, 36.6, 36.7, 36.8, 36.9, 36.10, 36.11, 36.14, 36.16_

  - [ ] 43.2 实现免费服务板块前端
    - 创建 `src/app/zone/services/free/page.tsx` 免费服务板块
    - 实现免费服务信息列表和筛选
    - 实现免费服务信息发布表单
    - _需求: 46.1, 46.2, 46.3, 46.4, 46.5, 46.6_

  - [ ] 43.3 实现成人服务后端 API
    - 实现 `GET /api/zone/services`（服务者列表，支持多维度筛选）
    - 实现 `GET /api/zone/services/[id]`（服务者详情）
    - 实现 `POST /api/zone/services`（提交服务者资料）
    - 实现 `POST /api/zone/services/[id]/video-verify`（上传视频实人验证）
    - 实现 `POST /api/zone/services/[id]/health-verify`（上传健康检测报告，设置30天有效期）
    - 实现 `GET /api/zone/services/[id]/health-status`（查询健康证明状态和过期时间）
    - 实现 `POST /api/zone/services/[id]/verify`（提交社区验证报告）
    - 实现 `POST /api/zone/services/[id]/review`（发表匿名点评）
    - 实现验证等级自动计算逻辑
    - 实现健康证明30天自动过期定时任务
    - 实现验证状态自动转换逻辑（3个正面社区报告→社区已验证，多个负面→警告/欺诈）
    - _需求: 36.1, 36.3, 36.5, 36.6, 36.7, 36.8, 36.9, 36.10, 36.11, 36.15_

  - [ ]* 43.4 编写服务者验证状态属性测试
    - **Property 12: 服务者验证状态转换** — 验证正面报告 ≥3 时状态转为 verified，多个负面报告时转为 warning/fraud
    - **验证需求: 36.6, 36.7**

- [ ] 44. 成人求职招聘平台（前端 + 后端）
  - [ ] 44.1 实现求职招聘前端页面
    - 创建 `src/app/zone/jobs/page.tsx` 求职招聘板块
    - 实现求职者档案创建/编辑界面
    - 实现招聘信息发布界面
    - 实现求职者/招聘方列表和筛选
    - 实现安全提示板块
    - _需求: 39.1, 39.2, 39.3, 39.5, 39.6, 39.9_

  - [ ] 44.2 实现求职招聘后端 API
    - 实现 `GET /api/zone/jobs`（招聘信息列表）
    - 实现 `POST /api/zone/jobs`（发布招聘信息）
    - 实现招聘方验证机制
    - 实现匿名点评和举报功能
    - _需求: 39.1, 39.4, 39.7, 39.8, 39.10, 39.11, 39.12_

- [ ] 45. 成人安全保障体系（前端 + 后端）
  - [ ] 45.1 实现安全中心前端页面
    - 创建 `src/app/zone/safety/page.tsx` 安全中心
    - 实现防骗指南和常见欺诈手段展示
    - 实现黑名单查询界面
    - 实现紧急求助按钮
    - 实现信誉积分展示
    - _需求: 40.1, 40.2, 40.3, 40.4, 40.5, 40.6, 40.7_

  - [ ] 45.2 实现安全保障后端 API
    - 实现 `GET /api/zone/blacklist`（黑名单查询）
    - 实现 `POST /api/zone/report`（举报功能）
    - 实现信誉积分计算函数 `calculateReputation()`
    - _需求: 40.2, 40.4, 40.8_

  - [ ]* 45.3 编写信誉积分属性测试
    - **Property 15: 信誉积分确定性** — 验证相同输入参数总是产生相同输出，且结果在 [0, 100] 范围内
    - **验证需求: 40.8**

- [ ] 46. 成人社交论坛（前端 + 后端）
  - [ ] 46.1 实现成人论坛前端页面
    - 创建 `src/app/zone/forum/page.tsx` 成人论坛
    - 实现论坛分区（综合交流/经验分享/资源分享/约会交友/从业者交流/安全提醒/地区板块/兴趣小组）
    - 实现帖子列表、发帖、回复、点赞
    - 支持匿名发帖（随机匿名 ID）
    - 支持帖子内嵌图片和视频
    - 实现举报功能
    - _需求: 43.1, 43.2, 43.3, 43.4, 43.5, 43.6, 43.7, 43.9_

  - [ ] 46.2 实现成人论坛后端 API
    - 复用现有社区帖子 API 模式，创建成人论坛专用 API
    - 实现帖子 CRUD、回复、点赞、举报
    - 实现基础关键词过滤（屏蔽涉及未成年人的违规内容）
    - _需求: 43.1, 43.7, 43.8, 43.9_

- [ ] 47. 成人私聊与视频聊天（前端 + 后端）
  - [ ] 47.1 实现私聊和视频聊天前端
    - 创建 `src/app/zone/chat/page.tsx` 成人私聊界面
    - 实现一对一文字/图片/语音消息
    - 实现 WebRTC P2P 视频聊天（虚拟背景+美颜滤镜）
    - 实现在线状态显示（在线/忙碌/隐身/离线）
    - 实现阅后即焚功能
    - 实现屏蔽/拉黑用户功能
    - _需求: 44.1, 44.2, 44.3, 44.4, 44.5, 44.6_

  - [ ] 47.2 实现私聊后端 API
    - 实现端到端加密消息存储
    - 实现消息发送/接收/已读状态
    - 实现阅后即焚定时删除
    - 实现举报骚扰行为
    - _需求: 44.7, 44.8, 44.9_

- [ ] 48. 成人约会交友（前端 + 后端）
  - [ ] 48.1 实现约会交友前端页面
    - 创建 `src/app/zone/dating/page.tsx` 约会交友板块
    - 实现约会档案创建/编辑
    - 实现"喜欢/不喜欢"滑动匹配机制，支持"超级喜欢"功能
    - 实现完整筛选维度（地理位置/基本条件/外貌特征/兴趣标签/约会目的/验证状态/在线状态/排序）
    - 实现约会活动发布和报名
    - 实现线下见面安全提示
    - _需求: 45.1, 45.2, 45.3, 45.4, 45.5, 45.6, 45.7_

  - [ ] 48.2 实现约会交友后端 API
    - 实现约会档案 CRUD（`GET/POST/PUT /api/zone/dating/profiles`）
    - 实现匹配逻辑（`POST /api/zone/dating/like`，支持超级喜欢，双方互相喜欢→开启聊天）
    - 实现约会活动 CRUD（`GET/POST /api/zone/dating/events`）
    - 实现多维度筛选 API
    - _需求: 45.1, 45.3, 45.4, 45.8, 45.9_

- [ ] 49. 检查点 — 确保成人专区所有模块测试通过
  - 确保所有测试通过，如有问题请询问用户。

---


## Phase 8: 高级功能（AI字幕配音 + AI聊天 + Telegram + 通知 + 推荐 + 评论 + 隐私防护 + 后台管理）

- [ ] 50. AI 字幕与配音（前端 + 后端）
  - [ ] 50.1 实现 AI 字幕/配音前端交互
    - 在 VideoPlayer 中添加 AI 字幕开关和语言选择
    - 在 VideoPlayer 中添加 AI 配音开关、语言和语音风格选择
    - 实现字幕样式设置（字体大小/颜色/背景透明度/位置）
    - 支持用户手动校正 AI 字幕
    - 支持手动上传字幕文件（SRT/ASS）
    - _需求: 38.3, 38.4, 38.5, 38.6, 38.7, 38.11, 38.12_

  - [ ] 50.2 实现 AI 字幕/配音后端 API
    - 实现 `POST /api/ai/subtitle`（提交字幕生成任务）
    - 实现 `GET /api/ai/subtitle/[taskId]`（查询任务状态）
    - 实现 `POST /api/ai/dubbing`（提交配音生成任务）
    - 实现 `GET /api/ai/dubbing/[taskId]`（查询任务状态）
    - 通过 Cloudflare Workers 调用 AI 模型 API（Whisper/DeepL 等）
    - 生成的字幕/配音文件缓存到 NAS（走 AES-256 加密存储）
    - _需求: 38.1, 38.2, 38.5, 38.8, 38.9, 38.10_

- [ ] 51. 无限制AI聊天助手（前端 + 后端）
  - [ ] 51.1 实现AI聊天前端页面
    - 更新 `src/app/ai/page.tsx` AI聊天页面
    - 实现多轮对话界面（消息列表+输入框）
    - 实现流式输出显示（SSE实时显示AI回复）
    - 实现聊天历史列表（左侧会话列表，右侧对话内容）
    - 实现AI模型选择下拉框（通过OpenRouter的模型路由）
    - 实现清除聊天历史功能
    - 在成人模式下显示"无限制模式"标识
    - 在非成人模式下显示内容安全提示
    - _需求: 56.1, 56.3, 56.4, 56.5, 56.6, 56.7, 56.8, 56.9_

  - [ ] 51.2 实现AI聊天后端 API
    - 实现 `POST /api/ai/chat`（AI对话，SSE流式输出，通过Cloudflare Workers代理OpenRouter API）
    - 实现 `GET /api/ai/chat/history`（聊天历史列表）
    - 实现 `GET /api/ai/chat/history/[conversationId]`（单个会话消息）
    - 实现 `DELETE /api/ai/chat/history/[conversationId]`（删除单个会话）
    - 实现 `DELETE /api/ai/chat/history`（清除所有历史）
    - OpenRouter API Key 从环境变量 `OPENROUTER_API_KEY` 读取，禁止硬编码
    - 非成人模式自动添加内容安全系统提示词
    - 成人模式不添加任何限制提示词
    - _需求: 56.2, 56.3, 56.4, 56.5, 56.6, 56.7, 56.8, 56.10, 56.11_

- [ ] 51A. AI 有声小说 TTS 引擎（前端 + 后端）
  - [ ] 51A.1 实现 TTS 引擎后端核心
    - 创建 `functions/api/_lib/tts-engine.ts`，实现 `ITTSEngine` 接口
    - 实现 `ITTSCacheKeyGenerator`：使用章节内容 SHA-256 哈希 + 语音配置（gender+speed+style+language）JSON 哈希的组合作为缓存键
    - 实现 TTS 服务适配器：
      - Edge TTS 适配器（免费，通过 Cloudflare Workers 调用 Edge TTS API）
      - OpenAI TTS 适配器（付费，通过 Cloudflare Workers 调用 OpenAI TTS API）
    - 实现缓存优先逻辑：生成前先查 `cache_index` + `tts_tasks` 表 → 命中直接返回 NAS 音频 URL → 未命中则调用 TTS API 生成
    - 实现生成完成后自动 AES-256-GCM 加密存储到 NAS + 写入 `cache_index` 和 `tts_tasks` 表
    - 实现 TTS API Key 从 Cloudflare Workers Secrets 读取（`TTS_API_KEY`），禁止硬编码
    - 实现 TTS API 调用失败时自动切换备用 TTS 提供商
    - 实现所有 TTS 生成操作记录到 `admin_logs` 表
    - _需求: 62.1, 62.5, 62.6, 62.12, 62.13, 62.14, 62.15_

  - [ ] 51A.2 实现 TTS API 端点
    - 实现 `POST /api/ai/tts/generate`（生成单章节 TTS 音频，缓存命中直接返回，未命中异步生成）
    - 实现 `GET /api/ai/tts/status/[taskId]`（查询 TTS 任务状态）
    - 实现 `GET /api/ai/tts/stream/[cacheId]`（从 NAS 解密返回 TTS 音频流）
    - 实现 `POST /api/admin/tts/batch-generate`（管理员批量生成热门小说 TTS 音频）
    - 实现 `GET /api/admin/tts/stats`（TTS 统计：已生成数量/缓存大小/API调用次数/缓存命中率）
    - 实现成人小说 TTS 音频的 NC-17 级标记和 AgeGate 访问控制
    - _需求: 62.2, 62.7, 62.8, 62.13_

  - [ ] 51A.3 实现听书模式前端交互
    - 在 `src/components/reader/NovelReader.tsx` 中添加"听书模式"切换按钮
    - 实现语音配置面板（性别选择/语速调节/情感风格/语言选择）
    - 实现听书模式下复用 MusicPlayer 迷你播放条（章节标题/朗读进度/暂停播放/上一章下一章）
    - 实现章节自动连播逻辑（当前章节播放完毕自动加载下一章 TTS 音频）
    - 实现下一章节预加载（当前章节播放到 80% 时触发预加载）
    - 实现听书模式与阅读模式的无缝切换（切换时保持当前章节位置）
    - _需求: 62.2, 62.3, 62.4, 62.9, 62.10, 62.11_

  - [ ]* 51A.4 编写 TTS 缓存键属性测试
    - **Property 20: TTS 缓存键唯一性与命中一致性** — 验证 `generateCacheKey` 对相同章节内容和语音配置总是产生相同缓存键，不同内容或不同配置产生不同缓存键
    - **验证需求: 62.6, 62.12**

  - [ ]* 51A.5 编写 TTS 引擎单元测试
    - 测试 TTS 缓存命中/未命中逻辑
    - 测试 TTS 提供商故障切换逻辑
    - 测试成人小说 TTS 的 NC-17 级访问控制
    - 测试批量生成任务创建和状态查询
    - _需求: 62.1, 62.6, 62.8, 62.14_

- [ ] 52. Telegram 频道聚合（后端）
  - [ ] 52.1 实现 Telegram 频道聚合
    - 创建 `functions/api/_lib/telegram-adapter.ts`，实现 Telegram Bot API 代理
    - 通过 Cloudflare Workers 代理 `https://api.telegram.org/bot<token>/` 所有请求
    - 实现定时任务（Cloudflare Cron Triggers，默认30分钟）自动抓取新消息
    - 解析消息类型：视频/图片/文字，将视频/图片下载到 NAS（走 AES-256 加密存储 + cache_index 索引）
    - 根据频道配置的默认 MPAA 分级标记内容
    - 实现频道管理 API（添加/删除/更新/列表/手动触发抓取）
    - 实现频道内容搜索 API 和列表 API
    - Telegram Bot Token 存储在 Cloudflare Workers Secrets，禁止硬编码
    - _需求: 51.1, 51.2, 51.3, 51.4, 51.7, 51.8, 51.9, 51.10_

- [ ] 53. 通知系统（前端 + 后端）
  - [ ] 53.1 实现通知系统前端
    - 实现站内通知中心组件（未读通知列表）
    - 实现通知偏好设置界面
    - _需求: 42.1, 42.4_

  - [ ] 53.2 实现通知系统后端 API
    - 实现 `GET /api/notify/list`（通知列表，支持 type/unreadOnly 筛选分页）
    - 实现 `PUT /api/notify/[id]/read`（标记单条已读）
    - 实现 `PUT /api/notify/read-all`（全部标记已读）
    - 实现 `GET /api/notify/preferences`（获取通知偏好）
    - 实现 `PUT /api/notify/preferences`（更新通知偏好）
    - 实现通知触发逻辑（追番更新/主播开播/私信回复/系统公告/评论回复/播客更新）
    - 实现推送通知方案（Capacitor Push Notifications + FCM/APNs）
    - _需求: 42.1, 42.2, 42.3, 42.4, 42.5_

- [ ] 54. 个性化推荐与评论系统（前端 + 后端）
  - [ ] 54.1 实现个性化推荐前端和后端
    - 在首页展示个性化推荐内容（横向滚动卡片列表）
    - 为每个频道提供"猜你喜欢"板块
    - 支持"不感兴趣"反馈按钮
    - 无历史数据时展示热门内容和编辑精选
    - 实现 `GET /api/recommend/home`、`GET /api/recommend/[type]`、`POST /api/recommend/dislike`
    - 推荐算法：基于用户最近30天历史，提取高频标签和类型，按热度排序推荐
    - 根据用户 MPAA 分级模式过滤推荐结果
    - 推荐结果缓存在 KV 中（每用户每小时更新一次）
    - _需求: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [ ] 54.2 实现评论系统（前端 + 后端）
    - 创建 `src/components/social/CommentSection.tsx` 通用评论区组件
    - 为所有内容页面底部集成评论区
    - 支持评论列表展示、发表评论、点赞、回复（嵌套最多2层）、举报
    - 实现 `GET/POST /api/comments/[contentType]/[contentId]`、`POST /api/comments/[id]/like`、`POST /api/comments/[id]/reply`、`POST /api/comments/[id]/report`
    - 实现基础关键词过滤
    - _需求: 29.5, 29.6, 29.7_

- [ ] 55. 隐私防护系统（前端 + 后端）
  - [ ] 55.1 实现隐私防护前端功能
    - 实现快速隐藏功能（快捷键一键切换到安全页面）
    - 实现浏览器标签页标题中性化（"星聚 - 娱乐平台"）
    - 实现成人专区无痕模式提示
    - 实现 URL 路径中性化（用 "/zone" 代替敏感词）
    - _需求: 47.5, 47.8_

  - [ ] 55.2 实现隐私防护后端功能
    - 创建 `functions/api/_lib/privacy.ts`，实现 IP匿名化、多域名访问策略、智能路由、DDoS/WAF/Bot防护、数据备份、紧急响应、Tor支持、运营者匿名、NAS隐身、EXIF清除、用户注销等方案
    - 所有 D1 数据库表中禁止存储 IP 字段，仅存储匿名标识
    - NAS 仅安装 `cloudflared` 服务，防火墙仅允许出站 HTTPS 443
    - 所有用户上传的图片/视频在存储前自动清除 EXIF/元数据
    - _需求: 47.1, 47.2, 47.3, 47.6, 47.7, 47.8, 47.9, 47.10, 47.11, 47.12, 47.13, 47.14, 47.15, 47.16, 47.17, 47.18, 47.19_

- [ ] 56. 离线下载管理（前端）
  - [ ] 56.1 实现下载管理器前端
    - 创建 `src/app/download/page.tsx` 下载管理页面
    - 实现下载按钮组件（视频/音乐/漫画/小说）
    - 实现后台下载进度显示
    - 支持暂停/恢复/取消下载
    - 支持下载画质选择和音质选择
    - 实现已下载内容管理（按类型筛选、存储空间显示、批量删除）
    - 实现离线播放/阅读（从本地加载）
    - 使用 Capacitor 文件系统（移动端）、Electron 本地存储（桌面端）、IndexedDB/Cache API（Web端）
    - _需求: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8_

- [ ] 57. MPAA 分级管理与家长控制 API（后端）
  - [ ] 57.1 实现分级管理 API
    - 实现 `GET /api/rating/config`（获取默认分级配置和分级颜色映射）
    - 实现 `PUT /api/admin/rating/[contentId]`（调整内容分级）
    - 实现 `GET /api/rating/filter`（根据用户模式获取过滤规则、搜索黑名单、导航配置）
    - 实现 `GET /api/rating/content-rules`（获取每种内容类型的细化分级规则）
    - _需求: 14.8, 14.9, 14.12, 14.15, 14.16, 14.17, 14.18, 14.19, 14.20, 14.21_

  - [ ] 57.2 实现家长控制面板 API
    - 实现 `GET /api/parental/usage-stats`（使用时长统计）
    - 实现 `GET /api/parental/access-log`（内容访问记录）
    - 实现 `PUT /api/parental/max-rating`（手动限制最高分级）
    - 实现 `PUT /api/parental/time-slots`（设置允许使用的时间段）
    - 实现 `POST /api/parental/blacklist`（添加内容黑名单）
    - 实现 `PUT /api/parental/module-lock`（锁定/解锁特定模块）
    - 实现使用时长自动记录逻辑
    - _需求: 14.16, 14.22, 14.23_

- [ ] 58. 后台管理系统（前端 + 后端）
  - [ ] 58.1 实现管理后台前端
    - 创建 `src/app/admin/page.tsx` 管理后台首页（仪表盘）
    - 实现管理员登录页面（独立认证）
    - 实现用户管理模块（列表/封禁/解封/重置密码）
    - 实现内容管理模块（查看/编辑/删除帖子/评论/弹幕/点评）
    - 实现聚合源管理模块（统一源管理后台 UI）
    - 实现 MPAA 分级管理模块
    - 实现成人服务管理模块
    - 实现游戏管理模块
    - 实现通知管理模块
    - 实现安全管理模块
    - 实现 **NAS 缓存管理模块**（状态/清理/策略/紧急销毁/预缓存）
    - 实现 **全品类刮削管理模块**（刮削任务列表/规则配置/成人内容刮削仪表盘/一键操作按钮）
    - 实现 **TTS 有声小说管理模块**（TTS 统计/批量生成/缓存管理）
    - 实现 Telegram 频道管理模块
    - 实现数据统计模块
    - 支持移动端响应式布局
    - _需求: 55.1, 55.2, 55.6, 55.7, 58.7, 60.6_

  - [ ] 58.2 实现管理后台后端 API
    - 实现管理员认证（独立JWT token）
    - 实现仪表盘 API（平台总览：注册用户数、日活、各频道内容数、NAS缓存状态、各源健康状态、带宽使用量、刮削任务状态）
    - 实现用户管理 API（列表/详情/封禁/解封/重置密码）
    - 实现内容管理 API（列表/删除/调整分级）
    - 实现成人服务管理 API（审核/举报处理/黑名单）
    - 实现操作日志 API
    - 实现权限分级（super/content/source/community）
    - 实现敏感操作保护（二次密码确认）
    - _需求: 55.1, 55.2, 55.3, 55.4, 55.5, 55.6, 55.8_

  - [ ]* 58.3 编写管理员权限属性测试
    - **Property 16: 管理员角色权限检查** — 验证 `hasPermission(role, action)` 确定性，super 对所有操作返回 true，其他角色仅对权限范围内操作返回 true
    - **验证需求: 55.4**

- [ ] 59. 检查点 — 确保高级功能所有模块测试通过
  - 确保所有测试通过，如有问题请询问用户。

---


## Phase 9: 自研游戏（15款主流 + 10款成人 + 模拟器增强）

- [ ] 60. 自研主流网页游戏（G/PG 级，15 款）
  - [ ] 60.1 实现益智类：2048 升级版
    - 使用 Canvas 渲染，实现多模式（经典/计时/无尽）、排行榜、每日挑战
    - 支持键盘和触摸操控，3 个难度等级
    - 实现游戏标题画面、结算画面、粒子特效和音效
    - 更新现有 `src/app/games/2048/page.tsx`
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [ ] 60.2 实现策略类：回合制战棋游戏
    - Canvas 渲染，多关卡、兵种系统（步兵/骑兵/弓兵/法师）、AI 对战
    - 创建 `src/app/games/tactics/page.tsx`
    - _需求: 6.4_

  - [ ] 60.3 实现 RPG 类：像素风冒险 RPG
    - Canvas 渲染，剧情系统、装备系统、技能树、Boss 战
    - 创建 `src/app/games/pixel-rpg/page.tsx`
    - _需求: 6.4_

  - [ ] 60.4 实现动作类：横版射击游戏
    - Canvas 渲染，多角色、武器升级、关卡模式
    - 更新现有 `src/app/games/spaceshoot/page.tsx` 或创建新页面
    - _需求: 6.4_

  - [ ] 60.5 实现模拟经营类：城市经营游戏
    - Canvas 渲染，建造系统、资源管理、NPC 互动
    - 更新现有 `src/app/games/civilization/page.tsx` 或创建新页面
    - _需求: 6.4_

  - [ ] 60.6 实现赛车类：2D 赛车游戏
    - Canvas 渲染，多赛道、车辆升级、计时赛
    - 创建 `src/app/games/racing/page.tsx`
    - _需求: 6.4_

  - [ ] 60.7 实现卡牌类：卡牌对战游戏
    - Canvas 渲染，收集系统、组卡组、PVE/PVP
    - 创建 `src/app/games/cards/page.tsx`
    - _需求: 6.4_

  - [ ] 60.8 实现解谜类：密室逃脱游戏
    - Canvas 渲染，多关卡、提示系统、物理解谜
    - 创建 `src/app/games/escape/page.tsx`
    - _需求: 6.4_

  - [ ] 60.9 实现音乐类：节奏游戏
    - Canvas 渲染，多歌曲、难度等级、评分系统
    - 创建 `src/app/games/rhythm/page.tsx`
    - _需求: 6.4_

  - [ ] 60.10 实现塔防类：塔防游戏
    - Canvas 渲染，多塔种、升级系统、波次挑战
    - 创建 `src/app/games/tower-defense/page.tsx`
    - _需求: 6.4_

  - [ ] 60.11 实现沙盒类：2D 沙盒建造游戏
    - Canvas 渲染，自由建造、生存模式
    - 创建 `src/app/games/sandbox/page.tsx`
    - _需求: 6.4_

  - [ ] 60.12 实现体育类：足球小游戏
    - Canvas 渲染，快节奏、计分、联赛模式
    - 创建 `src/app/games/soccer/page.tsx`
    - _需求: 6.4_

  - [ ] 60.13 实现棋牌类：象棋/围棋/五子棋
    - Canvas 渲染，AI 对战、在线对战
    - 创建 `src/app/games/chess/page.tsx`
    - _需求: 6.4_

  - [ ] 60.14 实现射击类：太空射击游戏
    - Canvas 渲染，武器升级、无尽模式
    - 创建 `src/app/games/shooter/page.tsx`
    - _需求: 6.4_

  - [ ] 60.15 实现休闲类：消除/跑酷/钓鱼游戏
    - Canvas 渲染，简单上手、排行榜
    - 更新现有 `src/app/games/match3/page.tsx` 和 `src/app/games/fishing/page.tsx`
    - _需求: 6.4_

- [ ] 61. 经典模拟器增强（前端）
  - [ ] 61.1 增强 EmulatorWrapper 功能
    - 添加 4 种视觉滤镜（原始像素/CRT扫描线/平滑插值/LCD效果）
    - 实现可自定义布局的虚拟按键（移动端）
    - 实现即时存档/读档（IndexedDB）
    - 实现 ROM 平台自动识别
    - 实现金手指代码管理
    - 实现 WebRTC P2P 多人联机
    - _需求: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [ ] 62. 自研成人网页游戏（NC-17 级，10 款）
  - [ ] 62.1 实现成人视觉小说
    - Canvas 渲染，多分支剧情、CG 回收、多结局
    - CG 资源存储在 NAS（走 AES-256 加密），通过 Cloudflare 代理加载
    - 创建 `src/app/games/adult-vn/page.tsx`
    - _需求: 34.7, 54.1, 54.2, 54.3, 54.6, 54.7_

  - [ ] 62.2 实现成人 RPG
    - Canvas 渲染，冒险+色情剧情、装备系统、Boss 战+色情奖励
    - 创建 `src/app/games/adult-rpg/page.tsx`
    - _需求: 34.7_

  - [ ] 62.3 实现成人模拟经营
    - Canvas 渲染，经营成人场所、NPC 互动、剧情解锁
    - 创建 `src/app/games/adult-sim/page.tsx`
    - _需求: 34.7_

  - [ ] 62.4 实现成人动作格斗
    - Canvas 渲染，格斗+色情奖励、多角色、连招系统
    - 创建 `src/app/games/adult-fight/page.tsx`
    - _需求: 34.7_

  - [ ] 62.5 实现成人卡牌对战
    - Canvas 渲染，收集成人卡牌、对战、卡牌升级
    - 创建 `src/app/games/adult-cards/page.tsx`
    - _需求: 34.7_

  - [ ] 62.6 实现成人解谜
    - Canvas 渲染，解谜+色情奖励、多关卡
    - 创建 `src/app/games/adult-puzzle/page.tsx`
    - _需求: 34.7_

  - [ ] 62.7 实现成人养成
    - Canvas 渲染，角色养成+亲密度系统、多角色路线
    - 创建 `src/app/games/adult-raise/page.tsx`
    - _需求: 34.7_

  - [ ] 62.8 实现成人换装
    - Canvas 渲染，角色换装/脱衣、自定义外观
    - 创建 `src/app/games/adult-dress/page.tsx`
    - _需求: 34.7_

  - [ ] 62.9 实现成人沙盒
    - Canvas 渲染，自由建造+成人互动元素
    - 创建 `src/app/games/adult-sandbox/page.tsx`
    - _需求: 34.7_

  - [ ] 62.10 实现纯色情休闲小游戏合集
    - Canvas 渲染，简单操作的纯色情小游戏合集
    - 创建 `src/app/games/adult-casual/page.tsx`
    - _需求: 34.7_

- [ ] 63. 成人游戏聚合（前端 + 后端）
  - [ ] 63.1 实现成人游戏专区前端页面
    - 创建 `src/app/zone/games/page.tsx` 成人游戏专区
    - 实现 AgeGate 访问拦截
    - 实现成人游戏列表（自研+聚合），按类型分类
    - 实现完整多标签组合筛选维度（游戏类型/题材/画风/语言/是否网页可玩/排序）
    - 支持网页可玩游戏直接在浏览器内启动
    - _需求: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6, 34.8_

  - [ ] 63.2 实现成人游戏聚合后端 API
    - 实现以下成人游戏源适配器（每个源通过 Cloudflare Workers 代理）：
      - DLsite 适配器、DMM Games 适配器、Nutaku 适配器
      - Itch.io 成人区适配器、F95Zone 适配器、Lewdzone 适配器
      - Newgrounds 成人区适配器
      - 成人 HTML5 游戏站适配器、成人 WebGL 游戏站适配器
    - 所有成人游戏源自动标记 NC-17 级
    - 实现多标签组合筛选
    - _需求: 34.1, 34.6, 34.8, 34.9, 34.10_

- [ ] 64. 检查点 — 确保所有游戏模块测试通过
  - 确保所有测试通过，如有问题请询问用户。

---

## Phase 10: 多平台打包（Android/iOS/TV/Windows/macOS）

- [ ] 65. 平台适配层（前端）
  - [ ] 65.1 实现平台检测和适配层
    - 创建 `src/lib/platform/detect.ts`，检测当前运行平台（Web/Android/iOS/TV/Windows/macOS）
    - 创建 `src/lib/platform/adapter.ts`，实现平台特定功能适配（通知/文件系统/硬件加速）
    - 实现移动端安全区域（safe-area）适配、手势导航和屏幕旋转
    - 实现桌面端侧边栏导航布局
    - 确保所有平台深色主题 UI 一致
    - _需求: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [ ] 65.2 实现电视端专用界面
    - 创建 `src/components/tv/FocusNavigation.tsx` 焦点导航系统（遥控器方向键+确认键）
    - 创建 `src/components/tv/TVLayout.tsx` 电视端专用布局（大字体/大卡片/高对比度）
    - 实现遥控器快捷操作
    - 实现电视端首页
    - 实现品牌启动画面（加载时间 ≤3 秒）
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.9_

  - [ ] 65.3 实现老人模式
    - 创建 `src/components/tv/ElderMode.tsx` 老人模式组件
    - 实现超大字体（≥24px 基础字号）、超大按钮、极简布局
    - 实现简化导航：看电视/听音乐/听戏曲/看新闻四大入口
    - 实现语音搜索和语音控制
    - 自动过滤 PG-13 及以上内容
    - 实现视频播放结束后自动播放下一个推荐内容
    - 实现大号遥控器按键映射说明页面
    - _需求: 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16_

- [ ] 66. Android 打包
  - [ ] 66.1 配置 Capacitor Android 项目
    - 更新 `capacitor.config.ts` 配置
    - 配置 Android 项目（包名、图标、启动画面、权限）
    - 实现推送通知、后台音乐播放、本地文件访问
    - 确保 APK 大小 ≤30MB
    - 构建 Release APK
    - _需求: 13.1, 13.3, 13.9_

- [ ] 67. iOS 打包
  - [ ] 67.1 配置 Capacitor iOS 项目
    - 配置 iOS 项目（Bundle ID、图标、启动画面、权限）
    - 实现推送通知、后台音乐播放、本地文件访问
    - 确保 IPA 大小 ≤50MB
    - 构建 Release IPA
    - _需求: 13.1, 13.3, 13.9_

- [ ] 68. Android TV 打包
  - [ ] 68.1 配置 Capacitor Android TV 项目
    - 配置 Android TV 专用 manifest（Leanback 支持）
    - 集成焦点导航系统和老人模式
    - 确保 APK 大小 ≤30MB
    - 构建 Release APK
    - _需求: 9.7, 13.1_

- [ ] 69. Windows 桌面打包
  - [ ] 69.1 配置 Electron Windows 项目
    - 创建 Electron 主进程配置
    - 实现系统托盘常驻、全局快捷键、窗口管理、自动更新检测
    - 确保安装包大小 ≤80MB
    - 构建 Windows 安装包（.exe/.msi）
    - _需求: 13.1, 13.4, 13.8, 13.9_

- [ ] 70. macOS 桌面打包
  - [ ] 70.1 配置 Electron macOS 项目
    - 配置 macOS 项目（Bundle ID、图标、权限）
    - 实现系统托盘常驻、全局快捷键、窗口管理、自动更新检测
    - 确保安装包大小 ≤80MB
    - 构建 macOS 安装包（.dmg）
    - _需求: 13.1, 13.4, 13.8, 13.9_

- [ ] 71. 检查点 — 确保所有平台构建成功
  - 确保所有平台构建成功，如有问题请询问用户。

---

## Phase 11: 测试与优化

- [ ] 72. 前端集成测试
  - [ ]* 72.1 编写前端组件集成测试
    - 测试 VideoPlayer + DanmakuLayer + AutoPlayOverlay 集成
    - 测试 MusicPlayer 跨页面持久化播放
    - 测试 ComicReader 翻页/条漫模式切换和手势
    - 测试 NovelReader 字体/主题/TTS 功能
    - 测试 SearchHub 全局搜索和多标签筛选
    - 测试 AgeGate 在各模式下的内容过滤和导航隐藏
    - 测试 NAS 缓存标识在各组件中的正确显示
    - _需求: 1.2, 8.9, 18.5, 23.5, 27.1, 14.3_

- [ ] 73. 后端集成测试
  - [ ]* 73.1 编写后端 API 集成测试
    - 测试聚合搜索端到端流程（搜索→合并→去重→分级过滤→NAS缓存标记→返回）
    - 测试 NAS 缓存命中/未命中完整流程（查 cache_index → NAS 读取解密 → 源站回退 → 异步缓存）
    - 测试认证流程（注册→登录→JWT验证→权限检查）
    - 测试源管理流程（添加→测试→启用→搜索→健康检查→自动禁用）
    - 测试刮削引擎流程（创建规则→触发刮削→下载到NAS→写入cache_index→验证完整性）
    - 测试管理员权限分级
    - _需求: 4.2, 41.1, 10.1, 52.5, 55.4, 58.1_

- [ ] 74. 性能优化
  - [ ] 74.1 前端性能优化
    - 实现图片懒加载（Intersection Observer API）
    - 实现长列表虚拟滚动（react-window 或自实现）
    - 实现路由预加载（Next.js `prefetch`）
    - 实现代码分割（大型组件动态导入 `dynamic()`）
    - Canvas 游戏优化（`requestAnimationFrame`、对象池、OffscreenCanvas）
    - PWA 离线支持（Service Worker 缓存策略）
    - 字体优化（`font-display: swap`）
    - _需求: 6.1, 13.5_

  - [ ] 74.2 后端性能优化
    - KV 热数据缓存（搜索结果 TTL 5分钟、热门内容 TTL 1小时、源健康状态 TTL 1分钟）
    - D1 查询优化（索引、分页、避免 `SELECT *`）
    - 聚合搜索优化（并发控制最多10个源、超时快速失败、结果流式返回）
    - Cloudflare Workers 代理缓存（`Cache-Control` 头、CDN 边缘缓存）
    - R2 文件访问优化（CDN 缓存、长 TTL）
    - NAS 缓存性能优化（热门内容预加载、缓存命中率监控、LRU 策略调优）
    - _需求: 4.7, 8.13, 52.8_

- [ ] 75. 最终检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

---

## 注意事项

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号，确保需求可追溯
- 检查点任务确保增量验证
- 属性测试验证设计文档中定义的通用正确性属性
- 单元测试验证具体场景和边界条件
- **NAS 是核心存储层**：所有内容模块的后端 API 都遵循"查 NAS 缓存 → 命中返回 / 未命中从源站获取并异步缓存"的统一模式
- **刮削引擎与聚合引擎紧密关联**：每个聚合源适配器都有对应的刮削适配器，主动从源站抓取内容到 NAS
- **成人内容 NAS 优先返回**：成人内容通过 Adult_Scrape_Scheduler 主动抓取到 NAS，API 优先从 NAS 返回
- **TTS 音频 NAS 缓存**：AI 有声小说生成的 TTS 音频加密存储到 NAS，相同章节+语音配置不重复生成
- 前端任务集中在 `src/` 目录，后端任务集中在 `functions/` 目录，方便多人协作
- 所有图标使用 Lucide React SVG，禁止 Emoji（项目宪法第一章）
- 所有流量走 Cloudflare，NAS 零公网端口（项目宪法第二章）
- 深色主题，主色 #3ea6ff，背景 #0f0f0f（项目宪法第四章）
- 游戏必须 Canvas 渲染（项目宪法第五章）