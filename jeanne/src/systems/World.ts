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
import { EventRunner } from './Events';
import { Terrain, type Rect } from './Terrain';
import type { StageEvent, StageGeneral } from '../data/stageData';

export interface SquadSpec {
  side: Side;
  kind: SoldierKind;
  count: number;
  x: number;
  y: number;
  mode: SquadMode;
  /** 隊列の前方向。省略時は上向き */
  dir?: [number, number];
  /** ステージデータでの名前 */
  id?: string;
  /** 巡回ルート（くり返す） */
  patrol?: [number, number][];
  /** 進軍ルート（最後の地点で止まって守る） */
  route?: [number, number][];
  /** 巡回・進軍の速さ */
  speed?: number;
  alertRadius?: number;
  /** 最初から警戒している */
  alert?: boolean;
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
  /** 通れない四角（川・壁）と、その上を通れる四角（橋・門） */
  blockers?: Rect[];
  passages?: Rect[];
  /** 敵の大将（護衛が全滅するまで無敵） */
  general?: StageGeneral;
  /** ステージのイベント。あるときはイベントの「勝利」でだけクリアになる */
  events?: StageEvent[];
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
  | { type: 'squadWiped'; squad: Squad }
  | { type: 'recruit'; squad: Squad; waiting: boolean }
  | { type: 'reinforce'; from: Squad; count: number }
  | { type: 'revive'; squad: Squad; x: number; y: number }
  | { type: 'depotEmpty'; squad: Squad }
  | { type: 'order'; order: Order }
  | { type: 'whistle' }
  | { type: 'dialog'; key: string }
  | { type: 'guarded'; x: number; y: number };

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
  readonly terrain: Terrain;
  readonly hero: Hero;
  /** 敵の大将と、大将だけの部隊 */
  general: Unit | null = null;
  generalSquad: Squad | null = null;
  private guardIds: string[] = [];
  private readonly script: EventRunner | null;
  /** たおした敵の数 */
  kills = 0;
  arrows: Arrow[] = [];
  /** このフレームで起きたこと（描画側が効果を出すのに使う） */
  readonly events: WorldEvent[] = [];

  time = 0;
  order: Order = 'gather';
  /** 率いられる部隊の数 */
  leadership: number;
  /** 集合の笛の効果が残っている秒数 */
  recallTime = 0;
  outcome: Outcome = 'playing';
  /** 移動の入力（長さ0〜1） */
  input = { x: 0, y: 0 };
  /** ジャンの進行方向（単位ベクトル） */
  headX = 0;
  headY = -1;

  readonly grid: SpatialGrid<Unit>;
  readonly rng: Random;
  private nextId = 0;
  private nextFollowIndex = 0;
  /** いまジャンが触れている旗の部隊・待機部隊（触れた瞬間を見分けるため） */
  private readonly touching = new Set<Squad>();

  constructor(cfg: WorldConfig) {
    this.data = cfg.data ?? UNIT_DATA;
    this.width = cfg.width;
    this.height = cfg.height;
    this.obstacles = cfg.obstacles ?? [];
    this.terrain = new Terrain(cfg.blockers, cfg.passages);
    this.script = cfg.events ? new EventRunner(cfg.events) : null;
    this.rng = new Random(cfg.seed ?? 1);
    this.grid = new SpatialGrid<Unit>(cfg.width, cfg.height, this.data.ai.gridCell);
    this.hero = new Hero(this.nextId++, this.data.kinds.hero, cfg.hero.x, cfg.hero.y);
    this.leadership = this.data.kinds.hero.leadership ?? 3;
    this.units.push(this.hero);
    if (cfg.heroDir) [this.headX, this.headY] = cfg.heroDir;
    for (const s of cfg.squads) this.addSquad(s);
    if (cfg.general) this.addGeneral(cfg.general);
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
    sq.capacity = spec.count;
    sq.name = spec.id ?? `squad${sq.id}`;
    if (spec.patrol || spec.route) {
      sq.route = spec.patrol ?? spec.route ?? null;
      sq.routeLoop = !!spec.patrol;
      sq.routeSpeed = spec.speed ?? this.data.ai.patrolSpeed;
    }
    sq.alertRadius = spec.alertRadius ?? null;
    sq.alert = !!spec.alert;
    const stats = this.data.kinds[spec.kind];
    for (let i = 0; i < spec.count; i++) {
      const u = new Unit(this.nextId++, spec.kind, spec.side, stats, spec.x, spec.y, sq, this.rng.next());
      u.speed *= this.rng.range(0.93, 1.07);
      sq.units.push(u);
      this.units.push(u);
    }
    if (spec.mode === 'follow') sq.followIndex = this.nextFollowIndex++;
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
    this.recallTime = Math.max(0, this.recallTime - dt);
    this.updateRecruit();
    this.reviveWaiting(dt);
    updateFollowSquads(this);
    for (const sq of this.squads) if (sq.mode === 'hold') updateHoldSquad(this, sq, dt);
    this.markArcherLine();
    for (const u of this.units) {
      if (!u.dead && u.squad) updateSoldier(this, u, dt);
    }
    this.separate();
    this.enforceArcherLine();
    this.updateArrows(dt);
    this.script?.update(this);
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
      if (o.side === side || !this.isTargetable(o)) return;
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

  /**
   * 狙える相手か。旗の部隊と待機している部隊は「休んでいる仲間」なので、戦わず、狙われもしない
   * （待機部隊は補充の拠点。戻ってきた兵士が近くの敵にすぐ倒されないように）
   */
  isTargetable(o: Unit): boolean {
    return !o.dead && o.squad?.mode !== 'neutral' && !o.squad?.waiting;
  }

  /** 狙う相手を選ぶときの距離（体の大きさを引き、ジャンは少し遠い扱い） */
  targetDistance(x: number, y: number, o: Unit): number {
    return dist(x, y, o.x, o.y) - o.radius + (o.kind === 'hero' ? this.data.ai.heroTargetPenalty : 0);
  }

  // ---- ステージ ----

  /** 大将を、大将ひとりだけの「持ち場を守る部隊」として置く */
  private addGeneral(g: StageGeneral): void {
    const [dx, dy] = g.dir ?? [0, 1];
    const sq = new Squad(this.squads.length, 'enemy', 'general', 'hold', g.x, g.y, dx, dy);
    sq.name = g.id;
    sq.capacity = 1;
    const stats = { ...this.data.kinds.general, hp: g.hp, attack: g.attack };
    const u = new Unit(this.nextId++, 'general', 'enemy', stats, g.x, g.y, sq, this.rng.next());
    sq.units.push(u);
    this.units.push(u);
    this.squads.push(sq);
    this.general = u;
    this.generalSquad = sq;
    this.guardIds = [...g.guards];
  }

  squadById(id: string): Squad | null {
    return this.squads.find((s) => s.name === id) ?? null;
  }

  /** 生き残りのいる護衛の部隊の数 */
  guardsLeft(): number {
    let n = 0;
    for (const id of this.guardIds) if ((this.squadById(id)?.aliveCount ?? 0) > 0) n++;
    return n;
  }

  /** 大将を守る護衛の部隊か */
  isGuardSquad(sq: Squad): boolean {
    return this.guardIds.includes(sq.name);
  }

  isGeneralGuarded(): boolean {
    return this.guardsLeft() > 0;
  }

  /** イベントの「勝利」 */
  win(): void {
    if (this.outcome === 'playing') this.outcome = 'won';
  }

  // ---- 部隊の運用 ----

  /** ジャンが率いている（生き残りのいる）部隊 */
  followingSquads(): Squad[] {
    return this.squads.filter((s) => s.mode === 'follow' && s.aliveCount > 0);
  }

  /** ジャンが率いている兵士の数 */
  countFollowing(): number {
    let n = 0;
    for (const sq of this.followingSquads()) n += sq.aliveCount;
    return n;
  }

  /**
   * 旗の部隊（または待機中の仲間）にジャンが触れたら仲間にする。
   * 率いられる数を超えるときは、その場で待機させる。
   * 待機中の部隊に触れているあいだは、率いている部隊の減った兵士を、待機の兵士で補う
   * （そばで戦っているうちに減った分も、触れ直さずに補充される）
   */
  private updateRecruit(): void {
    const h = this.hero;
    if (h.dead) return;
    for (const sq of this.squads) {
      if (sq.mode !== 'neutral' && !sq.waiting) continue;
      const inside = this.isTouching(sq);
      const touched = inside && !this.touching.has(sq);
      if (inside) this.touching.add(sq);
      else this.touching.delete(sq);
      if (!inside) continue;
      if (sq.aliveCount === 0) {
        // 空の待機部隊に触れたときは、まだ戻っていないことを知らせる（触れた瞬間に1回）
        // （補充で空にした直後の数秒は出さない）
        const justUsed = this.time - sq.lastReinforceTime < 3;
        if (touched && sq.waiting && !justUsed && this.missingSoldiers() > 0) this.events.push({ type: 'depotEmpty', squad: sq });
        continue;
      }
      if (this.followingSquads().length < this.leadership) {
        sq.mode = 'follow';
        sq.waiting = false;
        sq.alert = false;
        sq.followIndex = this.nextFollowIndex++;
        this.touching.delete(sq);
        this.events.push({ type: 'recruit', squad: sq, waiting: false });
      } else if (sq.mode === 'neutral') {
        // 上限を超えたので、旗を下ろしてその場を守る。触れたついでに、減っている部隊へ補充する
        sq.mode = 'hold';
        sq.waiting = true;
        this.events.push({ type: 'recruit', squad: sq, waiting: true });
        this.reinforceFrom(sq);
      } else {
        this.reinforceFrom(sq);
      }
    }
  }

  /**
   * 待機している部隊は、一定の間隔で兵士が1人ずつ戻ってくる（最初の人数まで）。
   * 補充で空になった待機部隊も戻ってくるので、補充の拠点として何度も使える
   */
  private reviveWaiting(dt: number): void {
    const interval = this.data.ai.waitingReviveSeconds;
    for (const sq of this.squads) {
      if (!sq.waiting || sq.kind === 'general') continue;
      if (sq.aliveCount >= sq.capacity) {
        sq.reviveTimer = 0;
        continue;
      }
      sq.reviveTimer += dt;
      if (sq.reviveTimer < interval) continue;
      sq.reviveTimer -= interval;
      const x = sq.postX + this.rng.range(-20, 20);
      const y = sq.postY + this.rng.range(-20, 20);
      const u = new Unit(this.nextId++, sq.kind, 'ally', this.data.kinds[sq.kind], x, y, sq, this.rng.next());
      u.speed *= this.rng.range(0.93, 1.07);
      sq.units.push(u);
      this.units.push(u);
      this.events.push({ type: 'revive', squad: sq, x, y });
    }
  }

  /**
   * ジャンがこの部隊に「触れている」か。兵士がいれば、いちばん近い兵士と体どうしの隙間が touchGap 以内。
   * ジャンは兵士に押し返されて部隊の真ん中までは入れないので、中心からの距離では判定しない（馬は体が大きく、特に届きにくい）。
   * 兵士のいない空の待機部隊は、持ち場から recruitRadius 以内
   */
  isTouching(sq: Squad): boolean {
    const h = this.hero;
    const ai = this.data.ai;
    let any = false;
    for (const u of sq.units) {
      if (u.dead) continue;
      any = true;
      if (dist(h.x, h.y, u.x, u.y) - u.radius - h.radius <= ai.touchGap) return true;
    }
    return !any && dist(h.x, h.y, sq.postX, sq.postY) <= ai.recruitRadius;
  }

  /** 率いている部隊で、最初の人数から減っている兵士の数 */
  missingSoldiers(): number {
    let n = 0;
    for (const s of this.followingSquads()) n += Math.max(0, s.capacity - s.aliveCount);
    return n;
  }

  /**
   * 待機の部隊 src の兵士を、率いている部隊のうち減っているものへ移す。
   * 兵種は問わず、減っている人数が多い部隊から順に、最初の人数まで埋める。残った兵士は待機のまま
   */
  private reinforceFrom(src: Squad): void {
    const targets = this.followingSquads()
      .filter((s) => s.aliveCount < s.capacity)
      .sort((a, b) => b.capacity - b.aliveCount - (a.capacity - a.aliveCount));
    if (targets.length === 0) return;
    const pool = src.alive;
    let moved = 0;
    for (const t of targets) {
      for (let need = t.capacity - t.aliveCount; need > 0 && pool.length > 0; need--) {
        const u = pool.shift()!;
        src.units.splice(src.units.indexOf(u), 1);
        t.units.push(u);
        u.squad = t;
        this.setTarget(u, null);
        moved++;
      }
    }
    if (moved > 0) {
      src.lastReinforceTime = this.time;
      this.events.push({ type: 'reinforce', from: src, count: moved });
    }
  }

  setOrder(order: Order): void {
    if (this.order === order) return;
    this.order = order;
    this.events.push({ type: 'order', order });
  }

  toggleOrder(): void {
    this.setOrder(this.order === 'charge' ? 'gather' : 'charge');
  }

  /** 集合の笛：率いている全部隊が戦いをやめてジャンのもとへ戻る（命令は「しゅうごう」になる） */
  whistle(): void {
    this.recallTime = this.data.ai.whistleSeconds;
    for (const sq of this.followingSquads()) {
      for (const u of sq.units) {
        if (u.dead) continue;
        this.setTarget(u, null);
        u.retargetIn = this.recallTime;
      }
    }
    this.setOrder('gather');
    this.events.push({ type: 'whistle' });
  }

  /** ジャンの進行方向に沿った前後の位置（前がプラス） */
  forwardOf(u: Unit): number {
    return (u.x - this.hero.x) * this.headX + (u.y - this.hero.y) * this.headY;
  }

  private isLineBound(u: Unit): boolean {
    return !u.dead && u.isRanged && u.squad?.mode === 'follow';
  }

  private markArcherLine(): void {
    for (const u of this.units) if (this.isLineBound(u)) u.lineF = this.forwardOf(u);
  }

  /**
   * 弓兵の後方ルール：率いている弓兵は「ジャンの位置から少し後ろの線」より前に出ない。
   * ジャンが向きを変えた直後など、すでに線より前にいる弓兵は、それ以上前に出られないだけにする
   */
  private enforceArcherLine(): void {
    const limit = -this.data.ai.archerLineMargin;
    for (const u of this.units) {
      if (!this.isLineBound(u)) continue;
      const allowed = Math.max(limit, u.lineF);
      const f = this.forwardOf(u);
      if (f > allowed) {
        u.x -= this.headX * (f - allowed);
        u.y -= this.headY * (f - allowed);
      }
    }
  }

  /** attacker の一撃（近接・矢の両方）を target に当てる */
  strike(attacker: Unit, target: Unit): void {
    // 休んでいる仲間（旗・待機の部隊）には、飛んできた矢なども当たらない
    if (!this.isTargetable(target)) return;
    // 大将は護衛が残っているあいだ無敵
    if (target === this.general && this.isGeneralGuarded()) {
      target.hitFlash = 0.05;
      this.events.push({ type: 'guarded', x: target.x, y: target.y });
      return;
    }
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
    if (u.side === 'enemy') this.kills++;
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
      // 進行方向は一定の速さで回して追従させる（隊列が急に入れ替わらないように）。
      // 真後ろへ引き返したときも回るよう、ベクトルを混ぜるのではなく角度で回す
      const cur = Math.atan2(this.headY, this.headX);
      let diff = Math.atan2(iy, ix) - cur;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = this.data.ai.headingTurnRate * dt;
      const a = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
      this.headX = Math.cos(a);
      this.headY = Math.sin(a);
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
      this.terrain.pushOut(u);
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
    else if (!this.script && this.countAlive('enemy') === 0) this.outcome = 'won';
  }
}
