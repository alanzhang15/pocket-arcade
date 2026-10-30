/* Cloud sync via a private GitHub repo.
   Saves go to one file, pocket-arcade-saves.json, in a repo you choose. Every sync downloads that file,
   merges it with this device's data (high scores are combined; each game's save keeps the newest copy),
   and uploads the result if anything changed. Each upload is a commit, so the repo history doubles as a backup log.

   Setup (once): create a PRIVATE repo, then a fine-grained token limited to that one repo with
   "Contents: Read and write". Enter both under Settings > Cloud sync on each device. */
(function () {
  'use strict';
  const KEY = 'pocket-arcade.sync';           // device-only: repo + token, never exported
  const FILE = 'pocket-arcade-saves.json';
  const $ = s => document.querySelector(s);

  const readCfg = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const writeCfg = c => { try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } };

  // UTF-8 safe base64 (player names can contain any characters)
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

  // Only the shared parts travel; device settings (sound, active player, install hint) stay local.
  const shared = d => ({ v: d.v, players: d.players, playersAt: d.playersAt || 0, scores: d.scores, saves: d.saves });

  function gh(cfg, path, opts = {}) {
    return fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
      cache: 'no-store',
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
  }
  function explain(status) {
    if (status === 401) return 'GitHub rejected the token (it may have expired)';
    if (status === 403) return 'the token can’t write to that repo (needs Contents: Read and write)';
    if (status === 404) return 'repo not found, or the token doesn’t include it';
    return `GitHub error ${status}`;
  }
  function device() {
    const ua = navigator.userAgent;
    if (/iPad|Macintosh.*Mobile/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/Linux/.test(ua) && !/Android/.test(ua)) return 'Steam Deck';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'device';
  }

  async function syncWith(cfg, local, merge) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await gh(cfg, `/contents/${FILE}`);
      let sha, remoteBody = '';
      if (res.ok) {
        const j = await res.json();
        sha = j.sha;
        remoteBody = b64decode(j.content || '');
        if (remoteBody) merge(JSON.parse(remoteBody));
      } else if (res.status !== 404) {
        throw new Error(explain(res.status));
      }
      const body = JSON.stringify(shared(local), null, 1);
      if (remoteBody && JSON.stringify(shared(JSON.parse(remoteBody)), null, 1) === body) return; // already in step
      const put = await gh(cfg, `/contents/${FILE}`, {
        method: 'PUT',
        body: JSON.stringify({ message: `Saves from ${device()}`, content: b64encode(body), ...(sha ? { sha } : {}) })
      });
      if (put.ok) return;
      if (put.status === 409 || put.status === 422) continue; // another device wrote first: re-read, re-merge, retry
      throw new Error(explain(put.status));
    }
    throw new Error('kept colliding with another device');
  }

  function paint(cfg) {
    $('#ghRepo').value = cfg ? cfg.repo : '';
    $('#ghToken').value = cfg ? '••••••••••••' : '';
    $('#ghToken').dataset.saved = cfg ? '1' : '';
    $('#ghConnect').hidden = !!cfg;
    $('#ghSyncNow').hidden = !cfg;
    $('#ghDisconnect').hidden = !cfg;
    $('#ghRepo').disabled = $('#ghToken').disabled = !!cfg;
  }
  function enable(cfg) {
    Arcade.useSync({ sync: (local, merge) => syncWith(cfg, local, merge) });
  }

  async function connect() {
    const status = $('#syncStatus');
    const repo = $('#ghRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    const token = $('#ghToken').value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { status.textContent = 'Enter the repo as owner/name, for example alan/arcade-saves.'; return; }
    if (!token) { status.textContent = 'Paste the access token from GitHub.'; return; }
    if (!navigator.onLine) { status.textContent = 'Connect once while online.'; return; }
    status.textContent = 'Checking the repo…';
    try {
      const res = await gh({ repo, token }, '');
      if (!res.ok) throw new Error(explain(res.status));
      const info = await res.json();
      if (!info.private) throw new Error('that repo is public. Use a private repo so your saves and names stay private');
      if (info.permissions && !info.permissions.push) throw new Error(explain(403));
      const cfg = { repo, token };
      writeCfg(cfg);
      paint(cfg);
      enable(cfg);
      Arcade.syncNow();
    } catch (e) {
      status.textContent = `Couldn’t connect: ${e.message}.`;
    }
  }
  function disconnect() {
    writeCfg(null);
    Arcade.useSync(null);
    paint(null);
  }

  // Wire up once the DOM is ready (this script loads at the end of <body>).
  const cfg = readCfg();
  if (cfg) enable(cfg);
  paint(cfg);
  $('#ghConnect').addEventListener('click', connect);
  $('#ghSyncNow').addEventListener('click', () => Arcade.syncNow());
  $('#ghDisconnect').addEventListener('click', disconnect);
})();
