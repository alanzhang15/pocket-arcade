#!/usr/bin/env node
/* Headless test for arcade games. Plays each game with a simple input bot and checks:
     - it loads straight from its link (#id) with no console errors, on Steam Deck and iPhone screen sizes
     - it survives ~20 s of play (game over -> play again included)
     - frame cost (update + draw) and main-thread CPU load stay inside the battery budget
     - autosave (getState) round-trips through JSON and stays small
     - it uses no network, timers, or storage of its own
   Usage:  node tools/test-game.mjs [id ...] [--seconds 20]
   Screenshots land in test-output/<id>/. Exit code 1 if anything fails. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BUDGET = { p95FrameMs: 4, avgFrameMs: 2, cpuBusy: 0.35, runSaveBytes: 50_000 };
const args = process.argv.slice(2);
const secIdx = args.indexOf('--seconds');
const SECONDS = secIdx >= 0 ? +args[secIdx + 1] : 20;
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--seconds');
const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'games.json'), 'utf8')).games.map(g => g.id).filter(id => !only.length || only.includes(id));
if (!ids.length) { console.error('No matching games. Did you run python3 tools/build.py?'); process.exit(1); }

const types = { '.js': 'text/javascript', '.woff2': 'font/woff2', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]); if (url.endsWith('/')) url += 'index.html';
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

const results = [];
const browser = await chromium.launch();

for (const id of ids) {
  const out = path.join(ROOT, 'test-output', id); fs.mkdirSync(out, { recursive: true });
  const fails = [], warns = [];
  const src = fs.readFileSync(path.join(ROOT, 'games', id, 'game.js'), 'utf8');

  // ---- static checks: games must be self-contained and offline-safe
  if (/\b(fetch|XMLHttpRequest|WebSocket)\b/.test(src)) fails.push('uses the network (games must work offline)');
  if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(src)) fails.push('uses browser storage directly (use api.save / api.load so sync works)');
  if (/\bset(Interval|Timeout)\s*\(/.test(src)) warns.push('uses timers; prefer dt in update() so pause and battery modes work');
  if (/https?:\/\//.test(src.replace(/\/\/.*$/gm, ''))) fails.push('references an external URL');
  const drawBody = (src.match(/function draw\s*\([^)]*\)\s*\{([\s\S]*?)\n    \}/) || [])[1] || '';
  if (/shadowBlur\s*=\s*[1-9]/.test(drawBody)) warns.push('shadowBlur inside draw() is expensive; pre-render glows to a sprite');
  if (/create(Linear|Radial)Gradient/.test(drawBody)) warns.push('creates gradients every frame; build them once');

  // ---- Steam Deck screen: full play session with timing
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith(BASE)) fails.push(`network request to ${r.url()}`); });
  await page.goto(`${BASE}?test=1#${id}`);
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => Arcade._debug.state());
  if (state.mode !== 'game') fails.push('did not open straight into the game from its #link');

  const def = await page.evaluate(() => { const d = Arcade._debug.def(); return d && { pointer: !!d.pointer, fps: d.fps || 60, redraw: d.redraw || 'always', hasState: !!Arcade._debug.game().getState }; });
  // wrap update/draw to time them (re-wrapped after each restart)
  await page.evaluate(() => {
    window.__t = { frames: [], games: 0 };
    let wrapped = null;
    const wrap = () => {
      const g = Arcade._debug.game(); if (!g || g === wrapped) return;
      wrapped = g; window.__t.games++;
      const u = g.update.bind(g), d = g.draw.bind(g); let start = 0;
      g.update = dt => { start = performance.now(); return u(dt); };
      g.draw = (c, v) => { const r = d(c, v); window.__t.frames.push(performance.now() - start); return r; };
    };
    wrap(); setInterval(wrap, 50);
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const m0 = await metric(); const t0 = Date.now();

  // input bot: a mix of taps, holds, directions; pointer games get clicks around the play area
  const keys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyC', 'KeyX'];
  let overs = 0, shot = 0;
  while (Date.now() - t0 < SECONDS * 1000) {
    const st = await page.evaluate(() => Arcade._debug.state());
    if (st.sub === 'over') {
      overs++;
      if (overs === 1) await page.screenshot({ path: path.join(out, 'game-over.png') });
      await page.waitForTimeout(500); await page.click('[data-act="restart"]');
      continue;
    }
    if (def.pointer && Math.random() < 0.5) {
      await page.mouse.click(100 + Math.random() * 1080, 80 + Math.random() * 640);
    } else {
      const k = Math.random() < 0.5 ? 'Space' : keys[Math.floor(Math.random() * keys.length)];
      await page.keyboard.down(k); await page.waitForTimeout(60 + Math.random() * 300); await page.keyboard.up(k);
    }
    await page.waitForTimeout(40 + Math.random() * 160);
    if (shot < 2 && Date.now() - t0 > (shot + 1) * SECONDS * 333) await page.screenshot({ path: path.join(out, `play-${++shot}.png`) });
  }
  const m1 = await metric(); const wall = (Date.now() - t0) / 1000;
  const frames = await page.evaluate(() => window.__t.frames);
  frames.sort((a, b) => a - b);
  const avg = frames.reduce((s, x) => s + x, 0) / Math.max(1, frames.length);
  const p95 = frames[Math.floor(frames.length * 0.95)] || 0;
  const cpuBusy = (m1.TaskDuration - m0.TaskDuration) / wall;
  const heapMB = m1.JSHeapUsedSize / 1e6;
  if (frames.length < wall * 10) fails.push(`only ${frames.length} frames drawn in ${wall.toFixed(0)} s`);
  if (p95 > BUDGET.p95FrameMs) fails.push(`p95 frame ${p95.toFixed(2)} ms > ${BUDGET.p95FrameMs} ms budget`);
  else if (avg > BUDGET.avgFrameMs) warns.push(`average frame ${avg.toFixed(2)} ms > ${BUDGET.avgFrameMs} ms target`);
  if (cpuBusy > BUDGET.cpuBusy) warns.push(`main thread busy ${(cpuBusy * 100).toFixed(0)}% (headless, includes the test bot) > ${BUDGET.cpuBusy * 100}% target`);

  // ---- autosave round trip
  let saveBytes = 0;
  if (def.hasState) {
    const st = await page.evaluate(() => Arcade._debug.state());
    if (st.sub === 'over') await page.click('[data-act="restart"]'), await page.waitForTimeout(400);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const saved = await page.evaluate(id => { const s = Arcade._debug.data.saves[id + ':run']; return s && JSON.stringify(s.v); }, id);
    if (!saved || saved === 'null') fails.push('getState() exists but pausing saved nothing');
    else saveBytes = saved.length;
    if (saveBytes > BUDGET.runSaveBytes) fails.push(`run save is ${saveBytes} bytes (> ${BUDGET.runSaveBytes})`);
  }
  await page.screenshot({ path: path.join(out, 'deck-end.png') });
  errors.forEach(e => fails.push('error: ' + e));
  await ctx.close();

  // ---- iPhone landscape: loads and draws without errors
  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await phone.newPage(); const perr = [];
  pp.on('pageerror', e => perr.push(e.message));
  await pp.goto(`${BASE}?test=1#${id}`); await pp.waitForTimeout(400);
  await pp.touchscreen.tap(422, 195); await pp.waitForTimeout(1200);
  await pp.screenshot({ path: path.join(out, 'iphone.png') });
  perr.forEach(e => fails.push('iPhone error: ' + e));
  await phone.close();

  results.push({ id, fails, warns, stats: { frames: frames.length, avgMs: avg, p95Ms: p95, cpuBusy, heapMB, gameOvers: overs, saveBytes, mode: `${def.fps} fps / ${def.redraw}${def.pointer ? ' / pointer' : ''}` } });
}
await browser.close();
server.close();

let bad = 0;
for (const r of results) {
  const s = r.stats;
  console.log(`\n${r.fails.length ? 'FAIL' : 'PASS'}  ${r.id}  (${s.mode})`);
  console.log(`  frames ${s.frames} · avg ${s.avgMs.toFixed(2)} ms · p95 ${s.p95Ms.toFixed(2)} ms · CPU busy ${(s.cpuBusy * 100).toFixed(0)}% · heap ${s.heapMB.toFixed(1)} MB · game overs ${s.gameOvers}${s.saveBytes ? ` · run save ${s.saveBytes} B` : ''}`);
  r.fails.forEach(f => console.log('  ✗ ' + f));
  r.warns.forEach(w => console.log('  ! ' + w));
  if (r.fails.length) bad++;
}
console.log(`\nScreenshots: test-output/<id>/`);
process.exit(bad ? 1 : 0);
