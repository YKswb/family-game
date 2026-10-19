import arena from '../data/arena.json';
import type { SoldierKind } from '../data/unitData';
import type { WorldConfig } from './World';

export const ARENA = arena as {
  width: number;
  height: number;
  groundColor: string;
  hero: { x: number; y: number; dir: [number, number] };
  ally: { count: number };
  enemy: { x: number; y: number; count: number; dir: [number, number] };
  trees: { x: number; y: number; r: number }[];
};

/** 練習場：ジャンが率いる1部隊と、持ち場を守る敵1部隊 */
export function arenaConfig(allyKind: SoldierKind, enemyKind: SoldierKind, seed = 1): WorldConfig {
  const a = ARENA;
  return {
    width: a.width,
    height: a.height,
    hero: { x: a.hero.x, y: a.hero.y },
    heroDir: a.hero.dir,
    seed,
    obstacles: a.trees,
    squads: [
      { side: 'ally', kind: allyKind, count: a.ally.count, x: a.hero.x, y: a.hero.y, mode: 'follow' },
      { side: 'enemy', kind: enemyKind, count: a.enemy.count, x: a.enemy.x, y: a.enemy.y, mode: 'hold', dir: a.enemy.dir },
    ],
  };
}
