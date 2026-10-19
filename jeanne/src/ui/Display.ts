import type Phaser from 'phaser';
import textData from '../data/text.json';

/** 画面の論理サイズ（iPad Air 第4世代の横向き、約1.44:1） */
export const VIEW_W = 1180;
export const VIEW_H = 820;

/** 戦場の拡大率。試作版と同じくらいの大きさに兵士が見えるように */
export const WORLD_ZOOM = 1.25;

/** Retina でぼやけないよう、内部では端末の画素密度（最大2）で描く */
export const DPR = typeof window === 'undefined' ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));

export const FONT = '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Hiragino Sans", sans-serif';

export const TEXT = textData as Record<keyof typeof textData, string>;

/** "{a}は {b}に つよい" のような文の差し込み */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function textStyle(size: number, color = '#ffffff', stroke = true): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
    stroke: stroke ? '#1a140c' : undefined,
    strokeThickness: stroke ? Math.round(size * 0.22) : 0,
    resolution: DPR,
  };
}
