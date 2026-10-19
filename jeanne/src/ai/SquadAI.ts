import type { FormationRow, SoldierKind } from '../data/unitData';
import type { Unit } from '../entities/Unit';
import type { World } from '../systems/World';
import { followAnchor, layoutUnits } from './Formation';

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * ジャンに率いられている部隊の隊列位置を決める。
 * 兵種ごとに前列・中列・後列のどこに入るかがデータで決まっていて、同じ列の中では仲間になった順に並ぶ。
 * 補充で兵種が混ざった部隊は、兵種ごとのかたまりに分かれて、それぞれの兵種の列へ並ぶ
 */
export function updateFollowSquads(w: World): void {
  const ai = w.data.ai;
  const h = w.hero;
  const used: Record<FormationRow, number> = { front: 0, middle: 0, back: 0 };
  const squads = w.squads.filter((s) => s.mode === 'follow' && s.aliveCount > 0).sort((a, b) => a.followIndex - b.followIndex);
  for (const sq of squads) {
    sq.dirX = w.headX;
    sq.dirY = w.headY;
    for (const g of sq.groups()) {
      const row = ai.formation.rowOf[g.kind as SoldierKind];
      const slots = ai.formation.slots[row];
      const offset = slots[used[row]++ % slots.length];
      const a = followAnchor(h.x, h.y, w.headX, w.headY, offset);
      layoutUnits(g.units, a.x, a.y, w.headX, w.headY, ai.formationSpacing, ai.formationColumns);
    }
  }
}

interface Engagement {
  /** この距離以内の敵を狙う。0なら戦わない */
  engage: number;
  /** 基準点からこれ以上離れたら戦いをやめて戻る */
  leash: number;
  anchorX: number;
  anchorY: number;
}

function engagementOf(w: World, u: Unit): Engagement {
  const ai = w.data.ai;
  const sq = u.squad!;
  if (sq.mode === 'follow') {
    let engage = w.order === 'charge' ? ai.chargeSightRadius : ai.gatherEngageRadius;
    if (u.isRanged) engage = Math.max(engage, u.range);
    // 集合の笛が鳴っているあいだは戦わずに戻る
    if (w.recallTime > 0) engage = 0;
    // 隊列の自分の位置から離れすぎないよう、ひもでつなぐ
    return { engage, leash: engage + ai.allyLeashExtra, anchorX: u.slotX, anchorY: u.slotY };
  }
  return {
    engage: sq.alert ? ai.enemyEngageRadius : 0,
    leash: ai.enemyChaseRadius,
    anchorX: sq.postX,
    anchorY: sq.postY,
  };
}

function moveTo(u: Unit, tx: number, ty: number, speed: number, dt: number, stopAt = 2): void {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d <= stopAt) return;
  const s = Math.min((d - stopAt) / dt, speed);
  u.x += (dx / d) * s * dt;
  u.y += (dy / d) * s * dt;
  u.moving = true;
  if (Math.abs(dx) > 2) u.face = dx > 0 ? 1 : -1;
}

/** 川などをまたぐときは橋を経由して進む */
function navMove(w: World, u: Unit, tx: number, ty: number, speed: number, dt: number, stopAt = 2): void {
  const p = w.terrain.waypoint(u.x, u.y, tx, ty);
  if (p.x === tx && p.y === ty) moveTo(u, tx, ty, speed, dt, stopAt);
  else moveTo(u, p.x, p.y, speed, dt);
}

/** 兵士1人の1フレーム分：目標選び、移動、攻撃 */
export function updateSoldier(w: World, u: Unit, dt: number): void {
  const ai = w.data.ai;
  const sq = u.squad!;
  u.hitFlash = Math.max(0, u.hitFlash - dt);
  u.swing = Math.max(0, u.swing - dt * 5);
  u.bob += dt * 8;
  // 押し返し
  const decay = Math.pow(0.003, dt);
  u.x += u.kx * dt;
  u.y += u.ky * dt;
  u.kx *= decay;
  u.ky *= decay;
  u.cooldown -= dt;
  u.moving = false;

  // 旗の部隊と待機している部隊は、戦わずにその場で休む
  if (sq.mode === 'neutral' || sq.waiting) {
    moveTo(u, u.slotX, u.slotY, u.speed * ai.returnSpeedMultiplier, dt);
    return;
  }

  const e = engagementOf(w, u);
  const fromAnchor = dist(u.x, u.y, e.anchorX, e.anchorY);

  // 離れすぎたら戦いをやめて戻る（しばらく目標を選び直さない）
  if (u.target && (!w.isTargetable(u.target) || fromAnchor > e.leash)) {
    const tooFar = !u.target.dead;
    w.setTarget(u, null);
    if (tooFar) u.retargetIn = Math.max(u.retargetIn, 0.6);
  }

  // 目標は毎フレームではなく一定間隔で選び直す
  u.retargetIn -= dt;
  if (u.retargetIn <= 0) {
    u.retargetIn = ai.retargetInterval;
    if (e.engage > 0 && fromAnchor <= e.leash) {
      const cur = u.target;
      const near = w.nearestFoe(u.side, u.x, u.y, e.engage, u);
      const keep = cur && w.isTargetable(cur) && dist(u.x, u.y, cur.x, cur.y) < e.engage + 80;
      // 今の相手を追い続けるが、それよりはっきり近い相手が来たら乗り換える。
      // 今の相手に斬りかかる人数が上限を超えていたら、空いている相手に回る
      if (!keep) w.setTarget(u, near);
      else if (near && near !== cur) {
        const closer = w.targetDistance(u.x, u.y, near) + ai.retargetSwitchMargin < w.targetDistance(u.x, u.y, cur);
        const crowded = !u.isRanged && cur.attackers > w.maxAttackers(cur) && near.attackers < w.maxAttackers(near);
        if (closer || crowded) w.setTarget(u, near);
      }
    } else {
      w.setTarget(u, null);
    }
  }

  const t = u.target;
  if (t && !t.dead) {
    const d = dist(u.x, u.y, t.x, t.y);
    u.face = t.x >= u.x ? 1 : -1;
    if (u.isRanged) {
      if (d < u.keep) {
        // 近づかれたら後ずさりに専念する（その間は射てない）
        const l = d || 1;
        moveTo(u, u.x + ((u.x - t.x) / l) * 60, u.y + ((u.y - t.y) / l) * 60, u.speed * ai.retreatSpeedMultiplier, dt);
      } else if (d > u.range) {
        if (sq.mode === 'follow' && w.order === 'gather') navMove(w, u, u.slotX, u.slotY, u.speed, dt);
        else navMove(w, u, t.x, t.y, u.speed, dt);
      } else if (sq.mode === 'follow') {
        // 射程内なら、足を止めずに隊列について行きながら射つ
        navMove(w, u, u.slotX, u.slotY, u.speed, dt);
      }
      if (d >= u.keep && d <= u.range + 10 && u.cooldown <= 0) {
        u.cooldown = u.interval;
        w.shoot(u, t);
      }
    } else {
      const contact = u.radius + t.radius + u.reach;
      // 槍兵は騎馬が間合いに入った瞬間に先に一撃入れる
      if (d <= contact && u.firstStruckId !== t.id && u.stats.firstStrikeVs?.includes(t.kind)) {
        u.firstStruckId = t.id;
        u.cooldown = Math.min(u.cooldown, 0);
      }
      if (d > contact) {
        navMove(w, u, t.x, t.y, u.speed, dt, contact - 1);
      } else if (u.cooldown <= 0) {
        u.cooldown = u.interval;
        u.swing = 1;
        w.strike(u, t);
      }
    }
  } else {
    w.setTarget(u, null);
    const d = dist(u.x, u.y, u.slotX, u.slotY);
    let speed: number;
    if (sq.mode === 'follow') {
      // 隊列から遅れるほど速く走って追いつく
      const k = clamp01((d - 40) / ai.catchUpDistance);
      speed = u.speed * (ai.slotSpeedMultiplier + (ai.catchUpMaxMultiplier - ai.slotSpeedMultiplier) * k);
    } else {
      speed = sq.alert ? u.speed : u.speed * ai.returnSpeedMultiplier;
    }
    navMove(w, u, u.slotX, u.slotY, speed, dt);
  }

  // 突撃：自分の足で一定時間動き続けると構え、止まると解ける
  const chargeMul = u.stats.chargeMultiplier ?? 1;
  if (u.moving) {
    u.moveTime += dt;
    u.stillTime = 0;
    if (chargeMul > 1 && u.moveTime >= w.data.charge.minMoveSeconds) u.chargeReady = true;
  } else {
    u.stillTime += dt;
    u.moveTime = 0;
    if (u.stillTime > 0.3) u.chargeReady = false;
  }
}
