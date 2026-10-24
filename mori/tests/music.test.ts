import { describe, expect, it } from 'vitest';
import { ENDLESS_STAGE, STAGES } from '../src/data/gameData';
import musicJson from '../src/data/music.json';
import { BAR, noteFreq, parseNotes } from '../src/ui/Music';

const DRUMS = ['k', 's', 'h'];
const WAVES = ['sine', 'triangle', 'square', 'sawtooth', 'drum'];

describe('BGM', () => {
  it('音の名前を高さにできる', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('A5')).toBeCloseTo(880);
    expect(noteFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteFreq('C#5')).toBeCloseTo(554.37, 1);
    expect(noteFreq('Bb2')).toBeCloseTo(116.54, 1);
    expect(noteFreq('k')).toBeNull();
  });

  it('音符の並びを読める', () => {
    const p = parseNotes('C5.2 -.2 E5.4 | k.1 h.7');
    expect(p.bars).toEqual([8, 8]);
    expect(p.total).toBe(16);
    expect(p.events.map((e) => [e.note, e.at, e.len])).toEqual([
      ['C5', 0, 2],
      ['E5', 4, 4],
      ['k', 8, 1],
      ['h', 9, 7],
    ]);
  });

  it('どの曲も、小節の長さがそろい、パートの長さが同じで、音が読める', () => {
    for (const [name, t] of Object.entries(musicJson.tracks)) {
      expect(t.bpm, name).toBeGreaterThan(40);
      let total: number | null = null;
      for (const part of t.parts) {
        expect(WAVES, name).toContain(part.wave);
        expect(part.v, name).toBeLessThanOrEqual(0.1);
        const p = parseNotes(part.notes);
        p.bars.forEach((b, i) => expect(b, `${name} ${part.wave} ${i + 1}小節め`).toBe(BAR));
        total ??= p.total;
        expect(p.total, name).toBe(total);
        for (const e of p.events) {
          if (part.wave === 'drum') expect(DRUMS, name).toContain(e.note);
          else expect(noteFreq(e.note), `${name} ${e.note}`).not.toBeNull();
        }
      }
    }
  });

  it('ステージの曲名が music.json にある', () => {
    for (const s of [...STAGES, ENDLESS_STAGE]) {
      const m = s.theme.music ?? 'forest';
      expect(Object.keys(musicJson.tracks), s.id).toContain(m);
    }
  });
});
