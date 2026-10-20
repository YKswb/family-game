import type Phaser from 'phaser';
import { UNIT_DATA } from '../data/unitData';
import type { Squad } from '../entities/Squad';
import { xpToNext } from '../systems/Progress';
import type { World } from '../systems/World';
import { TEXT, fmt, textStyle } from './Display';

/** 部隊の兵種ごとの人数（例：「剣2 馬8」）。補充で兵種が混ざった部隊もそのまま表す */
export function compositionText(sq: Squad, sep = ' '): string {
  return sq
    .composition()
    .map((c) => `${UNIT_DATA.kinds[c.kind].short}${c.n}`)
    .join(sep);
}

/** ジャンヌの行の高さ（ジャンヌがいるステージでは、その分下の行をずらす） */
const JEANNE_ROW = 36;

/** 画面左上：ジャンのHP、ジャンヌのHP、いまの命令、率いている部隊の一覧、敵の残りと経過時間 */
export class Hud {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly jeanne: Phaser.GameObjects.Text;
  private readonly order: Phaser.GameObjects.Text;
  private readonly squads: Phaser.GameObjects.Text;
  private readonly counts: Phaser.GameObjects.Text;
  private readonly guards: Phaser.GameObjects.Text;

  /** ジャンヌの行のぶん、下の行をずらす量 */
  private readonly dy: number;

  constructor(scene: Phaser.Scene, withJeanne: boolean) {
    const dy = (this.dy = withJeanne ? JEANNE_ROW : 0);
    this.gfx = scene.add.graphics().setDepth(800);
    this.name = scene.add.text(30, 36, TEXT.heroName, textStyle(26, '#ffd04a')).setOrigin(0, 0.5).setDepth(801);
    this.jeanne = scene.add.text(30, 74, TEXT.jeanneName, textStyle(22, '#ffe9f2')).setOrigin(0, 0.5).setDepth(801).setVisible(withJeanne);
    this.order = scene.add.text(30, 78 + dy, '', textStyle(24)).setOrigin(0, 0.5).setDepth(801);
    this.squads = scene.add.text(30, 116 + dy, '', textStyle(22)).setOrigin(0, 0.5).setDepth(801);
    this.counts = scene.add.text(30, 154 + dy, '', textStyle(20, '#e8e0cc')).setOrigin(0, 0.5).setDepth(801);
    this.guards = scene.add.text(30, 190 + dy, '', textStyle(22, '#ffd84d')).setOrigin(0, 0.5).setDepth(801);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.name, this.jeanne, this.order, this.squads, this.counts, this.guards];
  }

  update(w: World): void {
    const h = w.hero;
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x000000, 0.38);
    // 大将がいるステージでは、残りの護衛の数を1行足す
    const hasGeneral = !!w.general;
    g.fillRoundedRect(14, 12, 360, (hasGeneral ? 200 : 166) + this.dy, 18);
    // HPバー
    const bx = 150;
    const bw = 204;
    g.fillStyle(0xffffff, 0.25);
    g.fillRoundedRect(bx, 26, bw, 20, 10);
    const ratio = Math.max(0, h.hp / h.maxHp);
    g.fillStyle(ratio > 0.3 ? 0x5bd16a : 0xff5a4f, 1);
    g.fillRoundedRect(bx, 26, Math.max(8, bw * ratio), 20, 10);
    // 経験値のバー（HPのすぐ下）
    const xr = Math.min(1, w.xp / xpToNext(w.level));
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(bx, 50, bw, 6, 3);
    g.fillStyle(0xffe066, 1);
    if (xr > 0) g.fillRoundedRect(bx, 50, Math.max(4, bw * xr), 6, 3);
    // ジャンヌのHPバー（少ないときは赤）
    const j = w.jeanne;
    if (j) {
      g.fillStyle(0xffffff, 0.25);
      g.fillRoundedRect(bx, 66, bw, 16, 8);
      const jr = Math.max(0, j.hp / j.maxHp);
      g.fillStyle(jr >= w.data.ai.jeanne.lowHpRatio ? 0xff9ec4 : 0xff5a4f, 1);
      if (jr > 0) g.fillRoundedRect(bx, 66, Math.max(8, bw * jr), 16, 8);
    }
    this.name.setText(`${TEXT.heroName} ${fmt(TEXT.levelShort, { n: w.level })}`);

    const charge = w.order === 'charge';
    this.order.setText(fmt(TEXT.orderLabel, { order: charge ? TEXT.orderCharge : TEXT.orderGather }));
    // 色の設定は文字の描き直しになるので、変わったときだけ
    const color = charge ? '#ffb0a8' : '#bcd6ff';
    if (this.order.style.color !== color) this.order.setColor(color);

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
