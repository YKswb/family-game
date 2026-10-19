import type { SoldierKind } from '../data/unitData';
import { DIFFICULTY_KEYS, type DifficultyKey, type HeroProgress, newProgress, STAT_KEYS } from './Progress';

/** localStorage のキー。同じ github.io の他のゲームと分けるため jeanne_ で始める */
export const SAVE_KEY = 'jeanne_save';
const VERSION = 1;

/** 次のステージへ引き継ぐ部隊（兵種ごとの人数） */
export interface SavedSquad {
  kind: SoldierKind;
  composition: { kind: SoldierKind; n: number }[];
}

export interface SaveData {
  version: number;
  difficulty: DifficultyKey;
  /** クリアしたステージ：★と最速タイム */
  cleared: Record<string, { stars: number; bestSeconds: number }>;
  hero: HeroProgress;
  /** まだ振り分けていないフリーポイント */
  unspent: number;
  /** 率いている部隊（クリア時に全回復して引き継ぐ） */
  squads: SavedSquad[];
}

/** localStorage と同じ形（テストではメモリ上の代わりを渡す） */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function newSave(difficulty: DifficultyKey): SaveData {
  return { version: VERSION, difficulty, cleared: {}, hero: newProgress(), unspent: 0, squads: [] };
}

/** 保存が使えない（プライベートブラウズなど）ときは null を返し、ゲームは保存なしで続ける */
export function defaultStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    s.getItem(SAVE_KEY);
    return s;
  } catch {
    return null;
  }
}

export function loadSave(storage: StorageLike | null): SaveData | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSave(storage: StorageLike | null, data: SaveData): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // 容量いっぱいなどで保存できなくても、遊び続けられるようにする
  }
}

export function clearSave(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // 消せなくても遊べる
  }
}

/** 壊れた・古いデータでも遊べるよう、足りない所を既定の値で埋める */
function normalize(v: unknown): SaveData | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<SaveData>;
  const base = newSave(DIFFICULTY_KEYS.includes(o.difficulty as DifficultyKey) ? (o.difficulty as DifficultyKey) : 'normal');
  const hero = o.hero ?? base.hero;
  const alloc = { ...base.hero.alloc };
  for (const k of STAT_KEYS) {
    const n = Number(hero.alloc?.[k]);
    alloc[k] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return {
    version: VERSION,
    difficulty: base.difficulty,
    cleared: o.cleared && typeof o.cleared === 'object' ? o.cleared : {},
    hero: {
      level: Math.max(1, Math.floor(Number(hero.level) || 1)),
      xp: Math.max(0, Number(hero.xp) || 0),
      alloc,
    },
    unspent: Math.max(0, Math.floor(Number(o.unspent) || 0)),
    squads: Array.isArray(o.squads) ? o.squads : [],
  };
}
