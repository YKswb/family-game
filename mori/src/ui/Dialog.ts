import type { Speaker, SpeakerInfo, StoryLine } from '../data/gameData';
import { escape } from './Overlay';

/**
 * 会話の箱（画面の下）。1行ずつ出し、画面のどこかをタップすると次へ進む。
 * 最後まで読むと onDone を呼ぶ。出ている間、戦場は止める
 */
export class Dialog {
  private readonly root: HTMLElement;
  private lines: StoryLine[] = [];
  private index = 0;
  private onDone: (() => void) | null = null;
  /** 出した直後の誤タップで読み飛ばさないよう、少し待ってから次へ進めるようにする */
  private readyAt = 0;

  constructor(private readonly speakers: Record<Speaker, SpeakerInfo>) {
    const el = document.getElementById('dialog');
    if (!el) throw new Error('#dialog がない');
    this.root = el;
    this.root.onclick = () => this.next();
  }

  get visible(): boolean {
    return !this.root.classList.contains('hide');
  }

  show(lines: StoryLine[], onDone: () => void): void {
    if (lines.length === 0) {
      onDone();
      return;
    }
    this.lines = lines;
    this.index = 0;
    this.onDone = onDone;
    this.root.classList.remove('hide');
    this.render();
  }

  hide(): void {
    this.root.classList.add('hide');
    this.root.innerHTML = '';
    this.onDone = null;
  }

  private render(): void {
    const line = this.lines[this.index];
    const sp = this.speakers[line.who];
    const last = this.index === this.lines.length - 1;
    this.root.innerHTML = `<div class="dlg">
      <div class="face" style="background:${sp.color}">${escape(sp.icon)}</div>
      <div class="body"><div class="who" style="color:${sp.color}">${escape(sp.name)}</div><div class="say">${escape(line.text)}</div></div>
      <div class="more">${last ? '✔' : '▶'}</div>
    </div>`;
    this.readyAt = performance.now() + 250;
  }

  private next(): void {
    if (performance.now() < this.readyAt) return;
    this.index++;
    if (this.index < this.lines.length) {
      this.render();
      return;
    }
    const done = this.onDone;
    this.hide();
    done?.();
  }
}
