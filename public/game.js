(() => {
  const W = 240, H = 176;
  const SPEED = 42;               // logical px / second
  const MAIN_DESK = { x: 104, y: 48 };
  const HELPER_DESKS = [];
  for (const y of [96, 140]) for (const x of [24, 104, 184]) HELPER_DESKS.push({ x, y });
  const DOOR = { x: 6, y: 24 };
  const COLORS = { working: '#ffb454', done: '#58c264', waiting: '#e5484d', permission: '#ff9f1c', idle: '#7aa2ff', fun: '#ff7ac6' };

  // ---- idle life: what Claude does when nobody is prompting ----
  const MAIN_SEAT = { x: MAIN_DESK.x + 17, y: MAIN_DESK.y - 2 };
  const HUB_Y = 84;                 // walking lane below the main desk
  const IDLE_DELAY = 5000;          // ms of idling before Claude gets up
  const ACTIVITIES = [
    { id: 'exercise', spot: { x: 50, y: 108 }, texts: ['One more rep!', 'Feel the burn!', 'Jumping jacks!'] },
    { id: 'clean', spot: { x: 150, y: 112 }, texts: ['Sweep sweep sweep', 'Squeaky clean!', 'Dust bunnies, beware!'] },
    { id: 'play', spot: { x: 190, y: 108 }, texts: ['Wheee, catch!', 'Ball is life!', 'Five more minutes!'] },
    { id: 'meditate', spot: { x: 104, y: 130 }, texts: ['Ommmm…', 'Finding my zen…', 'Inhale… exhale…'] },
    { id: 'read', spot: { x: 206, y: 28 }, texts: ['Just one more page…', 'Chapter 7, no spoilers!', 'Ooh, plot twist!'] },
    { id: 'plant', spot: { x: 72, y: 28 }, texts: ['Grow, little plant!', 'Water time!', 'Hello, leafy friend!'] },
    // cat activities: Claude walks to wherever the cat is (spot comes from Cats.planClaude)
    { id: 'petcat', cat: true, texts: ["Who's a good kitty?", 'Scritch scritch!', 'Soft kitty, warm kitty…'] },
    { id: 'playcat', cat: true, texts: ['Get the feather!', 'Chase it, kitty!', 'Wiggle wiggle…'] },
    { id: 'feedcat', cat: true, texts: ['Dinner time, kitties!', 'Nom nom time!', "Who's hungry?"] },
  ];

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const world = document.createElement('canvas');
  world.width = W; world.height = H;
  const wg = world.getContext('2d');
  const bg = Sprites.drawBackground(W, H);
  let scale = 4;

  function resize() {
    scale = Math.max(2, Math.floor(Math.min((stage.clientWidth - 32) / W, (stage.clientHeight - 32) / H)));
    canvas.width = W * scale;
    canvas.height = H * scale;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); // also fires when side panes open/close
  resize();

  // ---------- state ----------
  let sessions = [];
  let selected = null;                 // null = follow the most recently active session
  const rooms = new Map();             // sessionId -> { seats: [actorKey|null x6] }
  const actors = new Map();            // key -> actor

  const hash = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const seatPos = (i) => ({ x: HELPER_DESKS[i].x + 17, y: HELPER_DESKS[i].y - 2 });
  const aisleY = (i) => HELPER_DESKS[i].y + 12;

  function reconcile(list) {
    const seen = new Set();
    const liveSessions = new Set(list.map((s) => s.id));
    for (const id of [...rooms.keys()]) if (!liveSessions.has(id)) rooms.delete(id);

    for (const s of list) {
      if (!rooms.has(s.id)) rooms.set(s.id, { seats: Array(HELPER_DESKS.length).fill(null) });
      const room = rooms.get(s.id);
      for (const a of s.agents) {
        const key = s.id + ':' + a.id;
        seen.add(key);
        let actor = actors.get(key);
        if (!actor) {
          actor = {
            key, sid: s.id, kind: a.kind, label: a.label, text: '', textAt: performance.now(),
            status: a.status, phase: 'seated', x: 0, y: 0, path: [], seat: -1, doneAt: 0, facing: 'down',
            look: a.kind === 'main' ? Sprites.claude : Sprites.helpers[hash(a.label + a.id) % Sprites.helpers.length],
          };
          if (a.kind === 'main') {
            actor.x = MAIN_DESK.x + 17; actor.y = MAIN_DESK.y - 2;
          } else {
            const free = room.seats.indexOf(null);
            actor.seat = free;
            if (free >= 0) {
              room.seats[free] = key;
              const sp = seatPos(free);
              actor.phase = 'entering';
              actor.x = DOOR.x; actor.y = DOOR.y;
              actor.path = [{ x: DOOR.x, y: aisleY(free) }, { x: sp.x, y: aisleY(free) }, sp];
            } else {
              actor.phase = 'hidden';
            }
          }
          actors.set(key, actor);
        }
        if (a.bubble !== actor.text) { actor.text = a.bubble; actor.textAt = performance.now(); }
        actor.status = a.status;
        actor.label = a.label;
        if (actor.kind === 'helper' && a.status === 'done' && !actor.doneAt) actor.doneAt = performance.now();
      }
    }
    // agents that disappeared from the server leave the office
    for (const actor of actors.values()) {
      if (!seen.has(actor.key) && actor.phase !== 'leaving') {
        if (actor.kind === 'main') { actors.delete(actor.key); continue; }
        startLeaving(actor);
      }
    }
  }

  function startLeaving(actor) {
    if (actor.phase === 'leaving') return;
    if (actor.seat < 0) { actors.delete(actor.key); return; }
    const ay = aisleY(actor.seat);
    actor.phase = 'leaving';
    actor.path = [{ x: actor.x, y: ay }, { x: DOOR.x, y: ay }, { x: DOOR.x, y: DOOR.y }];
  }

  function routeTo(actor, target) {
    actor.path = [{ x: actor.x, y: HUB_Y }, { x: target.x, y: HUB_Y }, { x: target.x, y: target.y }];
  }

  function pickActivity(prev) {
    // when the cats are asking for attention (hungry, begging, lonely), Claude usually answers
    const wants = Cats.wants();
    if (wants.length && Math.random() < 0.7) {
      const a = ACTIVITIES.find((x) => x.id === wants[Math.floor(Math.random() * wants.length)].kind);
      if (a && (!prev || prev.id !== a.id)) return a;
    }
    const opts = ACTIVITIES.filter((a) => !prev || a.id !== prev.id);
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function endCatActivity(actor) {
    const act = actor.activity;
    if (act && act.cat && act.plan && act.plan.cat) Cats.claudeEnd(act.plan.cat);
  }

  function goDoSomething(actor) {
    endCatActivity(actor);
    let act = pickActivity(actor.activity);
    let plan = null;
    if (act.cat) {
      plan = Cats.planClaude(act.id);
      if (!plan) {                                   // nothing useful to do with the cats right now
        const rest = ACTIVITIES.filter((a) => !a.cat && (!actor.activity || a.id !== actor.activity.id));
        act = rest[Math.floor(Math.random() * rest.length)];
      }
    }
    actor.activity = Object.assign({}, act);
    let spot = act.spot;
    if (plan) {
      actor.activity.plan = plan;
      actor.actFace = plan.spot.face;
      spot = plan.spot;
      if (plan.cat) Cats.reserve(plan.cat, 16000);   // the cat waits for Claude
    }
    actor.phase = 'wandering';
    routeTo(actor, spot);
  }

  // where the feather wand is while Claude plays with a cat
  function wandPos(a, now) {
    const t = now / 1000, dir = a.actFace || 1;
    const hx = dir > 0 ? a.x + 11 : a.x, hy = a.y + 8;
    const tx = hx + dir * (16 + Math.sin(t * 2.7) * 9);
    const lift = Math.abs(Math.sin(t * 2.1)) * 7;
    return { hx, hy, tx, ty: a.y + 15 - lift, floorX: tx, floorY: a.y + 16 };
  }

  function deskList() {
    const s = currentSession();
    const list = [MAIN_DESK];
    if (s) for (const a of actors.values()) if (a.sid === s.id && a.kind === 'helper' && a.seat >= 0 && a.phase !== 'hidden') list.push(HELPER_DESKS[a.seat]);
    return list;
  }

  function catContext(now) {
    const s = currentSession();
    const main = s ? [...actors.values()].find((a) => a.kind === 'main' && a.sid === s.id) : null;
    let wand = null;
    if (main && main.phase === 'activity' && main.activity && main.activity.id === 'playcat') {
      const w = wandPos(main, now);
      wand = { x: w.floorX, y: w.floorY };
    }
    return {
      desks: deskList(), hour: clk.dec, lamp: lampLevel(clk.dec), wand,
      claude: main ? { x: main.x, y: main.y, moving: main.path.length > 0 } : null,
    };
  }

  // Claude's desk life: idle -> get up and do something fun; work arrives -> back to the desk.
  function updateMain(actor, now) {
    const hasHelpers = [...actors.values()].some((h) => h.sid === actor.sid && h.kind === 'helper' && h.phase !== 'leaving');
    if (actor.status !== 'idle' || hasHelpers) {
      actor.idleAt = null;
      if (actor.phase === 'wandering' || actor.phase === 'activity') {
        endCatActivity(actor);                       // work arrived: let the cat go
        actor.phase = 'returning';
        routeTo(actor, MAIN_SEAT);
      }
      return;
    }
    if (actor.idleAt == null) actor.idleAt = now;
    if (actor.phase === 'seated' && now - actor.idleAt > IDLE_DELAY) {
      goDoSomething(actor);
    } else if (actor.phase === 'activity') {
      const act = actor.activity;
      if (act.cat && act.plan && act.plan.cat && !Cats.claudeBusy(act.plan.cat)) actor.actUntil = 0;   // the cat wandered off
      if (now > actor.actUntil) { goDoSomething(actor); return; }
      const idx = Math.floor((now - actor.actSince) / 4500) % actor.activity.texts.length;
      if (idx !== actor.actIdx) { actor.actIdx = idx; actor.actText = actor.activity.texts[idx]; actor.actTextAt = now; }
    }
  }

  function update(dt, now) {
    Cats.update(dt, now, catContext(now));
    for (const actor of [...actors.values()]) {
      if (actor.kind === 'helper' && actor.phase === 'seated' && actor.doneAt && now - actor.doneAt > 2200) startLeaving(actor);
      if (actor.kind === 'main') updateMain(actor, now);
      if (!actor.path.length) continue;
      let budget = SPEED * dt;
      while (budget > 0 && actor.path.length) {
        const t = actor.path[0];
        const dx = t.x - actor.x, dy = t.y - actor.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) actor.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'up' : 'down');
        if (d <= budget) { actor.x = t.x; actor.y = t.y; actor.path.shift(); budget -= d; }
        else { actor.x += (dx / d) * budget; actor.y += (dy / d) * budget; budget = 0; }
      }
      if (!actor.path.length) {
        actor.facing = 'down';                       // sit / work facing the viewer
        if (actor.phase === 'entering') actor.phase = 'seated';
        else if (actor.phase === 'wandering') {
          actor.phase = 'activity';
          actor.actSince = now;
          actor.actUntil = now + 9000 + Math.random() * 6000;
          actor.actIdx = -1;
          const act = actor.activity;
          if (act && act.cat && act.plan) {
            if (act.plan.cat) Cats.claudeBegin(act.id, act.plan.cat);
            if (act.id === 'feedcat') { Cats.dropFood(act.plan.bowl.x, act.plan.bowl.y, 'claude'); actor.actUntil = now + 6500; }
          }
        } else if (actor.phase === 'returning') { actor.phase = 'seated'; actor.idleAt = null; }
        else if (actor.phase === 'leaving') {
          const room = rooms.get(actor.sid);
          if (room && room.seats[actor.seat] === actor.key) room.seats[actor.seat] = null;
          actors.delete(actor.key);
        }
      }
    }
  }

  // ---------- drawing ----------
  function currentSession() {
    if (selected) { const s = sessions.find((x) => x.id === selected); if (s) return s; }
    return [...sessions].sort((a, b) => b.lastSeen - a.lastSeen)[0] || null;
  }

  function drawScreen(dx, dy, status, now) {
    const x = dx + 3, y = dy + 1;
    wg.fillStyle = status === 'idle' ? '#0a0f14' : '#10201c';
    wg.fillRect(x, y, 12, 8);
    if (status === 'working') {
      wg.fillStyle = '#6bff9c';
      const tick = Math.floor(now / 160);
      for (let i = 0; i < 4; i++) {
        const len = 3 + ((tick * 3 + i * 5) % 8);
        wg.fillRect(x + 1, y + 1 + i * 2, len, 1);
      }
    } else if (status === 'done') {
      wg.fillStyle = '#58c264';
      wg.fillRect(x + 3, y + 4, 2, 2); wg.fillRect(x + 5, y + 3, 2, 2); wg.fillRect(x + 7, y + 2, 2, 2);
    } else if (status === 'waiting' || status === 'permission') {
      wg.fillStyle = Math.floor(now / 400) % 2 ? '#e5484d' : '#7a2a2d';
      wg.fillRect(x + 5, y + 1, 2, 4); wg.fillRect(x + 5, y + 6, 2, 1);
    }
  }

  function px(x, y, w, h, c) { wg.fillStyle = c; wg.fillRect(Math.round(x), Math.round(y), w, h); }

  // Claude's free-time animations (sprite + a few code-drawn props).
  function drawActivity(a, now) {
    const t = now / 1000, x = a.x, y = a.y, look = a.look;
    const img = (frame, dx = 0, dy = 0) => wg.drawImage(look[frame], Math.round(x + dx), Math.round(y + dy));
    switch (a.activity.id) {
      case 'exercise': {                                   // jumping jacks + sweat
        const hop = Math.abs(Math.sin(t * 5)) * 5;
        px(x + 1, y + 16, 10, 1, 'rgba(0,0,0,0.18)');
        img(hop > 2.5 ? 'jack' : 'a', 0, -hop);
        if (Math.floor(t * 3) % 2) px(x + 11, y + 1 - hop, 1, 2, '#9fd6ff');
        break;
      }
      case 'clean': {                                      // sweeping with a broom
        const sw = Math.round(Math.sin(t * 3) * 5);
        const cx = x + sw;
        const right = Math.cos(t * 3) > 0;                 // face the sweeping direction
        wg.drawImage(look.walk[right ? 'right' : 'left'][Math.floor(t * 6) % 2], Math.round(cx), Math.round(y));
        const fx = right ? cx + 11 : cx;                   // broom held out in front
        px(fx, y + 4, 1, 12, '#a8723f');
        px(fx - 2, y + 15, 5, 3, '#e0b83e');
        for (let i = 0; i < 3; i++) if ((Math.floor(t * 6) + i) % 2) px(right ? fx + 4 + i * 3 : fx - 5 - i * 3, y + 16 - (i % 2), 1, 1, '#c9b88c');
        break;
      }
      case 'play': {                                       // bouncing a ball
        const b = Math.abs(Math.sin(t * 4.5));
        px(x + 14, y + 17, 4, 1, 'rgba(0,0,0,0.2)');
        wg.drawImage(look.sideR, Math.round(x), Math.round(y - Math.max(0, b - 0.7) * 6));   // faces the ball
        px(x + 14, y + 15 - b * 16, 4, 4, '#e5484d');
        px(x + 14, y + 15 - b * 16, 2, 1, '#ff9aa0');
        break;
      }
      case 'meditate': {                                   // cross-legged on a mat, sparkles orbiting
        const bob = Math.round(Math.sin(t * 1.6));
        px(x - 4, y + 19, 20, 3, '#7b52b5');
        px(x - 4, y + 19, 20, 1, '#9a6fd1');
        img('sleep', 0, 3 + bob);
        px(x, y + 17, 12, 3, '#3d4a6b');
        px(x + 1, y + 17, 10, 1, '#4d5d85');
        for (let k = 0; k < 3; k++) {
          const ang = t * 1.8 + k * 2.1;
          px(x + 5 + Math.cos(ang) * 10, y + 5 + Math.sin(ang) * 4 + bob, 2, 2, k % 2 ? '#c9a7ff' : '#fff3e0');
        }
        break;
      }
      case 'read': {                                       // standing at the bookshelf with a book
        img('a');
        const flip = Math.floor(t * 0.7) % 2;
        px(x + 2, y + 9, 8, 6, '#4f8fd9');
        px(x + 3, y + 10, 3, 4, '#fffdf5');
        px(x + 6, y + 10, 3, 4, flip ? '#e8e2d0' : '#fffdf5');
        px(x + 5, y + 9, 1, 6, '#33415c');
        break;
      }
      case 'plant': {                                      // watering the plant
        wg.drawImage(look.sideR, Math.round(x), Math.round(y));   // faces the plant
        px(x + 9, y + 9, 5, 4, '#4f8fd9');
        px(x + 14, y + 8 + (Math.floor(t * 2) % 2), 3, 1, '#4f8fd9');
        px(x + 8, y + 8, 1, 2, '#33415c');
        for (let i = 0; i < 3; i++) px(x + 17 + (i % 2), y + 9 + ((t * 8 + i * 2) % 4), 1, 2, '#9fd6ff');
        break;
      }
      case 'petcat': {                                     // stroking a cat
        const dir = a.actFace || 1;
        wg.drawImage(dir > 0 ? look.sideR : look.sideL, Math.round(x), Math.round(y + 1));
        const bob = Math.round(Math.sin(t * 7) * 2);
        px(dir > 0 ? x + 12 : x - 2, y + 10 + bob, 3, 2, '#f2c9a0');
        break;
      }
      case 'playcat': {                                    // dangling a feather on a stick
        const dir = a.actFace || 1;
        wg.drawImage(dir > 0 ? look.sideR : look.sideL, Math.round(x), Math.round(y));
        const w = wandPos(a, now);
        const sx = w.hx + dir * 4, sy = a.y + 3;           // top of the stick
        const line = (x0, y0, x1, y1, col) => {
          const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
          for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 1, 1, col);
        };
        line(w.hx, w.hy, sx, sy, '#a8723f');
        line(sx, sy, w.tx, w.ty, '#d8d2c0');
        px(w.tx - 1, w.ty - 1, 3, 2, '#ff7ac6');
        px(w.tx, w.ty - 2, 1, 1, '#ffd1ec');
        break;
      }
      case 'feedcat': {                                    // carrying the bowl, then watching them eat
        const dir = a.actFace || 1;
        wg.drawImage(dir > 0 ? look.sideR : look.sideL, Math.round(x), Math.round(y));
        if (now - a.actSince < 1500) px(dir > 0 ? x + 10 : x - 3, y + 10, 5, 2, '#d9669a');
        break;
      }
      default: img('a');
    }
  }

  function charFrame(actor, now) {
    if (actor.path.length > 0) return actor.look.walk[actor.facing || 'down'][Math.floor(now / 160) % 2];
    if (actor.status === 'working') return actor.look[Math.floor(now / 180) % 2 ? 'b' : 'a'];
    if (actor.status === 'idle') return actor.look.sleep;
    return actor.look.a;
  }

  // ---------- time of day (Singapore by default) ----------
  // ?tz=Asia/Tokyo uses another zone; ?hour=19.5 previews a time of day (the clock keeps running from there).
  const params = new URLSearchParams(location.search);
  const TZ = params.get('tz') || 'Asia/Singapore';
  const TZ_LABEL = TZ === 'Asia/Singapore' ? 'SGT' : TZ.split('/').pop().replace(/_/g, ' ').toUpperCase();
  let clockFmt;
  try {
    clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  } catch (e) {
    clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  }
  const fakeHour = params.has('hour') ? parseFloat(params.get('hour')) : NaN;
  const loadedAt = Date.now();
  let clk = { h: 12, m: 0, s: 0, dec: 12 };

  function readClock() {
    if (!isNaN(fakeHour)) {
      const total = (fakeHour * 3600 + (Date.now() - loadedAt) / 1000) % 86400;
      return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: Math.floor(total % 60), dec: total / 3600 };
    }
    const p = {};
    for (const x of clockFmt.formatToParts(new Date())) p[x.type] = x.value;
    const h = (+p.hour) % 24, m = +p.minute, s = +p.second;
    return { h, m, s, dec: h + m / 60 + s / 3600 };
  }

  function phaseOf(h) {
    if (h >= 5 && h < 7) return { name: 'DAWN', color: '#ffb37a' };
    if (h >= 7 && h < 11) return { name: 'MORNING', color: '#9fd6ff' };
    if (h >= 11 && h < 15) return { name: 'DAYTIME', color: '#ffe27a' };
    if (h >= 15 && h < 17) return { name: 'AFTERNOON', color: '#ffb454' };
    if (h >= 17 && h < 19) return { name: 'SUNSET', color: '#ff7a5a' };
    return { name: 'NIGHT', color: '#9aa8ff' };
  }

  const hexRgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mix = (a, b, t) => a + (b - a) * t;
  const NIGHT_SKY = ['#0a0e2a', '#10163f', '#171f55', '#1d2766'];
  // sky colours (4 bands, top to bottom) at key hours; blended in between
  const SKY = [
    [0, NIGHT_SKY], [4.5, NIGHT_SKY],
    [5.5, ['#1a1f4d', '#4a3a7a', '#b0587a', '#ff9a6a']],      // first light
    [6.5, ['#4a6fb0', '#e08a8a', '#ffb87a', '#ffe0a0']],      // sunrise
    [8, ['#5fa8f0', '#8fd0ff', '#b5e3ff', '#d8f1ff']],        // morning
    [12, ['#3f95ea', '#6fbcf8', '#9ad6ff', '#c2e8ff']],       // midday
    [16, ['#4a97e6', '#7cc0f0', '#b0dcf0', '#ffe8b0']],       // golden afternoon
    [17.5, ['#5a5aa8', '#e07a6a', '#ffa65c', '#ffd27a']],     // sunset
    [18.5, ['#2a2a6a', '#8a4a7a', '#e0745a', '#ffb060']],     // dusk
    [19.5, ['#10143a', '#1a2050', '#232c66', '#2c3878']],
    [21, NIGHT_SKY], [24, NIGHT_SKY],
  ];
  // room tint [r, g, b, alpha] over the whole office
  const TINT = [
    [0, [10, 18, 70, 0.46]], [4.5, [10, 18, 70, 0.46]], [5.5, [120, 80, 140, 0.25]], [6.5, [255, 160, 110, 0.14]],
    [8, [255, 255, 255, 0]], [16, [255, 255, 255, 0]], [17.5, [255, 150, 70, 0.14]], [18.5, [120, 70, 110, 0.25]],
    [19.5, [10, 18, 70, 0.42]], [21, [10, 18, 70, 0.46]], [24, [10, 18, 70, 0.46]],
  ];
  function sample(keys, h, blend) {
    for (let i = 0; i < keys.length - 1; i++) {
      const [h0, v0] = keys[i], [h1, v1] = keys[i + 1];
      if (h >= h0 && h <= h1) return blend(v0, v1, h1 === h0 ? 0 : (h - h0) / (h1 - h0));
    }
    return keys[keys.length - 1][1];
  }
  const blendSky = (a, b, t) => a.map((c, i) => {
    const x = hexRgb(c), y = hexRgb(b[i]);
    return 'rgb(' + x.map((v, k) => Math.round(mix(v, y[k], t))).join(',') + ')';
  });
  const blendTint = (a, b, t) => a.map((v, i) => mix(v, b[i], t));

  const WINDOWS = [{ x: 56, y: 6 }, { x: 160, y: 6 }];
  const STARS = [[3, 3], [8, 6], [15, 4], [18, 9], [5, 13], [12, 15], [17, 16], [9, 2], [2, 9], [13, 11]];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function disc(cx, cy, r, c) {
    wg.fillStyle = c;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y + 0.5));
      wg.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  }

  // The two windows act as one wide view: the sun / moon crosses the first, then the second.
  function drawWindows(now, h) {
    const bands = sample(SKY, h, blendSky);
    const night = (h >= 19.5 || h < 4.5) ? 1 : h >= 18.5 ? h - 18.5 : h < 5.5 ? 5.5 - h : 0;
    const sp = (h - 6) / 12;                                   // sun progress 0..1 between 6:00 and 18:00
    const mp = (h >= 12 ? h - 19 : h + 5) / 10;                // moon progress 0..1 between 19:00 and 05:00
    const arcY = (p) => 6 + (1 - Math.sin(clamp01(p) * Math.PI)) * 13;
    const low = 1 - Math.sin(clamp01(sp) * Math.PI);
    const sunCol = low > 0.7 ? '#ff8a3c' : low > 0.4 ? '#ffb347' : '#ffe27a';
    const clouds = [[0, 3], [17, 8], [34, 12]];

    WINDOWS.forEach((win, k) => {
      const gx = win.x + 2, gy = win.y + 2;
      wg.save();
      wg.beginPath(); wg.rect(gx, gy, 20, 18); wg.clip();
      [[0, 5], [5, 5], [10, 4], [14, 4]].forEach(([oy, hh], i) => { wg.fillStyle = bands[i]; wg.fillRect(gx, gy + oy, 20, hh); });

      if (night > 0) {                                         // twinkling stars
        STARS.forEach(([sx, sy], i) => {
          wg.globalAlpha = night * (0.45 + 0.55 * Math.sin(now / 500 + i * 1.7) ** 2);
          wg.fillStyle = '#ffffff'; wg.fillRect(gx + sx, gy + sy, 1, 1);
        });
        wg.globalAlpha = 1;
      }
      if (sp > -0.08 && sp < 1.08) {                           // sun
        const cx = gx + sp * 40 - 20 * k, cy = gy + arcY(sp);
        wg.globalAlpha = 0.28; disc(cx, cy, 5, '#fff3b0'); wg.globalAlpha = 1;
        disc(cx, cy, 3, sunCol);
      }
      if (mp > -0.08 && mp < 1.08 && night > 0) {              // moon (crescent)
        const cx = gx + mp * 40 - 20 * k, cy = gy + arcY(mp);
        wg.globalAlpha = 0.15; disc(cx, cy, 5, '#dfe6ff'); wg.globalAlpha = 1;
        disc(cx, cy, 3, '#f3f1d8');
        disc(cx + 2, cy - 1, 3, bands[Math.max(0, Math.min(3, Math.floor((cy - gy) / 4.5)))]);
      }
      if (night < 1) {                                         // drifting clouds
        wg.globalAlpha = (1 - night) * 0.9;
        clouds.forEach(([off, cyy]) => {
          const comb = ((now / 1000) * 0.8 + off) % 52 - 10;
          const cx = gx + comb - 20 * k;
          wg.fillStyle = '#ffffff';
          wg.fillRect(Math.round(cx), gy + cyy + 2, 10, 3);
          wg.fillRect(Math.round(cx) + 2, gy + cyy, 6, 3);
          wg.fillRect(Math.round(cx) + 6, gy + cyy + 1, 5, 2);
        });
        wg.globalAlpha = 1;
      }
      wg.restore();
      px(win.x + 11, win.y + 2, 2, 18, '#e8e2d0');             // window bars over the sky
      px(win.x + 2, win.y + 10, 20, 2, '#e8e2d0');
      px(win.x - 1, win.y + 22, 26, 2, '#cfc7b0');             // sill
      px(win.x - 1, win.y + 24, 26, 1, 'rgba(0,0,0,0.2)');
    });
  }

  // Wall clock: static face + live hands.
  const clockFace = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 15;
    const g = c.getContext('2d');
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const d = Math.hypot(x - 7, y - 7);
      if (d <= 7.2) { g.fillStyle = d > 6.0 ? '#7a5a30' : '#fffdf5'; g.fillRect(x, y, 1, 1); }
    }
    g.fillStyle = '#1d1d2b';
    for (const [x, y] of [[7, 1], [13, 7], [7, 13], [1, 7]]) g.fillRect(x, y, 1, 1);
    return c;
  })();

  function hand(cx, cy, angle, len, color) {
    const n = Math.ceil(len);
    wg.fillStyle = color;
    for (let i = 1; i <= n; i++) {
      wg.fillRect(Math.round(cx + Math.sin(angle) * len * i / n), Math.round(cy - Math.cos(angle) * len * i / n), 1, 1);
    }
  }

  function drawClock() {
    wg.drawImage(clockFace, 112, 3);
    const cx = 119, cy = 10, TAU = Math.PI * 2;
    hand(cx, cy, (((clk.h % 12) + clk.m / 60) / 12) * TAU, 3.5, '#1d1d2b');
    hand(cx, cy, ((clk.m + clk.s / 60) / 60) * TAU, 5.5, '#1d1d2b');
    hand(cx, cy, (clk.s / 60) * TAU, 6, '#e5484d');
    px(cx, cy, 1, 1, '#1d1d2b');
  }

  // ---------- desk lamps: off by day, fade on at dusk, fade off after sunrise ----------
  function lampLevel(h) {
    if (h >= 18.5 || h < 5.5) return 1;          // fully on through the night
    if (h >= 17) return (h - 17) / 1.5;          // switching on from 17:00
    if (h < 7) return 1 - (h - 5.5) / 1.5;       // switching off until 07:00
    return 0;
  }
  const lerpHex = (a, b, t) => {
    const x = hexRgb(a), y = hexRgb(b);
    return 'rgb(' + x.map((v, i) => Math.round(mix(v, y[i], t))).join(',') + ')';
  };

  // Small articulated lamp on the right end of the desk.
  function drawLamp(d, level) {
    const x = d.x, y = d.y;
    px(x + 28, y + 9, 4, 1, '#3a3f4b');                         // base
    px(x + 30, y + 5, 1, 4, '#5b6270');                         // stem
    const shade = lerpHex('#6f7686', '#ffd45a', level);
    px(x + 27, y + 2, 5, 2, shade);                             // lamp head
    px(x + 28, y + 4, 3, 1, shade);
    px(x + 28, y + 5, 2, 1, lerpHex('#4a4f5c', '#fff6c2', level));   // bulb
    if (level > 0.05) px(x + 27, y + 2, 5, 1, 'rgba(255,255,255,' + (0.35 * level).toFixed(2) + ')');
  }

  function ellipseFill(cx, cy, rx, ry, color) {
    wg.fillStyle = color;
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
      wg.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
    }
  }

  // Warm light pool cast by the lamp, in stepped (pixel-art) rings.
  function drawLampGlow(d, level) {
    if (level < 0.02) return;
    const cx = d.x + 21, cy = d.y + 12;
    for (const [rx, ry, a] of [[28, 17, 0.08], [21, 13, 0.09], [14, 9, 0.10], [7, 5, 0.12]]) {
      ellipseFill(cx, cy, rx, ry, 'rgba(255,205,110,' + (a * level).toFixed(3) + ')');
    }
  }

  // Night focus: an extra dark layer with a soft stepped hole around the main desk, plus a warm
  // ceiling-light pool on the floor, so the eye goes straight to the workstation.
  let darkLayer = null;
  function drawNightFocus(k) {
    if (k < 0.02) return;
    if (!darkLayer) { darkLayer = document.createElement('canvas'); darkLayer.width = W; darkLayer.height = H; }
    const dg = darkLayer.getContext('2d');
    const cx = MAIN_DESK.x + 16, cy = MAIN_DESK.y + 16;
    const ell = (g, rx, ry, color) => {
      g.fillStyle = color;
      for (let dy = -ry; dy <= ry; dy++) {
        const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
        g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
      }
    };
    dg.globalCompositeOperation = 'source-over';
    dg.clearRect(0, 0, W, H);
    dg.fillStyle = 'rgba(3,6,28,' + (0.34 * k).toFixed(3) + ')';
    dg.fillRect(0, 0, W, H);
    dg.globalCompositeOperation = 'destination-out';
    for (const [rx, ry, a] of [[92, 58, 0.25], [76, 48, 0.3], [60, 38, 0.35], [44, 28, 0.5], [30, 19, 0.8]]) {
      ell(dg, rx, ry, 'rgba(0,0,0,' + a + ')');
    }
    wg.drawImage(darkLayer, 0, 0);
    for (const [rx, ry, a] of [[56, 34, 0.04], [42, 26, 0.05], [30, 19, 0.06], [18, 12, 0.07]]) {
      ell(wg, rx, ry, 'rgba(255,226,160,' + (a * k).toFixed(3) + ')');
    }
  }

  function render(now) {
    wg.drawImage(bg, 0, 0);
    Cats.drawFloor(clk.dec);
    const s = currentSession();
    const list = [];
    const visible = [...actors.values()].filter((a) => s && a.sid === s.id && a.phase !== 'hidden');
    const mainActor = visible.find((a) => a.kind === 'main');

    const desks = [{ d: MAIN_DESK, who: mainActor }];
    if (!s) {
      // empty office placeholder is handled by the synthetic session in tick()
    }
    for (const a of visible) {
      if (a.kind === 'helper' && a.seat >= 0) desks.push({ d: HELPER_DESKS[a.seat], who: a });
    }
    for (const { d, who } of desks) {
      list.push({
        key: d.y + 24,
        draw: () => {
          // empty chair while Claude is off doing something fun
          if (who && who.kind === 'main' && who.phase !== 'seated') { wg.fillStyle = '#44506b'; wg.fillRect(d.x + 16, d.y + 2, 14, 10); }
          wg.drawImage(Sprites.desk, d.x, d.y);
          drawScreen(d.x, d.y, who && who.phase === 'seated' ? who.status : 'idle', now);
          drawLamp(d, lampLevel(clk.dec));
        },
        desk: d, who,
      });
    }
    for (const a of visible) {
      const seated = a.phase === 'seated';
      list.push({
        key: seated ? a.y + 12 : a.y + 16,
        draw: () => {
          if (a.phase === 'activity') return drawActivity(a, now);
          if (seated) { wg.fillStyle = '#44506b'; wg.fillRect(a.x - 1, a.y + 4, 14, 10); }
          const walking = a.path.length > 0;
          if (walking) px(a.x + 1, a.y + 15, 10, 1, 'rgba(0,0,0,0.16)');
          wg.drawImage(charFrame(a, now), Math.round(a.x), Math.round(a.y) + (walking && Math.floor(now / 160) % 2 ? -1 : 0));
        },
      });
    }
    list.push(...Cats.drawables(now));                     // cats, bowls, ball: y-sorted with everyone else
    list.sort((p, q) => p.key - q.key).forEach((it) => it.draw());

    // time of day: tint the whole room, then the (always bright) windows and the wall clock on top
    const [tr, tg, tb, ta] = sample(TINT, clk.dec, blendTint);
    if (ta > 0.005) { wg.fillStyle = `rgba(${Math.round(tr)},${Math.round(tg)},${Math.round(tb)},${ta.toFixed(3)})`; wg.fillRect(0, 0, W, H); }
    drawNightFocus(clamp01((ta - 0.1) / 0.3));             // darker room, lit around Claude's workstation
    for (const { d } of desks) drawLampGlow(d, lampLevel(clk.dec));   // lamp light shines through the night tint
    drawWindows(now, clk.dec);
    drawClock();
    Cats.drawTop(now);                                     // hearts, zzz, stars...

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(world, 0, 0, W * scale, H * scale);

    // ----- overlay at display resolution: desk labels + bubbles -----
    const labelPx = Math.max(8, Math.round(scale * 2.2 / 2) * 2);
    ctx.textBaseline = 'top';
    for (const { d, who } of desks) {
      const label = who ? (who.kind === 'main' ? 'CLAUDE' : String(who.label).toUpperCase().slice(0, 9)) : '';
      if (!label) continue;
      ctx.font = labelPx + 'px "Press Start 2P", monospace';
      ctx.fillStyle = '#fff3e0';
      ctx.textAlign = 'center';
      ctx.fillText(label, (d.x + 16) * scale, (d.y + 17) * scale);
    }
    for (const a of visible) {
      if (a.phase === 'activity' && a.actText) drawBubble(a, now, a.actText, 'fun', a.actTextAt);
      else if (a.phase === 'seated' && a.text) drawBubble(a, now, a.text, a.status, a.textAt);
    }
    for (const b of Cats.bubbles()) drawCatBubble(b);
    if (hoverCat && !hoverCat.hidden) drawNameTag(hoverCat);
  }

  // Small, occasional bubbles for the cats (kept smaller than Claude's so his work bubbles stay the focus).
  function drawCatBubble(b) {
    const t = scale;
    const fp = Math.max(8, Math.round(scale * 2.6 / 2) * 2);
    const bt = Math.max(1, Math.round(t / 2));
    ctx.font = fp + 'px "Press Start 2P", monospace';
    const pad = Math.round(fp * 0.55);
    const w = b.text.length * fp + pad * 2, h = fp + pad * 2;
    let x = Math.round(b.x * t - w / 2);
    x = Math.max(t, Math.min(canvas.width - w - t, x));
    const y = Math.round(b.top * t - h - bt * 4);
    const dark = '#1d1d2b', light = '#fffdf5';
    ctx.fillStyle = dark;
    ctx.fillRect(x + bt, y, w - 2 * bt, h); ctx.fillRect(x, y + bt, w, h - 2 * bt);
    ctx.fillStyle = light;
    ctx.fillRect(x + 2 * bt, y + bt, w - 4 * bt, h - 2 * bt); ctx.fillRect(x + bt, y + 2 * bt, w - 2 * bt, h - 4 * bt);
    ctx.fillStyle = b.color;                                  // cat-coloured underline
    ctx.fillRect(x + 2 * bt, y + h - 2 * bt, w - 4 * bt, bt);
    const bx = Math.round(Math.min(Math.max(b.x * t, x + 3 * bt), x + w - 3 * bt) / bt) * bt;
    ctx.fillStyle = light; ctx.fillRect(bx - bt, y + h - bt, 2 * bt, bt);
    ctx.fillStyle = dark; ctx.fillRect(bx - 2 * bt, y + h, bt, bt); ctx.fillRect(bx + bt, y + h, bt, bt);
    ctx.fillStyle = light; ctx.fillRect(bx - bt, y + h, 2 * bt, bt);
    ctx.fillStyle = dark; ctx.fillRect(bx - bt, y + h + bt, 2 * bt, bt);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(b.text.slice(0, Math.max(0, b.typed)), x + pad, y + pad);
  }

  function drawNameTag(c) {
    const t = scale;
    const fp = Math.max(8, Math.round(scale * 2.2 / 2) * 2);
    ctx.font = fp + 'px "Press Start 2P", monospace';
    const pad = Math.round(fp * 0.4);
    const w = c.name.length * fp + pad * 2, h = fp + pad * 2;
    const x = Math.max(t, Math.min(canvas.width - w - t, Math.round(c.x * t - w / 2)));
    const y = Math.round((c.y + 3) * t);
    ctx.fillStyle = c.def.color; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1d1d2b'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = c.def.color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(c.name, x + pad, y + pad);
  }

  function wrap(text, max) {
    const words = String(text).split(' ');
    const lines = [''];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if ((cur + ' ' + w).trim().length <= max) lines[lines.length - 1] = (cur + ' ' + w).trim();
      else if (lines.length < 2) lines.push(w.slice(0, max));
      else { lines[1] = (lines[1] + '…').slice(0, max); break; }
    }
    return lines;
  }

  function drawBubble(a, now, text, status, textAt) {
    const t = scale;
    // Big, readable text that grows with the room (Claude's bubble a little larger than a helper's).
    const fontPx = Math.max(8, Math.round(scale * 5 * (a.kind === 'main' ? 1 : 0.85) / 2) * 2);
    const lines = wrap(text, 17);
    ctx.font = fontPx + 'px "Press Start 2P", monospace';
    const lineH = Math.round(fontPx * 1.5);
    const maxChars = Math.max(...lines.map((l) => l.length));
    const pad = Math.round(fontPx * 0.7);
    const w = maxChars * fontPx + pad * 2;
    const h = (lines.length - 1) * lineH + fontPx + pad * 2;
    const cx = (a.x + 6) * t;
    let x = Math.round(cx - w / 2);
    x = Math.max(t * 2, Math.min(canvas.width - w - t * 2, x));
    const bob = status === 'permission' ? Math.round(Math.sin(now / 180)) * t : 0;   // pleading bounce
    const y = Math.round(a.y * t - t - h - t * 3) + bob;
    const dark = '#1d1d2b', light = '#fffdf5';

    ctx.fillStyle = dark;
    ctx.fillRect(x + t, y, w - 2 * t, h);
    ctx.fillRect(x, y + t, w, h - 2 * t);
    ctx.fillStyle = light;
    ctx.fillRect(x + 2 * t, y + t, w - 4 * t, h - 2 * t);
    ctx.fillRect(x + t, y + 2 * t, w - 2 * t, h - 4 * t);
    // tail
    const bx = Math.round(cx / t) * t;
    ctx.fillStyle = light; ctx.fillRect(bx - t, y + h - t, 2 * t, t);
    ctx.fillStyle = dark; ctx.fillRect(bx - 2 * t, y + h, t, t); ctx.fillRect(bx + t, y + h, t, t);
    ctx.fillStyle = light; ctx.fillRect(bx - t, y + h, 2 * t, t);
    ctx.fillStyle = dark; ctx.fillRect(bx - t, y + h + t, 2 * t, t);

    // typed text
    let remaining = Math.floor((now - textAt) / 28);
    ctx.fillStyle = dark;
    ctx.textAlign = 'left';
    lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, remaining));
      remaining -= l.length;
      ctx.fillText(part, x + pad, y + pad + i * lineH);
    });

    // status badge (top-left corner)
    const bs = fontPx + t * 3;
    const bX = x - bs + t * 2, bY = y - t * 2;
    ctx.fillStyle = dark; ctx.fillRect(bX, bY, bs, bs);
    ctx.fillStyle = COLORS[status] || COLORS.idle; ctx.fillRect(bX + t, bY + t, bs - 2 * t, bs - 2 * t);
    ctx.fillStyle = dark;
    const u = Math.max(1, Math.floor(bs / 8));
    const ox = bX + Math.floor((bs - u * 5) / 2), oy = bY + Math.floor((bs - u * 5) / 2);
    if (status === 'working') {
      const k = Math.floor(now / 250) % 3;
      for (let i = 0; i < 3; i++) if (i <= k) ctx.fillRect(bX + t + u + i * u * 2, bY + bs / 2 - u / 2, u, u);
    } else if (status === 'done') {
      ctx.fillRect(ox, oy + 3 * u, u, u); ctx.fillRect(ox + u, oy + 4 * u, u, u);
      ctx.fillRect(ox + 2 * u, oy + 3 * u, u, u); ctx.fillRect(ox + 3 * u, oy + 2 * u, u, u);
      ctx.fillRect(ox + 4 * u, oy + u, u, u);
    } else if (status === 'waiting') {
      ctx.fillRect(ox + 2 * u, oy, u, 3 * u); ctx.fillRect(ox + 2 * u, oy + 4 * u, u, u);
    } else if (status === 'permission') {                // question mark
      for (const [px_, py_] of [[1, 0], [2, 0], [3, 0], [3, 1], [2, 2], [2, 3], [2, 5]]) ctx.fillRect(ox + px_ * u, oy + py_ * u - u, u, u);
    } else if (status === 'fun') {                       // little sparkle
      ctx.fillRect(ox + 2 * u, oy, u, 5 * u); ctx.fillRect(ox, oy + 2 * u, 5 * u, u);
    } else {
      ctx.font = Math.max(8, u * 5) + 'px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('z', bX + bs / 2, bY + t * 2);
      ctx.textAlign = 'left';
    }
  }

  // ---------- loop ----------
  let last = performance.now();
  let lastClock = -1e9;
  const clockTimeEl = document.getElementById('clock-time');
  const clockPhaseEl = document.getElementById('clock-phase');
  function updateClock(now) {
    if (now - lastClock < 250) return;
    lastClock = now;
    clk = readClock();
    const two = (n) => String(n).padStart(2, '0');
    const ph = phaseOf(clk.dec);
    clockTimeEl.textContent = TZ_LABEL + ' ' + two(clk.h) + ':' + two(clk.m) + ':' + two(clk.s);
    clockPhaseEl.textContent = ph.name;
    clockPhaseEl.style.color = ph.color;
  }
  let tOffset = 0, lastNow = 0;       // tOffset lets the debug hook below fast-forward the simulation
  function tick(rawNow) {
    const now = rawNow + tOffset;
    lastNow = now;
    updateClock(now);
    updateRoster(now);
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    update(dt, now);
    render(now);
    requestAnimationFrame(tick);
  }

  // ---------- UI ----------
  const tabs = document.getElementById('tabs');
  const logEl = document.getElementById('log');
  const connEl = document.getElementById('conn');

  function drawTabs() {
    tabs.textContent = '';
    const cur = currentSession();
    const mk = (label, id) => {
      const b = document.createElement('button');
      b.textContent = label;
      if ((id === null && selected === null) || (id && cur && cur.id === id && selected === id)) b.className = 'active';
      b.onclick = () => { selected = id; drawTabs(); };
      tabs.appendChild(b);
    };
    if (sessions.length > 1) {
      mk('AUTO', null);
      sessions.forEach((s) => mk(s.name.toUpperCase().slice(0, 14), s.id));
    } else if (sessions.length === 1) {
      const b = document.createElement('button');
      b.className = 'active';
      b.textContent = sessions[0].name.toUpperCase().slice(0, 20);
      tabs.appendChild(b);
    }
  }

  function addLog(e) {
    const li = document.createElement('li');
    const t = new Date(e.t).toLocaleTimeString([], { hour12: false });
    const parts = [['t', t + ' '], ['who', e.who + ': '], ['', e.text]];
    parts.forEach(([cls, txt]) => {
      const sp = document.createElement('span');
      if (cls) sp.className = cls;
      sp.textContent = txt;
      li.appendChild(sp);
    });
    logEl.prepend(li);
    while (logEl.children.length > 60) logEl.removeChild(logEl.lastChild);
  }

  function applyState(state) {
    sessions = state.sessions;
    if (!sessions.length) {
      // keep one sleeping Claude in an empty office
      sessions = [{
        id: '_empty', name: 'no session', lastSeen: 0,
        agents: [{ id: 'main', kind: 'main', label: 'Claude', status: 'idle', bubble: 'Zzz… waiting for a prompt' }],
      }];
    }
    reconcile(sessions);
    drawTabs();
  }

  function connect() {
    const es = new EventSource('/stream');
    es.onopen = () => { connEl.textContent = 'live'; connEl.className = 'on'; };
    es.onerror = () => { connEl.textContent = 'offline'; connEl.className = 'off'; };
    es.addEventListener('state', (e) => applyState(JSON.parse(e.data)));
    es.addEventListener('log', (e) => addLog(JSON.parse(e.data)));
  }

  // ---------- cats: tools, hover, roster ----------
  let tool = 'pet', hoverCat = null;
  const toolBtns = [...document.querySelectorAll('#tools button')];
  function setTool(name) {
    tool = name;
    toolBtns.forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
    canvas.style.cursor = name === 'pet' ? 'default' : 'crosshair';
  }
  toolBtns.forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left - canvas.clientLeft) / canvas.clientWidth) * W, y: ((e.clientY - r.top - canvas.clientTop) / canvas.clientHeight) * H };
  };
  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    hoverCat = Cats.hitTest(p.x, p.y);
    canvas.style.cursor = hoverCat ? 'pointer' : tool === 'pet' ? 'default' : 'crosshair';
  });
  canvas.addEventListener('pointerleave', () => { hoverCat = null; });
  canvas.addEventListener('click', (e) => {
    const p = toLogical(e);
    const cat = Cats.hitTest(p.x, p.y);
    if (cat) { Cats.pet(cat, 'user'); return; }                // clicking a cat always pets it
    if (p.y < 44) return;                                      // the wall
    if (tool === 'feed') Cats.dropFood(p.x, p.y, 'user');
    else if (tool === 'toy') Cats.tossToy(p.x, p.y);
  });

  Cats.init({ wg, W, H, mainDesk: MAIN_DESK, windows: WINDOWS });   // creates the three cats
  const rosterEl = document.getElementById('roster');
  const rosterRows = Cats.list.map((c) => {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = c.def.color;
    const info = document.createElement('div'); info.className = 'info';
    const nm = document.createElement('b'); nm.textContent = c.name; nm.style.color = c.def.color;
    const tr = document.createElement('i'); tr.textContent = c.def.trait;
    const st = document.createElement('span'); st.className = 'st';
    const bars = document.createElement('div'); bars.className = 'bars';
    const fills = [['energy', 'e'], ['tummy', 't'], ['love', 'l']].map(([title, cls]) => {
      const em = document.createElement('em'); em.title = title; em.className = cls;
      const u = document.createElement('u'); em.appendChild(u); bars.appendChild(em);
      return u;
    });
    const head = document.createElement('div'); head.className = 'head';
    head.append(nm, tr);
    info.append(head, st, bars);
    li.append(dot, info);
    rosterEl.appendChild(li);
    return { c, st, fills };
  });
  let lastRoster = -1e9;
  function updateRoster(now) {
    if (now - lastRoster < 250) return;
    lastRoster = now;
    rosterRows.forEach(({ c, st, fills }) => {
      st.textContent = Cats.label(c);
      fills[0].style.width = Math.round(c.energy * 100) + '%';
      fills[1].style.width = Math.round((1 - c.hunger) * 100) + '%';
      fills[2].style.width = Math.round(c.love * 100) + '%';
    });
  }

  window.__office = {                              // debugging handle
    actors, rooms, cats: Cats,
    ff(seconds) {                                  // fast-forward the whole simulation (Claude, helpers, cats)
      for (let i = 0; i < seconds * 10; i++) { tOffset += 100; lastNow += 100; last = lastNow; updateClock(lastNow); update(0.1, lastNow); }
    },
  };
  applyState({ sessions: [] });
  connect();
  requestAnimationFrame(tick);
})();
