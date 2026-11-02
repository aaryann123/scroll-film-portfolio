// Regenerates docs/screenshots/*.png from a running dev server in headless Chrome.
// Usage: npm run dev, then: node Tools/screenshots.mjs [http://localhost:5757]   (Node 22+, Chrome; CHROME=… to override)
// Needs the rendered frame sequences in public/films/<shot>/ for the film to move; without them you get the stills.
// ponytail: Node's built-in WebSocket speaks the DevTools protocol, so no puppeteer.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] ?? "http://localhost:5757";
const OUT = "docs/screenshots";
// Scroll to `t` of the way through a shot's slot, then wait until that shot's frames are decoded.
const at = (shot, t) => `(() => { const s = document.querySelector('.slot[data-shot="${shot}"]'); scrollTo(0, s.getBoundingClientRect().top + scrollY + s.offsetHeight * ${t}); })()`;
const loaded = shot => `(() => { const s = __scene.shots.find(x => x.id === "${shot}"); return s.missing || s.bitmaps.filter(Boolean).length >= s.frames; })()`;
const SHOTS = [
  { name: "opener", wait: loaded("open-drape"), settle: 5500 },
  { name: "foundations", js: at("panels", 0.4), wait: loaded("panels") },
  { name: "dayjob", js: at("panels-b", 0.45), wait: loaded("panels-b") },
  { name: "dissolve", js: at("polish", 0.9), wait: loaded("wheels") },
  { name: "questions", js: at("horizon", 0.3), wait: loaded("horizon"), height: 640 },   // the Q&A needs a taller window
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "shots-"))}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0; const waiting = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); waiting.delete(m.id); };
  const send = (method, params = {}) => new Promise((res, rej) => { waiting.set(++id, m => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const run = async expression => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? expression); return r.result.value; };

  mkdirSync(OUT, { recursive: true });
  for (const s of SHOTS) {
    await send("Emulation.setDeviceMetricsOverride", { width: 800, height: s.height ?? 500, deviceScaleFactor: 2, mobile: false }); // 1600 px wide
    await send("Page.navigate", { url: `${BASE}/?open=open-drape` });
    await sleep(300);
    while (!(await run("document.readyState === 'complete' && !!window.__scene"))) await sleep(100);
    if (s.js) await run(s.js);
    while (!(await run(s.wait))) await sleep(200);
    await sleep(s.settle ?? 2500);                       // let the eased scroll position catch up
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/${s.name}.png`, Buffer.from(data, "base64"));
    console.log(`${OUT}/${s.name}.png`);
  }
  ws.close();
} finally { chrome.kill(); }
