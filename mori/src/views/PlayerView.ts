import type Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { INK, ell, oCircle, oPoly, oRect, rr, softShadow } from './shapes';

/** 背負った木材の山は、これ以上は高くしない */
const MAX_STACK = 32;

/** 背負った木材の山のてっぺんの高さ（足元から） */
export function stackTop(p: Player): number {
  return 40 + Math.min(p.wood, MAX_STACK) * 5;
}

/** 主人公。背中に木材を積み、斧を振る。歩くと弾み、振るときに体が少しつぶれる */
export function drawPlayer(g: Phaser.GameObjects.Graphics, p: Player, axeLevel: number): void {
  const bob = p.moving ? Math.abs(Math.sin(p.step)) * 3 : 0;
  // 振りかぶった瞬間に縦につぶれ、振り下ろすと戻る
  const squash = p.swing > 0.6 ? 1 - (p.swing - 0.6) * 0.15 : 1;
  softShadow(g, p.x, p.y + 2, 16, 6, 0.24);
  g.save();
  g.translateCanvas(p.x, p.y);
  g.scaleCanvas(p.face * (2 - squash), squash);
  const lg = p.moving ? Math.sin(p.step) * 4 : 0;
  oRect(g, -8 + lg, -12, 6, 12, 2, 0x3b5b8f, 1.8);
  oRect(g, 2 - lg, -12, 6, 12, 2, 0x3b5b8f, 1.8);
  g.fillStyle(0x5a3a22, 1);
  rr(g, -8.5 + lg, -3, 7, 4, 2);
  rr(g, 1.5 - lg, -3, 7, 4, 2);
  // 背中の木材
  const n = Math.min(p.wood, MAX_STACK);
  if (n > 0) {
    g.fillStyle(INK, 1);
    rr(g, -26.5, -27.5 - bob - (n - 1) * 5, 20, (n - 1) * 5 + 9, 3);
  }
  for (let i = 0; i < n; i++) {
    const y = -26 - bob - i * 5;
    g.fillStyle(i % 2 ? 0xa8693a : 0xc07d48, 1);
    rr(g, -25, y, 17, 6, 2);
    g.fillStyle(0xecc79a, 1);
    ell(g, -23, y + 3, 2.6, 2.6);
  }
  // 体（オレンジの服、下を暗く、左上を明るく）
  oRect(g, -11, -32 - bob, 22, 22, 8, 0xff7a2f);
  g.fillStyle(0xd85a1a, 1);
  rr(g, -11, -18 - bob, 22, 8, 6);
  g.fillStyle(0xffa060, 1);
  rr(g, -8, -29 - bob, 7, 9, 3);
  g.fillStyle(0x6b3f1f, 1);
  rr(g, -11, -20 - bob, 22, 3, 1);
  // 顔
  oCircle(g, 0, -42 - bob, 12, 0xffd9b0);
  g.fillStyle(0xffe8cc, 1);
  g.fillCircle(-3, -46 - bob, 5);
  // 帽子
  g.fillStyle(INK, 1);
  g.beginPath();
  g.arc(0, -44 - bob, 14.5, Math.PI, 0);
  g.fillPath();
  rr(g, 0, -49 - bob, 19, 7, 3);
  g.fillStyle(0x2f6fd6, 1);
  g.beginPath();
  g.arc(0, -44 - bob, 12.5, Math.PI, 0);
  g.fillPath();
  rr(g, 2, -47 - bob, 15, 4, 2);
  g.fillStyle(0x5a94f0, 1);
  g.beginPath();
  g.arc(-3, -48 - bob, 5, Math.PI, 0);
  g.fillPath();
  // 目とほっぺ
  g.fillStyle(0x2b1d12, 1);
  ell(g, 3.5, -40 - bob, 1.9, 2.3);
  ell(g, 8.5, -40 - bob, 1.9, 2.3);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, -41 - bob, 0.7);
  g.fillCircle(9, -41 - bob, 0.7);
  g.fillStyle(0xff7878, 0.5);
  g.fillCircle(9, -36 - bob, 2.5);
  // 斧（振っている間は白い弧を残す）
  g.translateCanvas(9, -24 - bob);
  const rot = p.swing > 0 ? -2.0 + (1 - p.swing) * 2.8 : -0.5;
  if (p.swing > 0.15) {
    g.fillStyle(0xffffff, 0.45 * p.swing);
    g.beginPath();
    g.arc(0, 0, 30, rot - Math.PI / 2 - 0.9, rot - Math.PI / 2, false);
    g.arc(0, 0, 14, rot - Math.PI / 2, rot - Math.PI / 2 - 0.9, true);
    g.closePath();
    g.fillPath();
  }
  g.rotateCanvas(rot);
  oRect(g, -2, -24, 4, 26, 2, 0x7a4e2b, 1.6);
  const head = axeLevel >= 3 ? 0xffd84d : 0xc3ccd6;
  oPoly(
    g,
    [
      { x: 2, y: -25 },
      { x: 14, y: -29 },
      { x: 14, y: -13 },
      { x: 2, y: -17 },
    ],
    head,
  );
  g.fillStyle(0xffffff, 0.6);
  g.fillTriangle(4, -24, 12, -27, 12, -24);
  g.restore();
}
