import type Phaser from 'phaser';
import type { House } from '../entities/House';
import { ell, rr } from './shapes';

/** 守るおうち */
export function drawHouse(g: Phaser.GameObjects.Graphics, h: House): void {
  g.save();
  g.translateCanvas(h.x, h.y);
  g.fillStyle(0x000000, 0.2);
  ell(g, 0, 4, 64, 16);
  g.fillStyle(0xf7e2b3, 1);
  rr(g, -46, -54, 92, 56, 6);
  g.fillStyle(0x8a5a33, 1);
  rr(g, -12, -32, 24, 34, 11);
  g.fillStyle(0x7fc8f8, 1);
  rr(g, 20, -44, 16, 14, 3);
  rr(g, -36, -44, 16, 14, 3);
  g.fillStyle(0xd9573b, 1);
  g.fillTriangle(-60, -50, 0, -98, 60, -50);
  g.lineStyle(3, 0x5a3a22, 1);
  g.lineBetween(0, -98, 0, -130);
  g.fillStyle(0xffd84d, 1);
  g.fillTriangle(0, -130, 26, -122, 0, -114);
  g.restore();
}
