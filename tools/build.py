#!/usr/bin/env python3
"""Build step. Run from the project root after adding or changing anything:  python3 tools/build.py

1. Finds every games/<id>/game.js and inserts its <script> tag into index.html (between the games:start/end markers).
2. Writes games.json (id, title, blurb, art) — the Steam Deck tile installer reads this.
3. Refreshes sw.js with the offline file list and a content hash, so installed copies offer an "Update".
"""
import hashlib, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUIET = '--quiet' in sys.argv
ART_KINDS = ['cover', 'wide', 'hero', 'logo']

# ---- 1. discover games -------------------------------------------------------
games = []
for gdir in sorted((ROOT / 'games').iterdir()):
    js = gdir / 'game.js'
    if not js.is_file():
        continue
    src = js.read_text()
    def field(name):
        m = re.search(rf"\b{name}\s*:\s*(['\"`])((?:\\.|(?!\1).)*)\1", src)
        return m.group(2).replace("\\'", "'") if m else None
    gid = field('id')
    if gid != gdir.name:
        sys.exit(f"games/{gdir.name}/game.js: id '{gid}' must match its folder name '{gdir.name}'")
    art = {k: f'games/{gid}/art/{k}.png' for k in ART_KINDS if (gdir / 'art' / f'{k}.png').is_file()}
    games.append({'id': gid, 'title': field('title') or gid, 'blurb': field('blurb') or '', 'art': art})

# optional ordering: games/order.txt (one id per line); otherwise alphabetical
order_file = ROOT / 'games' / 'order.txt'
if order_file.is_file():
    order = [l.strip() for l in order_file.read_text().splitlines() if l.strip() and not l.startswith('#')]
    games.sort(key=lambda g: order.index(g['id']) if g['id'] in order else len(order))

# ---- 2. index.html script tags + games.json -----------------------------------
index = ROOT / 'index.html'
html = index.read_text()
tags = '\n'.join(f'<script src="games/{g["id"]}/game.js"></script>' for g in games)
new_html, n = re.subn(r'(<!-- games:start[^>]*-->)(.*?)(<!-- games:end -->)', lambda m: f'{m.group(1)}\n{tags}\n{m.group(3)}', html, flags=re.S)
if n != 1:
    sys.exit('index.html is missing the <!-- games:start --> / <!-- games:end --> markers')
if new_html != html:
    index.write_text(new_html)
(ROOT / 'games.json').write_text(json.dumps({'games': games}, indent=2) + '\n')

# ---- 3. service worker --------------------------------------------------------
SKIP_DIRS = {'tools', 'preview', 'deck', '.git', '.github', '.claude', 'node_modules', 'test-output'}
SKIP_FILES = {'sw.js', 'README.md', 'CLAUDE.md', '.DS_Store', 'CNAME', '.nojekyll', '.gitignore'}
def wanted(p):
    rel = p.relative_to(ROOT)
    if rel.parts[0] in SKIP_DIRS or p.name in SKIP_FILES:
        return False
    if len(rel.parts) >= 3 and rel.parts[0] == 'games' and rel.parts[2] == 'art':
        return False  # Steam artwork isn't needed by the app itself
    return True

files = sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and wanted(p))
digest = hashlib.sha256()
for f in files:
    digest.update(f.encode()); digest.update((ROOT / f).read_bytes())
build = digest.hexdigest()[:10]
assets = ['./'] + files
template = (ROOT / 'tools' / 'sw.template.js').read_text()
(ROOT / 'sw.js').write_text(template.replace("'__BUILD__'", json.dumps(build)).replace('__ASSETS__', json.dumps(assets, indent=2)))

if not QUIET:
    missing = [g['id'] for g in games if len(g['art']) < len(ART_KINDS)]
    print(f'build {build}: {len(games)} game(s), {len(assets)} files cached for offline')
    if missing:
        print('  missing Steam art (run: node tools/render-art.mjs):', ', '.join(missing))
