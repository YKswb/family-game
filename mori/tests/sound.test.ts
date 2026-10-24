import { describe, expect, it } from 'vitest';
import soundsJson from '../src/data/sounds.json';
import { SoundGate } from '../src/ui/Sound';

const TYPES = ['sine', 'triangle', 'square', 'sawtooth', 'noise'];

describe('効果音', () => {
  it('音のデータが鳴らせる値になっている', () => {
    for (const [name, def] of Object.entries(soundsJson.sounds)) {
      expect(def.tones.length, name).toBeGreaterThan(0);
      for (const t of def.tones as { f: number; d: number; type?: string; v?: number; f2?: number; at?: number }[]) {
        // 高さを指数で変えるので、0 以下は使えない
        expect(t.f, name).toBeGreaterThan(0);
        if (t.f2 !== undefined) expect(t.f2, name).toBeGreaterThan(0);
        expect(t.d, name).toBeGreaterThan(0);
        expect(t.d, name).toBeLessThanOrEqual(1);
        expect(TYPES, name).toContain(t.type ?? 'square');
        // 大きすぎる音で耳を痛めないように
        expect(t.v ?? 0.05, name).toBeLessThanOrEqual(0.12);
        expect(t.at ?? 0, name).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('同じ音は gap より短い間には続けて鳴らない', () => {
    const g = new SoundGate();
    expect(g.allow('hit', 50, 1000)).toBe(true);
    expect(g.allow('hit', 50, 1030)).toBe(false);
    expect(g.allow('chop', 50, 1030)).toBe(true);
    expect(g.allow('hit', 50, 1050)).toBe(true);
  });
});
