import type Phaser from 'phaser';
import { Random } from '../systems/Random';

/** square: 木くずや火花、smoke: ふくらみながら消える煙、spark: きらっと光る点 */
type ParticleKind = 'square' | 'smoke' | 'spark';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: number;
  size: number;
  /** 下向きの重さ（煙は負で上へ昇る） */
  gravity: number;
}

/** 広がって消える輪（建ったとき、爆発） */
interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t: number;
  life: number;
  color: number;
  width: number;
}

/** 粒・煙・輪。戦場の座標で描く */
export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private readonly rng = new Random(99);

  /** 四角い粒を飛び散らせる */
  burst(x: number, y: number, color: number, n: number, speed: number, size: number): void {
    for (let i = 0; i < n; i++) this.spawn('square', x, y, color, speed, size, 320, this.rng.range(0.4, 0.8));
  }

  /** 煙のかたまり（倒した敵、爆発、えんとつ） */
  smoke(x: number, y: number, n: number, size: number, color = 0xe8e4dc, speed = 60): void {
    for (let i = 0; i < n; i++) this.spawn('smoke', x + this.rng.range(-size, size) * 0.5, y, color, speed, size, -40, this.rng.range(0.6, 1.0));
  }

  /** きらきら（建ったとき、レベルアップ） */
  sparkle(x: number, y: number, n: number, color = 0xfff3a0): void {
    for (let i = 0; i < n; i++) this.spawn('spark', x, y, color, 160, 4, 120, this.rng.range(0.5, 0.9));
  }

  ring(x: number, y: number, r0: number, r1: number, color: number, life = 0.45, width = 5): void {
    this.rings.push({ x, y, r0, r1, t: 0, life, color, width });
  }

  update(dt: number): void {
    for (const q of this.particles) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += q.gravity * dt;
      const drag = q.kind === 'smoke' ? 0.92 : 0.98;
      q.vx *= drag;
      if (q.kind === 'smoke') q.vy *= drag;
    }
    this.particles = this.particles.filter((q) => q.t < q.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    for (const r of this.rings) {
      const k = r.t / r.life;
      const e = 1 - (1 - k) * (1 - k);
      g.lineStyle(r.width * (1 - k * 0.6), r.color, 1 - k);
      g.strokeCircle(r.x, r.y, r.r0 + (r.r1 - r.r0) * e);
    }
    for (const q of this.particles) {
      const k = q.t / q.life;
      if (q.kind === 'smoke') {
        g.fillStyle(q.color, 0.55 * (1 - k));
        g.fillCircle(q.x, q.y, q.size * (0.6 + k * 1.1));
      } else if (q.kind === 'spark') {
        const s = q.size * (1 - k);
        g.fillStyle(q.color, 1 - k);
        g.fillRect(q.x - s / 2, q.y - s * 1.5, s, s * 3);
        g.fillRect(q.x - s * 1.5, q.y - s / 2, s * 3, s);
      } else {
        g.fillStyle(q.color, Math.max(0, 1 - k));
        g.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
    }
  }

  private spawn(kind: ParticleKind, x: number, y: number, color: number, speed: number, size: number, gravity: number, life: number): void {
    const rng = this.rng;
    const a = rng.range(0, Math.PI * 2);
    const v = rng.range(speed * 0.3, speed);
    this.particles.push({
      kind,
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - (kind === 'square' ? 60 : 0),
      t: 0,
      life,
      color,
      size: rng.range(size * 0.6, size * 1.3),
      gravity,
    });
  }
}
