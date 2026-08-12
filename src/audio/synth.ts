import { frequency, type Note } from "./score.ts";

/**
 * The instruments.
 *
 * Every sound in the game is made here, from oscillators and filtered noise, at
 * the moment it is heard. The repository ships no audio files for the same
 * reason it ships no images: a wave is cheaper to describe than to store, and a
 * described one can be tuned by changing a number rather than by opening an
 * editor.
 */

/** One second of noise, made once and reused by everything percussive. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 22222;
  for (let i = 0; i < data.length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (state / 0x3fffffff - 1) * 0.9;
  }
  return buffer;
}

export class Instruments {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly noise: AudioBuffer;

  constructor(ctx: AudioContext, out: GainNode) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noiseBuffer(ctx);
  }

  play(note: Note, at: number, seconds: number): void {
    switch (note.voice) {
      case "flute":
        this.flute(note, at, seconds);
        return;
      case "fiddle":
        this.fiddle(note, at, seconds);
        return;
      case "guitar":
        this.pluck(note, at, seconds);
        return;
      case "bass":
        this.bass(note, at, seconds);
        return;
      case "conga":
        this.conga(note, at);
        return;
      case "clave":
        this.clave(note, at);
        return;
      case "shaker":
        this.shaker(note, at);
        return;
    }
  }

  /**
   * A wooden flute: a sine with breath around it.
   *
   * The breath is the whole trick. A bare sine is a test tone; the same sine
   * with a little band-passed noise riding on the attack is a person blowing
   * across a hole.
   */
  private flute(note: Note, at: number, seconds: number): void {
    const gain = this.envelope(at, seconds, note.level * 0.5, 0.04, 0.12);
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency(note.pitch);
    this.vibrato(osc, at, 4.6, 3.5);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + seconds + 0.2);

    const breath = this.ctx.createBufferSource();
    breath.buffer = this.noise;
    breath.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = frequency(note.pitch) * 2;
    band.Q.value = 6;
    const breathGain = this.envelope(at, Math.min(seconds, 0.14), note.level * 0.12, 0.01, 0.08);
    breath.connect(band).connect(breathGain);
    breath.start(at);
    breath.stop(at + 0.2);
  }

  /** A fiddle: a saw through a formant-ish filter, with a slow bow attack. */
  private fiddle(note: Note, at: number, seconds: number): void {
    const gain = this.envelope(at, seconds, note.level * 0.32, 0.07, 0.1);
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency(note.pitch);
    this.vibrato(osc, at, 5.4, 5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency(note.pitch) * 4.5;
    filter.Q.value = 3;
    osc.connect(filter).connect(gain);
    osc.start(at);
    osc.stop(at + seconds + 0.2);
  }

  /**
   * A plucked string.
   *
   * This was a Karplus-Strong delay loop, which is the textbook way to do it
   * and the wrong way to do it here: a feedback loop through a biquad has a
   * small resonant peak just under the cutoff, the loop gain goes over unity in
   * that band, and instead of a string that rings you get one that grows until
   * the buffer is full of values that are not numbers — taking every other
   * instrument mixed with it down as well. It cost an afternoon and it sounded
   * no better than this: two detuned triangles and a hard decay, which is what
   * a plucked string mostly is to the ear and which cannot diverge.
   */
  private pluck(note: Note, at: number, seconds: number): void {
    const hz = frequency(note.pitch);
    const body = this.ctx.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.setValueAtTime(Math.min(hz * 9, 12000), at);
    // The high end goes first, as it does on a real string.
    body.frequency.exponentialRampToValueAtTime(Math.max(hz * 2, 200), at + seconds);
    body.Q.value = 0.7071;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(note.level * 0.45, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds + 0.25);
    body.connect(gain).connect(this.out);

    // Two of them, a few cents apart, which is what gives a plucked note its
    // shimmer rather than its pitch.
    for (const cents of [-4, 5]) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz * Math.pow(2, cents / 1200);
      osc.connect(body);
      osc.start(at);
      osc.stop(at + seconds + 0.3);
    }

    // A click of noise at the attack: the nail on the string.
    const nail = this.ctx.createBufferSource();
    nail.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = Math.min(hz * 4, 6000);
    band.Q.value = 1.2;
    const nailGain = this.envelope(at, 0.012, note.level * 0.3, 0.001, 0.03);
    nail.connect(band).connect(nailGain);
    nail.start(at);
    nail.stop(at + 0.08);
  }

  private bass(note: Note, at: number, seconds: number): void {
    const gain = this.envelope(at, seconds, note.level * 0.4, 0.01, 0.1);
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = frequency(note.pitch);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + seconds + 0.2);
  }

  /** A hand drum: a pitched thump for the open tone, a slap for the closed. */
  private conga(note: Note, at: number): void {
    const open = note.pitch > 0;
    const gain = this.envelope(at, open ? 0.32 : 0.14, note.level * 0.7, 0.002, 0.1);
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(open ? 210 : 320, at);
    osc.frequency.exponentialRampToValueAtTime(open ? 120 : 180, at + 0.12);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + 0.4);

    const skin = this.ctx.createBufferSource();
    skin.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = open ? 500 : 1400;
    band.Q.value = 1.4;
    const skinGain = this.envelope(at, 0.05, note.level * 0.35, 0.001, 0.03);
    skin.connect(band).connect(skinGain);
    skin.start(at);
    skin.stop(at + 0.1);
  }

  /** Two sticks: a short, hard, very high click with almost no body. */
  private clave(note: Note, at: number): void {
    const gain = this.envelope(at, 0.06, note.level * 0.5, 0.001, 0.04);
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 2200;
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + 0.1);
  }

  private shaker(note: Note, at: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const high = this.ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 5200;
    const gain = this.envelope(at, 0.05, note.level, 0.005, 0.04);
    source.connect(high).connect(gain);
    source.start(at);
    source.stop(at + 0.1);
  }

  /** One gain node shaped like a note: attack, hold, release. */
  private envelope(
    at: number,
    seconds: number,
    peak: number,
    attack: number,
    release: number,
  ): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.setValueAtTime(Math.max(0.0002, peak), at + Math.max(attack, seconds));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(attack, seconds) + release);
    gain.connect(this.out);
    return gain;
  }

  private vibrato(osc: OscillatorNode, at: number, hz: number, cents: number): void {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = hz;
    const depth = this.ctx.createGain();
    depth.gain.value = (osc.frequency.value * cents) / 1200;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + 8);
  }

  /** A one-off sound that is not part of the music. */
  effect(kind: Effect, at: number): void {
    const recipe = EFFECTS[kind];
    const gain = this.envelope(at, recipe.length, recipe.level, 0.004, recipe.length * 0.6);
    const osc = this.ctx.createOscillator();
    osc.type = recipe.wave;
    osc.frequency.setValueAtTime(recipe.from, at);
    osc.frequency.exponentialRampToValueAtTime(recipe.to, at + recipe.length);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + recipe.length + 0.3);

    if (recipe.noise > 0) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noise;
      const band = this.ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = recipe.from;
      band.Q.value = 0.8;
      const noiseGain = this.envelope(at, recipe.length * 0.5, recipe.noise, 0.002, 0.15);
      source.connect(band).connect(noiseGain);
      source.start(at);
      source.stop(at + recipe.length + 0.3);
    }
  }
}

export type Effect = "build" | "good" | "bad" | "warning" | "sail" | "coin";

interface EffectDef {
  wave: OscillatorType;
  from: number;
  to: number;
  length: number;
  level: number;
  noise: number;
}

/** Six noises, each meant to be recognisable without being looked at. */
const EFFECTS: Record<Effect, EffectDef> = {
  // A hammer on wood.
  build: { wave: "triangle", from: 420, to: 130, length: 0.12, level: 0.22, noise: 0.16 },
  // Rising, resolved.
  good: { wave: "sine", from: 520, to: 780, length: 0.22, level: 0.2, noise: 0 },
  // Falling, unresolved.
  bad: { wave: "sawtooth", from: 300, to: 110, length: 0.42, level: 0.2, noise: 0.06 },
  warning: { wave: "square", from: 440, to: 330, length: 0.18, level: 0.12, noise: 0 },
  // Canvas and water.
  sail: { wave: "sine", from: 180, to: 90, length: 0.6, level: 0.14, noise: 0.2 },
  coin: { wave: "triangle", from: 1400, to: 2100, length: 0.1, level: 0.16, noise: 0 },
};
