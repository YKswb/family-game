import { describe, expect, it } from 'vitest';
import { SOLDIER_KINDS } from '../src/data/unitData';
import { arenaConfig } from '../src/systems/Arena';
import { World } from '../src/systems/World';
import { runBot } from './bot';

/** 隊列で付いてくる兵士が、ジャンからこれ以上離れたら「離れすぎ」とみなす */
const MAX_SPREAD = 400;

const PAIRS = SOLDIER_KINDS.flatMap((a) => SOLDIER_KINDS.map((e) => [a, e] as const));

describe('練習場の自動プレイ（ボットがジャンを動かす）', { timeout: 30000 }, () => {
  it.each(PAIRS)('味方 %s ／ 敵 %s を最後まで通せる', (ally, enemy) => {
    const w = new World(arenaConfig(ally, enemy, 7));
    const s = runBot(w, 120);
    expect(s.broken).toBeNull();
    expect(w.outcome).toBe('won');
    expect(s.seconds).toBeLessThan(60);
    expect(s.maxAllySpread).toBeLessThan(MAX_SPREAD);
  });
});

describe('隊列の追従', { timeout: 30000 }, () => {
  it.each(SOLDIER_KINDS)('ジャンが全力で走り回っても %s は離れすぎない', (kind) => {
    // 敵のいない場所で、ジャンを大きな四角形に沿って走らせる
    const w = new World({
      width: 3000,
      height: 3000,
      hero: { x: 500, y: 2500 },
      heroDir: [0, -1],
      squads: [{ side: 'ally', kind, count: 10, x: 500, y: 2500, mode: 'follow' }],
    });
    const corners = [
      [500, 500],
      [2500, 500],
      [2500, 2500],
      [500, 2500],
    ];
    let ci = 0;
    let maxSpread = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const [tx, ty] = corners[ci];
      const dx = tx - w.hero.x;
      const dy = ty - w.hero.y;
      const d = Math.hypot(dx, dy);
      if (d < 20) ci = (ci + 1) % corners.length;
      w.input = { x: dx / (d || 1), y: dy / (d || 1) };
      w.step(1 / 60);
      for (const u of w.squads[0].units) maxSpread = Math.max(maxSpread, Math.hypot(u.x - w.hero.x, u.y - w.hero.y));
    }
    expect(maxSpread).toBeLessThan(MAX_SPREAD);
  });
});
