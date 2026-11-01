# Sol: Tycoon — design notes

A pixel-art transit tycoon: run a passenger and cargo line from low Earth orbit to the moons of Jupiter. It's the
first game in a planned *Sol* series (later: *Sol: Empires* with Belter pirates and navy conflict). Hard-SF setting
with original names; real places only. Ring/protomolecule content is out of scope.

## Core loop
License ports → open a docked ship → load jobs into its slots (seats, cabins, cargo racks) → plan the flight and set
the **burn** → launch. Flights run on the wall clock and **always finish while the device sleeps**. Deliveries pay
credits and XP and sometimes drop ship parts. Levels raise the ship cap. Ports have limited **berths**, and ships that
arrive to a full port hold in orbit.

## Burn planning
Range is Δv. Ships refuel at depots. For an in-space leg of distance `d` with acceleration `a`, the cruise speed
`v` goes from `vmax/12` (efficient: long coast) to `vmax = √(a·d)` (burn–flip–burn). It costs `Δv = 2v` and takes
`t = d/v + v/a`. Δv capacity follows the rocket equation, so heavy loads and small tanks force gentler burns
(chemical ships are almost always fuel-limited). Fuel is charged for what each flight burns, at the price where it
filled up. Surface ascents and descents have a fixed Δv and time.

## Eras (v1: I–III; IV locked)
| Era | Gate | Default flight times |
|---|---|---|
| I Low Orbit | start | 25 s – ~13 min |
| II Cislunar & Red | level 10 + Tether Materials + Space Elevator | Mars ~27–35 min (nuclear), transfer windows ±30% |
| III Torch Age | level 24 + Fusion Torch Drive + Phobos Torch Yards | Belt 25–40 min, Jupiter 40–60 min (torch) |

## Systems
- **Jobs**: standard; **VIP** (2–5× pay, deadline, later pays 50% or 80% insured); **development** (low pay, raises a
  port's demand tier); **project** (megaprojects); **station kits**; **research payloads** (RP).
- **Ships**: 20 designs in 3 drive families (chemical, nuclear, torch). Slots can be refitted unless the layout is
  fixed. Buy new, or assemble from Hull/Drive/Systems parts (drops plus a market that restocks every 3 h).
- **Ports**: berths, brokerage, fuel depot, ISRU, shipyard (can be HQ), lab.
- **Player stations** at build sites: deliver kits, then add services (depot, layover hab, repair dock, trade post).
  Services fill coffers for up to 12 h.
- **R&D**: 36 techs in 4 branches × 3 eras, costing RP + credits + time.
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
- **Ships:** `shipCanvas()` assembles each one from modules (engine by drive family, propellant tank, one module per
  slot, bow by design style in `DSTYLE`). It renders three sizes: `map`, `big` (closed hull) and `cut` (cutaway).
  Every refit, hull extension, tank upgrade and livery therefore gets its own sprite.
- **Passengers, crates, plumes and node icons:** small pixel maps (`paxCanvas`, `crateCanvas`, `plumeCanvas`,
  `pixCanvas`).

`games/sol-tycoon/art/` only holds the Steam library images that `tools/render-art.mjs` makes from `art()`.

## Code map (`game.js`)
`TUNE` and DATA tables (nodes, edges, jobs, tech, ships) → `SIM` (pure functions of the company and `now`: planner,
burn physics, the event clock, catch-up) → `Arcade.register` (pixel art, widgets, screens, input). The company lives
in the `main` save slot. `getState()` writes it and returns only the UI tab, because Restart clears the `run` slot.
`def.sim` exposes `SIM` for headless balance tests.

## Not yet done
Era IV content, faction variants, hand-tuned balance beyond bot runs and spot checks.
