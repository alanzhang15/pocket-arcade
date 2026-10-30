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

1. Create `games/<your-game>.js` that calls `Arcade.register({...})` (copy `games/cave-flyer.js` as a template).
2. Add `<script src="games/<your-game>.js"></script>` to `index.html` next to the others.
3. Run `python3 tools/build.py` (refreshes the offline file list and version), then upload.
   Installed copies show an **Update** button the next time they open online.

### Game API

```js
Arcade.register({
  id: 'my-game', title: 'My Game', blurb: 'One line for the menu card',
  controls: 'Shown on the pause screen', orientation: 'any' | 'landscape',
  thumb(ctx, w, h) { /* optional menu-card art, 112x84 */ },
  create(api) {
    // api.view.w / api.view.h  world size (height is always 360, width follows the screen)
    // api.input.held.a / api.input.pressed.a   actions: up down left right a b start
    // api.sfx.tone({f, to, d, type, v}), api.sfx.noise({d, v})
    // api.best(), api.player(), api.save(obj), api.load(), api.gameOver(score)
    return { update(dt) {}, draw(ctx, view) {}, resize(view) {} };
  }
});
```

Tapping or holding anywhere on the screen counts as the **A** button. The shell handles pause
(button, Esc, or controller Start), auto-pause when the app is backgrounded, high scores per player,
the game-over screen, and controller navigation of every menu.

## Launch a game directly

Add the game's id after a `#`: `https://<you>.github.io/pocket-arcade/#cave-flyer` opens straight into Cave Flyer.
The plain URL opens the arcade menu. Every game shares the same saves, scores, and sync.

## Steam Deck: one library tile per game

1. Desktop Mode → **Discover** → install **Google Chrome**.
2. Steam (desktop) → **Games → Add a Non-Steam Game to My Library** → tick Google Chrome → Add.
   Repeat once per game (and once more if you want an all-games Arcade tile).
3. For each new Chrome entry: right-click → **Properties**.
   - Name it (e.g. `Cave Flyer`).
   - In **Launch Options**, keep the existing text and add this at the very end, after `@@u @@`:
     ```
     --kiosk --autoplay-policy=no-user-gesture-required "https://<you>.github.io/pocket-arcade/#cave-flyer"
     ```
   (`--autoplay-policy` lets sound start from a controller press; Chrome otherwise waits for a tap or key.)
4. Back in Gaming Mode, for each tile: controller icon → choose the **Gamepad** layout (not "Web Browser").
5. Artwork: in Desktop Mode, right-click the game in Steam's library → **Manage → Set custom artwork**
   for the cover, and on the game's page right-click the banner to set the background and logo.
   Files are in `steam-art/<game>/`:
   - `cover-600x900.png` → library cover (portrait)
   - `wide-920x430.png` → wide capsule / recently played
   - `hero-1920x620.png` → game page background
   - `logo-1280x360.png` → game page logo

Launch a tile online once and the game is cached for offline play. Quit with the Steam button → **Exit game**.
Close any normal Chrome window first: if Chrome is already open, a tile may open as a regular window.

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
