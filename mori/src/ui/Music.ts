import musicJson from '../data/music.json';
import { sound } from './Sound';

export type TrackName = keyof typeof musicJson.tracks;

interface PartData {
  wave: string;
  v: number;
  notes: string;
}

interface TrackData {
  bpm: number;
  parts: PartData[];
}

/** 1つの音（at と len は8分音符いくつ分か。note は音の名前か打楽器の記号） */
export interface NoteEvent {
  at: number;
  len: number;
  note: string;
}

const TRACKS = musicJson.tracks as Record<TrackName, TrackData>;
/** BGM のオン・オフ（見る人ごとの好みなので、セーブとは別に置く） */
const BGM_KEY = 'mori3_bgm';
/** 1小節は8分音符8つ分 */
export const BAR = 8;
/** どれだけ先まで音を予約しておくか（秒）。画面の処理が重くても音が途切れないように */
const AHEAD = 0.3;
const FADE = 0.6;

/** 「C5.2 -.2 | k.1」のような並びを、音の一覧と小節ごとの長さにする */
export function parseNotes(notes: string): { events: NoteEvent[]; bars: number[]; total: number } {
  const events: NoteEvent[] = [];
  const bars: number[] = [];
  let at = 0;
  let barStart = 0;
  for (const tok of notes.trim().split(/\s+/)) {
    if (tok === '|') {
      bars.push(at - barStart);
      barStart = at;
      continue;
    }
    const m = /^([^.]+)\.(\d+(?:\.\d+)?)$/.exec(tok);
    if (!m) throw new Error(`音符が読めない: ${tok}`);
    const len = Number(m[2]);
    if (m[1] !== '-') events.push({ at, len, note: m[1] });
    at += len;
  }
  bars.push(at - barStart);
  return { events, bars, total: at };
}

const SEMI: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** 音の名前（A4、C#5、Bb3 など）を高さ（Hz）にする。読めなければ null */
export function noteFreq(name: string): number | null {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) return null;
  const n = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (n / 12);
}

interface Playing {
  name: TrackName;
  gain: GainNode;
  /** 時刻順に並べた、全パートの音 */
  events: { at: number; len: number; note: string; part: PartData }[];
  /** 8分音符1つの長さ（秒） */
  step: number;
  /** 1周の長さ（8分音符いくつ分か） */
  total: number;
  loopStart: number;
  index: number;
}

/**
 * BGM。data/music.json の曲を、Web Audio で少しずつ先まで予約しながら繰り返し演奏する。
 * 曲を変えるときは、前の曲をゆっくり消しながら次の曲を始める
 */
export class Music {
  enabled: boolean;
  private want: TrackName | null = null;
  private cur: Playing | null = null;

  constructor() {
    this.enabled = readEnabled();
    if (typeof window !== 'undefined') window.setInterval(() => this.tick(), 50);
  }

  /** この曲にする（同じ曲なら何もしない。最初から弾き直さない） */
  play(name: TrackName): void {
    this.want = name;
  }

  stop(): void {
    this.want = null;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(BGM_KEY, on ? 'on' : 'off');
    } catch {
      // 保存できなくても、その場の切り替えは効く
    }
  }

  private tick(): void {
    const bus = sound.bus;
    if (!bus) return;
    const target = this.enabled && !sound.muted ? this.want : null;
    if (this.cur && this.cur.name !== target) this.fadeOut(bus.ctx);
    if (!this.cur && target) this.cur = this.start(target, bus.ctx, bus.out);
    if (this.cur) this.schedule(bus.ctx, bus.noise);
  }

  private start(name: TrackName, ctx: AudioContext, out: AudioNode): Playing {
    const t = TRACKS[name];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.3);
    gain.connect(out);
    const events: Playing['events'] = [];
    let total = 0;
    for (const part of t.parts) {
      const p = parseNotes(part.notes);
      total = Math.max(total, p.total);
      for (const e of p.events) events.push({ ...e, part });
    }
    events.sort((a, b) => a.at - b.at);
    return { name, gain, events, step: 60 / t.bpm / 2, total, loopStart: ctx.currentTime + 0.1, index: 0 };
  }

  private fadeOut(ctx: AudioContext): void {
    const g = this.cur!.gain;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + FADE);
    window.setTimeout(() => g.disconnect(), FADE * 1000 + 600);
    this.cur = null;
  }

  private schedule(ctx: AudioContext, noise: AudioBuffer): void {
    const c = this.cur!;
    const now = ctx.currentTime;
    // 画面が隠れて止まっていたあとは、遅れた分をとばして今から弾く
    if (c.index < c.events.length && c.loopStart + c.events[c.index].at * c.step < now - 0.1) {
      c.loopStart = now + 0.05;
      c.index = 0;
    }
    for (;;) {
      if (c.index >= c.events.length) {
        c.loopStart += c.total * c.step;
        c.index = 0;
      }
      const e = c.events[c.index];
      const t = c.loopStart + e.at * c.step;
      if (t > now + AHEAD) break;
      try {
        this.voice(ctx, c.gain, noise, e.part, e.note, t, e.len * c.step);
      } catch {
        // 鳴らせなかった音はとばす
      }
      c.index++;
    }
  }

  private voice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, part: PartData, note: string, t: number, dur: number): void {
    const g = ctx.createGain();
    g.connect(out);
    if (part.wave === 'drum') {
      this.drum(ctx, g, noise, note, t, part.v);
      return;
    }
    const f = noteFreq(note);
    if (!f) return;
    const o = ctx.createOscillator();
    o.type = part.wave as OscillatorType;
    o.frequency.setValueAtTime(f, t);
    // 弾いた瞬間が少し強く、だんだん弱くなる。次の音とくっつかないよう少し早めに切る
    const end = t + Math.max(0.05, dur * 0.92);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(part.v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(part.v * 0.6, t + Math.min(0.15, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g);
    o.start(t);
    o.stop(end + 0.02);
  }

  /** k：大だいこ、s：小だいこ、h：シンバル */
  private drum(ctx: AudioContext, g: GainNode, noise: AudioBuffer, kind: string, t: number, v: number): void {
    if (kind === 'k') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(v * 2.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.17);
      return;
    }
    const n = ctx.createBufferSource();
    n.buffer = noise;
    const f = ctx.createBiquadFilter();
    const len = kind === 's' ? 0.12 : 0.04;
    f.type = kind === 's' ? 'bandpass' : 'highpass';
    f.frequency.value = kind === 's' ? 1800 : 7000;
    g.gain.setValueAtTime(kind === 's' ? v * 1.4 : v * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(f);
    f.connect(g);
    n.start(t, Math.random() * 0.5);
    n.stop(t + len + 0.02);
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(BGM_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const music = new Music();
