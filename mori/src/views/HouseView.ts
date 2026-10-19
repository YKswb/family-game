import type Phaser from 'phaser';
import type { House } from '../entities/House';
import { INK, oRect, oTri, rr, softShadow } from './shapes';

/** えんとつの口（おうちの中心からの位置）。煙はここから出す */
export const CHIMNEY = { x: 30, y: -96 };

/** 守るおうち。攻撃を受けると壁が赤く光る */
export function drawHouse(g: Phaser.GameObjects.Graphics, h: House, nightWindows = false): void {
  const wall = h.hit > 0 ? 0xffb3a8 : 0xf7e2b3;
  softShadow(g, h.x, h.y + 4, 66, 16, 0.24);
  g.save();
  g.translateCanvas(h.x, h.y);
  // えんとつ
  oRect(g, 22, -96, 16, 30, 2, 0xb5533a);
  g.fillStyle(0x8f3f2c, 1);
  rr(g, 20, -99, 20, 6, 2);
  // 壁
  oRect(g, -46, -54, 92, 56, 6, wall);
  g.fillStyle(0xe2c690, 1);
  rr(g, -46, -10, 92, 12, 6);
  g.fillStyle(0xfff3d6, 1);
  rr(g, -42, -50, 30, 6, 3);
  // 戸
  oRect(g, -12, -32, 24, 34, 11, 0x8a5a33);
  g.fillStyle(0xa8754a, 1);
  rr(g, -9, -29, 8, 28, 4);
  g.fillStyle(0xffd84d, 1);
  g.fillCircle(6, -14, 2.2);
  // 窓
  const glass = nightWindows ? 0xffe27a : 0x7fc8f8;
  for (const wx of [-36, 20]) {
    oRect(g, wx, -44, 16, 14, 3, glass, 2);
    g.fillStyle(INK, 1);
    g.fillRect(wx + 7, -44, 2, 14);
    g.fillRect(wx, -38, 16, 2);
    g.fillStyle(0xffffff, 0.7);
    g.fillRect(wx + 2, -42, 4, 3);
  }
  // 屋根
  oTri(g, -62, -50, 0, -100, 62, -50, 0xd9573b);
  g.fillStyle(0xb8432c, 1);
  g.fillTriangle(-58, -52, 58, -52, 0, -60);
  g.lineStyle(2, 0xb8432c, 1);
  g.lineBetween(-36, -70, 36, -70);
  g.lineBetween(-20, -84, 20, -84);
  g.fillStyle(0xf07a5c, 1);
  g.fillTriangle(-6, -94, -50, -54, -40, -54);
  // 旗
  g.lineStyle(4.5, INK, 1);
  g.lineBetween(0, -99, 0, -131);
  g.lineStyle(2.5, 0x5a3a22, 1);
  g.lineBetween(0, -99, 0, -131);
  oTri(g, 1, -131, 27, -123, 1, -115, 0xffd84d);
  g.restore();
}
