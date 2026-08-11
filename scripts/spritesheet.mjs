/** Renders every building sprite onto one sheet, so the art can be eyeballed. */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer";

const port = 5274;
const server = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"],
});
const shutdown = () => {
  if (!server.killed) server.kill("SIGTERM");
};
process.on("exit", shutdown);
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch(`http://localhost:${port}/`);
    if (r.ok) break;
  } catch {
    // Dev server is not listening yet; try again shortly.
  }
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1500, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction("window.tropico !== undefined", { timeout: 20000 });

await page.evaluate(async () => {
  const { buildAtlas, buildingSprite } = await import("/src/render/sprites.ts");
  const { BUILDINGS } = await import("/src/data/buildings.ts");
  const atlas = buildAtlas();
  document.body.innerHTML = "";
  const sheet = document.createElement("canvas");
  sheet.width = 1500;
  sheet.height = 1500;
  sheet.style.position = "fixed";
  sheet.style.inset = "0";
  sheet.style.zIndex = "9999";
  document.body.append(sheet);
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#3a6b48";
  ctx.fillRect(0, 0, 1500, 1500);
  const ids = Object.keys(BUILDINGS).filter((i) => i !== "road");
  const cols = 8,
    cell = 186;
  ids.forEach((id, i) => {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * cell + cell - 34;
    const s = buildingSprite(atlas, id, 4);
    if (s) ctx.drawImage(s.canvas, cx - s.anchorX, cy - s.anchorY, s.canvas.width, s.canvas.height);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(cx - cell / 2 + 2, cy + 4, cell - 4, 14);
    ctx.fillStyle = "#fff";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(id, cx, cy + 15);
  });
});
await new Promise((r) => setTimeout(r, 400));
await mkdir("docs", { recursive: true });
await page.screenshot({ path: "docs/spritesheet.png" });
console.log("wrote docs/spritesheet.png");
await browser.close();
shutdown();
process.exit(0);
