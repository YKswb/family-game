import type { World } from '../src/systems/World';

export interface PlayStats {
  seconds: number;
  /** ジャンから一番遠くにいた味方兵士の距離（全フレームでの最大） */
  maxAllySpread: number;
  /** 味方兵士が自分の隊列位置から離れた距離の最大 */
  maxSlotDrift: number;
  /** NaN や場外が出たか */
  broken: string | null;
}

/**
 * ヘッドレス自動プレイのボット。ジャンを敵の中心へ向かわせ、
 * HPが減ったら下がって回復を待つ
 */
export function runBot(w: World, maxSeconds = 180, dt = 1 / 60, onStep?: () => void): PlayStats {
  const startX = w.hero.x;
  const startY = w.hero.y;
  let retreating = false;
  let maxAllySpread = 0;
  let maxSlotDrift = 0;
  let broken: string | null = null;

  while (w.outcome === 'playing' && w.time < maxSeconds) {
    const h = w.hero;
    if (h.hp < h.maxHp * 0.35) retreating = true;
    if (h.hp > h.maxHp * 0.8) retreating = false;

    let tx = startX;
    let ty = startY;
    let stopAt = 20;
    if (!retreating) {
      // 遠くの敵は部隊の中心へ、近づいたら一番近い敵兵へ向かう
      const near = w.nearestFoe('ally', h.x, h.y, 150);
      const foe = near ?? nearestEnemySquadCenter(w);
      if (foe) {
        tx = foe.x;
        ty = foe.y;
        stopAt = near ? h.radius + near.radius : 40;
      }
    }
    const dx = tx - h.x;
    const dy = ty - h.y;
    const d = Math.hypot(dx, dy);
    w.input = d > stopAt ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };

    w.step(dt);
    onStep?.();

    for (const u of w.units) {
      if (u.dead) continue;
      if (!Number.isFinite(u.x) || !Number.isFinite(u.y) || !Number.isFinite(u.hp)) broken ??= `NaN: unit ${u.id}`;
      if (u.x < 0 || u.y < 0 || u.x > w.width || u.y > w.height) broken ??= `場外: unit ${u.id}`;
      if (u.side === 'ally' && u.squad?.mode === 'follow') {
        maxAllySpread = Math.max(maxAllySpread, Math.hypot(u.x - h.x, u.y - h.y));
        maxSlotDrift = Math.max(maxSlotDrift, Math.hypot(u.x - u.slotX, u.y - u.slotY));
      }
    }
  }
  return { seconds: w.time, maxAllySpread, maxSlotDrift, broken };
}

function nearestEnemySquadCenter(w: World): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const sq of w.squads) {
    if (sq.side !== 'enemy' || sq.aliveCount === 0) continue;
    const c = sq.center();
    const d = Math.hypot(c.x - w.hero.x, c.y - w.hero.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** 部隊どうしだけを戦わせる（ジャンは遠くに置く）。生き残った人数を返す */
export function runSquadDuel(w: World, maxSeconds = 120, dt = 1 / 60): { ally: number; enemy: number; seconds: number } {
  w.input = { x: 0, y: 0 };
  while (w.time < maxSeconds && w.countAlive('ally') > 0 && w.countAlive('enemy') > 0) w.step(dt);
  return { ally: w.countAlive('ally'), enemy: w.countAlive('enemy'), seconds: w.time };
}
