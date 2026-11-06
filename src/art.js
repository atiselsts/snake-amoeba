// All drawing, in code so the game has no image files. Shapes follow a pencil sketch:
// pointy smiling head, zigzag body, jagged conifers, oval spiny cacti, rayed sun.
const Art = (() => {
  const TAU = Math.PI * 2;
  const INK = '#2f3a45';

  const THEMES = {
    plain: { top: '#86d3f6', bottom: '#e2f6ff', far: '#b5e39a', near: '#98d681', ground: '#74c35d', deep: '#559f45', line: '#3f8a37' },
    forest: { top: '#79c2c6', bottom: '#dbf2dc', far: '#6db487', near: '#559f71', ground: '#55a05a', deep: '#3b8047', line: '#2c6636' },
    cactus: { top: '#ffc36e', bottom: '#fff0c8', far: '#efc083', near: '#e2aa69', ground: '#ebca88', deep: '#d0a662', line: '#b3874a' },
  };

  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
    return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
  }

  function drawSun(ctx, x, y, r, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#f7a928';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + t * 0.08;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
      ctx.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawCloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, TAU);
    ctx.arc(x + 32 * s, y - 12 * s, 32 * s, 0, TAU);
    ctx.arc(x + 70 * s, y, 24 * s, 0, TAU);
    ctx.rect(x, y, 70 * s, 26 * s);
    ctx.fill();
  }

  function drawHills(ctx, camX, viewW, color, base, amp, wave, drift) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    for (let x = 0; x <= viewW + 24; x += 24) {
      const wx = x + camX * drift;
      ctx.lineTo(x, base + amp * Math.sin(wx * wave) + amp * 0.4 * Math.sin(wx * wave * 2.7 + 1));
    }
    ctx.lineTo(viewW + 24, VIEW_H);
    ctx.fill();
  }

  function drawBackdrop(ctx, map, camX, viewW, t) {
    const theme = THEMES[map];
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, theme.top);
    sky.addColorStop(1, theme.bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, VIEW_H);
    if (map === 'cactus') drawSun(ctx, viewW * 0.8, 120, 62, t);
    if (map === 'plain') drawSun(ctx, viewW * 0.85, 96, 44, t);
    if (map !== 'cactus') {
      for (let i = 0; i < 7; i++) {
        const span = viewW + 400;
        const x = (((hash(i) * 3000 - camX * 0.15 + t * 6) % span) + span) % span - 200;
        drawCloud(ctx, x, 70 + hash(i + 9) * 130, 0.7 + hash(i + 5) * 0.6);
      }
    }
    drawHills(ctx, camX, viewW, theme.far, 470, 40, 0.004, 0.2);
    drawHills(ctx, camX, viewW, theme.near, 530, 30, 0.007, 0.4);
  }

  function drawGround(ctx, w, camX, viewW) {
    const theme = THEMES[w.level.map];
    const from = Math.floor(camX / 14) * 14 - 14;
    const to = camX + viewW + 28;
    ctx.fillStyle = theme.ground;
    ctx.beginPath();
    ctx.moveTo(from, VIEW_H);
    for (let x = from; x <= to; x += 14) ctx.lineTo(x, groundY(w, x));
    ctx.lineTo(to, VIEW_H);
    ctx.fill();
    ctx.fillStyle = theme.deep;
    for (let x = Math.floor(from / 90) * 90; x <= to; x += 90) {
      const y = groundY(w, x) + 34 + hash(x) * 50;
      ctx.beginPath();
      ctx.ellipse(x + hash(x + 1) * 50, y, 16 + hash(x + 2) * 18, 5, 0, 0, TAU);
      ctx.fill();
    }
    // The scribbled grass line along the ground in the sketch.
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let up = true;
    for (let x = from; x <= to; x += 14) {
      const y = groundY(w, x) + (up ? -5 : 2);
      if (x === from) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      up = !up;
    }
    ctx.stroke();
  }

  function drawTree(ctx, tree) {
    const { x, top, crownBottom, baseY, halfW, seed } = tree;
    ctx.fillStyle = '#7a5433';
    ctx.fillRect(x - 11, crownBottom - 30, 22, baseY - crownBottom + 36);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.fillRect(x + 3, crownBottom - 30, 8, baseY - crownBottom + 36);
    const tiers = 3;
    const tierH = (crownBottom - top) / tiers;
    for (let i = tiers - 1; i >= 0; i--) {
      const y0 = top + i * tierH * 0.92;
      const y1 = top + (i + 1) * tierH + 8;
      const half = halfW * (0.5 + 0.5 * ((i + 1) / tiers));
      ctx.fillStyle = ['#3f9e52', '#368f49', '#2d7f40'][i];
      ctx.strokeStyle = '#21602f';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + half, y1);
      const teeth = 5;
      for (let k = 1; k <= teeth * 2; k++) {
        const px = x + half - (2 * half * k) / (teeth * 2);
        ctx.lineTo(px, y1 + (k % 2 ? -16 - hash(seed + k) * 8 : 0));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawCactus(ctx, c) {
    const cy = c.baseY - c.ry;
    ctx.strokeStyle = '#2d6b3a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + hash(c.seed + i) * 0.1;
      if (Math.sin(a) > 0.75) continue;
      const ex = Math.cos(a) * c.rx;
      const ey = Math.sin(a) * c.ry;
      ctx.beginPath();
      ctx.moveTo(c.x + ex, cy + ey);
      ctx.lineTo(c.x + ex * 1.42, cy + ey * 1.28);
      ctx.stroke();
    }
    ctx.fillStyle = '#4fae5e';
    ctx.strokeStyle = '#2d6b3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(c.x, cy, c.rx, c.ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    for (const f of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.ellipse(c.x, cy, Math.abs(c.rx * f) + 0.5, c.ry * 0.9, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawLedge(ctx, w, l) {
    const bottom = groundY(w, l.x) + 6;
    ctx.fillStyle = '#c99a6b';
    ctx.beginPath();
    ctx.moveTo(l.x - 26, l.y);
    ctx.lineTo(l.x + 26, l.y);
    ctx.lineTo(l.x + 34, bottom);
    ctx.lineTo(l.x - 34, bottom);
    ctx.fill();
    ctx.fillStyle = '#b5764f';
    ctx.strokeStyle = '#7f4f33';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(l.x - l.half, l.y);
    ctx.lineTo(l.x + l.half, l.y);
    ctx.lineTo(l.x + l.half - 12, l.y + 22);
    ctx.lineTo(l.x - l.half + 12, l.y + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function starPath(ctx, x, y, r, inner) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const d = i % 2 ? r * inner : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
  }

  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.7, y - s, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
  }

  // Oblong and speckled, as eggs are; only the leftovers of a fight are truly round.
  function drawEgg(ctx, f, y, shell, speck, t, calm) {
    const rx = f.r * 0.82;
    const ry = f.r * 1.14;
    const tilt = f.where === 'ground' || calm ? 0 : Math.sin(t * 1.8 + f.phase) * 0.14;
    ctx.save();
    ctx.translate(f.x, y);
    ctx.rotate(tilt);
    const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, f.r * 0.1, 0, 0, f.r * 1.2);
    g.addColorStop(0, shade(shell, 0.6));
    g.addColorStop(1, shade(shell, -0.12));
    ctx.fillStyle = g;
    ctx.strokeStyle = shade(shell, -0.5);
    ctx.lineWidth = f.r > 14 ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -ry);
    ctx.bezierCurveTo(rx * 0.75, -ry, rx * 1.1, ry * 0.05, rx, ry * 0.3);
    ctx.bezierCurveTo(rx * 0.9, ry * 0.8, rx * 0.45, ry, 0, ry);
    ctx.bezierCurveTo(-rx * 0.45, ry, -rx * 0.9, ry * 0.8, -rx, ry * 0.3);
    ctx.bezierCurveTo(-rx * 1.1, ry * 0.05, -rx * 0.75, -ry, 0, -ry);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = speck;
    const specks = f.r > 14 ? 7 : 4;
    for (let i = 0; i < specks; i++) {
      const a = hash(i + 3) * TAU;
      const d = 0.2 + hash(i + 7) * 0.5;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * rx * d, Math.sin(a) * ry * d + ry * 0.1, f.r * 0.11, f.r * 0.08, a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawChunk(ctx, f, y, t, calm) {
    if (f.life < 4 && Math.floor(t * 6) % 2) return;
    const wobble = calm ? 0 : Math.sin(t * 4 + f.phase) * 0.05;
    const g = ctx.createRadialGradient(f.x - f.r * 0.3, y - f.r * 0.35, f.r * 0.1, f.x, y, f.r);
    g.addColorStop(0, shade(f.color, 0.45));
    g.addColorStop(1, shade(f.color, -0.2));
    ctx.fillStyle = g;
    ctx.strokeStyle = shade(f.color, -0.5);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(f.x, y, f.r * (1 + wobble), f.r * (1 - wobble), 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  function drawFood(ctx, f, t, calm) {
    const y = f.y + (f.where === 'ground' || calm ? 0 : Math.sin(t * 2.2 + f.phase) * 3);
    if (f.kind === 'chunk') {
      drawChunk(ctx, f, y, t, calm);
      return;
    }
    if (f.kind === 'gold') {
      drawEgg(ctx, f, y, '#ffcf3a', '#c98a10', t, calm);
      ctx.fillStyle = '#fff';
      const glint = calm ? 1 : 0.7 + 0.5 * Math.sin(t * 5 + f.phase);
      starPath(ctx, f.x + f.r * 0.6, y - f.r * 0.8, f.r * 0.42 * glint, 0.3);
      ctx.fill();
      return;
    }
    if (f.kind === 'big') drawEgg(ctx, f, y, '#b9e6c8', '#3f9e72', t, calm);
    else drawEgg(ctx, f, y, '#f2d9a4', '#9c6b3a', t, calm);
  }

  // Bouncing arrow over whatever the tutorial wants next.
  function drawMarker(ctx, x, y, t, calm) {
    const top = y - 76 + (calm ? 0 : Math.sin(t * 5) * 8);
    ctx.fillStyle = '#ff7a1a';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 11, top - 26);
    ctx.lineTo(x + 11, top - 26);
    ctx.lineTo(x + 11, top);
    ctx.lineTo(x + 24, top);
    ctx.lineTo(x, top + 26);
    ctx.lineTo(x - 24, top);
    ctx.lineTo(x - 11, top);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }

  function normalAt(pts, i) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len };
  }

  function smoothClosed(ctx, ring) {
    const n = ring.length;
    const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const start = mid(ring[n - 1], ring[0]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const m = mid(ring[i], ring[(i + 1) % n]);
      ctx.quadraticCurveTo(ring[i].x, ring[i].y, m.x, m.y);
    }
    ctx.closePath();
  }

  // Lobes alternate in and out for the sketch's zigzag edge, and drift so the body creeps
  // like an amoeba even when the snake stands still.
  function bodyRing(pts, radii, t, calm) {
    const left = [];
    const right = [];
    const speed = calm ? 0 : 1;
    pts.forEach((p, i) => {
      const { nx, ny } = normalAt(pts, i);
      const fade = Math.min(1, i / 3);
      const zig = (i % 2 ? 0.3 : -0.2) * fade;
      const l = radii[i] * (1 + zig + 0.11 * Math.sin(i * 0.9 + t * 3.1 * speed) * fade);
      const r = radii[i] * (1 - zig + 0.11 * Math.sin(i * 1.1 - t * 2.6 * speed + 2) * fade);
      left.push({ x: p.x + nx * l, y: p.y + ny * l });
      right.push({ x: p.x - nx * r, y: p.y - ny * r });
    });
    const end = pts[pts.length - 1];
    const { tx, ty } = normalAt(pts, pts.length - 1);
    const cap = { x: end.x + tx * radii[radii.length - 1], y: end.y + ty * radii[radii.length - 1] };
    return [...left, cap, ...right.reverse()];
  }

  function drawPattern(ctx, skin, pts, radii, color) {
    const light = shade(color, 0.62);
    const deep = shade(color, -0.3);
    if (skin === 'rainbow') {
      ctx.lineCap = 'butt';
      pts.forEach((p, i) => {
        const { nx, ny } = normalAt(pts, i);
        const r = radii[i] * 1.5;
        ctx.strokeStyle = `hsl(${(i * 24) % 360} 85% 66%)`;
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(p.x + nx * r, p.y + ny * r);
        ctx.lineTo(p.x - nx * r, p.y - ny * r);
        ctx.stroke();
      });
      return;
    }
    if (skin === 'zigzag') {
      ctx.strokeStyle = light;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      pts.forEach((p, i) => {
        const { nx, ny } = normalAt(pts, i);
        const r = radii[i] * (i % 2 ? 0.55 : -0.55);
        ctx.lineTo(p.x + nx * r, p.y + ny * r);
      });
      ctx.stroke();
      return;
    }
    for (let i = 2; i < pts.length; i++) {
      const p = pts[i];
      const r = radii[i];
      const { nx, ny, tx, ty } = normalAt(pts, i);
      if (skin === 'stripes' && i % 2 === 0) {
        ctx.strokeStyle = deep;
        ctx.lineWidth = Math.max(5, r * 0.42);
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(p.x + nx * r * 1.5, p.y + ny * r * 1.5);
        ctx.lineTo(p.x - nx * r * 1.5, p.y - ny * r * 1.5);
        ctx.stroke();
      }
      const off = (i % 4 < 2 ? 0.3 : -0.3) * r;
      if (skin === 'hearts' && i % 2 === 0) {
        ctx.save();
        ctx.translate(p.x + nx * off, p.y + ny * off);
        ctx.rotate(Math.atan2(ty, tx) + Math.PI / 2);
        ctx.fillStyle = '#ff4f7b';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        heartPath(ctx, 0, 0, r * 0.36);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (skin === 'dots' && i % 2 === 0) {
        ctx.fillStyle = light;
        ctx.beginPath();
        ctx.arc(p.x + nx * off, p.y + ny * off, r * 0.24, 0, TAU);
        ctx.fill();
      }
      if (skin === 'stars' && i % 3 === 0) {
        ctx.fillStyle = '#ffe066';
        ctx.strokeStyle = shade('#ffe066', -0.4);
        ctx.lineWidth = 1.2;
        starPath(ctx, p.x + nx * off, p.y + ny * off, r * 0.42, 0.48);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // The little dark specks inside make it read as a cell rather than a plain worm.
  function drawCellSpecks(ctx, pts, radii, color, t, calm) {
    ctx.fillStyle = shade(color, -0.22);
    ctx.globalAlpha = 0.45;
    for (let i = 3; i < pts.length; i += 4) {
      const { nx, ny } = normalAt(pts, i);
      const off = Math.sin(i * 2.3 + (calm ? 0 : t * 0.8)) * radii[i] * 0.45;
      ctx.beginPath();
      ctx.ellipse(pts[i].x + nx * off, pts[i].y + ny * off, radii[i] * 0.2, radii[i] * 0.14, i, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHead(ctx, o, angle, fill) {
    const R = o.R * 1.12;
    const p = o.pts[0];
    ctx.save();
    ctx.translate(p.x, p.y);
    if (o.facing < 0) ctx.scale(-1, 1);
    ctx.rotate(o.facing < 0 ? Math.atan2(Math.sin(angle), -Math.cos(angle)) : angle);
    ctx.fillStyle = fill;
    ctx.strokeStyle = o.outline;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(-0.15 * R, -0.9 * R);
    ctx.lineTo(-0.48 * R, -1.62 * R);
    ctx.lineTo(-0.72 * R, -0.75 * R);
    ctx.moveTo(-0.15 * R, 0.9 * R);
    ctx.lineTo(-0.5 * R, 1.42 * R);
    ctx.lineTo(-0.72 * R, 0.75 * R);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(1.5 * R, 0.1 * R);
    ctx.quadraticCurveTo(0.7 * R, -0.75 * R, -0.25 * R, -1.02 * R);
    ctx.quadraticCurveTo(-0.95 * R, -0.5 * R, -0.95 * R, 0);
    ctx.quadraticCurveTo(-0.95 * R, 0.5 * R, -0.25 * R, 1.02 * R);
    ctx.quadraticCurveTo(0.7 * R, 0.8 * R, 1.5 * R, 0.1 * R);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const blink = !o.calm && (o.t + o.seed) % 3.7 < 0.13;
    ctx.fillStyle = INK;
    for (const ex of [0.14, 0.62]) {
      ctx.beginPath();
      ctx.ellipse(ex * R, -0.3 * R, 0.11 * R, blink ? 0.02 * R : 0.17 * R, 0, 0, TAU);
      ctx.fill();
    }
    if (o.chew > 0) {
      ctx.fillStyle = '#7a2436';
      ctx.beginPath();
      ctx.ellipse(0.5 * R, 0.3 * R, 0.3 * R, 0.24 * R, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = INK;
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0.12 * R, 0.2 * R);
      ctx.quadraticCurveTo(0.5 * R, 0.68 * R, 0.86 * R, 0.2 * R);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSnake(ctx, o) {
    const { pts, R, look, t, calm } = o;
    if (pts.length < 2) return;
    const n = pts.length;
    const radii = pts.map((_, i) => {
      const u = i / (n - 1);
      let bulge = 1;
      for (const b of o.bulges || []) bulge += 0.4 * Math.exp(-(((u - b) / 0.09) ** 2));
      return R * bodyTaper(u) * bulge;
    });
    if (o.settle) o.settle(pts, radii);
    const ring = bodyRing(pts, radii, t, calm);
    const outline = shade(look.color, -0.45);

    ctx.save();
    ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    smoothClosed(ctx, ring);
    ctx.fillStyle = look.color;
    ctx.fill();
    ctx.save();
    ctx.clip();
    drawPattern(ctx, look.skin, pts, radii, look.color);
    drawCellSpecks(ctx, pts, radii, look.color, t, calm);
    ctx.restore();
    smoothClosed(ctx, ring);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    const angle = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x);
    drawHead(ctx, { ...o, outline }, angle, look.color);
    ctx.restore();

    if (o.number !== undefined) drawNumber(ctx, o.number, pts[0].x, pts[0].y - R * 2 - 6, o.numberColor);
  }

  function drawNumber(ctx, value, x, y, color) {
    ctx.font = "900 30px Nunito, 'Trebuchet MS', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.strokeText(value, x, Math.max(y, 22));
    ctx.fillStyle = color;
    ctx.fillText(value, x, Math.max(y, 22));
  }

  // A wavy snake for the choice screens, using the same drawing as the game.
  function drawSampleSnake(ctx, width, height, look, t, size) {
    const R = size;
    const pts = [];
    const n = 16;
    const head = width - R * 2.4;
    const step = (head - R * 1.2) / (n - 1);
    for (let i = 0; i < n; i++) {
      pts.push({ x: head - i * step, y: height * 0.56 + Math.sin(i * 0.7 - t * 2) * R * 0.35 });
    }
    drawSnake(ctx, { pts, R, look, t, calm: false, facing: 1, chew: 0, seed: 1 });
  }

  // Small picture of a map for the level cards, like the three boxes in the sketch.
  function drawMapCard(ctx, map, width, height) {
    const scale = height / VIEW_H;
    ctx.save();
    ctx.scale(scale, scale);
    const viewW = width / scale;
    drawBackdrop(ctx, map, 0, viewW, 0);
    const theme = THEMES[map];
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, GROUND_Y - 40, viewW, VIEW_H);
    if (map === 'forest') {
      for (const f of [0.28, 0.72]) {
        drawTree(ctx, { x: viewW * f, top: 90, crownBottom: 450, baseY: GROUND_Y - 30, halfW: 170, seed: f * 90 });
      }
    }
    if (map === 'cactus') {
      for (const f of [0.25, 0.62]) drawCactus(ctx, { x: viewW * f, rx: 58, ry: 130, baseY: GROUND_Y - 30, seed: f * 90 });
    }
    ctx.restore();
  }

  function drawMinimap(ctx, w, viewW) {
    const width = Math.min(420, viewW * 0.4);
    const x0 = (viewW - width) / 2;
    const y = VIEW_H - 20;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.roundRect(x0 - 10, y - 10, width + 20, 20, 10);
    ctx.fill();
    const me = shownSize(w.snakes[0]);
    for (const s of w.snakes) {
      if (!s.alive) continue;
      const other = shownSize(s);
      ctx.fillStyle = s.isPlayer ? '#fff' : other > me ? '#ff5b5b' : other < me ? '#7dff8a' : '#ffe066';
      ctx.beginPath();
      ctx.arc(x0 + (s.x / w.level.width) * width, y, s.isPlayer ? 6 : 5, 0, TAU);
      ctx.fill();
    }
  }

  return {
    THEMES, shade, drawBackdrop, drawGround, drawTree, drawCactus, drawLedge, drawFood, drawMarker, drawSnake,
    drawSampleSnake, drawMapCard, drawMinimap, heartPath, starPath,
  };
})();
