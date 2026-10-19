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
  /** 待機部隊へ向かって押し続ける（子どもが待機部隊にジャンをぶつけている状態） */
  const pushInto = (w: World, squadIndex: number, seconds: number) => {
    const sq = w.squads[squadIndex];
    for (let t = 0; t < seconds; t += DT) {
      const dx = sq.postX - w.hero.x;
      const dy = sq.postY - w.hero.y;
      const d = Math.hypot(dx, dy);
      w.input = d > 4 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
      w.step(DT);
    }
    w.input = { x: 0, y: 0 };
  };
  /** いったん離れてから待機部隊に触れ直す */
  const retouch = (w: World, squadIndex: number) => {
    const sq = w.squads[squadIndex];
    walkTo(w, sq.postX - 250, sq.postY);
    walkTo(w, sq.center().x, sq.center().y);
  };

  it('兵士が減ったあとに待機の部隊に触れると、兵種を問わず減った部隊へ最初の人数まで加わる', () => {
    const w = withWaitingCavalry();
    const [sword, spear, archer, cav] = w.squads;
    kill(w, 0, 8); // 剣 2人
    kill(w, 1, 4); // 槍 6人
    retouch(w, 3);
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
    retouch(w, 3);
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

  it('待機の部隊は、一定の間隔で兵士が1人ずつ戻り、最初の人数で止まる', () => {
    const w = withWaitingCavalry();
    const cav = w.squads[3];
    const interval = UNIT_DATA.ai.waitingReviveSeconds;
    kill(w, 3, 7);
    expect(cav.aliveCount).toBe(3);
    wait(w, interval * 3 + 0.1);
    expect(cav.aliveCount).toBe(6);
    wait(w, interval * 10);
    expect(cav.aliveCount).toBe(10);
  });

  it('待機部隊のそばで戦って兵士が減っても、触れたままで補充される（離れて触れ直さなくてよい）', () => {
    const w = withWaitingCavalry();
    const [sword, , , cav] = w.squads;
    // ジャンは騎馬の待機部隊の上に立ったまま、剣の部隊が5人倒れる
    kill(w, 0, 5);
    wait(w, 0.1);
    expect(sword.aliveCount).toBe(10);
    expect(cav.aliveCount).toBe(5);
  });

  it('待機部隊に触れているあいだは、戻ってきた兵士もすぐに補充される', () => {
    const w = withWaitingCavalry();
    const [sword, , , cav] = w.squads;
    kill(w, 0, 10 - 2); // 剣 2人
    pushInto(w, 3, 0.5);
    expect(sword.aliveCount).toBe(10);
    expect(cav.aliveCount).toBe(2);
    kill(w, 0, 5); // 剣 5人 → 待機の2人が加わって 7人
    pushInto(w, 3, 0.5);
    expect(sword.aliveCount).toBe(7);
    expect(cav.aliveCount).toBe(0);
    pushInto(w, 3, UNIT_DATA.ai.waitingReviveSeconds * 2);
    expect(sword.aliveCount).toBe(9);
    expect(cav.aliveCount).toBe(0);
  });

  it('空の待機部隊に触れると、まだ戻っていないことを知らせる', () => {
    const w = withWaitingCavalry();
    const cav = w.squads[3];
    walkTo(w, cav.postX - 300, cav.postY);
    kill(w, 3, 10);
    kill(w, 0, 3);
    cav.reviveTimer = 0;
    const seen: string[] = [];
    for (let t = 0; t < 4; t += DT) {
      const dx = cav.postX - w.hero.x;
      const d = Math.abs(dx);
      w.input = d > 10 ? { x: Math.sign(dx), y: 0 } : { x: 0, y: 0 };
      w.step(DT);
      for (const e of w.events) seen.push(e.type);
    }
    expect(seen).toContain('depotEmpty');
  });

  it('兵士10人の待機部隊に横から歩いて近づいても触れられる（兵士に押し返されても届く）', () => {
    const w = withWaitingCavalry();
    const [sword, , , cav] = w.squads;
    expect(cav.aliveCount).toBe(10);
    walkTo(w, cav.postX - 400, cav.postY);
    kill(w, 0, 3);
    // 待機部隊の横（並びの長い方向）からまっすぐ歩いて行く
    walkTo(w, cav.postX, cav.postY, 6);
    expect(sword.aliveCount).toBe(10);
  });

  it('補充で空になった待機部隊も、離れているあいだに戻ってくる（実際のプレイと同じく、補充で兵士が移って空になる）', () => {
    const w = withWaitingCavalry();
    const [, spear, archer, cav] = w.squads;
    kill(w, 1, 5);
    kill(w, 2, 5);
    retouch(w, 3);
    expect(cav.aliveCount).toBe(0);
    expect(spear.aliveCount + archer.aliveCount).toBe(20);
    walkTo(w, 2500, 500);
    // 歩いているあいだにも戻り始めるので、離れてからの増え方を見る
    const before = cav.aliveCount;
    wait(w, UNIT_DATA.ai.waitingReviveSeconds * 3);
    expect(cav.aliveCount).toBe(before + 3);
    expect(cav.waiting).toBe(true);
  });

  it('補充で空になった待機部隊も、また戻ってくる', () => {
    const w = withWaitingCavalry();
    const cav = w.squads[3];
    kill(w, 3, 10);
    expect(cav.aliveCount).toBe(0);
    wait(w, UNIT_DATA.ai.waitingReviveSeconds + 0.1);
    expect(cav.aliveCount).toBe(1);
    expect(cav.alive[0].kind).toBe('cavalry');
  });

  it('待機部隊は戦わず、敵のすぐそばでも狙われないので、戻った兵士がたまっていく', () => {
    const w = withWaitingCavalry();
    const cav = w.squads[3];
    kill(w, 3, 10);
    // 待機の騎馬隊のすぐそばに敵の剣士隊を置く（ジャンは遠くへ）
    walkTo(w, 300, 500);
    w.addSquad({ side: 'enemy', mode: 'hold', kind: 'sword', count: 10, x: cav.postX + 120, y: cav.postY, dir: [-1, 0] });
    const enemy = w.squads[4];
    const before = cav.aliveCount;
    wait(w, UNIT_DATA.ai.waitingReviveSeconds * 5);
    expect(cav.aliveCount).toBe(before + 5);
    expect(enemy.alert).toBe(false);
    expect(enemy.units.some((u) => u.target)).toBe(false);
  });

  it('率いていた部隊が全滅すると、仲間にした場所に待機として戻り、少しずつ復活して、触れるとまた率いられる', () => {
    const w = withWaitingCavalry();
    const sword = w.squads[0];
    walkTo(w, 2500, 500);
    kill(w, 0, 10);
    w.step(DT);
    expect(w.events).toContainEqual({ type: 'returnedHome', squad: sword });
    expect(sword.waiting).toBe(true);
    expect(sword.mode).toBe('hold');
    expect([sword.postX, sword.postY]).toEqual([500, 500]);
    expect(w.followingSquads()).toHaveLength(2);
    wait(w, UNIT_DATA.ai.waitingReviveSeconds * 4 + 0.1);
    expect(sword.aliveCount).toBe(4);
    expect(sword.alive.every((u) => u.kind === 'sword')).toBe(true);
    // 元の場所へ戻って触れると、また率いられる（率いている部隊が2つなので空きがある）。
    // 途中で騎馬の待機部隊に触れないよう、南を回って行く
    walkTo(w, 2500, 900);
    walkTo(w, 500, 900);
    walkTo(w, 500, 500);
    expect(sword.mode).toBe('follow');
    expect(w.followingSquads()).toHaveLength(3);
  });

  it('率いている部隊が全滅しても、ステージの待機部隊が0にはならない（スクリーンショットの「ぶたい 0/3」の場面）', () => {
    const w = withWaitingCavalry();
    walkTo(w, 2500, 500);
    for (let i = 0; i < 3; i++) kill(w, i, 10);
    w.step(DT);
    expect(w.followingSquads()).toHaveLength(0);
    expect(w.squads.filter((s) => s.waiting)).toHaveLength(4);
  });

  it('率いている部隊・旗の部隊・敵の部隊は、兵士が戻らない', () => {
    const w = new World({
      width: 3000,
      height: 1000,
      hero: { x: 100, y: 500 },
      heroDir: [1, 0],
      squads: [
        flag('sword', 500, 500),
        flag('spear', 1500, 500),
        { side: 'enemy', mode: 'hold', kind: 'sword', count: 10, x: 2800, y: 900, dir: [-1, 0] },
      ],
    });
    walkTo(w, 500, 500);
    walkTo(w, 900, 500);
    kill(w, 0, 3);
    kill(w, 1, 3);
    kill(w, 2, 3);
    wait(w, UNIT_DATA.ai.waitingReviveSeconds * 4);
    expect(w.squads.map((s) => s.aliveCount)).toEqual([7, 7, 7]);
  });

  it('待機の兵士が余ったら、残りはその場で待機を続ける', () => {
    const w = withWaitingCavalry();
    const [sword, , , cav] = w.squads;
    kill(w, 0, 7);
    retouch(w, 3);
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
    // 統率を超えた旗の部隊に加えて、全滅した部隊も元の場所で待機に戻る
    expect(w.squads.filter((q) => q.waiting).length).toBeGreaterThanOrEqual(5 - w.leadership);
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
