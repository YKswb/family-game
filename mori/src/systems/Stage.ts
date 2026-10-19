import type { StageData } from '../data/gameData';
import { Random } from './Random';

export interface TreeSpec {
  x: number;
  y: number;
  size: number;
}

/**
 * ステージの木の配置を種から決める。おうちのまわりの空き地と、将来の建設地点の場所には生やさない
 * （今の版と同じ方式で、数に届かなくても試行回数で打ち切る）
 */
export function placeTrees(stage: StageData, rng: Random): TreeSpec[] {
  const t = stage.trees;
  const { x: hx, y: hy } = stage.house;
  const out: TreeSpec[] = [];
  const limit = t.count * 35;
  for (let i = 0; i < limit && out.length < t.count; i++) {
    const x = rng.range(t.margin, stage.width - t.margin);
    const y = rng.range(t.margin + 20, stage.height - t.margin + 10);
    if (Math.hypot(x - hx, y - hy) < t.minFromHouse) continue;
    if (t.keepClear.some(([dx, dy]) => Math.hypot(x - hx - dx, y - hy - dy) < t.keepClearRadius)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < t.spacing)) continue;
    out.push({ x, y, size: rng.range(0.9, 1.12) });
  }
  return out;
}
