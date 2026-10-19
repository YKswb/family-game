import { GAME_DATA, type BuildingType, type GameData, type StageData } from '../data/gameData';
import { House } from '../entities/House';
import { Player } from '../entities/Player';
import { Tree } from '../entities/Tree';
import { Spot, paySpot } from './Build';
import { Random } from './Random';
import { placeTrees } from './Stage';

export type WorldEvent =
  | { type: 'chop'; tree: Tree }
  | { type: 'fell'; tree: Tree }
  /** 木材を手に入れた（x, y は木材が飛び出した場所） */
  | { type: 'wood'; x: number; y: number; n: number }
  | { type: 'pay'; spot: Spot }
  | { type: 'built'; spot: Spot };

/** move: 歩いてみよう → chop: 木を切ろう → build: 建ててみよう → done */
export type Tutorial = 'move' | 'chop' | 'build' | 'done';

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
  data?: GameData;
}

/** 1ステージ分の状態と時間の進め方。描画とは切り離してあり、ヘッドレスでも動く */
export class World {
  readonly data: GameData;
  readonly stage: StageData;
  readonly width: number;
  readonly height: number;
  readonly house: House;
  readonly player: Player;
  readonly trees: Tree[];
  readonly spots: Spot[];
  /** このフレームで起きたこと（描画側が効果を出すのに使う） */
  readonly events: WorldEvent[] = [];
  readonly rng: Random;

  time = 0;
  /** 移動の入力（長さ0〜1） */
  input = { x: 0, y: 0 };
  /** 領地の段階（stage.territory の添字） */
  territoryLevel = 0;
  tutorial: Tutorial = 'move';

  constructor(stage: StageData, opts: WorldOptions = {}) {
    this.data = opts.data ?? GAME_DATA;
    this.stage = stage;
    this.width = stage.width;
    this.height = stage.height;
    this.rng = new Random(opts.seed ?? 1);
    this.house = new House(stage.house.x, stage.house.y, stage.house.r);
    this.player = new Player(stage.player.x, stage.player.y, this.data.player.radius);
    const td = this.data.trees;
    this.trees = placeTrees(stage, this.rng).map((t, i) => new Tree(i, t.x, t.y, t.size, td.hp, td.hp));
    this.spots = stage.spots.map((s, i) => new Spot(i, s.type, this.house.x + s.dx, this.house.y + s.dy, this.data.buildings));
  }

  /** 今の領地の半径 */
  get territory(): number {
    return this.stage.territory[this.territoryLevel];
  }

  /** 持てる木材の上限 */
  get capacity(): number {
    const bag = this.data.buildings.kinds.bag;
    return this.data.player.baseCapacity + this.levelOf('bag') * (bag.capacityPerLevel ?? 0);
  }

  /** その種類の建物のレベル（複数あるときは一番高いもの） */
  levelOf(type: BuildingType): number {
    let lv = 0;
    for (const s of this.spots) if (s.type === type) lv = Math.max(lv, s.level);
    return lv;
  }

  step(dt: number): void {
    this.events.length = 0;
    this.time += dt;
    this.movePlayer(dt);
    this.chopTrees(dt);
    this.updateTrees(dt);
    this.updateSpots(dt);
  }

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
    p.moving = mv > 0.05;
    if (p.moving) {
      p.x += ix * pd.speed * dt;
      p.y += iy * pd.speed * dt;
      p.step += dt * 12;
      p.walked += pd.speed * mv * dt;
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

  /** 近くの木を自動で切る。木材がいっぱいのときは切らない */
  private chopTrees(dt: number): void {
    const p = this.player;
    const pd = this.data.player;
    const td = this.data.trees;
    p.chopT -= dt;
    p.swing = Math.max(0, p.swing - dt * 4.5);
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
    p.chopT = pd.chopIntervals[Math.min(this.levelOf('axe'), pd.chopIntervals.length - 1)];
    p.swing = 1;
    p.face = target.x >= p.x ? 1 : -1;
    target.hp--;
    target.shake = 0.25;
    this.events.push({ type: 'chop', tree: target });
    this.gainWood(td.woodPerChop, target.x, target.y - 45);
    if (this.tutorial === 'move' || this.tutorial === 'chop') this.tutorial = 'build';
    if (target.hp <= 0) {
      target.alive = false;
      target.regrow = td.regrowSeconds;
      this.events.push({ type: 'fell', tree: target });
      this.gainWood(td.woodOnFell, target.x, target.y - 45);
    }
  }

  private gainWood(n: number, x: number, y: number): void {
    const add = Math.min(n, this.capacity - this.player.wood);
    if (add <= 0) return;
    this.player.wood += add;
    this.events.push({ type: 'wood', x, y, n: add });
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

  private updateSpots(dt: number): void {
    const p = this.player;
    const bd = this.data.buildings;
    for (const s of this.spots) {
      s.pop = Math.max(0, s.pop - dt);
      const near = dist(p.x, p.y, s.x, s.y) < bd.spotRange;
      const r = paySpot(s, near, p.wood, dt, bd);
      if (r.paid > 0) {
        p.wood -= r.paid;
        this.events.push({ type: 'pay', spot: s });
      }
      if (r.built) {
        this.events.push({ type: 'built', spot: s });
        this.tutorial = 'done';
      }
    }
  }
}
