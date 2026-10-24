import Phaser from 'phaser';
import { drawUnit } from '../entities/UnitView';
import type { Unit } from '../entities/Unit';

/** 1人分の絵の大きさ（戦場の座標）と、足もとの位置 */
const W = 96;
const H = 96;
const OX = W / 2;
const OY = 76;
/** 剣や槍をふっている見た目に切りかえる、ふりの強さ */
const SWING_POSE = 0.4;

/**
 * 兵士を、兵種と色ごとに一度だけ描いた絵（テクスチャ）を並べて表示する。
 * Graphics のままだと、毎フレーム円や角丸の図形を組み立て直すので、兵士が多いと重い（1人0.2ms ほど）。
 * 動きは、位置・左右の向き・歩くときの上下・攻撃の「ふり」の2つの絵・やられたときの白い光で表す
 */
export class UnitSprites {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private readonly painter: Phaser.GameObjects.Graphics;

  /**
   * @param res 絵の細かさ（戦場の 1 が何ピクセルか）。画面の拡大率に合わせると、にじまない
   * @param depth 兵士の重なり順の基準（下にいる兵士ほど手前になるよう、y を少し足す）
   * @param onCreate 絵を作ったときに呼ぶ（UI 用のカメラから外すなど）
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly res: number,
    private readonly depth: number,
    private readonly onCreate: (img: Phaser.GameObjects.Image) => void,
  ) {
    this.painter = scene.make.graphics({}, false);
  }

  begin(): void {
    this.used = 0;
  }

  draw(u: Unit): void {
    const key = this.textureFor(u);
    let img = this.pool[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, key).setOrigin(OX / W, OY / H).setScale(1 / this.res);
      this.onCreate(img);
      this.pool.push(img);
    }
    this.used++;
    const bob = u.moving ? Math.abs(Math.sin(u.bob)) * 2 : 0;
    if (img.texture.key !== key) img.setTexture(key);
    img.setPosition(u.x, u.y - bob).setFlipX(u.face < 0).setDepth(this.depth + u.y * 0.0001).setVisible(true);
    if (u.hitFlash > 0) img.setTintFill(0xffffff);
    else if (img.isTinted) img.clearTint();
  }

  /** 使わなかった絵をかくす */
  end(): void {
    for (let i = this.used; i < this.pool.length; i++) if (this.pool[i].visible) this.pool[i].setVisible(false);
  }

  destroy(): void {
    this.painter.destroy();
  }

  /** この兵士の見た目の絵の名前。まだなければ描いて作る */
  private textureFor(u: Unit): string {
    const pose = u.swing > SWING_POSE ? 's' : 'i';
    let key: string;
    if (u.kind === 'hero' || u.kind === 'general' || u.kind === 'jeanne') key = `${u.kind}-${pose}`;
    else if (u.kind === 'captain') key = `captain-${u.side}-${u.squad?.kind === 'cavalry' ? 'm' : 'f'}-${pose}`;
    else key = `${u.kind}-${teamOf(u)}-${pose}`;
    key = `unit-${key}`;
    if (!this.scene.textures.exists(key)) this.paint(key, u, pose === 's');
    return key;
  }

  private paint(key: string, u: Unit, swinging: boolean): void {
    // 見た目だけを写した、動いていない兵士を描く（向きは右、HP は満タン）
    const model = {
      kind: u.kind,
      side: u.side,
      squad: u.squad ? { mode: u.squad.mode, waiting: u.squad.waiting, kind: u.squad.kind } : null,
      radius: u.radius,
      x: OX,
      y: OY,
      face: 1,
      swing: swinging ? 0.7 : 0,
      moving: false,
      bob: 0,
      hitFlash: 0,
      hp: 1,
      maxHp: 1,
    } as unknown as Unit;
    const g = this.painter;
    g.clear();
    drawUnit(g, model);
    g.setScale(this.res);
    const tex = this.scene.textures.addDynamicTexture(key, Math.ceil(W * this.res), Math.ceil(H * this.res));
    tex?.draw(g, 0, 0);
  }
}

/** 兵士の色の種類：旗の部隊・待機の仲間・味方・敵 */
function teamOf(u: Unit): string {
  if (u.squad?.mode === 'neutral') return 'neutral';
  if (u.squad?.waiting) return 'resting';
  return u.side;
}
