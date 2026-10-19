import type { EnemyKind, EnemyStats } from '../data/gameData';
import type { Tree } from './Tree';

/** 敵1体。おうちへまっすぐ向かい、かべがあればかべを、なければおうちを攻撃する */
export class Enemy {
  dead = false;
  hp: number;
  readonly maxHp: number;
  readonly speed: number;
  /** ノックバックの速さ */
  kx = 0;
  ky = 0;
  /** 次に攻撃できるまでの秒数 */
  atkT: number;
  /** 攻撃を受けたときの白い点滅の残り秒数 */
  hitF = 0;
  /** 氷で遅くなっている残り秒数 */
  slow = 0;
  /** こおって止まっている残り秒数 */
  frozen = 0;
  /** 体の揺れの位相 */
  bob: number;
  face: 1 | -1 = 1;
  /** 次に仲間を呼ぶまでの秒数 */
  summonT: number;

  // ---- もぐら ----
  /** かべの下にもぐっている（攻撃が当たらない） */
  underground = false;

  // ---- 木こり ----
  /** 切りに行く木 */
  tree: Tree | null = null;
  /** 次に斧を振るまでの秒数 */
  chopT = 0;
  /** 切り倒して持っている木の数 */
  carried = 0;
  /** 持てるだけ持ったので、森の外へ逃げていく */
  leaving = false;

  // ---- いやし ----
  /** 次に回復するまでの秒数 */
  healT = 0;

  constructor(
    readonly id: number,
    readonly kind: EnemyKind,
    readonly stats: EnemyStats,
    public x: number,
    public y: number,
    hpMul: number,
    speedMul: number,
    opts: { firstAttack: number; summonFirst: number; bob: number },
  ) {
    this.hp = this.maxHp = stats.hp * hpMul;
    this.speed = stats.speed * speedMul;
    this.atkT = opts.firstAttack;
    this.summonT = opts.summonFirst;
    this.bob = opts.bob;
    this.healT = stats.healer?.interval ?? 0;
  }

  get r(): number {
    return this.stats.r;
  }

  get fly(): boolean {
    return !!this.stats.fly;
  }

  /** とうや主人公の攻撃が当たるか */
  get targetable(): boolean {
    return !this.dead && !this.underground;
  }
}
