import type { UnitKind, UnitStats } from '../data/unitData';
import type { Squad } from './Squad';

export type Side = 'ally' | 'enemy';

/** 戦場にいる1人分の兵士（ジャンや大将もこれを元にする） */
export class Unit {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  interval: number;
  speed: number;
  readonly radius: number;
  readonly reach: number;
  readonly range: number;
  readonly keep: number;

  dead = false;
  /** 次に攻撃できるまでの秒数 */
  cooldown: number;
  target: Unit | null = null;
  /** この兵士に斬りかかっている近接の敵の人数（World.setTarget が数える） */
  attackers = 0;
  /** 次に目標を選び直すまでの秒数 */
  retargetIn: number;

  /** 隊列で立つべき位置 */
  slotX: number;
  slotY: number;

  /** 自分の足で動き続けている秒数（突撃の判定に使う） */
  moveTime = 0;
  stillTime = 0;
  chargeReady = false;
  /** 先制の一撃をすでに入れた相手 */
  firstStruckId = -1;

  // 押し返し
  kx = 0;
  ky = 0;

  // 見た目用
  moving = false;
  face: 1 | -1 = 1;
  hitFlash = 0;
  swing = 0;
  bob: number;

  constructor(
    readonly id: number,
    readonly kind: UnitKind,
    public side: Side,
    readonly stats: UnitStats,
    x: number,
    y: number,
    public squad: Squad | null,
    phase: number,
  ) {
    this.x = this.slotX = x;
    this.y = this.slotY = y;
    this.hp = this.maxHp = stats.hp;
    this.attack = stats.attack;
    this.interval = stats.interval;
    this.speed = stats.speed;
    this.radius = stats.radius;
    this.reach = stats.reach;
    this.range = stats.range ?? 0;
    this.keep = stats.keep ?? 0;
    // 全員が同じフレームで動き出さないよう、位相をずらす
    this.cooldown = phase * stats.interval;
    this.retargetIn = phase * 0.2;
    this.bob = phase * 6;
  }

  get isRanged(): boolean {
    return this.range > 0;
  }
}
