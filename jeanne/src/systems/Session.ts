import { STAGES } from '../data/stageData';
import type { DifficultyKey } from './Progress';
import { clearSave, defaultStorage, loadSave, newSave, writeSave, type SaveData } from './Save';

/**
 * 遊んでいるあいだのセーブデータ。読み書きはここを通す（localStorage は1枠だけ）
 */
export const Session = {
  load(): SaveData | null {
    return loadSave(defaultStorage());
  },

  save(data: SaveData): void {
    writeSave(defaultStorage(), data);
  },

  /** 「はじめから」：今までの記録を消して、選んだ難易度で新しく始める */
  startNew(difficulty: DifficultyKey): SaveData {
    const s = defaultStorage();
    clearSave(s);
    const d = newSave(difficulty);
    writeSave(s, d);
    return d;
  },

  /** 読めなかったときは「ふつう」で新しく始める */
  loadOrNew(): SaveData {
    return this.load() ?? newSave('normal');
  },
};

/** ステージの並び（stage1, stage2, …） */
export const STAGE_ORDER = Object.keys(STAGES);

export function nextStageOf(id: string): string | null {
  const i = STAGE_ORDER.indexOf(id);
  return i >= 0 && i + 1 < STAGE_ORDER.length ? STAGE_ORDER[i + 1] : null;
}

/** 遊べるステージ：はじめのステージと、クリアしたステージの次まで */
export function isUnlocked(save: SaveData, id: string): boolean {
  const i = STAGE_ORDER.indexOf(id);
  return i === 0 || (i > 0 && !!save.cleared[STAGE_ORDER[i - 1]]);
}
