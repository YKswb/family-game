import type Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { ell, rr } from './shapes';

/** 背負った木材の山は、これ以上は高くしない */
const MAX_STACK = 32;

/** 背負った木材の山のてっぺんの高さ（足元から） */
export function stackTop(p: Player): number {
  return 40 + Math.min(p.wood, MAX_STACK) * 5;
}

/** 主人公。背中に木材を積み、斧を振る */
export function drawPlayer(g: Phaser.GameObjects.Graphics, p: Player, axeLevel: number): void {
  const bob = p.moving ? Math.abs(Math.sin(p.step)) * 3 : 0;
  g.save();
  g.translateCanvas(p.x, p.y);
  g.fillStyle(0x000000, 0.2);
  ell(g, 0, 2, 16, 6);
  g.scaleCanvas(p.face, 1);
  const lg = p.moving ? Math.sin(p.step) * 4 : 0;
  g.fillStyle(0x3b5b8f, 1);
  rr(g, -8 + lg, -12, 6, 12, 2);
  rr(g, 2 - lg, -12, 6, 12, 2);
  const n = Math.min(p.wood, MAX_STACK);
  for (let i = 0; i < n; i++) {
    const y = -26 - bob - i * 5;
    g.fillStyle(i % 2 ? 0xa8693a : 0xc07d48, 1);
    rr(g, -25, y, 17, 6, 2);
    g.fillStyle(0xecc79a, 1);
    ell(g, -23, y + 3, 2.6, 2.6);
  }
  g.fillStyle(0xff7a2f, 1);
  rr(g, -11, -32 - bob, 22, 22, 8);
  g.fillStyle(0xffd9b0, 1);
  g.fillCircle(0, -42 - bob, 12);
  g.fillStyle(0x2f6fd6, 1);
  g.beginPath();
  g.arc(0, -44 - bob, 12.5, Math.PI, 0);
  g.fillPath();
  rr(g, 2, -47 - bob, 15, 4, 2);
  g.fillStyle(0x2b1d12, 1);
  g.fillCircle(3.5, -40 - bob, 1.9);
  g.fillCircle(8.5, -40 - bob, 1.9);
  g.fillStyle(0xff7878, 0.5);
  g.fillCircle(9, -36 - bob, 2.5);
  // 斧
  g.translateCanvas(9, -24 - bob);
  g.rotateCanvas(p.swing > 0 ? -2.0 + (1 - p.swing) * 2.8 : -0.5);
  g.fillStyle(0x7a4e2b, 1);
  rr(g, -2, -24, 4, 26, 2);
  g.fillStyle(axeLevel >= 3 ? 0xffd84d : 0xc3ccd6, 1);
  g.fillPoints(
    [
      { x: 2, y: -25 },
      { x: 14, y: -29 },
      { x: 14, y: -13 },
      { x: 2, y: -17 },
    ],
    true,
  );
  g.restore();
}
