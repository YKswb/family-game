import { describe, expect, it } from 'vitest';
import { UNIT_DATA, type UnitData } from '../src/data/unitData';
import { arenaConfig } from '../src/systems/Arena';
import { World } from '../src/systems/World';
import { runBot } from './bot';

/**
 * 弓兵を率いたジャンが敵の剣士隊とぶつかり、敵兵がジャンを狙ったところで、
 * ジャンを狙っている敵兵のすぐ横に弓兵を置く。その敵兵が弓兵に狙いを変えたかと、弓兵が傷ついたかを返す
 */
function bumpArchersIntoEnemy(data: UnitData): { targetedArcher: boolean; archerDamaged: boolean } {
  const w = new World({ ...arenaConfig('archer', 'sword', 3), data });
  const archers = w.squads[0];
  const enemy = w.squads[1];

  // 1. ジャンを敵へ向かわせ、敵兵がジャンを狙うまで進める
  const onHero = () => enemy.alive.filter((u) => u.target === w.hero);
  for (let i = 0; i < 60 * 8 && onHero().length === 0; i++) {
    const c = enemy.center();
    const dx = c.x - w.hero.x;
    const dy = c.y - w.hero.y;
    const d = Math.hypot(dx, dy);
    w.input = d > 40 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
    w.step(1 / 60);
  }
  const foes = onHero();
  if (foes.length === 0) throw new Error('敵兵がジャンを狙う場面が作れなかった');

  // 2. ジャンを狙っている敵兵のすぐ横へ弓兵を置く（わざとぶつけた状態）
  archers.alive.forEach((a, i) => {
    const e = foes[i % foes.length];
    const side = e.x >= w.hero.x ? 1 : -1;
    a.x = e.x + side * 20;
    a.y = e.y;
  });
  const hpBefore = archers.units.reduce((s, u) => s + u.hp, 0);

  // 3. 少し進めて様子を見る
  w.input = { x: 0, y: 0 };
  let targetedArcher = false;
  for (let i = 0; i < 60 * 2; i++) {
    w.step(1 / 60);
    if (foes.some((u) => !u.dead && u.target?.kind === 'archer')) targetedArcher = true;
  }
  const hpAfter = archers.units.reduce((s, u) => s + Math.max(0, u.hp), 0);
  return { targetedArcher, archerDamaged: hpAfter < hpBefore };
}

describe('敵兵の狙い', () => {
  it('ジャンを追っていても、すぐそばにぶつかってきた弓兵に狙いを変える', () => {
    const r = bumpArchersIntoEnemy(UNIT_DATA);
    expect(r.targetedArcher).toBe(true);
    expect(r.archerDamaged).toBe(true);
  });

  it.each([1, 2, 3])('練習場で弓兵を率いて敵の剣士隊と戦うと、敵兵の一部は弓兵を狙う（seed %i）', (seed) => {
    const w = new World(arenaConfig('archer', 'sword', seed));
    const archers = w.squads[0];
    const enemy = w.squads[1];
    let maxOnArchers = 0;
    let maxOnHero = 0;
    const s = runBot(w, 120, 1 / 60, () => {
      const alive = enemy.units.filter((u) => !u.dead);
      maxOnArchers = Math.max(maxOnArchers, alive.filter((u) => u.target?.kind === 'archer').length);
      // 弓兵が残っているあいだは、ジャンに刃の届く距離で斬りかかるのは上限の人数まで
      // （近づいている途中は、狙いを選び直すまでの一瞬だけ上限を超えることがある）
      if (archers.aliveCount > 0) {
        const h = w.hero;
        const n = alive.filter((u) => u.target === h && Math.hypot(u.x - h.x, u.y - h.y) <= u.radius + h.radius + u.reach + 2).length;
        maxOnHero = Math.max(maxOnHero, n);
      }
    });
    expect(s.broken).toBeNull();
    expect(w.outcome).toBe('won');
    expect(maxOnArchers).toBeGreaterThan(0);
    expect(maxOnHero).toBeLessThanOrEqual(UNIT_DATA.ai.maxAttackersOnHero);
    const hp = archers.units.reduce((a, u) => a + Math.max(0, u.hp), 0);
    expect(hp).toBeLessThan(archers.units.length * archers.units[0].maxHp);
  });

  it('（確認）狙いを乗り換えず人数の上限もない設定だと、弓兵は狙われない＝報告された不具合', () => {
    const sticky = structuredClone(UNIT_DATA);
    sticky.ai.retargetSwitchMargin = Infinity;
    sticky.ai.maxAttackersOnHero = Infinity;
    sticky.ai.maxAttackersOnSoldier = Infinity;
    expect(bumpArchersIntoEnemy(sticky).targetedArcher).toBe(false);
  });
});
