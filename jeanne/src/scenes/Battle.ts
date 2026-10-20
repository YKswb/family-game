import Phaser from 'phaser';
import { SOLDIER_KINDS, UNIT_DATA, type SoldierKind } from '../data/unitData';
import { STAGES } from '../data/stageData';
import { drawArrow, drawFlag, drawUnit } from '../entities/UnitView';
import type { Unit } from '../entities/Unit';
import { ARENA, arenaConfig, practiceConfig } from '../systems/Arena';
import { Random } from '../systems/Random';
import { DIFFICULTY, freePointsFor, starsFor } from '../systems/Progress';
import { Session } from '../systems/Session';
import { stageConfig } from '../systems/Stage';
import { World, type WorldEvent } from '../systems/World';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { fieldItems } from '../ui/FieldView';
import { GroundTiles } from '../ui/GroundTiles';
import { DPR, TEXT, VIEW_H, VIEW_W, WORLD_ZOOM, fmt, textStyle } from '../ui/Display';
import { Hud, compositionText } from '../ui/Hud';
import { Joystick } from '../ui/Joystick';
import { Minimap } from '../ui/Minimap';
import type { IntermissionData } from './Intermission';

/** stage: ステージ、squad: 部隊の練習場（旗の部隊を集めて戦う）、duel: 相性の練習場（1部隊対1部隊） */
type BattleMode = 'stage' | 'squad' | 'duel';

interface BattleData {
  mode?: BattleMode;
  stageId?: string;
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

/** 戦場：ステージ、または練習場（部隊を集めて戦う／兵種の相性を試す） */
export class BattleScene extends Phaser.Scene {
  private world!: World;
  private mode: BattleMode = 'squad';
  private stageId = 'stage1';
  private dialog!: Dialog;
  /** 会話が重なったときに順に出すための待ち行列 */
  private dialogQueue: string[] = [];
  private paused = false;
  private pauseObjects: Phaser.GameObjects.GameObject[] = [];
  private resultScheduled = false;
  /** 「たいきの なかまに さわると ほじゅう」の案内を次に出せるまでの秒数 */
  private refillHintCooldown = 0;
  /** 「まもりが かたい！」の吹き出しと、何をすればよいかの案内を、出しすぎないための待ち時間 */
  private guardPopupCooldown = 0;
  private guardBannerCooldown = 0;
  private allyKind: SoldierKind = 'sword';
  private enemyKind: SoldierKind = 'spear';

  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private unitGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private ground!: GroundTiles;
  private hud!: Hud;
  private minimap: Minimap | null = null;
  private joystick!: Joystick;
  private orderButton!: Button;
  private banner!: Phaser.GameObjects.Text;
  /** 案内の文字の後ろに敷く暗い帯（兵士や名札と重なっても読めるように） */
  private bannerBg!: Phaser.GameObjects.Graphics;
  private bannerT = BANNER_LIFE;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  /** 部隊の名札。率いている部隊は兵種のかたまりごとに1枚（キーは "部隊id:兵種"） */
  private labels = new Map<string, Phaser.GameObjects.Text>();
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
    this.stageId = data.stageId ?? this.stageId;
    this.dialogQueue = [];
    this.paused = false;
    this.pauseObjects = [];
    this.resultScheduled = false;
    this.refillHintCooldown = 0;
    this.guardPopupCooldown = 0;
    this.guardBannerCooldown = 0;
    this.allyKind = data.allyKind ?? this.allyKind;
    this.enemyKind = data.enemyKind ?? this.enemyKind;
    this.labels = new Map();
    this.particles = [];
    this.popups = [];
    this.minimap = null;
    this.bannerT = BANNER_LIFE;
    this.resultShown = false;
  }

  create(): void {
    const seed = Date.now() % 100000;
    this.world = new World(
      this.mode === 'stage'
        ? this.stageWorldConfig(seed)
        : this.mode === 'squad'
          ? practiceConfig(seed)
          : arenaConfig(this.allyKind, this.enemyKind, seed),
    );
    this.input.addPointer(2);

    // 画面を内部で DPR 倍に描くので、カメラも同じ倍率で拡大する（左上を原点に）
    const main = this.cameras.main;
    main.setOrigin(0, 0).setZoom(DPR * WORLD_ZOOM).setBackgroundColor(ARENA.groundColor);
    this.uiCam = this.cameras.add(0, 0, VIEW_W * DPR, VIEW_H * DPR).setOrigin(0, 0).setZoom(DPR);

    this.drawGround();
    this.unitGfx = this.toWorld(this.add.graphics());
    this.fxGfx = this.toWorld(this.add.graphics());

    this.hud = new Hud(this, !!this.world.jeanne);
    this.toUi(...this.hud.objects);
    this.joystick = new Joystick(this);
    this.toUi(this.joystick.gfx);
    if (this.mode !== 'duel') {
      const w = 260;
      this.minimap = new Minimap(this, VIEW_W - 24 - w, 22, w, this.world);
      this.toUi(this.minimap.gfx);
    } else {
      this.createPicker();
    }
    this.createPauseButton();
    this.createCommandButtons();
    this.dialog = new Dialog(this);
    this.toUi(...this.dialog.objects);
    this.banner = this.add.text(VIEW_W / 2, VIEW_H * 0.3, '', textStyle(40, '#ffd84d')).setOrigin(0.5).setAlign('center').setDepth(950).setAlpha(0);
    this.bannerBg = this.add.graphics().setDepth(949).setAlpha(0);
    this.toUi(this.banner, this.bannerBg);
    if (this.mode === 'squad') this.showBanner(TEXT.squadPracticeHint, '#ffffff', 30);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-SPACE', () => this.command(() => this.world.toggleOrder()));
    this.input.keyboard!.on('keydown-F', () => this.command(() => this.world.whistle()));

    this.camX = this.world.hero.x;
    this.camY = this.world.hero.y;
    this.updateCamera(1);
    this.ground.update(this.viewRect());

    // 自動テストやデバッグ用に外から覗けるようにしておく
    (window as unknown as { __jeanne: unknown }).__jeanne = { scene: this, world: this.world };
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const w = this.world;
    // 会話中と「ひとやすみ」中は時間を止める
    const frozen = this.dialog.open || this.paused;
    if (w.outcome === 'playing' && !frozen) {
      w.input = this.readInput();
      w.step(dt);
      for (const e of w.events) this.onEvent(e);
      this.maybeShowRefillHint(dt);
    }
    // 勝ち負けが決まったら、会話（クリアの会話など）が終わってから結果を出す
    if (w.outcome !== 'playing' && !this.dialog.open && !this.resultScheduled) {
      this.resultScheduled = true;
      this.time.delayedCall(700, () => this.finish());
    }
    this.updateEffects(dt);
    this.render();
    this.hud.update(w);
    this.minimap?.update(w, this.viewRect());
    this.joystick.draw();
    this.updateCamera(dt);
    this.ground.update(this.viewRect());
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

  /** 地面は区画ごとの絵にして、見えている所だけ並べる（毎フレーム図形を組み立て直さない） */
  private drawGround(): void {
    const terrain = this.mode === 'stage' ? STAGES[this.stageId].stage.terrain : null;
    const w = this.world;
    const items = fieldItems(w.width, w.height, w.obstacles, terrain, new Random(7));
    this.ground = new GroundTiles(this, w.width, w.height, items, DPR * WORLD_ZOOM, -10, (rt) => this.toWorld(rt));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.ground.destroy());
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
    const guarded = w.isGeneralGuarded();
    for (const u of alive) drawUnit(g, u, u === w.general && guarded, guarded && !!u.squad && w.isGuardSquad(u.squad));
    for (const a of w.arrows) drawArrow(g, a);
    for (const sq of w.squads) {
      if (sq.mode === 'neutral' && sq.aliveCount > 0) {
        const c = sq.center();
        drawFlag(g, c.x, c.y - 26, w.time);
      }
    }

    const shown = new Set<string>();
    for (const sq of w.squads) {
      if (sq.aliveCount === 0) continue;
      if (sq.mode === 'follow') {
        // 兵種のかたまりごとに、そのかたまりの上に名札を出す
        for (const g of sq.groups()) {
          const key = `${sq.id}:${g.kind}`;
          const label = this.labelFor(key);
          shown.add(key);
          const c = centerOf(g.units);
          setLabel(label, `${UNIT_DATA.kinds[g.kind].short}${g.units.length}`, '#bcd6ff');
          label.setPosition(c.x, c.y - 40);
        }
        continue;
      }
      const key = String(sq.id);
      const label = this.labelFor(key);
      shown.add(key);
      const c = sq.center();
      const stats = UNIT_DATA.kinds[sq.kind];
      if (sq === w.generalSquad) {
        const name = STAGES[this.stageId].stage.general?.name ?? stats.name;
        const n = w.guardsLeft();
        setLabel(label, n > 0 ? fmt(TEXT.generalGuardedLabel, { name, n }) : name, '#ffcc1f');
        label.setPosition(c.x, c.y - 84);
      } else if (sq.mode === 'neutral') {
        setLabel(label, `${stats.name}\n${TEXT.flag}`, '#ffffff');
        label.setPosition(c.x, c.y - 96);
      } else if (sq.waiting) {
        setLabel(label, `${compositionText(sq)} ${TEXT.waiting}`, '#d6e4ff');
        label.setPosition(c.x, c.y - 40);
      } else if (w.isGuardSquad(sq)) {
        setLabel(label, fmt(TEXT.guardLabel, { comp: compositionText(sq) }), '#ffcc1f');
        label.setPosition(c.x, c.y - 40);
      } else {
        setLabel(label, compositionText(sq), sq.side === 'ally' ? '#bcd6ff' : '#ffc4bd');
        label.setPosition(c.x, c.y - 40);
      }
    }
    for (const [key, label] of this.labels) label.setVisible(shown.has(key));

    const f = this.fxGfx;
    f.clear();
    for (const p of this.particles) {
      f.fillStyle(p.color, Math.max(0, 1 - p.t / p.life));
      f.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  private labelFor(key: string): Phaser.GameObjects.Text {
    let label = this.labels.get(key);
    if (!label) {
      label = this.toWorld(this.add.text(0, 0, '', textStyle(18)).setOrigin(0.5, 1).setAlign('center'));
      this.labels.set(key, label);
    }
    return label;
  }

  private updateCamera(dt: number): void {
    const h = this.world.hero;
    // カメラはジャンを少し遅れて追う（遅れが大きいと動きが重く感じる）
    const k = Math.min(1, dt * 9);
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
      case 'dialog':
        this.openDialog(e.key);
        break;
      case 'guarded':
        // 大将を攻撃しても効かないときは、何をすればよいかを画面のまんなかに出す
        if (this.guardPopupCooldown <= 0) {
          this.popup(e.x, e.y - 90, TEXT.guarded, '#ffe066');
          this.guardPopupCooldown = 1;
        }
        if (this.guardBannerCooldown <= 0) {
          this.showBanner(TEXT.guardedBanner, '#ffe066', 34);
          this.guardBannerCooldown = 8;
        }
        break;
      case 'squadWiped':
        if (this.world.isGuardSquad(e.squad)) {
          const n = this.world.guardsLeft();
          this.showBanner(n > 0 ? fmt(TEXT.guardDown, { n }) : TEXT.guardsAllDown, '#ffcc1f');
        }
        break;
      case 'returnedHome':
        this.showBanner(fmt(TEXT.returnedHome, { name: UNIT_DATA.kinds[e.squad.kind].name }), '#d6e4ff', 30);
        this.refillHintCooldown = Math.max(this.refillHintCooldown, 4);
        break;
      case 'depotEmpty':
        this.showBanner(TEXT.depotEmpty, '#d6e4ff', 30);
        break;
      case 'levelUp':
        this.showBanner(fmt(TEXT.levelUp, { n: e.level }), '#ffe066');
        this.burst(this.world.hero.x, this.world.hero.y - 20, 0xffe066, 24, 220, 5);
        break;
      case 'revive':
        this.burst(e.x, e.y - 14, 0x9fc3ff, 10, 120, 4);
        break;
      case 'jeanneDanger':
        this.showBanner(TEXT.jeanneDanger, '#ff9ec4');
        break;
      case 'reinforce': {
        this.showBanner(fmt(TEXT.reinforced, { n: e.count }), '#ffd84d');
        const c = this.world.hero;
        this.burst(c.x, c.y - 20, 0x4f8dff, 16, 180, 5);
        break;
      }
    }
  }

  /**
   * 率いている兵士が半分を切り、兵士のいる待機部隊があるときに、補充できることを知らせる
   * （一度出したら1分は出さない）
   */
  private maybeShowRefillHint(dt: number): void {
    const w = this.world;
    this.refillHintCooldown = Math.max(0, this.refillHintCooldown - dt);
    if (this.refillHintCooldown > 0) return;
    const following = w.followingSquads();
    // 率いている部隊が1つもないときは、待機の仲間の場所へ行くよう案内する
    if (following.length === 0) {
      if (!w.squads.some((s) => s.waiting)) return;
      this.showBanner(TEXT.noSquadsHint, '#d6e4ff', 30);
      this.refillHintCooldown = 20;
      return;
    }
    const cap = following.reduce((n, s) => n + s.capacity, 0);
    if (w.countFollowing() >= cap * 0.5) return;
    if (!w.squads.some((s) => s.waiting && s.aliveCount >= 5)) return;
    this.showBanner(TEXT.refillHint, '#d6e4ff', 30);
    this.refillHintCooldown = 60;
  }

  private showBanner(s: string, color: string, size = 40): void {
    this.banner.setText(s).setColor(color).setFontSize(size).setAlpha(1);
    const b = this.banner.getBounds();
    this.bannerBg.clear();
    this.bannerBg.fillStyle(0x000000, 0.55);
    this.bannerBg.fillRoundedRect(b.x - 24, b.y - 12, b.width + 48, b.height + 24, 18);
    this.bannerBg.setAlpha(1);
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
    this.guardPopupCooldown = Math.max(0, this.guardPopupCooldown - dt);
    this.guardBannerCooldown = Math.max(0, this.guardBannerCooldown - dt);
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
      const a = Math.min(1, (BANNER_LIFE - this.bannerT) / 0.5);
      this.banner.setAlpha(a);
      this.bannerBg.setAlpha(a);
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
    if (w.outcome !== 'playing' || this.dialog.open || this.paused) return;
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

  // ---- 会話 ----

  /** 会話を出す。ほかの会話が開いていたら、終わってから順に出す */
  private openDialog(key: string): void {
    if (this.mode !== 'stage') return;
    if (this.dialog.open) {
      this.dialogQueue.push(key);
      return;
    }
    const story = STAGES[this.stageId].story;
    const lines = story.dialogs[key];
    if (!lines) return;
    this.joystick.release();
    this.dialog.show(lines, story.speakers, () => {
      // 始まりの会話のあとに、ジャンヌを守ることを知らせる
      if (key === 'start' && this.world.jeanne) this.showBanner(TEXT.protectJeanne, '#ffe9f2', 32);
      const next = this.dialogQueue.shift();
      if (next) this.openDialog(next);
    });
  }

  // ---- ひとやすみ ----

  /** 上のまんなか：「ひとやすみ」（止めて、つづける／はじめから／タイトルへ を選ぶ） */
  private createPauseButton(): void {
    const b = new Button(this, {
      x: VIEW_W / 2,
      y: 40,
      w: 220,
      h: 56,
      label: TEXT.pause,
      fontSize: 26,
      color: 0x7a5bc7,
      shadow: 0x4f3a87,
      onTap: () => this.openPause(),
    });
    this.toUi(...b.objects);
  }

  private openPause(): void {
    if (this.paused || this.dialog.open || this.world.outcome !== 'playing') return;
    this.paused = true;
    this.joystick.release();
    const dim = this.add.graphics().setDepth(1100);
    dim.fillStyle(0x0a0f08, 0.6);
    dim.fillRect(0, 0, VIEW_W, VIEW_H);
    // 画面のどこを押しても、後ろのスティックやボタンが動かないようにふさぐ
    const blocker = this.add.zone(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H).setInteractive().setDepth(1101);
    const title = this.add.text(VIEW_W / 2, 170, TEXT.pause, textStyle(52)).setOrigin(0.5).setDepth(1102);
    const items: { label: string; color: number; shadow: number; onTap: () => void }[] = [
      { label: TEXT.resume, color: 0xd94f3a, shadow: 0x9c3426, onTap: () => this.closePause() },
      { label: TEXT.restart, color: 0x3f6fd8, shadow: 0x2a4fa3, onTap: () => this.restartWith(this.allyKind, this.enemyKind) },
    ];
    if (this.mode !== 'stage') {
      const toSquad = this.mode === 'duel';
      items.push({
        label: toSquad ? TEXT.toSquadPractice : TEXT.toDuelPractice,
        color: 0x7a5bc7,
        shadow: 0x4f3a87,
        onTap: () => this.scene.restart({ mode: toSquad ? 'squad' : 'duel', allyKind: this.allyKind, enemyKind: this.enemyKind }),
      });
    }
    items.push({ label: TEXT.toTitle, color: 0x6e6250, shadow: 0x4a4136, onTap: () => this.scene.start('Title') });
    const objs: Phaser.GameObjects.GameObject[] = [dim, blocker, title];
    items.forEach((it, i) => {
      const b = new Button(this, { x: VIEW_W / 2, y: 290 + i * 110, w: 380, h: 86, fontSize: 34, depth: 1110, ...it });
      objs.push(...b.objects);
    });
    this.toUi(...objs);
    this.pauseObjects = objs;
  }

  private closePause(): void {
    for (const o of this.pauseObjects) o.destroy();
    this.pauseObjects = [];
    this.paused = false;
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
    this.scene.restart({ mode: this.mode, stageId: this.stageId, allyKind, enemyKind });
  }

  /** ステージ：セーブにある成長・難易度・引き継いだ部隊で戦場を作る */
  private stageWorldConfig(seed: number) {
    const save = Session.loadOrNew();
    return {
      ...stageConfig(STAGES[this.stageId].stage, seed),
      progress: save.hero,
      difficulty: DIFFICULTY[save.difficulty],
      carriedSquads: save.squads,
    };
  }

  /**
   * 勝ち負けが決まったあと。ステージで勝ったら記録してインターミッションへ。
   * 負けても上がったレベルと経験値は残す（部隊は前の状態のまま）
   */
  private finish(): void {
    if (this.mode !== 'stage') {
      this.showResult();
      return;
    }
    const w = this.world;
    const save = Session.loadOrNew();
    const levelBefore = save.hero.level;
    save.hero = { ...save.hero, level: w.level, xp: w.xp };
    if (w.outcome !== 'won') {
      Session.save(save);
      this.showResult();
      return;
    }
    const survivors = w.countFollowing();
    const stars = starsFor(w.time, survivors, w.leadership);
    const prev = save.cleared[this.stageId];
    const pointsGot = freePointsFor(w.level, stars, prev ? prev.stars : null);
    save.cleared[this.stageId] = {
      stars: Math.max(stars, prev?.stars ?? 0),
      bestSeconds: Math.min(w.time, prev?.bestSeconds ?? Infinity),
    };
    save.unspent += pointsGot;
    save.squads = w.carriedSquadsOut();
    Session.save(save);
    const data: IntermissionData = {
      stageId: this.stageId,
      seconds: w.time,
      stars,
      kills: w.kills,
      survivors,
      xpGained: w.xpGained,
      levelBefore,
      pointsGot,
    };
    this.scene.start('Intermission', data);
  }

  private showResult(): void {
    if (this.resultShown) return;
    this.resultShown = true;
    this.joystick.release();
    const w = this.world;
    const won = w.outcome === 'won';
    const objs: Phaser.GameObjects.GameObject[] = [];
    const dim = this.add.graphics().setDepth(1100);
    dim.fillStyle(0x0a0f08, 0.6);
    dim.fillRect(0, 0, VIEW_W, VIEW_H);
    dim.fillStyle(0xf5efe0, 1);
    dim.fillRoundedRect(VIEW_W / 2 - 300, VIEW_H / 2 - 220, 600, 440, 28);
    objs.push(dim, this.add.zone(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H).setInteractive().setDepth(1101));
    const text = (y: number, s: string, size: number, color: string) => {
      objs.push(this.add.text(VIEW_W / 2, y, s, textStyle(size, color, false)).setOrigin(0.5).setDepth(1102));
    };
    const stage = this.mode === 'stage';
    text(VIEW_H / 2 - 160, won ? (stage ? TEXT.stageClear : TEXT.win) : w.lostBy === 'jeanne' ? TEXT.loseJeanne : TEXT.lose, 52, won ? '#d94f3a' : '#3b4a66');
    const survivors = this.mode === 'duel' ? w.countAlive('ally') : w.countFollowing();
    if (stage) {
      const s = Math.floor(w.time);
      const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      text(VIEW_H / 2 - 80, `${won ? TEXT.clearTime : TEXT.time}  ${time}`, 30, '#2b2418');
      text(VIEW_H / 2 - 35, `${TEXT.survivorsShort}  ${survivors}　${TEXT.kills}  ${w.kills}`, 30, '#2b2418');
    } else {
      text(VIEW_H / 2 - 60, fmt(TEXT.survivors, { n: survivors }), 30, '#2b2418');
      if (this.mode === 'duel') text(VIEW_H / 2 - 10, matchupHint(this.allyKind, this.enemyKind), 26, '#6e6250');
    }
    const retry = new Button(this, {
      x: VIEW_W / 2,
      y: VIEW_H / 2 + 70,
      w: 340,
      h: 84,
      label: TEXT.retry,
      fontSize: 34,
      color: 0xd94f3a,
      shadow: 0x9c3426,
      onTap: () => this.restartWith(this.allyKind, this.enemyKind),
      depth: 1110,
    });
    const toTitle = new Button(this, {
      x: VIEW_W / 2,
      y: VIEW_H / 2 + 165,
      w: 340,
      h: 72,
      label: TEXT.toTitle,
      fontSize: 30,
      color: 0x6e6250,
      shadow: 0x4a4136,
      onTap: () => this.scene.start('Title'),
      depth: 1110,
    });
    this.toUi(...objs, ...retry.objects, ...toTitle.objects);
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

/**
 * 名札の文字と色を変える。Phaser の Text は色を設定するたびに文字を描き直すので、
 * 変わったときだけ設定する（毎フレーム描き直すと iPad で重い）
 */
function setLabel(label: Phaser.GameObjects.Text, text: string, color: string): void {
  label.setText(text);
  if (label.style.color !== color) label.setColor(color);
}

/** 兵士の位置の平均 */
function centerOf(units: readonly Unit[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const u of units) {
    x += u.x;
    y += u.y;
  }
  return { x: x / units.length, y: y / units.length };
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
