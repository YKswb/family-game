import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/data/stageData';
import { practiceConfig } from '../src/systems/Arena';
import { stageConfig } from '../src/systems/Stage';
import { World, type SquadSpec } from '../src/systems/World';

const DT = 1 / 60;

/** 何もない野原に、ジャンとジャンヌと、指定した部隊だけを置く */
function field(squads: SquadSpec[] = []): World {
  return new World({ width: 2000, height: 2000, hero: { x: 1000, y: 1000 }, heroDir: [1, 0], jeanne: { x: 960, y: 1000 }, squads, seed: 5 });
}

describe('ジャンヌ', () => {
  it('ステージ1には出て、練習場には出ない', () => {
    expect(new World(stageConfig(STAGES.stage1.stage, 1)).jeanne).not.toBeNull();
    expect(new World(practiceConfig(1)).jeanne).toBeNull();
  });

  it('ジャンの後ろを付いて歩く（向きを変えても、しばらくすると後ろに回る）', () => {
    const w = field();
    const j = w.jeanne!;
    for (const dir of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
      w.input = dir;
      for (let t = 0; t < 3; t += DT) w.step(DT);
      expect(w.forwardOf(j)).toBeLessThan(0);
      expect(Math.hypot(j.x - w.hero.x, j.y - w.hero.y)).toBeLessThan(90);
    }
  });

  it('近くに来た敵を剣で斬って倒す（経験値は半分）', () => {
    const w = field([{ side: 'enemy', kind: 'sword', count: 1, x: 900, y: 1000, mode: 'hold', alert: true }]);
    const foe = w.squads[0].units[0];
    for (let t = 0; t < 10 && !foe.dead; t += DT) w.step(DT);
    expect(foe.dead).toBe(true);
    expect(w.xpGained).toBeGreaterThan(0);
  });

  it('まわりの味方の攻撃が2割上がる（離れると上がらない）', () => {
    const w = field([
      { side: 'ally', kind: 'sword', count: 1, x: 1000, y: 1100, mode: 'follow' },
      { side: 'enemy', kind: 'spear', count: 2, x: 1000, y: 1500, mode: 'hold' },
    ]);
    const ally = w.squads[0].units[0];
    const [a, b] = w.squads[1].units;
    const hp = a.hp;
    w.strike(ally, a);
    const near = hp - a.hp;
    w.jeanne!.x = 100;
    w.jeanne!.y = 100;
    w.strike(ally, b);
    const far = hp - b.hp;
    expect(near / far).toBeCloseTo(1 + w.jeanne!.stats.auraBonus!, 5);
  });

  it('HP が少なくなると一度だけ知らせ、戦わずに下がる', () => {
    const w = field([{ side: 'enemy', kind: 'sword', count: 1, x: 900, y: 1000, mode: 'hold', alert: true }]);
    const j = w.jeanne!;
    j.hp = j.maxHp * 0.3;
    w.step(DT);
    expect(w.events).toContainEqual({ type: 'jeanneDanger' });
    w.step(DT);
    expect(w.events).not.toContainEqual({ type: 'jeanneDanger' });
    expect(j.target).toBeNull();
  });

  it('HP が0になると負け（ジャンヌが倒れた）', () => {
    const w = field([{ side: 'enemy', kind: 'sword', count: 1, x: 1500, y: 1000, mode: 'hold' }]);
    const foe = w.squads[0].units[0];
    w.jeanne!.hp = 0.1;
    w.strike(foe, w.jeanne!);
    w.step(DT);
    expect(w.outcome).toBe('lost');
    expect(w.lostBy).toBe('jeanne');
  });

  it('しばらくダメージを受けなければ回復する', () => {
    const w = field();
    const j = w.jeanne!;
    j.hp = j.maxHp * 0.5;
    for (let t = 0; t < 8; t += DT) w.step(DT);
    expect(j.hp).toBeGreaterThan(j.maxHp * 0.5 + 5);
  });

  it('集合の笛のあいだは戦わない', () => {
    const w = field([{ side: 'enemy', kind: 'sword', count: 1, x: 930, y: 1000, mode: 'hold' }]);
    w.whistle();
    for (let t = 0; t < 1; t += DT) {
      w.step(DT);
      expect(w.jeanne!.target).toBeNull();
    }
  });
});
