import Phaser from 'phaser';
import { BattleScene } from './scenes/Battle';
import { BootScene } from './scenes/Boot';
import { DPR, screenSize } from './ui/Display';

// 縦横どちらでも画面いっぱいに描く。Retina でぼやけないよう、内部の画素数は DPR 倍にして
// キャンバスを 1/DPR に縮めて表示する（拡大率はシーンのカメラで合わせる）
const { w, h } = screenSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#3d7431',
  scale: {
    mode: Phaser.Scale.NONE,
    width: w * DPR,
    height: h * DPR,
    zoom: 1 / DPR,
  },
  input: { activePointers: 3 },
  scene: [BootScene, BattleScene],
});

function fit(): void {
  const s = screenSize();
  game.scale.resize(s.w * DPR, s.h * DPR);
}
window.addEventListener('resize', fit);
// iPad では回転の直後に resize が来ても大きさがまだ古いことがあるので、少し待って合わせ直す
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
