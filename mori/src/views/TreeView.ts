import type Phaser from 'phaser';
import type { Tree } from '../entities/Tree';
import { INK, ell, oRect, rr, shade, softShadow, tint } from './shapes';

type G = Phaser.GameObjects.Graphics;

/** 葉のかたまり（輪郭 → 暗い色 → 本体 → 明るい色の順に重ねて丸みを出す） */
const BLOBS: [number, number, number][] = [
  [-16, -38, 19],
  [16, -38, 19],
  [0, -52, 26],
];

/** 葉の部分。原点は根元 */
export function drawCanopy(g: G, leaf: number, light: number): void {
  g.fillStyle(INK, 1);
  for (const [x, y, r] of BLOBS) g.fillCircle(x, y, r + 2.4);
  g.fillStyle(shade(leaf, 0.72), 1);
  for (const [x, y, r] of BLOBS) g.fillCircle(x, y, r);
  g.fillStyle(leaf, 1);
  for (const [x, y, r] of BLOBS) g.fillCircle(x - r * 0.12, y - r * 0.14, r * 0.86);
  g.fillStyle(light, 1);
  g.fillCircle(-8, -60, 12);
  g.fillCircle(-21, -44, 8);
  g.fillCircle(10, -46, 8);
  g.fillStyle(tint(light, 0.45), 0.9);
  g.fillCircle(-12, -64, 4.5);
  g.fillCircle(-24, -47, 3);
}

/** 幹。原点は根元 */
export function drawTrunk(g: G): void {
  oRect(g, -6, -30, 12, 32, 4, 0x8a5a33, 2);
  g.fillStyle(0xa8754a, 1);
  rr(g, -4, -28, 4, 28, 2);
}

/** 切り株。原点は根元 */
export function drawStump(g: G): void {
  softShadow(g, 0, 0, 13, 5, 0.18);
  g.fillStyle(INK, 1);
  ell(g, 0, -3, 12.5, 7.5);
  g.fillStyle(0x7a4e2b, 1);
  ell(g, 0, -3, 11, 6);
  g.fillStyle(0xd1a571, 1);
  ell(g, 0, -5, 8, 4);
  g.fillStyle(0xb88a58, 1);
  ell(g, 0, -5, 3.5, 1.8);
}

/** 削れた木の上に、残りの回数を点で出す */
export function drawTreeHp(g: G, t: Tree): void {
  if (!t.alive || t.hp >= t.maxHp) return;
  for (let i = 0; i < t.maxHp; i++) {
    const x = t.x - (t.maxHp - 1) * 7 + i * 14;
    const y = t.y - 92 * t.size;
    g.fillStyle(INK, 1);
    g.fillCircle(x, y, 6);
    g.fillStyle(i < t.hp ? 0xffd84d : 0x6b6b6b, 1);
    g.fillCircle(x, y, 4.5);
  }
}
