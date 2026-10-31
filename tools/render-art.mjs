#!/usr/bin/env node
/* Renders Steam library artwork for every game (or the ids you pass) into games/<id>/art/.
     node tools/render-art.mjs            # games missing any art
     node tools/render-art.mjs --all      # re-render everything
     node tools/render-art.mjs cave-flyer # one game
   Each game's optional art(ctx, w, h, kind) hook paints the scene; this tool adds the title in the
   arcade's house style so every tile looks like part of one collection. Games without an art() hook
   get their menu thumbnail scaled up as the scene. Needs Playwright (preinstalled in Claude's cloud workspace). */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = { cover: [600, 900], wide: [920, 430], hero: [1920, 620], logo: [1280, 360] };

const args = process.argv.slice(2);
const all = args.includes('--all');
const only = args.filter(a => !a.startsWith('--'));
const ids = fs.readdirSync(path.join(ROOT, 'games')).filter(id => fs.existsSync(path.join(ROOT, 'games', id, 'game.js')))
  .filter(id => only.length ? only.includes(id) : all || Object.keys(KINDS).some(k => !fs.existsSync(path.join(ROOT, 'games', id, 'art', `${k}.png`))));
if (!ids.length) { console.log('All games already have art. Use --all to re-render.'); process.exit(0); }

// tiny static server so fonts and scripts load like on the real site
const types = { '.js': 'text/javascript', '.woff2': 'font/woff2', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/__art.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const PAGE = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Silkscreen;font-weight:400;src:url(/fonts/silkscreen-latin-400-normal.woff2)}
@font-face{font-family:Silkscreen;font-weight:700;src:url(/fonts/silkscreen-latin-700-normal.woff2)}
body{margin:0;background:transparent}</style><canvas id="c"></canvas>
<script>window.Arcade={register(d){window.GAME=d}};</script>
<script>
function render(kind, W, H) {
  const g = window.GAME, c = document.getElementById('c'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.clearRect(0, 0, W, H);
  if (kind !== 'logo') {
    if (g.art) g.art(x, W, H, kind);
    else if (g.thumb) { // fallback: scale the 112x84 menu thumbnail to cover the canvas
      const t = document.createElement('canvas'); t.width = 448; t.height = 336; const tx = t.getContext('2d'); tx.scale(4, 4); g.thumb(tx, 112, 84);
      const s = Math.max(W / 448, H / 336); x.imageSmoothingQuality = 'high';
      x.drawImage(t, (W - 448 * s) / 2, (H - 336 * s) / 2, 448 * s, 336 * s);
      const v = x.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(7,10,23,.55)'); v.addColorStop(.5, 'rgba(7,10,23,0)'); v.addColorStop(1, 'rgba(7,10,23,.6)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    } else { x.fillStyle = '#0d1124'; x.fillRect(0, 0, W, H); }
  }
  if (kind === 'hero') return; // Steam overlays the logo on the hero
  const title = (g.title || g.id).toUpperCase();
  const words = title.split(' ');
  const lines = kind === 'cover' && words.length > 1 ? (() => { const h = Math.ceil(words.length / 2); return [words.slice(0, h).join(' '), words.slice(h).join(' ')]; })() : [title];
  let size = kind === 'cover' ? W * 0.2 : kind === 'logo' ? H * 0.42 : H * 0.2;
  x.font = '700 ' + size + 'px Silkscreen';
  const widest = Math.max(...lines.map(l => x.measureText(l).width));
  if (widest > W * 0.9) size *= W * 0.9 / widest;
  x.font = '700 ' + size + 'px Silkscreen'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((t, i) => {
    const ty = kind === 'cover' ? H * 0.12 + i * size * 1.05 + size * 0.5 : kind === 'logo' ? H * 0.5 : H * 0.2;
    x.lineWidth = size * 0.14; x.strokeStyle = '#070a17'; x.strokeText(t, W / 2, ty);
    x.shadowColor = 'rgba(255,181,71,.6)'; x.shadowBlur = size * 0.25; x.fillStyle = '#ffb547'; x.fillText(t, W / 2, ty); x.shadowBlur = 0;
  });
  if (kind === 'cover') { x.font = '400 ' + (W * 0.045) + 'px Silkscreen'; x.fillStyle = '#e9ecff'; x.fillText('POCKET ARCADE', W / 2, H * 0.93); }
}
</script>`;

const browser = await chromium.launch();
try {
  for (const id of ids) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/__art.html`);
    await page.addScriptTag({ url: `/games/${id}/game.js` });
    await page.evaluate(async () => { await document.fonts.load('700 40px Silkscreen'); await document.fonts.load('400 40px Silkscreen'); });
    const dir = path.join(ROOT, 'games', id, 'art');
    fs.mkdirSync(dir, { recursive: true });
    for (const [kind, [w, h]] of Object.entries(KINDS)) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(([k, w, h]) => render(k, w, h), [kind, w, h]);
      await page.locator('#c').screenshot({ path: path.join(dir, `${kind}.png`), omitBackground: true });
    }
    await page.close();
    console.log(`art: ${id}`);
  }
} finally {
  await browser.close();
  server.close();
}
