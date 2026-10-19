/** 主人公（見習いのまもりびと） */
export class Player {
  wood = 0;
  /** 次に木を切れるまでの秒数 */
  chopT = 0;
  /** 次に斬れるまでの秒数 */
  atkT = 0;
  /** 斧を振る動きの残り（1→0） */
  swing = 0;
  /** 向き（1: 右、-1: 左） */
  face: 1 | -1 = 1;
  moving = false;
  /** 歩く動きの位相 */
  step = 0;
  /** これまでに歩いた距離（チュートリアルの判定用） */
  walked = 0;

  constructor(
    public x: number,
    public y: number,
    readonly radius: number,
  ) {}
}
