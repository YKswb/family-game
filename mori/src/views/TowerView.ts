import type Phaser from 'phaser';
import type { TowerData } from '../data/gameData';
import type { Spot } from '../systems/Build';
import { hex } from '../ui/Display';
import { INK, oCircle, oPoly, oRect, oTri, rr, shade, softShadow } from './shapes';

/** とうの撃ち口の高さ（足元から） */
export const MUZZLE_Y = -84;

/** 建ったとう。屋根の色が種類、黄色い星がレベル。建った直後は弾む */
export function drawTower(g: Phaser.GameObjects.Graphics, s: Spot, data: TowerData, snow = false): void {
  const k = 1 + (s.pop > 0 ? Math.sin((s.pop / 0.5) * Math.PI) * 0.18 : 0);
  const roof = s.kind ? hex(data.kinds[s.kind].color) : 0xbbbbbb;
  softShadow(g, s.x, s.y + 3, 28, 9, 0.24);
  g.save();
  g.translateCanvas(s.x, s.y);
  g.scaleCanvas(k, 2 - k);
  // 石の土台
  oRect(g, -21, -18, 42, 20, 5, 0x9aa3ad);
  g.fillStyle(0x7d8691, 1);
  rr(g, -21, -6, 42, 8, 4);
  g.fillStyle(0xc3cad1, 1);
  rr(g, -17, -16, 14, 5, 2);
  // 木の脚
  oRect(g, -17, -72, 8, 56, 2, 0xa86c39, 1.8);
  oRect(g, 9, -72, 8, 56, 2, 0xa86c39, 1.8);
  g.lineStyle(5.5, INK, 1);
  g.lineBetween(-13, -26, 13, -62);
  g.lineBetween(13, -26, -13, -62);
  g.lineStyle(3.5, 0x8a5530, 1);
  g.lineBetween(-13, -26, 13, -62);
  g.lineBetween(13, -26, -13, -62);
  // 見張り台
  oRect(g, -25, -76, 50, 10, 3, 0xc58a52);
  g.fillStyle(0xdba56c, 1);
  rr(g, -23, -75, 46, 3, 1.5);
  // 撃ち手
  if (s.kind === 'cannon') {
    oCircle(g, 0, MUZZLE_Y, 9, 0x2e3238);
    oRect(g, 2, -90, 16, 8, 3, 0x2e3238, 1.6);
    g.fillStyle(0x5a6068, 1);
    g.fillCircle(-3, -87, 3);
  } else if (s.kind === 'ice') {
    oPoly(
      g,
      [
        { x: 0, y: -98 },
        { x: 8, y: -86 },
        { x: 0, y: -77 },
        { x: -8, y: -86 },
      ],
      0xbff0ff,
    );
    g.fillStyle(0xffffff, 0.9);
    g.fillTriangle(0, -95, -5, -86, 0, -86);
  } else if (s.kind === 'lightning') {
    // 電気の玉と、まわりに走る小さな稲妻
    g.fillStyle(0xfff3a0, 0.5);
    g.fillCircle(0, MUZZLE_Y, 12);
    oCircle(g, 0, MUZZLE_Y, 7.5, 0xffd84d, 1.8);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(-2.5, MUZZLE_Y - 2.5, 2.5);
    g.lineStyle(2, 0xfff3a0, 1);
    g.lineBetween(-9, -88, -13, -82);
    g.lineBetween(-13, -82, -10, -80);
    g.lineBetween(9, -80, 14, -86);
  } else if (s.kind === 'heal') {
    // 緑の十字
    g.fillStyle(0xbff5c8, 0.5);
    g.fillCircle(0, MUZZLE_Y, 11);
    oRect(g, -3, -92, 6, 16, 1.5, 0x4cbf6a, 1.6);
    oRect(g, -8, -87, 16, 6, 1.5, 0x4cbf6a, 1.6);
    g.fillStyle(0x4cbf6a, 1);
    g.fillRect(-3, -87, 6, 6);
  } else {
    oCircle(g, 0, MUZZLE_Y, 7, 0xffd9b0, 1.8);
    g.fillStyle(0x2f6fd6, 1);
    g.beginPath();
    g.arc(0, -86, 7.5, Math.PI, 0);
    g.fillPath();
  }
  // 柱と屋根
  g.lineStyle(5, INK, 1);
  g.lineBetween(-20, -76, -20, -94);
  g.lineBetween(20, -76, 20, -94);
  g.lineStyle(3, 0x8a5530, 1);
  g.lineBetween(-20, -76, -20, -94);
  g.lineBetween(20, -76, 20, -94);
  oTri(g, -30, -92, 0, -123, 30, -92, roof);
  g.fillStyle(shade(roof, 0.75), 1);
  g.fillTriangle(0, -121, 28, -93, 6, -93);
  if (snow) {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(-12, -110, 0, -122, 12, -110);
  }
  // 分かれ道を選んだとうは、屋根の上に旗を立てる（左の道は赤、右の道は青）
  if (s.branch !== null && s.branch !== undefined) {
    g.lineStyle(3.5, INK, 1);
    g.lineBetween(0, -122, 0, -140);
    g.lineStyle(1.8, 0x8a5530, 1);
    g.lineBetween(0, -122, 0, -140);
    oTri(g, 1, -140, 16, -135, 1, -130, s.branch === 0 ? 0xff5a6a : 0x5ab0ff);
  }
  // レベルの星
  for (let i = 0; i < s.level; i++) {
    const x = -10 + i * 10;
    g.fillStyle(INK, 1);
    g.fillCircle(x, -100, 4.4);
    g.fillStyle(0xffd84d, 1);
    g.fillCircle(x, -100, 3);
  }
  g.restore();
}
