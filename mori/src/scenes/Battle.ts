import Phaser from 'phaser';
import { STAGES } from '../data/gameData';
import type { Spot } from '../systems/Build';
import { Random } from '../systems/Random';
import { World, type WorldEvent } from '../systems/World';
import { Hud } from '../ui/Hud';
import { DPR, TEXT, hex, screenSize, textStyle, worldZoom } from '../ui/Display';
import { Joystick } from '../ui/Joystick';
import { drawHouse } from '../views/HouseView';
import { drawPlayer, stackTop } from '../views/PlayerView';
import { drawSpot } from '../views/SpotView';
import { drawTree } from '../views/TreeView';
import { dashedCircle, drawLog, ell } from '../views/shapes';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: number;
  size: number;
}

/** 飛んでいく木材。toPlayer なら主人公の背中へ、そうでなければ建設地点へ */
interface Flyer {
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  toPlayer: boolean;
  /** 負の間は出発待ち */
  t: number;
  dur: number;
}

interface Popup {
  text: Phaser.GameObjects.Text;
  t: number;
}

interface SpotLabel {
  icon: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  stars: Phaser.GameObjects.Text;
}

const POPUP_LIFE = 1.1;
const SPOT_ICON: Record<Spot['type'], string> = { axe: '🪓', bag: '🎒' };

/** 戦場（マイルストーン1：歩く・木を切る・木材を運ぶ・建てる） */
export class BattleScene extends Phaser.Scene {
  private world!: World;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private spotGfx!: Phaser.GameObjects.Graphics;
  private objGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private joystick!: Joystick;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private spotLabels: SpotLabel[] = [];
  private fullText!: Phaser.GameObjects.Text;
  private particles: Particle[] = [];
  private flyers: Flyer[] = [];
  private popups: Popup[] = [];
  private fxRng = new Random(99);
  private leaf: [number, number] = [0, 0];
  /** 見た目の領地の半径（広がるときに少しずつ追いつく） */
  private terrShown = 0;
  private zoom = 1;
  private viewW = 0;
  private viewH = 0;
  private camX = 0;
  private camY = 0;

  constructor() {
    super('Battle');
  }

  init(): void {
    this.spotLabels = [];
    this.particles = [];
    this.flyers = [];
    this.popups = [];
  }

  create(): void {
    const stage = STAGES[0];
    this.world = new World(stage, { seed: Date.now() % 100000 });
    this.leaf = [hex(stage.theme.leaf[0]), hex(stage.theme.leaf[1])];
    this.terrShown = this.world.territory;
    this.input.addPointer(2);

    this.cameras.main.setOrigin(0, 0).setBackgroundColor(stage.theme.background);
    this.uiCam = this.cameras.add(0, 0, 1, 1).setOrigin(0, 0);

    this.drawGround();
    this.spotGfx = this.toWorld(this.add.graphics().setDepth(1));
    this.createSpotLabels();
    this.objGfx = this.toWorld(this.add.graphics().setDepth(3));
    this.fxGfx = this.toWorld(this.add.graphics().setDepth(4));
    this.fullText = this.toWorld(this.add.text(0, 0, TEXT.full, textStyle(15, '#ffd84d')).setOrigin(0.5).setDepth(5));

    this.hud = new Hud(this);
    this.toUi(...this.hud.objects);
    this.joystick = new Joystick(this);
    this.toUi(this.joystick.gfx);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    // アプリを切り替えると Phaser が止まる。戻ったときに指が離れたままにならないようにする
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    });

    const p = this.world.player;
    this.camX = p.x;
    this.camY = p.y;
    this.updateCamera(1);

    // 自動テストやデバッグ用に外から覗けるようにしておく
    (window as unknown as { __mori: unknown }).__mori = { scene: this, world: this.world };
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const w = this.world;
    w.input = this.readInput();
    w.step(dt);
    for (const e of w.events) this.onEvent(e);
    this.terrShown += (w.territory - this.terrShown) * Math.min(1, dt * 2.5);
    this.updateEffects(dt);
    this.render();
    this.hud.update(w);
    this.joystick.draw();
    this.updateCamera(dt);
  }

  // ---- 画面の大きさ ----

  private layout(): void {
    const { w, h } = screenSize();
    this.viewW = w;
    this.viewH = h;
    this.zoom = worldZoom(w, h);
    this.cameras.main.setSize(w * DPR, h * DPR).setZoom(DPR * this.zoom);
    this.uiCam.setSize(w * DPR, h * DPR).setZoom(DPR);
    this.hud.layout(w, h);
    this.updateCamera(1);
  }

  private onHidden(): void {
    this.joystick.release();
  }

  // ---- 入力 ----

  private readInput(): { x: number; y: number } {
    const k = this.keys;
    const kx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    const ky = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      return { x: kx / l, y: ky / l };
    }
    return this.joystick.vector;
  }

  // ---- 描画 ----

  /** 地面・草・花・おうちのまわりの空き地（動かないので最初に1回だけ描く） */
  private drawGround(): void {
    const { stage, width, height, house } = this.world;
    const th = stage.theme;
    const g = this.toWorld(this.add.graphics().setDepth(0));
    const rng = new Random(7);
    g.fillStyle(hex(th.ground), 1);
    g.fillRect(0, 0, width, height);
    const tuft = th.tuft.map(hex);
    for (let i = 0; i < 450; i++) {
      const s = rng.range(3, 7);
      g.fillStyle(tuft[i % tuft.length], 1);
      ell(g, rng.range(0, width), rng.range(0, height), s, s * 0.5);
    }
    const flower = th.flower.map(hex);
    for (let i = 0; i < 80; i++) {
      g.fillStyle(flower[i % flower.length], 1);
      g.fillCircle(rng.range(0, width), rng.range(0, height), 3);
    }
    g.fillStyle(hex(th.clearing), 0.75);
    ell(g, house.x, house.y + 10, 250, 238);
  }

  private createSpotLabels(): void {
    for (const s of this.world.spots) {
      this.spotLabels.push({
        icon: this.toWorld(this.add.text(s.x, s.y + 2, SPOT_ICON[s.type], { fontSize: '28px', resolution: DPR }).setOrigin(0.5).setDepth(2)),
        name: this.toWorld(this.add.text(s.x, s.y + 46, '', textStyle(15)).setOrigin(0.5).setDepth(2)),
        cost: this.toWorld(this.add.text(s.x + 1, s.y + 64, '', textStyle(16)).setOrigin(0, 0.5).setDepth(2)),
        stars: this.toWorld(this.add.text(s.x, s.y + 84, '', textStyle(12, '#ffd84d')).setOrigin(0.5).setDepth(2)),
      });
    }
  }

  /** いま見えている戦場の範囲 */
  private viewRect(): { x: number; y: number; w: number; h: number } {
    const cam = this.cameras.main;
    return { x: cam.scrollX, y: cam.scrollY, w: this.viewW / this.zoom, h: this.viewH / this.zoom };
  }

  private render(): void {
    const w = this.world;
    const p = w.player;
    const axe = w.levelOf('axe');

    const sg = this.spotGfx;
    sg.clear();
    w.spots.forEach((s, i) => {
      drawSpot(sg, s, w.time);
      const l = this.spotLabels[i];
      const name = TEXT[s.type as 'axe' | 'bag'];
      l.icon.setVisible(!s.maxed);
      if (s.maxed) {
        l.name.setText(`${name} ${TEXT.max}`).setColor('#ffd84d');
        l.cost.setVisible(false);
        l.stars.setVisible(false);
      } else {
        l.name.setText(name).setColor('#ffffff');
        l.cost.setVisible(true).setText(String(s.remaining));
        drawLog(sg, s.x - 11, s.y + 64, 15);
        l.stars.setVisible(true).setText('★'.repeat(s.level) + '☆'.repeat(s.maxLevel - s.level));
      }
    });

    // 木・おうち・主人公を、足元の y の順に重ねる
    const v = this.viewRect();
    const x0 = v.x - 60;
    const y0 = v.y - 40;
    const x1 = v.x + v.w + 60;
    const y1 = v.y + v.h + 140;
    const objs: { y: number; draw: () => void }[] = [];
    for (const t of w.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      objs.push({ y: t.y, draw: () => drawTree(this.objGfx, t, this.leaf) });
    }
    objs.push({ y: w.house.y, draw: () => drawHouse(this.objGfx, w.house) });
    objs.push({ y: p.y, draw: () => drawPlayer(this.objGfx, p, axe) });
    objs.sort((a, b) => a.y - b.y);
    this.objGfx.clear();
    for (const o of objs) o.draw();

    const f = this.fxGfx;
    f.clear();
    for (const q of this.particles) {
      f.fillStyle(q.color, Math.max(0, 1 - q.t / q.life));
      f.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    // 領地の外は霧で暗くする（太い輪で外側を塗る）
    const fogW = 2400;
    f.lineStyle(fogW, hex(w.stage.theme.fog), 0.6);
    f.strokeCircle(w.house.x, w.house.y, this.terrShown + fogW / 2);
    f.lineStyle(3, 0xffffff, 0.45);
    dashedCircle(f, w.house.x, w.house.y, this.terrShown, 14, 10);
    for (const fl of this.flyers) {
      if (fl.t < 0) continue;
      const k = Math.min(1, fl.t / fl.dur);
      const tx = fl.toPlayer ? p.x - 12 * p.face : fl.tx;
      const ty = fl.toPlayer ? p.y - stackTop(p) : fl.ty;
      drawLog(f, fl.x0 + (tx - fl.x0) * k, fl.y0 + (ty - fl.y0) * k - Math.sin(k * Math.PI) * 50, 16, k * 6);
    }

    const full = p.wood >= w.capacity;
    this.fullText.setVisible(full).setPosition(p.x, p.y - stackTop(p) - 22);
  }

  private updateCamera(dt: number): void {
    const p = this.world.player;
    const k = Math.min(1, dt * 8);
    this.camX += (p.x - this.camX) * k;
    this.camY += (p.y - this.camY) * k;
    const vw = this.viewW / this.zoom;
    const vh = this.viewH / this.zoom;
    const { width, height } = this.world;
    const sx = width <= vw ? (width - vw) / 2 : Phaser.Math.Clamp(this.camX - vw / 2, 0, width - vw);
    const sy = height <= vh ? (height - vh) / 2 : Phaser.Math.Clamp(this.camY - vh / 2, 0, height - vh);
    this.cameras.main.setScroll(sx, sy);
  }

  // ---- 効果 ----

  private onEvent(e: WorldEvent): void {
    const w = this.world;
    switch (e.type) {
      case 'chop':
        this.burst(e.tree.x, e.tree.y - 20, 0xc58a52, 6, 140, 4);
        break;
      case 'fell':
        this.burst(e.tree.x, e.tree.y - 50, this.leaf[0], 14, 180, 6);
        break;
      case 'wood':
        for (let i = 0; i < e.n; i++) this.flyers.push({ x0: e.x, y0: e.y, tx: 0, ty: 0, toPlayer: true, t: -i * 0.07, dur: 0.35 });
        break;
      case 'pay': {
        const p = w.player;
        this.flyers.push({ x0: p.x, y0: p.y - 45, tx: e.spot.x, ty: e.spot.y, toPlayer: false, t: 0, dur: 0.25 });
        break;
      }
      case 'built':
        this.burst(e.spot.x, e.spot.y - 30, 0xffd84d, 22, 230, 5);
        this.popup(e.spot.x, e.spot.y - 55, e.spot.type === 'axe' ? TEXT.builtAxe : TEXT.builtBag);
        break;
    }
  }

  private burst(x: number, y: number, color: number, n: number, speed: number, size: number): void {
    const rng = this.fxRng;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const v = rng.range(speed * 0.3, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        t: 0,
        life: rng.range(0.4, 0.8),
        color,
        size: rng.range(size * 0.6, size * 1.3),
      });
    }
  }

  private popup(x: number, y: number, s: string): void {
    const text = this.toWorld(this.add.text(x, y, s, textStyle(18)).setOrigin(0.5).setDepth(6));
    this.popups.push({ text, t: 0 });
  }

  private updateEffects(dt: number): void {
    for (const q of this.particles) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 320 * dt;
      q.vx *= 0.98;
    }
    this.particles = this.particles.filter((q) => q.t < q.life);
    for (const f of this.flyers) f.t += dt;
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
    for (const pp of this.popups) {
      pp.t += dt;
      pp.text.y -= 40 * dt;
      pp.text.setAlpha(Math.max(0, 1 - Math.pow(pp.t / POPUP_LIFE, 2)));
      if (pp.t >= POPUP_LIFE) pp.text.destroy();
    }
    this.popups = this.popups.filter((pp) => pp.t < POPUP_LIFE);
  }

  // ---- カメラの振り分け ----

  private toWorld<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.uiCam.ignore(o);
    return o;
  }

  private toUi(...objs: Phaser.GameObjects.GameObject[]): void {
    this.cameras.main.ignore(objs);
  }
}
