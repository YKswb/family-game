import { UNIT_DATA, type SoldierKind, type UnitData, type UnitKind } from '../data/unitData';
import { updateHoldSquad } from '../ai/EnemyAI';
import { layoutSquad } from '../ai/Formation';
import { updateFollowSquads, updateSoldier } from '../ai/SquadAI';
import { Hero } from '../entities/Hero';
import { Squad, type SquadMode } from '../entities/Squad';
import { Unit, type Side } from '../entities/Unit';
import { computeDamage } from './Combat';
import { Random } from './Random';
import { SpatialGrid } from './Spatial';

export interface SquadSpec {
  side: Side;
  kind: SoldierKind;
  count: number;
  x: number;
  y: number;
  mode: SquadMode;
  /** 隊列の前方向。省略時は上向き */
  dir?: [number, number];
}

export interface WorldConfig {
  width: number;
  height: number;
  hero: { x: number; y: number };
  /** ジャンの最初の向き。省略時は上向き */
  heroDir?: [number, number];
  squads: SquadSpec[];
  /** 通れない円（森など） */
  obstacles?: { x: number; y: number; r: number }[];
  seed?: number;
  data?: UnitData;
}

/** gather: しゅうごう（隊列を守る）、charge: とつげき */
export type Order = 'gather' | 'charge';
export type Outcome = 'playing' | 'won' | 'lost';

export type WorldEvent =
  | { type: 'hit'; x: number; y: number; side: Side; multiplier: number; charge: boolean }
  | { type: 'death'; x: number; y: number; side: Side; kind: UnitKind }
  | { type: 'shoot'; x: number; y: number }
  | { type: 'squadWiped'; squad: Squad };

export interface Arrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  from: Unit;
  target: Unit;
  side: Side;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** 戦場1つ分の状態と時間の進め方。描画とは切り離してあり、ヘッドレスでも動く */
export class World {
  readonly data: UnitData;
  readonly width: number;
  readonly height: number;
  readonly units: Unit[] = [];
  readonly squads: Squad[] = [];
  readonly obstacles: { x: number; y: number; r: number }[];
  readonly hero: Hero;
  arrows: Arrow[] = [];
  /** このフレームで起きたこと（描画側が効果を出すのに使う） */
  readonly events: WorldEvent[] = [];

  time = 0;
  order: Order = 'gather';
  outcome: Outcome = 'playing';
  /** 移動の入力（長さ0〜1） */
  input = { x: 0, y: 0 };
  /** ジャンの進行方向（単位ベクトル） */
  headX = 0;
  headY = -1;

  readonly grid: SpatialGrid<Unit>;
  readonly rng: Random;
  private nextId = 0;

  constructor(cfg: WorldConfig) {
    this.data = cfg.data ?? UNIT_DATA;
    this.width = cfg.width;
    this.height = cfg.height;
    this.obstacles = cfg.obstacles ?? [];
    this.rng = new Random(cfg.seed ?? 1);
    this.grid = new SpatialGrid<Unit>(cfg.width, cfg.height, this.data.ai.gridCell);
    this.hero = new Hero(this.nextId++, this.data.kinds.hero, cfg.hero.x, cfg.hero.y);
    this.units.push(this.hero);
    if (cfg.heroDir) [this.headX, this.headY] = cfg.heroDir;
    for (const s of cfg.squads) this.addSquad(s);
    updateFollowSquads(this);
    for (const sq of this.squads) {
      if (sq.mode !== 'follow') continue;
      for (const u of sq.units) {
        u.x = u.slotX;
        u.y = u.slotY;
      }
    }
  }

  addSquad(spec: SquadSpec): Squad {
    const [dx, dy] = spec.dir ?? [0, -1];
    const sq = new Squad(this.squads.length, spec.side, spec.kind, spec.mode, spec.x, spec.y, dx, dy);
    const stats = this.data.kinds[spec.kind];
    for (let i = 0; i < spec.count; i++) {
      const u = new Unit(this.nextId++, spec.kind, spec.side, stats, spec.x, spec.y, sq, this.rng.next());
      u.speed *= this.rng.range(0.93, 1.07);
      sq.units.push(u);
      this.units.push(u);
    }
    sq.followIndex = this.squads.filter((s) => s.mode === 'follow').length;
    this.squads.push(sq);
    layoutSquad(sq, spec.x, spec.y, dx, dy, this.data.ai.formationSpacing, this.data.ai.formationColumns);
    for (const u of sq.units) {
      u.x = u.slotX;
      u.y = u.slotY;
    }
    return sq;
  }

  step(dt: number): void {
    this.events.length = 0;
    this.time += dt;
    this.grid.rebuild(this.aliveUnits());
    this.updateHero(dt);
    updateFollowSquads(this);
    for (const sq of this.squads) if (sq.mode === 'hold') updateHoldSquad(this, sq);
    for (const u of this.units) {
      if (!u.dead && u.squad) updateSoldier(this, u, dt);
    }
    this.separate();
    this.updateArrows(dt);
    this.checkOutcome();
  }

  *aliveUnits(): Iterable<Unit> {
    for (const u of this.units) if (!u.dead) yield u;
  }

  countAlive(side: Side, includeHero = false): number {
    let n = 0;
    for (const u of this.units) {
      if (u.dead || u.side !== side) continue;
      if (!includeHero && u === this.hero) continue;
      n++;
    }
    return n;
  }

  /**
   * (x, y) から radius 以内で一番近い、side 以外の陣営のユニット。
   * ジャンは少し遠い扱いにして、兵士が先に兵士を狙うようにする
   */
  nearestFoe(side: Side, x: number, y: number, radius: number, self?: Unit): Unit | null {
    // self（近接）を渡したときは、すでに斬りかかる人数が上限に達した相手を避ける。
    // 上限内の相手が見つからなければ、上限を無視して一番近い相手にする
    const limitFor = self && !self.isRanged ? self : null;
    let best: Unit | null = null;
    let bestD = radius;
    let any: Unit | null = null;
    let anyD = radius;
    this.grid.forEachNear(x, y, radius + 20, (o) => {
      if (o.dead || o.side === side) return;
      const d = this.targetDistance(x, y, o);
      if (d < anyD) {
        anyD = d;
        any = o;
      }
      if (limitFor) {
        // 自分の今の相手なら自分の分を差し引いて数える
        const others = o.attackers - (limitFor.target === o ? 1 : 0);
        if (others >= this.maxAttackers(o)) return;
      }
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    });
    return best ?? any;
  }

  /** 1人の相手に同時に斬りかかれる人数（ジャンが全員に囲まれないように） */
  maxAttackers(o: Unit): number {
    return o.kind === 'hero' ? this.data.ai.maxAttackersOnHero : this.data.ai.maxAttackersOnSoldier;
  }

  /** u の狙いを t に変え、斬りかかっている人数を数え直す（近接だけ数える） */
  setTarget(u: Unit, t: Unit | null): void {
    if (u.target === t) return;
    if (!u.isRanged) {
      if (u.target) u.target.attackers--;
      if (t) t.attackers++;
    }
    u.target = t;
  }

  /** 狙う相手を選ぶときの距離（体の大きさを引き、ジャンは少し遠い扱い） */
  targetDistance(x: number, y: number, o: Unit): number {
    return dist(x, y, o.x, o.y) - o.radius + (o.kind === 'hero' ? this.data.ai.heroTargetPenalty : 0);
  }

  /** attacker の一撃（近接・矢の両方）を target に当てる */
  strike(attacker: Unit, target: Unit): void {
    if (target.dead) return;
    const charging = attacker.chargeReady;
    const r = computeDamage(this.data, attacker.kind, target.kind, { attack: attacker.attack, charging });
    attacker.chargeReady = false;
    attacker.moveTime = 0;
    if (attacker.stats.stopsCharge) {
      target.chargeReady = false;
      target.moveTime = 0;
    }
    target.hp -= r.damage;
    target.hitFlash = 0.12;
    if (target instanceof Hero) {
      target.sinceHit = 0;
    } else {
      const kb = target.kind === 'general' ? this.data.combat.knockbackHeavy : this.data.combat.knockback;
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const d = Math.hypot(dx, dy) || 1;
      target.kx += (dx / d) * kb;
      target.ky += (dy / d) * kb;
    }
    this.events.push({
      type: 'hit',
      x: target.x,
      y: target.y,
      side: target.side,
      multiplier: r.multiplier,
      charge: charging && (attacker.stats.chargeMultiplier ?? 1) > 1,
    });
    if (target.hp <= 0) this.kill(target);
  }

  shoot(from: Unit, target: Unit): void {
    this.arrows.push({ x: from.x, y: from.y - 12, vx: 0, vy: 0, life: this.data.combat.arrowLife, from, target, side: from.side });
    this.events.push({ type: 'shoot', x: from.x, y: from.y });
  }

  private kill(u: Unit): void {
    u.dead = true;
    u.hp = 0;
    this.setTarget(u, null);
    this.events.push({ type: 'death', x: u.x, y: u.y, side: u.side, kind: u.kind });
    if (u.squad && u.squad.aliveCount === 0) this.events.push({ type: 'squadWiped', squad: u.squad });
  }

  private updateHero(dt: number): void {
    const h = this.hero;
    if (h.dead) return;
    h.hitFlash = Math.max(0, h.hitFlash - dt);
    h.swing = Math.max(0, h.swing - dt * 5);

    let ix = this.input.x;
    let iy = this.input.y;
    const m = Math.hypot(ix, iy);
    if (m > 1) {
      ix /= m;
      iy /= m;
    }
    h.moving = m > 0.05;
    if (h.moving) {
      h.x += ix * h.speed * dt;
      h.y += iy * h.speed * dt;
      h.bob += dt * 12;
      if (Math.abs(ix) > 0.1) h.face = ix > 0 ? 1 : -1;
      // 進行方向はなめらかに追従させる（隊列が急に入れ替わらないように）
      const k = Math.min(1, dt * 4);
      this.headX += (ix / m - this.headX) * k;
      this.headY += (iy / m - this.headY) * k;
      const l = Math.hypot(this.headX, this.headY) || 1;
      this.headX /= l;
      this.headY /= l;
    }

    // 3秒ダメージを受けなければ回復
    h.sinceHit += dt;
    const st = h.stats;
    if (h.sinceHit > (st.regenDelay ?? Infinity) && h.hp < h.maxHp) {
      h.hp = Math.min(h.maxHp, h.hp + (st.regenPerSecond ?? 0) * dt);
    }

    // 近くの敵を自動で斬る
    h.cooldown -= dt;
    if (h.cooldown <= 0) {
      const foe = this.nearestFoe('ally', h.x, h.y, h.radius + h.reach + 20);
      if (foe && dist(h.x, h.y, foe.x, foe.y) <= h.radius + foe.radius + h.reach) {
        h.cooldown = h.interval;
        h.swing = 1;
        h.face = foe.x >= h.x ? 1 : -1;
        this.strike(h, foe);
      }
    }
  }

  /** 重なった兵士どうしを押し広げ、場外に出ないようにする */
  private separate(): void {
    this.grid.rebuild(this.aliveUnits());
    for (const a of this.units) {
      if (a.dead) continue;
      this.grid.forEachNear(a.x, a.y, 30, (b) => {
        if (b.id <= a.id || b.dead) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const m = a.radius + b.radius;
        if (Math.abs(dx) >= m || Math.abs(dy) >= m) return;
        const d = Math.hypot(dx, dy);
        if (d >= m || d < 0.01) return;
        const k = (m - d) / 2 / d;
        a.x -= dx * k;
        a.y -= dy * k;
        b.x += dx * k;
        b.y += dy * k;
      });
    }
    for (const u of this.units) {
      if (u.dead) continue;
      for (const o of this.obstacles) {
        const dx = u.x - o.x;
        const dy = u.y - o.y;
        const m = o.r + u.radius;
        if (Math.abs(dx) >= m || Math.abs(dy) >= m) continue;
        const d = Math.hypot(dx, dy);
        if (d < m && d > 0.01) {
          u.x = o.x + (dx / d) * m;
          u.y = o.y + (dy / d) * m;
        }
      }
      u.x = Math.min(this.width - u.radius, Math.max(u.radius, u.x));
      u.y = Math.min(this.height - u.radius, Math.max(u.radius, u.y));
    }
  }

  private updateArrows(dt: number): void {
    const speed = this.data.combat.arrowSpeed;
    for (const a of this.arrows) {
      a.life -= dt;
      const t = a.target;
      if (!t.dead) {
        const dx = t.x - a.x;
        const dy = t.y - 10 - a.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < t.radius + 5) {
          this.strike(a.from, t);
          a.life = 0;
          continue;
        }
        a.vx = (dx / d) * speed;
        a.vy = (dy / d) * speed;
      } else if (!a.vx && !a.vy) {
        a.life = 0;
        continue;
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
    }
    this.arrows = this.arrows.filter((a) => a.life > 0);
  }

  private checkOutcome(): void {
    if (this.outcome !== 'playing') return;
    if (this.hero.dead) this.outcome = 'lost';
    else if (this.countAlive('enemy') === 0) this.outcome = 'won';
  }
}
