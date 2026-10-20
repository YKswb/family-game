import { TOWER_KINDS, type CompanionKind, type HomeData, type StageData, type TowerKind } from '../data/gameData';
import type { SaveData } from './Save';

/** まもりびとの家の強化を合わせた、ステージに持っていく力 */
export interface HomeBonus {
  /** 歩く速さに足す（1 が基準） */
  speed: number;
  attack: number;
  capacity: number;
  /** 木を切る間隔に掛ける */
  chop: number;
  /** とうの攻撃に足す（1 が基準） */
  towerDamage: number;
  /** とうとかべの値段に掛ける */
  buildCost: number;
  houseHp: number;
  /** かべの HP に足す（1 が基準） */
  wallHp: number;
  startWood: number;
  /** 仲間の攻撃に足す（1 が基準） */
  friendDamage: number;
  /** 仲間の動く速さと攻撃の速さに足す（1 が基準） */
  friendSpeed: number;
}

export function noBonus(): HomeBonus {
  return { speed: 0, attack: 0, capacity: 0, chop: 1, towerDamage: 0, buildCost: 1, houseHp: 0, wallHp: 0, startWood: 0, friendDamage: 0, friendSpeed: 0 };
}

/** セーブの強化レベルから、ステージに持っていく力を出す */
export function homeBonus(s: SaveData, data: HomeData): HomeBonus {
  const b = noBonus();
  for (const u of data.upgrades) {
    const lv = Math.min(s.levels[u.id] ?? 0, u.costs.length);
    if (lv === 0) continue;
    if (u.mul !== undefined) b[u.stat] *= Math.pow(u.mul, lv);
    else b[u.stat] += (u.add ?? 0) * lv;
  }
  return b;
}

/** 次のレベルの値段（最大なら null） */
export function nextCost(s: SaveData, data: HomeData, id: string): number | null {
  const u = data.upgrades.find((x) => x.id === id);
  if (!u) return null;
  const lv = s.levels[id] ?? 0;
  return lv < u.costs.length ? u.costs[lv] : null;
}

/** 強化を1レベル上げる。なつこの愛が足りない・最大なら何もしないで false */
export function buyUpgrade(s: SaveData, data: HomeData, id: string): boolean {
  const cost = nextCost(s, data, id);
  if (cost === null || s.love < cost) return false;
  s.love -= cost;
  s.levels[id] = (s.levels[id] ?? 0) + 1;
  return true;
}

/** 強化を全部やめて、使ったなつこの愛を全部戻す（解放したとうはそのまま） */
export function refundAll(s: SaveData, data: HomeData): number {
  let back = 0;
  for (const u of data.upgrades) {
    const lv = Math.min(s.levels[u.id] ?? 0, u.costs.length);
    for (let i = 0; i < lv; i++) back += u.costs[i];
  }
  s.levels = {};
  s.love += back;
  return back;
}

/** 解放できるとう（ステージで見たことがあって、まだ解放していないもの） */
export function unlockable(s: SaveData, data: HomeData): { tower: TowerKind; cost: number }[] {
  return data.unlocks.filter((u) => s.seen.includes(u.tower) && !s.unlocked.includes(u.tower));
}

export function unlockTower(s: SaveData, data: HomeData, tower: TowerKind): boolean {
  const u = unlockable(s, data).find((x) => x.tower === tower);
  if (!u || s.love < u.cost) return false;
  s.love -= u.cost;
  s.unlocked.push(tower);
  return true;
}

/** ステージで使えるとう：そのステージのとうと、解放したとう（いつもの順に並べる） */
export function availableTowers(stage: StageData, s: SaveData): TowerKind[] {
  return TOWER_KINDS.filter((k) => stage.towers.includes(k) || s.unlocked.includes(k));
}

/** ステージを始めたときに、そのステージのとうを「見た」ことにする */
export function markSeen(s: SaveData, stage: StageData): void {
  for (const k of stage.towers) if (!s.seen.includes(k)) s.seen.push(k);
}

/** ステージを遊べるか：最初のステージはいつでも、ほかは1つ前のステージをクリアしていたら */
export function stageOpen(s: SaveData, stages: StageData[], index: number): boolean {
  if (index <= 0) return true;
  const prev = stages[index - 1];
  return !!prev && (s.stages[prev.id]?.clears ?? 0) > 0;
}

/** むげんモードを遊べるか（stages の unlockAfter 番目までクリアしていたら） */
export function endlessOpen(s: SaveData, stages: StageData[], unlockAfter: number): boolean {
  const st = stages[unlockAfter - 1];
  return !!st && (s.stages[st.id]?.clears ?? 0) > 0;
}

/** 物語で仲間が加わる。連れていく仲間がまだいなければ、その仲間を連れていく。新しく加わったら true */
export function joinFriend(s: SaveData, kind: CompanionKind): boolean {
  if (s.friends.includes(kind)) return false;
  s.friends.push(kind);
  if (!s.friend) s.friend = kind;
  return true;
}

/**
 * むげんモードが終わったとき：たどりついたウェーブに応じて、少しだけなつこの愛をもらう（難易度を掛ける）。
 * 最高記録も書き換える。記録を更新したら record が true
 */
export function endEndless(s: SaveData, data: HomeData, wave: number, difficulty: number): { love: number; record: boolean } {
  const cleared = Math.max(0, wave - 1);
  const love = Math.round(cleared * data.rewards.endlessPerWave * (data.rewards.difficultyMul[difficulty] ?? 1));
  const record = wave > s.endlessBest;
  if (record) s.endlessBest = wave;
  s.love += love;
  return { love, record };
}

export interface Reward {
  love: number;
  first: boolean;
  /** 新しく王冠をとった */
  crown: boolean;
}

/** クリアでもらえるなつこの愛の量（記録は変えない） */
export function rewardFor(data: HomeData, base: number, stars: number, difficulty: number, first: boolean, crown: boolean): number {
  const r = data.rewards;
  const full = base * (r.difficultyMul[difficulty] ?? 1) * (1 + r.perStar * stars);
  let love = first ? full : full * r.replayMul;
  if (crown) love += base * r.crownMul;
  return Math.max(1, Math.round(love));
}

/**
 * クリアしたときにもらえるなつこの愛。ステージのもとの量に、難易度と★を掛ける（はじめてのクリアは多め）。
 * 記録も書き換える
 */
export function clearStage(s: SaveData, data: HomeData, stage: Pick<StageData, 'id' | 'reward'>, stars: number, difficulty: number): Reward {
  const rec = s.stages[stage.id] ?? { stars: 0, crown: false, clears: 0 };
  const first = rec.clears === 0;
  const crown = difficulty === 2 && !rec.crown;
  const love = rewardFor(data, stage.reward, stars, difficulty, first, crown);
  s.stages[stage.id] = { stars: Math.max(rec.stars, stars), crown: rec.crown || difficulty === 2, clears: rec.clears + 1 };
  s.love += love;
  return { love, first, crown };
}
