#!/usr/bin/env python3
"""Refresh the service worker's file list and version.

Run from the project root after adding or changing any game or file:
    python3 tools/build.py
Every installed copy will then show an "Update" button the next time it opens online.
"""
import hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {'tools', 'preview', 'steam-art', '.git', '.github'}
SKIP_FILES = {'sw.js', 'README.md', '.DS_Store', 'CNAME', '.nojekyll'}

files = sorted(
    p.relative_to(ROOT).as_posix()
    for p in ROOT.rglob('*')
    if p.is_file() and p.parts[len(ROOT.parts)] not in SKIP_DIRS and p.name not in SKIP_FILES
)
digest = hashlib.sha256()
for f in files:
    digest.update(f.encode()); digest.update((ROOT / f).read_bytes())
build = digest.hexdigest()[:10]

assets = ['./'] + files
template = (ROOT / 'tools' / 'sw.template.js').read_text()
out = template.replace("'__BUILD__'", json.dumps(build)).replace('__ASSETS__', json.dumps(assets, indent=2))
(ROOT / 'sw.js').write_text(out)
print(f'sw.js build {build}: {len(assets)} files cached for offline')
