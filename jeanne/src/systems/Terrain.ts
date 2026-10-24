import type { Rect } from '../data/stageData';

export type { Rect };

const inside = (r: Rect, x: number, y: number, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;
/** 2つの四角が重なっているか、くっついているか */
const touches = (a: Rect, b: Rect, m = 2) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

/** 門。閉じているあいだは通れない */
export interface Gate {
  id: string;
  rect: Rect;
  open: boolean;
}

/**
 * 通れない四角（川・壁）と、その上を通れる四角（橋・開いた門）。
 * 兵士を押し出すのと、川や壁の向こうへ行くときに橋や門を経由させるのに使う。
 * くっついている川と壁はひとつながりの「さえぎり」として扱い、そのどこかにかかる橋・門を通る
 */
export class Terrain {
  /** 通れる四角（橋と、開いている門） */
  readonly passages: Rect[];
  readonly gates: Gate[];
  /** さえぎりごとの番号（くっついている四角は同じ番号） */
  private readonly groupOf = new Map<Rect, number>();

  constructor(
    readonly blockers: readonly Rect[] = [],
    passages: readonly Rect[] = [],
    gates: readonly Gate[] = [],
  ) {
    this.gates = gates.map((g) => ({ ...g }));
    this.passages = [...passages, ...this.gates.filter((g) => g.open).map((g) => g.rect)];
    // くっついている四角を同じ番号にまとめる
    let next = 0;
    for (const b of blockers) {
      if (this.groupOf.has(b)) continue;
      const id = next++;
      const stack = [b];
      this.groupOf.set(b, id);
      while (stack.length) {
        const cur = stack.pop()!;
        for (const o of blockers) {
          if (!this.groupOf.has(o) && touches(cur, o)) {
            this.groupOf.set(o, id);
            stack.push(o);
          }
        }
      }
    }
  }

  get empty(): boolean {
    return this.blockers.length === 0;
  }

  /** 閉じている門があるか */
  get hasClosedGate(): boolean {
    return this.gates.some((g) => !g.open);
  }

  /** 門を開く。開いたら true */
  openGate(id: string): boolean {
    const g = this.gates.find((x) => x.id === id);
    if (!g || g.open) return false;
    g.open = true;
    this.passages.push(g.rect);
    return true;
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

  /** 通れる四角 p がかかっている、さえぎりの四角（group のもの） */
  private hostOf(p: Rect, group: number): Rect | null {
    for (const b of this.blockers) if (this.groupOf.get(b) === group && touches(p, b, 0)) return b;
    return null;
  }

  /**
   * a から b へ行けそうか。まっすぐ行けるか、間のさえぎりに橋か開いた門があれば行ける
   * （閉じた門の向こうの敵を、近接の兵士が狙わないようにするのに使う）
   */
  canReach(ax: number, ay: number, bx: number, by: number): boolean {
    const b = this.segmentBlocked(ax, ay, bx, by);
    if (!b) return true;
    const group = this.groupOf.get(b);
    return this.passages.some((p) => this.hostOf(p, group!) !== null);
  }

  /**
   * 橋も門もない壁（城の建物など）は、角を回って向こうへ行く。
   * 門のある壁（閉じている門を含む）は回らない（砦は門からしか入れない）
   */
  private aroundCorner(group: number, ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
    const rects = this.blockers.filter((b) => this.groupOf.get(b) === group);
    if (this.gates.some((g) => rects.some((r) => touches(g.rect, r, 0)))) return { x: bx, y: by };
    const m = 30;
    const x0 = Math.min(...rects.map((r) => r.x)) - m;
    const y0 = Math.min(...rects.map((r) => r.y)) - m;
    const x1 = Math.max(...rects.map((r) => r.x + r.w)) + m;
    const y1 = Math.max(...rects.map((r) => r.y + r.h)) + m;
    let best: { x: number; y: number } | null = null;
    let bestCost = Infinity;
    for (const c of [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x0, y: y1 },
      { x: x1, y: y1 },
    ]) {
      // すでに角のそばにいるなら、その角は目指さない（次の角か行き先へ）
      if (Math.hypot(c.x - ax, c.y - ay) < 40 || this.segmentBlocked(ax, ay, c.x, c.y)) continue;
      const cost = Math.hypot(c.x - ax, c.y - ay) + Math.hypot(bx - c.x, by - c.y);
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    return best ?? { x: bx, y: by };
  }

  /**
   * a から b へ向かうとき、いま目指すべき地点。まっすぐ行けるなら b、
   * 川や壁をまたぐなら、遠回りが一番少ない橋・門の手前 → 向こう側 の順に目指す
   */
  waypoint(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
    if (this.empty) return { x: bx, y: by };
    const hit = this.segmentBlocked(ax, ay, bx, by);
    if (!hit) return { x: bx, y: by };
    const group = this.groupOf.get(hit)!;
    let best: { entry: { x: number; y: number }; exit: { x: number; y: number }; onIt: boolean } | null = null;
    let bestCost = Infinity;
    for (const p of this.passages) {
      // このさえぎりにかかっている橋・門だけ
      const host = this.hostOf(p, group);
      if (!host) continue;
      // かかっている川・壁が縦長なら左右に、横長なら上下に渡る
      const vertical = host.h >= host.w;
      const sideOf = (x: number, y: number) => (vertical ? Math.sign(x - (host.x + host.w / 2)) : Math.sign(y - (host.y + host.h / 2)));
      const to = sideOf(bx, by);
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
      // 出口は行き先の側の端、入口はその反対の端（橋の真ん中＝川の中心線の上にいても迷わないように）
      const exit = sideOf(ends[0].x, ends[0].y) === to ? ends[0] : ends[1];
      const entry = exit === ends[0] ? ends[1] : ends[0];
      const cost = Math.hypot(entry.x - ax, entry.y - ay) + Math.hypot(exit.x - entry.x, exit.y - entry.y) + Math.hypot(bx - exit.x, by - exit.y);
      if (cost < bestCost) {
        bestCost = cost;
        best = { entry, exit, onIt: inside(p, ax, ay) };
      }
    }
    if (!best) return this.aroundCorner(group, ax, ay, bx, by);
    // 橋の上にいるか、橋の手前まで来たら、向こう側へ
    if (best.onIt || Math.hypot(best.entry.x - ax, best.entry.y - ay) < 24) return best.exit;
    return best.entry;
  }
}
