import type Phaser from 'phaser';
import type { Arrow } from '../systems/World';
import type { Unit } from './Unit';

/**
 * 兵士の見た目。当面はすべて図形で描き、あとで画像に差し替えるときはこのファイルだけを変える
 */
const COLOR = {
  ally: 0x4f8dff,
  enemy: 0xff5a4f,
  hero: 0xffd04a,
  flash: 0xffffff,
  skin: 0xffd9b0,
  legs: 0x3b4a66,
  horse: 0x8a5a33,
  horseDark: 0x3a2a1a,
  steel: 0xd8dde3,
  wood: 0x8a5a33,
  cape: 0xd94f3a,
  helmet: 0x2f6fd6,
  shadow: 0x000000,
  hpBack: 0x000000,
  hpHero: 0x5bd16a,
  hpLow: 0xff5a4f,
};

export function drawUnit(g: Phaser.GameObjects.Graphics, u: Unit): void {
  const isHero = u.kind === 'hero';
  const flash = u.hitFlash > 0;
  const body = flash ? COLOR.flash : isHero ? COLOR.hero : u.side === 'ally' ? COLOR.ally : COLOR.enemy;
  const bob = u.moving ? Math.abs(Math.sin(u.bob)) * 2 : 0;
  const r = u.radius;

  g.save();
  g.translateCanvas(u.x, u.y);
  g.fillStyle(COLOR.shadow, 0.2);
  g.fillEllipse(0, 2, r * 2.2, r * 0.9);
  g.scaleCanvas(u.face, 1);

  if (u.kind === 'cavalry') {
    g.fillStyle(flash ? COLOR.flash : COLOR.horse, 1);
    g.fillEllipse(0, -8 - bob, 32, 18);
    g.fillRoundedRect(8, -20 - bob, 8, 12, 3);
    g.fillStyle(COLOR.horseDark, 1);
    g.fillRect(-15, -12 - bob, 5, 3);
    g.fillStyle(body, 1);
    g.fillCircle(0, -20 - bob, 7);
    g.fillStyle(COLOR.skin, 1);
    g.fillCircle(0, -30 - bob, 5);
    g.lineStyle(2, COLOR.steel, 1);
    g.lineBetween(6, -22 - bob, 18, -34 - bob - u.swing * 6);
  } else {
    const hh = isHero ? 1.25 : 1;
    const top = -9 * hh - r * 1.5 - bob;
    const headY = top - 7;
    g.fillStyle(COLOR.legs, 1);
    g.fillRect(-5, -9 * hh - bob, 4, 9 * hh);
    g.fillRect(1, -9 * hh - bob, 4, 9 * hh);
    if (isHero) {
      g.fillStyle(COLOR.cape, 1);
      g.fillTriangle(-9, top + 2, -17, -6 - bob, -4, -10 - bob);
    }
    g.fillStyle(body, 1);
    g.fillRoundedRect(-r * 0.85, top, r * 1.7, r * 1.5, 4);
    g.fillStyle(COLOR.skin, 1);
    g.fillCircle(0, headY, 6);
    if (isHero) {
      g.fillStyle(COLOR.helmet, 1);
      g.beginPath();
      g.arc(0, headY - 1, 6.5, Math.PI, 0);
      g.fillPath();
    }

    if (u.kind === 'archer') {
      g.lineStyle(2, COLOR.wood, 1);
      g.beginPath();
      g.arc(9, -16 - bob, 8, -Math.PI / 2, Math.PI / 2);
      g.strokePath();
      g.lineStyle(1, COLOR.steel, 1);
      g.lineBetween(9, -24 - bob, 9, -8 - bob);
    } else if (u.kind === 'spear') {
      // 槍は長い柄を前に突き出す
      const t = u.swing * 8;
      g.lineStyle(2.5, COLOR.wood, 1);
      g.lineBetween(-6 + t, -8 - bob, 24 + t, -24 - bob);
      g.fillStyle(COLOR.steel, 1);
      g.fillTriangle(22 + t, -28 - bob, 31 + t, -28 - bob, 24 + t, -20 - bob);
    } else {
      g.save();
      g.translateCanvas(r * 0.8, -14 - bob);
      g.rotateCanvas(u.swing > 0 ? -1.6 + (1 - u.swing) * 2.4 : -0.4);
      g.lineStyle(isHero ? 3 : 2, COLOR.steel, 1);
      g.lineBetween(0, 0, 0, -16 * hh);
      g.restore();
    }
  }
  g.restore();

  if (isHero && u.hp < u.maxHp) {
    const w = 44;
    g.fillStyle(COLOR.hpBack, 0.45);
    g.fillRoundedRect(u.x - w / 2, u.y - 62, w, 6, 3);
    g.fillStyle(u.hp / u.maxHp > 0.3 ? COLOR.hpHero : COLOR.hpLow, 1);
    g.fillRoundedRect(u.x - w / 2, u.y - 62, Math.max(3, (w * u.hp) / u.maxHp), 6, 3);
  }
}

export function drawArrow(g: Phaser.GameObjects.Graphics, a: Arrow): void {
  const l = Math.hypot(a.vx, a.vy) || 1;
  g.lineStyle(2, a.side === 'ally' ? 0xe8f0ff : 0xffd0c8, 1);
  g.lineBetween(a.x, a.y, a.x - (a.vx / l) * 12, a.y - (a.vy / l) * 12);
}

export function drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
  g.fillStyle(COLOR.shadow, 0.18);
  g.fillEllipse(x, y + 2, 36 * s, 14 * s);
  g.fillStyle(0x7a4e2b, 1);
  g.fillRoundedRect(x - 5 * s, y - 24 * s, 10 * s, 26 * s, 3);
  g.fillStyle(0x2f7a3a, 1);
  g.fillCircle(x - 12 * s, y - 30 * s, 14 * s);
  g.fillCircle(x + 12 * s, y - 30 * s, 14 * s);
  g.fillCircle(x, y - 42 * s, 19 * s);
  g.fillStyle(0x3f9a48, 1);
  g.fillCircle(x - 4 * s, y - 46 * s, 9 * s);
}
