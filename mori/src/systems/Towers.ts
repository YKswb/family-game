import type { TowerKind } from '../data/gameData';
import type { Enemy } from '../entities/Enemy';
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
}

export type Shot = Bolt | Shell;

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** 種類を選んだとうが、射程内の一番近い敵を撃つ。氷のとうは、まだ遅くなっていない敵を先に狙う */
export function updateTowers(w: World, dt: number): void {
  const td = w.data.towers;
  for (const s of w.spots) {
    if (s.type !== 'tower' || s.hidden || s.level === 0 || !s.kind) continue;
    const t = td.kinds[s.kind];
    const i = s.level - 1;
    s.cd -= dt;
    if (s.cd > 0) continue;
    let target: Enemy | null = null;
    let best = Infinity;
    for (const e of w.enemies) {
      if (e.dead || (e.fly && !t.air)) continue;
      const d = dist(s.x, s.y, e.x, e.y);
      if (d > t.range[i]) continue;
      const score = d + (s.kind === 'ice' && e.slow > 0 ? td.iceAvoidSlowed : 0);
      if (score < best) {
        best = score;
        target = e;
      }
    }
    if (!target) continue;
    s.cd = t.interval[i];
    const dmg = t.damage[i] * w.mods.towerDamage;
    const mx = s.x;
    const my = s.y - td.muzzleHeight;
    if (s.kind === 'cannon') {
      w.shots.push({ type: 'shell', x0: mx, y0: my, tx: target.x, ty: target.y, t: 0, dur: td.shellTime, dmg, radius: t.splash?.[i] ?? 0 });
    } else {
      const kind: Exclude<TowerKind, 'cannon'> = s.kind;
      w.shots.push({ type: 'bolt', kind, x: mx, y: my, vx: 0, vy: 0, target, dmg, life: td.shotLife, slow: t.slow?.[i] ?? 0 });
    }
    w.events.push({ type: 'shoot', spot: s });
  }
}

/** 飛んでいる玉を進める。当たった玉は消す */
export function updateShots(w: World, dt: number): void {
  const speed = w.data.towers.shotSpeed;
  const keep: Shot[] = [];
  for (const a of w.shots) {
    if (a.type === 'shell') {
      a.t += dt;
      if (a.t >= a.dur) w.explode(a.tx, a.ty, a.radius, a.dmg);
      else keep.push(a);
      continue;
    }
    a.life -= dt;
    if (a.life <= 0) continue;
    const tg = a.target;
    if (!tg.dead) {
      // 空の敵は体が浮いているので、少し上を狙う
      const ty = tg.y - tg.r - (tg.fly ? 24 : 0);
      const dx = tg.x - a.x;
      const dy = ty - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < tg.r + 4) {
        if (a.slow) tg.slow = Math.max(tg.slow, a.slow);
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
