import type { SoldierKind } from '../data/unitData';
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

  constructor(
    readonly id: number,
    public side: Side,
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
