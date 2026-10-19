import Phaser from 'phaser';
import { STAGES, type TowerKind } from '../data/gameData';
import type { Spot } from '../systems/Build';
import { Random } from '../systems/Random';
import { World, type WorldEvent } from '../systems/World';
import { DPR, TEXT, fmt, hex, screenSize, textStyle, worldZoom } from '../ui/Display';
import { Hud } from '../ui/Hud';
import { Joystick } from '../ui/Joystick';
import { Overlay } from '../ui/Overlay';
import { drawEnemy } from '../views/EnemyView';
import { drawHouse } from '../views/HouseView';
import { drawPlayer, stackTop } from '../views/PlayerView';
import { drawSpot } from '../views/SpotView';
import { drawTower } from '../views/TowerView';
import { drawTree } from '../views/TreeView';
import { drawPost, drawWallSpot } from '../views/WallView';
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
const SPOT_ICON: Record<Spot['type'], string> = { axe: '🪓', bag: '🎒', tower: '🏰', land: '🚩', wall: '' };
const TOWER_KINDS: TowerKind[] = ['arrow', 'cannon', 'ice'];

/** 難易度は、ステージ選びができるまでは URL の ?diff=0〜2 で選ぶ（既定はふつう） */
function difficultyFromUrl(): number {
  const v = new URLSearchParams(window.location.search).get('diff');
  return v === '0' ? 0 : v === '2' ? 2 : 1;
}

/** 戦場（マイルストーン2：木を集めて建て、敵のウェーブからおうちを守る） */
export class BattleScene extends Phaser.Scene {
  private world!: World;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private spotGfx!: Phaser.GameObjects.Graphics;
  private objGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private overlay!: Overlay;
  private joystick!: Joystick;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private spotLabels = new Map<Spot, SpotLabel>();
  private fullText!: Phaser.GameObjects.Text;
  private particles: Particle[] = [];
  private flyers: Flyer[] = [];
  private popups: Popup[] = [];
  private fxRng = new Random(99);
  private leaf: [number, number] = [0, 0];
  /** 見た目の領地の半径（広がるときに少しずつ追いつく） */
  private terrShown = 0;
  private shake = 0;
  private paused = false;
  private resultShown = false;
  private zoom = 1;
  private viewW = 0;
  private viewH = 0;
  private camX = 0;
  private camY = 0;

  constructor() {
    super('Battle');
  }

  init(): void {
    this.spotLabels = new Map();
    this.particles = [];
    this.flyers = [];
    this.popups = [];
    this.shake = 0;
    this.paused = false;
    this.resultShown = false;
  }

  create(): void {
    const stage = STAGES[0];
    this.world = new World(stage, { seed: Date.now() % 100000, difficulty: difficultyFromUrl() });
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
    this.overlay = new Overlay();
    this.overlay.hide();
    this.overlay.callBtn.textContent = TEXT.callNow;
    this.overlay.callBtn.onclick = () => this.world.callNow();
    this.overlay.pauseBtn.onclick = () => this.pause();

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    // アプリを切り替えたら「ひとやすみ」にする（Phaser 自体も止まる）
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
      for (const p of this.popups) p.text.destroy();
    });

    const p = this.world.player;
    this.camX = p.x;
    this.camY = p.y;
    this.updateCamera(1);
    this.hud.showBanner(stage.name);

    // 自動テストやデバッグ用に外から覗けるようにしておく
    (window as unknown as { __mori: unknown }).__mori = { scene: this, world: this.world };
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const w = this.world;
    const running = !this.paused && !this.overlay.visible && w.outcome === 'playing';
    if (running) {
      w.input = this.readInput();
      w.step(dt);
      for (const e of w.events) this.onEvent(e);
      if (w.choice) this.openChoice();
    }
    if (w.outcome !== 'playing' && !this.resultShown) {
      this.resultShown = true;
      this.joystick.release();
      this.time.delayedCall(900, () => this.showResult());
    }
    this.overlay.pauseBtn.classList.toggle('hide', w.outcome !== 'playing' || this.overlay.visible);
    this.overlay.callBtn.classList.toggle('hide', !(running && w.phase === 'prep'));
    this.terrShown += (w.territory - this.terrShown) * Math.min(1, dt * 2.5);
    this.shake = Math.max(0, this.shake - dt);
    this.updateEffects(running ? dt : 0);
    this.render();
    this.hud.update(w, running ? dt : 0, (x, y) => this.toScreen(x, y), fmt(TEXT.stageLabel, { n: 1, diff: w.diff.name }));
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
    this.pause();
  }

  // ---- 入力と画面の切り替え ----

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

  private pause(): void {
    const w = this.world;
    if (this.paused || this.overlay.visible || w.outcome !== 'playing') return;
    this.paused = true;
    this.joystick.release();
    this.overlay.showResult({
      title: TEXT.pause,
      stars: 0,
      lines: [w.stage.name, `${fmt(TEXT.level, { lv: w.level })}・${w.diff.name}`],
      buttons: [{ label: TEXT.resume, onTap: () => (this.paused = false) }],
    });
  }

  /** とうの種類か、レベルアップの強化を選ぶ画面を出す */
  private openChoice(): void {
    const w = this.world;
    const c = w.choice;
    if (!c || this.overlay.visible) return;
    this.joystick.release();
    if (c.type === 'tower') {
      const kinds = w.data.towers.kinds;
      this.overlay.showChoice(
        TEXT.chooseTower,
        '',
        TOWER_KINDS.map((k) => ({ icon: kinds[k].icon, name: kinds[k].name, desc: kinds[k].desc })),
        (i) => {
          const kind = TOWER_KINDS[i];
          w.chooseTower(kind);
          this.popup(c.spot.x, c.spot.y - 120, fmt(TEXT.builtTower, { name: kinds[kind].name }));
        },
      );
      return;
    }
    this.overlay.showChoice(
      TEXT.levelUp,
      fmt(TEXT.levelUpLead, { lv: w.level }),
      c.options.map((p) => ({ icon: p.icon, name: p.name, desc: p.desc })),
      (i) => w.choosePerk(i),
    );
  }

  private showResult(): void {
    const w = this.world;
    const retry = { label: TEXT.retry, onTap: () => this.scene.restart() };
    if (w.outcome === 'won') {
      this.overlay.showResult({
        title: TEXT.clear,
        stars: w.stars,
        lines: [TEXT.clearLead, `${fmt(TEXT.houseHp, { hp: w.house.hp, max: w.house.maxHp })}　${fmt(TEXT.level, { lv: w.level })}`],
        buttons: [retry],
      });
    } else {
      this.overlay.showResult({ title: TEXT.lose, stars: 0, lines: [fmt(TEXT.loseLead, { n: w.wave }), TEXT.loseTip], buttons: [retry] });
    }
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
      this.spotLabels.set(s, {
        icon: this.toWorld(this.add.text(s.x, s.y + 2, SPOT_ICON[s.type], { fontSize: '28px', resolution: DPR }).setOrigin(0.5).setDepth(2)),
        name: this.toWorld(this.add.text(0, 0, '', textStyle(15)).setOrigin(0.5).setDepth(2)),
        cost: this.toWorld(this.add.text(0, 0, '', textStyle(16)).setOrigin(0, 0.5).setDepth(2)),
        stars: this.toWorld(this.add.text(0, 0, '', textStyle(12, '#ffd84d')).setOrigin(0.5).setDepth(2)),
      });
    }
  }

  private spotName(s: Spot): string {
    switch (s.type) {
      case 'tower':
        return s.kind ? this.world.data.towers.kinds[s.kind].short : TEXT.tower;
      case 'wall':
        return s.level === 0 ? TEXT.wall : TEXT.stoneWall;
      default:
        return TEXT[s.type];
    }
  }

  /** 建設地点の円と、名前・残りの木材・レベルの★ */
  private renderSpots(): void {
    const w = this.world;
    const p = w.player;
    const g = this.spotGfx;
    g.clear();
    for (const s of w.spots) {
      const l = this.spotLabels.get(s)!;
      const hideAll = () => {
        l.icon.setVisible(false);
        l.name.setVisible(false);
        l.cost.setVisible(false);
        l.stars.setVisible(false);
      };
      if (s.hidden) {
        hideAll();
        continue;
      }
      let lx = s.x;
      let ly = s.y + 46;
      if (s.type === 'wall') {
        drawWallSpot(g, s, w.time);
        // かべの値札は、近づいたときだけ輪の内側に出す（とうの値札と重ならないよう、今の版より近くで）
        const pd = Math.hypot(p.x - s.x, p.y - s.y);
        if (s.maxed || !(s.near || pd < 110)) {
          hideAll();
          continue;
        }
        const r = w.data.buildings.wall.radius - 48;
        lx = w.house.x + Math.cos(s.angle) * r;
        ly = w.house.y + Math.sin(s.angle) * r - 10;
        l.icon.setVisible(false);
      } else {
        drawSpot(g, s, w.time);
        l.icon.setPosition(s.x, s.y + 2).setVisible(!s.maxed && !(s.type === 'tower' && s.level > 0));
        if (s.type === 'tower' && s.kind && s.near) {
          g.lineStyle(2, 0xffffff, 0.35);
          g.strokeCircle(s.x, s.y, w.data.towers.kinds[s.kind].range[s.level - 1]);
        }
      }
      const name = this.spotName(s);
      if (s.maxed) {
        l.name.setVisible(true).setText(`${name} ${TEXT.max}`).setColor('#ffd84d').setPosition(lx, ly + 2);
        l.cost.setVisible(false);
        l.stars.setVisible(false);
        continue;
      }
      l.name.setVisible(true).setText(name).setColor('#ffffff').setPosition(lx, ly);
      l.cost.setVisible(true).setText(String(s.remaining)).setPosition(lx + 1, ly + 18);
      drawLog(g, lx - 11, ly + 18, 15);
      const showStars = s.type === 'axe' || s.type === 'bag';
      l.stars.setVisible(showStars).setText('★'.repeat(s.level) + '☆'.repeat(s.maxLevel - s.level)).setPosition(lx, ly + 38);
    }
  }

  /** いま見えている戦場の範囲 */
  private viewRect(): { x: number; y: number; w: number; h: number } {
    const cam = this.cameras.main;
    return { x: cam.scrollX, y: cam.scrollY, w: this.viewW / this.zoom, h: this.viewH / this.zoom };
  }

  private toScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    return { x: (x - cam.scrollX) * this.zoom, y: (y - cam.scrollY) * this.zoom };
  }

  private render(): void {
    const w = this.world;
    const p = w.player;
    const axe = w.levelOf('axe');
    this.renderSpots();

    // 木・敵・とう・かべ・おうち・主人公を、足元の y の順に重ねる
    const v = this.viewRect();
    const x0 = v.x - 60;
    const y0 = v.y - 40;
    const x1 = v.x + v.w + 60;
    const y1 = v.y + v.h + 140;
    const g = this.objGfx;
    const objs: { y: number; draw: () => void }[] = [];
    for (const t of w.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      objs.push({ y: t.y, draw: () => drawTree(g, t, this.leaf) });
    }
    for (const e of w.enemies) objs.push({ y: e.y, draw: () => drawEnemy(g, e) });
    for (const s of w.spots) {
      if (s.type === 'tower' && s.level > 0 && !s.hidden) objs.push({ y: s.y, draw: () => drawTower(g, s, w.data.towers) });
    }
    for (const s of w.walls) {
      if (s.level === 0) continue;
      for (const pp of s.posts) objs.push({ y: pp.y, draw: () => drawPost(g, pp, s.level, s.hit > 0) });
    }
    objs.push({ y: w.house.y, draw: () => drawHouse(g, w.house) });
    objs.push({ y: p.y, draw: () => drawPlayer(g, p, axe) });
    objs.sort((a, b) => a.y - b.y);
    g.clear();
    for (const s of w.drops) {
      g.fillStyle(0x000000, 0.18);
      ell(g, s.x, s.y + 2, 9, 3);
      drawLog(g, s.x, s.y - 6 - s.z, 18, Math.sin(s.t * 3) * 0.3);
    }
    for (const o of objs) o.draw();
    this.renderWallBars(g);

    const f = this.fxGfx;
    f.clear();
    this.renderShots(f);
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
    this.renderHouseBar(f);

    const full = p.wood >= w.capacity;
    this.fullText.setVisible(full).setPosition(p.x, p.y - stackTop(p) - 22);
  }

  private renderShots(f: Phaser.GameObjects.Graphics): void {
    const muzzle = this.world.data.towers.muzzleHeight;
    for (const a of this.world.shots) {
      if (a.type === 'shell') {
        const u = Math.min(1, a.t / a.dur);
        const x = a.x0 + (a.tx - a.x0) * u;
        const y = a.y0 + (a.ty - a.y0) * u - Math.sin(u * Math.PI) * 90;
        f.fillStyle(0x000000, 0.18);
        ell(f, x, a.ty + (a.y0 + muzzle - a.ty) * (1 - u), 5, 2);
        f.fillStyle(0x2e3238, 1);
        f.fillCircle(x, y, 6);
        continue;
      }
      if (a.kind === 'ice') {
        f.fillStyle(0xbff0ff, 1);
        f.fillCircle(a.x, a.y, 5);
        f.fillStyle(0xffffff, 1);
        f.fillCircle(a.x - 1, a.y - 1, 2);
        continue;
      }
      const l = Math.hypot(a.vx, a.vy) || 1;
      f.lineStyle(3, 0x6b4423, 1);
      f.lineBetween(a.x, a.y, a.x - (a.vx / l) * 14, a.y - (a.vy / l) * 14);
      f.fillStyle(0xffffff, 1);
      f.fillCircle(a.x, a.y, 2.5);
    }
  }

  /** 傷ついたかべの HP */
  private renderWallBars(g: Phaser.GameObjects.Graphics): void {
    for (const s of this.world.walls) {
      if (s.level === 0 || s.hp >= s.maxHp) continue;
      const bw = 60;
      g.fillStyle(0x000000, 0.45);
      g.fillRoundedRect(s.x - bw / 2, s.y - 52, bw, 7, 3.5);
      g.fillStyle(s.hp / s.maxHp > 0.4 ? 0xffcc1f : 0xff5a4f, 1);
      g.fillRoundedRect(s.x - bw / 2, s.y - 52, Math.max(7, (bw * s.hp) / s.maxHp), 7, 3.5);
    }
  }

  /** おうちの上の HP */
  private renderHouseBar(f: Phaser.GameObjects.Graphics): void {
    const h = this.world.house;
    const bw = 104;
    f.fillStyle(0x000000, 0.45);
    f.fillRoundedRect(h.x - bw / 2, h.y - 150, bw, 10, 5);
    if (h.hp <= 0) return;
    f.fillStyle(h.hp / h.maxHp > 0.4 ? 0x5bd16a : 0xff5a4f, 1);
    f.fillRoundedRect(h.x - bw / 2, h.y - 150, Math.max(10, (bw * h.hp) / h.maxHp), 10, 5);
  }

  private updateCamera(dt: number): void {
    const p = this.world.player;
    const k = Math.min(1, dt * 8);
    this.camX += (p.x - this.camX) * k;
    this.camY += (p.y - this.camY) * k;
    const vw = this.viewW / this.zoom;
    const vh = this.viewH / this.zoom;
    const { width, height } = this.world;
    let sx = width <= vw ? (width - vw) / 2 : Phaser.Math.Clamp(this.camX - vw / 2, 0, width - vw);
    let sy = height <= vh ? (height - vh) / 2 : Phaser.Math.Clamp(this.camY - vh / 2, 0, height - vh);
    if (this.shake > 0) {
      const s = this.shake * 14;
      sx += this.fxRng.range(-s, s);
      sy += this.fxRng.range(-s, s);
    }
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
        this.onBuilt(e.spot);
        break;
      case 'territory':
        this.hud.showBanner(TEXT.landWide);
        break;
      case 'hit':
        this.burst(e.enemy.x, e.enemy.y - e.enemy.r, 0xffffff, 4, 100, 3);
        break;
      case 'death':
        this.burst(e.enemy.x, e.enemy.y - e.enemy.r, hex(e.enemy.stats.color), 16, 190, 5);
        if (e.enemy.kind === 'boss') this.bigShake(TEXT.bossDown, 0.4);
        if (e.enemy.kind === 'maou') this.bigShake(TEXT.maouDown, 0.6);
        break;
      case 'spawn':
        if (e.enemy.kind === 'boss') this.hud.showBanner(TEXT.bossCame);
        if (e.enemy.kind === 'maou') this.hud.showBanner(TEXT.maouCame);
        break;
      case 'summon':
        this.burst(e.enemy.x, e.enemy.y - e.enemy.r, 0xb07ae0, 14, 160, 5);
        break;
      case 'explode':
        this.burst(e.x, e.y - 10, 0xffb347, 14, 220, 6);
        this.burst(e.x, e.y - 10, 0x777777, 8, 140, 6);
        this.shake = Math.max(this.shake, 0.12);
        break;
      case 'wallHit': {
        const pp = e.spot.posts[Math.floor(this.fxRng.next() * e.spot.posts.length)];
        this.burst(pp.x, pp.y - 15, e.spot.level >= 2 ? 0xb8c0c8 : 0xa86c39, 4, 100, 4);
        break;
      }
      case 'wallBroken':
        for (const pp of e.spot.posts) this.burst(pp.x, pp.y - 15, 0xa86c39, 3, 150, 5);
        this.popup(e.spot.x, e.spot.y - 50, TEXT.wallBroken, '#ffb0a0');
        this.shake = Math.max(this.shake, 0.2);
        break;
      case 'houseHit':
        this.popup(w.house.x + this.fxRng.range(-30, 30), w.house.y - 110, `-${e.dmg}`, '#ff5a4f');
        this.shake = Math.max(this.shake, 0.2);
        break;
      case 'wave':
        this.hud.showBanner(e.last ? TEXT.lastWave : fmt(TEXT.wave, { n: e.n }));
        break;
      case 'waveClear':
        this.hud.showBanner(TEXT.waveClear);
        break;
      case 'xpBonus':
        this.popup(w.player.x, w.player.y - 80, fmt(TEXT.xpBonus, { n: e.n }), '#7fe08a');
        break;
      default:
        break;
    }
  }

  private onBuilt(s: Spot): void {
    this.burst(s.x, s.y - 30, 0xffd84d, 22, 230, 5);
    switch (s.type) {
      case 'axe':
        this.popup(s.x, s.y - 55, TEXT.builtAxe);
        break;
      case 'bag':
        this.popup(s.x, s.y - 55, TEXT.builtBag);
        break;
      case 'wall':
        this.popup(s.x, s.y - 55, s.level === 1 ? TEXT.builtWall : TEXT.builtStoneWall);
        break;
      case 'tower':
        if (s.level > 1) this.popup(s.x, s.y - 120, TEXT.builtTowerUp);
        break;
      default:
        break;
    }
  }

  private bigShake(text: string, shake: number): void {
    this.hud.showBanner(text);
    this.shake = Math.max(this.shake, shake);
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

  private popup(x: number, y: number, s: string, color = '#ffffff'): void {
    const text = this.toWorld(this.add.text(x, y, s, textStyle(18, color)).setOrigin(0.5).setDepth(6));
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
