# Pocket Arcade

An installable, offline-first web arcade for iPhone, iPad, laptops, and anything with a browser.
Touch, keyboard, and Bluetooth controllers (Joy-Con, Xbox, PlayStation) all work.

## Put it on your iPhone (about 5 minutes, free)

1. Create a GitHub repo (e.g. `pocket-arcade`) and upload everything in this folder.
2. Repo **Settings → Pages → Deploy from branch → main / root**. You get `https://<you>.github.io/pocket-arcade/`.
   (Netlify Drop or Cloudflare Pages work too. Any static HTTPS host is fine.)
3. On the iPhone, open that URL in **Safari** → **Share** → **Add to Home Screen**.
4. Launch it once while online. After that it works in airplane mode.

## Add a game

Ask Claude in a session with this repo attached ("make a game where…", "port <old game>"). The repo's
`CLAUDE.md` and skills (`.claude/skills/`) tell it how to build, test, make Steam art, and publish.
By hand: create `games/<id>/game.js` (copy a reference game), then run
`python3 tools/build.py`, `node tools/test-game.mjs <id>`, `node tools/render-art.mjs <id>`, and push.

## Launch a game directly

`https://alanzhang15.github.io/pocket-arcade/#<id>` opens straight into that game; the plain URL opens the menu.

## Steam Deck tiles (one command, re-run for new games)

In Desktop Mode, open **Konsole** and run:

```
curl -fsSL https://alanzhang15.github.io/pocket-arcade/deck/arcade-tiles.py | python3 -
```

It closes Steam briefly, adds a tile for every game plus a **Pocket Arcade** menu tile (with cover, banner,
background, logo and icon), updates tiles you made by hand, removes tiles for games that were deleted,
backs up your shortcuts file, and reopens Steam. It also puts an **Update Arcade Tiles** icon on the
desktop for next time. Needs Google Chrome from Discover.

Once per new tile, in Gaming Mode: tile → controller icon → **Gamepad** (point-and-click games:
**Gamepad with Mouse Trackpad**). Steam doesn't let outside tools set that part.

Controls everywhere: d-pad or left stick moves through menus, A selects, B goes back, Start pauses,
Select (or Y) opens settings from the menu.

## Battery

Games follow the budget in `CLAUDE.md` (tested by `tools/test-game.mjs`). On the Deck, the Quick Access
menu → Performance lets you set a per-game profile: 60 Hz refresh and a 60 fps limit suit every arcade
game; turn-based games are fine at 30. Settings → **Show frame rate** displays the arcade's own numbers.

## Saves and sync

- High scores (top 10 per game) and per-game saves are kept on each device and survive restarts.
- **Settings → Export saves** shares a JSON file; **Import** merges one back in.

### Cloud sync with GitHub (optional, free)

Each device merges its data with one file in a private repo: scores from all devices are combined, and each
game's save keeps the most recent copy. Sync runs when the app opens, after every new score or save,
when you return to it, and as soon as Wi-Fi comes back after playing offline. Every sync is a commit,
so the repo history is also a backup log.

1. Create a **private** repo, e.g. `arcade-saves` (keep it separate from the public Pages repo).
2. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token:
   - Repository access: **Only select repositories** → `arcade-saves`
   - Permissions → Repository → **Contents: Read and write**
   - Pick an expiration. When it expires, sync shows "GitHub rejected the token". Make a new one and reconnect.
3. In Pocket Arcade: **Settings → Cloud sync** → enter `yourname/arcade-saves` and paste the token → **Connect**.
   Do this once per device (iPhone, iPad, Steam Deck).

On the Steam Deck, paste the token in Desktop Mode: open Chrome normally to your arcade URL and use Settings there.
Chrome shares that storage with your library tiles, so they're connected too.

The token stays on the device where you entered it and is never included in exports. It can only touch
that one private repo.

## iOS notes

- The ring/silent switch mutes game audio. Sound starts after the first tap.
- iOS doesn't allow vibration or background sync for web apps.
- Deleting the home-screen icon deletes that device's saves. Export first.
