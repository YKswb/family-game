import { COMPANION_KINDS, TOWER_KINDS, type CompanionKind, type TowerKind } from '../data/gameData';

/** localStorage のキー（ルートの CLAUDE.md の決まりで mori3_ で始める。今の版の mori3_prog とは別） */
export const SAVE_KEY = 'mori3_save';
const VERSION = 1;

/** ステージごとの記録 */
export interface StageRecord {
  /** いちばん良かった★（0〜3） */
  stars: number;
  /** むずかしいでクリアした */
  crown: boolean;
  /** クリアした回数 */
  clears: number;
}

export interface SaveData {
  v: number;
  /** 使えるなつこの愛 */
  love: number;
  /** まもりびとの家の強化のレベル（強化の id ごと） */
  levels: Record<string, number>;
  /** 解放したとう */
  unlocked: TowerKind[];
  /** ステージで見たことのあるとう（見たとうだけ解放できる） */
  seen: TowerKind[];
  stages: Record<string, StageRecord>;
  /** 最後に選んだ難易度 */
  difficulty: number;
  /** 仲間になった動物（物語の中で1人ずつ加わる） */
  friends: CompanionKind[];
  /** 連れていく仲間 */
  friend: CompanionKind | null;
  /** むげんモードの最高ウェーブ */
  endlessBest: number;
}

export function newSave(): SaveData {
  return {
    v: VERSION,
    love: 0,
    levels: {},
    unlocked: [],
    seen: [],
    stages: {},
    difficulty: 1,
    // はじめは仲間がいない。物語の中で1人ずつ加わる
    friends: [],
    friend: null,
    endlessBest: 0,
  };
}

const friendList = (x: unknown): CompanionKind[] =>
  Array.isArray(x) ? (x.filter((k) => COMPANION_KINDS.includes(k as CompanionKind)) as CompanionKind[]).filter((k, i, a) => a.indexOf(k) === i) : [];

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const towerList = (x: unknown): TowerKind[] =>
  Array.isArray(x) ? (x.filter((k) => TOWER_KINDS.includes(k as TowerKind)) as TowerKind[]).filter((k, i, a) => a.indexOf(k) === i) : [];

/**
 * 保存された文字列を読む。壊れていたり、知らない形だったりしたら、読める所だけ拾い、
 * 読めない所は新しいセーブの値にする（子どもの進み具合をできるだけ消さないため）
 */
export function parseSave(raw: string | null): SaveData {
  const s = newSave();
  if (!raw) return s;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return s;
  }
  if (!v || typeof v !== 'object') return s;
  const o = v as Record<string, unknown>;
  if (isNum(o.love) && o.love >= 0) s.love = Math.floor(o.love);
  if (o.levels && typeof o.levels === 'object') {
    for (const [k, lv] of Object.entries(o.levels as Record<string, unknown>)) if (isNum(lv) && lv > 0) s.levels[k] = Math.floor(lv);
  }
  s.unlocked = towerList(o.unlocked);
  s.seen = towerList(o.seen);
  if (o.stages && typeof o.stages === 'object') {
    for (const [id, r] of Object.entries(o.stages as Record<string, unknown>)) {
      if (!r || typeof r !== 'object') continue;
      const rec = r as Record<string, unknown>;
      s.stages[id] = {
        stars: isNum(rec.stars) ? Math.max(0, Math.min(3, Math.floor(rec.stars))) : 0,
        crown: rec.crown === true,
        clears: isNum(rec.clears) ? Math.max(0, Math.floor(rec.clears)) : 0,
      };
    }
  }
  if (isNum(o.difficulty) && [0, 1, 2].includes(o.difficulty)) s.difficulty = o.difficulty;
  // 仲間がいなかったころのセーブには friends がないので、そのときは新しいセーブと同じく仲間なしで始める
  if (Array.isArray(o.friends)) s.friends = friendList(o.friends);
  if (COMPANION_KINDS.includes(o.friend as CompanionKind) && s.friends.includes(o.friend as CompanionKind)) s.friend = o.friend as CompanionKind;
  else if (o.friend !== null) s.friend = s.friends[0] ?? null;
  if (isNum(o.endlessBest) && o.endlessBest >= 0) s.endlessBest = Math.floor(o.endlessBest);
  return s;
}

/** 保存先。テストではメモリの入れ物を渡す */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage が使えないとき（プライベートブラウズなど）は、その場だけのメモリに置く */
function defaultStore(): KeyValueStore {
  try {
    const ls = window.localStorage;
    const probe = `${SAVE_KEY}_probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
}

/** セーブの読み書き（1枠）。書くたびにすぐ保存する */
export class SaveStore {
  private readonly store: KeyValueStore;

  constructor(store?: KeyValueStore) {
    this.store = store ?? defaultStore();
  }

  load(): SaveData {
    try {
      return parseSave(this.store.getItem(SAVE_KEY));
    } catch {
      return newSave();
    }
  }

  /** セーブがあるか（タイトルの「はじめから」を出すかどうか） */
  exists(): boolean {
    try {
      return this.store.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  save(s: SaveData): void {
    try {
      this.store.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {
      // 容量いっぱいなどで保存できなくても、遊びは止めない
    }
  }

  clear(): void {
    try {
      this.store.removeItem(SAVE_KEY);
    } catch {
      // 消せなくても遊びは止めない
    }
  }
}
