/** 守るおうち。HP が0になると負け */
export class House {
  /** 攻撃を受けたときの点滅の残り秒数 */
  hit = 0;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly r: number,
    public hp: number,
    public maxHp: number,
  ) {}
}
