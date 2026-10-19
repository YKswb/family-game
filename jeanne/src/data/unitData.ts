import raw from './units.json';

/** 三すくみに入る兵種と弓兵（仲間や敵の部隊になる兵種） */
export type SoldierKind = 'sword' | 'spear' | 'cavalry' | 'archer';
export type UnitKind = SoldierKind | 'hero' | 'general' | 'jeanne';

export type FormationRow = 'front' | 'middle' | 'back';

export const SOLDIER_KINDS: readonly SoldierKind[] = ['sword', 'spear', 'cavalry', 'archer'];

export interface UnitStats {
  name: string;
  short: string;
  hp: number;
  attack: number;
  /** 攻撃間隔（秒） */
  interval: number;
  /** 近接の間合い（体の半径どうしの外側に足す距離） */
  reach: number;
  /** 遠距離攻撃の射程。0 または未指定なら近接 */
  range?: number;
  /** 敵との間に保ちたい距離（弓兵） */
  keep?: number;
  speed: number;
  radius: number;
  /** この兵種に対しては、間合いに入った瞬間に先に一撃入れる */
  firstStrikeVs?: UnitKind[];
  /** この兵種の攻撃を受けた相手は突撃の構えが解ける */
  stopsCharge?: boolean;
  /** 移動中に最初に当てた一撃の倍率 */
  chargeMultiplier?: number;
  regenDelay?: number;
  regenPerSecond?: number;
  auraRadius?: number;
  auraBonus?: number;
}

export interface Vulnerability {
  defender: UnitKind;
  attackers: UnitKind[];
  multiplier: number;
}

export interface UnitData {
  kinds: Record<UnitKind, UnitStats>;
  matchups: {
    advantage: number;
    disadvantage: number;
    /** キーの兵種は値の兵種に強い */
    beats: Partial<Record<UnitKind, UnitKind>>;
  };
  vulnerabilities: Vulnerability[];
  charge: { minMoveSeconds: number };
  combat: {
    knockback: number;
    knockbackHeavy: number;
    arrowSpeed: number;
    arrowLife: number;
  };
  ai: {
    retargetInterval: number;
    gridCell: number;
    gatherEngageRadius: number;
    chargeSightRadius: number;
    allyLeashExtra: number;
    enemyAlertRadius: number;
    enemyEngageRadius: number;
    enemyChaseRadius: number;
    heroTargetPenalty: number;
    /** 今の相手よりこれだけ近い相手がいれば狙いを乗り換える */
    retargetSwitchMargin: number;
    /** 1人の相手に同時に斬りかかれる近接の人数 */
    maxAttackersOnHero: number;
    maxAttackersOnSoldier: number;
    formationSpacing: number;
    formationColumns: number;
    /** ジャンの隊列。兵種ごとの列と、列の中の位置（[横, 後ろ]。後ろがマイナスならジャンより前） */
    formation: {
      rowOf: Record<SoldierKind, FormationRow>;
      slots: Record<FormationRow, [number, number][]>;
    };
    slotSpeedMultiplier: number;
    catchUpMaxMultiplier: number;
    catchUpDistance: number;
    returnSpeedMultiplier: number;
    /** 弓兵が近づかれて後ずさりするときの速さ */
    retreatSpeedMultiplier: number;
  };
}

export const UNIT_DATA = raw as UnitData;
