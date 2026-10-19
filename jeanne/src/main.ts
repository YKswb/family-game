import Phaser from 'phaser';
import { BootScene } from './scenes/Boot';

// 基準解像度は iPad Air 第4世代の横向き（約1.44:1）。ほかの比率は余白で吸収する
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b2340',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1180,
    height: 820,
  },
  scene: [BootScene],
});
