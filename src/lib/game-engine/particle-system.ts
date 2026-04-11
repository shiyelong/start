/**
 * ParticleSystem - 对象池管理的粒子系统
 *
 * 使用预分配对象池避免 GC 压力，所有粒子对象在池中复用。
 * 游戏循环内不创建新对象，符合性能要求 (Requirement 7.7)。
 * 支持多种预设效果：爆炸、拖尾、庆祝、火花 (Requirement 4.8)。
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  rotation?: number;
  rotationSpeed?: number;
  gravity?: number;
  fadeMode?: 'linear' | 'ease';
}

export interface EmitConfig {
  count: number;
  color: string | string[];
  speed: [number, number];
  size: [number, number];
  life: [number, number];
  angle?: [number, number];
  gravity?: number;
}

const DEFAULT_MAX_PARTICLES = 500;

// Celebration colors
const CELEBRATION_COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff6bff', '#ffa06b', '#6bfff0', '#c56bff',
];

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickColor(color: string | string[]): string {
  if (typeof color === 'string') return color;
  return color[Math.floor(Math.random() * color.length)];
}

function resetParticle(p: Particle): void {
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.life = 0;
  p.maxLife = 0;
  p.color = '';
  p.size = 0;
  p.rotation = 0;
  p.rotationSpeed = 0;
  p.gravity = 0;
  p.fadeMode = 'linear';
}

function createParticle(): Particle {
  return {
    x: 0, y: 0,
    vx: 0, vy: 0,
    life: 0, maxLife: 0,
    color: '', size: 0,
    rotation: 0,
    rotationSpeed: 0,
    gravity: 0,
    fadeMode: 'linear',
  };
}

export class ParticleSystem {
  private pool: Particle[];
  private active: Particle[];
  private maxParticles: number;

  constructor(maxParticles: number = DEFAULT_MAX_PARTICLES) {
    this.maxParticles = maxParticles;
    this.pool = [];
    this.active = [];
    // Pre-allocate the full pool
    for (let i = 0; i < maxParticles; i++) {
      this.pool.push(createParticle());
    }
  }

  private acquire(): Particle | null {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    // Pool exhausted — steal the oldest active particle
    if (this.active.length > 0) {
      return this.active.shift()!;
    }
    return null;
  }

  private release(p: Particle): void {
    resetParticle(p);
    this.pool.push(p);
  }

  // ─── Emit ──────────────────────────────────────────────

  emit(x: number, y: number, config: EmitConfig): void {
    const { count, color, speed, size, life, angle, gravity } = config;
    const angleMin = angle ? angle[0] : 0;
    const angleMax = angle ? angle[1] : Math.PI * 2;

    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;

      const a = randomRange(angleMin, angleMax);
      const s = randomRange(speed[0], speed[1]);

      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = randomRange(life[0], life[1]);
      p.maxLife = p.life;
      p.color = pickColor(color);
      p.size = randomRange(size[0], size[1]);
      p.gravity = gravity ?? 0;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotationSpeed = randomRange(-3, 3);
      p.fadeMode = 'linear';

      this.active.push(p);
    }
  }

  // ─── Preset Effects ────────────────────────────────────

  emitExplosion(x: number, y: number, color: string, count: number = 20): void {
    this.emit(x, y, {
      count,
      color,
      speed: [80, 200],
      size: [2, 5],
      life: [0.3, 0.8],
      gravity: 120,
    });
  }

  emitTrail(x: number, y: number, color: string): void {
    this.emit(x, y, {
      count: 3,
      color,
      speed: [10, 30],
      size: [1, 3],
      life: [0.2, 0.5],
      angle: [Math.PI * 0.25, Math.PI * 0.75], // downward spread
    });
  }

  emitCelebration(x: number, y: number): void {
    this.emit(x, y, {
      count: 40,
      color: CELEBRATION_COLORS,
      speed: [100, 300],
      size: [2, 6],
      life: [0.5, 1.5],
      gravity: 150,
    });
  }

  emitSpark(x: number, y: number, color: string): void {
    this.emit(x, y, {
      count: 8,
      color,
      speed: [50, 120],
      size: [1, 2],
      life: [0.1, 0.3],
    });
  }

  // ─── Lifecycle ─────────────────────────────────────────

  update(dt: number): void {
    let i = this.active.length;
    while (i-- > 0) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        // Remove from active, return to pool
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.release(p);
        continue;
      }
      p.vx *= 1 - dt * 0.5; // light drag
      p.vy += (p.gravity ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rotationSpeed) {
        p.rotation = (p.rotation ?? 0) + p.rotationSpeed * dt;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i];
      const t = p.maxLife > 0 ? p.life / p.maxLife : 0;
      const alpha = p.fadeMode === 'ease' ? t * t : t;
      if (alpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      if (p.rotation) {
        ctx.rotate(p.rotation);
      }
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  clear(): void {
    while (this.active.length > 0) {
      const p = this.active.pop()!;
      this.release(p);
    }
  }
}
