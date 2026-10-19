import arena from '../data/arena.json';
import practice from '../data/practice.json';
import type { SoldierKind } from '../data/unitData';
import type { SquadSpec, WorldConfig } from './World';

export const PRACTICE = practice as {
  width: number;
  height: number;
  groundColor: string;
  hero: { x: number; y: number; dir: [number, number] };
  squads: SquadSpec[];
  trees: { x: number; y: number; r: number }[];
};

/** 部隊の練習場：旗の部隊を集めて隊列を組み、敵の部隊と戦う */
export function practiceConfig(seed = 1): WorldConfig {
  const p = PRACTICE;
  return {
    width: p.width,
    height: p.height,
    hero: { x: p.hero.x, y: p.hero.y },
    heroDir: p.hero.dir,
    seed,
    obstacles: p.trees,
    squads: p.squads,
  };
}

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
