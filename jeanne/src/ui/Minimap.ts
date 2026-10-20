import type Phaser from 'phaser';
import type { World } from '../systems/World';

/** 画面右上のミニマップ：森、兵士、旗の部隊、いま見えている範囲 */
export class Minimap {
  readonly gfx: Phaser.GameObjects.Graphics;
  private readonly h: number;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    world: World,
  ) {
    this.h = (w * world.height) / world.width;
    this.gfx = scene.add.graphics().setDepth(800);
  }

  get height(): number {
    return this.h;
  }

  update(world: World, view: { x: number; y: number; w: number; h: number }): void {
    const g = this.gfx;
    const sx = this.w / world.width;
    const sy = this.h / world.height;
    const px = (wx: number) => this.x + wx * sx;
    const py = (wy: number) => this.y + wy * sy;
    g.clear();
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(this.x - 6, this.y - 6, this.w + 12, this.h + 12, 10);
    g.fillStyle(0x6fb352, 0.75);
    g.fillRect(this.x, this.y, this.w, this.h);
    g.fillStyle(0x3f8fd0, 1);
    for (const r of world.terrain.blockers) g.fillRect(px(r.x), py(r.y), r.w * sx, r.h * sy);
    g.fillStyle(0xb98a52, 1);
    for (const r of world.terrain.passages) g.fillRect(px(r.x), py(r.y), r.w * sx, r.h * sy);
    g.fillStyle(0x2f7a3a, 0.9);
    for (const o of world.obstacles) g.fillCircle(px(o.x), py(o.y), Math.max(2, o.r * sx));

    for (const u of world.units) {
      if (u.dead || u === world.hero || u === world.jeanne) continue;
      const sq = u.squad;
      let color = sq && world.isGuardSquad(sq) ? 0xffcc1f : 0xff5a4f;
      if (u.side === 'ally') color = sq?.mode === 'neutral' ? 0xe8e8e8 : sq?.waiting ? 0x9fc3ff : 0x4f8dff;
      g.fillStyle(color, 1);
      g.fillRect(px(u.x) - 1, py(u.y) - 1, 2.4, 2.4);
    }
    // 待機している仲間の場所（空でも）に、薄い青の輪をつける
    g.lineStyle(2, 0x9fc3ff, 1);
    for (const sq of world.squads) if (sq.waiting) g.strokeCircle(px(sq.postX), py(sq.postY), 6);
    // 旗の部隊は目立つ印をつける
    for (const sq of world.squads) {
      if (sq.mode !== 'neutral' || sq.aliveCount === 0) continue;
      const c = sq.center();
      g.lineStyle(2, 0xffffff, 1);
      g.lineBetween(px(c.x), py(c.y), px(c.x), py(c.y) - 12);
      g.fillStyle(0x4f8dff, 1);
      g.fillTriangle(px(c.x), py(c.y) - 12, px(c.x) + 9, py(c.y) - 9, px(c.x), py(c.y) - 6);
    }
    // 敵の大将は大きな金の印
    const gen = world.general;
    if (gen && !gen.dead) {
      g.fillStyle(0xffcc1f, 1);
      g.lineStyle(2, 0x1a140c, 1);
      g.fillCircle(px(gen.x), py(gen.y), 5.5);
      g.strokeCircle(px(gen.x), py(gen.y), 5.5);
    }
    // ジャンヌは桃色の印（ジャンの印の下に描く）
    const j = world.jeanne;
    if (j && !j.dead) {
      g.fillStyle(0xff9ec4, 1);
      g.lineStyle(2, 0x1a140c, 1);
      g.fillCircle(px(j.x), py(j.y), 4);
      g.strokeCircle(px(j.x), py(j.y), 4);
    }
    const h = world.hero;
    g.fillStyle(0xffd04a, 1);
    g.lineStyle(2, 0x1a140c, 1);
    g.fillCircle(px(h.x), py(h.y), 4.5);
    g.strokeCircle(px(h.x), py(h.y), 4.5);

    g.lineStyle(1.5, 0xffffff, 0.75);
    g.strokeRect(px(view.x), py(view.y), view.w * sx, view.h * sy);
  }
}
