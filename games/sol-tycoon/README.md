# Sol: Tycoon — design notes

A pixel-art transit tycoon: run a passenger and cargo line from low Earth orbit to the moons of Jupiter. It's the
first game in a planned *Sol* series (later: *Sol: Empires* with Belter pirates and navy conflict). Hard-SF setting
with original names; real places only. Ring/protomolecule content is out of scope.

## Core loop
License ports → tap a docked ship to open its **live view** → **Cargo** (full-screen load sheet: cutaway on top,
Available / Aboard tabs, Auto load) → **Plan launch** (the map becomes a route planner) → big red **LAUNCH**. Flights run on the wall clock and **always finish while the device sleeps**. Deliveries pay
credits and XP and sometimes drop ship parts. Levels raise the ship cap. Ports have limited **berths**, and ships that
arrive to a full port hold in orbit.

## Burn planning
Range is Δv. Ships refuel at depots. For an in-space leg of distance `d` with acceleration `a`, the cruise speed
`v` goes from `vmax/12` (efficient: long coast) to `vmax = √(a·d)` (burn–flip–burn). It costs `Δv = 2v` and takes
`t = d/v + v/a`. Δv capacity follows the rocket equation, so heavy loads and small tanks force gentler burns
(chemical ships are almost always fuel-limited). Fuel is charged for what each flight burns, at the price where it
filled up. Surface ascents and descents have a fixed Δv and time.

Distances are constant (no transfer windows), so a route always takes the same time at the same burn.

## Launch planner
The map highlights the ports the ship can reach next, labelled with the Δv it would have left. Tap one (or move the
highlight and press A) to add a stop; tap the last stop or press B to remove it. Each leg in the bottom panel has its
own burn slider (left/right on the d-pad, L/R for big steps); ascents and landings show **Fixed burn**. A leg capped
by the tank shows "Δv-limited" and a red marker at the highest burn it can afford. Totals show time, fuel, upkeep and
profit; times are rounded minutes ("<1 min"). `SIM.planLegs()` evaluates explicit routes; `planRoute()` still fills
the cheapest route when a ship is loaded for one destination, and drives routines.

## Live ship view
Every port has its own pre-rendered scene (`sceneCanvas`): pads stand the ship upright by a tower on the ocean
horizon; orbital stations show the planet's limb under a docking truss; surface bases sit on regolith, dunes, ice or
Venus's cloud deck. In flight the view follows the phase of the current leg: launch (rises off the pad, then climbs
as the sky darkens), burn, coast, flip, decel burn, docking, landing. It animates at 30 fps only while it is open.

## Inner system and missions
The map extends sunward: Solar Watch, Mercury Orbit and Venus Polar Orbit are **drop zones** (Era II), and Ishtar
Orbital plus the Aphrodite Aerostat (well 3) open in Era III. From Era II, Earth's orbital ports post **missions**
(science probe, weather satellite, solar observatory) that pay 2–3× and grant RP. The ship holds at the drop zone
until you fly it home.

## Eras (v1: I–III; IV locked)
| Era | Gate | Default flight times |
|---|---|---|
| I Low Orbit | start | 25 s – ~13 min |
| II Cislunar & Red | level 10 + Tether Materials + Space Elevator | Mars ~27–35 min (nuclear); Venus ~18 min |
| III Torch Age | level 24 + Fusion Torch Drive + Phobos Torch Yards | Belt 25–40 min, Jupiter 40–60 min (torch) |

## Systems
- **Jobs**: standard; **VIP** (2–5× pay, deadline, later pays 50% or 80% insured); **development** (low pay, raises a
  port's demand tier); **project** (megaprojects); **station kits**; **research payloads** (RP).
- **Ships**: 20 designs in 3 drive families (chemical, nuclear, torch). Slots can be refitted unless the layout is
  fixed. Buy new, or assemble from Hull/Drive/Systems parts (drops plus a market that restocks every 3 h).
- **Ports**: berths, brokerage, fuel depot, ISRU, shipyard (can be HQ), lab.
- **Player stations** at build sites: deliver kits, then add services (depot, layover hab, repair dock, trade post).
  Services fill coffers for up to 12 h.
- **R&D**: 36 techs in 4 branches × 3 eras, costing RP + credits + time, shown as a tree with an icon per tech.
- **Help**: a `?` chip on every tab opens topic help; the Controls topic shows whether a controller is detected.
- **Routines** (Flight Planning): a ship loops between two ports and auto-loads jobs it can lift. New legs stop
  4/8/16/24 h after you were last in the game (Fleet Autonomy). Opening the game resumes them.
- **Sandbox**: never calls `gameOver`; metrics on the Stats screen.

## Ship screen and upgrades
Opening a ship shows it front and center as a pixel cutaway: passengers sit in seat and cabin modules, crates fill
cargo racks, and each loaded slot is labelled with its destination. A or a tap on a slot unloads it. **Upgrade** (at a
shipyard, or anywhere after Modular Hulls) offers:
- Tanks: +15% propellant per level, 3 levels.
- Engines: +10% thrust per level, 3 levels.
- Hull extension: +1 cargo module, 2 levels, not on fixed layouts.
- Comfort: +8% passenger fares per level, 3 levels.
- Livery colours, slot refits and selling.

Each upgrade costs credits plus one part of the ship's drive family, two parts from level 2.

## Art
All in-game art is generated in code at startup, with no image files, so the game stays one offline file:
- **Planets:** `bodyCanvas()` draws them pixel by pixel with ordered dithering, at 1 pixel per world unit.
- **Ships:** each design has its own blueprint in `SHIP_ART`, drawn by a small `painter` (cylinders, cones, bells,
  trusses, wings, legs, rings, domes, payload bays). `shipCanvas()` renders `big` (closed hull), `cut` (cutaway with
  slot rects) and `icon` (menus). Refits, hull extensions, tank upgrades and liveries change the sprite. The map uses
  a generic chevron marker in the livery colour.
- **Passengers and cargo:** `paxSprite()` (8×12, outfit per job type, VIP in gold) and `cargoSprite()` (12×10, one
  per cargo type); 16×16 `jobIcon()` for lists. **Research icons:** `techIcon()`.
- **Port scenes:** `sceneCanvas()`; **plumes and node icons:** `plumeCanvas`, `pixCanvas`.

`games/sol-tycoon/art/` only holds the Steam library images that `tools/render-art.mjs` makes from `art()`.

## Code map (`game.js`)
`TUNE` and DATA tables (nodes, edges, jobs, tech, ships) → `SIM` (pure functions of the company and `now`: planner,
burn physics, the event clock, catch-up) → `Arcade.register` (pixel art, widgets, screens, input). The company lives
in the `main` save slot. `getState()` writes it and returns only the UI tab, because Restart clears the `run` slot.
`def.sim` exposes `SIM` for headless balance tests.

## Controls
Touch: tap everything; drag the map; drag a leg's slider. Controller: d-pad moves the highlight, A selects, B goes
back (removes the last stop in the planner), L/R switch tabs (cargo tabs in the cargo screen, burn steps in the
planner), X jumps to the next idle ship, Y cycles map regions, right stick pans the map. Keyboard: arrows, Space, X,
C, V, Q, E, Esc.

## Not yet done
Era IV content, faction variants, hand-tuned balance beyond bot runs and spot checks.
