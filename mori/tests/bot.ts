import type { Tree } from '../src/entities/Tree';
import type { Spot } from '../src/systems/Build';
import type { World } from '../src/systems/World';

export interface PlayStats {
  seconds: number;
  /** NaN や場外、木やおうちへのめり込みが起きたか */
  broken: string | null;
  /** 切った回数 */
  chops: number;
  /** 持てる上限を超えた瞬間があったか */
  overCapacity: boolean;
}

/** 次に建てる地点。安い順に、まだ最大でないもの */
function nextSpot(w: World): Spot | null {
  const open = w.spots.filter((s) => !s.maxed);
  open.sort((a, b) => a.remaining - b.remaining);
  return open[0] ?? null;
}

/** 主人公から一番近い、切れる木 */
function nearestTree(w: World): Tree | null {
  const p = w.player;
  const reach = w.territory + w.data.trees.choppableMargin;
  let best: Tree | null = null;
  let bd = Infinity;
  for (const t of w.trees) {
    if (!t.alive || Math.hypot(t.x - w.house.x, t.y - w.house.y) > reach) continue;
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/**
 * ヘッドレス自動プレイのボット。木材を集めて、次に建てる地点に必要な分（または持てるだけ）
 * たまったら建設地点へ運ぶ。全部の建物が最大になるか、時間切れで止まる
 */
export function runBot(w: World, maxSeconds = 300, dt = 1 / 60): PlayStats {
  let broken: string | null = null;
  let chops = 0;
  let overCapacity = false;
  let delivering = false;

  while (w.time < maxSeconds) {
    const spot = nextSpot(w);
    if (!spot) break;
    const p = w.player;
    const need = Math.min(spot.remaining, w.capacity);
    if (p.wood >= need) delivering = true;
    if (p.wood === 0) delivering = false;

    let tx = p.x;
    let ty = p.y;
    let stopAt = 4;
    if (delivering) {
      tx = spot.x;
      ty = spot.y;
    } else {
      const t = nearestTree(w);
      if (t) {
        tx = t.x;
        ty = t.y;
        stopAt = w.data.player.chopRange * 0.6;
      }
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    w.input = d > stopAt ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };

    w.step(dt);
    for (const e of w.events) if (e.type === 'chop') chops++;

    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) broken ??= 'NaN: player';
    if (p.x < 0 || p.y < 0 || p.x > w.width || p.y > w.height) broken ??= '場外: player';
    if (Math.hypot(p.x - w.house.x, p.y - w.house.y) < w.house.r) broken ??= 'おうちにめり込んだ';
    if (p.wood > w.capacity) overCapacity = true;
  }
  return { seconds: w.time, broken, chops, overCapacity };
}
