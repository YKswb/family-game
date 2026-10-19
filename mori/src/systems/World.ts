import {
  GAME_DATA,
  type BuildingType,
  type Difficulty,
  type EnemyKind,
  type GameData,
  type Perk,
  type StageData,
  type TowerKind,
} from '../data/gameData';
import { Enemy } from '../entities/Enemy';
import { House } from '../entities/House';
import { Player } from '../entities/Player';
import { Tree } from '../entities/Tree';
import { Spot, paySpot } from './Build';
import { damageTo, fromFront, knockbackOf, shieldable, type DamageSource } from './Combat';
import { updateEnemies } from './Enemies';
import { Random } from './Random';
import { placeTrees } from './Stage';
import { updateShots, updateTowers, wallGuardAt, type Shot } from './Towers';
import { applyPerk, baseModifiers, pickPerks, xpNeed, type Modifiers } from './Upgrades';
import { spawnInterval, waveDirections, waveHpMul, waveList } from './Waves';

export type WorldEvent =
  | { type: 'chop'; tree: Tree }
  | { type: 'fell'; tree: Tree }
  /** 木材を手に入れた（x, y は木材が飛び出した場所） */
  | { type: 'wood'; x: number; y: number; n: number }
  | { type: 'pickup' }
  | { type: 'pay'; spot: Spot }
  | { type: 'built'; spot: Spot }
  | { type: 'territory'; level: number }
  | { type: 'attack' }
  | { type: 'hit'; enemy: Enemy }
  | { type: 'death'; enemy: Enemy }
  | { type: 'spawn'; enemy: Enemy }
  | { type: 'summon'; enemy: Enemy }
  | { type: 'shoot'; spot: Spot }
  | { type: 'explode'; x: number; y: number; radius: number }
  | { type: 'wallHit'; spot: Spot }
  | { type: 'wallBroken'; spot: Spot }
  | { type: 'houseHit'; dmg: number }
  | { type: 'wave'; n: number; last: boolean }
  | { type: 'waveClear'; n: number }
  | { type: 'levelUp'; level: number }
  | { type: 'xpBonus'; n: number }
  /** かみなり：撃ち口から順にとんだ点 */
  | { type: 'zap'; spot: Spot; points: { x: number; y: number }[] }
  /** ちゆのとうが直した場所 */
  | { type: 'mend'; x: number; y: number }
  | { type: 'chill'; x: number; y: number; radius: number }
  | { type: 'freeze'; enemy: Enemy }
  /** たてで防いだ */
  | { type: 'blocked'; enemy: Enemy }
  /** 木こりが木を切り倒した */
  | { type: 'stolen'; enemy: Enemy; tree: Tree }
  /** 木こりが木を持って逃げきった */
  | { type: 'escape'; enemy: Enemy }
  | { type: 'healPulse'; enemy: Enemy; radius: number }
  | { type: 'won' }
  | { type: 'lost' };

/** move: 歩いてみよう → chop: 木を切ろう → build: 建ててみよう → done */
export type Tutorial = 'move' | 'chop' | 'build' | 'done';
export type Phase = 'prep' | 'fight';
export type Outcome = 'playing' | 'won' | 'lost';

/** 答えが出るまでゲームを止める選択。とうの種類、とうの分かれ道、レベルアップの強化 */
export type Choice = { type: 'tower'; spot: Spot } | { type: 'branch'; spot: Spot } | { type: 'perk'; options: Perk[] };

/** 大ほうの「もえる 地面」が残す火 */
export interface Fire {
  x: number;
  y: number;
  r: number;
  dps: number;
  /** 残りの秒数 */
  t: number;
}

/** 倒した敵が落とした木材 */
export interface Drop {
  x: number;
  y: number;
  /** 地面からの高さ（跳ねている間） */
  z: number;
  vz: number;
  vx: number;
  vy: number;
  t: number;
}

/** チュートリアルの「歩いてみよう」を終える距離 */
const TUTORIAL_WALK = 120;

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** 円 (cx, cy, r) の中に入った点を外へ押し出す */
function pushOut(o: { x: number; y: number }, cx: number, cy: number, r: number): void {
  const dx = o.x - cx;
  const dy = o.y - cy;
  const d = Math.hypot(dx, dy);
  if (d < r && d > 0.01) {
    o.x = cx + (dx / d) * r;
    o.y = cy + (dy / d) * r;
  }
}

export interface WorldOptions {
  seed?: number;
  /** 0: かんたん、1: ふつう、2: むずかしい */
  difficulty?: number;
  data?: GameData;
}

/** 1ステージ分の状態と時間の進め方。描画とは切り離してあり、ヘッドレスでも動く */
export class World {
  readonly data: GameData;
  readonly stage: StageData;
  readonly difficulty: number;
  readonly diff: Difficulty;
  readonly width: number;
  readonly height: number;
  readonly house: House;
  readonly player: Player;
  readonly trees: Tree[];
  readonly spots: Spot[] = [];
  /** かべの区画（添字が区画の番号） */
  readonly walls: Spot[] = [];
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  drops: Drop[] = [];
  fires: Fire[] = [];
  /** このフレームで起きたこと（描画側が効果を出すのに使う） */
  readonly events: WorldEvent[] = [];
  readonly rng: Random;

  time = 0;
  /** 移動の入力（長さ0〜1） */
  input = { x: 0, y: 0 };
  /** 領地の段階（stage.territory の添字） */
  territoryLevel = 0;
  tutorial: Tutorial = 'move';
  outcome: Outcome = 'playing';
  /** クリアしたときの評価（★1〜3） */
  stars = 0;

  // ---- 戦闘中の成長 ----
  level = 1;
  xp = 0;
  mods: Modifiers = baseModifiers();
  /** 強化ごとに選んだ回数 */
  perkCount: Record<string, number> = {};
  /** 答えを待っている選択（先頭から順に出す） */
  readonly choices: Choice[] = [];

  // ---- ウェーブ ----
  phase: Phase = 'prep';
  /** 準備の残り秒数 */
  timer: number;
  /** 今のウェーブ（始まる前は0） */
  wave = 0;
  /** これから出てくる敵 */
  toSpawn: EnemyKind[] = [];
  private spawnT = 0;
  private dirs: number[] = [0];
  /** 今のウェーブの敵の HP 倍率 */
  hpMul = 1;

  private nextEnemyId = 0;
  /** 領地を広げる旗の移り先 */
  private landMoves = new Map<Spot, [number, number][]>();

  constructor(stage: StageData, opts: WorldOptions = {}) {
    this.data = opts.data ?? GAME_DATA;
    this.stage = stage;
    this.difficulty = opts.difficulty ?? 1;
    this.diff = this.data.difficulty[this.difficulty];
    this.width = stage.width;
    this.height = stage.height;
    this.rng = new Random(opts.seed ?? 1);
    this.house = new House(stage.house.x, stage.house.y, stage.house.r, this.diff.houseHp, this.diff.houseHp);
    this.player = new Player(stage.player.x, stage.player.y, this.data.player.radius);
    const td = this.data.trees;
    this.trees = placeTrees(stage, this.rng).map((t, i) => new Tree(i, t.x, t.y, t.size, td.hp, td.hp));
    this.timer = this.diff.firstPrep;
    this.createSpots();
  }

  private createSpots(): void {
    const h = this.house;
    const bd = this.data.buildings;
    for (const s of this.stage.spots) {
      const spot = new Spot(this.spots.length, s.type, h.x + s.dx, h.y + s.dy, bd);
      spot.hidden = (s.territory ?? 0) > 0;
      if (s.moves) this.landMoves.set(spot, s.moves);
      this.spots.push(spot);
    }
    const { radius, sectors, postsPerSector } = bd.wall;
    const tau = Math.PI * 2;
    for (let i = 0; i < sectors; i++) {
      const a = ((i + 0.5) * tau) / sectors;
      const spot = new Spot(this.spots.length, 'wall', h.x + Math.cos(a) * radius, h.y + Math.sin(a) * radius, bd);
      spot.angle = a;
      for (let j = 0; j < postsPerSector; j++) {
        const b = (i * tau) / sectors + ((j + 0.5) * tau) / (sectors * postsPerSector);
        spot.posts.push({ x: h.x + Math.cos(b) * radius, y: h.y + Math.sin(b) * radius });
      }
      this.spots.push(spot);
      this.walls.push(spot);
    }
  }

  /** 今の領地の半径 */
  get territory(): number {
    return this.stage.territory[this.territoryLevel];
  }

  /** 持てる木材の上限 */
  get capacity(): number {
    const bag = this.data.buildings.kinds.bag;
    return this.data.player.baseCapacity + this.levelOf('bag') * (bag.capacityPerLevel ?? 0) + this.mods.capacity;
  }

  /** 主人公の1回の攻撃 */
  get attackDamage(): number {
    const pd = this.data.player;
    return pd.attackDamage + (this.levelOf('axe') >= pd.axeBonusLevel ? pd.axeBonusDamage : 0) + this.mods.attack;
  }

  /** 次のレベルまでに必要な経験値 */
  get xpToNext(): number {
    return xpNeed(this.level, this.data.upgrades);
  }

  /** その種類の建物のレベル（複数あるときは一番高いもの） */
  levelOf(type: BuildingType): number {
    let lv = 0;
    for (const s of this.spots) if (s.type === type) lv = Math.max(lv, s.level);
    return lv;
  }

  /** 先頭の選択。答えが出るまでゲームは止まる */
  get choice(): Choice | null {
    return this.choices[0] ?? null;
  }

  /** 生きている敵と、これから出てくる敵の数 */
  get enemiesLeft(): number {
    return this.toSpawn.length + this.enemies.length;
  }

  step(dt: number): void {
    this.events.length = 0;
    if (this.outcome !== 'playing' || this.choices.length > 0) return;
    this.time += dt;
    this.movePlayer(dt);
    this.playerAct(dt);
    this.updateTrees(dt);
    this.updateSpots(dt);
    updateTowers(this, dt);
    updateShots(this, dt);
    this.updateFires(dt);
    updateEnemies(this, dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.outcome !== 'playing') return;
    this.updateDrops(dt);
    this.updateWaves(dt);
    this.house.hit = Math.max(0, this.house.hit - dt);
  }

  // ---- 選択への答え ----

  /** とうの種類を決める */
  chooseTower(kind: TowerKind): void {
    const c = this.choice;
    if (!c || c.type !== 'tower') return;
    c.spot.kind = kind;
    c.spot.cd = this.data.towers.firstShotDelay;
    this.choices.shift();
    this.preparePerkChoice();
  }

  /** とうの分かれ道を決める（branches の添字） */
  chooseBranch(index: number): void {
    const c = this.choice;
    if (!c || c.type !== 'branch' || !c.spot.kind) return;
    if (!this.data.towers.kinds[c.spot.kind].branches[index]) return;
    c.spot.branch = index;
    this.choices.shift();
    this.preparePerkChoice();
  }

  /** レベルアップの強化を選ぶ（options の添字） */
  choosePerk(index: number): void {
    const c = this.choice;
    if (!c || c.type !== 'perk') return;
    const p = c.options[index];
    if (!p) return;
    applyPerk(p, this.mods, this.house, this.walls);
    this.perkCount[p.id] = (this.perkCount[p.id] ?? 0) + 1;
    this.choices.shift();
    this.preparePerkChoice();
  }

  /** 先頭に来たレベルアップの選択肢を、その時点の状態で選び直す（前の強化が反映されるように） */
  private preparePerkChoice(): void {
    const c = this.choice;
    if (c?.type === 'perk') c.options = pickPerks(this.data.upgrades.perks, this.perkCount, this.house, this.rng);
  }

  /** 準備の時間を切り上げて、すぐ敵を呼ぶ。残り時間に応じて経験値がもらえる */
  callNow(): void {
    if (this.outcome !== 'playing' || this.phase !== 'prep') return;
    const bonus = Math.ceil(this.timer / this.data.upgrades.xp.callNowSecondsPerXp);
    if (bonus > 0) {
      this.events.push({ type: 'xpBonus', n: bonus });
      this.gainXp(bonus);
    }
    this.timer = 0;
  }

  // ---- 主人公 ----

  private movePlayer(dt: number): void {
    const p = this.player;
    const pd = this.data.player;
    let { x: ix, y: iy } = this.input;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    const mv = Math.min(1, len);
    const speed = pd.speed * this.mods.speed;
    p.moving = mv > 0.05;
    if (p.moving) {
      p.x += ix * speed * dt;
      p.y += iy * speed * dt;
      p.step += dt * 12;
      p.walked += speed * mv * dt;
      if (Math.abs(ix) > 0.15) p.face = ix > 0 ? 1 : -1;
    }
    // 領地の外へは出られない
    const h = this.house;
    const lim = this.territory - pd.territoryMargin;
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > lim) {
      p.x = h.x + (dx / d) * lim;
      p.y = h.y + (dy / d) * lim;
    }
    pushOut(p, h.x, h.y, h.r + pd.houseClearance);
    const tr = this.data.trees.radius;
    for (const t of this.trees) if (t.alive) pushOut(p, t.x, t.y, tr * t.size);
    if (this.tutorial === 'move' && p.walked > TUTORIAL_WALK) this.tutorial = 'chop';
  }

  /** 近くに敵がいれば斬り、いなければ近くの木を切る */
  private playerAct(dt: number): void {
    const p = this.player;
    const pd = this.data.player;
    p.chopT -= dt;
    p.atkT -= dt;
    p.swing = Math.max(0, p.swing - dt * 4.5);
    let foe: Enemy | null = null;
    let best = pd.attackRange;
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const d = dist(p.x, p.y, e.x, e.y) - e.r;
      if (d < best) {
        best = d;
        foe = e;
      }
    }
    if (foe) {
      if (p.atkT > 0) return;
      p.atkT = pd.attackInterval;
      p.swing = 1;
      p.face = foe.x >= p.x ? 1 : -1;
      this.events.push({ type: 'attack' });
      const dmg = this.attackDamage;
      if (this.mods.area) {
        for (const e of this.enemies.slice()) if (e.targetable && dist(p.x, p.y, e.x, e.y) - e.r < pd.areaRange) this.hurt(e, dmg, p.x, p.y, 'player');
      } else {
        this.hurt(foe, dmg, p.x, p.y, 'player');
      }
      return;
    }
    this.chopTrees();
  }

  /** 近くの木を自動で切る。木材がいっぱいのときは切らない */
  private chopTrees(): void {
    const p = this.player;
    const pd = this.data.player;
    const td = this.data.trees;
    if (p.chopT > 0 || p.wood >= this.capacity) return;
    const reach = this.territory + td.choppableMargin;
    let target: Tree | null = null;
    let best = pd.chopRange;
    for (const t of this.trees) {
      if (!t.alive || dist(t.x, t.y, this.house.x, this.house.y) > reach) continue;
      const d = dist(p.x, p.y, t.x, t.y);
      if (d < best) {
        best = d;
        target = t;
      }
    }
    if (!target) return;
    p.chopT = pd.chopIntervals[Math.min(this.levelOf('axe'), pd.chopIntervals.length - 1)] * this.mods.chop;
    p.swing = 1;
    p.face = target.x >= p.x ? 1 : -1;
    target.hp--;
    target.shake = 0.25;
    this.events.push({ type: 'chop', tree: target });
    const lucky = this.rng.next() < this.mods.lucky ? 2 : 1;
    this.gainWood(td.woodPerChop * lucky, target.x, target.y - 45);
    if (this.tutorial === 'move' || this.tutorial === 'chop') this.tutorial = 'build';
    if (target.hp <= 0) {
      target.alive = false;
      target.regrow = td.regrowSeconds;
      this.events.push({ type: 'fell', tree: target });
      this.gainWood(td.woodOnFell, target.x, target.y - 45);
      this.gainXp(this.data.upgrades.xp.fellTree);
    }
  }

  private gainWood(n: number, x: number, y: number): void {
    const add = Math.min(n, this.capacity - this.player.wood);
    if (add <= 0) return;
    this.player.wood += add;
    this.events.push({ type: 'wood', x, y, n: add });
  }

  private gainXp(n: number): void {
    this.xp += n;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.choices.push({ type: 'perk', options: [] });
      this.events.push({ type: 'levelUp', level: this.level });
    }
    this.preparePerkChoice();
  }

  private updateTrees(dt: number): void {
    const p = this.player;
    const td = this.data.trees;
    for (const t of this.trees) {
      t.shake = Math.max(0, t.shake - dt);
      if (!t.alive) {
        t.regrow -= dt;
        // 主人公が切り株のすぐそばにいるときは、閉じ込めないよう生え戻りを待つ
        if (t.regrow <= 0 && dist(p.x, p.y, t.x, t.y) > td.regrowClearance) {
          t.alive = true;
          t.hp = t.maxHp;
          t.grow = 0;
        }
      } else if (t.grow < 1) {
        t.grow = Math.min(1, t.grow + dt * 3);
      }
    }
  }

  /** 倒した敵の木材は、跳ねて落ちたあと、近くにいると吸い寄せられて拾える */
  private updateDrops(dt: number): void {
    const p = this.player;
    const pd = this.data.player;
    const reach = pd.magnetRange * this.mods.magnet;
    const keep: Drop[] = [];
    for (const d of this.drops) {
      d.t += dt;
      if (d.z > 0 || d.vz > 0) {
        d.z += d.vz * dt;
        d.vz -= 700 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.z <= 0) {
          d.z = 0;
          d.vz = 0;
        }
      } else if (d.t > pd.dropDelay && p.wood < this.capacity && dist(p.x, p.y, d.x, d.y) < reach) {
        const k = Math.min(1, dt * 10);
        d.x += (p.x - d.x) * k;
        d.y += (p.y - d.y) * k;
        if (dist(p.x, p.y, d.x, d.y) < pd.pickupRange) {
          p.wood++;
          this.events.push({ type: 'pickup' });
          continue;
        }
      }
      if (d.t < pd.dropLife) keep.push(d);
    }
    this.drops = keep;
  }

  // ---- 建設 ----

  private updateSpots(dt: number): void {
    const p = this.player;
    const bd = this.data.buildings;
    for (const s of this.spots) {
      s.pop = Math.max(0, s.pop - dt);
      s.hit = Math.max(0, s.hit - dt);
      if (s.hidden) continue;
      const near = dist(p.x, p.y, s.x, s.y) < bd.spotRange;
      const r = paySpot(s, near, p.wood, dt, bd);
      if (r.paid > 0) {
        p.wood -= r.paid;
        this.events.push({ type: 'pay', spot: s });
      }
      if (r.built) this.completeSpot(s);
    }
  }

  private completeSpot(s: Spot): void {
    this.tutorial = 'done';
    this.events.push({ type: 'built', spot: s });
    switch (s.type) {
      case 'wall': {
        const hp = this.data.buildings.kinds.wall.hp ?? [];
        s.maxHp = s.hp = (hp[s.level - 1] ?? 0) * this.mods.wallHp;
        break;
      }
      case 'land': {
        this.territoryLevel = Math.min(s.level, this.stage.territory.length - 1);
        for (const o of this.stage.spots.keys()) {
          const spec = this.stage.spots[o];
          if ((spec.territory ?? 0) > 0 && (spec.territory ?? 0) <= this.territoryLevel) this.spots[o].hidden = false;
        }
        const next = this.landMoves.get(s)?.[s.level - 1];
        if (next) {
          s.x = this.house.x + next[0];
          s.y = this.house.y + next[1];
        } else {
          s.hidden = true;
        }
        this.events.push({ type: 'territory', level: this.territoryLevel });
        break;
      }
      case 'tower':
        if (s.level === 1) this.choices.push({ type: 'tower', spot: s });
        else if (s.level === s.maxLevel && s.kind && this.data.towers.kinds[s.kind].branches.length > 0) this.choices.push({ type: 'branch', spot: s });
        break;
      default:
        break;
    }
  }

  // ---- 敵との戦い ----

  /** 敵を出す（hpMul は今のウェーブの倍率） */
  addEnemy(kind: EnemyKind, x: number, y: number, hpMul = this.hpMul): Enemy {
    const c = this.data.enemies.common;
    const speedMul = this.diff.enemySpeed * this.rng.range(1 - c.speedJitter, 1 + c.speedJitter);
    const e = new Enemy(this.nextEnemyId++, kind, this.data.enemies.kinds[kind], x, y, hpMul, speedMul, {
      firstAttack: c.firstAttackDelay,
      summonFirst: c.summonFirst,
      bob: this.rng.range(0, 6),
    });
    this.enemies.push(e);
    return e;
  }

  /** ウェーブの方向のどれかから、おうちの遠くに敵を出す */
  private spawnEnemy(kind: EnemyKind): void {
    const c = this.data.enemies.common;
    const a = this.dirs[Math.floor(this.rng.next() * this.dirs.length)] + this.rng.range(-c.spawnSpread, c.spawnSpread);
    const h = this.house;
    const x = Math.min(this.width - 30, Math.max(30, h.x + Math.cos(a) * c.spawnDistance));
    const y = Math.min(this.height - 20, Math.max(50, h.y + Math.sin(a) * c.spawnDistance));
    const stats = this.data.enemies.kinds[kind];
    const mul = this.hpMul * (stats.boss ? 1 + this.stage.waves.bossHpBonus : 1);
    const e = this.addEnemy(kind, x, y, mul);
    this.events.push({ type: 'spawn', enemy: e });
  }

  /** 敵にダメージを与える。倒したら木材を落とし、経験値をもらう */
  hurt(e: Enemy, dmg: number, fromX: number, fromY: number, src: DamageSource): void {
    if (e.dead) return;
    const ed = this.data.enemies;
    let amount = damageTo(e.stats, dmg, src, ed);
    if (e.stats.shield && shieldable(src) && fromFront(e.x, e.y, fromX, fromY, this.house.x, this.house.y, ed.common.shieldArc)) {
      amount *= e.stats.shield;
      this.events.push({ type: 'blocked', enemy: e });
    }
    e.hp -= amount;
    // 火は毎フレーム少しずつ当たるので、点滅や粒は出さない
    if (src !== 'fire') {
      e.hitF = 0.12;
      this.events.push({ type: 'hit', enemy: e });
    }
    const kb = knockbackOf(e.stats, src, ed);
    if (kb > 0) {
      const dx = e.x - fromX;
      const dy = e.y - fromY;
      const d = Math.hypot(dx, dy) || 1;
      e.kx += (dx / d) * kb;
      e.ky += (dy / d) * kb;
    }
    if (e.hp > 0) return;
    e.dead = true;
    this.events.push({ type: 'death', enemy: e });
    // 木こりが持っていた木は、木材になって落ちる
    const drops = e.stats.drop + e.carried * (this.data.trees.hp + this.data.trees.woodOnFell);
    for (let i = 0; i < drops; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(30, 90);
      this.drops.push({ x: e.x, y: e.y, z: 5, vz: this.rng.range(160, 230), vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0 });
    }
    if (e.stats.split) {
      const c = ed.common;
      for (let i = 0; i < c.splitCount; i++) this.addEnemy(c.splitKind, e.x + (i % 2 ? 16 : -16), e.y + this.rng.range(-8, 8));
    }
    this.gainXp(e.stats.xp);
  }

  /** 大ほうの玉の爆発。空の敵には当たらない */
  explode(x: number, y: number, radius: number, dmg: number): void {
    this.events.push({ type: 'explode', x, y, radius });
    for (const e of this.enemies.slice()) {
      if (!e.targetable || e.fly) continue;
      if (dist(e.x, e.y, x, y) < radius + e.r * 0.6) this.hurt(e, dmg, x, y, 'cannon');
    }
  }

  /** 大ほうの「もえる 地面」：しばらく残る火を置く */
  addFire(x: number, y: number, r: number, dps: number, time: number): void {
    this.fires.push({ x, y, r, dps, t: time });
  }

  /** 火の上にいる地上の敵に、少しずつダメージを与える */
  private updateFires(dt: number): void {
    for (const f of this.fires) {
      f.t -= dt;
      for (const e of this.enemies.slice()) {
        if (!e.targetable || e.fly) continue;
        if (dist(e.x, e.y, f.x, f.y) < f.r + e.r * 0.5) this.hurt(e, f.dps * dt, f.x, f.y, 'fire');
      }
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  hitWall(s: Spot, dmg: number): void {
    s.hp -= dmg * wallGuardAt(this, s);
    s.hit = 0.15;
    this.events.push({ type: 'wallHit', spot: s });
    if (s.hp > 0) return;
    s.level = 0;
    s.paid = 0;
    s.hp = 0;
    this.events.push({ type: 'wallBroken', spot: s });
  }

  damageHouse(dmg: number): void {
    const h = this.house;
    h.hp = Math.max(0, h.hp - dmg);
    h.hit = 0.3;
    this.events.push({ type: 'houseHit', dmg });
    if (h.hp <= 0) {
      this.outcome = 'lost';
      this.events.push({ type: 'lost' });
    }
  }

  // ---- ウェーブ ----

  private updateWaves(dt: number): void {
    const wd = this.stage.waves;
    if (this.phase === 'prep') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave();
      return;
    }
    if (this.toSpawn.length > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnEnemy(this.toSpawn.shift()!);
        this.spawnT = spawnInterval(wd, this.wave);
      }
      return;
    }
    if (this.enemies.length > 0) return;
    if (this.wave >= wd.count) {
      this.win();
      return;
    }
    this.phase = 'prep';
    this.timer = this.diff.gap;
    for (const w of this.walls) if (w.level > 0) w.hp = w.maxHp;
    this.events.push({ type: 'waveClear', n: this.wave });
  }

  private startWave(): void {
    const wd = this.stage.waves;
    this.wave++;
    this.phase = 'fight';
    this.hpMul = waveHpMul(wd, this.wave, this.diff);
    this.toSpawn = waveList(wd, this.wave, this.diff, this.rng);
    this.spawnT = 0.5;
    this.dirs = waveDirections(wd, this.wave, this.rng);
    this.events.push({ type: 'wave', n: this.wave, last: this.wave === wd.count });
  }

  private win(): void {
    this.outcome = 'won';
    const r = this.house.hp / this.house.maxHp;
    this.stars = r >= 0.7 ? 3 : r >= 0.4 ? 2 : 1;
    this.events.push({ type: 'won' });
  }
}
