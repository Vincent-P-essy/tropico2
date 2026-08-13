/**
 * Plays the island and listens to it.
 *
 * The other harnesses check that the game runs. This one asks whether it is any
 * good to be in: who is on screen, what they are doing, what they say and in
 * which language, and whether the same four lines come round and round. It is
 * the closest thing to sitting and watching that a script can be.
 *
 *   node scripts/playtest.mjs [--months 10] [--seed 4242] [--samples 400]
 */

import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i]?.replace(/^--/, ""), process.argv[i + 1]);
}
const months = Number(args.get("months") ?? 10);
const seed = Number(args.get("seed") ?? 4242);
const samples = Number(args.get("samples") ?? 400);
const port = 5297;

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
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(`http://localhost:${port}/?seed=${seed}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.tropico !== undefined", { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector("#start .primary")?.click();
  });
  await page.evaluate(
    (count) => {
      window.tropico.advance(count);
    },
    24 * 30 * months,
  );

  const report = await page.evaluate(
    async ({ samples, port }) => {
      const { chatterFor, topicFor } = await import(
        `http://localhost:${port}/src/render/chatter.ts`
      );
      const state = window.tropico.state();

      const heard = [];
      const topics = new Map();
      const byNation = new Map();
      let onScreen = 0;
      let moving = 0;
      let indoors = 0;

      for (const person of state.people.values()) {
        if (person.activity === "dead" || person.activity === "atSea") continue;
        onScreen++;
        if (person.path.length > 0) moving++;
        if (person.inside >= 0) indoors++;
      }

      // Listen over a stretch of wall clock, as a player would.
      for (let step = 0; step < samples; step++) {
        const time = step * 0.4;
        for (const person of state.people.values()) {
          if (person.activity === "dead" || person.activity === "atSea") continue;
          const line = chatterFor(person, time, true);
          if (!line) continue;
          heard.push({ line, nation: person.nationality, kind: person.kind });
          const topic = topicFor(person, true);
          topics.set(topic, (topics.get(topic) ?? 0) + 1);
          byNation.set(person.nationality, (byNation.get(person.nationality) ?? 0) + 1);
        }
      }

      const distinct = new Map();
      for (const { line, nation, kind } of heard) {
        const key = `${nation}|${kind}|${line}`;
        distinct.set(key, (distinct.get(key) ?? 0) + 1);
      }

      return {
        people: onScreen,
        moving,
        indoors,
        buildings: state.buildings.size,
        heardCount: heard.length,
        distinctCount: distinct.size,
        topics: [...topics].sort((a, b) => b[1] - a[1]),
        byNation: [...byNation].sort((a, b) => b[1] - a[1]),
        sample: [...distinct.keys()].slice(0, 40),
        commonest: [...distinct].sort((a, b) => b[1] - a[1]).slice(0, 5),
      };
    },
    { samples, port },
  );

  console.log(`island   ${report.buildings} buildings · ${report.people} people`);
  console.log(
    `movement ${report.moving} walking · ${report.indoors} at a building · ` +
      `${report.people - report.moving - report.indoors} standing about`,
  );
  console.log(
    `speech   ${report.heardCount} lines heard, ${report.distinctCount} of them distinct`,
  );
  console.log(`nations  ${report.byNation.map(([n, c]) => `${n}=${c}`).join(" ")}`);
  console.log(`topics   ${report.topics.map(([t, c]) => `${t}=${c}`).join(" ")}`);
  console.log("");
  for (const key of report.sample) {
    const [nation, kind, line] = key.split("|");
    console.log(`  ${nation.padEnd(8)} ${kind.padEnd(8)} ${line}`);
  }
  console.log("");
  console.log("most repeated:");
  for (const [key, count] of report.commonest) {
    console.log(`  ${count}× ${key.split("|")[2]}`);
  }
} finally {
  await browser.close();
  shutdown();
}
