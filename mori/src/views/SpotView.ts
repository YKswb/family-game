import type Phaser from 'phaser';
import type { Spot } from '../systems/Build';
import { dashedCircle } from './shapes';

export const SPOT_R = 34;

/** 建設地点の円。払った木材の分だけ黄色い輪が伸びる。アイコンと値札は文字で別に出す */
export function drawSpot(g: Phaser.GameObjects.Graphics, s: Spot, time: number): void {
  const pulse = s.near && !s.maxed ? 1 + Math.sin(time * 10) * 0.06 : 1;
  const pop = s.pop > 0 ? 1 + Math.sin((s.pop / 0.5) * Math.PI) * 0.18 : 1;
  const r = SPOT_R * pulse * pop;
  g.fillStyle(0xffffff, s.maxed ? 0.15 : 0.35);
  g.fillCircle(s.x, s.y, r);
  g.lineStyle(3, 0xffffff, 0.9);
  dashedCircle(g, s.x, s.y, r, 8, 6);
  if (!s.maxed && s.paid > 0) {
    g.lineStyle(7, 0xffcc1f, 1);
    g.beginPath();
    g.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s.paid) / s.cost);
    g.strokePath();
  }
}
