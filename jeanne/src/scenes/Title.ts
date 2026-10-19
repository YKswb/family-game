import Phaser from 'phaser';
import { DIFFICULTY, DIFFICULTY_KEYS } from '../systems/Progress';
import { Session } from '../systems/Session';
import { Button } from '../ui/Button';
import { DPR, TEXT, VIEW_H, VIEW_W, fmt, textStyle } from '../ui/Display';

/** タイトル画面：はじめから（むずかしさを選ぶ）／つづきから／れんしゅう */
export class TitleScene extends Phaser.Scene {
  /** 確認やむずかしさ選びの重ね置き（閉じるときにまとめて消す） */
  private panel: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Title');
  }

  create(): void {
    this.panel = [];
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

    const save = Session.load();
    let y = 370;
    if (save) {
      new Button(this, {
        x: VIEW_W / 2,
        y,
        w: 520,
        h: 104,
        label: TEXT.continueGame,
        fontSize: 42,
        color: 0xd94f3a,
        shadow: 0x9c3426,
        onTap: () => this.scene.start('StageSelect'),
      });
      const d = DIFFICULTY[save.difficulty];
      this.add
        .text(VIEW_W / 2, y + 70, `${fmt(TEXT.levelShort, { n: save.hero.level })}　${fmt(TEXT.difficultyLabel, { name: d.name })}`, textStyle(22))
        .setOrigin(0.5);
      y += 150;
    }
    new Button(this, {
      x: VIEW_W / 2,
      y,
      w: 520,
      h: save ? 84 : 104,
      label: TEXT.newGame,
      fontSize: save ? 34 : 42,
      color: save ? 0x3f6fd8 : 0xd94f3a,
      shadow: save ? 0x2a4fa3 : 0x9c3426,
      onTap: () => (save ? this.confirmNew() : this.chooseDifficulty()),
    });
    new Button(this, {
      x: VIEW_W / 2,
      y: y + 120,
      w: 360,
      h: 76,
      label: TEXT.practice,
      fontSize: 30,
      color: 0x7a5bc7,
      shadow: 0x4f3a87,
      onTap: () => this.scene.start('Battle', { mode: 'squad' }),
    });
  }

  /** 記録があるときの「はじめから」は、消してよいか確かめる */
  private confirmNew(): void {
    this.openPanel(TEXT.confirmNew, [
      { label: TEXT.yes, color: 0xd94f3a, shadow: 0x9c3426, onTap: () => this.chooseDifficulty() },
      { label: TEXT.no, color: 0x6e6250, shadow: 0x4a4136, onTap: () => this.closePanel() },
    ]);
  }

  private chooseDifficulty(): void {
    this.closePanel();
    const items = DIFFICULTY_KEYS.map((key) => {
      const d = DIFFICULTY[key];
      return {
        label: d.name,
        note: `${d.note}`,
        color: key === 'easy' ? 0x4caf50 : key === 'normal' ? 0x3f6fd8 : 0xd94f3a,
        shadow: key === 'easy' ? 0x2e7d32 : key === 'normal' ? 0x2a4fa3 : 0x9c3426,
        onTap: () => {
          Session.startNew(key);
          this.scene.start('Battle', { mode: 'stage', stageId: 'stage1' });
        },
      };
    });
    items.push({ label: TEXT.back, note: '', color: 0x6e6250, shadow: 0x4a4136, onTap: () => this.closePanel() });
    this.openPanel(TEXT.chooseDifficulty, items);
  }

  private openPanel(title: string, items: { label: string; note?: string; color: number; shadow: number; onTap: () => void }[]): void {
    this.closePanel();
    const dim = this.add.graphics().setDepth(1000);
    dim.fillStyle(0x0a0f08, 0.88);
    dim.fillRect(0, 0, VIEW_W, VIEW_H);
    const blocker = this.add.zone(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H).setInteractive().setDepth(1001);
    const head = this.add.text(VIEW_W / 2, 110, title, textStyle(40)).setOrigin(0.5).setAlign('center').setDepth(1002);
    this.panel.push(dim, blocker, head);
    const top = 220;
    const gap = items.some((i) => i.note) ? 150 : 120;
    items.forEach((it, i) => {
      const y = top + i * gap;
      const b = new Button(this, { x: VIEW_W / 2, y, w: 420, h: 84, label: it.label, fontSize: 36, color: it.color, shadow: it.shadow, onTap: it.onTap, depth: 1010 });
      this.panel.push(...b.objects);
      if (it.note) this.panel.push(this.add.text(VIEW_W / 2, y + 60, it.note, textStyle(22)).setOrigin(0.5).setDepth(1012));
    });
  }

  private closePanel(): void {
    for (const o of this.panel) o.destroy();
    this.panel = [];
  }
}
