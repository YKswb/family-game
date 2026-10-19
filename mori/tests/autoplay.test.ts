import { describe, expect, it } from 'vitest';
import { PRACTICE_STAGE, STAGES } from '../src/data/gameData';
import { World } from '../src/systems/World';
import { runBot } from './bot';

const SEEDS = [1, 2, 3, 42, 777];

describe('ステージ1の自動プレイ（ボットが主人公を動かす）', () => {
  it.each(SEEDS)('ふつう・種 %i：最後のウェーブまで守りきれる', (seed) => {
    const w = new World(STAGES[0], { seed, difficulty: 1 });
    const s = runBot(w);
    expect(s.broken).toBeNull();
    expect(s.overCapacity).toBe(false);
    expect(w.outcome).toBe('won');
    expect(w.wave).toBe(STAGES[0].waves.count);
    expect(w.stars).toBeGreaterThanOrEqual(2);
    expect(s.choices).toBeGreaterThan(0);
  });

  it.each([0, 2])('難易度 %i でも最後まで通せる', (difficulty) => {
    const w = new World(STAGES[0], { seed: 5, difficulty });
    const s = runBot(w);
    expect(s.broken).toBeNull();
    expect(w.outcome).toBe('won');
  });
});

describe('練習の森の自動プレイ（新しいとうと敵）', () => {
  it.each([1, 2, 3])('ふつう・種 %i：エラーなく最後まで進み、守りきれる', (seed) => {
    const w = new World(PRACTICE_STAGE, { seed, difficulty: 1 });
    const s = runBot(w, 900);
    expect(s.broken).toBeNull();
    expect(s.overCapacity).toBe(false);
    expect(w.outcome).toBe('won');
  });
});
