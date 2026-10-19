import type Phaser from 'phaser';
import { UNIT_DATA } from '../data/unitData';
import type { Squad } from '../entities/Squad';
import type { World } from '../systems/World';
import { TEXT, fmt, textStyle } from './Display';

/** 部隊の兵種ごとの人数（例：「剣2 馬8」）。補充で兵種が混ざった部隊もそのまま表す */
export function compositionText(sq: Squad, sep = ' '): string {
  return sq
    .composition()
    .map((c) => `${UNIT_DATA.kinds[c.kind].short}${c.n}`)
    .join(sep);
}

/** 画面左上：ジャンのHP、いまの命令、率いている部隊の一覧、敵の残りと経過時間 */
export class Hud {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly order: Phaser.GameObjects.Text;
  private readonly squads: Phaser.GameObjects.Text;
  private readonly counts: Phaser.GameObjects.Text;
  private readonly guards: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(800);
    this.name = scene.add.text(30, 36, TEXT.heroName, textStyle(26, '#ffd04a')).setOrigin(0, 0.5).setDepth(801);
    this.order = scene.add.text(30, 78, '', textStyle(24)).setOrigin(0, 0.5).setDepth(801);
    this.squads = scene.add.text(30, 116, '', textStyle(22)).setOrigin(0, 0.5).setDepth(801);
    this.counts = scene.add.text(30, 154, '', textStyle(20, '#e8e0cc')).setOrigin(0, 0.5).setDepth(801);
    this.guards = scene.add.text(30, 190, '', textStyle(22, '#ffd84d')).setOrigin(0, 0.5).setDepth(801);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.name, this.order, this.squads, this.counts, this.guards];
  }

  update(w: World): void {
    const h = w.hero;
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x000000, 0.38);
    // 大将がいるステージでは、残りの護衛の数を1行足す
    const hasGeneral = !!w.general;
    g.fillRoundedRect(14, 12, 360, hasGeneral ? 200 : 166, 18);
    // HPバー
    const bx = 110;
    const bw = 244;
    g.fillStyle(0xffffff, 0.25);
    g.fillRoundedRect(bx, 26, bw, 20, 10);
    const ratio = Math.max(0, h.hp / h.maxHp);
    g.fillStyle(ratio > 0.3 ? 0x5bd16a : 0xff5a4f, 1);
    g.fillRoundedRect(bx, 26, Math.max(8, bw * ratio), 20, 10);

    const charge = w.order === 'charge';
    this.order.setText(fmt(TEXT.orderLabel, { order: charge ? TEXT.orderCharge : TEXT.orderGather }));
    this.order.setColor(charge ? '#ffb0a8' : '#bcd6ff');

    const following = w.followingSquads();
    const list = following.map((sq) => compositionText(sq, '')).join(' ');
    this.squads.setText(`${fmt(TEXT.squadCount, { n: following.length, max: w.leadership })}　${list || TEXT.noSquads}`);

    const s = Math.floor(w.time);
    this.counts.setText(`${TEXT.enemyLabel} ${w.countAlive('enemy')}　${TEXT.time} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    this.guards.setVisible(hasGeneral);
    if (hasGeneral) {
      const n = w.guardsLeft();
      this.guards.setText(n > 0 ? fmt(TEXT.guardsLeft, { n }) : TEXT.guardsGone);
    }
  }
}
