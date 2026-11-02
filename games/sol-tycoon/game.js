/* Sol: Tycoon. Run a passenger and cargo line across the solar system, from chemical rockets in Earth orbit to fusion
   torches at Jupiter. Pocket-scale transit tycoon: license ports, load jobs, plan burns, research, build stations.
   - Wall-clock flights: a flight under way always finishes, even while the device sleeps. Routines (looping ships)
     pause after an idle cap until you check in.
   - pointer: true + d-pad highlight on every screen; redraw: 'onDemand' at 30 fps (the live ship view animates only
     while open); the company lives in the 'main' save.
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
    wellFare: 150, spaceFare: 56, fareRegion: [1, 2.6, 5.5, 9, 14, 3.2], // by region; index 5 is the inner system
    regionScale: [1, 10, 70, 110, 200, 20],
    famFuel: [1.5, 6, 450],       // fuel price multiplier: chemical, nuclear, torch
    windowAmp: 0, windowP: [0, 3 * HR, 5 * HR, 7 * HR], // 0: flight times between two ports never change
    missionK: [2, 3], missionChance: 0.1,
    marketMs: 3 * HR,
    gate: [null, null, { lv: 10, tech: 'tether', proj: 'elev' }, { lv: 24, tech: 'torch', proj: 'yards' }],
    lateVip: 0.5, lateVipInsured: 0.8,
    assembleFee: 0.3, assembleMin: [0, 2, 8, 20], sellBack: 0.5
  };

  // ---------------------------------------------------------------- DATA
  // tags
  const T_E = 1, T_LU = 2, T_ICE = 4, T_ORE = 8, T_HUB = 16, T_TOUR = 32, T_SCI = 64, T_ORB = 128;
  // nodes: k id, n name, r region (0 Earth, 1 Mars, 2 Belt, 3 Jove, 4 outer, 5 inner), x/y map, t type (pad, orb, base,
  // rock, site = build site, drop = mission drop zone), w well class
  // (0 dock anywhere · 1 Ceres · 2 Luna-class · 3 Mars · 4 Earth), e era, c licence (sites: charter), b berths,
  // dep default depot, fp fuel price/t, la label side (0 below, 1 above, 2 right, 3 left)
  const N = [
    { k: 'KOU', n: 'Kourou', r: 0, x: 157, y: 192, t: 'pad', w: 4, e: 1, c: 0, b: 2, dep: 1, fp: 8, tg: T_E | T_HUB, la: 2 },
    { k: 'CAN', n: 'Canaveral', r: 0, x: 145, y: 143, t: 'pad', w: 4, e: 1, c: 6000, b: 2, dep: 1, fp: 8, tg: T_E | T_TOUR, la: 2 },
    { k: 'BAI', n: 'Baikonur', r: 0, x: 110, y: 107, t: 'pad', w: 4, e: 1, c: 5000, b: 2, dep: 1, fp: 7, tg: T_E, la: 1 },
    { k: 'SRI', n: 'Sriharikota', r: 0, x: 142, y: 239, t: 'pad', w: 4, e: 1, c: 5000, b: 2, dep: 1, fp: 7, tg: T_E, la: 2 },
    { k: 'ANC', n: 'Anchor Atoll', r: 0, x: 101, y: 273, t: 'pad', w: 4, e: 2, c: 150000, b: 3, dep: 1, fp: 6, tg: T_E | T_HUB, la: 0 },
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
    { k: 'TRI', n: 'Triton', r: 4, x: 3000, y: 150, t: 'base', w: 1, e: 4, c: 0, b: 1, dep: 0, fp: 5, tg: 0, la: 1 },
    // inner system (appended so saved port indices stay valid): mission drop zones from Era II, Venus ports in Era III
    { k: 'VPO', n: 'Venus Polar Orbit', r: 5, x: -520, y: 112, t: 'drop', w: 0, e: 2, c: 0, b: 0, dep: 0, fp: 0, tg: 0, la: 1 },
    { k: 'MER', n: 'Mercury Orbit', r: 5, x: -826, y: 236, t: 'drop', w: 0, e: 2, c: 0, b: 0, dep: 0, fp: 0, tg: 0, la: 0 },
    { k: 'SOL', n: 'Solar Watch', r: 5, x: -1010, y: 120, t: 'drop', w: 0, e: 2, c: 0, b: 0, dep: 0, fp: 0, tg: 0, la: 1 },
    { k: 'ISH', n: 'Ishtar Orbital', r: 5, x: -404, y: 158, t: 'orb', w: 0, e: 3, c: 2500000, b: 2, dep: 1, fp: 10, tg: T_HUB | T_ORB | T_SCI, la: 2 },
    { k: 'APH', n: 'Aphrodite Aerostat', r: 5, x: -470, y: 214, t: 'base', w: 3, e: 3, c: 3000000, b: 1, dep: 1, fp: 9, tg: T_TOUR, la: 0 }
  ];
  const NN = N.length, NI = {};
  N.forEach((n, i) => { NI[n.k] = i; });
  const REGIONS = [
    { n: 'Earth', x0: -60, x1: 760, cx: 0 }, { n: 'Mars', x0: 760, x1: 1300, cx: 740 },
    { n: 'Belt', x0: 1300, x1: 1940, cx: 1320 }, { n: 'Jove', x0: 1940, x1: 2560, cx: 1960 },
    { n: 'Outer', x0: 2560, x1: 3120, cx: 2580 }, { n: 'Inner', x0: -1240, x1: -60, cx: -1080 }
  ];
  const MAP_X0 = -1240, MAP_X1 = 3080;
  // bodies drawn on the map (r in world units)
  const BODIES = [
    { k: 'earth', x: 64, y: 188, r: 96 }, { k: 'moon', x: 606, y: 214, r: 24 }, { k: 'mars', x: 1086, y: 198, r: 46 },
    { k: 'rock', x: 806, y: 266, r: 5 }, { k: 'phobos', x: 986, y: 236, r: 7 }, { k: 'deimos', x: 1180, y: 110, r: 5 },
    { k: 'vesta', x: 1384, y: 116, r: 8 }, { k: 'psyche', x: 1452, y: 250, r: 7 }, { k: 'ceres', x: 1566, y: 178, r: 12 },
    { k: 'rock', x: 1700, y: 258, r: 7 }, { k: 'rock', x: 1860, y: 214, r: 6 }, { k: 'jupiter', x: 2156, y: 196, r: 62 },
    { k: 'io', x: 2236, y: 168, r: 8 }, { k: 'europa', x: 2252, y: 252, r: 8 }, { k: 'ganymede', x: 2324, y: 178, r: 11 },
    { k: 'callisto', x: 2396, y: 262, r: 10 }, { k: 'rock', x: 2426, y: 96, r: 4 }, { k: 'saturn', x: 2690, y: 196, r: 40 },
    { k: 'neptune', x: 2950, y: 196, r: 22 }, { k: 'sun', x: -1330, y: 190, r: 230 }, { k: 'mercury', x: -850, y: 200, r: 12 },
    { k: 'venus', x: -470, y: 190, r: 26 }
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
  space('HIG', 'VPO', 5200); space('L1', 'VPO', 4600); space('HIG', 'ISH', 5000); space('L1', 'ISH', 4400);
  space('VPO', 'ISH', 300); well('APH', 'ISH', 3.0, 0.4, 45); space('VPO', 'MER', 4200); space('ISH', 'MER', 4000);
  space('MER', 'SOL', 3200); space('VPO', 'SOL', 6000);
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
    { n: 'Concourse section', p: 0, m: 3, r: 0.35, sp: 1 },
    // missions: one-way deliveries into orbits with no port (drop zones), from Era II
    { n: 'Science probe', p: 0, m: 2, r: 1, sp: 1, ms: 1 },
    { n: 'Weather satellite', p: 0, m: 3, r: 1, sp: 1, ms: 1 },
    { n: 'Solar observatory', p: 0, m: 2, r: 1, sp: 1, ms: 1 }
  ];
  const J_RES = 19, J_KIT = 20, J_SPOOL = 21, J_TRUSS = 22, J_DEV = 23;
  const K_NORM = 0, K_DEV = 1, K_PROJ = 2, K_KIT = 3, K_RES = 4, K_MISSION = 5; // job kinds
  const J_MISSION = 26;
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
    if (c.P[n] || !nodeOn(c, n) || N[n].t === 'site' || N[n].t === 'drop' || c.cr < N[n].c) return false;
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
    // missions: probes and satellites into orbits with no port, posted at Earth's orbital ports from Era II (the
    // nuclear ships that can reach Venus and Mercury can't land on Earth)
    if (c.era >= 2 && N[o].r === 0 && N[o].w === 0 && Math.random() < TUNE.missionChance) {
      const drops = [];
      for (let n = 0; n < NN; n++) if (N[n].t === 'drop' && nodeOn(c, n) && mx.hop[o * NN + n] < 99) drops.push(n);
      if (drops.length) {
        const d = drops[rint(drops.length)], ty = J_MISSION + (d === NI.SOL ? 2 : rint(2));
        const j = mkJob(c, ty, o, d, t, K_MISSION, rnd(TUNE.missionK[0], TUNE.missionK[1]));
        j.x = Math.round(t + rnd(2, 4) * HR);
        return j;
      }
    }
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
      if (j.x && j.x < t) p.bd.splice(i, 1); else if (j.k === K_NORM || j.k === K_RES || j.k === K_MISSION) k++;
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
  function edgeBetween(c, a, b) {
    for (const ei of ADJ[a]) { const e = E[ei]; if ((e.a === b || e.b === b) && edgeOn(c, e)) return e; }
    return null;
  }
  // stops this ship could fly to next from node u (the launch planner offers these)
  function nextHops(c, s, u, t) {
    const D = DS[s.d], out = [];
    for (const ei of ADJ[u]) { const e = E[ei]; if (edgeOn(c, e) && legInfo(c, D, e, u, t)) out.push(e.a === u ? e.b : e.a); }
    return out;
  }
  // an explicit route from the launch planner: one burn per space leg, refuelling at depots on the way. A burn above
  // what the tank allows is lowered to the most it can do (limited); a leg it can't fly at all is marked not ok.
  function planLegs(c, s, route, burns, t) {
    const D = DS[s.d], ve = veOf(c, D), dry = shipDry(s) + loadMass(s.ld), cap = shipFuel(s), F = shipF(s);
    const paxCapped = D.f === 2 && !has(c, 'hig') && s.ld.some(j => JT[j.t].p);
    let fuel = s.fu, price = fuelPrice(c, route[0], D.f), clock = 0, fuelCr = 0, dvSum = 0, ok = route.length > 1;
    const info = [], flat = [], arrAt = {};
    for (let i = 0; i + 1 < route.length; i++) {
      const u = route[i], v = route[i + 1], e = edgeBetween(c, u, v);
      const L = { from: u, to: v, fixed: true, ok: true, why: '', dt: 0, dv: 0, fuelCr: 0, dvLeft: 0, refuel: false, burn: 0, bMax: 1, limited: false };
      info.push(L);
      if (depotAt(c, u) && cap > 0) { L.refuel = fuel < cap - 1e-6; fuel = cap; price = fuelPrice(c, u, D.f); }
      const li = e && legInfo(c, D, e, u, t);
      if (!li) { L.ok = ok = false; L.why = e ? `A ${D.n} can't fly this leg` : 'No direct route'; continue; }
      const m0 = dry + fuel, a = F / m0, B = fuel > 0 ? ve * Math.log(m0 / dry) : 0;
      let dv = li.fx, dt = li.ft, tb = 0;
      L.fixed = !li.d;
      if (li.d) {
        const vfl = Math.sqrt(a * li.d) / TUNE.vflDiv, room = (B - li.fx) / (2 * vfl);
        L.bMax = room >= 1 ? Math.min(1, Math.log(room) / Math.log(TUNE.vflDiv)) : -1;
        let b = Math.min(burns[i] === undefined ? c.burn : burns[i], paxCapped ? 0.75 : 1);
        if (L.bMax < 0) { L.ok = ok = false; L.why = 'Not enough Δv: add a depot stop, carry less, or upgrade tanks'; b = 0; }
        else if (b > L.bMax + 1e-9) { b = L.bMax; L.limited = true; }
        L.burn = b;
        const vv = vfl * Math.pow(TUNE.vflDiv, b);
        dv += 2 * vv; tb = vv / a; dt += li.d / vv + vv / a;
      } else if (li.fx > B + 1e-6) { L.ok = ok = false; L.why = 'Too heavy for this climb: carry less'; }
      const before = fuel;
      if (dv > 0) fuel = Math.max(0, fuel - (dry + fuel) * (1 - Math.exp(-dv / ve)));
      L.fuelCr = (before - fuel) * price; fuelCr += L.fuelCr;
      if (i > 0) clock += TUNE.stopMs / SEC;
      const t0 = clock;
      clock += dt;
      L.dt = dt * SEC; L.dv = dv; dvSum += dv;
      L.dvLeft = fuel > 0 ? ve * Math.log((dry + fuel) / dry) : 0;
      flat.push(u, v, Math.round(t0 * SEC), Math.round(clock * SEC), Math.round(tb * SEC));
      if (arrAt[v] === undefined) arrAt[v] = clock * SEC;
    }
    let rev = 0;
    for (const jb of s.ld) if (arrAt[jb.d] !== undefined) rev += payOf(c, s, jb, t + arrAt[jb.d], t);
    const p0 = c.P[s.at];
    const up = Math.round(D.up * (p0 && (p0.sv & 4) ? 0.6 : 1));
    fuelCr = Math.round(fuelCr);
    return { to: route[route.length - 1], legs: flat, info, ok, dur: Math.round(clock * SEC), fuelCr, up, rev: Math.round(rev),
      profit: Math.round(rev - fuelCr - up), fuelEnd: fuel, dv: dvSum, route: route.slice(), arrAt, paxCapped, space: info.filter(L => !L.fixed).length };
  }
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
    } else if (j.k === K_MISSION) {
      const r = 2 + 2 * c.era; // science returns from probes
      c.rp += r;
      if (aw) aw.rp += r;
      emit('good', `${JT[j.t].n} delivered to ${N[n].n}`);
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
    if (!saved || saved.v !== 1 || !Array.isArray(saved.P) || saved.P.length > NN) return null;
    const c = saved;
    while (c.P.length < NN) c.P.push(null); // nodes added in later versions (the inner system)
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
    nodeOn, edgeOn, has, addShip, wf, edgeBetween, nextHops, planLegs, legInfo, K_MISSION, SHIP_UP, LIVERY, shipDry, shipFuel, shipF, canUpgradeHere, shipUpCost, shipUpBlock, upgradeShip, liveryCost, setLivery, setEmit: f => { emit = f; } };

  // ---------------------------------------------------------------- ART (shared by thumb, art and the game)
  // All art is drawn in code at startup: there are no image files. Planets are dithered pixel by pixel. Each ship has
  // its own blueprint (SHIP_ART), painted from shared primitives at any scale, so every design, refit, upgrade and
  // livery gets its own sprite: 'big' (closed hull), 'cut' (cutaway interior) and 'icon' (menus). Passengers, cargo,
  // job and research icons are small pixel maps; port scenes are painted per port the first time they are shown.
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
  // a quarter turn counter-clockwise (bow up), for ships standing on a launch pad
  function rot90(cv) {
    const m = document.createElement('canvas');
    m.width = cv.height; m.height = cv.width;
    const x = m.getContext('2d');
    x.translate(0, cv.width); x.rotate(-Math.PI / 2); x.drawImage(cv, 0, 0);
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
  function shade(hx, k) { const c = rgb(hx); return '#' + c.map(q => Math.max(0, Math.min(255, Math.round(q * k))).toString(16).padStart(2, '0')).join(''); }
  const BT = {
    ocean: ['#0a1f48', '#14397a', '#1e5aa8', '#3a82d0'], land: ['#16301c', '#2f6634', '#4f8f46', '#86b862'],
    desert: ['#4a3622', '#8a6a40', '#c09a60', '#e2c48c'], ice: ['#6a7096', '#a9b0cc', '#d6dbec', '#ffffff'],
    cloud: ['#4a5288', '#9aa2c8', '#d0d5ea', '#ffffff'], moon: ['#24283c', '#4c5068', '#8a8ea4', '#c8cbd8'],
    mars: ['#36140e', '#74301e', '#b0502c', '#e07c46'], jupiter: ['#46301c', '#8a5a34', '#c49a68', '#efdcb4'],
    storm: ['#561c12', '#963a24', '#c8573a', '#ec9070'], saturn: ['#463a22', '#8e7648', '#c8ac74', '#f0e0b4'],
    neptune: ['#0c1c4c', '#1f4498', '#3a6cd0', '#82b0f4'], ceres: ['#26262e', '#4a4a56', '#7a7a88', '#aaaab6'],
    rock: ['#2a221c', '#524536', '#806c56', '#ae977a'], ice2: ['#2a384a', '#6c8296', '#a9bdcd', '#e8f0f8'],
    crack: ['#3a2a20', '#6a4a34', '#9a704e', '#c49a70'], sun: ['#e0601e', '#ff9a3a', '#ffc85a', '#fff2b8'],
    mercury: ['#2c2622', '#5a4e44', '#8a7c6c', '#b8aa98'], venus: ['#5a4a26', '#a88a4e', '#d8bf86', '#f6e8bc'],
    phobos: ['#221c18', '#463a30', '#6c5c4c', '#94806a'], deimos: ['#2a2420', '#54483c', '#80705e', '#ac9a84'],
    vesta: ['#26262c', '#4e4c54', '#7c7882', '#b0aab4'], psyche: ['#2c3036', '#56606c', '#8a96a4', '#c8d2dc'],
    io: ['#4a3a10', '#a8862a', '#e0c25a', '#fff2a8'], europa: ['#5a554a', '#aaa290', '#ddd6c6', '#ffffff'],
    ganymede: ['#2a2620', '#5a5246', '#8c8270', '#c4baa6'], callisto: ['#151311', '#2e2a25', '#4e473f', '#7a7064']
  };
  // irregular silhouettes for small moons and asteroids: [bumpiness, noise seed]
  const LUMPY = { phobos: [0.3, 3], deimos: [0.24, 5], vesta: [0.16, 7], psyche: [0.22, 9], rock: [0.22, 11] };
  function craters(seed, n, rmax) {
    const out = [];
    for (let i = 0; i < n; i++) out.push([hash(i, 1, seed) * 1.8 - 0.9, hash(i, 2, seed) * 1.8 - 0.9, 0.04 + hash(i, 3, seed) * rmax]);
    return out;
  }
  const CRATERS = { moon: craters(3, 22, 0.16), mars: craters(5, 9, 0.1), ceres: craters(7, 10, 0.18), rock: craters(9, 6, 0.22),
    mercury: craters(15, 26, 0.14), callisto: craters(17, 18, 0.12), phobos: craters(19, 5, 0.28), deimos: craters(21, 4, 0.22),
    vesta: craters(23, 6, 0.2), psyche: craters(25, 5, 0.2), ganymede: craters(27, 8, 0.1) };
  const tone = (T, v, th) => T[Math.max(0, Math.min(3, Math.floor(v * 4 + th - 0.5)))];
  // the colour of one pixel of a body at unit-disc position (dx, dy); null outside it
  function bodyColor(kind, dx, dy, th, qx, qy) {
    const rr = dx * dx + dy * dy;
    let lim = 1;
    const lp = LUMPY[kind];
    if (lp) { const a = Math.atan2(dy, dx); lim = 1 - lp[0] * vnoise(Math.cos(a) * 1.7 + lp[1], Math.sin(a) * 1.7 + lp[1], lp[1]); }
    if (rr > lim * lim) return null;
    const nz = Math.sqrt(Math.max(0, 1 - rr / (lim * lim)));
    const light = Math.max(0, Math.min(1, (-0.6 * dx - 0.45 * dy + 0.66 * nz) * 1.1));
    let v = light, T = BT[kind] || BT.rock;
    if (kind === 'sun') return tone(BT.sun, 0.45 + 0.4 * nz + (fbm(dx * 9, dy * 9, 13) - 0.5) * 0.4, th);
    if (kind === 'earth') {
      const n = fbm(dx * 2.4 + 3, dy * 2.4 + 1, 3), cl = fbm(dx * 3 + 7 + dy * 1.5, dy * 8 + 2, 8);
      if (Math.abs(dy) > 0.84 + n * 0.1) T = BT.ice;
      else if (cl > 0.62) { T = BT.cloud; v += 0.1; }
      else if (n > 0.52) T = n > 0.66 && Math.abs(dy) < 0.45 ? BT.desert : BT.land;
      else { T = BT.ocean; v *= 0.95; }
      if (light < 0.02 && T === BT.land && hash(qx, qy, 4) > 0.98) return '#ffb547';
    } else if (kind === 'jupiter' || kind === 'saturn' || kind === 'neptune' || kind === 'venus') {
      const f = kind === 'jupiter' ? 16 : kind === 'saturn' ? 10 : kind === 'venus' ? 6 : 7, amp = kind === 'neptune' ? 0.08 : kind === 'venus' ? 0.1 : 0.17;
      v = v * 0.78 + Math.sin(dy * f + fbm(dx * 3, dy * 6, 2) * (kind === 'venus' ? 3.4 : 2.4)) * amp + 0.1;
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
      if (kind === 'europa' && (Math.abs(Math.sin(dx * 9 + dy * 4 + fbm(dx * 3, dy * 3, 4) * 3)) < 0.07 || Math.abs(Math.sin(dx * 3 - dy * 11)) < 0.04)) T = BT.crack;
      if (kind === 'io') { const f2 = fbm(dx * 5, dy * 5, 21); if (f2 > 0.72) return light > 0.2 ? '#1a1008' : '#0e0904'; if (f2 > 0.64) T = BT.storm; }
      if (kind === 'ganymede' && fbm(dx * 3, dy * 3, 31) < 0.45) v *= 0.62;
      if (kind === 'callisto' && hash(qx, qy, 7) > 0.985 && light > 0.15) return '#c8c0b0';
      if (kind === 'ceres' && Math.hypot(dx - 0.2, dy + 0.1) < 0.07 && light > 0.2) return '#ffffff';
      const cr = CRATERS[kind];
      if (cr) for (let i = 0; i < cr.length; i++) {
        const k = cr[i], ex = dx - k[0], ey = dy - k[1], d2 = ex * ex + ey * ey;
        if (d2 < k[2] * k[2]) { const d = Math.sqrt(d2) / k[2]; v += d > 0.72 ? (ex * -0.6 + ey * -0.45 > 0 ? -0.15 : 0.18) : -0.12; break; }
      }
    }
    return tone(T, v, th);
  }
  // planets: 1 art pixel = px world units (1 in the game, 2 for chunky thumbnails)
  function bodyCanvas(kind, r, px = 1) {
    const R = Math.max(3, Math.round(r / px)), ring = kind === 'saturn' ? 2.3 : kind === 'sun' ? 1.3 : 1, rim = kind === 'earth' ? 3 : 0;
    const W = Math.ceil(R * 2 * ring) + 2 + rim * 2, H = Math.ceil(R * 2 * (kind === 'sun' ? ring : 1)) + 2 + rim * 2;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), img = x.createImageData(W, H), dd = img.data;
    const cx = W / 2, cy = H / 2;
    const put = (qx, qy, hx) => { const i = (qy * W + qx) * 4, c = rgb(hx); dd[i] = c[0]; dd[i + 1] = c[1]; dd[i + 2] = c[2]; dd[i + 3] = 255; };
    for (let qy = 0; qy < H; qy++) for (let qx = 0; qx < W; qx++) {
      const dx = (qx + 0.5 - cx) / R, dy = (qy + 0.5 - cy) / R, rr = dx * dx + dy * dy;
      const th = BAYER[(qy & 3) * 4 + (qx & 3)] / 16;
      if (kind === 'saturn') {
        const ry = dy / 0.3, q = dx * dx + ry * ry;
        const band = q > 1.55 && q < 4.6 && !(q > 2.45 && q < 2.62) && !(q > 3.7 && q < 3.82);
        if (band && (rr > 1 || dy > 0)) {
          const sh = rr > 1 && dx > 0.15 && dy < 0.25 && Math.abs(dy) < 0.5 ? 0.25 : 0;
          put(qx, qy, tone(BT.saturn, (q < 2.45 ? 0.45 : q < 3.7 ? 0.8 : 0.55) - sh, th));
          continue;
        }
      }
      if (kind === 'sun' && rr > 1) { const d = (1.3 - Math.sqrt(rr)) / 0.3; if (d > th * 1.1) put(qx, qy, d > 0.7 ? '#ffb547' : d > 0.4 ? '#ff8a3a' : '#a8401a'); continue; }
      if (rr > 1 && !LUMPY[kind]) {
        if (rim && rr < (1 + rim / R) * (1 + rim / R)) {
          const l = -0.6 * dx - 0.45 * dy;
          if (l > (kind === 'venus' ? 0.3 : -0.1)) put(qx, qy, kind === 'venus' ? (l > 0.5 ? '#fff0c0' : '#c8a060') : l > 0.35 ? '#8fd8ff' : l > 0.1 ? '#4a9ae8' : '#24509a');
        }
        continue;
      }
      const col = bodyColor(kind, dx, dy, th, qx, qy);
      if (col) put(qx, qy, col);
    }
    x.putImageData(img, 0, 0);
    return { cv, w: W * px, h: H * px };
  }

  // ---- ships: one blueprint per design, painted from shared primitives at scale k
  const MAT = { // 5-tone ramps: highlight, base, mid, shade, outline
    hull: ['#f6f8ff', '#d4d8ee', '#a9aecb', '#787e9e', '#3c4160'], metal: ['#b8bed8', '#8a90b0', '#646a8a', '#454a68', '#262a40'],
    dark: ['#6a7096', '#4a5074', '#343956', '#23273e', '#14172a'], foam: ['#ffd7a0', '#f0b06a', '#c8843e', '#94582a', '#4a2a14'],
    silver: ['#ffffff', '#e2e6f4', '#b4bbd6', '#7c84a8', '#3c4160'], torch: ['#a69ad6', '#7a6ea6', '#55497c', '#3a3358', '#1c1830'],
    gold: ['#fff0b0', '#ffcf6a', '#d8a040', '#a07020', '#503810'], armor: ['#8e98b8', '#5e6888', '#454e6c', '#2f3650', '#181c2c'],
    white: ['#ffffff', '#eceff8', '#c8cee2', '#949cba', '#4a5070'], ice: ['#f0fdff', '#b4eef6', '#74cede', '#3a8aa8', '#1a4a68'],
    rust: ['#f0a070', '#c8643a', '#9a4424', '#6a2a14', '#36140a'], panel: ['#5a7ae0', '#2f4aa8', '#22388a', '#18286a', '#0c1440'],
    black: ['#3a3e52', '#24273a', '#1a1c2c', '#121420', '#08090f']
  };
  const ramp = (r, h) => { if (h < 3) return 1; if (r === 0 || r === h - 1) return 4; const t = r / (h - 1); return t < 0.18 ? 1 : t < 0.36 ? 0 : t < 0.64 ? 1 : t < 0.84 ? 2 : 3; };
  const CONT = ['#d9643a', '#5c8acb', '#7ee0a1', '#ffb547', '#c9b8ff', '#ff5d8f'];
  function painter(k, mode, liv, cfg, tank) {
    const P = { k, mode, liv, livD: shade(liv, 0.6), cfg, x: 0, cy: 0, g: null, ox: 0, oy: 0, tankK: 1 + 0.15 * tank,
      x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, slots: [], iy0: 0, iy1: 0, det: k >= 0.75, cut: mode === 'cut' };
    P.u = v => Math.max(1, Math.round(v * k));
    P.R = (x, y, w, h, c) => {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      if (w <= 0 || h <= 0) return;
      if (x < P.x0) P.x0 = x; if (y < P.y0) P.y0 = y; if (x + w > P.x1) P.x1 = x + w; if (y + h > P.y1) P.y1 = y + h;
      if (P.g) { P.g.fillStyle = c; P.g.fillRect(x + P.ox, y + P.oy, w, h); }
    };
    // a shaded slice h tall (cylinder look), centred on cy
    P.slice = (x, w, h, T, cy = P.cy) => { h = Math.max(1, Math.round(h)); const ys = Math.round(cy - h / 2); for (let r = 0; r < h; r++) P.R(x, ys + r, w, 1, T[ramp(r, h)]); };
    P.box = (x, y, w, h, T) => {
      P.R(x, y, w, h, T[1]); P.R(x, y, w, 1, T[0]);
      if (h > 4) P.R(x + 1, y + h - 2, w - 2, 1, T[3]);
      P.R(x, y + h - 1, w, 1, T[4]); P.R(x, y, 1, h, T[4]); P.R(x + w - 1, y, 1, h, T[4]);
    };
    P.sphere = (cx, cy, r, T) => {
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        const d = (xx * xx + yy * yy) / (r * r);
        if (d > 1) continue;
        const l = (-xx * 0.5 - yy * 0.7) / r + Math.sqrt(1 - d) * 0.6;
        P.R(cx + xx, cy + yy, 1, 1, T[d > 0.8 ? 4 : l > 0.6 ? 0 : l > 0.3 ? 1 : l > 0 ? 2 : 3]);
      }
    };
    P.line = (x0, y0, x1, y1, c) => { const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) P.R(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 1, 1, c); };
    // ---- parts along the hull, stern to bow (each advances P.x)
    P.bells = (n, h, w) => {
      const W = P.u(w), bh = P.u(h) / n;
      for (let b = 0; b < n; b++) {
        const cy = P.cy + (b - (n - 1) / 2) * bh;
        for (let i = 0; i < W; i++) P.slice(P.x + i, 1, bh * 0.94 * (1 - 0.5 * i / W), MAT.metal, cy);
        if (P.det && bh > 5) { P.R(P.x, cy - bh * 0.32, 1, bh * 0.64, '#1a1420'); P.R(P.x, cy - 1, 1, 2, '#ff8a3a'); }
      }
      P.x += W;
    };
    P.cyl = (w, h, T, o = {}) => {
      const W = P.u(w), H = P.u(h), x0 = P.x;
      P.slice(P.x, W, H, T);
      if (o.rings && P.det) for (let i = P.u(o.rings); i < W - 1; i += P.u(o.rings)) P.slice(P.x + i, 1, H, [T[2], T[2], T[3], T[3], T[4]]);
      if (o.stripe) P.R(P.x, P.cy - H / 2 + Math.max(1, Math.round(H * 0.2)), W, Math.max(1, P.u(2)), o.stripe === 1 ? P.liv : o.stripe);
      if (o.hazard && P.det) for (let i = 2; i < W - 2; i += 3) P.R(P.x + i, P.cy - H / 2 + 2, 1, H - 4, PAL.amber);
      if (o.lights && P.det) for (let i = 3; i < W - 2; i += 6) P.R(P.x + i, P.cy - 1, 2, 2, PAL.cyan);
      P.x += W;
      return { x0, x1: P.x, h: H };
    };
    P.cone = (w, h0, h1, T, curve = 1) => {
      const W = P.u(w), x0 = P.x, a = P.u(h0), b = P.u(h1);
      for (let i = 0; i < W; i++) P.slice(P.x + i, 1, a + (b - a) * Math.pow(i / W, curve), T);
      P.x += W;
      return { x0, x1: P.x };
    };
    P.gap = w => { P.x += P.u(w); };
    P.truss = (w, h) => {
      const W = P.u(w), H = P.u(h), y0 = P.cy - H / 2, y1 = P.cy + H / 2 - 1, x0 = P.x, st = Math.max(2, H);
      P.R(P.x, y0, W, 1, MAT.metal[1]); P.R(P.x, y1, W, 1, MAT.metal[3]);
      for (let i = 0; i < W; i += st) { P.line(P.x + i, y0, Math.min(P.x + i + st, P.x + W - 1), y1, MAT.metal[2]); P.R(P.x + i, y0, 1, H, MAT.metal[1]); }
      P.x += W;
      return { x0, x1: P.x };
    };
    // nuclear drive: nozzle, reactor (hazard stripes), shadow shield
    P.ntr = (w, h) => {
      const x0 = P.x, H = P.u(h);
      for (let i = 0; i < P.u(5); i++) P.slice(P.x + i, 1, H * (0.55 - 0.25 * i / P.u(5)), MAT.metal);
      P.x += P.u(5);
      P.cyl(w - 9, h * 0.7, MAT.dark, { hazard: 1 });
      P.cyl(2, h * 1.5, MAT.metal); P.gap(2);
      return { x0, x1: P.x };
    };
    // fusion torch: long violet drive cone, bright magnetic nozzle ring at the stern
    P.torch = (w, h) => {
      const W = P.u(w), H = P.u(h), x0 = P.x;
      for (let i = 0; i < P.u(2); i++) P.slice(P.x + i, 1, H * 1.12, ['#ffffff', '#c9b8ff', '#9a86e0', '#6a5aa8', '#2a2048']);
      for (let i = P.u(2); i < W; i++) {
        const hh = H * (1 - 0.45 * i / W);
        P.slice(P.x + i, 1, hh, (P.det && i % P.u(5) === 0) ? ['#8a7ec0', '#5e5288', '#43386a', '#2d2748', '#1c1830'] : MAT.torch);
      }
      P.x += W;
      return { x0, x1: P.x };
    };
    // ---- the payload bay: one module per slot. Styles: hull, box, pods, deck, ice
    P.bay = (h, style = 'hull', T = MAT.hull) => {
      const MW = Math.max(3, P.u(14)), H = P.u(h), y0 = Math.round(P.cy - H / 2), x0 = P.x, n = P.cfg.length;
      const wall = Math.max(1, P.u(3));
      P.iy0 = y0 + wall + (P.det ? 1 : 0) + P.oy; P.iy1 = y0 + H - wall + P.oy;
      if (style === 'pods' || style === 'ice') P.truss(n * MW, Math.max(2, H * 0.3)), P.x = x0;
      for (let i = 0; i < n; i++) {
        const mx = x0 + i * MW, ch = P.cfg[i];
        if (style === 'hull') { P.slice(mx, MW, H, T); P.R(mx, y0 + 1, 1, H - 2, T[3]); P.R(mx, y0 + Math.max(1, P.u(3)), MW, Math.max(1, P.u(2)), P.liv); }
        else if (style === 'box') { P.box(mx, y0, MW, H, T); P.R(mx + 1, y0 + Math.max(1, P.u(3)), MW - 2, Math.max(1, P.u(2)), P.liv); }
        else if (style === 'pods') { P.box(mx + 1, y0, MW - 2, H, T); P.R(mx + 2, y0 + 1, MW - 4, Math.max(1, P.u(2)), P.liv); }
        else if (style === 'deck') {
          P.R(mx, y0 + H - P.u(3), MW, P.u(3), MAT.dark[2]);
          if (ch === 'K') { P.box(mx + 1, y0 + P.u(2), MW - 2, H - P.u(5), [shade(CONT[i % 6], 1.25), CONT[i % 6], shade(CONT[i % 6], 0.8), shade(CONT[i % 6], 0.6), shade(CONT[i % 6], 0.35)]); if (P.det) for (let q = mx + 3; q < mx + MW - 2; q += 3) P.R(q, y0 + P.u(3), 1, H - P.u(7), shade(CONT[i % 6], 0.7)); }
          else P.box(mx + 1, y0 + H * 0.35, MW - 2, H * 0.65 - P.u(3), MAT.white);
        } else if (style === 'ice') {
          if (ch === 'K') { P.box(mx + 1, y0, MW - 2, H, MAT.ice); if (P.det) { P.R(mx + 3, y0 + 2, 2, H - 4, '#ffffff'); P.line(mx + 6, y0 + 2, mx + MW - 3, y0 + H - 3, MAT.ice[2]); } }
          else P.box(mx + 1, y0 + 2, MW - 2, H - 4, MAT.white);
        }
        if (P.cut) {
          const iy0 = y0 + wall + (P.det ? 1 : 0), iy1 = y0 + H - wall;
          P.R(mx + 1, iy0, MW - 1, iy1 - iy0, '#141936');
          P.R(mx + 1, iy0, MW - 1, Math.floor((iy1 - iy0) / 2), '#1a2048');
          P.R(mx + 1, iy1 - 1, MW - 1, 1, '#2a3363');
          if (ch === 'K') { P.R(mx + 1, iy0, 1, iy1 - iy0, '#2a3363'); P.R(mx + MW - 1, iy0, 1, iy1 - iy0, '#2a3363'); }
          else if (ch === 'S') { P.R(mx + MW - P.u(4), iy1 - P.u(8), P.u(2), P.u(7), '#3a4270'); P.R(mx + P.u(2), iy1 - P.u(3), MW - P.u(4), P.u(2), '#4a5490'); }
          else { P.R(mx + 2, iy0 + 1, MW - 4, P.u(2), PAL.cyan); P.R(mx + P.u(2), iy1 - P.u(3), MW - P.u(4), P.u(2), '#a07a2a'); P.R(mx + MW - P.u(4), iy1 - P.u(8), P.u(2), P.u(6), '#a07a2a'); }
        } else if (style !== 'deck' && style !== 'ice' || ch !== 'K') {
          const wy = Math.round(P.cy) - (P.det ? 2 : 0);
          if (ch === 'S') {
            if (P.det) for (let q = 2; q < MW - 2; q += 4) { P.R(mx + q, wy, 3, 3, '#1a2a4a'); P.R(mx + q, wy, 2, 2, PAL.cyan); }
            else P.R(mx + 1, wy, Math.max(1, MW - 2), 1, PAL.cyan);
          } else if (ch === 'C') {
            if (P.det) { P.R(mx + 2, wy - 1, MW - 4, 5, MAT.gold[2]); P.R(mx + 3, wy, MW - 6, 3, '#bff6f8'); }
            else P.R(mx + 1, wy, Math.max(1, MW - 2), 1, MAT.gold[1]);
          } else if (style === 'hull' || style === 'box' || style === 'pods') {
            if (P.det) { P.R(mx + 2, y0 + P.u(7), MW - 4, H - P.u(10), T[2]); for (let q = mx + 3; q < mx + MW - 2; q += 3) P.R(q, y0 + P.u(7), 1, H - P.u(10), T[3]); }
            else P.R(mx + 1, Math.round(P.cy), Math.max(1, MW - 2), 1, T[3]);
          }
        }
        if (P.g) P.slots.push({ x: mx + P.ox, w: MW, ch });
      }
      P.x = x0 + n * MW;
      return { x0, x1: P.x, y0, y1: y0 + H, h: H };
    };
    // ---- noses
    P.nose = (shape, w, h, T = MAT.hull) => {
      const W = P.u(w), H = P.u(h), x0 = P.x, top = P.cy - H / 2;
      for (let i = 0; i < W; i++) {
        const t = i / W;
        let hh = H, cy = P.cy, TT = T;
        switch (shape) {
          case 'capsule': hh = H * (1 - 0.55 * t); break;
          case 'ogive': hh = H * Math.sqrt(Math.max(0.03, 1 - t * t)); if (t > 0.72) TT = [shade(P.liv, 1.3), P.liv, P.liv, P.livD, MAT.hull[4]]; break;
          case 'round': hh = H * Math.sqrt(Math.max(0.05, 1 - t * t)); break;
          case 'cockpit': hh = H * Math.sqrt(Math.max(0.1, 1 - Math.pow(t, 3))); break;
          case 'wedge': hh = H * (1 - 0.8 * t); cy = top + hh / 2; break;
          case 'needle': hh = Math.max(1, H * Math.pow(1 - t, 1.6)); break;
          case 'prow': hh = Math.max(2, H * Math.pow(1 - t, 1.25)); cy = P.cy + H * 0.12 * t; break;
          case 'drill': hh = Math.max(1, H * (1 - t)); TT = (P.det && Math.floor(i + hh) % 4 < 2) ? MAT.dark : MAT.metal; break;
          case 'armor': hh = H * (1 - 0.55 * t); TT = MAT.armor; break;
          case 'tug': hh = t > 0.75 ? H * 0.8 : H * 0.95; TT = t > 0.75 ? MAT.metal : T; break;
          case 'car': hh = H * (t > 0.7 ? 0.85 : 1); break;
        }
        P.slice(P.x + i, 1, hh, TT, cy);
        if ((shape === 'prow' || shape === 'needle') && P.det && hh > 4) P.R(P.x + i, cy - hh / 2 + 2, 1, 1, shape === 'prow' ? MAT.gold[1] : P.liv);
      }
      if (P.det) {
        if (shape === 'capsule') { P.R(x0, top - 1, P.u(2), H + 2, MAT.black[1]); P.R(x0 + W * 0.4, P.cy - P.u(3), P.u(3), P.u(3), PAL.cyan); P.R(x0 + W, P.cy - P.u(2), P.u(2), P.u(4), MAT.metal[2]); }
        if (shape === 'cockpit' || shape === 'round') { P.R(x0 + W - P.u(7), P.cy - P.u(4), P.u(4), P.u(3), '#1a2a4a'); P.R(x0 + W - P.u(7), P.cy - P.u(4), P.u(3), P.u(1), '#bff6f8'); }
        if (shape === 'wedge') { P.R(x0 + P.u(4), top + P.u(2), P.u(6), P.u(3), '#1a2a4a'); P.R(x0 + P.u(4), top + P.u(2), P.u(5), 1, '#bff6f8'); }
        if (shape === 'armor') for (let i = P.u(3); i < W - P.u(5); i += P.u(4)) P.R(x0 + i, P.cy - 1, P.u(2), P.u(2), PAL.amber);
        if (shape === 'tug') P.R(x0 + W - 1, P.cy - 1, 1, 2, PAL.rose);
        if (shape === 'prow') { P.R(x0 + P.u(4), P.cy - P.u(4), P.u(10), P.u(3), MAT.gold[2]); P.R(x0 + P.u(5), P.cy - P.u(3), P.u(8), P.u(1), '#bff6f8'); }
      }
      P.x += W;
      return { x0, x1: P.x };
    };
    // ---- overlays (drawn at absolute positions; call after the parts they sit on)
    P.solar = (xc, w, span, hullH) => {
      const W = P.u(w), S = P.u(span);
      for (const d of [-1, 1]) {
        const ym = d < 0 ? P.cy - hullH / 2 - P.u(3) : P.cy + hullH / 2;
        P.R(xc + W / 2, ym, 1, P.u(3), MAT.metal[2]);
        const py = d < 0 ? ym - S : ym + P.u(3);
        P.R(xc, py, W, S, MAT.panel[2]);
        if (P.det) { for (let i = 2; i < W; i += 3) P.R(xc + i, py, 1, S, MAT.panel[4]); for (let j = 2; j < S; j += 3) P.R(xc, py + j, W, 1, MAT.panel[3]); P.R(xc, py, W, 1, MAT.panel[0]); }
      }
    };
    P.radiators = (x0, len, hullH, span, hot) => {
      const L = P.u(len), S = P.u(span), hh = hullH / 2;
      for (let i = 0; i < L; i++) {
        const h = Math.max(1, Math.round(S * (1 - 0.55 * i / L))), c = (P.det && i % P.u(4) === 0) ? '#3f4670' : '#2b3050';
        P.R(x0 + i, P.cy - hh - h, 1, h, c); P.R(x0 + i, P.cy + hh, 1, h, c);
        if (hot) { P.R(x0 + i, P.cy - hh - h, 1, 1, '#ff8a3a'); P.R(x0 + i, P.cy + hh + h - 1, 1, 1, '#ff8a3a'); }
      }
    };
    P.fins = (x, hullH, size, T = MAT.metal) => { const S = P.u(size); for (let i = 0; i < S; i++) { const h = Math.max(1, Math.round(S * 0.8 * (1 - i / S))); P.R(x + i, P.cy - hullH / 2 - h, 1, h, T[2]); P.R(x + i, P.cy + hullH / 2, 1, h, T[3]); } };
    P.gridfins = (x, hullH) => { if (!P.det) return; const s = P.u(4); for (const y of [P.cy - hullH / 2 - s, P.cy + hullH / 2]) { P.R(x, y, s, s, MAT.metal[3]); P.R(x + 1, y + 1, s - 2, s - 2, MAT.metal[1]); P.R(x + s / 2 - 0.5, y, 1, s, MAT.metal[3]); } };
    P.legs = (xa, xb, hullH, len) => {
      const L = P.u(len), yb = P.cy + hullH / 2;
      for (const [x, d] of [[xa, -1], [xb, 1]]) { P.line(x, yb, x + d * L * 0.5, yb + L, MAT.metal[2]); P.R(x + d * L * 0.5 - P.u(2), yb + L, P.u(4), Math.max(1, P.u(1.5)), MAT.metal[1]); }
    };
    P.delta = (x0, len, span) => {
      const L = P.u(len), S = P.u(span), y = P.cy + P.u(4);
      for (let i = 0; i < L; i++) { const d = Math.round(S * (1 - i / L)); P.R(x0 + i, y, 1, d, i % P.u(6) === 0 && P.det ? MAT.hull[3] : MAT.hull[2]); P.R(x0 + i, y + d - 1, 1, 1, P.liv); }
    };
    P.tail = (x, h, w) => { const W = P.u(w), Hh = P.u(h); for (let i = 0; i < W; i++) { const hh = Math.round(Hh * (1 - i / W)); P.R(x + i, P.cy - P.u(6) - hh, 1, hh, i < 2 ? P.liv : MAT.hull[1]); } };
    P.boosters = (x0, len, bh, off) => {
      for (const d of [-1, 1]) {
        const cy = P.cy + d * off, L = P.u(len), B = P.u(bh);
        for (let i = 0; i < P.u(4); i++) P.slice(x0 - P.u(4) + i, 1, B * (0.9 - 0.3 * i / P.u(4)), MAT.metal, cy);
        P.slice(x0, L, B, MAT.white, cy);
        if (P.det) P.R(x0 + P.u(3), cy - 1, L - P.u(6), 2, P.liv);
        for (let i = 0; i < P.u(7); i++) P.slice(x0 + L + i, 1, B * (1 - i / P.u(7)), MAT.white, cy);
      }
    };
    P.hab = (cx, hullH, ring) => { // spin-hab ring seen edge-on, with spokes
      const rx = P.u(5), ry = P.u(ring), th = Math.max(1, P.u(2));
      for (let a = 0; a < 360; a += 2) { const r = a * Math.PI / 180, x = cx + Math.cos(r) * rx, y = P.cy + Math.sin(r) * ry; P.R(x, y, th, th, Math.sin(r) < 0 ? MAT.white[1] : MAT.white[3]); }
      P.R(cx, P.cy - ry, 1, ry - hullH / 2, MAT.metal[2]); P.R(cx, P.cy + hullH / 2, 1, ry - hullH / 2, MAT.metal[2]);
      if (P.det) for (let a = 20; a < 360; a += 40) { const r = a * Math.PI / 180; P.R(cx + Math.cos(r) * rx, P.cy + Math.sin(r) * ry, 1, 1, PAL.cyan); }
    };
    P.dome = (cx, ytop, r) => { const R = P.u(r); for (let yy = 0; yy < R; yy++) { const w = Math.round(Math.sqrt(R * R - yy * yy)); P.R(cx - w, ytop - yy - 1, w * 2, 1, yy > R * 0.6 ? '#bff6f8' : '#5ce1e6'); } if (P.det) P.R(cx - R * 0.4, ytop - R * 0.7, 2, 1, '#ffffff'); };
    P.dish = (cx, ytop) => { if (!P.det) return; P.R(cx, ytop - 3, 1, 3, MAT.metal[2]); P.R(cx - 3, ytop - 5, 7, 2, MAT.metal[1]); P.R(cx - 2, ytop - 6, 5, 1, MAT.metal[0]); };
    P.ringCollar = (cx, h) => { const H = P.u(h); P.slice(cx - P.u(2), P.u(4), H, MAT.metal); if (P.det) { P.R(cx - P.u(2), P.cy - H / 2, P.u(4), 1, PAL.cyan); P.R(cx - P.u(2), P.cy + H / 2 - 1, P.u(4), 1, PAL.cyan); } };
    P.tether = (x, h) => { P.R(x, P.cy - P.u(h), 1, P.u(h) * 2, '#8d95c4'); for (const d of [-1, 1]) P.sphere(x, P.cy + d * P.u(h * 0.45), Math.max(1, P.u(3)), MAT.dark); };
    P.armorTeeth = (x0, x1, hullH) => { if (!P.det) return; for (let x = x0; x < x1; x += P.u(6)) { P.R(x, P.cy - hullH / 2 - P.u(2), P.u(4), P.u(2), MAT.armor[2]); P.R(x + 1, P.cy + hullH / 2, P.u(4), P.u(2), MAT.armor[3]); } };
    return P;
  }
  const tl = (P, w) => w * P.tankK; // propellant tanks grow with the tank upgrade
  const SHIP_ART = {
    kestrel: P => { P.bells(1, 10, 7); const s = P.cyl(16, 14, MAT.metal, { rings: 5 }); P.solar(s.x0 + P.u(3), 10, 13, P.u(14)); P.cyl(tl(P, 6), 12, MAT.foam); P.bay(18, 'hull', MAT.white); P.nose('capsule', 18, 18, MAT.white); },
    mule: P => { const x0 = P.x; P.bells(2, 18, 8); P.cyl(tl(P, 16), 22, MAT.foam, { rings: 7 }); P.cone(5, 22, 28, MAT.hull); P.bay(28, 'box'); P.nose('round', 12, 28); P.fins(x0 + P.u(8), P.u(22), 8); },
    sparrow: P => { const x0 = P.x; P.bells(1, 8, 6); const t = P.cyl(tl(P, 34), 10, MAT.foam, { rings: 8, stripe: 1 }); P.cone(4, 10, 17, MAT.hull); P.bay(17, 'hull'); P.nose('ogive', 14, 17); P.gridfins(t.x1 - P.u(7), P.u(10)); P.fins(x0 + P.u(6), P.u(10), 6); },
    ferry: P => { P.bells(2, 12, 5); P.truss(6, 8); const x = P.x; P.sphere(x + P.u(7), P.cy - P.u(5), P.u(6), MAT.silver); P.sphere(x + P.u(7), P.cy + P.u(5), P.u(6), MAT.silver); P.x += P.u(14); P.bay(14, 'pods'); P.nose('cockpit', 10, 12); },
    heron: P => { const x0 = P.x; P.bells(1, 10, 6); const x = P.x; P.sphere(x + P.u(7), P.cy, P.u(8), MAT.foam); P.x += P.u(15); P.bay(18, 'box', MAT.white); P.nose('cockpit', 10, 18, MAT.white); P.legs(x0 + P.u(8), P.x - P.u(6), P.u(18), 16); },
    gull: P => { const x0 = P.x; P.bells(3, 14, 6); P.cyl(12, 18, MAT.white); P.bay(18, 'hull', MAT.white); P.nose('ogive', 22, 18, MAT.white); P.delta(x0 + P.u(6), P.u(44), 12); P.tail(x0 + P.u(6), 12, 14); },
    atlas: P => { const x0 = P.x; P.bells(3, 26, 8); const t = P.cyl(tl(P, 30), 26, MAT.foam, { rings: 10 }); P.boosters(t.x0 + P.u(4), 26, 10, P.u(18)); P.cone(4, 26, 30, MAT.hull); P.bay(30, 'hull'); P.nose('ogive', 24, 30); P.fins(x0 + P.u(8), P.u(26), 7); },
    climber: P => { P.tether(P.x + P.u(5), 26); P.gap(10); P.bay(28, 'box', MAT.white); P.nose('car', 6, 28, MAT.white); },
    drake: P => { const x0 = P.x; P.ntr(18, 16); P.truss(8, 5); const t = P.cyl(tl(P, 26), 18, MAT.silver, { rings: 8 }); P.radiators(x0 + P.u(14), P.u(30), P.u(18), 11, false); P.truss(6, 5); P.bay(20, 'hull'); P.nose('cockpit', 12, 20); },
    barge: P => { const x0 = P.x; P.ntr(18, 16); P.cyl(tl(P, 18), 16, MAT.silver, { rings: 6 }); P.radiators(x0 + P.u(14), P.u(22), P.u(16), 10, false); P.bay(24, 'deck'); P.nose('tug', 10, 12, MAT.metal); },
    kite: P => { const x0 = P.x; P.bells(2, 12, 6); P.cyl(tl(P, 10), 18, MAT.white); const b = P.bay(20, 'hull', MAT.white); P.nose('wedge', 24, 20, MAT.white); P.R(x0 + P.u(6), b.y1 - P.u(3), P.x - x0 - P.u(14), P.u(3), MAT.black[1]); P.fins(x0 + P.u(6), P.u(18), 6, MAT.white); P.legs(x0 + P.u(12), P.x - P.u(14), P.u(20), 12); },
    lantern: P => { P.bells(2, 10, 5); P.cone(8, 12, 17, MAT.white); const b = P.bay(17, 'hull', MAT.white); P.nose('prow', 24, 17, MAT.white); P.R(b.x0, P.cy + P.u(5), P.x - b.x0 - P.u(6), 1, MAT.gold[1]); },
    pod: P => { P.cyl(4, 8, MAT.dark); const b = P.bay(18, 'box', MAT.metal); P.nose('round', 8, 18, MAT.metal); P.ringCollar(b.x0 + (b.x1 - b.x0) / 2, 28); },
    wasp: P => { const x0 = P.x; P.torch(20, 18); P.cyl(tl(P, 7), 14, MAT.armor); P.radiators(x0 + P.u(10), P.u(20), P.u(14), 12, true); const b = P.bay(14, 'box', MAT.armor); P.nose('wedge', 20, 14, MAT.armor); P.armorTeeth(b.x0, P.x - P.u(10), P.u(14)); },
    ox: P => { const x0 = P.x; P.torch(30, 26); P.cyl(tl(P, 12), 26, MAT.dark, { lights: 1 }); P.radiators(x0 + P.u(15), P.u(36), P.u(26), 18, true); const b = P.bay(30, 'box', MAT.armor); P.nose('armor', 18, 30); P.dish(b.x0 + P.u(20), P.cy - P.u(15)); P.armorTeeth(b.x0, b.x1, P.u(30)); },
    iceboat: P => { const x0 = P.x; P.torch(24, 22); P.cyl(tl(P, 10), 18, MAT.silver); P.radiators(x0 + P.u(12), P.u(26), P.u(18), 16, true); P.bay(24, 'ice'); P.nose('tug', 10, 14, MAT.metal); },
    pilgrim: P => { const x0 = P.x; P.torch(26, 24); P.cyl(tl(P, 12), 24, MAT.white, { stripe: 1 }); P.radiators(x0 + P.u(13), P.u(28), P.u(24), 16, true); const b = P.bay(24, 'hull', MAT.white); P.nose('round', 16, 24, MAT.white); P.hab(b.x0 + (b.x1 - b.x0) * 0.35, P.u(24), 26); P.dome(P.x - P.u(10), P.cy - P.u(10), 5); },
    prospector: P => { const x0 = P.x; P.torch(18, 16); P.cone(14, 16, 24, MAT.rust); P.radiators(x0 + P.u(9), P.u(16), P.u(16), 10, true); P.bay(18, 'box', MAT.rust); P.nose('drill', 18, 16); P.legs(x0 + P.u(20), P.x - P.u(22), P.u(24), 12); },
    packet: P => { const x0 = P.x; P.torch(22, 16); P.radiators(x0 + P.u(11), P.u(14), P.u(14), 9, true); P.cyl(tl(P, 6), 14, MAT.white, { stripe: 1 }); const b = P.bay(14, 'hull', MAT.white); P.nose('needle', 36, 14, MAT.white); P.R(b.x0, P.cy + P.u(4), P.x - b.x0 - P.u(16), 1, P.liv); },
    yacht: P => { const x0 = P.x; P.torch(20, 16); P.radiators(x0 + P.u(10), P.u(14), P.u(16), 9, true); P.cone(10, 14, 19, MAT.white); const b = P.bay(19, 'hull', MAT.white); P.nose('prow', 30, 19, MAT.white); P.dome(b.x0 + (b.x1 - b.x0) / 2, P.cy - P.u(9.5), 6); P.R(b.x0, P.cy + P.u(6), P.x - b.x0 - P.u(8), 1, MAT.gold[1]); }
  };
  // design D, slot layout cfg, livery colour, tank upgrade level, mode 'big' | 'cut' | 'icon'
  function shipCanvas(D, cfg, liv, tank, mode) {
    const spec = SHIP_ART[D.k];
    const run = (k, g, ox, oy) => { const P = painter(k, mode, liv, cfg, tank); P.g = g; P.ox = ox; P.oy = oy; spec(P); return P; };
    let k = 1, m = run(1, null, 0, 0);
    if (mode === 'icon') { k = Math.min(0.55, 52 / (m.x1 - m.x0), 26 / (m.y1 - m.y0)); m = run(k, null, 0, 0); }
    const w = m.x1 - m.x0, h = m.y1 - m.y0;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const P = run(k, cv.getContext('2d'), -m.x0, -m.y0);
    return { cv, slots: P.slots, iy0: P.iy0, iy1: P.iy1, cy: -m.y0, w, h };
  }

  // ---- people and cargo (by job type)
  const SKIN = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69'], HAIR = ['#2a1a10', '#6a4020', '#d8b060', '#1a1a24'];
  const PAX_STYLE = [ // c clothes, d detail, p trousers, h headgear colour (or null for hair)
    { c: '#f08a2a', d: '#ffffff', p: '#c86a1a' },                      // crew rotation: orange flight suits
    { c: null, d: '#ffffff', p: '#3a4a8a' },                           // tourists: bright shirts
    { c: '#f4f6ff', d: '#5ce1e6', p: '#4a5074' },                      // scientists: white coats
    { c: '#7a8090', d: '#ffe040', p: '#4a4e5c', h: '#ffd040' },        // engineers: hi-vis and hard hats
    { c: '#8a6a44', d: '#c8a070', p: '#5a4430', h: '#5a3e24' },        // colonists: earth tones, hats
    { c: '#4a5060', d: '#ffb547', p: '#2e3240', h: '#ffb547', lamp: 1 } // miners: helmets with lamps
  ];
  const TOURIST = ['#ff5d8f', '#5ce1e6', '#7ee0a1', '#ffb547'];
  function paxSprite(t, i, vip) {
    const st = PAX_STYLE[Math.min(5, t)], skin = SKIN[i % 4];
    const head = vip ? HAIR[3] : st.h || HAIR[(i >> 1) % 4];
    const rows = [
      st.h && !vip ? '.hhhhhh.' : '..hhhh..',
      st.lamp && !vip ? '.hhwhhh.' : '.hhhhhh.',
      '.hffffh.', '..fefe..', '..ffff..', '...ff...',
      '.cccccc.', vip ? 'ccc..ccc' : st.c === '#7a8090' ? 'cddccddc' : 'ccdccdcc', vip ? 'fcc..ccf' : 'fccddccf',
      '.cccccc.', '.pp..pp.', '.kk..kk.'];
    if (vip) { rows[7] = 'cccddccc'; rows[8] = 'fccddccf'; }
    return pixCanvas(rows, { h: head, w: '#ffffff', f: skin, e: '#1a1a24', c: vip ? '#ffcf6a' : st.c || TOURIST[i % 4], d: vip ? '#1a1a24' : st.d, p: vip ? '#a07020' : st.p, k: '#1a1a24' });
  }
  // 12×10 cargo pictures; colours: a main, b light, c dark, d accent, e extra
  const CARGO_ART = {
    6: [['.....d......', '.....c......', 'aaaa.cc.aaaa', 'abab.bb.abab', 'aaaacbbcaaaa', 'abab.bb.abab', 'aaaa.bb.aaaa', '.....cc.....', '....cccc....', '............'], { a: '#2f4aa8', b: '#d4d8ee', c: '#8a90b0', d: '#ff5d8f' }],
    7: [['............', '..cccccccc..', '.caaaaaaaac.', 'cbbbbbbbbbbc', 'caaaaaaaaaac', 'cdddddddddc.', 'caaaaaaaaaac', '.caaaaaaaac.', '..cccccccc..', '............'], { a: '#f0b06a', b: '#ffd7a0', c: '#94582a', d: '#c8843e' }],
    8: [['cccccccccccc', 'cbbbbbbbbbbc', 'cba.aaaa.abc', 'cb.aa..aa.bc', 'cbaa.dd.aabc', 'cbaa.dd.aabc', 'cb.aa..aa.bc', 'cba.aaaa.abc', 'cbbbbbbbbbbc', 'cccccccccccc'], { a: '#3a3e52', b: '#ffb547', c: '#94582a', d: '#ffd7a0' }],
    9: [['cccccccccccc', 'cbbbbbbbbbbc', 'cbbbbabbbbbc', 'cbbbaaabbbbc', 'cbbddaddbbbc', 'cbbddddddbbc', 'cbbbddddbbbc', 'cbbbbddbbbbc', 'cbbbbbbbbbbc', 'cccccccccccc'], { a: '#3a7a2a', b: '#7ee0a1', c: '#2f6634', d: '#ff5d8f' }],
    10: [['cccccccccccc', 'cbbbbbbbbbbc', 'cbbbbddbbbbc', 'cbbbbddbbbbc', 'cbbddddddbbc', 'cbbddddddbbc', 'cbbbbddbbbbc', 'cbbbbddbbbbc', 'cbbbbbbbbbbc', 'cccccccccccc'], { b: '#ffffff', c: '#8d95c4', d: '#e8394d' }],
    11: [['cccccccccccc', 'caaaaaaaaaac', 'ca.d.d.d.d.c', 'caddddddddac', 'cadbbbbbbdac', 'cadbbbbbbdac', 'caddddddddac', 'ca.d.d.d.d.c', 'caaaaaaaaaac', 'cccccccccccc'], { a: '#18286a', b: '#3a3e52', c: '#0c1440', d: '#5ce1e6' }],
    12: [['....cccc....', '...cbbbbc...', '...caaaac...', '...cadda.c..', '...caddac...', '...caddac...', '...caddac...', '...caaaac...', '...cbbbbc...', '....cccc....'], { a: '#5a7090', b: '#c8cee2', c: '#3a4060', d: '#7ee8ff' }],
    13: [['....c..c....', '.....cc.....', '...aaaaaa...', '..aaaaaaaa..', '.aabaaaabaa.', '.aaaaaaaaaa.', '.aaaabaaaaa.', '.aaaaaaaaaa.', '..aaaaaaaa..', '............'], { a: '#806c56', b: '#ae977a', c: '#524536' }],
    14: [['..cccccccc..', '.cbbbbbbbbc.', 'cbbaaaaaaabc', 'cbaabaaaaabc', 'cbaaaaaaaabc', 'cbaaaaabaabc', 'cbaaaaaaaabc', 'cbbaaaaaaabc', '.cbbbbbbbbc.', '..cccccccc..'], { a: '#74cede', b: '#e8fbff', c: '#3a8aa8' }],
    15: [['............', '....cccc....', '..ccaaaacc..', '.caaabaaaac.', 'caadaaaaabac', 'caaaaaadaaac', '.caabaaaaac.', '..caaaaaac..', '....cccc....', '............'], { a: '#6c5c4c', b: '#ae977a', c: '#2a221c', d: '#ffcf6a' }],
    16: [['cccccccccccc', 'cadadadadadc', 'cdbbbbbbbbac', 'cabbbaabbbdc', 'cdbbaaaabbac', 'cabbaaaabbdc', 'cdbbbaabbbac', 'cabbbbbbbbdc', 'cdadadadadac', 'cccccccccccc'], { a: '#ffd040', b: '#3a3e52', c: '#1a1c2c', d: '#1a1a24' }],
    17: [['...cccccc...', '..cbbbbbbc..', '..caaaaaac..', '..cadddaac..', '..caaaaaac..', '..cadddaac..', '..caaaaaac..', '..caaaaaac..', '..cbbbbbbc..', '...cccccc...'], { a: '#3aa898', b: '#9ef0e0', c: '#1a5a54', d: '#e9ecff' }],
    18: [['cccccccccccc', 'caaaaaaaaaac', 'cadadadadadc', 'cadadadadadc', 'caaaaaaaaaac', 'cadadadadadc', 'cadadadadadc', 'caaaaaaaaaac', 'caaaaaaaaaac', 'cccccccccccc'], { a: '#34384e', c: '#1a1c2c', d: '#c9b8ff' }],
    19: [['............', '.cccccccccc.', 'cbbbbbbbbbbc', 'cbaaaaaaaabc', 'cbaaaaaadabc', 'cbaaaaaaaabc', 'cbaaaaaaaabc', 'cbbbbbbbbbbc', '.cccccccccc.', '............'], { a: '#b4bbd6', b: '#e2e6f4', c: '#4a5070', d: '#5ce1e6' }],
    20: [['cccccccccccc', 'cab......bac', 'c.ab....ba.c', 'c..ab..ba..c', 'c...abba...c', 'c...baab...c', 'c..ba..ab..c', 'c.ba....ab.c', 'cba......abc', 'cccccccccccc'], { a: '#8a90b0', b: '#d4d8ee', c: '#454a68' }],
    21: [['..cccccccc..', '.cdddddddcc.', 'cdaaaaaaaadc', 'cdabbbbbbadc', 'cdabcccbbadc', 'cdabcccbbadc', 'cdabbbbbbadc', 'cdaaaaaaaadc', '.cdddddddcc.', '..cccccccc..'], { a: '#2a2c3a', b: '#4a4e64', c: '#8d95c4', d: '#646a8a' }],
    22: [['............', 'cccccccccccc', 'caaaaaaaaaac', '.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', 'caaaaaaaaaac', 'cccccccccccc', '............'], { a: '#8a90b0', c: '#454a68' }],
    23: [['...cccccc...', '..cbbbbbbc..', '.cbaaaaaabc.', 'cbadaadaabc.', 'cbaaaaaaaabc', 'cbadaadaaabc', 'cbaaaaaaaabc', '.cbaaaaaabc.', '..cbbbbbbc..', '...cccccc...'], { a: '#d4d8ee', b: '#ffffff', c: '#787e9e', d: '#5ce1e6' }],
    24: [['............', '....cccc....', '..ccbbbbcc..', '.cbbbddbbbc.', '.cbbddddbbc.', 'cbbddddddbbc', 'cbbbbddbbbbc', 'caaaaaaaaaac', 'caaaaaaaaaac', 'cccccccccccc'], { a: '#7a8090', b: '#bff6f8', c: '#454a68', d: '#4f8f46' }],
    25: [['cccccccccccc', 'caaaaaaaaaac', 'cadadadadadc', 'caaaaaaaaaac', 'cbbbbbbbbbbc', 'cbbbbbbbbbbc', 'caaaaaaaaaac', 'cadadadadadc', 'caaaaaaaaaac', 'cccccccccccc'], { a: '#d4d8ee', b: '#ffb547', c: '#787e9e', d: '#5ce1e6' }],
    26: [['.....c......', '....cdc.....', '.....c......', '..aaaaaaa...', '.abababaab..', '.aaaaaaaaa..', '.abababaab..', '..aaaaaaa...', '...c...c....', '............'], { a: '#ffcf6a', b: '#d8a040', c: '#8a90b0', d: '#ff5d8f' }],
    27: [['............', 'aaa......aaa', 'aba..cc..aba', 'aaacbbbbcaaa', 'aba.bddb.aba', 'aaacbbbbcaaa', 'aba..cc..aba', 'aaa......aaa', '............', '............'], { a: '#2f4aa8', b: '#d4d8ee', c: '#8a90b0', d: '#5ce1e6' }],
    28: [['............', '..........c.', '.cccccccccd.', 'cbbbbbbbbbbc', 'caaaaaaaaaab', 'cbbbbbbbbbbc', '.cccccccccd.', '...c....c...', '...c....c...', '..ccc..ccc..'], { a: '#e9ecff', b: '#ffcf6a', c: '#787e9e', d: '#ffb547' }]
  };
  function cargoSprite(t) { const a = CARGO_ART[t] || CARGO_ART[8]; return pixCanvas(a[0], a[1]); }
  // 16×16 list icons: portraits for passengers, the cargo picture for cargo
  function jobIcon(t, vip) {
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    const g = cv.getContext('2d');
    if (!JT[t].p) { g.drawImage(cargoSprite(t), 2, 3); return cv; }
    const st = PAX_STYLE[Math.min(5, t)], i = t * 3 + (vip ? 1 : 0);
    const head = vip ? HAIR[3] : st.h || HAIR[i % 4];
    const rows = [
      st.h && !vip ? '...hhhhhhhhhh...' : '.....hhhhhh.....',
      st.h && !vip ? '..hhhhhhhhhhhh..' : '....hhhhhhhh....',
      st.lamp && !vip ? '...hhhhwwhhhhh..' : '...hhhhhhhhhh...',
      '...hffffffffh...', '...ffffffffff...', '...ffeffffeff...', '...ffffffffff...', '....ffffffff....', '....fffmmfff....',
      '.....ffffff.....', '......ffff......', '...cccccccccc...', '..cccccddccccc..', '.cccccddddccccc.', '.ccccccddcccccc.', '.cccccccccccccc.'];
    return pixCanvas(rows, { h: head, w: '#ffffff', f: SKIN[i % 4], e: '#1a1a24', m: '#8a3a2a', c: vip ? '#ffcf6a' : st.c || TOURIST[i % 4], d: vip ? '#1a1a24' : st.d });
  }
  // research icons: one 12×12 motif per technology, in its branch colour; level pips for II/III
  const MOTIF = {
    bell: ['....bbbb....', '....baab....', '....baab....', '...baaaab...', '...aaaaaa...', '..aaaaaaaa..', '..aaaaaaaa..', '.aaaaaaaaaa.', '.cccccccccc.', '..d.d..d.d..', '...d....d...', '............'],
    booster: ['.....bb.....', '....baab....', '....aaaa....', '....aaaa....', '.b..aaaa..b.', 'ba..aaaa..ab', 'aa..aaaa..aa', 'aa..aaaa..aa', 'aa.aaaaaa.aa', 'cc.cccccc.cc', '.d..d..d..d.', '............'],
    fairing: ['.....bb.....', '....baab....', '...baaaab...', '..baaaaaab..', '..aaaaaaaa..', '..acccccca..', '..acddddca..', '..acccccca..', '..aaaaaaaa..', '..aaaaaaaa..', '..cccccccc..', '............'],
    capsule: ['.....bb.....', '....baab....', '...baaaab...', '...aaddaa...', '..aaaddaaa..', '..aaaaaaaa..', '.aaaaaaaaaa.', '.cccccccccc.', '..aaaaaaaa..', '..aaaaaaaa..', '..bbbbbbbb..', '............'],
    tank: ['....bbbb....', '..baaaaaab..', '.baaaaaaaab.', '.aaaaaaaaaa.', '.aaaaaaaaaa.', '.cccccccccc.', '.aaaaaaaaaa.', '.aaaaaaaaaa.', '.aaaaaaaaaa.', '..aaaaaaaa..', '....cccc....', '...cc..cc...'],
    kit: ['bbbbbbbbbbbb', 'ba........ab', 'b.a......a.b', 'b..a....a..b', 'b...a..a...b', 'b....aa....b', 'b....aa....b', 'b...a..a...b', 'b..a....a..b', 'b.a......a.b', 'ba........ab', 'bbbbbbbbbbbb'],
    lander: ['....bbbb....', '...baaaab...', '...addaaa...', '...aaaaaa...', '..cccccccc..', '..aaaaaaaa..', '...aaaaaa...', '..a......a..', '.a........a.', '.a........a.', 'bbb......bbb', '............'],
    plan: ['............', 'bb..........', 'bb..........', '..a.........', '...a....dd..', '....a...dd..', '.....aa.....', '.......a....', '........a...', '.........a..', '.........bb.', '.........bb.'],
    tower: ['.....dd.....', '.....bb.....', '....baab....', '....aaaa....', '.....aa.....', '....a..a....', '....aaaa....', '...a....a...', '...aaaaaa...', '..a......a..', '..aaaaaaaa..', '.bbbbbbbbbb.'],
    coin: ['....bbbb....', '..bbaaaabb..', '.baaaaaaaab.', '.baaaddaaab.', 'baaadaaaaaab', 'baaaaddaaaab', 'baaaaaadaaab', 'baaaaddaaaab', '.baaaaaaaab.', '.baaaaaaaab.', '..bbaaaabb..', '....bbbb....'],
    tether: ['.....bb.....', '.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', '...cccccc...', '...cddddc...', '...cccccc...', '.....aa.....', '.....aa.....', '..bbbbbbbb..', '.bbbbbbbbbb.'],
    atom: ['............', '.aa......aa.', '..aa....aa..', '...aa..aa...', '....abba....', 'aaaabddbaaaa', 'aaaabddbaaaa', '....abba....', '...aa..aa...', '..aa....aa..', '.aa......aa.', '............'],
    star: ['.....dd.....', '.....bb.....', '..d..bb..d..', '...bbbbbb...', '...bbaabb...', 'dbbbaaaabbbd', 'dbbbaaaabbbd', '...bbaabb...', '...bbbbbb...', '..d..bb..d..', '.....bb.....', '.....dd.....'],
    flame: ['.....b......', '....bb......', '....bab.....', '...baab.....', '...baaab....', '..baadab....', '..badddab...', '..baddddab..', '..badddab...', '...baaab....', '....bbb.....', '............'],
    crate: ['............', 'cccccccccccc', 'caaaaaaaaaac', 'cabbbbbbbbac', 'cabaaaaaabac', 'cabaaaaaabac', 'cabaaaaaabac', 'cabaaaaaabac', 'cabbbbbbbbac', 'caaaaaaaaaac', 'cccccccccccc', '............'],
    modules: ['............', 'aaa.aaa.aaa.', 'aba.aba.aba.', 'aaa.aaa.aaa.', '.c...c...c..', 'cccccccccccc', '.c...c...c..', 'aaa.aaa.aaa.', 'aba.ada.aba.', 'aaa.aaa.aaa.', '............', '............'],
    seat: ['...bbbb.....', '...baab.....', '...baab.....', '...baab.....', '...baabbbbb.', '...baaaaaab.', '...baaaaaab.', '...bbbbbbbb.', '...c....c...', '...c....c...', '..ccc..ccc..', '............'],
    shield: ['.cccccccccc.', '.caaaaaaaac.', '.caaaaaaaac.', '.cabbbbbbac.', '.caaaaaaaac.', '.caaaaaaaac.', '..caaaaaac..', '..caaaaaac..', '...caaaac...', '....caac....', '.....cc.....', '............'],
    drop: ['.....b......', '.....b......', '....bab.....', '....bab.....', '...baaab....', '...baaab....', '..baaaaab...', '..baaaaab...', '..baaaaab...', '...baaab....', '....bbb.....', '............'],
    ring: ['....aaaa....', '..aa....aa..', '.a........a.', '.a...dd...a.', 'a...dddd...a', 'a..dddddd..a', 'a..dddddd..a', 'a...dddd...a', '.a...dd...a.', '.a........a.', '..aa....aa..', '....aaaa....'],
    robot: ['.....dd.....', '.....cc.....', '..aaaaaaaa..', '..abbaabba..', '..abbaabba..', '..aaaaaaaa..', '..acddddca..', '..aaaaaaaa..', '.caaaaaaaac.', '.c.aaaaaa.c.', '...a....a...', '..aa....aa..'],
    wrench: ['.........bb.', '........b..b', '........b.b.', '.......aab..', '......aa....', '.....aa.....', '....aa......', '...aa.......', '..aa........', '.aa.........', 'aa..........', 'a...........'],
    couch: ['............', '.bb.........', '.bab........', '.baab.......', '.baaab......', '.baaaabbbbb.', '.baaaaaaaab.', '.bbbbbbbbbb.', '..c......c..', '..c......c..', '.cc......cc.', '............'],
    container: ['cccccccccccc', 'caaaaaaaaaac', 'cabababababc', 'cabababababc', 'caaaaaaaaaac', 'cccccccccccc', 'cddddddddddc', 'cdbdbdbdbdbc', 'cdbdbdbdbdbc', 'cddddddddddc', 'cccccccccccc', '............'],
    ice: ['............', '..cccccccc..', '.cbbbbbbbbc.', 'cbbaaaaaabbc', 'cbaabaaaaabc', 'cbaaaaaaaabc', 'cbaaaaabaabc', 'cbaaaaaaaabc', 'cbbaaaaaabbc', '.cbbbbbbbbc.', '..cccccccc..', '............'],
    gem: ['............', '...bbbbbb...', '..baaaaaab..', '.baadaadaab.', 'bbbbbbbbbbbb', '.baaaaaaaab.', '..baaaaaab..', '...baaaab...', '....baab....', '.....bb.....', '............', '............'],
    drill: ['............', 'cc..........', 'cccc........', 'caacccc.....', 'caaaaaabbb..', 'caaaaaaaabbb', 'caaaaaaaabbb', 'caaaaaabbb..', 'caacccc.....', 'cccc........', 'cc..........', '............'],
    station: ['....aaaa....', '..aa....aa..', '.a...bb...a.', '.a...bb...a.', 'a..bbbbbb..a', 'a..bddddb..a', 'a..bddddb..a', 'a..bbbbbb..a', '.a...bb...a.', '.a...bb...a.', '..aa....aa..', '....aaaa....'],
    pick: ['..bbbbbbbb..', '.b...aa...b.', 'b....aa....b', '.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', '............'],
    flask: ['....cccc....', '.....aa.....', '.....aa.....', '.....aa.....', '....aaaa....', '...aaaaaa...', '..aaddddaa..', '.aaddddddaa.', '.adddddddda.', '.adddddddda.', '.aaaaaaaaaa.', '............']
  };
  const TECH_MOTIF = { meth: ['bell'], reuse: ['booster'], fair: ['fairing'], crew2: ['capsule'], depot: ['tank'], kits: ['kit'], lander: ['lander'],
    plan: ['plan'], atc: ['tower'], broker: ['coin'], tether: ['tether'], ntr: ['atom'], bimodal: ['atom', 2], fusion: ['star'], torch: ['flame'],
    heavy: ['crate'], modular: ['modules'], cabin: ['seat'], aero: ['shield'], isru: ['drop'], driver: ['ring'], auto1: ['robot', 1], insure: ['shield'],
    salvage: ['wrench'], isp: ['flame', 2], hig: ['couch'], bulk: ['container'], spinhab: ['ring', 2], icehaul: ['ice'], lux: ['gem'], hopper: ['drill'],
    spin: ['station'], icemine: ['pick'], auto2: ['robot', 2], auto3: ['robot', 3], consort: ['flask'] };
  const BRANCH_COL = [['#ffb547', '#ffe0a0', '#94582a'], ['#5ce1e6', '#d0fbff', '#2a6a7a'], ['#7ee0a1', '#d8ffe4', '#2f6634'], ['#c9b8ff', '#f0e8ff', '#5a4a9a']];
  function techIcon(k) {
    const T = TECH[TI[k]], m = TECH_MOTIF[k] || ['crate'], col = BRANCH_COL[T.b];
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    const g = cv.getContext('2d');
    g.drawImage(pixCanvas(MOTIF[m[0]], { a: col[0], b: col[1], c: col[2], d: m[0] === 'flame' || m[0] === 'bell' ? '#ff5d8f' : '#ffffff' }), 2, 2);
    if (m[1]) for (let i = 0; i < m[1]; i++) { g.fillStyle = '#ffffff'; g.fillRect(14, 13 - i * 3, 2, 2); }
    return cv;
  }

  // ---- port scenes for the live ship view: the ship's setting at that port (built once per port and size)
  function sceneEnv(n) {
    const nd = N[n], k = nd.k;
    if (nd.t === 'pad') return { sky: 'earth', ground: 'pad', kind: 'pad' };
    if (k === 'TRQ' || k === 'SHK') return { sky: 'space', ground: 'regolith', far: ['earth', 22, 0.78, 0.3], kind: 'surface' };
    if (k === 'JEZ' || k === 'HEL') return { sky: 'mars', ground: 'dunes', kind: 'surface' };
    if (k === 'CER') return { sky: 'space', ground: 'ceres', kind: 'surface' };
    if (k === 'EUR' || k === 'GAN' || k === 'CAL') return { sky: 'space', ground: k === 'EUR' ? 'europa' : k === 'GAN' ? 'ganymede' : 'callisto', far: ['jupiter', 70, 0.8, 0.42], kind: 'surface' };
    if (k === 'APH') return { sky: 'venus', ground: 'cloud', kind: 'surface', aerostat: 1 };
    if (nd.t === 'rock') return { sky: 'space', rock: 1, far: k === 'PHO' || k === 'DEI' ? ['mars', 60, 0.78, 0.45] : k === 'HIM' ? ['jupiter', 60, 0.8, 0.45] : null, kind: 'dock' };
    const limb = nd.r === 0 ? (k === 'LUO' ? 'moon' : k === 'L1' || k === 'L2' ? null : 'earth') : k === 'MAO' ? 'mars' : k === 'JOV' ? 'jupiter' : k === 'IO' ? 'io'
      : k === 'ISH' || k === 'VPO' ? 'venus' : k === 'MER' ? 'mercury' : k === 'CSP' ? 'ceres' : null;
    const station = nd.t === 'orb' || (nd.t === 'site');
    return { sky: 'space', limb, sun: k === 'SOL' || k === 'MER', far: k === 'L1' || k === 'L2' ? ['moon', 18, 0.8, 0.4] : k === 'CYC' || k === 'MTJ' ? ['mars', 14, 0.82, 0.38] : null,
      station, kind: station ? 'dock' : 'space' };
  }
  function sceneCanvas(n, W, H, comp) {
    const env = sceneEnv(n), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const out = { cv, ground: H - 28, dock: 92, kind: env.kind };
    const img = g.createImageData(W, H), dd = img.data;
    const put = (x, y, hx) => { const i = (y * W + x) * 4, c = rgb(hx); dd[i] = c[0]; dd[i + 1] = c[1]; dd[i + 2] = c[2]; dd[i + 3] = 255; };
    // sky
    const SKY = { earth: ['#08123a', '#12286a', '#2a5aa4', '#6aa6d8'], mars: ['#1a0c0a', '#4a1e14', '#8a4a2a', '#d08a5a'], venus: ['#3a2410', '#7a4a1a', '#c08a34', '#f0c868'] }[env.sky];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const th = BAYER[(y & 3) * 4 + (x & 3)] / 16;
      if (SKY) put(x, y, SKY[Math.max(0, Math.min(3, Math.floor((y / (H - 30)) * 4 + th - 0.5)))]);
      else put(x, y, hash(x, y, n) > 0.996 ? (hash(y, x, n) > 0.5 ? '#e9ecff' : '#4a5288') : '#03050c');
    }
    // a planet's limb filling the bottom of the view
    if (env.limb) {
      const RL = W * 1.25, cx = W * 0.55, cy = H + RL - 70;
      for (let y = Math.max(0, Math.floor(cy - RL)); y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (x - cx) / RL, dy = (y - cy) / RL;
        if (dx * dx + dy * dy > 1) continue;
        // the visible cap maps onto the body's sunlit middle, so it shows land, bands or craters rather than a pole
        const th = BAYER[(y & 3) * 4 + (x & 3)] / 16, d = Math.sqrt(dx * dx + dy * dy);
        const col = (1 - d) * RL < 2.2 && (env.limb === 'earth' || env.limb === 'venus') ? (env.limb === 'earth' ? '#8fd0ff' : '#ffe7a8')
          : bodyColor(env.limb, dx * 0.85, Math.min(0.92, (dy + 1) * 2.2 - 0.55), th, x, y) || (BT[env.limb] || BT.rock)[1];
        put(x, y, col);
      }
    }
    if (env.sun) for (let y = 0; y < H; y++) for (let x = 0; x < W * 0.4; x++) {
      const d = Math.hypot(x + W * 0.25, y - H * 0.4) / (W * 0.45), th = BAYER[(y & 3) * 4 + (x & 3)] / 16;
      if (d < 1 && (1 - d) * 1.6 > th) put(x, y, d < 0.55 ? '#fff2b8' : d < 0.75 ? '#ffc85a' : '#ff8a3a');
    }
    g.putImageData(img, 0, 0);
    if (env.far) { const b = bodyCanvas(env.far[0], env.far[1]); g.drawImage(b.cv, W * env.far[2] - b.w / 2, H * env.far[3] - b.h / 2); }
    // ground
    const gy = out.ground;
    if (env.ground === 'pad') {
      R(0, gy - 18, W, 18, '#1e4f9c'); for (let x = 0; x < W; x += 9) R(x + (x % 4), gy - 14 + (x % 3) * 4, 4, 1, '#6aa6d8');
      R(0, gy, W, H - gy, '#4a4e5c'); R(0, gy, W, 2, '#8a90a8');
      for (let x = 20; x < W; x += 48) R(x, gy + 8, 24, 2, '#ffb547');
      // launch tower beside the pad
      const tx = Math.round(W * 0.5 - 52);
      for (let y = 70; y < gy; y += 8) { R(tx, y, 2, 8, '#8a90b0'); R(tx + 12, y, 2, 8, '#8a90b0'); R(tx, y, 14, 1, '#646a8a'); }
      R(tx + 14, 96, 26, 3, '#8a90b0'); R(tx - 2, 66, 18, 4, '#ff5d8f');
    } else if (env.ground === 'cloud') {
      for (let x = 0; x < W; x++) { const h = 22 + Math.sin(x / 23) * 5 + Math.sin(x / 7) * 2; R(x, gy - h + 12, 1, H, x % 5 ? '#f6e8bc' : '#d8bf86'); }
      // aerostat platform with its envelope above
      const px = W * 0.5;
      R(px - 120, gy, 240, 6, '#8a90b0'); R(px - 120, gy, 240, 1, '#d4d8ee');
      g.fillStyle = '#e8d8a8'; g.beginPath(); g.ellipse(px, 66, 150, 30, 0, 0, 6.283); g.fill();
      g.fillStyle = '#c8b480'; g.fillRect(px - 150, 66, 300, 2);
      for (const ox of [-100, 0, 100]) R(px + ox, 96, 1, gy - 96, '#8a90b0');
    } else if (env.ground) {
      const GT = { regolith: BT.moon, dunes: BT.mars, ceres: BT.ceres, europa: BT.europa, ganymede: BT.ganymede, callisto: BT.callisto }[env.ground];
      for (let x = 0; x < W; x++) {
        const top = gy - 6 + Math.round(Math.sin(x / 31 + n) * 4 + Math.sin(x / 11) * 1.5);
        for (let y = top; y < H; y++) { const th = BAYER[(y & 3) * 4 + (x & 3)] / 16; R(x, y, 1, 1, tone(GT, 0.7 - (y - top) / 40 + (vnoise(x / 9, y / 5, 3) - 0.5) * 0.5, th)); }
      }
      if (env.ground === 'regolith' || env.ground === 'dunes' || env.ground === 'ice') {
        const dx = W * 0.82; g.fillStyle = '#bff6f8'; g.beginPath(); g.arc(dx, gy + 2, 34, Math.PI, 0); g.fill();
        g.fillStyle = '#5ce1e6'; g.fillRect(dx - 34, gy + 2, 68, 3); for (let i = -30; i < 30; i += 10) R(dx + i, gy - 22, 1, 24, '#8ad8e0');
      }
    }
    // an asteroid face with a docking pier
    if (env.rock) {
      for (let y = 0; y < H; y++) { const w = W * 0.22 + Math.sin(y / 17 + n) * 14 + Math.sin(y / 5) * 4; for (let x = 0; x < w; x++) R(x, y, 1, 1, tone(BT.rock, 0.3 + x / w * 0.4 + (vnoise(x / 7, y / 7, n) - 0.5) * 0.4, BAYER[(y & 3) * 4 + (x & 3)] / 16)); }
      R(W * 0.18, out.dock - 8, W * 0.28, 6, '#8a90b0'); R(W * 0.18, out.dock - 8, W * 0.28, 1, '#d4d8ee');
      for (let x = W * 0.2; x < W * 0.45; x += 14) R(x, out.dock - 6, 2, 2, '#ffb547');
    }
    // an orbital station's truss and docking arm above the ship
    if (env.station) {
      const yy = 54, own = comp && comp.P[n] && comp.P[n].st;
      R(0, yy, W * 0.86, 10, '#646a8a'); R(0, yy, W * 0.86, 2, '#b8bed8'); R(0, yy + 9, W * 0.86, 1, '#262a40');
      for (let x = 6; x < W * 0.86; x += 16) { R(x, yy + 2, 1, 7, '#454a68'); }
      for (let x = 30; x < W * 0.8; x += 120) { R(x, yy - 14, 46, 14, own ? '#ffb547' : '#d4d8ee'); R(x, yy - 14, 46, 2, '#ffffff'); R(x + 6, yy - 9, 3, 3, '#5ce1e6'); R(x + 14, yy - 9, 3, 3, '#5ce1e6'); }
      R(W * 0.86, yy - 22, 40, 18, '#2f4aa8'); for (let i = 0; i < 40; i += 4) R(W * 0.86 + i, yy - 22, 1, 18, '#18286a');
      R(W * 0.5 - 3, yy + 10, 6, out.dock - yy - 10, '#8a90b0'); R(W * 0.5 - 8, out.dock - 4, 16, 4, '#b8bed8');
    }
    return out;
  }

  // engine plume per drive family, art pixels; 'map' is short, 'big' long
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
  function shipArtAt(ctx, k, x, y, sc) {
    const Dz = DS.find(q => q.k === k), e = shipCanvas(Dz, Dz.cfg, DACC[k], 0, 'big'), p = plumeCanvas(Dz.f, true);
    const w = e.w * sc, h = e.h * sc, X = Math.round(x - w / 2), Y = Math.round(y - h / 2);
    ctx.drawImage(p, X - p.width * sc, Math.round(Y + e.cy * sc - p.height * sc / 2), p.width * sc, p.height * sc);
    ctx.drawImage(e.cv, X, Y, w, h);
  }

  Arcade.register({
    id: 'sol-tycoon',
    title: 'Sol: Tycoon',
    blurb: 'Run a passenger and cargo line from low Earth orbit to the moons of Jupiter.',
    controls: 'Tap ports, ships and buttons; drag to pan. Controller: d-pad moves the highlight, A selects, B goes back, ' +
      'L/R switch tabs, X jumps to an idle ship, Y jumps between regions, right stick pans. In the launch planner, left/right sets the burn of a leg.',
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
      shipArtAt(ctx, 'wasp', 70, 38, 1);
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
        shipArtAt(ctx, 'ox', W * 0.4, H * 0.7, Math.max(2, Math.round(1.6 * u)));
      }
    },

    create(api) {
      const C = PAL;
      // type scale: Chakra Petch for everything people read; Silkscreen only for titles and HUD numbers
      const CP = '"Chakra Petch", system-ui, sans-serif', SK = 'Silkscreen, "Courier New", monospace';
      const FONT = { title: `700 18px ${SK}`, num: `700 15px ${SK}`, ui: `600 15px ${CP}`, uiB: `700 16px ${CP}`, tab: `600 14px ${CP}`,
        sm: `500 12.5px ${CP}`, smB: `600 12.5px ${CP}`, body: `500 15px ${CP}`, map: `600 12px ${CP}`, big: `700 20px ${CP}` };
      const ERA = ['', 'I · Low Orbit', 'II · Cislunar & Red', 'III · Torch Age', 'IV · Outer Reach'];
      const ROMAN = ['', 'I', 'II', 'III', 'IV'];
      const ERA_TEXT = ['', '',
        'The Space Elevator hums from Anchor Atoll to Highport. Nuclear-thermal ships can now reach Mars and the inner system: license Areo Station and its moons, fly probe missions to Venus and Mercury, research Nuclear Thermal, then build the Phobos Torch Yards.',
        'The first fusion torches leave Phobos. The Belt, the moons of Jupiter and the Venus stations are open. Torch drives can burn the whole way, so choose your burns carefully: the fuel is expensive.'];
      const TABS = ['Map', 'Fleet', 'Hangar', 'Research', 'Projects', 'Stats'];
      const REGION_ERA = [1, 2, 3, 3, 4, 2];   // by region index; 5 is the inner system
      const REGION_CHIPS = [5, 0, 1, 2, 3];      // left to right on the map
      const RED = '#e8394d', REDD = '#7a1424';

      // ---- company: resume, catch up on the time we were away, then resume paused routines
      let now = Date.now();
      let fresh = false;
      let c = SIM.load(api.load(), now);
      if (!c) { c = SIM.newCompany(now); fresh = true; }
      const ui = { tab: 0, stack: [], fk: '', nav: false, cam: { x: 0, tx: 0, y: 0, ty: 0 }, toasts: [], dirty: true, pop: 0, live: false, anim: false,
        sec: 0, scroll: {}, hang: 0, quiet: true, saveAt: 0, needSave: false, lastAdv: now, region: 0, cargoTab: 0, help: 0,
        rdCam: 0, rdCamT: 0 };
      SIM.setEmit(onEmit);
      SIM.advance(c, now);
      const aw = c.aw, gap = now - c.seen;
      c.aw = null;
      SIM.resumeRoutines(c, now);
      c.seen = now;
      ui.quiet = false;
      if (fresh) ui.stack.push({ ty: 'help', first: 1 });
      else if (aw && gap > 2 * MIN && (aw.n || aw.arr || aw.res.length || aw.ps)) ui.stack.push({ ty: 'away', aw, gap });

      function onEmit(k, x) {
        if (k === 'launch') { if (!ui.quiet) { api.sfx.noise({ d: 0.35, v: 0.08 }); api.sfx.tone({ f: 90, to: 260, d: 0.4, type: 'sawtooth', v: 0.04 }); } return; }
        if (k === 'arrive') { if (!ui.quiet) { toast(`${x.nm} arrived at ${N[x.at].n}`, C.cyan); api.sfx.tone({ f: 660, to: 880, d: 0.12, type: 'triangle', v: 0.05 }); } ui.dirty = true; return; }
        if (k === 'era') { ui.stack.push({ ty: 'era', era: x }); api.sfx.tone({ f: 392, to: 784, d: 0.6, type: 'triangle', v: 0.08 }); ui.dirty = true; return; }
        if (ui.quiet) return;
        if (k === 'level') { toast(x, C.amber); api.sfx.tone({ f: 523, to: 1046, d: 0.3, type: 'triangle', v: 0.07 }); }
        else if (k === 'bad') { toast(x, C.rose); }
        else toast(x, k === 'part' ? C.torch : C.good);
        ui.dirty = true;
      }
      function toast(text, col) {
        ui.toasts.push({ text, col: col || C.text, until: performance.now() + 3400 });
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
      // durations in rounded minutes: "<1 min", "12 min", "1 h 05 min"
      function tm(ms) {
        if (ms < 60000) return '<1 min';
        const m = Math.round(ms / MIN);
        if (m < 60) return m + ' min';
        return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
      }
      const ship = id => c.sh.find(s => s.i === id);
      const D = s => DS[s.d];
      function jobLine(j) {
        const T = JT[j.t];
        return (j.v ? `VIP ×${j.v} · ` : j.k === SIM.K_MISSION ? 'Mission · ' : '') + T.n + (T.p ? '' : ` · ${j.m} t`);
      }
      const clampCam = x => Math.max(MAP_X0, Math.min(MAP_X1 - api.view.w + 40, x));

      // ---- sprites (built once; ships per livery/refit, lazily)
      const SPR = { node: {}, body: {}, dicon: [], jicon: [], jiconV: [], tech: {} };
      function buildSprites() {
        SPR.plumeMap = [0, 1, 2].map(f => { const r = plumeCanvas(f, false); return { r, l: mirror(r) }; });
        SPR.plumeBig = [0, 1, 2].map(f => plumeCanvas(f, true));
        SPR.pax = JT.map((T, t) => T.p ? [0, 1, 2, 3].map(i => paxSprite(t, i, false)) : null);
        SPR.vip = [0, 1, 2, 3].map(i => paxSprite(0, i, true));
        SPR.crate = JT.map((T, t) => T.p ? null : cargoSprite(t));
        SPR.jicon = JT.map((T, t) => jobIcon(t, false));
        SPR.jiconV = JT.map((T, t) => T.p ? jobIcon(t, true) : SPR.jicon[t]);
        for (const T of TECH) SPR.tech[T.k] = techIcon(T.k);
        const ICON = {
          pad: ['...a...', '..aaa..', '..a.a..', '.aa.aa.', '.a...a.', 'aaaaaaa', 'a.....a'],
          orb: ['..aaa..', '.a...a.', 'a..a..a', 'a.aaa.a', 'a..a..a', '.a...a.', '..aaa..'],
          base: ['.......', '..aaa..', '.aaaaa.', 'aa.a.aa', 'aaaaaaa', 'a.....a', 'aaaaaaa'],
          rock: ['..aa...', '.aaaaa.', 'aaa.aaa', 'aaaaaa.', '.aaaaaa', '..aaaa.', '...a...'],
          site: ['...a...', '.......', '.a...a.', 'a..a..a', '.a...a.', '.......', '...a...'],
          drop: ['..a.a..', '.......', 'a.....a', '...a...', 'a.....a', '.......', '..a.a..']
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
      // per-ship sprites: rebuilt only when the layout, livery or tanks change
      const SHIPC = new Map(), G = { e: null, sc: 1, ox: 0, oy: 0 };
      function shipSpr(s, mode) {
        let rec = SHIPC.get(s.i);
        if (!rec) SHIPC.set(s.i, rec = {});
        const r = rec[mode];
        if (r && r.cf === s.cf && r.lv === s.lv && r.t === s.u[0] && r.d === s.d) return r.e;
        const e = mode === 'bigV' ? Object.assign({}, shipSpr(s, 'big')) : shipCanvas(DS[s.d], s.cf, SIM.LIVERY[s.lv], s.u[0], mode);
        if (mode === 'bigV') { e.cv = rot90(e.cv); const w = e.w; e.w = e.h; e.h = w; }
        e.l = mirror(e.cv);
        rec[mode] = { cf: s.cf, lv: s.lv, t: s.u[0], d: s.d, e };
        return e;
      }
      const designShip = d => ({ i: -1 - d, d, cf: DS[d].cfg, lv: Math.max(0, SIM.LIVERY.indexOf(DACC[DS[d].k])), u: [0, 0, 0, 0], ld: [], f: null });
      const designIcon = d => SPR.dicon[d] || (SPR.dicon[d] = shipCanvas(DS[d], DS[d].cfg, DACC[DS[d].k], 0, 'icon'));
      // jobs as they sit in the slots: cabins take the cabin passengers, seats the rest, racks the cargo
      function slotJobs(s) {
        const pax = s.ld.filter(j => JT[j.t].p), cab = pax.filter(j => j.cb), seat = pax.filter(j => !j.cb), crg = s.ld.filter(j => !JT[j.t].p);
        const out = [];
        for (const ch of s.cf) out.push(ch === 'K' ? crg.shift() || null : ch === 'C' ? cab.shift() || seat.shift() || null : seat.shift() || null);
        return out;
      }
      function cutGeom(w) {
        const e = shipSpr(w.s, w.closed ? 'big' : 'cut');
        const sc = Math.max(1, Math.min(4, Math.floor(Math.min((w.w - 16) / e.w, (w.h - 18) / e.h) * 2) / 2));
        G.e = e; G.sc = sc; G.ox = Math.round(w.x + (w.w - e.w * sc) / 2); G.oy = Math.round(w.y + (w.h - (w.closed ? 0 : 16) - e.h * sc) / 2 + 2);
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
      // label widths for the map's text backing, measured once the fonts are in
      let LW = null;
      function labelWidths(ctx) {
        ctx.font = FONT.map;
        LW = N.map(nd => Math.ceil(ctx.measureText(nd.n).width));
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { LW = null; ui.dirty = true; api.requestDraw(); });

      // ---- widgets: rebuilt only when something changes (layout()), drawn every redraw
      let W = [], LS = [], layer = 0, PW = 320;
      const Y0 = 30, Y1 = 314, TABY = 318, RH = 50, PLAN_PY = Y1 - 150;
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
        const lines = wrap(s, font || FONT.body, w);
        add({ ty: 'para', x, y, lines, font: font || FONT.body, col: col || C.text, lh: lh || 20 });
        return y + lines.length * (lh || 20);
      }
      const rx = w => w.m ? w.x - ui.cam.x : w.rd ? w.x - ui.rdCam : w.x;
      const ry = w => w.ls >= 0 ? w.y - LS[w.ls].sc : w.m ? w.y - ui.cam.y : w.y;
      const clampCamY = y => Math.max(0, Math.min(170, y));
      const top = () => ui.stack[ui.stack.length - 1];
      const mapMode = m => !m || m.ty === 'port' || m.ty === 'launch';

      function layout() {
        W = []; LS = []; layer = 0; ui.live = false; ui.anim = false;
        const v = api.view, m = top();
        PW = Math.min(330, Math.round(v.w * 0.58));
        add({ ty: 'hud' });
        tabs(v, !mapMode(m) || (m && m.ty === 'launch'));
        if (mapMode(m)) {
          if (m && m.ty === 'launch') { layer = 1; mapWidgets(v, m); layer = 0; }
          else if (ui.tab === 0) mapWidgets(v, m);
          else if (ui.tab === 1) fleetTab(v); else if (ui.tab === 2) hangarTab(v);
          else if (ui.tab === 3) rdTab(v); else if (ui.tab === 4) projTab(v); else statsTab(v);
        }
        if (m) { layer = 1; MODALS[m.ty](v, m); }
        for (const L of LS) { L.max = Math.max(0, L.max); L.sc = Math.max(0, Math.min(L.sc, L.max)); }
        const fl = W.filter(w => w.f && w.l === layer);
        if (!fl.some(w => w.k === ui.fk)) {
          const pref = fl.find(w => w.pref) || fl.find(w => w.k === 'n' + c.hq) || fl.find(w => w.ty !== 'tab' && w.k !== 'close') || fl[0];
          ui.fk = pref ? pref.k : '';
        }
        ensureVisible(false);
        ui.dirty = false;
      }
      function tabs(v, inert) {
        const tw = (v.w - 8) / TABS.length;
        for (let i = 0; i < TABS.length; i++) {
          let badge = '';
          if (i === 1) { const idle = c.sh.filter(s => !s.f && s.st === 0 && !s.rt).length; if (idle) badge = String(idle); }
          if (i === 3 && c.res.length < SIM.resSlots(c) && TECH.some(T => SIM.techState(c, T.k) === 'ok' && c.rp >= T.rp && c.cr >= T.cr)) badge = '!';
          add({ ty: 'tab', x: 4 + i * tw, y: TABY, w: tw - 3, h: 40, k: 'tab' + i, label: TABS[i], on: () => setTab(i), f: inert ? 0 : 1, act: ui.tab === i, badge });
        }
      }
      function setTab(i) { ui.tab = (i + TABS.length) % TABS.length; ui.stack = []; ui.dirty = true; }
      function helpChip(x, y, topic) { btn(x, y, 40, 36, 'help', '?', () => push({ ty: 'help', topic }), { chip: 1 }); }

      // ---------------- MAP
      function mapWidgets(v, m) {
        add({ ty: 'map' });
        const plan = m && m.ty === 'launch';
        for (let n = 0; n < NN; n++) {
          const on = SIM.nodeOn(c, n);
          if (!on && N[n].e > c.era + 1) continue;
          add({ ty: 'node', m: 1, x: N[n].x - 12, y: N[n].y - 12, w: 24, h: 24, k: 'n' + n, n, f: on ? 1 : 0,
            on: () => plan ? plannerTap(m, n) : openPort(n) });
        }
        if (!plan) {
          for (const s of c.sh) if (s.f) {
            const p = shipXY(s, now);
            add({ ty: 'shipm', m: 1, x: p.x - 10, y: p.y - 18, w: 20, h: 20, k: 'sm' + s.i, s, f: 1, on: () => openShip(s) });
            ui.live = true;
          }
        }
        if (m) return;
        let x = 8;
        const cx = (ui.cam.tx !== undefined ? ui.cam.tx : ui.cam.x) + v.w / 2;
        for (let i = 0; i < REGIONS.length; i++) if (cx >= REGIONS[i].x0 && cx < REGIONS[i].x1) ui.region = i;
        for (const i of REGION_CHIPS) {
          if (REGION_ERA[i] > c.era + 1) continue;
          btn(x, Y1 - 42, 66, 38, 'reg' + i, REGIONS[i].n, () => jumpRegion(i, true), { chip: 1, act: ui.region === i });
          x += 70;
        }
        helpChip(x, Y1 - 42, 0);
        const idle = c.sh.filter(s => !s.f && s.st === 0 && !s.rt);
        if (idle.length) btn(v.w - 160, Y1 - 42, 152, 38, 'idle', `Idle ships: ${idle.length}  (X)`, nextIdle, { chip: 1, hot: 1 });
      }
      // move the camera to a region; the highlight follows to its busiest node unless a chip was pressed
      function jumpRegion(i, keepFocus) {
        ui.region = i;
        ui.cam.tx = clampCam(REGIONS[i].cx);
        if (!keepFocus) {
          let best = -1;
          for (let n = 0; n < NN; n++) if (N[n].r === i && SIM.nodeOn(c, n) && (best < 0 || (c.P[n] && !c.P[best]))) best = n;
          if (best >= 0) ui.fk = 'n' + best;
        }
        ui.dirty = true;
      }
      function centerOn(n, snap, vwOverride) {
        const vw = vwOverride || (api.view.w - (top() && top().ty === 'port' ? PW : 0));
        ui.cam.tx = clampCam(N[n].x - vw / 2);
        if (snap) ui.cam.x = ui.cam.tx;
      }
      function openPort(n) {
        ui.tab = 0;
        ui.stack = [{ ty: 'port', n }];
        centerOn(n);
        ui.fk = '';
        ui.dirty = true;
      }
      function openShip(s) { ui.stack.push({ ty: 'ship', s: s.i }); ui.fk = ''; ui.dirty = true; }
      function nextIdle() {
        const idle = c.sh.filter(s => !s.f && s.st === 0 && !s.rt);
        if (!idle.length) { toast('No idle ships', C.muted); return; }
        ui.idleI = ((ui.idleI || 0) + 1) % idle.length;
        const s = idle[ui.idleI];
        ui.tab = 0; ui.stack = [{ ty: 'ship', s: s.i }];
        centerOn(s.at); ui.dirty = true;
      }
      function push(m) { ui.stack.push(m); ui.fk = ''; ui.dirty = true; resetPtr(); }
      function pop() { ui.stack.pop(); ui.fk = ui.backFk || ''; ui.backFk = ''; ui.dirty = true; resetPtr(); }

      // ---------------- MODALS
      const MODALS = {};
      function fullPanel(v, title, sub) {
        pan(8, Y0, v.w - 16, Y1 - Y0);
        txt(20, Y0 + 10, title, FONT.title, C.amber);
        if (sub) txt(20, Y0 + 34, sub, FONT.sm, C.muted);
        btn(v.w - 128, Y0 + 6, 72, 36, 'close', 'Back', pop, { chip: 1 }); // clear of the shell's pause button
      }
      MODALS.port = (v, m) => {
        const n = m.n, P = c.P[n], X = v.w - PW, nd = N[n];
        pan(X, Y0, PW - 6, Y1 - Y0);
        const kind = { pad: 'Launch pad', orb: 'Orbital station', base: 'Surface base', rock: 'Asteroid port', site: 'Build site', drop: 'Mission drop zone' }[nd.t];
        txt(X + 12, Y0 + 10, nd.n, FONT.title, P ? C.amber : C.text);
        txt(X + 12, Y0 + 34, `${P && P.st ? 'Your station' : kind} · ${REGIONS[nd.r].n}${nd.w ? ' · well ' + nd.w : ''}`, FONT.sm, C.muted);
        btn(X + PW - 128, Y0 + 6, 72, 36, 'close', 'Close', pop, { chip: 1 });
        let y = Y0 + 56;
        if (!SIM.nodeOn(c, n)) { para(X + 12, y, PW - 30, `Opens in Era ${ROMAN[nd.e]}.`, FONT.body, C.muted); return; }
        const fuel = Math.round(nd.fp * (P && P.isru ? 0.4 : 1));
        if (P) {
          txt(X + 12, y, `Berths ${SIM.dockedAt(c, n)}/${SIM.berths(c, n)} · ${P.dep ? 'fuel ' + fuel + '/t' : 'no depot'}${P.tier ? ' · ' + DEV[P.tier - 1].n : ''}${c.hq === n ? ' · HQ' : ''}`, FONT.sm, C.text);
          y += 20;
          const here = c.sh.filter(s => !s.f && s.at === n);
          const li = list('port' + n, X + 8, y, PW - 22, Y1 - y - 94);
          here.forEach((s, i) => row(li, i, RH, 'ps' + s.i, { shipObj: s, title: s.nm, sub: `${D(s).n} · ${s.st === 2 ? 'holding (no berth)' : s.rt ? 'routine' : 'docked'} · ${s.ld.length}/${s.cf.length} loaded`, on: () => openShip(s), pref: i === 0 }));
          if (!here.length) txt(X + 14, y + 8, 'No ships here.', FONT.body, C.muted);
          const bw = (PW - 30) / 2, by = Y1 - 88;
          const jobs = P.bd.length + P.hd.length;
          btn(X + 8, by, bw, 40, 'board', `Jobs (${jobs})`, () => push({ ty: 'board', n }));
          btn(X + 14 + bw, by, bw, 40, 'upg', 'Upgrades', () => push({ ty: 'upg', n }));
          if (P.st && P.cf >= 1) btn(X + 8, by + 44, PW - 22, 40, 'collect', `Collect CR ${cr(P.cf)}`, () => { const got = SIM.collect(c, n, now); toast(`Collected CR ${cr(got)}`, C.good); api.sfx.tone({ f: 880, to: 1320, d: 0.15, v: 0.06, type: 'triangle' }); }, { hot: 1 });
          else {
            const pk = c.pj.elev && !c.done.elev && n === PROJ.elev.site ? 'elev' : c.pj.yards && !c.done.yards && n === PROJ.yards.site ? 'yards' : '';
            if (pk) { txt(X + 12, by + 50, `${PROJ[pk].n} ${c.pj[pk].got}/${c.pj[pk].need}`, FONT.smB, C.rose); bar(X + 12, by + 70, PW - 30, 6, c.pj[pk].got / c.pj[pk].need, C.rose); }
            else if (P.dn) { txt(X + 12, by + 50, `${DEV[P.tier].n}: ${P.dv}/${P.dn} delivered`, FONT.smB, C.cyan); bar(X + 12, by + 70, PW - 30, 6, P.dv / P.dn, C.cyan); }
            else if (P.st) txt(X + 12, by + 54, `Income ${cr(SIM.stationIncome(n, P))}/h · add services in Upgrades`, FONT.sm, C.muted);
          }
          return;
        }
        if (nd.t === 'drop') {
          y = para(X + 12, y, PW - 30, 'An orbit with no port. Mission contracts (probes and satellites) pay well to deliver here. Ships hold in orbit afterwards, so plan the fuel for the trip home.', FONT.body, C.muted);
          const here = c.sh.filter(s => !s.f && s.at === n);
          here.forEach((s, i) => btn(X + 8, y + 8 + i * 44, PW - 22, 40, 'ps' + s.i, `${s.nm} (holding)`, () => openShip(s)));
          return;
        }
        if (nd.t === 'site') {
          const ss = SIM.siteState(c, n);
          y = para(X + 12, y, PW - 30, `An empty spot for a station of your own. Found it, then deliver ${nd.kits} station kits from nearby ports. Then add services: depot, layover hab, repair dock, trade post.`, FONT.body, C.muted) + 6;
          if (ss === 'busy') { const st = c.site[n]; txt(X + 12, y + 4, `Kits delivered ${st.got}/${st.need}`, FONT.ui, C.cyan); bar(X + 12, y + 26, PW - 30, 6, st.got / st.need, C.cyan); }
          else btn(X + 8, Y1 - 48, PW - 22, 42, 'found', ss === 'tech' ? `Needs ${TECH[TI[nd.need || 'kits']].n}` : `Found station · CR ${cr(nd.c)}`,
            () => confirm(`Found a station at ${nd.n} for CR ${cr(nd.c)}? Kit jobs will appear at nearby ports.`, () => { if (SIM.foundSite(c, n, now)) toast('Station kits posted to nearby boards', C.good); else toast('License a nearby port first', C.rose); }),
            { dis: ss !== 'ok' || c.cr < nd.c, hot: 1 });
          return;
        }
        y = para(X + 12, y, PW - 30, portBlurb(n), FONT.body, C.muted) + 6;
        txt(X + 12, y, `Fuel ${nd.fp}/t · ${nd.b} berth${nd.b > 1 ? 's' : ''}${nd.dep ? ' · depot' : ''}`, FONT.sm, C.text);
        btn(X + 8, Y1 - 48, PW - 22, 42, 'lic', `License · CR ${cr(nd.c)}`, () => { if (SIM.license(c, n, now)) api.sfx.tone({ f: 523, to: 784, d: 0.2, v: 0.07, type: 'triangle' }); }, { dis: c.cr < nd.c, hot: 1, why: 'Not enough credits' });
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
        if (N[n].w >= 2) bits.push(`Needs a lander rated for gravity well ${N[n].w}.`);
        return bits.join(' ') || 'A quiet port.';
      }
      function confirm(text, yes) { push({ ty: 'confirm', text, yes }); }
      MODALS.confirm = (v, m) => {
        const w = Math.min(440, v.w - 40), x = (v.w - w) / 2, y = 80;
        pan(x, y, w, 176);
        para(x + 16, y + 16, w - 32, m.text, FONT.body, C.text);
        btn(x + 16, y + 122, (w - 44) / 2, 42, 'yes', 'Yes', () => { pop(); m.yes(); }, { hot: 1 });
        btn(x + 28 + (w - 44) / 2, y + 122, (w - 44) / 2, 42, 'no', 'No', pop);
      };
      MODALS.board = (v, m) => {
        const P = c.P[m.n];
        fullPanel(v, `${N[m.n].n} jobs`, `${P.bd.length} on the board · ${P.hd.length} waiting to transfer · refills every ${TUNE.refillMs / MIN} min`);
        const li = list('board' + m.n, 16, Y0 + 54, v.w - 32, Y1 - Y0 - 60);
        P.bd.concat(P.hd).sort((a, b) => a.d - b.d || b.p - a.p).forEach((j, i) => row(li, i, RH, 'j' + j.i, { job: j, title: '→ ' + N[j.d].n, sub: jobLine(j) + (P.hd.includes(j) ? ' · transfer' : '') + (j.x ? ' · expires in ' + tm(j.x - now) : ''), right: 'CR ' + cr(j.p), on: () => toast('Open a docked ship, then Cargo, to load jobs', C.muted) }));
        ui.live = true;
      };

      // ---- live ship view: the ship in its port, or flying with launch, burn, coast, flip and docking animations
      MODALS.ship = (v, m) => {
        const s = ship(m.s);
        if (!s) { ui.stack.pop(); return; }
        const Dz = D(s), P = c.P[s.at];
        pan(8, Y0, v.w - 16, Y1 - Y0);
        const sc = add({ ty: 'scene', x: 9, y: Y0 + 1, w: v.w - 18, h: Y1 - Y0 - 54, s });
        btn(v.w - 128, Y0 + 6, 72, 36, 'close', 'Back', pop, { chip: 1 });
        const by = Y1 - 48, bw = Math.floor((v.w - 24 - 3 * 6) / 4);
        let k = 0;
        const B = (key, label, on, o) => { btn(12 + k * (bw + 6), by, bw, 42, key, label, on, o); k++; };
        if (s.f) {
          B('locate', 'Show on map', () => { ui.stack = []; ui.tab = 0; const p = shipXY(s, now); ui.cam.tx = clampCam(p.x - v.w / 2); }, { hot: 1 });
          B('cargo', `Cargo ${s.ld.length}/${s.cf.length}`, () => push({ ty: 'cargo', s: s.i }));
          B('up', 'Upgrade', () => push({ ty: 'shipup', s: s.i }));
          if (s.rt) B('rtstop', 'Stop routine', () => { s.rt = null; s.wt = 0; toast('Routine stopped after this flight', C.muted); });
          ui.anim = true; ui.live = true;
          return;
        }
        if (P && s.st === 0) B('cargo', `Cargo ${s.ld.length}/${s.cf.length}`, () => push({ ty: 'cargo', s: s.i }), { pref: !s.ld.length });
        B('launch', s.ld.length ? 'Plan launch ▸' : 'Fly empty ▸', () => openPlanner(s, 'fly'), { hot: 1, pref: !!s.ld.length });
        B('up', 'Upgrade', () => push({ ty: 'shipup', s: s.i }));
        if (SIM.has(c, 'plan') && k < 4) {
          if (s.rt) B('rtstop', 'Stop routine', () => { s.rt = null; s.wt = 0; toast('Routine stopped', C.muted); });
          else B('rt', 'Routine', () => openPlanner(s, 'rt'));
        } else if (k < 4 && s.at !== c.hq) B('tow', 'Tow to HQ', () => confirm(`Tow ${s.nm} to ${N[c.hq].n}? Free, takes 10 minutes. Cancels its routine.`, () => SIM.tow(c, s, now)));
        if (s.rt && s.rt.ps === 2) btn(v.w - 228, Y0 + 50, 96, 34, 'rtgo', 'Resume', () => { s.rt.ps = 0; s.wt = now; SIM.advance(c, now); }, { chip: 1 });
        ui.live = true;
      };
      function routineLine(s) {
        if (!s.rt) return '';
        const r = s.rt, st = r.ps === 1 ? 'paused at the idle cap' : r.ps === 2 ? 'stopped (no route or funds)' : s.wt ? 'waiting for jobs' : 'running';
        return `Routine ${N[r.a].k} ⇄ ${N[r.b].k} · ${st}`;
      }
      // ---- cargo screen: the cutaway, and the jobs here or aboard (full screen, like an airline's load sheet)
      MODALS.cargo = (v, m) => {
        const s = ship(m.s);
        if (!s) { ui.stack.pop(); return; }
        const P = c.P[s.at], sl = SIM.slotsOf(s), lc = SIM.loadCount(s);
        fullPanel(v, `${s.nm} · cargo`, `Seats ${lc.pax}/${sl.S + sl.C} · cargo racks ${lc.crg}/${sl.K} · ${SIM.loadMass(s.ld).toFixed(1)} t aboard · Δv ${SIM.dvCap(c, s).toFixed(1)} with a full tank`);
        const band = add({ ty: 'cut', x: 16, y: Y0 + 54, w: v.w - 32, h: 96, s, sj: slotJobs(s) });
        const can = !!P && s.st === 0 && !s.f;
        if (can) {
          const g = cutGeom(band);
          g.e.slots.forEach((q, i) => {
            const j = band.sj[i];
            add({ ty: 'slot', x: g.ox + q.x * g.sc, y: g.oy + g.e.iy0 * g.sc, w: q.w * g.sc, h: (g.e.iy1 - g.e.iy0) * g.sc, k: 'sl' + i, f: 1,
              on: () => { if (j) { SIM.unloadJob(c, s, j); api.sfx.tone({ f: 330, d: 0.05, v: 0.05 }); } else { ui.cargoTab = 0; ui.dirty = true; } } });
          });
        }
        const ty = Y0 + 156;
        const avail = can ? P.bd.concat(P.hd).sort((a, b) => a.d - b.d || b.p - a.p) : [];
        btn(16, ty, 150, 36, 'ct0', `Available (${avail.length})`, () => { ui.cargoTab = 0; }, { chip: 1, act: ui.cargoTab === 0 });
        btn(172, ty, 130, 36, 'ct1', `Aboard (${s.ld.length})`, () => { ui.cargoTab = 1; }, { chip: 1, act: ui.cargoTab === 1 });
        if (can) btn(v.w - 160, ty, 144, 36, 'auto', 'Auto load', () => autoLoad(s), { chip: 1, hot: 1, pref: !s.ld.length });
        const li = list('cargo' + s.i + ui.cargoTab, 16, ty + 42, v.w - 32, Y1 - ty - 46);
        const rows = ui.cargoTab === 1 ? s.ld.slice().sort((a, b) => a.d - b.d) : avail;
        rows.forEach((j, i) => {
          const on = s.ld.includes(j), pax = JT[j.t].p;
          const full = !on && (pax ? lc.pax >= sl.S + sl.C : lc.crg >= sl.K);
          row(li, i, RH, 'j' + j.i, { job: j, sel: on, title: '→ ' + N[j.d].n, sub: jobLine(j) + (j.v ? ' · due in ' + tm(j.da ? j.da - now : j.dl) : '') + (!on && P && P.hd.includes(j) ? ' · transfer' : ''),
            right: 'CR ' + cr(on ? SIM.payOf(c, s, j, now) : j.p), dim: full, on: () => { if (!can) toast(s.f ? 'In flight' : 'Dock at one of your ports to load', C.muted); else toggleJob(s, j); } });
        });
        if (!rows.length) txt(24, ty + 54, ui.cargoTab ? 'Nothing aboard.' : can ? 'No jobs here right now. Boards refill every few minutes.' : 'Dock at one of your ports to load jobs.', FONT.body, C.muted);
        ui.live = true;
      };
      function toggleJob(s, j) {
        if (s.ld.includes(j)) { SIM.unloadJob(c, s, j); api.sfx.tone({ f: 330, d: 0.05, v: 0.05 }); }
        else if (SIM.loadJob(c, s, j)) api.sfx.tone({ f: 520, d: 0.05, v: 0.05 });
        else { toast(JT[j.t].p ? 'No free seat' : 'No free cargo rack', C.rose); api.sfx.tone({ f: 140, d: 0.08, v: 0.05 }); }
      }
      function autoLoad(s) {
        const P = c.P[s.at];
        if (!P) return;
        const sr = SIM.search(c, s, now, c.burn), sl = SIM.slotsOf(s), groups = {};
        for (const j of P.bd.concat(P.hd)) (groups[j.d] = groups[j.d] || []).push(j);
        let best = -1, bestV = 0;
        for (const d in groups) {
          if (!SIM.reachable(sr, +d)) continue;
          let pax = sl.S + sl.C, crg = sl.K, val = 0;
          for (const j of groups[d].sort((a, b) => b.p - a.p)) if (JT[j.t].p ? pax-- > 0 : crg-- > 0) val += j.p;
          if (val > bestV) { bestV = val; best = +d; }
        }
        if (best < 0) { toast('Nothing this ship can carry from here', C.muted); return; }
        for (const j of s.ld.slice()) if (j.d !== best) SIM.unloadJob(c, s, j);
        for (const j of groups[best].sort((a, b) => b.p - a.p)) if (SIM.canCarry(s, j)) SIM.loadAndCheck(c, s, j, best);
        api.sfx.tone({ f: 520, to: 780, d: 0.1, v: 0.05 });
        toast(`Loaded for ${N[best].n}`, C.good);
      }

      // ---- launch planner: on the map, tap ports to build the route; each leg has its own burn
      function openPlanner(s, mode) {
        const m = { ty: 'launch', s: s.i, mode, route: [s.at], burns: [] };
        // loaded for one destination? start with the cheapest route there
        const dests = [...new Set(s.ld.map(j => j.d))];
        if (dests.length === 1) {
          const pr = SIM.planRoute(c, s, dests[0], c.burn, now);
          if (pr) { m.route = pr.route.slice(); m.burns = m.route.slice(1).map(() => c.burn); }
        }
        ui.tab = 0;
        ui.stack.push(m);
        centerOn(m.route[m.route.length - 1], false, api.view.w);
        ui.fk = ''; ui.dirty = true; resetPtr();
      }
      function plannerTap(m, n) {
        const s = ship(m.s), last = m.route[m.route.length - 1];
        if (m.cand && m.cand.some(q => q.n === n)) { m.route.push(n); m.burns.push(c.burn); api.sfx.tone({ f: 600, d: 0.05, v: 0.05 }); }
        else if (n === last && m.route.length > 1) { m.route.pop(); m.burns.pop(); api.sfx.tone({ f: 330, d: 0.05, v: 0.05 }); }
        else if (m.route.length === 1 && n !== s.at) {
          const pr = SIM.planRoute(c, s, n, c.burn, now);
          if (pr) { m.route = pr.route.slice(); m.burns = m.route.slice(1).map(() => c.burn); toast(`Route to ${N[n].n} filled in`, C.good); }
          else toast(`Can't reach ${N[n].n} from here: a depot on the way, less load, or a different ship`, C.rose);
        } else toast('Add stops next to the last one (they glow), or press B to remove stops', C.muted);
        ui.dirty = true;
      }
      MODALS.launch = (v, m) => {
        const s = ship(m.s);
        if (!s || s.f) { ui.stack.pop(); return; }
        const last = m.route[m.route.length - 1];
        // next stops this ship can reach, with the Δv it would have left
        m.cand = SIM.nextHops(c, s, last, now).filter(n => n !== m.route[m.route.length - 2]).map(n => {
          const p = SIM.planLegs(c, s, m.route.concat([n]), m.burns.concat([c.burn]), now), L = p.info[p.info.length - 1];
          return { n, ok: L.ok, dvLeft: L.dvLeft };
        });
        const pl = m.pl = m.route.length > 1 ? SIM.planLegs(c, s, m.route, m.burns, now) : null;
        const py = PLAN_PY, X = 8, Wd = v.w - 16;
        pan(X, py, Wd, Y1 - py);
        txt(X + 12, py + 6, `${m.mode === 'rt' ? 'Routine' : 'Launch'}: ${s.nm}`, FONT.ui, C.amber);
        txt(X + 12, py + 26, m.route.length > 1 ? 'Tap a glowing port to add a stop · tap the last stop or press B to remove it' : 'Tap a glowing port for the first stop, or any port to fill in a route', FONT.sm, C.muted);
        btn(v.w - 92, py + 6, 76, 34, 'close', 'Cancel', pop, { chip: 1 });
        const rx0 = v.w - 186, li = list('legs', X + 8, py + 46, rx0 - X - 16, Y1 - py - 50);
        if (pl) pl.info.forEach((L, i) => {
          add({ ty: 'leg', x: LS[li].x, y: LS[li].y + i * 40, w: LS[li].w, h: 36, ls: li, k: 'leg' + i, f: 1, li: i, L, md: m,
            on: () => toast(L.fixed ? 'Launches and landings have a fixed burn' : 'Left/right (or drag) sets this leg\'s burn', C.muted) });
          LS[li].max = Math.max(LS[li].max, (i + 1) * 40 - LS[li].h);
        });
        // totals and the big red launch button
        const tx = rx0;
        if (pl) {
          txt(tx, py + 46, `Time ${tm(pl.dur)}`, FONT.ui, C.text);
          txt(tx, py + 66, `Fuel CR ${cr(pl.fuelCr)} · upkeep ${cr(pl.up)}`, FONT.sm, C.muted);
          txt(tx, py + 82, `Profit CR ${cr(pl.profit)}`, FONT.ui, pl.profit >= 0 ? C.good : C.rose);
          const late = s.ld.filter(j => j.v && pl.arrAt[j.d] !== undefined && pl.arrAt[j.d] > (j.da || now + j.dl) - now).length;
          if (late) txt(tx + 120, py + 84, `${late} VIP late`, FONT.smB, C.rose);
        }
        const ok = pl && pl.ok && SIM.canAfford(c, pl);
        const why = !pl ? 'Add at least one stop' : !pl.ok ? (pl.info.find(L => !L.ok) || {}).why || 'Can\'t fly this route' : 'Not enough credits for fuel';
        btn(tx, Y1 - 50, 170, 44, 'go', m.mode === 'rt' ? 'START ROUTINE' : 'LAUNCH', () => doLaunch(m, s, pl), { red: 1, dis: !ok, why, pref: ok });
      };
      function doLaunch(m, s, pl) {
        const b = m.burns.length ? m.burns[m.burns.length - 1] : c.burn;
        if (m.mode === 'rt') {
          s.rt = { a: s.at, b: pl.to, s: b, ps: 0 };
          c.burn = b;
          SIM.routineStep(c, s, now);
          ui.stack = [{ ty: 'ship', s: s.i }];
          toast(`Routine ${N[s.rt.a].k} ⇄ ${N[s.rt.b].k} started`, C.good);
        } else if (SIM.launch(c, s, pl, now)) {
          c.burn = b;
          ui.stack = [{ ty: 'ship', s: s.i }];
        } else toast('Not enough credits for fuel', C.rose);
        ui.dirty = true; ui.needSave = true;
      }
      function setLegBurn(m, i, val) {
        const L = m.pl && m.pl.info[i];
        if (!L || L.fixed) return;
        const nv = Math.round(Math.max(0, Math.min(1, val)) * 100) / 100;
        if (nv !== m.burns[i]) {
          if (Math.round(nv * 20) !== Math.round(m.burns[i] * 20)) api.sfx.tone({ f: 300 + nv * 600, d: 0.03, v: 0.03 });
          m.burns[i] = nv; ui.dirty = true;
        }
      }

      MODALS.shipup = (v, m) => {
        const s = ship(m.s);
        if (!s) { ui.stack.pop(); return; }
        const Dz = D(s), here = SIM.canUpgradeHere(c, s), f = Dz.f;
        fullPanel(v, `${s.nm} upgrades`, here ? `At ${N[s.at].n} · ${FAM[f]} parts: hull ${c.parts[f * 3]} · drive ${c.parts[f * 3 + 1]} · systems ${c.parts[f * 3 + 2]}`
          : 'Dock at one of your shipyards (or research Modular Hulls) to upgrade');
        add({ ty: 'cut', x: 16, y: Y0 + 54, w: v.w - 32, h: 68, s, closed: 1 });
        const li = list('shipup' + s.i, 16, Y0 + 128, v.w - 32, Y1 - Y0 - 132);
        const dvOf = q => { const dry = SIM.shipDry(q) + SIM.loadMass(q.ld), fu = SIM.shipFuel(q); return fu ? SIM.veOf(c, Dz) * Math.log((dry + fu) / dry) : 0; };
        const next = k => { const q = Object.assign({}, s, { u: s.u.slice() }); q.u[k]++; return q; };
        const eff = [
          () => `Δv ${dvOf(s).toFixed(1)} → ${dvOf(next(0)).toFixed(1)} with a full tank`,
          () => `Thrust +${s.u[1] * 10}% → +${(s.u[1] + 1) * 10}%: faster hard burns`,
          () => `${s.cf.length} → ${s.cf.length + 1} slots (a new cargo module; refit it if you like)`,
          () => `Passenger fares +${s.u[3] * 8}% → +${(s.u[3] + 1) * 8}%`
        ];
        let i = 0;
        SIM.SHIP_UP.forEach((U, k) => {
          const blk = SIM.shipUpBlock(c, s, k), q = SIM.shipUpCost(c, s, k), maxed = s.u[k] >= U.max;
          const na = (k === 2 && (Dz.fx || Dz.climb)) || (k === 3 && !/[SC]/.test(s.cf));
          row(li, i++, RH, 'su' + k, { title: `${U.n} ${s.u[k]}/${U.max}`, sub: na ? blk : maxed ? 'Fully upgraded' : eff[k](),
            right: maxed ? 'Max' : na ? 'n/a' : `CR ${cr(q.cr)} + ${q.n} ${PART[q.part % 3].toLowerCase()}`, dim: !!blk, hot: !blk, sel: maxed,
            on: () => {
              if (blk) { toast(blk, C.rose); return; }
              if (SIM.upgradeShip(c, s, k)) { toast(`${U.n} upgraded`, C.good); api.sfx.tone({ f: 500, to: 900, d: 0.2, v: 0.06, type: 'triangle' }); }
            } });
        });
        row(li, i++, RH, 'liv', { title: 'Livery', sub: here ? `Repaint for CR ${cr(SIM.liveryCost(s))} · A or tap for the next colour` : 'Repaint at a shipyard', swatch: SIM.LIVERY[s.lv], dim: !here,
          on: () => { if (!here) toast('Dock at a shipyard to repaint', C.rose); else if (SIM.setLivery(c, s, (s.lv + 1) % SIM.LIVERY.length)) api.sfx.tone({ f: 700, d: 0.06, v: 0.05 }); else toast('Not enough credits', C.rose); } });
        if (!Dz.fx) row(li, i++, RH, 'refit', { title: 'Refit slots', sub: 'Swap seats, cargo racks and cabins', dim: !SIM.canRefitHere(c, s) || s.ld.length > 0,
          on: () => { if (!SIM.canRefitHere(c, s)) toast('Dock at a shipyard (or research Modular Hulls)', C.rose); else if (s.ld.length) toast('Unload first', C.rose); else push({ ty: 'refit', s: s.i, cfg: s.cf }); } });
        if (!s.f && s.at !== c.hq) row(li, i++, RH, 'tow', { title: 'Tow to HQ', sub: 'Free · 10 minutes · cancels its routine',
          on: () => confirm(`Tow ${s.nm} to ${N[c.hq].n}? Free, takes 10 minutes. Cancels its routine.`, () => { SIM.tow(c, s, now); ui.stack = ui.stack.filter(q => q.ty !== 'shipup'); }) });
        const val = Math.round(Dz.cost * TUNE.sellBack + (s.sp || 0) * 0.5), sellBlk = s.f ? 'Land first' : s.ld.length ? 'Unload first' : c.sh.length <= 1 ? 'You need at least one ship' : '';
        row(li, i++, RH, 'sell', { title: 'Sell ship', sub: sellBlk || 'Gone for good (upgrades return half their cost)', right: 'CR ' + cr(val), dim: !!sellBlk,
          on: () => {
            if (sellBlk) { toast(sellBlk, C.rose); return; }
            confirm(`Sell ${s.nm} for CR ${cr(val)}?`, () => { if (SIM.sellShip(c, s)) { ui.stack = ui.stack.filter(q => q.ty !== 'ship' && q.ty !== 'shipup' && q.ty !== 'cargo'); toast(`${s.nm} sold`, C.muted); } });
          } });
      };
      MODALS.refit = (v, m) => {
        const s = ship(m.s);
        if (!s) { ui.stack.pop(); return; }
        fullPanel(v, `Refit ${s.nm}`, 'Tap a slot to cycle: seat → cargo' + (SIM.has(c, 'cabin') ? ' → cabin' : '') + ' · paid per changed slot');
        const n = m.cfg.length, sz = Math.min(56, (v.w - 60) / n - 6);
        for (let i = 0; i < n; i++) {
          btn(20 + i * (sz + 6), Y0 + 70, sz, sz + 8, 'slot' + i, m.cfg[i] === 'S' ? 'Seat' : m.cfg[i] === 'C' ? 'Cabin' : 'Cargo', () => {
            const order = SIM.has(c, 'cabin') ? 'SKC' : 'SK', ch = order[(order.indexOf(m.cfg[i]) + 1) % order.length];
            m.cfg = m.cfg.slice(0, i) + ch + m.cfg.slice(i + 1);
          }, { slot: m.cfg[i], small: 1 });
        }
        const cost = SIM.refitCost(c, s, m.cfg);
        btn(20, Y1 - 50, 220, 42, 'apply', `Apply · CR ${cr(cost)}`, () => { if (SIM.refit(c, s, m.cfg)) { pop(); toast('Refit done', C.good); } }, { hot: 1, dis: m.cfg === s.cf || c.cr < cost });
      };
      MODALS.upg = (v, m) => {
        const n = m.n, P = c.P[n];
        fullPanel(v, `${N[n].n} upgrades`, `Credits ${cr(c.cr)}`);
        const li = list('upg' + n, 16, Y0 + 54, v.w - 32, Y1 - Y0 - 60);
        let i = 0;
        UPG.forEach((U, u) => {
          if (U.ok && !U.ok(c, n) && !U.why) return;
          const lvl = P[U.k], max = U.max(c), cost = SIM.upgCost(c, n, u), allowed = !U.ok || U.ok(c, n);
          const done = lvl >= max;
          row(li, i++, RH, 'u' + u, { title: `${U.n} ${max > 1 ? lvl + '/' + max : done ? '✓' : ''}`, sub: allowed ? U.d : U.why, right: done ? 'Max' : 'CR ' + cr(cost), dim: done || !allowed,
            on: () => { if (!allowed) toast(U.why, C.rose); else if (done) toast('Already at max', C.muted); else if (SIM.upgrade(c, n, u, now)) api.sfx.tone({ f: 600, to: 900, d: 0.12, v: 0.06 }); else toast('Not enough credits', C.rose); } });
        });
        if (P.st) {
          SVC.forEach((S, k) => {
            const own = P.sv & (1 << k), cost = Math.round(S.cost * TUNE.regionScale[N[n].r]);
            row(li, i++, RH, 'sv' + k, { title: `${S.n} ${own ? '✓' : ''}`, sub: `${S.d} +${cr(S.inc * TUNE.regionScale[N[n].r])}/h`, right: own ? 'Owned' : 'CR ' + cr(cost), dim: !!own,
              on: () => { if (!own && !SIM.buyService(c, n, k, now)) toast('Not enough credits', C.rose); } });
          });
        } else if (P.tier < DEV.length) {
          const Dv = DEV[P.tier], cost = SIM.devCost(c, n);
          row(li, i++, RH, 'dev', { title: `Develop: ${Dv.n} (${P.tier}/${DEV.length})`, sub: P.dn ? `${P.dv}/${P.dn} deliveries done` : `${Dv.need} low-pay deliveries → +2 jobs, +15% fares, more VIPs here`, right: P.dn ? 'In progress' : 'CR ' + cr(cost), dim: !!P.dn,
            on: () => { if (P.dn) return; confirm(`Commission the ${Dv.n} at ${N[n].n} for CR ${cr(cost)}? ${Dv.need} delivery jobs appear at nearby ports. They pay little now, but grow this port for good.`, () => { if (SIM.commissionDev(c, n, now)) toast(`${Dv.n} contracts posted`, C.good); else toast('Not enough credits', C.rose); }); } });
        }
        if (P.yard && c.hq !== n) row(li, i++, RH, 'hq', { title: 'Make HQ', sub: 'New ships roll out here', right: 'Free', on: () => { c.hq = n; toast(`HQ moved to ${N[n].n}`, C.good); } });
      };
      MODALS.design = (v, m) => {
        const d = m.d, Dz = DS[d], ok = SIM.blueprintOk(c, d);
        fullPanel(v, Dz.n, `${FAM[Dz.f]} · Era ${ROMAN[Dz.e]} · ${Dz.d}`);
        add({ ty: 'cut', x: 16, y: Y0 + 52, w: v.w - 32, h: 92, s: designShip(d), closed: 1 });
        const ve = SIM.veOf(c, Dz), dv = Dz.fuel ? ve * Math.log((Dz.dry + Dz.fuel) / Dz.dry) : 0;
        const lines = [
          `Slots ${Dz.cfg.length} (${Dz.cfg.split('').map(q => q === 'S' ? 'seat' : q === 'C' ? 'cabin' : 'cargo').join(', ')})${Dz.fx ? ' · fixed layout' : ' · refittable'}`,
          `Dry ${Dz.dry} t · tank ${Dz.fuel} t · Δv empty ${dv.toFixed(1)} · thrust ${(Dz.F / (Dz.dry + Dz.fuel)).toFixed(2)}`,
          `Lands on: ${Dz.climb ? 'the elevator only' : ['nothing (orbit only)', 'rocks and Ceres', 'Luna-class moons', 'Mars and smaller', 'Earth and everything'][Dz.land]}`,
          `Upkeep CR ${cr(Dz.up)} per flight · price CR ${cr(Dz.cost)}`
        ];
        lines.forEach((q, i) => txt(20, Y0 + 150 + i * 19, q, FONT.sm, C.text));
        const need = Dz.rec.map((r, k) => `${c.parts[Dz.f * 3 + k]}/${r} ${PART[k].toLowerCase()}`).join(' · ');
        let y = Y0 + 228;
        txt(20, y, `Parts (${FAM[Dz.f]}): ${need}`, FONT.smB, Dz.rec.every((r, k) => c.parts[Dz.f * 3 + k] >= r) ? C.good : C.muted);
        if (!ok) txt(330, y, `Blueprint: ${Dz.q[0] === '@' ? 'build the Space Elevator' : 'research ' + TECH[TI[Dz.q]].n}`, FONT.smB, C.rose);
        const capOk = SIM.shipCount(c) < SIM.shipCap(c);
        const fee = Math.round(Dz.cost * TUNE.assembleFee);
        btn(20, Y1 - 50, 210, 42, 'buy', `Buy new · CR ${cr(Dz.cost)}`, () => { const s = SIM.buyShip(c, d); if (s) { toast(`${s.nm} delivered to ${N[c.hq].n}`, C.good); pop(); } }, { hot: 1, dis: !ok || !capOk || c.cr < Dz.cost || Dz.e > c.era, why: !capOk ? `Ship cap ${SIM.shipCap(c)} reached: level up or sell a ship` : !ok ? 'Blueprint needed' : 'Not enough credits' });
        btn(238, Y1 - 50, Math.min(300, v.w - 266), 42, 'asm', `Assemble · CR ${cr(fee)} + parts · ${TUNE.assembleMin[Dz.e]} min`, () => { if (SIM.assemble(c, d, now)) { toast(`Assembling ${Dz.n} at ${N[c.hq].n}`, C.good); pop(); } }, { dis: !SIM.canAssemble(c, d), why: 'Needs the parts, the fee, a free ship slot and the blueprint' });
      };
      MODALS.tech = (v, m) => {
        const T = TECH[TI[m.k]], st = SIM.techState(c, T.k);
        const w = Math.min(520, v.w - 32), x = (v.w - w) / 2, y = Y0 + 20, h = Y1 - Y0 - 40;
        pan(x, y, w, h);
        add({ ty: 'icon2', x: x + 16, y: y + 16, k2: T.k, sz: 48 });
        txt(x + 78, y + 16, (T.key ? '★ ' : '') + T.n, FONT.title, C.amber);
        txt(x + 78, y + 42, `${BRANCH[T.b]} · Era ${ROMAN[T.e]}`, FONT.sm, C.muted);
        let yy = para(x + 16, y + 76, w - 32, T.d + '.', FONT.body, C.text) + 6;
        const need = (T.q || []).map(q => TECH[TI[q]].n + (c.tech[q] ? ' ✓' : ''));
        if (need.length) yy = para(x + 16, yy, w - 32, 'Needs: ' + need.join(', '), FONT.sm, C.muted, 18) + 4;
        txt(x + 16, yy, `Cost: ${T.rp} RP (you have ${Math.floor(c.rp)}) · CR ${cr(T.cr)} · ${T.m} min in the lab`, FONT.smB, C.text);
        const busy = c.res.length >= SIM.resSlots(c);
        const blk = st === 'done' ? 'Already researched' : st === 'busy' ? 'In the lab now' : st === 'era' ? `Opens in Era ${ROMAN[T.e]}` : st === 'prereq' ? 'Research what it needs first'
          : busy ? 'The lab is busy' : c.rp < T.rp ? `Needs ${T.rp} RP` : c.cr < T.cr ? 'Not enough credits' : '';
        btn(x + 16, y + h - 54, 200, 42, 'res', st === 'done' ? 'Researched ✓' : 'Research', () => { if (SIM.research(c, T.k, now)) { api.sfx.tone({ f: 440, to: 880, d: 0.2, v: 0.06, type: 'triangle' }); pop(); } }, { hot: 1, dis: !!blk, why: blk, pref: 1 });
        btn(x + 224, y + h - 54, 190, 42, 'grant', `Grant +10 RP · ${cr(SIM.grantCost(c))}`, () => { const g = SIM.grantCost(c); if (c.cr >= g) { c.cr -= g; c.rp += 10; } else toast('Not enough credits', C.rose); });
        btn(x + w - 84, y + 8, 72, 36, 'close', 'Close', pop, { chip: 1 });
      };
      const HELP = [
        ['Getting started', 'Your first ship, a Kestrel capsule, is docked at Kourou, your HQ. Tap Kourou (or move the highlight with the d-pad and press A), open the ship, then Cargo to load jobs. Back in the ship view, press Plan launch, pick the stops on the map and press the red LAUNCH button. Flights run in real time, even while the Deck sleeps. Earn credits, license more ports, buy ships and research technology.'],
        ['Jobs and VIPs', 'Each port has a job board that refills every few minutes. Seats carry passengers, cabins carry passengers in comfort (+25%), cargo racks carry crates. Jobs only go to ports you own. VIP jobs pay 2–5× but have a deadline that starts at launch; late VIPs pay half (80% with Insurance). Jobs for other ports wait at the arrival port as transfers.'],
        ['Burns, Δv and fuel', 'Range is Δv. Every space leg has its own burn: an efficient burn accelerates briefly, coasts, then brakes (slow but cheap); a hard burn thrusts the whole way, flipping halfway (fast but thirsty). Launches and landings have a fixed burn. Heavy loads leave less Δv. Fuel is paid for what each flight burns, at the price where the ship filled up.'],
        ['Depots and range', 'Ships refill at ports with a fuel depot. Long trips hop through depots: the planner shows the Δv left after every leg and marks refuelling stops. Research Orbital Depots to add depots to orbital stations, and ISRU for cheap local propellant.'],
        ['Research and RP', 'Research costs research points (RP), credits and time in the lab. RP comes from labs at your ports (upgrade a port with a Lab), research payload deliveries to lab ports, mission deliveries, level-ups, and grants bought with credits. Each era column of the tree opens with that era; ★ techs are keystones for the next era.'],
        ['Eras', 'Era I is Earth orbit and the Moon. Era II needs level 10, Tether Materials and the Space Elevator, and opens Mars and probe missions to Venus and Mercury. Era III needs level 24, the Fusion Torch Drive and the Phobos Torch Yards, and opens the Belt, Jupiter and the Venus stations. The Projects tab shows what is missing.'],
        ['Projects and stations', 'Megaprojects (the Space Elevator, the Phobos Torch Yards) are built from deliveries: commission one, and its cargo appears on your boards. Build sites are empty spots where you can found your own station from kit deliveries, then add services that earn income while you are away. Development projects grow a port: more jobs, better fares, more VIPs.'],
        ['Ships, upgrades and parts', 'Buy ships new, or assemble them from parts for a smaller fee. Parts drop from deliveries and are sold at the market. Upgrade ships at a shipyard: tanks (more Δv), engines (faster hard burns), hull extension (another slot), comfort (better passenger fares), and livery. Your fleet size is capped by level.'],
        ['Routines and the idle cap', 'With Flight Planning researched, a ship can loop between two ports, loading jobs at each end. Routines stop starting new trips 4 hours after you were last in the game (8, 16 or 24 with Fleet Autonomy) and resume when you return. Flights already under way always finish.'],
        ['Missions', 'From Era II, Earth\'s orbital ports post missions: probes and satellites bound for Venus Polar Orbit, Mercury Orbit and the Solar Watch. They pay well and give RP. Drop zones have no port or depot, so the ship holds in orbit afterwards: keep enough Δv to fly home (or tow it back).'],
        ['Controls', 'Touch: tap, drag to pan or scroll, drag a burn slider. Controller: d-pad moves the highlight, A selects, B goes back, L/R switch tabs (and set the burn in the planner), X jumps to an idle ship, Y jumps between regions, right stick pans the map, the trackpad is a mouse. Keyboard: arrows, Space = A, X = B, Q/E = L/R.']
      ];
      MODALS.help = (v, m) => {
        if (m.topic !== undefined) { ui.help = m.topic; m.topic = undefined; }
        fullPanel(v, 'How to play', m.first ? 'Welcome to Sol: Tycoon' : 'Pick a topic');
        const lw = Math.min(200, Math.round(v.w * 0.34)), li = list('helpTopics', 16, Y0 + 54, lw, Y1 - Y0 - 60);
        HELP.forEach((h, i) => row(li, i, 42, 'ht' + i, { title: h[0], sel: ui.help === i, compact: 1, on: () => { ui.help = i; }, pref: !m.first && ui.help === i }));
        const x = 16 + lw + 14, w = v.w - x - 24;
        let y = para(x, Y0 + 56, w, HELP[ui.help][1], FONT.body, C.text, 21);
        if (ui.help === HELP.length - 1) {
          const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
          txt(x, y + 10, pads.length ? `Controller: ${pads[0].id.replace(/\(.*?\)/g, '').trim().slice(0, 40) || 'connected'}` : 'No controller detected. On a Steam Deck tile, run Update Arcade Tiles, then relaunch.', FONT.smB, pads.length ? C.good : C.rose);
          ui.live = true;
        }
        if (m.first) btn(v.w - 196, Y1 - 50, 176, 42, 'ok', 'Start playing', pop, { hot: 1, pref: 1 });
      };
      MODALS.away = (v, m) => {
        const a = m.aw;
        fullPanel(v, 'While you were away', tm(m.gap) + ' away');
        const lines = [`${a.arr} arrivals · ${a.n} deliveries · CR ${cr(a.cr)} earned`];
        if (a.rp >= 1) lines.push(`${Math.round(a.rp)} RP from research and missions`);
        if (a.parts) lines.push(`${a.parts} part(s) found`);
        if (a.lv) lines.push(`${a.lv} level(s) gained: now level ${c.lv}`);
        if (a.res.length) lines.push('Researched: ' + a.res.map(k => TECH[TI[k]].n).join(', '));
        if (a.ps) lines.push(`${a.ps} routine(s) hit the idle cap and paused. They have resumed now.`);
        let y = Y0 + 60;
        for (const q of lines) y = para(20, y, v.w - 56, q, FONT.body, C.text) + 6;
        btn(20, Y1 - 50, 160, 42, 'ok', 'OK', pop, { hot: 1 });
      };
      MODALS.era = (v, m) => {
        fullPanel(v, `Era ${ERA[m.era]}`, 'A new era');
        para(20, Y0 + 60, v.w - 56, ERA_TEXT[m.era] || '', FONT.body, C.text);
        btn(20, Y1 - 50, 160, 42, 'ok', 'Onward', () => { pop(); setTab(0); jumpRegion(m.era === 2 ? 1 : 2, true); }, { hot: 1 });
      };

      // ---------------- TABS
      function fleetTab(v) {
        txt(16, Y0 + 8, `Fleet ${c.sh.length}/${SIM.shipCap(c)}${c.craft.length ? ' · assembling ' + c.craft.map(q => DS[q.d].n + ' (' + tm(q.at - now) + ')').join(', ') : ''}`, FONT.ui, C.muted);
        const li = list('fleet', 8, Y0 + 32, v.w - 16, Y1 - Y0 - 36);
        c.sh.forEach((s, i) => {
          const st = s.f ? `→ ${N[s.f.to].n} · ${tm(s.f.arr - now)}` : s.st === 2 ? `holding at ${N[s.at].n}` : `docked at ${N[s.at].n}`;
          const rt = s.rt ? (s.rt.ps ? ' · routine paused' : ` · routine ${N[s.rt.a].k} ⇄ ${N[s.rt.b].k}`) : '';
          row(li, i, RH, 'fs' + s.i, { shipObj: s, title: s.nm, sub: `${D(s).n} · ${st}${rt}`, right: `${s.ld.length}/${s.cf.length}`, hot: !s.f && s.st === 0 && !s.rt, on: () => openShip(s) });
        });
        ui.live = true;
      }
      function hangarTab(v) {
        ['Shipyard', 'Market', 'Parts'].forEach((q, i) => btn(8 + i * 112, Y0 + 4, 106, 36, 'ht' + i, q, () => { ui.hang = i; }, { chip: 1, act: ui.hang === i }));
        const li = list('hang' + ui.hang, 8, Y0 + 46, v.w - 16, Y1 - Y0 - 50);
        if (ui.hang === 0) {
          txt(352, Y0 + 14, `Ships ${SIM.shipCount(c)}/${SIM.shipCap(c)}`, FONT.ui, C.muted);
          let i = 0;
          DS.forEach((Dz, d) => {
            if (Dz.e > c.era + 1) return;
            const ok = SIM.blueprintOk(c, d) && Dz.e <= c.era;
            row(li, i++, RH, 'ds' + d, { icon: d, title: Dz.n, sub: `${Dz.d} · ${Dz.cfg.length} slots · ${FAM[Dz.f]}`, right: ok ? 'CR ' + cr(Dz.cost) : Dz.e > c.era ? 'Era ' + ROMAN[Dz.e] : 'Locked', dim: !ok, hot: SIM.canAssemble(c, d), on: () => push({ ty: 'design', d }) });
          });
        } else if (ui.hang === 1) {
          txt(352, Y0 + 14, `Restocks in ${tm(c.mk.at - now)}`, FONT.ui, C.muted);
          c.mk.of.forEach((o, i) => {
            const t = o.s ? `Used ${DS[o.d].n}` : `${o.n}× ${FAM[(o.p / 3) | 0]} ${PART[o.p % 3].toLowerCase()}`;
            const sub = o.s ? `${DS[o.d].d} · delivered to HQ · no blueprint needed` : `${cr(o.pr)} each · list ${cr(SIM.partPrice(o.p))}`;
            row(li, i, RH, 'mk' + i + t, { icon: o.s ? o.d : undefined, part: o.s ? undefined : o.p, title: t, sub, right: 'CR ' + cr(o.s ? o.pr : o.pr * o.n), on: () => { if (SIM.buyOffer(c, i)) api.sfx.tone({ f: 700, d: 0.08, v: 0.06 }); else toast(o.s && SIM.shipCount(c) >= SIM.shipCap(c) ? 'Ship cap reached' : 'Not enough credits', C.rose); } });
          });
          if (!c.mk.of.length) txt(16, Y0 + 60, 'Sold out. New stock soon.', FONT.body, C.muted);
          ui.live = true;
        } else {
          let i = 0;
          for (let p = 0; p < 9; p++) {
            if ((p / 3 | 0) > c.era - 1 && !c.parts[p]) continue;
            row(li, i++, RH, 'pt' + p, { part: p, title: `${FAM[(p / 3) | 0]} ${PART[p % 3].toLowerCase()} × ${c.parts[p]}`, sub: 'A or tap sells one', right: 'Sell ' + cr(SIM.partPrice(p) * 0.5), dim: !c.parts[p], on: () => { if (SIM.sellPart(c, p)) api.sfx.tone({ f: 500, d: 0.06, v: 0.05 }); } });
          }
        }
      }
      // research tree: era columns (I–III), branch rows; lines show what each tech needs
      const RD = { colW: 74, eraGap: 26, rowH: 56, x0: 104, y0: Y0 + 60 };
      const RDPOS = (() => {
        const pos = {}, eraX = [0, 0, 0, 0];
        let x = RD.x0;
        for (let e = 1; e <= 3; e++) {
          eraX[e] = x;
          let cols = 0;
          for (let b = 0; b < 4; b++) cols = Math.max(cols, TECH.filter(T => T.e === e && T.b === b).length);
          for (let b = 0; b < 4; b++) TECH.filter(T => T.e === e && T.b === b).forEach((T, i) => { pos[T.k] = { x: x + i * RD.colW, y: RD.y0 + b * RD.rowH }; });
          x += cols * RD.colW + RD.eraGap;
        }
        pos._eraX = eraX; pos._w = x;
        return pos;
      })();
      function rdTab(v) {
        const r0 = c.res[0];
        txt(16, Y0 + 8, r0 ? `Researching ${TECH[TI[r0.k]].n} · ${tm(r0.at - now)} left` : 'The lab is idle: pick something to research', FONT.ui, r0 ? C.cyan : C.amber);
        if (r0) { bar(16, Y0 + 30, 220, 5, (now - r0.s) / (r0.at - r0.s), C.cyan); ui.live = true; }
        txt(v.w - 254, Y0 + 10, `RP ${Math.floor(c.rp)}`, FONT.num, C.cyan);
        btn(v.w - 176, Y0 + 2, 112, 36, 'grant', `+10 RP ${cr(SIM.grantCost(c))}`, () => { const g = SIM.grantCost(c); if (c.cr >= g) { c.cr -= g; c.rp += 10; } else toast('Not enough credits', C.rose); }, { chip: 1 });
        helpChip(v.w - 58, Y0 + 2, 4);
        add({ ty: 'tree' });
        for (const T of TECH) {
          const p = RDPOS[T.k], st = SIM.techState(c, T.k);
          const afford = st === 'ok' && c.rp >= T.rp && c.cr >= T.cr && c.res.length < SIM.resSlots(c);
          add({ ty: 'tech', rd: 1, x: p.x, y: p.y, w: 64, h: 56, k: 'T' + T.k, T, st, afford, f: 1, pref: afford && !ui.fk, lines: wrap(T.n, FONT.sm, 66).slice(0, 2), on: () => push({ ty: 'tech', k: T.k }) });
        }
      }
      function projTab(v) {
        const gs = SIM.gateState(c);
        let y = Y0 + 6;
        if (gs) {
          const g = gs.g, pj = c.pj[g.proj];
          txt(16, y, `Next: Era ${ERA[c.era + 1]}`, FONT.ui, C.amber);
          y += 22;
          const chk = (okk, s) => `${okk ? '✓' : '○'} ${s}`;
          txt(16, y, chk(gs.lv, `Level ${g.lv} (now ${c.lv})`), FONT.smB, gs.lv ? C.good : C.text);
          txt(190, y, chk(gs.tech, TECH[TI[g.tech]].n), FONT.smB, gs.tech ? C.good : C.text);
          txt(380, y, chk(gs.proj, `${PROJ[g.proj].n} ${pj ? pj.got + '/' + pj.need : ''}`), FONT.smB, gs.proj ? C.good : C.text);
          y += 22;
        } else { txt(16, y, 'Era IV · Outer Reach: coming soon', FONT.ui, C.muted); y += 26; }
        helpChip(v.w - 58, Y0 + 2, 6);
        const li = list('proj', 8, y, v.w - 16, Y1 - y - 4);
        let i = 0;
        for (const key of ['elev', 'yards']) {
          const P = PROJ[key], st = SIM.projState(c, key), pj = c.pj[key];
          if (st === 'era' && P.era > c.era + 1) continue;
          row(li, i++, RH, 'pj' + key, { title: P.n, sub: st === 'busy' ? `${pj.got}/${pj.need} ${JT[P.job].n.toLowerCase()}s delivered to ${N[P.site].n}` : P.d,
            right: st === 'done' ? 'Built ✓' : st === 'busy' ? `${pj.got}/${pj.need}` : st === 'tech' ? 'Needs ' + TECH[TI[P.tech]].n : st === 'era' ? 'Era ' + ROMAN[P.era] : 'CR ' + cr(P.cost),
            hot: st === 'ok' && c.cr >= P.cost, dim: st === 'era' || st === 'tech', sel: st === 'done',
            on: () => {
              if (st !== 'ok') { if (st === 'busy') openPort(P.site); return; }
              confirm(`Commission the ${P.n} for CR ${cr(P.cost)}? ${P.need} ${JT[P.job].n.toLowerCase()} jobs appear at your ports, bound for ${N[P.site].n}.`, () => { if (SIM.commissionProj(c, key, now)) toast(`${P.n} commissioned`, C.good); else toast('Not enough credits, or no source ports', C.rose); });
            } });
        }
        for (const n in c.site) { const st = c.site[n]; row(li, i++, RH, 'site' + n, { title: `${N[n].n} (station)`, sub: 'Station kits being delivered', right: `${st.got}/${st.need}`, on: () => openPort(+n) }); }
        for (let n = 0; n < NN; n++) {
          const P = c.P[n];
          if (P && P.dn) row(li, i++, RH, 'dv' + n, { title: `${N[n].n}: ${DEV[P.tier].n}`, sub: 'Development deliveries', right: `${P.dv}/${P.dn}`, on: () => openPort(n) });
          if (P && P.st) row(li, i++, RH, 'stn' + n, { title: `${N[n].n} (your station)`, sub: P.cf >= 1 ? `Coffers: CR ${cr(P.cf)} to collect` : 'Add services in Upgrades', right: `${cr(SIM.stationIncome(n, P))}/h`, hot: P.cf >= 1, on: () => openPort(n) });
        }
        const sites = N.map((q, n) => n).filter(n => N[n].t === 'site' && SIM.nodeOn(c, n) && !c.P[n] && !c.site[n]);
        if (sites.length) row(li, i++, RH, 'sites', { title: 'Build sites', sub: sites.map(n => N[n].n).join(', ') + (SIM.has(c, 'kits') ? '' : ' (research Station Kits)'), right: 'Map', on: () => openPort(sites[0]) });
      }
      function statsTab(v) {
        const s = c.st;
        const L = [
          ['Net worth', 'CR ' + cr(SIM.netWorth(c))], ['Lifetime earnings', 'CR ' + cr(s.earn)], ['Deliveries', s.del], ['Passengers', s.pax],
          ['Cargo moved', Math.round(s.ton) + ' t'], ['Flights', s.flights], ['Δv burned', Math.round(s.dv) + ' km/s'], ['Fuel bought', 'CR ' + cr(s.fuel)],
          ['VIPs on time / late', `${s.vipOk} / ${s.vipLate}`], ['Longest flight', tm(s.longest)], ['Stations built', s.built],
          ['Ports', c.P.filter(Boolean).length], ['Fleet', c.sh.length], ['Play time', tm(s.play)],
          ['Founded', new Date(c.born).toLocaleDateString()], ['Era II reached', c.ms[1] ? new Date(c.ms[1]).toLocaleDateString() : '—'], ['Era III reached', c.ms[2] ? new Date(c.ms[2]).toLocaleDateString() : '—']
        ];
        const colW = (v.w - 32) / 3, per = Math.ceil(L.length / 3);
        L.forEach((q, i) => {
          const x = 16 + Math.floor(i / per) * colW, y = Y0 + 8 + (i % per) * 38;
          txt(x, y, q[0], FONT.sm, C.muted);
          txt(x, y + 16, String(q[1]), FONT.ui, C.text);
        });
        btn(v.w - 226, Y1 - 46, 210, 40, 'reset', 'Found new company', () => confirm('Start over with a brand-new company? This erases the current one.', () => confirm('Really erase everything and start again?', () => {
          c = SIM.newCompany(now); save(); SHIPC.clear(); ui.stack = [{ ty: 'help', first: 1 }]; ui.tab = 0; centerOn(c.hq, true);
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
          const m = top(), vw = api.view.w - (m && m.ty === 'port' ? PW : 0);
          if (w.x - ui.cam.tx < 30) ui.cam.tx = w.x - 60;
          else if (w.x + w.w - ui.cam.tx > vw - 30) ui.cam.tx = w.x + w.w - vw + 60;
          ui.cam.tx = clampCam(ui.cam.tx);
          if (m && m.ty === 'launch') {
            if (w.y - ui.cam.ty < Y0 + 24) ui.cam.ty = w.y - Y0 - 40;
            else if (w.y + w.h - ui.cam.ty > PLAN_PY - 20) ui.cam.ty = w.y + w.h - PLAN_PY + 36;
            ui.cam.ty = clampCamY(ui.cam.ty);
          }
        }
        if (w.rd) {
          const vw = api.view.w;
          if (w.x - ui.rdCamT < 96) ui.rdCamT = w.x - 100;
          else if (w.x + w.w - ui.rdCamT > vw - 16) ui.rdCamT = w.x + w.w - vw + 24;
          ui.rdCamT = Math.max(0, Math.min(Math.max(0, RDPOS._w - vw + 16), ui.rdCamT));
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
        const m = top();
        if (m && m.ty === 'launch' && m.route.length > 1) { m.route.pop(); m.burns.pop(); ui.dirty = true; api.sfx.tone({ f: 330, d: 0.04, v: 0.03 }); return; }
        if (ui.stack.length) { pop(); api.sfx.tone({ f: 300, d: 0.04, v: 0.03 }); }
        else if (ui.tab !== 0) setTab(0);
      }
      function hit(x, y) {
        const m = top(), map = ui.tab === 0 || (m && m.ty === 'launch');
        for (let i = W.length - 1; i >= 0; i--) {
          const w = W[i];
          if (w.ty === 'tab') { if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w; continue; }   // tabs always answer taps
          if (!w.f || w.ty === 'node' || w.ty === 'shipm') continue;
          if (w.l !== layer) continue;
          if (w.ls >= 0) { const L = LS[w.ls]; if (y < L.y || y > L.y + L.h) continue; }
          const X = rx(w), Y = ry(w);
          if (x >= X && x <= X + w.w && y >= Y && y <= Y + w.h) return w;
        }
        // map: ships in flight first, then the nearest port within reach (they are small and dense)
        const mapArea = map && y > Y0 && y < Y1 && (!m || (m.ty === 'port' && x < api.view.w - PW) || (m.ty === 'launch' && y < PLAN_PY));
        if (mapArea) {
          let best = null, bd = 22 * 22;
          for (const w of W) {
            if (!w.f) continue;
            let ex, ey;
            if (w.ty === 'shipm') { const p = shipXY(w.s, now); ex = p.x - ui.cam.x - x; ey = p.y - 9 - ui.cam.y - y; }
            else if (w.ty === 'node') { ex = N[w.n].x - ui.cam.x - x; ey = N[w.n].y - ui.cam.y - y; }
            else continue;
            const d = ex * ex + ey * ey - (w.ty === 'shipm' ? 60 : 0);
            if (d < bd) { bd = d; best = w; }
          }
          return best;
        }
        return null;
      }
      function listAt(x, y) {
        for (let i = LS.length - 1; i >= 0; i--) { const L = LS[i]; if (x >= L.x && x <= L.x + L.w && y >= L.y && y <= L.y + L.h) return L.key; }
        return '';
      }
      const listByKey = k => LS.find(L => L.key === k);

      // ---- ships on the map: position along the current leg (accelerate, coast, decelerate)
      const SP = { x: 0, y: 0, burn: false, right: true, ang: 0 };
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
        SP.ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (f.tow) SP.burn = false;
        return SP;
      }
      // flight phase for the live ship view (reused object: no allocation per frame)
      const PH = { k: 'dock', node: 0, to: 0, left: 0, prog: 0, flip: 0 };
      function phaseOf(s, t) {
        PH.flip = 0; PH.prog = 0; PH.left = 0;
        if (!s.f) { PH.k = 'dock'; PH.node = s.at; return PH; }
        const f = s.f, i = Math.min(f.i, f.L.length / 5 - 1) * 5, L = f.L;
        const from = L[i], to = L[i + 1], t0 = L[i + 2], t1 = L[i + 3], tb = L[i + 4];
        PH.node = from; PH.to = to;
        if (t < t0) { PH.k = 'stop'; PH.left = t0 - t; return PH; }
        const T = Math.max(1, t1 - t0), tau = Math.min(T, t - t0);
        PH.prog = tau / T; PH.left = T - tau;
        if (f.tow) { PH.k = 'tow'; return PH; }
        if (tb <= 0) {
          PH.k = DS[s.d].climb ? 'climb' : N[from].w > N[to].w ? 'launch' : 'land';
          if (PH.k === 'land') PH.node = to;
          return PH;
        }
        if (tau < 6000 && N[from].t !== 'drop') { PH.k = 'depart'; PH.prog = tau / 6000; return PH; }
        if (T - tau < 6000 && N[to].t !== 'drop') { PH.k = 'arrive'; PH.node = to; PH.prog = 1 - (T - tau) / 6000; return PH; }
        const flipAt = T - tb;
        if (tau < tb && tau < flipAt - 2000) { PH.k = 'burn'; PH.left = tb - tau; return PH; }
        if (tau >= flipAt - 2000 && tau < flipAt) { PH.k = 'flip'; PH.flip = (tau - flipAt + 2000) / 2000; PH.left = flipAt - tau; return PH; }
        if (tau >= flipAt) { PH.k = 'decel'; PH.left = T - tau; return PH; }
        PH.k = 'coast'; PH.left = flipAt - 2000 - tau;
        return PH;
      }
      const SKY = ['#3f6fb8', '#2f569a', '#22417c', '#18305f', '#112247', '#0b1733', '#070e22', '#03050c'];
      const PHASE_TXT = { dock: 'Docked', stop: 'Refuelling stop', launch: 'Launch', land: 'Landing', climb: 'Climbing the tether', depart: 'Undocking',
        arrive: 'Docking', burn: 'Burn', flip: 'Flip', coast: 'Coast', decel: 'Decel burn', tow: 'Under tow' };
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
      const ptr = { down: false, x0: 0, y0: 0, drag: false, k: '', ty: '', lk: '', map: false, cam0: 0, sc0: 0, leg: -1, legX: 0, legW: 1, rd: false, rd0: 0 };
      function resetPtr() { ptr.down = false; ptr.drag = false; ptr.k = ''; ptr.leg = -1; ptr.lk = ''; }
      const rep = { dir: '', t: 0 };
      function dirRepeat(dt) {
        const h = api.input.held, p = api.input.pressed;
        for (const d of ['up', 'down', 'left', 'right']) if (p[d]) { rep.dir = d; rep.t = 0.38; return d; }
        if (rep.dir && h[rep.dir]) { rep.t -= dt; if (rep.t <= 0) { rep.t = 0.085; return rep.dir; } } else rep.dir = '';
        return '';
      }
      const legSlider = w => { const X = rx(w), sx = X + 128, sw = Math.max(40, w.w - 128 - 112); return [sx, sw]; };

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
        // pointer: activate on release (matched by widget key, so a relayout between press and release can't lose the tap);
        // drags scroll lists, pan the map or the research tree, or move a leg's burn slider
        if (p.pressed) {
          resetPtr();
          const w = hit(p.x, p.y);
          ptr.down = true; ptr.x0 = p.x; ptr.y0 = p.y; ptr.k = w ? w.k : ''; ptr.ty = w ? w.ty : ''; ptr.lk = listAt(p.x, p.y);
          const L = ptr.lk && listByKey(ptr.lk);
          ptr.sc0 = L ? L.sc : 0;
          ptr.map = (ui.tab === 0 || (m && m.ty === 'launch')) && mapMode(m) && p.y > Y0 && p.y < Y1 && (!m || m.ty !== 'port' || p.x < api.view.w - PW) && (!m || m.ty !== 'launch' || p.y < Y1 - 136) && !(w && w.ty !== 'node' && w.ty !== 'shipm');
          ptr.cam0 = ui.cam.x; ptr.camY0 = ui.cam.y;
          ptr.rd = ui.tab === 3 && !m && p.y > Y0 + 44 && p.y < Y1; ptr.rd0 = ui.rdCam;
          if (w && w.ty === 'leg' && !w.L.fixed) { const [sx, sw] = legSlider(w); if (p.x >= sx - 8 && p.x <= sx + sw + 8) { ptr.leg = w.li; ptr.legX = sx; ptr.legW = sw; setLegBurn(m, w.li, (p.x - sx) / sw); } }
          if (!p.virtual) ui.nav = false;
          changed = true;
        }
        if (ptr.down && p.down) {
          const dx = p.x - ptr.x0, dy = p.y - ptr.y0;
          if (!ptr.drag && !p.virtual && Math.abs(dx) + Math.abs(dy) > 8) ptr.drag = true;
          if (ptr.leg >= 0 && m && m.ty === 'launch') setLegBurn(m, ptr.leg, (p.x - ptr.legX) / ptr.legW);
          else if (ptr.drag && ptr.lk) { const L = listByKey(ptr.lk); if (L) { L.sc = Math.max(0, Math.min(L.max, ptr.sc0 - dy)); ui.scroll[L.key] = L.sc; changed = true; } }
          else if (ptr.drag && ptr.map) { ui.cam.x = ui.cam.tx = clampCam(ptr.cam0 - dx); if (m && m.ty === 'launch') ui.cam.y = ui.cam.ty = clampCamY(ptr.camY0 - dy); changed = true; }
          else if (ptr.drag && ptr.rd) { ui.rdCam = ui.rdCamT = Math.max(0, Math.min(Math.max(0, RDPOS._w - api.view.w + 16), ptr.rd0 - dx)); changed = true; }
        }
        if (p.released && ptr.down) {
          const wasDrag = ptr.drag || ptr.leg >= 0, k = ptr.k;
          ptr.down = false;
          if (!wasDrag) {
            const w = hit(p.x, p.y);
            if (w && w.k === k) activate(w);
            else if (!w && m && m.ty === 'port' && ptr.map) pop();
          }
          ptr.leg = -1;
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
          if (f && f.ty === 'leg' && !f.L.fixed && (dir === 'left' || dir === 'right')) setLegBurn(m, f.li, m.burns[f.li] + (dir === 'left' ? -0.05 : 0.05));
          else navigate(dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
          changed = true;
        }
        if (inp.pressed.a && !p.virtual) { ui.nav = true; activate(focused()); changed = true; }
        if (inp.pressed.b) { back(); changed = true; }
        if (inp.pressed.l || inp.pressed.r) {
          const d = inp.pressed.l ? -1 : 1, f = focused();
          if (m && m.ty === 'launch') { const i = f && f.ty === 'leg' ? f.li : (m.pl ? m.pl.info.length - 1 : -1); if (i >= 0) setLegBurn(m, i, m.burns[i] + d * 0.25); }
          else if (m && m.ty === 'cargo') { ui.cargoTab = d > 0 ? 1 : 0; ui.dirty = true; }
          else if (mapMode(m)) setTab(ui.tab + d);
          changed = true;
        }
        if (inp.pressed.x && mapMode(m) && (!m || m.ty !== 'launch')) { nextIdle(); changed = true; }
        if (inp.pressed.y && ui.tab === 0 && (!m || m.ty === 'port')) {
          const regs = REGION_CHIPS.filter(i => REGION_ERA[i] <= c.era);
          const k = regs.indexOf(ui.region);
          jumpRegion(regs[(k + 1) % regs.length]); ui.stack = []; changed = true;
        }
        const s2 = inp.stick2;
        if ((ui.tab === 0 || (m && m.ty === 'launch')) && (s2.x || s2.y) && mapMode(m)) { ui.cam.tx = clampCam(ui.cam.tx + s2.x * 700 * dt); changed = true; }
        if (ui.tab === 3 && !m && s2.x) { ui.rdCamT = Math.max(0, Math.min(Math.max(0, RDPOS._w - api.view.w + 16), ui.rdCamT + s2.x * 500 * dt)); changed = true; }
        // camera glides, focus pop, animation
        if (Math.abs(ui.cam.tx - ui.cam.x) > 0.5) { ui.cam.x += (ui.cam.tx - ui.cam.x) * Math.min(1, dt * 9); changed = true; }
        else if (ui.cam.x !== ui.cam.tx) { ui.cam.x = ui.cam.tx; changed = true; }
        if (!(m && m.ty === 'launch')) ui.cam.ty = 0;
        if (Math.abs(ui.cam.ty - ui.cam.y) > 0.5) { ui.cam.y += (ui.cam.ty - ui.cam.y) * Math.min(1, dt * 9); changed = true; }
        else if (ui.cam.y !== ui.cam.ty) { ui.cam.y = ui.cam.ty; changed = true; }
        if (Math.abs(ui.rdCamT - ui.rdCam) > 0.5) { ui.rdCam += (ui.rdCamT - ui.rdCam) * Math.min(1, dt * 9); changed = true; }
        else if (ui.rdCam !== ui.rdCamT) { ui.rdCam = ui.rdCamT; changed = true; }
        if (ui.pop > 0) { ui.pop = Math.max(0, ui.pop - dt * 4); changed = true; }
        if (ui.dirty) { layout(); changed = true; }
        if (ui.anim) changed = true;                     // the live ship view animates only while it is open
        if ((ui.tab === 0 || (m && m.ty === 'launch')) && mapMode(m) && shipsMoved()) changed = true;
        if (ui.needSave && now - ui.saveAt > 4000) save();
        return changed;
      }

      // ---- drawing
      function draw(ctx, v) {
        ctx.imageSmoothingEnabled = false;
        if (!LW) labelWidths(ctx);
        ctx.fillStyle = C.bg; ctx.fillRect(0, 0, v.w, v.h);
        const m = top();
        if ((ui.tab === 0 || (m && m.ty === 'launch')) && mapMode(m)) drawMap(ctx, v, m);
        else if (stars) { ctx.globalAlpha = 0.5; ctx.drawImage(stars, 0, 0, v.w, 360); ctx.globalAlpha = 1; }
        const fw = (ui.nav || api.pointer.virtual) ? focused() : null;
        for (const w of W) {
          if (w.ty === 'map' || w.ty === 'node' || w.ty === 'shipm') continue;
          if (w.ls >= 0) {
            const L = LS[w.ls], Y = ry(w);
            if (Y + w.h < L.y || Y > L.y + L.h) continue;
            if (Y < L.y || Y + w.h > L.y + L.h) { ctx.save(); ctx.beginPath(); ctx.rect(L.x - 4, L.y, L.w + 8, L.h); ctx.clip(); drawW(ctx, w, v); ctx.restore(); continue; }
          }
          drawW(ctx, w, v);
        }
        for (const L of LS) if (L.max > 0) {
          const h = Math.max(16, L.h * L.h / (L.h + L.max)), y = L.y + (L.h - h) * (L.sc / L.max);
          ctx.fillStyle = C.line; ctx.fillRect(L.x + L.w + 1, L.y, 2, L.h);
          ctx.fillStyle = C.muted; ctx.fillRect(L.x + L.w + 1, y, 2, h);
        }
        if (fw) {
          const g = ui.pop * 3;
          ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
          if (fw.ty === 'node') { const x = N[fw.n].x - ui.cam.x, y = N[fw.n].y; ctx.strokeRect(x - 12 - g, y - 12 - g, 24 + 2 * g, 24 + 2 * g); }
          else if (fw.ty === 'shipm') { const p = shipXY(fw.s, now); ctx.strokeRect(p.x - ui.cam.x - 11 - g, p.y - 20 - g, 22 + 2 * g, 22 + 2 * g); }
          else {
            const X = rx(fw), Y = ry(fw);
            if (fw.ls >= 0) { const L = LS[fw.ls]; ctx.save(); ctx.beginPath(); ctx.rect(L.x - 4, L.y - 2, L.w + 8, L.h + 4); ctx.clip(); }
            ctx.strokeRect(X - 1 - g, Y - 1 - g, fw.w + 2 + 2 * g, fw.h + 2 + 2 * g);
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
            if (w.red) {
              ctx.fillStyle = w.dis ? '#3a1a22' : REDD; ctx.fillRect(X - 2, Y - 2, w.w + 4, w.h + 4);
              ctx.fillStyle = w.dis ? '#5a2a34' : RED; ctx.fillRect(X, Y, w.w, w.h);
              ctx.fillStyle = w.dis ? '#5a2a34' : '#ff8a96'; ctx.fillRect(X, Y, w.w, 3);
              ctx.fillStyle = w.dis ? '#8a5a64' : '#ffffff';
              ctx.font = FONT.big; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
              ctx.fillText(w.label, X + w.w / 2, Y + w.h / 2 + 1);
              break;
            }
            ctx.fillStyle = w.danger ? '#3a1426' : hot ? '#3a2a10' : act ? C.panel2 : C.panel;
            ctx.fillRect(X, Y, w.w, w.h);
            ctx.fillStyle = w.dis ? C.line : w.danger ? C.rose : hot || act ? C.amber : C.line;
            ctx.fillRect(X, Y + w.h - 2, w.w, 2);
            if (w.ty === 'btn') { ctx.fillRect(X, Y, w.w, 1); ctx.fillRect(X, Y, 1, w.h); ctx.fillRect(X + w.w - 1, Y, 1, w.h); }
            ctx.font = w.ty === 'tab' ? FONT.tab : w.small ? FONT.smB : FONT.ui; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
            ctx.fillStyle = w.dis ? C.dim : w.danger ? C.rose : hot || act ? C.amber : C.text;
            ctx.fillText(w.label, X + w.w / 2, Y + w.h / 2 + 1);
            if (w.badge) { ctx.fillStyle = C.rose; ctx.fillRect(X + w.w - 20, Y + 4, 16, 16); ctx.fillStyle = C.text; ctx.font = FONT.smB; ctx.fillText(w.badge, X + w.w - 12, Y + 12); }
            if (w.slot) { ctx.fillStyle = w.slot === 'S' ? C.cyan : w.slot === 'C' ? C.torch : C.amber; ctx.fillRect(X + w.w / 2 - 8, Y + 6, 16, 6); }
            break;
          }
          case 'row': {
            ctx.fillStyle = w.sel ? '#13304a' : C.panel; ctx.fillRect(X, Y, w.w, w.h);
            ctx.fillStyle = w.sel ? C.cyan : w.hot ? C.amber : C.line; ctx.fillRect(X, Y, 3, w.h);
            let tx = X + 14;
            if (w.icon !== undefined || w.shipObj) {
              const e = w.shipObj ? shipSpr(w.shipObj, 'icon') : designIcon(w.icon);
              ctx.drawImage(e.cv, Math.round(X + 8 + (52 - e.w) / 2), Math.round(Y + (w.h - e.h) / 2));
              tx = X + 68;
            } else if (w.part !== undefined) {
              ctx.fillStyle = [C.amber, C.cyan, C.torch][(w.part / 3) | 0]; ctx.fillRect(X + 12, Y + w.h / 2 - 10, 20, 20);
              ctx.fillStyle = C.bg; ctx.font = FONT.smB; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HDS'[w.part % 3], X + 22, Y + w.h / 2 + 1);
              tx = X + 42;
            } else if (w.job) {
              const j = w.job, ic = (j.v ? SPR.jiconV : SPR.jicon)[j.t];
              ctx.drawImage(ic, X + 10, Y + (w.h - 32) / 2, 32, 32);
              if (j.v) { ctx.fillStyle = C.rose; ctx.fillRect(X + 34, Y + 4, 10, 10); }
              tx = X + 52;
            }
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            if (w.compact) { ctx.font = FONT.ui; ctx.fillStyle = w.sel ? C.cyan : C.text; ctx.fillText(w.title, tx, Y + (w.h - 16) / 2); break; }
            ctx.font = FONT.ui; ctx.fillStyle = w.dim ? C.dim : C.text; ctx.fillText(w.title, tx, Y + 6);
            ctx.font = FONT.sm; ctx.fillStyle = w.dim ? C.dim : C.muted; ctx.fillText(w.sub || '', tx, Y + 26);
            if (w.swatch) { ctx.fillStyle = w.swatch; ctx.fillRect(X + w.w - 60, Y + 10, 44, 22); ctx.fillStyle = C.bg; ctx.fillRect(X + w.w - 60, Y + 28, 44, 4); }
            if (w.right) { ctx.textAlign = 'right'; ctx.font = FONT.ui; ctx.fillStyle = w.dim ? C.dim : w.sel ? C.cyan : C.amber; ctx.fillText(w.right, X + w.w - 12, Y + 6); }
            break;
          }
          case 'leg': drawLeg(ctx, w, X, Y); break;
          case 'cut': drawCut(ctx, w); break;
          case 'scene': drawScene(ctx, w); break;
          case 'tree': drawTree(ctx, v); break;
          case 'tech': drawTech(ctx, w, X, Y); break;
          case 'icon2': ctx.drawImage(SPR.tech[w.k2], X, Y, w.sz, w.sz); break;
        }
      }
      function drawLeg(ctx, w, X, Y) {
        const L = w.L, m = w.md;
        ctx.fillStyle = L.ok ? C.panel : '#2a1222'; ctx.fillRect(X, Y, w.w, w.h);
        ctx.fillStyle = L.ok ? (L.limited ? C.amber : C.line) : C.rose; ctx.fillRect(X, Y, 3, w.h);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = FONT.ui; ctx.fillStyle = C.text;
        ctx.fillText(`${N[L.from].k} → ${N[L.to].k}`, X + 10, Y + 3);
        ctx.font = FONT.sm; ctx.fillStyle = L.ok ? C.muted : C.rose;
        ctx.fillText(L.ok ? `${tm(L.dt)}${L.refuel ? ' · refuels' : ''}` : 'Can\'t fly', X + 10, Y + 20);
        const [sx, sw] = legSlider(w), mid = Y + 13;
        if (L.fixed) { ctx.font = FONT.smB; ctx.fillStyle = C.muted; ctx.fillText(DS[ship(m.s).d].climb ? 'Elevator climb' : 'Fixed burn', sx, Y + 6); }
        else {
          ctx.fillStyle = C.line; ctx.fillRect(sx, mid - 2, sw, 4);
          const b = m.burns[w.li], eff = L.burn;
          ctx.fillStyle = C.amber; ctx.fillRect(sx, mid - 2, Math.round(sw * eff), 4);
          if (L.bMax >= 0 && L.bMax < 1) { ctx.fillStyle = C.rose; ctx.fillRect(sx + Math.round(sw * L.bMax), mid - 7, 2, 14); }
          const kx = sx + Math.round(sw * b);
          ctx.fillStyle = C.text; ctx.fillRect(kx - 5, mid - 8, 10, 16); ctx.fillStyle = C.amber; ctx.fillRect(kx - 3, mid - 6, 6, 12);
          ctx.font = FONT.sm; ctx.fillStyle = C.muted; ctx.textAlign = 'left';
          ctx.fillText(L.limited ? 'Δv-limited: ' + Math.round(eff * 100) + '%' : b < 0.2 ? 'Efficient' : b > 0.85 ? 'Hard burn' : 'Burn ' + Math.round(b * 100) + '%', sx, Y + 21);
        }
        // Δv left after this leg
        ctx.textAlign = 'right'; ctx.font = FONT.sm; ctx.fillStyle = C.text;
        ctx.fillText(`Δv left ${L.dvLeft.toFixed(1)}`, X + w.w - 8, Y + 3);
        ctx.fillText(`CR ${cr(L.fuelCr)}`, X + w.w - 8, Y + 20);
      }
      function drawCut(ctx, w) {
        const s = w.s, g = cutGeom(w), e = g.e, sc = g.sc;
        ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
        ctx.fillStyle = '#0b1030'; ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.fillStyle = '#141b40';
        for (let x = w.x + 12; x < w.x + w.w; x += 40) ctx.fillRect(x, w.y, 4, w.h);
        ctx.drawImage(e.cv, g.ox, g.oy, e.w * sc, e.h * sc);
        if (!w.closed && w.sj) {
          ctx.font = FONT.smB; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          for (let i = 0; i < w.sj.length && i < e.slots.length; i++) {
            const j = w.sj[i];
            if (!j) continue;
            const sl = e.slots[i], x = g.ox + sl.x * sc, floor = g.oy + e.iy1 * sc;
            if (JT[j.t].p) { const pc = j.v ? SPR.vip[j.i & 3] : SPR.pax[j.t][j.i & 3]; ctx.drawImage(pc, Math.round(x + (sl.w * sc - pc.width * sc) / 2), floor - pc.height * sc, pc.width * sc, pc.height * sc); }
            else { const cc = SPR.crate[j.t]; ctx.drawImage(cc, Math.round(x + (sl.w * sc - cc.width * sc) / 2), floor - cc.height * sc, cc.width * sc, cc.height * sc); }
            const ly = g.oy + e.h * sc + 2;
            if (ly + 14 < w.y + w.h && sl.w * sc >= 26) { ctx.fillStyle = j.v ? C.rose : C.text; ctx.fillText(N[j.d].k, x + sl.w * sc / 2, ly); }
          }
        }
        ctx.restore();
      }
      // the live view: the port's own scene, or deep space while flying
      const SCENES = new Map();
      function sceneFor(n, w, h) {
        const key = n * 4096 + Math.round(w) * 4 + (h > 200 ? 1 : 0);
        let sc = SCENES.get(key);
        if (!sc) { sc = sceneCanvas(n, Math.round(w), Math.round(h), c); SCENES.set(key, sc); }
        return sc;
      }
      function drawScene(ctx, w) {
        const s = w.s, ph = phaseOf(s, now), Dz = DS[s.d];
        ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
        // launches and landings: on the pad for the first (last) part, then high above it with the ground falling away
        const asc = (ph.k === 'launch' && ph.prog > 0.45) || (ph.k === 'land' && ph.prog < 0.55);
        const space = asc || ph.k === 'burn' || ph.k === 'coast' || ph.k === 'flip' || ph.k === 'decel' || ph.k === 'tow' || ph.k === 'climb';
        const t = now / 1000;
        let shake = 0;
        if (space) {
          ctx.fillStyle = '#03050c'; ctx.fillRect(w.x, w.y, w.w, w.h);
          // starfield streams past: fast while burning, slow while coasting
          const vy = ph.k === 'climb' || asc, sp = ph.k === 'coast' || ph.k === 'tow' ? 18 : vy ? 0 : 160;
          if (asc) {
            // the sky darkens as the ship climbs (or brightens as it comes down)
            const k = ph.k === 'launch' ? (ph.prog - 0.45) / 0.55 : 1 - ph.prog / 0.55;
            ctx.fillStyle = SKY[Math.max(0, Math.min(SKY.length - 1, Math.floor(k * SKY.length)))]; ctx.fillRect(w.x, w.y, w.w, w.h);
          }
          if (stars) {
            const sw = api.view.w, off = vy ? 0 : -((t * sp) % sw);
            const vs = ph.k === 'climb' ? 60 : ph.k === 'launch' ? 220 : -160;
            const voff = vy ? ((((t * vs) % 360) + 360) % 360) - 360 : 0;
            for (let k = 0; k < 2; k++) for (let q = 0; q < 2; q++) ctx.drawImage(stars, w.x + off + k * sw, w.y + voff + q * 360 - (vy ? 0 : 60), sw, 360);
          }
          if (ph.k === 'climb') { ctx.fillStyle = '#8d95c4'; ctx.fillRect(w.x + w.w / 2 - 1, w.y, 2, w.h); }
        } else {
          const sc = sceneFor(ph.node, w.w, w.h);
          ctx.drawImage(sc.cv, w.x, w.y, w.w, w.h);
        }
        // the ship
        const vert = ph.k === 'launch' || ph.k === 'land' || (!space && (ph.k === 'dock' || ph.k === 'stop') && N[ph.node].t === 'pad');
        const e = shipSpr(s, vert ? 'bigV' : 'big');
        const sc = Math.max(1, Math.min(3, Math.floor(Math.min((w.w * 0.62) / e.w, (w.h * 0.55) / e.h) * 2) / 2));
        const sw = e.w * sc, sh = e.h * sc;
        let cx = w.x + w.w / 2, cy = w.y + w.h * 0.56, right = true, plume = 0, rot = 0;
        const sceneInfo = !space ? sceneFor(ph.node, w.w, w.h) : null;
        if (vert && asc) { cy = w.y + 48 + (w.h - 48) / 2; plume = 1; shake = ph.k === 'launch' ? 1 : 0; }
        else if (vert) {
          const ground = w.y + sceneInfo.ground;
          cy = ground - sh / 2;
          if (ph.k === 'launch') { const p = ph.prog / 0.45; cy -= p * p * (w.h * 0.62); plume = 1; shake = 1; }
          if (ph.k === 'land') { const p = (1 - ph.prog) / 0.45; cy -= p * p * (w.h * 0.62); plume = 1; }
          cx = w.x + w.w * 0.5;
        } else if (!space) {
          const y0 = w.y + (sceneInfo.dock || w.h * 0.55);
          cy = sceneInfo.kind === 'surface' ? w.y + sceneInfo.ground - sh / 2 : y0 + sh / 2;
          if (ph.k === 'depart') { cx += ph.prog * ph.prog * (w.w * 0.7); plume = ph.prog > 0.2 ? 1 : 0; }
          if (ph.k === 'arrive') { const p = 1 - ph.prog; cx -= p * p * (w.w * 0.7); right = true; plume = p > 0.15 ? 2 : 0; }
        } else {
          if (ph.k === 'burn') plume = 1;
          if (ph.k === 'decel') { right = false; plume = 1; }
          if (ph.k === 'flip') rot = ph.flip * Math.PI;
          if (ph.k === 'climb') { cy += 0; }
        }
        if (shake) { cx += Math.sin(t * 60) * 1.5; cy += Math.cos(t * 47) * 1; }
        ctx.save();
        ctx.translate(Math.round(cx), Math.round(cy));
        if (rot) ctx.rotate(rot);
        if (vert) {
          if (plume && !Dz.climb) { const pc = SPR.plumeBig[Dz.f], fl = 1 + 0.12 * Math.sin(t * 40); ctx.save(); ctx.rotate(-Math.PI / 2); ctx.drawImage(pc, -sh / 2 - pc.width * sc * fl, -pc.height * sc / 2, pc.width * sc * fl, pc.height * sc); ctx.restore(); }
          ctx.drawImage(e.cv, -sw / 2, -sh / 2, sw, sh);
        } else {
          if (!right) ctx.scale(-1, 1);
          if (plume && !Dz.climb) {
            const pc = SPR.plumeBig[Dz.f], fl = 1 + 0.12 * Math.sin(t * 40);
            const pw = pc.width * sc * fl * (plume === 2 ? 0.6 : 1);
            ctx.drawImage(pc, -sw / 2 - pw, (e.cy - e.h / 2) * sc - pc.height * sc / 2, pw, pc.height * sc);
          }
          ctx.drawImage(e.cv, -sw / 2, -sh / 2, sw, sh);
        }
        ctx.restore();
        // status strip
        ctx.fillStyle = C.bg2; ctx.fillRect(w.x, w.y, w.w, 48);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = FONT.title; ctx.fillStyle = C.amber; ctx.fillText(s.nm, w.x + 12, w.y + 6);
        ctx.font = FONT.sm; ctx.fillStyle = C.text;
        let line;
        if (ph.k === 'dock') line = `${Dz.n} · ${s.st === 2 ? 'holding at' : 'docked at'} ${N[s.at].n}${s.rt ? ' · ' + routineLine(s) : ''}`;
        else {
          const nxt = ph.k === 'burn' ? 'coast in ' : ph.k === 'coast' ? 'decel burn in ' : ph.k === 'stop' ? 'next leg in ' : 'arriving in ';
          line = `${PHASE_TXT[ph.k]} · ${N[s.f.L[0]].k} → ${N[s.f.to].k} · ${ph.k === 'flip' ? 'flipping' : nxt + tm(ph.k === 'burn' || ph.k === 'coast' || ph.k === 'stop' ? ph.left : s.f.arr - now)}`;
        }
        ctx.fillText(line, w.x + 12, w.y + 29);
        // Δv and fuel, right side
        const cap = SIM.shipFuel(s), fuelFrac = cap ? (s.f ? s.fu : (SIM.depotAt(c, s.at) ? cap : s.fu)) / cap : 0;
        const rx0 = w.x + w.w - 290;
        if (rx0 > w.x + 220) {
          ctx.font = FONT.smB; ctx.fillStyle = C.cyan; ctx.fillText(`Δv ${SIM.dvCap(c, s).toFixed(1)}`, rx0, w.y + 8);
          ctx.fillStyle = C.muted; ctx.fillText('Fuel', rx0, w.y + 28);
          ctx.fillStyle = C.line; ctx.fillRect(rx0 + 34, w.y + 33, 100, 5);
          ctx.fillStyle = C.cyan; ctx.fillRect(rx0 + 34, w.y + 33, Math.round(100 * Math.max(0, Math.min(1, fuelFrac))), 5);
        }
        if (s.f) {
          ctx.fillStyle = C.line; ctx.fillRect(w.x, w.y + 46, w.w, 2);
          ctx.fillStyle = C.amber; ctx.fillRect(w.x, w.y + 46, Math.round(w.w * Math.max(0, Math.min(1, (now - s.f.t0) / (s.f.arr - s.f.t0)))), 2);
        }
        ctx.restore();
      }
      function drawTree(ctx, v) {
        const ox = -ui.rdCam;
        ctx.save(); ctx.beginPath(); ctx.rect(0, Y0 + 44, v.w, Y1 - Y0 - 44); ctx.clip();
        // era headers and branch labels
        ctx.font = FONT.smB; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        for (let e = 1; e <= 3; e++) { ctx.fillStyle = e <= c.era ? C.amber : C.dim; ctx.fillText(`Era ${ROMAN[e]}`, RDPOS._eraX[e] + ox, Y0 + 46); }
        for (let b = 0; b < 4; b++) {
          const y = RD.y0 + b * RD.rowH;
          ctx.fillStyle = 'rgba(42,51,99,0.35)'; ctx.fillRect(0, y - 4, v.w, 1);
        }
        // prerequisite lines
        ctx.strokeStyle = '#3a4680'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (const T of TECH) if (T.q) for (const q of T.q) {
          const a = RDPOS[q], b = RDPOS[T.k];
          ctx.moveTo(a.x + 64 + ox, a.y + 15); ctx.lineTo(b.x + ox, b.y + 15);
        }
        ctx.stroke();
        ctx.restore();
        // branch labels pinned on the left
        ctx.fillStyle = C.bg; ctx.fillRect(0, RD.y0 - 6, 96, 4 * RD.rowH);
        ctx.font = FONT.smB; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        for (let b = 0; b < 4; b++) { ctx.fillStyle = C.muted; ctx.fillText(BRANCH[b], 10, RD.y0 + b * RD.rowH + 10); }
      }
      function drawTech(ctx, w, X, Y) {
        if (X + w.w < 96 || X > api.view.w) return;
        ctx.save(); ctx.beginPath(); ctx.rect(96, Y0 + 44, api.view.w - 96, Y1 - Y0 - 44); ctx.clip();
        const st = w.st, col = st === 'done' ? C.good : st === 'busy' ? C.cyan : w.afford ? C.amber : st === 'ok' ? C.text : C.dim;
        ctx.fillStyle = st === 'done' ? '#123a2a' : st === 'busy' ? '#10314a' : w.afford ? '#3a2a10' : C.panel;
        ctx.fillRect(X, Y, 64, 30);
        ctx.fillStyle = col; ctx.fillRect(X, Y + 28, 64, 2);
        ctx.globalAlpha = st === 'era' || st === 'prereq' ? 0.45 : 1;
        ctx.drawImage(SPR.tech[w.T.k], X + 20, Y + 2, 24, 24);
        ctx.globalAlpha = 1;
        if (w.T.key) { ctx.fillStyle = C.amber; ctx.font = FONT.smB; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('★', X + 3, Y + 1); }
        ctx.font = FONT.sm; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = st === 'era' || st === 'prereq' ? C.dim : C.text;
        for (let i = 0; i < w.lines.length; i++) ctx.fillText(w.lines[i], X + 32, Y + 31 + i * 12.5);
        ctx.restore();
      }
      function drawHud(ctx, v) {
        ctx.fillStyle = C.bg2; ctx.fillRect(0, 0, v.w, 28);
        ctx.fillStyle = C.line; ctx.fillRect(0, 28, v.w, 1);
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = FONT.num; ctx.fillStyle = c.cr < 0 ? C.rose : C.amber; ctx.fillText('CR ' + cr(c.cr), 8, 15);
        ctx.font = FONT.ui;
        let x = 138;
        ctx.fillStyle = C.text; ctx.fillText('Lv ' + c.lv, x, 15);
        const a = TUNE.xpNeed(c.lv), b = TUNE.xpNeed(c.lv + 1);
        ctx.fillStyle = C.line; ctx.fillRect(x + 42, 13, 40, 5);
        ctx.fillStyle = C.amber; ctx.fillRect(x + 42, 13, Math.round(40 * Math.max(0, Math.min(1, (c.xp - a) / (b - a)))), 5);
        x += 96;
        ctx.fillStyle = C.cyan; ctx.fillText('RP ' + Math.floor(c.rp), x, 15);
        x += 70;
        ctx.fillStyle = C.text; ctx.fillText(`Ships ${c.sh.length}/${SIM.shipCap(c)}`, x, 15);
        x += 92;
        if (x + 60 < v.w - 56) { ctx.fillStyle = C.torch; ctx.fillText('Era ' + ROMAN[c.era], x, 15); }
      }
      function drawToasts(ctx, v) {
        if (!ui.toasts.length) return;
        ctx.font = FONT.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < ui.toasts.length; i++) {
          const t = ui.toasts[ui.toasts.length - 1 - i], y = Y1 - 24 - i * 34;
          if (!t.w) t.w = Math.min(v.w - 24, ctx.measureText(t.text).width + 32);
          ctx.fillStyle = '#0d1124'; ctx.fillRect(v.w / 2 - t.w / 2, y - 15, t.w, 30);
          ctx.fillStyle = t.col; ctx.fillRect(v.w / 2 - t.w / 2, y - 15, 4, 30); ctx.fillRect(v.w / 2 - t.w / 2, y + 13, t.w, 2);
          ctx.fillStyle = C.text; ctx.fillText(t.text, v.w / 2 + 2, y);
        }
      }
      const RINGS = [[64, 188, 172], [64, 188, 211], [64, 188, 268], [606, 214, 90], [1086, 198, 106], [1086, 198, 129], [2156, 196, 117], [-470, 190, 80]];
      function drawMap(ctx, v, m) {
        const cx = ui.cam.x, vx0 = cx - 80, vx1 = cx + v.w + 80, plan = m && m.ty === 'launch';
        if (stars) {
          const off = -((cx * 0.25) % v.w + v.w) % v.w;
          ctx.drawImage(stars, off, 0, v.w, 360); ctx.drawImage(stars, off + v.w, 0, v.w, 360);
        }
        const cy = Math.round(ui.cam.y);
        if (cy) { ctx.save(); ctx.translate(0, -cy); }
        // region names
        ctx.font = FONT.smB; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.dim;
        for (let i = 0; i < REGIONS.length; i++) { const R = REGIONS[i]; if (R.x1 > vx0 && R.x0 < vx1) ctx.fillText(R.n, R.x0 + 12 - cx + (i ? 0 : 40), Y0 + 6); }
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
        // routes: only flights under way, and the route being planned
        ctx.lineWidth = 2;
        for (const s of c.sh) {
          if (!s.f || plan) continue;
          const p = shipXY(s, now), L = s.f.L;
          ctx.strokeStyle = SIM.LIVERY[s.lv]; ctx.setLineDash([4, 5]); ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.moveTo(p.x - cx, p.y);
          for (let i = Math.min(s.f.i, L.length / 5 - 1) * 5; i < L.length; i += 5) { const b = N[L[i + 1]]; ctx.lineTo(b.x - cx, b.y); }
          ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
        }
        if (plan) {
          ctx.strokeStyle = C.amber; ctx.lineWidth = 3;
          ctx.beginPath();
          m.route.forEach((n, i) => { if (i) ctx.lineTo(N[n].x - cx, N[n].y); else ctx.moveTo(N[n].x - cx, N[n].y); });
          ctx.stroke();
          const last = N[m.route[m.route.length - 1]];
          ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.strokeStyle = C.cyan;
          for (const q of m.cand || []) { const b = N[q.n]; ctx.beginPath(); ctx.moveTo(last.x - cx, last.y); ctx.lineTo(b.x - cx, b.y); ctx.stroke(); }
          ctx.setLineDash([]);
        }
        // nodes
        const docked = ui.dock || (ui.dock = new Int16Array(NN));
        docked.fill(0);
        for (const s of c.sh) if (!s.f) docked[s.at]++;
        for (let n = 0; n < NN; n++) {
          const nd = N[n];
          if (nd.x < vx0 || nd.x > vx1) continue;
          const on = SIM.nodeOn(c, n), P = c.P[n], x = nd.x - cx, y = nd.y;
          const set = SPR.node[P && P.st ? 'orb' : nd.t];
          const sp = !on ? set.lock : P ? (P.st ? set.stn : set.own) : nd.t === 'site' ? (c.site[n] ? set.stn : set.site) : nd.t === 'drop' ? set.site : set.free;
          if (plan && m.cand) {
            const q = m.cand.find(qq => qq.n === n);
            if (q) { ctx.fillStyle = q.ok ? 'rgba(92,225,230,0.25)' : 'rgba(255,93,143,0.25)'; ctx.fillRect(Math.round(x - 14), Math.round(y - 14), 28, 28); }
            if (m.route.includes(n)) { ctx.fillStyle = 'rgba(255,181,71,0.3)'; ctx.fillRect(Math.round(x - 14), Math.round(y - 14), 28, 28); }
          }
          ctx.drawImage(sp, Math.round(x - 7), Math.round(y - 7), 14, 14);
          if (n === c.hq) ctx.drawImage(SPR.star, Math.round(x - 5), Math.round(y - 17), 10, 8);
          if (docked[n]) { ctx.fillStyle = C.cyan; ctx.fillRect(x + 7, y - 13, 12, 12); ctx.fillStyle = C.bg; ctx.font = FONT.smB; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(docked[n]), x + 13, y - 7); }
          const pk = (c.pj.elev && !c.done.elev && n === PROJ.elev.site) || (c.pj.yards && !c.done.yards && n === PROJ.yards.site);
          if (pk) { ctx.fillStyle = C.rose; ctx.fillRect(x - 13, y - 12, 5, 5); }
          if (!on) continue;
          // label on a dark backing so it reads over planets
          const la = nd.la, lw = LW ? LW[n] : 60;
          const lx = la === 2 ? x + 12 : la === 3 ? x - 12 - lw : x - lw / 2, ly = la === 1 ? y - 25 : la === 0 ? y + 9 : y - 7;
          ctx.fillStyle = 'rgba(7,10,23,0.72)'; ctx.fillRect(Math.round(lx - 3), Math.round(ly - 1), lw + 6, 16);
          ctx.font = FONT.map; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillStyle = P ? C.amber : nd.t === 'site' || nd.t === 'drop' ? C.cyan : C.muted;
          ctx.fillText(nd.n, Math.round(lx), Math.round(ly));
          if (plan && m.cand) {
            const q = m.cand.find(qq => qq.n === n);
            if (q) { ctx.font = FONT.smB; ctx.fillStyle = q.ok ? C.cyan : C.rose; ctx.fillText(q.ok ? `Δv left ${q.dvLeft.toFixed(1)}` : 'Out of range', Math.round(lx), Math.round(ly + (la === 1 ? -15 : 15))); }
          }
        }
        // ships in flight: a generic marker pointing along the route, with the ship's name
        if (!plan) for (const s of c.sh) {
          if (!s.f) continue;
          const p = shipXY(s, now), x = p.x - cx, y = p.y - 9;
          if (x < -40 || x > v.w + 40) continue;
          ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(p.ang);
          if (p.burn) { ctx.fillStyle = [C.amber, C.cyan, C.torch][DS[s.d].f]; ctx.fillRect(-13, -1.5, 6, 3); }
          ctx.fillStyle = SIM.LIVERY[s.lv]; ctx.strokeStyle = C.bg; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.stroke(); ctx.fill();
          ctx.restore();
          ctx.font = FONT.smB; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const nw = 7 * s.nm.length + 4;
          ctx.fillStyle = 'rgba(7,10,23,0.72)'; ctx.fillRect(Math.round(x + 10), Math.round(y - 8), nw, 16);
          ctx.fillStyle = C.text; ctx.fillText(s.nm, Math.round(x + 12), Math.round(y));
        }
        if (cy) ctx.restore();
        // uncharted regions
        for (let i = 1; i < REGIONS.length; i++) {
          const R = REGIONS[i], era = REGION_ERA[i];
          if (era <= c.era || R.x1 < vx0 || R.x0 > vx1) continue;
          ctx.fillStyle = 'rgba(7,10,23,0.78)';
          ctx.fillRect(R.x0 - cx, Y0 - 1, R.x1 - R.x0, Y1 - Y0 + 1);
          ctx.font = FONT.ui; ctx.fillStyle = C.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const mid = Math.max(R.x0 - cx + 110, Math.min(R.x1 - cx - 110, v.w / 2));
          ctx.fillText(era === 4 ? 'Outer Reach · coming soon' : `Uncharted · opens in Era ${ROMAN[era]}`, mid, 196);
        }
      }

      centerOn(c.hq, true, api.view.w);
      layout();
      return {
        update, draw,
        resize(v) { buildStars(v); SCENES.clear(); ui.dirty = true; },
        getState() { save(); return { tab: ui.tab }; },
        _c: () => c,
        debug: () => ({ tab: ui.tab, stack: ui.stack.map(q => q.ty), fk: ui.fk, cam: ui.cam.x, cr: c.cr, ships: c.sh.map(s => [s.nm, s.st, s.at, s.ld.length, !!s.f]) }),
        _ui: ui
      };
    }
  });
})();
