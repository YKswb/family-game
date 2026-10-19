import type { TowerKind } from '../src/data/gameData';
import type { Enemy } from '../src/entities/Enemy';
import type { Tree } from '../src/entities/Tree';
import type { Spot } from '../src/systems/Build';
import type { World } from '../src/systems/World';

export interface PlayStats {
  seconds: number;
  /** NaN や場外、おうちへのめり込みが起きたか */
  broken: string | null;
  /** 持てる上限を超えた瞬間があったか */
  overCapacity: boolean;
  /** 答えた選択の数 */
  choices: number;
}

/** 建てる順番の重み（小さいほど先に建てる） */
const PRIORITY: Record<Spot['type'], number> = { tower: 1, bag: 1.3, land: 1.6, axe: 1.8, wall: 2.2 };
const TOWER_ORDER: TowerKind[] = ['arrow', 'cannon', 'lightning', 'arrow', 'ice', 'heal', 'cannon', 'arrow', 'lightning', 'ice', 'arrow'];
const PERK_ORDER = ['tdmg', 'area', 'pdmg', 'chop', 'bag', 'heal', 'whp', 'dbl', 'speed', 'magnet'];

/** 次に建てる地点。安くて大事なものから */
function nextSpot(w: World): Spot | null {
  let best: Spot | null = null;
  let score = Infinity;
  for (const s of w.spots) {
    if (!s.payable) continue;
    const v = s.remaining * PRIORITY[s.type];
    if (v < score) {
      score = v;
      best = s;
    }
  }
  return best;
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

/** 領地の中まで来ている敵のうち、おうちに一番近いもの */
function threat(w: World): Enemy | null {
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of w.enemies) {
    if (!e.targetable) continue;
    const d = Math.hypot(e.x - w.house.x, e.y - w.house.y);
    // 領地の縁のすぐ外（木こりが木を切る場所）までは、斧が届く
    if (d < w.territory + 60 && d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** 選択に答える（とうは決まった順、強化は好きな順） */
function answer(w: World, towers: { n: number }): void {
  const c = w.choice;
  if (!c) return;
  if (c.type === 'tower') {
    // このステージで建てられる種類だけを、決まった順に
    const order = TOWER_ORDER.filter((k) => w.stage.towers.includes(k));
    w.chooseTower(order[towers.n++ % order.length]);
    return;
  }
  if (c.type === 'branch') {
    w.chooseBranch(towers.n++ % 2);
    return;
  }
  let pick = 0;
  let rank = Infinity;
  c.options.forEach((p, i) => {
    const r = PERK_ORDER.indexOf(p.id);
    if (r >= 0 && r < rank) {
      rank = r;
      pick = i;
    }
  });
  w.choosePerk(pick);
}

/**
 * ヘッドレス自動プレイのボット。敵が領地に入ったら倒しに行き、いなければ木材を集めて、
 * 次に建てる地点に必要な分（または持てるだけ）たまったら運ぶ。勝ち負けが決まるか、時間切れで止まる
 */
export function runBot(w: World, maxSeconds = 600, dt = 1 / 60): PlayStats {
  let broken: string | null = null;
  let overCapacity = false;
  let delivering = false;
  let choices = 0;
  const towers = { n: 0 };

  while (w.outcome === 'playing' && w.time < maxSeconds) {
    if (w.choice) {
      answer(w, towers);
      choices++;
      continue;
    }
    const p = w.player;
    let tx = p.x;
    let ty = p.y;
    let stopAt = 4;
    const foe = threat(w);
    if (foe) {
      tx = foe.x;
      ty = foe.y;
      stopAt = foe.r + 10;
    } else {
      const spot = nextSpot(w);
      const need = spot ? Math.min(spot.remaining, w.capacity) : Infinity;
      if (p.wood >= need) delivering = true;
      if (p.wood === 0 || !spot) delivering = false;
      if (delivering && spot) {
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
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    w.input = d > stopAt ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };

    w.step(dt);

    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) broken ??= 'NaN: player';
    if (p.x < 0 || p.y < 0 || p.x > w.width || p.y > w.height) broken ??= '場外: player';
    if (Math.hypot(p.x - w.house.x, p.y - w.house.y) < w.house.r) broken ??= 'おうちにめり込んだ';
    if (p.wood > w.capacity) overCapacity = true;
    for (const e of w.enemies) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) broken ??= `NaN: enemy ${e.id}`;
    }
  }
  return { seconds: w.time, broken, overCapacity, choices };
}
