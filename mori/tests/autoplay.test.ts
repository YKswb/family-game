import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/data/gameData';
import { World } from '../src/systems/World';
import { runBot } from './bot';

describe('ステージ1の自動プレイ（ボットが主人公を動かす）', () => {
  it.each([1, 2, 3, 42, 777])('種 %i：木を集めて、おのとかばんを最大まで建てられる', (seed) => {
    const w = new World(STAGES[0], { seed });
    const s = runBot(w, 300);
    expect(s.broken).toBeNull();
    expect(s.overCapacity).toBe(false);
    expect(w.spots.every((sp) => sp.maxed)).toBe(true);
    expect(w.tutorial).toBe('done');
    // 合計109本の木材。今の版と同じくらいの手間で建てきれること
    expect(s.seconds).toBeLessThan(240);
  });
});
