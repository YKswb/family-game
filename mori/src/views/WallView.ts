import type Phaser from 'phaser';
import type { Post, Spot } from '../systems/Build';
import { INK, LINE, oRect, rr } from './shapes';

type G = Phaser.GameObjects.Graphics;

/** かべの杭1本。レベル1は木、レベル2は石。alpha は払い途中の薄い杭に使う */
export function drawPost(g: G, p: Post, level: number, hit: boolean, alpha = 1): void {
  g.save();
  g.translateCanvas(p.x, p.y);
  g.fillStyle(0x000000, 0.18 * alpha);
  g.fillEllipse(0, 2, 24, 8);
  if (level <= 1) {
    const wood = hit ? 0xffd0c0 : 0xa86c39;
    g.fillStyle(INK, alpha);
    rr(g, -10, -29, 20, 33, 4);
    g.fillTriangle(-10, -27, 0, -41, 10, -27);
    g.fillStyle(wood, alpha);
    rr(g, -8, -28, 16, 30, 3);
    g.fillTriangle(-8, -27, 0, -38, 8, -27);
    g.fillStyle(0x8a5530, alpha);
    rr(g, 2, -26, 6, 28, 2);
    g.fillStyle(0xffffff, 0.22 * alpha);
    rr(g, -5, -26, 4, 26, 2);
  } else {
    const stone = hit ? 0xffd0c0 : 0x9aa3ad;
    oRect(g, -11, -26, 22, 28, 5, stone, LINE, alpha);
    g.fillStyle(0x7d8691, alpha);
    rr(g, -11, -6, 22, 8, 4);
    g.lineStyle(2, 0x6b737d, alpha);
    g.lineBetween(-11, -12, 11, -12);
    g.lineBetween(0, -26, 0, -12);
    oRect(g, -12, -31, 24, 7, 3, 0xc3cad1, 1.8, alpha);
  }
  g.restore();
}

/** まだ建っていない区画で、払った分だけ立っている薄い杭の数 */
export function ghostPosts(s: Spot): number {
  return s.level === 0 ? Math.floor((s.posts.length * s.paid) / s.cost) : 0;
}

/**
 * かべの区画の動く部分：乗っているときの黄色い輪と、石のかべへの払い込みの輪
 * （杭の場所の丸と薄い杭は画像で置く）
 */
export function drawWallSpot(g: G, s: Spot, time: number): void {
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
