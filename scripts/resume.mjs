/**
 * Plays a game, saves it, reloads the page, and goes back to it.
 *
 * The one thing unit tests cannot check, because it spans two page loads: that
 * a haven put into localStorage can be got out of it again through the screen a
 * player actually uses. The game could save for a long time before it could
 * load — nothing was wired to the way back — and only a check that reloads
 * would have noticed.
 *
 *   node scripts/resume.mjs
 */

import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

const port = 5288;
const months = 8;

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

const problems = [];
let failed = false;
const fail = (message) => {
  console.error(`fail ${message}`);
  failed = true;
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 800 });
  page.on("pageerror", (error) => problems.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });

  // Play a while, then save.
  await page.goto(`http://localhost:${port}/?seed=1650`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.tropico !== undefined", { timeout: 20000 });
  await page.evaluate(
    (count) => {
      window.tropico.advance(count);
    },
    24 * 30 * months,
  );
  const before = await page.evaluate(() => ({
    tick: window.tropico.state().tick,
    people: window.tropico.state().people.size,
  }));
  const saved = await page.evaluate(() => window.tropico.save());
  if (!saved) fail("the game would not save");

  // Come back with nothing in the URL: the start screen must offer the way back.
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#start", { timeout: 20000 });
  const label = await page.evaluate(
    () => document.querySelector("#start .resume")?.textContent ?? null,
  );
  if (!label) fail("no way back to the saved haven");

  if (label) {
    await page.click("#start .resume");
    await page.waitForFunction("document.querySelector('#start') === null", { timeout: 10000 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const after = await page.evaluate(() => ({
      tick: window.tropico.state().tick,
      people: window.tropico.state().people.size,
    }));

    // A little drift is right: the clock starts again the moment it loads.
    if (after.tick < before.tick || after.tick > before.tick + 200) {
      fail(`resumed at hour ${after.tick}, saved at ${before.tick}`);
    }
    if (Math.abs(after.people - before.people) > 2) {
      fail(`resumed with ${after.people} people, saved with ${before.people}`);
    }
    console.log(`  saved at hour ${before.tick} with ${before.people} people`);
    console.log(`  the way back read: ${label}`);
    console.log(`  came back at hour ${after.tick} with ${after.people} people`);
  }
} finally {
  await browser.close();
  shutdown();
}

if (problems.length > 0) fail(`console errors: ${problems.slice(0, 3).join(" | ")}`);
console.log(failed ? "fail the way back is broken" : "ok   saved, reloaded, and came back");
process.exit(failed ? 1 : 0);
