/**
 * Runs the game in Chrome and in Firefox, and checks it drew something.
 *
 * Two engines, because one engine tells you about one engine. This found a
 * `let` read before its declaration — a temporal dead zone the bundler was
 * happy with and Chrome had cached its way past, which Firefox reported by
 * name on the first run and which would have shipped a blank page to anybody
 * not using Chrome.
 *
 *   node scripts/browsers.mjs
 *
 * Firefox has to be fetched once: npx puppeteer browsers install firefox
 */

import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

const port = 5295;
const months = 6;

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

let failed = false;

for (const engine of ["chrome", "firefox"]) {
  let browser;
  try {
    browser = await puppeteer.launch({ browser: engine, headless: true });
  } catch (error) {
    console.log(`  ${engine}: not installed, skipped (${String(error).split("\n")[0]})`);
    continue;
  }

  const problems = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    await page.setViewport({ width: 1400, height: 800 });
    await page.goto(`http://localhost:${port}/?seed=1650`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("window.tropico !== undefined", { timeout: 40000 });
    await page.evaluate(() => {
      document.querySelector("#start .primary")?.click();
    });
    await page.evaluate(
      (count) => {
        window.tropico.advance(count);
      },
      24 * 30 * months,
    );
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const report = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const context = canvas.getContext("2d");
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colours = new Set();
      for (let i = 0; i < pixels.length; i += 4000) {
        colours.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      }
      return {
        buildings: window.tropico.state().buildings.size,
        colours: colours.size,
        offscreen: typeof OffscreenCanvas !== "undefined",
      };
    });

    console.log(
      `  ${engine}: ${report.buildings} buildings, ${report.colours} colours on the canvas` +
        `${report.offscreen ? "" : " (no OffscreenCanvas, drawing to a plain one)"}`,
    );
    if (report.colours < 20) {
      console.error(`fail ${engine} drew almost nothing`);
      failed = true;
    }
    if (problems.length > 0) {
      console.error(`fail ${engine}: ${problems.slice(0, 3).join(" | ")}`);
      failed = true;
    }
  } finally {
    await browser.close();
  }
}

shutdown();
console.log(failed ? "fail one of the engines is unhappy" : "ok   runs in both engines");
process.exit(failed ? 1 : 0);
