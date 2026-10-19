import Phaser from 'phaser';
import { SOLDIER_KINDS, UNIT_DATA, type SoldierKind } from '../data/unitData';
import { drawArrow, drawFlag, drawTree, drawUnit } from '../entities/UnitView';
import type { Squad } from '../entities/Squad';
import type { Unit } from '../entities/Unit';
import { ARENA, arenaConfig, practiceConfig } from '../systems/Arena';
import { Random } from '../systems/Random';
import { World, type WorldEvent } from '../systems/World';
import { Button } from '../ui/Button';
import { DPR, TEXT, VIEW_H, VIEW_W, WORLD_ZOOM, fmt, textStyle } from '../ui/Display';
import { Hud, compositionText } from '../ui/Hud';
import { Joystick } from '../ui/Joystick';
import { Minimap } from '../ui/Minimap';

/** squad: 部隊の練習場（旗の部隊を集めて戦う）、duel: 相性の練習場（1部隊対1部隊） */
type PracticeMode = 'squad' | 'duel';

interface BattleData {
  mode?: PracticeMode;
  allyKind?: SoldierKind;
  enemyKind?: SoldierKind;
}

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

interface Popup {
  text: Phaser.GameObjects.Text;
  t: number;
}

const POPUP_LIFE = 1.2;
const BANNER_LIFE = 2.2;

const ORDER_COLORS = {
  // 押すと「とつげき」になるボタン（いまは しゅうごう）
  toCharge: { color: 0xd94f3a, shadow: 0x9c3426 },
  // 押すと「しゅうごう」になるボタン（いまは とつげき）
  toGather: { color: 0x2f6fd6, shadow: 0x1d4a94 },
};

/** 練習場：部隊を集めて戦う／兵種の相性を試す */
export class BattleScene extends Phaser.Scene {
  private world!: World;
  private mode: PracticeMode = 'squad';
  private allyKind: SoldierKind = 'sword';
  private enemyKind: SoldierKind = 'spear';

  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private unitGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private minimap: Minimap | null = null;
  private joystick!: Joystick;
  private orderButton!: Button;
  private banner!: Phaser.GameObjects.Text;
  private bannerT = BANNER_LIFE;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private squadLabels = new Map<Squad, Phaser.GameObjects.Text>();
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private fxRng = new Random(99);
  private camX = 0;
  private camY = 0;
  private resultShown = false;

  constructor() {
    super('Battle');
  }

  init(data: BattleData): void {
    this.mode = data.mode ?? this.mode;
    this.allyKind = data.allyKind ?? this.allyKind;
    this.enemyKind = data.enemyKind ?? this.enemyKind;
    this.squadLabels = new Map();
    this.particles = [];
    this.popups = [];
    this.minimap = null;
    this.bannerT = BANNER_LIFE;
    this.resultShown = false;
  }

  create(): void {
    const seed = Date.now() % 100000;
    this.world = new World(this.mode === 'squad' ? practiceConfig(seed) : arenaConfig(this.allyKind, this.enemyKind, seed));
    this.input.addPointer(2);

    // 画面を内部で DPR 倍に描くので、カメラも同じ倍率で拡大する（左上を原点に）
    const main = this.cameras.main;
    main.setOrigin(0, 0).setZoom(DPR * WORLD_ZOOM).setBackgroundColor(ARENA.groundColor);
    this.uiCam = this.cameras.add(0, 0, VIEW_W * DPR, VIEW_H * DPR).setOrigin(0, 0).setZoom(DPR);

    this.drawGround();
    this.unitGfx = this.toWorld(this.add.graphics());
    this.fxGfx = this.toWorld(this.add.graphics());
    for (const sq of this.world.squads) {
      this.squadLabels.set(sq, this.toWorld(this.add.text(0, 0, '', textStyle(18)).setOrigin(0.5, 1).setAlign('center')));
    }

    this.hud = new Hud(this);
    this.toUi(...this.hud.objects);
    this.joystick = new Joystick(this);
    this.toUi(this.joystick.gfx);
    if (this.mode === 'squad') {
      const w = 260;
      this.minimap = new Minimap(this, VIEW_W - 24 - w, 22, w, this.world);
      this.toUi(this.minimap.gfx);
    } else {
      this.createPicker();
    }
    this.createModeSwitch();
    this.createCommandButtons();
    this.banner = this.add.text(VIEW_W / 2, VIEW_H * 0.3, '', textStyle(40, '#ffd84d')).setOrigin(0.5).setDepth(950).setAlpha(0);
    this.toUi(this.banner);
    if (this.mode === 'squad') this.showBanner(TEXT.squadPracticeHint, '#ffffff', 30);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-SPACE', () => this.command(() => this.world.toggleOrder()));
    this.input.keyboard!.on('keydown-F', () => this.command(() => this.world.whistle()));

    this.camX = this.world.hero.x;
    this.camY = this.world.hero.y;
    this.updateCamera(1);

    // 自動テストやデバッグ用に外から覗けるようにしておく
    (window as unknown as { __jeanne: unknown }).__jeanne = { scene: this, world: this.world };
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const w = this.world;
    if (w.outcome === 'playing') {
      w.input = this.readInput();
      w.step(dt);
      for (const e of w.events) this.onEvent(e);
      if (w.outcome !== 'playing') this.time.delayedCall(700, () => this.showResult());
    }
    this.updateEffects(dt);
    this.render();
    this.hud.update(w);
    this.minimap?.update(w, this.viewRect());
    this.joystick.draw();
    this.updateCamera(dt);
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

  private drawGround(): void {
    const g = this.toWorld(this.add.graphics());
    const rng = new Random(7);
    const { width, height } = this.world;
    const area = (width * height) / (2400 * 1600);
    g.fillStyle(0x6fb352, 1);
    g.fillRect(0, 0, width, height);
    g.fillStyle(0x3c7832, 0.22);
    for (let i = 0; i < 30 * area; i++) g.fillEllipse(rng.range(0, width), rng.range(0, height), rng.range(160, 440), rng.range(100, 280));
    for (let i = 0; i < 700 * area; i++) {
      g.fillStyle(i % 2 ? 0x5f9a45 : 0x7db85c, 1);
      const s = rng.range(3, 7);
      g.fillEllipse(rng.range(0, width), rng.range(0, height), s * 2, s);
    }
    const flowers = [0xffffff, 0xffd84d, 0xff9ec4];
    for (let i = 0; i < 120 * area; i++) {
      g.fillStyle(flowers[i % 3], 1);
      g.fillCircle(rng.range(0, width), rng.range(0, height), 3);
    }
    // 森：当たり判定の円の中に木を並べる
    for (const o of this.world.obstacles) {
      const n = Math.round(o.r / 9);
      const trees: { x: number; y: number; s: number }[] = [];
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const d = Math.sqrt(rng.next()) * (o.r - 14);
        trees.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d * 0.8 + 20, s: rng.range(0.85, 1.2) });
      }
      trees.sort((a, b) => a.y - b.y);
      for (const t of trees) drawTree(g, t.x, t.y, t.s);
    }
  }

  /** いま見えている戦場の範囲（カメラは左上を原点に拡大しているので、Phaser の worldView は使わない） */
  private viewRect(): { x: number; y: number; w: number; h: number } {
    const cam = this.cameras.main;
    return { x: cam.scrollX, y: cam.scrollY, w: VIEW_W / WORLD_ZOOM, h: VIEW_H / WORLD_ZOOM };
  }

  private render(): void {
    const w = this.world;
    const g = this.unitGfx;
    g.clear();
    const v = this.viewRect();
    const x0 = v.x - 60;
    const y0 = v.y - 60;
    const x1 = v.x + v.w + 60;
    const y1 = v.y + v.h + 120;
    const alive: Unit[] = [];
    for (const u of w.units) {
      if (u.dead) continue;
      if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
      alive.push(u);
    }
    alive.sort((a, b) => a.y - b.y);
    for (const u of alive) drawUnit(g, u);
    for (const a of w.arrows) drawArrow(g, a);
    for (const sq of w.squads) {
      if (sq.mode === 'neutral' && sq.aliveCount > 0) {
        const c = sq.center();
        drawFlag(g, c.x, c.y - 26, w.time);
      }
    }

    for (const [sq, label] of this.squadLabels) {
      const n = sq.aliveCount;
      label.setVisible(n > 0);
      if (!n) continue;
      const c = sq.center();
      const stats = UNIT_DATA.kinds[sq.kind];
      if (sq.mode === 'neutral') {
        label.setText(`${stats.name}\n${TEXT.flag}`);
        label.setColor('#ffffff');
        label.setPosition(c.x, c.y - 96);
      } else if (sq.waiting) {
        label.setText(`${compositionText(sq)} ${TEXT.waiting}`);
        label.setColor('#d6e4ff');
        label.setPosition(c.x, c.y - 40);
      } else {
        label.setText(compositionText(sq));
        label.setColor(sq.side === 'ally' ? '#bcd6ff' : '#ffc4bd');
        label.setPosition(c.x, c.y - 40);
      }
    }

    const f = this.fxGfx;
    f.clear();
    for (const p of this.particles) {
      f.fillStyle(p.color, Math.max(0, 1 - p.t / p.life));
      f.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  private updateCamera(dt: number): void {
    const h = this.world.hero;
    const k = Math.min(1, dt * 6);
    this.camX += (h.x - this.camX) * k;
    this.camY += (h.y - this.camY) * k;
    const vw = VIEW_W / WORLD_ZOOM;
    const vh = VIEW_H / WORLD_ZOOM;
    const sx = Phaser.Math.Clamp(this.camX - vw / 2, 0, Math.max(0, this.world.width - vw));
    const sy = Phaser.Math.Clamp(this.camY - vh / 2, 0, Math.max(0, this.world.height - vh));
    this.cameras.main.setScroll(sx, sy);
  }

  // ---- 効果 ----

  private onEvent(e: WorldEvent): void {
    const rng = this.fxRng;
    switch (e.type) {
      case 'hit':
        this.burst(e.x, e.y - 10, 0xffffff, 3, 80, 3);
        if (e.charge) this.popup(e.x, e.y - 40, TEXT.charge, '#ffb347');
        else if (e.multiplier > 1 && rng.next() < 0.3) this.popup(e.x, e.y - 34, TEXT.hitStrong, '#ffd84d');
        else if (e.multiplier < 1 && rng.next() < 0.2) this.popup(e.x, e.y - 34, TEXT.hitWeak, '#c9d4e8');
        break;
      case 'death':
        this.burst(e.x, e.y - 8, e.side === 'ally' ? 0x4f8dff : 0xff5a4f, 12, 150, 4);
        break;
      case 'recruit': {
        const name = UNIT_DATA.kinds[e.squad.kind].name;
        if (e.waiting) this.showBanner(fmt(TEXT.recruitedWaiting, { name }), '#d6e4ff');
        else this.showBanner(fmt(TEXT.recruited, { name }), '#ffd84d');
        const c = e.squad.center();
        this.burst(c.x, c.y - 20, 0x4f8dff, 20, 200, 5);
        break;
      }
      case 'order':
        this.showBanner(e.order === 'charge' ? TEXT.toCharge : TEXT.toGather, e.order === 'charge' ? '#ffb0a8' : '#bcd6ff');
        this.refreshOrderButton();
        break;
      case 'whistle':
        this.showBanner(TEXT.whistleCall, '#ffe066');
        break;
      case 'reinforce': {
        this.showBanner(fmt(TEXT.reinforced, { n: e.count }), '#ffd84d');
        const c = this.world.hero;
        this.burst(c.x, c.y - 20, 0x4f8dff, 16, 180, 5);
        break;
      }
    }
  }

  private showBanner(s: string, color: string, size = 40): void {
    this.banner.setText(s).setColor(color).setFontSize(size).setAlpha(1);
    this.bannerT = 0;
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
        vy: Math.sin(a) * v - 50,
        t: 0,
        life: rng.range(0.3, 0.7),
        color,
        size: rng.range(size * 0.6, size * 1.3),
      });
    }
  }

  private popup(x: number, y: number, s: string, color: string): void {
    // 同じ場所にたくさん重ならないよう、数を絞る
    if (this.popups.length > 6) return;
    const text = this.toWorld(this.add.text(x, y, s, textStyle(20, color)).setOrigin(0.5).setDepth(500));
    this.popups.push({ text, t: 0 });
  }

  private updateEffects(dt: number): void {
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const p of this.popups) {
      p.t += dt;
      p.text.y -= 35 * dt;
      p.text.setAlpha(Math.max(0, 1 - (p.t / POPUP_LIFE) ** 2));
      if (p.t >= POPUP_LIFE) p.text.destroy();
    }
    this.popups = this.popups.filter((p) => p.t < POPUP_LIFE);
    if (this.bannerT < BANNER_LIFE) {
      this.bannerT += dt;
      this.banner.setAlpha(Math.min(1, (BANNER_LIFE - this.bannerT) / 0.5));
    }
  }

  // ---- ボタン ----

  /** 右下：命令の切り替えと集合の笛 */
  private createCommandButtons(): void {
    const x = VIEW_W - 150;
    const c = ORDER_COLORS.toCharge;
    this.orderButton = new Button(this, {
      x,
      y: VIEW_H - 84,
      w: 250,
      h: 104,
      label: TEXT.toCharge,
      fontSize: 38,
      color: c.color,
      shadow: c.shadow,
      onTap: () => this.command(() => this.world.toggleOrder()),
    });
    const whistle = new Button(this, {
      x,
      y: VIEW_H - 214,
      w: 250,
      h: 86,
      label: TEXT.whistle,
      fontSize: 32,
      color: 0xd9a21c,
      shadow: 0x8f6a10,
      onTap: () => this.command(() => this.world.whistle()),
    });
    this.toUi(...this.orderButton.objects, ...whistle.objects);
    this.refreshOrderButton();
  }

  /**
   * ボタンやキーからの命令。World のイベントは次の step の初めに消されるので、
   * 命令で起きたイベントはここですぐに画面へ反映する
   */
  private command(fn: () => void): void {
    const w = this.world;
    if (w.outcome !== 'playing') return;
    const n = w.events.length;
    fn();
    for (const e of w.events.slice(n)) this.onEvent(e);
  }

  /** 命令ボタンには「押すとどうなるか」を出す */
  private refreshOrderButton(): void {
    const charging = this.world.order === 'charge';
    const c = charging ? ORDER_COLORS.toGather : ORDER_COLORS.toCharge;
    this.orderButton.setLabel(charging ? TEXT.toGather : TEXT.toCharge).setColors(c.color, c.shadow);
  }

  /** 上のまんなか：2つの練習場を切り替える */
  private createModeSwitch(): void {
    const toSquad = this.mode === 'duel';
    const b = new Button(this, {
      x: VIEW_W / 2,
      y: 40,
      w: 250,
      h: 56,
      label: toSquad ? TEXT.toSquadPractice : TEXT.toDuelPractice,
      fontSize: 24,
      color: 0x7a5bc7,
      shadow: 0x4f3a87,
      onTap: () => this.scene.restart({ mode: toSquad ? 'squad' : 'duel', allyKind: this.allyKind, enemyKind: this.enemyKind }),
    });
    this.toUi(...b.objects);
  }

  // ---- 相性の練習場の兵種えらび ----

  private createPicker(): void {
    const size = 66;
    const gap = 10;
    const right = VIEW_W - 24;
    const rows: { label: string; y: number; side: 'ally' | 'enemy' }[] = [
      { label: TEXT.allyLabel, y: 52, side: 'ally' },
      { label: TEXT.enemyLabel, y: 52 + size + 16, side: 'enemy' },
    ];
    const panelW = SOLDIER_KINDS.length * (size + gap) + 110;
    const panel = this.add.graphics().setDepth(850);
    panel.fillStyle(0x000000, 0.38);
    panel.fillRoundedRect(right - panelW, 10, panelW + 12, 2 * size + 92, 18);
    this.toUi(panel);

    for (const row of rows) {
      const current = row.side === 'ally' ? this.allyKind : this.enemyKind;
      const color = row.side === 'ally' ? 0x3f6fd8 : 0xd9503f;
      const shadow = row.side === 'ally' ? 0x2a4fa3 : 0x9c3426;
      const label = this.add
        .text(right - panelW + 16, row.y, row.label, textStyle(22, row.side === 'ally' ? '#bcd6ff' : '#ffc4bd'))
        .setOrigin(0, 0.5)
        .setDepth(901);
      this.toUi(label);
      SOLDIER_KINDS.forEach((kind, i) => {
        const x = right - (SOLDIER_KINDS.length - 1 - i) * (size + gap) - size / 2;
        const b = new Button(this, {
          x,
          y: row.y,
          w: size,
          h: size - 6,
          label: UNIT_DATA.kinds[kind].short,
          fontSize: 30,
          color,
          shadow,
          onTap: () => this.restartWith(row.side === 'ally' ? kind : this.allyKind, row.side === 'enemy' ? kind : this.enemyKind),
        });
        b.setSelected(kind === current);
        this.toUi(...b.objects);
      });
    }
    const hint = this.add
      .text(right - panelW / 2 + 6, 52 + 2 * size + 30, matchupHint(this.allyKind, this.enemyKind), textStyle(20, '#ffe9a8'))
      .setOrigin(0.5)
      .setDepth(901);
    this.toUi(hint);
  }

  private restartWith(allyKind: SoldierKind, enemyKind: SoldierKind): void {
    this.scene.restart({ mode: this.mode, allyKind, enemyKind });
  }

  private showResult(): void {
    if (this.resultShown) return;
    this.resultShown = true;
    this.joystick.release();
    const w = this.world;
    const won = w.outcome === 'won';
    const dim = this.add.graphics().setDepth(1100);
    dim.fillStyle(0x0a0f08, 0.6);
    dim.fillRect(0, 0, VIEW_W, VIEW_H);
    dim.fillStyle(0xf5efe0, 1);
    dim.fillRoundedRect(VIEW_W / 2 - 260, VIEW_H / 2 - 180, 520, 360, 28);
    const title = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 110, won ? TEXT.win : TEXT.lose, textStyle(52, won ? '#d94f3a' : '#3b4a66', false))
      .setOrigin(0.5)
      .setDepth(1101);
    const survivors = this.mode === 'squad' ? w.countFollowing() : w.countAlive('ally');
    const sub = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 30, fmt(TEXT.survivors, { n: survivors }), textStyle(28, '#2b2418', false))
      .setOrigin(0.5)
      .setDepth(1101);
    const hint = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 20, this.mode === 'duel' ? matchupHint(this.allyKind, this.enemyKind) : '', textStyle(24, '#6e6250', false))
      .setOrigin(0.5)
      .setDepth(1101);
    const btn = new Button(this, {
      x: VIEW_W / 2,
      y: VIEW_H / 2 + 105,
      w: 300,
      h: 84,
      label: TEXT.retry,
      fontSize: 34,
      color: 0xd94f3a,
      shadow: 0x9c3426,
      onTap: () => this.restartWith(this.allyKind, this.enemyKind),
      depth: 1110,
    });
    this.toUi(dim, title, sub, hint, ...btn.objects);
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

/** 選んだ組み合わせの相性を、子ども向けの短い文で返す */
export function matchupHint(ally: SoldierKind, enemy: SoldierKind): string {
  const { beats } = UNIT_DATA.matchups;
  const name = (k: SoldierKind) => UNIT_DATA.kinds[k].name;
  if (beats[ally] === enemy) return fmt(TEXT.strongHint, { a: name(ally), b: name(enemy) });
  if (beats[enemy] === ally) return fmt(TEXT.strongHint, { a: name(enemy), b: name(ally) });
  for (const v of UNIT_DATA.vulnerabilities) {
    if (v.defender === enemy && v.attackers.includes(ally)) return fmt(TEXT.archerHint, { a: name(enemy) });
    if (v.defender === ally && v.attackers.includes(enemy)) return fmt(TEXT.archerHint, { a: name(ally) });
  }
  return TEXT.evenHint;
}
