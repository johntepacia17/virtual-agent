// Pixel Office server: receives Claude Code hook events, keeps an in-memory
// picture of what every session / subagent is doing, and streams it to the
// browser over Server-Sent Events. No dependencies. Listens on localhost only.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PIXEL_OFFICE_PORT) || 4321;
const DEBUG = !!process.env.DEBUG;
const PUBLIC = path.join(__dirname, 'public');

const sessions = new Map(); // session_id -> session
const clients = new Set();
let seq = 0;

// ---------- helpers ----------
const short = (s, n) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
const isAgentTool = (n) => n === 'Agent' || n === 'Task';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Show "folder/file" instead of a full path.
function folderFile(p) {
  const parts = String(p || '').split(/[\\/]/).filter(Boolean);
  if (!parts.length) return 'a file';
  return parts.length > 1 ? parts[parts.length - 2] + '/' + parts[parts.length - 1] : parts[0];
}

// Shorten a shell command: drop a leading "cd <dir> &&" and turn absolute paths into their last folder.
function friendlyCommand(cmd) {
  cmd = String(cmd || '').trim();
  const m = cmd.match(/^cd\s+("[^"]*"|'[^']*'|[^&;|\s]+)\s*(?:&&|;)\s*([\s\S]*)$/);
  if (m && m[2].trim()) cmd = m[2].trim();
  cmd = cmd.replace(/(?:[A-Za-z]:[\\/]|~[\\/]|\/)[^\s"'|&;]*/g, (p) => base(p) || p);
  return cmd;
}

function describeTool(name, input) {
  input = input || {};
  switch (name) {
    case 'Read': {
      const f = short(folderFile(input.file_path), 20);
      return pick([`Peeking at ${f}`, `Ooh, reading ${f}!`, `Let's see ${f}…`]);
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit': {
      const f = short(folderFile(input.file_path || input.notebook_path), 20);
      return pick([`Tweaking ${f}!`, `Hammering ${f}!`, `Fixing up ${f}`, `Writing ${f}!`]);
    }
    case 'Bash':
    case 'PowerShell': {
      const c = short(input.description || friendlyCommand(input.command), 20);
      return pick([`Beep boop: ${c}`, `Casting: ${c}`, `Running ${c}!`]);
    }
    case 'Grep':
    case 'Glob': {
      const p = short(input.pattern, 14);
      return pick([`Hunting "${p}"`, `Where's "${p}"?`, `Sniffing "${p}"`]);
    }
    case 'WebFetch':
    case 'WebSearch': return pick(['Surfing the web!', 'Asking the internet…', 'Browsing, brb!']);
    case 'Agent':
    case 'Task': return pick([`Hey buddy! ${short(input.description, 18)}`, `Calling help: ${short(input.description, 18)}`]);
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate': return pick(['Making a plan!', 'Plotting…', 'Checklist time!']);
    default: {
      const n = String(name).startsWith('mcp__') ? String(name).split('__').pop() : name;
      return pick([`Trying ${short(n, 16)}!`, `Ooh, ${short(n, 16)}!`]);
    }
  }
}

// What Claude says while asking you for permission to run a tool.
function permissionText(name, input) {
  input = input || {};
  switch (name) {
    case 'Bash':
    case 'PowerShell': return `Can I run ${short(input.description || friendlyCommand(input.command), 16)}?`;
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit': return `May I edit ${short(folderFile(input.file_path || input.notebook_path), 16)}?`;
    case 'Read': return `May I peek at ${short(folderFile(input.file_path), 14)}?`;
    case 'WebFetch':
    case 'WebSearch': return 'Can I browse the web?';
    case 'Agent':
    case 'Task': return 'Can I call a buddy?';
    default: return `May I use ${short(String(name).startsWith('mcp__') ? String(name).split('__').pop() : name, 14)}?`;
  }
}

const THINKING =['Hmm, thinking…', 'Thinking hard…', 'Brain go brrr…', 'Hmm hmm hmm…', 'Let me think…'];

// ---------- state ----------
function getSession(id, cwd) {
  let s = sessions.get(id);
  if (!s) {
    s = {
      id,
      name: base(cwd) || 'session',
      lastSeen: Date.now(),
      agents: new Map(),
      pending: [], // fallback helper ids spawned from PreToolUse(Agent) awaiting SubagentStart
      idleTimer: null,
    };
    s.agents.set('main', newAgent('main', 'main', 'Claude', 'Ready to work!', 'idle'));
    sessions.set(id, s);
  } else if (cwd && !s.name) {
    s.name = base(cwd);
  }
  return s;
}

function newAgent(id, kind, label, bubble, status) {
  // uid stays constant for the browser even if `id` is later swapped for the real agent_id
  return { id, uid: id, kind, label, bubble, status, updated: Date.now(), tu: null, real: kind === 'main' };
}

function say(s, a, text, status) {
  a.bubble = text;
  a.status = status || a.status;
  a.updated = Date.now();
  logEntry(s, a, text);
}

function addHelper(s, id, label, text, tu) {
  const h = newAgent(id, 'helper', short(label || 'helper', 10), short(text || 'Reporting for duty!', 28), 'working');
  h.tu = tu || null;
  s.agents.set(id, h);
  logEntry(s, h, 'joined the office');
  return h;
}

function markDone(s, h) {
  if (!h || h.status === 'done') return;
  h.status = 'done';
  h.bubble = pick(['Mission done!', 'Done! Bye!', 'Ta-da!']);
  h.updated = Date.now();
  logEntry(s, h, 'finished');
  setTimeout(() => {
    if (s.agents.get(h.id) === h) {
      s.agents.delete(h.id);
      broadcastState();
    }
  }, 4000);
}

function handle(p) {
  const ev = p.hook_event_name;
  if (!ev) return;
  const s = getSession(p.session_id || 'unknown', p.cwd);
  s.lastSeen = Date.now();
  const main = s.agents.get('main');
  if (s.idleTimer) { clearTimeout(s.idleTimer); s.idleTimer = null; }
  const target = p.agent_id && s.agents.has(p.agent_id) ? s.agents.get(p.agent_id) : main;
  const input = p.tool_input || {};

  switch (ev) {
    case 'SessionStart':
      say(s, main, pick(['Ready! Let\'s go!', 'Coffee time? Ready!']), 'idle');
      break;
    case 'UserPromptSubmit':
      say(s, main, pick(['On it, boss!', 'Ooh, a new quest!', 'Challenge accepted!', 'Let me cook…', 'Rolling up my sleeves!']), 'working');
      break;
    case 'PreToolUse': {
      say(s, target, describeTool(p.tool_name, input), 'working');
      if (isAgentTool(p.tool_name)) {
        const id = 'tu:' + (p.tool_use_id || ++seq);
        addHelper(s, id, input.subagent_type || 'helper', input.description || input.prompt, p.tool_use_id);
        s.pending.push(id);
      }
      break;
    }
    case 'PostToolUse': {
      if (isAgentTool(p.tool_name)) {
        // Only fall back to closing here if SubagentStart never adopted this helper
        // (background agents return immediately but keep running).
        const h = [...s.agents.values()].find((x) => x.tu && x.tu === p.tool_use_id && !x.real);
        if (h) { s.pending = s.pending.filter((i) => i !== h.id); markDone(s, h); }
      }
      say(s, target, pick(THINKING), 'working');
      break;
    }
    case 'SubagentStart': {
      const label = p.agent_type || 'helper';
      const oldId = s.pending.shift();
      const h = oldId && s.agents.get(oldId);
      if (h) {
        s.agents.delete(oldId);
        h.id = p.agent_id || oldId;
        h.real = !!p.agent_id;
        if (p.agent_type) h.label = short(p.agent_type, 10);
        s.agents.set(h.id, h);
      } else if (p.agent_id) {
        const n = addHelper(s, p.agent_id, label, 'On it!');
        n.real = true;
      }
      break;
    }
    case 'SubagentStop': {
      const h = s.agents.get(p.agent_id);
      if (h && h.kind === 'helper') markDone(s, h);
      break;
    }
    case 'PermissionRequest':
      say(s, target, permissionText(p.tool_name, input), 'permission');
      break;
    case 'Notification': {
      const msg = String(p.message || '');
      if (p.notification_type === 'permission_prompt' || /permission/i.test(msg)) {
        // PermissionRequest (if the hook fired) already set a more specific bubble.
        if (!(main.status === 'permission' && Date.now() - main.updated < 10000)) {
          const m = msg.match(/use\s+([\w-]+)/i);
          say(s, main, m ? `May I use ${short(m[1], 14)}?` : 'Permission, please?', 'permission');
        }
      } else {
        say(s, main, pick(['Psst! Need you!', 'Hey! Your turn!', 'Waiting for you!']), 'waiting');
      }
      break;
    }
    case 'Stop':
      for (const h of s.agents.values()) if (h.kind === 'helper') markDone(s, h);
      say(s, main, pick(['All done! Yay!', 'Nailed it!', 'Done! High five!']), 'done');
      s.idleTimer = setTimeout(() => {
        main.bubble = 'Zzz… nap time';
        main.status = 'idle';
        broadcastState();
      }, 20000);
      break;
    case 'SessionEnd':
      sessions.delete(s.id);
      break;
    default:
      return;
  }
  broadcastState();
}

// ---------- SSE ----------
function snapshot() {
  return {
    sessions: [...sessions.values()].map((s) => ({
      id: s.id,
      name: s.name,
      lastSeen: s.lastSeen,
      agents: [...s.agents.values()].map((a) => ({
        id: a.uid, kind: a.kind, label: a.label, status: a.status, bubble: a.bubble,
      })),
    })),
  };
}

function send(res, event, data) {
  res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
}
function broadcastState() {
  const snap = snapshot();
  for (const c of clients) send(c, 'state', snap);
}
function logEntry(s, a, text) {
  const entry = { t: Date.now(), session: s.name, who: a.kind === 'main' ? 'Claude' : a.label, text };
  for (const c of clients) send(c, 'log', entry);
}

// ---------- http ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && url === '/event') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const p = JSON.parse(body);
        if (DEBUG) fs.appendFile(path.join(__dirname, 'events.log'), JSON.stringify(p) + '\n', () => {});
        handle(p);
      } catch (e) {
        if (DEBUG) console.error('bad event', e.message);
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === 'GET' && url === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    send(res, 'state', snapshot());
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'GET') {
    const rel = url === '/' ? 'index.html' : decodeURIComponent(url).replace(/^[/\\]+/, '');
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep) && file !== PUBLIC) {
      res.writeHead(403); return res.end('forbidden');
    }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
    return;
  }

  res.writeHead(405);
  res.end();
});

setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 15000);

// Drop stale sessions / helpers.
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > 10 * 60 * 1000) { sessions.delete(id); changed = true; continue; }
    for (const [aid, a] of s.agents) {
      if (a.kind === 'helper' && now - a.updated > 10 * 60 * 1000) { s.agents.delete(aid); changed = true; }
    }
  }
  if (changed) broadcastState();
}, 30000);

server.listen(PORT, '127.0.0.1', () => {
  console.log('Pixel Office running at http://localhost:' + PORT + (DEBUG ? '  (DEBUG: logging to events.log)' : ''));
});
