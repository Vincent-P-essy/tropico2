import { spawn } from "node:child_process";
import puppeteer from "puppeteer";
const port = 5299;
const server = spawn("npx", ["vite","--port",String(port),"--strictPort"], { stdio:["ignore","pipe","pipe"] });
process.on("exit", () => { if (!server.killed) server.kill("SIGTERM"); });
for (let i=0;i<120;i++){ try{ const r=await fetch(`http://localhost:${port}/`); if(r.ok) break; }catch{} await new Promise(r=>setTimeout(r,250)); }
const b = await puppeteer.launch({ headless:true, args:["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width:1500, height:900, deviceScaleFactor:2 });
await p.goto(`http://localhost:${port}/`, { waitUntil:"domcontentloaded" });
await p.waitForSelector("#start", { timeout:20000 });
await new Promise(r=>setTimeout(r,500));
await p.screenshot({ path:"/tmp/claude-1000/-home-vincent/e9f8f976-6535-46a3-9d32-d06d069a43e1/scratchpad/title.png" });
console.log("tab title:", await p.title());
console.log("screen title:", await p.evaluate(() => document.querySelector("#start h1")?.textContent));
await b.close(); if (!server.killed) server.kill("SIGTERM");
