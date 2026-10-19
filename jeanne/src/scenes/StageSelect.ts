import Phaser from 'phaser';
import { STAGES } from '../data/stageData';
import { DIFFICULTY } from '../systems/Progress';
import { isUnlocked, Session, STAGE_ORDER } from '../systems/Session';
import { Button } from '../ui/Button';
import { DPR, TEXT, VIEW_H, VIEW_W, fmt, textStyle } from '../ui/Display';

interface StageSelectData {
  /** 上に出す知らせ（「つぎの ステージは じゅんびちゅう」など） */
  notice?: string;
}

/** ステージ選び：クリアした★と最速タイム、まだ遊べないステージ */
export class StageSelectScene extends Phaser.Scene {
  private notice = '';

  constructor() {
    super('StageSelect');
  }

  init(data: StageSelectData): void {
    this.notice = data.notice ?? '';
  }

  create(): void {
    this.cameras.main.setOrigin(0, 0).setZoom(DPR).setBackgroundColor('#5f9a45');
    const save = Session.loadOrNew();
    const d = DIFFICULTY[save.difficulty];

    this.add.text(VIEW_W / 2, 70, TEXT.stageSelect, textStyle(44)).setOrigin(0.5);
    this.add
      .text(
        VIEW_W / 2,
        125,
        `ジャン ${fmt(TEXT.levelShort, { n: save.hero.level })}　${fmt(TEXT.difficultyLabel, { name: d.name })}　${d.revive ? TEXT.reviveOn : TEXT.reviveOff}`,
        textStyle(24, '#ffe9a8'),
      )
      .setOrigin(0.5);
    if (this.notice) this.add.text(VIEW_W / 2, 170, this.notice, textStyle(26, '#ffffff')).setOrigin(0.5);

    STAGE_ORDER.forEach((id, i) => {
      const { stage } = STAGES[id];
      const y = 260 + i * 130;
      const open = isUnlocked(save, id);
      new Button(this, {
        x: VIEW_W / 2,
        y,
        w: 640,
        h: 100,
        label: fmt(TEXT.stageButton, { n: i + 1, title: stage.title }),
        fontSize: 38,
        color: open ? 0xd94f3a : 0x8a8a8a,
        shadow: open ? 0x9c3426 : 0x5a5a5a,
        onTap: () => {
          if (open) this.scene.start('Battle', { mode: 'stage', stageId: id });
        },
      });
      const c = save.cleared[id];
      const sub = !open
        ? TEXT.locked
        : c
          ? fmt(TEXT.bestLabel, { stars: '★'.repeat(c.stars) + '☆'.repeat(3 - c.stars), time: formatTime(c.bestSeconds) })
          : stage.subtitle;
      this.add.text(VIEW_W / 2, y + 64, sub, textStyle(22, c ? '#ffe066' : '#ffffff')).setOrigin(0.5);
    });

    new Button(this, {
      x: VIEW_W / 2,
      y: VIEW_H - 70,
      w: 300,
      h: 72,
      label: TEXT.toTitle,
      fontSize: 30,
      color: 0x6e6250,
      shadow: 0x4a4136,
      onTap: () => this.scene.start('Title'),
    });
  }
}

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
