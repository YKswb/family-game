import type Phaser from 'phaser';
import type { Companion } from '../entities/Companion';
import { FRIEND_LIFT } from '../systems/Companions';
import { hex } from '../ui/Display';
import { ell, oCircle, oEll, oRect, shade, softShadow, tint } from './shapes';

type G = Phaser.GameObjects.Graphics;

/** 仲間のしるし：あらたの帽子と同じ青のスカーフ（敵と見分けがつくように） */
const TEAM = 0x2f6fd6;

function scarf(g: G, y: number, w: number): void {
  oRect(g, -w / 2, y, w, 5, 2.5, TEAM, 1.6);
  g.fillStyle(TEAM, 1);
  g.fillTriangle(-w / 2 + 2, y + 3, -w / 2 - 5, y + 10, -w / 2 + 5, y + 8);
}

function eyes(g: G, x1: number, x2: number, y: number, r: number): void {
  g.fillStyle(0x2b1d12, 1);
  ell(g, x1, y, r, r * 1.2);
  ell(g, x2, y, r, r * 1.2);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(x1 + r * 0.3, y - r * 0.4, r * 0.4);
  g.fillCircle(x2 + r * 0.3, y - r * 0.4, r * 0.4);
}

/** うさぎ（もも）：長い耳、はねながら進む */
function rabbit(g: G, c: Companion, body: number): void {
  const hop = c.moving ? Math.abs(Math.sin(c.step * 0.9)) * 6 : 0;
  const lean = c.swing > 0 ? c.swing * 0.25 : 0;
  g.translateCanvas(0, -hop);
  g.rotateCanvas(lean);
  for (const [x, rot] of [
    [-4, -0.18],
    [5, 0.12],
  ] as const) {
    g.save();
    g.translateCanvas(x, -26);
    g.rotateCanvas(rot);
    oEll(g, 0, -10, 4.5, 11, body, 1.8);
    g.fillStyle(0xffb3c6, 1);
    ell(g, 0, -9, 2, 7);
    g.restore();
  }
  oEll(g, 0, -12, 12, 12, body);
  g.fillStyle(shade(body, 0.9), 1);
  g.beginPath();
  g.arc(0, -12, 12, 0.3, Math.PI - 0.3);
  g.fillPath();
  g.fillStyle(0xffe6ee, 1);
  ell(g, 3, -7, 6, 5);
  scarf(g, -14, 18);
  eyes(g, 3, 9, -17, 1.8);
  g.fillStyle(0xff8fa8, 1);
  g.fillCircle(11, -13, 1.8);
  g.fillStyle(0xff9fb5, 0.5);
  g.fillCircle(10, -10, 2.5);
}

/** くま（ごろう）：大きくて丸い。攻撃すると前足を振る */
function bear(g: G, c: Companion, body: number): void {
  const bob = c.moving ? Math.abs(Math.sin(c.step * 0.6)) * 2 : 0;
  g.translateCanvas(0, -bob);
  oCircle(g, -10, -30, 5.5, body, 1.8);
  oCircle(g, 9, -31, 5.5, body, 1.8);
  g.fillStyle(0xe8b88a, 1);
  g.fillCircle(-10, -30, 2.5);
  g.fillCircle(9, -31, 2.5);
  oEll(g, 0, -15, 15, 15, body);
  g.fillStyle(shade(body, 0.8), 1);
  g.beginPath();
  g.arc(0, -15, 15, 0.3, Math.PI - 0.3);
  g.fillPath();
  g.fillStyle(tint(body, 0.25), 1);
  ell(g, -5, -22, 6, 4);
  oEll(g, 8, -14, 7, 5.5, 0xe8c49a, 1.6);
  g.fillStyle(0x2b1d12, 1);
  ell(g, 13, -16, 2.6, 2);
  scarf(g, -7, 24);
  eyes(g, 1, 9, -22, 1.8);
  // 前足（振り下ろすと前へ）
  const arm = c.swing > 0 ? -1.4 + (1 - c.swing) * 2.0 : 0.4;
  g.save();
  g.translateCanvas(10, -12);
  g.rotateCanvas(arm);
  oEll(g, 6, 0, 7, 5, body, 1.8);
  g.restore();
  if (c.swing > 0.2) {
    g.fillStyle(0xffffff, 0.4 * c.swing);
    g.beginPath();
    g.arc(10, -12, 26, -1.6, 0.4, false);
    g.arc(10, -12, 14, 0.4, -1.6, true);
    g.closePath();
    g.fillPath();
  }
}

/** ふくろう（ほうすけ）：空に浮かび、はばたく */
function owl(g: G, c: Companion, body: number): void {
  const flap = Math.sin(c.step * 1.4 + c.swing * 3);
  for (const s of [-1, 1]) {
    g.save();
    g.translateCanvas(s * 11, -14);
    g.rotateCanvas(s * (0.4 + flap * 0.35));
    oEll(g, s * 6, 0, 9, 5, shade(body, 0.85), 1.8);
    g.restore();
  }
  oEll(g, 0, -13, 12, 14, body);
  g.fillStyle(tint(body, 0.45), 1);
  ell(g, 1, -7, 7, 7);
  g.fillStyle(shade(body, 0.85), 1);
  g.fillTriangle(-9, -25, -6, -33, -3, -25);
  g.fillTriangle(3, -25, 7, -33, 9, -25);
  // 顔の円と、大きな目
  g.fillStyle(tint(body, 0.6), 1);
  g.fillCircle(-3, -18, 6);
  g.fillCircle(6, -18, 6);
  oCircle(g, -3, -18, 4, 0xffd84d, 1.2);
  oCircle(g, 6, -18, 4, 0xffd84d, 1.2);
  g.fillStyle(0x2b1d12, 1);
  g.fillCircle(-2, -18, 2.2);
  g.fillCircle(7, -18, 2.2);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(-1.3, -19, 0.8);
  g.fillCircle(7.7, -19, 0.8);
  g.fillStyle(0xf0a03a, 1);
  g.fillTriangle(0, -15, 3, -15, 1.5, -11);
  scarf(g, -6, 16);
}

/** 仲間を描く。空を飛ぶ仲間は地面に影を落とす */
export function drawFriend(g: G, c: Companion): void {
  const body = hex(c.stats.color);
  const lift = c.fly ? FRIEND_LIFT + Math.sin(c.step * 0.35) * 3 : 0;
  const appear = c.appear > 0 ? 1 - c.appear / 0.4 : 1;
  softShadow(g, c.x, c.y + 2, c.kind === 'goro' ? 17 : 13, 5, c.fly ? 0.15 : 0.22);
  g.save();
  g.translateCanvas(c.x, c.y - lift);
  g.scaleCanvas(c.face * appear, appear);
  if (c.kind === 'momo') rabbit(g, c, body);
  else if (c.kind === 'goro') bear(g, c, body);
  else owl(g, c, body);
  g.restore();
}
