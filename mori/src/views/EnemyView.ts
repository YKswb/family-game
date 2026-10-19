import type Phaser from 'phaser';
import type { Enemy } from '../entities/Enemy';
import { hex } from '../ui/Display';
import { ell, rr } from './shapes';

type G = Phaser.GameObjects.Graphics;

function hpBar(g: G, x: number, y: number, w: number, f: number): void {
  g.fillStyle(0x000000, 0.45);
  rr(g, x - w / 2, y, w, 6, 3);
  g.fillStyle(0xff5a4f, 1);
  rr(g, x - w / 2, y, Math.max(3, w * Math.max(0, f)), 6, 3);
}

/** 空を飛ぶ敵（こうもり）。体が浮いていて、地面に影を落とす */
function drawFlyer(g: G, e: Enemy): void {
  const r = e.r;
  const lift = 24 + Math.sin(e.bob * 0.5) * 3;
  const fl = Math.sin(e.bob);
  g.fillStyle(0x000000, 0.15);
  ell(g, e.x, e.y + 2, r * 0.9, r * 0.3);
  g.save();
  g.translateCanvas(e.x, e.y - lift);
  g.scaleCanvas(e.face, 1);
  g.fillStyle(e.hitF > 0 ? 0xffffff : 0x3d2a63, 1);
  for (const s of [-1, 1]) {
    g.fillPoints(
      [
        { x: s * r * 0.4, y: -r },
        { x: s * r * 2, y: -r * 1.4 - fl * r * 0.6 },
        { x: s * r * 1.5, y: -r * 0.7 },
        { x: s * r * 1.1, y: -r * 0.75 },
      ],
      true,
    );
  }
  g.fillStyle(e.hitF > 0 ? 0xffffff : hex(e.stats.color), 1);
  g.fillCircle(0, -r, r);
  g.fillStyle(0xffe066, 1);
  g.fillCircle(r * 0.15, -r * 1.1, r * 0.2);
  g.fillCircle(r * 0.6, -r * 1.1, r * 0.18);
  g.fillStyle(0x24162e, 1);
  g.fillCircle(r * 0.2, -r * 1.08, r * 0.08);
  g.fillCircle(r * 0.64, -r * 1.08, r * 0.07);
  if (e.slow > 0) {
    g.fillStyle(0x8cdcff, 0.4);
    g.fillCircle(0, -r, r * 1.15);
  }
  g.restore();
  if (e.hp < e.maxHp) hpBar(g, e.x, e.y - lift - r * 2 - 12, 28, e.hp / e.maxHp);
}

/** 敵1体（今の版と同じ形） */
export function drawEnemy(g: G, e: Enemy): void {
  if (e.fly) {
    drawFlyer(g, e);
    return;
  }
  const r = e.r;
  const k = e.kind;
  const sq = 1 + Math.sin(e.bob) * (k === 'wolf' ? 0.12 : 0.07);
  const body = e.hitF > 0 ? 0xffffff : hex(e.stats.color);
  g.save();
  g.translateCanvas(e.x, e.y);
  g.fillStyle(0x000000, 0.2);
  ell(g, 0, 2, r * 1.05, r * 0.35);
  g.scaleCanvas(e.face, 1);
  if (k === 'goblin') {
    g.fillStyle(0xf3e6c8, 1);
    g.fillTriangle(-r * 0.55, -r * 1.6, -r * 0.35, -r * 2.3, -r * 0.1, -r * 1.75);
    g.fillTriangle(r * 0.15, -r * 1.75, r * 0.45, -r * 2.3, r * 0.65, -r * 1.6);
  }
  if (k === 'wolf') {
    g.fillStyle(body, 1);
    g.fillTriangle(-r * 0.5, -r * 1.5, -r * 0.3, -r * 2.3, 0, -r * 1.6);
    g.fillTriangle(r * 0.2, -r * 1.6, r * 0.5, -r * 2.3, r * 0.75, -r * 1.45);
    // しっぽ
    g.fillPoints(
      [
        { x: -r * 0.9, y: -r * 0.6 },
        { x: -r * 1.6, y: -r * 1.05 },
        { x: -r * 1.5, y: -r * 0.3 },
        { x: -r * 0.9, y: -r * 0.4 },
      ],
      true,
    );
  }
  if (k === 'maou') {
    g.fillStyle(0x2a1a3a, 1);
    g.fillTriangle(-r * 0.7, -r * 1.5, -r * 1.0, -r * 2.5, -r * 0.3, -r * 1.75);
    g.fillTriangle(r * 0.3, -r * 1.75, r * 1.0, -r * 2.5, r * 0.7, -r * 1.5);
  }
  g.fillStyle(body, 1);
  g.fillEllipse(0, -r * sq, r * (2 - sq) * 2, r * sq * 2);
  g.fillStyle(0xffffff, 0.35);
  ell(g, -r * 0.4, -r * 1.4 * sq, r * 0.26, r * 0.15);
  if (k === 'splitter') {
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(-r * 0.3, -r * 0.6, r * 0.25);
    g.fillCircle(r * 0.1, -r * 0.45, r * 0.18);
  }
  if (e.stats.boss) {
    g.fillStyle(0xffc928, 1);
    g.fillPoints(
      [
        { x: -r * 0.5, y: -r * 1.75 },
        { x: -r * 0.55, y: -r * 2.35 },
        { x: -r * 0.25, y: -r * 2.05 },
        { x: 0, y: -r * 2.45 },
        { x: r * 0.25, y: -r * 2.05 },
        { x: r * 0.55, y: -r * 2.35 },
        { x: r * 0.5, y: -r * 1.75 },
      ],
      true,
    );
  }
  if (k === 'knight') {
    g.fillStyle(e.hitF > 0 ? 0xffffff : 0x5a6578, 1);
    g.beginPath();
    g.arc(0, -r * 1.05, r * 0.98, Math.PI, 0);
    g.fillPath();
    g.fillStyle(0xe04a3a, 1);
    ell(g, -r * 0.1, -r * 2.1, r * 0.18, r * 0.35);
    g.fillStyle(0x1d2330, 1);
    rr(g, -r * 0.1, -r * 1.2, r * 0.95, r * 0.28, r * 0.1);
    g.fillStyle(0xffe066, 1);
    rr(g, r * 0.15, -r * 1.12, r * 0.55, r * 0.1, r * 0.05);
  } else {
    g.fillStyle(k === 'maou' ? 0xff3a3a : 0xffffff, 1);
    ell(g, r * 0.15, -r * 1.05, r * 0.21, r * 0.25);
    ell(g, r * 0.62, -r * 1.05, r * 0.18, r * 0.23);
    g.fillStyle(0x24162e, 1);
    g.fillCircle(r * 0.22, -r * 1.0, r * 0.1);
    g.fillCircle(r * 0.67, -r * 1.0, r * 0.09);
    if (k !== 'slime' && k !== 'mini' && k !== 'splitter') {
      // 怒った眉
      g.lineStyle(Math.max(2, r * 0.09), 0x24162e, 1);
      g.lineBetween(-r * 0.05, -r * 1.42, r * 0.35, -r * 1.28);
      g.lineBetween(r * 0.45, -r * 1.28, r * 0.8, -r * 1.4);
    }
  }
  if (e.slow > 0) {
    g.fillStyle(0x8cdcff, 0.38);
    g.fillEllipse(0, -r * sq, r * 2.24, r * 2.16);
  }
  g.restore();
  if (e.hp < e.maxHp) hpBar(g, e.x, e.y - r * 2.2 - 14, Math.max(28, r * 2), e.hp / e.maxHp);
}
