import type Phaser from 'phaser';
import type { BuildingType, EnemyData, EnemyKind, StageTheme, TowerData, TowerKind } from '../data/gameData';
import type { Spot } from '../systems/Build';
import { House } from '../entities/House';
import { hex } from '../ui/Display';
import { drawEnemyBody, drawMound, enemyFrame } from './EnemyView';
import { drawHouse } from './HouseView';
import { drawIcon } from './IconView';
import { SPOT_R } from './SpotView';
import { drawTower } from './TowerView';
import { drawCanopy, drawStump, drawTrunk } from './TreeView';
import { drawPost } from './WallView';
import { dashedCircle, drawLog, ell, shade, softShadow, tint } from './shapes';

/**
 * 形の変わらない絵（木、切り株、かべの杭、とう、おうち、建設地点の円とアイコン、草地）は、
 * 最初に1回だけ画像にして使い回す。Phaser の図形は毎フレーム三角形に分け直すので、
 * 数百本の木を毎回描くと iPad では重くなるため
 */

/** 画像にするときの拡大率。iPad の Retina で戦場を拡大しても、ぼやけないように */
export const TEX_SCALE = 3;

/** 画像の大きさと、足元（原点）の位置（戦場の座標の単位） */
interface Frame {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const TREE: Frame = { w: 96, h: 100, ox: 48, oy: 92 };
const STUMP: Frame = { w: 34, h: 24, ox: 17, oy: 16 };
const POST: Frame = { w: 30, h: 54, ox: 15, oy: 46 };
const TOWER: Frame = { w: 70, h: 162, ox: 35, oy: 148 };
const HOUSE: Frame = { w: 150, h: 170, ox: 75, oy: 146 };
const SPOT: Frame = { w: (SPOT_R + 4) * 2, h: (SPOT_R + 4) * 2, ox: SPOT_R + 4, oy: SPOT_R + 4 };
const ICON: Frame = { w: 40, h: 44, ox: 20, oy: 24 };
const MARKER: Frame = { w: 26, h: 26, ox: 13, oy: 17 };
const LOG: Frame = { w: 24, h: 14, ox: 12, oy: 7 };
const PATCH: Frame = { w: 104, h: 64, ox: 52, oy: 32 };
const CLEARING: Frame = { w: 540, h: 516, ox: 270, oy: 258 };
const FLAKE: Frame = { w: 20, h: 20, ox: 10, oy: 10 };
const SHADOW: Frame = { w: 44, h: 18, ox: 22, oy: 9 };

export type Baked = Phaser.GameObjects.Image;

function bake(scene: Phaser.Scene, key: string, f: Frame, draw: (g: Phaser.GameObjects.Graphics) => void, scale = TEX_SCALE): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.translateCanvas(f.ox * scale, f.oy * scale);
  g.scaleCanvas(scale, scale);
  draw(g);
  g.generateTexture(key, Math.ceil(f.w * scale), Math.ceil(f.h * scale));
  g.destroy();
  return key;
}

/** 草地の模様の1枚の大きさ（戦場の単位）と拡大率。並べて敷くので、画素数を2のべき乗（1024）にする */
export const GRASS_TILE = 256;
export const GRASS_SCALE = 4;

/** 画像を戦場に置く（足元を原点にして、拡大率を戻す） */
function place(scene: Phaser.Scene, key: string, f: Frame, x: number, y: number): Baked {
  return scene.add.image(x, y, key).setOrigin(f.ox / f.w, f.oy / f.h).setScale(1 / TEX_SCALE);
}

/** ステージの見た目ごとに画像を作り、置き方を返す */
export class Textures {
  private readonly leafKey: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly theme: StageTheme,
    private readonly towers: TowerData,
    private readonly enemies: EnemyData,
  ) {
    this.leafKey = `${theme.leaf.join('-')}${theme.snow ? '-snow' : ''}`;
  }

  /** 木（葉と幹）。足元が原点 */
  tree(x: number, y: number): Baked {
    const leaf = hex(this.theme.leaf[0]);
    const light = hex(this.theme.leaf[1]);
    const snow = !!this.theme.snow;
    const key = bake(this.scene, `tree:${this.leafKey}`, TREE, (g) => {
      softShadow(g, 0, 2, 24, 9, 0.2);
      drawTrunk(g);
      drawCanopy(g, leaf, light);
      if (snow) {
        g.fillStyle(0xffffff, 1);
        ell(g, -2, -71, 15, 7);
        ell(g, -17, -50, 8, 4.5);
        ell(g, 16, -50, 8, 4.5);
      }
    });
    return place(this.scene, key, TREE, x, y);
  }

  /** 切り株 */
  stumpKey(): string {
    return bake(this.scene, 'stump', STUMP, (g) => drawStump(g));
  }

  treeKey(): string {
    return `tree:${this.leafKey}`;
  }

  /** 木と切り株は同じ画像の入れ物を使い回すので、切り替えたときに原点を合わせ直す */
  setTreeLook(img: Baked, alive: boolean): void {
    const f = alive ? TREE : STUMP;
    const key = alive ? this.treeKey() : this.stumpKey();
    if (img.texture.key !== key) img.setTexture(key).setOrigin(f.ox / f.w, f.oy / f.h);
  }

  /** かべの杭（level 1: 木、2: 石） */
  post(x: number, y: number, level: number): Baked {
    return place(this.scene, this.postKey(level), POST, x, y);
  }

  postKey(level: number): string {
    return bake(this.scene, `post:${level}`, POST, (g) => drawPost(g, { x: 0, y: 0 }, level, false));
  }

  /** まだ建っていない杭の場所の丸 */
  marker(x: number, y: number): Baked {
    const key = bake(this.scene, 'marker', MARKER, (g) => {
      g.lineStyle(2, 0xffffff, 0.7);
      g.strokeCircle(0, -4, 10);
    });
    return place(this.scene, key, MARKER, x, y);
  }

  /** とう（種類・レベル・分かれ道・雪で見た目が変わる） */
  towerKey(kind: TowerKind | null, level: number, branch: number | null = null): string {
    const snow = !!this.theme.snow;
    return bake(this.scene, `tower:${kind ?? 'none'}:${level}:${branch ?? '-'}:${snow ? 1 : 0}`, TOWER, (g) => {
      const fake = { x: 0, y: 0, kind, level, branch, pop: 0 } as Spot;
      drawTower(g, fake, this.towers, snow);
    });
  }

  tower(x: number, y: number): Baked {
    return place(this.scene, this.towerKey(null, 1), TOWER, x, y);
  }

  house(x: number, y: number): Baked {
    const night = !!this.theme.night;
    const key = bake(this.scene, `house:${night ? 1 : 0}`, HOUSE, (g) => drawHouse(g, new House(0, 0, 58, 1, 1), night));
    return place(this.scene, key, HOUSE, x, y);
  }

  /** 建設地点の円（maxed なら薄く） */
  spotKey(maxed: boolean): string {
    return bake(this.scene, `spot:${maxed ? 1 : 0}`, SPOT, (g) => {
      g.fillStyle(0xffffff, maxed ? 0.15 : 0.35);
      g.fillCircle(0, 0, SPOT_R);
      g.lineStyle(3, 0xffffff, 0.9);
      dashedCircle(g, 0, 0, SPOT_R, 8, 6);
    });
  }

  spot(x: number, y: number): Baked {
    return place(this.scene, this.spotKey(false), SPOT, x, y);
  }

  icon(type: BuildingType, x: number, y: number): Baked {
    const key = bake(this.scene, `icon:${type}`, ICON, (g) => drawIcon(g, type, 0, 0, 1.15));
    return place(this.scene, key, ICON, x, y + 2);
  }

  /** 敵の体（右向き）。空の敵は羽ばたきの番号ごと、木こりは持っている木の数ごと */
  enemyKey(kind: EnemyKind, frame = 0, carried = 0): string {
    const stats = this.enemies.kinds[kind];
    return bake(this.scene, `enemy:${kind}:${frame}:${carried}`, enemyFrame(stats), (g) => drawEnemyBody(g, kind, stats, frame, carried));
  }

  /** もぐっているもぐらの土の山（もぐらと同じ大きさの画像にする） */
  moundKey(kind: EnemyKind): string {
    const stats = this.enemies.kinds[kind];
    return bake(this.scene, `mound:${kind}`, enemyFrame(stats), (g) => drawMound(g, stats.r));
  }

  enemy(kind: EnemyKind): Baked {
    const f = enemyFrame(this.enemies.kinds[kind]);
    return place(this.scene, this.enemyKey(kind), f, 0, 0);
  }

  /** 地面の影（幅 40 の楕円、真ん中が原点） */
  shadow(): Baked {
    const key = bake(this.scene, 'shadow', SHADOW, (g) => softShadow(g, 0, 0, 17, 6, 0.24), 2);
    return this.scene.add.image(0, 0, key).setScale(1 / 2);
  }

  /** 丸太1本（木材のしるし）。長さ 18 で、真ん中が原点 */
  logKey(): string {
    return bake(this.scene, 'log', LOG, (g) => drawLog(g, 0, 0, 18));
  }

  log(x: number, y: number): Baked {
    return place(this.scene, this.logKey(), LOG, x, y);
  }

  /** 地面のまだら（ぼかした楕円）。幅 100 で、真ん中が原点 */
  patch(color: number): Baked {
    const key = bake(this.scene, `patch:${color.toString(16)}`, PATCH, (g) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle(color, 0.16);
        ell(g, 0, 0, 50 - i * 6, 30 - i * 3.6);
      }
    }, 1);
    return this.scene.add.image(0, 0, key);
  }

  /** おうちのまわりの空き地と小石 */
  clearing(x: number, y: number, seed: () => number): Baked {
    const clear = hex(this.theme.clearing);
    const key = bake(this.scene, `clearing:${this.theme.clearing}`, CLEARING, (g) => {
      g.fillStyle(clear, 0.25);
      ell(g, 0, 0, 268, 256);
      g.fillStyle(clear, 0.35);
      ell(g, 0, 0, 256, 244);
      g.fillStyle(clear, 0.6);
      ell(g, 0, 0, 242, 230);
      g.fillStyle(shade(clear, 0.78), 1);
      for (let i = 0; i < 40; i++) {
        const a = seed() * Math.PI * 2;
        const d = Math.sqrt(seed()) * 230;
        ell(g, Math.cos(a) * d, Math.sin(a) * d * 0.95, 2 + seed() * 2, 1.5 + seed());
      }
    }, 2);
    return this.scene.add.image(x, y, key).setScale(1 / 2);
  }

  /** 天気の粒（花びら、落ち葉、雪、火の粉、ほたる）。真ん中が原点で、size 1 のときの大きさ */
  flakeKey(type: string, color: string): string {
    const c = hex(color);
    return bake(this.scene, `flake:${type}:${color}`, FLAKE, (g) => {
      if (type === 'embers' || type === 'fireflies') {
        g.fillStyle(c, 0.25);
        g.fillCircle(0, 0, 9);
        g.fillStyle(c, 1);
        g.fillCircle(0, 0, 3);
      } else if (type === 'snow') {
        g.fillStyle(c, 0.95);
        g.fillCircle(0, 0, 5);
      } else {
        g.fillStyle(c, 0.95);
        ell(g, 0, 0, 8, 5);
        g.fillStyle(0xffffff, 0.4);
        ell(g, -2, -1.5, 3, 1.5);
      }
    }, 2);
  }

  /** 草地の模様（並べて敷く画像） */
  grassTile(seed: () => number): string {
    const th = this.theme;
    const size = GRASS_TILE;
    const key = `grass:${th.ground}:${th.tuft.join('-')}:${th.flower.join('-')}`;
    const f: Frame = { w: size, h: size, ox: 0, oy: 0 };
    return bake(this.scene, key, f, (g) => {
      const ground = hex(th.ground);
      g.fillStyle(ground, 1);
      g.fillRect(0, 0, size, size);
      const tuft = th.tuft.map(hex);
      const rnd = (a: number, b: number) => a + seed() * (b - a);
      // 端で切れないよう、草と花は内側にだけ置く
      for (let i = 0; i < 70; i++) {
        const x = rnd(10, size - 10);
        const y = rnd(14, size - 4);
        const s = rnd(3, 6);
        const c = tuft[i % tuft.length];
        g.fillStyle(shade(c, 0.8), 1);
        g.fillTriangle(x - s, y, x - s * 0.2, y, x - s * 1.4, y - s * 1.6);
        g.fillStyle(c, 1);
        g.fillTriangle(x - s * 0.5, y, x + s * 0.5, y, x, y - s * 2.2);
        g.fillStyle(tint(c, 0.15), 1);
        g.fillTriangle(x + s * 0.2, y, x + s, y, x + s * 1.4, y - s * 1.6);
      }
      const flower = th.flower.map(hex);
      for (let i = 0; i < 12; i++) {
        const x = rnd(8, size - 8);
        const y = rnd(8, size - 8);
        g.fillStyle(flower[i % flower.length], 1);
        for (const [dx, dy] of [
          [-2.4, 0],
          [2.4, 0],
          [0, -2.4],
          [0, 2.4],
        ])
          g.fillCircle(x + dx, y + dy, 2.2);
        g.fillStyle(0xffc23a, 1);
        g.fillCircle(x, y, 1.6);
      }
    }, GRASS_SCALE);
  }
}
