import type Phaser from 'phaser';
import textData from '../data/text.json';

/**
 * Retina でぼやけないよう、内部では端末の画素密度（最大2）で描く。
 * パソコンで iPad と同じ倍率を試せるよう、URL の ?dpr=2 で上書きできる
 */
export const DPR = (() => {
  if (typeof window === 'undefined') return 1;
  const forced = Number(new URLSearchParams(window.location.search).get('dpr'));
  const raw = forced > 0 ? forced : window.devicePixelRatio || 1;
  return Math.min(2, Math.max(1, raw));
})();

/** 画面（CSS ピクセル）の大きさ。縦横どちらでも画面いっぱいに描く */
export function screenSize(): { w: number; h: number } {
  return { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
}

/** 戦場の拡大率。画面の短い辺に 580 の幅が収まるように（今の版と同じ見え方） */
export function worldZoom(w: number, h: number): number {
  return Math.min(w, h) / 580;
}

/** 画面の文字やボタンの拡大率。小さい画面でも文字が小さくなりすぎないように */
export function uiScale(w: number, h: number): number {
  return Math.max(1, Math.min(1.6, Math.min(w, h) / 420));
}

/** セーフエリア（ノッチやホームバーを避ける余白）。index.html の #safe の padding から読む */
export function safeArea(): { top: number; right: number; bottom: number; left: number } {
  const el = document.getElementById('safe');
  if (!el) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(el);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

export const FONT = '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Hiragino Sans", sans-serif';

export const TEXT = textData as Record<keyof typeof textData, string>;

/** "ウェーブ {n} / {max}" のような文の差し込み */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function textStyle(size: number, color = '#ffffff', stroke = true): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
    stroke: stroke ? '#231a0a' : undefined,
    strokeThickness: stroke ? Math.round(size * 0.28) : 0,
    resolution: DPR,
  };
}

/** "#78c35f" → 0x78c35f */
export function hex(s: string): number {
  return parseInt(s.replace('#', ''), 16);
}
