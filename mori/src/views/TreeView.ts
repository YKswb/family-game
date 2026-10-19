import type Phaser from 'phaser';
import type { Tree } from '../entities/Tree';
import { easeBack, ell, rr } from './shapes';

/** 木（切り倒されていれば切り株）。leaf は葉の色2つ */
export function drawTree(g: Phaser.GameObjects.Graphics, t: Tree, leaf: [number, number]): void {
  const s = t.size;
  if (!t.alive) {
    g.fillStyle(0x7a4e2b, 1);
    ell(g, t.x, t.y - 3, 11 * s, 6 * s);
    g.fillStyle(0xd1a571, 1);
    ell(g, t.x, t.y - 5, 8 * s, 4 * s);
    return;
  }
  const k = s * (t.grow < 1 ? easeBack(t.grow) : 1);
  const sx = t.shake > 0 ? Math.sin(t.shake * 80) * 4 * (t.shake / 0.25) : 0;
  g.save();
  g.translateCanvas(t.x + sx, t.y);
  g.scaleCanvas(k, k);
  g.fillStyle(0x000000, 0.18);
  ell(g, 0, 2, 24, 9);
  g.fillStyle(0x8a5a33, 1);
  rr(g, -6, -30, 12, 32, 4);
  g.fillStyle(leaf[0], 1);
  g.fillCircle(-16, -38, 19);
  g.fillCircle(16, -38, 19);
  g.fillCircle(0, -52, 26);
  g.fillStyle(leaf[1], 1);
  g.fillCircle(-6, -58, 13);
  g.fillCircle(10, -44, 10);
  g.restore();
  // 削れた木には残りの回数を出す
  if (t.hp < t.maxHp) {
    for (let i = 0; i < t.maxHp; i++) {
      g.fillStyle(i < t.hp ? 0xffd84d : 0x000000, i < t.hp ? 1 : 0.3);
      g.fillCircle(t.x - (t.maxHp - 1) * 7 + i * 14, t.y - 92 * s, 4.5);
    }
  }
}
