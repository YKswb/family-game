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

export interface PracticeStats {
  seconds: number;
  broken: string | null;
  /** 仲間にした部隊の数（待機を含む） */
  recruited: number;
  whistles: number;
  /**
   * 旗の部隊を集め終えて3秒たったあと、ジャンが同じ向きに1秒以上進み続けているときの、
   * 弓兵のジャンより前への出っぱりの最大（仲間にした直後や引き返した直後は、後ろへ回り込む途中なので除く）
   */
  maxArcherAheadSteady: number;
}

/**
 * 部隊の練習場を通すボット。旗の部隊を近い順に集め、敵に近づいたら「とつげき」、
 * HPが減ったら集合の笛を吹いて下がり、回復したらまた攻める
 */
export function runPracticeBot(w: World, maxSeconds = 300, dt = 1 / 60, onStep?: () => void): PracticeStats {
  const startX = w.hero.x;
  const startY = w.hero.y;
  let retreating = false;
  let whistles = 0;
  let broken: string | null = null;
  let maxArcherAheadSteady = -Infinity;
  // 1秒前の進行方向を覚えておき、向きが安定しているかを見る
  const headHistory: { x: number; y: number }[] = [];
  let movingFor = 0;
  let recruitDoneAt = -1;

  while (w.outcome === 'playing' && w.time < maxSeconds) {
    const h = w.hero;
    if (!retreating && h.hp < h.maxHp * 0.35) {
      retreating = true;
      w.whistle();
      whistles++;
    }
    if (retreating && h.hp > h.maxHp * 0.8) retreating = false;

    let tx = startX;
    let ty = startY;
    let stopAt = 20;
    const neutral = nearestSquad(w, (s) => s.mode === 'neutral');
    if (!retreating && neutral) {
      ({ x: tx, y: ty } = neutral.center());
    } else if (!retreating) {
      const near = w.nearestFoe('ally', h.x, h.y, 150);
      const sq = nearestSquad(w, (s) => s.side === 'enemy');
      const foe = near ?? sq?.center() ?? null;
      if (foe) {
        tx = foe.x;
        ty = foe.y;
        stopAt = near ? h.radius + near.radius : 40;
      }
      if (sq) {
        const c = sq.center();
        w.setOrder(Math.hypot(c.x - h.x, c.y - h.y) < 500 ? 'charge' : 'gather');
      }
    }
    const dx = tx - h.x;
    const dy = ty - h.y;
    const d = Math.hypot(dx, dy);
    w.input = d > stopAt ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };

    w.step(dt);
    onStep?.();

    headHistory.push({ x: w.headX, y: w.headY });
    if (headHistory.length > 60) headHistory.shift();
    movingFor = w.hero.moving ? movingFor + dt : 0;
    if (recruitDoneAt < 0 && !w.squads.some((s) => s.mode === 'neutral')) recruitDoneAt = w.time;
    const old = headHistory[0];
    const steady =
      recruitDoneAt >= 0 &&
      w.time > recruitDoneAt + 3 &&
      headHistory.length === 60 &&
      old.x * w.headX + old.y * w.headY > 0.98 &&
      movingFor > 1;

    for (const u of w.units) {
      if (u.dead) continue;
      if (!Number.isFinite(u.x) || !Number.isFinite(u.y) || !Number.isFinite(u.hp)) broken ??= `NaN: unit ${u.id}`;
      if (u.x < 0 || u.y < 0 || u.x > w.width || u.y > w.height) broken ??= `場外: unit ${u.id}`;
      if (steady && u.isRanged && u.squad?.mode === 'follow') maxArcherAheadSteady = Math.max(maxArcherAheadSteady, w.forwardOf(u));
    }
  }
  const recruited = w.squads.filter((s) => s.side === 'ally' && (s.mode === 'follow' || s.waiting)).length;
  return { seconds: w.time, broken, recruited, whistles, maxArcherAheadSteady };
}

function nearestSquad(w: World, pred: (s: World['squads'][number]) => boolean): World['squads'][number] | null {
  let best: World['squads'][number] | null = null;
  let bd = Infinity;
  for (const sq of w.squads) {
    if (!pred(sq) || sq.aliveCount === 0) continue;
    const c = sq.center();
    const d = Math.hypot(c.x - w.hero.x, c.y - w.hero.y);
    if (d < bd) {
      bd = d;
      best = sq;
    }
  }
  return best;
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
