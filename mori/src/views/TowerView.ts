import type Phaser from 'phaser';
import type { TowerData } from '../data/gameData';
import type { Spot } from '../systems/Build';
import { hex } from '../ui/Display';
import { ell, rr } from './shapes';

/** 建ったとう。屋根の色が種類、黄色い点がレベル */
export function drawTower(g: Phaser.GameObjects.Graphics, s: Spot, data: TowerData, snow = false): void {
  const k = 1 + (s.pop > 0 ? Math.sin((s.pop / 0.5) * Math.PI) * 0.18 : 0);
  g.save();
  g.translateCanvas(s.x, s.y);
  g.scaleCanvas(k, k);
  g.fillStyle(0x000000, 0.2);
  ell(g, 0, 3, 26, 9);
  g.fillStyle(0x9aa3ad, 1);
  rr(g, -21, -18, 42, 20, 5);
  g.fillStyle(0xa86c39, 1);
  rr(g, -17, -72, 8, 56, 2);
  rr(g, 9, -72, 8, 56, 2);
  g.lineStyle(4, 0x8a5530, 1);
  g.lineBetween(-13, -26, 13, -62);
  g.lineBetween(13, -26, -13, -62);
  g.fillStyle(0xc58a52, 1);
  rr(g, -25, -76, 50, 10, 3);
  if (s.kind === 'cannon') {
    g.fillStyle(0x2e3238, 1);
    g.fillCircle(0, -84, 9);
    rr(g, 2, -90, 16, 8, 3);
  } else if (s.kind === 'ice') {
    g.fillStyle(0xbff0ff, 1);
    g.fillPoints(
      [
        { x: 0, y: -98 },
        { x: 8, y: -86 },
        { x: 0, y: -77 },
        { x: -8, y: -86 },
      ],
      true,
    );
  } else {
    g.fillStyle(0xffd9b0, 1);
    g.fillCircle(0, -84, 7);
  }
  g.lineStyle(3, 0x8a5530, 1);
  g.lineBetween(-20, -76, -20, -94);
  g.lineBetween(20, -76, 20, -94);
  g.fillStyle(s.kind ? hex(data.kinds[s.kind].color) : 0xbbbbbb, 1);
  g.fillTriangle(-29, -92, 0, -122, 29, -92);
  if (snow) {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(-12, -110, 0, -122, 12, -110);
  }
  for (let i = 0; i < s.level; i++) {
    g.fillStyle(0xffd84d, 1);
    g.fillCircle(-10 + i * 10, -100, 3);
  }
  g.restore();
}
