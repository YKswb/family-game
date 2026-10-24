import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/data/stageData';
import { UNIT_DATA } from '../src/data/unitData';
import {
  addXp,
  DIFFICULTY,
  emptyAllocation,
  freePointsFor,
  heroStats,
  leadershipAt,
  newProgress,
  squadBonus,
  starsFor,
  xpToNext,
} from '../src/systems/Progress';
import { clearSave, loadSave, newSave, SAVE_KEY, writeSave, type StorageLike } from '../src/systems/Save';
import { stageConfig } from '../src/systems/Stage';
import { World } from '../src/systems/World';

const DT = 1 / 60;
const hero = UNIT_DATA.kinds.hero;

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

describe('経験値とレベル', () => {
  it('次のレベルに必要な経験値は 20 × Lv^1.5 を切り上げ（Lv1→2 は 20、Lv10→11 は 633）', () => {
    expect(xpToNext(1)).toBe(20);
    expect(xpToNext(10)).toBe(633);
  });

  it('経験値がたまると、何レベルでもまとめて上がり、上限30で止まる', () => {
    expect(addXp(1, 0, 19)).toEqual({ level: 1, xp: 19, gained: 0 });
    expect(addXp(1, 19, 1)).toEqual({ level: 2, xp: 0, gained: 1 });
    // 20 + 57 = 77 で Lv3、残り3
    expect(addXp(1, 0, 80)).toEqual({ level: 3, xp: 3, gained: 2 });
    expect(addXp(29, 0, 1e9).level).toBe(30);
    expect(addXp(30, 0, 100)).toEqual({ level: 30, xp: 0, gained: 0 });
  });

  it('率いられる部隊の数は Lv5・10・15・20 で1つずつ増え、7が上限', () => {
    expect([1, 4, 5, 9, 10, 15, 20, 30].map((lv) => leadershipAt(lv, hero))).toEqual([3, 3, 4, 4, 5, 6, 7, 7]);
  });

  it('レベルと振り分けがジャンの能力に反映される', () => {
    const p = { level: 3, xp: 0, alloc: { ...emptyAllocation(), attack: 2, vitality: 1, agility: 1, defense: 10 } };
    const s = heroStats(hero, p);
    expect(s.maxHp).toBeCloseTo(70 + 2 * 6 + 8);
    expect(s.attack).toBeCloseTo(3.5 + 2 * 0.3 + 2 * 0.4);
    expect(s.speed).toBeCloseTo(150 + 2 * 1 + 2);
    expect(s.damageTaken).toBeCloseTo(0.9);
    expect(squadBonus({ ...emptyAllocation(), command: 5, morale: 5 })).toEqual({ attackMul: 1.05, hpMul: 1.1 });
  });
});

describe('ステージの評価とフリーポイント', () => {
  it('クリアで★1、10分以内で+1、仲間が統率いっぱいの半分以上残っていれば+1', () => {
    expect(starsFor(900, 0, 3)).toBe(1);
    expect(starsFor(500, 0, 3)).toBe(2);
    expect(starsFor(500, 15, 3)).toBe(3);
  });

  it('はじめてのクリアは「レベル＋★」、2回目からは増えた★の分だけ', () => {
    expect(freePointsFor(4, 2, null)).toBe(6);
    expect(freePointsFor(6, 3, 2)).toBe(1);
    expect(freePointsFor(6, 2, 3)).toBe(0);
  });
});

describe('セーブ（localStorage）', () => {
  it('キーは jeanne_ で始まり、書いたものがそのまま読める', () => {
    expect(SAVE_KEY.startsWith('jeanne_')).toBe(true);
    const st = memoryStorage();
    const d = newSave('easy');
    d.hero = { level: 4, xp: 12, alloc: { ...emptyAllocation(), attack: 3 } };
    d.cleared.stage1 = { stars: 2, bestSeconds: 420 };
    d.unspent = 5;
    d.squads = [{ kind: 'sword', composition: [{ kind: 'sword', n: 6 }, { kind: 'cavalry', n: 2 }] }];
    writeSave(st, d);
    expect(loadSave(st)).toEqual(d);
  });

  it('壊れたデータや保存なしでも、遊べる形で返す', () => {
    const st = memoryStorage();
    expect(loadSave(st)).toBeNull();
    st.setItem(SAVE_KEY, '{こわれた');
    expect(loadSave(st)).toBeNull();
    st.setItem(SAVE_KEY, JSON.stringify({ difficulty: 'へん', hero: { level: -3, alloc: { attack: 'x' } } }));
    const d = loadSave(st)!;
    expect(d.difficulty).toBe('normal');
    expect(d.hero.level).toBe(1);
    expect(d.hero.alloc.attack).toBe(0);
    expect(loadSave(null)).toBeNull();
  });

  it('「はじめから」で消せる', () => {
    const st = memoryStorage();
    writeSave(st, newSave('normal'));
    clearSave(st);
    expect(st.map.has(SAVE_KEY)).toBe(false);
  });
});

describe('戦場での成長と難易度', () => {
  const stage = STAGES.stage1.stage;

  it('ジャンが倒すと経験値1、率いている部隊が倒すと0.5。レベルが上がるとその場で強くなり、上がった分だけ回復する', () => {
    const w = new World({
      width: 2000,
      height: 1000,
      hero: { x: 500, y: 500 },
      squads: [
        { side: 'ally', mode: 'follow', kind: 'sword', count: 10, x: 500, y: 500 },
        { side: 'enemy', mode: 'hold', kind: 'sword', count: 40, x: 1500, y: 500 },
      ],
    });
    const foes = w.squads[1].alive;
    const ally = w.squads[0].alive[0];
    foes[0].hp = 0.1;
    w.strike(w.hero, foes[0]);
    expect(w.xp).toBe(1);
    foes[1].hp = 0.1;
    w.strike(ally, foes[1]);
    expect(w.xp).toBe(1.5);
    w.hero.hp = 30;
    const atk = w.hero.attack;
    const maxHp = w.hero.maxHp;
    for (let i = 2; i < 22; i++) {
      foes[i].hp = 0.1;
      w.strike(w.hero, foes[i]);
    }
    expect(w.level).toBe(2);
    expect(w.events.some((e) => e.type === 'levelUp' && e.level === 2)).toBe(true);
    expect(w.hero.maxHp).toBe(maxHp + 6);
    expect(w.hero.hp).toBe(36);
    expect(w.hero.attack).toBeCloseTo(atk + 0.3);
  });

  it('難易度で敵の人数とHPが変わる（倍率は difficulty.json）', () => {
    const easy = new World({ ...stageConfig(stage, 1), difficulty: DIFFICULTY.easy });
    const hard = new World({ ...stageConfig(stage, 1), difficulty: DIFFICULTY.hard });
    const normal = new World({ ...stageConfig(stage, 1), difficulty: DIFFICULTY.normal });
    const base = stage.squads.find((s) => s.id === 'raider1')!.count;
    const n = (w: World) => w.squadById('raider1')!.units.length;
    expect([n(easy), n(normal), n(hard)]).toEqual([
      Math.round(base * DIFFICULTY.easy.enemyCount),
      base,
      Math.round(base * DIFFICULTY.hard.enemyCount),
    ]);
    expect(n(easy)).toBeLessThan(base);
    expect(n(hard)).toBeGreaterThan(base);
    const hp = (w: World) => w.squadById('raider1')!.units[0].maxHp;
    const swordHp = UNIT_DATA.kinds.sword.hp;
    expect(hp(easy)).toBeCloseTo(swordHp * DIFFICULTY.easy.enemyHp);
    expect(hp(hard)).toBeCloseTo(swordHp * DIFFICULTY.hard.enemyHp);
    expect(hard.general!.maxHp).toBeCloseTo(stage.general!.hp * DIFFICULTY.hard.enemyHp);
  });

  it('むずかしいでは仲間が復活せず、全滅した部隊はそのまま消える', () => {
    const make = (key: 'normal' | 'hard') =>
      new World({
        width: 2000,
        height: 1000,
        // ジャンは、部隊が戻る場所（1500, 500）から離れたところにいる
        hero: { x: 300, y: 500 },
        difficulty: DIFFICULTY[key],
        squads: [{ side: 'ally', mode: 'follow', kind: 'sword', count: 10, x: 1500, y: 500 }],
      });
    for (const key of ['normal', 'hard'] as const) {
      const w = make(key);
      for (const u of w.squads[0].units) u.dead = true;
      for (let t = 0; t < 25; t += DT) w.step(DT);
      if (key === 'normal') {
        expect(w.squads[0].waiting).toBe(true);
        expect(w.squads[0].aliveCount).toBeGreaterThan(0);
      } else {
        expect(w.squads[0].waiting).toBe(false);
        expect(w.squads[0].aliveCount).toBe(0);
      }
    }
  });

  it('レベルと振り分けが、ステージの始めのジャンと率いる部隊に反映され、引き継いだ部隊がそばにいる', () => {
    const progress = { level: 5, xp: 0, alloc: { ...emptyAllocation(), vitality: 2, command: 10, morale: 10 } };
    const w = new World({
      ...stageConfig(stage, 1),
      progress,
      carriedSquads: [{ kind: 'spear', composition: [{ kind: 'spear', n: 7 }, { kind: 'sword', n: 2 }] }],
    });
    expect(w.hero.maxHp).toBe(70 + 4 * 6 + 16);
    expect(w.leadership).toBe(4);
    const carried = w.followingSquads();
    expect(carried).toHaveLength(1);
    expect(carried[0].composition()).toEqual([
      { kind: 'spear', n: 7 },
      { kind: 'sword', n: 2 },
    ]);
    const u = carried[0].alive[0];
    expect(u.attack).toBeCloseTo(UNIT_DATA.kinds.spear.attack * 1.1);
    expect(u.maxHp).toBeCloseTo(UNIT_DATA.kinds.spear.hp * 1.2);
    expect(Math.hypot(u.x - w.hero.x, u.y - w.hero.y)).toBeLessThan(300);
    expect(w.carriedSquadsOut()).toEqual([{ kind: 'spear', composition: [{ kind: 'spear', n: 7 }, { kind: 'sword', n: 2 }] }]);
  });

  it('はじめは Lv1・経験値0', () => {
    expect(newProgress()).toEqual({ level: 1, xp: 0, alloc: emptyAllocation() });
  });
});
