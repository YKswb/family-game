import Phaser from 'phaser';
import { textStyle } from './Display';

export interface ButtonOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  fontSize?: number;
  color: number;
  shadow: number;
  onTap: () => void;
  /** 重なり順（既定 900） */
  depth?: number;
}

/** 子どもの指でも押しやすい、角の丸い大きなボタン（画面に固定） */
export class Button {
  readonly gfx: Phaser.GameObjects.Graphics;
  readonly text: Phaser.GameObjects.Text;
  readonly zone: Phaser.GameObjects.Zone;
  private pressed = false;
  private selected = false;

  constructor(
    scene: Phaser.Scene,
    private readonly o: ButtonOptions,
  ) {
    const depth = o.depth ?? 900;
    this.gfx = scene.add.graphics().setDepth(depth);
    this.text = scene.add
      .text(o.x, o.y, o.label, textStyle(o.fontSize ?? 26))
      .setOrigin(0.5)
      .setDepth(depth + 1);
    this.zone = scene.add.zone(o.x, o.y, o.w, o.h).setInteractive().setDepth(depth + 2);
    this.zone.on('pointerdown', () => {
      this.pressed = true;
      this.redraw();
    });
    this.zone.on('pointerout', () => {
      this.pressed = false;
      this.redraw();
    });
    this.zone.on('pointerup', () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.redraw();
      o.onTap();
    });
    this.redraw();
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.text, this.zone];
  }

  setSelected(v: boolean): this {
    this.selected = v;
    this.redraw();
    return this;
  }

  setVisible(v: boolean): this {
    this.gfx.setVisible(v);
    this.text.setVisible(v);
    if (v) this.zone.setInteractive();
    else this.zone.disableInteractive();
    return this;
  }

  private redraw(): void {
    const { x, y, w, h, color, shadow } = this.o;
    const g = this.gfx;
    const r = Math.min(18, h / 3);
    const down = this.pressed ? 4 : 0;
    g.clear();
    g.fillStyle(shadow, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2 + 6, w, h, r);
    g.fillStyle(color, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2 + down, w, h, r);
    if (this.selected) {
      g.lineStyle(5, 0xffe066, 1);
      g.strokeRoundedRect(x - w / 2 - 3, y - h / 2 - 3 + down, w + 6, h + 6, r + 2);
    }
    this.text.setY(y + down);
  }
}
