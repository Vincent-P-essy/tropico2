/**
 * A contact sheet of everybody on the island, drawn large.
 *
 * The figures are sixteen pixels tall in play, which is the right size for the
 * game and the wrong size for deciding whether they look like people. This
 * draws one of each — nation, sex, rank, trade, and what they are doing — at
 * six times scale on a plain ground, so the character art can be looked at
 * rather than guessed at.
 *
 *   node scripts/figures.mjs [--out docs/figures.png] [--scale 6]
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import puppeteer from "puppeteer";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i]?.replace(/^--/, ""), process.argv[i + 1]);
}
const out = args.get("out") ?? "docs/figures.png";
const scale = Number(args.get("scale") ?? 6);
const port = 5296;

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
  await page.setViewport({ width: 1180, height: 1120, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${port}/?seed=1650`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.tropico !== undefined", { timeout: 20000 });

  await page.evaluate(
    async ({ scale, port }) => {
      const { drawPerson } = await import(`http://localhost:${port}/src/render/people.ts`);
      const state = window.tropico.state();

      document.body.innerHTML = "";
      document.body.style.background = "#c8b48a";
      const canvas = document.createElement("canvas");
      canvas.width = 1180;
      canvas.height = 1120;
      canvas.style.width = "1180px";
      canvas.style.height = "1120px";
      document.body.append(canvas);
      const ctx = canvas.getContext("2d");

      const template = [...state.people.values()][0];
      // The template is a real person off the island, and the first one happens
      // to be the captain — so every figure inherited his plumed hat until this
      // cleared it. A contact sheet that lies is worse than none.
      const make = (over) => ({
        ...structuredClone({
          ...template,
          path: [],
          carrying: null,
          job: null,
          captainId: null,
          wealthy: false,
          skeleton: false,
          rank: 0,
          activity: "idle",
        }),
        ...over,
      });

      const cast = [
        [
          "English landsman",
          make({ id: 1, kind: "pirate", sex: "male", nationality: "england", rank: 0 }),
        ],
        [
          "French landsman",
          make({ id: 2, kind: "pirate", sex: "male", nationality: "france", rank: 0 }),
        ],
        [
          "Spanish landsman",
          make({ id: 3, kind: "pirate", sex: "male", nationality: "spain", rank: 0 }),
        ],
        [
          "Woman of the band",
          make({ id: 4, kind: "pirate", sex: "female", nationality: "england", rank: 1 }),
        ],
        [
          "Bandana (rank 3)",
          make({ id: 5, kind: "pirate", sex: "male", nationality: "france", rank: 3 }),
        ],
        [
          "Tricorn (rank 6)",
          make({ id: 6, kind: "pirate", sex: "male", nationality: "spain", rank: 6 }),
        ],
        [
          "Captain",
          make({
            id: 7,
            kind: "pirate",
            sex: "female",
            nationality: "england",
            rank: 7,
            captainId: "annebonny",
          }),
        ],
        [
          "Guard",
          make({
            id: 8,
            kind: "pirate",
            sex: "male",
            nationality: "england",
            rank: 2,
            job: { building: 1, job: "guard" },
          }),
        ],
        [
          "Captive",
          make({ id: 9, kind: "captive", sex: "male", nationality: "spain", wealthy: false }),
        ],
        [
          "Captive woman",
          make({ id: 10, kind: "captive", sex: "female", nationality: "france", wealthy: false }),
        ],
        [
          "Lumberjack",
          make({
            id: 11,
            kind: "captive",
            sex: "male",
            nationality: "england",
            job: { building: 1, job: "lumberjack" },
            activity: "working",
          }),
        ],
        [
          "Server",
          make({
            id: 12,
            kind: "captive",
            sex: "female",
            nationality: "spain",
            job: { building: 1, job: "server" },
          }),
        ],
        [
          "Wealthy captive",
          make({ id: 13, kind: "captive", sex: "male", nationality: "france", wealthy: true }),
        ],
        [
          "Skeleton",
          make({ id: 14, kind: "captive", sex: "male", nationality: "england", skeleton: true }),
        ],
        [
          "Hauler, loaded",
          make({
            id: 15,
            kind: "captive",
            sex: "male",
            nationality: "england",
            job: { building: 1, job: "hauler" },
            carrying: { good: "corn", amount: 4 },
          }),
        ],
        [
          "Walking",
          make({
            id: 16,
            kind: "pirate",
            sex: "male",
            nationality: "france",
            rank: 4,
            path: [{ x: 9, y: 4 }],
          }),
        ],
        [
          "Walking away",
          make({
            id: 17,
            kind: "pirate",
            sex: "male",
            nationality: "spain",
            rank: 4,
            path: [{ x: -4, y: -4 }],
          }),
        ],
        [
          "Brawling",
          make({
            id: 18,
            kind: "pirate",
            sex: "male",
            nationality: "england",
            rank: 3,
            activity: "rioting",
          }),
        ],
        [
          "Running for it",
          make({
            id: 19,
            kind: "captive",
            sex: "female",
            nationality: "spain",
            activity: "fleeing",
            path: [{ x: 9, y: 4 }],
          }),
        ],
        [
          "At work",
          make({
            id: 20,
            kind: "captive",
            sex: "male",
            nationality: "france",
            job: { building: 1, job: "blacksmith" },
            activity: "working",
          }),
        ],
      ];

      // A flat island under them, so elevation sampling gives a sane answer.
      const flat = { ...state, island: { ...state.island, elevation: { sample: () => 0 } } };

      // A whole band of one rank, to show that no two pirates are the same man.
      for (let i = 0; i < 10; i++) {
        cast.push([
          `Hand ${i + 1}`,
          make({
            id: 40 + i,
            kind: "pirate",
            sex: i === 3 || i === 7 ? "female" : "male",
            nationality: ["england", "france", "spain"][i % 3],
            rank: 1 + (i % 4),
          }),
        ]);
      }

      const columns = 5;
      const cellW = 1180 / columns;
      const cellH = 178;
      ctx.font = "13px system-ui, sans-serif";
      ctx.textAlign = "center";

      cast.forEach(([label, person], index) => {
        const cx = (index % columns) * cellW + cellW / 2;
        const cy = Math.floor(index / columns) * cellH + cellH - 46;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        // drawPerson positions from the tile, so cancel that and draw at origin.
        const p = { ...person, x: 0, y: 0 };
        ctx.translate(0, 0);
        drawPerson(ctx, flat, p, 0.35);
        ctx.restore();

        ctx.fillStyle = "#3a2f22";
        ctx.fillText(label, cx, cy + 26);
      });
    },
    { scale, port },
  );

  await new Promise((resolve) => setTimeout(resolve, 300));
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  shutdown();
}
