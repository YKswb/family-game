import type { Squad } from '../entities/Squad';
import type { Unit } from '../entities/Unit';

/**
 * 兵士の並び。(cx, cy) を先頭の中央として、向き (dirX, dirY) を前に
 * columns 列ずつ後ろへ並べる（10人なら5列×2段）。人数が半端な段も中央にそろえる
 */
export function layoutUnits(
  units: readonly Unit[],
  cx: number,
  cy: number,
  dirX: number,
  dirY: number,
  spacing: number,
  columns: number,
): void {
  // 横方向（向きを90度回したもの）
  const px = -dirY;
  const py = dirX;
  const n = units.length;
  units.forEach((u, i) => {
    const rowStart = i - (i % columns);
    const inRow = Math.min(columns, n - rowStart);
    const lx = ((i % columns) - (inRow - 1) / 2) * spacing;
    const ly = Math.floor(i / columns) * spacing;
    u.slotX = cx + px * lx - dirX * ly;
    u.slotY = cy + py * lx - dirY * ly;
  });
}

/** 部隊の生き残り全員を1つのかたまりとして並べる */
export function layoutSquad(
  sq: Squad,
  cx: number,
  cy: number,
  dirX: number,
  dirY: number,
  spacing: number,
  columns: number,
): void {
  layoutUnits(sq.alive, cx, cy, dirX, dirY, spacing, columns);
}

/** ジャンの位置と進行方向から、隊列 offset（[横, 後ろ]）の地点を求める */
export function followAnchor(
  heroX: number,
  heroY: number,
  headX: number,
  headY: number,
  offset: readonly [number, number],
): { x: number; y: number } {
  const px = -headY;
  const py = headX;
  return {
    x: heroX + px * offset[0] - headX * offset[1],
    y: heroY + py * offset[0] - headY * offset[1],
  };
}
