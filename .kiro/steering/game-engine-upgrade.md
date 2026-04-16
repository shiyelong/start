---
inclusion: always
---

# 游戏引擎升级计划 — 自动执行

## 当前状态
- PixiJS 8.18 + Three.js 已安装
- Kenney CC0 素材已下载到 public/assets/games/sprites/
- PixiJS 封装层已创建 src/lib/game-engine/pixi-wrapper.ts
- 所有25款游戏已有 Canvas 2D 版本（可运行但画面简陋）

## 待执行任务（按优先级）

### 第一批：用 PixiJS 改造核心游戏（替换 Canvas 2D）
1. 像素RPG (pixel-rpg) — 用 PixiJS + Kenney RPG sprite sheet 替换手绘像素
2. 太空射击 (spaceshoot) — 用 PixiJS + Kenney Space sprite sheet 替换
3. 成人养成 (adult-raise) — 用 PixiJS 实现角色立绘和场景
4. 成人换装 (adult-dress) — 用 PixiJS 实现分层穿搭系统
5. 成人RPG (adult-rpg) — 用 PixiJS + sprite sheet 替换

### 第二批：改造剩余游戏
6. 卡牌对战 (cards + adult-cards) — PixiJS 卡牌动画
7. 塔防 (tower-defense) — PixiJS 精灵渲染
8. 赛车 (racing) — PixiJS 或 Three.js 3D 赛道
9. 足球 (soccer) — PixiJS 球场和球员精灵
10. 五子棋 (chess) — PixiJS 棋盘和棋子
11. 密室逃脱 (escape) — PixiJS 场景和物品
12. 节奏游戏 (rhythm) — PixiJS 音符和特效
13. 沙盒 (sandbox + adult-sandbox) — PixiJS 方块渲染
14. 解谜 (adult-puzzle) — PixiJS 宝石动画
15. 格斗 (adult-fight) — PixiJS 角色动画
16. 模拟经营 (adult-sim) — PixiJS 场景渲染
17. 休闲合集 (adult-casual) — PixiJS 迷你游戏

### 第三批：3D 游戏（用 Three.js）
18. 城市经营 (civilization) — Three.js 等距视角
19. 宠物大冒险 (pokemon) — Three.js 或 PixiJS 升级

### 素材来源（全部 CC0 免费商用）
- Kenney.nl — 2D 精灵图、UI、图标（已下载部分）
- OpenGameArt.org — 2D 像素角色 sprite sheet
- CraftPix.net — 2D 游戏套件
- Quaternius.com — 低多边形 3D 模型
- AmbientCG.com — PBR 贴图

### 成人游戏素材来源（海外合法商用）
- Itch.io Adult Game Assets — 免费+低价 NSFW 2D 素材，像素角色、成人立绘、性感UI、CG素材
- DLsite English (Adult Assets) — 日本专业成人游戏素材，2D立绘、像素角色、VN背景
- Hentai Foundry Resources — 免费 NSFW 2D 角色插画、线稿、立绘
- SmutBase — 海外顶流 NSFW 3D 资源站，成人角色模型、骨骼绑定、服装道具
- Virt-A-Mate Resources — 高精度 3D 成人角色、全身绑定、自定义动画
- 3DClick NSFW — 低模/高模 3D 成人角色、写实人体模型
- Unity Asset Store (Mature Content) — 免费成人3D角色、性感风格模型
- Adult Game Dev Hub (adultgamedev.com/resources) — 一站式成人游戏开发素材合集

### 成人游戏改造重点
每款成人游戏需要：
1. 用高质量立绘/sprite替换简陋的几何图形角色
2. 添加更吸引人的视觉效果（光影、粒子、动画过渡）
3. CG奖励场景用真实风格插画替换抽象艺术
4. 角色模型要有吸引力（性感、精致、有细节）
5. 场景背景要有氛围感（灯光、色调、装饰）
6. 成人养成/换装的角色要有多套服装和表情变化

### 改造模式
每个游戏的改造步骤：
1. 安装/导入 PixiJS Application
2. 加载 sprite sheet 纹理
3. 替换 Canvas 2D 绘制代码为 PixiJS Sprite/Container
4. 添加动画（AnimatedSprite）和粒子效果
5. 保留游戏逻辑不变，只替换渲染层
6. 确保全中文 UI
7. 测试构建通过

### 项目宪法规则（必须遵守）
- 第一章：禁止 Emoji，用 Lucide React SVG
- 第四章：深色主题 #3ea6ff/#0f0f0f
- 第五章：游戏必须高质量渲染
- 第八章：默认中文，支持 i18n
