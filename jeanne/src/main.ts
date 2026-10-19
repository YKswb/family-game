import Phaser from 'phaser';
import { BattleScene } from './scenes/Battle';
import { BootScene } from './scenes/Boot';
import { DPR, VIEW_H, VIEW_W } from './ui/Display';

// 基準解像度は iPad Air 第4世代の横向き（約1.44:1）。ほかの比率は余白で吸収する。
// Retina でぼやけないよう、内部の画素数は DPR 倍にしてカメラで拡大する
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b2340',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW_W * DPR,
    height: VIEW_H * DPR,
  },
  input: { activePointers: 3 },
  scene: [BootScene, BattleScene],
});
