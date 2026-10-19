import type { TowerBranch, TowerData, TowerKind } from '../data/gameData';
import type { Enemy } from '../entities/Enemy';
import type { Spot } from './Build';
import type { World } from './World';

/** 矢と氷の玉（敵を追いかける） */
export interface Bolt {
  type: 'bolt';
  kind: 'arrow' | 'ice';
  x: number;
  y: number;
  vx: number;
  vy: number;
  target: Enemy;
  dmg: number;
  life: number;
  /** 当たった敵を遅くする秒数 */
  slow: number;
  /** 当たったまわりも遅くする半径（0 なら当たった敵だけ） */
  slowArea: number;
  freeze: { chance: number; time: number } | null;
}

/** 大ほうの玉（狙った地面へ山なりに飛び、着いたところで爆発する） */
export interface Shell {
  type: 'shell';
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  dmg: number;
  radius: number;
  burn: { dps: number; time: number; radius: number } | null;
}

export type Shot = Bolt | Shell;

/** 分かれ道まで反映した、とうのいまの強さ */
export interface TowerPower {
  range: number;
  interval: number;
  damage: number;
  air: boolean;
  splash: number;
  slow: number;
  slowArea: number;
  freeze: { chance: number; time: number } | null;
  burn: { dps: number; time: number; radius: number } | null;
  chain: number;
  chainRange: number;
  chainFalloff: number;
  airMul: number;
  heal: number;
  houseHeal: number;
  wallGuard: number;
  support: boolean;
}

/** 選んだ分かれ道（まだなら null） */
export function branchOf(s: Spot, data: TowerData): TowerBranch | null {
  if (!s.kind || s.branch === null) return null;
  return data.kinds[s.kind].branches[s.branch] ?? null;
}

/** とうの種類・レベル・分かれ道から、いまの強さを出す */
export function towerPower(kind: TowerKind, level: number, branch: TowerBranch | null, data: TowerData): TowerPower {
  const t = data.kinds[kind];
  const i = Math.max(0, Math.min(level, t.range.length) - 1);
  const b = branch ?? ({} as Partial<TowerBranch>);
  return {
    range: t.range[i] + (b.rangeAdd ?? 0),
    interval: t.interval[i] * (b.intervalMul ?? 1),
    damage: t.damage[i] * (b.damageMul ?? 1),
    air: t.air,
    splash: (t.splash?.[i] ?? 0) + (b.splashAdd ?? 0),
    slow: t.slow?.[i] ?? 0,
    slowArea: b.slowArea ?? 0,
    freeze: b.freeze ?? null,
    burn: b.burn ?? null,
    chain: (t.chain?.[i] ?? 1) + (b.chainAdd ?? 0),
    chainRange: t.chainRange ?? 0,
    chainFalloff: t.chainFalloff ?? 1,
    airMul: b.airMul ?? 1,
    heal: (t.heal?.[i] ?? 0) * (b.healMul ?? 1),
    houseHeal: t.houseHeal ?? 0,
    wallGuard: b.wallGuard ?? 1,
    support: !!t.support,
  };
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** 射程内の一番近い敵。氷のとうは、まだ遅くなっていない敵を先に狙う */
function pickTarget(w: World, s: Spot, p: TowerPower): Enemy | null {
  let target: Enemy | null = null;
  let best = Infinity;
  for (const e of w.enemies) {
    if (!e.targetable || (e.fly && !p.air)) continue;
    const d = dist(s.x, s.y, e.x, e.y);
    if (d > p.range) continue;
    const score = d + (s.kind === 'ice' && e.slow > 0 ? w.data.towers.iceAvoidSlowed : 0);
    if (score < best) {
      best = score;
      target = e;
    }
  }
  return target;
}

/** かみなり：最初の敵から、近くのまだ当たっていない敵へ順に電気がとぶ */
function zap(w: World, s: Spot, first: Enemy, p: TowerPower, mx: number, my: number): void {
  const hit: Enemy[] = [];
  const points = [{ x: mx, y: my }];
  let cur: Enemy | null = first;
  let dmg = p.damage * w.mods.towerDamage;
  while (cur && hit.length < p.chain) {
    hit.push(cur);
    points.push({ x: cur.x, y: cur.y - cur.r - (cur.fly ? 24 : 0) });
    let next: Enemy | null = null;
    let best = p.chainRange;
    for (const e of w.enemies) {
      if (!e.targetable || hit.includes(e) || (e.fly && !p.air)) continue;
      const d = dist(cur.x, cur.y, e.x, e.y);
      if (d < best) {
        best = d;
        next = e;
      }
    }
    cur = next;
  }
  w.events.push({ type: 'zap', spot: s, points });
  for (const e of hit) {
    w.hurt(e, dmg * (e.fly ? p.airMul : 1), mx, my, 'lightning');
    dmg *= p.chainFalloff;
  }
}

/** ちゆ：範囲内の傷ついたかべと、おうちを少し直す */
function mend(w: World, s: Spot, p: TowerPower): boolean {
  let healed = false;
  for (const wall of w.walls) {
    if (wall.level === 0 || wall.hp >= wall.maxHp) continue;
    if (dist(s.x, s.y, wall.x, wall.y) > p.range) continue;
    wall.hp = Math.min(wall.maxHp, wall.hp + p.heal);
    healed = true;
    w.events.push({ type: 'mend', x: wall.x, y: wall.y });
  }
  const h = w.house;
  if (p.houseHeal > 0 && h.hp < h.maxHp && dist(s.x, s.y, h.x, h.y) <= p.range) {
    h.hp = Math.min(h.maxHp, h.hp + p.houseHeal);
    healed = true;
    w.events.push({ type: 'mend', x: h.x, y: h.y - 40 });
  }
  return healed;
}

/** 種類を選んだとうが、それぞれのやり方で働く */
export function updateTowers(w: World, dt: number): void {
  const td = w.data.towers;
  for (const s of w.spots) {
    if (s.type !== 'tower' || s.hidden || s.level === 0 || !s.kind) continue;
    s.cd -= dt;
    if (s.cd > 0) continue;
    const p = towerPower(s.kind, s.level, branchOf(s, td), td);
    if (p.support) {
      // 直すものがなければ、すぐ直せるように待っておく
      if (mend(w, s, p)) s.cd = p.interval;
      continue;
    }
    const target = pickTarget(w, s, p);
    if (!target) continue;
    s.cd = p.interval;
    const mx = s.x;
    const my = s.y - td.muzzleHeight;
    w.events.push({ type: 'shoot', spot: s });
    if (s.kind === 'lightning') {
      zap(w, s, target, p, mx, my);
      continue;
    }
    const dmg = p.damage * w.mods.towerDamage;
    if (s.kind === 'cannon') {
      w.shots.push({ type: 'shell', x0: mx, y0: my, tx: target.x, ty: target.y, t: 0, dur: td.shellTime, dmg, radius: p.splash, burn: p.burn });
    } else {
      const kind = s.kind === 'ice' ? 'ice' : 'arrow';
      w.shots.push({ type: 'bolt', kind, x: mx, y: my, vx: 0, vy: 0, target, dmg, life: td.shotLife, slow: p.slow, slowArea: p.slowArea, freeze: p.freeze });
    }
  }
}

/** 氷の玉が当たった：遅くする（まわりも）。ときどきこおらせる */
function chill(w: World, a: Bolt, tg: Enemy): void {
  if (a.slowArea > 0) {
    for (const e of w.enemies) {
      if (e.targetable && dist(e.x, e.y, tg.x, tg.y) < a.slowArea) e.slow = Math.max(e.slow, a.slow);
    }
    w.events.push({ type: 'chill', x: tg.x, y: tg.y, radius: a.slowArea });
  } else {
    tg.slow = Math.max(tg.slow, a.slow);
  }
  if (a.freeze && !tg.stats.boss && w.rng.next() < a.freeze.chance) {
    tg.frozen = Math.max(tg.frozen, a.freeze.time);
    w.events.push({ type: 'freeze', enemy: tg });
  }
}

/** 飛んでいる玉を進める。当たった玉は消す */
export function updateShots(w: World, dt: number): void {
  const speed = w.data.towers.shotSpeed;
  const keep: Shot[] = [];
  for (const a of w.shots) {
    if (a.type === 'shell') {
      a.t += dt;
      if (a.t >= a.dur) {
        w.explode(a.tx, a.ty, a.radius, a.dmg);
        if (a.burn) w.addFire(a.tx, a.ty, a.burn.radius, a.burn.dps, a.burn.time);
      } else keep.push(a);
      continue;
    }
    a.life -= dt;
    if (a.life <= 0) continue;
    const tg = a.target;
    if (tg.targetable) {
      // 空の敵は体が浮いているので、少し上を狙う
      const ty = tg.y - tg.r - (tg.fly ? 24 : 0);
      const dx = tg.x - a.x;
      const dy = ty - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < tg.r + 4) {
        if (a.slow) chill(w, a, tg);
        w.hurt(tg, a.dmg, a.x, a.y, a.kind);
        continue;
      }
      a.vx = (dx / d) * speed;
      a.vy = (dy / d) * speed;
    } else if (!a.vx && !a.vy) {
      continue;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    keep.push(a);
  }
  w.shots = keep;
}

/** かべの区画が受けるダメージの倍率（近くに「かたい かべ」のちゆのとうがあれば減る） */
export function wallGuardAt(w: World, wall: Spot): number {
  const td = w.data.towers;
  let k = 1;
  for (const s of w.spots) {
    if (s.type !== 'tower' || s.kind !== 'heal' || s.hidden || s.level === 0) continue;
    const p = towerPower(s.kind, s.level, branchOf(s, td), td);
    if (p.wallGuard < 1 && dist(s.x, s.y, wall.x, wall.y) <= p.range) k = Math.min(k, p.wallGuard);
  }
  return k;
}
