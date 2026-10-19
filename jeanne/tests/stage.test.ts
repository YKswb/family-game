import { describe, expect, it } from 'vitest';
import { STAGES, type StageSquad } from '../src/data/stageData';
import { stageConfig } from '../src/systems/Stage';
import { Terrain } from '../src/systems/Terrain';
import { World } from '../src/systems/World';
import { runStageBot } from './bot';

const DT = 1 / 60;

describe.each(Object.keys(STAGES))('%s のデータ', (key) => {
  const { stage, story } = STAGES[key];
  const terrain = new Terrain([...stage.terrain.rivers, ...stage.terrain.walls], [...stage.terrain.bridges, ...stage.terrain.gates]);
  const spawned: StageSquad[] = stage.events.flatMap((e) => e.do.flatMap((a) => a.spawn ?? []));
  const allSquads = [...stage.squads, ...spawned];
  const ids = [...allSquads.map((s) => s.id), ...(stage.general ? [stage.general.id] : [])];
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x <= stage.width && y <= stage.height;

  it('部隊・大将・イベントの名前が重ならない', () => {
    expect(new Set(ids).size).toBe(ids.length);
    const eventIds = stage.events.map((e) => e.id);
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it('大将の護衛とイベントの条件は、ある部隊を指している', () => {
    for (const g of stage.general?.guards ?? []) expect(ids).toContain(g);
    for (const e of stage.events) for (const id of e.when.squadsWiped ?? []) expect(ids).toContain(id);
  });

  it('ジャン・部隊・大将・ルートは地図の中の通れる場所にある', () => {
    const points: [string, number, number][] = [['hero', stage.start.hero.x, stage.start.hero.y]];
    for (const s of allSquads) {
      points.push([s.id, s.x, s.y]);
      for (const [x, y] of [...(s.patrol ?? []), ...(s.route ?? [])]) points.push([`${s.id} のルート`, x, y]);
    }
    if (stage.general) points.push([stage.general.id, stage.general.x, stage.general.y]);
    for (const [name, x, y] of points) {
      expect(inMap(x, y), `${name} (${x}, ${y}) が地図の外`).toBe(true);
      expect(terrain.isBlocked(x, y, 20), `${name} (${x}, ${y}) が川や壁の上`).toBe(false);
    }
  });

  it('会話はすべて story にあり、1回3行まで、話す人も決まっている', () => {
    const keys = stage.events.flatMap((e) => e.do.map((a) => a.dialog).filter((d): d is string => !!d));
    for (const k of keys) expect(Object.keys(story.dialogs)).toContain(k);
    for (const [k, lines] of Object.entries(story.dialogs)) {
      expect(lines.length, `会話 ${k}`).toBeLessThanOrEqual(3);
      for (const [speaker] of lines) expect(Object.keys(story.speakers)).toContain(speaker);
    }
  });

  it('クリアになるイベントがある', () => {
    expect(stage.events.some((e) => e.do.some((a) => a.victory))).toBe(true);
  });

  it('敵の部隊は 8〜12 隊（援軍を含む）', () => {
    const enemies = allSquads.filter((s) => s.side === 'enemy').length;
    expect(enemies).toBeGreaterThanOrEqual(8);
    expect(enemies).toBeLessThanOrEqual(12);
  });
});

describe('ステージ1の仕組み', () => {
  const make = (seed = 1) => new World(stageConfig(STAGES.stage1.stage, seed));

  it('始まってすぐに「開始」の会話が起きる', () => {
    const w = make();
    w.step(DT);
    expect(w.events).toContainEqual({ type: 'dialog', key: 'start' });
  });

  it('大将は護衛の部隊が残っているあいだ無敵で、全滅すると倒せる', () => {
    const w = make();
    const g = w.general!;
    const hp = g.hp;
    w.strike(w.hero, g);
    expect(g.hp).toBe(hp);
    expect(w.events.some((e) => e.type === 'guarded')).toBe(true);
    expect(w.guardsLeft()).toBe(3);
    for (const id of STAGES.stage1.stage.general!.guards) for (const u of w.squadById(id)!.units) u.dead = true;
    expect(w.guardsLeft()).toBe(0);
    w.strike(w.hero, g);
    expect(g.hp).toBeLessThan(hp);
  });

  it('大将が倒れると「クリア」の会話が起きて勝ちになる', () => {
    const w = make();
    w.general!.dead = true;
    w.step(DT);
    expect(w.events).toContainEqual({ type: 'dialog', key: 'clear' });
    expect(w.outcome).toBe('won');
  });

  it('橋の東の敵を倒してジャンが東岸に来ると、南から騎馬隊が攻めてくる', () => {
    const w = make();
    w.step(DT);
    w.hero.x = 2000;
    w.hero.y = 1200;
    w.step(DT);
    expect(w.squadById('raidCav1')).toBeNull();
    for (const id of ['bridgeSword', 'bridgeSpear']) for (const u of w.squadById(id)!.units) u.dead = true;
    w.step(DT);
    expect(w.events).toContainEqual({ type: 'dialog', key: 'mid' });
    const raid = w.squadById('raidCav1')!;
    expect(raid.kind).toBe('cavalry');
    const y0 = raid.postY;
    for (let t = 0; t < 2; t += DT) w.step(DT);
    // 進軍ルートに沿って北へ動いている
    expect(raid.postY).toBeLessThan(y0 - 100);
  });

  it('巡回する敵は、気づかないあいだルートに沿って動く', () => {
    const w = make();
    const p = w.squadById('patrolW')!;
    const y0 = p.postY;
    for (let t = 0; t < 4; t += DT) w.step(DT);
    expect(p.postY).toBeGreaterThan(y0 + 100);
  });

  it('率いている部隊は、ジャンについて橋を渡る（川に入らず、向こう岸までついてくる）', () => {
    const w = new World({
      width: 2000,
      height: 1200,
      hero: { x: 600, y: 520 },
      heroDir: [1, 0],
      blockers: [{ x: 900, y: 0, w: 110, h: 1200 }],
      passages: [{ x: 870, y: 440, w: 170, h: 160 }],
      squads: [
        { side: 'ally', mode: 'follow', kind: 'sword', count: 10, x: 600, y: 520 },
        { side: 'ally', mode: 'follow', kind: 'archer', count: 10, x: 600, y: 520 },
      ],
    });
    const path: [number, number][] = [
      [880, 520],
      [1300, 520],
      [1400, 900],
    ];
    for (const [tx, ty] of path) {
      for (let t = 0; t < 10; t += DT) {
        const dx = tx - w.hero.x;
        const dy = ty - w.hero.y;
        const d = Math.hypot(dx, dy);
        if (d < 10) break;
        w.input = { x: dx / d, y: dy / d };
        w.step(DT);
        for (const u of w.units) expect(w.terrain.isBlocked(u.x, u.y)).toBe(false);
      }
    }
    w.input = { x: 0, y: 0 };
    for (let t = 0; t < 8; t += DT) w.step(DT);
    const behind = w.units.filter((u) => u.squad && u.x < 1010);
    expect(behind).toHaveLength(0);
  });
});

describe('ステージ1の自動プレイ', () => {
  it.each([1, 2, 3, 4])('最後まで通せる：会話が順に起き、大将を倒してクリア（seed %i）', (seed) => {
    const w = new World(stageConfig(STAGES.stage1.stage, seed));
    const s = runStageBot(w);
    expect(s.broken).toBeNull();
    expect(w.outcome).toBe('won');
    expect(s.dialogs).toEqual(['start', 'mid', 'general', 'clear']);
    expect(s.recruited).toBeGreaterThanOrEqual(4);
    // ボットは子どもより速いので、10分よりずっと短く終わる
    expect(s.seconds).toBeLessThan(600);
  });
});
