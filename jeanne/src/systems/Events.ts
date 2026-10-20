import type { EventAction, EventCondition, Rect, StageEvent } from '../data/stageData';
import type { World } from './World';

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * ステージのイベント。条件がそろったら1回だけ、書かれた順に結果（会話・援軍・門・クリアなど）を起こす
 */
export class EventRunner {
  /** 起きたイベントと、その時刻 */
  private readonly firedAt = new Map<string, number>();

  constructor(private readonly defs: readonly StageEvent[]) {}

  hasFired(id: string): boolean {
    return this.firedAt.has(id);
  }

  update(w: World): void {
    for (const e of this.defs) {
      if (this.firedAt.has(e.id) || !conditionMet(w, e.when, this.firedAt)) continue;
      this.firedAt.set(e.id, w.time);
      for (const a of e.do) runAction(w, a);
    }
  }
}

export function conditionMet(w: World, c: EventCondition, firedAt: ReadonlyMap<string, number> = new Map()): boolean {
  if (c.time !== undefined && w.time < c.time) return false;
  if (c.heroIn && !inRect(c.heroIn, w.hero.x, w.hero.y)) return false;
  if (c.jeanneIn) {
    const j = w.jeanne;
    if (!j || !w.present(j) || !inRect(c.jeanneIn, j.x, j.y)) return false;
  }
  if (c.generalAlert && !w.generalSquad?.alert) return false;
  if (c.generalDead && !(w.general && w.general.dead)) return false;
  if (c.squadsWiped) {
    for (const id of c.squadsWiped) {
      const sq = w.squadById(id);
      if (!sq || sq.aliveCount > 0) return false;
    }
  }
  if (c.after) {
    const t = firedAt.get(c.after.event);
    if (t === undefined || w.time - t < c.after.seconds) return false;
  }
  return true;
}

function runAction(w: World, a: EventAction): void {
  if (a.dialog) w.events.push({ type: 'dialog', key: a.dialog });
  if (a.banner) w.events.push({ type: 'banner', text: a.banner });
  if (a.spawn) for (const s of a.spawn) w.addSquad({ ...s, dir: s.dir });
  if (a.openGate) w.openGate(a.openGate);
  if (a.march) {
    for (const m of a.march) {
      const sq = w.squadById(m.squad);
      if (!sq || sq.mode !== 'hold' || sq.waiting) continue;
      sq.route = m.route;
      sq.routeIndex = 0;
      sq.routeLoop = false;
      if (!sq.routeSpeed) sq.routeSpeed = w.data.ai.patrolSpeed;
    }
  }
  if (a.jeanne === 'leave') w.jeanneLeave();
  if (a.jeanne === 'return') w.jeanneReturn();
  if (a.rally) w.rally(a.rally.seconds, a.rally.bonus);
  if (a.victory) w.win();
}
