import { describe, expect, it } from 'vitest';
import { GAME_DATA, PRACTICE_STAGE, type StageData } from '../src/data/gameData';
import { branchOf, towerPower } from '../src/systems/Towers';
import { World } from '../src/systems/World';

const DT = 1 / 60;
const td = GAME_DATA.towers;

/** 木のない練習の森。主人公はおうちの上の方で、敵に手を出さない */
function quietWorld(): World {
  const s: StageData = { ...PRACTICE_STAGE, trees: { ...PRACTICE_STAGE.trees, count: 0 } };
  const w = new World(s);
  w.timer = 9999;
  w.player.x = w.house.x;
  w.player.y = w.house.y - 280;
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) w.step(DT);
}

/** 内側のとうの場所に、指定の種類・レベル・分かれ道のとうを建てる */
function tower(w: World, kind: 'arrow' | 'cannon' | 'ice' | 'lightning' | 'heal', level = 1, branch: number | null = null) {
  const s = w.spots.find((x) => x.type === 'tower' && !x.hidden && x.level === 0)!;
  s.level = level;
  s.kind = kind;
  s.branch = branch;
  return s;
}

describe('分かれ道', () => {
  it('レベル3まで建てると分かれ道の選択が出て、選ぶと強さが変わる', () => {
    const w = quietWorld();
    const s = tower(w, 'arrow', 2);
    w.player.x = s.x;
    w.player.y = s.y;
    w.player.wood = 40;
    run(w, 3);
    expect(s.level).toBe(3);
    expect(w.choice?.type).toBe('branch');
    const before = towerPower('arrow', 3, null, td);
    w.chooseBranch(0);
    expect(w.choice).toBeNull();
    const after = towerPower('arrow', 3, branchOf(s, td), td);
    expect(after.interval).toBeLessThan(before.interval);
  });

  it('とおくまで：射程がのびる', () => {
    const p = towerPower('arrow', 3, td.kinds.arrow.branches[1], td);
    expect(p.range).toBe(td.kinds.arrow.range[2] + (td.kinds.arrow.branches[1].rangeAdd ?? 0));
  });
});

describe('かみなりのとう', () => {
  it('近くにまとまった敵に、つぎつぎ電気がとぶ', () => {
    const w = quietWorld();
    const s = tower(w, 'lightning', 1);
    const es = [0, 1, 2].map((i) => w.addEnemy('goblin', s.x + 120 + i * 40, s.y, 50));
    run(w, 0.2);
    expect(es.every((e) => e.hp < e.maxHp)).toBe(true);
  });

  it('「空の てき」を選ぶと、空の敵へのダメージが2倍', () => {
    const w = quietWorld();
    const s = tower(w, 'lightning', 3, 1);
    const bat = w.addEnemy('bat', s.x + 100, s.y, 50);
    run(w, 0.2);
    const p = towerPower('lightning', 3, branchOf(s, td), td);
    expect(bat.maxHp - bat.hp).toBeCloseTo(p.damage * 2);
  });
});

describe('ちゆのとう', () => {
  it('近くの傷ついたかべと、おうちを直す。敵は攻撃しない', () => {
    const w = quietWorld();
    const s = tower(w, 'heal', 1);
    const near = w.walls.reduce((a, b) => (Math.hypot(a.x - s.x, a.y - s.y) < Math.hypot(b.x - s.x, b.y - s.y) ? a : b));
    near.level = 1;
    near.maxHp = 12;
    near.hp = 4;
    w.house.hp = 20;
    const e = w.addEnemy('goblin', s.x + 100, s.y, 50);
    run(w, 0.2);
    expect(near.hp).toBe(4 + td.kinds.heal.heal![0]);
    expect(w.house.hp).toBe(20 + (td.kinds.heal.houseHeal ?? 0));
    expect(e.hp).toBe(e.maxHp);
  });

  it('「かたい かべ」を選ぶと、範囲内のかべが受けるダメージが減る', () => {
    const w = quietWorld();
    const s = tower(w, 'heal', 3, 1);
    const near = w.walls.reduce((a, b) => (Math.hypot(a.x - s.x, a.y - s.y) < Math.hypot(b.x - s.x, b.y - s.y) ? a : b));
    near.level = 1;
    near.maxHp = near.hp = 100;
    w.hitWall(near, 10);
    expect(near.hp).toBeCloseTo(100 - 10 * (td.kinds.heal.branches[1].wallGuard ?? 1));
  });
});

describe('大ほうと氷の分かれ道', () => {
  it('もえる 地面：爆発のあとに残る火が、上にいる敵を少しずつ削る', () => {
    const w = quietWorld();
    w.addFire(w.house.x + 600, w.house.y, 46, 2.5, 3);
    const e = w.addEnemy('knight', w.house.x + 600, w.house.y, 50);
    run(w, 1);
    expect(e.maxHp - e.hp).toBeGreaterThan(1.5);
    run(w, 3);
    expect(w.fires.length).toBe(0);
  });

  it('こおらせる：こおった敵は動かない', () => {
    const w = quietWorld();
    const e = w.addEnemy('goblin', w.house.x + 600, w.house.y, 50);
    e.frozen = 1;
    const x = e.x;
    run(w, 0.5);
    expect(e.x).toBe(x);
    run(w, 1);
    expect(e.x).toBeLessThan(x);
  });

  it('ひろい さむさ：当たった敵のまわりの敵も遅くなる', () => {
    const w = quietWorld();
    const s = tower(w, 'ice', 3, 0);
    const a = w.addEnemy('goblin', s.x + 120, s.y, 50);
    const b = w.addEnemy('goblin', s.x + 150, s.y + 20, 50);
    run(w, 1.5);
    expect(a.slow).toBeGreaterThan(0);
    expect(b.slow).toBeGreaterThan(0);
  });
});
