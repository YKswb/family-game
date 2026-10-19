import buildingsJson from './buildings.json';
import playerJson from './player.json';
import stage1Json from './stages/stage1.json';
import treesJson from './trees.json';

export type BuildingType = 'axe' | 'bag';

export interface PlayerData {
  speed: number;
  radius: number;
  baseCapacity: number;
  /** 木を切れる距離（木の中心から） */
  chopRange: number;
  /** おののレベル（0〜3）ごとの、1回切る間隔（秒） */
  chopIntervals: number[];
  /** おうちの円からこれだけ離れて止まる */
  houseClearance: number;
  /** 領地の縁からこれだけ内側までしか歩けない */
  territoryMargin: number;
}

export interface TreeData {
  hp: number;
  radius: number;
  woodPerChop: number;
  /** 切り倒したときに追加でもらえる木材 */
  woodOnFell: number;
  regrowSeconds: number;
  /** 主人公がこれより近くにいると、生え戻らずに待つ */
  regrowClearance: number;
  /** 領地の縁からこれだけ外の木までは切れる */
  choppableMargin: number;
}

export interface BuildingKind {
  /** レベルごとに必要な木材。長さが最大レベル */
  costs: number[];
  capacityPerLevel?: number;
}

export interface BuildingData {
  /** 建設地点の中心からこの距離に入ると払い始める */
  spotRange: number;
  payFirstDelay: number;
  payInterval: number;
  kinds: Record<BuildingType, BuildingKind>;
}

export interface StageTheme {
  background: string;
  ground: string;
  tuft: string[];
  flower: string[];
  leaf: string[];
  clearing: string;
  fog: string;
}

export interface StageData {
  name: string;
  theme: StageTheme;
  width: number;
  height: number;
  house: { x: number; y: number; r: number };
  player: { x: number; y: number };
  /** 領地の半径（広げるごとに次の段階へ） */
  territory: number[];
  trees: {
    count: number;
    minFromHouse: number;
    spacing: number;
    margin: number;
    /** 将来の建設地点のために木を生やさない場所（おうちからの相対位置） */
    keepClear: [number, number][];
    keepClearRadius: number;
  };
  /** 建設地点（おうちからの相対位置） */
  spots: { type: BuildingType; dx: number; dy: number }[];
}

export interface GameData {
  player: PlayerData;
  trees: TreeData;
  buildings: BuildingData;
}

export const GAME_DATA: GameData = {
  player: playerJson,
  trees: treesJson,
  buildings: buildingsJson as BuildingData,
};

export const STAGES: StageData[] = [stage1Json as StageData];
