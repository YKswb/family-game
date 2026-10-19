/** 森の木。切り倒すと切り株になり、時間がたつと生え戻る */
export class Tree {
  alive = true;
  /** 生え戻るまでの秒数 */
  regrow = 0;
  /** 切られたときの揺れの残り秒数 */
  shake = 0;
  /** 生え戻ったときの伸びる動き（0→1） */
  grow = 1;

  constructor(
    readonly id: number,
    readonly x: number,
    readonly y: number,
    /** 見た目と当たり判定の大きさの倍率 */
    readonly size: number,
    public hp: number,
    readonly maxHp: number,
  ) {}
}
