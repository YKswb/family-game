import type Phaser from 'phaser';
import type { Tutorial, World } from '../systems/World';
import { drawLog } from '../views/shapes';
import { TEXT, fmt, safeArea, textStyle, uiScale } from './Display';

const HINTS: Partial<Record<Tutorial, string>> = {
  move: TEXT.hintMove,
  chop: TEXT.hintChop,
  build: TEXT.hintBuild,
};

const BANNER_LIFE = 1.9;

/**
 * 画面に固定の表示：左上に木材・レベル・ステージ、上の真ん中にウェーブとおうちの HP、
 * 画面の縁に画面外の敵の向き、下にヒント、真ん中に大きな知らせ
 */
export class Hud {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly wood: Phaser.GameObjects.Text;
  private readonly level: Phaser.GameObjects.Text;
  private readonly stage: Phaser.GameObjects.Text;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly house: Phaser.GameObjects.Text;
  private readonly left: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private bannerT = 0;
  private u = 1;
  private w = 0;
  private h = 0;
  private safe = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(800);
    const t = (color = '#ffffff') => scene.add.text(0, 0, '', textStyle(20, color)).setDepth(801);
    this.wood = t().setOrigin(0, 0.5);
    this.level = t('#ffd84d').setOrigin(0, 0.5);
    this.stage = t().setOrigin(0, 0.5);
    this.wave = t().setOrigin(0.5);
    this.house = t().setOrigin(1, 0.5).setText('🏠');
    this.left = t('#ffd0c8').setOrigin(0.5);
    this.hint = t().setOrigin(0.5);
    this.banner = t('#ffd84d').setOrigin(0.5).setAlpha(0);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.wood, this.level, this.stage, this.wave, this.house, this.left, this.hint, this.banner];
  }

  /** 画面の大きさが変わったときに呼ぶ */
  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.u = uiScale(w, h);
    this.safe = safeArea();
    const size = (o: Phaser.GameObjects.Text, s: number) => o.setFontSize(s * this.u).setStroke('#231a0a', s * this.u * 0.28);
    size(this.wood, 20);
    size(this.level, 15);
    size(this.stage, 13);
    size(this.wave, 19);
    size(this.house, 16);
    size(this.left, 14);
    size(this.hint, 17);
    size(this.banner, 36);
  }

  /** 画面の真ん中に大きく知らせる（ウェーブの始まり、ボスなど） */
  showBanner(text: string): void {
    this.banner.setText(text);
    this.bannerT = BANNER_LIFE;
  }

  update(world: World, dt: number, toScreen: (x: number, y: number) => { x: number; y: number }, stageLabel: string): void {
    const u = this.u;
    const g = this.gfx;
    const x0 = 10 + this.safe.left;
    const y0 = 10 + this.safe.top;
    g.clear();

    // 左上：木材
    g.fillStyle(0x000000, 0.32);
    g.fillRoundedRect(x0, y0, 138 * u, 46 * u, 16 * u);
    drawLog(g, x0 + 22 * u, y0 + 23 * u, 24 * u);
    const p = world.player;
    const full = p.wood >= world.capacity;
    this.wood.setText(`${p.wood} / ${world.capacity}`).setColor(full ? '#ffd84d' : '#ffffff');
    this.wood.setPosition(x0 + 42 * u, y0 + 23 * u);

    // 左上：レベルと経験値
    const ly = y0 + 52 * u;
    g.fillStyle(0x000000, 0.32);
    g.fillRoundedRect(x0, ly, 138 * u, 30 * u, 12 * u);
    this.level.setText(fmt(TEXT.level, { lv: world.level })).setPosition(x0 + 8 * u, ly + 15 * u);
    const xw = 70 * u;
    g.fillStyle(0xffffff, 0.25);
    g.fillRoundedRect(x0 + 56 * u, ly + 10 * u, xw, 10 * u, 5 * u);
    g.fillStyle(0x7fe08a, 1);
    g.fillRoundedRect(x0 + 56 * u, ly + 10 * u, Math.max(4, (xw * world.xp) / world.xpToNext), 10 * u, 5 * u);
    this.stage.setText(stageLabel).setPosition(x0 + 4, ly + 46 * u);

    // 上の真ん中：ウェーブとおうちの HP
    const cx = this.w / 2;
    const ty = this.safe.top;
    const wd = world.stage.waves;
    this.wave
      .setText(
        world.phase === 'prep'
          ? fmt(world.wave === 0 ? TEXT.prepFirst : TEXT.prepNext, { n: Math.max(0, Math.ceil(world.timer)) })
          : wd.endless
            ? fmt(TEXT.wave, { n: world.wave })
            : fmt(TEXT.waveOf, { n: world.wave, max: wd.count }),
      )
      .setPosition(cx, ty + 26 * u);
    const bw = 170 * u;
    const bh = 13 * u;
    const by = ty + 46 * u;
    const hs = world.house;
    this.house.setPosition(cx - bw / 2 - 4, by + bh / 2);
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(cx - bw / 2, by, bw, bh, bh / 2);
    if (hs.hp > 0) {
      g.fillStyle(hs.hp / hs.maxHp > 0.4 ? 0x5bd16a : 0xff5a4f, 1);
      g.fillRoundedRect(cx - bw / 2, by, Math.max(bh, (bw * hs.hp) / hs.maxHp), bh, bh / 2);
    }
    this.left.setVisible(world.phase === 'fight').setText(fmt(TEXT.enemiesLeft, { n: world.enemiesLeft })).setPosition(cx, by + bh + 16 * u);

    // 画面の外にいる敵の向き
    for (const e of world.enemies) {
      const s = toScreen(e.x, e.y - e.r);
      if (s.x > -10 && s.x < this.w + 10 && s.y > -10 && s.y < this.h + 10) continue;
      const dx = s.x - this.w / 2;
      const dy = s.y - this.h / 2;
      const m = Math.min((this.w / 2 - 26) / Math.max(Math.abs(dx), 1e-3), (this.h / 2 - 26) / Math.max(Math.abs(dy), 1e-3));
      const ix = this.w / 2 + dx * m;
      const iy = this.h / 2 + dy * m;
      const a = Math.atan2(dy, dx);
      const pt = (r: number, t: number) => ({ x: ix + Math.cos(a + t) * r, y: iy + Math.sin(a + t) * r });
      const tri = [pt(12, 0), pt(12, 2.4), pt(12, -2.4)];
      g.fillStyle(e.stats.boss ? 0xffcc1f : 0xff4d4d, 1);
      g.fillPoints(tri, true);
      g.lineStyle(2, 0xffffff, 1);
      g.strokePoints(tri, true);
    }

    // 下：ヒント（チュートリアルのあとは、最初の準備の間だけステージのヒント）
    const hint = HINTS[world.tutorial] ?? (world.wave === 0 && world.stage.tip ? world.stage.tip : null);
    this.hint.setVisible(!!hint);
    if (hint) {
      const y = this.h - this.safe.bottom - 58 * u;
      this.hint.setText(hint).setPosition(this.w / 2, y);
      const tw = Math.min(this.w - 20, this.hint.width + 36 * u);
      g.fillStyle(0x000000, 0.45);
      g.fillRoundedRect(this.w / 2 - tw / 2, y - 22 * u, tw, 44 * u, 22 * u);
    }

    // 真ん中：大きな知らせ
    this.bannerT = Math.max(0, this.bannerT - dt);
    const t = this.bannerT;
    this.banner.setPosition(this.w / 2, this.h * 0.36).setAlpha(Math.min(1, t / 0.4)).setScale(1 + Math.max(0, t - 1.6) * 1.2);
  }
}
