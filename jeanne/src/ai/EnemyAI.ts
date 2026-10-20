import type { Squad } from '../entities/Squad';
import type { World } from '../systems/World';
import { layoutSquad } from './Formation';

/**
 * 持ち場を守る部隊（敵部隊・味方NPC部隊・待機中の仲間）の部隊単位の判断。
 * - 待機・巡回・進軍：相手が索敵範囲に入るまで、持ち場をルートに沿って動かす
 * - 警戒（交戦）：相手が索敵範囲に入ったら迎え撃ち、追跡範囲から相手がいなくなると持ち場へ戻る
 * 撤退は ステージ3 以降を作るマイルストーンで足す
 */
export function updateHoldSquad(w: World, sq: Squad, dt: number): void {
  if (sq.aliveCount === 0) return;
  const ai = w.data.ai;
  // 待機している部隊は戦わずに持ち場で休む（兵士が戻ってきたときのために並びだけ整える）
  if (sq.waiting) {
    sq.alert = false;
    layoutSquad(sq, sq.postX, sq.postY, sq.dirX, sq.dirY, ai.formationSpacing, ai.formationColumns);
    return;
  }
  const c = sq.center();
  if (updateRetreat(w, sq, c)) {
    layoutSquad(sq, sq.postX, sq.postY, sq.dirX, sq.dirY, ai.formationSpacing, ai.formationColumns);
    return;
  }
  const radius = sq.alert ? ai.enemyChaseRadius : (sq.alertRadius ?? ai.enemyAlertRadius);
  sq.alert = w.nearestFoe(sq.side, c.x, c.y, radius) !== null;
  // 気づいていても、だれも戦っていない（相手が門の向こうなどで届かない）ときは、ルートを進み続ける
  if (!sq.alert || !sq.units.some((u) => !u.dead && u.target)) followRoute(sq, dt);
  layoutSquad(sq, sq.postX, sq.postY, sq.dirX, sq.dirY, ai.formationSpacing, ai.formationColumns);
}

/**
 * 撤退：撤退のあるステージで、敵の部隊が最初の人数の3割まで減ったら、戦いをやめて大将のそばへ下がる。
 * 下がり終えたら、そこで大将を守る（もう一度は下がらない）。下がっているあいだは true
 */
function updateRetreat(w: World, sq: Squad, c: { x: number; y: number }): boolean {
  const gen = w.general;
  if (!w.enemyRetreat || sq.side !== 'enemy' || !gen || gen.dead || sq === w.generalSquad) return false;
  // 下がる先（大将のところ）へ行けないとき（門が閉じているなど）は、下がらずに戦い続ける
  if (
    !sq.retreating &&
    !sq.retreated &&
    sq.aliveCount > 0 &&
    sq.aliveCount <= sq.capacity * w.data.ai.retreatRatio &&
    w.terrain.canReach(c.x, c.y, gen.x, gen.y)
  ) {
    sq.retreating = true;
    sq.alert = false;
    sq.route = null;
    // 大将のまわりの、ほかの部隊と重なりにくい場所へ
    const a = w.rng.range(0, Math.PI * 2);
    const p = { x: gen.x + Math.cos(a) * 110, y: gen.y + Math.sin(a) * 110, radius: 30 };
    w.terrain.pushOut(p);
    sq.postX = p.x;
    sq.postY = p.y;
  }
  if (!sq.retreating) return false;
  if (Math.hypot(c.x - sq.postX, c.y - sq.postY) < 60) {
    sq.retreating = false;
    sq.retreated = true;
    return false;
  }
  return true;
}

/** 持ち場をルートの次の地点へ動かす（巡回はくり返し、進軍は最後の地点で止まる） */
function followRoute(sq: Squad, dt: number): void {
  const route = sq.route;
  if (!route || sq.routeIndex >= route.length) return;
  const [tx, ty] = route[sq.routeIndex];
  const dx = tx - sq.postX;
  const dy = ty - sq.postY;
  const d = Math.hypot(dx, dy);
  if (d < 8) {
    sq.routeIndex++;
    if (sq.routeIndex >= route.length && sq.routeLoop) sq.routeIndex = 0;
    return;
  }
  const step = Math.min(d, sq.routeSpeed * dt);
  sq.postX += (dx / d) * step;
  sq.postY += (dy / d) * step;
  sq.dirX = dx / d;
  sq.dirY = dy / d;
}
