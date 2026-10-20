import Phaser from 'phaser';
import type { FieldItem } from './FieldView';

/** 1枚の絵が受け持つ戦場の広さ（一辺） */
const TILE = 256;
/** となりの絵と少し重ねて、つなぎ目に線が出ないようにする */
const PAD = 2;
/** 見えている範囲のまわりに、先に描いておく幅 */
const AHEAD = 64;

/**
 * 地面を区画ごとの絵（RenderTexture）に一度だけ描いて並べる。
 * Graphics のままだと、木や草の図形を毎フレーム組み立て直すので重い（iPad で動きがもたつく）。
 * 絵は見えている区画のぶんだけ持ち、離れた区画の絵は使い回す
 */
export class GroundTiles {
  private readonly cols: number;
  private readonly rows: number;
  /** 区画ごとに、そこに掛かる図形の番号（描く順） */
  private readonly buckets: number[][];
  private readonly painter: Phaser.GameObjects.Graphics;
  private readonly shown = new Map<number, Phaser.GameObjects.RenderTexture>();
  private readonly pool: Phaser.GameObjects.RenderTexture[] = [];

  /**
   * @param res 絵の細かさ（戦場の 1 が何ピクセルか）。画面の拡大率に合わせると、にじまない
   * @param onCreate 絵を作ったときに呼ぶ（UI 用のカメラから外すなど）
   */
  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    private readonly items: readonly FieldItem[],
    private readonly res: number,
    private readonly depth: number,
    private readonly onCreate: (rt: Phaser.GameObjects.RenderTexture) => void,
  ) {
    this.cols = Math.ceil(width / TILE);
    this.rows = Math.ceil(height / TILE);
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
    items.forEach((it, i) => {
      const c0 = Math.max(0, Math.floor(it.x0 / TILE));
      const c1 = Math.min(this.cols - 1, Math.floor((it.x1 + PAD) / TILE));
      const r0 = Math.max(0, Math.floor(it.y0 / TILE));
      const r1 = Math.min(this.rows - 1, Math.floor((it.y1 + PAD) / TILE));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.buckets[r * this.cols + c].push(i);
    });
    // 画面には出さない、下書き用の Graphics
    this.painter = scene.make.graphics({}, false);
  }

  /** 見えている範囲（戦場の座標）に合わせて、区画の絵を出し入れする */
  update(view: { x: number; y: number; w: number; h: number }): void {
    const c0 = Math.max(0, Math.floor((view.x - AHEAD) / TILE));
    const c1 = Math.min(this.cols - 1, Math.floor((view.x + view.w + AHEAD) / TILE));
    const r0 = Math.max(0, Math.floor((view.y - AHEAD) / TILE));
    const r1 = Math.min(this.rows - 1, Math.floor((view.y + view.h + AHEAD) / TILE));
    for (const [key, rt] of this.shown) {
      const c = key % this.cols;
      const r = Math.floor(key / this.cols);
      if (c < c0 || c > c1 || r < r0 || r > r1) {
        rt.setVisible(false);
        this.pool.push(rt);
        this.shown.delete(key);
      }
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = r * this.cols + c;
        if (!this.shown.has(key)) this.shown.set(key, this.paint(c, r));
      }
    }
  }

  get tileCount(): number {
    return this.shown.size + this.pool.length;
  }

  destroy(): void {
    this.painter.destroy();
  }

  private paint(c: number, r: number): Phaser.GameObjects.RenderTexture {
    const size = (TILE + PAD) * this.res;
    let rt = this.pool.pop();
    if (!rt) {
      rt = this.scene.add.renderTexture(0, 0, size, size).setOrigin(0, 0).setScale(1 / this.res).setDepth(this.depth);
      this.onCreate(rt);
    }
    const tx = c * TILE;
    const ty = r * TILE;
    const g = this.painter;
    g.clear();
    for (const i of this.buckets[r * this.cols + c]) this.items[i].draw(g);
    g.setScale(this.res);
    rt.clear();
    rt.draw(g, -tx * this.res, -ty * this.res);
    rt.setPosition(tx, ty).setVisible(true);
    return rt;
  }
}
