/* Cave Flyer: one-button cave runner in the spirit of the classic Flash helicopter games.
   Hold (touch, Space, or controller A) to climb, release to fall. The cave narrows and speeds up. */
Arcade.register({
  id: 'cave-flyer',
  title: 'Cave Flyer',
  blurb: 'Hold to climb, let go to drop. The cave keeps closing in.',
  controls: 'Hold anywhere on screen, Space, or the A button to climb.',
  orientation: 'any',

  thumb(ctx, w, h) {
    ctx.fillStyle = '#070a17'; ctx.fillRect(0, 0, w, h);
    const top = x => 14 + Math.sin(x / 13) * 8 + Math.sin(x / 5) * 2;
    const bot = x => h - 16 + Math.sin(x / 11 + 2) * 8;
    ctx.fillStyle = '#ffb547';
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, top(x));
    ctx.lineTo(w, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, bot(x));
    ctx.lineTo(w, h); ctx.fill();
    ctx.fillStyle = '#ff5d8f'; ctx.fillRect(74, 40, 7, 22);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(92,225,230,${0.15 + i * 0.1})`; ctx.fillRect(16 + i * 5, 46 - i * 1.2, 3, 3); }
    ctx.fillStyle = '#5ce1e6';
    ctx.beginPath(); ctx.moveTo(52, 38); ctx.lineTo(40, 33); ctx.lineTo(40, 43); ctx.fill();
  },

  // Steam library art: draw the scene, no text (tools/render-art.mjs adds the title in the arcade style).
  art(ctx, W, H, kind) {
    const u = Math.min(W, H) / 360;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#11183a'); g.addColorStop(1, '#070a17');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(141,149,196,.3)';
    for (let i = 0; i < W * H / 9000; i++) ctx.fillRect((i * 7919) % W, (i * 104729) % H, 2 * u, 2 * u);
    const mid = kind === 'hero' ? H * 0.5 : H * 0.55, gap = (kind === 'cover' ? 0.42 : 0.6) * H;
    const top = x => mid - gap / 2 + Math.sin(x / (90 * u)) * 22 * u + Math.sin(x / (23 * u)) * 5 * u;
    const bot = x => mid + gap / 2 + Math.sin(x / (70 * u) + 2) * 22 * u + Math.sin(x / (19 * u)) * 5 * u;
    const wg = ctx.createLinearGradient(0, 0, 0, H); wg.addColorStop(0, '#7a4a12'); wg.addColorStop(0.5, '#ffb547'); wg.addColorStop(1, '#7a4a12');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.moveTo(0, 0); for (let x = 0; x <= W; x += 6 * u) ctx.lineTo(x, top(x)); ctx.lineTo(W, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 6 * u) ctx.lineTo(x, bot(x)); ctx.lineTo(W, H); ctx.fill();
    ctx.strokeStyle = '#ffe1a6'; ctx.globalAlpha = 0.7; ctx.lineWidth = 2 * u;
    ctx.beginPath(); for (let x = 0; x <= W; x += 6 * u) ctx.lineTo(x, top(x)); ctx.stroke();
    ctx.beginPath(); for (let x = 0; x <= W; x += 6 * u) ctx.lineTo(x, bot(x)); ctx.stroke(); ctx.globalAlpha = 1;
    const sx = W * (kind === 'cover' ? 0.42 : 0.3), sy = mid + (kind === 'cover' ? gap * 0.18 : 0);
    ctx.fillStyle = '#ff5d8f'; ctx.fillRect(sx + (kind === 'cover' ? 120 : 260) * u, mid - 40 * u, 16 * u, 70 * u);
    for (let i = 0; i < 22; i++) { ctx.fillStyle = `rgba(92,225,230,${i / 22 * 0.5})`; ctx.fillRect(sx - 14 * u - (22 - i) * 8 * u, sy + Math.sin(i / 4) * 10 * u, 4 * u, 4 * u); }
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.15); ctx.scale(u * 2.2, u * 2.2);
    ctx.fillStyle = '#ffb547'; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-20, 0); ctx.lineTo(-9, 3); ctx.fill();
    ctx.fillStyle = '#5ce1e6'; ctx.shadowColor = '#5ce1e6'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-9, -7); ctx.lineTo(-5, 0); ctx.lineTo(-9, 7); ctx.closePath(); ctx.fill(); ctx.restore();
  },

  create(api) {
    const H = api.view.h;
    const SEG = 12;                 // cave wall resolution in world units
    const SHIP_X = 0.28;            // ship sits 28% across the screen
    const C = { wall: '#ffb547', wallDeep: '#7a4a12', edge: '#ffe1a6', block: '#ff5d8f', ship: '#5ce1e6', text: '#e9ecff', muted: '#8d95c4', bg1: '#070a17', bg2: '#11183a' };

    let W = api.view.w;
    let segs = [], base = 0;        // segs[i] lives at world x = base + i*SEG
    let center = H / 2, cv = 0;
    let blocks = [], nextBlock = 900;
    let dist = 0, speed = 170, t = 0;
    let started = false, dead = false, deadT = 0, ended = false;
    const ship = { y: H / 2, vy: 0, r: 7 };
    let trail = [], parts = [];
    const best = api.best();
    const bestScore = best ? best.score : 0;

    const progress = () => Math.min(dist / 14000, 1);
    const gapNow = () => 250 - 125 * progress();

    function genSeg() {
      const g = gapNow();
      if (dist > 200 || segs.length * SEG > W * 0.9) {
        cv += (Math.random() - 0.5) * (2.2 + 3 * progress());
        cv *= 0.94;
        center += cv;
      }
      const margin = g / 2 + 14;
      if (center < margin) { center = margin; cv = Math.abs(cv) * 0.5; }
      if (center > H - margin) { center = H - margin; cv = -Math.abs(cv) * 0.5; }
      const jag = 3 + 5 * progress();
      segs.push({ top: center - g / 2 + Math.random() * jag, bot: center + g / 2 - Math.random() * jag });
    }
    function wallAt(wx) {
      const i = Math.floor((wx - base) / SEG);
      const a = segs[Math.max(0, Math.min(segs.length - 1, i))];
      return a;
    }
    function spawnBlock(wx) {
      const s = wallAt(wx);
      const h = 44 + Math.random() * 36;
      const room = s.bot - s.top - h;
      if (room < 70) return;
      blocks.push({ x: wx, y: s.top + 30 + Math.random() * (room - 60), w: 16, h });
    }
    function explode(x, y) {
      for (let i = 0; i < 38; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 260;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.6, c: Math.random() < 0.5 ? C.ship : C.wall });
      }
    }

    function ensureCave() {
      while (base + segs.length * SEG < dist + W + SEG * 3) genSeg();
      while (segs.length > 2 && base + SEG * 2 < dist) { segs.shift(); base += SEG; }
    }
    ensureCave();

    function update(dt) {
      t += dt;
      W = api.view.w;
      const sx = dist + W * SHIP_X;

      if (!started) {
        const w0 = wallAt(sx); ship.y = (w0.top + w0.bot) / 2 + Math.sin(t * 3) * 6;
        if (api.input.pressed.a) { started = true; ship.vy = -120; api.sfx.tone({ f: 330, to: 660, d: 0.12 }); }
        ensureCave();
        return;
      }

      if (dead) {
        deadT += dt;
        if (deadT > 1.0 && !ended) { ended = true; api.gameOver(Math.floor(dist / 10)); }
      } else {
        const up = api.input.held.a;
        ship.vy += (up ? -1650 : 980) * dt;
        ship.vy = Math.max(-360, Math.min(400, ship.vy));
        ship.y += ship.vy * dt;

        speed = 170 + Math.min(dist / 45, 200);
        const before = Math.floor(dist / 1000);
        dist += speed * dt;
        if (Math.floor(dist / 1000) > before) api.sfx.tone({ f: 880, d: 0.06, v: 0.06 });

        ensureCave();
        if (dist + W > nextBlock) {
          spawnBlock(nextBlock);
          nextBlock += Math.max(260, 620 - dist / 40) + Math.random() * 260;
        }
        blocks = blocks.filter(b => b.x + b.w > dist - 20);

        // collision with walls (sample the segments under the ship)
        for (const ox of [-ship.r, 0, ship.r]) {
          const s = wallAt(sx + ox);
          if (ship.y - ship.r * 0.8 < s.top || ship.y + ship.r * 0.8 > s.bot) crash(sx);
        }
        for (const b of blocks) {
          const nx = Math.max(b.x, Math.min(sx, b.x + b.w)), ny = Math.max(b.y, Math.min(ship.y, b.y + b.h));
          if ((nx - sx) ** 2 + (ny - ship.y) ** 2 < ship.r * ship.r * 0.7) crash(sx);
        }

        const tp = trail.length > 25 ? trail.shift() : {};
        tp.x = sx - 8; tp.y = ship.y; trail.push(tp);
      }

      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
      parts = parts.filter(p => p.life > 0);
    }

    function crash(sx) {
      if (dead) return;
      dead = true;
      explode(sx, ship.y);
      api.sfx.noise({ d: 0.5, v: 0.3 });
      api.sfx.tone({ f: 200, to: 40, d: 0.5, type: 'sawtooth', v: 0.1 });
    }

    // Built once, not per frame: gradients, the glowing ship sprite, and the trail colours.
    let bgGrad = null, wallGrad = null, shipSprite = null;
    const trailCols = Array.from({ length: 27 }, (_, i) => `rgba(92,225,230,${(i / 26 * 0.5).toFixed(3)})`);
    function prepare(ctx) {
      bgGrad = ctx.createLinearGradient(0, 0, 0, H); bgGrad.addColorStop(0, C.bg2); bgGrad.addColorStop(1, C.bg1);
      wallGrad = ctx.createLinearGradient(0, 0, 0, H);
      wallGrad.addColorStop(0, C.wallDeep); wallGrad.addColorStop(0.5, C.wall); wallGrad.addColorStop(1, C.wallDeep);
      const k = Math.max(1, Math.ceil(api.view.scale));       // draw the sprite at screen resolution
      shipSprite = document.createElement('canvas'); shipSprite.width = shipSprite.height = 48 * k;
      const s = shipSprite.getContext('2d'); s.scale(k, k); s.translate(24, 24);
      s.fillStyle = C.ship; s.shadowColor = C.ship; s.shadowBlur = 10;  // the expensive blur happens once, here
      s.beginPath(); s.moveTo(10, 0); s.lineTo(-9, -7); s.lineTo(-5, 0); s.lineTo(-9, 7); s.closePath(); s.fill();
    }

    function draw(ctx, view) {
      W = view.w;
      if (!bgGrad) prepare(ctx);
      const cam = dist;
      ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
      // parallax crystals
      ctx.fillStyle = 'rgba(141,149,196,.25)';
      const step = 70, off = (cam * 0.3) % step;
      for (let x = -off; x < W + step; x += step) {
        const k = Math.floor((x + cam * 0.3) / step);
        const y = ((k * 9301 + 49297) % 233280) / 233280 * H;
        ctx.fillRect(x, y, 2, 2);
      }

      // cave walls
      const n = segs.length, x0 = base - cam;
      ctx.fillStyle = wallGrad;
      ctx.beginPath(); ctx.moveTo(x0, -2);
      for (let i = 0; i < n; i++) ctx.lineTo(x0 + i * SEG, segs[i].top);
      ctx.lineTo(x0 + (n - 1) * SEG, -2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x0, H + 2);
      for (let i = 0; i < n; i++) ctx.lineTo(x0 + i * SEG, segs[i].bot);
      ctx.lineTo(x0 + (n - 1) * SEG, H + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.edge; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(x0, segs[0].top); for (let i = 1; i < n; i++) ctx.lineTo(x0 + i * SEG, segs[i].top); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, segs[0].bot); for (let i = 1; i < n; i++) ctx.lineTo(x0 + i * SEG, segs[i].bot); ctx.stroke();
      ctx.globalAlpha = 1;

      // blocks
      ctx.fillStyle = C.block;
      for (const b of blocks) ctx.fillRect(b.x - cam, b.y, b.w, b.h);

      // trail
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        ctx.fillStyle = trailCols[Math.round(i / trail.length * 26)];
        ctx.fillRect(p.x - cam - 1.5, p.y - 1.5, 3, 3);
      }

      // ship
      const sx = W * SHIP_X;
      if (!dead) {
        ctx.save(); ctx.translate(sx, ship.y); ctx.rotate(Math.max(-0.5, Math.min(0.5, ship.vy / 700)));
        if (started && api.input.held.a) {
          ctx.fillStyle = C.wall; ctx.beginPath();
          ctx.moveTo(-9, -3); ctx.lineTo(-16 - Math.random() * 7, 0); ctx.lineTo(-9, 3); ctx.fill();
        }
        ctx.drawImage(shipSprite, -24, -24, 48, 48);
        ctx.restore();
      }
      for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.fillRect(p.x - cam, p.y, 3, 3); }
      ctx.globalAlpha = 1;

      // HUD (top-left, clear of the pause button)
      const pad = 14;
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillStyle = C.text; ctx.font = '700 20px Silkscreen, "Courier New", monospace';
      const sc = Math.floor(dist / 10);
      if (sc !== hudScore) { hudScore = sc; hudText = sc.toLocaleString('en-US'); }
      ctx.fillText(hudText, pad, pad);
      ctx.fillStyle = C.muted; ctx.font = '400 10px Silkscreen, "Courier New", monospace';
      ctx.fillText(bestScore ? `BEST ${bestScore.toLocaleString('en-US')}` : api.player().toUpperCase(), pad, pad + 26);

      if (!started) {
        ctx.textAlign = 'center';
        ctx.fillStyle = C.text; ctx.font = '700 22px Silkscreen, "Courier New", monospace';
        const blink = Math.floor(t * 2) % 2 === 0;
        if (blink) ctx.fillText('HOLD TO FLY', W / 2, H / 2 + 46);
        ctx.fillStyle = C.muted; ctx.font = '400 15px "Chakra Petch", system-ui, sans-serif';
        ctx.fillText('touch · space · A button', W / 2, H / 2 + 76);
      }
    }

    let hudScore = -1, hudText = '0';
    return { update, draw, resize(v) { W = v.w; bgGrad = null; ensureCave(); }, debug: () => { const w = wallAt(dist + W * SHIP_X); return { y: ship.y, vy: ship.vy, top: w.top, bot: w.bot, dist, dead }; } };
  }
});
