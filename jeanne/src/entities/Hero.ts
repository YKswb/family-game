import type { UnitStats } from '../data/unitData';
import { Unit } from './Unit';

/** プレイヤーが操作するジャン */
export class Hero extends Unit {
  /** 最後にダメージを受けてからの秒数 */
  sinceHit = 0;

  constructor(id: number, stats: UnitStats, x: number, y: number) {
    super(id, 'hero', 'ally', stats, x, y, null, 0);
  }
}
