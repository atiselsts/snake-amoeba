#!/usr/bin/env node
// Plays every level with a bot that uses the player's inputs, and checks the world is fair.
//   node tools/check-levels.js [seedsPerLevel]
const W = require('../src/world.js');

const seeds = Number(process.argv[2]) || 12;
const MAX_TIME = 8 * 60;
const HOP = W.JUMP_V ** 2 / (2 * W.GRAVITY);
let failures = 0;

const fail = (msg) => { failures += 1; console.log('  FAIL', msg); };
const look = { skin: 'plain', color: W.COLORS[0] };

// Written separately from placeFood: judges each bit only by where it ended up.
function reachable(w, f) {
  if (f.x < 30 || f.x > w.level.width - 30 || f.y < 0) return false;
  const lift = W.groundY(w, f.x) - f.y;
  if (lift <= HOP + f.r) return true;
  if (W.treeAt(w, f.x, f.y)) return true;
  return w.ledges.some((l) => Math.abs(f.x - l.x) <= l.half + f.r && l.y - f.y >= 0 && l.y - f.y <= HOP);
}

function checkMap(w, label) {
  for (const f of w.food) if (!reachable(w, f)) fail(`${label}: unreachable ${f.kind} at ${f.x | 0},${f.y | 0} (${f.where})`);
  for (const c of w.cacti) if (c.ry * 2 >= HOP - 20) fail(`${label}: cactus too tall to hop`);
  for (const l of w.ledges) {
    const from = l.upper ? l.y + 130 : W.groundY(w, l.x);
    if (from - l.y >= HOP) fail(`${label}: ledge too high to reach`);
  }
  if (w.tutorial) return;
  for (const s of w.snakes.slice(1)) {
    if (Math.abs(s.x - w.snakes[0].x) < 500) fail(`${label}: rival starts next to the player`);
  }
}

function play(levelIndex, seed) {
  const w = W.createWorld(levelIndex, seed, look);
  const player = w.snakes[0];
  checkMap(w, `level ${levelIndex} seed ${seed}`);
  const kinds = new Set();
  while (w.state === 'playing' && w.time < MAX_TIME) {
    W.stepWorld(w, W.botInput(w, player, 450));
    for (const e of w.events) if (e.type === 'eat' && e.player) kinds.add(e.kind);
    w.events.length = 0;
  }
  return { state: w.state, reason: w.reason, time: w.time, size: W.shownSize(player), eaten: w.eaten, hash: `${w.time}:${player.x}:${player.size}` };
}

function idle(levelIndex) {
  const w = W.createWorld(levelIndex, 1, look);
  const start = w.snakes[0].size;
  w.food.length = 0;
  w.refillT = Infinity;
  w.snakes.length = 1;
  for (let i = 0; i < 60 * 5; i++) W.stepWorld(w, {});
  const lost = start - w.snakes[0].size;
  const want = w.level.decay * 5;
  if (w.state === 'playing' && Math.abs(lost - want) > 0.05) fail(`level ${levelIndex}: idle size loss ${lost}, expected ${want}`);
}

// Each rule from task.md, set up directly rather than left to chance.
function arena(levelIndex, sizes) {
  const w = W.createWorld(levelIndex, 7, look);
  w.food.length = 0;
  w.refillT = Infinity;
  w.snakes.length = sizes.length;
  w.snakes.forEach((s, i) => { s.size = sizes[i]; s.safeT = 0; s.goal = null; s.thinkT = 1e9; s.startSize = sizes[i]; });
  return w;
}

function placeAt(w, s, x) {
  s.x = x;
  s.y = W.groundY(w, x) - W.radiusOf(s.size);
  s.trail = [{ x: s.x, y: s.y }];
  s.mode = 'ground';
}

function run(w, seconds, input) {
  for (let i = 0; i < seconds * 60 && w.state === 'playing'; i++) W.stepWorld(w, input);
}

function checkRules() {
  const expect = (cond, msg) => { if (!cond) fail(`rule: ${msg}`); };

  let w = arena(1, [100, 99]);
  placeAt(w, w.snakes[0], 1000);
  placeAt(w, w.snakes[1], 1010);
  w.level = { ...w.level, target: 1000 };
  run(w, 0.1, {});
  expect(!w.snakes[1].alive, '100 beats 99');
  expect(W.shownSize(w.snakes[0]) === 100, 'winning a fight gives nothing until the pieces are eaten');
  const bigBits = w.food.filter((f) => f.kind === 'chunk');
  const worth = bigBits.reduce((a, f) => a + f.value, 0);
  expect(worth >= 59 && worth <= 70, `a 99 leaves about 60 in pieces, left ${worth}`);
  run(w, 2, {});
  for (const f of bigBits) expect(!f.falling && reachable(w, f), 'pieces land somewhere reachable');

  w = arena(1, [20, 6]);
  placeAt(w, w.snakes[0], 1000);
  placeAt(w, w.snakes[1], 1010);
  run(w, 0.1, {});
  const smallBits = w.food.filter((f) => f.kind === 'chunk');
  expect(smallBits.length >= 2 && smallBits[0].r < bigBits[0].r && smallBits[0].value < bigBits[0].value, 'small snakes leave smaller pieces');
  run(w, 1, {});
  const left = w.food.filter((f) => f.kind === 'chunk');
  const before = w.snakes[0].size;
  for (const f of left) { f.x = w.snakes[0].x; f.y = w.snakes[0].y; }
  run(w, 0.05, {});
  const gained = left.reduce((a, f) => a + f.value, 0);
  expect(!left.length || w.snakes[0].size > before + gained - 1, 'landed pieces can be eaten');

  w = arena(1, [20]);
  w.food.push({ x: 1000, y: 500, kind: 'chunk', value: 1, r: 10, color: '#123456', where: 'ground', phase: 0, life: 1, falling: false });
  run(w, 1.2, {});
  expect(!w.food.length, 'uneaten pieces disappear after a while');

  w = arena(1, [50, 90]);
  placeAt(w, w.snakes[0], 1000);
  placeAt(w, w.snakes[1], 1010);
  run(w, 0.1, {});
  expect(w.lives === W.LIVES - 1, 'a bigger rival eats the player');
  expect(w.state === 'playing' && w.snakes[0].safeT > 0, 'the player comes back protected');

  w = arena(1, [40, 40]);
  placeAt(w, w.snakes[0], 1000);
  placeAt(w, w.snakes[1], 1010);
  run(w, 0.1, {});
  expect(w.snakes[1].alive && w.lives === W.LIVES, 'equal sizes bounce instead of eating');

  w = arena(1, [20, 90]);
  placeAt(w, w.snakes[0], 1000);
  placeAt(w, w.snakes[1], 1300);
  w.snakes[0].trail = [{ x: 1300, y: w.snakes[0].y }, { x: 1000, y: w.snakes[0].y }];
  run(w, 0.1, {});
  expect(w.lives === W.LIVES, 'a head touching only a tail eats nothing');

  w = arena(1, [20]);
  const size = w.snakes[0].size;
  for (const [kind, value] of [['small', 1], ['big', 5], ['gold', 10]]) {
    const p = w.snakes[0];
    w.food.push({ x: p.x, y: p.y, kind, r: W.FOOD_KINDS[kind].r, value, phase: 0, where: 'ground' });
  }
  run(w, 0.05, {});
  expect(Math.abs(w.snakes[0].size - (size + 16)) < 0.1, 'small, big and golden eggs add 1, 5 and 10');

  w = arena(2, [20]);
  const tree = w.trees[0];
  placeAt(w, w.snakes[0], tree.x);
  run(w, 1.5, { up: true });
  expect(w.snakes[0].mode === 'climb' && W.groundY(w, tree.x) - w.snakes[0].y > 250, 'up at a tree climbs it');
  const high = w.snakes[0].y;
  run(w, 1, {});
  expect(w.snakes[0].y === high, 'a climbing snake holds on when nothing is pressed');
  run(w, 3, { down: true });
  expect(w.snakes[0].mode === 'ground', 'down climbs back to the ground');

  w = arena(3, [40]);
  const cactus = w.cacti[0];
  placeAt(w, w.snakes[0], cactus.x - 200);
  run(w, 1.2, { right: true });
  expect(W.shownSize(w.snakes[0]) < 39 && w.snakes[0].x < cactus.x, 'walking into a cactus pricks and pushes back');

  w = arena(3, [40]);
  placeAt(w, w.snakes[0], cactus.x - 200);
  run(w, 0.3, { right: true });
  run(w, 1.4, { right: true, up: true });
  expect(w.snakes[0].x > cactus.x && w.snakes[0].hurtT === 0, 'a hop clears a cactus');

  w = arena(3, [40]);
  const ledge = w.ledges.find((l) => !l.upper);
  placeAt(w, w.snakes[0], ledge.x);
  run(w, 0.1, { up: true });
  run(w, 1.2, {});
  expect(w.snakes[0].mode === 'ground' && w.snakes[0].y < ledge.y, 'a hop lands on a ledge');
  run(w, 1, { down: true });
  expect(w.snakes[0].y > ledge.y, 'down drops through a ledge');

  const reversal = (color, skin) => {
    const t = W.createWorld(1, 1, { skin, color });
    t.food.length = 0;
    t.snakes.length = 1;
    t.snakes[0].safeT = 0;
    placeAt(t, t.snakes[0], 1000);
    run(t, 1, { right: true });
    const top = t.snakes[0].vx;
    let ticks = 0;
    while (t.snakes[0].vx > -top * 0.9 && ticks < 300) { W.stepWorld(t, { left: true }); ticks += 1; }
    return ticks / 60;
  };
  const plainTurn = reversal(W.COLORS[0], 'plain');
  expect(plainTurn > 0.55, `turning round takes a moment, took ${plainTurn.toFixed(2)}s`);
  expect(reversal(W.COLORS[0], 'zigzag') < plainTurn - 0.1, 'the zigzag pattern turns faster');

  const reachOf = (look, input, seconds) => {
    const t = W.createWorld(1, 1, look);
    t.food.length = 0;
    t.trees.length = 0;
    t.snakes.length = 1;
    placeAt(t, t.snakes[0], 1000);
    const ground = t.snakes[0].y;
    let top = ground;
    for (let i = 0; i < seconds * 60; i++) { W.stepWorld(t, input); top = Math.min(top, t.snakes[0].y); }
    return { height: ground - top, x: t.snakes[0].x };
  };
  const basic = { skin: 'plain', color: W.COLORS[0] };
  expect(reachOf({ ...basic, skin: 'stripes' }, { right: true }, 1).x > reachOf(basic, { right: true }, 1).x + 10, 'stripes run faster');
  expect(reachOf({ ...basic, skin: 'dots' }, { up: true }, 0.7).height > reachOf(basic, { up: true }, 0.7).height + 20, 'dots hop higher');
  const shrinkOf = (skin) => {
    const t = W.createWorld(1, 1, { skin, color: W.COLORS[0] });
    t.food.length = 0;
    t.snakes.length = 1;
    const size = t.snakes[0].size;
    run(t, 2, {});
    return size - t.snakes[0].size;
  };
  expect(shrinkOf('hearts') < shrinkOf('plain') * 0.8, 'hearts shrink slower');

  const allCosts = Object.values(W.SKIN_UPGRADES).concat(W.COLOR_UPGRADES).reduce((a, u) => a + u.cost, 0);
  const allStars = W.LEVELS.reduce((a, _, i) => a + W.starsFor(i, true), 0);
  expect(allStars >= allCosts, `one pass earns ${allStars} stars, everything costs ${allCosts}`);

  w = arena(1, [20]);
  placeAt(w, w.snakes[0], 1000);
  run(w, 0.1, { up: true });
  run(w, 3, {});
  const sagged = w.snakes[0].trail.every((p) => W.groundY(w, p.x) - p.y < W.radiusOf(20) + 3);
  expect(sagged, 'the body sinks back down after a hop');
}

// Follows the arrow with the player's inputs, hopping the guard snake when it gets close.
function playTutorial(seed) {
  const w = W.createWorld(0, seed, look);
  const seen = [];
  while (w.state === 'playing' && w.time < 240) {
    const p = w.snakes[0];
    p.thinkT = 1;
    p.goal = w.tutorial.marker;
    const inp = W.botInput(w, p, 0);
    const guard = w.snakes[2];
    if (Math.abs(guard.x - p.x) < 190 && p.mode === 'ground') inp.up = true;
    W.stepWorld(w, inp);
    for (const e of w.events) if (e.type === 'step') seen.push(e.id);
    w.events.length = 0;
  }
  if (w.state !== 'won') fail(`tutorial: stuck at ${W.TUTORIAL_STEPS[w.tutorial.index].id}, x=${w.snakes[0].x | 0}`);
  if (seen.length !== W.TUTORIAL_STEPS.length) fail(`tutorial: saw only ${seen.join(', ')}`);
  return w.time;
}

function checkTutorial() {
  const times = [1, 2, 3].map(playTutorial);
  console.log(`tutorial finished in ${times.map((t) => `${t.toFixed(0)}s`).join(', ')}`);
  const w = W.createWorld(0, 1, look);
  for (let i = 0; i < 60 * 20; i++) W.stepWorld(w, {});
  if (w.snakes[0].size !== 10) fail('tutorial: size must not shrink before its step');
  w.tutorial.checkpoint = 3000;
  w.snakes[0].size = 0;
  W.stepWorld(w, {});
  if (w.state !== 'playing' || Math.abs(w.snakes[0].x - 3000) > 1) fail('tutorial: must restart from the checkpoint, not end');
}

checkRules();
checkTutorial();

console.log('lvl map     target  wins   avg win time  losses (eaten/starved/timeout)  snakes eaten');
W.LEVELS.forEach((level, i) => {
  if (level.tutorial) return;
  const runs = [];
  for (let seed = 1; seed <= seeds; seed++) runs.push(play(i, seed));
  if (play(i, 1).hash !== runs[0].hash) fail(`level ${i}: same seed played differently`);
  idle(i);
  const wins = runs.filter((r) => r.state === 'won');
  const avg = wins.reduce((a, r) => a + r.time, 0) / Math.max(1, wins.length);
  const count = (fn) => runs.filter(fn).length;
  const eaten = runs.reduce((a, r) => a + r.eaten, 0) / runs.length;
  console.log(
    String(i).padStart(3), level.map.padEnd(7), String(level.target).padStart(6),
    `${wins.length}/${seeds}`.padStart(6), `${avg.toFixed(0)}s`.padStart(11), ' ',
    `${count((r) => r.reason === 'eaten')}/${count((r) => r.reason === 'starved')}/${count((r) => r.state === 'playing')}`.padStart(10),
    eaten.toFixed(1).padStart(20),
  );
  if (!wins.length) fail(`level ${i}: the bot never won`);
});
console.log(failures ? `${failures} failure(s)` : 'all checks passed');
process.exit(failures ? 1 : 0);
