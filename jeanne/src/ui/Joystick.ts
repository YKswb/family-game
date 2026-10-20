import Phaser from 'phaser';
import { DPR } from './Display';

/** スティックの土台の半径。指がこれより離れると土台が付いてくる */
const BASE_R = 60;
/** この距離で入力が最大になる（小さいほど、少し指を動かすだけで全速になる） */
const FULL_R = 34;
const DEAD_R = 4;

/**
 * 画面をなぞる仮想スティック。指を置いた位置が原点になり、指に追従する。
 * ボタンの上で押されたときは反応しない
 */
export class Joystick {
  readonly gfx: Phaser.GameObjects.Graphics;
  private pointerId: number | null = null;
  private ox = 0;
  private oy = 0;
  private cx = 0;
  private cy = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(1000);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** 長さ0〜1の入力ベクトル */
  get vector(): { x: number; y: number } {
    if (!this.active) return { x: 0, y: 0 };
    const dx = this.cx - this.ox;
    const dy = this.cy - this.oy;
    const l = Math.hypot(dx, dy);
    if (l < DEAD_R) return { x: 0, y: 0 };
    const k = Math.min(1, l / FULL_R);
    return { x: (dx / l) * k, y: (dy / l) * k };
  }

  release(): void {
    this.pointerId = null;
  }

  draw(): void {
    const g = this.gfx;
    g.clear();
    if (!this.active) return;
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(this.ox, this.oy, 52);
    const dx = this.cx - this.ox;
    const dy = this.cy - this.oy;
    const l = Math.hypot(dx, dy) || 1;
    const m = Math.min(l, FULL_R);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(this.ox + (dx / l) * m, this.oy + (dy / l) * m, 24);
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.active || over.length > 0) return;
    this.pointerId = p.id;
    this.ox = this.cx = p.x / DPR;
    this.oy = this.cy = p.y / DPR;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.cx = p.x / DPR;
    this.cy = p.y / DPR;
    const dx = this.cx - this.ox;
    const dy = this.cy - this.oy;
    const l = Math.hypot(dx, dy);
    if (l > BASE_R) {
      this.ox = this.cx - (dx / l) * BASE_R;
      this.oy = this.cy - (dy / l) * BASE_R;
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.pointerId) this.pointerId = null;
  }
}
