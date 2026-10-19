import Phaser from 'phaser';
import { STAGES } from '../data/stageData';
import { Button } from '../ui/Button';
import { DPR, TEXT, VIEW_H, VIEW_W, fmt, textStyle } from '../ui/Display';

/** タイトル画面：ステージを選んで始める／れんしゅう */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.cameras.main.setOrigin(0, 0).setZoom(DPR);

    const g = this.add.graphics();
    // 空と野原
    g.fillGradientStyle(0x7ec8f0, 0x7ec8f0, 0xcfeefe, 0xcfeefe, 1);
    g.fillRect(0, 0, VIEW_W, VIEW_H * 0.62);
    g.fillStyle(0x6fb352, 1);
    g.fillRect(0, VIEW_H * 0.62, VIEW_W, VIEW_H * 0.38);
    g.fillStyle(0x5f9a45, 1);
    g.fillEllipse(VIEW_W * 0.2, VIEW_H * 0.64, 700, 120);
    g.fillEllipse(VIEW_W * 0.85, VIEW_H * 0.65, 620, 110);
    // 旗
    const fx = VIEW_W * 0.07;
    const fy = VIEW_H * 0.6;
    g.lineStyle(8, 0x6b4325, 1);
    g.lineBetween(fx, fy, fx, fy - 300);
    g.fillStyle(0xf5f0e0, 1);
    g.fillTriangle(fx, fy - 300, fx + 130, fy - 260, fx, fy - 220);
    g.fillStyle(0xd9a21c, 1);
    g.fillCircle(fx + 42, fy - 260, 11);

    this.add.text(VIEW_W / 2, 150, TEXT.title, textStyle(92, '#ffffff')).setOrigin(0.5);
    // 「騎士」のふりがな
    this.add.text(VIEW_W / 2 + 175, 82, TEXT.titleRuby, textStyle(26, '#ffffff')).setOrigin(0.5);
    this.add.text(VIEW_W / 2, 240, TEXT.titleLead, textStyle(28, '#ffffff')).setOrigin(0.5);

    let y = 400;
    Object.entries(STAGES).forEach(([key, { stage }], i) => {
      new Button(this, {
        x: VIEW_W / 2,
        y,
        w: 560,
        h: 110,
        label: fmt(TEXT.stageButton, { n: i + 1, title: stage.title }),
        fontSize: 42,
        color: 0xd94f3a,
        shadow: 0x9c3426,
        onTap: () => this.scene.start('Battle', { mode: 'stage', stageId: key }),
      });
      y += 140;
    });
    new Button(this, {
      x: VIEW_W / 2,
      y: y + 20,
      w: 360,
      h: 84,
      label: TEXT.practice,
      fontSize: 34,
      color: 0x7a5bc7,
      shadow: 0x4f3a87,
      onTap: () => this.scene.start('Battle', { mode: 'squad' }),
    });
  }
}
