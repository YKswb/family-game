import { describe, expect, it } from 'vitest';
import { GAME_DATA, PRACTICE_STAGE, type StageData } from '../src/data/gameData';
import { Tree } from '../src/entities/Tree';
import { World } from '../src/systems/World';

const DT = 1 / 60;
const ed = GAME_DATA.enemies;
const wall = GAME_DATA.buildings.wall;

function quietWorld(trees = 0): World {
  const s: StageData = { ...PRACTICE_STAGE, trees: { ...PRACTICE_STAGE.trees, count: trees } };
  const w = new World(s);
  w.timer = 9999;
  w.player.x = w.house.x;
  w.player.y = w.house.y - 280;
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) w.step(DT);
}

describe('たて持ち', () => {
  it('正面（おうちの方）からの矢は防ぎ、横や後ろからの矢は防げない', () => {
    const w = quietWorld();
    const e = w.addEnemy('shield', w.house.x + 400, w.house.y, 1);
    w.hurt(e, 2, w.house.x, w.house.y, 'arrow');
    expect(e.maxHp - e.hp).toBeCloseTo(2 * (ed.kinds.shield.shield ?? 1));
    const f = w.addEnemy('shield', w.house.x + 400, w.house.y, 1);
    w.hurt(f, 2, f.x + 100, f.y, 'arrow');
    expect(f.maxHp - f.hp).toBeCloseTo(2);
  });

  it('主人公の斧と大ほうは防げない', () => {
    const w = quietWorld();
    const e = w.addEnemy('shield', w.house.x + 400, w.house.y, 1);
    w.hurt(e, 2, w.house.x, w.house.y, 'player');
    expect(e.maxHp - e.hp).toBeCloseTo(2);
  });
});

describe('もぐら', () => {
  it('かべの下をくぐっておうちまで来る。くぐっている間はとうの攻撃が当たらない', () => {
    const w = quietWorld();
    for (const s of w.walls) {
      s.level = 2;
      s.maxHp = s.hp = 999;
    }
    const t = w.spots.find((s) => s.type === 'tower' && !s.hidden)!;
    t.level = 1;
    t.kind = 'arrow';
    const e = w.addEnemy('mole', w.house.x + 400, w.house.y, 50);
    let wasUnder = false;
    for (let i = 0; i < 60 * 12; i++) {
      w.step(DT);
      const d = Math.hypot(e.x - w.house.x, e.y - w.house.y);
      if (Math.abs(d - wall.radius) < 10) {
        wasUnder ||= e.underground;
        expect(e.targetable).toBe(false);
      }
    }
    expect(wasUnder).toBe(true);
    expect(w.house.hp).toBeLessThan(w.house.maxHp);
    expect(w.walls.every((s) => s.hp === 999)).toBe(true);
  });
});

describe('木こりゴブリン', () => {
  it('森の木を切り倒して持っていき、持てるだけ持ったら逃げる', () => {
    const w = quietWorld();
    const h = w.house;
    // 主人公が切れる範囲（領地の縁＋20）の中の木
    w.trees.push(new Tree(0, h.x + 280, h.y + 110, 1, 3, 3), new Tree(1, h.x + 300, h.y + 60, 1, 3, 3));
    const e = w.addEnemy('lumberjack', h.x + 500, h.y + 150, 50);
    let stolen = 0;
    for (let i = 0; i < 60 * 25; i++) {
      w.step(DT);
      stolen += w.events.filter((ev) => ev.type === 'stolen').length;
    }
    // 切り倒した木はしばらくすると生え戻るので、切り倒した回数で確かめる
    expect(stolen).toBe(ed.kinds.lumberjack.lumber?.carry);
    expect(e.dead).toBe(true);
    expect(w.enemies.includes(e)).toBe(false);
    expect(w.house.hp).toBe(w.house.maxHp);
  });

  it('倒すと、持っていた木が木材になって落ちる', () => {
    const w = quietWorld();
    const e = w.addEnemy('lumberjack', w.house.x + 500, w.house.y, 1);
    e.carried = 1;
    w.hurt(e, 999, e.x, e.y, 'player');
    expect(w.drops.length).toBe(ed.kinds.lumberjack.drop + GAME_DATA.trees.hp + GAME_DATA.trees.woodOnFell);
  });
});

describe('いやしの魔法使い', () => {
  it('おうちから離れたところで止まり、まわりの傷ついた仲間を回復する', () => {
    const w = quietWorld();
    const healer = w.addEnemy('healer', w.house.x + 450, w.house.y, 50);
    const ally = w.addEnemy('knight', w.house.x + 470, w.house.y + 30, 50);
    ally.hp = ally.maxHp * 0.3;
    ally.frozen = 99;
    run(w, 12);
    expect(ally.hp).toBeGreaterThan(ally.maxHp * 0.3);
    const d = Math.hypot(healer.x - w.house.x, healer.y - w.house.y);
    expect(d).toBeGreaterThan((ed.kinds.healer.healer?.standoff ?? 0) - 5);
    expect(w.house.hp).toBe(w.house.maxHp);
  });
});
