import type { StageData } from '../data/stageData';
import type { WorldConfig } from './World';

/** ステージのデータ（data/stages/stageN.json）から戦場を作るための設定 */
export function stageConfig(stage: StageData, seed = 1): WorldConfig {
  const t = stage.terrain;
  return {
    width: stage.width,
    height: stage.height,
    hero: { x: stage.start.hero.x, y: stage.start.hero.y },
    heroDir: stage.start.hero.dir,
    jeanne: stage.start.jeanne ?? null,
    seed,
    obstacles: t.forests,
    blockers: [...t.rivers, ...t.walls],
    passages: t.bridges,
    gates: t.gates.map((g, i) => ({ id: g.id ?? `gate${i}`, rect: { x: g.x, y: g.y, w: g.w, h: g.h }, open: !g.closed })),
    squads: stage.squads,
    general: stage.general,
    events: stage.events,
    enemyRetreat: !!stage.enemyRetreat,
  };
}
