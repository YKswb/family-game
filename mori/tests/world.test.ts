import { describe, expect, it } from 'vitest';
import { GAME_DATA, STAGES, type StageData } from '../src/data/gameData';
import { Tree } from '../src/entities/Tree';
import { Spot, paySpot } from '../src/systems/Build';
import { Random } from '../src/systems/Random';
import { placeTrees } from '../src/systems/Stage';
import { World } from '../src/systems/World';

const stage = STAGES[0];
const bd = GAME_DATA.buildings;

/** 木を1本だけ、主人公のすぐ横に置いたステージ */
function oneTreeStage(): StageData {
  return { ...stage, trees: { ...stage.trees, count: 0 } };
}

function worldWithTreeNextToPlayer(): World {
  const w = new World(oneTreeStage());
  const p = w.player;
  // 領地の中、主人公から 40 の場所に木を1本
  w.trees.push(new Tree(0, p.x + 40, p.y, 1, GAME_DATA.trees.hp, GAME_DATA.trees.hp));
  return w;
}

describe('木の配置', () => {
  it('同じ種なら同じ配置になる', () => {
    const a = placeTrees(stage, new Random(5));
    const b = placeTrees(stage, new Random(5));
    expect(a).toEqual(b);
  });

  it('おうちのまわりの空き地と、木どうしの間隔を守る', () => {
    const trees = placeTrees(stage, new Random(9));
    expect(trees.length).toBeGreaterThan(150);
    for (const t of trees) {
      expect(Math.hypot(t.x - stage.house.x, t.y - stage.house.y)).toBeGreaterThanOrEqual(stage.trees.minFromHouse);
    }
    for (let i = 0; i < trees.length; i++)
      for (let j = i + 1; j < trees.length; j++)
        expect(Math.hypot(trees[i].x - trees[j].x, trees[i].y - trees[j].y)).toBeGreaterThanOrEqual(stage.trees.spacing);
  });
});

describe('木を切る', () => {
  it('近くの木を自動で切り、3回で切り倒して木材が4本になる', () => {
    const w = worldWithTreeNextToPlayer();
    const t = w.trees[0];
    for (let i = 0; i < 60 * 3; i++) w.step(1 / 60);
    expect(t.alive).toBe(false);
    expect(w.player.wood).toBe(GAME_DATA.trees.hp * GAME_DATA.trees.woodPerChop + GAME_DATA.trees.woodOnFell);
  });

  it('持てる上限に達したら切らない', () => {
    const w = worldWithTreeNextToPlayer();
    w.player.wood = w.capacity;
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    expect(w.trees[0].hp).toBe(w.trees[0].maxHp);
    expect(w.player.wood).toBe(w.capacity);
  });

  it('切り倒した木は時間がたつと生え戻るが、主人公がそばにいる間は待つ', () => {
    const w = worldWithTreeNextToPlayer();
    const t = w.trees[0];
    for (let i = 0; i < 60 * 3; i++) w.step(1 / 60);
    expect(t.alive).toBe(false);
    w.player.wood = w.capacity; // もう切らないように
    for (let i = 0; i < 60 * (GAME_DATA.trees.regrowSeconds + 1); i++) w.step(1 / 60);
    expect(t.alive).toBe(false);
    w.player.x -= 100;
    w.step(1 / 60);
    expect(t.alive).toBe(true);
  });
});

describe('建設地点への支払い', () => {
  it('乗ってすぐは払わず、そのあと一定の間隔で1本ずつ払う', () => {
    const s = new Spot(0, 'bag', 0, 0, bd);
    expect(paySpot(s, true, 10, bd.payFirstDelay - 0.01, bd).paid).toBe(0);
    expect(paySpot(s, true, 10, 0.02, bd).paid).toBe(1);
    expect(paySpot(s, true, 10, bd.payInterval, bd).paid).toBe(1);
    expect(s.paid).toBe(2);
  });

  it('離れても払った分は残り、乗り直すとまた待ってから払う', () => {
    const s = new Spot(0, 'axe', 0, 0, bd);
    paySpot(s, true, 10, 1, bd);
    const before = s.paid;
    expect(before).toBeGreaterThan(0);
    paySpot(s, false, 10, 1, bd);
    expect(s.paid).toBe(before);
    expect(paySpot(s, true, 10, bd.payFirstDelay / 2, bd).paid).toBe(0);
  });

  it('必要な数を払うとレベルが上がり、最大レベルではもう払わない', () => {
    const s = new Spot(0, 'bag', 0, 0, bd);
    const costs = bd.kinds.bag.costs;
    let paid = 0;
    for (let i = 0; i < 2000 && !s.maxed; i++) paid += paySpot(s, true, 999, 0.05, bd).paid;
    expect(s.level).toBe(costs.length);
    expect(paid).toBe(costs.reduce((a, b) => a + b, 0));
    expect(paySpot(s, true, 999, 1, bd).paid).toBe(0);
  });
});

describe('建物の効果', () => {
  it('かばんのレベルで持てる数が増える', () => {
    const w = new World(oneTreeStage());
    const base = w.capacity;
    w.spots.find((s) => s.type === 'bag')!.level = 2;
    expect(w.capacity).toBe(base + 2 * (bd.kinds.bag.capacityPerLevel ?? 0));
  });

  it('おののレベルで切る間隔が短くなる', () => {
    const w = worldWithTreeNextToPlayer();
    w.step(1 / 60);
    const slow = w.player.chopT;
    const w2 = worldWithTreeNextToPlayer();
    w2.spots.find((s) => s.type === 'axe')!.level = 3;
    w2.step(1 / 60);
    expect(w2.player.chopT).toBeLessThan(slow);
  });
});

describe('歩ける範囲', () => {
  it('領地の外やおうちの中へは入れない', () => {
    const w = new World(oneTreeStage());
    w.input = { x: 0, y: 1 };
    for (let i = 0; i < 60 * 5; i++) w.step(1 / 60);
    const d = Math.hypot(w.player.x - w.house.x, w.player.y - w.house.y);
    expect(d).toBeLessThanOrEqual(w.territory - GAME_DATA.player.territoryMargin + 0.01);
    w.input = { x: 0, y: -1 };
    for (let i = 0; i < 60 * 5; i++) w.step(1 / 60);
    expect(Math.hypot(w.player.x - w.house.x, w.player.y - w.house.y)).toBeGreaterThanOrEqual(w.house.r);
  });
});
