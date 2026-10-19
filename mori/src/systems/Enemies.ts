import type { Enemy } from '../entities/Enemy';
import type { Tree } from '../entities/Tree';
import { sectorOf, type Spot } from './Build';
import type { World } from './World';

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** (tx, ty) へ向かって進む。着いたら（このフレームで着いたときも）true */
function moveToward(e: Enemy, tx: number, ty: number, speed: number, dt: number, stopAt: number): boolean {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d <= stopAt) return true;
  const step = Math.min(d - stopAt, speed * dt);
  e.x += (dx / d) * step;
  e.y += (dy / d) * step;
  e.face = dx >= 0 ? 1 : -1;
  // ちょうど stopAt で止めると、小数の誤差で次も「まだ着いていない」になり続けるので、ここで着いたことにする
  return step >= d - stopAt;
}

/** 木こりが切りに行く木：自分に一番近い、おうちのまわり（領地＋search）の木 */
function findTree(w: World, e: Enemy, search: number): Tree | null {
  const h = w.house;
  const reach = w.territory + search;
  let best: Tree | null = null;
  let bd = Infinity;
  for (const t of w.trees) {
    if (!t.alive || dist(t.x, t.y, h.x, h.y) > reach) continue;
    const d = dist(t.x, t.y, e.x, e.y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/**
 * 木こり：おうちではなく森の木へ向かい、切り倒して持つ。carry 本持ったら森の外へ逃げる。
 * 動きを引き受けたら true（切る木がなければ false で、ふつうの敵と同じくおうちへ向かう）
 */
function updateLumberjack(w: World, e: Enemy, speed: number, dt: number): boolean {
  const L = e.stats.lumber;
  if (!L) return false;
  const h = w.house;
  const c = w.data.enemies.common;
  if (e.leaving) {
    const dx = e.x - h.x;
    const dy = e.y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * speed * dt;
    e.y += (dy / d) * speed * dt;
    e.face = dx >= 0 ? 1 : -1;
    const out = d > c.spawnDistance + 40 || e.x < 0 || e.y < 0 || e.x > w.width || e.y > w.height;
    if (out) {
      e.dead = true;
      w.events.push({ type: 'escape', enemy: e });
    }
    return true;
  }
  if (!e.tree || !e.tree.alive) e.tree = findTree(w, e, L.search);
  const t = e.tree;
  if (!t) return false;
  if (!moveToward(e, t.x, t.y, speed, dt, e.r + w.data.trees.radius * t.size * 0.8)) return true;
  e.face = t.x >= e.x ? 1 : -1;
  e.chopT -= dt;
  if (e.chopT > 0) return true;
  e.chopT = L.interval;
  t.hp--;
  t.shake = 0.25;
  w.events.push({ type: 'chop', tree: t });
  if (t.hp > 0) return true;
  t.alive = false;
  t.regrow = w.data.trees.regrowSeconds;
  e.carried++;
  e.tree = null;
  w.events.push({ type: 'fell', tree: t });
  w.events.push({ type: 'stolen', enemy: e, tree: t });
  if (e.carried >= L.carry) e.leaving = true;
  return true;
}

/** いやし：ときどき、まわりの傷ついた仲間の HP を回復する */
function updateHealer(w: World, e: Enemy, dt: number): void {
  const H = e.stats.healer;
  if (!H) return;
  e.healT -= dt;
  if (e.healT > 0) return;
  e.healT = H.interval;
  let healed = false;
  for (const o of w.enemies) {
    if (o.dead || o.hp >= o.maxHp || dist(o.x, o.y, e.x, e.y) > H.radius) continue;
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * H.amount);
    healed = true;
  }
  if (healed) w.events.push({ type: 'healPulse', enemy: e, radius: H.radius });
}

/**
 * 敵を動かす。おうちへまっすぐ向かい、かべの輪に着いたとき、その区画にかべがあればかべを攻撃し、
 * なければ通り抜けておうちを攻撃する。空の敵はかべを飛び越え、もぐらはかべの下をくぐる
 */
export function updateEnemies(w: World, dt: number): void {
  const c = w.data.enemies.common;
  const wall = w.data.buildings.wall;
  const h = w.house;
  const decay = Math.pow(c.knockbackDecay, dt);
  for (const e of w.enemies) {
    if (e.dead) continue;
    e.bob += dt * (e.fly ? 14 : 7);
    e.hitF = Math.max(0, e.hitF - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.x += e.kx * dt;
    e.y += e.ky * dt;
    e.kx *= decay;
    e.ky *= decay;
    const dx = h.x - e.x;
    const dy = h.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    if (e.stats.burrow) {
      const [inner, outer] = c.burrowBand;
      e.underground = d > wall.radius - inner && d < wall.radius + wall.thickness + outer;
    }
    if (e.frozen > 0) {
      e.frozen = Math.max(0, e.frozen - dt);
      continue;
    }
    const sp = e.speed * (e.slow > 0 ? c.slowFactor : 1);
    e.face = dx >= 0 ? 1 : -1;

    if (e.stats.summon) {
      e.summonT -= dt;
      if (e.summonT <= 0) {
        e.summonT = c.summonInterval;
        w.events.push({ type: 'summon', enemy: e });
        for (let i = 0; i < c.summonCount; i++) w.addEnemy(c.summonKind, e.x + w.rng.range(-50, 50), e.y + w.rng.range(-50, 50));
      }
    }
    updateHealer(w, e, dt);
    if (updateLumberjack(w, e, sp, dt)) continue;

    let blocking: Spot | null = null;
    if (!e.fly && !e.stats.burrow) {
      const outer = wall.radius + wall.thickness + e.r;
      if (d > wall.radius - 4 && d < outer + 1) {
        const ws = w.walls[sectorOf(Math.atan2(-dy, -dx), wall.sectors)];
        if (ws && ws.level > 0) {
          blocking = ws;
          e.x = h.x - (dx / d) * outer;
          e.y = h.y - (dy / d) * outer;
          e.kx = 0;
          e.ky = 0;
        }
      }
    }
    if (blocking) {
      e.atkT -= dt;
      if (e.atkT <= 0) {
        e.atkT = c.attackInterval;
        w.hitWall(blocking, e.stats.dmg);
      }
      continue;
    }
    // いやしの魔法使いは、おうちから離れたところで止まって仲間を回復し続ける
    const standoff = e.stats.healer?.standoff ?? 0;
    if (standoff > 0 && d <= standoff) continue;
    if (d > h.r + e.r - 4) {
      e.x += (dx / d) * sp * dt;
      e.y += (dy / d) * sp * dt;
    } else {
      e.atkT -= dt;
      if (e.atkT <= 0) {
        e.atkT = c.attackInterval;
        w.damageHouse(e.stats.dmg);
        if (w.outcome !== 'playing') return;
      }
    }
  }

  // 同じ高さ（地上どうし、空どうし）の敵は重ならないよう押し合う。もぐっているもぐらは押し合わない
  const es = w.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.dead || a.underground) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.dead || b.underground || a.fly !== b.fly) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dd = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (dd < min && dd > 0.01) {
        const k = (min - dd) / 2 / dd;
        a.x -= dx * k;
        a.y -= dy * k;
        b.x += dx * k;
        b.y += dy * k;
      }
    }
  }
}
