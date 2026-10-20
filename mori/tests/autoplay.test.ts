import { describe, expect, it } from 'vitest';
import { ENDLESS_STAGE, PRACTICE_STAGE, STAGES, STORIES } from '../src/data/gameData';
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

describe('全ステージの自動プレイ（家の強化と仲間なし）', () => {
  it.each(STAGES.map((s, i) => [i + 1, s] as const))('ステージ%i：ふつうで最後まで守りきれる', (_n, stage) => {
    const mid = STORIES[stage.id].mid;
    const w = new World(stage, {
      seed: 1,
      difficulty: 1,
      towers: stage.towers,
      extra: mid?.extra ? { wave: mid.wave, kinds: mid.extra } : undefined,
    });
    const s = runBot(w, 1200);
    expect(s.broken).toBeNull();
    expect(s.overCapacity).toBe(false);
    expect(w.outcome).toBe('won');
  });

  it('むげんモード：エラーなく進み、いつかは終わる', () => {
    const w = new World(ENDLESS_STAGE, { seed: 1, difficulty: 1, towers: ENDLESS_STAGE.towers });
    const s = runBot(w, 3600);
    expect(s.broken).toBeNull();
    expect(w.outcome).toBe('lost');
    expect(w.wave).toBeGreaterThanOrEqual(10);
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
