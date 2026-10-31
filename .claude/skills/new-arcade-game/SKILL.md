---
name: new-arcade-game
description: Design and build a new Pocket Arcade game (original, or inspired by a game Alan names), test it, make its Steam art, and publish it. Use for any "make a game" request in this repo.
---

# New arcade game

Read `CLAUDE.md` first; it is the contract. Copy the closest reference game as the starting point:
`games/cave-flyer/game.js` for real-time action, `games/switchboard/game.js` for turn-based or point-and-click.

## 1. One-screen brief (send it to Alan before building anything big)
Keep it to a short message:
- **Hook**: the one verb the player repeats, and why it stays fun at minute 10.
- **Session**: 2–5 minute runs that end in a score, or a level set with stars. Say which.
- **Controls**: touch / controller / keyboard for every action, in one line each.
- **Mode**: `redraw` (`always` or `onDemand`), `fps` (60 or 30), `pointer`, `pixelated`, and what `getState()` saves.
- **Two-player?** If it's meant for Alan and his partner, say whether it's pass-and-play (alternating turns, both
  scores on the game-over board via the player switch) or same-screen (P1 = left side of the controller, P2 = keyboard
  or a second controller).
Proceed without waiting when the request is already specific; the brief then goes in the final message instead.

## 2. Build in this order
1. Core loop with placeholder shapes, playable with keyboard. Run `node tools/test-game.mjs <id> --seconds 8`.
2. Controller and touch paths for every action; check the reasoning in the controls line holds.
3. Difficulty curve: first 20 seconds teach, then ramp. Tune numbers in one `TUNE` object at the top of `create()`.
4. Juice within budget: sounds via `api.sfx`, screen shake by offsetting the transform, particles from a fixed pool,
   pre-rendered glows. A clear "how to play" start state.
5. `getState()` and resume, if runs last longer than ~1 minute.
6. `thumb()` and `art()` in the arcade palette.

## 3. Verify (all of it, every time)
- `python3 tools/build.py && node tools/test-game.mjs <id>`; fix every ✗ and justify any ! that remains.
- Open `test-output/<id>/*.png` and look at them: Deck layout, iPhone layout, game-over screen.
- For pointer games, also check that d-pad + A alone can finish a round (read your own input code against the controls line).
- `node tools/render-art.mjs <id> && python3 tools/build.py`, then look at `games/<id>/art/cover.png`.

## 4. Publish and report
Commit as `<id>: add <Title>` and push to main. Report to Alan in a few lines: the game, how to play on Deck and on
phone, the test numbers, and the next tuning idea. Remind him that **Update Arcade Tiles** on the Deck desktop adds
the new tile (set its controller layout to Gamepad once; pointer games: "Gamepad with Mouse Trackpad").

## Reference material from Alan
Screenshots and images: view them directly. Videos: ask for 4–8 screenshots of key moments, or extract frames with
ffmpeg if a file is attached (`ffmpeg -i in.mp4 -vf fps=1/3 frames/%02d.png`). Web pages (wikis, reviews,
walkthroughs): fetch them. Write down the mechanics you'll keep before coding, and confirm anything you inferred.
