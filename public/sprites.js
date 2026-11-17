// All art here is original and drawn in code: palette-indexed string maps for
// characters, rectangles for furniture. Everything is pre-rendered once.
window.Sprites = (() => {
  function fromMap(rows, pal) {
    const c = document.createElement('canvas');
    c.width = rows[0].length;
    c.height = rows.length;
    const g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const col = pal[ch];
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }));
    return c;
  }
  function canvas(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'));
    return c;
  }

  // ---- characters: 12x16, drawn facing down (front), up (back) and right (side; left is a mirror) ----
  // D outline  H hair  h hair light  A hair clip  S skin  s skin shade  C blush  E eye
  // B shirt  b shirt shade  Y shirt accent  W collar  P pants  K shoes
  const FRONT = [
    '...DDDDDD...',
    '..DHHhHHHD..',
    '.DHHHHHHAHD.',
    '.DHHSSSSHHD.',
    '.DSSESSESSD.',
    '.DSCSSSSCSD.',
    '..DSSSSSSD..',
    '...DDSSDD...',
    '..DBBWWBBD..',
    '.DBBBYYBBBD.',
    '.DBbBBBBbBD.',
    '.DSBBBBBBSD.',
    '..DBBBBBBD..',
    '..DPPPPPPD..',
    '..DPPDDPPD..',
    '..DKK..KKD..',
  ];
  const BACK = [
    '...DDDDDD...',
    '..DHHHHHHD..',
    '.DHHAHhHHHD.',
    '.DHHHHHHHHD.',
    '.DHHHHHHHHD.',
    '.DHHHHHHHHD.',
    '..DHHHHHHD..',
    '...DDSSDD...',
    '..DBBBBBBD..',
    '.DBBBbbBBBD.',
    '.DBbBBBBbBD.',
    '.DSBBBBBBSD.',
    '..DBBBBBBD..',
    '..DPPPPPPD..',
    '..DPPDDPPD..',
    '..DKK..KKD..',
  ];
  const SIDE = [                       // facing right
    '...DDDDDD...',
    '..DHHHHHHD..',
    '.DHHAHHHHSD.',
    '.DHHHHSSESD.',
    '.DHHHSSSSSSD',
    '..DHHSSSSSD.',
    '..DDSSSSSD..',
    '....DSSDD...',
    '...DBBBBBD..',
    '...DBBYBBBD.',
    '...DBBbbBBD.',
    '...DBSSBBBD.',
    '...DBBBBBBD.',
    '...DPPPPPD..',
    '...DPPDPPD..',
    '...DKKDKKKD.',
  ];
  const patch = (rows, over) => {
    const r = rows.slice();
    for (const [i, v] of Object.entries(over)) r[i] = v;
    return r;
  };
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('');
  };
  const flipH = (c) => {
    const o = document.createElement('canvas');
    o.width = c.width; o.height = c.height;
    const g = o.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
    return o;
  };

  function makeChar(c) {
    const pal = {
      D: '#1d1d2b', E: '#1d1d2b', H: c.hair, h: shade(c.hair, 1.6), A: c.clip || shade(c.hair, 1.6),
      S: c.skin, s: shade(c.skin, 0.85), C: '#f0a58f',
      B: c.shirt, b: shade(c.shirt, 0.8), Y: c.accent || shade(c.shirt, 1.25), W: '#fffdf5',
      P: c.pants, K: '#2b2b3a',
    };
    const m = (rows) => fromMap(rows, pal);
    const walk = {
      down: [m(patch(FRONT, { 14: '..DPPD.PPD..', 15: '..DKKD.KKD..' })), m(FRONT)],
      up: [m(patch(BACK, { 14: '..DPPD.PPD..', 15: '..DKKD.KKD..' })), m(BACK)],
      right: [
        m(patch(SIDE, { 14: '...DPPD.PPD.', 15: '..DKKKD.DKKD' })),
        m(patch(SIDE, { 14: '....DPPPD...', 15: '....DKKKD...' })),
      ],
    };
    walk.left = walk.right.map(flipH);
    return {
      a: m(FRONT),
      b: m(patch(FRONT, { 10: '.DSBBBBBBSD.', 11: '.DBBBBBBBBD.' })),                  // typing
      sleep: m(patch(FRONT, { 4: '.DSEESSEESD.' })),                                     // eyes closed
      jack: m(patch(FRONT, {                                                              // jumping jack
        7: '.S..DDDD..S.', 8: '.SDBBBBBBDS.', 9: '..DBBYYBBD..', 10: '..DBBBBBBD..', 11: '..DBBBBBBD..',
        14: '.DPPD..DPPD.', 15: '.DKKD..DKKD.',
      })),
      sideR: m(SIDE),
      sideL: flipH(m(SIDE)),
      walk,
    };
  }

  const claude = makeChar({ hair: '#3b2a26', skin: '#f2c9a0', shirt: '#d97757', pants: '#3d4a6b', accent: '#fff3e0', clip: '#d97757' });
  const helperColors = [
    { hair: '#2b2118', skin: '#f2c9a0', shirt: '#4f8fd9', pants: '#33415c' },
    { hair: '#7a4b2a', skin: '#c98f62', shirt: '#58b368', pants: '#3b3b4f' },
    { hair: '#1d1d2b', skin: '#8d5a3b', shirt: '#9a6fd1', pants: '#2f3a52' },
    { hair: '#c58b3a', skin: '#f5d6b8', shirt: '#e0b83e', pants: '#3d4a6b' },
    { hair: '#4a2c14', skin: '#e0b088', shirt: '#3fb8b0', pants: '#33415c' },
    { hair: '#2b2118', skin: '#a86c46', shirt: '#d9669a', pants: '#3b3b4f' },
  ];
  const helpers = helperColors.map(makeChar);

  // Desk with a CRT monitor (screen is drawn live on top). 32x24.
  const desk = canvas(32, 24, (g) => {
    const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    r(2, 0, 14, 11, '#5b6270');      // monitor bezel
    r(3, 1, 12, 8, '#10201c');       // screen
    r(7, 9, 4, 2, '#454b57');        // stand
    r(0, 10, 32, 4, '#d2a06a');      // desk top
    r(0, 10, 32, 1, '#e6bd8a');
    r(0, 14, 32, 10, '#a8723f');     // front
    r(0, 23, 32, 1, '#6e4724');
    r(1, 14, 2, 10, '#8a5a30');      // legs
    r(29, 14, 2, 10, '#8a5a30');
    r(18, 11, 10, 2, '#2d3340');     // keyboard
    r(19, 11, 8, 1, '#4a5263');
  });

  const door = canvas(16, 28, (g) => {
    g.fillStyle = '#4a2c14'; g.fillRect(0, 0, 16, 28);
    g.fillStyle = '#7a4b2a'; g.fillRect(2, 2, 12, 26);
    g.fillStyle = '#8f5c36'; g.fillRect(3, 3, 4, 10); g.fillRect(9, 3, 4, 10);
    g.fillRect(3, 15, 4, 10); g.fillRect(9, 15, 4, 10);
    g.fillStyle = '#f0c14a'; g.fillRect(11, 15, 2, 2);
  });

  const plant = canvas(10, 14, (g) => {
    const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    r(2, 9, 6, 5, '#b5653a'); r(2, 9, 6, 1, '#d98558');
    r(4, 5, 2, 5, '#2f7d3b');
    r(1, 2, 3, 4, '#3fa14d'); r(6, 1, 3, 5, '#3fa14d'); r(3, 0, 4, 4, '#58c264');
  });

  const windowSpr = canvas(24, 22, (g) => {
    const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    r(0, 0, 24, 22, '#e8e2d0');
    r(2, 2, 20, 18, '#9fd6ff');
    r(2, 2, 20, 6, '#bfe6ff');
    r(11, 2, 2, 18, '#e8e2d0'); r(2, 10, 20, 2, '#e8e2d0');
    r(5, 4, 5, 2, '#ffffff'); r(15, 13, 5, 2, '#ffffff');
  });

  const rack = canvas(14, 30, (g) => {
    const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    r(0, 0, 14, 30, '#2f3441');
    for (let i = 0; i < 5; i++) {
      r(1, 2 + i * 5, 12, 4, '#454c5e');
      r(2, 3 + i * 5, 2, 2, i % 2 ? '#58c264' : '#ffb454');
      r(6, 3 + i * 5, 5, 1, '#1d2230');
    }
  });

  const shelf = canvas(26, 32, (g) => {
    const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    r(0, 0, 26, 32, '#6e4724');
    r(2, 2, 22, 28, '#4a2c14');
    const cols = ['#d9669a', '#4f8fd9', '#e0b83e', '#58c264', '#d97757', '#9a6fd1'];
    for (let row = 0; row < 3; row++) {
      r(2, 10 + row * 9, 22, 1, '#8f5c36');
      for (let i = 0; i < 7; i++) r(3 + i * 3, 3 + row * 9 + (i % 2), 2, 7 - (i % 2), cols[(i + row) % cols.length]);
    }
  });

  const clock = canvas(10, 10, (g) => {
    const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    r(1, 0, 8, 10, '#e8e2d0'); r(0, 1, 10, 8, '#e8e2d0');
    r(2, 2, 6, 6, '#fffdf5');
    r(5, 3, 1, 3, '#1d1d2b'); r(5, 5, 2, 1, '#1d1d2b');
  });

  function drawBackground(W, H) {
    return canvas(W, H, (g) => {
      const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
      // floor checker
      for (let y = 40; y < H; y += 16) {
        for (let x = 0; x < W; x += 16) r(x, y, 16, 16, ((x + y) / 16) % 2 ? '#e8d9b5' : '#dccba3');
      }
      // wall
      r(0, 0, W, 40, '#7f9bbf');
      r(0, 30, W, 10, '#6a86ab');
      r(0, 38, W, 2, '#4c5f7a');
      r(0, 29, W, 1, '#8ea9cc');
      g.drawImage(door, 4, 12);
      g.drawImage(rack, 28, 10);
      g.drawImage(windowSpr, 56, 6);
      g.drawImage(plant, 86, 26);
      g.drawImage(clock, 115, 6);
      g.drawImage(windowSpr, 160, 6);
      g.drawImage(shelf, 200, 8);
      // a rug under the main desk
      r(92, 74, 56, 4, 'rgba(0,0,0,0)');
    });
  }

  return { claude, helpers, desk, drawBackground };
})();
