import type { EnemyData, EnemyStats } from '../data/gameData';

/**
 * 攻撃の出どころ。よろいは大ほう（と、その火）以外を減らす。
 * 氷・火・かみなりはノックバックしない。たては正面からの矢と氷の玉を防ぐ
 */
export type DamageSource = 'player' | 'arrow' | 'cannon' | 'ice' | 'fire' | 'lightning';

/** よろいを考えたダメージ */
export function damageTo(stats: EnemyStats, dmg: number, src: DamageSource, data: EnemyData): number {
  return stats.armor && src !== 'cannon' && src !== 'fire' ? dmg * data.common.armorReduction : dmg;
}

/** 攻撃を受けたときに後ろへ飛ばされる速さ */
export function knockbackOf(stats: EnemyStats, src: DamageSource, data: EnemyData): number {
  if (src === 'ice' || src === 'fire' || src === 'lightning') return 0;
  const c = data.common;
  if (stats.boss) return c.knockbackBoss;
  if (stats.armor) return c.knockbackArmor;
  return c.knockback;
}

/** たてで防げる攻撃か */
export function shieldable(src: DamageSource): boolean {
  return src === 'arrow' || src === 'ice';
}

/**
 * たての正面から来た攻撃か。たては進む向き（おうちの方）を向いているので、
 * 敵から見た「攻撃の来た向き」と「おうちの向き」がそろっているほど正面
 */
export function fromFront(ex: number, ey: number, fromX: number, fromY: number, homeX: number, homeY: number, arc: number): boolean {
  const ax = fromX - ex;
  const ay = fromY - ey;
  const hx = homeX - ex;
  const hy = homeY - ey;
  const la = Math.hypot(ax, ay);
  const lh = Math.hypot(hx, hy);
  if (la < 1e-6 || lh < 1e-6) return false;
  return (ax * hx + ay * hy) / (la * lh) > arc;
}
