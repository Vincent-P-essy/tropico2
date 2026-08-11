/**
 * Boots the real game in headless Chromium, plays it, and photographs it.
 *
 * This is the harness that keeps the README honest: the screenshot in it is
 * produced by this script from the actual game, not staged. It also doubles as
 * an end-to-end test — if the island fails to generate, the sprites fail to
 * build, or the loop throws, this exits non-zero with the console output.
 *
 *   node scripts/screenshot.mjs [--months 18] [--seed 1650] [--out docs/screenshot.png]
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import puppeteer from "puppeteer";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i]?.replace(/^--/, ""), process.argv[i + 1]);
}

const months = Number(args.get("months") ?? 18);
const seed = Number(args.get("seed") ?? 1650);
const out = args.get("out") ?? "docs/screenshot.png";
const overlay = args.get("overlay") ?? "none";
const width = Number(args.get("width") ?? 1600);
const height = Number(args.get("height") ?? 900);
const zoom = Number(args.get("zoom") ?? 1.15);
const port = 5273;

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

await waitForServer(`http://localhost:${port}/`);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"],
});

let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });

  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(String(error)));

  // Not networkidle0: Vite keeps an HMR websocket open, so the network is never
  // idle and the wait would time out on a page that loaded perfectly.
  await page.goto(`http://localhost:${port}/?seed=${seed}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.tropico !== undefined", { timeout: 20000 });

  // The game opens on a start screen unless the URL names an episode. Go through
  // it rather than around it, so this harness exercises the path a player takes.
  const menu = await page.$("#start");
  if (menu) {
    await page.evaluate(() => {
      document.querySelector("#start .primary")?.click();
    });
    await page.waitForFunction("document.getElementById('start') === null", { timeout: 10000 });
  }

  // Play the island forward with the clock paused, so the run is deterministic
  // and does not depend on how fast the machine renders.
  await page.evaluate((ticks) => {
    window.tropico.setSpeed(0);
    window.tropico.advance(ticks);
  }, months * 720);

  const summary = await page.evaluate((z) => {
    const state = window.tropico.state();
    const island = state.island;
    let pirates = 0;
    let captives = 0;
    let mood = 0;
    for (const person of state.people.values()) {
      if (person.activity === "dead") continue;
      if (person.kind === "pirate") pirates++;
      else captives++;
      mood += person.mood;
    }
    // Frame the settlement rather than whatever the camera happened to show.
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const b of state.buildings.values()) {
      if (b.def === "road") continue;
      sx += b.x;
      sy += b.y;
      n++;
    }
    if (n > 0) window.tropico.lookAt(sx / n, sy / n);
    window.tropico.zoom(z);
    return {
      buildings: state.buildings.size,
      pirates,
      captives,
      mood: n > 0 ? mood / (pirates + captives || 1) : 0,
      lumber: Math.round(state.lumber),
      treasury: Math.round(state.treasury),
      tick: state.tick,
      width: island.width,
    };
  }, zoom);

  if (overlay !== "none") {
    await page.evaluate((value) => {
      window.tropico.setOverlay(value);
    }, overlay);
  }

  // Let a few frames render so animation and the HUD settle.
  await new Promise((resolve) => setTimeout(resolve, 900));

  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });

  const canvasFilled = await page.evaluate(() => {
    const canvas = document.getElementById("view");
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 997) {
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return seen.size;
  });

  console.log(`wrote ${out}`);
  console.log(
    `  after ${months} months: ${summary.buildings} buildings, ${summary.pirates} pirates, ` +
      `${summary.captives} captives, ${summary.lumber} lumber, ${summary.treasury}g`,
  );
  console.log(`  distinct colours sampled on the canvas: ${canvasFilled}`);

  // The checks that make this a test and not just a photograph.
  const checks = [
    [summary.tick >= months * 720, "the simulation advanced"],
    [summary.buildings > 8, "the island has an opening settlement"],
    [summary.pirates > 0, "pirates are alive"],
    [summary.captives > 0, "captives are alive"],
    [canvasFilled > 25, "the canvas is actually drawing a scene"],
    [problems.length === 0, `no console errors (${problems.slice(0, 3).join(" | ")})`],
  ];
  for (const [ok, label] of checks) {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failed = true;
  }
} catch (error) {
  console.error(error);
  failed = true;
} finally {
  await browser.close();
  shutdown();
}

process.exit(failed ? 1 : 0);

async function waitForServer(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`dev server never came up at ${url}`);
}
