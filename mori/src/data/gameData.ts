import buildingsJson from './buildings.json';
import difficultyJson from './difficulty.json';
import enemiesJson from './enemies.json';
import playerJson from './player.json';
import stage1Json from './stages/stage1.json';
import towersJson from './towers.json';
import treesJson from './trees.json';
import upgradesJson from './upgrades.json';

export type BuildingType = 'axe' | 'bag' | 'tower' | 'wall' | 'land';
export type TowerKind = 'arrow' | 'cannon' | 'ice';
export type EnemyKind = 'slime' | 'mini' | 'goblin' | 'bat' | 'wolf' | 'knight' | 'splitter' | 'boss' | 'maou';

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
  /** 敵の縁からこの距離に入ると斬る */
  attackRange: number;
  attackInterval: number;
  attackDamage: number;
  /** おのがこのレベル以上で、攻撃に axeBonusDamage を足す */
  axeBonusLevel: number;
  axeBonusDamage: number;
  /** かいてん ぎりが届く距離 */
  areaRange: number;
  /** 落ちた木材を吸い寄せる距離（じしゃくで伸びる） */
  magnetRange: number;
  pickupRange: number;
  /** 落ちた木材が拾えるようになるまでの秒数 */
  dropDelay: number;
  /** 落ちた木材が消えるまでの秒数 */
  dropLife: number;
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
  /** かべのレベル（1から）ごとの HP */
  hp?: number[];
}

export interface BuildingData {
  /** 建設地点の中心からこの距離に入ると払い始める */
  spotRange: number;
  payFirstDelay: number;
  payInterval: number;
  kinds: Record<BuildingType, BuildingKind>;
  /** おうちを囲むかべの輪 */
  wall: { radius: number; sectors: number; postsPerSector: number; thickness: number };
}

export interface EnemyStats {
  name: string;
  hp: number;
  speed: number;
  r: number;
  dmg: number;
  color: string;
  xp: number;
  /** 倒したときに落とす木材 */
  drop: number;
  fly?: boolean;
  /** たいほう以外のダメージを減らす */
  armor?: boolean;
  /** 倒すと小さいスライムに分かれる */
  split?: boolean;
  boss?: boolean;
  /** ときどきスライムを呼ぶ */
  summon?: boolean;
}

export interface EnemyData {
  common: {
    spawnDistance: number;
    spawnSpread: number;
    attackInterval: number;
    firstAttackDelay: number;
    knockback: number;
    knockbackArmor: number;
    knockbackBoss: number;
    /** ノックバックの速さが1秒でこの割合になる */
    knockbackDecay: number;
    slowFactor: number;
    summonFirst: number;
    summonInterval: number;
    summonCount: number;
    summonKind: EnemyKind;
    splitKind: EnemyKind;
    splitCount: number;
    armorReduction: number;
    speedJitter: number;
  };
  kinds: Record<EnemyKind, EnemyStats>;
}

export interface TowerStats {
  icon: string;
  name: string;
  short: string;
  desc: string;
  color: string;
  /** レベル（1〜3）ごとの値 */
  range: number[];
  interval: number[];
  damage: number[];
  /** 空の敵に当たるか */
  air: boolean;
  splash?: number[];
  slow?: number[];
}

export interface TowerData {
  muzzleHeight: number;
  shotSpeed: number;
  shotLife: number;
  shellTime: number;
  firstShotDelay: number;
  /** 氷のとうは、すでに遅くなった敵をこれだけ遠い扱いにする */
  iceAvoidSlowed: number;
  kinds: Record<TowerKind, TowerStats>;
}

export interface Difficulty {
  name: string;
  enemyHp: number;
  enemyCount: number;
  enemySpeed: number;
  houseHp: number;
  firstPrep: number;
  gap: number;
}

export type PerkStat = 'attack' | 'chop' | 'speed' | 'capacity' | 'magnet' | 'towerDamage' | 'wallHp' | 'heal' | 'area' | 'lucky';

export interface Perk {
  id: string;
  icon: string;
  name: string;
  desc: string;
  max: number;
  stat: PerkStat;
  add?: number;
  mul?: number;
  /** heal：おうちの最大 HP も増やす */
  maxAdd?: number;
}

export interface UpgradeData {
  xp: { base: number; perLevel: number; fellTree: number; callNowSecondsPerXp: number };
  perks: Perk[];
}

/** 画面に重ねる天気 */
export interface WeatherData {
  type: 'none' | 'petals' | 'leaves' | 'snow' | 'embers' | 'fireflies';
  colors: string[];
  /** iPad の横向きの画面に出す数 */
  count: number;
  size: number;
}

export interface StageTheme {
  background: string;
  ground: string;
  tuft: string[];
  flower: string[];
  /** 葉の色と、明るいところの色 */
  leaf: string[];
  clearing: string;
  fog: string;
  weather?: WeatherData;
  /** 画面全体に重ねる色（夕方や夜の雰囲気） */
  tint?: { color: string; alpha: number };
  /** 夜：おうちの窓に明かりがともる */
  night?: boolean;
  /** 雪：木やとうの屋根に雪が積もる */
  snow?: boolean;
}

export interface SpotSpec {
  type: BuildingType;
  dx: number;
  dy: number;
  /** この領地の段階になったら現れる（省略時は最初から） */
  territory?: number;
  /** 領地を広げる旗：レベルが上がるごとに移る先。先がなければ消える */
  moves?: [number, number][];
}

export interface WaveData {
  count: number;
  base: number;
  grow: number;
  minCount: number;
  /** from：このウェーブから出る */
  pool: { kind: EnemyKind; weight: number; from: number }[];
  /** 最後のウェーブに出る大将 */
  boss: EnemyKind | null;
  /** from のウェーブから count 方向に分かれて来る */
  directions: { from: number; count: number }[];
  hpGrowth: number;
  stageHpBonus: number;
  bossHpBonus: number;
  spawnInterval: { start: number; perWave: number; stageBonus: number; min: number };
}

export interface StageData {
  name: string;
  /** 最初の準備時間に出すヒント */
  tip: string;
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
  /** 建設地点（おうちからの相対位置）。かべは buildings.wall から自動で作る */
  spots: SpotSpec[];
  waves: WaveData;
}

export interface GameData {
  player: PlayerData;
  trees: TreeData;
  buildings: BuildingData;
  enemies: EnemyData;
  towers: TowerData;
  difficulty: Difficulty[];
  upgrades: UpgradeData;
}

export const GAME_DATA: GameData = {
  player: playerJson,
  trees: treesJson,
  buildings: buildingsJson as BuildingData,
  enemies: enemiesJson as EnemyData,
  towers: towersJson as TowerData,
  difficulty: difficultyJson,
  upgrades: upgradesJson as UpgradeData,
};

// JSON の配列は TypeScript では組（[number, number]）と見なされないので、unknown を経由する
export const STAGES: StageData[] = [stage1Json as unknown as StageData];
