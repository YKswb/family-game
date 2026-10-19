import { describe, expect, it } from 'vitest';
import { UNIT_DATA } from '../src/data/unitData';
import { practiceConfig } from '../src/systems/Arena';
import { World, type SquadSpec } from '../src/systems/World';
import { runPracticeBot } from './bot';

const DT = 1 / 60;

/** ジャンを (tx, ty) まで歩かせる */
function walkTo(w: World, tx: number, ty: number, maxSeconds = 20): void {
  for (let t = 0; t < maxSeconds; t += DT) {
    const dx = tx - w.hero.x;
    const dy = ty - w.hero.y;
    const d = Math.hypot(dx, dy);
    if (d < 10) break;
    w.input = { x: dx / d, y: dy / d };
    w.step(DT);
  }
  w.input = { x: 0, y: 0 };
}

function wait(w: World, seconds: number): void {
  w.input = { x: 0, y: 0 };
  for (let t = 0; t < seconds; t += DT) w.step(DT);
}

const flag = (kind: SquadSpec['kind'], x: number, y: number): SquadSpec => ({ side: 'ally', mode: 'neutral', kind, count: 10, x, y });

describe('仲間化', () => {
  it('旗の部隊に触れると仲間になり、統率の数を超えた部隊はその場で待機する', () => {
    const w = new World({
      width: 3000,
      height: 1000,
      hero: { x: 100, y: 500 },
      heroDir: [1, 0],
      squads: [flag('sword', 500, 500), flag('spear', 900, 500), flag('archer', 1300, 500), flag('cavalry', 1700, 500)],
    });
    expect(w.leadership).toBe(UNIT_DATA.kinds.hero.leadership);
    for (const sq of w.squads) walkTo(w, sq.postX, sq.postY);
    expect(w.followingSquads().map((s) => s.kind)).toEqual(['sword', 'spear', 'archer']);
    const cav = w.squads[3];
    expect(cav.waiting).toBe(true);
    expect(cav.mode).toBe('hold');
    // 率いている部隊が満員なので、待機の兵士は移らない
    expect(cav.aliveCount).toBe(10);
  });

  /** 剣・槍・弓を率い、騎馬を待機させ、ジャンが騎馬隊の上に立っている状態 */
  function withWaitingCavalry(): World {
    const w = new World({
      width: 3000,
      height: 1000,
      hero: { x: 100, y: 500 },
      heroDir: [1, 0],
      squads: [flag('sword', 500, 500), flag('spear', 900, 500), flag('archer', 1300, 500), flag('cavalry', 1700, 500)],
    });
    for (const sq of w.squads) walkTo(w, sq.postX, sq.postY);
    return w;
  }
  const kill = (w: World, squadIndex: number, n: number) => {
    for (const u of w.squads[squadIndex].alive.slice(0, n)) u.dead = true;
  };

  it('兵士が減ったあとに待機の部隊に触れると、兵種を問わず減った部隊へ最初の人数まで加わる', () => {
    const w = withWaitingCavalry();
    const [sword, spear, archer, cav] = w.squads;
    kill(w, 0, 8); // 剣 2人
    kill(w, 1, 4); // 槍 6人
    wait(w, 0.1);
    // 減っている人数が多い剣の部隊から埋める
    expect(sword.composition()).toEqual([
      { kind: 'sword', n: 2 },
      { kind: 'cavalry', n: 8 },
    ]);
    expect(spear.composition()).toEqual([
      { kind: 'spear', n: 6 },
      { kind: 'cavalry', n: 2 },
    ]);
    expect(archer.aliveCount).toBe(10);
    expect(cav.aliveCount).toBe(0);
    expect(w.followingSquads()).toHaveLength(3);
    // 移った兵士はその部隊の一員として付いてくる
    expect(sword.alive.every((u) => u.squad === sword)).toBe(true);
  });

  /** 剣・槍・waitKind 以外の兵種を率い、waitKind を待機させて、剣の部隊を2人まで減らしてから補充する */
  function mixIntoSword(waitKind: 'cavalry' | 'archer'): World {
    const third = waitKind === 'archer' ? 'cavalry' : 'archer';
    const w = new World({
      width: 3000,
      height: 1000,
      hero: { x: 100, y: 500 },
      heroDir: [1, 0],
      squads: [flag('sword', 500, 500), flag('spear', 900, 500), flag(third, 1300, 500), flag(waitKind, 1700, 500)],
    });
    for (const sq of w.squads) walkTo(w, sq.postX, sq.postY);
    kill(w, 0, 8);
    wait(w, 0.1);
    // 右へまっすぐ進み、止まって隊列を落ち着かせる
    // （ジャンが全速で走り続けているあいだは、足の遅い兵種は追いつく途中なので測らない）
    w.input = { x: 1, y: 0 };
    for (let t = 0; t < 3; t += DT) w.step(DT);
    wait(w, 2.5);
    return w;
  }
  const avgForward = (w: World, units: { x: number; y: number }[]) =>
    units.reduce((s, u) => s + (u.x - w.hero.x) * w.headX + (u.y - w.hero.y) * w.headY, 0) / units.length;

  it('補充で剣の部隊に混ざった騎馬は、剣といっしょではなく騎馬の列（ジャンの横）に並ぶ', () => {
    const w = mixIntoSword('cavalry');
    const sword = w.squads[0];
    const swords = sword.alive.filter((u) => u.kind === 'sword');
    const cavs = sword.alive.filter((u) => u.kind === 'cavalry');
    expect(swords).toHaveLength(2);
    expect(cavs).toHaveLength(8);
    // 剣はジャンの前、騎馬はジャンより少し後ろの横
    expect(avgForward(w, swords)).toBeGreaterThan(30);
    expect(avgForward(w, cavs)).toBeLessThan(0);
    const side = cavs.reduce((s, u) => s + Math.abs((u.y - w.hero.y) * w.headX - (u.x - w.hero.x) * w.headY), 0) / cavs.length;
    expect(side).toBeGreaterThan(60);
  });

  it('補充で剣の部隊に混ざった弓兵は、弓兵の列（ジャンの後ろ）に並ぶ', () => {
    const w = mixIntoSword('archer');
    const sword = w.squads[0];
    const archers = sword.alive.filter((u) => u.kind === 'archer');
    expect(archers).toHaveLength(8);
    expect(avgForward(w, archers)).toBeLessThan(-60);
  });

  it('待機の兵士が余ったら、残りはその場で待機を続ける', () => {
    const w = withWaitingCavalry();
    const [sword, , , cav] = w.squads;
    kill(w, 0, 7);
    wait(w, 0.1);
    expect(sword.aliveCount).toBe(10);
    expect(cav.aliveCount).toBe(3);
    expect(cav.waiting).toBe(true);
  });

  it('率いている部隊が全滅したあと、待機している部隊に触れると仲間に加わる', () => {
    const w = new World({
      width: 3000,
      height: 1000,
      hero: { x: 100, y: 500 },
      heroDir: [1, 0],
      squads: [flag('sword', 500, 500), flag('spear', 900, 500), flag('archer', 1300, 500), flag('cavalry', 1700, 500)],
    });
    for (const sq of w.squads) walkTo(w, sq.postX, sq.postY);
    for (const u of w.squads[0].units) u.dead = true;
    const cav = w.squads[3];
    walkTo(w, 1300, 500);
    walkTo(w, cav.center().x, cav.center().y);
    expect(cav.mode).toBe('follow');
    expect(cav.waiting).toBe(false);
    expect(w.followingSquads()).toHaveLength(3);
  });

  it('旗の部隊は戦わず、敵にも狙われない', () => {
    const w = new World({
      width: 2000,
      height: 1000,
      hero: { x: 100, y: 100 },
      squads: [flag('sword', 900, 500), { side: 'enemy', mode: 'hold', kind: 'sword', count: 10, x: 1050, y: 500, dir: [-1, 0] }],
    });
    wait(w, 5);
    expect(w.squads[0].aliveCount).toBe(10);
    expect(w.squads[1].alert).toBe(false);
  });
});

describe('命令', () => {
  /** 率いる剣士隊の 400 先に、持ち場を守る敵の剣士隊を置く（ジャンからは遠いので敵は気づかない） */
  function setup(): World {
    return new World({
      width: 2000,
      height: 1000,
      hero: { x: 500, y: 500 },
      heroDir: [1, 0],
      squads: [
        { side: 'ally', mode: 'follow', kind: 'sword', count: 10, x: 500, y: 500 },
        { side: 'enemy', mode: 'hold', kind: 'sword', count: 10, x: 900, y: 500, dir: [-1, 0] },
      ],
    });
  }
  const engaged = (w: World) => w.squads[0].units.filter((u) => !u.dead && u.target).length;

  it('「しゅうごう」では離れた敵に向かわず、「とつげき」では見つけ次第向かう', () => {
    const gather = setup();
    wait(gather, 1.5);
    expect(gather.order).toBe('gather');
    expect(engaged(gather)).toBe(0);

    const charge = setup();
    charge.toggleOrder();
    expect(charge.order).toBe('charge');
    wait(charge, 1.5);
    expect(engaged(charge)).toBeGreaterThan(5);
  });

  it('集合の笛で全部隊が戦いをやめてジャンのもとへ戻り、命令は「しゅうごう」になる', () => {
    const w = setup();
    w.toggleOrder();
    wait(w, 3);
    const sq = w.squads[0];
    const avgSlotDist = () => {
      const a = sq.alive;
      return a.reduce((s, u) => s + Math.hypot(u.x - u.slotX, u.y - u.slotY), 0) / a.length;
    };
    const before = avgSlotDist();
    expect(before).toBeGreaterThan(60);
    w.whistle();
    expect(w.order).toBe('gather');
    // 笛が鳴っているあいだは誰も戦わない
    for (let t = 0; t < UNIT_DATA.ai.whistleSeconds - DT; t += DT) {
      w.step(DT);
      expect(engaged(w)).toBe(0);
    }
    expect(avgSlotDist()).toBeLessThan(before * 0.5);
  });
});

describe('隊列の向き', () => {
  it('ジャンが真後ろへ引き返すと、隊列の向きも1秒以内に反対を向く', () => {
    const w = new World({ width: 2000, height: 1000, hero: { x: 1000, y: 500 }, heroDir: [1, 0], squads: [] });
    w.input = { x: -1, y: 0 };
    for (let t = 0; t < 1; t += DT) w.step(DT);
    expect(w.headX).toBeLessThan(-0.99);
  });
});

describe('部隊の練習場の自動プレイ', { timeout: 30000 }, () => {
  it.each([1, 2, 3])('旗の部隊を集めて敵を全滅させられ、まっすぐ進むあいだ弓兵はジャンより前に出ない（seed %i）', (seed) => {
    const w = new World(practiceConfig(seed));
    const s = runPracticeBot(w);
    expect(s.broken).toBeNull();
    expect(w.outcome).toBe('won');
    expect(s.recruited).toBe(5);
    expect(w.squads.filter((q) => q.waiting)).toHaveLength(5 - w.leadership);
    expect(s.maxArcherAheadSteady).toBeLessThanOrEqual(0);
  });
});

describe('性能', () => {
  it('200体が同時に戦っても、1フレームの計算は十分に軽い', () => {
    const kinds = ['sword', 'spear', 'cavalry', 'archer'] as const;
    const squads: SquadSpec[] = [];
    for (let i = 0; i < 10; i++) {
      squads.push({ side: 'ally', mode: 'hold', kind: kinds[i % 4], count: 10, x: 800, y: 300 + i * 150, dir: [1, 0] });
      squads.push({ side: 'enemy', mode: 'hold', kind: kinds[(i + 1) % 4], count: 10, x: 1050, y: 300 + i * 150, dir: [-1, 0] });
    }
    const w = new World({ width: 2000, height: 2000, hero: { x: 50, y: 50 }, squads });
    expect(w.units.length).toBe(201);
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) w.step(DT);
    const avg = (performance.now() - t0) / 300;
    // 60fps の1フレームは16.7ms。描画の分を残すため、計算はその1割程度に収める（パソコンでの目安）
    expect(avg).toBeLessThan(2);
  });
});
