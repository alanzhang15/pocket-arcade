/* Sol: Tycoon. Run a passenger and cargo line across the solar system, from chemical rockets in Earth orbit to fusion
   torches at Jupiter. Pocket-scale transit tycoon: license ports, load jobs, plan burns, research, build stations.
   - Wall-clock flights: a flight under way always finishes, even while the device sleeps. Routines (looping ships)
     pause after an idle cap until you check in.
   - pointer: true + d-pad highlight on every screen; redraw: 'onDemand' at 30 fps; the company lives in the 'main' save.
   - Sections: DATA (tables) · SIM (pure state + clock) · Arcade.register (UI, render). */
(function () {
  'use strict';
  const SEC = 1000, MIN = 60000, HR = 3600000;

  const TUNE = {
    startCr: 15000,
    refillMs: 2 * MIN, refillAdd: 2, boardBase: 5, expireMin: [25, 70],
    vflDiv: 12,                 // slowest cruise = brachistochrone speed / 12
    stopMs: 10 * SEC,           // pause at each intermediate stop
    vip: { base: 0.06, broker: 0.04, tier: 0.03, guild: 0.04 },
    partDrop: { normal: 0.05, vip: 0.12, dev: 0.15 },
    passiveCapH: 12,            // labs and station coffers fill for at most this long
    routineCapH: [4, 8, 16, 24],
    xpNeed: L => Math.round(60 * Math.pow(L - 1, 2.1)),
    shipCap: L => 2 + Math.floor(L / 2),
    wellFare: 150, spaceFare: 56, fareRegion: [1, 2.6, 5.5, 9, 14],
    regionScale: [1, 10, 70, 110, 200],
    famFuel: [1.5, 6, 450],       // fuel price multiplier: chemical, nuclear, torch
    windowAmp: 0.3, windowP: [0, 3 * HR, 5 * HR, 7 * HR],
    marketMs: 3 * HR,
    gate: [null, null, { lv: 10, tech: 'tether', proj: 'elev' }, { lv: 24, tech: 'torch', proj: 'yards' }],
    lateVip: 0.5, lateVipInsured: 0.8,
    assembleFee: 0.3, assembleMin: [0, 2, 8, 20], sellBack: 0.5
  };

  // ---------------------------------------------------------------- DATA
  // tags
  const T_E = 1, T_LU = 2, T_ICE = 4, T_ORE = 8, T_HUB = 16, T_TOUR = 32, T_SCI = 64, T_ORB = 128;
  // nodes: k id, n name, r region (0 Earth, 1 Mars, 2 Belt, 3 Jove, 4 outer), x/y map, t type, w well class
  // (0 dock anywhere · 1 Ceres · 2 Luna-class · 3 Mars · 4 Earth), e era, c licence (sites: charter), b berths,
  // dep default depot, fp fuel price/t, la label side (0 below, 1 above, 2 right, 3 left)
  const N = [
    { k: 'KOU', n: 'Kourou', r: 0, x: 168, y: 192, t: 'pad', w: 4, e: 1, c: 0, b: 2, dep: 1, fp: 8, tg: T_E | T_HUB, la: 2 },
    { k: 'CAN', n: 'Canaveral', r: 0, x: 150, y: 140, t: 'pad', w: 4, e: 1, c: 6000, b: 2, dep: 1, fp: 8, tg: T_E | T_TOUR, la: 2 },
    { k: 'BAI', n: 'Baikonur', r: 0, x: 112, y: 104, t: 'pad', w: 4, e: 1, c: 5000, b: 2, dep: 1, fp: 7, tg: T_E, la: 1 },
    { k: 'SRI', n: 'Sriharikota', r: 0, x: 150, y: 244, t: 'pad', w: 4, e: 1, c: 5000, b: 2, dep: 1, fp: 7, tg: T_E, la: 2 },
    { k: 'ANC', n: 'Anchor Atoll', r: 0, x: 104, y: 280, t: 'pad', w: 4, e: 2, c: 150000, b: 3, dep: 1, fp: 6, tg: T_E | T_HUB, la: 0 },
    { k: 'LOW', n: 'Lowport', r: 0, x: 236, y: 172, t: 'orb', w: 0, e: 1, c: 0, b: 2, dep: 1, fp: 15, tg: T_HUB | T_TOUR | T_ORB, la: 0 },
    { k: 'PLR', n: 'Polar Ring', r: 0, x: 196, y: 74, t: 'orb', w: 0, e: 1, c: 8000, b: 1, dep: 0, fp: 16, tg: T_SCI | T_ORB, la: 2 },
    { k: 'MEO', n: 'Relay Nine', r: 0, x: 262, y: 262, t: 'site', w: 0, e: 1, c: 20000, b: 2, dep: 0, fp: 16, tg: T_ORB, la: 0, kits: 6 },
    { k: 'HIG', n: 'Highport', r: 0, x: 330, y: 150, t: 'orb', w: 0, e: 1, c: 15000, b: 2, dep: 0, fp: 20, tg: T_HUB | T_ORB, la: 1 },
    { k: 'L1', n: 'Lagrange One', r: 0, x: 440, y: 100, t: 'site', w: 0, e: 1, c: 20000, b: 2, dep: 0, fp: 18, tg: T_ORB, la: 1, kits: 6 },
    { k: 'LUO', n: 'Selene Orbital', r: 0, x: 528, y: 168, t: 'orb', w: 0, e: 1, c: 25000, b: 2, dep: 0, fp: 18, tg: T_HUB | T_ORB, la: 1 },
    { k: 'TRQ', n: 'Tranquility', r: 0, x: 616, y: 192, t: 'base', w: 2, e: 1, c: 28000, b: 1, dep: 1, fp: 12, tg: T_LU | T_TOUR, la: 2 },
    { k: 'SHK', n: 'Shackleton', r: 0, x: 600, y: 236, t: 'base', w: 2, e: 1, c: 30000, b: 1, dep: 1, fp: 10, tg: T_LU | T_ICE | T_SCI, la: 0 },
    { k: 'L2', n: 'Farside L2', r: 0, x: 690, y: 124, t: 'site', w: 0, e: 1, c: 20000, b: 2, dep: 0, fp: 18, tg: T_ORB, la: 1, kits: 6 },
    { k: 'DID', n: 'Didymos', r: 1, x: 806, y: 266, t: 'rock', w: 0, e: 2, c: 120000, b: 1, dep: 0, fp: 14, tg: T_ORE, la: 0 },
    { k: 'CYC', n: 'Cycler Halt', r: 1, x: 836, y: 118, t: 'site', w: 0, e: 2, c: 250000, b: 2, dep: 0, fp: 14, tg: T_ORB, la: 1, kits: 8 },
    { k: 'MAO', n: 'Areo Station', r: 1, x: 994, y: 146, t: 'orb', w: 0, e: 2, c: 250000, b: 2, dep: 1, fp: 12, tg: T_HUB | T_ORB, la: 1 },
    { k: 'PHO', n: 'Phobos', r: 1, x: 986, y: 236, t: 'rock', w: 0, e: 2, c: 200000, b: 2, dep: 0, fp: 11, tg: T_ORE, la: 0 },
    { k: 'JEZ', n: 'Jezero', r: 1, x: 1070, y: 160, t: 'base', w: 3, e: 2, c: 300000, b: 1, dep: 1, fp: 8, tg: T_HUB | T_SCI, la: 1 },
    { k: 'HEL', n: 'Hellas Dome', r: 1, x: 1106, y: 236, t: 'base', w: 3, e: 2, c: 280000, b: 1, dep: 1, fp: 8, tg: T_TOUR, la: 0 },
    { k: 'DEI', n: 'Deimos', r: 1, x: 1180, y: 110, t: 'rock', w: 0, e: 2, c: 180000, b: 1, dep: 0, fp: 11, tg: T_ORE, la: 1 },
    { k: 'MTJ', n: 'Red Trojan', r: 1, x: 1232, y: 272, t: 'site', w: 0, e: 2, c: 250000, b: 2, dep: 0, fp: 12, tg: T_ORB, la: 0, kits: 8 },
    { k: 'VES', n: 'Vesta', r: 2, x: 1384, y: 116, t: 'rock', w: 0, e: 3, c: 2000000, b: 2, dep: 1, fp: 9, tg: T_ORE, la: 1 },
    { k: 'PSY', n: 'Psyche', r: 2, x: 1452, y: 250, t: 'rock', w: 0, e: 3, c: 2200000, b: 1, dep: 0, fp: 9, tg: T_ORE, la: 0 },
    { k: 'CER', n: 'Ceres', r: 2, x: 1566, y: 178, t: 'base', w: 1, e: 3, c: 3000000, b: 2, dep: 1, fp: 6, tg: T_HUB | T_ICE, la: 0 },
    { k: 'CSP', n: 'Ceres Spindle', r: 2, x: 1606, y: 112, t: 'site', w: 0, e: 3, c: 3000000, b: 3, dep: 0, fp: 7, tg: T_ORB | T_HUB, la: 1, kits: 10, need: 'spin' },
    { k: 'PAL', n: 'Pallas', r: 2, x: 1700, y: 258, t: 'rock', w: 0, e: 3, c: 2000000, b: 1, dep: 0, fp: 8, tg: T_ORE, la: 0 },
    { k: 'KIR', n: 'Kirkwood Gap', r: 2, x: 1772, y: 136, t: 'site', w: 0, e: 3, c: 3000000, b: 2, dep: 0, fp: 8, tg: T_ORB, la: 1, kits: 10 },
    { k: 'HYG', n: 'Hygiea', r: 2, x: 1860, y: 214, t: 'rock', w: 0, e: 3, c: 2500000, b: 1, dep: 1, fp: 8, tg: T_ICE, la: 0 },
    { k: 'TRJ', n: 'Trojan Camp', r: 3, x: 1990, y: 282, t: 'site', w: 0, e: 3, c: 3000000, b: 2, dep: 0, fp: 7, tg: T_ORB, la: 0, kits: 10 },
    { k: 'JOV', n: 'Jove High', r: 3, x: 2070, y: 116, t: 'orb', w: 0, e: 3, c: 4000000, b: 3, dep: 1, fp: 7, tg: T_HUB | T_ORB, la: 1 },
    { k: 'IO', n: 'Io Foundry', r: 3, x: 2236, y: 146, t: 'orb', w: 0, e: 3, c: 3000000, b: 1, dep: 0, fp: 8, tg: T_ORE | T_ORB, la: 1 },
    { k: 'EUR', n: 'Europa', r: 3, x: 2252, y: 252, t: 'base', w: 2, e: 3, c: 3500000, b: 1, dep: 1, fp: 5, tg: T_ICE | T_SCI, la: 0 },
    { k: 'GAN', n: 'Ganymede', r: 3, x: 2324, y: 178, t: 'base', w: 2, e: 3, c: 4000000, b: 2, dep: 1, fp: 5, tg: T_HUB | T_ICE, la: 2 },
    { k: 'CAL', n: 'Callisto', r: 3, x: 2396, y: 262, t: 'base', w: 2, e: 3, c: 3200000, b: 1, dep: 1, fp: 5, tg: T_ICE, la: 0 },
    { k: 'HIM', n: 'Himalia', r: 3, x: 2426, y: 96, t: 'rock', w: 0, e: 3, c: 2500000, b: 1, dep: 0, fp: 7, tg: T_ORE, la: 1 },
    { k: 'TIT', n: 'Titan', r: 4, x: 2770, y: 140, t: 'base', w: 2, e: 4, c: 0, b: 1, dep: 0, fp: 5, tg: 0, la: 1 },
    { k: 'ENC', n: 'Enceladus', r: 4, x: 2760, y: 254, t: 'base', w: 1, e: 4, c: 0, b: 1, dep: 0, fp: 5, tg: 0, la: 0 },
    { k: 'TRI', n: 'Triton', r: 4, x: 3000, y: 150, t: 'base', w: 1, e: 4, c: 0, b: 1, dep: 0, fp: 5, tg: 0, la: 1 }
  ];
  const NN = N.length, NI = {};
  N.forEach((n, i) => { NI[n.k] = i; });
  const REGIONS = [
    { n: 'Earth', x0: -60, x1: 760, cx: 0 }, { n: 'Mars', x0: 760, x1: 1300, cx: 740 },
    { n: 'Belt', x0: 1300, x1: 1940, cx: 1320 }, { n: 'Jove', x0: 1940, x1: 2560, cx: 1960 },
    { n: 'Outer', x0: 2560, x1: 3120, cx: 2580 }
  ];
  const MAP_X1 = 3080;
  // bodies drawn on the map (r in world units)
  const BODIES = [
    { k: 'earth', x: 64, y: 188, r: 96 }, { k: 'moon', x: 606, y: 214, r: 24 }, { k: 'mars', x: 1086, y: 198, r: 46 },
    { k: 'rock', x: 806, y: 266, r: 5 }, { k: 'rock', x: 986, y: 236, r: 5 }, { k: 'rock', x: 1180, y: 110, r: 4 },
    { k: 'rock', x: 1384, y: 116, r: 7 }, { k: 'rock', x: 1452, y: 250, r: 6 }, { k: 'ceres', x: 1566, y: 178, r: 11 },
    { k: 'rock', x: 1700, y: 258, r: 7 }, { k: 'rock', x: 1860, y: 214, r: 6 }, { k: 'jupiter', x: 2156, y: 196, r: 62 },
    { k: 'ice', x: 2252, y: 252, r: 8 }, { k: 'ice', x: 2324, y: 178, r: 10 }, { k: 'ice', x: 2396, y: 262, r: 9 },
    { k: 'rock', x: 2426, y: 96, r: 4 }, { k: 'saturn', x: 2690, y: 196, r: 40 }, { k: 'neptune', x: 2950, y: 196, r: 22 }
  ];

  // edges: well (surface↔orbit: wu up Δv, wd down Δv, wt seconds), space (d distance, ip window class), tether
  const E = [];
  const well = (a, b, wu, wd, wt) => E.push({ a: NI[a], b: NI[b], d: 0, wu, wd, wt, k: 1, ip: 0 });
  const space = (a, b, d, ip = 0) => E.push({ a: NI[a], b: NI[b], d, wu: 0, wd: 0, wt: 0, k: 0, ip });
  const moon = (a, b, d, wu, wd, wt, ip = 0) => E.push({ a: NI[a], b: NI[b], d, wu, wd, wt, k: 3, ip }); // a = surface end
  for (const p of ['KOU', 'CAN', 'BAI', 'SRI', 'ANC']) well(p, 'LOW', 3.4, 0.3, 25);
  well('BAI', 'PLR', 3.6, 0.3, 30); well('CAN', 'PLR', 3.6, 0.3, 30);
  E.push({ a: NI.ANC, b: NI.HIG, d: 0, wu: 0, wd: 0, wt: 480, k: 2, ip: 0 });
  space('LOW', 'PLR', 120); space('LOW', 'MEO', 150); space('LOW', 'HIG', 300); space('MEO', 'HIG', 180);
  space('HIG', 'L1', 520); space('LOW', 'LUO', 1100); space('HIG', 'LUO', 900); space('L1', 'LUO', 420);
  space('LUO', 'L2', 260); space('L1', 'L2', 620);
  well('TRQ', 'LUO', 1.0, 1.0, 20); well('SHK', 'LUO', 1.0, 1.0, 20);
  space('L2', 'CYC', 2600); space('HIG', 'CYC', 3200); space('LUO', 'DID', 3600); space('DID', 'CYC', 1800);
  space('CYC', 'MAO', 4000, 1); space('L2', 'MAO', 7000, 1); space('HIG', 'MAO', 7600, 1); space('LUO', 'MAO', 7300, 1);
  space('DID', 'MAO', 4800, 1); space('MAO', 'PHO', 60); space('MAO', 'DEI', 140); space('PHO', 'DEI', 120);
  well('JEZ', 'MAO', 2.0, 0.6, 40); well('HEL', 'MAO', 2.0, 0.6, 40);
  space('MAO', 'MTJ', 2200); space('DEI', 'MTJ', 1900);
  space('MAO', 'VES', 30000, 2); space('DEI', 'VES', 28000, 2); space('MTJ', 'PSY', 25000, 2); space('MAO', 'PSY', 32000, 2);
  space('VES', 'PSY', 9000); moon('CER', 'VES', 16000, 0.3, 0.3, 20); moon('CER', 'PSY', 14000, 0.3, 0.3, 20);
  well('CER', 'CSP', 0.3, 0.3, 20); space('CSP', 'VES', 15000); space('CSP', 'PSY', 13000); space('CSP', 'PAL', 12000);
  moon('CER', 'PAL', 12000, 0.3, 0.3, 20); space('PAL', 'KIR', 10000); space('KIR', 'HYG', 9000); space('PAL', 'HYG', 15000);
  moon('CER', 'HYG', 20000, 0.3, 0.3, 20);
  space('HYG', 'JOV', 105000, 3); space('KIR', 'JOV', 112000, 3); space('CSP', 'JOV', 120000, 3);
  moon('CER', 'JOV', 124000, 0.3, 0.3, 20, 3); space('MAO', 'JOV', 160000, 3); space('TRJ', 'JOV', 25000);
  space('TRJ', 'HYG', 70000, 3); space('PAL', 'TRJ', 80000, 3);
  space('JOV', 'IO', 3000); moon('EUR', 'JOV', 4500, 1.2, 1.2, 25); moon('GAN', 'JOV', 6000, 1.2, 1.2, 25);
  moon('CAL', 'JOV', 9000, 1.2, 1.2, 25); space('JOV', 'HIM', 7000); moon('EUR', 'IO', 2500, 1.2, 1.2, 25);
  E.forEach((e, i) => { e.ph = (i * 2.399) % 6.283; });
  const ADJ = N.map(() => []);
  E.forEach((e, i) => { ADJ[e.a].push(i); ADJ[e.b].push(i); });

  // job types (p: passenger, m: tonnes, r: pay rate, e: era, w: weight, fr/to: required origin/destination tags)
  const JT = [
    { n: 'Crew rotation', p: 1, m: 0.1, r: 1.0, e: 1, w: 3 },
    { n: 'Tourists', p: 1, m: 0.1, r: 0.9, e: 1, w: 2, to: T_TOUR },
    { n: 'Scientists', p: 1, m: 0.1, r: 1.1, e: 1, w: 1, to: T_SCI },
    { n: 'Engineers', p: 1, m: 0.1, r: 1.0, e: 1, w: 2 },
    { n: 'Colonists', p: 1, m: 0.1, r: 0.8, e: 2, w: 3 },
    { n: 'Miners', p: 1, m: 0.1, r: 0.9, e: 3, w: 2, to: T_ORE | T_ICE },
    { n: 'Satellite', p: 0, m: 2, r: 1.3, e: 1, w: 3, fr: T_E, to: T_ORB },
    { n: 'Propellant', p: 0, m: 4, r: 0.6, e: 1, w: 2 },
    { n: 'Machinery', p: 0, m: 3, r: 1.0, e: 1, w: 3 },
    { n: 'Food', p: 0, m: 2, r: 0.9, e: 1, w: 2 },
    { n: 'Medical', p: 0, m: 1, r: 1.4, e: 1, w: 1 },
    { n: 'Electronics', p: 0, m: 1, r: 1.2, e: 1, w: 2, fr: T_E },
    { n: 'Helium-3', p: 0, m: 1, r: 1.6, e: 1, w: 2, fr: T_LU },
    { n: 'Regolith', p: 0, m: 3, r: 0.8, e: 1, w: 1, fr: T_LU },
    { n: 'Water ice', p: 0, m: 4, r: 0.8, e: 2, w: 2, fr: T_ICE },
    { n: 'Ore', p: 0, m: 5, r: 0.7, e: 2, w: 2, fr: T_ORE },
    { n: 'Reactor parts', p: 0, m: 3, r: 1.3, e: 2, w: 1 },
    { n: 'Volatiles', p: 0, m: 3, r: 1.0, e: 3, w: 2, fr: T_ICE },
    { n: 'Fusion pellets', p: 0, m: 1, r: 1.5, e: 3, w: 1 },
    // special jobs (never rolled at random)
    { n: 'Research payload', p: 0, m: 1, r: 0.8, sp: 1 },
    { n: 'Station kit', p: 0, m: 3, r: 0.5, sp: 1 },
    { n: 'Tether spool', p: 0, m: 3, r: 0.6, sp: 1 },
    { n: 'Yard truss', p: 0, m: 4, r: 0.6, sp: 1 },
    { n: 'Hab ring segment', p: 0, m: 3, r: 0.35, sp: 1 },
    { n: 'Greenhouse module', p: 0, m: 3, r: 0.35, sp: 1 },
    { n: 'Concourse section', p: 0, m: 3, r: 0.35, sp: 1 }
  ];
  const J_RES = 19, J_KIT = 20, J_SPOOL = 21, J_TRUSS = 22, J_DEV = 23;
  const K_NORM = 0, K_DEV = 1, K_PROJ = 2, K_KIT = 3, K_RES = 4; // job kinds
  const DEV = [
    { n: 'Hab Ring', need: 4, cost: 8000 }, { n: 'Greenhouse', need: 6, cost: 25000 }, { n: 'Concourse', need: 8, cost: 60000 }
  ];
  const PROJ = {
    elev: { n: 'Space Elevator', site: NI.HIG, need: 20, cost: 40000, job: J_SPOOL, from: T_E, tech: 'tether', era: 1,
      d: 'A carbon tether from Anchor Atoll to Highport. Climbers lift cargo to GEO without fuel.' },
    yards: { n: 'Phobos Torch Yards', site: NI.PHO, need: 24, cost: 600000, job: J_TRUSS, from: 0, tech: 'fusion', era: 2,
      d: 'Shipyards and fuel works on Phobos, where the first fusion torch ships are built.' }
  };

  // technology: b branch (0 propulsion, 1 hulls, 2 infrastructure, 3 operations), e era column, m minutes
  const TECH = [
    { k: 'meth', n: 'Methalox Engines', b: 0, e: 1, rp: 15, cr: 6000, m: 2, d: 'Chemical drives +8% exhaust velocity' },
    { k: 'reuse', n: 'Reusable Boosters', b: 0, e: 1, rp: 30, cr: 15000, m: 4, q: ['meth'], d: 'Blueprint: Gull reusable lifter' },
    { k: 'fair', n: 'Wide Fairings', b: 1, e: 1, rp: 10, cr: 5000, m: 2, d: 'Cargo crates 15% lighter' },
    { k: 'crew2', n: 'Crew Capsule II', b: 1, e: 1, rp: 15, cr: 8000, m: 3, d: 'Passenger fares +10%' },
    { k: 'depot', n: 'Orbital Depots', b: 2, e: 1, rp: 10, cr: 6000, m: 2, d: 'Fuel depots for orbital ports. Blueprint: Ferry tug' },
    { k: 'kits', n: 'Station Kits', b: 2, e: 1, rp: 25, cr: 15000, m: 4, q: ['depot'], d: 'Found your own stations at build sites' },
    { k: 'lander', n: 'Lunar Landers', b: 2, e: 1, rp: 25, cr: 12000, m: 4, d: 'Blueprint: Heron lunar lander' },
    { k: 'plan', n: 'Flight Planning', b: 3, e: 1, rp: 20, cr: 10000, m: 3, d: 'Routines: a ship loops between two ports' },
    { k: 'atc', n: 'Traffic Control', b: 3, e: 1, rp: 15, cr: 8000, m: 3, d: '+2 max berths at every port' },
    { k: 'broker', n: "Brokers' Guild", b: 3, e: 1, rp: 20, cr: 12000, m: 4, d: '+2 jobs per board and more VIP jobs' },
    { k: 'tether', n: 'Tether Materials', b: 2, e: 1, rp: 60, cr: 50000, m: 10, q: ['kits'], key: 2, d: 'Keystone: commission the Space Elevator' },
    { k: 'ntr', n: 'Nuclear Thermal', b: 0, e: 2, rp: 60, cr: 120000, m: 10, d: 'Blueprint: Drake transfer ship' },
    { k: 'bimodal', n: 'Bimodal NTR', b: 0, e: 2, rp: 90, cr: 200000, m: 15, q: ['ntr'], d: 'Nuclear drives +15%. Blueprint: Barge' },
    { k: 'fusion', n: 'Fusion Ignition', b: 0, e: 2, rp: 150, cr: 300000, m: 25, q: ['bimodal'], d: 'Labs +25% RP. Unlocks the Phobos Torch Yards' },
    { k: 'torch', n: 'Fusion Torch Drive', b: 0, e: 2, rp: 300, cr: 800000, m: 45, q: ['fusion'], key: 3, d: 'Keystone: torch ships. Blueprint: Wasp courier' },
    { k: 'heavy', n: 'Heavy Lift', b: 1, e: 2, rp: 60, cr: 100000, m: 10, d: 'Blueprint: Atlas heavy lifter' },
    { k: 'modular', n: 'Modular Hulls', b: 1, e: 2, rp: 70, cr: 120000, m: 12, d: 'Refit slots at any port, half price' },
    { k: 'cabin', n: 'Cabin Class', b: 1, e: 2, rp: 80, cr: 150000, m: 12, d: 'Cabin slots (+25% fares). Blueprint: Lantern' },
    { k: 'aero', n: 'Aerobraking', b: 1, e: 2, rp: 70, cr: 140000, m: 12, d: 'Blueprint: Kite Mars lander' },
    { k: 'isru', n: 'Lunar ISRU', b: 2, e: 2, rp: 60, cr: 100000, m: 10, d: 'ISRU upgrade: cheap fuel at icy ports' },
    { k: 'driver', n: 'Mass Driver', b: 2, e: 2, rp: 90, cr: 180000, m: 15, q: ['isru'], d: 'Free launches from Luna. Blueprint: Driver Pod' },
    { k: 'auto1', n: 'Fleet Autonomy I', b: 3, e: 2, rp: 60, cr: 100000, m: 10, q: ['plan'], d: 'Routines run 8 h unattended' },
    { k: 'insure', n: 'Insurance', b: 3, e: 2, rp: 50, cr: 90000, m: 8, d: 'Late VIP jobs still pay 80%' },
    { k: 'salvage', n: 'Salvage', b: 3, e: 2, rp: 50, cr: 90000, m: 8, d: 'Selling a ship returns some of its parts' },
    { k: 'isp', n: 'High-Isp Torch', b: 0, e: 3, rp: 400, cr: 3e6, m: 60, d: 'Torch drives +20% exhaust velocity' },
    { k: 'hig', n: 'Hi-G Couches', b: 0, e: 3, rp: 350, cr: 2.5e6, m: 50, d: 'Hard burns with passengers. Blueprint: Packet' },
    { k: 'bulk', n: 'Bulk Freighters', b: 1, e: 3, rp: 300, cr: 2e6, m: 40, d: 'Blueprint: Ox torch freighter' },
    { k: 'spinhab', n: 'Spin Habs', b: 1, e: 3, rp: 350, cr: 2.5e6, m: 50, d: 'Blueprint: Pilgrim liner' },
    { k: 'icehaul', n: 'Ice Haulers', b: 1, e: 3, rp: 300, cr: 2e6, m: 40, d: 'Blueprint: Iceboat' },
    { k: 'lux', n: 'Luxury Fitouts', b: 1, e: 3, rp: 400, cr: 3e6, m: 60, q: ['cabin'], d: 'Blueprint: Yacht' },
    { k: 'hopper', n: 'Rock Hoppers', b: 2, e: 3, rp: 300, cr: 2e6, m: 40, d: 'Blueprint: Prospector' },
    { k: 'spin', n: 'Ceres Spin Station', b: 2, e: 3, rp: 350, cr: 2.5e6, m: 50, q: ['kits'], d: 'Build site: Ceres Spindle' },
    { k: 'icemine', n: 'Ice Mining', b: 2, e: 3, rp: 300, cr: 2e6, m: 40, q: ['isru'], d: 'ISRU fuel 30% cheaper again' },
    { k: 'auto2', n: 'Fleet Autonomy II', b: 3, e: 3, rp: 300, cr: 2e6, m: 40, q: ['auto1'], d: 'Routines run 16 h unattended' },
    { k: 'auto3', n: 'Fleet Autonomy III', b: 3, e: 3, rp: 500, cr: 4e6, m: 80, q: ['auto2'], d: 'Routines run 24 h unattended' },
    { k: 'consort', n: 'Research Consortium', b: 3, e: 3, rp: 400, cr: 3e6, m: 60, d: 'A second research queue' }
  ];
  const TI = {};
  TECH.forEach((t, i) => { TI[t.k] = i; });
  const BRANCH = ['Propulsion', 'Hulls', 'Infrastructure', 'Operations'];

  // ship designs: f family (0 chemical, 1 nuclear, 2 torch), cfg slots (S seat, C cabin, K cargo), fx fixed layout,
  // dry/fuel tonnes, ve exhaust velocity (Δv units), F thrust, land (max well class), rec parts [hull, drive, systems]
  const DS = [
    { k: 'kestrel', n: 'Kestrel', e: 1, f: 0, cfg: 'SK', dry: 4, fuel: 16, ve: 3.0, F: 10, land: 4, cost: 9000, up: 40, rec: [1, 1, 1], d: 'Crew capsule' },
    { k: 'mule', n: 'Mule', e: 1, f: 0, cfg: 'KKK', dry: 6, fuel: 34, ve: 3.0, F: 18, land: 4, cost: 16000, up: 60, rec: [2, 1, 1], d: 'Cargo lifter' },
    { k: 'sparrow', n: 'Sparrow', e: 1, f: 0, cfg: 'KK', fx: 1, dry: 3, fuel: 22, ve: 3.0, F: 12, land: 4, cost: 11000, up: 45, rec: [1, 1, 1], d: 'Smallsat launcher, satellites +25%', bonus: [6, 1.25] },
    { k: 'ferry', n: 'Ferry', e: 1, f: 0, cfg: 'SSKK', dry: 5, fuel: 30, ve: 3.2, F: 8, land: 0, cost: 20000, up: 50, rec: [2, 1, 2], q: 'depot', d: 'Orbital tug, never lands' },
    { k: 'heron', n: 'Heron', e: 1, f: 0, cfg: 'SK', dry: 5, fuel: 20, ve: 3.1, F: 10, land: 2, cost: 18000, up: 55, rec: [2, 2, 1], q: 'lander', d: 'Lunar lander' },
    { k: 'gull', n: 'Gull', e: 1, f: 0, cfg: 'SSKK', dry: 8, fuel: 48, ve: 3.0, F: 30, land: 4, cost: 38000, up: 70, rec: [3, 2, 2], q: 'reuse', d: 'Reusable lifter' },
    { k: 'atlas', n: 'Atlas', e: 2, f: 0, cfg: 'SSKKKK', dry: 14, fuel: 110, ve: 3.1, F: 60, land: 4, cost: 110000, up: 160, rec: [4, 3, 2], q: 'heavy', d: 'Heavy lifter' },
    { k: 'climber', n: 'Climber', e: 2, f: 1, cfg: 'SSKKKKKK', fx: 1, dry: 10, fuel: 0, ve: 1, F: 1, land: 4, cost: 60000, up: 30, rec: [3, 1, 2], q: '@elev', climb: 1, d: 'Elevator car, Anchor Atoll to Highport' },
    { k: 'drake', n: 'Drake', e: 2, f: 1, cfg: 'SSSKKK', dry: 20, fuel: 50, ve: 9, F: 6, land: 0, cost: 140000, up: 180, rec: [3, 2, 2], q: 'ntr', d: 'Nuclear transfer ship' },
    { k: 'barge', n: 'Barge', e: 2, f: 1, cfg: 'KKKKKKKK', fx: 1, dry: 30, fuel: 80, ve: 9, F: 6, land: 0, cost: 180000, up: 200, rec: [4, 2, 2], q: 'bimodal', d: 'Nuclear cargo barge' },
    { k: 'kite', n: 'Kite', e: 2, f: 0, cfg: 'SSK', dry: 8, fuel: 40, ve: 3.2, F: 30, land: 3, cost: 90000, up: 120, rec: [2, 2, 2], q: 'aero', d: 'Mars lander' },
    { k: 'lantern', n: 'Lantern', e: 2, f: 0, cfg: 'CCC', fx: 1, dry: 6, fuel: 30, ve: 3.1, F: 25, land: 4, cost: 95000, up: 110, rec: [2, 2, 3], q: 'cabin', d: 'VIP shuttle, VIP fares +20%', vipB: 1.2 },
    { k: 'pod', n: 'Driver Pod', e: 2, f: 0, cfg: 'KKKK', fx: 1, dry: 3, fuel: 8, ve: 3.0, F: 6, land: 2, cost: 35000, up: 20, rec: [2, 1, 1], q: 'driver', d: 'Cheap lunar cargo pod' },
    { k: 'wasp', n: 'Wasp', e: 3, f: 2, cfg: 'SK', dry: 12, fuel: 10, ve: 400, F: 5.6, land: 1, cost: 420000, up: 400, rec: [2, 2, 2], q: 'torch', d: 'Torch courier' },
    { k: 'ox', n: 'Ox', e: 3, f: 2, cfg: 'SSKKKKKK', dry: 60, fuel: 50, ve: 400, F: 22, land: 0, cost: 900000, up: 900, rec: [5, 3, 3], q: 'bulk', d: 'Torch freighter' },
    { k: 'iceboat', n: 'Iceboat', e: 3, f: 2, cfg: 'KKKKKKKKKK', fx: 1, dry: 50, fuel: 40, ve: 400, F: 12, land: 2, cost: 700000, up: 600, rec: [4, 3, 2], q: 'icehaul', d: 'Ice hauler, ice +40%', bonus: [14, 1.4] },
    { k: 'pilgrim', n: 'Pilgrim', e: 3, f: 2, cfg: 'SSSSSSSSSS', dry: 70, fuel: 60, ve: 400, F: 30, land: 0, cost: 1200000, up: 1100, rec: [6, 3, 4], q: 'spinhab', d: 'Spin-hab liner, fares +15%', paxB: 1.15 },
    { k: 'prospector', n: 'Prospector', e: 3, f: 2, cfg: 'SKK', dry: 18, fuel: 14, ve: 400, F: 9, land: 2, cost: 520000, up: 450, rec: [3, 2, 2], q: 'hopper', d: 'Rock hopper, lands on moons' },
    { k: 'packet', n: 'Packet', e: 3, f: 2, cfg: 'SSKK', dry: 20, fuel: 22, ve: 400, F: 14, land: 1, cost: 800000, up: 750, rec: [3, 3, 3], q: 'hig', d: 'High-g fast packet' },
    { k: 'yacht', n: 'Yacht', e: 3, f: 2, cfg: 'CCCC', fx: 1, dry: 25, fuel: 20, ve: 400, F: 10, land: 3, cost: 950000, up: 800, rec: [3, 3, 4], q: 'lux', d: 'Luxury yacht, VIP fares +30%', vipB: 1.3 }
  ];
  const FAM = ['Chemical', 'Nuclear', 'Torch'];
  const PART = ['Hull', 'Drive', 'Systems'];
  const PART_PRICE = [1200, 12000, 120000], PART_K = [1, 1.4, 1.2];
  const SHIP_NAMES = ['Long Haul', 'Slow Burn', 'Margin Call', 'Night Ferry', 'Small Mercy', 'Thin Air', 'Bright Debt',
    'Half Measure', 'Old Faithful', 'Cold Coffee', 'Second Wind', 'Quiet Ledger', 'Red Ledger', 'Dust Devil', 'Iron Lung',
    'Fair Weather', 'Due Course', 'Patient Zero', 'Kind Regards', 'Last Orders', 'Open Question', 'Short Notice',
    'Steady Hand', 'Low Tide', 'High Water', 'Fine Print', 'Cheap Seats', 'Red Eye', 'Tall Order', 'Clean Slate'];
  const SVC = [
    { n: 'Fuel depot', cost: 10000, inc: 1200, d: 'Refuel here. Sells fuel to passing traffic.' },
    { n: 'Layover hab', cost: 15000, inc: 1600, d: 'Job board here. Travellers pay to stop over.' },
    { n: 'Repair dock', cost: 8000, inc: 700, d: 'Flights leaving here pay 40% less upkeep.' },
    { n: 'Trade post', cost: 12000, inc: 1000, d: '+2 market offers.' }
  ];

  // ---------------------------------------------------------------- SIM
  // Pure company state + wall clock. Everything here works on plain data so it saves as JSON and can be driven by a
  // fake clock in tests. Times are epoch ms.
  let emit = () => {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = n => Math.floor(Math.random() * n);
  const has = (c, k) => !!c.tech[k];
  const RS = n => TUNE.regionScale[N[n].r];
  const NB = 8; // fuel buckets in the route search
  const LAB_RP = [0, 15, 35, 70];

  function zeroStats() {
    return { del: 0, pax: 0, ton: 0, dv: 0, fuel: 0, earn: 0, vipOk: 0, vipLate: 0, longest: 0, built: 0, play: 0, flights: 0 };
  }
  function newCompany(now) {
    const c = {
      v: 1, born: now, t: now, seen: now, acc: now, cr: TUNE.startCr, xp: 0, lv: 1, rp: 20, era: 1, hq: NI.KOU,
      P: new Array(NN).fill(null), sh: [], parts: new Array(9).fill(0), tech: {}, res: [], craft: [],
      mk: { at: 0, of: [] }, pj: {}, done: {}, site: {}, st: zeroStats(), aw: null, nid: 1, burn: 0.5, ms: [now, 0, 0],
      tut: 0, nm: 0
    };
    c.P[NI.KOU] = mkPort(c, NI.KOU, now); c.P[NI.KOU].yard = 1;
    c.P[NI.LOW] = mkPort(c, NI.LOW, now);
    addShip(c, 0, NI.KOU);
    // first contract: two crew up to Lowport
    const b = c.P[NI.KOU].bd;
    for (let i = 0; i < 2; i++) { const j = mkJob(c, 0, NI.KOU, NI.LOW, now, K_NORM, 1, true); j.p = 300; j.x = now + 6 * HR; b.push(j); }
    refill(c, NI.KOU, now, true); refill(c, NI.LOW, now, true);
    refreshMarket(c, now);
    return c;
  }
  function mkPort(c, n, now) {
    return { b: 0, br: 0, dep: N[n].dep, isru: 0, yard: 0, lab: 0, tier: 0, dv: 0, dn: 0, bd: [], hd: [], rf: now, st: 0, sv: 0, cf: 0 };
  }

  // ---- map / graph
  const nodeOn = (c, n) => N[n].e <= c.era;
  const edgeOn = (c, e) => nodeOn(c, e.a) && nodeOn(c, e.b) && (e.k !== 2 || !!c.done.elev);
  const wf = (e, t) => e.ip ? 1 + TUNE.windowAmp * Math.sin(2 * Math.PI * t / TUNE.windowP[e.ip] + e.ph) : 1;
  let MX = null, MXK = -1;
  function metrics(c) {
    const key = c.era * 2 + (c.done.elev ? 1 : 0);
    if (MX && MXK === key) return MX;
    const fare = new Float64Array(NN * NN).fill(Infinity), hop = new Float64Array(NN * NN).fill(Infinity), ref = new Float64Array(NN * NN).fill(Infinity);
    for (let i = 0; i < NN; i++) fare[i * NN + i] = hop[i * NN + i] = ref[i * NN + i] = 0;
    for (const e of E) {
      if (!edgeOn(c, e)) continue;
      const reg = Math.max(N[e.a].r, N[e.b].r), k = TUNE.fareRegion[reg];
      const f = e.k === 2 ? 300 : (TUNE.wellFare * Math.max(e.wu, e.wd) + TUNE.spaceFare * Math.sqrt(e.d)) * k;
      let sp = 0;
      if (e.d) sp = c.era >= 3 ? Math.min(e.d / 2.4, 3.2 * Math.sqrt(e.d / 0.25)) : e.d / (reg >= 1 && c.era >= 2 ? 4.5 : 2.4);
      const r = (e.wt + sp) * SEC;
      for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) {
        fare[a * NN + b] = Math.min(fare[a * NN + b], f); hop[a * NN + b] = 1; ref[a * NN + b] = Math.min(ref[a * NN + b], r);
      }
    }
    for (let k = 0; k < NN; k++) for (let i = 0; i < NN; i++) {
      const ik = i * NN + k;
      if (hop[ik] === Infinity) continue;
      for (let j = 0; j < NN; j++) {
        const ij = i * NN + j, kj = k * NN + j;
        if (fare[ik] + fare[kj] < fare[ij]) fare[ij] = fare[ik] + fare[kj];
        if (hop[ik] + hop[kj] < hop[ij]) hop[ij] = hop[ik] + hop[kj];
        if (ref[ik] + ref[kj] < ref[ij]) ref[ij] = ref[ik] + ref[kj];
      }
    }
    MX = { fare, hop, ref }; MXK = key;
    return MX;
  }

  // ---- ports
  const berths = (c, n) => c.P[n] ? N[n].b + c.P[n].b : 0;
  const maxBerthUp = c => 3 + (has(c, 'atc') ? 2 : 0);
  function boardCap(c, n) {
    const p = c.P[n];
    if (!p || (p.st && !(p.sv & 2))) return 0;
    return TUNE.boardBase + p.br * 2 + p.tier * 2 + (has(c, 'broker') ? 2 : 0);
  }
  const depotAt = (c, n) => !!(c.P[n] && c.P[n].dep);
  function fuelPrice(c, n, fam) {
    const p = c.P[n];
    return N[n].fp * (p && p.isru ? (has(c, 'icemine') ? 0.28 : 0.4) : 1) * TUNE.famFuel[fam];
  }
  const dockedAt = (c, n) => { let k = 0; for (const s of c.sh) if (s.st === 0 && s.at === n) k++; return k; };
  function dockOrHold(c, s, n) { s.at = n; s.st = c.P[n] && dockedAt(c, n) < berths(c, n) ? 0 : 2; }
  function promote(c, n) {
    if (!c.P[n]) return;
    let free = berths(c, n) - dockedAt(c, n);
    for (const s of c.sh) if (free > 0 && s.st === 2 && s.at === n && !s.f) { s.st = 0; free--; }
  }
  function license(c, n, now) {
    if (c.P[n] || !nodeOn(c, n) || N[n].t === 'site' || c.cr < N[n].c) return false;
    c.cr -= N[n].c;
    c.P[n] = mkPort(c, n, now);
    refill(c, n, now, true);
    promote(c, n);
    MX = null;
    emit('buy', `${N[n].n} licensed`);
    return true;
  }

  // ---- jobs
  function rollVip(c, o) {
    const p = c.P[o];
    const pv = TUNE.vip.base + p.br * TUNE.vip.broker + p.tier * TUNE.vip.tier + (has(c, 'broker') ? TUNE.vip.guild : 0);
    return Math.random() < pv ? [2, 2, 2, 3, 3, 4, 5][rint(7)] : 0;
  }
  function mkJob(c, ty, o, d, t, kind, payK = 1, noVip = false) {
    const mx = metrics(c), jt = JT[ty], f = mx.fare[o * NN + d];
    const to = c.P[d], from = c.P[o];
    let pay = jt.r * f * payK * rnd(0.85, 1.2) * (1 + 0.15 * (to ? to.tier : 0) + 0.08 * (from ? from.tier : 0));
    if (jt.p && has(c, 'crew2')) pay *= 1.1;
    let v = 0, dl = 0;
    if (kind === K_NORM && !noVip && from) {
      v = rollVip(c, o);
      if (v) dl = mx.ref[o * NN + d] * rnd(1.3, 2.2) + 30 * SEC;
    }
    const m = jt.p ? 0.1 : Math.round(jt.m * (has(c, 'fair') ? 0.85 : 1) * 100) / 100;
    const exp = kind === K_NORM || kind === K_RES ? t + rnd(TUNE.expireMin[0], TUNE.expireMin[1]) * MIN : 0;
    return { i: c.nid++, t: ty, o, d, p: Math.max(10, Math.round(pay * (v || 1))), x: Math.round(exp), v, dl: Math.round(dl), da: 0, k: kind, m, g: 0, cb: 0 };
  }
  function pickWeighted(arr, wfn) {
    let tot = 0;
    for (const a of arr) tot += wfn(a);
    let r = Math.random() * tot;
    for (const a of arr) { r -= wfn(a); if (r <= 0) return a; }
    return arr[arr.length - 1];
  }
  function genJob(c, o, t) {
    const mx = metrics(c);
    const dests = [];
    for (let n = 0; n < NN; n++) if (n !== o && c.P[n] && mx.hop[o * NN + n] < 99) dests.push(n);
    if (!dests.length) return null;
    const labs = dests.filter(n => c.P[n].lab);
    if (labs.length && Math.random() < 0.1) return mkJob(c, J_RES, o, labs[rint(labs.length)], t, K_RES);
    const types = [];
    for (let i = 0; i < JT.length; i++) { const j = JT[i]; if (!j.sp && j.e <= c.era && (!j.fr || (N[o].tg & j.fr))) types.push(i); }
    for (let tries = 0; tries < 6; tries++) {
      const ty = pickWeighted(types, i => JT[i].w), to = JT[ty].to;
      const cand = to ? dests.filter(n => N[n].tg & to) : dests;
      if (!cand.length) continue;
      const d = pickWeighted(cand, n => (1 + 0.5 * c.P[n].tier) * (N[n].tg & T_HUB ? 1.5 : 1) / (1 + 0.6 * mx.hop[o * NN + n]));
      return mkJob(c, ty, o, d, t, K_NORM);
    }
    return null;
  }
  function refill(c, n, t, full) {
    const p = c.P[n];
    p.rf = t + TUNE.refillMs;
    const cap = boardCap(c, n);
    let k = 0;
    for (let i = p.bd.length - 1; i >= 0; i--) {
      const j = p.bd[i];
      if (j.x && j.x < t) p.bd.splice(i, 1); else if (j.k === K_NORM || j.k === K_RES) k++;
    }
    for (let add = 0; k < cap && (full || add < TUNE.refillAdd); add++, k++) {
      const j = genJob(c, n, t);
      if (!j) break;
      p.bd.push(j);
    }
  }
  // spread special jobs (developments, projects, station kits) over a few source ports
  function spawnSpecial(c, target, srcs, need, ty, kind, g, t) {
    if (!srcs.length) return false;
    for (let i = 0; i < need; i++) {
      const o = srcs[i % srcs.length], j = mkJob(c, ty, o, target, t, kind);
      j.g = g;
      c.P[o].bd.push(j);
    }
    return true;
  }
  function nearestPorts(c, n, max, filt) {
    const mx = metrics(c), out = [];
    for (let i = 0; i < NN; i++) if (i !== n && c.P[i] && !c.P[i].st && mx.hop[i * NN + n] < 99 && (!filt || filt(i))) out.push(i);
    out.sort((a, b) => mx.hop[a * NN + n] - mx.hop[b * NN + n] || ((N[b].tg & T_HUB) - (N[a].tg & T_HUB)));
    return out.slice(0, max);
  }

  // ---- ships
  function shipName(c) {
    const base = SHIP_NAMES[c.nm % SHIP_NAMES.length], lap = Math.floor(c.nm / SHIP_NAMES.length);
    c.nm++;
    return lap ? `${base} ${['II', 'III', 'IV', 'V', 'VI'][Math.min(4, lap - 1)]}` : base;
  }
  // ship upgrades: u = [tanks, engines, hull extension, comfort]; lv livery; sp credits spent on upgrades
  const SHIP_UP = [
    { n: 'Tanks', max: 3, k: 0.15, part: 0, d: '+15% propellant per level' },
    { n: 'Engines', max: 3, k: 0.15, part: 1, d: '+10% thrust per level: faster hard burns' },
    { n: 'Hull extension', max: 2, k: 0.25, part: 0, d: 'Adds a cargo module (refit it to seats or cabins)' },
    { n: 'Comfort fit-out', max: 3, k: 0.1, part: 2, d: '+8% passenger fares per level' }
  ];
  const LIVERY = ['#ffb547', '#5ce1e6', '#ff5d8f', '#7ee0a1', '#c9b8ff', '#d9643a'];
  const shipDry = s => { const D = DS[s.d]; return D.dry * (1 + 0.04 * s.u[0]) + s.u[2] * 0.6 * D.dry / D.cfg.length; };
  const shipFuel = s => DS[s.d].fuel * (1 + 0.15 * s.u[0]);
  const shipF = s => DS[s.d].F * (1 + 0.1 * s.u[1]);
  function addShip(c, d, at) {
    const s = { i: c.nid++, d, nm: shipName(c), cf: DS[d].cfg, st: 0, at, fu: DS[d].fuel, ld: [], f: null, rt: null, wt: 0, u: [0, 0, 0, 0], lv: 0, sp: 0 };
    s.lv = s.i % LIVERY.length;
    c.sh.push(s);
    dockOrHold(c, s, at);
    return s;
  }
  const shipCount = c => c.sh.length + c.craft.length;
  const shipCap = c => TUNE.shipCap(c.lv);
  function slotsOf(s) { let S = 0, C = 0, K = 0; for (const ch of s.cf) { if (ch === 'S') S++; else if (ch === 'C') C++; else K++; } return { S, C, K }; }
  function loadCount(s) { let pax = 0, crg = 0; for (const j of s.ld) { if (JT[j.t].p) pax++; else crg++; } return { pax, crg }; }
  function canCarry(s, j) {
    const sl = slotsOf(s), lc = loadCount(s);
    return JT[j.t].p ? lc.pax < sl.S + sl.C : lc.crg < sl.K;
  }
  function assignCabins(s) {
    const C = slotsOf(s).C;
    const pax = s.ld.filter(j => JT[j.t].p).sort((a, b) => (b.v - a.v) || (b.p - a.p));
    pax.forEach((j, i) => { j.cb = i < C ? 1 : 0; });
  }
  function loadJob(c, s, j) {
    const p = c.P[s.at];
    if (!p || s.st !== 0 || s.f || !canCarry(s, j)) return false;
    let i = p.bd.indexOf(j);
    if (i >= 0) p.bd.splice(i, 1);
    else { i = p.hd.indexOf(j); if (i < 0) return false; p.hd.splice(i, 1); j.h = 1; }
    s.ld.push(j); assignCabins(s);
    return true;
  }
  function unloadJob(c, s, j) {
    const p = c.P[s.at], i = s.ld.indexOf(j);
    if (!p || i < 0 || s.f) return false;
    s.ld.splice(i, 1); j.cb = 0;
    if (j.o === s.at && !j.h) p.bd.push(j); else p.hd.push(j);
    assignCabins(s);
    return true;
  }
  const loadMass = ld => { let m = 0; for (const j of ld) m += j.m; return m; };
  function veOf(c, D) {
    let v = D.ve;
    if (D.f === 0 && has(c, 'meth')) v *= 1.08;
    if (D.f === 1 && has(c, 'bimodal')) v *= 1.15;
    if (D.f === 2 && has(c, 'isp')) v *= 1.2;
    return v;
  }
  function dvCap(c, s) {
    const D = DS[s.d], dry = shipDry(s) + loadMass(s.ld), f = depotAt(c, s.at) && !s.f ? shipFuel(s) : s.fu;
    return f > 0 ? veOf(c, D) * Math.log((dry + f) / dry) : 0;
  }
  // one edge for this ship: distance (window-scaled), fixed Δv and fixed seconds, or null if the ship can't use it
  function legInfo(c, D, e, from, t) {
    const to = e.a === from ? e.b : e.a;
    if (e.k === 2) return D.climb ? { d: 0, fx: 0, ft: e.wt, to } : null;
    if (D.climb) return null;
    if (Math.max(N[e.a].w, N[e.b].w) > D.land) return null;
    let fx = 0;
    if (e.k === 1 || e.k === 3) {
      const up = from === e.a;
      fx = up ? e.wu : e.wd;
      if (up && (N[e.a].tg & T_LU) && has(c, 'driver')) fx = 0;
    }
    return { d: e.d * wf(e, t), fx, ft: e.wt, to };
  }
  // Dijkstra over (node, fuel bucket), feasible at the slowest burn, cost = time at the chosen burn
  function search(c, s, t, burn) {
    const D = DS[s.d], ve = veOf(c, D), dry = shipDry(s) + loadMass(s.ld), cap = shipFuel(s), F = shipF(s), S = NN * (NB + 1);
    const dist = new Float64Array(S).fill(Infinity), fuel = new Float64Array(S), prev = new Int32Array(S).fill(-1), pe = new Int32Array(S).fill(-1);
    const done = new Uint8Array(S);
    const b0 = cap > 0 ? Math.min(NB, Math.floor(s.fu / cap * NB)) : 0, st0 = s.at * (NB + 1) + b0;
    dist[st0] = 0; fuel[st0] = s.fu;
    const K = Math.pow(TUNE.vflDiv, burn);
    for (;;) {
      let cur = -1, best = Infinity;
      for (let i = 0; i < S; i++) if (!done[i] && dist[i] < best) { best = dist[i]; cur = i; }
      if (cur < 0) break;
      done[cur] = 1;
      const u = (cur / (NB + 1)) | 0, fd = depotAt(c, u) && cap > 0 ? cap : fuel[cur];
      for (const ei of ADJ[u]) {
        const e = E[ei];
        if (!edgeOn(c, e)) continue;
        const li = legInfo(c, D, e, u, t);
        if (!li) continue;
        const m0 = dry + fd;
        let need = li.fx, tt = li.ft;
        if (li.d > 0) {
          const a = F / m0, vfl = Math.sqrt(a * li.d) / TUNE.vflDiv, v = vfl * K;
          need += 2 * vfl; tt += li.d / v + v / a;
        }
        let fa = fd;
        if (need > 0) {
          if (fd <= 0 || ve * Math.log(m0 / dry) < need - 1e-9) continue;
          fa = Math.max(0, fd - m0 * (1 - Math.exp(-need / ve)));
        }
        const b = cap > 0 ? Math.min(NB, Math.floor(fa / cap * NB)) : 0, si = li.to * (NB + 1) + b;
        if (done[si]) continue;
        const nd = dist[cur] + tt * SEC + (cur === st0 ? 0 : TUNE.stopMs);
        if (nd < dist[si]) { dist[si] = nd; fuel[si] = fa; prev[si] = cur; pe[si] = ei; }
      }
    }
    return { dist, fuel, prev, pe };
  }
  function reachable(sr, to) {
    for (let b = 0; b <= NB; b++) if (sr.dist[to * (NB + 1) + b] < Infinity) return true;
    return false;
  }
  // full flight plan to `to` at burn 0..1: route, legs with times, fuel cost, revenue estimate
  function planRoute(c, s, to, burn, t, sr) {
    if (s.f || to === s.at) return null;
    sr = sr || search(c, s, t, burn);
    let bi = -1, bd = Infinity;
    for (let b = 0; b <= NB; b++) { const i = to * (NB + 1) + b; if (sr.dist[i] < bd) { bd = sr.dist[i]; bi = i; } }
    if (bi < 0) return null;
    const legs = [];
    for (let cur = bi; sr.prev[cur] >= 0; cur = sr.prev[cur]) legs.push({ e: sr.pe[cur], to: (cur / (NB + 1)) | 0, from: 0 });
    legs.reverse();
    let from = s.at;
    for (const L of legs) { L.from = from; from = L.to; }
    const D = DS[s.d], ve = veOf(c, D), dry = shipDry(s) + loadMass(s.ld), cap = shipFuel(s), F = shipF(s);
    const paxCapped = D.f === 2 && !has(c, 'hig') && s.ld.some(j => JT[j.t].p);
    const want = Math.min(burn, paxCapped ? 0.75 : 1);
    let fuel = s.fu, fuelCr = 0, clock = 0, dvSum = 0, sMin = want, limited = false, space = 0;
    const out = [], arrAt = {};
    for (let i = 0; i < legs.length;) {
      const u = legs[i].from, price = fuelPrice(c, u, D.f);
      if (depotAt(c, u) && cap > 0) fuel = cap;
      const segFuel = fuel;
      let j = i + 1;
      while (j < legs.length && !depotAt(c, legs[j].from)) j++;
      const m0 = dry + fuel, a = F / m0, B = fuel > 0 ? ve * Math.log(m0 / dry) : 0;
      const info = [];
      let W = 0, sv = 0;
      for (let k = i; k < j; k++) {
        const li = legInfo(c, D, E[legs[k].e], legs[k].from, t);
        info.push(li); W += li.fx;
        if (li.d) sv += Math.sqrt(a * li.d) / TUNE.vflDiv;
      }
      let se = want;
      if (sv > 0) {
        const room = (B - W) / (2 * sv);
        if (room < 0.98) return null;
        se = Math.max(0, Math.min(se, Math.log(Math.max(room, 1)) / Math.log(TUNE.vflDiv)));
      } else if (W > B + 1e-6) return null;
      if (se < want - 0.01) limited = true;
      sMin = Math.min(sMin, se);
      for (let k = i; k < j; k++) {
        const li = info[k - i];
        let dt = li.ft, dv = li.fx, tb = 0;
        if (li.d) {
          space++;
          const v = Math.sqrt(a * li.d) / TUNE.vflDiv * Math.pow(TUNE.vflDiv, se);
          dv += 2 * v; tb = v / a; dt += li.d / v + v / a;
        }
        if (dv > 0) fuel = Math.max(0, fuel - (dry + fuel) * (1 - Math.exp(-dv / ve)));
        if (k > 0) clock += TUNE.stopMs / SEC;
        const t0 = clock;
        clock += dt;
        out.push(legs[k].from, li.to, Math.round(t0 * SEC), Math.round(clock * SEC), Math.round(tb * SEC));
        if (arrAt[li.to] === undefined) arrAt[li.to] = clock * SEC;
        dvSum += dv;
      }
      fuelCr += (segFuel - fuel) * price; // pay for what this segment burns, at the price where it filled up
      i = j;
    }
    let rev = 0;
    for (const jb of s.ld) if (arrAt[jb.d] !== undefined) rev += payOf(c, s, jb, t + arrAt[jb.d], t);
    const p0 = c.P[s.at];
    const up = Math.round(D.up * (p0 && (p0.sv & 4) ? 0.6 : 1));
    fuelCr = Math.round(fuelCr);
    return { to, legs: out, dur: Math.round(clock * SEC), fuelCr, up, rev: Math.round(rev), profit: Math.round(rev - fuelCr - up),
      sEff: sMin, want, limited, paxCapped, space, fuelEnd: fuel, dv: dvSum, route: [s.at].concat(legs.map(l => l.to)), arrAt };
  }
  function payOf(c, s, j, at, t0) {
    const D = DS[s.d];
    let p = j.p;
    if (D.bonus && D.bonus[0] === j.t) p *= D.bonus[1];
    if (j.cb) p *= 1.25;
    if (j.v && D.vipB) p *= D.vipB;
    if (JT[j.t].p && D.paxB) p *= D.paxB;
    if (JT[j.t].p && s.u) p *= 1 + 0.08 * s.u[3];
    if (j.v) {
      const due = j.da || ((t0 || at) + j.dl);
      if (at > due) p *= has(c, 'insure') ? TUNE.lateVipInsured : TUNE.lateVip;
    }
    return p;
  }
  function launch(c, s, pl, t) {
    const cost = pl.fuelCr + pl.up;
    if (s.f || c.cr - cost < -overdraft(c)) return false;
    c.cr -= cost;
    c.st.fuel += pl.fuelCr; c.st.dv += pl.dv; c.st.flights++;
    c.st.longest = Math.max(c.st.longest, pl.dur);
    for (const j of s.ld) if (j.v && !j.da) j.da = t + j.dl;
    const L = pl.legs.slice();
    for (let i = 0; i < L.length; i += 5) { L[i + 2] += t; L[i + 3] += t; }
    const from = s.at, was = s.st;
    s.f = { L, i: 0, t0: t, arr: t + pl.dur, to: pl.to };
    s.st = 1; s.fu = pl.fuelEnd; s.wt = 0;
    if (was === 0) promote(c, from);
    emit('launch', s);
    return true;
  }
  // flights may dip into a small overdraft so a broke company is never stranded; purchases need real credits
  const overdraft = c => 5000 * [1, 1, 10, 70][c.era];
  const canAfford = (c, pl) => c.cr - pl.fuelCr - pl.up >= -overdraft(c);
  function tow(c, s, t) {
    if (s.f || s.at === c.hq) return false;
    const from = s.at, was = s.st;
    s.f = { L: [from, c.hq, t, t + 10 * MIN, 0], i: 0, t0: t, arr: t + 10 * MIN, to: c.hq, tow: 1 };
    s.st = 1; s.rt = null;
    if (was === 0) promote(c, from);
    return true;
  }
  function awayLog(c, t) {
    if (t <= c.seen + 2 * MIN) return null;
    return c.aw || (c.aw = { cr: 0, n: 0, arr: 0, parts: 0, res: [], lv: 0, ps: 0, rp: 0 });
  }
  function legEnd(c, s, t) {
    const f = s.f, n = f.L[f.i * 5 + 1];
    for (let k = s.ld.length - 1; k >= 0; k--) { const j = s.ld[k]; if (j.d === n) { s.ld.splice(k, 1); complete(c, s, j, n, t); } }
    f.i++;
    if (f.i * 5 < f.L.length) return;
    s.f = null; s.fu = f.tow ? shipFuel(s) : s.fu;
    const p = c.P[n];
    if (p) for (let k = s.ld.length - 1; k >= 0; k--) { const j = s.ld[k]; j.h = 1; j.cb = 0; p.hd.push(j); s.ld.splice(k, 1); }
    dockOrHold(c, s, n);
    const aw = awayLog(c, t);
    if (aw) aw.arr++;
    if (s.rt && !s.rt.ps) s.wt = t;
    emit('arrive', s);
  }
  function complete(c, s, j, n, t) {
    const pay = Math.round(payOf(c, s, j, t));
    c.cr += pay; c.st.earn += pay; c.st.del++;
    if (JT[j.t].p) c.st.pax++; else c.st.ton += j.m;
    if (j.v) { if (t <= j.da) c.st.vipOk++; else c.st.vipLate++; }
    const aw = awayLog(c, t);
    if (aw) { aw.cr += pay; aw.n++; }
    const p = c.P[n];
    if (j.k === K_DEV && p) {
      p.dv++;
      if (p.dn && p.dv >= p.dn) { emit('good', `${N[n].n}: ${DEV[p.tier].n} complete`); p.tier++; p.dv = 0; p.dn = 0; }
    } else if (j.k === K_PROJ) {
      const key = j.g ? 'yards' : 'elev', pj = c.pj[key];
      if (pj && !c.done[key]) {
        pj.got++;
        if (pj.got >= pj.need) { c.done[key] = 1; MX = null; emit('good', `${PROJ[key].n} complete!`); checkEra(c, t); }
      }
    } else if (j.k === K_KIT) {
      const site = c.site[n];
      if (site) { site.got++; if (site.got >= site.need) buildStation(c, n, t); }
    } else if (j.k === K_RES) {
      const r = 3 + 2 * c.era + (p ? p.lab : 0);
      c.rp += r;
      if (aw) aw.rp += r;
    }
    const chance = j.k !== K_NORM && j.k !== K_RES ? TUNE.partDrop.dev : j.v ? TUNE.partDrop.vip : TUNE.partDrop.normal;
    if (Math.random() < chance) {
      const fam = Math.max(0, c.era - 1 - (Math.random() < 0.3 ? 1 : 0)), pi = fam * 3 + rint(3);
      c.parts[pi]++;
      if (aw) aw.parts++;
      emit('part', `Found part: ${FAM[fam]} ${PART[pi % 3]}`);
    }
    addXp(c, Math.round(4 + Math.sqrt(pay) / 2), t);
  }
  function addXp(c, x, t) {
    c.xp += x;
    while (c.xp >= TUNE.xpNeed(c.lv + 1)) {
      c.lv++; c.rp += 2 * c.lv;
      const aw = awayLog(c, t);
      if (aw) aw.lv++;
      emit('level', `Level ${c.lv}! Ship cap ${shipCap(c)}`);
    }
    checkEra(c, t);
  }
  function gateState(c) {
    const g = TUNE.gate[c.era + 1];
    if (!g) return null;
    return { g, lv: c.lv >= g.lv, tech: has(c, g.tech), proj: !!c.done[g.proj] };
  }
  function checkEra(c, t) {
    const gs = gateState(c);
    if (!gs || !gs.lv || !gs.tech || !gs.proj) return;
    c.era++; c.ms[c.era - 1] = t; MX = null;
    emit('era', c.era);
  }
  function buildStation(c, n, t) {
    delete c.site[n];
    const p = mkPort(c, n, t);
    p.st = 1; p.dep = 0; p.rf = Infinity;
    c.P[n] = p;
    c.st.built++;
    promote(c, n);
    MX = null;
    emit('good', `${N[n].n} station complete`);
  }

  // ---- passive income: labs and station services (capped while away)
  function accrue(c, t) {
    const dt = Math.min(t - c.acc, TUNE.passiveCapH * HR);
    c.acc = Math.max(c.acc, t);
    if (dt <= 0) return;
    const h = dt / HR, fus = has(c, 'fusion') ? 1.25 : 1;
    for (let n = 0; n < NN; n++) {
      const p = c.P[n];
      if (!p) continue;
      if (p.lab) c.rp += LAB_RP[p.lab] * fus * h;
      if (p.st && p.sv) {
        const inc = stationIncome(n, p);
        p.cf = Math.min(p.cf + inc * h, inc * TUNE.passiveCapH);
      }
    }
  }
  function stationIncome(n, p) {
    let inc = 0;
    for (let i = 0; i < SVC.length; i++) if (p.sv & (1 << i)) inc += SVC[i].inc;
    return inc * RS(n);
  }

  // ---- research, crafting, market
  function techState(c, k) {
    const T = TECH[TI[k]];
    if (c.tech[k]) return 'done';
    if (c.res.some(r => r.k === k)) return 'busy';
    if (T.e > c.era) return 'era';
    if (T.q && T.q.some(q => !c.tech[q])) return 'prereq';
    return 'ok';
  }
  const resSlots = c => has(c, 'consort') ? 2 : 1;
  function research(c, k, t) {
    const T = TECH[TI[k]];
    if (techState(c, k) !== 'ok' || c.res.length >= resSlots(c) || c.rp < T.rp || c.cr < T.cr) return false;
    c.rp -= T.rp; c.cr -= T.cr;
    c.res.push({ k, at: t + T.m * MIN, s: t });
    return true;
  }
  const grantCost = c => Math.round(3000 * [1, 1, 8, 60][c.era]);
  function blueprintOk(c, d) {
    const q = DS[d].q;
    return !q || (q[0] === '@' ? !!c.done[q.slice(1)] : has(c, q));
  }
  function canAssemble(c, d) {
    const D = DS[d];
    if (!blueprintOk(c, d) || D.e > c.era) return false;
    for (let k = 0; k < 3; k++) if (c.parts[D.f * 3 + k] < D.rec[k]) return false;
    return c.cr >= Math.round(D.cost * TUNE.assembleFee) && shipCount(c) < shipCap(c);
  }
  function assemble(c, d, t) {
    if (!canAssemble(c, d)) return false;
    const D = DS[d];
    for (let k = 0; k < 3; k++) c.parts[D.f * 3 + k] -= D.rec[k];
    c.cr -= Math.round(D.cost * TUNE.assembleFee);
    c.craft.push({ d, at: t + TUNE.assembleMin[D.e] * MIN });
    return true;
  }
  function buyShip(c, d) {
    const D = DS[d];
    if (!blueprintOk(c, d) || D.e > c.era || c.cr < D.cost || shipCount(c) >= shipCap(c)) return false;
    c.cr -= D.cost;
    return addShip(c, d, c.hq);
  }
  function sellShip(c, s) {
    if (s.f || s.ld.length || c.sh.length <= 1) return false;
    const D = DS[s.d];
    c.cr += Math.round(D.cost * TUNE.sellBack + (s.sp || 0) * 0.5);
    if (has(c, 'salvage')) for (let k = 0; k < 3; k++) c.parts[D.f * 3 + k] += Math.ceil(D.rec[k] / 2);
    const at = s.at;
    c.sh.splice(c.sh.indexOf(s), 1);
    promote(c, at);
    return true;
  }
  const partPrice = pi => PART_PRICE[(pi / 3) | 0] * PART_K[pi % 3];
  function refreshMarket(c, t) {
    let n = 5;
    for (let i = 0; i < NN; i++) if (c.P[i] && c.P[i].st && (c.P[i].sv & 8)) n += 2;
    const of = [];
    for (let i = 0; i < n; i++) {
      if (i === 0 && Math.random() < 0.35) {
        const ds = DS.map((D, k) => k).filter(k => DS[k].e <= c.era && !DS[k].climb);
        const d = ds[rint(ds.length)];
        of.push({ s: 1, d, pr: Math.round(DS[d].cost * rnd(0.55, 0.75)) });
      } else {
        const fam = Math.max(0, c.era - 1 - (Math.random() < 0.35 ? 1 : 0)), pi = fam * 3 + rint(3);
        of.push({ s: 0, p: pi, n: 1 + rint(3), pr: Math.round(partPrice(pi) * rnd(0.75, 1.1)) });
      }
    }
    c.mk = { at: t + TUNE.marketMs, of };
  }
  function buyOffer(c, i) {
    const o = c.mk.of[i];
    if (!o) return false;
    const cost = o.s ? o.pr : o.pr * o.n;
    if (c.cr < cost || (o.s && shipCount(c) >= shipCap(c))) return false;
    c.cr -= cost;
    if (o.s) addShip(c, o.d, c.hq); else c.parts[o.p] += o.n;
    c.mk.of.splice(i, 1);
    return true;
  }
  function sellPart(c, pi) {
    if (!c.parts[pi]) return false;
    c.parts[pi]--; c.cr += Math.round(partPrice(pi) * 0.5);
    return true;
  }

  // ---- upgrades, developments, projects, stations
  const UPG = [
    { k: 'b', n: 'Berths', max: c => maxBerthUp(c), cost: (c, n, l) => 3000 * Math.pow(1.8, l), d: '+1 ship docked at once' },
    { k: 'br', n: 'Brokerage', max: () => 3, cost: (c, n, l) => 4000 * Math.pow(2, l), d: '+2 jobs on the board, more VIPs', ok: (c, n) => !c.P[n].st },
    { k: 'dep', n: 'Fuel depot', max: () => 1, cost: () => 6000, d: 'Ships refuel here', ok: (c, n) => !c.P[n].st && has(c, 'depot'), why: 'Research Orbital Depots' },
    { k: 'isru', n: 'ISRU plant', max: () => 1, cost: () => 15000, d: 'Local propellant: fuel 60% cheaper', ok: (c, n) => !!(N[n].tg & T_ICE) && has(c, 'isru') && c.P[n].dep, why: 'Icy ports with a depot, after Lunar ISRU' },
    { k: 'yard', n: 'Shipyard', max: () => 1, cost: () => 20000, d: 'Refit slots here; can become HQ' },
    { k: 'lab', n: 'Lab', max: () => 3, cost: (c, n, l) => 5000 * Math.pow(2.2, l), d: 'Earns RP; research payloads come here' }
  ];
  function upgCost(c, n, u) { const U = UPG[u]; return Math.round(U.cost(c, n, c.P[n][U.k]) * RS(n)); }
  function upgrade(c, n, u, t) {
    const p = c.P[n], U = UPG[u];
    if (!p || p[U.k] >= U.max(c) || (U.ok && !U.ok(c, n))) return false;
    const cost = upgCost(c, n, u);
    if (c.cr < cost) return false;
    accrue(c, t);
    c.cr -= cost; p[U.k]++;
    if (U.k === 'b') promote(c, n);
    if (U.k === 'br') refill(c, n, t, true);
    return true;
  }
  const devCost = (c, n) => Math.round(DEV[c.P[n].tier].cost * RS(n));
  function commissionDev(c, n, t) {
    const p = c.P[n];
    if (!p || p.st || p.tier >= DEV.length || p.dn || c.cr < devCost(c, n)) return false;
    const D = DEV[p.tier], srcs = nearestPorts(c, n, 3);
    if (!srcs.length) return false;
    c.cr -= devCost(c, n);
    p.dn = D.need; p.dv = 0;
    spawnSpecial(c, n, srcs, D.need, J_DEV + p.tier, K_DEV, 0, t);
    return true;
  }
  function projState(c, key) {
    const P = PROJ[key];
    if (c.done[key]) return 'done';
    if (c.pj[key]) return 'busy';
    if (c.era < P.era) return 'era';
    if (!has(c, P.tech)) return 'tech';
    return 'ok';
  }
  function commissionProj(c, key, t) {
    const P = PROJ[key];
    if (projState(c, key) !== 'ok' || c.cr < P.cost) return false;
    const srcs = nearestPorts(c, P.site, 4, n => (!P.from || (N[n].tg & P.from)) && N[n].r <= 1);
    if (!srcs.length) return false;
    c.cr -= P.cost;
    c.pj[key] = { got: 0, need: P.need };
    spawnSpecial(c, P.site, srcs, P.need, P.job, K_PROJ, key === 'yards' ? 1 : 0, t);
    return true;
  }
  function siteState(c, n) {
    if (c.P[n]) return 'built';
    if (c.site[n]) return 'busy';
    if (!nodeOn(c, n)) return 'era';
    if (!has(c, N[n].need || 'kits')) return 'tech';
    return 'ok';
  }
  function foundSite(c, n, t) {
    if (siteState(c, n) !== 'ok' || c.cr < N[n].c) return false;
    const srcs = nearestPorts(c, n, 3);
    if (!srcs.length) return false;
    c.cr -= N[n].c;
    c.site[n] = { got: 0, need: N[n].kits };
    spawnSpecial(c, n, srcs, N[n].kits, J_KIT, K_KIT, 0, t);
    return true;
  }
  function buyService(c, n, i, t) {
    const p = c.P[n];
    if (!p || !p.st || (p.sv & (1 << i))) return false;
    const cost = Math.round(SVC[i].cost * RS(n));
    if (c.cr < cost) return false;
    accrue(c, t);
    c.cr -= cost; p.sv |= 1 << i;
    if (i === 0) p.dep = 1;
    if (i === 1) refill(c, n, t, true);
    return true;
  }
  function collect(c, n, t) {
    const p = c.P[n];
    accrue(c, t);
    if (!p || p.cf < 1) return 0;
    const v = Math.floor(p.cf);
    c.cr += v; c.st.earn += v; p.cf -= v;
    return v;
  }
  function refitCost(c, s, cfg) {
    let k = 0;
    for (let i = 0; i < cfg.length; i++) if (cfg[i] !== s.cf[i]) k++;
    return Math.round(k * 500 * RS(s.at) * (has(c, 'modular') ? 0.5 : 1));
  }
  const canRefitHere = (c, s) => !DS[s.d].fx && s.st === 0 && !s.f && c.P[s.at] && (c.P[s.at].yard || has(c, 'modular'));
  function refit(c, s, cfg) {
    if (!canRefitHere(c, s) || s.ld.length) return false;
    const cost = refitCost(c, s, cfg);
    if (c.cr < cost) return false;
    c.cr -= cost; s.cf = cfg;
    return true;
  }

  // ---- routines (looping ships; pause after the idle cap)
  const routineCap = c => TUNE.routineCapH[has(c, 'auto3') ? 3 : has(c, 'auto2') ? 2 : has(c, 'auto1') ? 1 : 0] * HR;
  function autoLoad(c, s, dest) {
    const p = c.P[s.at];
    if (!p || s.st !== 0) return;
    const cand = p.bd.concat(p.hd).filter(j => j.d === dest).sort((a, b) => b.p - a.p);
    for (const j of cand) if (canCarry(s, j)) loadAndCheck(c, s, j, dest);
  }
  // load a job, but put it back if the extra mass makes the destination unreachable
  function loadAndCheck(c, s, j, dest) {
    if (!loadJob(c, s, j)) return false;
    if (reachable(search(c, s, c.t, 0), dest)) return true;
    unloadJob(c, s, j);
    return false;
  }
  function routineStep(c, s, t) {
    s.wt = 0;
    const rt = s.rt;
    if (!rt || rt.ps || s.f) return;
    if (t - c.seen > routineCap(c)) {
      rt.ps = 1;
      const aw = awayLog(c, t);
      if (aw) aw.ps++;
      return;
    }
    const atEnd = s.at === rt.a || s.at === rt.b, other = s.at === rt.a ? rt.b : rt.a;
    if (atEnd) {
      autoLoad(c, s, other);
      if (!s.ld.length) { const p = c.P[s.at]; s.wt = p && p.rf < Infinity ? p.rf : t + 5 * MIN; return; }
    }
    const pl = planRoute(c, s, other, rt.s, t);
    if (!pl || !canAfford(c, pl)) { rt.ps = 2; emit('bad', `${s.nm}: routine stopped (${pl ? 'funds' : 'no route'})`); return; }
    launch(c, s, pl, t);
  }

  // ---- the clock: process every due event in time order, then accrue passive income
  function nextEvent(c) {
    let tm = Infinity, ty = 0, obj = null;
    for (let n = 0; n < NN; n++) { const p = c.P[n]; if (p && p.rf < tm) { tm = p.rf; ty = 1; obj = n; } }
    for (const s of c.sh) {
      if (s.f) { const e = s.f.L[s.f.i * 5 + 3]; if (e < tm) { tm = e; ty = 2; obj = s; } } else if (s.wt && s.wt < tm) { tm = s.wt; ty = 3; obj = s; }
    }
    for (const r of c.res) if (r.at < tm) { tm = r.at; ty = 4; obj = r; }
    for (const r of c.craft) if (r.at < tm) { tm = r.at; ty = 5; obj = r; }
    if (c.mk.at < tm) { tm = c.mk.at; ty = 6; obj = null; }
    return { tm, ty, obj };
  }
  function advance(c, now) {
    if (now < c.t) now = c.t; // clock went backwards (or a newer save from another device): freeze, never rewind
    for (let guard = 0; guard < 200000; guard++) {
      const ev = nextEvent(c);
      if (ev.tm > now) break;
      const t = ev.tm;
      if (ev.ty === 1) refill(c, ev.obj, t, false);
      else if (ev.ty === 2) legEnd(c, ev.obj, t);
      else if (ev.ty === 3) routineStep(c, ev.obj, t);
      else if (ev.ty === 4) {
        c.res.splice(c.res.indexOf(ev.obj), 1); c.tech[ev.obj.k] = 1;
        const aw = awayLog(c, t);
        if (aw) aw.res.push(ev.obj.k);
        emit('research', `${TECH[TI[ev.obj.k]].n} researched`);
        checkEra(c, t);
      } else if (ev.ty === 5) {
        c.craft.splice(c.craft.indexOf(ev.obj), 1);
        const s = addShip(c, ev.obj.d, c.hq);
        emit('good', `${s.nm} (${DS[s.d].n}) rolled out at ${N[c.hq].n}`);
      } else if (ev.ty === 6) refreshMarket(c, t);
    }
    c.t = now;
    accrue(c, now);
    c.nx = nextEvent(c).tm;
  }
  function resumeRoutines(c, now) {
    for (const s of c.sh) if (s.rt && s.rt.ps === 1) { s.rt.ps = 0; if (!s.f) s.wt = now; }
  }
  function netWorth(c) {
    let v = c.cr;
    for (const s of c.sh) v += DS[s.d].cost * TUNE.sellBack + (s.sp || 0) * 0.5;
    for (let n = 0; n < NN; n++) if (c.P[n]) v += N[n].c * 0.5;
    for (let i = 0; i < 9; i++) v += c.parts[i] * partPrice(i) * 0.5;
    return Math.round(v);
  }
  // ---- ship upgrades and livery (at a shipyard, or anywhere with Modular Hulls)
  const canUpgradeHere = (c, s) => s.st === 0 && !s.f && !!c.P[s.at] && !!(c.P[s.at].yard || has(c, 'modular'));
  function shipUpCost(c, s, k) {
    const U = SHIP_UP[k], D = DS[s.d], lvl = s.u[k];
    return { cr: Math.round(D.cost * U.k * (1 + lvl)), part: D.f * 3 + U.part, n: lvl >= 2 ? 2 : 1 };
  }
  function shipUpBlock(c, s, k) {
    const U = SHIP_UP[k], D = DS[s.d];
    if (s.u[k] >= U.max) return 'Maxed out';
    if (k === 2 && D.fx) return 'Fixed layout: cannot extend';
    if (k === 2 && D.climb) return 'Elevator cars cannot be extended';
    if (k === 3 && !/[SC]/.test(s.cf)) return 'No passenger slots';
    if (!canUpgradeHere(c, s)) return 'Dock at a shipyard (or research Modular Hulls)';
    if (k === 2 && s.ld.length) return 'Unload first';
    const q = shipUpCost(c, s, k);
    if (c.parts[q.part] < q.n) return `Needs ${q.n} ${FAM[D.f]} ${PART[q.part % 3]} part${q.n > 1 ? 's' : ''}`;
    if (c.cr < q.cr) return 'Not enough credits';
    return '';
  }
  function upgradeShip(c, s, k) {
    if (shipUpBlock(c, s, k)) return false;
    const q = shipUpCost(c, s, k);
    c.cr -= q.cr; c.parts[q.part] -= q.n; s.sp = (s.sp || 0) + q.cr;
    s.u[k]++;
    if (k === 0) s.fu = Math.min(shipFuel(s), s.fu + DS[s.d].fuel * 0.15);
    if (k === 2) s.cf += 'K';
    return true;
  }
  const liveryCost = s => Math.round(DS[s.d].cost * 0.02);
  function setLivery(c, s, i) {
    if (s.lv === i || !canUpgradeHere(c, s) || c.cr < liveryCost(s)) return false;
    c.cr -= liveryCost(s); s.lv = i;
    return true;
  }

  function load(saved, now) {
    if (!saved || saved.v !== 1 || !Array.isArray(saved.P) || saved.P.length !== NN) return null;
    const c = saved;
    if (!c.st) c.st = zeroStats();
    for (const s of c.sh) { if (!s.u) s.u = [0, 0, 0, 0]; if (s.lv === undefined) s.lv = s.i % LIVERY.length; if (!s.sp) s.sp = 0; }
    MX = null;
    return c;
  }

  const SIM = { LAB_RP, overdraft, canAfford, TUNE, N, NI, E, ADJ, JT, DS, TECH, TI, PROJ, DEV, SVC, UPG, FAM, PART, NB,
    newCompany, load, advance, resumeRoutines, license, refill, genJob, metrics, search, reachable, planRoute, payOf, launch, tow,
    loadJob, unloadJob, canCarry, slotsOf, loadCount, dvCap, veOf, loadMass, berths, dockedAt, boardCap, depotAt, fuelPrice,
    shipCap, shipCount, techState, research, resSlots, grantCost, blueprintOk, canAssemble, assemble, buyShip, sellShip,
    partPrice, buyOffer, sellPart, upgCost, upgrade, devCost, commissionDev, projState, commissionProj, siteState, foundSite,
    buyService, collect, loadAndCheck, stationIncome, refitCost, canRefitHere, refit, routineCap, routineStep, autoLoad, gateState, netWorth,
    nodeOn, edgeOn, has, addShip, wf, SHIP_UP, LIVERY, shipDry, shipFuel, shipF, canUpgradeHere, shipUpCost, shipUpBlock, upgradeShip, liveryCost, setLivery, setEmit: f => { emit = f; } };

  // ---------------------------------------------------------------- ART (shared by thumb, art and the game)
  // All art is drawn in code at startup: there are no image files. Planets are dithered pixel by pixel. Ships are
  // assembled from modules (engine, tank, one module per slot, bow), so every design, refit, upgrade and livery gets
  // its own sprite, in three sizes: 'map' (flying on the map), 'big' (closed hull) and 'cut' (cutaway interior).
  const PAL = { bg: '#070a17', bg2: '#0d1124', panel: '#111734', panel2: '#19214a', line: '#2a3363', amber: '#ffb547', cyan: '#5ce1e6',
    rose: '#ff5d8f', text: '#e9ecff', muted: '#8d95c4', dim: '#4a5288', good: '#7ee0a1', rust: '#d9643a', torch: '#c9b8ff' };
  const DACC = { kestrel: '#5ce1e6', mule: '#ffb547', sparrow: '#ff5d8f', ferry: '#7ee0a1', heron: '#ffb547', gull: '#5ce1e6', atlas: '#ff5d8f',
    climber: '#c9b8ff', drake: '#7ee0a1', barge: '#ffb547', kite: '#d9643a', lantern: '#c9b8ff', pod: '#5ce1e6', wasp: '#ffb547',
    ox: '#7ee0a1', iceboat: '#5ce1e6', pilgrim: '#ffb547', prospector: '#d9643a', packet: '#ff5d8f', yacht: '#c9b8ff' };
  function pixCanvas(rows, cols, flip) {
    const h = rows.length, w = rows[0].length, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
      const ch = rows[r][q];
      if (ch === '.' || !cols[ch]) continue;
      x.fillStyle = cols[ch]; x.fillRect(flip ? w - 1 - q : q, r, 1, 1);
    }
    return cv;
  }
  function mirror(cv) {
    const m = document.createElement('canvas');
    m.width = cv.width; m.height = cv.height;
    const x = m.getContext('2d');
    x.translate(cv.width, 0); x.scale(-1, 1); x.drawImage(cv, 0, 0);
    return m;
  }
  const hash = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 2) * 0.15;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const RGB = {};
  const rgb = h => RGB[h] || (RGB[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const BT = {
    ocean: ['#0a1f48', '#14397a', '#1e5aa8', '#3a82d0'], land: ['#16301c', '#2f6634', '#4f8f46', '#86b862'],
    desert: ['#4a3622', '#8a6a40', '#c09a60', '#e2c48c'], ice: ['#6a7096', '#a9b0cc', '#d6dbec', '#ffffff'],
    cloud: ['#4a5288', '#9aa2c8', '#d0d5ea', '#ffffff'], moon: ['#24283c', '#4c5068', '#8a8ea4', '#c8cbd8'],
    mars: ['#36140e', '#74301e', '#b0502c', '#e07c46'], jupiter: ['#46301c', '#8a5a34', '#c49a68', '#efdcb4'],
    storm: ['#561c12', '#963a24', '#c8573a', '#ec9070'], saturn: ['#463a22', '#8e7648', '#c8ac74', '#f0e0b4'],
    neptune: ['#0c1c4c', '#1f4498', '#3a6cd0', '#82b0f4'], ceres: ['#26262e', '#4a4a56', '#7a7a88', '#aaaab6'],
    rock: ['#2a221c', '#524536', '#806c56', '#ae977a'], ice2: ['#2a384a', '#6c8296', '#a9bdcd', '#e8f0f8'],
    crack: ['#3a2a20', '#6a4a34', '#9a704e', '#c49a70']
  };
  // craters as [x, y, radius] in unit-disc coordinates, fixed per body kind
  function craters(seed, n, rmax) {
    const out = [];
    for (let i = 0; i < n; i++) out.push([hash(i, 1, seed) * 1.8 - 0.9, hash(i, 2, seed) * 1.8 - 0.9, 0.04 + hash(i, 3, seed) * rmax]);
    return out;
  }
  const CRATERS = { moon: craters(3, 22, 0.16), mars: craters(5, 9, 0.1), ceres: craters(7, 10, 0.18), rock: craters(9, 6, 0.22) };
  // planets: 1 art pixel = px world units (1 in the game, 2 for chunky thumbnails)
  function bodyCanvas(kind, r, px = 1) {
    const R = Math.max(3, Math.round(r / px)), ring = kind === 'saturn' ? 2.3 : 1, rim = kind === 'earth' ? 3 : 0;
    const W = Math.ceil(R * 2 * ring) + 2 + rim * 2, H = R * 2 + 2 + rim * 2;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), img = x.createImageData(W, H), dd = img.data;
    const cx = W / 2, cy = H / 2;
    const put = (qx, qy, hx) => { const i = (qy * W + qx) * 4, c = rgb(hx); dd[i] = c[0]; dd[i + 1] = c[1]; dd[i + 2] = c[2]; dd[i + 3] = 255; };
    const tone = (T, v, th) => T[Math.max(0, Math.min(3, Math.floor(v * 4 + th - 0.5)))];
    const cr = CRATERS[kind === 'ice' ? 'rock' : kind] || null;
    for (let qy = 0; qy < H; qy++) for (let qx = 0; qx < W; qx++) {
      const dx = (qx + 0.5 - cx) / R, dy = (qy + 0.5 - cy) / R, rr = dx * dx + dy * dy;
      const th = BAYER[(qy & 3) * 4 + (qx & 3)] / 16;
      if (kind === 'saturn') {
        const ry = dy / 0.3, q = dx * dx + ry * ry;
        const band = q > 1.55 && q < 4.6 && !(q > 2.45 && q < 2.62) && !(q > 3.7 && q < 3.82);
        if (band && (rr > 1 || dy > 0)) {
          const shade = rr > 1 && dx > 0.15 && dy < 0.25 && Math.abs(dy) < 0.5 ? 0.25 : 0;
          put(qx, qy, tone(BT.saturn, (q < 2.45 ? 0.45 : q < 3.7 ? 0.8 : 0.55) - shade, th));
          continue;
        }
      }
      if (rr > 1) {
        if (rim && rr < (1 + rim / R) * (1 + rim / R)) {
          const l = -0.6 * dx - 0.45 * dy;
          if (l > -0.1) put(qx, qy, l > 0.35 ? '#8fd8ff' : l > 0.1 ? '#4a9ae8' : '#24509a');
        }
        continue;
      }
      const nz = Math.sqrt(1 - rr);
      const light = Math.max(0, Math.min(1, (-0.6 * dx - 0.45 * dy + 0.66 * nz) * 1.1));
      let v = light, T = BT[kind] || BT.rock;
      if (kind === 'earth') {
        const n = fbm(dx * 2.4 + 3, dy * 2.4 + 1, 3), cl = fbm(dx * 3 + 7 + dy * 1.5, dy * 8 + 2, 8);
        if (Math.abs(dy) > 0.84 + n * 0.1) T = BT.ice;
        else if (cl > 0.62) { T = BT.cloud; v += 0.1; }
        else if (n > 0.52) T = n > 0.66 && Math.abs(dy) < 0.45 ? BT.desert : BT.land;
        else { T = BT.ocean; v *= 0.95; }
        if (light < 0.02 && T === BT.land && hash(qx, qy, 4) > 0.98) { put(qx, qy, '#ffb547'); continue; }
      } else if (kind === 'jupiter' || kind === 'saturn' || kind === 'neptune') {
        const f = kind === 'jupiter' ? 16 : kind === 'saturn' ? 10 : 7, amp = kind === 'neptune' ? 0.08 : 0.17;
        v = v * 0.78 + Math.sin(dy * f + fbm(dx * 3, dy * 6, 2) * 2.4) * amp + 0.1;
        if (kind === 'jupiter') {
          const ex = (dx - 0.32) / 0.2, ey = (dy - 0.36) / 0.1, e = ex * ex + ey * ey;
          if (e < 1) { T = BT.storm; v = light * (e < 0.5 ? 1 : 0.8); } else if (e < 1.5) v = light + 0.2;
        }
        if (kind === 'neptune') { const ex = (dx + 0.25) / 0.16, ey = (dy - 0.15) / 0.08; if (ex * ex + ey * ey < 1) v *= 0.45; }
      } else {
        v *= 0.82 + fbm(dx * 3 + 2, dy * 3, kind.length) * 0.36;
        if (kind === 'moon' && fbm(dx * 1.6 + 5, dy * 1.6 + 2, 11) < 0.42) v *= 0.72;
        if (kind === 'mars') {
          if (dy < -0.8 + fbm(dx * 4, 0, 6) * 0.08) T = BT.ice;
          else if (Math.abs(dy - 0.08 - Math.sin(dx * 3) * 0.08) < 0.035 && dx > -0.55 && dx < 0.45) v *= 0.55;
        }
        if (kind === 'ice' && Math.abs(Math.sin(dx * 11 + dy * 5 + fbm(dx * 3, dy * 3, 4) * 3)) < 0.09) T = BT.crack;
        if (cr) for (let i = 0; i < cr.length; i++) {
          const k = cr[i], ex = dx - k[0], ey = dy - k[1], d2 = ex * ex + ey * ey;
          if (d2 < k[2] * k[2]) { const d = Math.sqrt(d2) / k[2]; v += d > 0.72 ? (ex * -0.6 + ey * -0.45 > 0 ? -0.15 : 0.18) : -0.12; break; }
        }
      }
      put(qx, qy, tone(T, v, th));
    }
    x.putImageData(img, 0, 0);
    return { cv, w: W * px, h: H * px };
  }

  // ---- ships: modular pixel sprites
  const DSTYLE = {
    kestrel: { bow: 'capsule', hc: 0, eng: 1 }, mule: { bow: 'fairing', hc: 0, eng: 2 }, sparrow: { bow: 'fairing', hc: 0, eng: 1, fins: 1 },
    ferry: { bow: 'tug', hc: 0, eng: 2 }, heron: { bow: 'cockpit', hc: 0, eng: 1, legs: 1 }, gull: { bow: 'fairing', hc: 1, eng: 3, fins: 1 },
    atlas: { bow: 'fairing', hc: 2, eng: 3, fins: 1 }, climber: { bow: 'car', hc: 1, eng: 0 }, drake: { bow: 'cockpit', hc: 1, eng: 1 },
    barge: { bow: 'tug', hc: 2, eng: 1 }, kite: { bow: 'capsule', hc: 1, eng: 2, legs: 1 }, lantern: { bow: 'sleek', hc: 0, eng: 2 },
    pod: { bow: 'pod', hc: 0, eng: 1 }, wasp: { bow: 'sleek', hc: 0, eng: 1 }, ox: { bow: 'armor', hc: 2, eng: 1, dish: 1 },
    iceboat: { bow: 'tug', hc: 2, eng: 1, legs: 1 }, pilgrim: { bow: 'liner', hc: 2, eng: 1, dish: 1 }, prospector: { bow: 'cockpit', hc: 1, eng: 1, legs: 1 },
    packet: { bow: 'sleek', hc: 1, eng: 1 }, yacht: { bow: 'yacht', hc: 1, eng: 1 }
  };
  const ST = { // 5-tone ramps: highlight, base, mid, shade, outline
    hull: ['#f6f8ff', '#d4d8ee', '#a9aecb', '#787e9e', '#3c4160'], metal: ['#b8bed8', '#8a90b0', '#646a8a', '#454a68', '#262a40'],
    dark: ['#6a7096', '#4a5074', '#343956', '#23273e', '#14172a'], foam: ['#ffd7a0', '#f0b06a', '#c8843e', '#94582a', '#4a2a14'],
    silver: ['#ffffff', '#e2e6f4', '#b4bbd6', '#7c84a8', '#3c4160'], torch: ['#a69ad6', '#7a6ea6', '#55497c', '#3a3358', '#1c1830'],
    gold: ['#fff0b0', '#ffcf6a', '#d8a040', '#a07020', '#503810']
  };
  function shade(hx, k) { const c = rgb(hx); return '#' + c.map(q => Math.max(0, Math.min(255, Math.round(q * k))).toString(16).padStart(2, '0')).join(''); }
  // design D, slot layout cfg, livery colour, tank upgrade level, mode 'map' | 'big' | 'cut'
  function shipCanvas(D, cfg, liv, tank, mode) {
    const big = mode !== 'map', st = DSTYLE[D.k], n = cfg.length;
    const HH = big ? [16, 20, 26][st.hc] : [7, 9, 11][st.hc];
    const MW = big ? 14 : n > 6 ? 3 : 4;
    const ff = D.fuel / (D.fuel + D.dry);
    const EW = st.eng === 0 ? (big ? 6 : 2) : D.f === 0 ? (big ? 10 : 4) : D.f === 1 ? (big ? 18 : 6) : (big ? 24 : 7);
    const TW = D.fuel ? Math.round((big ? 6 + 18 * ff : 2 + 4 * ff) * (1 + 0.15 * tank)) : 0;
    const BW = big ? (/sleek|yacht/.test(st.bow) ? 20 : st.bow === 'armor' ? 16 : 12) : (/sleek|yacht/.test(st.bow) ? 6 : 4);
    const wingK = D.f === 2 ? (big ? 0.6 : 0.75) : D.f === 1 ? 0.5 : st.fins ? 0.25 : 0.12;
    const top = Math.ceil(HH * wingK) + (st.dish && big ? 5 : 0) + 1;
    const bot = Math.ceil(HH * wingK) + (st.legs ? Math.ceil(HH * 0.5) : 0) + 1;
    const Wd = EW + TW + n * MW + BW + 1, Ht = top + HH + bot;
    const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Ht;
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const y0 = top, y1 = top + HH, cy = top + HH / 2;
    // a vertical slice of a cylinder, h rows tall centred on cy
    const col = (x, h, T, w = 1) => {
      h = Math.max(1, Math.round(h));
      const ys = Math.round(cy - h / 2);
      for (let r = 0; r < h; r++) {
        const t = h === 1 ? 0.5 : r / (h - 1);
        R(x, ys + r, w, 1, T[r === 0 || r === h - 1 ? 4 : t < 0.18 ? 1 : t < 0.36 ? 0 : t < 0.64 ? 1 : t < 0.84 ? 2 : 3]);
      }
    };
    const accent = liv, accentD = shade(liv, 0.6);
    let x = 0;
    // ---- engine section
    if (st.eng === 0) { // elevator clamp and tether
      R(Math.floor(EW / 2), 0, 1, Ht, '#8d95c4');
      for (let i = 0; i < EW; i++) col(i, HH * 0.8, ST.metal);
    } else if (D.f === 0) {
      const nb = st.eng, bh = HH * (nb === 1 ? 0.9 : nb === 2 ? 0.5 : 0.36), bw = big ? 7 : 3;
      for (let b = 0; b < nb; b++) {
        const off = (b - (nb - 1) / 2) * bh * 1.05;
        for (let i = 0; i < bw; i++) {
          const h = Math.max(1, Math.round(bh * (1 - 0.5 * i / bw))), ys = Math.round(cy + off - h / 2);
          for (let r = 0; r < h; r++) R(i, ys + r, 1, 1, ST.metal[r === 0 || r === h - 1 ? 4 : r < h / 3 ? 0 : r < h * 0.7 ? 1 : 2]);
          if (i === 0 && big && h > 3) { R(0, ys + 1, 1, h - 2, '#1a1420'); R(0, Math.round(cy + off) - 1, 1, 2, '#ff8a3a'); }
        }
      }
      for (let i = bw; i < EW; i++) col(i, HH * 0.75, ST.dark);
    } else if (D.f === 1) {
      const fins = big ? 8 : 3, shield = big ? 2 : 1;
      for (let i = 0; i < (big ? 4 : 1); i++) col(i, HH * (0.35 + 0.1 * i), ST.metal);
      for (let i = big ? 4 : 1; i < EW - fins - shield; i++) col(i, HH * 0.6, ST.dark);
      if (big) { R(6, Math.round(cy - HH * 0.3) + 1, 2, Math.round(HH * 0.6) - 2, PAL.amber); R(9, Math.round(cy - HH * 0.3) + 1, 1, Math.round(HH * 0.6) - 2, PAL.amber); }
      for (let i = EW - fins - shield; i < EW - fins; i++) col(i, HH * 1.25, ST.metal);
      // radiator fins above and below
      const fx0 = EW - fins, fh = Math.round(HH * 0.5);
      R(fx0, y0 - fh, fins + TW, fh, '#2b3a6a'); R(fx0, y1, fins + TW, fh, '#2b3a6a');
      for (let i = fx0; i < fx0 + fins + TW; i += big ? 3 : 2) { R(i, y0 - fh, 1, fh, '#4a5ea0'); R(i, y1, 1, fh, '#4a5ea0'); }
      R(fx0, y0 - fh, fins + TW, 1, '#7a8ed0'); R(fx0, y1 + fh - 1, fins + TW, 1, '#1a2448');
      for (let i = fx0; i < EW; i++) col(i, HH * 0.55, ST.dark);
    } else {
      const ringW = big ? 2 : 1;
      for (let i = 0; i < ringW; i++) col(i, HH * 1.1, ['#ffffff', '#c9b8ff', '#9a86e0', '#6a5aa8', '#2a2048']);
      for (let i = ringW; i < EW; i++) col(i, HH * (1 - 0.45 * (i / EW)), ST.torch);
      for (let i = ringW + 3; i < EW; i += big ? 5 : 3) col(i, HH * (1 - 0.45 * (i / EW)), ['#8a7ec0', '#5e5288', '#43386a', '#2d2748', '#1c1830']);
      // radiator wings, tapering toward the bow
      const wx0 = Math.round(EW * 0.5), wl = EW - wx0 + TW, wh = Math.round(HH * (wingK - 0.03));
      for (let i = 0; i < wl; i++) {
        const h = Math.max(1, Math.round(wh * (1 - 0.6 * i / wl)));
        R(wx0 + i, y0 - h, 1, h, (i % (big ? 4 : 2)) ? '#2b3050' : '#3f4670'); R(wx0 + i, y1, 1, h, (i % (big ? 4 : 2)) ? '#2b3050' : '#3f4670');
        R(wx0 + i, y0 - h, 1, 1, '#ff8a3a'); R(wx0 + i, y1 + h - 1, 1, 1, '#ff8a3a');
      }
    }
    x = EW;
    // ---- propellant tank
    const tankT = D.f === 0 ? ST.foam : D.f === 1 ? ST.silver : ST.dark;
    for (let i = 0; i < TW; i++) col(x + i, HH * 0.92, (big && i % 6 === 5) ? tankT.slice(1).concat(tankT[4]) : tankT);
    if (big && TW > 8) { R(x + Math.floor(TW / 2) - 1, Math.round(cy) - 1, 3, 2, accent); }
    x += TW;
    // ---- payload modules, one per slot
    const slots = [];
    const wall = big ? 3 : 1;
    const iy0 = y0 + wall + (big ? 1 : 0), iy1 = y1 - wall;
    for (let s = 0; s < n; s++) {
      const mx = x + s * MW, ch = cfg[s];
      for (let i = 0; i < MW; i++) col(mx + i, HH, ST.hull);
      R(mx, y0 + 1, 1, HH - 2, ST.hull[3]); // seam
      R(mx, y0 + (big ? 3 : 1), MW, big ? 2 : 1, accent);
      if (big) R(mx, y0 + 5, MW, 1, accentD);
      if (mode === 'cut') {
        R(mx + 1, iy0, MW - 1, iy1 - iy0, '#141936');
        R(mx + 1, iy0, MW - 1, Math.floor((iy1 - iy0) / 2), '#1a2048');
        R(mx + 1, iy1 - 1, MW - 1, 1, '#2a3363');
        if (ch === 'K') { R(mx + 1, iy0, 1, iy1 - iy0, '#2a3363'); R(mx + MW - 1, iy0, 1, iy1 - iy0, '#2a3363'); }
        else if (ch === 'S') { R(mx + MW - 4, iy1 - 7, 2, 6, '#3a4270'); R(mx + 3, iy1 - 3, MW - 6, 2, '#4a5490'); }
        else { R(mx + 2, iy0 + 1, MW - 4, 2, '#5ce1e6'); R(mx + 2, iy1 - 3, MW - 4, 2, '#a07a2a'); R(mx + MW - 4, iy1 - 7, 2, 5, '#a07a2a'); }
      } else if (ch === 'S') {
        if (big) for (let k = 2; k < MW - 2; k += 4) { R(mx + k, Math.round(cy) - 2, 3, 3, '#1a2a4a'); R(mx + k, Math.round(cy) - 2, 2, 2, PAL.cyan); }
        else R(mx + 1, Math.round(cy) - 1, Math.max(1, MW - 2), 1, PAL.cyan);
      } else if (ch === 'C') {
        if (big) { R(mx + 2, Math.round(cy) - 3, MW - 4, 5, ST.gold[2]); R(mx + 3, Math.round(cy) - 2, MW - 6, 3, '#bff6f8'); }
        else { R(mx + 1, Math.round(cy) - 1, Math.max(1, MW - 2), 1, ST.gold[1]); }
      } else if (big) {
        R(mx + 2, y0 + 7, MW - 4, HH - 10, ST.hull[2]);
        for (let k = mx + 3; k < mx + MW - 2; k += 3) R(k, y0 + 7, 1, HH - 10, ST.hull[3]);
        R(mx + 2, y0 + 7, MW - 4, 1, ST.hull[4]);
      } else R(mx + 1, Math.round(cy), Math.max(1, MW - 2), 1, ST.hull[3]);
      slots.push({ x: mx, w: MW, ch });
    }
    if (big && st.dish) { const dx = x + Math.floor(n * MW / 2); R(dx, y0 - 3, 1, 3, ST.metal[2]); R(dx - 3, y0 - 5, 7, 2, ST.metal[1]); R(dx - 2, y0 - 6, 5, 1, ST.metal[0]); }
    x += n * MW;
    // ---- bow
    for (let i = 0; i < BW; i++) {
      const t = i / BW;
      let h = HH, T = ST.hull;
      switch (st.bow) {
        case 'capsule': h = HH * (1 - 0.6 * t); break;
        case 'fairing': h = HH * Math.sqrt(Math.max(0.04, 1 - t * t)); if (t > 0.7) T = [shade(liv, 1.3), liv, liv, accentD, ST.hull[4]]; break;
        case 'cockpit': h = HH * Math.sqrt(Math.max(0.1, 1 - Math.pow(t, 3))); break;
        case 'tug': case 'car': case 'pod': h = HH * (t > 0.7 ? 0.8 : 0.95); T = st.bow === 'tug' && t > 0.7 ? ST.metal : ST.hull; break;
        case 'sleek': case 'yacht': h = Math.max(2, HH * Math.pow(1 - t, 1.2)); break;
        case 'armor': h = HH * (1 - 0.5 * t); T = ST.dark; break;
        case 'liner': h = HH * Math.sqrt(Math.max(0.15, 1 - t * t * t)); break;
      }
      col(x + i, h, T);
      if (big && (st.bow === 'sleek' || st.bow === 'yacht') && h > 4) R(x + i, Math.round(cy - h / 2) + 2, 1, 1, st.bow === 'yacht' ? ST.gold[1] : accent);
    }
    if (big) {
      if (st.bow === 'cockpit' || st.bow === 'liner' || st.bow === 'yacht') { R(x + BW - 6, Math.round(cy) - 3, 3, 2, '#1a2a4a'); R(x + BW - 6, Math.round(cy) - 3, 2, 1, '#bff6f8'); }
      if (st.bow === 'capsule') R(x + 2, Math.round(cy) - 2, 2, 2, PAL.cyan);
      if (st.bow === 'armor') for (let i = 2; i < BW - 4; i += 4) R(x + i, Math.round(cy) - 1, 2, 2, PAL.amber);
      if (st.bow === 'tug') R(x + BW - 1, Math.round(cy) - 1, 1, 2, PAL.rose);
    }
    // ---- landing legs and grid fins
    if (st.legs) {
      const lh = Math.ceil(HH * 0.45);
      for (const lx of [EW + 1, x - 2]) {
        for (let k = 0; k < lh; k++) R(lx + (lx > EW + 1 ? k / 2 : -k / 2), y1 + k, 1, 1, ST.metal[2]);
        R(lx + (lx > EW + 1 ? lh / 2 : -lh / 2) - 1, y1 + lh, 3, 1, ST.metal[1]);
      }
    }
    if (st.fins) {
      const fh = Math.ceil(HH * 0.22), fw = big ? 4 : 2;
      R(EW + 1, y0 - fh, fw, fh, ST.metal[2]); R(EW + 1, y1, fw, fh, ST.metal[2]);
    }
    return { cv, slots, iy0, iy1, cy, w: Wd, h: Ht, HH };
  }
  // passengers and crates for the cutaway (art pixels; drawn scaled on top of a 'cut' sprite)
  const SKIN = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69'], SUIT = ['#5ce1e6', '#ff5d8f', '#7ee0a1', '#e9ecff'];
  function paxCanvas(i, vip) {
    return pixCanvas(['..hh..', '..hh..', '.SSSS.', 'SSSSSS', '.SSSS.', '.SSLLL', '....LL'],
      { h: SKIN[i % 4], S: vip ? '#ffcf6a' : SUIT[(i >> 2) % 4], L: '#2a3363' });
  }
  const CRATE_COL = { 6: '#b4bbd6', 7: '#f0b06a', 8: '#ffb547', 9: '#7ee0a1', 10: '#ff5d8f', 11: '#5ce1e6', 12: '#c9b8ff', 13: '#a8957c',
    14: '#bff6f8', 15: '#9a6a44', 16: '#e8886a', 17: '#9fb4c8', 18: '#ffcf6a' };
  function crateCanvas(colr) {
    const w = 10, h = 8, d = shade(colr, 0.62), l = shade(colr, 1.25);
    const rows = [];
    for (let r = 0; r < h; r++) {
      let s = '';
      for (let q = 0; q < w; q++) s += r === 0 || q === 0 ? 'l' : r === h - 1 || q === w - 1 ? 'd' : r === 3 ? 'd' : (q === 2 || q === w - 3) ? 'd' : 'b';
      rows.push(s);
    }
    return pixCanvas(rows, { b: colr, d, l });
  }
  // engine plume per drive family, art pixels; mode 'map' is short, 'big' long
  function plumeCanvas(fam, big) {
    const len = big ? [18, 26, 56][fam] : [7, 10, 22][fam], h = big ? [7, 7, 6][fam] : 3;
    const cols = [['#ffffff', '#ffe08a', '#ffb547', '#ff5d8f'], ['#ffffff', '#bff6f8', '#5ce1e6', '#2f74c8'], ['#ffffff', '#e4dcff', '#c9b8ff', '#6a5aa8']][fam];
    const cv = document.createElement('canvas'); cv.width = len; cv.height = h;
    const g = cv.getContext('2d');
    for (let q = 0; q < len; q++) {
      const t = q / len, half = (h / 2) * (fam === 2 ? 1 - t * 0.5 : 1 - t * 0.8);
      for (let r = 0; r < h; r++) {
        const dy = Math.abs(r + 0.5 - h / 2) / Math.max(0.5, half);
        if (dy > 1) continue;
        const v = (1 - t) * (1 - dy * 0.7);
        if (v < 0.25 && BAYER[(r & 3) * 4 + (q & 3)] / 16 > v * 3) continue;
        g.fillStyle = cols[v > 0.75 ? 0 : v > 0.5 ? 1 : v > 0.3 ? 2 : 3];
        g.fillRect(len - 1 - q, r, 1, 1);
      }
    }
    return cv;
  }
  // a finished ship with its plume, for the menu thumbnail and Steam art
  function shipArtAt(ctx, k, x, y, sc, mode = 'big') {
    const Dz = DS.find(q => q.k === k), e = shipCanvas(Dz, Dz.cfg, DACC[k], 0, mode), p = plumeCanvas(Dz.f, mode !== 'map');
    const w = e.w * sc, h = e.h * sc, X = Math.round(x - w / 2), Y = Math.round(y - h / 2);
    ctx.drawImage(p, X - p.width * sc, Math.round(Y + e.cy * sc - p.height * sc / 2), p.width * sc, p.height * sc);
    ctx.drawImage(e.cv, X, Y, w, h);
  }

  Arcade.register({
    id: 'sol-tycoon',
    title: 'Sol: Tycoon',
    blurb: 'Run a passenger and cargo line from low Earth orbit to the moons of Jupiter.',
    controls: 'Tap ports, ships and buttons; drag to pan. Controller: d-pad moves the highlight, A selects, B goes back, ' +
      'L/R switch tabs, X jumps to an idle ship, Y jumps between regions, right stick pans. On a flight plan, left/right sets the burn.',
    orientation: 'landscape',
    pointer: true,
    redraw: 'onDemand',
    fps: 30,
    sim: SIM,

    thumb(ctx, w, h) {
      ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = i % 3 ? '#2a3363' : '#8d95c4'; ctx.fillRect((i * 37) % w, (i * 53) % h, 1, 1); }
      const e = bodyCanvas('earth', 70, 2), m = bodyCanvas('moon', 14, 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(e.cv, -46, 34, e.w * 0.9, e.h * 0.9);
      ctx.drawImage(m.cv, 84, 16, m.w * 0.8, m.h * 0.8);
      ctx.strokeStyle = '#2a3363'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(52, 60); ctx.lineTo(92, 26); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = PAL.amber; ctx.fillRect(50, 58, 4, 4); ctx.fillRect(90, 24, 4, 4);
      shipArtAt(ctx, 'wasp', 72, 40, 2, 'map');
    },

    art(ctx, W, H, kind) {
      ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, W, H);
      const u = Math.min(W, H) / 360;
      for (let i = 0; i < W * H / 2600; i++) { ctx.fillStyle = i % 5 ? 'rgba(141,149,196,.35)' : '#e9ecff'; const s = (i % 7 ? 1 : 2) * u; ctx.fillRect((i * 7919) % W, (i * 104729) % H, s, s); }
      ctx.imageSmoothingEnabled = false;
      const e = bodyCanvas('earth', 120), j = bodyCanvas('jupiter', 70), m = bodyCanvas('moon', 22), ma = bodyCanvas('mars', 40);
      const k = kind === 'cover' ? H / 900 * 3.2 : H / 430 * 2.2;
      if (kind === 'cover') {
        ctx.drawImage(e.cv, -e.w * k * 0.35, H - e.h * k * 0.62, e.w * k, e.h * k);
        ctx.drawImage(m.cv, W * 0.66, H * 0.5, m.w * k, m.h * k);
        ctx.drawImage(j.cv, W * 0.55, H * 0.06, j.w * k * 0.7, j.h * k * 0.7);
        ctx.drawImage(ma.cv, W * 0.08, H * 0.3, ma.w * k * 0.5, ma.h * k * 0.5);
        shipArtAt(ctx, 'wasp', W * 0.58, H * 0.53, Math.round(2.4 * u));
      } else {
        ctx.drawImage(e.cv, -e.w * k * 0.45, H / 2 - e.h * k / 2, e.w * k, e.h * k);
        ctx.drawImage(m.cv, W * 0.6, H * 0.6, m.w * k, m.h * k);
        ctx.drawImage(ma.cv, W * 0.52, H * 0.18, ma.w * k * 0.6, ma.h * k * 0.6);
        ctx.drawImage(j.cv, W - j.w * k * 0.75, H / 2 - j.h * k / 2, j.w * k, j.h * k);
        ctx.strokeStyle = 'rgba(92,225,230,.35)'; ctx.lineWidth = 2 * u; ctx.setLineDash([6 * u, 6 * u]);
        ctx.beginPath(); ctx.moveTo(W * 0.18, H * 0.5); ctx.lineTo(W * 0.56, H * 0.3); ctx.lineTo(W * 0.82, H * 0.5); ctx.stroke(); ctx.setLineDash([]);
        shipArtAt(ctx, 'ox', W * 0.4, H * 0.7, Math.max(2, Math.round(2 * u)));
      }
    },

    create(api) {
      const C = PAL;
      const FONT = { h: '700 16px Silkscreen, "Courier New", monospace', l: '400 11px Silkscreen, "Courier New", monospace',
        s: '400 8px Silkscreen, "Courier New", monospace', b: '500 13px "Chakra Petch", system-ui, sans-serif',
        bs: '500 11px "Chakra Petch", system-ui, sans-serif' };
      const ERA = ['', 'I · LOW ORBIT', 'II · CISLUNAR & RED', 'III · TORCH AGE', 'IV · OUTER REACH'];
      const ROMAN = ['', 'I', 'II', 'III', 'IV'];
      const ERA_TEXT = ['', '',
        'The Space Elevator hums from Anchor Atoll to Highport. Nuclear-thermal ships can now reach Mars: license Areo Station and its moons, research Nuclear Thermal, then build the Phobos Torch Yards.',
        'The first fusion torches leave Phobos. The Belt and the moons of Jupiter are open. Torch drives can burn the whole way, so choose your burns carefully: the fuel is expensive.'];
      const TABS = ['MAP', 'FLEET', 'HANGAR', 'RESEARCH', 'PROJECTS', 'STATS'];
      const REGION_ERA = [1, 2, 3, 3, 4];

      // ---- company: resume, catch up on the time we were away, then resume paused routines
      let now = Date.now();
      let fresh = false;
      let c = SIM.load(api.load(), now);
      if (!c) { c = SIM.newCompany(now); fresh = true; }
      const ui = { tab: 0, stack: [], fk: '', nav: false, cam: { x: 0, tx: 0 }, toasts: [], dirty: true, pop: 0, live: false,
        sec: 0, scroll: {}, hang: 0, rd: Math.min(3, c.era), quiet: true, saveAt: 0, needSave: false, lastAdv: now, region: 0 };
      SIM.setEmit(onEmit);
      SIM.advance(c, now);
      const aw = c.aw, gap = now - c.seen;
      c.aw = null;
      SIM.resumeRoutines(c, now);
      c.seen = now;
      ui.quiet = false;
      if (fresh) ui.stack.push({ ty: 'help' });
      else if (aw && gap > 2 * MIN && (aw.n || aw.arr || aw.res.length || aw.ps)) ui.stack.push({ ty: 'away', aw, gap });

      function onEmit(k, x) {
        if (k === 'launch') { if (!ui.quiet) { api.sfx.noise({ d: 0.35, v: 0.08 }); api.sfx.tone({ f: 90, to: 260, d: 0.4, type: 'sawtooth', v: 0.04 }); } return; }
        if (k === 'arrive') { if (!ui.quiet) { toast(`${x.nm} arrived at ${N[x.at].n}`, C.cyan); api.sfx.tone({ f: 660, to: 880, d: 0.12, type: 'triangle', v: 0.05 }); } ui.dirty = true; return; }
        if (k === 'era') { ui.stack.push({ ty: 'era', era: x }); ui.rd = Math.min(3, x); api.sfx.tone({ f: 392, to: 784, d: 0.6, type: 'triangle', v: 0.08 }); ui.dirty = true; return; }
        if (ui.quiet) return;
        if (k === 'level') { toast(x, C.amber); api.sfx.tone({ f: 523, to: 1046, d: 0.3, type: 'triangle', v: 0.07 }); }
        else if (k === 'bad') { toast(x, C.rose); }
        else toast(x, k === 'part' ? C.torch : C.good);
        ui.dirty = true;
      }
      function toast(text, col) {
        ui.toasts.push({ text, col: col || C.text, until: performance.now() + 3200 });
        if (ui.toasts.length > 3) ui.toasts.shift();
      }
      const save = () => { api.save(c); ui.saveAt = now; ui.needSave = false; };

      // ---- formatting
      function cr(v) {
        const a = Math.abs(v), s = v < 0 ? '-' : '';
        if (a < 1000) return s + Math.round(a);
        if (a < 1e6) return s + (a / 1e3).toFixed(a < 1e5 ? 1 : 0) + 'K';
        if (a < 1e9) return s + (a / 1e6).toFixed(a < 1e7 ? 2 : 1) + 'M';
        return s + (a / 1e9).toFixed(2) + 'B';
      }
      function tm(ms) {
        const s = Math.max(0, Math.round(ms / 1000));
        if (s < 60) return s + 's';
        const m = Math.floor(s / 60);
        if (m < 10) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
        if (m < 60) return m + 'm';
        const h = Math.floor(m / 60);
        return h + 'h ' + String(m % 60).padStart(2, '0') + 'm';
      }
      const ship = id => c.sh.find(s => s.i === id);
      const D = s => DS[s.d];
      function jobLine(j) {
        const T = JT[j.t];
        return (j.v ? `VIP ×${j.v} · ` : '') + T.n + (T.p ? '' : ` · ${j.m}t`);
      }

      // ---- sprites (rebuilt on resize so they stay crisp)
      const SPR = { node: {}, body: {} };
      function buildSprites() {
        SPR.plumeMap = [0, 1, 2].map(f => { const r = plumeCanvas(f, false); return { r, l: mirror(r) }; });
        SPR.plumeBig = [0, 1, 2].map(f => plumeCanvas(f, true));
        SPR.pax = [];
        for (let i = 0; i < 16; i++) SPR.pax.push(paxCanvas(i, false));
        for (let i = 0; i < 4; i++) SPR.pax.push(paxCanvas(i, true));
        SPR.crate = JT.map((t, i) => crateCanvas(CRATE_COL[i] || (i === J_RES ? '#c9b8ff' : i >= J_KIT ? '#7ee0a1' : '#8d95c4')));
        SPR.dmap = DS.map(Dz => shipCanvas(Dz, Dz.cfg, DACC[Dz.k], 0, 'map'));
        const ICON = {
          pad: ['...a...', '..aaa..', '..a.a..', '.aa.aa.', '.a...a.', 'aaaaaaa', 'a.....a'],
          orb: ['..aaa..', '.a...a.', 'a..a..a', 'a.aaa.a', 'a..a..a', '.a...a.', '..aaa..'],
          base: ['.......', '..aaa..', '.aaaaa.', 'aa.a.aa', 'aaaaaaa', 'a.....a', 'aaaaaaa'],
          rock: ['..aa...', '.aaaaa.', 'aaa.aaa', 'aaaaaa.', '.aaaaaa', '..aaaa.', '...a...'],
          site: ['...a...', '.......', '.a...a.', 'a..a..a', '.a...a.', '.......', '...a...']
        };
        for (const k in ICON) {
          SPR.node[k] = {
            own: pixCanvas(ICON[k], { a: C.amber }), free: pixCanvas(ICON[k], { a: C.muted }), lock: pixCanvas(ICON[k], { a: '#2a3363' }),
            site: pixCanvas(ICON[k], { a: C.cyan }), stn: pixCanvas(ICON[k], { a: C.good })
          };
        }
        SPR.star = pixCanvas(['..a..', '.aaa.', 'aaaaa', '.a.a.'], { a: '#ffffff' });
        for (const b of BODIES) if (!SPR.body[b.k + b.r]) SPR.body[b.k + b.r] = bodyCanvas(b.k, b.r);
      }
      // per-ship sprite cache: rebuilt only when the layout, livery or tanks change
      const SHIPC = new Map(), G = { e: null, sc: 1, ox: 0, oy: 0 };
      function shipSpr(s, mode) {
        let rec = SHIPC.get(s.i);
        if (!rec) SHIPC.set(s.i, rec = {});
        const r = rec[mode];
        if (r && r.cf === s.cf && r.lv === s.lv && r.t === s.u[0] && r.d === s.d) return r.e;
        const e = shipCanvas(DS[s.d], s.cf, SIM.LIVERY[s.lv], s.u[0], mode);
        if (mode === 'map') e.l = mirror(e.cv);
        rec[mode] = { cf: s.cf, lv: s.lv, t: s.u[0], d: s.d, e };
        return e;
      }
      const designShip = d => ({ i: -1 - d, d, cf: DS[d].cfg, lv: Math.max(0, SIM.LIVERY.indexOf(DACC[DS[d].k])), u: [0, 0, 0, 0], ld: [], f: null });
      // jobs as they sit in the slots: cabins take the cabin passengers, seats the rest, racks the cargo
      function slotJobs(s) {
        const pax = s.ld.filter(j => JT[j.t].p), cab = pax.filter(j => j.cb), seat = pax.filter(j => !j.cb), crg = s.ld.filter(j => !JT[j.t].p);
        const out = [];
        for (const ch of s.cf) out.push(ch === 'K' ? crg.shift() || null : ch === 'C' ? cab.shift() || seat.shift() || null : seat.shift() || null);
        return out;
      }
      function cutGeom(w) {
        const e = shipSpr(w.s, w.closed ? 'big' : 'cut');
        const sc = Math.max(1, Math.min(4, Math.floor(Math.min((w.w - 16) / e.w, (w.h - 14) / e.h) * 2) / 2)); // half steps keep big ships large
        const room = (w.w - e.w * sc) / 2;
        const shift = w.s.f && !DS[w.s.d].climb ? Math.max(0, Math.min(room - 6, SPR.plumeBig[DS[w.s.d].f].width * sc / 2)) : 0;
        G.e = e; G.sc = sc; G.ox = Math.round(w.x + room + shift); G.oy = Math.round(w.y + (w.h - (w.closed ? 0 : 12) - e.h * sc) / 2 + 2);
        return G;
      }
      let stars = null;
      function buildStars(v) {
        const cv = document.createElement('canvas'), s = v.scale;
        cv.width = Math.ceil(v.w * s); cv.height = Math.ceil(360 * s);
        const x = cv.getContext('2d');
        let seed = 11;
        const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < v.w * 0.6; i++) {
          x.fillStyle = r() < 0.15 ? '#e9ecff' : r() < 0.5 ? '#4a5288' : '#2a3363';
          const z = (r() < 0.1 ? 2 : 1) * s;
          x.fillRect(Math.floor(r() * v.w * s), Math.floor(r() * 360 * s), z, z);
        }
        stars = cv;
      }
      buildSprites();
      buildStars(api.view);

      // ---- widgets: rebuilt only when something changes (layout()), drawn every redraw
      let W = [], LS = [], layer = 0, PW = 300;
      const Y0 = 28, Y1 = 318, TABY = 320;
      function add(o) { o.l = layer; if (o.ls === undefined) o.ls = -1; W.push(o); return o; }
      function btn(x, y, w, h, k, label, on, o) { return add(Object.assign({ ty: 'btn', x, y, w, h, k, label, on, f: 1 }, o)); }
      function txt(x, y, s, font, col, al) { return add({ ty: 'txt', x, y, s, font, col, al: al || 'left' }); }
      function pan(x, y, w, h) { return add({ ty: 'pan', x, y, w, h }); }
      function bar(x, y, w, h, v, col) { return add({ ty: 'bar', x, y, w, h, v: Math.max(0, Math.min(1, v)), col }); }
      function list(key, x, y, w, h) {
        const L = { key, x, y, w, h, sc: ui.scroll[key] || 0, max: 0 };
        LS.push(L);
        return LS.length - 1;
      }
      function row(li, i, rh, k, o) {
        const L = LS[li];
        L.max = Math.max(L.max, (i + 1) * rh - L.h);
        return add(Object.assign({ ty: 'row', x: L.x, y: L.y + i * rh, w: L.w, h: rh - 4, k, ls: li, f: 1 }, o));
      }
      let wrapCtx = null;
      function wrap(s, font, w) {
        if (!wrapCtx) wrapCtx = document.createElement('canvas').getContext('2d');
        wrapCtx.font = font;
        const out = [];
        for (const para of s.split('\n')) {
          let line = '';
          for (const word of para.split(' ')) {
            const t = line ? line + ' ' + word : word;
            if (wrapCtx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
          }
          out.push(line);
        }
        return out;
      }
      function para(x, y, w, s, font, col, lh) {
        const lines = wrap(s, font || FONT.b, w);
        add({ ty: 'para', x, y, lines, font: font || FONT.b, col: col || C.text, lh: lh || 17 });
        return y + lines.length * (lh || 17);
      }
      const rx = w => w.m ? w.x - ui.cam.x : w.x;
      const ry = w => w.ls >= 0 ? w.y - LS[w.ls].sc : w.y;
      const top = () => ui.stack[ui.stack.length - 1];

      function layout() {
        W = []; LS = []; layer = 0; ui.live = false;
        const v = api.view, m = top();
        PW = Math.min(310, Math.round(v.w * 0.56));
        hud(v);
        tabs(v, !!m && m.ty !== 'port');
        if (!m || m.ty === 'port') {
          if (ui.tab === 0) mapWidgets(v); else if (ui.tab === 1) fleetTab(v); else if (ui.tab === 2) hangarTab(v);
          else if (ui.tab === 3) rdTab(v); else if (ui.tab === 4) projTab(v); else statsTab(v);
        }
        if (m) { layer = 1; MODALS[m.ty](v, m); }
        for (const L of LS) { L.max = Math.max(0, L.max); L.sc = Math.max(0, Math.min(L.sc, L.max)); }
        const fl = W.filter(w => w.f && w.l === layer);
        if (!fl.some(w => w.k === ui.fk)) { const pref = fl.find(w => w.k === 'n' + c.hq) || fl.find(w => w.ty !== 'tab' && w.k !== 'close') || fl[0]; ui.fk = pref ? pref.k : ''; }
        ensureVisible(false);
        ui.dirty = false;
      }
      function hud(v) {
        add({ ty: 'hud' });
      }
      function tabs(v, inert) {
        const tw = (v.w - 8) / TABS.length;
        for (let i = 0; i < TABS.length; i++) {
          let badge = '';
          if (i === 1) { const idle = c.sh.filter(s => !s.f && s.st === 0 && !s.rt).length; if (idle) badge = String(idle); }
          if (i === 3 && c.res.length < SIM.resSlots(c) && TECH.some(T => SIM.techState(c, T.k) === 'ok' && c.rp >= T.rp)) badge = '!';
          add({ ty: 'tab', x: 4 + i * tw, y: TABY, w: tw - 3, h: 38, k: 'tab' + i, label: TABS[i], on: () => setTab(i), f: inert ? 0 : 1, act: ui.tab === i, badge });
        }
      }
      function setTab(i) { ui.tab = (i + TABS.length) % TABS.length; ui.stack = []; ui.dirty = true; }

      // ---------------- MAP
      function mapWidgets(v) {
        add({ ty: 'map' });
        for (let n = 0; n < NN; n++) {
          const on = SIM.nodeOn(c, n);
          if (!on && N[n].e > c.era + 1) continue;
          add({ ty: 'node', m: 1, x: N[n].x - 12, y: N[n].y - 12, w: 24, h: 24, k: 'n' + n, n, f: on ? 1 : 0, on: () => openPort(n) });
        }
        // region chips + idle-ship chip (bottom-left / bottom-right of the map)
        let x = 8;
        const regs = REGIONS.filter((R, i) => REGION_ERA[i] <= c.era + 1 && i < 4);
        regs.forEach((R, i) => { btn(x, Y1 - 40, 58, 36, 'reg' + i, R.n.toUpperCase(), () => jumpRegion(i, true), { chip: 1 }); x += 62; });
        btn(x, Y1 - 40, 36, 36, 'help', '?', () => push({ ty: 'help' }), { chip: 1 });
        const idle = c.sh.filter(s => !s.f && s.st === 0 && !s.rt);
        if (idle.length && !top()) btn(v.w - 150, Y1 - 40, 142, 36, 'idle', `IDLE SHIPS ${idle.length}`, nextIdle, { chip: 1, hot: 1, sub: 'X' });
      }
      // move the camera to a region; the highlight follows to its busiest node unless a chip was pressed
      function jumpRegion(i, keepFocus) {
        ui.region = i;
        ui.cam.tx = Math.max(-40, Math.min(MAP_X1 - api.view.w + 40, REGIONS[i].cx));
        if (!keepFocus) {
          let best = -1;
          for (let n = 0; n < NN; n++) if (N[n].r === i && SIM.nodeOn(c, n) && (best < 0 || (c.P[n] && !c.P[best]))) best = n;
          if (best >= 0) ui.fk = 'n' + best;
        }
        ui.dirty = true;
      }
      function centerOn(n, snap) {
        const vw = api.view.w - (top() && top().ty === 'port' ? PW : 0);
        ui.cam.tx = Math.max(-40, Math.min(MAP_X1 - api.view.w + 40, N[n].x - vw / 2));
        if (snap) ui.cam.x = ui.cam.tx;
      }
      function openPort(n) {
        ui.tab = 0;
        ui.stack = [{ ty: 'port', n }];
        centerOn(n);
        ui.fk = '';
        ui.dirty = true;
      }
      function nextIdle() {
        const idle = c.sh.filter(s => !s.f && s.st === 0 && !s.rt);
        if (!idle.length) { toast('No idle ships', C.muted); return; }
        ui.idleI = ((ui.idleI || 0) + 1) % idle.length;
        const s = idle[ui.idleI];
        ui.tab = 0; ui.stack = [{ ty: 'port', n: s.at }, { ty: 'ship', s: s.i }];
        centerOn(s.at); ui.dirty = true;
      }
      function push(m) { ui.stack.push(m); ui.fk = ''; ui.dirty = true; }
      function pop() { ui.stack.pop(); ui.fk = ui.backFk || ''; ui.backFk = ''; ui.dirty = true; }

      // ---------------- MODALS
      const MODALS = {};
      function fullPanel(v, title, sub) {
        pan(8, Y0, v.w - 16, Y1 - Y0);
        txt(20, Y0 + 10, title, FONT.h, C.amber);
        if (sub) txt(20, Y0 + 32, sub, FONT.s, C.muted);
        btn(v.w - 124, Y0 + 6, 60, 32, 'close', 'BACK', pop, { chip: 1 }); // clear of the shell's pause button
      }
      MODALS.port = (v, m) => {
        const n = m.n, P = c.P[n], X = v.w - PW, nd = N[n];
        pan(X, Y0, PW - 6, Y1 - Y0);
        const kind = { pad: 'LAUNCH PAD', orb: 'ORBITAL STATION', base: 'SURFACE BASE', rock: 'ASTEROID PORT', site: 'BUILD SITE' }[nd.t];
        txt(X + 12, Y0 + 10, nd.n, FONT.h, P ? C.amber : C.text);
        txt(X + 12, Y0 + 31, `${P && P.st ? 'YOUR STATION' : kind} · ${REGIONS[nd.r].n.toUpperCase()}${nd.w ? ' · WELL ' + nd.w : ''}`, FONT.s, C.muted);
        btn(X + PW - 124, Y0 + 6, 60, 32, 'close', 'CLOSE', pop, { chip: 1 });
        let y = Y0 + 46;
        if (!SIM.nodeOn(c, n)) { para(X + 12, y, PW - 30, `Opens in Era ${ROMAN[nd.e]}.`, FONT.b, C.muted); return; }
        const fuel = Math.round(nd.fp * (P && P.isru ? 0.4 : 1));
        if (P) {
          txt(X + 12, y, `BERTHS ${SIM.dockedAt(c, n)}/${SIM.berths(c, n)} · ${P.dep ? 'FUEL ' + fuel + '/T' : 'NO DEPOT'}${P.tier ? ' · ' + DEV[P.tier - 1].n.toUpperCase() : ''}${c.hq === n ? ' · HQ' : ''}`, FONT.s, C.text);
          y += 16;
          const here = c.sh.filter(s => !s.f && s.at === n);
          const li = list('port' + n, X + 8, y, PW - 22, Y1 - y - 92);
          here.forEach((s, i) => row(li, i, 40, 'ps' + s.i, { shipObj: s, title: s.nm, sub: `${D(s).n} · ${s.st === 2 ? 'HOLDING (NO BERTH)' : s.rt ? 'ROUTINE' : 'DOCKED'}`, right: `${s.ld.length}/${s.cf.length}`, on: () => push({ ty: 'ship', s: s.i }) }));
          if (!here.length) txt(X + 14, y + 8, 'No ships here.', FONT.bs, C.muted);
          const bw = (PW - 30) / 2, by = Y1 - 84;
          const jobs = P.bd.length + P.hd.length;
          btn(X + 8, by, bw, 38, 'board', `JOBS ${jobs}`, () => push({ ty: 'board', n }));
          btn(X + 14 + bw, by, bw, 38, 'upg', 'UPGRADES', () => push({ ty: 'upg', n }));
          if (P.st && P.cf >= 1) btn(X + 8, by + 42, PW - 22, 38, 'collect', `COLLECT CR ${cr(P.cf)}`, () => { const got = SIM.collect(c, n, now); toast(`Collected CR ${cr(got)}`, C.good); api.sfx.tone({ f: 880, to: 1320, d: 0.15, v: 0.06, type: 'triangle' }); }, { hot: 1 });
          else {
            const pk = c.pj.elev && !c.done.elev && n === PROJ.elev.site ? 'elev' : c.pj.yards && !c.done.yards && n === PROJ.yards.site ? 'yards' : '';
            if (pk) { txt(X + 12, by + 48, `${PROJ[pk].n.toUpperCase()} ${c.pj[pk].got}/${c.pj[pk].need}`, FONT.s, C.rose); bar(X + 12, by + 62, PW - 30, 6, c.pj[pk].got / c.pj[pk].need, C.rose); }
            else if (P.dn) { txt(X + 12, by + 48, `${DEV[P.tier].n.toUpperCase()} ${P.dv}/${P.dn} DELIVERED`, FONT.s, C.cyan); bar(X + 12, by + 62, PW - 30, 6, P.dv / P.dn, C.cyan); }
            else if (P.st) txt(X + 12, by + 52, `INCOME ${cr(SIM.stationIncome(n, P))}/H · OPEN UPGRADES FOR SERVICES`, FONT.s, C.muted);
          }
          return;
        }
        if (nd.t === 'site') {
          const ss = SIM.siteState(c, n);
          y = para(X + 12, y, PW - 30, `An empty spot for a station of your own. Found it, then deliver ${nd.kits} station kits from nearby ports. Then add services: depot, layover hab, repair dock, trade post.`, FONT.bs, C.muted, 15) + 6;
          if (ss === 'busy') { const st = c.site[n]; txt(X + 12, y + 4, `KITS DELIVERED ${st.got}/${st.need}`, FONT.l, C.cyan); bar(X + 12, y + 22, PW - 30, 6, st.got / st.need, C.cyan); }
          else btn(X + 8, Y1 - 46, PW - 22, 40, 'found', ss === 'tech' ? `NEEDS ${TECH[TI[nd.need || 'kits']].n.toUpperCase()}` : `FOUND STATION · CR ${cr(nd.c)}`,
            () => confirm(`Found a station at ${nd.n} for CR ${cr(nd.c)}? Kit jobs will appear at nearby ports.`, () => { if (SIM.foundSite(c, n, now)) toast('Station kits posted to nearby boards', C.good); else toast('License a nearby port first', C.rose); }),
            { dis: ss !== 'ok' || c.cr < nd.c, hot: 1 });
          return;
        }
        y = para(X + 12, y, PW - 30, portBlurb(n), FONT.bs, C.muted, 15) + 4;
        txt(X + 12, y, `FUEL ${nd.fp}/T · ${nd.b} BERTH${nd.b > 1 ? 'S' : ''}${nd.dep ? ' · DEPOT' : ''}`, FONT.s, C.text);
        btn(X + 8, Y1 - 46, PW - 22, 40, 'lic', `LICENSE · CR ${cr(nd.c)}`, () => { if (SIM.license(c, n, now)) api.sfx.tone({ f: 523, to: 784, d: 0.2, v: 0.07, type: 'triangle' }); }, { dis: c.cr < nd.c, hot: 1, why: 'Not enough credits' });
      };
      function portBlurb(n) {
        const tg = N[n].tg, bits = [];
        if (tg & T_E) bits.push('Launch pad: lifters carry satellites, crew and freight up the well.');
        if (tg & T_LU) bits.push('Lunar surface: helium-3 and regolith.');
        if (tg & T_ICE) bits.push('Ice nearby: water and propellant.');
        if (tg & T_ORE) bits.push('Ore and metals.');
        if (tg & T_TOUR) bits.push('Tourists love it.');
        if (tg & T_SCI) bits.push('Scientists come here.');
        if (tg & T_HUB) bits.push('A busy hub.');
        if (N[n].w >= 2) bits.push(`Needs a lander rated for well ${N[n].w}.`);
        return bits.join(' ') || 'A quiet port.';
      }
      function confirm(text, yes) { push({ ty: 'confirm', text, yes }); }
      MODALS.confirm = (v, m) => {
        const w = Math.min(420, v.w - 40), x = (v.w - w) / 2, y = 90;
        pan(x, y, w, 160);
        para(x + 16, y + 16, w - 32, m.text, FONT.b, C.text);
        btn(x + 16, y + 108, (w - 44) / 2, 40, 'yes', 'YES', () => { pop(); m.yes(); }, { hot: 1 });
        btn(x + 28 + (w - 44) / 2, y + 108, (w - 44) / 2, 40, 'no', 'NO', pop);
      };
      MODALS.board = (v, m) => {
        const P = c.P[m.n];
        fullPanel(v, `${N[m.n].n} job board`, `${P.bd.length} JOBS · ${P.hd.length} WAITING TO TRANSFER · BOARD REFILLS EVERY ${TUNE.refillMs / MIN} MIN`);
        const li = list('board' + m.n, 16, Y0 + 46, v.w - 32, Y1 - Y0 - 54);
        P.bd.concat(P.hd).sort((a, b) => a.d - b.d || b.p - a.p).forEach((j, i) => row(li, i, 40, 'j' + j.i, { job: j, title: '→ ' + N[j.d].n, sub: jobLine(j) + (P.hd.includes(j) ? ' · TRANSFER' : '') + (j.x ? ' · ' + tm(j.x - now) : ''), right: 'CR ' + cr(j.p), on: () => toast('Open a docked ship to load jobs', C.muted) }));
        ui.live = true;
      };
      MODALS.ship = (v, m) => {
        const s = ship(m.s);
        if (!s) { ui.stack.pop(); return; }
        const Dz = D(s), sl = SIM.slotsOf(s), at = N[s.at];
        const where = s.f ? `EN ROUTE TO ${N[s.f.to].n.toUpperCase()}` : `${s.st === 2 ? 'HOLDING AT' : 'DOCKED AT'} ${at.n.toUpperCase()}`;
        fullPanel(v, s.nm, `${Dz.n.toUpperCase()} · ${FAM[Dz.f].toUpperCase()} · ${where}`);
        const cap = SIM.shipFuel(s), fuelFrac = cap ? (s.f ? s.fu : (SIM.depotAt(c, s.at) ? cap : s.fu)) / cap : 0;
        txt(v.w - 290, Y0 + 10, `ΔV ${SIM.dvCap(c, s).toFixed(1)}`, FONT.l, C.cyan);
        txt(v.w - 290, Y0 + 27, 'FUEL', FONT.s, C.muted);
        bar(v.w - 256, Y0 + 28, 110, 6, fuelFrac, C.cyan);
        // the ship front and center, cut away to show who and what is aboard
        const band = add({ ty: 'cut', x: 16, y: Y0 + 44, w: v.w - 32, h: s.f ? 150 : 120, s, sj: slotJobs(s) });
        if (s.rt) routineInfo(s, 24, Y0 + 46, v);
        const yb = Y0 + (s.f ? 200 : 170), bx = v.w - 166, bw = 73;
        if (s.f) {
          const L = s.f.L, stops = [N[L[0]].k];
          for (let i = 0; i < L.length; i += 5) stops.push(N[L[i + 1]].k);
          let y = para(20, yb - 4, bx - 40, `Route ${stops.join(' → ')}. Arrives in ${tm(s.f.arr - now)}.${s.f.tow ? ' (Under tow.)' : ''}`, FONT.b, C.text);
          bar(20, y + 4, bx - 40, 6, (now - s.f.t0) / (s.f.arr - s.f.t0), C.amber);
          y += 18;
          if (s.ld.length) para(20, y, bx - 40, 'Aboard: ' + s.ld.map(j => `${JT[j.t].n} → ${N[j.d].n}`).join(', '), FONT.bs, C.muted, 15);
          btn(bx, yb + 44, 150, 40, 'up', 'UPGRADES', () => push({ ty: 'shipup', s: s.i }));
          btn(bx, yb, 150, 40, 'locate', 'SHOW ON MAP', () => { ui.stack = []; ui.tab = 0; const p = shipXY(s, now); ui.cam.tx = Math.max(-40, Math.min(MAP_X1 - v.w + 40, p.x - v.w / 2)); }, { hot: 1 });
          ui.live = true;
          return;
        }
        const P = c.P[s.at];
        let k = 0;
        const B = (key, label, on, o) => { btn(bx + (k % 2) * (bw + 4), yb + Math.floor(k / 2) * 44, bw, 40, key, label, on, Object.assign({ chip: 1 }, o)); k++; };
        B('fly', s.ld.length ? 'FLY ▶' : 'FLY EMPTY', () => push({ ty: 'dest', s: s.i, mode: 'fly' }), { hot: 1 });
        if (P && s.st === 0) B('auto', 'AUTO LOAD', () => autoLoad(s));
        else if (s.at !== c.hq) B('tow', 'TOW TO HQ', () => confirm(`Tow ${s.nm} to ${N[c.hq].n}? Free, takes 10 minutes. Cancels its routine.`, () => SIM.tow(c, s, now)));
        if (SIM.has(c, 'plan')) {
          if (s.rt) B('rtstop', 'STOP LOOP', () => { s.rt = null; s.wt = 0; toast('Routine stopped', C.muted); });
          else B('rt', 'ROUTINE', () => push({ ty: 'dest', s: s.i, mode: 'rt' }));
        }
        B('up', 'UPGRADE', () => push({ ty: 'shipup', s: s.i }));
        if (!P) { para(20, yb, bx - 40, `${at.n} is not one of your ports, so ${s.nm} can't load here. Fly to one of your ports.`, FONT.b, C.muted); return; }
        if (s.st === 2) { para(20, yb, bx - 40, `All ${SIM.berths(c, s.at)} berths at ${at.n} are taken, so ${s.nm} is holding in orbit and can't load. Buy more berths, or move a ship.`, FONT.b, C.muted); return; }
        const li = list('ship' + s.i, 16, yb, bx - 26, Y1 - yb - 4);
        const avail = P.bd.concat(P.hd).sort((a, b) => a.d - b.d || b.p - a.p);
        const rows = s.ld.slice().sort((a, b) => a.d - b.d).concat(avail);
        const lc = SIM.loadCount(s);
        rows.forEach((j, i) => {
          const on = s.ld.includes(j), pax = JT[j.t].p;
          const full = !on && (pax ? lc.pax >= sl.S + sl.C : lc.crg >= sl.K);
          row(li, i, 40, 'j' + j.i, { job: j, sel: on, title: '→ ' + N[j.d].n, sub: jobLine(j) + (j.v ? ' · DUE ' + tm(j.da ? j.da - now : j.dl) : '') + (on ? '' : P.hd.includes(j) ? ' · TRANSFER' : ''),
            right: 'CR ' + cr(on ? SIM.payOf(c, s, j, now) : j.p), dim: full, on: () => toggleJob(s, j) });
        });
        if (!rows.length) txt(24, yb + 8, 'No jobs here right now. Boards refill every few minutes.', FONT.bs, C.muted);
        // each slot in the cutaway: A or tap unloads its job; on an empty slot it jumps to the job list
        const g = cutGeom(band);
        g.e.slots.forEach((q, i) => {
          const j = band.sj[i];
          add({ ty: 'slot', x: g.ox + q.x * g.sc, y: g.oy + g.e.iy0 * g.sc, w: q.w * g.sc, h: (g.e.iy1 - g.e.iy0) * g.sc, k: 'sl' + i, f: 1,
            on: () => {
              if (j) { SIM.unloadJob(c, s, j); api.sfx.tone({ f: 330, d: 0.05, v: 0.05 }); return; }
              const r = W.find(w => w.ty === 'row' && w.ls === li && !w.dim && !w.sel);
              if (r) ui.fk = r.k; else toast('No jobs that fit this slot', C.muted);
            } });
        });
        ui.live = true;
      };
      MODALS.shipup = (v, m) => {
        const s = ship(m.s);
        if (!s) { ui.stack.pop(); return; }
        const Dz = D(s), here = SIM.canUpgradeHere(c, s), f = Dz.f;
        fullPanel(v, `${s.nm} upgrades`, here ? `AT ${N[s.at].n.toUpperCase()} · ${FAM[f].toUpperCase()} PARTS: HULL ${c.parts[f * 3]} · DRIVE ${c.parts[f * 3 + 1]} · SYSTEMS ${c.parts[f * 3 + 2]}`
          : 'DOCK AT ONE OF YOUR SHIPYARDS (OR RESEARCH MODULAR HULLS) TO UPGRADE');
        add({ ty: 'cut', x: 16, y: Y0 + 44, w: v.w - 32, h: 72, s, closed: 1 });
        const li = list('shipup' + s.i, 16, Y0 + 122, v.w - 32, Y1 - Y0 - 126);
        const dvOf = q => { const dry = SIM.shipDry(q) + SIM.loadMass(q.ld), fu = SIM.shipFuel(q); return fu ? SIM.veOf(c, Dz) * Math.log((dry + fu) / dry) : 0; };
        const next = k => { const q = Object.assign({}, s, { u: s.u.slice() }); q.u[k]++; return q; };
        const eff = [
          () => `ΔV ${dvOf(s).toFixed(1)} → ${dvOf(next(0)).toFixed(1)} WITH A FULL TANK`,
          () => `THRUST +${s.u[1] * 10}% → +${(s.u[1] + 1) * 10}%: FASTER HARD BURNS`,
          () => `${s.cf.length} → ${s.cf.length + 1} SLOTS (NEW CARGO MODULE, REFIT IT IF YOU LIKE)`,
          () => `PASSENGER FARES +${s.u[3] * 8}% → +${(s.u[3] + 1) * 8}%`
        ];
        let i = 0;
        SIM.SHIP_UP.forEach((U, k) => {
          const blk = SIM.shipUpBlock(c, s, k), q = SIM.shipUpCost(c, s, k), maxed = s.u[k] >= U.max;
          const na = (k === 2 && (Dz.fx || Dz.climb)) || (k === 3 && !/[SC]/.test(s.cf));
          row(li, i++, 40, 'su' + k, { title: `${U.n} ${s.u[k]}/${U.max}`, sub: na ? blk.toUpperCase() : maxed ? 'FULLY UPGRADED' : eff[k](),
            right: maxed ? 'MAX' : na ? 'N/A' : `CR ${cr(q.cr)} + ${q.n} ${PART[q.part % 3].toUpperCase()}`, dim: !!blk, hot: !blk, sel: maxed,
            on: () => {
              if (blk) { toast(blk, C.rose); return; }
              if (SIM.upgradeShip(c, s, k)) { toast(`${U.n} upgraded`, C.good); api.sfx.tone({ f: 500, to: 900, d: 0.2, v: 0.06, type: 'triangle' }); }
            } });
        });
        row(li, i++, 40, 'liv', { title: 'Livery', sub: here ? `REPAINT FOR CR ${cr(SIM.liveryCost(s))} · A / TAP FOR THE NEXT COLOUR` : 'REPAINT AT A SHIPYARD', swatch: SIM.LIVERY[s.lv], dim: !here,
          on: () => { if (!here) toast('Dock at a shipyard to repaint', C.rose); else if (SIM.setLivery(c, s, (s.lv + 1) % SIM.LIVERY.length)) api.sfx.tone({ f: 700, d: 0.06, v: 0.05 }); else toast('Not enough credits', C.rose); } });
        if (!Dz.fx) row(li, i++, 40, 'refit', { title: 'Refit slots', sub: 'SWAP SEATS, CARGO RACKS AND CABINS', dim: !SIM.canRefitHere(c, s) || s.ld.length > 0,
          on: () => { if (!SIM.canRefitHere(c, s)) toast('Dock at a shipyard (or research Modular Hulls)', C.rose); else if (s.ld.length) toast('Unload first', C.rose); else push({ ty: 'refit', s: s.i, cfg: s.cf }); } });
        if (!s.f && s.at !== c.hq) row(li, i++, 40, 'tow', { title: 'Tow to HQ', sub: 'FREE · 10 MINUTES · CANCELS ITS ROUTINE',
          on: () => confirm(`Tow ${s.nm} to ${N[c.hq].n}? Free, takes 10 minutes. Cancels its routine.`, () => { SIM.tow(c, s, now); ui.stack = ui.stack.filter(q => q.ty !== 'shipup'); }) });
        const val = Math.round(Dz.cost * TUNE.sellBack + (s.sp || 0) * 0.5), sellBlk = s.f ? 'Land first' : s.ld.length ? 'Unload first' : c.sh.length <= 1 ? 'You need at least one ship' : '';
        row(li, i++, 40, 'sell', { title: 'Sell ship', sub: sellBlk ? sellBlk.toUpperCase() : 'GONE FOR GOOD (UPGRADES RETURN HALF THEIR COST)', right: 'CR ' + cr(val), dim: !!sellBlk,
          on: () => {
            if (sellBlk) { toast(sellBlk, C.rose); return; }
            confirm(`Sell ${s.nm} for CR ${cr(val)}?`, () => { if (SIM.sellShip(c, s)) { ui.stack = ui.stack.filter(q => q.ty !== 'ship' && q.ty !== 'shipup'); toast(`${s.nm} sold`, C.muted); } });
          } });
      };
      function routineInfo(s, x, y, v) {
        if (!s.rt) return;
        const r = s.rt, st = r.ps === 1 ? 'PAUSED (IDLE CAP) · OPEN TO RESUME' : r.ps === 2 ? 'STOPPED (NO ROUTE OR FUNDS)' : s.wt ? 'WAITING FOR JOBS' : 'RUNNING';
        txt(x, y + 4, `ROUTINE ${N[r.a].k} ⇄ ${N[r.b].k} · BURN ${Math.round(r.s * 100)}% · ${st}`, FONT.s, r.ps ? C.rose : C.good);
        if (r.ps === 2) btn(x + 330, y - 6, 80, 26, 'rtgo', 'RESUME', () => { r.ps = 0; s.wt = now; SIM.advance(c, now); }, { chip: 1 });
      }
      function toggleJob(s, j) {
        if (s.ld.includes(j)) { SIM.unloadJob(c, s, j); api.sfx.tone({ f: 330, d: 0.05, v: 0.05 }); }
        else if (SIM.loadJob(c, s, j)) api.sfx.tone({ f: 520, d: 0.05, v: 0.05 });
        else { toast(JT[j.t].p ? 'No free seat' : 'No free cargo slot', C.rose); api.sfx.tone({ f: 140, d: 0.08, v: 0.05 }); }
      }
      function autoLoad(s) {
        const P = c.P[s.at];
        if (!P) return;
        const sr = SIM.search(c, s, now, c.burn), sl = SIM.slotsOf(s), groups = {};
        for (const j of P.bd.concat(P.hd)) (groups[j.d] = groups[j.d] || []).push(j);
        let best = -1, bestV = 0;
        for (const d in groups) {
          if (!SIM.reachable(sr, +d)) continue;
          let pax = sl.S + sl.C, crg = sl.K, v = 0;
          for (const j of groups[d].sort((a, b) => b.p - a.p)) if (JT[j.t].p ? pax-- > 0 : crg-- > 0) v += j.p;
          if (v > bestV) { bestV = v; best = +d; }
        }
        if (best < 0) { toast('Nothing this ship can carry', C.muted); return; }
        for (const j of s.ld.slice()) if (j.d !== best) SIM.unloadJob(c, s, j);
        for (const j of groups[best].sort((a, b) => b.p - a.p)) if (SIM.canCarry(s, j)) SIM.loadAndCheck(c, s, j, best);
        api.sfx.tone({ f: 520, to: 780, d: 0.1, v: 0.05 });
      }
      MODALS.dest = (v, m) => {
        const s = ship(m.s);
        if (!s || s.f) { ui.stack.pop(); return; }
        fullPanel(v, m.mode === 'rt' ? `Routine: ${N[s.at].k} ⇄ ?` : `Fly ${s.nm} to…`, m.mode === 'rt' ? 'PICK THE OTHER END OF THE LOOP. THE SHIP AUTO-LOADS JOBS FOR EACH END.' : 'ROUTES REFUEL AT YOUR DEPOTS · TIMES AT YOUR LAST BURN SETTING');
        if (!m.sr || m.srAt < now - 20000) { m.sr = SIM.search(c, s, now, c.burn); m.srAt = now; }
        const cand = [];
        for (let n = 0; n < NN; n++) {
          if (n === s.at || !SIM.nodeOn(c, n)) continue;
          const aboard = s.ld.filter(j => j.d === n);
          if (!c.P[n] && !c.site[n] && !aboard.length && !(c.pj.elev && !c.done.elev && n === PROJ.elev.site) && !(c.pj.yards && !c.done.yards && n === PROJ.yards.site)) continue;
          let best = Infinity;
          for (let b = 0; b <= SIM.NB; b++) best = Math.min(best, m.sr.dist[n * (SIM.NB + 1) + b]);
          cand.push({ n, aboard, best });
        }
        cand.sort((a, b) => (b.aboard.length - a.aboard.length) || (a.best - b.best));
        const li = list('dest' + s.i, 16, Y0 + 46, v.w - 32, Y1 - Y0 - 54);
        cand.forEach((q, i) => {
          const ok = q.best < Infinity, pay = q.aboard.reduce((a, j) => a + j.p, 0);
          row(li, i, 40, 'd' + q.n, { node: q.n, title: N[q.n].n, sub: `${REGIONS[N[q.n].r].n.toUpperCase()}${q.aboard.length ? ` · ${q.aboard.length} JOB${q.aboard.length > 1 ? 'S' : ''} ABOARD · CR ${cr(pay)}` : ''}${c.site[q.n] ? ' · STATION SITE' : ''}${!c.P[q.n] ? ' · NO BERTHS' : ''}`,
            right: ok ? '≈' + tm(q.best) : 'OUT OF RANGE', dim: !ok, on: () => { if (!ok) { toast('Out of range: needs depots on the way, or a different ship', C.rose); return; } push({ ty: 'plan', s: s.i, to: q.n, mode: m.mode, b: c.burn }); } });
        });
        if (!cand.length) txt(24, Y0 + 60, 'License more ports to fly somewhere.', FONT.bs, C.muted);
      };
      MODALS.plan = (v, m) => {
        const s = ship(m.s);
        if (!s || s.f) { ui.stack.pop(); return; }
        const pl = m.pl = SIM.planRoute(c, s, m.to, m.b, now);
        fullPanel(v, `${s.nm} → ${N[m.to].n}`, pl ? 'ROUTE ' + pl.route.map(n => N[n].k).join(' → ') : 'NO ROUTE');
        if (!pl) { para(20, Y0 + 60, v.w - 60, 'This ship cannot reach there from here with this load. It may be too heavy for the climb, need a depot on the way, or need a lander rated for that gravity well.', FONT.b, C.rose); return; }
        const y = Y0 + 50;
        txt(20, y + 4, 'EFFICIENT', FONT.s, C.muted);
        txt(v.w - 20, y + 4, 'HARD BURN', FONT.s, C.muted, 'right');
        add({ ty: 'slider', x: 20, y: y + 16, w: v.w - 40, h: 34, k: 'burn', f: 1, v: m.b, eff: pl.sEff, cap: pl.paxCapped ? 0.75 : 1 });
        const prof = pl.space ? (pl.sEff < 0.2 ? 'BURN · LONG COAST · BURN' : pl.sEff > 0.9 ? 'BURN · FLIP · BURN' : 'BURN · COAST · BURN') : 'FIXED ASCENT / DESCENT: THE BURN SETTING DOES NOT CHANGE IT';
        txt(20, y + 58, `${prof}${pl.limited ? ' · FUEL-LIMITED' : ''}${pl.paxCapped ? ' · PASSENGERS LIMIT G (HI-G COUCHES)' : ''}`, FONT.s, pl.limited ? C.rose : C.cyan);
        const cols = [['TIME', tm(pl.dur), C.text], ['FUEL', 'CR ' + cr(pl.fuelCr), C.text], ['UPKEEP', 'CR ' + cr(pl.up), C.text],
          ['REVENUE', 'CR ' + cr(pl.rev), C.text], ['PROFIT', 'CR ' + cr(pl.profit), pl.profit >= 0 ? C.good : C.rose]];
        const cw = (v.w - 40) / cols.length;
        cols.forEach((q, i) => { txt(20 + i * cw, y + 78, q[0], FONT.s, C.muted); txt(20 + i * cw, y + 92, q[1], FONT.l, q[2]); });
        let yy = y + 116;
        txt(20, yy, `ΔV ${pl.dv.toFixed(1)} OF ${SIM.dvCap(c, s).toFixed(1)} IN THE TANK · ${pl.route.length - 2 > 0 ? (pl.route.length - 2) + ' STOP(S)' : 'DIRECT'}`, FONT.s, C.muted);
        yy += 16;
        const vips = s.ld.filter(j => j.v && pl.arrAt[j.d] !== undefined);
        for (const j of vips.slice(0, 3)) {
          const due = (j.da || now + j.dl) - now, ok = pl.arrAt[j.d] <= due;
          txt(20, yy, `VIP ${JT[j.t].n.toUpperCase()} → ${N[j.d].k}: DUE ${tm(due)}, ARRIVES ${tm(pl.arrAt[j.d])} ${ok ? '✓' : '· LATE (PAYS LESS)'}`, FONT.s, ok ? C.good : C.rose);
          yy += 14;
        }
        const notHere = s.ld.filter(j => pl.arrAt[j.d] === undefined).length;
        if (notHere) { txt(20, yy, `${notHere} JOB(S) AREN'T FOR THIS ROUTE: THEY WILL WAIT AT ${N[m.to].k} FOR A TRANSFER`, FONT.s, C.amber); yy += 14; }
        const ok = SIM.canAfford(c, pl);
        btn(20, Y1 - 48, 160, 40, 'go', m.mode === 'rt' ? 'START ROUTINE' : 'LAUNCH', () => {
          if (m.mode === 'rt') { s.rt = { a: s.at, b: m.to, s: m.b, ps: 0 }; c.burn = m.b; SIM.routineStep(c, s, now); }
          else if (!SIM.launch(c, s, pl, now)) { toast('Not enough credits for fuel', C.rose); return; }
          c.burn = m.b;
          ui.stack = ui.stack.filter(q => q.ty === 'port');
          if (ui.stack.length) ui.stack[0].n = s.f ? ui.stack[0].n : s.at;
          ui.dirty = true;
        }, { hot: 1, dis: !ok, why: 'Not enough credits for fuel' });
        txt(196, Y1 - 34, 'LEFT/RIGHT: BURN · L/R: BIG STEPS', FONT.s, C.dim);
      };
      MODALS.refit = (v, m) => {
        const s = ship(m.s);
        if (!s) { ui.stack.pop(); return; }
        fullPanel(v, `Refit ${s.nm}`, 'TAP A SLOT TO CYCLE: SEAT → CARGO' + (SIM.has(c, 'cabin') ? ' → CABIN' : '') + ' · PAID PER CHANGED SLOT');
        const n = m.cfg.length, sz = Math.min(48, (v.w - 60) / n - 6);
        for (let i = 0; i < n; i++) {
          btn(20 + i * (sz + 6), Y0 + 70, sz, sz + 6, 'slot' + i, m.cfg[i] === 'S' ? 'SEAT' : m.cfg[i] === 'C' ? 'CABIN' : 'CARGO', () => {
            const order = SIM.has(c, 'cabin') ? 'SKC' : 'SK', ch = order[(order.indexOf(m.cfg[i]) + 1) % order.length];
            m.cfg = m.cfg.slice(0, i) + ch + m.cfg.slice(i + 1);
          }, { slot: m.cfg[i] });
        }
        const cost = SIM.refitCost(c, s, m.cfg);
        btn(20, Y1 - 48, 200, 40, 'apply', `APPLY · CR ${cr(cost)}`, () => { if (SIM.refit(c, s, m.cfg)) { pop(); toast('Refit done', C.good); } }, { hot: 1, dis: m.cfg === s.cf || c.cr < cost });
      };
      MODALS.upg = (v, m) => {
        const n = m.n, P = c.P[n];
        fullPanel(v, `${N[n].n} upgrades`, `CREDITS ${cr(c.cr)}`);
        const li = list('upg' + n, 16, Y0 + 46, v.w - 32, Y1 - Y0 - 54);
        let i = 0;
        UPG.forEach((U, u) => {
          if (U.ok && !U.ok(c, n) && !U.why) return;
          const lvl = P[U.k], max = U.max(c), cost = SIM.upgCost(c, n, u), allowed = !U.ok || U.ok(c, n);
          const done = lvl >= max;
          row(li, i++, 40, 'u' + u, { title: `${U.n} ${max > 1 ? lvl + '/' + max : done ? '✓' : ''}`, sub: allowed ? U.d : U.why, right: done ? 'MAX' : 'CR ' + cr(cost), dim: done || !allowed,
            on: () => { if (!allowed) toast(U.why, C.rose); else if (done) toast('Already at max', C.muted); else if (SIM.upgrade(c, n, u, now)) api.sfx.tone({ f: 600, to: 900, d: 0.12, v: 0.06 }); else toast('Not enough credits', C.rose); } });
        });
        if (P.st) {
          SVC.forEach((S, k) => {
            const own = P.sv & (1 << k), cost = Math.round(S.cost * TUNE.regionScale[N[n].r]);
            row(li, i++, 40, 'sv' + k, { title: `${S.n} ${own ? '✓' : ''}`, sub: `${S.d} +${cr(S.inc * TUNE.regionScale[N[n].r])}/H`, right: own ? 'OWNED' : 'CR ' + cr(cost), dim: !!own,
              on: () => { if (!own && !SIM.buyService(c, n, k, now)) toast('Not enough credits', C.rose); } });
          });
        } else if (P.tier < DEV.length) {
          const Dv = DEV[P.tier], cost = SIM.devCost(c, n);
          row(li, i++, 40, 'dev', { title: `Develop: ${Dv.n} (${P.tier}/${DEV.length})`, sub: P.dn ? `${P.dv}/${P.dn} deliveries done` : `${Dv.need} deliveries at low pay → +2 jobs, +15% fares, more VIPs here`, right: P.dn ? 'IN PROGRESS' : 'CR ' + cr(cost), dim: !!P.dn,
            on: () => { if (P.dn) return; confirm(`Commission the ${Dv.n} at ${N[n].n} for CR ${cr(cost)}? ${Dv.need} delivery jobs appear at nearby ports. They pay little now, but grow this port for good.`, () => { if (SIM.commissionDev(c, n, now)) toast(`${Dv.n} contracts posted`, C.good); else toast('Not enough credits', C.rose); }); } });
        }
        if (P.yard && c.hq !== n) row(li, i++, 40, 'hq', { title: 'Make HQ', sub: 'New ships roll out here', right: 'FREE', on: () => { c.hq = n; toast(`HQ moved to ${N[n].n}`, C.good); } });
      };
      MODALS.design = (v, m) => {
        const d = m.d, Dz = DS[d], ok = SIM.blueprintOk(c, d);
        fullPanel(v, Dz.n, `${FAM[Dz.f].toUpperCase()} · ERA ${ROMAN[Dz.e]} · ${Dz.d.toUpperCase()}`);
        add({ ty: 'cut', x: 16, y: Y0 + 44, w: v.w - 32, h: 90, s: designShip(d), closed: 1 });
        const ve = SIM.veOf(c, Dz), dv = Dz.fuel ? ve * Math.log((Dz.dry + Dz.fuel) / Dz.dry) : 0;
        const lines = [
          `SLOTS ${Dz.cfg.length} (${Dz.cfg.split('').map(q => q === 'S' ? 'SEAT' : q === 'C' ? 'CABIN' : 'CARGO').join(' ')})${Dz.fx ? ' · FIXED' : ' · REFITTABLE'}`,
          `DRY ${Dz.dry}T · TANK ${Dz.fuel}T · ΔV EMPTY ${dv.toFixed(1)} · THRUST ${(Dz.F / (Dz.dry + Dz.fuel)).toFixed(2)}`,
          `LANDS ON: ${Dz.climb ? 'ELEVATOR ONLY' : ['NOTHING (ORBIT ONLY)', 'ROCKS, CERES', 'LUNA-CLASS MOONS', 'MARS', 'EARTH AND EVERYTHING'][Dz.land]}`,
          `UPKEEP CR ${cr(Dz.up)} PER FLIGHT · PRICE CR ${cr(Dz.cost)}`
        ];
        lines.forEach((q, i) => txt(20, Y0 + 142 + i * 14, q, FONT.s, C.text));
        const need = Dz.rec.map((r, k) => `${c.parts[Dz.f * 3 + k]}/${r} ${PART[k].toUpperCase()}`).join(' · ');
        txt(20, Y0 + 200, `PARTS: ${FAM[Dz.f].toUpperCase()} ${need}`, FONT.s, Dz.rec.every((r, k) => c.parts[Dz.f * 3 + k] >= r) ? C.good : C.muted);
        if (!ok) txt(20, Y0 + 214, `BLUEPRINT: ${Dz.q[0] === '@' ? 'BUILD THE SPACE ELEVATOR' : 'RESEARCH ' + TECH[TI[Dz.q]].n.toUpperCase()}`, FONT.s, C.rose);
        const capOk = SIM.shipCount(c) < SIM.shipCap(c);
        if (!capOk) txt(20, Y0 + 228, `SHIP CAP ${SIM.shipCap(c)} REACHED: LEVEL UP OR SELL A SHIP`, FONT.s, C.rose);
        const fee = Math.round(Dz.cost * TUNE.assembleFee);
        btn(20, Y1 - 48, 200, 40, 'buy', `BUY NEW · CR ${cr(Dz.cost)}`, () => { const s = SIM.buyShip(c, d); if (s) { toast(`${s.nm} delivered to ${N[c.hq].n}`, C.good); pop(); } }, { hot: 1, dis: !ok || !capOk || c.cr < Dz.cost || Dz.e > c.era, why: !capOk ? 'Ship cap reached' : 'Not available' });
        btn(232, Y1 - 48, 260, 40, 'asm', `ASSEMBLE · CR ${cr(fee)} + PARTS · ${TUNE.assembleMin[Dz.e]}M`, () => { if (SIM.assemble(c, d, now)) { toast(`Assembling ${Dz.n} at ${N[c.hq].n}`, C.good); pop(); } }, { dis: !SIM.canAssemble(c, d), why: 'Needs the parts, the fee, a free ship slot and the blueprint' });
      };
      MODALS.help = (v, m) => {
        fullPanel(v, 'Sol: Tycoon', 'HOW TO PLAY');
        let y = Y0 + 50;
        const steps = [
          '1  Tap a port (or move the highlight with the d-pad and press A). Your first ship, a Kestrel capsule, is docked at Kourou.',
          '2  Open the ship and load jobs: tap them, or press AUTO LOAD. Seats carry passengers, cargo racks carry crates. VIP jobs pay 2–5× but have a deadline.',
          '3  Plan the flight and set the burn. An efficient burn coasts and saves fuel; a hard burn arrives sooner. Heavy loads leave less Δv. Ships refuel at depots.',
          '4  Flights run in real time, even while the Deck sleeps. License more ports, research tech, buy ships, and build the Space Elevator to open Era II.'
        ];
        for (const st of steps) y = para(20, y, v.w - 56, st, FONT.b, C.text, 17) + 6;
        btn(20, Y1 - 48, 160, 40, 'ok', fresh ? 'START' : 'OK', pop, { hot: 1 });
      };
      MODALS.away = (v, m) => {
        const a = m.aw;
        fullPanel(v, 'While you were away', tm(m.gap).toUpperCase() + ' AWAY');
        const lines = [`${a.arr} arrivals · ${a.n} deliveries · CR ${cr(a.cr)} earned`];
        if (a.rp >= 1) lines.push(`${Math.round(a.rp)} RP from research payloads`);
        if (a.parts) lines.push(`${a.parts} part(s) found`);
        if (a.lv) lines.push(`${a.lv} level(s) gained: now level ${c.lv}`);
        if (a.res.length) lines.push('Researched: ' + a.res.map(k => TECH[TI[k]].n).join(', '));
        if (a.ps) lines.push(`${a.ps} routine(s) hit the idle cap and paused. They have resumed now.`);
        let y = Y0 + 54;
        for (const q of lines) y = para(20, y, v.w - 56, q, FONT.b, C.text) + 4;
        btn(20, Y1 - 48, 160, 40, 'ok', 'OK', pop, { hot: 1 });
      };
      MODALS.era = (v, m) => {
        fullPanel(v, `Era ${ERA[m.era]}`, 'A NEW ERA');
        para(20, Y0 + 56, v.w - 56, ERA_TEXT[m.era] || '', FONT.b, C.text);
        btn(20, Y1 - 48, 160, 40, 'ok', 'ONWARD', () => { pop(); setTab(0); ui.cam.tx = REGIONS[Math.min(3, m.era - 1)].cx; }, { hot: 1 });
      };

      // ---------------- TABS
      function fleetTab(v) {
        txt(16, Y0 + 6, `FLEET ${c.sh.length}/${SIM.shipCap(c)}${c.craft.length ? ' · ASSEMBLING ' + c.craft.map(q => DS[q.d].n + ' ' + tm(q.at - now)).join(', ') : ''}`, FONT.l, C.muted);
        const li = list('fleet', 8, Y0 + 24, v.w - 16, Y1 - Y0 - 28);
        c.sh.forEach((s, i) => {
          const st = s.f ? `→ ${N[s.f.to].n} · ${tm(s.f.arr - now)}` : s.st === 2 ? `HOLDING AT ${N[s.at].n}` : `DOCKED AT ${N[s.at].n}`;
          const rt = s.rt ? (s.rt.ps ? ' · ROUTINE PAUSED' : ` · ROUTINE ${N[s.rt.a].k}⇄${N[s.rt.b].k}`) : '';
          row(li, i, 40, 'fs' + s.i, { shipObj: s, title: s.nm, sub: `${D(s).n} · ${st}${rt}`, right: `${s.ld.length}/${s.cf.length}`, hot: !s.f && s.st === 0 && !s.rt,
            on: () => { if (s.f) push({ ty: 'ship', s: s.i }); else { ui.tab = 0; ui.stack = [{ ty: 'port', n: s.at }, { ty: 'ship', s: s.i }]; centerOn(s.at); ui.dirty = true; } } });
        });
        ui.live = true;
      }
      function hangarTab(v) {
        ['SHIPYARD', 'MARKET', 'PARTS'].forEach((q, i) => btn(8 + i * 104, Y0 + 2, 100, 32, 'ht' + i, q, () => { ui.hang = i; }, { chip: 1, act: ui.hang === i }));
        const li = list('hang' + ui.hang, 8, Y0 + 40, v.w - 16, Y1 - Y0 - 44);
        if (ui.hang === 0) {
          txt(330, Y0 + 12, `SHIPS ${SIM.shipCount(c)}/${SIM.shipCap(c)}`, FONT.l, C.muted);
          let i = 0;
          DS.forEach((Dz, d) => {
            if (Dz.e > c.era + 1) return;
            const ok = SIM.blueprintOk(c, d) && Dz.e <= c.era;
            row(li, i++, 40, 'ds' + d, { icon: d, title: Dz.n, sub: `${Dz.d} · ${Dz.cfg.length} SLOTS · ${FAM[Dz.f]}`, right: ok ? 'CR ' + cr(Dz.cost) : Dz.e > c.era ? 'ERA ' + ROMAN[Dz.e] : 'LOCKED', dim: !ok, hot: SIM.canAssemble(c, d), on: () => push({ ty: 'design', d }) });
          });
        } else if (ui.hang === 1) {
          txt(330, Y0 + 12, `RESTOCK IN ${tm(c.mk.at - now)}`, FONT.l, C.muted);
          c.mk.of.forEach((o, i) => {
            const t = o.s ? `Used ${DS[o.d].n}` : `${o.n}× ${FAM[(o.p / 3) | 0]} ${PART[o.p % 3]}`;
            const sub = o.s ? `${DS[o.d].d} · delivered to HQ · no blueprint needed` : `${cr(o.pr)} each · list ${cr(SIM.partPrice(o.p))}`;
            row(li, i, 40, 'mk' + i + t, { icon: o.s ? o.d : undefined, part: o.s ? undefined : o.p, title: t, sub, right: 'CR ' + cr(o.s ? o.pr : o.pr * o.n), on: () => { if (SIM.buyOffer(c, i)) api.sfx.tone({ f: 700, d: 0.08, v: 0.06 }); else toast(o.s && SIM.shipCount(c) >= SIM.shipCap(c) ? 'Ship cap reached' : 'Not enough credits', C.rose); } });
          });
          if (!c.mk.of.length) txt(16, Y0 + 50, 'Sold out. New stock soon.', FONT.bs, C.muted);
          ui.live = true;
        } else {
          let i = 0;
          for (let p = 0; p < 9; p++) {
            if ((p / 3 | 0) > c.era - 1 && !c.parts[p]) continue;
            row(li, i++, 40, 'pt' + p, { part: p, title: `${FAM[(p / 3) | 0]} ${PART[p % 3]} × ${c.parts[p]}`, sub: 'A / tap sells one', right: 'SELL ' + cr(SIM.partPrice(p) * 0.5), dim: !c.parts[p], on: () => { if (SIM.sellPart(c, p)) api.sfx.tone({ f: 500, d: 0.06, v: 0.05 }); } });
          }
        }
      }
      function rdTab(v) {
        let x = 8;
        for (let e = 1; e <= 3; e++) { btn(x, Y0 + 2, 74, 32, 're' + e, 'ERA ' + ROMAN[e], () => { ui.rd = e; }, { chip: 1, act: ui.rd === e }); x += 78; }
        btn(x + 6, Y0 + 2, 166, 32, 'grant', `GRANT +10 RP · ${cr(SIM.grantCost(c))}`, () => { const g = SIM.grantCost(c); if (c.cr >= g) { c.cr -= g; c.rp += 10; } else toast('Not enough credits', C.rose); }, { chip: 1 });
        let y = Y0 + 40;
        if (c.res.length) {
          for (const r of c.res) {
            const T = TECH[TI[r.k]];
            txt(16, y, `RESEARCHING ${T.n.toUpperCase()} · ${tm(r.at - now)}`, FONT.s, C.cyan);
            bar(16, y + 11, v.w - 32, 4, (now - r.s) / (r.at - r.s), C.cyan);
            y += 20;
          }
          ui.live = true;
        } else { txt(16, y, `RP ${Math.floor(c.rp)} · LABS EARN RP; SO DO RESEARCH PAYLOADS AND LEVEL-UPS`, FONT.s, C.muted); y += 18; }
        const li = list('rd' + ui.rd, 8, y, v.w - 16, Y1 - y - 4);
        TECH.filter(T => T.e === ui.rd).forEach((T, i) => {
          const st = SIM.techState(c, T.k);
          const right = st === 'done' ? 'DONE ✓' : st === 'busy' ? 'IN LAB' : st === 'era' ? 'ERA ' + ROMAN[T.e] : st === 'prereq' ? 'NEEDS ' + T.q.filter(q => !c.tech[q]).map(q => TECH[TI[q]].n.toUpperCase()).join(', ') : `${T.rp} RP · ${cr(T.cr)} · ${T.m}M`;
          const afford = st === 'ok' && c.rp >= T.rp && c.cr >= T.cr && c.res.length < SIM.resSlots(c);
          row(li, i, 40, 'T' + T.k, { title: (T.key ? '★ ' : '') + T.n, sub: `${BRANCH[T.b].toUpperCase()} · ${T.d}`, right, dim: st !== 'ok', hot: afford, sel: st === 'done',
            on: () => {
              if (st !== 'ok') { toast(st === 'done' ? 'Already researched' : st === 'busy' ? 'In the lab now' : 'Not available yet', C.muted); return; }
              if (c.res.length >= SIM.resSlots(c)) { toast('The lab is busy', C.rose); return; }
              if (c.rp < T.rp) { toast(`Needs ${T.rp} RP (you have ${Math.floor(c.rp)})`, C.rose); return; }
              if (c.cr < T.cr) { toast('Not enough credits', C.rose); return; }
              SIM.research(c, T.k, now); api.sfx.tone({ f: 440, to: 880, d: 0.2, v: 0.06, type: 'triangle' });
            } });
        });
      }
      function projTab(v) {
        const gs = SIM.gateState(c);
        let y = Y0 + 4;
        if (gs) {
          const g = gs.g, pj = c.pj[g.proj];
          txt(16, y, `NEXT: ERA ${ERA[c.era + 1]}`, FONT.l, C.amber);
          y += 18;
          const chk = (okk, s) => `${okk ? '✓' : '·'} ${s}`;
          txt(16, y, chk(gs.lv, `LEVEL ${g.lv} (NOW ${c.lv})`), FONT.s, gs.lv ? C.good : C.text);
          txt(186, y, chk(gs.tech, TECH[TI[g.tech]].n.toUpperCase()), FONT.s, gs.tech ? C.good : C.text);
          txt(386, y, chk(gs.proj, `${PROJ[g.proj].n.toUpperCase()} ${pj ? pj.got + '/' + pj.need : ''}`), FONT.s, gs.proj ? C.good : C.text);
          y += 16;
        } else { txt(16, y, 'ERA IV · OUTER REACH: COMING SOON', FONT.l, C.muted); y += 22; }
        const li = list('proj', 8, y, v.w - 16, Y1 - y - 4);
        let i = 0;
        for (const key of ['elev', 'yards']) {
          const P = PROJ[key], st = SIM.projState(c, key), pj = c.pj[key];
          if (st === 'era' && P.era > c.era + 1) continue;
          row(li, i++, 40, 'pj' + key, { title: P.n, sub: st === 'busy' ? `${pj.got}/${pj.need} ${JT[P.job].n.toLowerCase()}s delivered to ${N[P.site].n}` : P.d,
            right: st === 'done' ? 'BUILT ✓' : st === 'busy' ? `${pj.got}/${pj.need}` : st === 'tech' ? 'NEEDS ' + TECH[TI[P.tech]].n.toUpperCase() : st === 'era' ? 'ERA ' + ROMAN[P.era] : 'CR ' + cr(P.cost),
            hot: st === 'ok' && c.cr >= P.cost, dim: st === 'era' || st === 'tech', sel: st === 'done',
            on: () => {
              if (st !== 'ok') { if (st === 'busy') openPort(P.site); return; }
              confirm(`Commission the ${P.n} for CR ${cr(P.cost)}? ${P.need} ${JT[P.job].n.toLowerCase()} jobs appear at your ports, bound for ${N[P.site].n}.`, () => { if (SIM.commissionProj(c, key, now)) toast(`${P.n} commissioned`, C.good); else toast('Not enough credits, or no source ports', C.rose); });
            } });
        }
        for (const n in c.site) { const st = c.site[n]; row(li, i++, 40, 'site' + n, { title: `${N[n].n} (station)`, sub: 'Station kits being delivered', right: `${st.got}/${st.need}`, on: () => openPort(+n) }); }
        for (let n = 0; n < NN; n++) {
          const P = c.P[n];
          if (P && P.dn) row(li, i++, 40, 'dv' + n, { title: `${N[n].n}: ${DEV[P.tier].n}`, sub: 'Development deliveries', right: `${P.dv}/${P.dn}`, on: () => openPort(n) });
          if (P && P.st) row(li, i++, 40, 'stn' + n, { title: `${N[n].n} (your station)`, sub: P.cf >= 1 ? `Coffers CR ${cr(P.cf)} to collect` : 'Add services in Upgrades', right: `${cr(SIM.stationIncome(n, P))}/H`, hot: P.cf >= 1, on: () => openPort(n) });
        }
        const sites = N.map((q, n) => n).filter(n => N[n].t === 'site' && SIM.nodeOn(c, n) && !c.P[n] && !c.site[n]);
        if (sites.length) row(li, i++, 40, 'sites', { title: 'Build sites', sub: sites.map(n => N[n].n).join(', ') + (SIM.has(c, 'kits') ? '' : ' (research Station Kits)'), right: 'MAP', on: () => openPort(sites[0]) });
      }
      function statsTab(v) {
        const s = c.st;
        const L = [
          ['NET WORTH', 'CR ' + cr(SIM.netWorth(c))], ['LIFETIME EARNINGS', 'CR ' + cr(s.earn)], ['DELIVERIES', s.del], ['PASSENGERS', s.pax],
          ['CARGO MOVED', Math.round(s.ton) + ' T'], ['FLIGHTS', s.flights], ['ΔV BURNED', Math.round(s.dv) + ' KM/S'], ['FUEL BOUGHT', 'CR ' + cr(s.fuel)],
          ['VIP ON TIME / LATE', `${s.vipOk} / ${s.vipLate}`], ['LONGEST FLIGHT', tm(s.longest)], ['STATIONS BUILT', s.built],
          ['PORTS', c.P.filter(Boolean).length], ['FLEET', c.sh.length], ['PLAY TIME', tm(s.play)],
          ['FOUNDED', new Date(c.born).toLocaleDateString()], ['ERA II REACHED', c.ms[1] ? new Date(c.ms[1]).toLocaleDateString() : '—'], ['ERA III REACHED', c.ms[2] ? new Date(c.ms[2]).toLocaleDateString() : '—']
        ];
        const colW = (v.w - 32) / 2, per = Math.ceil(L.length / 2);
        L.forEach((q, i) => {
          const x = 16 + (i >= per ? colW : 0), y = Y0 + 8 + (i % per) * 26;
          txt(x, y, q[0], FONT.s, C.muted);
          txt(x, y + 10, String(q[1]), FONT.l, C.text);
        });
        btn(v.w - 216, Y1 - 44, 200, 38, 'reset', 'FOUND NEW COMPANY', () => confirm('Start over with a brand-new company? This erases the current one.', () => confirm('Really erase everything and start again?', () => {
          c = SIM.newCompany(now); save(); ui.stack = [{ ty: 'help' }]; ui.tab = 0; centerOn(c.hq, true);
        })), { danger: 1 });
      }

      // ---- focus navigation
      function focused() { return W.find(w => w.k === ui.fk && w.f && w.l === layer); }
      function navigate(dx, dy) {
        const cur = focused();
        const cand = W.filter(w => w.f && w.l === layer && w !== cur);
        if (!cur) { if (cand[0]) ui.fk = cand[0].k; return; }
        const cx = rx(cur) + cur.w / 2, cy = ry(cur) + cur.h / 2;
        let best = null, bs = Infinity;
        for (const w of cand) {
          const wx = rx(w) + w.w / 2, wy = ry(w) + w.h / 2, ex = wx - cx, ey = wy - cy;
          const along = ex * dx + ey * dy, side = Math.abs(ex * dy - ey * dx);
          if (along <= 4) continue;
          const sc = along + side * 2.2;
          if (sc < bs) { bs = sc; best = w; }
        }
        if (best) { ui.fk = best.k; ui.pop = 1; api.sfx.tone({ f: 900, d: 0.02, v: 0.02 }); ensureVisible(); }
      }
      function ensureVisible(cam = true) {
        const w = focused();
        if (!w) return;
        if (w.ls >= 0) {
          const L = LS[w.ls], y = w.y - L.y;
          if (y - L.sc < 0) L.sc = y;
          else if (y + w.h - L.sc > L.h) L.sc = y + w.h - L.h;
          L.sc = Math.max(0, Math.min(L.sc, L.max)); ui.scroll[L.key] = L.sc;
        }
        if (w.m && cam) {
          const vw = api.view.w - (top() && top().ty === 'port' ? PW : 0);
          if (w.x - ui.cam.tx < 30) ui.cam.tx = w.x - 60;
          else if (w.x + w.w - ui.cam.tx > vw - 30) ui.cam.tx = w.x + w.w - vw + 60;
          ui.cam.tx = Math.max(-40, Math.min(MAP_X1 - api.view.w + 40, ui.cam.tx));
        }
      }
      function activate(w) {
        if (!w) return;
        ui.pop = 1;
        if (w.dis) { toast(w.why || 'Not available', C.rose); api.sfx.tone({ f: 140, d: 0.08, v: 0.05 }); return; }
        ui.fk = w.k;
        const before = ui.stack.length;
        if (w.on) w.on();
        if (ui.stack.length > before) ui.backFk = w.k;
        api.sfx.tone({ f: 620, d: 0.03, v: 0.03 });
        ui.dirty = true; ui.needSave = true;
      }
      function back() {
        if (ui.stack.length) { pop(); api.sfx.tone({ f: 300, d: 0.04, v: 0.03 }); }
        else if (ui.tab !== 0) setTab(0);
      }
      function hit(x, y, all) {
        for (let i = W.length - 1; i >= 0; i--) {
          const w = W[i];
          if (!w.f || (!all && w.l !== layer && !((w.ty === 'node' || w.ty === 'tab') && top() && top().ty === 'port'))) continue;
          if (w.ls >= 0) { const L = LS[w.ls]; if (y < L.y || y > L.y + L.h) continue; }
          if (w.ty === 'node') continue;
          const X = rx(w), Y = ry(w);
          if (x >= X && x <= X + w.w && y >= Y && y <= Y + w.h) return w;
        }
        // map nodes: nearest within reach (they are small and dense)
        if (ui.tab === 0 && y > Y0 && y < Y1 && (!top() || (top().ty === 'port' && x < api.view.w - PW))) {
          let best = null, bd = 24 * 24;
          for (const w of W) if (w.ty === 'node' && w.f) { const ex = N[w.n].x - ui.cam.x - x, ey = N[w.n].y - y, d = ex * ex + ey * ey; if (d < bd) { bd = d; best = w; } }
          return best;
        }
        return null;
      }
      function listAt(x, y) {
        for (let i = LS.length - 1; i >= 0; i--) { const L = LS[i]; if (x >= L.x && x <= L.x + L.w && y >= L.y && y <= L.y + L.h) return i; }
        return -1;
      }

      // ---- ships on the map: position along the current leg (accelerate, coast, decelerate)
      const SP = { x: 0, y: 0, burn: false, right: true };
      function shipXY(s, t) {
        const f = s.f, i = Math.min(f.i, f.L.length / 5 - 1) * 5, L = f.L;
        const a = N[L[i]], b = N[L[i + 1]], t0 = L[i + 2], t1 = L[i + 3], tb = L[i + 4];
        let fr = 0, burn = false;
        if (t > t0) {
          const T = Math.max(1, t1 - t0), tau = Math.min(T, t - t0);
          if (tb <= 0) { fr = tau / T; burn = true; }
          else {
            const b2 = Math.min(tb, T / 2), tc = T - 2 * b2, Dd = b2 + tc;
            if (tau < b2) { fr = 0.5 * tau * tau / b2 / Dd; burn = true; }
            else if (tau < b2 + tc) fr = (0.5 * b2 + tau - b2) / Dd;
            else { const r = T - tau; fr = (Dd - 0.5 * r * r / b2) / Dd; burn = true; }
          }
        }
        SP.x = a.x + (b.x - a.x) * fr; SP.y = a.y + (b.y - a.y) * fr; SP.burn = burn; SP.right = b.x >= a.x;
        if (f.tow) SP.burn = false;
        return SP;
      }
      const lastPos = new Map();
      function shipsMoved() {
        let moved = false;
        for (const s of c.sh) {
          if (!s.f) continue;
          const p = shipXY(s, now), key = Math.round(p.x - ui.cam.x) * 1000 + Math.round(p.y) + (p.burn ? 0.5 : 0);
          if (lastPos.get(s.i) !== key) { lastPos.set(s.i, key); if (p.x - ui.cam.x > -30 && p.x - ui.cam.x < api.view.w + 30) moved = true; }
        }
        return moved;
      }

      // ---- input + clock
      const ptr = { down: false, x0: 0, y0: 0, drag: false, w: null, ls: -1, map: false, cam0: 0, sc0: 0, slider: false };
      const rep = { dir: '', t: 0 };
      function dirRepeat(dt) {
        const h = api.input.held, p = api.input.pressed;
        for (const d of ['up', 'down', 'left', 'right']) if (p[d]) { rep.dir = d; rep.t = 0.38; return d; }
        if (rep.dir && h[rep.dir]) { rep.t -= dt; if (rep.t <= 0) { rep.t = 0.085; return rep.dir; } } else rep.dir = '';
        return '';
      }
      function setBurn(m, v) {
        const nv = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
        if (nv !== m.b) { m.b = nv; ui.dirty = true; if (Math.round(nv * 20) !== Math.round((m.lastTick || 0) * 20)) { m.lastTick = nv; api.sfx.tone({ f: 300 + nv * 600, d: 0.03, v: 0.03 }); } }
      }
      function sliderFrom(x) {
        const w = W.find(q => q.ty === 'slider');
        if (w && top() && top().ty === 'plan') setBurn(top(), (x - w.x) / w.w);
      }

      function update(dt) {
        let changed = false;
        now = Date.now();
        c.st.play += dt * 1000;
        c.seen = now;
        if (now >= c.nx || now - ui.lastAdv > 15000) {
          SIM.advance(c, now); ui.lastAdv = now; ui.dirty = true; ui.needSave = true;
        }
        const sec = Math.floor(now / 1000);
        if (sec !== ui.sec) { ui.sec = sec; if (ui.live) ui.dirty = true; }
        const pt = performance.now();
        while (ui.toasts.length && ui.toasts[0].until < pt) { ui.toasts.shift(); changed = true; }

        const inp = api.input, p = api.pointer, m = top();
        // pointer: tap = activate on release; drag scrolls lists, pans the map, or moves the burn slider
        if (p.pressed) {
          ptr.down = true; ptr.x0 = p.x; ptr.y0 = p.y; ptr.drag = false; ptr.w = hit(p.x, p.y); ptr.ls = listAt(p.x, p.y);
          ptr.map = ui.tab === 0 && (!m || m.ty === 'port') && p.y > Y0 && p.y < Y1 && (!m || p.x < api.view.w - PW) && !(ptr.w && ptr.w.ty !== 'node');
          ptr.cam0 = ui.cam.x; ptr.sc0 = ptr.ls >= 0 ? LS[ptr.ls].sc : 0;
          ptr.slider = !!(ptr.w && ptr.w.ty === 'slider');
          if (ptr.slider) sliderFrom(p.x);
          if (!p.virtual) ui.nav = false;
          changed = true;
        }
        if (ptr.down && p.down) {
          const dx = p.x - ptr.x0, dy = p.y - ptr.y0;
          if (!ptr.drag && !p.virtual && Math.abs(dx) + Math.abs(dy) > 8) ptr.drag = true;
          if (ptr.slider) sliderFrom(p.x);
          else if (ptr.drag && ptr.ls >= 0) { const L = LS[ptr.ls]; L.sc = Math.max(0, Math.min(L.max, ptr.sc0 - dy)); ui.scroll[L.key] = L.sc; changed = true; }
          else if (ptr.drag && ptr.map) { ui.cam.x = ui.cam.tx = Math.max(-40, Math.min(MAP_X1 - api.view.w + 40, ptr.cam0 - dx)); changed = true; }
        }
        if (p.released && ptr.down) {
          ptr.down = false;
          if (!ptr.drag && !ptr.slider) {
            const w = hit(p.x, p.y);
            if (w && w === ptr.w) activate(w);
            else if (!w && m && m.ty === 'port' && ptr.map) pop();
          }
          changed = true;
        }
        if (p.virtual && p.active && !ptr.down) {
          const w = hit(p.x, p.y);
          if (w && w.k !== ui.fk) { ui.fk = w.k; changed = true; }
        }
        // d-pad / keys / buttons
        const dir = p.virtual ? '' : dirRepeat(dt);
        if (dir) {
          ui.nav = true;
          const f = focused();
          if (f && f.ty === 'slider' && (dir === 'left' || dir === 'right')) setBurn(m, m.b + (dir === 'left' ? -0.05 : 0.05));
          else navigate(dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
          changed = true;
        }
        if (inp.pressed.a && !p.virtual) { ui.nav = true; activate(focused()); changed = true; }
        if (inp.pressed.b) { back(); changed = true; }
        if (inp.pressed.l || inp.pressed.r) {
          const d = inp.pressed.l ? -1 : 1;
          if (m && m.ty === 'plan') setBurn(m, m.b + d * 0.25);
          else if (!m || m.ty === 'port') setTab(ui.tab + d);
          changed = true;
        }
        if (inp.pressed.x) { nextIdle(); changed = true; }
        if (inp.pressed.y && ui.tab === 0 && (!m || m.ty === 'port')) {
          const regs = REGIONS.filter((R, i) => REGION_ERA[i] <= c.era && i < 4).length;
          ui.region = (ui.region + 1) % Math.max(1, regs);
          jumpRegion(ui.region); ui.stack = []; changed = true;
        }
        const s2 = inp.stick2;
        if (ui.tab === 0 && (s2.x || s2.y) && (!m || m.ty === 'port')) {
          ui.cam.tx = Math.max(-40, Math.min(MAP_X1 - api.view.w + 40, ui.cam.tx + s2.x * 700 * dt));
          changed = true;
        }
        // camera glide, focus pop
        if (Math.abs(ui.cam.tx - ui.cam.x) > 0.5) { ui.cam.x += (ui.cam.tx - ui.cam.x) * Math.min(1, dt * 9); changed = true; }
        else if (ui.cam.x !== ui.cam.tx) { ui.cam.x = ui.cam.tx; changed = true; }
        if (ui.pop > 0) { ui.pop = Math.max(0, ui.pop - dt * 4); changed = true; }
        if (ui.dirty) { layout(); changed = true; }
        if (ui.tab === 0 && shipsMoved()) changed = true;
        if (ui.needSave && now - ui.saveAt > 4000) save();
        return changed;
      }

      // ---- drawing
      function draw(ctx, v) {
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = C.bg; ctx.fillRect(0, 0, v.w, v.h);
        const m = top(), full = m && m.ty !== 'port';
        if (ui.tab === 0 && !full) drawMap(ctx, v);
        else if (stars) { ctx.globalAlpha = 0.5; ctx.drawImage(stars, 0, 0, v.w, 360); ctx.globalAlpha = 1; }
        const fw = (ui.nav || api.pointer.virtual) ? focused() : null;
        for (const w of W) {
          if (w.ty === 'map' || w.ty === 'node') continue;
          if (w.ls >= 0) {
            const L = LS[w.ls], Y = ry(w);
            if (Y + w.h < L.y || Y > L.y + L.h) continue;
            if (Y < L.y || Y + w.h > L.y + L.h) { ctx.save(); ctx.beginPath(); ctx.rect(L.x - 4, L.y, L.w + 8, L.h); ctx.clip(); drawW(ctx, w, v); ctx.restore(); continue; }
          }
          if (w.l === 1 && W[W.indexOf(w) - 1] && W[W.indexOf(w) - 1].l === 0 && full) { /* modal over base: nothing to dim */ }
          drawW(ctx, w, v);
        }
        for (const L of LS) if (L.max > 0) {
          const h = Math.max(16, L.h * L.h / (L.h + L.max)), y = L.y + (L.h - h) * (L.sc / L.max);
          ctx.fillStyle = C.line; ctx.fillRect(L.x + L.w + 1, L.y, 2, L.h);
          ctx.fillStyle = C.muted; ctx.fillRect(L.x + L.w + 1, y, 2, h);
        }
        if (fw) {
          const g = ui.pop * 3;
          if (fw.ty === 'node') { const x = N[fw.n].x - ui.cam.x, y = N[fw.n].y; ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.strokeRect(x - 11 - g, y - 11 - g, 22 + 2 * g, 22 + 2 * g); }
          else {
            const X = rx(fw), Y = ry(fw);
            if (fw.ls >= 0) { const L = LS[fw.ls]; ctx.save(); ctx.beginPath(); ctx.rect(L.x - 4, L.y - 2, L.w + 8, L.h + 4); ctx.clip(); }
            ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.strokeRect(X - 1 - g, Y - 1 - g, fw.w + 2 + 2 * g, fw.h + 2 + 2 * g);
            if (fw.ls >= 0) ctx.restore();
          }
        }
        drawToasts(ctx, v);
      }
      function drawW(ctx, w, v) {
        const X = rx(w), Y = ry(w);
        switch (w.ty) {
          case 'hud': drawHud(ctx, v); break;
          case 'pan':
            ctx.fillStyle = C.bg2; ctx.fillRect(X, Y, w.w, w.h);
            ctx.fillStyle = C.line; ctx.fillRect(X, Y, w.w, 1); ctx.fillRect(X, Y + w.h - 1, w.w, 1); ctx.fillRect(X, Y, 1, w.h); ctx.fillRect(X + w.w - 1, Y, 1, w.h);
            break;
          case 'txt': ctx.font = w.font; ctx.fillStyle = w.col; ctx.textAlign = w.al; ctx.textBaseline = 'top'; ctx.fillText(w.s, X, Y); break;
          case 'para':
            ctx.font = w.font; ctx.fillStyle = w.col; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            for (let i = 0; i < w.lines.length; i++) ctx.fillText(w.lines[i], X, Y + i * w.lh);
            break;
          case 'bar':
            ctx.fillStyle = C.line; ctx.fillRect(X, Y, w.w, w.h);
            ctx.fillStyle = w.col; ctx.fillRect(X, Y, Math.round(w.w * w.v), w.h);
            break;
          case 'btn': case 'tab': {
            const hot = w.hot && !w.dis, act = w.act;
            ctx.fillStyle = w.danger ? '#3a1426' : hot ? '#3a2a10' : act ? C.panel2 : C.panel;
            ctx.fillRect(X, Y, w.w, w.h);
            ctx.fillStyle = w.dis ? C.line : w.danger ? C.rose : hot ? C.amber : act ? C.amber : C.line;
            ctx.fillRect(X, Y + w.h - 2, w.w, 2);
            if (w.ty === 'btn') { ctx.fillRect(X, Y, w.w, 1); ctx.fillRect(X, Y, 1, w.h); ctx.fillRect(X + w.w - 1, Y, 1, w.h); }
            ctx.font = w.chip || w.ty === 'tab' ? FONT.s : FONT.l; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
            ctx.fillStyle = w.dis ? C.dim : w.danger ? C.rose : hot || act ? C.amber : C.text;
            ctx.fillText(w.label, X + w.w / 2, Y + w.h / 2);
            if (w.badge) { ctx.fillStyle = C.rose; ctx.fillRect(X + w.w - 16, Y + 4, 12, 12); ctx.fillStyle = C.text; ctx.font = FONT.s; ctx.fillText(w.badge, X + w.w - 10, Y + 10); }
            if (w.slot) { ctx.fillStyle = w.slot === 'S' ? C.cyan : w.slot === 'C' ? C.torch : C.amber; ctx.fillRect(X + w.w / 2 - 6, Y + 6, 12, 6); }
            break;
          }
          case 'row': {
            ctx.fillStyle = w.sel ? '#13304a' : C.panel; ctx.fillRect(X, Y, w.w, w.h);
            ctx.fillStyle = w.sel ? C.cyan : w.hot ? C.amber : C.line; ctx.fillRect(X, Y, 3, w.h);
            let tx = X + 12;
            if (w.icon !== undefined || w.shipObj) { const e = w.shipObj ? shipSpr(w.shipObj, 'map') : SPR.dmap[w.icon]; ctx.drawImage(e.cv, Math.round(X + 8 + (48 - e.w) / 2), Math.round(Y + (w.h - e.h) / 2)); tx = X + 62; }
            else if (w.part !== undefined) { ctx.fillStyle = [C.amber, C.cyan, C.torch][(w.part / 3) | 0]; ctx.fillRect(X + 12, Y + w.h / 2 - 6, 12, 12); ctx.fillStyle = C.bg; ctx.font = FONT.s; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HDS'[w.part % 3], X + 18, Y + w.h / 2); tx = X + 34; }
            else if (w.job) { const j = w.job; ctx.fillStyle = j.v ? C.rose : JT[j.t].p ? C.cyan : j.k ? C.good : C.amber; ctx.fillRect(X + 10, Y + 9, 8, 8); if (!JT[j.t].p) { ctx.fillStyle = C.bg; ctx.fillRect(X + 12, Y + 11, 4, 1); } tx = X + 26; }
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.font = FONT.l; ctx.fillStyle = w.dim ? C.dim : C.text; ctx.fillText(w.title, tx, Y + 6);
            ctx.font = FONT.s; ctx.fillStyle = w.dim ? C.dim : C.muted; ctx.fillText(w.sub || '', tx, Y + 22);
            if (w.swatch) { ctx.fillStyle = w.swatch; ctx.fillRect(X + w.w - 56, Y + 8, 40, 18); ctx.fillStyle = C.bg; ctx.fillRect(X + w.w - 56, Y + 22, 40, 4); }
            if (w.right) { ctx.textAlign = 'right'; ctx.font = FONT.l; ctx.fillStyle = w.dim ? C.dim : w.sel ? C.cyan : C.amber; ctx.fillText(w.right, X + w.w - 10, Y + 6); }
            break;
          }
          case 'slider': {
            const mid = Y + w.h / 2;
            ctx.fillStyle = C.panel; ctx.fillRect(X, Y, w.w, w.h);
            ctx.fillStyle = C.line; ctx.fillRect(X + 8, mid - 2, w.w - 16, 4);
            const kx = X + 8 + (w.w - 16) * w.v, ex = X + 8 + (w.w - 16) * w.eff;
            ctx.fillStyle = C.amber; ctx.fillRect(X + 8, mid - 2, ex - X - 8, 4);
            if (w.cap < 1) { const cx = X + 8 + (w.w - 16) * w.cap; ctx.fillStyle = C.rose; ctx.fillRect(cx, Y + 4, 2, w.h - 8); }
            if (Math.abs(ex - kx) > 2) { ctx.fillStyle = C.rose; ctx.fillRect(ex - 1, Y + 6, 3, w.h - 12); }
            ctx.fillStyle = C.text; ctx.fillRect(kx - 5, Y + 4, 10, w.h - 8);
            ctx.fillStyle = C.amber; ctx.fillRect(kx - 3, Y + 6, 6, w.h - 12);
            ctx.font = FONT.s; ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(Math.round(w.v * 100) + '%', kx, Y - 1);
            break;
          }
          case 'slots': {
            const s = w.s, lc = SIM.loadCount(s);
            let pax = lc.pax, crg = lc.crg;
            ctx.font = FONT.s; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.muted; ctx.fillText('SLOTS', X, Y + 4);
            for (let i = 0; i < s.cf.length; i++) {
              const ch = s.cf[i], used = ch === 'K' ? crg-- > 0 : pax-- > 0, x = X + 40 + i * 16;
              ctx.fillStyle = C.line; ctx.fillRect(x, Y - 2, 13, 12);
              if (used) { ctx.fillStyle = ch === 'S' ? C.cyan : ch === 'C' ? C.torch : C.amber; ctx.fillRect(x + 2, Y, 9, 8); }
              else { ctx.fillStyle = C.bg; ctx.fillRect(x + 2, Y, 9, 8); ctx.fillStyle = ch === 'S' ? C.cyan : ch === 'C' ? C.torch : C.amber; ctx.fillRect(x + 5, Y + 3, 3, 2); }
            }
            break;
          }
          case 'cut': drawCut(ctx, w); break;
        }
      }
      // the ship front and center: hangar or starfield, plume when burning, passengers and crates in their slots
      function drawCut(ctx, w) {
        const s = w.s, g = cutGeom(w), e = g.e, sc = g.sc;
        ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
        ctx.fillStyle = s.f ? '#04060e' : '#0b1030'; ctx.fillRect(w.x, w.y, w.w, w.h);
        if (s.f) for (let i = 0; i < 46; i++) { ctx.fillStyle = i % 6 ? '#2a3363' : '#8d95c4'; ctx.fillRect(w.x + (i * 97) % w.w, w.y + (i * 53) % w.h, 2, 2); }
        else {
          ctx.fillStyle = '#141b40';
          for (let x = w.x + 12; x < w.x + w.w; x += 40) ctx.fillRect(x, w.y, 4, w.h);
          ctx.fillStyle = '#1c2450'; ctx.fillRect(w.x, w.y + 4, w.w, 3); ctx.fillRect(w.x, w.y + w.h - 8, w.w, 3);
        }
        if (s.f && !DS[s.d].climb && shipXY(s, now).burn) {
          const pc = SPR.plumeBig[DS[s.d].f];
          ctx.drawImage(pc, g.ox - pc.width * sc, Math.round(g.oy + e.cy * sc - pc.height * sc / 2), pc.width * sc, pc.height * sc);
        }
        ctx.drawImage(e.cv, g.ox, g.oy, e.w * sc, e.h * sc);
        if (!w.closed && w.sj) {
          ctx.font = FONT.s; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          for (let i = 0; i < w.sj.length && i < e.slots.length; i++) {
            const j = w.sj[i];
            if (!j) continue;
            const sl = e.slots[i], x = g.ox + sl.x * sc;
            if (JT[j.t].p) { const pc = SPR.pax[j.v ? 16 + (j.i & 3) : j.i & 15]; ctx.drawImage(pc, x + 4 * sc, g.oy + (e.iy1 - 8) * sc, pc.width * sc, pc.height * sc); }
            else { const cc = SPR.crate[j.t]; ctx.drawImage(cc, x + 2 * sc, g.oy + (e.iy1 - 9) * sc, cc.width * sc, cc.height * sc); }
            const ly = g.oy + e.h * sc + 1;
            if (ly + 8 < w.y + w.h && sl.w * sc >= 22) { ctx.fillStyle = j.v ? C.rose : C.text; ctx.fillText(N[j.d].k, x + sl.w * sc / 2, ly); }
          }
        }
        ctx.restore();
      }
      function drawHud(ctx, v) {
        ctx.fillStyle = C.bg2; ctx.fillRect(0, 0, v.w, 24);
        ctx.fillStyle = C.line; ctx.fillRect(0, 24, v.w, 1);
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = FONT.h; ctx.fillStyle = c.cr < 0 ? C.rose : C.amber; ctx.fillText('CR ' + cr(c.cr), 8, 13);
        ctx.font = FONT.l;
        let x = 130;
        ctx.fillStyle = C.text; ctx.fillText('LV ' + c.lv, x, 13);
        const a = TUNE.xpNeed(c.lv), b = TUNE.xpNeed(c.lv + 1);
        ctx.fillStyle = C.line; ctx.fillRect(x + 42, 11, 40, 4);
        ctx.fillStyle = C.amber; ctx.fillRect(x + 42, 11, Math.round(40 * Math.max(0, Math.min(1, (c.xp - a) / (b - a)))), 4);
        x += 94;
        ctx.fillStyle = C.cyan; ctx.fillText('RP ' + Math.floor(c.rp), x, 13);
        x += 64;
        ctx.fillStyle = C.text; ctx.fillText(`SHIPS ${c.sh.length}/${SIM.shipCap(c)}`, x, 13);
        x += 98;
        if (x + 60 < v.w - 56) { ctx.fillStyle = C.torch; ctx.fillText('ERA ' + ROMAN[c.era], x, 13); }
      }
      function drawToasts(ctx, v) {
        if (!ui.toasts.length) return;
        ctx.font = FONT.l; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < ui.toasts.length; i++) {
          const t = ui.toasts[ui.toasts.length - 1 - i], y = Y1 - 56 - i * 22, w = Math.min(v.w - 20, ctx.measureText(t.text).width + 20);
          ctx.fillStyle = 'rgba(7,10,23,.9)'; ctx.fillRect(v.w / 2 - w / 2, y - 9, w, 18);
          ctx.fillStyle = t.col; ctx.fillRect(v.w / 2 - w / 2, y + 8, w, 1);
          ctx.fillText(t.text, v.w / 2, y);
        }
      }
      const RINGS = [[64, 188, 172], [64, 188, 211], [64, 188, 268], [606, 214, 90], [1086, 198, 106], [1086, 198, 129], [2156, 196, 117]];
      function drawMap(ctx, v) {
        const cx = ui.cam.x, vx0 = cx - 80, vx1 = cx + v.w + 80;
        if (stars) {
          const off = -((cx * 0.25) % v.w + v.w) % v.w;
          ctx.drawImage(stars, off, 0, v.w, 360); ctx.drawImage(stars, off + v.w, 0, v.w, 360);
        }
        // region names
        ctx.font = FONT.s; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.dim;
        for (let i = 0; i < REGIONS.length; i++) { const R = REGIONS[i]; if (R.x1 > vx0 && R.x0 < vx1) ctx.fillText(R.n.toUpperCase(), Math.max(R.x0 + 12, -999) - cx + (i ? 0 : 40), Y0 + 6); }
        // orbit rings
        ctx.strokeStyle = '#1a2148'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        for (const r of RINGS) if (r[0] + r[2] > vx0 && r[0] - r[2] < vx1) { ctx.beginPath(); ctx.arc(r[0] - cx, r[1], r[2], 0, 6.2832); ctx.stroke(); }
        ctx.setLineDash([]);
        // bodies
        for (const b of BODIES) {
          if (b.x + b.r * 2.4 < vx0 || b.x - b.r * 2.4 > vx1) continue;
          const sp = SPR.body[b.k + b.r];
          ctx.drawImage(sp.cv, Math.round(b.x - sp.w / 2 - cx), Math.round(b.y - sp.h / 2), sp.w, sp.h);
        }
        // routes: owned links bright, others faint; interplanetary dashed
        for (let pass = 0; pass < 3; pass++) {
          ctx.beginPath();
          for (const e of E) {
            if (!SIM.edgeOn(c, e)) continue;
            const a = N[e.a], b = N[e.b];
            if (Math.max(a.x, b.x) < vx0 || Math.min(a.x, b.x) > vx1) continue;
            const own = c.P[e.a] && c.P[e.b], kind = e.ip ? 2 : own ? 1 : 0;
            if (kind !== pass) continue;
            ctx.moveTo(a.x - cx, a.y); ctx.lineTo(b.x - cx, b.y);
          }
          ctx.strokeStyle = pass === 1 ? '#4a5aa0' : pass === 2 ? '#3a4680' : '#222a58';
          ctx.lineWidth = pass === 1 ? 2 : 1;
          if (pass === 2) ctx.setLineDash([6, 5]);
          ctx.stroke(); ctx.setLineDash([]);
        }
        // nodes
        ctx.font = FONT.s; ctx.textBaseline = 'middle';
        const docked = ui.dock || (ui.dock = new Int16Array(NN));
        docked.fill(0);
        for (const s of c.sh) if (!s.f) docked[s.at]++;
        for (let n = 0; n < NN; n++) {
          const nd = N[n];
          if (nd.x < vx0 || nd.x > vx1) continue;
          const on = SIM.nodeOn(c, n), P = c.P[n], x = nd.x - cx, y = nd.y;
          const set = SPR.node[P && P.st ? 'orb' : nd.t];
          const sp = !on ? set.lock : P ? (P.st ? set.stn : set.own) : nd.t === 'site' ? (c.site[n] ? set.stn : set.site) : set.free;
          ctx.drawImage(sp, Math.round(x - 7), Math.round(y - 7), 14, 14);
          if (n === c.hq) ctx.drawImage(SPR.star, Math.round(x - 5), Math.round(y - 16), 10, 8);
          if (docked[n]) { ctx.fillStyle = C.cyan; ctx.fillRect(x + 6, y - 11, 9, 9); ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.fillText(String(docked[n]), x + 10.5, y - 6.5); }
          const pk = (c.pj.elev && !c.done.elev && n === PROJ.elev.site) || (c.pj.yards && !c.done.yards && n === PROJ.yards.site);
          if (pk) { ctx.fillStyle = C.rose; ctx.fillRect(x - 12, y - 11, 4, 4); }
          if (!on) continue;
          ctx.fillStyle = P ? C.amber : nd.t === 'site' ? C.cyan : C.muted;
          const la = nd.la;
          ctx.textAlign = la === 2 ? 'left' : la === 3 ? 'right' : 'center';
          ctx.fillText(nd.n.toUpperCase(), la === 2 ? x + 11 : la === 3 ? x - 11 : x, la === 1 ? y - 14 : la === 0 ? y + 14 : y);
        }
        // ships in flight
        for (const s of c.sh) {
          if (!s.f) continue;
          const p = shipXY(s, now), x = p.x - cx;
          if (x < -30 || x > v.w + 30) continue;
          const e = shipSpr(s, 'map'), bx = Math.round(x - e.w / 2), by = Math.round(p.y - e.h / 2 - 9);
          if (p.burn && !DS[s.d].climb) {
            const pl = SPR.plumeMap[DS[s.d].f], pc = p.right ? pl.r : pl.l;
            ctx.drawImage(pc, p.right ? bx - pc.width : bx + e.w, Math.round(by + e.cy - pc.height / 2));
          }
          ctx.drawImage(p.right ? e.cv : e.l, bx, by);
        }
        // uncharted regions
        for (let i = 1; i < REGIONS.length; i++) {
          const R = REGIONS[i], era = i === 1 ? 2 : i === 4 ? 4 : 3;
          if (era <= c.era || R.x1 < vx0 || R.x0 > vx1) continue;
          ctx.fillStyle = 'rgba(7,10,23,0.78)';
          ctx.fillRect(R.x0 - cx, Y0 - 3, R.x1 - R.x0, Y1 - Y0 + 3);
          ctx.font = FONT.l; ctx.fillStyle = C.dim; ctx.textAlign = 'center';
          const mid = Math.max(R.x0 - cx + 90, Math.min(R.x1 - cx - 90, v.w / 2));
          ctx.fillText(era === 4 ? 'OUTER REACH · COMING SOON' : `UNCHARTED · ERA ${ROMAN[era]}`, mid, 196);
        }
      }

      centerOn(c.hq, true);
      layout();
      return {
        update, draw,
        resize(v) { buildStars(v); ui.dirty = true; },
        getState() { save(); return { tab: ui.tab }; },
        _c: () => c,
        debug: () => ({ tab: ui.tab, stack: ui.stack.map(q => q.ty), fk: ui.fk, cam: ui.cam.x, cr: c.cr, ships: c.sh.map(s => [s.nm, s.st, s.at, s.ld.length, !!s.f]) })
      };
    }
  });
})();
