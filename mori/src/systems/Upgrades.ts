import type { Perk, UpgradeData } from '../data/gameData';
import type { House } from '../entities/House';
import type { Spot } from './Build';
import type { Random } from './Random';

/** 戦闘中のレベルアップで選んだ強化の合計。ステージが終わると元に戻る */
export interface Modifiers {
  /** 主人公の攻撃に足す */
  attack: number;
  /** 木を切る間隔に掛ける */
  chop: number;
  /** 歩く速さに掛ける */
  speed: number;
  /** 持てる木材に足す */
  capacity: number;
  /** 吸い寄せる距離に掛ける */
  magnet: number;
  /** とうの攻撃に掛ける */
  towerDamage: number;
  /** かべの HP に掛ける */
  wallHp: number;
  /** かいてん ぎり */
  area: boolean;
  /** 木材が2倍になる確率 */
  lucky: number;
}

export function baseModifiers(): Modifiers {
  return { attack: 0, chop: 1, speed: 1, capacity: 0, magnet: 1, towerDamage: 1, wallHp: 1, area: false, lucky: 0 };
}

/** レベル lv から次のレベルまでに必要な経験値 */
export function xpNeed(lv: number, data: UpgradeData): number {
  return data.xp.base + lv * data.xp.perLevel;
}

/**
 * 3つの選択肢を選ぶ。「おうちを直す」は、選択肢が足りないときか、おうちの HP が半分を切ったときだけ出す
 */
export function pickPerks(perks: Perk[], taken: Record<string, number>, house: House, rng: Random): Perk[] {
  const heal = perks.find((p) => p.stat === 'heal');
  const avail = perks.filter((p) => p.stat !== 'heal' && (taken[p.id] ?? 0) < p.max);
  for (let i = avail.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [avail[i], avail[j]] = [avail[j], avail[i]];
  }
  const out = avail.slice(0, 3);
  if (heal && (out.length < 3 || house.hp < house.maxHp * 0.5)) out[Math.min(out.length, 2)] = heal;
  return out.slice(0, 3);
}

/** 強化を1つ反映する。かべの強化は、もう建っているかべにも効かせる */
export function applyPerk(p: Perk, m: Modifiers, house: House, walls: Spot[]): void {
  const add = p.add ?? 0;
  switch (p.stat) {
    case 'attack':
      m.attack += add;
      break;
    case 'chop':
      m.chop *= p.mul ?? 1;
      break;
    case 'speed':
      m.speed += add;
      break;
    case 'capacity':
      m.capacity += add;
      break;
    case 'magnet':
      m.magnet += add;
      break;
    case 'towerDamage':
      m.towerDamage += add;
      break;
    case 'wallHp': {
      const ratio = (m.wallHp + add) / m.wallHp;
      m.wallHp += add;
      for (const w of walls) {
        if (w.level === 0) continue;
        w.maxHp *= ratio;
        w.hp *= ratio;
      }
      break;
    }
    case 'heal':
      house.maxHp += p.maxAdd ?? 0;
      house.hp = Math.min(house.maxHp, house.hp + add);
      break;
    case 'area':
      m.area = true;
      break;
    case 'lucky':
      m.lucky += add;
      break;
  }
}
