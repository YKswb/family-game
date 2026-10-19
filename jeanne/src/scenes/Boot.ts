import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'ジャンヌの騎士\nじゅんび中', {
        fontFamily: '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", sans-serif',
        fontSize: '64px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 16,
      })
      .setOrigin(0.5);
  }
}
