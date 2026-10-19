import Phaser from 'phaser';

/** 起動直後のシーン。タイトル画面へ進む */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Title');
  }
}
