import { describe, expect, it } from 'vitest';
import { GAME_DATA, PRACTICE_STAGE, STAGES } from '../src/data/gameData';
import { availableTowers, buyUpgrade, clearStage, homeBonus, markSeen, nextCost, refundAll, rewardFor, unlockTower, unlockable } from '../src/systems/Home';
import { SAVE_KEY, SaveStore, newSave, parseSave, type KeyValueStore } from '../src/systems/Save';
import { World } from '../src/systems/World';

const home = GAME_DATA.home;

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

describe('セーブの読み書き', () => {
  it('書いたものを、そのまま読み戻せる', () => {
    const store = new SaveStore(memoryStore());
    const s = newSave();
    s.love = 42;
    s.levels.speed = 2;
    s.unlocked = ['lightning'];
    s.seen = ['arrow', 'lightning'];
    s.stages.stage1 = { stars: 3, crown: true, clears: 2 };
    s.difficulty = 2;
    store.save(s);
    expect(store.exists()).toBe(true);
    expect(store.load()).toEqual(s);
  });

  it('キーは mori3_ で始まり、今の版の mori3_prog には触らない', () => {
    const mem = memoryStore();
    mem.map.set('mori3_prog', '{"unlocked":5}');
    new SaveStore(mem).save(newSave());
    expect(SAVE_KEY.startsWith('mori3_')).toBe(true);
    expect(mem.map.get('mori3_prog')).toBe('{"unlocked":5}');
  });

  it('壊れたセーブや、知らない値の混ざったセーブでも、読める所だけ拾う', () => {
    expect(parseSave('{これは JSON ではない')).toEqual(newSave());
    const s = parseSave(JSON.stringify({ love: 10, levels: { speed: 1, bad: 'x' }, unlocked: ['lightning', 'dragon', 'lightning'], stages: { stage1: { stars: 9, clears: 1 } }, difficulty: 7 }));
    expect(s.love).toBe(10);
    expect(s.levels).toEqual({ speed: 1 });
    expect(s.unlocked).toEqual(['lightning']);
    expect(s.stages.stage1).toEqual({ stars: 3, crown: false, clears: 1 });
    expect(s.difficulty).toBe(1);
  });

  it('「はじめから」で消すと、新しいセーブに戻る', () => {
    const store = new SaveStore(memoryStore());
    const s = newSave();
    s.love = 5;
    store.save(s);
    store.clear();
    expect(store.exists()).toBe(false);
    expect(store.load()).toEqual(newSave());
  });
});

describe('なつこの愛', () => {
  it('はじめてのクリアは多め、2回目からは少しだけ。むずかしいで初めてクリアすると王冠の分も', () => {
    const s = newSave();
    const stage = STAGES[0];
    const r1 = clearStage(s, home, stage, 2, 1);
    expect(r1.first).toBe(true);
    expect(r1.love).toBe(Math.round(stage.reward * (1 + home.rewards.perStar * 2)));
    const r2 = clearStage(s, home, stage, 3, 2);
    expect(r2.first).toBe(false);
    expect(r2.crown).toBe(true);
    const full = stage.reward * home.rewards.difficultyMul[2] * (1 + home.rewards.perStar * 3);
    expect(r2.love).toBe(Math.round(full * home.rewards.replayMul + stage.reward * home.rewards.crownMul));
    expect(s.stages.stage1).toEqual({ stars: 3, crown: true, clears: 2 });
    expect(s.love).toBe(r1.love + r2.love);
  });

  it('ステージ1（いちばんやさしい）は、ふつう★3の初クリアでも安い強化1〜2つ分にとどめる', () => {
    const love = rewardFor(home, STAGES[0].reward, 3, 1, true, false);
    const cheapest = Math.min(...home.upgrades.map((u) => u.costs[0]));
    expect(love).toBeGreaterThanOrEqual(cheapest);
    expect(love).toBeLessThan(cheapest * 3);
  });

  it('かんたんは少なめ、むずかしいは多め', () => {
    const base = STAGES[0].reward;
    expect(rewardFor(home, base, 3, 0, true, false)).toBeLessThan(rewardFor(home, base, 3, 1, true, false));
    expect(rewardFor(home, base, 3, 2, true, false)).toBeGreaterThan(rewardFor(home, base, 3, 1, true, false));
  });

  it('強化を買うとなつこの愛が減り、ふりなおすと全部戻る', () => {
    const s = newSave();
    s.love = 100;
    const c1 = nextCost(s, home, 'speed')!;
    expect(buyUpgrade(s, home, 'speed')).toBe(true);
    const c2 = nextCost(s, home, 'speed')!;
    expect(buyUpgrade(s, home, 'speed')).toBe(true);
    expect(s.love).toBe(100 - c1 - c2);
    expect(refundAll(s, home)).toBe(c1 + c2);
    expect(s.love).toBe(100);
    expect(s.levels).toEqual({});
  });

  it('足りないときと、最大のときは買えない', () => {
    const s = newSave();
    s.love = 1;
    expect(buyUpgrade(s, home, 'speed')).toBe(false);
    s.love = 9999;
    const max = home.upgrades.find((u) => u.id === 'speed')!.costs.length;
    for (let i = 0; i < max; i++) buyUpgrade(s, home, 'speed');
    expect(nextCost(s, home, 'speed')).toBeNull();
    expect(buyUpgrade(s, home, 'speed')).toBe(false);
  });
});

describe('とうの解放', () => {
  it('ステージで見たとうだけ解放でき、解放するとどのステージでも使える', () => {
    const s = newSave();
    s.love = 999;
    expect(unlockable(s, home)).toEqual([]);
    expect(unlockTower(s, home, 'lightning')).toBe(false);
    markSeen(s, PRACTICE_STAGE);
    expect(unlockable(s, home).map((u) => u.tower)).toContain('lightning');
    expect(unlockTower(s, home, 'lightning')).toBe(true);
    expect(availableTowers(STAGES[0], s)).toEqual(['arrow', 'lightning']);
  });
});

describe('家の強化がステージに効く', () => {
  it('持てる数・おうちの HP・最初の木材・建てる値段が変わる', () => {
    const s = newSave();
    s.levels = { carry: 1, house: 2, stock: 1, builder: 3 };
    const b = homeBonus(s, home);
    const plain = new World(STAGES[0]);
    const w = new World(STAGES[0], { home: b });
    expect(w.capacity).toBe(plain.capacity + 5);
    expect(w.house.maxHp).toBe(plain.house.maxHp + 8);
    expect(w.player.wood).toBe(5);
    const tower = w.spots.find((x) => x.type === 'tower')!;
    expect(tower.cost).toBeLessThan(plain.spots.find((x) => x.type === 'tower')!.cost);
  });

  it('建てられないとうは選べない', () => {
    const w = new World(STAGES[0]);
    w.choices.push({ type: 'tower', spot: w.spots.find((x) => x.type === 'tower')! });
    w.chooseTower('lightning');
    expect(w.choice?.type).toBe('tower');
    const w2 = new World(STAGES[0], { towers: ['arrow', 'lightning'] });
    const t = w2.spots.find((x) => x.type === 'tower')!;
    w2.choices.push({ type: 'tower', spot: t });
    w2.chooseTower('lightning');
    expect(t.kind).toBe('lightning');
  });
});
