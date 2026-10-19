import type Phaser from 'phaser';
import type { BuildingType } from '../data/gameData';
import { INK, oCircle, oPoly, oRect, oTri, rr } from './shapes';

type G = Phaser.GameObjects.Graphics;

function axe(g: G): void {
  g.rotateCanvas(-0.5);
  oRect(g, -2.5, -12, 5, 26, 2, 0x8a5a33, 1.8);
  oPoly(
    g,
    [
      { x: 2, y: -12 },
      { x: 14, y: -17 },
      { x: 14, y: 1 },
      { x: 2, y: -4 },
    ],
    0xc3ccd6,
  );
  g.fillStyle(0xffffff, 0.7);
  g.fillTriangle(5, -11, 12, -14, 12, -11);
}

function bag(g: G): void {
  g.lineStyle(5, INK, 1);
  g.beginPath();
  g.arc(0, -6, 8, Math.PI, 0);
  g.strokePath();
  g.lineStyle(3, 0x8a5a33, 1);
  g.beginPath();
  g.arc(0, -6, 8, Math.PI, 0);
  g.strokePath();
  oRect(g, -13, -7, 26, 20, 7, 0xe05a6a);
  g.fillStyle(0xb8404f, 1);
  rr(g, -13, 5, 26, 8, 5);
  oRect(g, -6, -2, 12, 7, 2, 0xffd84d, 1.4);
  g.fillStyle(0xff8a96, 1);
  rr(g, -10, -5, 6, 4, 2);
}

function tower(g: G): void {
  oRect(g, -9, -6, 18, 18, 2, 0xc58a52);
  g.fillStyle(0xa86c39, 1);
  g.fillRect(-1, -6, 2, 18);
  oRect(g, -12, -9, 24, 6, 2, 0x9aa3ad, 1.6);
  oTri(g, -13, -9, 0, -21, 13, -9, 0xd9573b);
  oCircle(g, 0, 4, 3.5, 0x5a3a22, 1.4);
}

function flag(g: G): void {
  g.lineStyle(5, INK, 1);
  g.lineBetween(-7, 14, -7, -16);
  g.lineStyle(3, 0x8a5a33, 1);
  g.lineBetween(-7, 14, -7, -16);
  oPoly(
    g,
    [
      { x: -6, y: -16 },
      { x: 14, y: -10 },
      { x: -6, y: -3 },
    ],
    0xff5a6a,
  );
  oCircle(g, -7, -17, 2.5, 0xffd84d, 1.2);
}

/** 建設地点のアイコン（おの、かばん、とう、旗）。size は目安の大きさ */
export function drawIcon(g: G, type: BuildingType, x: number, y: number, size = 1): void {
  g.save();
  g.translateCanvas(x, y);
  g.scaleCanvas(size, size);
  if (type === 'axe') axe(g);
  else if (type === 'bag') bag(g);
  else if (type === 'tower') tower(g);
  else if (type === 'land') flag(g);
  g.restore();
}
