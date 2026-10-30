/* Pocket Arcade core: game registry, input (touch / keys / gamepad), audio, scores, saves, menu, service worker. */
(function () {
  'use strict';

  const VERSION = '1.0.0';
  const $ = (s, el = document) => el.querySelector(s);
  const games = [];
  const LOGICAL_H = 360; // every game draws in a 360-unit-tall world; width follows the screen

  /* ================= storage ================= */
  const KEY = 'pocket-arcade.v1';
  function readStore() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  const data = Object.assign(
    { v: 1, players: ['Player 1', 'Player 2'], playersAt: 0, active: 0, sound: true, scores: {}, saves: {}, updated: 0, hideInstall: false },
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

  /* Merge another copy of the data (from a backup file or cloud sync) into this one.
     Scores: union of both top-10 lists. Each game's save and the player names: whichever copy changed last. */
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
     sync() should download the remote copy, call merge(remote), then upload localData if it differs.
     It runs on launch, when the app returns to the foreground, when the network comes back,
     and a moment after every new score or save. Offline changes simply wait for the next run. */
  let sync = null, pushTimer = 0, retryTimer = 0, syncing = false, again = false;
  function syncNow() {
    if (!sync) return;
    clearTimeout(retryTimer);
    if (!navigator.onLine) return syncStatus('Offline. Changes will sync when you reconnect.');
    if (syncing) { again = true; return; }
    syncing = true;
    syncStatus('Syncing…');
    sync.sync(data, remote => merge(remote))
      .then(() => {
        syncStatus('Synced at ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        if (mode === 'menu') renderMenu();
      })
      .catch(err => {
        syncStatus(`Sync failed: ${(err && err.message) || 'network error'}. Will retry.`);
        retryTimer = setTimeout(syncNow, 60000);
      })
      .finally(() => { syncing = false; if (again) { again = false; syncNow(); } });
  }
  function syncPush() { if (!sync) return; clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 1500); }
  function syncStatus(msg) { const el = $('#syncStatus'); if (el) el.textContent = sync ? `Cloud sync: ${msg}` : 'Cloud sync is off. Saves live on this device.'; }

  /* ================= input ================= */
  const ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start'];
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'a', Enter: 'a', KeyZ: 'a', KeyX: 'b', Backspace: 'b', Escape: 'start', KeyP: 'start'
  };
  const kb = {}, touch = {}, latch = {};
  const held = {}, pressed = {};
  let padName = '';

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

  function pollPad() {
    const p = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let name = '';
    for (const g of pads) {
      if (!g) continue;
      name = name || g.id;
      const b = i => !!(g.buttons[i] && g.buttons[i].pressed);
      const ax = g.axes || [];
      if (b(0) || b(2)) p.a = 1;
      if (b(1) || b(3)) p.b = 1;
      if (b(8) || b(9)) p.start = 1;
      if (b(12) || ax[1] < -0.5) p.up = 1;
      if (b(13) || ax[1] > 0.5) p.down = 1;
      if (b(14) || ax[0] < -0.5) p.left = 1;
      if (b(15) || ax[0] > 0.5) p.right = 1;
    }
    if (name !== padName) {
      padName = name;
      $('#padStatus').textContent = name ? `Controller: ${name.replace(/\(.*?\)/g, '').trim().slice(0, 32) || 'connected'}` : 'No controller · touch & keys ready';
    }
    return p;
  }

  function updateInput() {
    const p = pollPad();
    let any = false;
    for (const a of ACTIONS) {
      const h = !!(kb[a] || touch[a] || p[a] || latch[a]);
      pressed[a] = h && !held[a];
      held[a] = h;
      latch[a] = false;
      if (pressed[a] && p[a]) any = true;
    }
    if (any) document.body.classList.add('kbnav');
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
  function noise({ d = 0.35, v = 0.25 } = {}) {
    if (!audioOk()) return;
    const len = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf; g.gain.value = v;
    s.connect(g).connect(ac.destination); s.start();
  }

  /* ================= stage ================= */
  const view = { w: 640, h: LOGICAL_H, scale: 1 };
  let canvas, ctx;
  function resize() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    view.scale = canvas.height / LOGICAL_H;
    view.w = canvas.width / view.scale;
    view.h = LOGICAL_H;
    if (game && game.resize) game.resize(view);
  }

  /* ================= game session ================= */
  let mode = 'menu';   // 'menu' | 'game'
  let sub = 'play';    // 'play' | 'paused' | 'over'
  let def = null, game = null, overTimer = 0;

  function makeApi(d) {
    return {
      view,
      input: { held, pressed },
      sfx: { tone, noise },
      player: () => data.players[data.active],
      best: () => bestOf(d.id),
      save: obj => { data.saves[d.id] = { at: Date.now(), v: obj }; persist(); },
      load: () => { const s = data.saves[d.id]; return s && typeof s === 'object' && 'v' in s ? s.v : s; },
      gameOver: score => { if (sub === 'play') showOver(score); }
    };
  }

  function startGame(d) {
    def = d;
    mode = 'game'; sub = 'play';
    $('#menu').hidden = true;
    const play = $('#play');
    play.hidden = false;
    play.classList.toggle('landscape', d.orientation === 'landscape');
    hideOverlay();
    resize();
    game = d.create(makeApi(d));
    if (game.resize) game.resize(view);
    unlockAudio();
  }

  function quitGame() {
    mode = 'menu'; game = null; def = null;
    hideOverlay();
    $('#play').hidden = true;
    $('#menu').hidden = false;
    for (const a of ACTIONS) touch[a] = false;
    renderMenu();
  }

  function pause() {
    if (mode !== 'game' || sub !== 'play') return;
    sub = 'paused';
    showPanel(`
      <h2>Paused</h2>
      <div class="btn-col">
        <button class="btn" data-nav data-act="resume">Resume</button>
        <button class="btn ghost" data-nav data-act="restart">Restart</button>
        <button class="btn ghost" data-nav data-act="menu">Back to games</button>
      </div>
      <p class="hint">${esc(def.controls || '')}</p>`);
  }
  function resume() { if (sub === 'paused') { sub = 'play'; hideOverlay(); } }

  function showOver(score) {
    sub = 'over';
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
    // brief guard so a held button doesn't instantly hit "Play again"
    overTimer = performance.now() + 450;
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
    else if (act === 'restart') { hideOverlay(); startGame(def); }
    else if (act === 'menu') quitGame();
  }

  /* ================= focus navigation (controller / keyboard) ================= */
  const nav = {
    root: null, i: 0,
    items() { return this.root ? [...this.root.querySelectorAll('[data-nav]:not([hidden])')].filter(el => el.offsetParent) : []; },
    reset(root) { this.root = root; this.i = 0; this.paint(); },
    move(dir) {
      const items = this.items(); if (!items.length) return;
      this.i = (this.i + dir + items.length) % items.length; this.paint();
      items[this.i].scrollIntoView({ block: 'nearest' });
    },
    paint() {
      document.querySelectorAll('.focus').forEach(el => el.classList.remove('focus'));
      const el = this.items()[this.i]; if (el) el.classList.add('focus');
    },
    activate() { const el = this.items()[this.i]; if (el) el.click(); }
  };
  function stepNav() {
    if (pressed.up || pressed.left) nav.move(-1);
    if (pressed.down || pressed.right) nav.move(1);
    if (pressed.a) nav.activate();
  }

  /* ================= main loop ================= */
  let last = 0;
  function frame(t) {
    const dt = Math.min((t - last) / 1000 || 0, 1 / 20);
    last = t;
    updateInput();
    if (!$('#sheet').hidden) {
      if (pressed.b || pressed.start) closeSheet(); else stepNav();
    } else if (mode === 'menu') {
      stepNav();
    } else if (game) {
      if (sub === 'play') {
        if (pressed.start) pause();
        else game.update(dt);
      } else if (sub === 'paused') {
        if (pressed.start || pressed.b) resume(); else stepNav();
      } else if (sub === 'over' && t > overTimer) {
        if (pressed.b) quitGame(); else stepNav();
      }
      if (game) {
        ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
        game.draw(ctx, view);
      }
    }
    requestAnimationFrame(frame);
  }

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
      li.innerHTML = `
        <button class="card" data-nav data-game="${d.id}">
          <canvas width="224" height="168" aria-hidden="true"></canvas>
          <span class="meta">
            <h3>${esc(d.title)}</h3>
            <p>${esc(d.blurb || '')}</p>
            <span class="best ${best ? '' : 'none'}">${best ? `BEST ${fmt(best.score)} · ${esc(best.name)}` : 'NO SCORE YET'}</span>
          </span>
        </button>`;
      ul.appendChild(li);
      const c = li.querySelector('canvas'), x = c.getContext('2d');
      x.scale(2, 2);
      if (d.thumb) try { d.thumb(x, 112, 84); } catch (e) { /* thumbnail is decorative */ }
    }
    if (mode === 'menu' && $('#sheet').hidden) {
      const keep = nav.root === $('#menu') ? nav.i : 0;
      nav.reset($('#menu')); nav.i = Math.min(keep, nav.items().length - 1); nav.paint();
    }
  }

  function openSheet() {
    $('#p0').value = data.players[0];
    $('#p1').value = data.players[1];
    $('#soundToggle').checked = !!data.sound;
    $('#sheet').hidden = false;
    nav.reset($('#sheet'));
  }
  function closeSheet() {
    const names = [($('#p0').value.trim() || 'Player 1').slice(0, 12), ($('#p1').value.trim() || 'Player 2').slice(0, 12)];
    if (names.join('|') !== data.players.join('|')) { data.players = names; data.playersAt = Date.now(); }
    data.sound = $('#soundToggle').checked;
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
      // check for updates when the app returns to the foreground
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      navigator.serviceWorker.ready.then(setNet);
    }).catch(() => { /* hosting without SW support (e.g. preview) */ });
  }
  function setNet() {
    const el = $('#netStatus');
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
    ctx = canvas.getContext('2d');

    // touch / mouse on the stage = the A button (one-button games); games can read pointer positions themselves too
    const pointers = new Set();
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault(); pointers.add(e.pointerId);
      if (!touch.a) latch.a = true;
      touch.a = true;
      document.body.classList.remove('kbnav');
    });
    const up = e => { pointers.delete(e.pointerId); if (!pointers.size) touch.a = false; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);
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

    if (!window.ARCADE_PREVIEW && isIOS() && !isStandalone() && !data.hideInstall) $('#installHint').hidden = false;
    $('#installDismiss').addEventListener('click', () => { data.hideInstall = true; persist(); $('#installHint').hidden = true; renderMenu(); });

    addEventListener('resize', resize);
    addEventListener('orientationchange', () => setTimeout(resize, 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); for (const a of ACTIONS) kb[a] = touch[a] = false; }
      else syncNow();
    });
    addEventListener('online', () => { setNet(); syncNow(); });
    addEventListener('offline', setNet);
    addEventListener('gamepadconnected', () => toast('Controller connected'));

    renderMenu();
    registerSW();
    setNet();
    syncNow();
    requestAnimationFrame(frame);

    // Direct launch: index.html#cave-flyer (or ?game=cave-flyer) opens straight into that game.
    const openFromLink = () => {
      const want = decodeURIComponent((location.hash || '').slice(1)) || new URLSearchParams(location.search).get('game');
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
      games.push(d);
    },
    useSync(s) { sync = s || null; syncStatus(sync ? 'connecting…' : ''); },
    syncNow,
    boot,
    _debug: { data, merge, games, game: () => game } // handy in the browser console
  };
})();
