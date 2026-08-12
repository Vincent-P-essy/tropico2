import { writeBar, type Mood } from "./score.ts";
import { Instruments, type Effect } from "./synth.ts";

/**
 * The one thing the game talks to about sound.
 *
 * It holds a clock a little ahead of the music, hands the next bar to the
 * instruments before it is due, and takes the island's mood as it changes. It
 * is also the only file that knows a browser is involved: everything about
 * whether a note exists lives in score.ts, and everything about what a note
 * sounds like lives in synth.ts.
 *
 * Nothing starts until the player has touched something. Browsers refuse to
 * make noise before that, and quite right too.
 */

const MUTE_KEY = "tropico2.muted";

/** How far ahead of the music the scheduler works, in seconds. */
const LOOKAHEAD = 0.35;

export class Sound {
  private ctx: AudioContext | null = null;
  private instruments: Instruments | null = null;
  private timer: number | null = null;

  private readonly seed: number;
  private mood: Mood = { contentment: 0.5, danger: 0 };
  private bar = 0;
  /** When the next bar is due, on the audio clock. */
  private nextBarAt = 0;
  private muted = readMuted();

  constructor(seed: number) {
    this.seed = seed;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Starts, if it can and should.
   *
   * Called on every input rather than once, because the first call may land
   * before the browser is willing and there is no way to ask politely.
   */
  start(): void {
    if (this.muted || this.ctx) return;
    // Constructing one can fail — an embedded view with no audio device, a
    // browser that has run out of contexts, a policy that forbids it. A page
    // with no sound is a page with no sound, not a page that throws.
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      this.ctx = ctx;
      this.instruments = new Instruments(ctx, master);
      this.nextBarAt = ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => {
        this.schedule();
      }, 120);
    } catch {
      this.muted = true;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeMuted(this.muted);
    if (this.muted) this.stop();
    else this.start();
    return this.muted;
  }

  private stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.instruments = null;
  }

  /** The island's state, in the two numbers the music is written from. */
  setMood(contentment: number, danger: number): void {
    this.mood = {
      contentment: clamp01(contentment),
      danger: clamp01(danger),
    };
  }

  play(effect: Effect): void {
    if (!this.ctx || !this.instruments) return;
    this.instruments.effect(effect, this.ctx.currentTime + 0.01);
  }

  /**
   * Hands over any bar that falls due within the lookahead.
   *
   * Web Audio schedules against its own clock, which runs on the audio thread
   * and does not stutter when the renderer does. So the notes are handed over
   * early with exact times rather than played from a timer: a dropped frame
   * costs a frame, not a beat.
   */
  private schedule(): void {
    const ctx = this.ctx;
    const instruments = this.instruments;
    if (!ctx || !instruments) return;

    while (this.nextBarAt < ctx.currentTime + LOOKAHEAD) {
      const bar = writeBar(this.seed, this.bar, this.mood);
      const sixteenth = 60 / bar.tempo / 4;
      for (const note of bar.notes) {
        instruments.play(note, this.nextBarAt + note.at * sixteenth, note.length * sixteenth);
      }
      this.nextBarAt += sixteenth * 16;
      this.bar++;
    }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // No storage: the setting simply does not survive the session.
  }
}
