import Phaser from 'phaser';
import { GAME_DATA, SELECTABLE_STAGES, STAGES, type TowerKind } from '../data/gameData';
import { buyUpgrade, refundAll, unlockTower } from '../systems/Home';
import { Random } from '../systems/Random';
import { SaveStore, newSave, type SaveData } from '../systems/Save';
import { DPR, TEXT, hex, screenSize } from '../ui/Display';
import { Menus } from '../ui/Menus';
import { Overlay } from '../ui/Overlay';
import { GRASS_SCALE, TEX_SCALE, Textures } from '../views/Textures';
import { Weather } from '../views/Weather';

export type MenuScreen = 'title' | 'home' | 'stages';

export interface MenuData {
  screen?: MenuScreen;
}

/** タイトル・まもりびとの家・ステージ選び。後ろに森の絵を描き、HTML の画面を重ねる */
export class MenuScene extends Phaser.Scene {
  private screen: MenuScreen = 'title';
  private store!: SaveStore;
  private save!: SaveData;
  private menus!: Menus;
  private overlay!: Overlay;
  private tex!: Textures;
  private weather!: Weather;
  private bg: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Menu');
  }

  init(data: MenuData): void {
    this.screen = data.screen ?? 'title';
    this.bg = [];
  }

  create(): void {
    this.store = new SaveStore();
    this.save = this.store.load();
    this.menus = new Menus();
    this.overlay = new Overlay();
    this.overlay.hide();
    this.overlay.pauseBtn.classList.add('hide');
    this.overlay.callBtn.classList.add('hide');
    this.overlay.friendBtn.classList.add('hide');
    const theme = STAGES[0].theme;
    this.cameras.main.setOrigin(0, 0).setBackgroundColor(theme.background);
    this.tex = new Textures(this, theme, GAME_DATA.towers, GAME_DATA.enemies);
    const wd = theme.weather;
    const flakeKeys = wd ? wd.colors.map((c) => this.tex.flakeKey(wd.type, c)) : [];
    this.weather = new Weather(wd, (i) => this.add.image(0, 0, flakeKeys[i]).setDepth(10));
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.menus.hide();
    });
    this.show(this.screen);
  }

  update(_t: number, delta: number): void {
    this.weather.update(Math.min(0.05, delta / 1000));
  }

  /** 後ろの森：草地に、おうちと、まわりを囲む木 */
  private layout(): void {
    const { w, h } = screenSize();
    this.cameras.main.setSize(w * DPR, h * DPR).setZoom(DPR);
    for (const o of this.bg) o.destroy();
    this.bg = [];
    const rng = new Random(3);
    const k = Math.max(0.8, Math.min(w, h) / 600);
    const tile = this.tex.grassTile(() => rng.next());
    this.bg.push(this.add.tileSprite(0, 0, w, h, tile).setOrigin(0, 0).setTileScale(k / GRASS_SCALE).setDepth(0));
    // タイトルの文字と重ならないよう、おうちは画面の下の方に置く
    const clear = this.tex.clearing(w / 2, h * 0.6, () => rng.next()).setScale(k * 0.5 * 1.2, k * 0.5).setDepth(0.5);
    this.bg.push(clear);
    this.bg.push(this.tex.house(w / 2, h * 0.9).setScale(k / TEX_SCALE).setDepth(h * 0.9));
    // 画面の縁に沿って木を並べる（真ん中は空けておく）
    for (let i = 0; i < 70; i++) {
      const x = rng.range(-30, w + 30);
      const y = rng.range(20, h + 60);
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h * 0.6) / (h / 2);
      if (dx * dx + dy * dy < 0.75) continue;
      const tree = this.tex.tree(x, y).setScale((k * rng.range(0.9, 1.15)) / TEX_SCALE).setDepth(y);
      this.bg.push(tree);
    }
    const shade = this.add.rectangle(0, 0, w, h, hex('#12280e'), 0.25).setOrigin(0, 0).setDepth(5);
    this.bg.push(shade);
    this.weather.layout(w, h);
  }

  private persist(): void {
    this.store.save(this.save);
  }

  private show(screen: MenuScreen): void {
    this.screen = screen;
    if (screen === 'title') {
      this.menus.showTitle(
        this.store.exists(),
        () => this.show('home'),
        () => this.confirmNewGame(),
      );
      return;
    }
    if (screen === 'home') {
      this.menus.showHome(this.save, GAME_DATA, {
        onBuy: (id) => {
          if (buyUpgrade(this.save, GAME_DATA.home, id)) this.persist();
          this.show('home');
        },
        onUnlock: (tower: TowerKind) => {
          if (unlockTower(this.save, GAME_DATA.home, tower)) this.persist();
          this.show('home');
        },
        onRefund: () => this.confirmRefund(),
        onStages: () => this.show('stages'),
      });
      return;
    }
    this.menus.showStages(
      this.save,
      SELECTABLE_STAGES,
      GAME_DATA,
      {
        onFriend: (kind) => {
          this.save.friend = kind;
          this.persist();
          this.show('stages');
        },
        onPick: (stage) => {
          this.persist();
          this.scene.start('Battle', { stageId: stage.id, difficulty: this.save.difficulty });
        },
        onDifficulty: (d) => {
          this.save.difficulty = d;
          this.persist();
          this.show('stages');
        },
        onBack: () => this.show('home'),
      },
    );
  }

  private confirmNewGame(): void {
    this.overlay.showResult({
      title: TEXT.newGameConfirm,
      stars: 0,
      lines: [TEXT.newGameLead],
      buttons: [
        {
          label: TEXT.yes,
          onTap: () => {
            this.store.clear();
            this.save = newSave();
            this.show('home');
          },
        },
        { label: TEXT.no, secondary: true, onTap: () => this.show('title') },
      ],
    });
  }

  private confirmRefund(): void {
    this.overlay.showResult({
      title: TEXT.refundConfirm,
      stars: 0,
      lines: [TEXT.refundLead],
      buttons: [
        {
          label: TEXT.yes,
          onTap: () => {
            refundAll(this.save, GAME_DATA.home);
            this.persist();
            this.show('home');
          },
        },
        { label: TEXT.no, secondary: true, onTap: () => this.show('home') },
      ],
    });
  }
}
