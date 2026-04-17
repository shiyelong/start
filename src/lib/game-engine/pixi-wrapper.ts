/**
 * PixiJS 游戏引擎封装层
 * 
 * 提供统一的 PixiJS 初始化、sprite 加载、动画管理接口。
 * 所有 2D 游戏（卡牌/解谜/养成/换装/棋牌等）使用此封装。
 * 
 * 素材来源：Kenney.nl (CC0)、OpenGameArt (CC0/CC-BY)
 */

import type { Application, Sprite, Container, Texture } from 'pixi.js';

// PixiJS 是动态导入的（避免 SSR 问题）
let PIXI: typeof import('pixi.js') | null = null;

/**
 * 动态加载 PixiJS（仅在客户端）
 */
export async function loadPixi(): Promise<typeof import('pixi.js')> {
  if (PIXI) return PIXI;
  PIXI = await import('pixi.js');
  return PIXI;
}

/**
 * 创建 PixiJS Application 并挂载到 canvas
 * DPR 上限为 2，防止 3x 屏幕内存爆炸
 */
export async function createPixiApp(options: {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  backgroundColor?: number;
  antialias?: boolean;
}): Promise<Application> {
  const pixi = await loadPixi();
  const app = new pixi.Application();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  await app.init({
    canvas: options.canvas,
    width: options.width,
    height: options.height,
    backgroundColor: options.backgroundColor ?? 0x0f0f0f,
    antialias: options.antialias ?? true,
    resolution: dpr,
    autoDensity: true,
  });
  return app;
}

/**
 * 为 PixiJS app 设置自动响应式缩放。
 * 监听容器大小变化，自动调整 canvas 尺寸保持宽高比。
 * 返回 cleanup 函数。
 */
export function setupResponsiveResize(
  app: Application,
  canvas: HTMLCanvasElement,
  designWidth: number,
  designHeight: number,
): () => void {
  const resize = () => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight || window.innerHeight * 0.7;
    const scaleX = pw / designWidth;
    const scaleY = ph / designHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    const w = Math.floor(designWidth * scale);
    const h = Math.floor(designHeight * scale);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    app.renderer.resize(w, h);
  };

  resize();

  const observer = new ResizeObserver(resize);
  const parent = canvas.parentElement;
  if (parent) observer.observe(parent);

  return () => observer.disconnect();
}

/**
 * 从 sprite sheet 加载纹理区域
 */
export async function loadSpriteRegion(
  sheetUrl: string,
  x: number, y: number, w: number, h: number
): Promise<Texture> {
  const pixi = await loadPixi();
  const baseTexture = await pixi.Assets.load(sheetUrl);
  const rect = new pixi.Rectangle(x, y, w, h);
  return new pixi.Texture({ source: baseTexture.source, frame: rect });
}

/**
 * 创建带动画的 sprite
 */
export async function createAnimatedSprite(
  sheetUrl: string,
  frames: { x: number; y: number; w: number; h: number }[],
  animationSpeed?: number
): Promise<Sprite> {
  const pixi = await loadPixi();
  const textures: Texture[] = [];
  const baseTexture = await pixi.Assets.load(sheetUrl);
  
  for (const frame of frames) {
    const rect = new pixi.Rectangle(frame.x, frame.y, frame.w, frame.h);
    textures.push(new pixi.Texture({ source: baseTexture.source, frame: rect }));
  }
  
  if (textures.length > 1) {
    const animated = new pixi.AnimatedSprite(textures);
    animated.animationSpeed = animationSpeed ?? 0.1;
    animated.play();
    return animated;
  }
  
  return new pixi.Sprite(textures[0]);
}

/**
 * 创建文字对象
 */
export async function createText(
  text: string,
  style?: Partial<{
    fontSize: number;
    fill: string | number;
    fontFamily: string;
    fontWeight: string;
    align: string;
  }>
): Promise<Container> {
  const pixi = await loadPixi();
  const textStyle = new pixi.TextStyle({
    fontSize: style?.fontSize ?? 16,
    fill: style?.fill ?? '#ffffff',
    fontFamily: style?.fontFamily ?? '-apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: (style?.fontWeight ?? 'normal') as 'normal' | 'bold',
    align: (style?.align ?? 'left') as 'left' | 'center' | 'right',
  });
  return new pixi.Text({ text, style: textStyle });
}

/**
 * 创建圆角矩形
 */
export async function createRoundedRect(
  width: number, height: number, radius: number,
  fillColor: number, alpha?: number
): Promise<Container> {
  const pixi = await loadPixi();
  const g = new pixi.Graphics();
  g.roundRect(0, 0, width, height, radius);
  g.fill({ color: fillColor, alpha: alpha ?? 1 });
  return g;
}

/**
 * 创建粒子效果
 */
export async function createParticleEmitter(
  container: Container,
  config: {
    x: number; y: number;
    count: number;
    color: number;
    speed: number;
    lifetime: number;
    size: number;
  }
): Promise<void> {
  const pixi = await loadPixi();
  
  for (let i = 0; i < config.count; i++) {
    const particle = new pixi.Graphics();
    particle.circle(0, 0, config.size * (0.5 + Math.random() * 0.5));
    particle.fill({ color: config.color, alpha: 0.8 });
    particle.x = config.x;
    particle.y = config.y;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = config.speed * (0.5 + Math.random() * 0.5);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const lifetime = config.lifetime * (0.5 + Math.random() * 0.5);
    let elapsed = 0;
    
    container.addChild(particle);
    
    const ticker = (delta: { deltaTime: number }) => {
      elapsed += delta.deltaTime / 60;
      particle.x += vx * delta.deltaTime / 60;
      particle.y += vy * delta.deltaTime / 60;
      particle.alpha = Math.max(0, 1 - elapsed / lifetime);
      particle.scale.set(Math.max(0.1, 1 - elapsed / lifetime));
      
      if (elapsed >= lifetime) {
        container.removeChild(particle);
        particle.destroy();
        // 需要在外部移除 ticker
      }
    };
    
    // 简单的帧更新
    let frame = 0;
    const animate = () => {
      frame++;
      ticker({ deltaTime: 1 });
      if (elapsed < lifetime) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }
}

/**
 * Kenney RPG sprite sheet 的 tile 坐标映射
 * RPGpack_sheet_2X.png: 每个 tile 128x128 像素，20列
 */
export const KENNEY_RPG = {
  TILE_SIZE: 128,
  COLS: 20,
  // 角色
  KNIGHT: { x: 0, y: 0 },
  MAGE: { x: 128, y: 0 },
  ROGUE: { x: 256, y: 0 },
  // 怪物
  SLIME: { x: 0, y: 128 },
  SKELETON: { x: 128, y: 128 },
  DRAGON: { x: 256, y: 128 },
  // 道具
  SWORD: { x: 0, y: 256 },
  SHIELD: { x: 128, y: 256 },
  POTION: { x: 256, y: 256 },
  // 地形
  GRASS: { x: 0, y: 384 },
  STONE: { x: 128, y: 384 },
  WATER: { x: 256, y: 384 },
};

/**
 * Kenney Space shooter sprite sheet 坐标映射
 */
export const KENNEY_SPACE = {
  PLAYER_SHIP: { x: 0, y: 0, w: 99, h: 75 },
  ENEMY_SHIP: { x: 0, y: 75, w: 82, h: 84 },
  BULLET: { x: 0, y: 159, w: 9, h: 37 },
  METEOR_BIG: { x: 224, y: 0, w: 101, h: 84 },
  METEOR_SMALL: { x: 224, y: 84, w: 43, h: 43 },
};
