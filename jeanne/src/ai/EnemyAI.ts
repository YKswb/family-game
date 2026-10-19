import type { Squad } from '../entities/Squad';
import type { World } from '../systems/World';
import { layoutSquad } from './Formation';

/**
 * 持ち場を守る部隊（敵部隊・味方NPC部隊）の部隊単位の判断。
 * 待機中は索敵範囲に相手が入ると警戒（交戦）に移り、追跡範囲から相手がいなくなると持ち場へ戻る。
 * 巡回・撤退はステージデータを入れるマイルストーンで足す
 */
export function updateHoldSquad(w: World, sq: Squad): void {
  if (sq.aliveCount === 0) return;
  const ai = w.data.ai;
  const c = sq.center();
  const radius = sq.alert ? ai.enemyChaseRadius : ai.enemyAlertRadius;
  sq.alert = w.nearestFoe(sq.side, c.x, c.y, radius) !== null;
  layoutSquad(sq, sq.postX, sq.postY, sq.dirX, sq.dirY, ai.formationSpacing, ai.formationColumns);
}
