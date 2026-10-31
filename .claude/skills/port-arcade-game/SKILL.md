---
name: port-arcade-game
description: Remake an older game (especially Flash-era Miniclip / Youda / Flashpoint titles) as a Pocket Arcade game that plays well on Steam Deck with a controller. Use when Alan asks to port, remake, or modernise an existing game.
---

# Port an older game

A port here is a **faithful remake of the mechanics and feel**, rebuilt from scratch for this arcade. The repo and site
are public, so nothing from the original ships: no art, sounds, music, text, logos, level layouts or name. Give it an
original title and look in the arcade palette. Read `CLAUDE.md` and follow `new-arcade-game` for the build itself;
this skill adds the research and controller-adaptation steps.

## 1. Gather the reference (ask Alan for what's missing)
Best sources, in order:
1. **Alan plays the original** in Flashpoint Archive (flashpointarchive.org; it preserves and runs Flash games
   offline on Windows/Mac/Linux) and sends: 6–10 screenshots (title, first level, a busy mid-game moment, upgrade or
   shop screens, game over), plus a one-paragraph description of what's fun and what's annoying.
2. A short screen recording (attach the file): extract frames with `ffmpeg -i in.mp4 -vf fps=1/2 frames/%03d.png`
   and view them to read layouts, timings, and UI flow.
3. Wikis, Flashpoint's game page, reviews, and walkthroughs: fetch them for rules, unlock order and progression.
Do not download or commit the original SWF or its assets. Mechanics and rough numbers (speeds, timers, costs) can be
estimated from what you observe and then tuned by feel.

## 2. Mechanics sheet (send to Alan, short)
- Core loop and win/lose conditions; progression (levels, upgrades, unlocks); scoring.
- Every input the original used (usually mouse clicks/drags) and its **controller mapping** (step 3).
- What to keep exactly, what to modernise (e.g. remove grind, add autosave, shorter levels for handheld sessions).
- Session shape: levels of 2–4 minutes with stars, and `getState()` saves mid-level progress.

## 3. Adapting mouse-driven Flash games to the Steam Deck
Most Flash games were point-and-click; on a Deck the stick-driven cursor alone is tiring. Design so a controller
player rarely needs it:
- `pointer: true` so taps, the trackpad and the virtual cursor all work (R held = fast cursor).
- Add **snap targets**: the d-pad moves a highlight between interactive things (stations, customers, tiles, menu
  items) and A acts on the highlighted one. Time-management games (Youda-style): d-pad between stations, A to
  serve/use, B to cancel or drop, X/Y for the two most common secondary actions, L/R to cycle tools or tabs.
- Drag actions become pick-up/put-down: A picks up, move the highlight, A drops.
- Make targets at least 40 world units and keep important UI out of the screen corners.
- Rebalance timers slightly (+10–20%) when the original assumed instant mouse clicks; say so in the report.
- Text: keep it short and large (11 px Silkscreen minimum, 14 px Chakra Petch for sentences).

## 4. Build, verify, publish
Follow `new-arcade-game` steps 2–4. In addition, finish one full level using only the controller path (reason it
through your input code) and note in the report how the controller layout maps to the original's mouse actions.
Name the game something original and mention which game inspired it only in the commit message and report.
