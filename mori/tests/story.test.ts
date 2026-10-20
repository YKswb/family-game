import { describe, expect, it } from 'vitest';
import { COMPANION_KINDS, GAME_DATA, SPEAKERS, STAGES, STORIES, type StoryLine } from '../src/data/gameData';

describe('物語', () => {
  it('8ステージすべてに会話がある', () => {
    for (const s of STAGES) expect(STORIES[s.id], s.id).toBeDefined();
  });

  it('話し手・行数・追加の敵・ウェーブ番号が正しい', () => {
    for (const s of STAGES) {
      const st = STORIES[s.id];
      const parts: StoryLine[][] = [st.start, st.clear, st.mid?.lines ?? [], st.boss ?? []];
      for (const lines of parts) {
        expect(lines.length, s.id).toBeLessThanOrEqual(3);
        for (const l of lines) {
          expect(SPEAKERS[l.who], `${s.id} ${l.who}`).toBeDefined();
          expect(l.text.length, l.text).toBeGreaterThan(0);
        }
      }
      if (st.mid) {
        expect(st.mid.wave).toBeGreaterThanOrEqual(1);
        expect(st.mid.wave).toBeLessThanOrEqual(s.waves.count);
        for (const k of st.mid.extra ?? []) expect(GAME_DATA.enemies.kinds[k], k).toBeDefined();
      }
      // ボスの会話はボスがいるステージだけ
      expect(!!st.boss, s.id).toBe(!!s.waves.boss);
    }
  });

  it('仲間は1人ずつ、ちがうステージで加わる', () => {
    const joins = STAGES.map((s) => STORIES[s.id].joins).filter((j) => j);
    expect([...joins].sort()).toEqual([...COMPANION_KINDS].sort());
  });

  it('おゆきちは毎ステージ出てくる', () => {
    for (const s of STAGES) {
      const st = STORIES[s.id];
      const all = [...st.start, ...st.clear, ...(st.mid?.lines ?? []), ...(st.boss ?? [])];
      expect(all.some((l) => l.who === 'oyukichi'), s.id).toBe(true);
    }
  });
});
