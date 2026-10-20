import stage1 from './stages/stage1.json';
import stage2 from './stages/stage2.json';
import stage3 from './stages/stage3.json';
import story1 from './story/stage1.json';
import story2 from './story/stage2.json';
import story3 from './story/stage3.json';
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
  /** 隊長（ラ・イールなど）。部隊にひとり加わり、名札に名前が出る。HP と攻撃を省略すると units.json の隊長の値 */
  leader?: { name: string; hp?: number; attack?: number };
}

/** 門。閉じているあいだは壁と同じで通れない（イベントの openGate で開く） */
export interface StageGate extends Rect {
  id?: string;
  closed?: boolean;
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
  /** ジャンヌがこの四角の中にいる（戦場にいるときだけ） */
  jeanneIn?: Rect;
  /** ほかのイベントが起きてから、これだけ秒数がたった */
  after?: { event: string; seconds: number };
}

export interface EventAction {
  /** 会話（story の dialogs のキー） */
  dialog?: string;
  /** 援軍・伏兵を出す */
  spawn?: StageSquad[];
  /** ステージクリア */
  victory?: boolean;
  /** 門を開く（門の id） */
  openGate?: string;
  /** 画面のまんなかに案内を出す */
  banner?: string;
  /** ジャンヌが戦場をはなれる／もどってくる */
  jeanne?: 'leave' | 'return';
  /** 味方が奮い立つ：しばらくのあいだ味方全員の攻撃が上がる */
  rally?: { seconds: number; bonus: number };
  /** 部隊に新しい進軍ルートを与える（門が開いたら砦へ進む、など） */
  march?: { squad: string; route: Point[] }[];
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
    gates: StageGate[];
    /** 森（通れない円） */
    forests: { x: number; y: number; r: number }[];
    /** 道（見た目だけ） */
    roads: Point[][];
    /** 家（見た目だけ） */
    houses: { x: number; y: number }[];
    /** 陣のテント（見た目だけ） */
    tents: { x: number; y: number }[];
    /** 城（見た目だけ。通れないようにするときは walls に四角を置く） */
    castles?: { x: number; y: number }[];
  };
  start: {
    hero: { x: number; y: number; dir: Point };
    jeanne?: { x: number; y: number } | null;
  };
  squads: StageSquad[];
  general?: StageGeneral;
  events: StageEvent[];
  /** 敵の部隊が、人数が減ると大将の方へ下がる */
  enemyRetreat?: boolean;
  /** ステージの目的（HUD に出す。大将のいないステージ向け） */
  objective?: string;
  /** 目的地（地面に印を出し、ミニマップに星を出す） */
  goal?: Rect;
}

export interface StoryData {
  speakers: Record<string, { name: string; face: string }>;
  /** 会話：[話す人, 文] の並び。1回の会話は3行まで */
  dialogs: Record<string, [string, string][]>;
}

export const STAGES: Record<string, { stage: StageData; story: StoryData }> = {
  stage1: { stage: stage1 as unknown as StageData, story: story1 as unknown as StoryData },
  stage2: { stage: stage2 as unknown as StageData, story: story2 as unknown as StoryData },
  stage3: { stage: stage3 as unknown as StageData, story: story3 as unknown as StoryData },
};
