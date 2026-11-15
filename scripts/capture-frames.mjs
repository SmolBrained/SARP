/**
 * Renders the home-page globe flight once, as pictures, so visitors never have to draw the 3D map themselves.
 *
 *   npm run frames            (build, capture desktop and phone sets into public/frames, rebuild)
 *
 * It opens the built site in a headless Chromium on THIS computer (it needs internet for the map tiles), moves
 * the camera to each position from src/lib/framePath.ts, waits until the map has finished drawing, and saves a
 * picture. Takes a few minutes. Needs:  npm i -D playwright  &&  npx playwright install chromium
 * Environment: FRAME_WAIT_MS (max wait per frame, default 20000), VARIANTS (desktop,mobile).
 */
import { createServer } from "node:http";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "out");
const FRAMES = join(ROOT, "public", "frames");
const WAIT = Number(process.env.FRAME_WAIT_MS ?? 20000);
const SIZES = { desktop: { w: 1280, h: 720 }, mobile: { w: 540, h: 960 } };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webp": "image/webp" };

let chromium, sharp;
try { ({ chromium } = await import("playwright")); } catch { console.error("Missing playwright. Run:  npm i -D playwright  &&  npx playwright install chromium"); process.exit(1); }
try { sharp = (await import("sharp")).default; } catch { sharp = null; }

const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (p.endsWith("/")) p += "index.html";
    let f = join(OUT, p);
    if (!f.startsWith(OUT)) { res.writeHead(403).end(); return; }
    try { if ((await stat(f)).isDirectory()) f = join(f, "index.html"); } catch { /* handled below */ }
    const body = await readFile(f);
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const variants = (process.env.VARIANTS ?? "desktop,mobile").split(",");
for (const name of variants) {
  const { w, h } = SIZES[name];
  const dir = join(FRAMES, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${origin}/?capture`, { waitUntil: "load" });
  await page.addStyleTag({ content: ".lp-nav,.lp-sec,.lp-foot,.lp-scroll{visibility:hidden!important} .lp-pin{visibility:visible!important;transition:none!important} body{overflow:hidden!important}" });
  await page.waitForFunction(() => window.__sarp, null, { timeout: 60000 });
  const total = await page.evaluate(() => window.__sarp.timeline.cams.length);
  const anchors = await page.evaluate(() => window.__sarp.timeline.anchors);
  const ext = sharp ? "webp" : "jpg";
  console.log(`${name}: ${total} frames at ${w}x${h}`);
  for (let i = 0; i < total; i++) {
    await page.evaluate((idx) => {
      const { map, timeline, paddingFor } = window.__sarp;
      const c = timeline.cams[idx];
      map.jumpTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, padding: paddingFor(c.from, c.to, c.t, innerWidth, innerHeight) });
      window.__sarp.sweep(0);
    }, i);
    await page.evaluate((max) => new Promise((done) => {
      const m = window.__sarp.map; const t0 = Date.now();
      const check = () => { if (m.loaded() && m.areTilesLoaded()) setTimeout(done, 150); else if (Date.now() - t0 > max) done(); else setTimeout(check, 100); };
      m.triggerRepaint(); setTimeout(check, 200);
    }), WAIT);
    await page.evaluate(() => window.__sarp.radar.settle()); // towers: footprints arrive with the tiles, so extrude them and wait for the redraw
    const shot = await page.screenshot({ type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: w, height: h }, timeout: 120000 });
    const file = `f${String(i).padStart(4, "0")}.${ext}`;
    await writeFile(join(dir, file), sharp ? await sharp(shot).webp({ quality: 72 }).toBuffer() : shot);
    if (i % 10 === 0) process.stdout.write(`  ${i}/${total}\r`);
  }
  // the hero loop: the orbit sweep crossing the globe at the opening camera
  const LOOP = 26;
  await page.evaluate((idx) => {
    const { map, timeline, paddingFor } = window.__sarp;
    const c = timeline.cams[idx];
    map.jumpTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, padding: paddingFor(c.from, c.to, c.t, innerWidth, innerHeight) });
    document.querySelectorAll(".lp-pin").forEach((e) => { e.style.opacity = "1"; });
  }, anchors.top);
  for (let k = 0; k < LOOP; k++) {
    await page.evaluate((p) => window.__sarp.sweep(p), (k / (LOOP - 1)) * 1.22);
    await page.waitForTimeout(120);
    const shot = await page.screenshot({ type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: w, height: h }, timeout: 120000 });
    await writeFile(join(dir, `l${String(k).padStart(4, "0")}.${ext}`), sharp ? await sharp(shot).webp({ quality: 72 }).toBuffer() : shot);
  }
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ v: 1, built: Date.now(), w, h, ext, count: total, loop: LOOP, anchors }));
  await page.context().close();
  console.log(`${name}: done`);
}
await browser.close();
server.close();
