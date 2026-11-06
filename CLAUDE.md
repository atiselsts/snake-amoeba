# Čūskamēba / Amoeba Snake

Client-only side-view browser game for children, from `task.md` and a pencil sketch. See
`README.md` for how it plays, controls and dev URL parameters.

## Layout

- `src/world.js`: simulation, levels and rival AI, with no DOM, so it also runs in Node
- `src/game.js`: screens, input, main loop, effects, saved progress
- `src/art.js`: all canvas drawing
- `src/audio.js`: Web Audio sound synthesis
- `src/i18n.js`: all player-facing text, in both languages
- `tools/check-levels.js`: rule tests, fairness checks and a bot that plays every level
- `tools/build-single.py`: bundles the game into one HTML file

## Design decisions that are easy to undo by accident

- The ground is effectively one lane, which drives several rules. Snakes meet head to head only,
  because a hop lifts just the head and tail bites could not be dodged. Rivals never leap at a snake
  in mid-air, and they tire of a chase.
- Well-fed rivals patrol instead of foraging, and rival growth is capped. Without this they clear
  the map, the player starves, and rivals stay too big to eat.
- Food supply is set by `refill` far more than by `food`. Retune with the bot after changing either.
- Sizes are compared as shown on screen (`shownSize`), so 100 beats 99 and equal numbers bounce.
- Art follows the sketch: pointy smiling head, zigzag body, jagged conifers, oval spiny cacti.

## Coding practices

- It must run from `file://` with no server, build step or network. Use classic scripts, not ES
  modules, and add no dependencies.
- Keep pictures and sounds generated in code: no image or audio files, and no emoji.
- Keep `src/world.js` free of DOM access and `Math.random`; use `w.rand` so seeds reproduce.
- All player-facing text goes in `src/i18n.js`, in both `lv` and `en`.
- Two-space indent, single quotes, semicolons, `const` and arrow functions. Comments explain why.
- Wrap `localStorage` access in try/catch. Respect `prefers-reduced-motion`.
- Run `node tools/check-levels.js` after any change to rules or levels. The bot should win nearly
  always on early levels and at least about a third of the time on the last ones.

## Testing

Always launch headless browsers with `--mute-audio`, and confirm none are left running afterwards.
Chromium here is a snap: it can't write to `/tmp`, so send screenshots to `~/snap/chromium/common/`.
