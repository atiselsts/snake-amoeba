// The whole simulation: terrain, movement, eating, rivals. There is no DOM here, so it also
// runs in Node, where tools/check-levels.js plays every level with a bot.

const DT = 1 / 60;
const VIEW_H = 720;
const GROUND_Y = 620;
const GRAVITY = 1400;
const JUMP_V = 720;      // hop height is JUMP_V^2 / 2g, about 185: clears any cactus
const TRAIL_STEP = 5;
const SAG_SPEED = 240;
const SAFE_TIME = 2.5;
const LIVES = 3;

const FOOD_KINDS = {
  small: { r: 8, value: 1, weight: 80 },
  big: { r: 18, value: 5, weight: 18 },
  star: { r: 16, value: 10, weight: 2 },
};

// decay is size lost per second. food is how many bits lie around, and refill is the seconds
// between new ones, which sets how fast a level can be won. aggro is how far away a rival
// notices smaller snakes, so 0 means rivals only ever eat by accident.
const LEVELS = [
  { map: 'plain', width: 2400, start: 10, target: 30, rivals: [5, 7], decay: 0.3, food: 12, refill: 2.0, aggro: 0, rivalSpeed: 0.62, cacti: 0 },
  { map: 'forest', width: 2600, start: 10, target: 40, rivals: [6, 14], decay: 0.3, food: 14, refill: 1.7, aggro: 0, rivalSpeed: 0.62, cacti: 0 },
  { map: 'cactus', width: 2800, start: 12, target: 50, rivals: [8, 16], decay: 0.3, food: 15, refill: 1.5, aggro: 100, rivalSpeed: 0.64, cacti: 7 },
  { map: 'plain', width: 3000, start: 14, target: 60, rivals: [6, 12, 20], decay: 0.3, food: 16, refill: 1.4, aggro: 120, rivalSpeed: 0.65, cacti: 3 },
  { map: 'forest', width: 3200, start: 16, target: 70, rivals: [10, 16, 26], decay: 0.35, food: 18, refill: 1.25, aggro: 130, rivalSpeed: 0.66, cacti: 0 },
  { map: 'cactus', width: 3400, start: 18, target: 80, rivals: [10, 20, 30], decay: 0.35, food: 20, refill: 1.15, aggro: 140, rivalSpeed: 0.67, cacti: 11 },
  { map: 'plain', width: 3600, start: 20, target: 90, rivals: [10, 20, 30, 36], decay: 0.35, food: 22, refill: 1.05, aggro: 150, rivalSpeed: 0.68, cacti: 6 },
  { map: 'forest', width: 3800, start: 24, target: 100, rivals: [14, 24, 34, 44], decay: 0.4, food: 24, refill: 0.95, aggro: 160, rivalSpeed: 0.69, cacti: 0 },
  { map: 'cactus', width: 4000, start: 26, target: 110, rivals: [16, 26, 36, 48], decay: 0.4, food: 26, refill: 0.9, aggro: 170, rivalSpeed: 0.7, cacti: 15 },
  { map: 'plain', width: 4200, start: 30, target: 125, rivals: [15, 25, 35, 50, 20], decay: 0.4, food: 28, refill: 0.8, aggro: 180, rivalSpeed: 0.71, cacti: 9 },
  { map: 'forest', width: 4400, start: 32, target: 140, rivals: [20, 30, 40, 56, 25], decay: 0.45, food: 30, refill: 0.75, aggro: 190, rivalSpeed: 0.72, cacti: 0 },
  { map: 'cactus', width: 4600, start: 35, target: 150, rivals: [20, 30, 45, 60, 30], decay: 0.45, food: 32, refill: 0.7, aggro: 200, rivalSpeed: 0.74, cacti: 19 },
];

const SKINS = ['plain', 'stripes', 'hearts', 'dots', 'stars', 'zigzag', 'rainbow'];
const COLORS = ['#35c2a6', '#f2709c', '#9b6bea', '#f79a3e', '#4a9bf0', '#8ccc3f', '#ef5a50', '#f4c531'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const radiusOf = (size) => 17 + 2.2 * Math.sqrt(Math.max(size, 1));
const lengthOf = (size) => 130 + 38 * Math.sqrt(Math.max(size, 1));
const shownSize = (s) => Math.max(0, Math.ceil(s.size - 1e-9));

function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundY(w, x) {
  const g = w.terrain;
  return GROUND_Y + g.a1 * Math.sin(x * g.f1 + g.p1) + g.a2 * Math.sin(x * g.f2 + g.p2);
}

// Conifers are wide at the bottom of the crown and narrow at the tip; below the crown only
// the trunk can be climbed.
function treeHalfWidth(tree, y) {
  if (y < tree.top || y > tree.baseY) return 0;
  if (y > tree.crownBottom) return 34;
  return 34 + (tree.halfW - 34) * ((y - tree.top) / (tree.crownBottom - tree.top));
}

const treeAt = (w, x, y) => w.trees.find((t) => Math.abs(x - t.x) < treeHalfWidth(t, y));

function spreadPositions(rand, count, from, to, jitter) {
  const out = [];
  const gap = (to - from) / count;
  for (let i = 0; i < count; i++) out.push(from + gap * (i + 0.5) + (rand() - 0.5) * gap * jitter);
  return out;
}

function buildMap(w) {
  const { rand, level } = w;
  const hilly = { plain: 26, forest: 14, cactus: 18 }[level.map];
  w.terrain = {
    a1: hilly, f1: 0.0031 + rand() * 0.001, p1: rand() * 6.28,
    a2: hilly * 0.35, f2: 0.009 + rand() * 0.003, p2: rand() * 6.28,
  };
  w.trees = [];
  w.cacti = [];
  w.ledges = [];
  const mid = level.width / 2;

  if (level.map === 'forest') {
    for (const x of spreadPositions(rand, Math.round(level.width / 300), 150, level.width - 150, 0.5)) {
      const baseY = groundY(w, x);
      const top = baseY - 380 - rand() * 130;
      w.trees.push({ x, baseY, top, crownBottom: baseY - 110, halfW: 105 + rand() * 30, seed: rand() * 1000 });
    }
  }

  if (level.map === 'cactus') {
    for (const x of spreadPositions(rand, Math.round(level.width / 520), 200, level.width - 200, 0.5)) {
      const y = groundY(w, x) - 125 - rand() * 25;
      const ledge = { x, y, half: 80 + rand() * 40, seed: rand() * 1000 };
      w.ledges.push(ledge);
      if (rand() < 0.5) w.ledges.push({ x: x + (rand() - 0.5) * 120, y: y - 130, half: 62, seed: rand() * 1000, upper: true });
    }
  }

  // Cacti stay clear of the start, so nothing pricks the player before they get going, and of
  // the ledge pillars, so a hop onto a ledge never ends in spines.
  for (const x of spreadPositions(rand, level.cacti, 120, level.width - 120, 0.6)) {
    if (Math.abs(x - mid) < 260) continue;
    if (w.ledges.some((l) => Math.abs(l.x - x) < l.half + 70)) continue;
    const ry = 42 + rand() * 18;
    w.cacti.push({ x, rx: 24 + rand() * 8, ry, baseY: groundY(w, x) + 4, seed: rand() * 1000 });
  }
}

function pickFoodKind(rand) {
  let roll = rand() * 100;
  for (const kind of Object.keys(FOOD_KINDS)) {
    roll -= FOOD_KINDS[kind].weight;
    if (roll < 0) return kind;
  }
  return 'small';
}

// "where" records how the bit can be reached, which tools/check-levels.js verifies.
function placeFood(w, r) {
  const { rand, level } = w;
  const roll = rand();
  if (roll < 0.34 && w.trees.length) {
    const tree = w.trees[Math.floor(rand() * w.trees.length)];
    const y = tree.top + 40 + rand() * (tree.crownBottom - tree.top - 40);
    const half = treeHalfWidth(tree, y) - r;
    return { x: tree.x + (rand() * 2 - 1) * half, y, where: 'tree' };
  }
  if (roll < 0.34 && w.ledges.length) {
    const ledge = w.ledges[Math.floor(rand() * w.ledges.length)];
    return { x: ledge.x + (rand() * 2 - 1) * (ledge.half - 12), y: ledge.y - r - 8, where: 'ledge' };
  }
  const x = 60 + rand() * (level.width - 120);
  if (roll < 0.52) return { x, y: groundY(w, x) - 70 - rand() * 90, where: 'air' };
  for (const c of w.cacti) if (Math.abs(c.x - x) < c.rx + 44) return null;
  return { x, y: groundY(w, x) - r - 3, where: 'ground' };
}

function spawnFood(w) {
  const kind = pickFoodKind(w.rand);
  const { r, value } = FOOD_KINDS[kind];
  for (let tries = 0; tries < 12; tries++) {
    const spot = placeFood(w, r);
    if (spot) {
      w.food.push({ ...spot, kind, r, value, phase: w.rand() * 6.28 });
      return;
    }
  }
}

function makeSnake(w, id, x, size, look, isPlayer) {
  const r = radiusOf(size);
  const y = groundY(w, x) - r;
  const facing = x < w.level.width / 2 ? 1 : -1;
  const s = {
    id, isPlayer, x, y, vx: 0, vy: 0, mode: 'ground', ledge: null, size, startSize: size, look,
    facing, trail: [], alive: true, safeT: SAFE_TIME, hurtT: 0, stunT: 0, bumpT: 0, dropT: 0, chewT: 0,
    thinkT: 0, goal: null, respawnT: 0, chaseT: 0, restT: 0, speedScale: isPlayer ? 1 : w.level.rivalSpeed,
  };
  const len = lengthOf(size);
  for (let d = len; d >= 0; d -= TRAIL_STEP) {
    const tx = x - facing * d;
    s.trail.push({ x: tx, y: groundY(w, tx) - r });
  }
  return s;
}

function rivalLook(rand, playerColor) {
  const colors = COLORS.filter((c) => c !== playerColor);
  return { skin: SKINS[Math.floor(rand() * SKINS.length)], color: colors[Math.floor(rand() * colors.length)] };
}

function rivalSpawnX(w) {
  const player = w.snakes[0];
  for (let tries = 0; tries < 30; tries++) {
    const x = 100 + w.rand() * (w.level.width - 200);
    if (Math.abs(x - player.x) < 700) continue;
    if (w.cacti.some((c) => Math.abs(c.x - x) < 120)) continue;
    return x;
  }
  return player.x < w.level.width / 2 ? w.level.width - 100 : 100;
}

function createWorld(levelIndex, seed, look) {
  const level = LEVELS[levelIndex];
  const w = {
    levelIndex, level, seed, rand: makeRandom(seed), time: 0, state: 'playing', reason: null, killer: 0, lives: LIVES,
    food: [], snakes: [], events: [], eaten: 0, refillT: level.refill,
  };
  buildMap(w);
  w.snakes.push(makeSnake(w, 0, level.width / 2, level.start, look, true));
  level.rivals.forEach((size, i) => {
    w.snakes.push(makeSnake(w, i + 1, rivalSpawnX(w), size, rivalLook(w.rand, look.color), false));
  });
  for (let i = 0; i < level.food; i++) spawnFood(w);
  return w;
}

function speedOf(s) {
  return (285 - Math.min(70, s.size * 0.25)) * s.speedScale;
}

function moveSnake(w, s, inp) {
  const r = radiusOf(s.size);
  const speed = speedOf(s);
  const stunned = s.stunT > 0;
  const want = stunned ? 0 : (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const accel = s.mode === 'air' ? 1500 : 2600;
  if (!stunned) s.vx += clamp(want * speed - s.vx, -accel * DT, accel * DT);
  if (want) s.facing = want;
  const up = inp.up && !stunned;
  const down = inp.down && !stunned;

  if (s.mode !== 'climb' && up && treeAt(w, s.x, s.y)) {
    s.mode = 'climb';
    s.ledge = null;
  }

  if (s.mode === 'climb') {
    s.vy = ((down ? 1 : 0) - (up ? 1 : 0)) * speed * 0.85;
    s.x += s.vx * DT;
    s.y += s.vy * DT;
    const tree = treeAt(w, s.x, s.y);
    const foot = groundY(w, s.x) - r;
    if (s.y >= foot) {
      s.y = foot;
      s.mode = 'ground';
    } else if (!tree) {
      // Going past the tip must not drop the snake, or holding "up" would make it bounce.
      const below = treeAt(w, s.x, s.y + 8);
      if (below && s.vy < 0) s.y += 8;
      else s.mode = 'air';
    }
  } else if (s.mode === 'air') {
    const prevFoot = s.y + r;
    s.vy += GRAVITY * DT;
    s.x += s.vx * DT;
    s.y += s.vy * DT;
    const foot = s.y + r;
    if (s.vy > 0 && s.dropT <= 0 && !down) {
      const ledge = w.ledges.find((l) => Math.abs(s.x - l.x) < l.half && prevFoot <= l.y + 6 && foot >= l.y);
      if (ledge) {
        s.mode = 'ground';
        s.ledge = ledge;
        s.vy = 0;
      }
    }
    if (s.mode === 'air' && s.y >= groundY(w, s.x) - r) {
      s.mode = 'ground';
      s.vy = 0;
    }
  } else {
    s.x += s.vx * DT;
    if (s.ledge && Math.abs(s.x - s.ledge.x) > s.ledge.half) {
      s.ledge = null;
      s.mode = 'air';
      s.vy = 0;
    } else if (down && s.ledge) {
      s.ledge = null;
      s.mode = 'air';
      s.vy = 0;
      s.dropT = 0.3;
    } else if (up) {
      s.ledge = null;
      s.mode = 'air';
      s.vy = -JUMP_V;
      if (s.isPlayer) w.events.push({ type: 'hop' });
    }
  }

  s.x = clamp(s.x, 30, w.level.width - 30);
  if (s.mode === 'ground') s.y = s.ledge ? s.ledge.y - r : groundY(w, s.x) - r;
  s.y = Math.max(s.y, r + 4);
}

// A hop leaves the trail arched in the air, so the body has to sink back down or a resting
// snake would keep a hoop of itself hanging over the ground. Trees hold the body up.
function settleTrail(w, s) {
  const r = radiusOf(s.size);
  // In mid-air the neck must stay attached to the head, so only the rest of the body sinks.
  const from = s.trail.length - (s.mode === 'air' ? 12 : 1);
  for (let i = from; i >= 0; i--) {
    const p = s.trail[i];
    if (treeAt(w, p.x, p.y)) continue;
    let floor = groundY(w, p.x) - r;
    for (const l of w.ledges) {
      if (Math.abs(p.x - l.x) < l.half && p.y <= l.y - r + 4) floor = Math.min(floor, l.y - r);
    }
    if (p.y < floor) p.y = Math.min(floor, p.y + SAG_SPEED * DT);
  }
}

function updateTrail(w, s) {
  settleTrail(w, s);
  const last = s.trail[s.trail.length - 1];
  if (Math.hypot(s.x - last.x, s.y - last.y) >= TRAIL_STEP) s.trail.push({ x: s.x, y: s.y });
  const len = lengthOf(s.size) + 20;
  let run = 0;
  for (let i = s.trail.length - 1; i > 0; i--) {
    run += Math.hypot(s.trail[i].x - s.trail[i - 1].x, s.trail[i].y - s.trail[i - 1].y);
    if (run > len) {
      s.trail.splice(0, i - 1);
      break;
    }
  }
}

// Evenly spaced points from the head back along the trail, for drawing the body.
function bodyPoints(s, spacing) {
  const pts = [{ x: s.x, y: s.y }];
  const len = lengthOf(s.size);
  let walked = 0;
  let nextAt = spacing;
  let ax = s.x;
  let ay = s.y;
  for (let i = s.trail.length - 1; i >= 0 && walked < len; i--) {
    const bx = s.trail[i].x;
    const by = s.trail[i].y;
    const seg = Math.hypot(bx - ax, by - ay);
    while (seg > 0 && walked + seg >= nextAt && nextAt <= len) {
      const f = (nextAt - walked) / seg;
      pts.push({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f });
      nextAt += spacing;
    }
    walked += seg;
    ax = bx;
    ay = by;
  }
  return pts;
}

// Fat for most of its length with a blunt tail, like the drawing rather than a tapering worm.
const bodyTaper = (u) => 0.95 * (1 - 0.68 * u * u * u);

function eatFood(w, s) {
  const r = radiusOf(s.size);
  for (let i = w.food.length - 1; i >= 0; i--) {
    const f = w.food[i];
    if (Math.hypot(f.x - s.x, f.y - s.y) > r + f.r + 6) continue;
    w.food.splice(i, 1);
    grow(w, s, f.value);
    s.chewT = 0.25;
    w.events.push({ type: 'eat', kind: f.kind, value: f.value, x: f.x, y: f.y, id: s.id, player: s.isPlayer });
  }
}

function grow(w, s, amount) {
  s.size += amount;
  // Rivals stop growing well below the target, or the player could never catch up with them.
  if (!s.isPlayer) s.size = Math.min(s.size, s.startSize * 1.5 + 5);
}

function pricks(w, s) {
  if (s.hurtT > 0 || s.safeT > 0) return;
  const r = radiusOf(s.size) * 0.7;
  for (const c of w.cacti) {
    const dx = (s.x - c.x) / (c.rx + r);
    const dy = (s.y - (c.baseY - c.ry)) / (c.ry + r);
    if (dx * dx + dy * dy >= 1) continue;
    const loss = Math.max(3, Math.round(s.size * 0.1));
    s.size -= loss;
    s.hurtT = 1.4;
    s.stunT = 0.35;
    s.vx = (s.x < c.x ? -1 : 1) * 260;
    s.vy = -380;
    s.mode = 'air';
    s.ledge = null;
    w.events.push({ type: 'prick', loss, x: s.x, y: s.y, id: s.id, player: s.isPlayer });
    return;
  }
}

// Snakes meet head to head, as in the drawing of 99 facing 100. Bodies slide past each other:
// a hop lifts only the head, so biting a trailing tail would leave no way to dodge on a map
// that is effectively one lane.
function headsMeet(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < (radiusOf(a.size) + radiusOf(b.size)) * 0.95;
}

function bump(a, b) {
  const dir = a.x < b.x ? -1 : 1;
  for (const [s, d] of [[a, dir], [b, -dir]]) {
    s.vx = d * 300;
    s.vy = -320;
    s.mode = 'air';
    s.ledge = null;
    s.stunT = 0.3;
    s.bumpT = 1;
  }
}

function meetSnakes(w) {
  const live = w.snakes.filter((s) => s.alive);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (!a.alive || !b.alive || a.safeT > 0 || b.safeT > 0) continue;
      if (!headsMeet(a, b)) continue;
      const sa = shownSize(a);
      const sb = shownSize(b);
      if (sa === sb) {
        if (a.bumpT <= 0 && b.bumpT <= 0) {
          bump(a, b);
          w.events.push({ type: 'bump', player: a.isPlayer || b.isPlayer });
        }
        continue;
      }
      const big = sa > sb ? a : b;
      const small = sa > sb ? b : a;
      const gain = Math.ceil(shownSize(small) / 2);
      kill(w, small);
      grow(w, big, gain);
      big.chewT = 0.4;
      w.events.push({
        type: 'gulp', gain, x: small.x, y: small.y, id: big.id, victim: small.id, player: big.isPlayer,
        color: small.look.color,
      });
      if (small.isPlayer) {
        w.killer = shownSize(big);
        loseLife(w, 'eaten');
      }
      if (big.isPlayer) w.eaten += 1;
    }
  }
}

// The ground is a single lane, so a long level would otherwise end on one unlucky meeting.
// A new life comes back where rivals are furthest away, with half the size it had.
function loseLife(w, reason) {
  const old = w.snakes[0];
  w.lives -= 1;
  w.reason = reason;
  if (w.lives <= 0) {
    w.state = 'lost';
    old.alive = false;
    return;
  }
  let bestX = old.x;
  let bestGap = -1;
  for (let x = 150; x < w.level.width - 150; x += 150) {
    if (w.cacti.some((c) => Math.abs(c.x - x) < 120)) continue;
    const gap = Math.min(...w.snakes.slice(1).filter((s) => s.alive).map((s) => Math.abs(s.x - x)));
    if (gap > bestGap) { bestGap = gap; bestX = x; }
  }
  const size = Math.max(w.level.start, Math.ceil(old.size / 2));
  w.snakes[0] = makeSnake(w, 0, bestX, size, old.look, true);
  w.events.push({ type: 'life', reason, x: old.x, y: old.y, color: old.look.color });
}

function kill(w, s) {
  s.alive = false;
  s.respawnT = 6 + w.rand() * 5;
}

function respawn(w, s) {
  const fresh = makeSnake(w, s.id, rivalSpawnX(w), s.startSize, rivalLook(w.rand, w.snakes[0].look.color), false);
  w.snakes[s.id] = fresh;
}

// Rivals and the test bot both steer through this, using the same inputs as the player.
function think(w, s, hunt) {
  const me = shownSize(s);
  s.evade = false;
  let threat = null;
  let threatD = s.isPlayer ? 420 : 300;
  let prey = null;
  let preyD = hunt;
  for (const o of w.snakes) {
    if (o === s || !o.alive || o.safeT > 0) continue;
    const d = Math.hypot(o.x - s.x, o.y - s.y);
    const other = shownSize(o);
    if (other > me && d < threatD) { threat = o; threatD = d; }
    if (other < me && d < preyD) { prey = o; preyD = d; }
  }
  if (threat) {
    // Running into a wall is a trap, so when cornered go the other way and hop over the threat.
    let dir = s.x < threat.x ? -1 : 1;
    if (s.x + dir * 350 < 40 || s.x + dir * 350 > w.level.width - 40) dir = -dir;
    s.goal = { x: s.x + dir * 400, y: groundY(w, s.x) - 20 };
    s.evade = threatD < 170;
    return;
  }
  // Rivals tire of a chase, which gives a young player room to get away.
  if (prey && s.restT <= 0) {
    s.chaseT += 0.25;
    if (s.chaseT > 4 && !s.isPlayer) {
      s.chaseT = 0;
      s.restT = 4;
    }
    s.goal = { x: prey.x, y: prey.y, snake: true };
    return;
  }
  // A well-fed rival patrols instead of foraging. Otherwise rivals clear the map, the player
  // starves, and they stay too big to ever eat.
  if (!s.isPlayer && s.size >= s.startSize * 1.2) {
    if (!s.goal || s.goal.value || Math.abs(s.goal.x - s.x) < 40) {
      const x = 100 + w.rand() * (w.level.width - 200);
      s.goal = { x, y: groundY(w, x) - 20 };
    }
    return;
  }
  let best = null;
  let bestCost = Infinity;
  for (const f of w.food) {
    const cost = (Math.abs(f.x - s.x) + 1.6 * Math.abs(f.y - s.y)) / f.value ** 0.4;
    if (cost < bestCost) { best = f; bestCost = cost; }
  }
  s.goal = best;
}

function botInput(w, s, hunt) {
  s.thinkT -= DT;
  if (s.thinkT <= 0) {
    think(w, s, hunt);
    s.thinkT = 0.2 + w.rand() * 0.15;
  }
  const inp = {};
  const g = s.goal;
  if (!g) return inp;
  const dx = g.x - s.x;
  const dy = g.y - s.y;
  if (Math.abs(dx) > 10) inp[dx > 0 ? 'right' : 'left'] = true;
  if (s.mode === 'climb') {
    if (dy < -14) inp.up = true;
    else if (dy > 14) inp.down = true;
    return inp;
  }
  if (s.mode === 'ground') {
    // Rivals don't leap at a snake in mid-air: hopping is the player's way out.
    if (dy < -45 && Math.abs(dx) < 150 && !(g.snake && !s.isPlayer)) inp.up = true;
    if (s.ledge && dy > 60) inp.down = true;
    if (s.evade) inp.up = true;
    const dir = Math.sign(dx) || s.facing;
    const r = radiusOf(s.size);
    for (const c of w.cacti) {
      const ahead = (c.x - s.x) * dir;
      if (ahead > 0 && ahead < c.rx + r + 80) inp.up = true;
    }
  }
  return inp;
}

function stepSnake(w, s, inp) {
  for (const key of ['safeT', 'hurtT', 'stunT', 'bumpT', 'dropT', 'chewT', 'restT']) s[key] = Math.max(0, s[key] - DT);
  moveSnake(w, s, inp);
  updateTrail(w, s);
  eatFood(w, s);
  pricks(w, s);
  s.size -= w.level.decay * DT;
}

function stepWorld(w, playerInput) {
  if (w.state !== 'playing') return;
  w.time += DT;
  for (const s of w.snakes) {
    if (!s.alive) {
      if (!s.isPlayer) {
        s.respawnT -= DT;
        if (s.respawnT <= 0) respawn(w, s);
      }
      continue;
    }
    stepSnake(w, s, s.isPlayer ? playerInput : botInput(w, s, w.level.aggro));
    if (s.size <= 0 && !s.isPlayer) kill(w, s);
  }
  meetSnakes(w);

  w.refillT -= DT;
  if (w.refillT <= 0 && w.food.length < w.level.food) {
    spawnFood(w);
    w.refillT = w.level.refill;
  }

  if (w.state !== 'playing') return;
  const player = w.snakes[0];
  if (player.size <= 0) {
    loseLife(w, 'starved');
  } else if (shownSize(player) >= w.level.target) {
    w.state = 'won';
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    DT, VIEW_H, GROUND_Y, JUMP_V, GRAVITY, LEVELS, SKINS, COLORS, FOOD_KINDS,
    LIVES, createWorld, stepWorld, botInput, groundY, treeAt, treeHalfWidth, shownSize, radiusOf, bodyPoints,
  };
}
