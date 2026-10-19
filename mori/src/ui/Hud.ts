import type Phaser from 'phaser';
import type { Tutorial, World } from '../systems/World';
import { drawLog } from '../views/shapes';
import { TEXT, safeArea, textStyle, uiScale } from './Display';

const HINTS: Partial<Record<Tutorial, string>> = {
  move: TEXT.hintMove,
  chop: TEXT.hintChop,
  build: TEXT.hintBuild,
};

/** 画面左上の木材の数と、画面下のヒント */
export class Hud {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly wood: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private u = 1;
  private w = 0;
  private h = 0;
  private safe = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(800);
    this.wood = scene.add.text(0, 0, '', textStyle(20)).setOrigin(0, 0.5).setDepth(801);
    this.hint = scene.add.text(0, 0, '', textStyle(17)).setOrigin(0.5).setDepth(801);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.wood, this.hint];
  }

  /** 画面の大きさが変わったときに呼ぶ */
  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.u = uiScale(w, h);
    this.safe = safeArea();
    this.wood.setFontSize(20 * this.u).setStroke('#231a0a', 20 * this.u * 0.28);
    this.hint.setFontSize(17 * this.u).setStroke('#231a0a', 17 * this.u * 0.28);
  }

  update(world: World): void {
    const u = this.u;
    const g = this.gfx;
    const x0 = 10 + this.safe.left;
    const y0 = 10 + this.safe.top;
    g.clear();
    g.fillStyle(0x000000, 0.32);
    g.fillRoundedRect(x0, y0, 138 * u, 46 * u, 16 * u);
    drawLog(g, x0 + 22 * u, y0 + 23 * u, 24 * u);
    const p = world.player;
    const full = p.wood >= world.capacity;
    this.wood.setText(`${p.wood} / ${world.capacity}`).setColor(full ? '#ffd84d' : '#ffffff');
    this.wood.setPosition(x0 + 42 * u, y0 + 23 * u);

    const hint = HINTS[world.tutorial];
    this.hint.setVisible(!!hint);
    if (hint) {
      const y = this.h - this.safe.bottom - 58 * u;
      this.hint.setText(hint).setPosition(this.w / 2, y);
      const tw = Math.min(this.w - 20, this.hint.width + 36 * u);
      g.fillStyle(0x000000, 0.45);
      g.fillRoundedRect(this.w / 2 - tw / 2, y - 22 * u, tw, 44 * u, 22 * u);
    }
  }
}
