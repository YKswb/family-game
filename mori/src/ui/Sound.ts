import soundsJson from '../data/sounds.json';

export type SoundName = keyof typeof soundsJson.sounds;

interface Tone {
  f: number;
  d: number;
  type?: string;
  v?: number;
  f2?: number;
  at?: number;
}

interface SoundDef {
  tones: Tone[];
  gap?: number;
  vary?: number;
}

const SOUNDS = soundsJson.sounds as Record<SoundName, SoundDef>;
/** 音のオン・オフ（見る人ごとの好みなので、セーブとは別に置く） */
const MUTE_KEY = 'mori3_sound';

/** 同じ音が続けて鳴りすぎないように、音ごとに最後に鳴らした時刻を覚えておく */
export class SoundGate {
  private readonly last = new Map<string, number>();

  allow(name: string, gapMs: number, now: number): boolean {
    const t = this.last.get(name);
    if (t !== undefined && now - t < gapMs) return false;
    this.last.set(name, now);
    return true;
  }
}

/**
 * 効果音。画像や音声ファイルは使わず、data/sounds.json の短い音を Web Audio で合成する。
 * iPad では、指で触れたときでないと音を出せない。アプリを切り替えると止まるので、
 * 触れるたびに unlock() で鳴らし直す
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly gate = new SoundGate();
  muted: boolean;

  constructor() {
    this.muted = readMuted();
  }

  /** 画面に触れたときに呼ぶ。音を出せる状態にする */
  unlock(): void {
    try {
      // iPad の消音スイッチが入っていても、メディアの音として鳴らす
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
      if (!this.ctx) this.setup();
      // iPad はアプリを切り替えると 'suspended' ではなく 'interrupted' になる
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    } catch {
      // 音が出せなくても遊びは止めない
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? 'off' : 'on');
    } catch {
      // 保存できなくても、その場の切り替えは効く
    }
  }

  /** pitch は高さの倍率（建てるときの支払いで少しずつ上げる、など） */
  play(name: SoundName, pitch = 1): void {
    const ctx = this.ctx;
    if (this.muted || !ctx || !this.out || ctx.state !== 'running') return;
    const def = SOUNDS[name];
    if (!this.gate.allow(name, def.gap ?? 0, performance.now())) return;
    const p = pitch * (def.vary ? 1 + (Math.random() * 2 - 1) * def.vary : 1);
    try {
      for (const tone of def.tones) this.tone(ctx, this.out, tone, p);
    } catch {
      // 鳴らせなかった音はとばす
    }
  }

  private setup(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    // 音が重なっても割れないよう、最後に圧縮してから出す
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    const out = ctx.createGain();
    out.gain.value = soundsJson.master;
    out.connect(comp);
    const len = Math.floor(ctx.sampleRate);
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
  }

  private tone(ctx: AudioContext, out: AudioNode, t: Tone, pitch: number): void {
    const start = ctx.currentTime + (t.at ?? 0);
    const end = start + t.d;
    const f = t.f * pitch;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(t.v ?? 0.05, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(out);
    let src: AudioScheduledSourceNode;
    if (t.type === 'noise' && this.noise) {
      // ざらざらした音（爆発、風を切る音）は、雑音を帯域で絞って作る
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(f, start);
      if (t.f2) bp.frequency.exponentialRampToValueAtTime(t.f2 * pitch, end);
      n.connect(bp);
      bp.connect(g);
      src = n;
      n.start(start, Math.random() * 0.4);
    } else {
      const o = ctx.createOscillator();
      o.type = (t.type ?? 'square') as OscillatorType;
      o.frequency.setValueAtTime(f, start);
      if (t.f2) o.frequency.exponentialRampToValueAtTime(t.f2 * pitch, end);
      o.connect(g);
      src = o;
      o.start(start);
    }
    src.stop(end + 0.03);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'off';
  } catch {
    return false;
  }
}

export const sound = new Sound();
