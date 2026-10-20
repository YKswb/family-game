import type { UnitStats } from '../data/unitData';
import { Unit } from './Unit';

/** ジャンヌ：ジャンの後ろを付いて歩き、近くの敵を剣で斬る。まわりの味方の攻撃が上がる。HP が0で負け */
export class Jeanne extends Unit {
  /** 最後にダメージを受けてからの秒数 */
  sinceHit = 0;
  /** HP が少ないことを知らせたか（回復したら、また知らせる） */
  warned = false;

  constructor(id: number, stats: UnitStats, x: number, y: number) {
    super(id, 'jeanne', 'ally', stats, x, y, null, 0);
  }
}
