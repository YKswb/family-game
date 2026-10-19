import type Phaser from 'phaser';
import type { EnemyKind, EnemyStats } from '../data/gameData';
import type { Enemy } from '../entities/Enemy';
import { hex } from '../ui/Display';
import { INK, ell, oCircle, oEll, oPoly, oRect, oTri, rr, shade, tint } from './shapes';

type G = Phaser.GameObjects.Graphics;

/** 空を飛ぶ敵が浮いている高さ（揺れの分を含めない） */
export const FLY_LIFT = 24;
/** 羽ばたきの絵の枚数 */
export const WING_FRAMES = 3;

/** 敵の上の HP */
export function drawEnemyHp(g: G, e: Enemy, lift: number): void {
  if (e.hp >= e.maxHp || e.underground) return;
  const r = e.r;
  const w = e.fly ? 28 : Math.max(28, r * 2);
  const x = e.x;
  const y = e.fly ? e.y - lift - r * 2 - 12 : e.y - r * 2.2 - 14;
  const f = Math.max(0, e.hp / e.maxHp);
  g.fillStyle(INK, 0.8);
  rr(g, x - w / 2 - 1.5, y - 1.5, w + 3, 9, 4.5);
  g.fillStyle(0x3a2a2a, 1);
  rr(g, x - w / 2, y, w, 6, 3);
  g.fillStyle(0xff5a4f, 1);
  rr(g, x - w / 2, y, Math.max(3, w * f), 6, 3);
}

/** 目（白目と黒目とハイライト）。angry なら眉を付ける */
function eyes(g: G, r: number, angry: boolean, white = 0xffffff): void {
  g.fillStyle(INK, 1);
  ell(g, r * 0.15, -r * 1.05, r * 0.21 + 1.2, r * 0.25 + 1.2);
  ell(g, r * 0.62, -r * 1.05, r * 0.18 + 1.2, r * 0.23 + 1.2);
  g.fillStyle(white, 1);
  ell(g, r * 0.15, -r * 1.05, r * 0.21, r * 0.25);
  ell(g, r * 0.62, -r * 1.05, r * 0.18, r * 0.23);
  g.fillStyle(0x24162e, 1);
  g.fillCircle(r * 0.22, -r * 1.0, r * 0.1);
  g.fillCircle(r * 0.67, -r * 1.0, r * 0.09);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(r * 0.19, -r * 1.06, r * 0.035 + 0.6);
  g.fillCircle(r * 0.64, -r * 1.06, r * 0.03 + 0.6);
  if (angry) {
    g.lineStyle(Math.max(2, r * 0.09), 0x24162e, 1);
    g.lineBetween(-r * 0.05, -r * 1.42, r * 0.35, -r * 1.28);
    g.lineBetween(r * 0.45, -r * 1.28, r * 0.8, -r * 1.4);
  }
}

/** 空を飛ぶ敵（こうもり）。原点は体の真下（浮いている分は含めない）。wing は羽ばたき -1〜1 */
function drawFlyerBody(g: G, stats: EnemyStats, wing: number): void {
  const r = stats.r;
  for (const s of [-1, 1]) {
    oPoly(
      g,
      [
        { x: s * r * 0.4, y: -r },
        { x: s * r * 2, y: -r * 1.4 - wing * r * 0.6 },
        { x: s * r * 1.5, y: -r * 0.7 },
        { x: s * r * 1.1, y: -r * 0.75 },
      ],
      0x3d2a63,
    );
  }
  const body = hex(stats.color);
  oCircle(g, 0, -r, r, body);
  g.fillStyle(shade(body, 0.75), 1);
  g.beginPath();
  g.arc(0, -r, r, 0.15, Math.PI - 0.15);
  g.fillPath();
  g.fillStyle(tint(body, 0.35), 1);
  g.fillCircle(-r * 0.35, -r * 1.35, r * 0.28);
  eyes(g, r, false, 0xffe066);
}

/**
 * 敵の体（右向き、つぶれも点滅もない絵）。原点は足元。画像にして使い回し、
 * 向き・弾み・点滅・氷は画像の反転・拡大・色で表す。frame は空の敵の羽ばたきの番号
 */
export function drawEnemyBody(g: G, kind: EnemyKind, stats: EnemyStats, frame = 0, carried = 0): void {
  const r = stats.r;
  if (stats.fly) {
    drawFlyerBody(g, stats, Math.sin((frame / WING_FRAMES) * Math.PI * 2));
    return;
  }
  const body = hex(stats.color);
  if (kind === 'lumberjack') {
    // 背中の斧と、切り倒して持っている丸太
    g.save();
    g.translateCanvas(-r * 0.7, -r * 1.3);
    g.rotateCanvas(-0.6);
    oRect(g, -1.5, -r * 0.9, 3, r * 1.4, 1.5, 0x8a5a33, 1.4);
    oPoly(
      g,
      [
        { x: 1, y: -r * 0.9 },
        { x: r * 0.55, y: -r * 1.1 },
        { x: r * 0.55, y: -r * 0.45 },
        { x: 1, y: -r * 0.6 },
      ],
      0xc3ccd6,
    );
    g.restore();
    for (let i = 0; i < carried; i++) {
      const y = -r * 0.9 - i * r * 0.42;
      oRect(g, -r * 1.55, y, r * 1.1, r * 0.36, r * 0.12, 0xb97a45, 1.4);
      g.fillStyle(0xecc79a, 1);
      ell(g, -r * 1.45, y + r * 0.18, r * 0.1, r * 0.13);
    }
    oTri(g, -r * 0.55, -r * 1.6, -r * 0.35, -r * 2.2, -r * 0.1, -r * 1.75, shade(body, 1.1));
    oTri(g, r * 0.15, -r * 1.75, r * 0.45, -r * 2.2, r * 0.65, -r * 1.6, shade(body, 1.1));
  }
  if (kind === 'healer') {
    // 体の後ろに立てた杖と、緑に光る玉
    g.lineStyle(4.5, INK, 1);
    g.lineBetween(-r * 0.95, -r * 0.1, -r * 0.95, -r * 2.5);
    g.lineStyle(2.5, 0x8a5a33, 1);
    g.lineBetween(-r * 0.95, -r * 0.1, -r * 0.95, -r * 2.5);
    g.fillStyle(0x7dffa0, 0.4);
    g.fillCircle(-r * 0.95, -r * 2.6, r * 0.45);
    oCircle(g, -r * 0.95, -r * 2.6, r * 0.25, 0x5fe08a, 1.4);
  }
  if (kind === 'goblin') {
    oTri(g, -r * 0.55, -r * 1.6, -r * 0.35, -r * 2.3, -r * 0.1, -r * 1.75, 0xf3e6c8);
    oTri(g, r * 0.15, -r * 1.75, r * 0.45, -r * 2.3, r * 0.65, -r * 1.6, 0xf3e6c8);
  }
  if (kind === 'wolf') {
    oTri(g, -r * 0.5, -r * 1.5, -r * 0.3, -r * 2.3, 0, -r * 1.6, body);
    oTri(g, r * 0.2, -r * 1.6, r * 0.5, -r * 2.3, r * 0.75, -r * 1.45, body);
    oPoly(
      g,
      [
        { x: -r * 0.9, y: -r * 0.6 },
        { x: -r * 1.6, y: -r * 1.05 },
        { x: -r * 1.5, y: -r * 0.3 },
        { x: -r * 0.9, y: -r * 0.4 },
      ],
      body,
    );
  }
  if (kind === 'maou') {
    oTri(g, -r * 0.7, -r * 1.5, -r * 1.0, -r * 2.5, -r * 0.3, -r * 1.75, 0x2a1a3a);
    oTri(g, r * 0.3, -r * 1.75, r * 1.0, -r * 2.5, r * 0.7, -r * 1.5, 0x2a1a3a);
  }
  // 体：輪郭 → 本体 → 下の影 → 左上のつや
  oEll(g, 0, -r, r, r, body);
  g.fillStyle(shade(body, 0.78), 1);
  g.beginPath();
  g.arc(0, -r, r, 0.2, Math.PI - 0.2);
  g.fillPath();
  g.fillStyle(tint(body, 0.4), 1);
  ell(g, -r * 0.4, -r * 1.4, r * 0.26, r * 0.15);
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(-r * 0.5, -r * 1.45, r * 0.07 + 0.5);
  if (kind === 'splitter') {
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(-r * 0.3, -r * 0.6, r * 0.25);
    g.fillCircle(r * 0.1, -r * 0.45, r * 0.18);
  }
  if (stats.boss) {
    oPoly(
      g,
      [
        { x: -r * 0.5, y: -r * 1.75 },
        { x: -r * 0.55, y: -r * 2.35 },
        { x: -r * 0.25, y: -r * 2.05 },
        { x: 0, y: -r * 2.45 },
        { x: r * 0.25, y: -r * 2.05 },
        { x: r * 0.55, y: -r * 2.35 },
        { x: r * 0.5, y: -r * 1.75 },
      ],
      0xffc928,
    );
    g.fillStyle(0xff5a7a, 1);
    g.fillCircle(0, -r * 1.95, r * 0.08 + 1);
  }
  if (kind === 'knight') {
    const helm = 0x5a6578;
    g.fillStyle(INK, 1);
    g.beginPath();
    g.arc(0, -r * 1.05, r * 0.98 + 2, Math.PI, 0);
    g.fillPath();
    g.fillStyle(helm, 1);
    g.beginPath();
    g.arc(0, -r * 1.05, r * 0.98, Math.PI, 0);
    g.fillPath();
    g.fillStyle(tint(helm, 0.3), 1);
    g.beginPath();
    g.arc(-r * 0.25, -r * 1.3, r * 0.4, Math.PI, 0);
    g.fillPath();
    oEll(g, -r * 0.1, -r * 2.1, r * 0.18, r * 0.35, 0xe04a3a, 1.6);
    oRect(g, -r * 0.1, -r * 1.2, r * 0.95, r * 0.28, r * 0.1, 0x1d2330, 1.4);
    g.fillStyle(0xffe066, 1);
    rr(g, r * 0.15, -r * 1.12, r * 0.55, r * 0.1, r * 0.05);
    return;
  }
  if (kind === 'healer') {
    // とがったフード
    oTri(g, -r * 0.9, -r * 1.35, r * 0.1, -r * 2.55, r * 0.95, -r * 1.35, shade(body, 0.8));
    g.fillStyle(tint(body, 0.25), 1);
    g.fillTriangle(-r * 0.55, -r * 1.45, r * 0.05, -r * 2.3, -r * 0.1, -r * 1.45);
  }
  const smiley = kind === 'slime' || kind === 'mini' || kind === 'splitter';
  eyes(g, r, !smiley && kind !== 'healer' && kind !== 'mole', kind === 'maou' ? 0xff3a3a : 0xffffff);
  if (smiley) {
    g.lineStyle(Math.max(1.5, r * 0.07), 0x24162e, 1);
    g.beginPath();
    g.arc(r * 0.4, -r * 0.78, r * 0.14, 0.2, Math.PI - 0.2);
    g.strokePath();
  }
  if (kind === 'lumberjack') {
    // 赤い毛糸の帽子
    g.fillStyle(INK, 1);
    g.beginPath();
    g.arc(0, -r * 1.55, r * 0.72 + 2, Math.PI, 0);
    g.fillPath();
    g.fillStyle(0xd9483a, 1);
    g.beginPath();
    g.arc(0, -r * 1.55, r * 0.72, Math.PI, 0);
    g.fillPath();
    oRect(g, -r * 0.78, -r * 1.62, r * 1.56, r * 0.22, r * 0.1, 0xf07a5c, 1.4);
    oCircle(g, 0, -r * 2.3, r * 0.17, 0xffffff, 1.4);
  }
  if (kind === 'mole') {
    // ピンクの鼻と、前足のつめ
    oCircle(g, r * 0.95, -r * 0.9, r * 0.2, 0xff8fa8, 1.4);
    for (const dy of [-0.15, 0.05]) {
      g.fillStyle(INK, 1);
      g.fillTriangle(r * 0.75, -r * (0.35 + dy), r * 1.15, -r * (0.25 + dy), r * 0.8, -r * (0.15 + dy));
      g.fillStyle(0xf3e6c8, 1);
      g.fillTriangle(r * 0.8, -r * (0.33 + dy), r * 1.08, -r * (0.25 + dy), r * 0.82, -r * (0.19 + dy));
    }
  }
  if (kind === 'shield') {
    // 前にかまえた木のたて
    oRect(g, r * 0.55, -r * 1.75, r * 0.62, r * 1.55, r * 0.22, 0xa86c39);
    g.fillStyle(0x8a5530, 1);
    rr(g, r * 0.62, -r * 1.65, r * 0.18, r * 1.35, r * 0.08);
    g.lineStyle(2, 0x9aa3ad, 1);
    g.strokeRoundedRect(r * 0.6, -r * 1.7, r * 0.52, r * 1.45, r * 0.18);
    oCircle(g, r * 0.86, -r * 0.98, r * 0.15, 0xd8dee4, 1.4);
  }
}

/** もぐっているもぐらの土の山。原点は真ん中の下 */
export function drawMound(g: G, r: number): void {
  oEll(g, 0, -r * 0.35, r * 1.15, r * 0.5, 0x8a6248);
  g.fillStyle(0xa47a5c, 1);
  ell(g, -r * 0.25, -r * 0.55, r * 0.55, r * 0.22);
  g.fillStyle(0x6b4a34, 1);
  g.fillCircle(r * 0.5, -r * 0.25, r * 0.12);
  g.fillCircle(-r * 0.6, -r * 0.2, r * 0.1);
  g.fillCircle(r * 0.1, -r * 0.7, r * 0.08);
}

/** 画像の大きさと足元の位置（その敵の半径から決める） */
export function enemyFrame(stats: EnemyStats): { w: number; h: number; ox: number; oy: number } {
  const r = stats.r;
  const w = Math.ceil(r * 4.4 + 12);
  // いやしの杖の玉がいちばん高い（2.85r）
  const h = Math.ceil(r * 3.0 + 12);
  return { w, h, ox: w / 2, oy: h - 4 };
}

/** 弾み（縦の伸び縮み）。攻撃を受けた直後は少しつぶれる */
export function enemySquash(e: Enemy): number {
  const hit = e.hitF > 0 ? 0.12 * (e.hitF / 0.12) : 0;
  return 1 + Math.sin(e.bob) * (e.kind === 'wolf' ? 0.12 : 0.07) - hit;
}

/** 空の敵の、いまの浮いている高さ */
export function enemyLift(e: Enemy): number {
  return e.fly ? FLY_LIFT + Math.sin(e.bob * 0.5) * 3 : 0;
}

/** 羽ばたきの絵の番号 */
export function wingFrame(e: Enemy): number {
  const t = (((e.bob / (Math.PI * 2)) % 1) + 1) % 1;
  return Math.floor(t * WING_FRAMES) % WING_FRAMES;
}
