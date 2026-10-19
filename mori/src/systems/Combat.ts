import type { EnemyData, EnemyStats } from '../data/gameData';

/** 攻撃の出どころ。よろいは大ほう以外を減らし、氷はノックバックしない */
export type DamageSource = 'player' | 'arrow' | 'cannon' | 'ice';

/** よろいを考えたダメージ */
export function damageTo(stats: EnemyStats, dmg: number, src: DamageSource, data: EnemyData): number {
  return stats.armor && src !== 'cannon' ? dmg * data.common.armorReduction : dmg;
}

/** 攻撃を受けたときに後ろへ飛ばされる速さ（氷は0） */
export function knockbackOf(stats: EnemyStats, src: DamageSource, data: EnemyData): number {
  if (src === 'ice') return 0;
  const c = data.common;
  if (stats.boss) return c.knockbackBoss;
  if (stats.armor) return c.knockbackArmor;
  return c.knockback;
}
