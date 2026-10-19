/** 選択肢1つ分（とうの種類や、レベルアップの強化） */
export interface Option {
  icon: string;
  name: string;
  desc: string;
}

export interface ResultInfo {
  title: string;
  /** ★の数（0なら出さない） */
  stars: number;
  lines: string[];
  buttons: { label: string; onTap: () => void }[];
}

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} がない`);
  return e;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * ゲームの上に重ねる HTML の画面（3択、ひとやすみ、結果）と、画面に固定のボタン。
 * 文字が多く、縦に長くなることもあるので、Phaser ではなく HTML で作る
 */
export class Overlay {
  private readonly ov = el('ov');
  private readonly card = el('card');
  readonly pauseBtn = el('pause') as HTMLButtonElement;
  readonly callBtn = el('callnow') as HTMLButtonElement;

  get visible(): boolean {
    return !this.ov.classList.contains('hide');
  }

  hide(): void {
    this.ov.classList.add('hide');
  }

  /** 3つの中から1つ選ぶ画面 */
  showChoice(title: string, lead: string, options: Option[], onPick: (i: number) => void): void {
    const opts = options
      .map(
        (o, i) =>
          `<button class="opt" data-i="${i}"><b>${escape(o.icon)}</b><span><span class="name">${escape(o.name)}</span><span class="desc">${escape(o.desc)}</span></span></button>`,
      )
      .join('');
    this.open(`<div class="title">${escape(title)}</div>${lead ? `<p class="lead">${escape(lead)}</p>` : ''}<div class="opts">${opts}</div>`);
    this.card.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => {
      b.onclick = () => {
        this.hide();
        onPick(Number(b.dataset.i));
      };
    });
  }

  /** 題と文とボタンだけの画面（ひとやすみ、クリア、負け） */
  showResult(info: ResultInfo): void {
    const stars = info.stars > 0 ? `<div class="stars">${'★'.repeat(info.stars)}${'☆'.repeat(3 - info.stars)}</div>` : '';
    const lines = info.lines.map((l) => `<p class="lead">${escape(l)}</p>`).join('');
    const btns = info.buttons.map((b, i) => `<button class="btn" data-i="${i}">${escape(b.label)}</button>`).join('');
    this.open(`<div class="title">${escape(info.title)}</div>${stars}${lines}<div class="btns">${btns}</div>`);
    this.card.querySelectorAll<HTMLButtonElement>('.btn').forEach((b) => {
      b.onclick = () => {
        this.hide();
        info.buttons[Number(b.dataset.i)].onTap();
      };
    });
  }

  private open(html: string): void {
    this.card.innerHTML = html;
    this.card.scrollTop = 0;
    this.ov.classList.remove('hide');
  }
}
