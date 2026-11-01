/* Pocket Arcade core: game registry, input (touch / mouse / keys / gamepad), audio, saves, menu, sync hook, service worker.
   Games never touch this file. They call Arcade.register({...}) — see CLAUDE.md for the full contract. */
(function () {
  'use strict';

  const VERSION = '1.1.0';
  const $ = (s, el = document) => el.querySelector(s);
  const games = [];
  const LOGICAL_H = 360; // every game draws in a 360-unit-tall world; width follows the screen
  const params = new URLSearchParams(location.search);

  /* ================= storage ================= */
  const KEY = 'pocket-arcade.v1';
  function readStore() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  const data = Object.assign(
    { v: 1, players: ['Player 1', 'Player 2'], playersAt: 0, active: 0, sound: true, showPerf: false, scores: {}, saves: {}, updated: 0, hideInstall: false },
    readStore() || {}
  );
  function persist(push = true) {
    data.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode: keep in memory */ }
    if (push) syncPush();
  }

  function addScore(gameId, score) {
    const list = data.scores[gameId] || (data.scores[gameId] = []);
    const entry = { name: data.players[data.active], score: Math.round(score), at: Date.now() };
    list.push(entry);
    list.sort((a, b) => b.score - a.score || a.at - b.at);
    if (list.length > 10) list.length = 10;
    persist();
    return { entry, rank: list.indexOf(entry), list };
  }
  const bestOf = id => (data.scores[id] || [])[0] || null;

  // Save slots: "main" (progress, unlocks, settings) lives at saves[id]; other slots at saves["id:slot"].
  // The shell's autosave uses the "run" slot. Each slot is { at, v } so sync keeps the newest per slot;
  // clearing writes { at, v: null } so the deletion also wins on other devices.
  const slotKey = (id, slot) => (!slot || slot === 'main') ? id : `${id}:${slot}`;
  function writeSlot(id, slot, value) { data.saves[slotKey(id, slot)] = { at: Date.now(), v: value === undefined ? null : value }; persist(); }
  function readSlot(id, slot) {
    const s = data.saves[slotKey(id, slot)];
    if (s && typeof s === 'object' && 'v' in s && 'at' in s) return s.v;
    return s === undefined ? null : s; // pre-1.1 saves stored the raw value
  }

  /* Merge another copy of the data (from a backup file or cloud sync) into this one.
     Scores: union of both top-10 lists. Each save slot and the player names: whichever copy changed last. */
  function merge(other) {
    if (!other || typeof other !== 'object' || !other.scores) throw new Error('Not a Pocket Arcade save file');
    let changed = false;
    for (const [id, list] of Object.entries(other.scores)) {
      const mine = data.scores[id] || [];
      const seen = new Set(mine.map(e => `${e.name}|${e.score}|${e.at}`));
      for (const e of list || []) if (e && !seen.has(`${e.name}|${e.score}|${e.at}`)) { mine.push(e); changed = true; }
      mine.sort((a, b) => b.score - a.score || a.at - b.at);
      data.scores[id] = mine.slice(0, 10);
    }
    for (const [k, theirs] of Object.entries(other.saves || {})) {
      const mine = data.saves[k];
      if (!mine || (theirs && (theirs.at || 0) > (mine.at || 0))) { data.saves[k] = theirs; changed = true; }
    }
    if (Array.isArray(other.players) && (other.playersAt || 0) > (data.playersAt || 0)) {
      data.players = other.players.slice(0, 2); data.playersAt = other.playersAt; changed = true;
    }
    if (changed) persist(false);
    return changed;
  }

  /* ================= cloud sync hook =================
     js/sync.js calls Arcade.useSync({ sync: async (localData, merge) => {...} }) or Arcade.useSync(null).
     Runs on launch, on return to foreground, when the network comes back, and shortly after every score or save. */
  let sync = null, pushTimer = 0, retryTimer = 0, syncing = false, again = false;
  function syncNow() {
    if (!sync) return;
    clearTimeout(retryTimer);
    if (!navigator.onLine) return syncStatus('Offline. Changes will sync when you reconnect.', 'Offline · will sync later');
    if (syncing) { again = true; return; }
    syncing = true;
    syncStatus('Syncing…', 'Syncing…');
    sync.sync(data, remote => merge(remote))
      .then(() => {
        const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        syncStatus('Synced at ' + t, 'Synced ' + t);
        if (mode === 'menu') renderMenu();
      })
      .catch(err => {
        syncStatus(`Sync failed: ${(err && err.message) || 'network error'}. Will retry.`, 'Sync failed · retrying');
        retryTimer = setTimeout(syncNow, 60000);
      })
      .finally(() => { syncing = false; if (again) { again = false; syncNow(); } });
  }
  function syncPush() { if (!sync) return; clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 1500); }
  function syncStatus(msg, short) {
    const el = $('#syncStatus'); if (el) el.textContent = sync ? `Cloud sync: ${msg}` : 'Cloud sync is off. Saves live on this device.';
    const pill = $('#netStatus'); if (pill && sync && short) pill.textContent = short;
    if (!sync) setNet();
  }

  /* ================= input ================= */
  const ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select'];
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'a', Enter: 'a', KeyZ: 'a', KeyX: 'b', Backspace: 'b', KeyC: 'x', KeyV: 'y', KeyQ: 'l', KeyE: 'r',
    Escape: 'start', KeyP: 'start', KeyM: 'select'
  };
  const PADMAP = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'l', 5: 'r', 6: 'l', 7: 'r', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  const kb = {}, touch = {}, latch = {};
  // pressed = edges this tick (shell menus, pause); gamePressed = edges since the game's last update(), so games
  // running below the display rate (fps: 30) never miss a quick tap that lands on a skipped tick
  const held = {}, pressed = {}, gamePressed = {};
  const stick = { x: 0, y: 0 }, stick2 = { x: 0, y: 0 };
  let padName = '', lastPadUse = 0, dpadUsed = false;

  // pointer (mouse / touch / trackpad, or the virtual cursor driven by the stick) in world units
  const pointer = { x: 0, y: 0, down: false, pressed: false, released: false, active: false, virtual: false };
  let ptrDown = false, ptrLatchDown = false, ptrLatchUp = false, ptrPressed = false, ptrReleased = false;

  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') return;
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (!kb[a]) latch[a] = true;
    kb[a] = true;
    document.body.classList.add('kbnav');
    unlockAudio();
  });
  addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) kb[a] = false; });
  addEventListener('blur', () => { for (const a of ACTIONS) kb[a] = touch[a] = false; });

  const dead = (x, y, dz = 0.18) => { const m = Math.hypot(x, y); if (m < dz) return [0, 0]; const k = Math.min(1, (m - dz) / (1 - dz)) / m; return [x * k, y * k]; };

  function pollPad() {
    const p = {};
    dpadUsed = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let name = '';
    stick.x = stick.y = stick2.x = stick2.y = 0;
    for (const g of pads) {
      if (!g) continue;
      name = name || g.id;
      for (const [i, a] of Object.entries(PADMAP)) if (g.buttons[i] && g.buttons[i].pressed) { p[a] = 1; if (i >= 12) dpadUsed = true; }
      const ax = g.axes || [];
      const [lx, ly] = dead(ax[0] || 0, ax[1] || 0), [rx, ry] = dead(ax[2] || 0, ax[3] || 0);
      if (Math.abs(lx) > Math.abs(stick.x)) stick.x = lx;
      if (Math.abs(ly) > Math.abs(stick.y)) stick.y = ly;
      if (Math.abs(rx) > Math.abs(stick2.x)) stick2.x = rx;
      if (Math.abs(ry) > Math.abs(stick2.y)) stick2.y = ry;
    }
    // the left stick also counts as the d-pad (menus, and games that only read directions)
    if (stick.y < -0.5) p.up = 1;
    if (stick.y > 0.5) p.down = 1;
    if (stick.x < -0.5) p.left = 1;
    if (stick.x > 0.5) p.right = 1;
    if (name !== padName) {
      padName = name;
      $('#padStatus').textContent = name ? `Controller: ${name.replace(/\(.*?\)/g, '').trim().slice(0, 32) || 'connected'}` : 'No controller · touch & keys ready';
    }
    return p;
  }

  function updateInput(dt) {
    const p = pollPad();
    let padUsed = Math.abs(stick.x) + Math.abs(stick.y) > 0;
    for (const a of ACTIONS) {
      const h = !!(kb[a] || touch[a] || p[a] || latch[a]);
      pressed[a] = h && !held[a];
      held[a] = h;
      latch[a] = false;
      if (p[a]) padUsed = true;
    }
    if (padUsed) { document.body.classList.add('kbnav'); lastPadUse = performance.now(); }

    // pointer: real pointer wins; in pointer games a controller drives a virtual cursor (stick moves, A clicks)
    const wasDown = pointer.down;
    if (def && def.pointer && (dpadUsed || ACTIONS.slice(0, 4).some(a => pressed[a] && kb[a]))) pointer.virtual = false; // d-pad/arrows: game's own highlight
    if (def && def.pointer && (stick.x || stick.y) && !ptrDown) {
      if (!pointer.virtual) { pointer.virtual = true; if (!pointer.active) { pointer.x = view.w / 2; pointer.y = view.h / 2; } }
      const sp = 330 * (held.r ? 1.8 : 1);
      pointer.x = Math.max(0, Math.min(view.w, pointer.x + stick.x * sp * dt));
      pointer.y = Math.max(0, Math.min(view.h, pointer.y + stick.y * sp * dt));
      pointer.active = true;
    }
    pointer.down = pointer.virtual ? !!(held.a || ptrDown) : ptrDown || ptrLatchDown;
    ptrPressed = (pointer.down && !wasDown) || ptrLatchDown;
    // a tap inside one tick shows as down this tick and releases on the next; the latch only matters for
    // an up + down again within one tick, which would otherwise hide the release
    ptrReleased = wasDown && (!pointer.down || ptrLatchUp);
    ptrLatchDown = ptrLatchUp = false;
  }
  // collect this tick's edges for the game; cleared once the game has updated (and drawn) with them
  function gatherGameEdges() {
    for (let i = 0; i < ACTIONS.length; i++) if (pressed[ACTIONS[i]]) gamePressed[ACTIONS[i]] = true;
    if (ptrPressed) pointer.pressed = true;
    if (ptrReleased) pointer.released = true;
  }
  function anyGameEdge() {
    for (let i = 0; i < ACTIONS.length; i++) if (gamePressed[ACTIONS[i]]) return true;
    return pointer.pressed || pointer.released;
  }
  function clearGameEdges() {
    for (let i = 0; i < ACTIONS.length; i++) gamePressed[ACTIONS[i]] = false;
    pointer.pressed = pointer.released = false;
  }

  /* ================= audio ================= */
  let ac = null;
  function unlockAudio() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { /* no audio */ }
  }
  ['pointerdown', 'touchend'].forEach(t => addEventListener(t, unlockAudio, { passive: true }));
  const audioOk = () => data.sound && ac && ac.state === 'running';

  function tone({ f = 440, to = 0, d = 0.1, type = 'square', v = 0.12 } = {}) {
    if (!audioOk()) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + d + 0.02);
  }
  const noiseCache = {};
  function noise({ d = 0.35, v = 0.25 } = {}) {
    if (!audioOk()) return;
    const key = d.toFixed(2);
    let buf = noiseCache[key];
    if (!buf) {
      const len = Math.floor(ac.sampleRate * d); buf = ac.createBuffer(1, len, ac.sampleRate); const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      noiseCache[key] = buf;
    }
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf; g.gain.value = v;
    s.connect(g).connect(ac.destination); s.start();
  }

  /* ================= stage ================= */
  const view = { w: 640, h: LOGICAL_H, scale: 1 };
  let canvas, ctx, dirty = true;
  function resize() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (def && def.pixelated) {
      // render at 360 rows and let the GPU scale up: far fewer pixels to fill, crisp pixel art
      canvas.height = LOGICAL_H;
      canvas.width = Math.round(r.width * LOGICAL_H / r.height);
    } else {
      const dpr = Math.min(window.devicePixelRatio || 1, def && def.maxDpr || 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    canvas.classList.toggle('pixel', !!(def && def.pixelated));
    view.scale = canvas.height / LOGICAL_H;
    view.w = canvas.width / view.scale;
    view.h = LOGICAL_H;
    dirty = true;
    if (game && game.resize) game.resize(view);
  }
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width) / view.scale, (e.clientY - r.top) * (canvas.height / r.height) / view.scale];
  }

  /* ================= game session ================= */
  let mode = 'menu';   // 'menu' | 'game'
  let sub = 'play';    // 'play' | 'paused' | 'over'
  let def = null, game = null, overTimer = 0, autosaveAt = 0;

  function makeApi(d) {
    return {
      view,
      input: { held, pressed: gamePressed, stick, stick2 },
      pointer,
      sfx: { tone, noise },
      player: () => data.players[data.active],
      best: () => bestOf(d.id),
      save: (obj, slot) => writeSlot(d.id, slot, obj),
      load: slot => readSlot(d.id, slot),
      requestDraw: () => { dirty = true; },
      gameOver: score => { if (sub === 'play') showOver(score); }
    };
  }

  function autosave() {
    if (!game || !def || typeof game.getState !== 'function' || sub === 'over') return;
    try { const s = game.getState(); if (s !== undefined) writeSlot(def.id, 'run', s); } catch (e) { console.warn('getState failed', e); }
  }

  function startGame(d) {
    def = d;
    mode = 'game'; sub = 'play';
    $('#menu').hidden = true;
    const play = $('#play');
    play.hidden = false;
    play.classList.toggle('landscape', d.orientation === 'landscape');
    hideOverlay();
    pointer.virtual = false; pointer.active = false;
    clearGameEdges();
    resize();
    game = d.create(makeApi(d));
    if (game.resize) game.resize(view);
    dirty = true; autosaveAt = performance.now() + 30000; frameAcc = 0;
    unlockAudio();
    scheduleNext();
  }

  function quitGame() {
    autosave();
    mode = 'menu'; game = null; def = null;
    hideOverlay();
    $('#play').hidden = true;
    $('#menu').hidden = false;
    for (const a of ACTIONS) touch[a] = false;
    renderMenu();
  }

  function pause() {
    if (mode !== 'game' || sub !== 'play') return;
    autosave();
    sub = 'paused';
    clearGameEdges();
    showPanel(`
      <h2>Paused</h2>
      <div class="btn-col">
        <button class="btn" data-nav data-act="resume">Resume</button>
        <button class="btn ghost" data-nav data-act="restart">Restart</button>
        <button class="btn ghost" data-nav data-act="menu">Back to games</button>
      </div>
      <p class="hint">${esc(def.controls || '')}</p>`);
  }
  function resume() { if (sub === 'paused') { sub = 'play'; hideOverlay(); dirty = true; } }

  function showOver(score) {
    sub = 'over';
    if (typeof game.getState === 'function') writeSlot(def.id, 'run', null); // the run is finished
    const { entry, rank, list } = addScore(def.id, score);
    const rows = list.slice(0, 5).map((e, i) =>
      `<li class="${e === entry ? 'me' : ''}"><span>${i + 1}</span><span>${esc(e.name)}</span><span class="s">${fmt(e.score)}</span></li>`).join('');
    showPanel(`
      <h2>Game over</h2>
      <div class="big">${fmt(entry.score)}</div>
      ${rank === 0 && list.length > 1 ? '<div class="record">NEW HIGH SCORE</div>' : ''}
      <ol class="board">${rows}</ol>
      <div class="btn-col">
        <button class="btn" data-nav data-act="restart">Play again</button>
        <button class="btn ghost" data-nav data-act="menu">Back to games</button>
      </div>`);
    overTimer = performance.now() + 450; // a held button shouldn't instantly hit "Play again"
  }

  function showPanel(html) {
    const o = $('#overlay');
    o.innerHTML = `<div class="panel">${html}</div>`;
    o.hidden = false;
    $('#pauseBtn').hidden = true;
    nav.reset(o);
  }
  function hideOverlay() { $('#overlay').hidden = true; $('#pauseBtn').hidden = false; nav.reset(null); }

  function overlayAction(act) {
    if (act === 'resume') resume();
    else if (act === 'restart') { hideOverlay(); writeSlot(def.id, 'run', null); startGame(def); }
    else if (act === 'menu') quitGame();
  }

  /* ================= focus navigation (d-pad, left stick, keyboard) =================
     Spatial: up/down/left/right moves to the nearest control in that direction. Holding repeats. */
  const nav = {
    root: null, el: null,
    items() { return this.root ? [...this.root.querySelectorAll('[data-nav]:not([hidden]):not([disabled])')].filter(el => el.offsetParent) : []; },
    reset(root) { this.root = root; this.el = null; this.paint(); },
    current() { const items = this.items(); if (!this.el || !items.includes(this.el)) this.el = items[0] || null; return this.el; },
    go(dir) {
      const items = this.items(), cur = this.current(); if (!cur) return;
      const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      // nearest row (or column) in that direction first, then the closest control within it
      const cands = [];
      for (const el of items) {
        if (el === cur) continue;
        const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
        const dx = bx - ax, dy = by - ay;
        const main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
        const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
        if (main > 4) cands.push({ el, main, side });
      }
      let best = null;
      if (cands.length) {
        const nearest = Math.min(...cands.map(c => c.main));
        best = cands.filter(c => c.main <= nearest + 16).sort((p, q) => p.side - q.side)[0].el;
      }
      if (!best) { // wrap vertically through the list so nothing is unreachable
        const i = items.indexOf(cur);
        if (dir === 'down' || dir === 'right') best = items[(i + 1) % items.length];
        else best = items[(i - 1 + items.length) % items.length];
      }
      this.el = best; this.paint();
      best.scrollIntoView({ block: 'nearest' });
      tone({ f: 660, d: 0.03, v: 0.04 });
    },
    paint() {
      document.querySelectorAll('.focus').forEach(el => el.classList.remove('focus'));
      const el = this.current(); if (el) el.classList.add('focus');
    },
    activate() { const el = this.current(); if (el) { if (el.matches('input:not([type="checkbox"])')) el.focus(); else el.click(); } }
  };
  const rep = { dir: null, next: 0 };
  function navDirection(now) {
    const dir = ['up', 'down', 'left', 'right'].find(d => held[d]);
    if (!dir) { rep.dir = null; return null; }
    if (dir !== rep.dir || pressed[dir]) { rep.dir = dir; rep.next = now + 380; return dir; }
    if (now >= rep.next) { rep.next = now + 110; return dir; }
    return null;
  }
  function stepNav(now) {
    const d = navDirection(now);
    if (d) nav.go(d);
    if (pressed.a) nav.activate();
  }

  /* ================= main loop =================
     Battery: in menus the loop ticks at ~30 Hz; in games it follows the display but only updates/draws
     at the game's fps; "onDemand" games only redraw after api.requestDraw() or input; nothing redraws
     behind the pause or game-over panels. */
  let last = 0, frameAcc = 0, scheduled = false, perfFrames = 0, perfMs = 0, perfDraws = 0, perfT = 0;
  function scheduleNext() {
    if (scheduled) return;
    scheduled = true;
    if (mode === 'game' && sub === 'play') requestAnimationFrame(tick);
    else setTimeout(() => tick(performance.now()), 33);
  }
  function tick(t) {
    scheduled = false;
    const raw = Math.min((t - last) / 1000 || 0, 1 / 15);
    last = t;
    if (document.hidden) return scheduleNext();
    updateInput(raw);
    const sheetOpen = !$('#sheet').hidden;
    if (sheetOpen) {
      if (pressed.b || pressed.start) closeSheet(); else stepNav(t);
    } else if (mode === 'menu') {
      if (pressed.select || pressed.y) openSheet(); else stepNav(t);
    } else if (game) {
      if (sub === 'play') {
        if (pressed.start) pause();
        else {
          const fps = def.fps || 60;
          gatherGameEdges();
          frameAcc += raw;
          if (fps >= 60 || frameAcc >= 1 / fps - 0.002) {
            const dt = fps >= 60 ? raw : Math.min(frameAcc, 1 / 15);
            frameAcc = 0;
            const t0 = performance.now();
            const changed = game.update(dt);
            const anyInput = anyGameEdge() || (pointer.virtual && (stick.x || stick.y));
            if (def.redraw !== 'onDemand' || dirty || changed === true || anyInput) {
              ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
              game.draw(ctx, view);
              if (pointer.virtual && pointer.active) drawCursor();
              dirty = false; perfDraws++;
            }
            clearGameEdges();
            perfMs += performance.now() - t0; perfFrames++;
            if (t > autosaveAt) { autosave(); autosaveAt = t + 30000; }
          }
        }
      } else if (sub === 'paused') {
        if (pressed.start || pressed.b) resume(); else stepNav(t);
      } else if (sub === 'over' && t > overTimer) {
        if (pressed.b) quitGame(); else stepNav(t);
      }
    }
    if (perfOn && t - perfT > 500) {
      const el = $('#perfHud');
      const secs = (t - perfT) / 1000;
      el.textContent = mode === 'game' ? `${Math.round(perfFrames / secs)} upd/s · ${Math.round(perfDraws / secs)} draw/s · ${(perfMs / Math.max(1, perfFrames)).toFixed(2)} ms` : 'menu · 30 Hz';
      perfFrames = perfMs = perfDraws = 0; perfT = t;
    }
    scheduleNext();
  }
  function drawCursor() {
    const x = pointer.x, y = pointer.y;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#e9ecff'; ctx.strokeStyle = '#0d1124'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 15); ctx.lineTo(4, 11); ctx.lineTo(7, 17); ctx.lineTo(9.5, 16); ctx.lineTo(6.5, 10); ctx.lineTo(11, 10); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  let perfOn = false;
  function setPerf(on) { perfOn = on; $('#perfHud').hidden = !on; }

  /* ================= menu ================= */
  function renderMenu() {
    const pl = $('#players');
    pl.innerHTML = data.players.map((n, i) =>
      `<button class="chip" data-nav data-player="${i}" aria-pressed="${i === data.active}">${esc(n)}</button>`).join('');

    const ul = $('#games');
    ul.innerHTML = '';
    for (const d of games) {
      const li = document.createElement('li');
      const best = bestOf(d.id);
      const hasRun = readSlot(d.id, 'run') != null;
      li.innerHTML = `
        <button class="card" data-nav data-game="${d.id}">
          <canvas width="224" height="168" aria-hidden="true"></canvas>
          <span class="meta">
            <h3>${esc(d.title)}</h3>
            <p>${esc(d.blurb || '')}</p>
            <span class="best ${best ? '' : 'none'}">${hasRun ? 'CONTINUE · ' : ''}${best ? `BEST ${fmt(best.score)} · ${esc(best.name)}` : 'NO SCORE YET'}</span>
          </span>
        </button>`;
      ul.appendChild(li);
      const c = li.querySelector('canvas'), x = c.getContext('2d');
      x.scale(2, 2);
      if (d.thumb) try { d.thumb(x, 112, 84); } catch (e) { /* thumbnail is decorative */ }
    }
    if (mode === 'menu' && $('#sheet').hidden) {
      const keep = nav.root === $('#menu') && nav.el ? nav.el.dataset.game || nav.el.dataset.player : null;
      nav.reset($('#menu'));
      nav.el = (keep && nav.items().find(el => el.dataset.game === keep || el.dataset.player === keep)) || $('#games [data-game]');
      nav.paint();
    }
  }

  function openSheet() {
    $('#p0').value = data.players[0];
    $('#p1').value = data.players[1];
    $('#soundToggle').checked = !!data.sound;
    $('#perfToggle').checked = !!data.showPerf;
    $('#sheet').hidden = false;
    nav.reset($('#sheet'));
  }
  function closeSheet() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const names = [($('#p0').value.trim() || 'Player 1').slice(0, 12), ($('#p1').value.trim() || 'Player 2').slice(0, 12)];
    if (names.join('|') !== data.players.join('|')) { data.players = names; data.playersAt = Date.now(); }
    data.sound = $('#soundToggle').checked;
    data.showPerf = $('#perfToggle').checked;
    setPerf(data.showPerf || params.has('perf'));
    persist();
    $('#sheet').hidden = true;
    renderMenu();
  }

  /* ================= backup ================= */
  async function exportSaves() {
    const json = JSON.stringify(data, null, 2);
    const name = `pocket-arcade-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Pocket Arcade saves' });
        return toast('Saves exported');
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      toast('Saves exported');
    } catch (e) { toast('Export is not available here'); }
  }
  function importSaves(file) {
    const r = new FileReader();
    r.onload = () => {
      try { merge(JSON.parse(r.result)); renderMenu(); toast('Saves imported and merged'); }
      catch (e) { toast('That file is not a Pocket Arcade backup'); }
    };
    r.readAsText(file);
  }

  /* ================= toast ================= */
  let toastTimer = 0;
  function toast(msg, actionLabel, onAction) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button class="btn">${esc(actionLabel)}</button>` : ''}`;
    t.hidden = false;
    if (actionLabel) t.querySelector('button').onclick = () => { t.hidden = true; onAction(); };
    clearTimeout(toastTimer);
    if (!actionLabel) toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ================= service worker (offline + updates) ================= */
  function registerSW() {
    if (window.ARCADE_PREVIEW || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    let wantReload = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantReload) location.reload(); });
    navigator.serviceWorker.register('sw.js').then(reg => {
      const offer = w => toast('A new version is ready', 'Update', () => { wantReload = true; w.postMessage('skipWaiting'); });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed') {
            if (navigator.serviceWorker.controller) offer(w);
            else setNet();
          }
        });
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      navigator.serviceWorker.ready.then(setNet);
    }).catch(() => { /* hosting without SW support (e.g. preview) */ });
  }
  function setNet() {
    const el = $('#netStatus');
    if (sync) return; // the sync pill owns this slot when sync is on
    if (!navigator.onLine) el.textContent = 'Offline · games still work';
    else if (navigator.serviceWorker && navigator.serviceWorker.controller) el.textContent = 'Saved for offline play';
    else el.textContent = '';
  }

  /* ================= helpers ================= */
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ================= boot ================= */
  function boot() {
    canvas = $('#stage');
    ctx = canvas.getContext('2d', { alpha: false });

    // Touch / mouse on the stage: in pointer games it's the pointer; otherwise it's the A button (one-button games).
    const pointers = new Set();
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault(); pointers.add(e.pointerId);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
      document.body.classList.remove('kbnav');
      if (def && def.pointer) {
        [pointer.x, pointer.y] = toWorld(e); pointer.active = true; pointer.virtual = false;
        if (!ptrDown) ptrLatchDown = true;
        ptrDown = true;
      } else {
        if (!touch.a) latch.a = true;
        touch.a = true;
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (!def || !def.pointer) return;
      if (e.pointerType === 'mouse' && performance.now() - lastPadUse < 300 && pointer.virtual) return;
      [pointer.x, pointer.y] = toWorld(e); pointer.active = true; pointer.virtual = false;
    });
    const up = e => {
      pointers.delete(e.pointerId);
      if (!pointers.size) {
        touch.a = false;
        if (ptrDown) { ptrDown = false; ptrLatchUp = true; }
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    // stop iOS pinch / long-press / double-tap behaviours while playing
    ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
    document.addEventListener('touchmove', e => { if (mode === 'game') e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') document.body.classList.remove('kbnav'); });

    $('#pauseBtn').addEventListener('click', pause);
    $('#overlay').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) overlayAction(b.dataset.act); });
    $('#menu').addEventListener('click', e => {
      const g = e.target.closest('[data-game]');
      if (g) { const d = games.find(x => x.id === g.dataset.game); if (d) startGame(d); return; }
      const p = e.target.closest('[data-player]');
      if (p) { data.active = +p.dataset.player; persist(); renderMenu(); }
    });
    $('#settingsBtn').addEventListener('click', openSheet);
    $('#sheetClose').addEventListener('click', closeSheet);
    $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
    $('#exportBtn').addEventListener('click', exportSaves);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importSaves(e.target.files[0]); e.target.value = ''; });
    $('#versionLine').textContent = `Pocket Arcade ${VERSION} · ${games.length} game${games.length === 1 ? '' : 's'}`;
    setPerf(!!data.showPerf || params.has('perf'));

    if (!window.ARCADE_PREVIEW && isIOS() && !isStandalone() && !data.hideInstall) $('#installHint').hidden = false;
    $('#installDismiss').addEventListener('click', () => { data.hideInstall = true; persist(); $('#installHint').hidden = true; renderMenu(); });

    addEventListener('resize', resize);
    addEventListener('orientationchange', () => setTimeout(resize, 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); autosave(); for (const a of ACTIONS) kb[a] = touch[a] = false; }
      else syncNow();
    });
    addEventListener('pagehide', autosave);
    addEventListener('online', () => { setNet(); syncNow(); });
    addEventListener('offline', () => { setNet(); if (sync) syncStatus('Offline. Changes will sync when you reconnect.', 'Offline · will sync later'); });
    addEventListener('gamepadconnected', () => toast('Controller connected'));

    renderMenu();
    registerSW();
    setNet();
    syncNow();
    scheduleNext();

    // Direct launch: index.html#cave-flyer (or ?game=cave-flyer) opens straight into that game.
    const openFromLink = () => {
      const want = decodeURIComponent((location.hash || '').slice(1)) || params.get('game');
      const direct = games.find(g => g.id === want);
      if (direct && mode === 'menu') startGame(direct);
    };
    openFromLink();
    addEventListener('hashchange', openFromLink);
  }

  window.Arcade = {
    VERSION,
    register(d) {
      if (!d || !d.id || typeof d.create !== 'function') throw new Error('Arcade.register needs { id, title, create(api) }');
      if (games.some(g => g.id === d.id)) throw new Error(`Duplicate game id: ${d.id}`);
      games.push(d);
    },
    useSync(s) { sync = s || null; syncStatus(sync ? 'connecting…' : '', sync ? 'Connecting…' : ''); },
    syncNow,
    boot,
    _debug: { data, merge, games, game: () => game, def: () => def, state: () => ({ mode, sub }), pointer, view } // for the console and tests
  };
})();
