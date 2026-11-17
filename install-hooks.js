// Adds (or removes) the Pixel Office hooks in ~/.claude/settings.json.
//   node install-hooks.js              install
//   node install-hooks.js --uninstall  remove
// A timestamped backup of settings.json is written before any change.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK = path.join(__dirname, 'hook.js').replace(/\\/g, '/');
const COMMAND = 'node "' + HOOK + '"';
const EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'SubagentStart', 'SubagentStop', 'PermissionRequest', 'Notification', 'Stop', 'SessionEnd',
];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PermissionRequest']);
const isOurs = (h) => h && typeof h.command === 'string' && h.command.replace(/\\/g, '/').includes(HOOK);

const uninstall = process.argv.includes('--uninstall');

let settings = {};
if (fs.existsSync(SETTINGS)) {
  const raw = fs.readFileSync(SETTINGS, 'utf8');
  try {
    settings = JSON.parse(raw);
  } catch (e) {
    console.error('Could not parse ' + SETTINGS + ' (' + e.message + '). Nothing changed.');
    process.exit(1);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(SETTINGS + '.bak-' + stamp, raw);
  console.log('Backup written: ' + SETTINGS + '.bak-' + stamp);
} else {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
}

settings.hooks = settings.hooks || {};
for (const ev of EVENTS) {
  // drop any previous Pixel Office entries, keep everyone else's
  const groups = (settings.hooks[ev] || [])
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length > 0);
  if (!uninstall) {
    const group = { hooks: [{ type: 'command', command: COMMAND }] };
    if (TOOL_EVENTS.has(ev)) group.matcher = '*';
    groups.push(group);
  }
  if (groups.length) settings.hooks[ev] = groups;
  else delete settings.hooks[ev];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;

fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
console.log(uninstall ? 'Pixel Office hooks removed.' : 'Pixel Office hooks installed for: ' + EVENTS.join(', '));
console.log('Hooks load when a Claude Code session starts, so restart running sessions.');
