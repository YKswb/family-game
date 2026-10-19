import type Phaser from 'phaser';

/**
 * 同じ画像をたくさん出し入れするための入れ物（落ちた木材、飛ぶ木材、天気の粒など）。
 * 毎フレーム begin() → next() を必要な数だけ → end() と呼ぶと、使わなかった分は隠れる
 */
export class ImagePool {
  private readonly items: Phaser.GameObjects.Image[] = [];
  private used = 0;

  constructor(private readonly make: () => Phaser.GameObjects.Image) {}

  begin(): void {
    this.used = 0;
  }

  next(): Phaser.GameObjects.Image {
    let img = this.items[this.used];
    if (!img) {
      img = this.make();
      this.items.push(img);
    }
    this.used++;
    return img.setVisible(true);
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].setVisible(false);
  }
}
