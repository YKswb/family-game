import { describe, expect, it } from 'vitest';
import { COMPANION_KINDS, GAME_DATA, STAGES, type CompanionKind, type StageData } from '../src/data/gameData';
import { homeBonus } from '../src/systems/Home';
import { newSave, parseSave } from '../src/systems/Save';
import { World } from '../src/systems/World';
import { runBot } from './bot';

const DT = 1 / 60;
const cd = GAME_DATA.companions;

/** 木のないステージ1で、敵が来ないようにした世界 */
function quietWorld(kind: CompanionKind, trees = 0): World {
  const s: StageData = { ...STAGES[0], trees: { ...STAGES[0].trees, count: trees } };
  const w = new World(s, { companion: kind });
  w.timer = 9999;
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) w.step(DT);
}

describe('ついてきて', () => {
  it.each(COMPANION_KINDS)('%s：あらたが領地の中を走り回っても、離れすぎずに付いてくる', (kind) => {
    const w = quietWorld(kind, 260);
    const h = w.house;
    const corners = [
      [h.x - 230, h.y - 200],
      [h.x + 230, h.y - 200],
      [h.x + 230, h.y + 200],
      [h.x - 230, h.y + 200],
    ];
    let ci = 0;
    let maxGap = 0;
    let warps = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const p = w.player;
      const [tx, ty] = corners[ci];
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d < 30) ci = (ci + 1) % corners.length;
      w.input = { x: (tx - p.x) / (d || 1), y: (ty - p.y) / (d || 1) };
      w.step(DT);
      warps += w.events.filter((e) => e.type === 'friendWarp').length;
      const c = w.companion!;
      maxGap = Math.max(maxGap, Math.hypot(c.x - p.x, c.y - p.y));
    }
    expect(maxGap).toBeLessThan(cd.warpDistance + 1);
    // 木の多い森でも、引っかかって一気に戻ることはほとんどない
    expect(warps).toBeLessThanOrEqual(2);
  });

  it('あらたが止まると、後ろのそばで止まる', () => {
    const w = quietWorld('momo');
    run(w, 3);
    const c = w.companion!;
    const p = w.player;
    expect(Math.hypot(c.x - (p.x - p.face * cd.followBehind), c.y - (p.y + cd.followSide))).toBeLessThan(15);
    expect(c.moving).toBe(false);
  });

  it('あらたの近くの敵を攻撃する', () => {
    const w = quietWorld('goro');
    const p = w.player;
    const e = w.addEnemy('goblin', p.x + 90, p.y, 50);
    e.frozen = 99;
    run(w, 3);
    expect(e.hp).toBeLessThan(e.maxHp);
  });
});

describe('おうちを守って', () => {
  it('命令を切り替えると、おうちの前へ行き、おうちに近づいた敵と戦う', () => {
    const w = quietWorld('momo');
    w.toggleCompanionMode();
    expect(w.companion!.mode).toBe('guard');
    w.player.x = w.house.x;
    w.player.y = w.house.y - 280;
    run(w, 4);
    const c = w.companion!;
    expect(Math.hypot(c.x - (w.house.x + cd.guardPost[0]), c.y - (w.house.y + cd.guardPost[1]))).toBeLessThan(15);
    const e = w.addEnemy('slime', w.house.x + 200, w.house.y + 120, 50);
    e.frozen = 99;
    run(w, 3);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('もう一度切り替えると、あらたのところへ戻る', () => {
    const w = quietWorld('momo');
    w.toggleCompanionMode();
    run(w, 2);
    w.toggleCompanionMode();
    expect(w.companion!.mode).toBe('follow');
    w.player.x = w.house.x - 200;
    w.player.y = w.house.y - 150;
    run(w, 4);
    const c = w.companion!;
    expect(Math.hypot(c.x - w.player.x, c.y - w.player.y)).toBeLessThan(80);
  });
});

describe('得意なこと', () => {
  it('もも（地上）は空の敵を狙わず、ほうすけ（空）は空の敵に当てられる', () => {
    for (const [kind, hits] of [
      ['momo', false],
      ['hosuke', true],
    ] as const) {
      const w = quietWorld(kind);
      const p = w.player;
      const bat = w.addEnemy('bat', p.x + 100, p.y - 20, 50);
      bat.frozen = 99;
      run(w, 3);
      expect(bat.hp < bat.maxHp).toBe(hits);
    }
  });

  it('ごろうは、まわりの敵もまとめて押し返す', () => {
    const w = quietWorld('goro');
    const p = w.player;
    const a = w.addEnemy('slime', p.x + 80, p.y, 50);
    const b = w.addEnemy('slime', p.x + 95, p.y + 25, 50);
    a.frozen = b.frozen = 99;
    run(w, 2);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('まもりびとの家の「仲間の 力」で、仲間の攻撃が強くなる', () => {
    const s = newSave();
    s.levels.friendPower = 2;
    const w = new World(STAGES[0], { companion: 'goro', home: homeBonus(s, GAME_DATA.home) });
    expect(w.companion!.damage).toBeCloseTo(cd.kinds.goro.damage * 1.3);
  });
});

describe('仲間のセーブ', () => {
  it('仲間のいなかったころのセーブでも、3人とも仲間で、ももを連れていく', () => {
    const s = parseSave(JSON.stringify({ love: 3 }));
    expect(s.friends).toEqual(COMPANION_KINDS);
    expect(s.friend).toBe('momo');
  });

  it('知らない仲間や、仲間になっていない仲間は選ばれない', () => {
    const s = parseSave(JSON.stringify({ friends: ['goro', 'dragon'], friend: 'hosuke' }));
    expect(s.friends).toEqual(['goro']);
    expect(s.friend).toBe('goro');
  });
});

describe('仲間を連れた自動プレイ', () => {
  it.each(COMPANION_KINDS)('%s を連れて、ステージ1を最後まで守りきれる', (kind) => {
    const w = new World(STAGES[0], { seed: 3, companion: kind });
    const s = runBot(w);
    expect(s.broken).toBeNull();
    expect(w.outcome).toBe('won');
  });
});
