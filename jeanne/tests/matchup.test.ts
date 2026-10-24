import { describe, expect, it } from 'vitest';
import type { SoldierKind } from '../src/data/unitData';
import { World } from '../src/systems/World';
import { runSquadDuel } from './bot';

/** 10人対10人を向かい合わせて戦わせ、strong 側が勝った回数を数える（左右を入れ替えて両方の陣営で試す） */
function winsOf(strong: SoldierKind, weak: SoldierKind, seeds = 5): number {
  let wins = 0;
  for (const strongIsAlly of [true, false]) {
    for (let seed = 1; seed <= seeds; seed++) {
      const [allyKind, enemyKind] = strongIsAlly ? [strong, weak] : [weak, strong];
      const w = new World({
        width: 2000,
        height: 1200,
        hero: { x: 60, y: 60 },
        seed,
        squads: [
          { side: 'ally', kind: allyKind, count: 10, x: 800, y: 600, mode: 'hold', dir: [1, 0] },
          { side: 'enemy', kind: enemyKind, count: 10, x: 1040, y: 600, mode: 'hold', dir: [-1, 0] },
        ],
      });
      const r = runSquadDuel(w);
      const strongLeft = strongIsAlly ? r.ally : r.enemy;
      const weakLeft = strongIsAlly ? r.enemy : r.ally;
      if (strongLeft > 0 && weakLeft === 0) wins++;
    }
  }
  return wins;
}

describe('部隊どうしの戦い（ヘッドレス）', () => {
  it.each([
    ['cavalry', 'sword'],
    ['sword', 'spear'],
    ['spear', 'cavalry'],
  ] as const)('三すくみ：%s は %s にほぼ必ず勝つ', (strong, weak) => {
    expect(winsOf(strong, weak)).toBeGreaterThanOrEqual(9);
  });

  // 弓兵が下がりながら射ち、追う側が持ち場へ引き返すのをくり返して負けることがあるので、多めに試して7割以上で見る
  it.each(['sword', 'spear', 'cavalry'] as const)('弓兵の弱点：%s は近づいて弓兵隊に勝つ（20回中14回以上）', (melee) => {
    expect(winsOf(melee, 'archer', 10)).toBeGreaterThanOrEqual(14);
  });
});
