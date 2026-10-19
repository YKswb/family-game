/** 種から同じ列を作れる乱数（自動プレイのテストを毎回同じ結果にするため） */
export class Random {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** 0以上1未満 */
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
}
