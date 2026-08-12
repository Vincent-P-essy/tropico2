/**
 * Renders a minute of the game's music offline and measures it.
 *
 * Music is the one part of this project that cannot be checked by reading the
 * output, and "no console errors" is not evidence that anything was heard. So
 * the real score and the real instruments are run through an OfflineAudioContext
 * in headless Chromium and the samples are looked at: silence, clipping and a
 * single stuck tone all fail here, and all three are what a broken synthesiser
 * actually produces.
 *
 *   node scripts/audio.mjs [--seconds 20] [--danger 0]
 */

import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i]?.replace(/^--/, ""), process.argv[i + 1]);
}
const seconds = Number(args.get("seconds") ?? 20);
const danger = Number(args.get("danger") ?? 0);
/** Render one instrument alone, which is how you find which one is broken. */
const only = args.get("only") ?? "";
const port = 5291;

const server = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"],
});
const shutdown = () => {
  if (!server.killed) server.kill("SIGTERM");
};
process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

for (let attempt = 0; attempt < 120; attempt++) {
  try {
    const response = await fetch(`http://localhost:${port}/`);
    if (response.ok) break;
  } catch {
    // Not up yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"],
});

let failed = false;
const fail = (message) => {
  console.error(`fail ${message}`);
  failed = true;
};

try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.tropico !== undefined", { timeout: 20000 });

  const report = await page.evaluate(
    async ({ seconds, danger, port, only }) => {
      const { writeBar } = await import(`http://localhost:${port}/src/audio/score.ts`);
      const { Instruments } = await import(`http://localhost:${port}/src/audio/synth.ts`);

      const rate = 44100;
      const ctx = new OfflineAudioContext(1, rate * seconds, rate);
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const instruments = new Instruments(ctx, master);

      const mood = { contentment: 1 - danger, danger };
      let at = 0;
      let bar = 0;
      let notes = 0;
      while (at < seconds) {
        const written = writeBar(1650, bar, mood);
        const sixteenth = 60 / written.tempo / 4;
        for (const note of written.notes) {
          if (only && note.voice !== only) continue;
          instruments.play(note, at + note.at * sixteenth, note.length * sixteenth);
          notes++;
        }
        at += sixteenth * 16;
        bar++;
      }

      const buffer = await ctx.startRendering();
      const data = buffer.getChannelData(0);

      let firstBad = -1;
      let peak = 0;
      let sum = 0;
      let clipped = 0;
      let crossings = 0;
      let quietWindows = 0;
      let windowPeak = 0;
      const windowSize = rate; // one second

      for (let i = 0; i < data.length; i++) {
        const value = data[i];
        if (!Number.isFinite(value) && firstBad < 0) firstBad = i;
        const size = Math.abs(value);
        if (size > peak) peak = size;
        if (size > windowPeak) windowPeak = size;
        if (size >= 0.999) clipped++;
        sum += value * value;
        if (i > 0 && data[i - 1] < 0 !== value < 0) crossings++;
        if ((i + 1) % windowSize === 0) {
          if (windowPeak < 0.002) quietWindows++;
          windowPeak = 0;
        }
      }

      return {
        firstBad,
        firstBadAt: firstBad < 0 ? null : firstBad / rate,
        bars: bar,
        notes,
        peak,
        rms: Math.sqrt(sum / data.length),
        clipped,
        crossings,
        quietWindows,
        windows: Math.floor(data.length / windowSize),
      };
    },
    { seconds, danger, port, only },
  );

  if (report.firstBad >= 0) {
    fail(
      `not a number at sample ${report.firstBad} (${report.firstBadAt.toFixed(3)}s)` +
        `${only ? ` playing ${only} alone` : ""}`,
    );
    console.log("  run again with --only <voice> to find which instrument diverges");
    process.exit(1);
  }

  console.log(
    `  ${report.bars} bars, ${report.notes} notes rendered over ${seconds}s at danger ${danger}`,
  );
  console.log(
    `  peak ${report.peak.toFixed(3)} · rms ${report.rms.toFixed(4)} · ` +
      `clipped ${report.clipped} samples · ${report.quietWindows}/${report.windows} silent seconds`,
  );

  if (report.notes < 10) fail("the score wrote almost nothing");
  if (report.peak < 0.02) fail(`silence: peak was ${report.peak.toFixed(4)}`);
  if (report.peak > 0.999) fail(`clipping: ${report.clipped} samples at full scale`);
  if (report.rms < 0.002) fail(`nearly silent: rms was ${report.rms.toFixed(5)}`);
  if (report.quietWindows > 1) fail(`${report.quietWindows} seconds of silence in the middle`);
  // A stuck oscillator crosses zero at exactly one rate; music does not.
  if (report.crossings < 1000) fail("no movement: this is one held tone, not music");
} finally {
  await browser.close();
  shutdown();
}

console.log(failed ? "fail the music is not playing" : "ok   the music renders and is audible");
process.exit(failed ? 1 : 0);
