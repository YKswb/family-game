import { SOLDIER_KINDS, type SoldierKind } from '../data/unitData';
import type { Side, Unit } from './Unit';

/**
 * follow:  ジャンに率いられて隊列で付いてくる
 * hold:    持ち場を守り、敵が近づくと迎え撃つ（敵部隊・味方NPC部隊・待機中の仲間）
 * neutral: 旗を立てて待っている味方部隊。ジャンが触れると仲間になる。戦わず、敵にも狙われない
 */
export type SquadMode = 'follow' | 'hold' | 'neutral';

/** 部隊の兵種。大将はひとりだけの部隊として扱う。隊長は部隊の中のひとり（captain） */
export type SquadKind = SoldierKind | 'general' | 'captain';

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
  /** 待機中に、次の兵士が戻ってくるまでの経過時間 */
  reviveTimer = 0;
  /** 最後にこの待機部隊から補充した時刻 */
  lastReinforceTime = -Infinity;
  /** 最初に置かれた場所（率いている部隊が全滅したら、ここに待機として戻る） */
  homeX = 0;
  homeY = 0;
  /** ステージデータでの名前（イベントや大将の護衛から参照する） */
  name = '';
  /** 巡回・進軍のルート。持ち場がこの上を動く */
  route: [number, number][] | null = null;
  /** true なら巡回（くり返す）、false なら進軍（最後の地点で止まる） */
  routeLoop = false;
  routeIndex = 0;
  routeSpeed = 0;
  /** 索敵範囲（null なら units.json の値） */
  alertRadius: number | null = null;
  /** 隊長の名前（ラ・イールなど。いなければ空） */
  leaderName = '';
  /** 人数が減って大将の方へ下がっている途中 */
  retreating = false;
  /** 一度下がり終えた（もう下がらない） */
  retreated = false;

  constructor(
    readonly id: number,
    public side: Side,
    /** 最初の兵種（補充で他の兵種が混ざることがある） */
    readonly kind: SquadKind,
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

  /**
   * 生き残りを兵種ごとのかたまりに分ける。最初の兵種を先に、あとは SOLDIER_KINDS の順。
   * 補充で兵種が混ざった部隊は、かたまりごとにその兵種の列へ並ぶ。
   * 隊長は最初のかたまりの先頭に入れる（隊長だけが残ったら隊長だけのかたまり）
   */
  groups(): { kind: SquadKind; units: Unit[] }[] {
    const byKind = new Map<SquadKind, Unit[]>();
    const captains: Unit[] = [];
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.kind === 'captain') {
        captains.push(u);
        continue;
      }
      const k = u.kind as SquadKind;
      let list = byKind.get(k);
      if (!list) byKind.set(k, (list = []));
      list.push(u);
    }
    const order: SquadKind[] = [this.kind, ...SOLDIER_KINDS.filter((k) => k !== this.kind)];
    const groups = order.filter((k) => byKind.has(k)).map((kind) => ({ kind, units: byKind.get(kind)! }));
    if (captains.length > 0) {
      if (groups.length > 0) groups[0].units.unshift(...captains);
      else groups.push({ kind: this.kind, units: captains });
    }
    return groups;
  }

  /** 生き残りの兵種ごとの人数（groups と同じ順。隊長は数えない） */
  composition(): { kind: SquadKind; n: number }[] {
    return this.groups()
      .map((g) => ({ kind: g.kind, n: g.units.filter((u) => u.kind !== 'captain').length }))
      .filter((c) => c.n > 0);
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
