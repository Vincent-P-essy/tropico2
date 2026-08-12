/**
 * Measures what a frame costs, on the machine it is run on.
 *
 * "Is it heavy?" is not a question anybody should answer by guessing. This
 * plays the game to a given size, then times a few hundred real frames and
 * reports where they went: simulation, rendering, and the slowest one in the
 * run, which is what a player actually notices.
 *
 *   node scripts/profile.mjs [--months 18] [--frames 300] [--size 64]
 */

import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i]?.replace(/^--/, ""), process.argv[i + 1]);
}
const months = Number(args.get("months") ?? 18);
const frames = Number(args.get("frames") ?? 300);
const size = Number(args.get("size") ?? 64);
const port = 5292;

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
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/?seed=1650&size=${size}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction("window.tropico !== undefined", { timeout: 20000 });

  const menu = await page.$("#start");
  if (menu) {
    await page.evaluate(() => {
      document.querySelector("#start .primary")?.click();
    });
    await page.waitForFunction("document.querySelector('#start') === null", { timeout: 10000 });
  }

  await page.evaluate(
    (count) => {
      window.tropico.advance(count);
    },
    24 * 30 * months,
  );

  const world = await page.evaluate(() => {
    const state = window.tropico.state();
    return {
      buildings: state.buildings.size,
      people: state.people.size,
      island: state.island.width,
    };
  });

  // Let it settle, then time real animation frames with the clock running.
  await page.evaluate(() => {
    window.tropico.setSpeed(1);
  });
  await new Promise((resolve) => setTimeout(resolve, 700));

  const timings = await page.evaluate(async (count) => {
    const samples = [];
    let previous = performance.now();
    await new Promise((resolve) => {
      let seen = 0;
      const step = () => {
        const now = performance.now();
        samples.push(now - previous);
        previous = now;
        if (++seen >= count) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return samples.slice(5);
  }, frames);

  // And the simulation on its own, with nothing drawn.
  const simMs = await page.evaluate(() => {
    const start = performance.now();
    window.tropico.advance(240);
    return (performance.now() - start) / 240;
  });

  const sorted = [...timings].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const mean = timings.reduce((total, value) => total + value, 0) / timings.length;

  const memory = await page.evaluate(() =>
    performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  );

  console.log(
    `  island ${world.island}x${world.island}: ${world.buildings} buildings, ${world.people} people`,
  );
  console.log(
    `  frame  mean ${mean.toFixed(1)}ms · median ${at(0.5).toFixed(1)}ms · ` +
      `95th ${at(0.95).toFixed(1)}ms · worst ${sorted[sorted.length - 1].toFixed(1)}ms`,
  );
  console.log(
    `  fps    ${(1000 / mean).toFixed(0)} mean · ${(1000 / at(0.95)).toFixed(0)} at 95th`,
  );
  console.log(`  sim    ${simMs.toFixed(3)}ms per game-hour`);
  if (memory !== null) console.log(`  heap   ${memory} MB`);
} finally {
  await browser.close();
  shutdown();
}
