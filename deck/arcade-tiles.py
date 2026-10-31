#!/usr/bin/env python3
"""Pocket Arcade tiles for Steam Deck.

Adds (or refreshes) one Steam library tile per arcade game, plus a "Pocket Arcade" menu tile,
each with cover, banner, background, logo and icon. Re-run it any time new games are published:
it updates existing tiles in place (keeping play time and controller settings) and removes tiles
for games that no longer exist. Your other non-Steam shortcuts are left untouched, and the
shortcuts file is backed up before every change.

Run in Desktop Mode (Konsole):
    curl -fsSL https://alanzhang15.github.io/pocket-arcade/deck/arcade-tiles.py | python3 -

Options: --dry-run (show what would change), --no-restart (don't reopen Steam afterwards),
         --url <arcade url>, --no-desktop-shortcut
"""
import json, os, pathlib, shutil, struct, subprocess, sys, time, urllib.request, zlib

ARCADE_URL = 'https://alanzhang15.github.io/pocket-arcade/'
CHROME_FLATPAK = 'com.google.Chrome'
DEFAULT_EXE = '"/usr/bin/flatpak"'
DEFAULT_START = '"/usr/bin/"'
DEFAULT_BASE_OPTS = f'run --branch=stable --arch=x86_64 --command=/app/bin/chrome --file-forwarding {CHROME_FLATPAK} @@u @@'
CHROME_FLAGS = '--kiosk --autoplay-policy=no-user-gesture-required'
MENU_TILE = 'Pocket Arcade'

args = sys.argv[1:]
DRY = '--dry-run' in args
NO_RESTART = '--no-restart' in args
if '--url' in args:
    ARCADE_URL = args[args.index('--url') + 1].rstrip('/') + '/'
HOME = pathlib.Path(os.environ.get('HOME', '~')).expanduser()
STEAM = pathlib.Path(os.environ.get('ARCADE_STEAM_DIR', HOME / '.local/share/Steam'))

# ---------------------------------------------------------------- binary VDF (shortcuts.vdf)
# Types: 0x00 map, 0x01 string, 0x02 int32, 0x03 float32, 0x07 uint64, 0x08 end of map.
# Values are stored as (type, value) so unknown fields round-trip byte for byte.
def _cstr(buf, i):
    j = buf.index(b'\x00', i)
    return buf[i:j].decode('utf-8', 'surrogateescape'), j + 1

def vdf_load(buf, i=0):
    out = {}
    while True:
        t = buf[i]; i += 1
        if t == 0x08:
            return out, i
        key, i = _cstr(buf, i)
        if t == 0x00:
            val, i = vdf_load(buf, i)
        elif t == 0x01:
            val, i = _cstr(buf, i)
        elif t == 0x02:
            val = struct.unpack_from('<i', buf, i)[0]; i += 4
        elif t == 0x03:
            val = struct.unpack_from('<f', buf, i)[0]; i += 4
        elif t == 0x07:
            val = struct.unpack_from('<Q', buf, i)[0]; i += 8
        else:
            raise ValueError(f'unknown VDF type 0x{t:02x} at byte {i - 1}')
        out[key] = (t, val)

def vdf_dump(d):
    b = bytearray()
    for key, (t, val) in d.items():
        b.append(t); b += key.encode('utf-8', 'surrogateescape') + b'\x00'
        if t == 0x00: b += vdf_dump(val)
        elif t == 0x01: b += val.encode('utf-8', 'surrogateescape') + b'\x00'
        elif t == 0x02: b += struct.pack('<i', val)
        elif t == 0x03: b += struct.pack('<f', val)
        elif t == 0x07: b += struct.pack('<Q', val)
    b.append(0x08)
    return bytes(b)

S = lambda v: (0x01, v)
I = lambda v: (0x02, v)

def shortcut_appid(exe, name):
    """Steam's id for a non-Steam shortcut (also names the artwork files in config/grid)."""
    return (zlib.crc32((exe + name).encode('utf-8')) & 0xffffffff) | 0x80000000

def signed32(u): return u - (1 << 32) if u >= (1 << 31) else u
def unsigned32(s): return s & 0xffffffff

# ---------------------------------------------------------------- helpers
def say(msg): print(msg, flush=True)

def fetch(url):
    req = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'pocket-arcade-tiles'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def steam_running():
    try:
        out = subprocess.run(['pgrep', '-x', 'steam'], capture_output=True, text=True)
        return out.returncode == 0
    except FileNotFoundError:
        return False

def user_dirs():
    root = STEAM / 'userdata'
    if not root.is_dir():
        sys.exit(f'Steam user folder not found at {root}. Is Steam installed and signed in?')
    dirs = [d for d in root.iterdir() if d.is_dir() and d.name.isdigit() and d.name != '0' and (d / 'config').is_dir()]
    if not dirs:
        sys.exit('No signed-in Steam accounts found. Sign in to Steam once, then run this again.')
    return dirs

def tile_url(gid): return ARCADE_URL + (f'#{gid}' if gid else '')
def our_tile(entry):
    lo = entry.get('LaunchOptions', (1, ''))[1]
    return ARCADE_URL.rstrip('/') in lo
def tile_game_id(entry):
    lo = entry.get('LaunchOptions', (1, ''))[1]
    rest = lo.split(ARCADE_URL.rstrip('/'), 1)[1]
    rest = rest.split('"', 1)[0].lstrip('/')
    return rest[1:] if rest.startswith('#') else ''

# ---------------------------------------------------------------- main
def main():
    say(f'Pocket Arcade tiles · {ARCADE_URL}')
    try:
        catalog = json.loads(fetch(ARCADE_URL + 'games.json'))['games']
    except Exception as e:
        sys.exit(f'Could not download the game list ({e}). Check Wi-Fi and that the arcade site is published.')
    say(f'{len(catalog)} game(s) published: ' + ', '.join(g['title'] for g in catalog))

    if shutil.which('flatpak'):
        has_chrome = subprocess.run(['flatpak', 'info', CHROME_FLATPAK], capture_output=True).returncode == 0
        if not has_chrome:
            sys.exit('Google Chrome is not installed. Install it from Discover, open the arcade once, then run this again.')

    # Steam rewrites shortcuts.vdf when it exits, so it must be closed while we write.
    was_running = steam_running()
    if was_running and not DRY:
        say('Closing Steam so the new tiles stick (it reopens automatically when done)...')
        subprocess.run(['steam', '-shutdown'], capture_output=True)
        for _ in range(60):
            if not steam_running(): break
            time.sleep(1)
        else:
            sys.exit('Steam did not close. Quit it from the system tray and run this again.')

    art_cache = {}
    def art(path):
        if path not in art_cache:
            try: art_cache[path] = fetch(ARCADE_URL + path)
            except Exception as e:
                say(f'  ! could not download {path}: {e}'); art_cache[path] = None
        return art_cache[path]
    icon_png = art('icons/icon-192.png')

    for udir in user_dirs():
        cfg = udir / 'config'
        vdf_path = cfg / 'shortcuts.vdf'
        if vdf_path.exists():
            root, _ = vdf_load(vdf_path.read_bytes())
        else:
            root = {}
        shortcuts = root.setdefault('shortcuts', (0x00, {}))[1]
        entries = [shortcuts[k][1] for k in sorted(shortcuts, key=lambda k: int(k) if k.isdigit() else 0)]

        # reuse how Chrome was added on this Deck, if it was
        template = next((e for e in entries if CHROME_FLATPAK in e.get('LaunchOptions', (1, ''))[1] or CHROME_FLATPAK in e.get('Exe', (1, ''))[1]), None)
        exe = template['Exe'][1] if template else DEFAULT_EXE
        start = template['StartDir'][1] if template else DEFAULT_START
        base = DEFAULT_BASE_OPTS
        if template and '@@u @@' in template.get('LaunchOptions', (1, ''))[1]:
            base = template['LaunchOptions'][1].split('@@u @@')[0] + '@@u @@'

        wanted = [(None, MENU_TILE)] + [(g['id'], g['title']) for g in catalog]
        existing = {tile_game_id(e): e for e in entries if our_tile(e)}
        keep, changes = [], []
        grid = cfg / 'grid'
        for e in entries:
            if our_tile(e) and tile_game_id(e) not in {gid or '' for gid, _ in wanted}:
                changes.append(f'remove tile "{e["AppName"][1]}" (game no longer published)')
                continue
            keep.append(e)

        for gid, title in wanted:
            opts = f'{base} {CHROME_FLAGS} "{tile_url(gid)}"'
            e = existing.get(gid or '')
            if e is None:
                appid = shortcut_appid(exe, title)
                e = {'appid': I(signed32(appid)), 'AppName': S(title), 'Exe': S(exe), 'StartDir': S(start), 'icon': S(''),
                     'ShortcutPath': S(''), 'LaunchOptions': S(opts), 'IsHidden': I(0), 'AllowDesktopConfig': I(1),
                     'AllowOverlay': I(1), 'OpenVR': I(0), 'Devkit': I(0), 'DevkitGameID': S(''), 'DevkitOverrideAppID': I(0),
                     'LastPlayTime': I(0), 'FlatpakAppID': S(''), 'tags': (0x00, {'0': S('Pocket Arcade')})}
                keep.append(e)
                changes.append(f'add tile "{title}"')
            else:
                if e['AppName'][1] != title or e['LaunchOptions'][1] != opts:
                    changes.append(f'update tile "{title}"')
                e['AppName'] = S(title); e['LaunchOptions'] = S(opts)
                if 'appid' not in e:
                    e['appid'] = I(signed32(shortcut_appid(e['Exe'][1], title)))
            appid = unsigned32(e['appid'][1])
            # artwork: files are named after the shortcut's appid
            g = next((x for x in catalog if x['id'] == gid), None)
            files = {}
            if g:
                for kind, suffix in (('cover', 'p.png'), ('wide', '.png'), ('hero', '_hero.png'), ('logo', '_logo.png')):
                    if kind in g.get('art', {}):
                        files[f'{appid}{suffix}'] = g['art'][kind]
            else:  # the menu tile reuses the first game's background and the arcade icon
                first = catalog[0] if catalog else None
                if first and 'hero' in first.get('art', {}): files[f'{appid}_hero.png'] = first['art']['hero']
            icon_file = grid / f'{appid}_icon.png'
            if not DRY:
                grid.mkdir(parents=True, exist_ok=True)
                for name, path in files.items():
                    blob = art(path)
                    if blob: (grid / name).write_bytes(blob)
                if icon_png: icon_file.write_bytes(icon_png)
            e['icon'] = S(str(icon_file))

        if not changes:
            say(f'  account {udir.name}: tiles already up to date (artwork refreshed)')
            continue
        for c in changes: say(f'  account {udir.name}: {c}')
        if DRY:
            continue
        new_root = dict(root)
        new_root['shortcuts'] = (0x00, {str(i): (0x00, e) for i, e in enumerate(keep)})
        blob = vdf_dump(new_root)
        vdf_load(blob)  # sanity: must parse back
        if vdf_path.exists():
            backup = vdf_path.with_name(f'shortcuts.vdf.bak-{time.strftime("%Y%m%d-%H%M%S")}')
            shutil.copy2(vdf_path, backup)
        tmp = vdf_path.with_suffix('.vdf.tmp')
        tmp.write_bytes(blob); os.replace(tmp, vdf_path)

    if not DRY and '--no-desktop-shortcut' not in args:
        install_desktop_shortcut()

    if DRY:
        say('\nDry run: nothing was changed.')
    elif not NO_RESTART and shutil.which('steam'):
        say('Reopening Steam...')
        subprocess.Popen(['steam'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    say('\nDone. In Gaming Mode, set each new tile\'s controller layout once: tile > controller icon > "Gamepad".')
    say('For point-and-click games pick "Gamepad with Mouse Trackpad" so the right trackpad moves the pointer.')

def install_desktop_shortcut():
    """A double-click 'Update Arcade Tiles' icon on the Desktop for next time."""
    cmd = f"curl -fsSL {ARCADE_URL}deck/arcade-tiles.py | python3 -; echo; read -p 'Press Enter to close'"
    entry = '\n'.join([
        '[Desktop Entry]', 'Type=Application', 'Name=Update Arcade Tiles',
        'Comment=Add Steam tiles for new Pocket Arcade games', 'Icon=applications-games',
        f'Exec=konsole -e bash -c "{cmd}"', 'Terminal=false', ''])
    for d in (HOME / '.local/share/applications', HOME / 'Desktop'):
        if d.is_dir() or d.parent.is_dir():
            d.mkdir(parents=True, exist_ok=True)
            f = d / 'pocket-arcade-tiles.desktop'
            f.write_text(entry); f.chmod(0o755)

if __name__ == '__main__':
    main()
