import type { Jeanne } from '../entities/Jeanne';
import type { World } from '../systems/World';
import { navMove } from './SquadAI';

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * ジャンヌの1フレーム分。ジャンの少し後ろを付いて歩き、そばに来た敵だけを剣で斬る。
 * HP が少ないときと集合の笛のあいだは戦わず、ジャンの後ろへ戻る
 */
export function updateJeanne(w: World, j: Jeanne, dt: number): void {
  const ai = w.data.ai;
  const cfg = ai.jeanne;
  const h = w.hero;
  j.hitFlash = Math.max(0, j.hitFlash - dt);
  j.swing = Math.max(0, j.swing - dt * 5);
  j.cooldown -= dt;
  j.moving = false;

  // 3秒ダメージを受けなければ回復（ジャンと同じ）
  j.sinceHit += dt;
  const st = j.stats;
  if (j.sinceHit > (st.regenDelay ?? Infinity) && j.hp < j.maxHp) {
    j.hp = Math.min(j.maxHp, j.hp + (st.regenPerSecond ?? 0) * dt);
  }

  // 付いて歩く位置：ジャンの進行方向の後ろ。HP が少ないときは、戦いから離れてもっと後ろへ
  const low = j.hp < j.maxHp * cfg.lowHpRatio;
  const behind = low ? cfg.retreatBehind : cfg.followBehind;
  const fx = h.x - w.headX * behind;
  const fy = h.y - w.headY * behind;
  const fromFollow = dist(j.x, j.y, fx, fy);
  const canFight = !low && w.recallTime <= 0 && fromFollow <= cfg.leash;

  j.retargetIn -= dt;
  if (!canFight) {
    w.setTarget(j, null);
  } else if (j.retargetIn <= 0 || (j.target && !w.isTargetable(j.target))) {
    j.retargetIn = ai.retargetInterval;
    w.setTarget(j, w.nearestFoe(j.side, j.x, j.y, cfg.engageRadius, j));
  }

  const t = j.target;
  if (t && !t.dead) {
    const d = dist(j.x, j.y, t.x, t.y);
    const contact = j.radius + t.radius + j.reach;
    j.face = t.x >= j.x ? 1 : -1;
    if (d > contact) {
      navMove(w, j, t.x, t.y, j.speed, dt, contact - 1);
    } else if (j.cooldown <= 0) {
      j.cooldown = j.interval;
      j.swing = 1;
      w.strike(j, t);
    }
  } else {
    // 遅れるほど速く歩いて追いつく（兵士と同じ）
    const k = clamp01((fromFollow - 40) / ai.catchUpDistance);
    const speed = j.speed * (ai.slotSpeedMultiplier + (ai.catchUpMaxMultiplier - ai.slotSpeedMultiplier) * k);
    navMove(w, j, fx, fy, speed, dt, 4);
  }
  if (j.moving) j.bob += dt * 10;
}
