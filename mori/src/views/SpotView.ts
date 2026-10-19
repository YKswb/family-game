import type Phaser from 'phaser';
import type { Spot } from '../systems/Build';

export const SPOT_R = 34;

/** 建設地点の円の大きさの倍率（乗っている間はふくらみ、建った直後は弾む） */
export function spotPulse(s: Spot, time: number): number {
  const pulse = s.near && s.payable ? 1 + Math.sin(time * 10) * 0.06 : 1;
  const pop = s.pop > 0 && s.type !== 'tower' ? 1 + Math.sin((s.pop / 0.5) * Math.PI) * 0.18 : 1;
  return pulse * pop;
}

/** 払った木材の分だけ伸びる黄色い輪（円そのものは画像で置く） */
export function drawSpotProgress(g: Phaser.GameObjects.Graphics, s: Spot, time: number): void {
  if (s.maxed || s.paid === 0) return;
  const r = SPOT_R * spotPulse(s, time);
  g.lineStyle(7, 0xffcc1f, 1);
  g.beginPath();
  g.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s.paid) / s.cost);
  g.strokePath();
}
