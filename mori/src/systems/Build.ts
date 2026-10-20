import type { BuildingData, BuildingType, TowerKind } from '../data/gameData';

/** かべの杭1本の位置 */
export interface Post {
  x: number;
  y: number;
}

/**
 * 建設地点。主人公が円の上に立つと、木材を1本ずつ払って建てる。
 * とうとかべは、建ったあとの状態（とうの種類、かべの HP）もここに持つ
 */
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
  /** まだ現れていない（領地を広げると現れる）、または役目を終えた */
  hidden = false;
  /** 値段に掛ける倍率（まもりびとの家の「けんちく 名人」） */
  costMul = 1;

  // ---- とう ----
  /** 建てたときに選んだ種類（選ぶまでは null で、それまで次のレベルへは払えない） */
  kind: TowerKind | null = null;
  /** レベル3で選んだ分かれ道（branches の添字。選ぶまでは null） */
  branch: number | null = null;
  /** 次に撃てるまでの秒数 */
  cd = 0;

  // ---- かべ ----
  hp = 0;
  maxHp = 0;
  /** 攻撃を受けたときの点滅の残り秒数 */
  hit = 0;
  /** かべの区画の中心の角度 */
  angle = 0;
  posts: Post[] = [];

  constructor(
    readonly id: number,
    readonly type: BuildingType,
    public x: number,
    public y: number,
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
    if (this.maxed) return 0;
    const base = this.data.kinds[this.type].costs[this.level];
    return this.costMul === 1 ? base : Math.max(1, Math.round(base * this.costMul));
  }

  /** 次のレベルまでの残り */
  get remaining(): number {
    return this.cost - this.paid;
  }

  /** いま木材を払えるか（とうは種類を選ぶまで次へ進めない） */
  get payable(): boolean {
    if (this.hidden || this.maxed) return false;
    return !(this.type === 'tower' && this.level > 0 && !this.kind);
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
  if (!near || !spot.payable || wood <= 0) {
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

/** 角度 a（おうちから見た向き）がどのかべの区画に入るか */
export function sectorOf(a: number, sectors: number): number {
  const tau = Math.PI * 2;
  return Math.floor((((a % tau) + tau) % tau) / (tau / sectors)) % sectors;
}
