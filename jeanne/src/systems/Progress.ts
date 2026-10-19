import difficultyRaw from '../data/difficulty.json';
import growthRaw from '../data/growth.json';
import type { UnitStats } from '../data/unitData';

export type StatKey = 'attack' | 'defense' | 'vitality' | 'agility' | 'command' | 'morale';
export const STAT_KEYS: readonly StatKey[] = ['attack', 'defense', 'vitality', 'agility', 'command', 'morale'];
export type Allocation = Record<StatKey, number>;

export type DifficultyKey = 'easy' | 'normal' | 'hard';
export const DIFFICULTY_KEYS: readonly DifficultyKey[] = ['easy', 'normal', 'hard'];

export interface DifficultyData {
  name: string;
  note: string;
  /** 敵（大将を含む）のHPの倍率 */
  enemyHp: number;
  /** 敵の部隊の人数の倍率（四捨五入、最低1人） */
  enemyCount: number;
  /** たおれた仲間（待機部隊）が復活するか */
  revive: boolean;
  reviveSeconds: number;
}

export interface GrowthData {
  xp: { perKill: { soldier: number; captain: number; general: number }; squadKillRatio: number };
  level: {
    cap: number;
    base: number;
    exponent: number;
    perLevel: { hp: number; attack: number; speed: number };
    leadershipAt: number[];
  };
  points: Record<StatKey, { name: string; ruby: string; effect: string; per: number; max: number }>;
  stars: { timeSeconds: number; survivorRatio: number };
}

export const GROWTH = growthRaw as GrowthData;
export const DIFFICULTY = difficultyRaw as Record<DifficultyKey, DifficultyData>;

/** ジャンの成長（セーブされる） */
export interface HeroProgress {
  level: number;
  xp: number;
  alloc: Allocation;
}

export function emptyAllocation(): Allocation {
  return { attack: 0, defense: 0, vitality: 0, agility: 0, command: 0, morale: 0 };
}

export function newProgress(): HeroProgress {
  return { level: 1, xp: 0, alloc: emptyAllocation() };
}

/** レベル level から次のレベルに上がるのに必要な経験値（20 × Lv^1.5 を切り上げ） */
export function xpToNext(level: number, g: GrowthData = GROWTH): number {
  return Math.ceil(g.level.base * Math.pow(level, g.level.exponent));
}

/** 経験値を足してレベルを上げる。上限に達したら経験値は増やさない */
export function addXp(level: number, xp: number, gain: number, g: GrowthData = GROWTH): { level: number; xp: number; gained: number } {
  let lv = level;
  let x = xp + gain;
  let gained = 0;
  while (lv < g.level.cap && x >= xpToNext(lv, g)) {
    x -= xpToNext(lv, g);
    lv++;
    gained++;
  }
  if (lv >= g.level.cap) x = 0;
  return { level: lv, xp: x, gained };
}

/** その レベル で率いられる部隊の数 */
export function leadershipAt(level: number, base: UnitStats, g: GrowthData = GROWTH): number {
  const start = base.leadership ?? 3;
  const max = base.leadershipMax ?? 7;
  return Math.min(max, start + g.level.leadershipAt.filter((lv) => level >= lv).length);
}

export interface HeroStats {
  maxHp: number;
  attack: number;
  speed: number;
  leadership: number;
  /** 受けるダメージの倍率（守り） */
  damageTaken: number;
}

/** レベルと振り分けから、ジャンの能力を求める */
export function heroStats(base: UnitStats, p: HeroProgress, g: GrowthData = GROWTH): HeroStats {
  const up = p.level - 1;
  const pt = g.points;
  return {
    maxHp: base.hp + up * g.level.perLevel.hp + p.alloc.vitality * pt.vitality.per,
    attack: base.attack + up * g.level.perLevel.attack + p.alloc.attack * pt.attack.per,
    speed: base.speed + up * g.level.perLevel.speed + p.alloc.agility * pt.agility.per,
    leadership: leadershipAt(p.level, base, g),
    damageTaken: Math.max(0.2, 1 - p.alloc.defense * pt.defense.per),
  };
}

/** 統率・鼓舞による、率いている部隊の攻撃とHPの倍率 */
export function squadBonus(alloc: Allocation, g: GrowthData = GROWTH): { attackMul: number; hpMul: number } {
  return { attackMul: 1 + alloc.command * g.points.command.per, hpMul: 1 + alloc.morale * g.points.morale.per };
}

/**
 * ステージの評価（★1〜3）。クリアで★1、決まった時間内なら+1、
 * 率いている兵士が統率いっぱいの人数の一定割合以上残っていれば+1
 */
export function starsFor(seconds: number, survivors: number, leadership: number, g: GrowthData = GROWTH): number {
  let s = 1;
  if (seconds <= g.stars.timeSeconds) s++;
  if (survivors >= leadership * 10 * g.stars.survivorRatio) s++;
  return s;
}

/**
 * クリアでもらえるフリーポイント。はじめてのクリアは「クリア時のレベル＋★」、
 * もう一度クリアしたときは、前より増えた★の分だけ
 */
export function freePointsFor(level: number, stars: number, prevStars: number | null): number {
  if (prevStars === null) return level + stars;
  return Math.max(0, stars - prevStars);
}
