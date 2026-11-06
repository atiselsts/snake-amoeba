# Čūskamēba / Amoeba Snake

A side-view browser game for children: a snake that looks a bit like an amoeba eats food and
smaller snakes, and grows until it reaches the level's target size. Latvian by default, with an
English switch. Based on `task.md` and a pencil sketch.

## Run

Open `index.html` in a browser. No server, build step or network is needed: the font is embedded,
and all pictures and sounds are generated in code.

## How it plays

Pick a level, then choose your snake's pattern (plain, stripes, hearts, dots, stars, zigzags,
rainbow) and colour. Grow to the target size to win and unlock the next level.

| Control | Keyboard | Mouse or touch |
|---|---|---|
| Move | Left/Right arrows or A/D | hold left or right of the head |
| Hop, or climb a tree | Up arrow, W or Space | hold well above the head |
| Climb down, drop off a ledge | Down arrow or S | hold well below the head |
| Pause | Esc or P | pause button |

- **Size** is the number above each head. Other snakes' numbers are red if bigger than you (run),
  green if smaller (eat them) and yellow if equal.
- **Food:** small bits give +1, big bits +5, and a rare star +10. Food lies on the ground, floats
  within hopping height, and sits in trees and on rock ledges.
- **Shrinking:** every snake loses size at a steady rate, faster on later levels.
- **Meeting:** when two heads touch, the bigger snake eats the smaller one and gains half its size.
  Equal sizes bounce apart. Bodies slide past each other, so hop over a head to escape.
- **Trees** are harmless and can be climbed. **Cacti** prick the head for about 10% of your size;
  hop over them.
- **Lives:** you get 3 per level. Being eaten or shrinking to nothing costs one, and you come back
  far from rivals with half your size (at least the level's starting size).

There are 12 levels, cycling through the plain, forest and cactus land maps. Food, trees and
cacti are laid out afresh on every try.

## Development

    node tools/check-levels.js [seedsPerLevel]
    python3 tools/build-single.py OUTPUT.html [--full]

`check-levels.js` tests each rule, checks that all food is reachable, and has a bot play every level.

`index.html?level=5&seed=7` starts a level directly, and `&warp=1500` fast-forwards that many ticks.
`&auto` lets the bot play, `&skin=hearts&color=1` sets the look, `&lang=en` the language,
`&screen=looks` opens the chooser, and `&dev` exposes `window.__snake`.
