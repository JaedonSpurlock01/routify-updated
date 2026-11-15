/**
 * Every sound the map makes, synthesized with the Web Audio API so there are
 * no files to load. Browsers only allow audio after the visitor has
 * interacted with the page, so the audio context is created on the first
 * sound (always triggered by a click or key press) and resumed if suspended.
 */

/** Overall loudness, before the limiter. */
const MASTER_GAIN = 0.55;
/** The searching sizzle's level while playback runs, and how quickly it fades in and out (seconds). */
const SIZZLE_GAIN = 0.05;
const SIZZLE_FADE = 0.08;
/** Thunder closer together than this (seconds), e.g. two compared routes landing at once, is heard once. */
const THUNDER_GAP = 0.25;

export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private sizzle: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private searching = false;
  private enabled = true;
  private lastThunder = -Infinity;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.setSearching(false);
  }

  /** A rising glassy pop; the goal sits higher than the start. */
  place(which: "start" | "end"): void {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = which === "start" ? 520 : 700;
    this.tone(t, "sine", base, base * 1.6, 0.08, 0.28, 0.2);
    this.tone(t, "triangle", base * 2, base * 3.2, 0.06, 0.06, 0.12);
    if (which === "end") this.tone(t + 0.07, "sine", base * 1.5, base * 1.5, 0.01, 0.16, 0.22);
  }

  /** A falling bloop as the points are taken away. */
  remove(): void {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, "sine", 620, 240, 0.16, 0.24, 0.24);
    this.tone(t, "triangle", 1240, 480, 0.12, 0.05, 0.16);
  }

  /** A soft crackling sizzle that plays while a search is playing back. */
  setSearching(on: boolean): void {
    on &&= this.enabled;
    if (on === this.searching) return;
    this.searching = on;
    const ctx = on ? this.audio() : this.ctx;
    if (!ctx) return;
    if (on && !this.sizzle) this.sizzle = this.startSizzle(ctx);
    this.sizzle?.gain.gain.setTargetAtTime(on ? SIZZLE_GAIN : 0, ctx.currentTime, SIZZLE_FADE);
  }

  /** The strike's leader: a rising electric zap, as long as the leader. */
  strike(): void {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const length = 0.45;

    const hiss = this.noiseSource(ctx, this.noise!);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 6;
    band.frequency.setValueAtTime(700, t);
    band.frequency.exponentialRampToValueAtTime(4200, t + length);
    const hissGain = envelope(ctx, t, 0.03, 0.12, length);
    hiss.connect(band).connect(hissGain).connect(this.master!);
    hiss.start(t);
    hiss.stop(t + length + 0.05);

    // An electric buzz, chopped by a fast square wave.
    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.setValueAtTime(90, t);
    buzz.frequency.exponentialRampToValueAtTime(180, t + length);
    const chop = ctx.createOscillator();
    chop.type = "square";
    chop.frequency.value = 34;
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 0.5;
    const buzzGain = envelope(ctx, t, 0.04, 0.05, length);
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 400;
    chop.connect(chopDepth).connect(buzzGain.gain);
    buzz.connect(highpass).connect(buzzGain).connect(this.master!);
    for (const osc of [buzz, chop]) {
      osc.start(t);
      osc.stop(t + length + 0.05);
    }
  }

  /** The flash: a sharp crack on each return stroke, then a long low rumble. */
  thunder(): void {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastThunder < THUNDER_GAP) return;
    this.lastThunder = t;

    // Cracks line up with the flash's three return strokes.
    for (const [at, level] of [
      [0, 0.7],
      [0.11, 0.45],
      [0.24, 0.3],
    ] as const) {
      const crack = this.noiseSource(ctx, this.noise!);
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 1400;
      const gain = envelope(ctx, t + at, 0.002, level, 0.14);
      crack.connect(highpass).connect(gain).connect(this.master!);
      crack.start(t + at);
      crack.stop(t + at + 0.2);
    }

    const rumble = this.noiseSource(ctx, this.brown!);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(420, t);
    lowpass.frequency.exponentialRampToValueAtTime(110, t + 2.4);
    const rumbleGain = envelope(ctx, t, 0.06, 0.9, 2.6);
    rumble.connect(lowpass).connect(rumbleGain).connect(this.master!);
    rumble.start(t);
    rumble.stop(t + 2.8);

    this.tone(t, "sine", 70, 38, 0.9, 0.45, 1.0);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.sizzle = null;
    this.searching = false;
  }

  /** The audio context, created on first use; null when muted or unsupported. */
  private audio(): AudioContext | null {
    if (!this.enabled || typeof AudioContext === "undefined") return null;
    if (!this.ctx) {
      const ctx = new AudioContext();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 12;
      this.master = ctx.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(limiter).connect(ctx.destination);
      this.noise = whiteNoise(ctx, 1);
      this.brown = brownNoise(ctx, 3);
      this.ctx = ctx;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** One oscillator note gliding from `from` to `to` Hz over `glide`, with a quick attack and an exponential tail. */
  private tone(
    t: number,
    type: OscillatorType,
    from: number,
    to: number,
    glide: number,
    level: number,
    length: number
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + glide);
    osc.connect(envelope(ctx, t, 0.005, level, length)).connect(this.master!);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  private noiseSource(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // A slightly different pitch each time, so repeats don't sound identical.
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
    return source;
  }

  /** A looping bed of faint hiss with sparse random crackles baked in. */
  private startSizzle(ctx: AudioContext): { source: AudioBufferSourceNode; gain: GainNode } {
    const seconds = 3;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
    const crackles = seconds * 28;
    const decay = ctx.sampleRate * 0.003;
    for (let c = 0; c < crackles; c++) {
      const at = Math.floor(Math.random() * data.length);
      const level = 0.2 + Math.random() * 0.8;
      for (let i = 0; i < decay * 4 && at + i < data.length; i++) {
        data[at + i] += (Math.random() * 2 - 1) * level * Math.exp(-i / decay);
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(highpass).connect(gain).connect(this.master!);
    source.start();
    return { source, gain };
  }
}

/** A gain node that rises to `level` over `attack` seconds from `t`, then dies away by `t + length`. */
function envelope(ctx: AudioContext, t: number, attack: number, level: number, length: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  return gain;
}

function whiteNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Noise with most of its energy down low: the body of a rumble. */
function brownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}
