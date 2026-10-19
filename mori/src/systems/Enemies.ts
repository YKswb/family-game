import { sectorOf, type Spot } from './Build';
import type { World } from './World';

/**
 * 敵を動かす。おうちへまっすぐ向かい、かべの輪に着いたとき、その区画にかべがあればかべを攻撃し、
 * なければ通り抜けておうちを攻撃する。空の敵はかべを飛び越える
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

    let blocking: Spot | null = null;
    if (!e.fly) {
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
    } else if (d > h.r + e.r - 4) {
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

  // 同じ高さ（地上どうし、空どうし）の敵は重ならないよう押し合う
  const es = w.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.dead) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.dead || a.fly !== b.fly) continue;
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
