import type { EnemyKind, EnemyStats } from '../data/gameData';

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
  /** 体の揺れの位相 */
  bob: number;
  face: 1 | -1 = 1;
  /** 次に仲間を呼ぶまでの秒数 */
  summonT: number;

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
  }

  get r(): number {
    return this.stats.r;
  }

  get fly(): boolean {
    return !!this.stats.fly;
  }
}
