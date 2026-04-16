---
inclusion: fileMatch
fileMatchPattern: ['src/app/games/**', 'src/lib/game-engine/**', 'public/assets/games/**']
---

# 游戏引擎升级指南：Canvas 2D → PixiJS / Three.js

本文件指导将现有 Canvas 2D 游戏迁移到 PixiJS 8 或 Three.js 渲染。改造只替换渲染层，游戏逻辑保持不变。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 2D 渲染 | PixiJS 8.18 | 所有 2D 游戏统一使用 |
| 3D 渲染 | Three.js | 仅 civilization、pokemon 使用 |
| 引擎核心 | `src/lib/game-engine/core.ts` | GameEngine 类，管理游戏循环（init → update → render → destroy） |
| PixiJS 封装 | `src/lib/game-engine/pixi-wrapper.ts` | 动态导入 PixiJS（避免 SSR），提供 createPixiApp / loadSpriteRegion / createAnimatedSprite 等 |
| 输入 | `src/lib/game-engine/input-handler.ts` | 键盘 + 触摸统一处理 |
| 粒子 | `src/lib/game-engine/particle-system.ts` | 粒子特效系统 |
| 音频 | `src/lib/game-engine/sound-engine.ts` | 游戏音效管理 |
| 存档 | `src/lib/game-engine/save-system.ts` | IndexedDB 存档 |

## 素材

已下载的 Kenney CC0 素材位于 `public/assets/games/sprites/`：

- `rpg-sheet.png` / `rpg-sheet-1x.png` — RPG 角色、怪物、道具、地形（128x128 tile）
- `space-sheet.png` — 太空射击飞船、子弹、陨石
- `platformer-pixel-sheet.png` — 平台跳跃素材

坐标映射常量定义在 `pixi-wrapper.ts` 的 `KENNEY_RPG` 和 `KENNEY_SPACE` 对象中。

额外 CC0 素材来源：Kenney.nl、OpenGameArt.org、CraftPix.net、Quaternius.com（3D 低多边形）、AmbientCG.com（PBR 贴图）。

## 改造步骤（每个游戏）

1. 通过 `pixi-wrapper.ts` 的 `createPixiApp()` 初始化 PixiJS Application，挂载到现有 canvas
2. 用 `loadSpriteRegion()` 或 `createAnimatedSprite()` 加载 sprite sheet 纹理
3. 将 `ctx.fillRect()` / `ctx.drawImage()` 等 Canvas 2D 绘制调用替换为 PixiJS Sprite / Container
4. 用 `AnimatedSprite` 替换手动帧动画，用粒子系统增强视觉效果
5. 保留所有游戏逻辑（碰撞检测、状态机、得分等）不变
6. 确保 UI 文本全部中文，使用 `createText()` 封装
7. 验证构建通过且无 SSR 错误（PixiJS 必须动态导入）

## 关键代码模式

### PixiJS 动态导入（防止 SSR 报错）

```typescript
// 正确：通过封装层动态导入
import { createPixiApp, loadSpriteRegion } from '@/lib/game-engine/pixi-wrapper';

// 错误：直接静态导入 pixi.js
import * as PIXI from 'pixi.js'; // ← 会导致 SSR 崩溃
```

### PixiJS Application 初始化

```typescript
const app = await createPixiApp({
  canvas: canvasRef.current,
  width: 800,
  height: 600,
  backgroundColor: 0x0f0f0f, // 项目深色主题背景色
});
```

### Sprite 加载

```typescript
const texture = await loadSpriteRegion(
  '/assets/games/sprites/rpg-sheet.png',
  KENNEY_RPG.KNIGHT.x, KENNEY_RPG.KNIGHT.y,
  KENNEY_RPG.TILE_SIZE, KENNEY_RPG.TILE_SIZE
);
```

## 游戏文件结构

每个游戏位于 `src/app/games/{game-slug}/page.tsx`，是一个 Next.js 页面组件。当前所有游戏都在单文件中用 Canvas 2D 实现（包含接口定义、游戏逻辑函数、渲染函数和 React 组件）。

## 改造优先级

### 第一批（PixiJS 核心游戏）
pixel-rpg、spaceshoot、adult-raise、adult-dress、adult-rpg

### 第二批（PixiJS 其余游戏）
cards、adult-cards、tower-defense、racing、soccer、chess、escape、rhythm、sandbox、adult-sandbox、adult-puzzle、adult-fight、adult-sim、adult-casual

### 第三批（Three.js 3D 游戏）
civilization（等距视角）、pokemon（3D 或 PixiJS）

## 必须遵守的项目规则

- 图标用 Lucide React SVG，禁止 Unicode Emoji
- 深色主题：主色 `#3ea6ff`，背景 `#0f0f0f`
- 所有面向用户的文本默认中文
- 游戏必须支持键盘 + 触摸输入
- Canvas 渲染目标 60fps
