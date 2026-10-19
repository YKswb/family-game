import type Phaser from 'phaser';
import type { StageData } from '../data/stageData';
import { drawTree } from '../entities/UnitView';
import type { Random } from '../systems/Random';

type Terrain = StageData['terrain'];

/**
 * 戦場の地面と地形（動かないもの）を一度だけ描く。
 * 道・川・橋・家・テントは見た目、川と森は当たり判定もある（World 側で扱う）
 */
export function drawField(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  forests: readonly { x: number; y: number; r: number }[],
  terrain: Terrain | null,
  rng: Random,
): void {
  const area = (width * height) / (2400 * 1600);
  g.fillStyle(0x6fb352, 1);
  g.fillRect(0, 0, width, height);
  g.fillStyle(0x3c7832, 0.22);
  for (let i = 0; i < 30 * area; i++) g.fillEllipse(rng.range(0, width), rng.range(0, height), rng.range(160, 440), rng.range(100, 280));
  for (let i = 0; i < 700 * area; i++) {
    g.fillStyle(i % 2 ? 0x5f9a45 : 0x7db85c, 1);
    const s = rng.range(3, 7);
    g.fillEllipse(rng.range(0, width), rng.range(0, height), s * 2, s);
  }
  const flowers = [0xffffff, 0xffd84d, 0xff9ec4];
  for (let i = 0; i < 120 * area; i++) {
    g.fillStyle(flowers[i % 3], 1);
    g.fillCircle(rng.range(0, width), rng.range(0, height), 3);
  }

  if (terrain) {
    for (const road of terrain.roads) drawRoad(g, road);
    for (const r of terrain.rivers) drawRiver(g, r);
    for (const w of terrain.walls) drawWall(g, w);
    for (const b of terrain.bridges) drawBridge(g, b);
    for (const gt of terrain.gates) drawBridge(g, gt);
  }

  // 家・テント・木は、下にあるものほど手前に見えるよう y の順に描く
  const things: { y: number; draw: () => void }[] = [];
  for (const o of forests) {
    const n = Math.round(o.r / 9);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * (o.r - 14);
      const x = o.x + Math.cos(a) * d;
      const y = o.y + Math.sin(a) * d * 0.8 + 20;
      const s = rng.range(0.85, 1.2);
      things.push({ y, draw: () => drawTree(g, x, y, s) });
    }
  }
  if (terrain) {
    for (const h of terrain.houses) things.push({ y: h.y, draw: () => drawHouse(g, h.x, h.y) });
    for (const t of terrain.tents) things.push({ y: t.y, draw: () => drawTent(g, t.x, t.y) });
  }
  things.sort((a, b) => a.y - b.y);
  for (const t of things) t.draw();
}

function drawRoad(g: Phaser.GameObjects.Graphics, pts: [number, number][]): void {
  // 太い線のつなぎ目に隙間ができないよう、角に円を置く
  g.lineStyle(64, 0xcdb482, 0.55);
  for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  g.fillStyle(0xcdb482, 0.55);
  for (let i = 1; i < pts.length - 1; i++) g.fillCircle(pts[i][0], pts[i][1], 32);
}

function drawRiver(g: Phaser.GameObjects.Graphics, r: { x: number; y: number; w: number; h: number }): void {
  g.fillStyle(0x2f6f9f, 1);
  g.fillRect(r.x - 6, r.y, r.w + 12, r.h);
  g.fillStyle(0x3f8fd0, 1);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle(0xffffff, 0.25);
  const vertical = r.h >= r.w;
  const len = vertical ? r.h : r.w;
  for (let p = 30; p < len; p += 70) {
    if (vertical) g.fillEllipse(r.x + r.w * (0.3 + 0.4 * ((p / 70) % 2)), r.y + p, 36, 8);
    else g.fillEllipse(r.x + p, r.y + r.h * (0.3 + 0.4 * ((p / 70) % 2)), 8, 36);
  }
}

function drawWall(g: Phaser.GameObjects.Graphics, r: { x: number; y: number; w: number; h: number }): void {
  g.fillStyle(0x8c8c8c, 1);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.lineStyle(2, 0x6a6a6a, 1);
  g.strokeRect(r.x, r.y, r.w, r.h);
}

function drawBridge(g: Phaser.GameObjects.Graphics, r: { x: number; y: number; w: number; h: number }): void {
  g.fillStyle(0xb98a52, 1);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.lineStyle(3, 0x8a5a33, 1);
  // 板は渡る向きと直角に並べる（縦長の川にかかる橋なら縦の板）
  for (let x = r.x + 10; x < r.x + r.w; x += 14) g.lineBetween(x, r.y, x, r.y + r.h);
  g.lineStyle(5, 0x6b4325, 1);
  g.lineBetween(r.x, r.y + 3, r.x + r.w, r.y + 3);
  g.lineBetween(r.x, r.y + r.h - 3, r.x + r.w, r.y + r.h - 3);
}

function drawHouse(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(x, y + 4, 90, 20);
  g.fillStyle(0xeadbb5, 1);
  g.fillRect(x - 36, y - 46, 72, 48);
  g.fillStyle(0xb5523b, 1);
  g.fillTriangle(x - 46, y - 44, x, y - 84, x + 46, y - 44);
  g.fillStyle(0x6b4325, 1);
  g.fillRect(x - 9, y - 26, 18, 28);
  g.fillStyle(0x7fb3d9, 1);
  g.fillRect(x + 14, y - 36, 14, 12);
}

function drawTent(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(x, y + 4, 88, 24);
  g.fillStyle(0x6b3a3a, 1);
  g.fillTriangle(x - 44, y, x, y - 58, x + 44, y);
  g.fillStyle(0x2b1d1d, 1);
  g.fillTriangle(x - 10, y, x, y - 24, x + 10, y);
  g.lineStyle(3, 0x3a2a2a, 1);
  g.lineBetween(x, y - 58, x, y - 76);
  g.fillStyle(0xd9342b, 1);
  g.fillTriangle(x, y - 76, x + 22, y - 70, x, y - 64);
}
