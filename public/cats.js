// Three office cats with their own personalities. Original pixel art drawn from code.
//   Bosch  - creamy orange, greedy boss
//   Ingca  - turquoise, hyper zoomie goblin
//   Makita - grey, aloof napper
// Cats make their own random choices (sleep, groom, zoomies, play, fight, eat, ...) with rules that keep them
// from all doing the same thing at once. Claude (the pixel character) and the viewer can both interact with them.
window.Cats = (() => {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let wg = null, W = 240, H = 176;
  let mainDesk = { x: 104, y: 48 };
  let windowsPos = [{ x: 56, y: 6 }, { x: 160, y: 6 }];
  const FLOOR_MIN = 48;

  // States that only one cat may be in at a time (unless a person triggered it: "forced").
  const EXCL = new Set(['sleep', 'groom', 'zoomies', 'stretch', 'watch', 'beg', 'eat', 'play']);

  // ---------- colour helpers ----------
  const hexRgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const shade = (hex, f) => '#' + hexRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')).join('');

  // ---------- sprites ----------
  // 18x14 frames, cats face right (left is a cached mirror). Shapes are drawn as rectangles, then a 1px outline is added.
  const FW = 18, FH = 14, FOOT = 12;

  function head(R, c, x, y, o) {
    o = o || {};
    R(x, y, 5, 4, c.B);
    R(x, y - 1, 1, 1, c.B); R(x + 3, y - 1, 1, 1, c.B);              // ears
    R(x + 1, y, 1, 1, c.b);                                          // forehead stripe
    R(x + 3, y + 2, 2, 2, c.L); R(x + 4, y + 2, 1, 1, c.N);          // muzzle + nose
    if (o.closed) R(x + 2, y + 1, 2, 1, c.E);
    else { R(x + 2, y + 1, 1, 1, c.E); if (o.wide) R(x + 3, y + 1, 1, 1, '#fffdf5'); }
    if (o.mouth) R(x + 3, y + 3, 2, 1, '#d6455a');
  }
  function body(R, c, x, y, w, h) {
    R(x, y, w, h, c.B);
    R(x + 1, y + h - 1, w - 2, 1, c.L);
    for (let i = 1; i < w - 1; i += 2) R(x + i, y, 1, 2, c.b);
  }
  const leg = (R, c, x, y, h, far) => { R(x, y, 2, h, far ? c.F : c.B); R(x, y + h - 1, 2, 1, c.L); };
  function tail(R, c, parts) {
    parts.forEach(([x, y, w, h], i) => R(x, y, w, h, i === parts.length - 1 ? c.T : c.B));
  }
  function stand(R, c, ph, bat) {
    tail(R, c, [[3, 7, 1, 1], [2, 6, 1, 1], [2, 4, 1, 3], [3, 3, 1, 1]]);
    const L = (k) => (ph === k ? 2 : 3);                              // the lifted legs are shorter
    leg(R, c, 6, 8, L(2), true); leg(R, c, 8, 8, L(1), true); leg(R, c, 4, 8, L(1), false);
    if (!bat) leg(R, c, 10, 8, L(2), false);
    body(R, c, 4, 5, 8, 3);
    head(R, c, 11, 3);
    if (bat) { R(12, 7, 3, 2, c.B); R(14, 8, 1, 1, c.L); }
  }
  function sit(R, c, o) {
    o = o || {};
    tail(R, c, [[2, 10, 5, 1], [1, 9, 1, 1]]);
    R(3, 7, 3, 3, c.B); R(4, 5, 6, 5, c.B); R(9, 6, 1, 4, c.L);
    R(5, 5, 1, 2, c.b); R(7, 5, 1, 2, c.b); R(4, 8, 2, 1, c.b);
    R(9, 8, 2, 3, c.B); R(9, 10, 3, 1, c.L);
    if (o.paw) { R(11, 7, 1, 2, c.B); R(11, 6, 1, 1, c.L); }
    head(R, c, 9, o.up ? 1 : 2, { closed: o.closed, wide: o.up });
  }
  function groom(R, c, k) {
    tail(R, c, [[2, 10, 5, 1], [1, 9, 1, 1]]);
    R(3, 7, 3, 3, c.B); R(4, 5, 6, 5, c.B); R(9, 6, 1, 4, c.L);
    R(5, 5, 1, 2, c.b); R(7, 5, 1, 2, c.b);
    R(9, 8, 2, 3, c.B); R(9, 10, 3, 1, c.L);
    head(R, c, 8, 4, { closed: true });
    R(13, k ? 5 : 6, 1, 3, c.B); R(13, k ? 5 : 6, 1, 1, c.L);        // paw raised to the face
  }

  const POSES = {
    stand: (R, c) => stand(R, c, 0),
    walkA: (R, c) => stand(R, c, 1),
    walkB: (R, c) => stand(R, c, 2),
    bat: (R, c) => stand(R, c, 0, true),
    run1: (R, c) => {                                                 // stretched out gallop
      tail(R, c, [[0, 5, 3, 1], [0, 5, 1, 1]]);
      R(1, 8, 3, 1, c.B); R(0, 9, 1, 1, c.L); R(3, 8, 3, 1, c.F);
      R(13, 8, 3, 1, c.B); R(15, 9, 1, 1, c.L); R(10, 8, 3, 1, c.F);
      body(R, c, 3, 5, 9, 3); head(R, c, 12, 4);
    },
    run2: (R, c) => {                                                 // tucked gallop
      tail(R, c, [[2, 5, 1, 1], [1, 3, 1, 3], [2, 2, 1, 1]]);
      R(4, 8, 2, 2, c.F); R(6, 8, 5, 2, c.B); R(6, 9, 5, 1, c.L);
      body(R, c, 3, 5, 9, 3); head(R, c, 12, 4);
    },
    sit: (R, c) => sit(R, c),
    sitClosed: (R, c) => sit(R, c, { closed: true }),
    sitPaw: (R, c) => sit(R, c, { paw: true }),
    watch: (R, c) => sit(R, c, { up: true }),
    groomA: (R, c) => groom(R, c, 0),
    groomB: (R, c) => groom(R, c, 1),
    sleep: (R, c) => {
      R(4, 6, 9, 1, c.B); R(3, 7, 11, 2, c.B); R(4, 9, 9, 1, c.B); R(5, 9, 7, 1, c.L);
      R(5, 6, 1, 1, c.b); R(7, 6, 1, 1, c.b); R(9, 6, 1, 1, c.b); R(11, 6, 1, 1, c.b);
      R(3, 10, 9, 1, c.F); R(3, 10, 1, 1, c.T);
      R(12, 7, 4, 3, c.B); R(12, 6, 1, 1, c.B); R(14, 6, 1, 1, c.B);
      R(14, 8, 1, 1, c.E); R(14, 9, 2, 1, c.L);
    },
    stretch: (R, c) => {
      tail(R, c, [[2, 4, 1, 1], [2, 2, 1, 2], [2, 1, 1, 1]]);
      R(3, 8, 2, 3, c.B); R(5, 8, 2, 2, c.F);
      R(3, 4, 4, 4, c.B); R(7, 5, 4, 3, c.B); R(10, 6, 3, 3, c.B);
      R(4, 4, 1, 2, c.b); R(8, 5, 1, 2, c.b);
      R(11, 9, 5, 1, c.B); R(10, 10, 5, 1, c.F);
      head(R, c, 12, 6, { closed: true });
    },
    pounce: (R, c) => {
      tail(R, c, [[1, 6, 2, 1], [0, 5, 1, 2]]);
      R(3, 9, 2, 2, c.B); R(5, 9, 2, 2, c.F);
      R(3, 5, 4, 4, c.B); R(6, 6, 6, 3, c.B); R(4, 5, 1, 2, c.b); R(8, 6, 1, 2, c.b);
      R(12, 10, 4, 1, c.B); R(15, 10, 1, 1, c.L);
      head(R, c, 11, 6, { wide: true });
    },
    puff: (R, c) => {
      tail(R, c, [[1, 3, 2, 5], [1, 2, 2, 1]]);
      R(4, 8, 2, 3, c.B); R(6, 8, 2, 3, c.F); R(8, 8, 2, 3, c.F); R(10, 8, 2, 3, c.B);
      R(4, 4, 8, 4, c.B); R(4, 7, 8, 1, c.L);
      R(5, 3, 1, 1, c.B); R(7, 3, 1, 1, c.B); R(9, 3, 1, 1, c.B); R(11, 3, 1, 1, c.B);
      R(6, 4, 1, 2, c.b); R(8, 4, 1, 2, c.b); R(10, 4, 1, 2, c.b);
      head(R, c, 12, 5, { mouth: true, wide: true });
    },
    eat: (R, c) => {
      tail(R, c, [[1, 5, 3, 1], [1, 4, 1, 1]]);
      leg(R, c, 6, 8, 3, true); leg(R, c, 8, 8, 3, true); leg(R, c, 4, 8, 3, false); leg(R, c, 10, 8, 3, false);
      body(R, c, 4, 5, 8, 3);
      R(11, 5, 2, 3, c.B);
      head(R, c, 12, 7, { closed: true });
    },
    roll: (R, c) => {
      tail(R, c, [[2, 9, 3, 1], [1, 9, 1, 1]]);
      R(3, 7, 9, 3, c.B); R(4, 7, 7, 2, c.L);
      R(4, 5, 1, 2, c.B); R(6, 5, 1, 2, c.B); R(8, 5, 1, 2, c.F); R(10, 5, 1, 2, c.F);
      R(4, 5, 1, 1, c.L); R(6, 5, 1, 1, c.L); R(8, 5, 1, 1, c.L); R(10, 5, 1, 1, c.L);
      R(11, 7, 4, 3, c.B); R(11, 6, 1, 1, c.B); R(13, 6, 1, 1, c.B);
      R(13, 8, 1, 1, c.E); R(14, 9, 1, 1, c.L);
    },
  };

  function outline(cv, color) {
    const g = cv.getContext('2d');
    const img = g.getImageData(0, 0, cv.width, cv.height);
    const src = new Uint8ClampedArray(img.data);
    const [r, gg, b] = hexRgb(color);
    const at = (x, y) => (x < 0 || y < 0 || x >= cv.width || y >= cv.height ? 0 : src[(y * cv.width + x) * 4 + 3]);
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (at(x, y) === 0 && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) {
          const i = (y * cv.width + x) * 4;
          img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
  }
  function flipH(c) {
    const o = document.createElement('canvas');
    o.width = c.width; o.height = c.height;
    const g = o.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
    return o;
  }
  function buildFrames(c) {
    const out = {};
    for (const [name, fn] of Object.entries(POSES)) {
      const cv = document.createElement('canvas');
      cv.width = FW; cv.height = FH;
      const g = cv.getContext('2d');
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y + 1, w, h); };
      fn(R, c);
      outline(cv, c.O);
      out[name] = { r: cv, l: flipH(cv) };
    }
    return out;
  }

  // ---------- who they are ----------
  const DEFS = [
    {
      id: 'bosch', name: 'BOSCH', trait: 'GREEDY BOSS', color: '#f6c27d', speed: 14, appetite: 1.6, social: 1.0,
      pal: { B: '#f6c27d', b: '#e08f3c', L: '#fdeccb', T: '#e08f3c' },
      w: { sit: 3, wander: 3, zoomies: 0.4, play: 1, fight: 0.6, sleep: 2, groom: 1.2, stretch: 1, eat: 3.5, watch: 0.8, beg: 1.8, follow: 1 },
    },
    {
      id: 'ingca', name: 'INGCA', trait: 'ZOOMIE GOBLIN', color: '#3fc1b5', speed: 26, appetite: 0.9, social: 0.8,
      pal: { B: '#3fc1b5', b: '#2a968d', L: '#a8efe6', T: '#ffffff' },
      w: { sit: 1.2, wander: 3, zoomies: 3, play: 3, fight: 2.5, sleep: 0.9, groom: 0.8, stretch: 1.2, eat: 1.2, watch: 2, beg: 0.6, follow: 1.5 },
    },
    {
      id: 'makita', name: 'MAKITA', trait: 'ALOOF NAPPER', color: '#8d939e', speed: 20, appetite: 0.8, social: 0.4,
      pal: { B: '#8d939e', b: '#6c717c', L: '#c5c9d2', T: '#c5c9d2' },
      w: { sit: 2.5, wander: 1.5, zoomies: 0.3, play: 0.6, fight: 0.8, sleep: 8, groom: 3.5, stretch: 1.5, eat: 1.2, watch: 1, beg: 0.2, follow: 0.3 },
    },
  ];

  // Short, occasional bubbles. Keys are moments; values are what each cat might say.
  const LINES = {
    bosch: {
      beg: ['FEED ME!', 'Snack time?', "I'm starving!"], eat: ['Nom nom!', 'Mine!', 'Yum!'], pet: ['Purr purr', 'More!', 'Right there!'],
      pet2: ['Now feed me!', 'Snacks?'], displace: ['Mine!', 'Move it!'], fight: ['Hiss!', 'My spot!'], win: ['Boss wins!'],
      lose: ['Hmph!'], sleep: ['Food coma...', 'zzz...'], zoom: ['Wheee?'], play: ['Ooh, ball!'], follow: ['Snack?'],
      groom: ['Looking good'], watch: ['Birds?'], stretch: ['Mmm...'], wake: ['Dinner?'], food: ['FOOD!!', 'Is that for me?'], toy: ['Ooh, ball!'],
    },
    ingca: {
      beg: ['Mew?'], eat: ['Munch!'], pet: ['Hehe!', 'Tickles!'], pet2: ['ZOOMIES!'], displace: ['Hey!'], fight: ['Pounce!', 'Gotcha!', 'Hehe!'],
      win: ['Hehe, won!'], lose: ['Oops!'], sleep: ['Five more...'], zoom: ['Zoomies!', 'Wheee!', 'Catch me!'], play: ['Pounce!', 'Ooh shiny!'],
      follow: ['Wait for me!'], groom: ['Quick wash'], watch: ['Ek ek ek!', 'Bird!!'], stretch: ['Yawn!'], wake: ['Play now?'], food: ['Ooh food!'], toy: ['MINE!', 'Ball!!'],
    },
    makita: {
      beg: ['...', 'Mew.'], eat: ['Adequate.'], pet: ['Purr...', 'Hmm.'], pet2: ['Hmph.', 'Enough.'], displace: ['Rude.'], fight: ['Hsss!', 'Not today.'],
      win: ['Hmph.'], lose: ['...rude.'], sleep: ['zzz...', '...'], zoom: ['...why.'], play: ['Fine.'], follow: ['...'],
      groom: ['Ahem.', 'Spotless.'], watch: ['Hm.'], stretch: ['Ah...'], wake: ['Hmph.'], food: ['Hm. Food.'], toy: ['Hm.'],
    },
  };

  // ---------- world state ----------
  const FR = {};
  const cats = [];
  let bowls = [];
  let ball = null;
  let fight = null;
  let fightCdUntil = 0;
  let emotes = [];
  let clockMs = 0;
  let ctx = { desks: [], hour: 12, lamp: 0, claude: null, wand: null };
  let regenAt = 0;

  function blocked(x, y) {
    if (x < 9 || x > W - 9 || y < FLOOR_MIN || y > H - 3) return true;
    for (const d of ctx.desks) if (x > d.x - 4 && x < d.x + 36 && y > d.y - 6 && y < d.y + 27) return true;
    return false;
  }
  function randomFloorPoint() {
    for (let i = 0; i < 30; i++) {
      const p = { x: rnd(14, W - 14), y: rnd(FLOOR_MIN + 3, H - 6) };
      if (!blocked(p.x, p.y)) return p;
    }
    return { x: W / 2, y: H - 20 };
  }
  function nearestFree(x, y) {
    if (!blocked(x, y)) return { x, y };
    for (let r = 4; r <= 60; r += 4) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const p = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
        if (!blocked(p.x, p.y)) return p;
      }
    }
    return randomFloorPoint();
  }

  function makeCat(def, i) {
    const p = randomFloorPoint();
    return {
      def, id: def.id, name: def.name, x: p.x, y: p.y, dir: i % 2 ? 1 : -1,
      state: 'sit', phase: '', t: 0, dur: rnd(1 + i * 1.5, 4 + i * 2), goal: null, moving: false, running: false,
      energy: rnd(0.5, 0.9), hunger: rnd(0.15, 0.45), love: rnd(0.5, 0.8),
      forced: false, hidden: false, fobj: null, lock: null, reservedUntil: 0,
      bubble: null, lastSay: -1e9, lastPet: -1e9, petTimes: [], hop: 0, nextZ: 0, batAt: 0, batUntil: 0,
      bowl: null, eatAcc: 0, comeAt: 0, toyAt: 0, variant: '', stuck: 0,
    };
  }

  function init(o) {
    wg = o.wg; W = o.W; H = o.H; mainDesk = o.mainDesk; windowsPos = o.windows || windowsPos;
    ctx.desks = [mainDesk];
    DEFS.forEach((d, i) => {
      const c = Object.assign({ F: shade(d.pal.B, 0.78), O: shade(d.pal.B, 0.3), N: '#f08a96', E: '#1d1d2b' }, d.pal);
      FR[d.id] = buildFrames(c);
      cats.push(makeCat(d, i));
    });
    bowls = [{ x: 36, y: 66, servings: 2, home: true, eater: null, born: 0 }];
  }

  // ---------- bubbles, emotes ----------
  function speak(c, key, p) {
    const lines = LINES[c.id][key];
    if (!lines) return;
    if (p != null && p < 1 && Math.random() > p) return;
    if (p !== 1) {
      if (clockMs - c.lastSay < 5500) return;
      if (cats.filter((o) => o.bubble && clockMs < o.bubble.until).length >= 2) return;
    }
    c.bubble = { text: pick(lines), at: clockMs, until: clockMs + 2600 };
    c.lastSay = clockMs;
  }
  function emote(kind, x, y) { emotes.push({ kind, x, y, t: 0, life: 1.4 }); }

  const EMOTE_PX = {
    heart: { c: '#ff5d8f', rows: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'] },
    z: { c: '#8fb4ff', rows: ['XXXX', '..X.', '.X..', 'XXXX'] },
    anger: { c: '#e5484d', rows: ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X'] },
    star: { c: '#ffd45a', rows: ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'] },
    spark: { c: '#7fe7ff', rows: ['..X..', '..X..', 'XXXXX', '..X..', '..X..'] },
  };

  // ---------- movement ----------
  function goTo(c, x, y, speed, then, fail) {
    c.goal = { x, y, speed: speed || c.def.speed, then, fail };
  }
  function face(c, x) { if (Math.abs(x - c.x) > 1) c.dir = x > c.x ? 1 : -1; }
  function setState(c, s, dur, forced) {
    if (c.state !== s) c.last = c.state;
    c.state = s; c.phase = ''; c.t = 0; c.dur = dur == null ? 0 : dur; c.forced = !!forced; c.goal = null; c.variant = '';
  }

  function giveUp(c, g) {
    c.goal = null; c.stuck = 0;
    if (g.fail) g.fail(c); else setState(c, 'sit', 2);
  }

  // Walk toward the goal; if something is in the way, veer around it (to the side we last veered).
  function moveCat(c, dt) {
    const g = c.goal;
    const dx = g.x - c.x, dy = g.y - c.y;
    const dist = Math.hypot(dx, dy);
    const step = g.speed * dt;
    if (dist <= Math.max(step, 0.8)) {
      c.x = g.x; c.y = g.y; c.goal = null; c.stuck = 0;
      if (g.then) g.then(c);
      return;
    }
    // watchdog: no real progress toward the goal for a while -> give up on it
    if (g.best == null || dist < g.best - 0.5) { g.best = dist; g.since = 0; } else g.since = (g.since || 0) + dt;
    if (g.since > 2.5) { giveUp(c, g); return; }
    const base = Math.atan2(dy, dx);
    const s = c.veer || (Math.random() < 0.5 ? 1 : -1);
    let next = null;
    for (const off of [0, 0.6 * s, -0.6 * s, 1.2 * s, -1.2 * s, 1.9 * s, -1.9 * s]) {
      const nx = c.x + Math.cos(base + off) * step, ny = c.y + Math.sin(base + off) * step;
      if (!blocked(nx, ny)) { next = [nx, ny]; c.veer = off === 0 ? 0 : Math.sign(off); break; }
    }
    if (!next) {
      c.stuck += dt;
      if (c.stuck > 0.5) giveUp(c, g);
      return;
    }
    c.stuck = 0;
    if (Math.abs(next[0] - c.x) > 0.01) c.dir = next[0] > c.x ? 1 : -1;
    c.x = next[0]; c.y = next[1]; c.moving = true; c.running = g.speed > c.def.speed * 1.6;
  }

  // ---------- helpers for choosing things to do ----------
  function usableBowl(c) {
    let best = null, bd = 1e9;
    for (const b of bowls) {
      if (b.servings <= 0) continue;
      const d = Math.hypot(b.x - c.x, b.y - c.y) + (b.eater && b.eater !== c ? 40 : 0);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function feedPos(b, c) {
    const side = c.x < b.x ? -1 : 1;
    return { x: b.x + side * 7, y: b.y, dir: -side };
  }
  function sunSpot() {
    const h = ctx.hour;
    if (h < 8 || h > 16) return null;
    const w = windowsPos[0];
    return { x: w.x + 12 + (h - 12) * 5 + 8, y: 62 };
  }
  function lampSpot() { return { x: mainDesk.x + 22, y: mainDesk.y + 33 }; }
  function sleepSpot(c) {
    const cand = [];
    if (c.id === 'makita') {
      if (ctx.lamp > 0.4) cand.push(lampSpot());
      const s = sunSpot(); if (s) cand.push(s);
    }
    if (c.id === 'bosch') cand.push({ x: bowls[0].x + 14, y: bowls[0].y + 12 });
    const corners = [{ x: 22, y: 150 }, { x: 218, y: 150 }, { x: 120, y: 163 }, { x: 214, y: 56 }, { x: 94, y: 56 }, { x: 24, y: 100 }, { x: 214, y: 110 }];
    while (corners.length) cand.push(corners.splice(Math.floor(Math.random() * corners.length), 1)[0]);
    for (const p of cand) {
      if (blocked(p.x, p.y)) continue;
      if (cats.some((o) => o !== c && o.state === 'sleep' && Math.hypot(o.x - p.x, o.y - p.y) < 20)) continue;
      return p;
    }
    return randomFloorPoint();
  }
  function wanderTarget(c) {
    if (Math.random() < 0.4) {
      if (c.id === 'bosch') return nearestFree(mainDesk.x + rnd(0, 30), mainDesk.y + 32);
      if (c.id === 'makita') { const s = sunSpot() || lampSpot(); return nearestFree(s.x + rnd(-8, 8), s.y + rnd(-4, 4)); }
    }
    return randomFloorPoint();
  }
  const loudBusy = (c) => cats.some((o) => o !== c && (o.state === 'zoomies' || o.state === 'fight'));
  function fightPartner(c) {
    const opts = cats.filter((o) => o !== c && !o.fobj && !o.lock && !o.forced && !o.hidden && o.state !== 'eat' && o.state !== 'fight' && clockMs >= o.reservedUntil);
    return opts.length ? pick(opts) : null;
  }

  function weights(c) {
    const d = c.def, h = ctx.hour;
    const w = Object.assign({}, d.w);
    const deepNight = h >= 0 && h < 5.5, night = h >= 21 || h < 6;
    w.sleep *= 0.3 + (1 - c.energy) * 2.4 * (deepNight ? 2.5 : night ? 1.6 : 1);
    if (c.energy > 0.75) { w.zoomies *= 1.6; w.play *= 1.5; }
    if (c.energy < 0.3) { w.zoomies *= 0.2; w.play *= 0.3; w.fight *= 0.3; }
    if (c.id === 'ingca' && (h >= 21 || h < 2)) w.zoomies *= 2.5;
    w.eat = usableBowl(c) ? w.eat * (0.3 + c.hunger * 4) : 0;
    w.beg *= 0.5 + c.hunger * 2 + (1 - c.love) * 1.5;
    w.follow = ctx.claude && ctx.claude.moving ? w.follow * (1 + (1 - c.love) * 2) : 0;
    if (night) w.watch *= 0.2;
    if (ball) w.play *= 4;
    if (c.last && w[c.last]) w[c.last] *= 0.35;                  // don't repeat what it just did
    for (const s of EXCL) if (cats.some((o) => o !== c && o.state === s && !o.forced)) w[s] = 0;
    if (loudBusy(c)) { w.zoomies = 0; w.fight = 0; }
    if (clockMs < fightCdUntil || fight || !fightPartner(c)) w.fight = 0;
    return w;
  }

  function think(c) {
    if (c.lock || clockMs < c.reservedUntil) { setState(c, 'sit', 1); return; }
    const w = weights(c);
    const entries = Object.entries(w).filter(([, v]) => v > 0);
    let total = entries.reduce((s, [, v]) => s + v, 0);
    let r = Math.random() * total, s = 'sit';
    for (const [k, v] of entries) { r -= v; if (r <= 0) { s = k; break; } }
    enter(c, s);
  }

  function enter(c, s) {
    switch (s) {
      case 'sit': setState(c, 'sit', rnd(3, 8)); break;
      case 'wander': {
        setState(c, 'wander', 12);
        const p = wanderTarget(c);
        goTo(c, p.x, p.y, c.def.speed, (cc) => setState(cc, 'sit', rnd(2, 5)), (cc) => setState(cc, 'sit', 2));
        break;
      }
      case 'zoomies': setState(c, 'zoomies', rnd(4, 6)); speak(c, 'zoom', 0.9); break;
      case 'play': setState(c, 'play', rnd(8, 12)); c.sub = ball ? 'ball' : 'stalk'; c.prey = null; speak(c, 'play', 0.6); break;
      case 'sleep': {
        setState(c, 'sleep', c.id === 'makita' ? rnd(25, 55) : rnd(15, 40)); c.phase = 'go';
        const p = sleepSpot(c);
        const curl = (cc) => { cc.phase = 'curl'; cc.t = 0; speak(cc, 'sleep', 0.5); };
        goTo(c, p.x, p.y, c.def.speed, curl, curl);
        break;
      }
      case 'groom': setState(c, 'groom', rnd(4, 8)); speak(c, 'groom', 0.4); break;
      case 'stretch': setState(c, 'stretch', 2.2); speak(c, 'stretch', 0.4); break;
      case 'eat': {
        const b = usableBowl(c);
        if (!b) { setState(c, 'sit', 2); break; }
        startEat(c, b, false);
        break;
      }
      case 'watch': {
        setState(c, 'watch', rnd(6, 11)); c.phase = 'go';
        const w = pick(windowsPos);
        const look = (cc) => { cc.phase = 'look'; cc.t = 0; cc.dir = w.x + 12 > cc.x ? 1 : -1; speak(cc, 'watch', 0.7); };
        goTo(c, w.x + 12 + rnd(-8, 8), 52, c.def.speed, look, look);
        break;
      }
      case 'beg': {
        setState(c, 'beg', rnd(7, 12)); c.phase = 'go';
        const here = (cc) => { cc.phase = 'sit'; cc.t = 0; cc.dir = 1; speak(cc, 'beg', 1); cc.nextBeg = clockMs + 4200; };
        const p = nearestFree(mainDesk.x + rnd(4, 28), mainDesk.y + 32);
        goTo(c, p.x, p.y, c.def.speed, here, here);
        break;
      }
      case 'follow': setState(c, 'follow', rnd(6, 10)); speak(c, 'follow', 0.5); break;
      case 'fight': {
        const p = fightPartner(c);
        if (!p) { setState(c, 'sit', 2); break; }
        startFight(c, p);
        break;
      }
      default: setState(c, 'sit', 3);
    }
  }

  function startEat(c, b, forced) {
    setState(c, 'eat', 26, forced); c.phase = 'go'; c.bowl = b;
    const fp = feedPos(b, c);
    const arrive = (cc) => { cc.dir = fp.dir; cc.phase = 'arrive'; cc.t = 0; };
    goTo(c, fp.x, fp.y, c.def.speed * (forced ? 1.6 : 1), arrive, arrive);
  }

  // ---------- state handlers ----------
  // Enter a state directly, but respect "only one cat does this at a time".
  const taken = (c, s) => EXCL.has(s) && cats.some((o) => o !== c && o.state === s && !o.forced);
  function enterFree(c, s) { if (taken(c, s)) setState(c, 'sit', rnd(1.5, 3)); else enter(c, s); }
  function afterActivity(c) {
    if (Math.random() < 0.3) enterFree(c, 'groom'); else setState(c, 'sit', rnd(1.5, 3));
  }
  function batBall(c) {
    if (!ball) return;
    ball.vx = c.dir * rnd(40, 95) + rnd(-20, 20); ball.vy = rnd(-45, 45); ball.vz = rnd(35, 75);
    c.batUntil = clockMs + 260; emote('spark', ball.x, ball.y - 8);
  }

  const STATES = {
    sit(c) { if (c.t > c.dur) think(c); },
    wander(c) { if (c.t > c.dur) think(c); },
    zoomies(c) {
      if (c.t > c.dur) { setState(c, 'sit', 2.5); return; }
      if (!c.goal) { const p = randomFloorPoint(); goTo(c, p.x, p.y, c.def.speed * 2.3); }
    },
    play(c, dt) {
      if (c.t > c.dur) { setState(c, 'sit', 2); return; }
      if (ball) {
        c.sub = 'ball';
        const d = Math.hypot(ball.x - c.x, ball.y - c.y);
        face(c, ball.x);
        if (d < 7 && ball.z < 7) {
          c.goal = null;
          if (clockMs > c.batAt) { batBall(c); c.batAt = clockMs + 650; c.love = clamp(c.love + 0.02, 0, 1); }
        } else goTo(c, ball.x, ball.y, c.def.speed * 2.0);
        return;
      }
      if (c.sub === 'ball') { c.sub = 'stalk'; c.prey = null; }
      // stalk and pounce on an imaginary mouse
      if (!c.prey) {
        c.prey = randomFloorPoint(); c.preyN = c.preyN == null || c.preyN <= 0 ? 2 + Math.floor(rnd(0, 2)) : c.preyN;
        c.phase = 'go';
      }
      const pr = c.prey;
      if (c.phase === 'go') {
        if (!c.goal) {
          const away = c.x < pr.x ? -1 : 1;
          const ap = nearestFree(pr.x + away * 16, pr.y);
          if (Math.hypot(ap.x - c.x, ap.y - c.y) < 3) { c.phase = 'crouch'; c.pt = 0; face(c, pr.x); }
          else goTo(c, ap.x, ap.y, c.def.speed * 0.7, (cc) => { cc.phase = 'crouch'; cc.pt = 0; face(cc, pr.x); });
        }
      } else if (c.phase === 'crouch') {
        c.pt += dt;
        if (c.pt > 0.7) { c.phase = 'leap'; goTo(c, pr.x, pr.y, c.def.speed * 4.2, (cc) => { cc.phase = 'bat'; cc.pt = 0; cc.batUntil = clockMs + 450; emote('spark', cc.x + cc.dir * 8, cc.y - 8); speak(cc, 'play', 0.4); }); }
      } else if (c.phase === 'bat') {
        c.pt += dt;
        if (c.pt > 0.55) { c.prey = null; c.preyN--; if (c.preyN <= 0) { setState(c, 'sit', 2); } }
      }
    },
    sleep(c) {
      if (c.phase === 'go') return;
      if (clockMs > c.nextZ) { emote('z', c.x + c.dir * 5, c.y - 14); c.nextZ = clockMs + 2600; }
      if (c.t > c.dur || (c.energy > 0.97 && c.t > 8)) {
        speak(c, 'wake', 0.3);
        if (Math.random() < 0.45) enterFree(c, 'stretch'); else setState(c, 'sit', rnd(2, 4));
      }
    },
    groom(c) { if (c.t > c.dur) afterActivity(c); },
    stretch(c) { if (c.t > c.dur) setState(c, 'sit', rnd(2, 4)); },
    eat(c, dt) {
      const b = c.bowl;
      if (!b || !bowls.includes(b)) { setState(c, 'sit', 2); return; }
      if (c.phase === 'go') return;
      if (c.phase === 'arrive') {
        const e = b.eater;
        if (e && e !== c && e.state === 'eat' && e.phase === 'eat') {
          if (c.id === 'bosch' && !e.lock) {                       // the boss takes the bowl
            speak(c, 'displace', 1); speak(e, 'displace', 1);
            e.bowl = null; setState(e, 'sit', 3); e.forced = false; b.eater = c; c.phase = 'eat'; c.t = 0; c.eatAcc = 0;
          } else { c.phase = 'wait'; c.t = 0; }
        } else { b.eater = c; c.phase = 'eat'; c.t = 0; c.eatAcc = 0; speak(c, 'eat', 0.7); }
        return;
      }
      if (c.phase === 'wait') {
        if (!b.eater || b.eater.state !== 'eat') c.phase = 'arrive';
        else if (c.t > 9) setState(c, 'sit', 2);
        return;
      }
      c.eatAcc += dt;
      if (c.eatAcc > 2.7) { c.eatAcc = 0; b.servings = Math.max(0, b.servings - 1); }
      if (b.servings <= 0 || (c.hunger < 0.12 && c.t > 4.5) || c.t > c.dur) {
        if (b.eater === c) b.eater = null;
        c.bowl = null; speak(c, 'eat', 0.3); afterActivity(c);
      }
    },
    watch(c) { if (c.phase === 'look' && c.t > c.dur) setState(c, 'sit', 2); else if (c.t > c.dur + 8) setState(c, 'sit', 2); },
    beg(c) {
      if (c.phase === 'go') { if (c.t > 14) setState(c, 'sit', 2); return; }
      if (clockMs > (c.nextBeg || 0)) { speak(c, 'beg', 0.6); c.nextBeg = clockMs + 4200; }
      if (c.t > c.dur && !c.forced) think(c); else if (c.t > c.dur + 6) setState(c, 'sit', 2);
    },
    follow(c, dt) {
      const cl = ctx.claude;
      if (!cl || c.t > c.dur) { setState(c, 'sit', 2); return; }
      c.fAcc = (c.fAcc || 0) + dt;
      if (!c.goal || c.fAcc > 0.5) {
        c.fAcc = 0;
        const tx = cl.x + 6 + (c.x < cl.x + 6 ? -15 : 15), ty = clamp(cl.y + 15, FLOOR_MIN + 2, H - 5);
        const p = nearestFree(tx, ty);
        goTo(c, p.x, p.y, c.def.speed * 1.2);
      }
    },
    fight() {},
    roll(c) {
      if (clockMs > c.nextZ) { emote('heart', c.x + rnd(-4, 4), c.y - 12); c.nextZ = clockMs + 1100; }
      if (c.t > c.dur) setState(c, 'sit', 2);
    },
    pet(c, dt) {
      if (clockMs > c.nextZ) { emote('heart', c.x + rnd(-4, 4), c.y - 12); c.nextZ = clockMs + 1100; if (c.variant === 'hop') c.hop = 0.5; }
      if (c.lock) {                                               // being petted by Claude
        c.love = clamp(c.love + 0.05 * dt, 0, 1);
        if (c.id === 'makita' && c.t > 6) { releaseLock(c); speak(c, 'pet2', 1); emote('anger', c.x, c.y - 14); leaveSulking(c); }
        else if (c.id === 'ingca' && c.t > 6) { releaseLock(c); if (!loudBusy(c)) { setState(c, 'zoomies', rnd(3, 5), true); speak(c, 'pet2', 1); } else setState(c, 'sit', 2); }
        return;
      }
      if (c.t > c.dur) setState(c, 'sit', 2);
    },
    wandplay(c) {
      const w = ctx.wand;
      if (!w || c.t > c.dur) { releaseLock(c); setState(c, 'sit', 2.5); return; }
      const d = Math.hypot(w.x - c.x, w.y - c.y);
      face(c, w.x);
      if (d > 7) goTo(c, w.x, w.y, c.def.speed * 2.2);
      else {
        c.goal = null;
        if (clockMs > c.batAt) { c.batAt = clockMs + 900; c.batUntil = clockMs + 350; emote('spark', c.x + c.dir * 7, c.y - 10); speak(c, 'play', 0.5); c.love = clamp(c.love + 0.03, 0, 1); }
      }
    },
  };

  function leaveSulking(c) {
    setState(c, 'wander', 10, true);
    const p = nearestFree(c.x < W / 2 ? rnd(W / 2, W - 20) : rnd(20, W / 2), rnd(FLOOR_MIN + 8, H - 12));
    goTo(c, p.x, p.y, c.def.speed, (cc) => { cc.forced = false; setState(cc, 'sit', rnd(3, 6)); }, (cc) => setState(cc, 'sit', 3));
  }
  function releaseLock(c) { c.lock = null; c.reservedUntil = 0; c.forced = false; }

  // ---------- play-fight ----------
  function startFight(a, b) {
    fight = { a, b, phase: 'approach', t: 0, gt: 0 };
    setState(a, 'fight', 0, true); a.fobj = fight;
    setState(b, 'fight', 0, true); b.fobj = fight;
    speak(a, 'fight', 1);
  }
  function updateFight(dt) {
    const f = fight;
    if (!f) return;
    f.t += dt;
    const a = f.a, b = f.b;
    if (f.phase === 'approach') {
      face(b, a.x); face(a, b.x);
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.hypot(dx * 0.6, dy) < 11 || f.t > 8) {
        f.phase = 'puff'; f.t = 0; a.goal = null; b.goal = null; speak(b, 'fight', 1);
      } else if (!a.goal || f.t - f.gt > 0.3) {
        f.gt = f.t;
        const p = nearestFree(b.x - Math.sign(dx || 1) * 9, b.y);
        goTo(a, p.x, p.y, a.def.speed * 2, null, (cc) => { f.t = 99; });
      }
    } else if (f.phase === 'puff') {
      face(b, a.x); face(a, b.x);
      if (f.t > 0.9) {
        f.phase = 'brawl'; f.t = 0; f.mx = (a.x + b.x) / 2; f.my = (a.y + b.y) / 2; a.hidden = true; b.hidden = true;
        const wa = { bosch: 1.2, ingca: 1, makita: 1.1 };
        f.winner = Math.random() * (wa[a.id] + wa[b.id]) < wa[a.id] ? a : b;
        f.loser = f.winner === a ? b : a;
      }
    } else if (f.phase === 'brawl') {
      f.sp = (f.sp || 0) + dt;
      if (f.sp > 0.35) { f.sp = 0; emote(pick(['star', 'anger', 'star']), f.mx + rnd(-7, 7), f.my - 11); }
      if (f.t > 2.2) {
        f.phase = 'break'; f.t = 0; a.hidden = false; b.hidden = false;
        a.x = clamp(f.mx - 10, 12, W - 12); b.x = clamp(f.mx + 10, 12, W - 12); a.y = b.y = f.my;
        a.dir = 1; b.dir = -1;
        speak(f.winner, 'win', 1); speak(f.loser, 'lose', 1);
        const away = nearestFree(f.loser.x < W / 2 ? W - 24 : 24, clamp(f.loser.y + rnd(-30, 30), FLOOR_MIN + 4, H - 8));
        goTo(f.loser, away.x, away.y, f.loser.def.speed * 2.4);
      }
    } else if (f.phase === 'break') {
      if (f.t > 1.6) {
        a.fobj = null; b.fobj = null; fight = null; fightCdUntil = clockMs + rnd(50000, 100000);
        f.winner.forced = false; f.loser.forced = false;
        setState(f.loser, 'sit', 3);
        if (taken(f.winner, 'groom')) setState(f.winner, 'sit', 3); else setState(f.winner, 'groom', 4);
      }
    }
  }

  // ---------- props ----------
  function updateBall(dt) {
    if (!ball) return;
    const b = ball;
    b.vz -= 230 * dt; b.z += b.vz * dt;
    if (b.z < 0) { b.z = 0; b.vz = -b.vz * 0.55; if (Math.abs(b.vz) < 14) b.vz = 0; }
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    if (blocked(nx, b.y)) b.vx *= -0.6; else b.x = nx;
    if (blocked(b.x, ny)) b.vy *= -0.6; else b.y = ny;
    if (b.z === 0) { const f = Math.max(0, 1 - 2.4 * dt); b.vx *= f; b.vy *= f; }
    if (clockMs - b.born > 70000) ball = null;
  }
  function updateBowls(dt) {
    if (clockMs > regenAt) { regenAt = clockMs + 45000; const h = bowls[0]; if (h && h.servings < 3) h.servings++; }
    bowls = bowls.filter((b) => {
      if (b.home) return true;
      if (b.servings <= 0 && !b.eater) { b.empty = (b.empty || 0) + dt; if (b.empty > 6) return false; }
      return clockMs - b.born < 150000;
    });
  }
  function updateEmotes(dt) {
    emotes.forEach((e) => { e.t += dt; e.y -= 7 * dt; });
    emotes = emotes.filter((e) => e.t < e.life);
  }

  // ---------- per-cat update ----------
  function updateCat(c, dt) {
    c.moving = false;
    const d = c.def;
    const sleeping = c.state === 'sleep' && c.phase === 'curl';
    c.energy = clamp(c.energy + (sleeping ? 0.03 : c.state === 'zoomies' ? -0.02 : -0.004) * dt, 0, 1);
    c.hunger = clamp(c.hunger + (c.state === 'eat' && c.phase === 'eat' ? -0.12 : 0.006 * d.appetite) * dt, 0, 1);
    c.love = clamp(c.love - 0.003 * d.social * dt, 0, 1);
    if (c.bubble && clockMs > c.bubble.until) c.bubble = null;
    if (c.hop > 0) c.hop -= dt;
    if (!c.hidden && blocked(c.x, c.y)) { const p = nearestFree(c.x, c.y); c.x = p.x; c.y = p.y; }
    if (c.comeAt && clockMs >= c.comeAt) {
      c.comeAt = 0;
      const b = usableBowl(c);
      if (b && !c.fobj && !c.lock && c.state !== 'fight') startEat(c, b, true);
    }
    if (c.toyAt && clockMs >= c.toyAt) {
      c.toyAt = 0;
      if (ball && !c.fobj && !c.lock && c.state !== 'fight' && c.state !== 'eat') {
        setState(c, 'play', rnd(9, 13), true); c.sub = 'ball'; speak(c, 'toy', 0.8);
      }
    }
    c.t += dt;
    if (c.goal) moveCat(c, dt);
    const fn = STATES[c.state];
    if (fn) fn(c, dt);
  }

  function step(dt) {
    clockMs += dt * 1000;
    updateBall(dt); updateBowls(dt); updateFight(dt); updateEmotes(dt);
    for (const c of cats) updateCat(c, dt);
  }

  function update(dt, now, context) {
    ctx = context;
    let rem = Math.min(dt, 0.6);
    while (rem > 0) { const s = Math.min(rem, 0.1); step(s); rem -= s; }
  }

  // ---------- interactions ----------
  function pet(c, who) {
    if (!c || c.hidden || c.fobj || clockMs - c.lastPet < 450) return false;
    c.lastPet = clockMs;
    c.petTimes = c.petTimes.filter((t) => clockMs - t < 9000);
    c.petTimes.push(clockMs);
    const n = c.petTimes.length;
    c.love = clamp(c.love + 0.22, 0, 1);
    c.reservedUntil = 0; c.lock = null; c.bowl = null;
    emote('heart', c.x + rnd(-4, 4), c.y - 12);
    if (c.id === 'bosch') {
      if (n >= 3) { speak(c, 'pet2', 1); setState(c, 'beg', 9, true); c.phase = 'sit'; c.nextBeg = clockMs + 3500; }
      else { setState(c, 'roll', 3.2, true); c.nextZ = clockMs + 900; speak(c, 'pet', 0.8); }
    } else if (c.id === 'ingca') {
      c.hop = 0.6;
      if (n >= 3 && !loudBusy(c)) { speak(c, 'pet2', 1); setState(c, 'zoomies', rnd(3.5, 5), true); }
      else { setState(c, 'pet', 1.6, true); c.variant = 'hop'; c.nextZ = clockMs + 700; speak(c, 'pet', 0.8); }
    } else {
      if (c.state === 'sleep' && c.phase === 'curl') { speak(c, 'pet2', 1); emote('anger', c.x, c.y - 14); setState(c, 'sit', 3, true); }
      else if (n >= 2) { speak(c, 'pet2', 1); emote('anger', c.x, c.y - 14); leaveSulking(c); }
      else { setState(c, 'pet', 3.4, true); c.variant = 'closed'; c.nextZ = clockMs + 900; speak(c, 'pet', 0.9); }
    }
    return true;
  }

  function hitTest(x, y) {
    let best = null, bd = 1e9;
    for (const c of cats) {
      if (c.hidden) continue;
      const d = Math.hypot((x - c.x) * 0.8, y - (c.y - 6));
      if (d < 10 && d < bd) { best = c; bd = d; }
    }
    return best;
  }

  function dropFood(x, y, who) {
    const p = nearestFree(clamp(x, 14, W - 14), clamp(y, FLOOR_MIN + 4, H - 6));
    bowls = bowls.filter((b) => b.home);
    const b = { x: p.x, y: p.y, servings: 3, home: false, eater: null, born: clockMs };
    bowls.push(b);
    cats.slice().sort((a, c) => c.hunger * c.def.appetite - a.hunger * a.def.appetite).forEach((c, i) => {
      if (c.fobj || c.lock || c.state === 'fight') return;
      const base = { bosch: 1, ingca: 0.55, makita: 0.45 }[c.id];
      if (Math.random() < base + c.hunger * 0.3) { c.comeAt = clockMs + 400 + i * 800; speak(c, 'food', c.id === 'bosch' ? 1 : 0.6); }
    });
    return b;
  }

  function tossToy(x, y) {
    const p = nearestFree(clamp(x, 14, W - 14), clamp(y, FLOOR_MIN + 4, H - 6));
    ball = { x: p.x, y: p.y, z: 16, vx: rnd(-30, 30), vy: rnd(-12, 12), vz: 60, born: clockMs };
    cats.forEach((c) => {
      const pr = { bosch: 0.45, ingca: 0.95, makita: 0.3 }[c.id];
      if (Math.random() < pr) c.toyAt = clockMs + rnd(200, 1100);
    });
  }

  // --- for Claude (the pixel character) ---
  function sideSpot(cat, gap) {
    const side = cat.x > W / 2 ? -1 : 1;                           // which side of the cat Claude stands on
    const x = side === -1 ? cat.x - gap : cat.x + gap - 10;
    return { x: clamp(x, 4, W - 16), y: cat.y - 15, face: side === -1 ? 1 : -1 };
  }
  function freeCats() {
    return cats.filter((c) => !c.hidden && !c.fobj && !c.lock && c.state !== 'fight' && c.state !== 'eat' && clockMs >= c.reservedUntil);
  }
  function planClaude(kind) {
    const free = freeCats();
    if (kind === 'petcat') {
      if (!free.length) return null;
      const cat = free.slice().sort((a, b) => a.love - b.love)[0];
      return { cat, spot: sideSpot(cat, 18) };
    }
    if (kind === 'playcat') {
      const pool = free.filter((c) => c.energy > 0.3);
      if (!pool.length) return null;
      const cat = pool.slice().sort((a, b) => b.energy - a.energy)[0];
      return { cat, spot: sideSpot(cat, 40) };
    }
    if (kind === 'feedcat') {
      if (bowls.some((b) => !b.home && b.servings > 0)) return null;
      if (!cats.some((c) => c.hunger > 0.4) && Math.random() > 0.3) return null;
      const p = nearestFree(rnd(110, 170), rnd(108, 132));
      return { cat: null, spot: { x: p.x - 6, y: p.y - 15, face: 1 }, bowl: { x: p.x + 14, y: p.y } };
    }
    return null;
  }
  function reserve(cat, ms) {
    if (!cat) return;
    cat.reservedUntil = clockMs + ms;
    if (cat.state !== 'sit') setState(cat, 'sit', 1, true);
    cat.goal = null;
  }
  function claudeBegin(kind, cat) {
    if (!cat) return;
    cat.reservedUntil = 0;
    if (kind === 'petcat') {
      setState(cat, 'pet', 14, true); cat.lock = { by: 'claude', kind }; cat.nextZ = clockMs + 700;
      cat.variant = cat.id === 'bosch' ? 'roll' : cat.id === 'ingca' ? 'hop' : 'closed';
      cat.love = clamp(cat.love + 0.1, 0, 1); speak(cat, 'pet', 0.9);
    } else if (kind === 'playcat') {
      setState(cat, 'wandplay', 15, true); cat.lock = { by: 'claude', kind }; speak(cat, 'play', 0.8);
    }
  }
  function claudeEnd(cat) {
    if (!cat) return;
    cat.reservedUntil = 0;
    if (cat.lock) { cat.lock = null; if (cat.state === 'pet' || cat.state === 'wandplay') setState(cat, 'sit', 2.5); }
    else if (cat.state === 'sit' && cat.forced) { cat.forced = false; }
  }
  const claudeBusy = (cat) => !!(cat && cat.lock && (cat.state === 'pet' || cat.state === 'wandplay'));
  function wants() {                                              // what the cats would like from Claude right now
    const out = [];
    cats.forEach((c) => {
      if (c.hunger > 0.65) out.push({ cat: c, kind: 'feedcat' });
      if (c.state === 'beg') out.push({ cat: c, kind: c.hunger > 0.45 ? 'feedcat' : 'petcat' });
      else if (c.love < 0.35) out.push({ cat: c, kind: 'petcat' });
      if (c.id === 'ingca' && c.energy > 0.8) out.push({ cat: c, kind: 'playcat' });
    });
    return out;
  }

  // ---------- drawing ----------
  function px(x, y, w, h, col) { wg.fillStyle = col; wg.fillRect(Math.round(x), Math.round(y), w, h); }
  function disc(cx, cy, r, col) {
    wg.fillStyle = col;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y + 0.5));
      wg.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  }

  function frameName(c, now) {
    const f = fight;
    if (c.state === 'fight' && f) {
      if (f.phase === 'puff') return 'puff';
      if (f.phase === 'break') return c === f.winner && f.t < 0.7 ? 'puff' : c.moving ? 'run1' : 'sit';
      if (c.moving) return Math.floor(now / 110) % 2 ? 'run1' : 'run2';
      return 'stand';
    }
    if (c.moving) {
      if (c.running) return Math.floor(now / 110) % 2 ? 'run1' : 'run2';
      return Math.floor(now / 150) % 2 ? 'walkA' : 'walkB';
    }
    if (clockMs < c.batUntil) return 'bat';
    switch (c.state) {
      case 'sleep': return c.phase === 'curl' ? 'sleep' : 'stand';
      case 'groom': return Math.floor(now / 260) % 2 ? 'groomA' : 'groomB';
      case 'stretch': return 'stretch';
      case 'eat': return c.phase === 'eat' ? 'eat' : 'stand';
      case 'watch': return c.phase === 'look' ? 'watch' : 'stand';
      case 'beg': return c.phase === 'sit' ? 'sitPaw' : 'stand';
      case 'roll': return 'roll';
      case 'pet': return c.variant === 'roll' ? 'roll' : c.variant === 'closed' ? 'sitClosed' : 'sit';
      case 'play': return c.phase === 'crouch' ? 'pounce' : c.phase === 'bat' ? 'bat' : 'stand';
      case 'wandplay': return 'pounce';
      case 'zoomies': return 'stand';
      case 'wander': return 'stand';
      default: return 'sit';
    }
  }

  function drawBowl(b) {
    const x = Math.round(b.x), y = Math.round(b.y);
    px(x - 5, y, 10, 1, 'rgba(0,0,0,0.16)');
    px(x - 4, y - 4, 8, 1, '#f2f2f2');
    px(x - 3, y - 3, 6, 2, '#d9669a');
    px(x - 2, y - 1, 4, 1, '#8f3a63');
    for (let i = 0; i < b.servings; i++) px(x - 3 + i * 2, y - 5, 2, 1, '#b5651d');
  }
  function drawBall() {
    if (!ball) return;
    px(ball.x - 2, ball.y, 5, 1, 'rgba(0,0,0,0.2)');
    const y = ball.y - 3 - ball.z;
    disc(ball.x, y, 2, '#e5484d');
    px(ball.x - 1, y - 1, 1, 1, '#ffb3b8');
  }
  function drawCloud(f, now) {
    const t = now / 1000;
    const mx = f.mx, my = f.my - 6;
    for (let i = 0; i < 7; i++) {
      const a = t * 9 + i * 0.9, r = 4 + 1.5 * Math.sin(t * 13 + i);
      disc(mx + Math.cos(a) * 6, my + Math.sin(a) * 4, Math.round(r + 1), '#8b8b95');
    }
    for (let i = 0; i < 7; i++) {
      const a = t * 9 + i * 0.9, r = 4 + 1.5 * Math.sin(t * 13 + i);
      disc(mx + Math.cos(a) * 6, my + Math.sin(a) * 4, Math.round(r), '#f4f1e8');
    }
    [[f.a, 0], [f.b, 2.1], [f.a, 4.2], [f.b, 1.1]].forEach(([c, ph], i) => {
      px(mx + Math.cos(t * 7 + ph) * 11, my + Math.sin(t * 8 + ph + i) * 7, 2, 1, c.def.pal.B);
    });
    px(mx + Math.cos(t * 5) * 9, my - 8 + Math.sin(t * 6) * 2, 1, 1, '#ffd45a');
    px(mx - Math.cos(t * 5) * 9, my - 6 + Math.cos(t * 6) * 2, 1, 1, '#ffd45a');
  }

  function drawables(now) {
    const out = [];
    for (const b of bowls) out.push({ key: b.y, draw: () => drawBowl(b) });
    if (ball) out.push({ key: ball.y + 1, draw: drawBall });
    if (fight && fight.phase === 'brawl') out.push({ key: fight.my + 1, draw: () => drawCloud(fight, now) });
    for (const c of cats) {
      if (c.hidden) continue;
      out.push({
        key: c.y + 0.5,
        draw: () => {
          const fr = FR[c.id][frameName(c, now)];
          const img = c.dir > 0 ? fr.r : fr.l;
          let dy = 0;
          if (c.hop > 0) dy = -Math.abs(Math.sin(c.hop * 9)) * 4;
          if (c.state === 'eat' && c.phase === 'eat') dy = Math.floor(now / 200) % 2 ? 0 : 1;
          px(c.x - 6, c.y - 1, 12, 1, 'rgba(0,0,0,0.18)');
          wg.drawImage(img, Math.round(c.x - FW / 2), Math.round(c.y - FOOT + dy));
        },
      });
    }
    return out;
  }

  function drawFloor(hour) {                                       // sun patches under the windows by day
    if (hour < 7.5 || hour > 16.5) return;
    const alpha = 0.17 * Math.sin(((hour - 7.5) / 9) * Math.PI);
    wg.fillStyle = 'rgba(255,238,170,' + alpha.toFixed(3) + ')';
    for (const w of windowsPos) {
      const cx = w.x + 12 + (hour - 12) * 5;
      for (let y = 52; y < 78; y++) wg.fillRect(Math.round(cx - 10 + (y - 52) * 0.5), y, 20, 1);
    }
  }

  function drawTop(now) {                                          // emotes, drawn above the lighting
    for (const e of emotes) {
      const spec = EMOTE_PX[e.kind];
      if (!spec) continue;
      const a = e.t > e.life * 0.6 ? 1 - (e.t - e.life * 0.6) / (e.life * 0.4) : 1;
      wg.globalAlpha = Math.max(0, a);
      spec.rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
        if (ch === 'X') { px(e.x + rx + 1, e.y + ry + 1, 1, 1, '#1d1d2b'); }
      }));
      spec.rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
        if (ch === 'X') px(e.x + rx, e.y + ry, 1, 1, spec.c);
      }));
      wg.globalAlpha = 1;
    }
  }

  function bubbles() {
    const out = [];
    for (const c of cats) {
      if (!c.bubble || c.hidden) continue;
      out.push({ cat: c, x: c.x, top: c.y - FOOT - 1 + (c.hop > 0 ? -3 : 0), text: c.bubble.text, typed: Math.floor((clockMs - c.bubble.at) / 38), color: c.def.color });
    }
    return out;
  }

  const LABELS = {
    sit: 'sitting', wander: 'wandering', zoomies: 'ZOOMIES!', play: 'playing', fight: 'fighting!', sleep: 'sleeping', groom: 'grooming',
    stretch: 'stretching', eat: 'eating', watch: 'window watching', beg: 'begging', follow: 'following Claude', roll: 'belly rub!',
    pet: 'being petted', wandplay: 'chasing the feather',
  };
  const label = (c) => (c.state === 'sleep' && c.phase === 'go' ? 'finding a bed' : LABELS[c.state] || c.state);

  return {
    init, update, drawables, drawFloor, drawTop, bubbles, hitTest, pet, dropFood, tossToy,
    planClaude, reserve, claudeBegin, claudeEnd, claudeBusy, wants, label,
    get list() { return cats; },
    get bowls() { return bowls; },
    get ball() { return ball; },
    get fight() { return fight; },
    get time() { return clockMs; },
    frames: () => FR,
    defs: DEFS,
  };
})();
