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

export interface StageStats {
  seconds: number;
  broken: string | null;
  recruited: number;
  whistles: number;
  /** 起きた会話の順番 */
  dialogs: string[];
  /** 最後に、率いている兵士のうちジャンの近く（500以内）にいる割合 */
  nearHeroRatio: number;
  /** 大将が気づいたときに率いていた兵士の数 */
  followingAtBoss: number;
  /** 待機部隊のそばにいたフレーム数（補充しに行った目安） */
  refillFrames: number;
}

/**
 * ステージを通すボット。旗の部隊を集め、護衛から順に敵の部隊を倒し、最後に大将を倒す。
 * 川は橋を経由して渡る（ジャンの行き先にも地形の経路を使う）
 */
export function runStageBot(w: World, maxSeconds = 900, dt = 1 / 60): StageStats {
  let refillsDone = 0;
  let followingAtBoss = -1;
  const startX = w.hero.x;
  const startY = w.hero.y;
  let retreating = false;
  let whistles = 0;
  let broken: string | null = null;
  const dialogs: string[] = [];

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
    const guarded = w.isGeneralGuarded();
    const foeSquad = nearestSquad(w, (s) => s.side === 'enemy' && (!guarded || s !== w.generalSquad));
    // 旗の部隊と敵の部隊のうち、近い方から順に進む（敵の中を突っ切って旗を取りに行かない）
    const distTo = (s: typeof neutral) => (s ? Math.hypot(s.center().x - h.x, s.center().y - h.y) : Infinity);
    const recruitFirst = neutral !== null && distTo(neutral) <= distTo(foeSquad);
    // 率いている兵士が半分を切ったら、兵士の戻った待機部隊へ補充しに行く
    const following = w.followingSquads();
    const have = following.reduce((n, s) => n + s.aliveCount, 0);
    const cap = following.reduce((n, s) => n + s.capacity, 0) + (w.leadership - following.length) * 10;
    // いま触れている待機部隊は目指さない（触れれば補充されるので、次へ向かう）
    const refill = have < cap * 0.5 ? nearestSquad(w, (s) => s.waiting && s.aliveCount >= 5 && !w.isTouching(s)) : null;
    if (refill && Math.hypot(refill.center().x - h.x, refill.center().y - h.y) < 80) refillsDone++;
    if (retreating) {
      // 8方向のうち、敵からいちばん遠くなる場所へ下がって回復を待つ
      // （スタート地点まで戻ると時間がかかりすぎ、敵から真っすぐ離れると隅に追い詰められる）
      const foes = w.units.filter((u) => !u.dead && u.side === 'enemy');
      let bestScore = -Infinity;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const cx = Math.min(w.width - 80, Math.max(80, h.x + Math.cos(a) * 350));
        const cy = Math.min(w.height - 80, Math.max(80, h.y + Math.sin(a) * 350));
        if (w.terrain.isBlocked(cx, cy, 20)) continue;
        let minD = Infinity;
        for (const f of foes) minD = Math.min(minD, Math.hypot(f.x - cx, f.y - cy));
        if (minD > bestScore) {
          bestScore = minD;
          tx = cx;
          ty = cy;
        }
      }
    } else if (refill) {
      ({ x: tx, y: ty } = refill.center());
    } else if (recruitFirst && neutral) {
      ({ x: tx, y: ty } = neutral.center());
    } else if (foeSquad) {
      const near = w.nearestFoe('ally', h.x, h.y, 150);
      const target = near && !(guarded && near === w.general) ? near : null;
      const c = foeSquad.center();
      tx = target?.x ?? c.x;
      ty = target?.y ?? c.y;
      stopAt = target ? h.radius + target.radius : 40;
      w.setOrder(Math.hypot(c.x - h.x, c.y - h.y) < 500 ? 'charge' : 'gather');
    }
    const p = w.terrain.waypoint(h.x, h.y, tx, ty);
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const d = Math.hypot(dx, dy);
    const stop = p.x === tx && p.y === ty ? stopAt : 4;
    w.input = d > stop ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };

    w.step(dt);
    for (const e of w.events) if (e.type === 'dialog') dialogs.push(e.key);
    if (followingAtBoss < 0 && w.generalSquad?.alert) followingAtBoss = w.countFollowing();

    for (const u of w.units) {
      if (u.dead) continue;
      if (!Number.isFinite(u.x) || !Number.isFinite(u.y) || !Number.isFinite(u.hp)) broken ??= `NaN: unit ${u.id}`;
      if (u.x < 0 || u.y < 0 || u.x > w.width || u.y > w.height) broken ??= `場外: unit ${u.id}`;
      if (w.terrain.isBlocked(u.x, u.y)) broken ??= `川の中: unit ${u.id} (${u.x | 0}, ${u.y | 0})`;
    }
  }
  const following = w.followingSquads().flatMap((s) => s.alive);
  const near = following.filter((u) => Math.hypot(u.x - w.hero.x, u.y - w.hero.y) < 500).length;
  const recruited = w.squads.filter((s) => s.side === 'ally' && (s.mode === 'follow' || s.waiting)).length;
  return { seconds: w.time, broken, recruited, whistles, dialogs, nearHeroRatio: following.length ? near / following.length : 1, followingAtBoss, refillFrames: refillsDone };
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
