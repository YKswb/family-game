import type { Difficulty, EnemyKind, WaveData } from '../data/gameData';
import type { Random } from './Random';

/** ウェーブ n（1から）に出る敵の並び。最後のウェーブには大将を最後に足す */
export function waveList(w: WaveData, n: number, diff: Difficulty, rng: Random): EnemyKind[] {
  const pool = w.pool.filter((p) => n >= p.from);
  const total = pool.reduce((a, p) => a + p.weight, 0);
  const count = Math.max(w.minCount, Math.round((w.base + n * w.grow) * diff.enemyCount));
  const list: EnemyKind[] = [];
  for (let i = 0; i < count; i++) {
    let r = rng.next() * total;
    let pick = pool[0].kind;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) {
        pick = p.kind;
        break;
      }
    }
    list.push(pick);
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (n === w.count && w.boss) list.push(w.boss);
  return list;
}

/** ウェーブ n で敵が来る方向の数 */
export function directionCount(w: WaveData, n: number): number {
  let c = 1;
  for (const d of w.directions) if (n >= d.from) c = Math.max(c, d.count);
  return c;
}

/** 敵が来る方向（角度）。等間隔に分けて、少しずらす */
export function waveDirections(w: WaveData, n: number, rng: Random): number[] {
  const count = directionCount(w, n);
  const a = rng.next() * Math.PI * 2;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(a + (i * Math.PI * 2) / count + rng.range(-0.3, 0.3));
  return out;
}

/** ウェーブ n の敵の HP 倍率 */
export function waveHpMul(w: WaveData, n: number, diff: Difficulty): number {
  return diff.enemyHp * (1 + w.hpGrowth * (n - 1) + w.stageHpBonus);
}

/** ウェーブ n で、敵が1体ずつ出てくる間隔 */
export function spawnInterval(w: WaveData, n: number): number {
  const s = w.spawnInterval;
  return Math.max(s.min, s.start - s.perWave * n - s.stageBonus);
}
