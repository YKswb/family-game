import type Phaser from 'phaser';
import type { Post, Spot } from '../systems/Build';
import { rr } from './shapes';

type G = Phaser.GameObjects.Graphics;

/** かべの杭1本。レベル1は木、レベル2は石。alpha は払い途中の薄い杭に使う */
export function drawPost(g: G, p: Post, level: number, hit: boolean, alpha = 1): void {
  g.save();
  g.translateCanvas(p.x, p.y);
  g.fillStyle(0x000000, 0.18 * alpha);
  g.fillEllipse(0, 2, 24, 8);
  if (level <= 1) {
    g.fillStyle(hit ? 0xffd0c0 : 0xa86c39, alpha);
    rr(g, -8, -28, 16, 30, 3);
    g.fillTriangle(-8, -27, 0, -38, 8, -27);
    g.fillStyle(0xffffff, 0.2 * alpha);
    rr(g, -5, -26, 4, 26, 2);
  } else {
    g.fillStyle(hit ? 0xffd0c0 : 0x9aa3ad, alpha);
    rr(g, -11, -26, 22, 28, 5);
    g.lineStyle(2, 0x7d8691, alpha);
    g.lineBetween(-11, -12, 11, -12);
    g.lineBetween(0, -26, 0, -12);
    g.fillStyle(0xc3cad1, alpha);
    rr(g, -12, -31, 24, 7, 3);
  }
  g.restore();
}

/**
 * まだ建っていないかべの区画：杭の場所を点線の丸で示し、払った分だけ薄い杭を立てる。
 * 石のかべへの払い込みは、区画の真ん中に黄色い輪で示す
 */
export function drawWallSpot(g: G, s: Spot, time: number): void {
  const n = s.posts.length;
  if (s.level === 0) {
    const built = Math.floor((n * s.paid) / s.cost);
    s.posts.forEach((p, j) => {
      if (j < built) {
        drawPost(g, p, 1, false, 0.6);
        return;
      }
      g.lineStyle(2, 0xffffff, 0.7);
      g.strokeCircle(p.x, p.y - 4, 10);
    });
  }
  if (s.near && !s.maxed) {
    g.lineStyle(4, 0xffcc1f, 1);
    g.strokeCircle(s.x, s.y, 26 + Math.sin(time * 10) * 2);
  }
  if (s.level === 1 && s.paid > 0) {
    g.lineStyle(6, 0xffcc1f, 1);
    g.beginPath();
    g.arc(s.x, s.y - 10, 22, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s.paid) / s.cost);
    g.strokePath();
  }
}
