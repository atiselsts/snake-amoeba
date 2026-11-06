// Screens, input, the main loop and effects. The rules live in world.js.
(() => {
  const params = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STORE_KEY = 'snake-amoeba-v1';

  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      return {};
    }
  }

  const saved = loadSaved();
  const state = {
    lang: params.get('lang') || saved.lang || 'lv',
    unlocked: clamp(saved.unlocked || 1, 1, LEVELS.length),
    skin: SKINS.includes(saved.skin) ? saved.skin : 'plain',
    color: COLORS.includes(saved.color) ? saved.color : COLORS[0],
    muted: Boolean(saved.muted),
    levelIndex: 0,
  };

  function save() {
    const { lang, unlocked, skin, color, muted } = state;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ lang, unlocked, skin, color, muted }));
    } catch {
      // Private windows can refuse storage; the game just forgets progress.
    }
  }

  const T = (key, vars = {}) => TEXT[state.lang][key].replace(/\{(\w+)\}/g, (_, k) => vars[k]);

  const canvas = $('view');
  const ctx = canvas.getContext('2d');
  const keys = {};
  const pointer = { down: false, x: 0, y: 0 };
  const auto = params.has('auto');
  let world = null;
  let paused = false;
  let camX = 0;
  let scale = 1;
  let viewW = 1280;
  let clock = 0;
  let lastFrame = 0;
  let acc = 0;
  let shake = 0;
  let particles = [];
  let floats = [];
  let bulges = {};
  let toastTimer = 0;
  let hints = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    scale = innerHeight / VIEW_H;
    viewW = innerWidth / scale;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }

  const ICONS = {
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9z"/><path d="M15 8a5 5 0 0 1 0 8M17.5 5a9 9 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    heart: (on) => `<svg viewBox="0 0 24 24" fill="${on ? '#ef4a68' : '#d9d2bf'}"><path d="M12 21C5 15 2 12 2 8a5 5 0 0 1 10-1.5A5 5 0 0 1 22 8c0 4-3 7-10 13z"/></svg>`,
    lock: '<svg class="lock" viewBox="0 0 24 24" fill="#5d6a75"><path d="M6 10V8a6 6 0 0 1 12 0v2h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm3 0h6V8a3 3 0 0 0-6 0z"/></svg>',
  };

  function showOnly(id) {
    for (const screen of ['menu', 'looks', 'result', 'paused']) $(screen).hidden = screen !== id;
  }

  // ---- Menu ----

  function buildMenu() {
    document.documentElement.lang = state.lang;
    document.title = T('title');
    $('menu-title').textContent = T('title');
    $('menu-tagline').textContent = T('tagline');
    $('menu-choose').textContent = T('chooseLevel');
    for (const b of document.querySelectorAll('.lang button')) b.classList.toggle('on', b.dataset.lang === state.lang);

    const mascot = $('mascot').getContext('2d');
    mascot.clearRect(0, 0, 520, 130);
    Art.drawSampleSnake(mascot, 520, 130, { skin: state.skin, color: state.color }, 0.4, 36);

    const list = $('levels');
    list.textContent = '';
    LEVELS.forEach((level, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'level';
      const locked = i + 1 > state.unlocked;
      card.disabled = locked;
      const pic = document.createElement('canvas');
      pic.width = 320;
      pic.height = 150;
      Art.drawMapCard(pic.getContext('2d'), level.map, 320, 150);
      card.append(pic, T('level', { n: i + 1 }));
      const note = document.createElement('small');
      for (const line of [T(`map.${level.map}`), T('goal', { n: level.target })]) {
        const row = document.createElement('span');
        row.textContent = line;
        note.append(row);
      }
      card.append(note);
      if (locked) card.insertAdjacentHTML('beforeend', ICONS.lock);
      card.addEventListener('click', () => {
        Sound.unlock();
        Sound.play('click');
        openLooks(i);
      });
      list.append(card);
    });
  }

  function openMenu() {
    world = null;
    $('hud').hidden = true;
    $('toast').hidden = true;
    paused = false;
    buildMenu();
    showOnly('menu');
  }

  // ---- Choosing the snake ----

  function buildSkins() {
    const list = $('skins');
    list.textContent = '';
    for (const skin of SKINS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `skin${skin === state.skin ? ' on' : ''}`;
      card.setAttribute('aria-pressed', skin === state.skin);
      const pic = document.createElement('canvas');
      pic.width = 180;
      pic.height = 84;
      Art.drawSampleSnake(pic.getContext('2d'), 180, 84, { skin, color: state.color }, 0.4, 19);
      card.append(pic, T(`skin.${skin}`));
      card.addEventListener('click', () => {
        Sound.play('click');
        state.skin = skin;
        save();
        buildSkins();
      });
      list.append(card);
    }
  }

  function buildColors() {
    const list = $('colors');
    list.textContent = '';
    COLORS.forEach((color, i) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `swatch${color === state.color ? ' on' : ''}`;
      swatch.style.background = color;
      swatch.setAttribute('aria-label', `${T('color')} ${i + 1}`);
      swatch.setAttribute('aria-pressed', color === state.color);
      swatch.addEventListener('click', () => {
        Sound.play('click');
        state.color = color;
        save();
        buildColors();
        buildSkins();
      });
      list.append(swatch);
    });
  }

  function openLooks(index) {
    state.levelIndex = index;
    const level = LEVELS[index];
    $('looks-title').textContent = T('chooseLook');
    $('looks-level').textContent = `${T('level', { n: index + 1 })} · ${T(`map.${level.map}`)} · ${T('goal', { n: level.target })}`;
    $('looks-pattern').textContent = T('pattern');
    $('looks-color').textContent = T('color');
    $('btn-start').textContent = T('start');
    $('btn-looks-back').textContent = T('back');
    world = null;
    $('hud').hidden = true;
    $('toast').hidden = true;
    buildSkins();
    buildColors();
    showOnly('looks');
    $('btn-start').focus();
  }

  // ---- Playing ----

  function startLevel(index, seed) {
    state.levelIndex = index;
    const useSeed = seed === undefined ? Math.floor(Math.random() * 1e9) : seed;
    world = createWorld(index, useSeed, { skin: state.skin, color: state.color });
    particles = [];
    floats = [];
    bulges = {};
    paused = false;
    acc = 0;
    camX = clamp(world.snakes[0].x - viewW / 2, 0, Math.max(0, world.level.width - viewW));
    showOnly(null);
    $('hud').hidden = false;
    $('level-name').textContent = T('level', { n: index + 1 });
    $('meter-label').textContent = T('size');
    updatePauseIcon();
    updateHud();
    queueHints(index);
    canvas.focus();
  }

  function queueHints(index) {
    const level = LEVELS[index];
    hints = [T('hintGoal', { n: level.target })];
    if (index === 0) hints.push(T('hintMove'), T('hintRivals'));
    if (level.map === 'forest' && index < 3) hints.push(T('hintForest'));
    if (level.cacti && index < 4) hints.push(T('hintCactus'));
    nextHint();
  }

  function nextHint() {
    const text = hints.shift();
    if (text) toast(text, 3.2);
  }

  function toast(text, seconds) {
    $('toast').textContent = text;
    $('toast').hidden = false;
    toastTimer = seconds;
  }

  function updateHud() {
    const size = shownSize(world.snakes[0]);
    const { target } = world.level;
    $('meter-value').textContent = `${size} / ${target}`;
    $('meter-fill').style.width = `${clamp(size / target, 0, 1) * 100}%`;
    const hearts = [];
    for (let i = 0; i < LIVES; i++) hearts.push(ICONS.heart(i < world.lives));
    const html = hearts.join('');
    if ($('lives').dataset.lives !== String(world.lives)) {
      $('lives').innerHTML = html;
      $('lives').dataset.lives = world.lives;
    }
  }

  function readInput() {
    if (auto) return botInput(world, world.snakes[0], 450);
    const inp = {
      left: keys.ArrowLeft || keys.KeyA,
      right: keys.ArrowRight || keys.KeyD,
      up: keys.ArrowUp || keys.KeyW || keys.Space,
      down: keys.ArrowDown || keys.KeyS,
    };
    if (pointer.down) {
      const head = world.snakes[0];
      const dx = pointer.x / scale + camX - head.x;
      const dy = pointer.y / scale - head.y;
      if (dx > 26) inp.right = true;
      if (dx < -26) inp.left = true;
      if (dy < -80) inp.up = true;
      if (dy > 80) inp.down = true;
    }
    return inp;
  }

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.4 + Math.random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.4, color, r: 3 + Math.random() * 4 });
    }
  }

  function floatText(x, y, text, color) {
    floats.push({ x, y, text, color, life: 1 });
  }

  const addBulge = (id) => { (bulges[id] = bulges[id] || []).push(0); };

  function handleEvents() {
    for (const e of world.events) {
      if (e.type === 'eat') {
        if (e.player) {
          Sound.play(e.kind);
          floatText(e.x, e.y - 20, `+${e.value}`, '#1f8a71');
          if (e.kind !== 'small') addBulge(e.id);
        }
        burst(e.x, e.y, e.kind === 'big' ? '#e8485b' : '#ffc23d', e.kind === 'small' ? 4 : 10, 120);
      } else if (e.type === 'gulp') {
        burst(e.x, e.y, e.color, 26, 260);
        addBulge(e.id);
        if (e.player) {
          Sound.play('gulp');
          floatText(e.x, e.y - 30, `+${e.gain}`, '#1f8a71');
        }
      } else if (e.type === 'prick') {
        burst(e.x, e.y, '#4fae5e', 8, 160);
        if (e.player) {
          Sound.play('prick');
          floatText(e.x, e.y - 30, `-${e.loss}`, '#d8344a');
          if (!calm) shake = 0.25;
        }
      } else if (e.type === 'hop') {
        Sound.play('hop');
      } else if (e.type === 'bump') {
        if (e.player) Sound.play('bump');
      } else if (e.type === 'life') {
        burst(e.x, e.y, e.color, 20, 220);
        Sound.play('life');
        hints = [];
        toast(T(e.reason === 'eaten' ? 'lifeEaten' : 'lifeStarved', { n: world.lives }), 3);
      }
    }
    world.events.length = 0;
  }

  function endLevel() {
    const won = world.state === 'won';
    const last = state.levelIndex === LEVELS.length - 1;
    if (won && state.levelIndex + 2 > state.unlocked) {
      state.unlocked = Math.min(LEVELS.length, state.levelIndex + 2);
      save();
    }
    $('toast').hidden = true;
    Sound.play(won ? 'win' : 'lose');
    if (won) {
      const head = world.snakes[0];
      for (let i = 0; i < 6; i++) burst(head.x + (i - 3) * 90, 200 + i * 20, COLORS[i], 16, 260);
    }
    const whole = Math.round(world.time);
    const time = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
    $('result-title').textContent = T(won ? 'won' : 'lost');
    if (won) $('result-text').textContent = last ? T('allDone') : T('wonText', { n: shownSize(world.snakes[0]) });
    else $('result-text').textContent = world.reason === 'eaten' ? T('lostEaten', { n: world.killer }) : T('lostStarved');
    $('result-stats').textContent = T('stats', { time, eaten: world.eaten });
    $('btn-result-menu').textContent = T('menu');
    const main = $('btn-result-main');
    main.textContent = won && !last ? T('next') : T('retry');
    main.onclick = () => {
      Sound.play('click');
      if (won && !last) openLooks(state.levelIndex + 1);
      else startLevel(state.levelIndex);
    };
    showOnly('result');
    // Not at once: a child still holding Space would press the button by accident.
    setTimeout(() => { if (!$('result').hidden) main.focus(); }, 700);
  }

  function setPaused(value) {
    if (!world || world.state !== 'playing') return;
    paused = value;
    if (paused) {
      $('paused-title').textContent = T('paused');
      $('btn-resume').textContent = T('resume');
      $('btn-paused-menu').textContent = T('menu');
      showOnly('paused');
      $('btn-resume').focus();
    } else {
      showOnly(null);
      for (const k of Object.keys(keys)) keys[k] = false;
    }
  }

  function updatePauseIcon() {
    $('btn-pause').innerHTML = ICONS.pause;
    $('btn-pause').setAttribute('aria-label', T('pause'));
    $('btn-sound').innerHTML = state.muted ? ICONS.soundOff : ICONS.soundOn;
    $('btn-sound').setAttribute('aria-label', T('sound'));
  }

  function updateEffects(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floats) {
      f.y -= 50 * dt;
      f.life -= dt;
    }
    floats = floats.filter((f) => f.life > 0);
    for (const id of Object.keys(bulges)) bulges[id] = bulges[id].map((b) => b + dt * 0.9).filter((b) => b < 1.1);
    shake = Math.max(0, shake - dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) {
        $('toast').hidden = true;
        nextHint();
      }
    }
  }

  function numberColor(me, other) {
    if (other > me) return '#d8253d';
    if (other < me) return '#17913f';
    return '#b98500';
  }

  function drawWorld() {
    const w = world;
    const head = w.snakes[0];
    const room = Math.max(0, w.level.width - viewW);
    const want = clamp(head.x - viewW / 2 + head.facing * viewW * 0.1, 0, room);
    camX += (want - camX) * 0.09;
    const jolt = shake > 0 ? Math.sin(clock * 70) * 6 * (shake / 0.25) : 0;

    Art.drawBackdrop(ctx, w.level.map, camX, viewW, clock);
    ctx.save();
    ctx.translate(-camX + jolt, 0);
    const near = (x, pad) => x > camX - pad && x < camX + viewW + pad;
    for (const l of w.ledges) if (near(l.x, 200)) Art.drawLedge(ctx, w, l);
    for (const t of w.trees) if (near(t.x, 200)) Art.drawTree(ctx, t);
    Art.drawGround(ctx, w, camX, viewW);
    for (const c of w.cacti) if (near(c.x, 100)) Art.drawCactus(ctx, c);
    for (const f of w.food) if (near(f.x, 40)) Art.drawFood(ctx, f, clock, calm);

    const me = shownSize(head);
    const order = w.snakes.filter((s) => s.alive).sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer));
    for (const s of order) {
      if (!near(s.x, 700)) continue;
      const R = radiusOf(s.size);
      const blinking = s.safeT > 0 || s.hurtT > 0;
      Art.drawSnake(ctx, {
        pts: bodyPoints(s, Math.max(10, R * 0.62)),
        R,
        look: s.look,
        t: clock + s.id * 1.7,
        calm,
        facing: s.facing,
        chew: s.chewT,
        seed: s.id,
        bulges: bulges[s.id],
        alpha: blinking && Math.floor(clock * 6) % 2 ? 0.6 : 1,
        number: shownSize(s),
        numberColor: s.isPlayer ? '#1b5fbf' : numberColor(me, shownSize(s)),
        // Trail points sit at head height, so without this the thinner tail would hover.
        settle: (pts, radii) => pts.forEach((p, i) => {
          const floor = groundY(w, p.x);
          if (floor - p.y < R + 3) p.y = floor - radii[i];
        }),
      });
    }

    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = "900 28px Nunito, 'Trebuchet MS', sans-serif";
    ctx.textAlign = 'center';
    for (const f of floats) {
      ctx.globalAlpha = clamp(f.life * 2, 0, 1);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    Art.drawMinimap(ctx, w, viewW);
  }

  function drawPreview() {
    const pic = $('preview').getContext('2d');
    pic.clearRect(0, 0, 560, 170);
    Art.drawSampleSnake(pic, 560, 170, { skin: state.skin, color: state.color }, calm ? 0.4 : clock, 42);
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    clock += dt;
    if (world) {
      if (world.state === 'playing' && !paused) {
        acc += dt;
        while (acc >= DT && world.state === 'playing') {
          stepWorld(world, readInput());
          handleEvents();
          acc -= DT;
        }
        updateHud();
        if (world.state !== 'playing') endLevel();
      }
      if (!paused) updateEffects(dt);
      drawWorld();
    } else {
      Art.drawBackdrop(ctx, LEVELS[state.levelIndex].map, clock * 12, viewW, clock);
      if (!$('looks').hidden) drawPreview();
    }
    requestAnimationFrame(frame);
  }

  // ---- Wiring ----

  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

  window.addEventListener('keydown', (e) => {
    Sound.unlock();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (world && world.state === 'playing') setPaused(!paused);
      return;
    }
    if (world && world.state === 'playing' && !paused) {
      keys[e.code] = true;
      if (GAME_KEYS.includes(e.code)) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    pointer.down = false;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !auto) setPaused(true);
  });

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    pointer.down = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });
  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, () => { pointer.down = false; });
  }

  for (const b of document.querySelectorAll('.lang button')) {
    b.addEventListener('click', () => {
      Sound.unlock();
      Sound.play('click');
      state.lang = b.dataset.lang;
      save();
      buildMenu();
    });
  }
  $('btn-start').addEventListener('click', () => {
    Sound.unlock();
    Sound.play('click');
    startLevel(state.levelIndex);
  });
  $('btn-looks-back').addEventListener('click', openMenu);
  $('btn-result-menu').addEventListener('click', openMenu);
  $('btn-paused-menu').addEventListener('click', openMenu);
  $('btn-resume').addEventListener('click', () => setPaused(false));
  $('btn-pause').addEventListener('click', () => setPaused(true));
  $('btn-sound').addEventListener('click', () => {
    Sound.unlock();
    state.muted = !state.muted;
    Sound.setMuted(state.muted);
    save();
    updatePauseIcon();
    $('btn-sound').blur();
  });

  window.addEventListener('resize', resize);
  resize();
  Sound.setMuted(state.muted);

  function boot() {
    const forced = Number(params.get('level'));
    if (params.has('skin') && SKINS.includes(params.get('skin'))) state.skin = params.get('skin');
    if (params.has('color')) state.color = COLORS[Number(params.get('color')) % COLORS.length];
    if (params.get('screen') === 'looks') openLooks(clamp(forced - 1 || 0, 0, LEVELS.length - 1));
    else if (forced >= 1 && forced <= LEVELS.length) {
      startLevel(forced - 1, Number(params.get('seed')) || 1);
      // Fast-forward with the bot, to look at a level part-way through.
      for (let i = Number(params.get('warp')) || 0; i > 0 && world.state === 'playing'; i--) {
        stepWorld(world, botInput(world, world.snakes[0], 450));
        world.events.length = 0;
      }
      camX = clamp(world.snakes[0].x - viewW / 2, 0, Math.max(0, world.level.width - viewW));
    }
    else openMenu();
    requestAnimationFrame(frame);
  }

  if (params.has('dev')) {
    window.__snake = {
      get world() { return world; },
      state,
      step: (n) => { for (let i = 0; i < n && world.state === 'playing'; i++) { stepWorld(world, readInput()); handleEvents(); } },
    };
  }

  // The canvas text needs the embedded font loaded before the first frame.
  if (document.fonts && document.fonts.load) document.fonts.load("900 30px Nunito").then(boot, boot);
  else boot();
})();
