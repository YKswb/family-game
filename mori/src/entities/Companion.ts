import type { CompanionKind, CompanionStats } from '../data/gameData';
import type { Enemy } from './Enemy';

/** follow: ついてきて（あらたの後ろを付いて歩く）、guard: おうちを守って */
export type CompanionMode = 'follow' | 'guard';

/** 一緒に戦う森の動物の仲間。敵には狙われないので、倒されることはない */
export class Companion {
  mode: CompanionMode = 'follow';
  /** いま戦っている敵 */
  target: Enemy | null = null;
  /** 次に攻撃できるまでの秒数 */
  cd = 0;
  /** 攻撃の動きの残り（1→0） */
  swing = 0;
  face: 1 | -1 = 1;
  moving = false;
  /** 歩く（はねる、はばたく）動きの位相 */
  step = 0;
  /** 一気に戻ったときの、ふわっと現れる動きの残り秒数 */
  appear = 0;

  constructor(
    readonly kind: CompanionKind,
    readonly stats: CompanionStats,
    public x: number,
    public y: number,
    /** まもりびとの家の強化を掛けた、攻撃と速さの倍率 */
    readonly damageMul: number,
    readonly speedMul: number,
  ) {}

  get speed(): number {
    return this.stats.speed * this.speedMul;
  }

  get interval(): number {
    return this.stats.interval / this.speedMul;
  }

  get damage(): number {
    return this.stats.damage * this.damageMul;
  }

  get fly(): boolean {
    return !!this.stats.fly;
  }
}
