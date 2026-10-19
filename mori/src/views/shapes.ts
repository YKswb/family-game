import type Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;

/** 半径で指定する楕円（Phaser の fillEllipse は幅と高さで指定する） */
export function ell(g: G, x: number, y: number, rx: number, ry: number): void {
  g.fillEllipse(x, y, rx * 2, ry * 2);
}

export function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.fillRoundedRect(x, y, w, h, Math.min(r, w / 2, h / 2));
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
  g.fillStyle(0xb97a45, 1);
  rr(g, -w / 2, -w * 0.2, w, w * 0.4, w * 0.12);
  g.fillStyle(0xecc79a, 1);
  ell(g, -w / 2 + w * 0.08, 0, w * 0.13, w * 0.18);
  g.restore();
}

/** 戻りすぎてから落ち着く伸び方（0→1） */
export function easeBack(x: number): number {
  return 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
}
