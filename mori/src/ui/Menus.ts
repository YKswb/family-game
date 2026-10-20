import type { CompanionKind, GameData, StageData, TowerKind } from '../data/gameData';
import { nextCost, unlockable } from '../systems/Home';
import type { SaveData } from '../systems/Save';
import { TEXT, fmt } from './Display';
import { escape } from './Overlay';

/** ステージの番号の色（ステージ選びの丸） */
const STAGE_COLORS = ['#5aa845', '#e0802f', '#6aa9cf', '#f07a4a', '#d9a94a', '#5f8a55', '#d9483a', '#3a4a8a'];

export interface HomeHandlers {
  onBuy(id: string): void;
  onUnlock(tower: TowerKind): void;
  onRefund(): void;
  onStages(): void;
}

export interface StageHandlers {
  onPick(stage: StageData): void;
  onDifficulty(d: number): void;
  onFriend(kind: CompanionKind): void;
  onBack(): void;
}

/**
 * タイトル・まもりびとの家・ステージ選びの画面（HTML）。文字とボタンが多いので Phaser ではなく HTML で作り、
 * 後ろの森の絵（MenuScene）の上に重ねる
 */
export class Menus {
  private readonly root: HTMLElement;

  constructor() {
    const el = document.getElementById('menu');
    if (!el) throw new Error('#menu がない');
    this.root = el;
  }

  hide(): void {
    this.root.classList.add('hide');
    this.root.innerHTML = '';
  }

  private open(html: string): void {
    this.root.innerHTML = html;
    this.root.classList.remove('hide');
  }

  private on(sel: string, fn: (el: HTMLElement) => void): void {
    this.root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.onclick = () => fn(el);
    });
  }

  showTitle(hasSave: boolean, onPlay: () => void, onNewGame: () => void): void {
    this.open(`<div class="logo">
      <h1>${escape(TEXT.title)}</h1>
      <p>${escape(TEXT.titleLead)}</p>
      <div class="btns">
        <button class="btn" id="m-play">${escape(TEXT.play)}</button>
        ${hasSave ? `<button class="btn2" id="m-new">${escape(TEXT.newGame)}</button>` : ''}
      </div></div>`);
    this.on('#m-play', onPlay);
    this.on('#m-new', onNewGame);
  }

  /** まもりびとの家：なつこの愛で強化し、見つけたとうを解放する */
  showHome(s: SaveData, data: GameData, h: HomeHandlers): void {
    const home = data.home;
    const groups = home.groups
      .map((g) => {
        const rows = home.upgrades
          .filter((u) => u.group === g.id)
          .map((u) => {
            const lv = s.levels[u.id] ?? 0;
            const max = u.costs.length;
            const cost = nextCost(s, home, u.id);
            const dots = '●'.repeat(lv) + '○'.repeat(max - lv);
            const btn =
              cost === null
                ? `<button class="mini" disabled>${escape(TEXT.maxed)}</button>`
                : `<button class="mini" data-buy="${escape(u.id)}" ${s.love < cost ? 'disabled' : ''}>${escape(fmt(TEXT.buy, { n: cost }))}</button>`;
            return `<div class="row"><b>${escape(u.icon)}</b><span class="txt"><span class="name">${escape(u.name)}</span><span class="desc">${escape(u.desc)}</span><span class="lv">${dots}</span></span>${btn}</div>`;
          })
          .join('');
        return `<div class="group">${escape(g.icon)} ${escape(g.name)}</div><div class="rows">${rows}</div>`;
      })
      .join('');

    const kinds = data.towers.kinds;
    const can = unlockable(s, home);
    const unlockRows = can
      .map(
        (u) =>
          `<div class="row"><b>${escape(kinds[u.tower].icon)}</b><span class="txt"><span class="name">${escape(kinds[u.tower].name)}</span><span class="desc">${escape(TEXT.unlockDesc)}</span></span><button class="mini" data-unlock="${u.tower}" ${s.love < u.cost ? 'disabled' : ''}>${escape(fmt(TEXT.buy, { n: u.cost }))}</button></div>`,
      )
      .join('');
    const unlockedList = s.unlocked.map((k) => `${kinds[k].icon}${kinds[k].short}`).join('　');
    const unlockBody = `${unlockRows ? `<div class="rows">${unlockRows}</div>` : `<p class="note">${escape(TEXT.unlockNone)}</p>`}${
      unlockedList ? `<p class="note">${escape(fmt(TEXT.unlocked, { list: unlockedList }))}</p>` : ''
    }`;
    const spent = Object.values(s.levels).some((lv) => lv > 0);

    this.open(`<div class="panel">
      <div class="head"><h2>🏡 ${escape(TEXT.home)}</h2><span class="love">${escape(fmt(TEXT.love, { n: s.love }))}</span></div>
      ${groups}
      <div class="group">🔓 ${escape(TEXT.unlockGroup)}</div>${unlockBody}
      <div class="foot"><button class="btn2" id="m-refund" ${spent ? '' : 'disabled'}>${escape(TEXT.refund)}</button><button class="btn" id="m-stages">${escape(TEXT.toStages)}</button></div>
    </div>`);
    this.on('[data-buy]', (el) => h.onBuy(el.dataset.buy!));
    this.on('[data-unlock]', (el) => h.onUnlock(el.dataset.unlock as TowerKind));
    this.on('#m-refund', () => h.onRefund());
    this.on('#m-stages', () => h.onStages());
  }

  /** ステージ選び：難易度、連れていく仲間、ステージの★・王冠 */
  showStages(s: SaveData, stages: StageData[], data: GameData, h: StageHandlers): void {
    const diffs = data.difficulty
      .map((d, i) => `<button class="dbtn ${s.difficulty === i ? 'on' : ''}" data-diff="${i}">${escape(d.name)}</button>`)
      .join('');
    const kinds = data.companions.kinds;
    const friendButtons = s.friends
      .map((k) => `<button class="dbtn ${s.friend === k ? 'on' : ''}" data-friend="${k}">${escape(kinds[k].icon)} ${escape(kinds[k].name)}</button>`)
      .join('');
    const picked = s.friend ? kinds[s.friend] : null;
    const friendRow = s.friends.length
      ? `<div class="group" style="justify-content:center">🐾 ${escape(TEXT.friendTitle)}</div><div class="diff">${friendButtons}</div>${
          picked ? `<p class="note" style="text-align:center">${escape(fmt(TEXT.friendDesc, { animal: picked.animal, name: picked.name, desc: picked.desc }))}</p>` : ''
        }`
      : '';
    let n = 0;
    const rows = stages
      .map((st) => {
        const rec = s.stages[st.id];
        const practice = st.id === 'practice';
        const label = practice ? '🧪' : String(++n);
        const color = practice ? '#8a6bd1' : STAGE_COLORS[(n - 1) % STAGE_COLORS.length];
        const stars = rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '☆☆☆';
        const name = practice ? TEXT.practiceName : st.name;
        return `<button class="sbtn" data-stage="${escape(st.id)}"><span class="sw" style="background:${color}">${label}</span><span class="nm">${escape(name)}</span><span class="st">${rec?.crown ? '👑' : ''}${practice ? '' : stars}</span></button>`;
      })
      .join('');
    this.open(`<div class="panel">
      <div class="head"><h2>🗺️ ${escape(TEXT.stages)}</h2><span class="love">${escape(fmt(TEXT.love, { n: s.love }))}</span></div>
      <div class="diff">${diffs}</div><p class="note" style="text-align:center">${escape(TEXT.crownNote)}</p>
      ${friendRow}
      <div class="stages">${rows}</div>
      <div class="foot"><button class="btn2" id="m-back">${escape(TEXT.backHome)}</button></div>
    </div>`);
    this.on('[data-diff]', (el) => h.onDifficulty(Number(el.dataset.diff)));
    this.on('[data-friend]', (el) => h.onFriend(el.dataset.friend as CompanionKind));
    this.on('[data-stage]', (el) => {
      const st = stages.find((x) => x.id === el.dataset.stage);
      if (st) h.onPick(st);
    });
    this.on('#m-back', () => h.onBack());
  }
}
