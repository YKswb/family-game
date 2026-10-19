export interface Positioned {
  x: number;
  y: number;
}

/** 一様グリッド。索敵と押し合いで近くのものだけを調べるために使う */
export class SpatialGrid<T extends Positioned> {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: T[][];

  constructor(
    width: number,
    height: number,
    readonly cellSize: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const c of this.cells) c.length = 0;
  }

  insert(item: T): void {
    this.cells[this.indexOf(item.x, item.y)].push(item);
  }

  rebuild(items: Iterable<T>): void {
    this.clear();
    for (const it of items) this.insert(it);
  }

  /** (x, y) から半径 r の正方形にかかるセルの中身を順に渡す（距離の判定は呼び出し側で行う） */
  forEachNear(x: number, y: number, r: number, fn: (item: T) => void): void {
    const c0 = this.clampCol(Math.floor((x - r) / this.cellSize));
    const c1 = this.clampCol(Math.floor((x + r) / this.cellSize));
    const r0 = this.clampRow(Math.floor((y - r) / this.cellSize));
    const r1 = this.clampRow(Math.floor((y + r) / this.cellSize));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const cell = this.cells[row * this.cols + col];
        for (let i = 0; i < cell.length; i++) fn(cell[i]);
      }
    }
  }

  private indexOf(x: number, y: number): number {
    const col = this.clampCol(Math.floor(x / this.cellSize));
    const row = this.clampRow(Math.floor(y / this.cellSize));
    return row * this.cols + col;
  }

  private clampCol(c: number): number {
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private clampRow(r: number): number {
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }
}
