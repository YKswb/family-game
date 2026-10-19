import { SOLDIER_KINDS, type SoldierKind } from '../data/unitData';
import type { Side, Unit } from './Unit';

/**
 * follow:  ジャンに率いられて隊列で付いてくる
 * hold:    持ち場を守り、敵が近づくと迎え撃つ（敵部隊・味方NPC部隊・待機中の仲間）
 * neutral: 旗を立てて待っている味方部隊。ジャンが触れると仲間になる。戦わず、敵にも狙われない
 */
export type SquadMode = 'follow' | 'hold' | 'neutral';

export class Squad {
  readonly units: Unit[] = [];
  /** 持ち場（hold のとき） */
  postX: number;
  postY: number;
  /** 隊列の向き（前方） */
  dirX: number;
  dirY: number;
  /** 敵に気づいて戦っている */
  alert = false;
  /** ジャンの隊列の何番目か（follow のとき） */
  followIndex = 0;
  /** 仲間になったが、率いられる数の上限を超えたのでその場で待っている（mode は hold） */
  waiting = false;
  /** 補充で戻せる人数の上限（最初の人数） */
  capacity = 0;

  constructor(
    readonly id: number,
    public side: Side,
    /** 最初の兵種。隊列の列はこれで決まる（補充で他の兵種が混ざることがある） */
    readonly kind: SoldierKind,
    public mode: SquadMode,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
  ) {
    this.postX = x;
    this.postY = y;
    this.dirX = dirX;
    this.dirY = dirY;
  }

  get alive(): Unit[] {
    return this.units.filter((u) => !u.dead);
  }

  get aliveCount(): number {
    let n = 0;
    for (const u of this.units) if (!u.dead) n++;
    return n;
  }

  /** 生き残りの兵種ごとの人数。最初の兵種を先に、あとは SOLDIER_KINDS の順 */
  composition(): { kind: SoldierKind; n: number }[] {
    const counts = new Map<SoldierKind, number>();
    for (const u of this.units) {
      if (u.dead) continue;
      const k = u.kind as SoldierKind;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const order = [this.kind, ...SOLDIER_KINDS.filter((k) => k !== this.kind)];
    return order.filter((k) => counts.has(k)).map((kind) => ({ kind, n: counts.get(kind)! }));
  }

  center(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      x += u.x;
      y += u.y;
      n++;
    }
    return n ? { x: x / n, y: y / n } : { x: this.postX, y: this.postY };
  }
}
