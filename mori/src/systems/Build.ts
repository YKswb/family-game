import type { BuildingData, BuildingType } from '../data/gameData';

/** 建設地点。主人公が円の上に立つと、木材を1本ずつ払って建てる */
export class Spot {
  level = 0;
  /** 今のレベルに向けて払った木材 */
  paid = 0;
  /** 次の1本を払うまでの秒数 */
  feed: number;
  /** 主人公が円の上にいるか */
  near = false;
  /** 建ったときに弾む動きの残り秒数 */
  pop = 0;

  constructor(
    readonly id: number,
    readonly type: BuildingType,
    readonly x: number,
    readonly y: number,
    private readonly data: BuildingData,
  ) {
    this.feed = data.payFirstDelay;
  }

  get maxLevel(): number {
    return this.data.kinds[this.type].costs.length;
  }

  get maxed(): boolean {
    return this.level >= this.maxLevel;
  }

  /** 次のレベルに必要な木材の合計（最大レベルなら0） */
  get cost(): number {
    return this.maxed ? 0 : this.data.kinds[this.type].costs[this.level];
  }

  /** 次のレベルまでの残り */
  get remaining(): number {
    return this.cost - this.paid;
  }
}

export interface PayResult {
  /** このフレームで払った木材の数 */
  paid: number;
  /** レベルが上がったか */
  built: boolean;
}

/**
 * 円の上にいる間、payInterval ごとに木材を1本払う。乗った直後だけ payFirstDelay 待つ
 * （通りすがりに払ってしまわないように）
 */
export function paySpot(spot: Spot, near: boolean, wood: number, dt: number, data: BuildingData): PayResult {
  spot.near = near;
  if (!near || spot.maxed || wood <= 0) {
    spot.feed = data.payFirstDelay;
    return { paid: 0, built: false };
  }
  spot.feed -= dt;
  let paid = 0;
  while (spot.feed <= 0 && wood - paid > 0) {
    spot.feed += data.payInterval;
    paid++;
    spot.paid++;
    if (spot.paid >= spot.cost) {
      spot.level++;
      spot.paid = 0;
      spot.feed = data.payFirstDelay;
      spot.pop = 0.5;
      return { paid, built: true };
    }
  }
  return { paid, built: false };
}
