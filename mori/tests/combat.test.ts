import { describe, expect, it } from 'vitest';
import { GAME_DATA, STAGES, type StageData } from '../src/data/gameData';
import { Random } from '../src/systems/Random';
import { pickPerks } from '../src/systems/Upgrades';
import { waveList } from '../src/systems/Waves';
import { World } from '../src/systems/World';

const DT = 1 / 60;
const ed = GAME_DATA.enemies;
const wall = GAME_DATA.buildings.wall;

/** 木のないステージ1（敵の動きだけを見たいとき用） */
function emptyStage(): StageData {
  const s = STAGES[0];
  return { ...s, trees: { ...s.trees, count: 0 } };
}

/** 主人公をおうちの真上の遠くに置き、敵に手を出さないようにした世界 */
function quietWorld(): World {
  const w = new World(emptyStage());
  w.timer = 9999;
  w.player.x = w.house.x;
  w.player.y = w.house.y - 280;
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) w.step(DT);
}

describe('ダメージ', () => {
  it('よろいの敵は、大ほう以外のダメージが減る', () => {
    const w = quietWorld();
    const a = w.addEnemy('knight', w.house.x + 600, w.house.y, 1);
    const b = w.addEnemy('knight', w.house.x - 600, w.house.y, 1);
    w.hurt(a, 2, a.x, a.y, 'arrow');
    w.hurt(b, 2, b.x, b.y, 'cannon');
    expect(a.maxHp - a.hp).toBeCloseTo(2 * ed.common.armorReduction);
    expect(b.maxHp - b.hp).toBeCloseTo(2);
  });

  it('倒した敵は木材を落とし、経験値が入る。分かれるスライムは2体に分かれる', () => {
    const w = quietWorld();
    const e = w.addEnemy('splitter', w.house.x + 600, w.house.y, 1);
    w.hurt(e, 999, e.x, e.y, 'player');
    expect(e.dead).toBe(true);
    expect(w.drops.length).toBe(ed.kinds.splitter.drop);
    expect(w.enemies.filter((x) => !x.dead && x.kind === 'mini').length).toBe(ed.common.splitCount);
    expect(w.xp).toBe(ed.kinds.splitter.xp);
  });

  it('大ほうの爆発は、まとまった地上の敵に当たり、空の敵には当たらない', () => {
    const w = quietWorld();
    const x = w.house.x + 600;
    const y = w.house.y;
    const g1 = w.addEnemy('slime', x, y, 1);
    const g2 = w.addEnemy('slime', x + 20, y, 1);
    const bat = w.addEnemy('bat', x, y + 10, 1);
    w.explode(x, y, 50, 1);
    expect(g1.hp).toBeLessThan(g1.maxHp);
    expect(g2.hp).toBeLessThan(g2.maxHp);
    expect(bat.hp).toBe(bat.maxHp);
  });
});

describe('かべ', () => {
  it('地上の敵はかべの前で止まって、かべを攻撃する', () => {
    const w = quietWorld();
    const right = w.walls.find((s) => Math.abs(s.angle - (Math.PI * 2 * 0.5) / wall.sectors) < 1e-6)!;
    for (const s of w.walls) {
      s.level = 1;
      s.maxHp = s.hp = 999;
    }
    const e = w.addEnemy('slime', w.house.x + 400, w.house.y + 30, 1);
    run(w, 15);
    const d = Math.hypot(e.x - w.house.x, e.y - w.house.y);
    expect(d).toBeGreaterThan(wall.radius);
    expect(right.hp).toBeLessThan(999);
    expect(w.house.hp).toBe(w.house.maxHp);
  });

  it('かべが壊れると、敵はおうちまで来る', () => {
    const w = quietWorld();
    for (const s of w.walls) {
      s.level = 1;
      s.maxHp = s.hp = 2;
    }
    w.addEnemy('goblin', w.house.x + 400, w.house.y + 30, 1);
    run(w, 25);
    expect(w.walls.some((s) => s.level === 0)).toBe(true);
    expect(w.house.hp).toBeLessThan(w.house.maxHp);
  });

  it('空の敵はかべを飛び越える', () => {
    const w = quietWorld();
    for (const s of w.walls) {
      s.level = 2;
      s.maxHp = s.hp = 999;
    }
    w.addEnemy('bat', w.house.x + 400, w.house.y + 30, 1);
    run(w, 15);
    expect(w.house.hp).toBeLessThan(w.house.maxHp);
    expect(w.walls.every((s) => s.hp === 999)).toBe(true);
  });
});

describe('とう', () => {
  it('建てると種類を選ぶまでゲームが止まり、選ぶと敵を撃つ', () => {
    const w = quietWorld();
    const t = w.spots.find((s) => s.type === 'tower' && !s.hidden)!;
    w.player.x = t.x;
    w.player.y = t.y;
    w.player.wood = 20;
    run(w, 3);
    expect(t.level).toBe(1);
    expect(w.choice?.type).toBe('tower');
    const time = w.time;
    run(w, 1);
    expect(w.time).toBe(time);
    w.chooseTower('arrow');
    expect(w.choice).toBeNull();
    const e = w.addEnemy('slime', t.x + 100, t.y, 1);
    w.player.x = w.house.x;
    w.player.y = w.house.y + 280;
    run(w, 3);
    expect(e.hp < e.maxHp || e.dead).toBe(true);
  });

  it('氷のとうの玉が当たった敵は遅くなる', () => {
    const w = quietWorld();
    const t = w.spots.find((s) => s.type === 'tower' && !s.hidden)!;
    t.level = 1;
    t.kind = 'ice';
    const e = w.addEnemy('goblin', t.x + 120, t.y, 50);
    run(w, 2);
    expect(e.slow).toBeGreaterThan(0);
  });

  it('大ほうのとうは空の敵を狙わない', () => {
    const w = quietWorld();
    const t = w.spots.find((s) => s.type === 'tower' && !s.hidden)!;
    t.level = 1;
    t.kind = 'cannon';
    const bat = w.addEnemy('bat', t.x + 100, t.y, 50);
    run(w, 2);
    expect(w.shots.length).toBe(0);
    expect(bat.hp).toBe(bat.maxHp);
  });
});

describe('ウェーブ', () => {
  const wd = STAGES[0].waves;

  it('敵の数は「基本＋ウェーブ×増え方」に難易度を掛けた数。大将は最後のウェーブだけ', () => {
    const diff = GAME_DATA.difficulty[2];
    const n = 3;
    const list = waveList({ ...wd, boss: 'boss' }, n, diff, new Random(1));
    expect(list.length).toBe(Math.max(wd.minCount, Math.round((wd.base + n * wd.grow) * diff.enemyCount)));
    const last = waveList({ ...wd, boss: 'boss' }, wd.count, diff, new Random(1));
    expect(last[last.length - 1]).toBe('boss');
  });

  it('準備の時間が終わると敵が来て、全部倒すと次の準備になり、かべが直る', () => {
    const w = new World(emptyStage());
    w.timer = 0.01;
    w.walls[0].level = 1;
    w.walls[0].maxHp = 12;
    w.walls[0].hp = 3;
    w.step(DT);
    expect(w.phase).toBe('fight');
    expect(w.wave).toBe(1);
    run(w, 5);
    for (const e of w.enemies) w.hurt(e, 999, e.x, e.y, 'player');
    w.toSpawn = [];
    w.step(DT);
    w.step(DT);
    expect(w.phase).toBe('prep');
    expect(w.walls[0].hp).toBe(12);
  });

  it('「すぐ よぶ」で残り時間に応じた経験値が入り、すぐ敵が来る', () => {
    const w = quietWorld();
    w.timer = 20;
    w.callNow();
    expect(w.xp).toBe(Math.ceil(20 / GAME_DATA.upgrades.xp.callNowSecondsPerXp));
    w.step(DT);
    expect(w.phase).toBe('fight');
  });

  it('おうちの HP が0になると負け、全部のウェーブを守ると勝ち', () => {
    const lose = quietWorld();
    lose.damageHouse(999);
    expect(lose.outcome).toBe('lost');

    const win = new World(emptyStage());
    win.wave = wd.count;
    win.phase = 'fight';
    win.step(DT);
    expect(win.outcome).toBe('won');
    expect(win.stars).toBe(3);
  });
});

describe('成長', () => {
  it('経験値がたまるとレベルが上がり、強化の3択が出る', () => {
    const w = quietWorld();
    const e = w.addEnemy('boss', w.house.x + 600, w.house.y, 1);
    w.hurt(e, 999, e.x, e.y, 'player');
    expect(w.level).toBeGreaterThan(1);
    expect(w.choice?.type).toBe('perk');
    if (w.choice?.type === 'perk') expect(w.choice.options.length).toBe(3);
  });

  it('おうちの HP が半分を切ると「おうちを直す」が選択肢に入る', () => {
    const w = quietWorld();
    w.house.hp = 5;
    const opts = pickPerks(GAME_DATA.upgrades.perks, {}, w.house, new Random(3));
    expect(opts.some((p) => p.stat === 'heal')).toBe(true);
  });

  it('がんじょうな かべは、建っているかべの HP も増やす', () => {
    const w = quietWorld();
    const s = w.walls[0];
    s.level = 1;
    s.maxHp = s.hp = 12;
    w.choices.push({ type: 'perk', options: [GAME_DATA.upgrades.perks.find((p) => p.id === 'whp')!] });
    w.choosePerk(0);
    expect(s.maxHp).toBeCloseTo(18);
  });

  it('領地を広げると歩ける範囲が広がり、新しいとうの場所が現れる', () => {
    const w = quietWorld();
    const land = w.spots.find((s) => s.type === 'land')!;
    const hidden = w.spots.filter((s) => s.type === 'tower' && s.hidden).length;
    w.player.x = land.x;
    w.player.y = land.y;
    w.player.wood = w.capacity;
    run(w, 3);
    expect(w.territoryLevel).toBe(1);
    expect(w.spots.filter((s) => s.type === 'tower' && s.hidden).length).toBe(hidden - 2);
    expect(land.y).toBe(w.house.y + 400);
  });

  it('倒した敵の木材は、近くにいると拾える', () => {
    const w = quietWorld();
    const e = w.addEnemy('goblin', w.player.x + 30, w.player.y, 1);
    w.hurt(e, 999, e.x, e.y, 'arrow');
    run(w, 2);
    expect(w.player.wood).toBe(ed.kinds.goblin.drop);
  });
});
