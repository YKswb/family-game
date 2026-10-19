import Phaser from 'phaser';
import { UNIT_DATA } from '../data/unitData';
import { GROWTH, STAT_KEYS, type Allocation, type StatKey } from '../systems/Progress';
import { nextStageOf, Session } from '../systems/Session';
import { Button } from '../ui/Button';
import { DPR, TEXT, VIEW_H, VIEW_W, fmt, textStyle } from '../ui/Display';
import { formatTime } from './StageSelect';

export interface IntermissionData {
  stageId: string;
  seconds: number;
  stars: number;
  kills: number;
  survivors: number;
  xpGained: number;
  levelBefore: number;
  pointsGot: number;
}

/**
 * ステージとステージのあいだ：クリア結果 → フリーポイントの振り分け → 連れていく部隊 → 次へ。
 * 振り分けはこの画面の中ならやり直せて、「つぎへ」で決まる
 */
export class IntermissionScene extends Phaser.Scene {
  private result!: IntermissionData;
  private base!: Allocation;
  private draft!: Allocation;
  private left = 0;
  private valueTexts = new Map<StatKey, Phaser.GameObjects.Text>();
  private leftText!: Phaser.GameObjects.Text;

  constructor() {
    super('Intermission');
  }

  init(data: IntermissionData): void {
    this.result = data;
    this.valueTexts = new Map();
  }

  create(): void {
    this.cameras.main.setOrigin(0, 0).setZoom(DPR).setBackgroundColor('#3b4a66');
    const save = Session.loadOrNew();
    const r = this.result;
    this.base = { ...save.hero.alloc };
    this.draft = { ...save.hero.alloc };
    this.left = save.unspent;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(30, 150, 500, 470, 24);
    g.fillRoundedRect(560, 150, 590, 560, 24);

    this.add.text(VIEW_W / 2, 50, TEXT.intermissionTitle, textStyle(48, '#ffd84d')).setOrigin(0.5);
    this.add.text(VIEW_W / 2, 108, '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), textStyle(48, '#ffe066')).setOrigin(0.5);

    // 左：結果
    const lines = [
      `${TEXT.clearTime}  ${formatTime(r.seconds)}`,
      `${TEXT.kills}  ${r.kills}`,
      `${TEXT.survivorsShort}  ${r.survivors}`,
      fmt(TEXT.xpGained, { n: Math.floor(r.xpGained) }),
      save.hero.level > r.levelBefore ? fmt(TEXT.levelUp, { n: save.hero.level }) : fmt(TEXT.levelNow, { n: save.hero.level }),
      fmt(TEXT.pointsGot, { n: r.pointsGot }),
    ];
    lines.forEach((s, i) => this.add.text(60, 190 + i * 66, s, textStyle(30, i >= 4 ? '#ffe066' : '#ffffff')));

    // 右：フリーポイント
    this.add.text(580, 168, TEXT.pointsHelp, textStyle(22, '#e8e0cc'));
    this.leftText = this.add.text(580, 210, '', textStyle(30, '#ffe066'));
    STAT_KEYS.forEach((key, i) => this.statRow(key, 270 + i * 66));
    new Button(this, {
      x: 680,
      y: 672,
      w: 180,
      h: 54,
      label: TEXT.redo,
      fontSize: 22,
      color: 0x6e6250,
      shadow: 0x4a4136,
      onTap: () => {
        this.draft = { ...this.base };
        this.left = save.unspent;
        this.refresh();
      },
    });

    // 下：連れていく部隊
    const squads = save.squads.map((sq) => sq.composition.map((c) => `${UNIT_DATA.kinds[c.kind].short}${c.n}`).join('')).join(' ');
    this.add.text(60, 650, TEXT.squadsTitle, textStyle(24, '#bcd6ff'));
    this.add.text(60, 690, squads || TEXT.noCarry, textStyle(28));

    new Button(this, {
      x: VIEW_W - 170,
      y: VIEW_H - 60,
      w: 260,
      h: 84,
      label: TEXT.next,
      fontSize: 36,
      color: 0xd94f3a,
      shadow: 0x9c3426,
      onTap: () => this.proceed(),
    });
    this.refresh();
  }

  private statRow(key: StatKey, y: number): void {
    const p = GROWTH.points[key];
    this.add.text(580, y - 14, `${p.name}（${p.ruby}）`, textStyle(26));
    this.add.text(580, y + 16, p.effect, textStyle(18, '#cfd6e6'));
    const v = this.add.text(900, y, '', textStyle(30, '#ffe066')).setOrigin(0.5);
    this.valueTexts.set(key, v);
    new Button(this, { x: 980, y, w: 64, h: 54, label: '－', fontSize: 30, color: 0x6e6250, shadow: 0x4a4136, onTap: () => this.change(key, -1) });
    new Button(this, { x: 1070, y, w: 64, h: 54, label: '＋', fontSize: 30, color: 0x4caf50, shadow: 0x2e7d32, onTap: () => this.change(key, +1) });
  }

  /** ＋は残りのポイントと上限まで、－はこの画面で足した分まで */
  private change(key: StatKey, d: number): void {
    if (d > 0 && (this.left <= 0 || this.draft[key] >= GROWTH.points[key].max)) return;
    if (d < 0 && this.draft[key] <= this.base[key]) return;
    this.draft[key] += d;
    this.left -= d;
    this.refresh();
  }

  private refresh(): void {
    this.leftText.setText(fmt(TEXT.pointsLeft, { n: this.left }));
    for (const [key, t] of this.valueTexts) t.setText(String(this.draft[key]));
  }

  /** 「つぎへ」：振り分けを決めて保存し、次のステージへ（まだ無ければステージ選びへ） */
  private proceed(): void {
    const save = Session.loadOrNew();
    save.hero.alloc = { ...this.draft };
    save.unspent = this.left;
    Session.save(save);
    const next = nextStageOf(this.result.stageId);
    if (next) this.scene.start('Battle', { mode: 'stage', stageId: next });
    else this.scene.start('StageSelect', { notice: TEXT.comingSoon });
  }
}
