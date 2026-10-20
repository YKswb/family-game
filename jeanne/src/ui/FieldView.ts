import type Phaser from 'phaser';
import type { StageData } from '../data/stageData';
import { drawTree } from '../entities/UnitView';
import type { Random } from '../systems/Random';

type Terrain = StageData['terrain'];

/** 道の色（土の色 0xcdb482 を草地に 55% で重ねた色） */
const ROAD_COLOR = 0xa3b46c;

/** 地面に描くもの1つ。描く範囲（はみ出さない四角）と描き方 */
export interface FieldItem {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  draw: (g: Phaser.GameObjects.Graphics) => void;
}

/**
 * 戦場の地面と地形（動かないもの）を、描く順に並べて返す。
 * 道・川・橋・家・テントは見た目、川と森は当たり判定もある（World 側で扱う）
 */
export function fieldItems(
  width: number,
  height: number,
  forests: readonly { x: number; y: number; r: number }[],
  terrain: Terrain | null,
  rng: Random,
): FieldItem[] {
  const items: FieldItem[] = [];
  const box = (x: number, y: number, hw: number, hh: number, draw: FieldItem['draw']) =>
    items.push({ x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh, draw });

  const area = (width * height) / (2400 * 1600);
  items.push({
    x0: 0,
    y0: 0,
    x1: width,
    y1: height,
    draw: (g) => {
      g.fillStyle(0x6fb352, 1);
      g.fillRect(0, 0, width, height);
    },
  });
  for (let i = 0; i < 30 * area; i++) {
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    const w = rng.range(160, 440);
    const h = rng.range(100, 280);
    box(x, y, w / 2, h / 2, (g) => {
      g.fillStyle(0x3c7832, 0.22);
      g.fillEllipse(x, y, w, h);
    });
  }
  for (let i = 0; i < 700 * area; i++) {
    const color = i % 2 ? 0x5f9a45 : 0x7db85c;
    const s = rng.range(3, 7);
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    box(x, y, s, s / 2, (g) => {
      g.fillStyle(color, 1);
      g.fillEllipse(x, y, s * 2, s);
    });
  }
  const flowers = [0xffffff, 0xffd84d, 0xff9ec4];
  for (let i = 0; i < 120 * area; i++) {
    const color = flowers[i % 3];
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    box(x, y, 3, 3, (g) => {
      g.fillStyle(color, 1);
      g.fillCircle(x, y, 3);
    });
  }

  if (terrain) {
    for (const road of terrain.roads) {
      const xs = road.map((p) => p[0]);
      const ys = road.map((p) => p[1]);
      items.push({ x0: Math.min(...xs) - 32, y0: Math.min(...ys) - 32, x1: Math.max(...xs) + 32, y1: Math.max(...ys) + 32, draw: (g) => drawRoad(g, road) });
    }
    for (const r of terrain.rivers) items.push({ ...rectBox(r, 6), draw: (g) => drawRiver(g, r) });
    for (const w of terrain.walls) items.push({ ...rectBox(w, 2), draw: (g) => drawWall(g, w) });
    for (const b of terrain.bridges) items.push({ ...rectBox(b, 3), draw: (g) => drawBridge(g, b) });
    // 門は開くと見た目が変わるので、地面の絵には入れない（戦場の描画で毎フレーム描く）
  }

  // 家・テント・木は、下にあるものほど手前に見えるよう y の順に描く
  const things: { y: number; item: FieldItem }[] = [];
  for (const o of forests) {
    const n = Math.round(o.r / 9);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * (o.r - 14);
      const x = o.x + Math.cos(a) * d;
      const y = o.y + Math.sin(a) * d * 0.8 + 20;
      const s = rng.range(0.85, 1.2);
      things.push({ y, item: { x0: x - 32 * s, y0: y - 62 * s, x1: x + 32 * s, y1: y + 10 * s, draw: (g) => drawTree(g, x, y, s) } });
    }
  }
  if (terrain) {
    for (const h of terrain.houses) things.push({ y: h.y, item: { x0: h.x - 48, y0: h.y - 86, x1: h.x + 48, y1: h.y + 16, draw: (g) => drawHouse(g, h.x, h.y) } });
    for (const t of terrain.tents) things.push({ y: t.y, item: { x0: t.x - 46, y0: t.y - 78, x1: t.x + 46, y1: t.y + 18, draw: (g) => drawTent(g, t.x, t.y) } });
    for (const c of terrain.castles ?? []) things.push({ y: c.y, item: { x0: c.x - 140, y0: c.y - 270, x1: c.x + 140, y1: c.y + 30, draw: (g) => drawCastle(g, c.x, c.y) } });
  }
  things.sort((a, b) => a.y - b.y);
  for (const t of things) items.push(t.item);
  return items;
}

function rectBox(r: { x: number; y: number; w: number; h: number }, m: number) {
  return { x0: r.x - m, y0: r.y - m, x1: r.x + r.w + m, y1: r.y + r.h + m };
}

function drawRoad(g: Phaser.GameObjects.Graphics, pts: [number, number][]): void {
  // 太い線のつなぎ目に隙間ができないよう、角に円を置く。
  // 半透明だと重なった所が濃く見えるので、草地と混ぜた色を不透明で塗る
  g.lineStyle(64, ROAD_COLOR, 1);
  for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  g.fillStyle(ROAD_COLOR, 1);
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
  // 石積みの目地
  g.lineStyle(1.5, 0x737373, 1);
  const vertical = r.h > r.w;
  const len = vertical ? r.h : r.w;
  for (let p = 18; p < len; p += 18) {
    if (vertical) g.lineBetween(r.x, r.y + p, r.x + r.w, r.y + p);
    else g.lineBetween(r.x + p, r.y, r.x + p, r.y + r.h);
  }
  g.lineStyle(3, 0x5f5f5f, 1);
  g.strokeRect(r.x, r.y, r.w, r.h);
}

/** 城（見た目だけ）。(x, y) が正面の足もと */
function drawCastle(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(x, y + 6, 280, 40);
  // 城壁と真ん中の塔
  g.fillStyle(0xd8d0bd, 1);
  g.fillRect(x - 110, y - 90, 220, 92);
  g.fillRect(x - 40, y - 170, 80, 90);
  // 両はしの塔
  g.fillRect(x - 130, y - 140, 44, 142);
  g.fillRect(x + 86, y - 140, 44, 142);
  // 青い屋根
  g.fillStyle(0x3f6fd8, 1);
  g.fillTriangle(x - 136, y - 140, x - 108, y - 196, x - 80, y - 140);
  g.fillTriangle(x + 80, y - 140, x + 108, y - 196, x + 136, y - 140);
  g.fillTriangle(x - 48, y - 170, x, y - 230, x + 48, y - 170);
  // 城門と窓
  g.fillStyle(0x6b4325, 1);
  g.fillRoundedRect(x - 22, y - 46, 44, 48, { tl: 20, tr: 20, bl: 0, br: 0 });
  g.fillStyle(0x3b4a66, 1);
  for (const wx of [x - 70, x + 60, x - 8]) g.fillRect(wx, wx === x - 8 ? y - 140 : y - 72, 12, 16);
  // 旗
  g.lineStyle(2, 0x5a3a22, 1);
  g.lineBetween(x, y - 230, x, y - 262);
  g.fillStyle(0x2f6fd6, 1);
  g.fillTriangle(x, y - 262, x + 26, y - 254, x, y - 246);
  g.fillStyle(0xffd84d, 1);
  g.fillCircle(x + 8, y - 254, 2.5);
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
