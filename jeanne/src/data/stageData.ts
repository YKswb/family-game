import stage1 from './stages/stage1.json';
import story1 from './story/stage1.json';
import type { SoldierKind } from './unitData';

/** 左上の座標と幅・高さ */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Point = [number, number];

export interface StageSquad {
  /** イベントや大将の護衛から参照する名前 */
  id: string;
  side: 'ally' | 'enemy';
  /** neutral：旗の立った味方部隊（仲間にできる） hold：持ち場を守る */
  mode: 'neutral' | 'hold';
  kind: SoldierKind;
  count: number;
  x: number;
  y: number;
  dir?: Point;
  /** 巡回ルート（くり返し回る） */
  patrol?: Point[];
  /** 進軍ルート（1回たどって最後の地点を守る） */
  route?: Point[];
  /** 巡回・進軍の速さ */
  speed?: number;
  /** 索敵範囲（省略時は units.json の値） */
  alertRadius?: number;
  /** 最初から警戒している（援軍・伏兵） */
  alert?: boolean;
}

export interface StageGeneral {
  id: string;
  name: string;
  x: number;
  y: number;
  dir?: Point;
  hp: number;
  attack: number;
  /** この部隊がすべて全滅するまで大将は無敵 */
  guards: string[];
}

/** イベントの条件。書いた条件がすべてそろったときに1回だけ起きる */
export interface EventCondition {
  /** 経過時間（秒）がこれ以上 */
  time?: number;
  /** ジャンがこの四角の中にいる */
  heroIn?: Rect;
  /** 大将が敵に気づいた */
  generalAlert?: boolean;
  /** 大将が倒れた */
  generalDead?: boolean;
  /** これらの部隊がすべて全滅した */
  squadsWiped?: string[];
}

export interface EventAction {
  /** 会話（story の dialogs のキー） */
  dialog?: string;
  /** 援軍・伏兵を出す */
  spawn?: StageSquad[];
  /** ステージクリア */
  victory?: boolean;
}

export interface StageEvent {
  id: string;
  when: EventCondition;
  do: EventAction[];
}

export interface StageData {
  id: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  groundColor: string;
  terrain: {
    /** 通れない四角（川） */
    rivers: Rect[];
    /** 通れない四角（壁） */
    walls: Rect[];
    /** 川の上を通れる四角（橋） */
    bridges: Rect[];
    /** 壁の中を通れる四角（門） */
    gates: Rect[];
    /** 森（通れない円） */
    forests: { x: number; y: number; r: number }[];
    /** 道（見た目だけ） */
    roads: Point[][];
    /** 家（見た目だけ） */
    houses: { x: number; y: number }[];
    /** 陣のテント（見た目だけ） */
    tents: { x: number; y: number }[];
  };
  start: {
    hero: { x: number; y: number; dir: Point };
    jeanne?: { x: number; y: number } | null;
  };
  squads: StageSquad[];
  general?: StageGeneral;
  events: StageEvent[];
}

export interface StoryData {
  speakers: Record<string, { name: string; face: string }>;
  /** 会話：[話す人, 文] の並び。1回の会話は3行まで */
  dialogs: Record<string, [string, string][]>;
}

export const STAGES: Record<string, { stage: StageData; story: StoryData }> = {
  stage1: { stage: stage1 as unknown as StageData, story: story1 as unknown as StoryData },
};
