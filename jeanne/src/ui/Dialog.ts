import type Phaser from 'phaser';
import type { StoryData } from '../data/stageData';
import { FONT, TEXT, VIEW_H, VIEW_W, textStyle } from './Display';

const DEPTH = 2000;

/**
 * 画面下の会話の吹き出し。開いているあいだは画面全体がタップを受け取り（スティックやボタンは反応しない）、
 * タップで次の行へ進む。最後まで進むと閉じて onDone を呼ぶ
 */
export class Dialog {
  private readonly box: Phaser.GameObjects.Graphics;
  private readonly face: Phaser.GameObjects.Text;
  private readonly name: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly zone: Phaser.GameObjects.Zone;
  private queue: [string, string][] = [];
  private speakers: StoryData['speakers'] = {};
  private onDone: (() => void) | null = null;
  private isOpen = false;

  constructor(scene: Phaser.Scene) {
    const x = 24;
    const y = VIEW_H - 214;
    const w = VIEW_W - 48;
    const h = 190;
    this.box = scene.add.graphics().setDepth(DEPTH);
    this.box.fillStyle(0x000000, 0.35);
    this.box.fillRect(0, 0, VIEW_W, VIEW_H);
    this.box.fillStyle(0x14100a, 0.92);
    this.box.fillRoundedRect(x, y, w, h, 24);
    this.box.lineStyle(3, 0xffdca0, 0.6);
    this.box.strokeRoundedRect(x, y, w, h, 24);
    this.face = scene.add.text(x + 70, y + 92, '', { fontFamily: FONT, fontSize: '76px', resolution: 2 }).setOrigin(0.5).setDepth(DEPTH + 1);
    this.name = scene.add.text(x + 140, y + 22, '', textStyle(26, '#ffd27a', false)).setDepth(DEPTH + 1);
    this.body = scene.add
      .text(x + 140, y + 62, '', { ...textStyle(32, '#ffffff', false), wordWrap: { width: w - 170, useAdvancedWrap: true }, lineSpacing: 8 })
      .setDepth(DEPTH + 1);
    this.hint = scene.add.text(x + w - 24, y + h - 16, TEXT.tapNext, textStyle(20, '#cccccc', false)).setOrigin(1, 1).setDepth(DEPTH + 1);
    this.zone = scene.add.zone(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H).setDepth(DEPTH + 2);
    this.zone.on('pointerup', () => this.next());
    this.setVisible(false);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.box, this.face, this.name, this.body, this.hint, this.zone];
  }

  get open(): boolean {
    return this.isOpen;
  }

  show(lines: [string, string][], speakers: StoryData['speakers'], onDone: () => void): void {
    this.queue = [...lines];
    this.speakers = speakers;
    this.onDone = onDone;
    this.isOpen = true;
    this.setVisible(true);
    this.next();
  }

  private next(): void {
    if (!this.isOpen) return;
    const line = this.queue.shift();
    if (!line) {
      this.isOpen = false;
      this.setVisible(false);
      const done = this.onDone;
      this.onDone = null;
      done?.();
      return;
    }
    const [who, text] = line;
    const sp = this.speakers[who] ?? { name: who, face: '' };
    this.face.setText(sp.face);
    this.name.setText(sp.name);
    this.body.setText(text);
  }

  private setVisible(v: boolean): void {
    for (const o of [this.box, this.face, this.name, this.body, this.hint]) o.setVisible(v);
    if (v) this.zone.setInteractive();
    else this.zone.disableInteractive();
  }
}
