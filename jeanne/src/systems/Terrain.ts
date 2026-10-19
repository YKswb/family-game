import type { Rect } from '../data/stageData';

export type { Rect };

const inside = (r: Rect, x: number, y: number, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;

/**
 * 通れない四角（川・壁）と、その上を通れる四角（橋・門）。
 * 兵士を押し出すのと、川の向こうへ行くときに橋を経由させるのに使う
 */
export class Terrain {
  constructor(
    readonly blockers: readonly Rect[] = [],
    readonly passages: readonly Rect[] = [],
  ) {}

  get empty(): boolean {
    return this.blockers.length === 0;
  }

  /** (x, y) が通れない場所か（margin は体の半径） */
  isBlocked(x: number, y: number, margin = 0): boolean {
    if (this.passages.some((p) => inside(p, x, y))) return false;
    return this.blockers.some((b) => inside(b, x, y, margin));
  }

  /** 通れない場所に入った兵士を、一番近い通れる場所（岸か橋の上）へ押し戻す */
  pushOut(u: { x: number; y: number; radius: number }): void {
    const m = u.radius;
    if (!this.isBlocked(u.x, u.y, m)) return;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const consider = (x: number, y: number) => {
      if (this.isBlocked(x, y, m - 0.5)) return;
      const d = Math.hypot(x - u.x, y - u.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    };
    for (const b of this.blockers) {
      if (!inside(b, u.x, u.y, m)) continue;
      consider(b.x - m, u.y);
      consider(b.x + b.w + m, u.y);
      consider(u.x, b.y - m);
      consider(u.x, b.y + b.h + m);
    }
    for (const p of this.passages) {
      consider(Math.min(Math.max(u.x, p.x + 1), p.x + p.w - 1), Math.min(Math.max(u.y, p.y + m), p.y + p.h - m));
    }
    if (best) {
      u.x = (best as { x: number; y: number }).x;
      u.y = (best as { x: number; y: number }).y;
    }
  }

  /** a から b へまっすぐ進むと、通れない場所を通るか */
  segmentBlocked(ax: number, ay: number, bx: number, by: number): Rect | null {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / 16));
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const y = ay + ((by - ay) * i) / n;
      if (this.passages.some((p) => inside(p, x, y))) continue;
      const b = this.blockers.find((r) => inside(r, x, y));
      if (b) return b;
    }
    return null;
  }

  /**
   * a から b へ向かうとき、いま目指すべき地点。まっすぐ行けるなら b、
   * 川などをまたぐなら、遠回りが一番少ない橋の手前 → 橋の向こう の順に目指す
   */
  waypoint(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
    if (this.empty) return { x: bx, y: by };
    const b = this.segmentBlocked(ax, ay, bx, by);
    if (!b) return { x: bx, y: by };
    // 川が縦長なら左右に、横長なら上下に渡る
    const vertical = b.h >= b.w;
    const sideOf = (x: number, y: number) => (vertical ? Math.sign(x - (b.x + b.w / 2)) : Math.sign(y - (b.y + b.h / 2)));
    // 出口は行き先の側の端、入口はその反対の端（橋の真ん中＝川の中心線の上にいても迷わないように）
    const to = sideOf(bx, by);
    let best: { entry: { x: number; y: number }; exit: { x: number; y: number }; onIt: boolean } | null = null;
    let bestCost = Infinity;
    for (const p of this.passages) {
      // この川にかかっている橋だけ
      if (!(p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y)) continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const ends = vertical
        ? [
            { x: p.x, y: cy },
            { x: p.x + p.w, y: cy },
          ]
        : [
            { x: cx, y: p.y },
            { x: cx, y: p.y + p.h },
          ];
      const exit = sideOf(ends[0].x, ends[0].y) === to ? ends[0] : ends[1];
      const entry = exit === ends[0] ? ends[1] : ends[0];
      const cost = Math.hypot(entry.x - ax, entry.y - ay) + Math.hypot(exit.x - entry.x, exit.y - entry.y) + Math.hypot(bx - exit.x, by - exit.y);
      if (cost < bestCost) {
        bestCost = cost;
        best = { entry, exit, onIt: inside(p, ax, ay) };
      }
    }
    if (!best) return { x: bx, y: by };
    // 橋の上にいるか、橋の手前まで来たら、向こう岸へ
    if (best.onIt || Math.hypot(best.entry.x - ax, best.entry.y - ay) < 24) return best.exit;
    return best.entry;
  }
}
