import type { UnitData, UnitKind } from '../data/unitData';

/** 三すくみの倍率。有利なら advantage、不利なら disadvantage、それ以外は1 */
export function matchupMultiplier(data: UnitData, attacker: UnitKind, defender: UnitKind): number {
  const { beats, advantage, disadvantage } = data.matchups;
  if (beats[attacker] === defender) return advantage;
  if (beats[defender] === attacker) return disadvantage;
  return 1;
}

/** 弓兵のように、特定の兵種から受けるダメージが増える倍率 */
export function vulnerabilityMultiplier(data: UnitData, attacker: UnitKind, defender: UnitKind): number {
  let m = 1;
  for (const v of data.vulnerabilities) {
    if (v.defender === defender && v.attackers.includes(attacker)) m *= v.multiplier;
  }
  return m;
}

export interface DamageOptions {
  /** 攻撃側の基本攻撃力（レベルや振り分けを反映した値） */
  attack: number;
  /** 突撃の一撃かどうか */
  charging?: boolean;
  /** 攻撃力への加算ボーナス（ジャンヌの鼓舞 0.2 など） */
  attackBonus?: number;
}

export interface DamageResult {
  damage: number;
  /** 相性と弱点をかけ合わせた倍率 */
  multiplier: number;
}

export function computeDamage(
  data: UnitData,
  attacker: UnitKind,
  defender: UnitKind,
  opts: DamageOptions,
): DamageResult {
  const multiplier = matchupMultiplier(data, attacker, defender) * vulnerabilityMultiplier(data, attacker, defender);
  const charge = opts.charging ? (data.kinds[attacker].chargeMultiplier ?? 1) : 1;
  const bonus = 1 + (opts.attackBonus ?? 0);
  return { damage: opts.attack * multiplier * charge * bonus, multiplier };
}
