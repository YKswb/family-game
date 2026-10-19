import Phaser from 'phaser';

/** 起動直後のシーン。今は戦場へそのまま進む（タイトル画面はあとのマイルストーンで足す） */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Battle');
  }
}
