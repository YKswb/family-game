import type Phaser from 'phaser';
import type { World } from '../systems/World';
import { TEXT, textStyle } from './Display';

/** 画面左上：ジャンのHP、みかたと敵の人数、経過時間 */
export class Hud {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly counts: Phaser.GameObjects.Text;
  private readonly clock: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(800);
    this.name = scene.add.text(30, 36, TEXT.heroName, textStyle(26, '#ffd04a')).setOrigin(0, 0.5).setDepth(801);
    this.counts = scene.add.text(30, 92, '', textStyle(24)).setOrigin(0, 0.5).setDepth(801);
    this.clock = scene.add.text(30, 132, '', textStyle(20, '#e8e0cc')).setOrigin(0, 0.5).setDepth(801);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.name, this.counts, this.clock];
  }

  update(w: World): void {
    const h = w.hero;
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x000000, 0.38);
    g.fillRoundedRect(14, 12, 330, 140, 18);
    // HPバー
    const bx = 110;
    const bw = 214;
    g.fillStyle(0xffffff, 0.25);
    g.fillRoundedRect(bx, 26, bw, 20, 10);
    const ratio = Math.max(0, h.hp / h.maxHp);
    g.fillStyle(ratio > 0.3 ? 0x5bd16a : 0xff5a4f, 1);
    g.fillRoundedRect(bx, 26, Math.max(8, bw * ratio), 20, 10);

    this.counts.setText(`${TEXT.allyLabel} ${w.countAlive('ally')}　${TEXT.enemyLabel} ${w.countAlive('enemy')}`);
    const s = Math.floor(w.time);
    this.clock.setText(`${TEXT.time} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  }
}
