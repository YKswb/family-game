import type { Companion } from '../entities/Companion';
import type { Enemy } from '../entities/Enemy';
import type { World } from './World';

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** 円 (cx, cy, r) の中に入った点を外へ押し出す */
function pushOut(o: { x: number; y: number }, cx: number, cy: number, r: number): void {
  const dx = o.x - cx;
  const dy = o.y - cy;
  const d = Math.hypot(dx, dy);
  if (d < r && d > 0.01) {
    o.x = cx + (dx / d) * r;
    o.y = cy + (dy / d) * r;
  }
}

/** 仲間が狙える敵か（地上の仲間は空の敵を狙わない） */
function canHit(c: Companion, e: Enemy): boolean {
  return e.targetable && (!e.fly || c.stats.air);
}

/** 攻撃が届くか（遠くから攻撃する仲間は射程、近くで攻撃する仲間は体の縁どうしの距離） */
function inReach(w: World, c: Companion, e: Enemy): boolean {
  const d = dist(c.x, c.y, e.x, e.y);
  return c.stats.ranged ? d <= c.stats.reach : d - e.r - w.data.companions.radius <= c.stats.reach;
}

/** 空を飛ぶ仲間が浮いている高さ */
export const FRIEND_LIFT = 26;

/**
 * 仲間を動かす。「ついてきて」ならあらたの後ろに付き、あらたの近くの敵と戦う。
 * 「おうちを守って」ならおうちの前に立ち、おうちに近づいた敵と戦う
 */
export function updateCompanion(w: World, dt: number): void {
  const c = w.companion;
  if (!c) return;
  const cd = w.data.companions;
  const p = w.player;
  const h = w.house;
  c.cd -= dt;
  c.swing = Math.max(0, c.swing - dt * 4);
  c.appear = Math.max(0, c.appear - dt);

  const follow = c.mode === 'follow';
  const ax = follow ? p.x - p.face * cd.followBehind : h.x + cd.guardPost[0];
  const ay = follow ? p.y + cd.followSide : h.y + cd.guardPost[1];

  // 木に引っかかるなどして離れすぎたら、あらたのそばへ一気に戻る
  if (follow && dist(c.x, c.y, p.x, p.y) > cd.warpDistance) {
    c.x = ax;
    c.y = ay;
    c.target = null;
    c.appear = 0.4;
    w.events.push({ type: 'friendWarp', companion: c });
  }

  // 戦う相手を選ぶ（守る中心から range の中の敵）
  const cx = follow ? p.x : h.x;
  const cy = follow ? p.y : h.y;
  const range = follow ? cd.engageRange : cd.guardRadius;
  const t = c.target;
  if (t && (!canHit(c, t) || dist(cx, cy, t.x, t.y) > range + 40)) c.target = null;
  if (follow && dist(c.x, c.y, p.x, p.y) > cd.leash) c.target = null;
  if (!c.target) {
    let best = Infinity;
    for (const e of w.enemies) {
      if (!canHit(c, e) || dist(cx, cy, e.x, e.y) > range) continue;
      const d = dist(c.x, c.y, e.x, e.y);
      if (d < best) {
        best = d;
        c.target = e;
      }
    }
  }

  // 動く
  const target = c.target;
  let tx = ax;
  let ty = ay;
  let stopAt = 6;
  if (target) {
    tx = target.x;
    ty = target.y;
    stopAt = c.stats.ranged ? c.stats.reach * 0.85 : target.r + cd.radius + c.stats.reach * 0.6;
  }
  const dx = tx - c.x;
  const dy = ty - c.y;
  const d = Math.hypot(dx, dy);
  c.moving = d > stopAt + 1;
  if (c.moving) {
    const step = Math.min(d - stopAt, c.speed * dt);
    c.x += (dx / d) * step;
    c.y += (dy / d) * step;
    c.step += dt * 12;
    if (Math.abs(dx) > 2) c.face = dx > 0 ? 1 : -1;
  }
  if (!c.fly) {
    pushOut(c, h.x, h.y, h.r + cd.radius);
    const tr = w.data.trees.radius;
    for (const tree of w.trees) if (tree.alive) pushOut(c, tree.x, tree.y, tr * tree.size * 0.8);
  }
  // 領地の外へは出ない（あらたと同じ）
  const lim = w.territory - w.data.player.territoryMargin;
  const hx = c.x - h.x;
  const hy = c.y - h.y;
  const hd = Math.hypot(hx, hy);
  if (hd > lim) {
    c.x = h.x + (hx / hd) * lim;
    c.y = h.y + (hy / hd) * lim;
  }

  // 攻撃する
  if (!target || c.cd > 0 || !inReach(w, c, target)) return;
  c.cd = c.interval;
  c.swing = 1;
  c.face = target.x >= c.x ? 1 : -1;
  w.events.push({ type: 'friendAttack', companion: c, x: target.x, y: target.y - target.r });
  if (c.stats.ranged) {
    const my = c.y - (c.fly ? FRIEND_LIFT : 0) - 14;
    w.shots.push({ type: 'bolt', kind: 'magic', x: c.x, y: my, vx: 0, vy: 0, target, dmg: c.damage, life: 1.5, slow: 0, slowArea: 0, freeze: null });
    return;
  }
  const splash = c.stats.splash ?? 0;
  if (splash > 0) {
    for (const e of w.enemies.slice()) {
      if (e === target || !canHit(c, e) || dist(e.x, e.y, target.x, target.y) > splash + e.r) continue;
      w.hurt(e, c.damage * 0.6, c.x, c.y, 'friend', c.stats.knockback * 0.7);
    }
  }
  w.hurt(target, c.damage, c.x, c.y, 'friend', c.stats.knockback);
}
