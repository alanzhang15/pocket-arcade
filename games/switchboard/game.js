/* Switchboard: a 10-board lamp puzzle. Pressing a lamp flips it and its four neighbours; switch every lamp off.
   Reference implementation for turn-based / point-and-click games:
   - pointer: true      tap, mouse, trackpad, or the stick-driven cursor (shell draws it)
   - d-pad + A          moves a highlight and presses, for controller-only play
   - redraw: 'onDemand' nothing is drawn unless something changed (near-zero battery while you think)
   - getState()         the shell autosaves the run on pause / quit / backgrounding; create() resumes it */
Arcade.register({
  id: 'switchboard',
  title: 'Switchboard',
  blurb: 'Every switch flips its neighbours. Black out all ten boards in as few moves as you can.',
  controls: 'Tap a lamp, or use the d-pad and A. B undoes a move. Clear 10 boards; fewer moves score more.',
  pointer: true,
  redraw: 'onDemand',

  thumb(ctx, w, h) {
    ctx.fillStyle = '#0b0f22'; ctx.fillRect(0, 0, w, h);
    const on = [1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1];
    for (let i = 0; i < 25; i++) {
      const x = 26 + (i % 5) * 13, y = 10 + Math.floor(i / 5) * 13;
      ctx.fillStyle = on[i] ? '#ffb547' : '#1d254a';
      ctx.fillRect(x, y, 10, 10);
    }
  },

  art(ctx, W, H, kind) {
    const g = ctx.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, Math.max(W, H) * 0.7);
    g.addColorStop(0, '#1a2250'); g.addColorStop(1, '#070a17');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const n = kind === 'cover' ? 5 : 9, rows = kind === 'cover' ? 6 : 5;
    const cell = Math.min(W / (n + 1.5), (kind === 'cover' ? H * 0.6 : H * 0.85) / (rows + 0.5));
    const ox = (W - cell * n) / 2, oy = kind === 'cover' ? H * 0.34 : (H - cell * rows) / 2 + (kind === 'wide' ? H * 0.08 : 0);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let r = 0; r < rows; r++) for (let c = 0; c < n; c++) {
      const lit = rnd() < 0.45, x = ox + c * cell + cell * 0.1, y = oy + r * cell + cell * 0.1, s = cell * 0.8;
      ctx.fillStyle = '#121838'; ctx.fillRect(x, y, s, s);
      if (lit) {
        ctx.shadowColor = '#ffb547'; ctx.shadowBlur = cell * 0.5;
        ctx.fillStyle = '#ffb547'; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.32, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#2a3363'; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.32, 0, 7); ctx.fill();
      }
    }
  },

  create(api) {
    const N = 5, BOARDS = 10, CELL = 54;
    const C = { bg: '#0b0f22', panel: '#121838', off: '#232c58', on: '#ffb547', onCore: '#fff1d6', hi: '#5ce1e6', text: '#e9ecff', muted: '#8d95c4', good: '#7ee0a1' };

    // ---- state (everything in here is what gets autosaved)
    let st = api.load('run');
    if (!st || !Array.isArray(st.grid)) st = newRun();
    let undo = [];           // per-board undo stack (not saved; cheap to lose)
    let flash = 0;           // seconds of "board cleared" animation remaining
    let anim = new Float32Array(N * N); // per-lamp fade 0..1 toward its state
    for (let i = 0; i < N * N; i++) anim[i] = st.grid[i];

    function newRun() { return Object.assign({ board: 1, total: 0 }, newBoard(1)); }
    function newBoard(board) {
      const grid = new Array(N * N).fill(0);
      const presses = 3 + Math.min(board, 8);         // harder boards need more presses
      const used = new Set();
      while (used.size < presses) used.add(Math.floor(Math.random() * N * N));
      for (const i of used) toggle(grid, i);
      if (grid.every(v => !v)) toggle(grid, 12);
      return { grid, moves: 0, par: presses, cursor: 12 };
    }
    function toggle(grid, i) {
      const r = Math.floor(i / N), c = i % N;
      for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) grid[rr * N + cc] ^= 1;
      }
    }

    // ---- layout (recomputed on resize)
    let ox = 0, oy = 0, hudX = 0;
    function layout(v) {
      const gridW = CELL * N;
      ox = Math.round((v.w - gridW) / 2 + Math.min(80, Math.max(0, (v.w - gridW) / 2 - 150)));
      oy = Math.round((v.h - gridW) / 2);
      hudX = Math.max(16, ox - 190);
    }
    layout(api.view);
    const cellAt = (x, y) => {
      const c = Math.floor((x - ox) / CELL), r = Math.floor((y - oy) / CELL);
      return c >= 0 && c < N && r >= 0 && r < N ? r * N + c : -1;
    };

    function press(i) {
      if (flash > 0) return;
      undo.push(st.grid.slice());
      toggle(st.grid, i);
      st.moves++;
      st.cursor = i;
      api.sfx.tone({ f: st.grid[i] ? 520 : 330, d: 0.05, v: 0.06 });
      if (st.grid.every(v => !v)) {
        const pts = Math.max(10, 100 - Math.max(0, st.moves - st.par) * 10);
        st.total += pts; st.lastPts = pts;
        flash = 1.1;
        api.sfx.tone({ f: 523, to: 1046, d: 0.25, type: 'triangle', v: 0.1 });
      }
    }

    function update(dt) {
      let changed = false;
      const inp = api.input, p = api.pointer;
      if (flash > 0) {
        flash -= dt; changed = true;
        if (flash <= 0) {
          if (st.board >= BOARDS) { api.gameOver(st.total); return true; }
          Object.assign(st, newBoard(st.board + 1), { board: st.board + 1 });
          undo = [];
        }
      } else {
        // controller / keyboard: move highlight, press with A, undo with B
        const r = Math.floor(st.cursor / N), c = st.cursor % N;
        if (inp.pressed.up && !p.virtual) { st.cursor = ((r + N - 1) % N) * N + c; changed = true; }
        if (inp.pressed.down && !p.virtual) { st.cursor = ((r + 1) % N) * N + c; changed = true; }
        if (inp.pressed.left && !p.virtual) { st.cursor = r * N + (c + N - 1) % N; changed = true; }
        if (inp.pressed.right && !p.virtual) { st.cursor = r * N + (c + 1) % N; changed = true; }
        if (inp.pressed.a && !p.virtual) { press(st.cursor); changed = true; }
        if (inp.pressed.b && undo.length) { st.grid = undo.pop(); st.moves++; changed = true; api.sfx.tone({ f: 220, d: 0.05, v: 0.05 }); }
        // pointer: touch, mouse, trackpad, or the virtual cursor (A clicks)
        if (p.pressed) { const i = cellAt(p.x, p.y); if (i >= 0) { press(i); changed = true; } }
        if (p.virtual && p.active) { const i = cellAt(p.x, p.y); if (i >= 0 && i !== st.cursor) { st.cursor = i; changed = true; } }
      }
      // lamp fades: keep drawing only while something is still moving
      for (let i = 0; i < N * N; i++) {
        const target = st.grid[i];
        if (anim[i] !== target) {
          anim[i] += (target - anim[i]) * Math.min(1, dt * 18);
          if (Math.abs(anim[i] - target) < 0.02) anim[i] = target;
          changed = true;
        }
      }
      return changed;
    }

    function draw(ctx, view) {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, view.w, view.h);
      // board
      ctx.fillStyle = C.panel; ctx.fillRect(ox - 10, oy - 10, CELL * N + 20, CELL * N + 20);
      for (let i = 0; i < N * N; i++) {
        const x = ox + (i % N) * CELL, y = oy + Math.floor(i / N) * CELL, a = anim[i];
        ctx.fillStyle = C.off; ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
        if (a > 0) {
          ctx.globalAlpha = a;
          ctx.fillStyle = C.on; ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
          ctx.fillStyle = C.onCore; ctx.fillRect(x + 16, y + 16, CELL - 32, CELL - 32);
          ctx.globalAlpha = 1;
        }
      }
      if (flash <= 0 && (!api.pointer.active || api.pointer.virtual || api.input.held.a)) {
        const x = ox + (st.cursor % N) * CELL, y = oy + Math.floor(st.cursor / N) * CELL;
        ctx.strokeStyle = C.hi; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      }
      // HUD
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = C.muted; ctx.font = '400 11px Silkscreen, "Courier New", monospace';
      ctx.fillText(`BOARD ${st.board} OF ${BOARDS}`, hudX, oy);
      ctx.fillStyle = C.text; ctx.font = '700 30px Silkscreen, "Courier New", monospace';
      ctx.fillText(String(st.total), hudX, oy + 22);
      ctx.fillStyle = C.muted; ctx.font = '400 11px Silkscreen, "Courier New", monospace';
      ctx.fillText('SCORE', hudX, oy + 58);
      ctx.fillStyle = st.moves <= st.par ? C.good : C.text; ctx.font = '700 18px Silkscreen, "Courier New", monospace';
      ctx.fillText(`${st.moves} / ${st.par}`, hudX, oy + 96);
      ctx.fillStyle = C.muted; ctx.font = '400 11px Silkscreen, "Courier New", monospace';
      ctx.fillText('MOVES / PAR', hudX, oy + 120);
      const b = api.best();
      if (b) ctx.fillText(`BEST ${b.score}`, hudX, oy + 160);
      if (flash > 0) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(7,10,23,.75)'; ctx.fillRect(ox - 10, oy + CELL * N / 2 - 34, CELL * N + 20, 68);
        ctx.fillStyle = C.on; ctx.font = '700 22px Silkscreen, "Courier New", monospace';
        ctx.fillText(`+${st.lastPts}`, ox + CELL * N / 2, oy + CELL * N / 2 - 8);
        ctx.fillStyle = C.text; ctx.font = '400 11px Silkscreen, "Courier New", monospace';
        ctx.fillText(st.board >= BOARDS ? 'ALL BOARDS DARK' : 'BOARD CLEAR', ox + CELL * N / 2, oy + CELL * N / 2 + 18);
      }
    }

    return {
      update, draw,
      resize(v) { layout(v); },
      getState: () => st
    };
  }
});
