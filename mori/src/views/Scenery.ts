import type Phaser from 'phaser';
import type { Enemy } from '../entities/Enemy';
import type { Tree } from '../entities/Tree';
import type { Spot } from '../systems/Build';
import type { World } from '../systems/World';
import { enemyLift, enemySquash, wingFrame } from './EnemyView';
import { drawPlayer } from './PlayerView';
import { spotPulse } from './SpotView';
import { TEX_SCALE, type Baked, type Textures } from './Textures';
import { easeBack } from './shapes';
import { ghostPosts } from './WallView';

/** 足元の y で前後を決める（奥の物ほど先に描く） */
export function depthOf(y: number): number {
  return 3 + y / 100000;
}

const FALL_TIME = 0.55;

interface Falling {
  img: Baked;
  t: number;
  dir: 1 | -1;
}

interface WallImages {
  posts: Baked[];
  markers: Baked[];
}

/**
 * 戦場に置く物の見た目。形の変わらない物は画像（Textures）を置いて動かし、
 * 主人公と敵は1体ずつの図形を毎フレーム描き直す。どれも足元の y で前後を決める
 */
export class Scenery {
  private readonly trees = new Map<Tree, Baked>();
  private readonly walls = new Map<Spot, WallImages>();
  private readonly towers = new Map<Spot, Baked>();
  private readonly spotBases = new Map<Spot, Baked>();
  private readonly icons = new Map<Spot, Baked>();
  private readonly house: Baked;
  private readonly player: Phaser.GameObjects.Graphics;
  private readonly enemies = new Map<Enemy, { body: Baked; shadow: Baked }>();
  private falling: Falling[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    private readonly tex: Textures,
    /** 作った物を戦場のカメラだけに映す */
    private readonly toWorld: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ) {
    for (const t of world.trees) this.trees.set(t, toWorld(tex.tree(t.x, t.y)));
    for (const s of world.spots) {
      if (s.type === 'wall') {
        this.walls.set(s, {
          posts: s.posts.map((p) => toWorld(tex.post(p.x, p.y, 1).setDepth(depthOf(p.y)))),
          markers: s.posts.map((p) => toWorld(tex.marker(p.x, p.y).setDepth(0.95))),
        });
        continue;
      }
      this.spotBases.set(s, toWorld(tex.spot(s.x, s.y).setDepth(0.9)));
      this.icons.set(s, toWorld(tex.icon(s.type, s.x, s.y).setDepth(1.1)));
      if (s.type === 'tower') this.towers.set(s, toWorld(tex.tower(s.x, s.y).setDepth(depthOf(s.y))));
    }
    this.house = toWorld(tex.house(world.house.x, world.house.y).setDepth(depthOf(world.house.y)));
    this.player = toWorld(scene.add.graphics());
  }

  /** 木が切り倒された：その場で倒れていく木を出す（木そのものはすぐ切り株になる） */
  fell(t: Tree, dir: 1 | -1): void {
    const img = this.toWorld(this.tex.tree(t.x, t.y).setDepth(depthOf(t.y)).setScale(t.size / TEX_SCALE));
    this.falling.push({ img, t: 0, dir });
  }

  update(dt: number, view: { x: number; y: number; w: number; h: number }): void {
    const w = this.world;
    const time = w.time;
    const x0 = view.x - 60;
    const y0 = view.y - 40;
    const x1 = view.x + view.w + 60;
    const y1 = view.y + view.h + 140;

    for (const [t, img] of this.trees) {
      const inView = t.x > x0 && t.x < x1 && t.y > y0 && t.y < y1;
      img.setVisible(inView);
      if (!inView) continue;
      this.tex.setTreeLook(img, t.alive);
      const shake = t.alive && t.shake > 0 ? Math.sin(t.shake * 80) * 4 * (t.shake / 0.25) : 0;
      const k = t.size * (t.alive && t.grow < 1 ? easeBack(t.grow) : 1);
      img.setPosition(t.x + shake, t.y).setScale(k / TEX_SCALE).setDepth(depthOf(t.y));
      // 風：木ごとに位相をずらして、ゆっくり揺らす
      img.setRotation(t.alive ? Math.sin(time * 1.4 + t.id * 1.7) * 0.018 : 0);
    }

    for (const f of this.falling) {
      f.t += dt;
      const k = Math.min(1, f.t / FALL_TIME);
      f.img.setRotation(f.dir * k * k * 1.45).setAlpha(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
      if (f.t >= FALL_TIME) f.img.destroy();
    }
    this.falling = this.falling.filter((f) => f.t < FALL_TIME);

    for (const [s, imgs] of this.walls) {
      const ghosts = ghostPosts(s);
      s.posts.forEach((_, j) => {
        const post = imgs.posts[j];
        const built = s.level > 0;
        const ghost = !built && j < ghosts;
        post.setVisible(built || ghost);
        if (built || ghost) {
          const key = this.tex.postKey(built ? s.level : 1);
          if (post.texture.key !== key) post.setTexture(key);
          post.setAlpha(ghost ? 0.6 : 1);
          if (s.hit > 0) post.setTint(0xffc0b0);
          else post.clearTint();
        }
        imgs.markers[j].setVisible(!built && !ghost && !s.hidden);
      });
    }

    for (const [s, base] of this.spotBases) {
      const k = spotPulse(s, time);
      base.setVisible(!s.hidden).setScale(k / TEX_SCALE);
      const key = this.tex.spotKey(s.maxed);
      if (base.texture.key !== key) base.setTexture(key);
      // land の旗は、領地を広げると場所が移る
      base.setPosition(s.x, s.y);
      const icon = this.icons.get(s)!;
      icon.setPosition(s.x, s.y + 2).setScale(k / TEX_SCALE);
      icon.setVisible(!s.hidden && !s.maxed && !(s.type === 'tower' && s.level > 0));
    }

    for (const [s, img] of this.towers) {
      const show = !s.hidden && s.level > 0;
      img.setVisible(show);
      if (!show) continue;
      const key = this.tex.towerKey(s.kind, s.level, s.branch);
      if (img.texture.key !== key) img.setTexture(key);
      const k = 1 + (s.pop > 0 ? Math.sin((s.pop / 0.5) * Math.PI) * 0.18 : 0);
      img.setScale(k / TEX_SCALE, (2 - k) / TEX_SCALE);
    }

    if (w.house.hit > 0) this.house.setTint(0xffb3a8);
    else this.house.clearTint();

    const p = w.player;
    this.player.clear().setDepth(depthOf(p.y));
    drawPlayer(this.player, p, w.levelOf('axe'));

    this.updateEnemies(x0 - 60, y0, x1 + 60, y1);
  }

  /** 敵は種類ごとの画像を置き、向きは反転、弾みは縦横の拡大、点滅と氷は色で表す */
  private updateEnemies(x0: number, y0: number, x1: number, y1: number): void {
    const w = this.world;
    const alive = new Set(w.enemies);
    for (const [e, v] of this.enemies) {
      if (alive.has(e)) continue;
      v.body.destroy();
      v.shadow.destroy();
      this.enemies.delete(e);
    }
    for (const e of w.enemies) {
      let v = this.enemies.get(e);
      if (!v) {
        v = { body: this.toWorld(this.tex.enemy(e.kind)), shadow: this.toWorld(this.tex.shadow().setDepth(2.6)) };
        this.enemies.set(e, v);
      }
      const inView = e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1;
      v.body.setVisible(inView);
      v.shadow.setVisible(inView);
      if (!inView) continue;
      // もぐっている間は土の山だけを見せる
      const key = e.underground
        ? this.tex.moundKey(e.kind)
        : this.tex.enemyKey(e.kind, e.fly ? wingFrame(e) : 0, Math.min(e.carried, e.stats.lumber?.carry ?? 0));
      if (v.body.texture.key !== key) v.body.setTexture(key);
      const sq = e.fly || e.underground || e.frozen > 0 ? 1 : enemySquash(e);
      v.body
        .setPosition(e.x, e.y - enemyLift(e))
        .setScale((2 - sq) / TEX_SCALE, sq / TEX_SCALE)
        .setFlipX(!e.underground && e.face < 0)
        .setDepth(depthOf(e.y));
      v.shadow.setVisible(!e.underground);
      if (e.hitF > 0) v.body.setTintFill(0xffffff);
      // 色を掛け合わせるので、濃い青にすると敵の見分けがつかなくなる。明るい水色にとどめる
      else if (e.frozen > 0) v.body.setTint(0xa8dcff);
      else if (e.slow > 0) v.body.setTint(0xcdeeff);
      else v.body.clearTint();
      // 影の画像は 2 倍の画素で半径 34 × 12 なので、敵の大きさに合わせて伸ばす
      const rx = e.r * (e.fly ? 0.9 : 1.05);
      const ry = e.r * (e.fly ? 0.3 : 0.35);
      v.shadow.setPosition(e.x, e.y + 2).setScale(rx / 34, ry / 12);
    }
  }
}
