import { describe, expect, it } from 'vitest';
import { UNIT_DATA } from '../src/data/unitData';
import { computeDamage, matchupMultiplier, vulnerabilityMultiplier } from '../src/systems/Combat';

const D = UNIT_DATA;

describe('三すくみ（騎馬 ＞ 剣士 ＞ 槍兵 ＞ 騎馬）', () => {
  it.each([
    ['cavalry', 'sword'],
    ['sword', 'spear'],
    ['spear', 'cavalry'],
  ] as const)('%s は %s に 1.5倍、逆は 0.75倍', (strong, weak) => {
    expect(matchupMultiplier(D, strong, weak)).toBe(1.5);
    expect(matchupMultiplier(D, weak, strong)).toBe(0.75);
  });

  it('同じ兵種どうしと、三すくみの外の組み合わせは等倍', () => {
    expect(matchupMultiplier(D, 'sword', 'sword')).toBe(1);
    expect(matchupMultiplier(D, 'archer', 'cavalry')).toBe(1);
    expect(matchupMultiplier(D, 'hero', 'sword')).toBe(1);
    expect(matchupMultiplier(D, 'sword', 'hero')).toBe(1);
  });
});

describe('弓兵の弱点', () => {
  it.each(['sword', 'spear', 'cavalry'] as const)('%s から受けるダメージは 1.5倍', (k) => {
    expect(vulnerabilityMultiplier(D, k, 'archer')).toBe(1.5);
  });

  it('弓兵どうし・ジャンからは等倍、弓兵が攻撃する側なら等倍', () => {
    expect(vulnerabilityMultiplier(D, 'archer', 'archer')).toBe(1);
    expect(vulnerabilityMultiplier(D, 'hero', 'archer')).toBe(1);
    expect(vulnerabilityMultiplier(D, 'archer', 'sword')).toBe(1);
  });
});

describe('ダメージ計算', () => {
  it('相性・突撃・鼓舞をかけ合わせる', () => {
    // 騎馬 1.6 × 有利1.5 × 突撃2 × 鼓舞1.2
    const r = computeDamage(D, 'cavalry', 'sword', { attack: 1.6, charging: true, attackBonus: 0.2 });
    expect(r.multiplier).toBe(1.5);
    expect(r.damage).toBeCloseTo(1.6 * 1.5 * 2 * 1.2);
  });

  it('突撃の倍率を持たない兵種は charging でも変わらない', () => {
    const r = computeDamage(D, 'sword', 'sword', { attack: 1.2, charging: true });
    expect(r.damage).toBeCloseTo(1.2);
  });

  it('剣士が弓兵を斬ると弱点だけがかかる', () => {
    const r = computeDamage(D, 'sword', 'archer', { attack: 1.2 });
    expect(r.multiplier).toBe(1.5);
    expect(r.damage).toBeCloseTo(1.8);
  });
});
