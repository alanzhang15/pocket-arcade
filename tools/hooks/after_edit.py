#!/usr/bin/env python3
"""Claude Code PostToolUse hook: after any edit to the arcade, syntax-check the JS and rebuild.
Exit code 2 sends the error back to Claude so it fixes it right away."""
import json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
path = (data.get('tool_input') or {}).get('file_path') or ''
p = pathlib.Path(path)
try:
    rel = p.resolve().relative_to(ROOT)
except Exception:
    sys.exit(0)
if rel.parts and rel.parts[0] in ('games', 'js', 'css', 'index.html', 'manifest.webmanifest'):
    if p.suffix == '.js':
        r = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
        if r.returncode:
            print(f'Syntax error in {rel}:\n{r.stderr[-1500:]}', file=sys.stderr)
            sys.exit(2)
    r = subprocess.run(['python3', str(ROOT / 'tools' / 'build.py'), '--quiet'], capture_output=True, text=True)
    if r.returncode:
        print(f'tools/build.py failed:\n{(r.stdout + r.stderr)[-1500:]}', file=sys.stderr)
        sys.exit(2)
sys.exit(0)
