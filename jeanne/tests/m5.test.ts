import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/data/stageData';
import { DIFFICULTY, newProgress } from '../src/systems/Progress';
import { stageConfig } from '../src/systems/Stage';
import { Terrain } from '../src/systems/Terrain';
import { World, type SquadSpec } from '../src/systems/World';
import { runStageBot } from './bot';

const DT = 1 / 60;

/** 横いっぱいの壁（y 500〜540）の真ん中に門（x 950〜1050） */
const WALL = { x: 0, y: 500, w: 2000, h: 40 };
const GATE = { x: 950, y: 490, w: 100, h: 60 };

describe('門', () => {
  it('閉じているあいだは通れず、向こうへは行けない。開くと門を通って行ける', () => {
    const t = new Terrain([WALL], [], [{ id: 'g', rect: GATE, open: false }]);
    expect(t.isBlocked(1000, 520)).toBe(true);
    expect(t.canReach(400, 900, 400, 200)).toBe(false);
    expect(t.openGate('g')).toBe(true);
    expect(t.isBlocked(1000, 520)).toBe(false);
    expect(t.canReach(400, 900, 400, 200)).toBe(true);
    // 門の手前 → 門の向こう の順に目指す
    expect(t.waypoint(400, 900, 400, 200)).toEqual({ x: 1000, y: GATE.y + GATE.h });
    expect(t.waypoint(1000, GATE.y + GATE.h - 10, 400, 200)).toEqual({ x: 1000, y: GATE.y });
  });

  it('くっついている川と壁は、ひとつながりとして門を通る', () => {
    // 左は川、右は壁。門は壁にある
    const river = { x: 0, y: 500, w: 800, h: 40 };
    const wall = { x: 800, y: 500, w: 1200, h: 40 };
    const t = new Terrain([river, wall], [], [{ id: 'g', rect: GATE, open: true }]);
    expect(t.waypoint(300, 900, 300, 200)).toEqual({ x: 1000, y: GATE.y + GATE.h });
  });

  it('閉じた門の向こうの敵は、近接の兵士は狙わない（門が開けば狙う）', () => {
    const w = new World({
      width: 2000,
      height: 1200,
      hero: { x: 200, y: 1100 },
      blockers: [WALL],
      gates: [{ id: 'g', rect: GATE, open: false }],
      squads: [
        { side: 'ally', kind: 'sword', count: 5, x: 1000, y: 650, mode: 'hold' },
        { side: 'enemy', kind: 'sword', count: 5, x: 1000, y: 380, mode: 'hold' },
      ],
    });
    const ally = w.squads[0].units[0];
    w.grid.rebuild(w.aliveUnits());
    expect(w.nearestFoe('ally', ally.x, ally.y, 400, ally)).toBeNull();
    w.openGate('g');
    expect(w.events).toContainEqual({ type: 'gateOpened', id: 'g' });
    expect(w.nearestFoe('ally', ally.x, ally.y, 400, ally)).not.toBeNull();
  });
});

describe('隊長と味方NPC', () => {
  const field = (squads: SquadSpec[]) => new World({ width: 2000, height: 2000, hero: { x: 100, y: 100 }, squads });

  it('隊長は部隊にひとり加わる。人数（引き継ぎ）には数えない。倒すと経験値5', () => {
    const w = field([
      { side: 'enemy', kind: 'sword', count: 4, x: 1000, y: 1000, mode: 'hold', leader: { name: 'まちぶせの隊長' } },
      { side: 'ally', kind: 'cavalry', count: 4, x: 500, y: 500, mode: 'follow', leader: { name: 'ラ・イール' } },
    ]);
    const [enemy, ally] = w.squads;
    expect(enemy.units.filter((u) => u.kind === 'captain')).toHaveLength(1);
    expect(enemy.leaderName).toBe('まちぶせの隊長');
    expect(enemy.composition()).toEqual([{ kind: 'sword', n: 4 }]);
    expect(w.carriedSquadsOut()).toEqual([{ kind: 'cavalry', composition: [{ kind: 'cavalry', n: 4 }] }]);
    // 騎馬の部隊の隊長は、置いていかれないよう騎馬と同じ速さ
    const cap = ally.units.find((u) => u.kind === 'captain')!;
    expect(cap.speed).toBeGreaterThanOrEqual(w.data.kinds.cavalry.speed);
    const foe = enemy.units.find((u) => u.kind === 'captain')!;
    foe.hp = 0.1;
    w.strike(w.hero, foe);
    expect(w.xpGained).toBe(5);
  });

  it('味方NPCはルートを進み、出会った敵と戦い、倒したらまた進む。ジャンが触れても仲間にならない', () => {
    const w = field([
      { side: 'ally', kind: 'sword', count: 10, x: 300, y: 1000, mode: 'hold', route: [[300, 1000], [1500, 1000]], speed: 80, leader: { name: 'ジル・ド・レ' } },
      { side: 'enemy', kind: 'spear', count: 5, x: 1100, y: 1000, mode: 'hold' },
    ]);
    const [npc, foe] = w.squads;
    w.hero.x = npc.center().x;
    w.hero.y = npc.center().y + 20;
    for (let t = 0; t < 40 && foe.aliveCount > 0; t += DT) w.step(DT);
    expect(npc.mode).toBe('hold');
    expect(foe.aliveCount).toBe(0);
    for (let t = 0; t < 15; t += DT) w.step(DT);
    expect(npc.postX).toBeGreaterThan(1300);
  });
});

describe('敵の撤退', () => {
  const make = (retreat: boolean) =>
    new World({
      width: 2000,
      height: 2000,
      hero: { x: 100, y: 1900 },
      enemyRetreat: retreat,
      general: { id: 'boss', name: '大将', x: 1500, y: 300, hp: 100, attack: 4, guards: [] },
      squads: [{ side: 'enemy', kind: 'sword', count: 10, x: 600, y: 1200, mode: 'hold', id: 'foe' }],
    });

  it('3割まで減ると、戦いをやめて大将のそばへ下がる（撤退のないステージでは下がらない）', () => {
    for (const retreat of [true, false]) {
      const w = make(retreat);
      const sq = w.squadById('foe')!;
      for (const u of sq.units.slice(3)) u.dead = true;
      for (let t = 0; t < 20; t += DT) w.step(DT);
      const c = sq.center();
      const d = Math.hypot(c.x - 1500, c.y - 300);
      if (retreat) {
        expect(sq.retreated).toBe(true);
        expect(d).toBeLessThan(250);
      } else {
        expect(sq.retreating || sq.retreated).toBe(false);
        expect(d).toBeGreaterThan(800);
      }
    }
  });

  it('下がる先へ行けない（門が閉じている）ときは下がらない', () => {
    const w = new World({
      width: 2000,
      height: 1200,
      hero: { x: 100, y: 1100 },
      enemyRetreat: true,
      blockers: [WALL],
      gates: [{ id: 'g', rect: GATE, open: false }],
      general: { id: 'boss', name: '大将', x: 1000, y: 200, hp: 100, attack: 4, guards: [] },
      squads: [{ side: 'enemy', kind: 'sword', count: 10, x: 600, y: 900, mode: 'hold', id: 'foe' }],
    });
    const sq = w.squadById('foe')!;
    for (const u of sq.units.slice(3)) u.dead = true;
    for (let t = 0; t < 5; t += DT) w.step(DT);
    expect(sq.retreating).toBe(false);
  });
});

describe('ジャンヌの離脱と再登場、目的地', () => {
  it('はなれているあいだは狙われず、負けにならない。もどると HP 満タンで、味方が奮い立つ', () => {
    const w = new World({ ...stageConfig(STAGES.stage3.stage, 1) });
    const j = w.jeanne!;
    w.jeanneLeave();
    expect(w.isTargetable(j)).toBe(false);
    j.hp = 1;
    w.step(DT);
    expect(w.outcome).toBe('playing');
    w.jeanneReturn();
    expect(j.hp).toBe(j.maxHp);
    expect(w.isTargetable(j)).toBe(true);
    // 奮い立つと味方の攻撃が上がる（ジャンヌのまわりの分は外して比べる）
    const ally = w.squadById('gilles')!.units.find((u) => u.kind === 'sword')!;
    const foe = w.squadById('augSword')!.units[0];
    j.x = 3500;
    j.y = 2700;
    const hp = foe.hp;
    w.strike(ally, foe);
    const normal = hp - foe.hp;
    foe.hp = hp;
    w.rally(10, 0.3);
    w.strike(ally, foe);
    expect((hp - foe.hp) / normal).toBeCloseTo(1.3, 5);
  });

  it('ステージ3：門の前の部隊を倒すと門が開き、しばらくしてジャンヌが矢を受けて下がり、やがて戻る', () => {
    const w = new World({ ...stageConfig(STAGES.stage3.stage, 1) });
    const keys: string[] = [];
    for (const id of ['gateSword', 'gateSpear']) for (const u of w.squadById(id)!.units) u.dead = true;
    for (let t = 0; t < 50; t += DT) {
      w.step(DT);
      for (const e of w.events) if (e.type === 'dialog') keys.push(e.key);
      if (t > 1) expect(w.terrain.hasClosedGate).toBe(false);
      if (t > 14 && t < 40) expect(w.jeanne!.absent).toBe(true);
    }
    expect(keys).toEqual(['start', 'gate', 'arrow', 'back']);
    expect(w.jeanne!.absent).toBe(false);
    expect(w.rallyTime).toBeGreaterThan(0);
  });

  it('ステージ2：ジャンヌが目的地に入るとクリア（ジャンだけでは クリアにならない）', () => {
    const st = STAGES.stage2.stage;
    const w = new World({ ...stageConfig(st, 1) });
    const g = st.goal!;
    w.hero.x = g.x + g.w / 2;
    w.hero.y = g.y + g.h / 2;
    w.jeanne!.x = 300;
    w.step(DT);
    expect(w.outcome).toBe('playing');
    w.jeanne!.x = w.hero.x;
    w.jeanne!.y = w.hero.y;
    w.step(DT);
    expect(w.outcome).toBe('won');
  });
});

// 自動プレイは GitHub Actions のマシンでは手元より数倍遅いので、制限時間を長めにする
describe('ステージ2・3の自動プレイ（ふつう）', { timeout: 60000 }, () => {
  it.each([
    ['stage2', 1, ['start', 'pincer', 'castle', 'clear']],
    ['stage2', 2, ['start', 'pincer', 'castle', 'clear']],
    ['stage3', 1, ['start', 'gate', 'general', 'arrow', 'back', 'clear']],
  ] as const)('%s を最後まで通せる（seed %i）', (id, seed, dialogs) => {
    const st = STAGES[id].stage;
    // ひとつ前までのステージをクリアしたくらいの強さ
    const progress = { ...newProgress(), level: id === 'stage3' ? 4 : 3 };
    const w = new World({ ...stageConfig(st, seed), difficulty: DIFFICULTY.normal, progress });
    const s = runStageBot(w, 900, DT, st.goal);
    expect(s.broken).toBeNull();
    expect(w.outcome).toBe('won');
    expect(s.dialogs).toEqual(dialogs);
    expect(s.seconds).toBeLessThan(600);
  });
});
