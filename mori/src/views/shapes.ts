import type Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;

/** 輪郭の色（こげ茶。真っ黒より柔らかく見える） */
export const INK = 0x2b2116;
/** 輪郭の太さ */
export const LINE = 2.2;

/** 半径で指定する楕円（Phaser の fillEllipse は幅と高さで指定する） */
export function ell(g: G, x: number, y: number, rx: number, ry: number): void {
  g.fillEllipse(x, y, rx * 2, ry * 2);
}

export function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.fillRoundedRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** 色を暗く（k<1）または明るく（k>1）する */
export function shade(color: number, k: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((color >> s) & 0xff) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 色を白に寄せる（t: 0〜1） */
export function tint(color: number, t: number): number {
  const ch = (s: number) => Math.round(((color >> s) & 0xff) * (1 - t) + 255 * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ---- 輪郭つきの形：先に輪郭の色で少し大きく塗り、その上に本体を塗る ----

export function oCircle(g: G, x: number, y: number, r: number, color: number, line = LINE, alpha = 1): void {
  g.fillStyle(INK, alpha);
  g.fillCircle(x, y, r + line);
  g.fillStyle(color, alpha);
  g.fillCircle(x, y, r);
}

export function oEll(g: G, x: number, y: number, rx: number, ry: number, color: number, line = LINE, alpha = 1): void {
  g.fillStyle(INK, alpha);
  ell(g, x, y, rx + line, ry + line);
  g.fillStyle(color, alpha);
  ell(g, x, y, rx, ry);
}

export function oRect(g: G, x: number, y: number, w: number, h: number, r: number, color: number, line = LINE, alpha = 1): void {
  g.fillStyle(INK, alpha);
  rr(g, x - line, y - line, w + line * 2, h + line * 2, r + line);
  g.fillStyle(color, alpha);
  rr(g, x, y, w, h, r);
}

export function oTri(g: G, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillTriangle(ax, ay, bx, by, cx, cy);
  g.lineStyle(LINE, INK, alpha);
  g.strokeTriangle(ax, ay, bx, by, cx, cy);
}

export function oPoly(g: G, pts: { x: number; y: number }[], color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
  g.lineStyle(LINE, INK, alpha);
  g.strokePoints(pts, true);
}

/** 地面に落ちるやわらかい影（濃さの違う楕円を重ねる） */
export function softShadow(g: G, x: number, y: number, rx: number, ry: number, alpha = 0.22): void {
  g.fillStyle(0x000000, alpha * 0.45);
  ell(g, x, y, rx * 1.15, ry * 1.2);
  g.fillStyle(0x000000, alpha * 0.7);
  ell(g, x, y, rx, ry);
}

/** 円周を点線で描く */
export function dashedCircle(g: G, x: number, y: number, r: number, dash: number, gap: number): void {
  const step = (dash + gap) / r;
  const len = dash / r;
  for (let a = 0; a < Math.PI * 2; a += step) {
    g.beginPath();
    g.arc(x, y, r, a, Math.min(a + len, Math.PI * 2));
    g.strokePath();
  }
}

/** 丸太1本（木材のしるし）。中心 (x, y)、長さ w、傾き rot */
export function drawLog(g: G, x: number, y: number, w: number, rot = 0): void {
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(rot);
  const h = w * 0.4;
  g.fillStyle(INK, 1);
  rr(g, -w / 2 - 1.2, -h / 2 - 1.2, w + 2.4, h + 2.4, w * 0.14);
  g.fillStyle(0xb97a45, 1);
  rr(g, -w / 2, -h / 2, w, h, w * 0.12);
  g.fillStyle(0xd69a5f, 1);
  rr(g, -w / 2 + w * 0.12, -h / 2 + h * 0.15, w * 0.8, h * 0.25, h * 0.1);
  g.fillStyle(0xecc79a, 1);
  ell(g, -w / 2 + w * 0.08, 0, w * 0.13, w * 0.18);
  g.fillStyle(0xc48a55, 1);
  ell(g, -w / 2 + w * 0.08, 0, w * 0.05, w * 0.07);
  g.restore();
}

/** 戻りすぎてから落ち着く伸び方（0→1） */
export function easeBack(x: number): number {
  return 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
}
