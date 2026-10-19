import type { EventAction, EventCondition, StageEvent } from '../data/stageData';
import type { World } from './World';

/**
 * ステージのイベント。条件がそろったら1回だけ、書かれた順に結果（会話・援軍・クリア）を起こす
 */
export class EventRunner {
  private readonly fired = new Set<string>();

  constructor(private readonly defs: readonly StageEvent[]) {}

  hasFired(id: string): boolean {
    return this.fired.has(id);
  }

  update(w: World): void {
    for (const e of this.defs) {
      if (this.fired.has(e.id) || !conditionMet(w, e.when)) continue;
      this.fired.add(e.id);
      for (const a of e.do) runAction(w, a);
    }
  }
}

export function conditionMet(w: World, c: EventCondition): boolean {
  if (c.time !== undefined && w.time < c.time) return false;
  if (c.heroIn) {
    const r = c.heroIn;
    const h = w.hero;
    if (!(h.x >= r.x && h.x <= r.x + r.w && h.y >= r.y && h.y <= r.y + r.h)) return false;
  }
  if (c.generalAlert && !w.generalSquad?.alert) return false;
  if (c.generalDead && !(w.general && w.general.dead)) return false;
  if (c.squadsWiped) {
    for (const id of c.squadsWiped) {
      const sq = w.squadById(id);
      if (!sq || sq.aliveCount > 0) return false;
    }
  }
  return true;
}

function runAction(w: World, a: EventAction): void {
  if (a.dialog) w.events.push({ type: 'dialog', key: a.dialog });
  if (a.spawn) for (const s of a.spawn) w.addSquad({ ...s, dir: s.dir });
  if (a.victory) w.win();
}
