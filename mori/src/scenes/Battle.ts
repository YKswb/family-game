import Phaser from 'phaser';
import { GAME_DATA, PRACTICE_STAGE, SPEAKERS, STAGES, STORIES, stageById, type StageData, type StoryData, type StoryLine } from '../data/gameData';
import type { Spot } from '../systems/Build';
import { availableTowers, clearStage, endEndless, homeBonus, joinFriend, markSeen } from '../systems/Home';
import { Random } from '../systems/Random';
import { SaveStore, type SaveData } from '../systems/Save';
import { World, type WorldEvent } from '../systems/World';
import { DPR, TEXT, fmt, hex, screenSize, textStyle, worldZoom } from '../ui/Display';
import { Hud } from '../ui/Hud';
import { Dialog } from '../ui/Dialog';
import { Joystick } from '../ui/Joystick';
import { Overlay } from '../ui/Overlay';
import { music, type TrackName } from '../ui/Music';
import { bindSoundButton, sound, type SoundName } from '../ui/Sound';
import { Effects } from '../views/Effects';
import { drawEnemyHp, enemyLift } from '../views/EnemyView';
import { FRIEND_LIFT } from '../systems/Companions';
import { CHIMNEY } from '../views/HouseView';
import { stackTop } from '../views/PlayerView';
import { Scenery } from '../views/Scenery';
import { drawSpotProgress } from '../views/SpotView';
import { ImagePool } from '../views/Pool';
import { GRASS_SCALE, TEX_SCALE, Textures } from '../views/Textures';
import { MUZZLE_Y } from '../views/TowerView';
import { drawTreeHp } from '../views/TreeView';
import { drawWallSpot } from '../views/WallView';
import { Weather } from '../views/Weather';
import { dashedCircle, shade, softShadow, tint } from '../views/shapes';

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
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  stars: Phaser.GameObjects.Text;
  log: Phaser.GameObjects.Image;
}

const POPUP_LIFE = 1.1;
/** えんとつの煙を出す間隔（秒） */
const CHIMNEY_INTERVAL = 0.7;

/** ステージ選びから渡されるもの */
export interface BattleData {
  stageId?: string;
  difficulty?: number;
}

/** 戦場：木を集めて建て、敵のウェーブからおうちを守る */
export class BattleScene extends Phaser.Scene {
  private world!: World;
  private startData: BattleData = {};
  private stage!: StageData;
  private store!: SaveStore;
  private story: StoryData | null = null;
  private dialog!: Dialog;
  /** 途中とボスの会話は1回だけ出す */
  private midShown = false;
  private bossShown = false;
  private save!: SaveData;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private spotGfx!: Phaser.GameObjects.Graphics;
  /** 地面の上（敵より下）に描くもの：大ほうの火 */
  private groundFxGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private practice = false;
  private tex!: Textures;
  private scenery!: Scenery;
  /** 落ちた木材と、飛んでいく木材の画像 */
  private dropPool!: ImagePool;
  private flyerPool!: ImagePool;
  private tintGfx!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private overlay!: Overlay;
  private joystick!: Joystick;
  private weather!: Weather;
  private fx!: Effects;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private spotLabels = new Map<Spot, SpotLabel>();
  private fullText!: Phaser.GameObjects.Text;
  private flyers: Flyer[] = [];
  private popups: Popup[] = [];
  private fxRng = new Random(99);
  private leaf: [number, number] = [0, 0];
  /** 見た目の領地の半径（広がるときに少しずつ追いつく） */
  private terrShown = 0;
  private shake = 0;
  private chimneyT = 0;
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

  init(data: BattleData): void {
    this.startData = data ?? {};
    this.spotLabels = new Map();
    this.flyers = [];
    this.popups = [];
    this.shake = 0;
    this.chimneyT = 0;
    this.paused = false;
    this.resultShown = false;
    this.midShown = false;
    this.bossShown = false;
  }

  create(): void {
    const stage = (this.stage = stageById(this.startData.stageId ?? '') ?? STAGES[0]);
    this.practice = stage.id === PRACTICE_STAGE.id;
    this.story = STORIES[stage.id] ?? null;
    const th = stage.theme;
    // セーブから家の強化と解放したとうを持ってくる。このステージのとうは「見た」ことにする
    this.store = new SaveStore();
    this.save = this.store.load();
    markSeen(this.save, stage);
    this.store.save(this.save);
    const difficulty = this.startData.difficulty ?? this.save.difficulty;
    this.world = new World(stage, {
      seed: Date.now() % 100000,
      difficulty,
      home: homeBonus(this.save, GAME_DATA.home),
      towers: availableTowers(stage, this.save),
      companion: this.save.friend,
      extra: this.story?.mid?.extra ? { wave: this.story.mid.wave, kinds: this.story.mid.extra } : undefined,
    });
    this.leaf = [hex(th.leaf[0]), hex(th.leaf[1])];
    this.terrShown = this.world.territory;
    this.fx = new Effects();
    this.input.addPointer(2);

    this.cameras.main.setOrigin(0, 0).setBackgroundColor(th.background);
    this.uiCam = this.cameras.add(0, 0, 1, 1).setOrigin(0, 0);

    const tex = (this.tex = new Textures(this, th, this.world.data.towers, this.world.data.enemies));
    this.drawGround();
    this.spotGfx = this.toWorld(this.add.graphics().setDepth(1));
    this.groundFxGfx = this.toWorld(this.add.graphics().setDepth(2.55));
    this.createSpotLabels();
    const logKey = tex.logKey();
    this.dropPool = new ImagePool(() => this.toWorld(this.add.image(0, 0, logKey).setScale(1 / TEX_SCALE).setDepth(2.5)));
    this.scenery = new Scenery(this, this.world, tex, (o) => this.toWorld(o));
    this.fxGfx = this.toWorld(this.add.graphics().setDepth(4));
    this.flyerPool = new ImagePool(() => this.toWorld(this.add.image(0, 0, logKey).setScale(0.9 / TEX_SCALE).setDepth(4.5)));
    this.fullText = this.toWorld(this.add.text(0, 0, TEXT.full, textStyle(15, '#ffd84d')).setOrigin(0.5).setDepth(5));

    this.tintGfx = this.add.graphics().setDepth(690);
    this.toUi(this.tintGfx);
    const wd = th.weather;
    const flakeKeys = wd ? wd.colors.map((c) => tex.flakeKey(wd.type, c)) : [];
    this.weather = new Weather(wd, (i) => {
      const img = this.add.image(0, 0, flakeKeys[i]).setDepth(700);
      this.toUi(img);
      return img;
    });
    this.hud = new Hud(this);
    this.toUi(...this.hud.objects);
    this.joystick = new Joystick(this);
    this.toUi(this.joystick.gfx);
    this.overlay = new Overlay();
    this.dialog = new Dialog(SPEAKERS);
    this.dialog.hide();
    this.overlay.hide();
    this.overlay.callBtn.textContent = TEXT.callNow;
    this.overlay.callBtn.onclick = () => this.world.callNow();
    this.overlay.pauseBtn.onclick = () => this.pause();
    this.overlay.friendBtn.onclick = () => this.world.toggleCompanionMode();
    bindSoundButton(this.overlay.soundBtn);
    this.overlay.soundBtn.classList.remove('solo');
    music.play(this.stageTrack());

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    // パソコンでは C キーで仲間への命令を切り替える
    this.input.keyboard!.on('keydown-C', () => this.world.toggleCompanionMode());

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    // アプリを切り替えたら「ひとやすみ」にする（Phaser 自体も止まる）
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
      for (const p of this.popups) p.text.destroy();
      this.dialog.hide();
      this.overlay.soundBtn.classList.add('hide');
    });

    const p = this.world.player;
    this.camX = p.x;
    this.camY = p.y;
    this.updateCamera(1);
    this.hud.showBanner(stage.name);
    if (this.story) this.talk(this.story.start);

    // 自動テストやデバッグ用に外から覗けるようにしておく
    (window as unknown as { __mori: unknown }).__mori = { scene: this, world: this.world };
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const w = this.world;
    const running = !this.paused && !this.overlay.visible && !this.dialog.visible && w.outcome === 'playing';
    if (running) {
      w.input = this.readInput();
      w.step(dt);
      for (const e of w.events) this.onEvent(e);
      if (w.choice) this.openChoice();
    }
    if (w.outcome !== 'playing' && !this.resultShown) {
      this.resultShown = true;
      this.joystick.release();
      music.stop();
      sound.play(w.outcome === 'won' ? 'win' : 'lose');
      // クリアしたら、物語の会話のあとで結果を出す
      const clear = w.outcome === 'won' ? this.story?.clear : undefined;
      this.time.delayedCall(900, () => (clear ? this.talk(clear, () => this.showResult()) : this.showResult()));
    }
    this.overlay.pauseBtn.classList.toggle('hide', w.outcome !== 'playing' || this.overlay.visible || this.dialog.visible);
    this.overlay.soundBtn.classList.toggle('hide', w.outcome !== 'playing' || this.overlay.visible);
    this.overlay.callBtn.classList.toggle('hide', !(running && w.phase === 'prep'));
    this.updateFriendButton(running);
    const fxDt = running ? dt : 0;
    this.terrShown += (w.territory - this.terrShown) * Math.min(1, dt * 2.5);
    this.shake = Math.max(0, this.shake - dt);
    this.updateChimney(fxDt);
    this.updateEffects(fxDt);
    this.render(fxDt);
    this.weather.update(dt);
    const label = this.stageLabel(w.diff.name);
    this.hud.update(w, fxDt, (x, y) => this.toScreen(x, y), label);
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
    this.weather.layout(w, h);
    const t = this.world.stage.theme.tint;
    this.tintGfx.clear();
    if (t) {
      this.tintGfx.fillStyle(hex(t.color), t.alpha);
      this.tintGfx.fillRect(0, 0, w, h);
    }
    // 霧：あらた（画面のほぼ真ん中）から離れるほど白くかすむ。輪を重ねて、少しずつ濃くする
    const mist = this.world.stage.theme.mist;
    if (mist) {
      const g = this.tintGfx;
      const r0 = Math.min(w, h) * mist;
      const r1 = Math.hypot(w, h) / 2 + 20;
      const steps = 10;
      const band = (r1 - r0) / steps;
      for (let i = 0; i < steps; i++) {
        g.lineStyle(band + 1, 0xdfe8dc, Math.min(0.8, 0.14 + i * 0.07));
        g.strokeCircle(w / 2, h / 2, r0 + band * (i + 0.5));
      }
    }
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
      buttons: [
        { label: TEXT.resume, onTap: () => (this.paused = false) },
        {
          label: music.enabled ? TEXT.bgmOn : TEXT.bgmOff,
          secondary: true,
          onTap: () => {
            // 切り替えたら、ひとやすみの画面を出し直す
            music.setEnabled(!music.enabled);
            this.paused = false;
            this.pause();
          },
        },
        { label: TEXT.quit, secondary: true, onTap: () => this.goHome() },
      ],
    });
  }

  /** 左上に出すステージの名前（例「ステージ 3・ふつう」） */
  private stageLabel(diff: string): string {
    if (this.practice) return fmt(TEXT.practiceLabel, { diff });
    if (this.stage.waves.endless) return fmt(TEXT.endlessLabel, { diff });
    return fmt(TEXT.stageLabel, { n: STAGES.findIndex((x) => x.id === this.stage.id) + 1, diff });
  }

  /** 会話を出す（出ている間は戦場が止まる）。指が画面に残っていたら離した扱いにする */
  /** このステージの BGM */
  private stageTrack(): TrackName {
    return (this.stage.theme.music ?? 'forest') as TrackName;
  }

  private talk(lines: StoryLine[], onDone: () => void = () => {}): void {
    this.joystick.release();
    this.dialog.show(lines, onDone);
  }

  /** 仲間への命令ボタン：上にいまの様子を小さく、下に押すとどうなるかを大きく出す */
  private updateFriendButton(running: boolean): void {
    const btn = this.overlay.friendBtn;
    const c = this.world.companion;
    btn.classList.toggle('hide', !c || !running);
    if (!c) return;
    const name = `${c.stats.icon} ${c.stats.name}`;
    const html =
      c.mode === 'follow'
        ? `<small>${fmt(TEXT.friendFollowing, { name })}</small><br>${TEXT.toGuard}`
        : `<small>${fmt(TEXT.friendGuarding, { name })}</small><br>${TEXT.toFollow}`;
    if (btn.dataset.html !== html) {
      btn.innerHTML = html;
      btn.dataset.html = html;
      btn.classList.toggle('guard', c.mode === 'guard');
    }
  }

  private goHome(): void {
    this.scene.start('Menu', { screen: 'home' });
  }

  /** とうの種類、とうの分かれ道、レベルアップの強化を選ぶ画面を出す */
  private openChoice(): void {
    const w = this.world;
    const c = w.choice;
    if (!c || this.overlay.visible) return;
    this.joystick.release();
    const kinds = w.data.towers.kinds;
    if (c.type === 'tower') {
      // このステージで建てられる種類（ステージのとうと、家で解放したとう）だけを出す
      const list = w.towers;
      this.overlay.showChoice(
        TEXT.chooseTower,
        '',
        list.map((k) => ({ icon: kinds[k].icon, name: kinds[k].name, desc: kinds[k].desc })),
        (i) => {
          const kind = list[i];
          w.chooseTower(kind);
          const s = c.spot;
          this.popup(s.x, s.y - 120, fmt(TEXT.builtTower, { name: kinds[kind].name }));
          this.fx.sparkle(s.x, s.y + MUZZLE_Y - 20, 10, tint(hex(kinds[kind].color), 0.5));
        },
      );
      return;
    }
    if (c.type === 'branch') {
      const s = c.spot;
      const t = kinds[s.kind!];
      this.overlay.showChoice(
        TEXT.chooseBranch,
        fmt(TEXT.branchLead, { name: t.name }),
        t.branches.map((b) => ({ icon: b.icon, name: b.name, desc: b.desc })),
        (i) => {
          w.chooseBranch(i);
          this.popup(s.x, s.y - 140, fmt(TEXT.builtBranch, { name: t.branches[i].name }));
          this.fx.sparkle(s.x, s.y + MUZZLE_Y - 30, 14, tint(hex(t.color), 0.5));
          this.fx.ring(s.x, s.y, 20, 80, hex(t.color), 0.6, 6);
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
    const retry = { label: TEXT.retry, onTap: () => this.scene.restart(this.startData) };
    const home = { label: TEXT.goHome, onTap: () => this.goHome() };
    if (w.outcome === 'won') {
      // なつこの愛をもらい、物語で仲間が加わり、記録と一緒にすぐ保存する
      const r = clearStage(this.save, GAME_DATA.home, this.stage, w.stars, w.difficulty);
      const joins = this.story?.joins;
      const joined = joins ? joinFriend(this.save, joins) : false;
      this.store.save(this.save);
      const last = STAGES[STAGES.length - 1].id === this.stage.id;
      const lines = [
        last ? TEXT.allClearLead : TEXT.clearLead,
        `${fmt(TEXT.houseHp, { hp: w.house.hp, max: w.house.maxHp })}　${fmt(TEXT.level, { lv: w.level })}`,
        `💗 ${fmt(r.first ? TEXT.rewardFirst : TEXT.reward, { n: r.love })}`,
      ];
      if (joined && joins) {
        const c = GAME_DATA.companions.kinds[joins];
        lines.push(fmt(TEXT.friendJoined, { icon: c.icon, name: c.name }));
        sound.play('joined');
      }
      this.overlay.showResult({
        title: last ? TEXT.allClear : TEXT.clear,
        stars: w.stars,
        lines,
        buttons: [home, { ...retry, secondary: true }],
      });
    } else if (this.stage.waves.endless) {
      // むげんモードは、おうちが壊されたら終わり。たどりついたウェーブで記録となつこの愛
      const r = endEndless(this.save, GAME_DATA.home, w.wave, w.difficulty);
      this.store.save(this.save);
      const lines = [fmt(TEXT.endlessLead, { n: w.wave })];
      if (r.record) lines.push(TEXT.endlessRecord);
      if (r.love > 0) lines.push(`💗 ${fmt(TEXT.reward, { n: r.love })}`);
      this.overlay.showResult({ title: TEXT.endlessEnd, stars: 0, lines, buttons: [home, { ...retry, secondary: true }] });
    } else {
      this.overlay.showResult({
        title: TEXT.lose,
        stars: 0,
        lines: [fmt(TEXT.loseLead, { n: w.wave }), TEXT.loseTip],
        buttons: [retry, { ...home, secondary: true }],
      });
    }
  }

  // ---- 描画 ----

  /** 地面・草・花・おうちのまわりの空き地（動かないので最初に1回だけ作る） */
  private drawGround(): void {
    const { stage, width, height, house } = this.world;
    const tex = this.tex;
    const rng = new Random(7);
    const seed = () => rng.next();
    // 草と花の模様は画像にして敷き詰める
    const tile = tex.grassTile(seed);
    this.toWorld(this.add.tileSprite(0, 0, width, height, tile).setOrigin(0, 0).setTileScale(1 / GRASS_SCALE).setDepth(0));
    // 模様のくり返しが目立たないよう、大きなまだら（明るいところと暗いところ）を重ねる
    const ground = hex(stage.theme.ground);
    for (let i = 0; i < 26; i++) {
      const img = tex.patch(i % 2 ? shade(ground, 0.85) : tint(ground, 0.18));
      img.setPosition(rng.range(0, width), rng.range(0, height)).setScale(rng.range(1.6, 4.2), rng.range(1.6, 4)).setDepth(0.1);
      this.toWorld(img);
    }
    // おうちのまわりの空き地（縁をぼかす）と小石
    this.toWorld(tex.clearing(house.x, house.y + 10, seed).setDepth(0.2));
  }

  private createSpotLabels(): void {
    for (const s of this.world.spots) {
      this.spotLabels.set(s, {
        name: this.toWorld(this.add.text(0, 0, '', textStyle(15)).setOrigin(0.5).setDepth(2)),
        cost: this.toWorld(this.add.text(0, 0, '', textStyle(16)).setOrigin(0, 0.5).setDepth(2)),
        stars: this.toWorld(this.add.text(0, 0, '', textStyle(12, '#ffd84d')).setOrigin(0.5).setDepth(2)),
        log: this.toWorld(this.tex.log(0, 0).setDepth(2).setScale(15 / 18 / TEX_SCALE)),
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

  /** 建設地点の円とアイコン、名前・残りの木材・レベルの★ */
  private renderSpots(): void {
    const w = this.world;
    const p = w.player;
    const g = this.spotGfx;
    g.clear();
    for (const s of w.spots) {
      const l = this.spotLabels.get(s)!;
      const hideAll = () => {
        l.name.setVisible(false);
        l.cost.setVisible(false);
        l.stars.setVisible(false);
        l.log.setVisible(false);
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
      } else {
        drawSpotProgress(g, s, w.time);
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
        l.log.setVisible(false);
        continue;
      }
      l.name.setVisible(true).setText(name).setColor('#ffffff').setPosition(lx, ly);
      l.cost.setVisible(true).setText(String(s.remaining)).setPosition(lx + 1, ly + 18);
      l.log.setVisible(true).setPosition(lx - 11, ly + 18);
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

  private render(dt: number): void {
    const w = this.world;
    const p = w.player;
    this.renderSpots();
    // 木・敵・とう・かべ・おうち・主人公（足元の y の順に重なる）
    this.scenery.update(dt, this.viewRect());

    this.dropPool.begin();
    for (const d of w.drops) this.dropPool.next().setPosition(d.x, d.y - 6 - d.z).setRotation(Math.sin(d.t * 3) * 0.3);
    this.dropPool.end();
    this.flyerPool.begin();
    for (const fl of this.flyers) {
      if (fl.t < 0) continue;
      const k = Math.min(1, fl.t / fl.dur);
      const tx = fl.toPlayer ? p.x - 12 * p.face : fl.tx;
      const ty = fl.toPlayer ? p.y - stackTop(p) : fl.ty;
      this.flyerPool
        .next()
        .setPosition(fl.x0 + (tx - fl.x0) * k, fl.y0 + (ty - fl.y0) * k - Math.sin(k * Math.PI) * 50)
        .setRotation(k * 6);
    }
    this.flyerPool.end();
    this.renderFires();

    const f = this.fxGfx;
    f.clear();
    for (const d of w.drops) softShadow(f, d.x, d.y + 2, 9, 3, 0.18);
    for (const t of w.trees) drawTreeHp(f, t);
    for (const e of w.enemies) drawEnemyHp(f, e, enemyLift(e));
    this.renderWallBars(f);
    this.renderShots(f);
    this.fx.draw(f);
    this.renderFog(f);
    this.renderHouseBar(f);

    const full = p.wood >= w.capacity;
    this.fullText.setVisible(full).setPosition(p.x, p.y - stackTop(p) - 22);
  }

  /** 大ほうの「もえる 地面」の火。ちらちら揺らし、消える前に小さくなる */
  private renderFires(): void {
    const g = this.groundFxGfx;
    g.clear();
    const t = this.world.time;
    for (const fire of this.world.fires) {
      const k = Math.min(1, fire.t / 0.6);
      const r = fire.r * (0.6 + 0.4 * k);
      g.fillStyle(0xff7a2a, 0.22 * k);
      g.fillEllipse(fire.x, fire.y, r * 2.2, r * 1.3);
      g.fillStyle(0xffb347, 0.35 * k);
      g.fillEllipse(fire.x, fire.y, r * 1.5, r * 0.9);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + fire.x;
        const fx = fire.x + Math.cos(a) * r * 0.55;
        const fy = fire.y + Math.sin(a) * r * 0.3;
        const h = (10 + 6 * Math.sin(t * 12 + i * 1.7)) * k;
        g.fillStyle(0xff5a2a, 0.85 * k);
        g.fillTriangle(fx - 5, fy, fx + 5, fy, fx, fy - h);
        g.fillStyle(0xffd84d, 0.9 * k);
        g.fillTriangle(fx - 2.5, fy, fx + 2.5, fy, fx, fy - h * 0.6);
      }
    }
  }

  /** 領地の外の霧。縁は少しずつ濃くして、くっきりした線にしない */
  private renderFog(f: Phaser.GameObjects.Graphics): void {
    const w = this.world;
    const fog = hex(w.stage.theme.fog);
    const r = this.terrShown;
    const edge = 36;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      f.lineStyle(edge / steps + 0.5, fog, (0.6 * (i + 1)) / (steps + 1));
      f.strokeCircle(w.house.x, w.house.y, r + (edge / steps) * (i + 0.5));
    }
    const fogW = 2400;
    f.lineStyle(fogW, fog, 0.6);
    f.strokeCircle(w.house.x, w.house.y, r + edge + fogW / 2);
    f.lineStyle(3, 0xffffff, 0.4);
    dashedCircle(f, w.house.x, w.house.y, r, 14, 10);
  }

  private renderShots(f: Phaser.GameObjects.Graphics): void {
    const muzzle = -MUZZLE_Y;
    for (const a of this.world.shots) {
      if (a.type === 'shell') {
        const u = Math.min(1, a.t / a.dur);
        const x = a.x0 + (a.tx - a.x0) * u;
        const y = a.y0 + (a.ty - a.y0) * u - Math.sin(u * Math.PI) * 90;
        softShadow(f, x, a.ty + (a.y0 + muzzle - a.ty) * (1 - u), 5, 2, 0.2);
        f.fillStyle(0x1b1e22, 1);
        f.fillCircle(x, y, 7.5);
        f.fillStyle(0x3a3f46, 1);
        f.fillCircle(x, y, 6);
        f.fillStyle(0x8a9099, 1);
        f.fillCircle(x - 2, y - 2, 2);
        continue;
      }
      if (a.kind === 'ice') {
        f.fillStyle(0x8cdcff, 0.35);
        f.fillCircle(a.x, a.y, 9);
        f.fillStyle(0xbff0ff, 1);
        f.fillCircle(a.x, a.y, 5);
        f.fillStyle(0xffffff, 1);
        f.fillCircle(a.x - 1, a.y - 1, 2);
        continue;
      }
      if (a.kind === 'magic') {
        // ふくろうの魔法の玉：うす紫に光る玉と、短い尾
        const l = Math.hypot(a.vx, a.vy) || 1;
        f.fillStyle(0xc9a8ff, 0.3);
        f.fillCircle(a.x - (a.vx / l) * 8, a.y - (a.vy / l) * 8, 6);
        f.fillStyle(0xd8c2ff, 0.45);
        f.fillCircle(a.x, a.y, 9);
        f.fillStyle(0xffffff, 1);
        f.fillCircle(a.x, a.y, 4);
        continue;
      }
      const l = Math.hypot(a.vx, a.vy) || 1;
      const bx = a.x - (a.vx / l) * 16;
      const by = a.y - (a.vy / l) * 16;
      f.lineStyle(3.5, 0x3d2614, 1);
      f.lineBetween(a.x, a.y, bx, by);
      f.lineStyle(2, 0xb07a45, 1);
      f.lineBetween(a.x, a.y, bx, by);
      f.fillStyle(0xffffff, 1);
      f.fillCircle(a.x, a.y, 2.5);
      f.fillStyle(0xff7a6a, 1);
      f.fillCircle(bx, by, 2);
    }
  }

  /** 傷ついたかべの HP */
  private renderWallBars(g: Phaser.GameObjects.Graphics): void {
    for (const s of this.world.walls) {
      if (s.level === 0 || s.hp >= s.maxHp) continue;
      const bw = 60;
      g.fillStyle(0x000000, 0.5);
      g.fillRoundedRect(s.x - bw / 2 - 1.5, s.y - 53.5, bw + 3, 10, 5);
      g.fillStyle(s.hp / s.maxHp > 0.4 ? 0xffcc1f : 0xff5a4f, 1);
      g.fillRoundedRect(s.x - bw / 2, s.y - 52, Math.max(7, (bw * s.hp) / s.maxHp), 7, 3.5);
    }
  }

  /** おうちの上の HP */
  private renderHouseBar(f: Phaser.GameObjects.Graphics): void {
    const h = this.world.house;
    const bw = 104;
    f.fillStyle(0x000000, 0.5);
    f.fillRoundedRect(h.x - bw / 2 - 2, h.y - 152, bw + 4, 14, 7);
    if (h.hp <= 0) return;
    f.fillStyle(h.hp / h.maxHp > 0.4 ? 0x5bd16a : 0xff5a4f, 1);
    f.fillRoundedRect(h.x - bw / 2, h.y - 150, Math.max(10, (bw * h.hp) / h.maxHp), 10, 5);
    f.fillStyle(0xffffff, 0.35);
    f.fillRoundedRect(h.x - bw / 2 + 3, h.y - 149, Math.max(4, (bw * h.hp) / h.maxHp - 6), 3, 1.5);
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
    const fx = this.fx;
    this.playFor(e);
    switch (e.type) {
      case 'chop':
        fx.burst(e.tree.x, e.tree.y - 20, 0xc58a52, 6, 140, 4);
        fx.burst(e.tree.x, e.tree.y - 50, this.leaf[1], 3, 90, 4);
        break;
      case 'fell':
        this.scenery.fell(e.tree, w.player.x < e.tree.x ? 1 : -1);
        fx.burst(e.tree.x, e.tree.y - 50, this.leaf[0], 14, 180, 6);
        fx.smoke(e.tree.x, e.tree.y - 4, 5, 9, 0xe9dcc0, 50);
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
        fx.ring(w.house.x, w.house.y, w.stage.territory[Math.max(0, e.level - 1)], w.territory + 30, 0xffffff, 0.9, 6);
        break;
      case 'attack':
        this.shake = Math.max(this.shake, 0.04);
        break;
      case 'hit':
        fx.burst(e.enemy.x, e.enemy.y - e.enemy.r, 0xffffff, 4, 100, 3);
        break;
      case 'death': {
        const en = e.enemy;
        const y = en.y - en.r - (en.fly ? 24 : 0);
        // 倒れた敵は、煙になって消える
        fx.smoke(en.x, y, en.stats.boss ? 16 : 6, en.r * 0.7);
        fx.burst(en.x, y, hex(en.stats.color), en.stats.boss ? 24 : 10, 170, 4);
        if (en.kind === 'boss') this.bigShake(TEXT.bossDown, 0.4);
        if (en.kind === 'maou') this.bigShake(TEXT.maouDown, 0.6);
        break;
      }
      case 'spawn':
        if (e.enemy.kind === 'boss') this.hud.showBanner(TEXT.bossCame);
        if (e.enemy.kind === 'maou') this.hud.showBanner(TEXT.maouCame);
        if (e.enemy.stats.boss && this.story?.boss && !this.bossShown) {
          this.bossShown = true;
          this.talk(this.story.boss);
        }
        break;
      case 'summon':
        fx.smoke(e.enemy.x, e.enemy.y - e.enemy.r, 10, 14, 0xb07ae0, 90);
        break;
      case 'shoot': {
        const s = e.spot;
        if (s.kind === 'cannon') fx.smoke(s.x + 14, s.y + MUZZLE_Y - 4, 3, 6, 0xd8d8d8, 40);
        else if (s.kind === 'ice') fx.sparkle(s.x, s.y + MUZZLE_Y - 8, 2, 0xdff6ff);
        break;
      }
      case 'explode':
        fx.ring(e.x, e.y, 8, e.radius, 0xffd27a, 0.35, 6);
        fx.burst(e.x, e.y - 10, 0xffb347, 14, 220, 6);
        fx.smoke(e.x, e.y - 10, 7, 12, 0x9a9a9a, 70);
        this.shake = Math.max(this.shake, 0.12);
        break;
      case 'zap':
        fx.zap(e.points);
        for (const pt of e.points.slice(1)) fx.sparkle(pt.x, pt.y, 3, 0xfff3a0);
        break;
      case 'mend':
        fx.plus(e.x, e.y - 20, 3);
        break;
      case 'chill':
        fx.ring(e.x, e.y - 10, 10, e.radius, 0xbff0ff, 0.4, 5);
        break;
      case 'freeze':
        fx.sparkle(e.enemy.x, e.enemy.y - e.enemy.r, 8, 0xdff6ff);
        break;
      case 'blocked':
        fx.sparkle(e.enemy.x + e.enemy.face * e.enemy.r, e.enemy.y - e.enemy.r, 3, 0xffffff);
        if (this.fxRng.next() < 0.35) this.popup(e.enemy.x, e.enemy.y - e.enemy.r * 2.4, TEXT.blocked, '#e8eef4');
        break;
      case 'stolen':
        this.popup(e.tree.x, e.tree.y - 80, TEXT.stolen, '#ffb0a0');
        break;
      case 'escape':
        this.popup(w.house.x, w.house.y - 170, TEXT.escaped, '#ffb0a0');
        break;
      case 'friendAttack': {
        const c = e.companion;
        if (c.stats.ranged) fx.sparkle(c.x, c.y - FRIEND_LIFT - 14, 3, 0xe8d8ff);
        else if (c.kind === 'goro') {
          fx.ring(e.x, e.y + 10, 8, c.stats.splash ?? 40, 0xffe2b0, 0.3, 5);
          this.shake = Math.max(this.shake, 0.05);
        } else fx.burst(e.x, e.y, 0xffffff, 3, 90, 3);
        break;
      }
      case 'friendWarp':
        fx.smoke(e.companion.x, e.companion.y - 10, 6, 9, 0xffffff, 50);
        fx.sparkle(e.companion.x, e.companion.y - 20, 6);
        break;
      case 'friendMode': {
        const c = w.companion;
        if (c) this.popup(c.x, c.y - 60, fmt(e.mode === 'follow' ? TEXT.friendSaysFollow : TEXT.friendSaysGuard, { name: c.stats.name }), '#ffffff');
        break;
      }
      case 'healPulse':
        fx.ring(e.enemy.x, e.enemy.y - e.enemy.r, 12, e.radius, 0x7dffa0, 0.6, 5);
        fx.plus(e.enemy.x, e.enemy.y - e.enemy.r * 2, 4, 0x7dffa0);
        break;
      case 'wallHit': {
        const pp = e.spot.posts[Math.floor(this.fxRng.next() * e.spot.posts.length)];
        fx.burst(pp.x, pp.y - 15, e.spot.level >= 2 ? 0xb8c0c8 : 0xa86c39, 4, 100, 4);
        break;
      }
      case 'wallBroken':
        for (const pp of e.spot.posts) fx.burst(pp.x, pp.y - 15, 0xa86c39, 3, 150, 5);
        fx.smoke(e.spot.x, e.spot.y - 10, 6, 12, 0xd9c8a8, 60);
        this.popup(e.spot.x, e.spot.y - 50, TEXT.wallBroken, '#ffb0a0');
        this.shake = Math.max(this.shake, 0.2);
        break;
      case 'houseHit':
        this.popup(w.house.x + this.fxRng.range(-30, 30), w.house.y - 110, `-${e.dmg}`, '#ff5a4f');
        fx.burst(w.house.x + this.fxRng.range(-40, 40), w.house.y - 40, 0xf7e2b3, 5, 120, 4);
        this.shake = Math.max(this.shake, 0.2);
        break;
      case 'wave':
        this.hud.showBanner(e.last ? TEXT.lastWave : fmt(TEXT.wave, { n: e.n }));
        if (this.story?.mid && e.n === this.story.mid.wave && !this.midShown) {
          this.midShown = true;
          this.talk(this.story.mid.lines);
        }
        break;
      case 'waveClear':
        this.hud.showBanner(TEXT.waveClear);
        break;
      case 'levelUp':
        fx.sparkle(w.player.x, w.player.y - 40, 12);
        fx.ring(w.player.x, w.player.y - 20, 10, 60, 0x7fe08a, 0.5, 4);
        break;
      case 'xpBonus':
        this.popup(w.player.x, w.player.y - 80, fmt(TEXT.xpBonus, { n: e.n }), '#7fe08a');
        break;
      default:
        break;
    }
  }

  /** 出来事に合わせた効果音（音の中身は data/sounds.json） */
  private playFor(e: WorldEvent): void {
    const simple: Partial<Record<WorldEvent['type'], SoundName>> = {
      chop: 'chop',
      fell: 'fell',
      pickup: 'pickup',
      built: 'build',
      territory: 'land',
      attack: 'swing',
      hit: 'hit',
      summon: 'summon',
      explode: 'boom',
      zap: 'zap',
      mend: 'mend',
      chill: 'chill',
      freeze: 'freeze',
      blocked: 'clink',
      stolen: 'stolen',
      escape: 'escape',
      friendWarp: 'warp',
      friendMode: 'friendMode',
      healPulse: 'enemyHeal',
      wallHit: 'wallHit',
      wallBroken: 'wallBroken',
      houseHit: 'houseHit',
      waveClear: 'waveClear',
      levelUp: 'levelUp',
    };
    const name = simple[e.type];
    if (name) {
      sound.play(name);
      return;
    }
    switch (e.type) {
      case 'pay':
        // 払うほど少しずつ高くなる
        sound.play('pay', 1 + Math.min(1, e.spot.paid / Math.max(1, e.spot.cost)) * 0.8);
        break;
      case 'death':
        sound.play(e.enemy.stats.boss ? 'bossDown' : 'pop');
        // ボスが残っていなければ、ステージの曲に戻す
        if (e.enemy.stats.boss && !this.world.enemies.some((x) => x !== e.enemy && x.stats.boss && !x.dead)) music.play(this.stageTrack());
        break;
      case 'spawn':
        if (e.enemy.kind === 'boss') sound.play('bossCame');
        if (e.enemy.kind === 'maou') sound.play('maouCame');
        if (e.enemy.stats.boss) music.play('boss');
        break;
      case 'shoot':
        if (e.spot.kind === 'arrow') sound.play('shootArrow');
        else if (e.spot.kind === 'cannon') sound.play('shootCannon');
        else if (e.spot.kind === 'ice') sound.play('shootIce');
        break;
      case 'friendAttack':
        sound.play(e.companion.kind === 'momo' ? 'friendMomo' : e.companion.kind === 'goro' ? 'friendGoro' : 'friendHosuke');
        break;
      case 'wave':
        sound.play(e.last ? 'lastWave' : 'wave');
        break;
      default:
        break;
    }
  }

  private onBuilt(s: Spot): void {
    const fx = this.fx;
    fx.burst(s.x, s.y - 30, 0xffd84d, 22, 230, 5);
    fx.ring(s.x, s.y, 20, 70, 0xffe27a, 0.5, 6);
    fx.sparkle(s.x, s.y - 40, 8);
    switch (s.type) {
      case 'axe':
        this.popup(s.x, s.y - 55, TEXT.builtAxe);
        break;
      case 'bag':
        this.popup(s.x, s.y - 55, TEXT.builtBag);
        break;
      case 'wall':
        for (const pp of s.posts) fx.smoke(pp.x, pp.y, 1, 7, 0xe9dcc0, 30);
        this.popup(s.x, s.y - 55, s.level === 1 ? TEXT.builtWall : TEXT.builtStoneWall);
        break;
      case 'tower':
        fx.smoke(s.x, s.y, 5, 10, 0xe9dcc0, 50);
        if (s.level > 1) this.popup(s.x, s.y - 120, TEXT.builtTowerUp);
        break;
      default:
        break;
    }
  }

  /** えんとつから、ときどき煙を出す */
  private updateChimney(dt: number): void {
    if (dt === 0) return;
    this.chimneyT -= dt;
    if (this.chimneyT > 0) return;
    this.chimneyT = CHIMNEY_INTERVAL;
    const h = this.world.house;
    this.fx.smoke(h.x + CHIMNEY.x + 8, h.y + CHIMNEY.y - 4, 1, 6, 0xf0ece4, 18);
  }

  private bigShake(text: string, shake: number): void {
    this.hud.showBanner(text);
    this.shake = Math.max(this.shake, shake);
  }

  private popup(x: number, y: number, s: string, color = '#ffffff'): void {
    const text = this.toWorld(this.add.text(x, y, s, textStyle(18, color)).setOrigin(0.5).setDepth(6));
    this.popups.push({ text, t: 0 });
  }

  private updateEffects(dt: number): void {
    this.fx.update(dt);
    for (const f of this.flyers) f.t += dt;
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
    for (const pp of this.popups) {
      pp.t += dt;
      pp.text.y -= 40 * dt;
      // 出た直後に少し大きく弾ませる
      const pop = pp.t < 0.15 ? 1 + (0.15 - pp.t) * 2.5 : 1;
      pp.text.setScale(pop).setAlpha(Math.max(0, 1 - Math.pow(pp.t / POPUP_LIFE, 2)));
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
