/**
 * Particle Effects System — 粒子特效
 *
 * 基于对象池的高性能粒子系统，避免 GC 压力。
 * 提供可配置的粒子发射器和内置特效预设。
 *
 * Built-in effects: explosion, sparkle, trail
 *
 * Requirements: 6.7 (粒子特效系统)
 */

// ─── Types ───────────────────────────────────────────────

export interface ParticleConfig {
  /** Number of particles to emit */
  count: number;
  /** Color or array of colors to randomly pick from */
  color: string | string[];
  /** Speed range [min, max] in pixels per second */
  speed: [number, number];
  /** Size range [min, max] in pixels */
  size: [number, number];
  /** Lifetime range [min, max] in seconds */
  lifetime: [number, number];
  /** Emission angle range [min, max] in radians (default: full circle) */
  angle?: [number, number];
  /** Gravity in pixels/s^2 (default: 0) */
  gravity?: number;
  /** Drag coefficient 0-1 (default: 0) */
  drag?: number;
  /** Starting position offset range */
  spread?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
  drag: number;
  active: boolean;
}

// ─── Helpers ─────────────────────────────────────────────

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickColor(color: string | string[]): string {
  if (typeof color === 'string') return color;
  return color[Math.floor(Math.random() * color.length)];
}

// ─── ParticleEmitter ─────────────────────────────────────

export class ParticleEmitter {
  private pool: Particle[];
  private activeCount: number;
  private maxParticles: number;

  constructor(maxParticles: number = 500) {
    this.maxParticles = maxParticles;
    this.activeCount = 0;

    // Pre-allocate particle pool
    this.pool = [];
    for (let i = 0; i < maxParticles; i++) {
      this.pool.push(this.createParticle());
    }
  }

  private createParticle(): Particle {
    return {
      x: 0, y: 0,
      vx: 0, vy: 0,
      life: 0, maxLife: 0,
      color: '', size: 0,
      gravity: 0, drag: 0,
      active: false,
    };
  }

  private acquireParticle(): Particle | null {
    // Find an inactive particle in the pool
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        return this.pool[i];
      }
    }
    // Pool exhausted — recycle the oldest active particle
    if (this.pool.length > 0) {
      let oldest = -1;
      let minLife = Infinity;
      for (let i = 0; i < this.pool.length; i++) {
        if (this.pool[i].active && this.pool[i].life < minLife) {
          minLife = this.pool[i].life;
          oldest = i;
        }
      }
      if (oldest >= 0) {
        this.pool[oldest].active = false;
        this.activeCount--;
        return this.pool[oldest];
      }
    }
    return null;
  }

  // ─── Emit ──────────────────────────────────────────────

  /** Emit particles at position (x, y) with the given configuration */
  emit(x: number, y: number, config: ParticleConfig): void {
    const angleMin = config.angle ? config.angle[0] : 0;
    const angleMax = config.angle ? config.angle[1] : Math.PI * 2;
    const gravity = config.gravity ?? 0;
    const drag = config.drag ?? 0;
    const spread = config.spread ?? 0;

    for (let i = 0; i < config.count; i++) {
      const p = this.acquireParticle();
      if (!p) return;

      const angle = randomRange(angleMin, angleMax);
      const speed = randomRange(config.speed[0], config.speed[1]);

      p.x = x + (spread > 0 ? randomRange(-spread, spread) : 0);
      p.y = y + (spread > 0 ? randomRange(-spread, spread) : 0);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = randomRange(config.lifetime[0], config.lifetime[1]);
      p.maxLife = p.life;
      p.color = pickColor(config.color);
      p.size = randomRange(config.size[0], config.size[1]);
      p.gravity = gravity;
      p.drag = drag;
      p.active = true;
      this.activeCount++;
    }
  }

  // ─── Built-in Effects ──────────────────────────────────

  /** Explosion effect — particles burst outward with gravity */
  explosion(x: number, y: number, color: string | string[], count: number = 20): void {
    this.emit(x, y, {
      count,
      color,
      speed: [80, 220],
      size: [2, 5],
      lifetime: [0.3, 0.8],
      gravity: 150,
      drag: 0.02,
    });
  }

  /** Sparkle effect — small bright particles with slow drift */
  sparkle(x: number, y: number, color: string | string[], count: number = 10): void {
    this.emit(x, y, {
      count,
      color,
      speed: [20, 60],
      size: [1, 3],
      lifetime: [0.4, 1.0],
      gravity: -20,
      spread: 5,
    });
  }

  /** Trail effect — particles emitted in a narrow cone behind a moving object */
  trail(x: number, y: number, color: string, directionAngle: number = Math.PI / 2): void {
    this.emit(x, y, {
      count: 3,
      color,
      speed: [15, 40],
      size: [1, 2.5],
      lifetime: [0.15, 0.4],
      angle: [directionAngle - 0.4, directionAngle + 0.4],
      drag: 0.05,
    });
  }

  // ─── Update & Render ───────────────────────────────────

  /** Update all active particles. Call once per frame with dt in seconds. */
  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.activeCount--;
        continue;
      }

      // Apply drag
      if (p.drag > 0) {
        const dragFactor = 1 - p.drag;
        p.vx *= dragFactor;
        p.vy *= dragFactor;
      }

      // Apply gravity
      p.vy += p.gravity * dt;

      // Move
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** Render all active particles to the canvas context */
  render(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active || p.life <= 0) continue;

      const alpha = p.maxLife > 0 ? p.life / p.maxLife : 0;
      const currentSize = p.size * alpha;
      if (currentSize <= 0) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Remove all active particles */
  clear(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].active = false;
    }
    this.activeCount = 0;
  }

  /** Get the number of currently active particles */
  getActiveCount(): number {
    return this.activeCount;
  }
}
