import type Phaser from 'phaser';
import type { WeatherData } from '../data/gameData';
import { Random } from '../systems/Random';

interface Flake {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  spin: number;
}

/**
 * 画面に重ねる天気（花びら、落ち葉、雪、火の粉、ほたる）。画面の座標で動かし、
 * 画面の外へ出たら反対側から入り直す。粒は画像で、色ごとの画像は keys で受け取る
 */
export class Weather {
  private flakes: Flake[] = [];
  private readonly rng = new Random(5);
  private w = 1;
  private h = 1;
  private time = 0;

  constructor(
    private readonly data: WeatherData | undefined,
    /** 粒の画像を1枚作る（色ごとの画像から選ぶ） */
    private readonly make: (colorIndex: number) => Phaser.GameObjects.Image,
  ) {}

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const d = this.data;
    if (!d || d.type === 'none') return;
    for (const f of this.flakes) f.img.destroy();
    // 画面の広さに合わせて数を変える（iPad の横向きで count 個）
    const n = Math.round((d.count * (w * h)) / (1180 * 820));
    this.flakes = [];
    for (let i = 0; i < n; i++) {
      const img = this.make(i % d.colors.length);
      const f = { img, x: 0, y: 0, vx: 0, vy: 0, size: 1, phase: 0, spin: 1 };
      this.reset(f, this.rng.range(0, w), this.rng.range(0, h));
      this.flakes.push(f);
    }
  }

  private reset(f: Flake, x: number, y: number): void {
    const d = this.data!;
    const rng = this.rng;
    const rising = d.type === 'embers';
    const drifting = d.type === 'fireflies';
    f.x = x;
    f.y = y;
    f.vx = rng.range(-12, 18);
    f.vy = drifting ? rng.range(-8, 8) : rising ? -rng.range(25, 55) : rng.range(25, 60);
    // 粒の画像は幅 32 画素（size 16 相当）なので、size を倍率に直す
    f.size = rng.range(d.size * 0.7, d.size * 1.3) / 16;
    f.phase = rng.range(0, Math.PI * 2);
    f.spin = rng.range(1, 3);
  }

  update(dt: number): void {
    const d = this.data;
    if (!d || d.type === 'none') return;
    this.time += dt;
    const m = 20;
    for (const f of this.flakes) {
      const sway = Math.sin(this.time * f.spin + f.phase) * 18;
      f.x += (f.vx + sway) * dt;
      f.y += f.vy * dt;
      if (f.y > this.h + m) this.reset(f, this.rng.range(-m, this.w), -m);
      else if (f.y < -m) this.reset(f, this.rng.range(-m, this.w), this.h + m);
      if (f.x > this.w + m) f.x = -m;
      else if (f.x < -m) f.x = this.w + m;
      const spin = Math.sin(this.time * f.spin * 1.5 + f.phase);
      f.img.setPosition(f.x, f.y);
      if (d.type === 'petals' || d.type === 'leaves') {
        // くるくる回って見えるよう、幅を変える
        f.img.setScale(f.size * Math.max(0.25, Math.abs(spin)), f.size).setRotation(f.phase + this.time * 0.6);
      } else if (d.type === 'fireflies') {
        f.img.setScale(f.size).setAlpha(0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 2.5 + f.phase)));
      } else {
        f.img.setScale(f.size);
      }
    }
  }
}
