// Sends a scripted run of fake hook events so you can watch the office without Claude.
// Usage: node scripts/demo.js   (server must be running)
const http = require('http');
const PORT = Number(process.env.PIXEL_OFFICE_PORT) || 4321;
const sid = 'demo-' + Date.now();
const cwd = 'C:/demo/my-project';

function post(ev) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ session_id: sid, cwd, ...ev });
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/event', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume(); res.on('end', resolve); }
    );
    req.on('error', (e) => { console.error('Is the server running? ' + e.message); process.exit(1); });
    req.end(body);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const steps = [
  [{ hook_event_name: 'SessionStart' }, 800],
  [{ hook_event_name: 'UserPromptSubmit', prompt: 'Add dark mode to the settings page and fix the login bug' }, 2200],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'C:/demo/src/settings.tsx' } }, 1800],
  [{ hook_event_name: 'PostToolUse', tool_name: 'Read' }, 1200],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'useTheme' } }, 1800],
  [{ hook_event_name: 'PostToolUse', tool_name: 'Grep' }, 800],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 't1', tool_input: { subagent_type: 'Explore', description: 'Find login code' } }, 400],
  [{ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' }, 600],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 't2', tool_input: { subagent_type: 'Plan', description: 'Plan theme tokens' } }, 400],
  [{ hook_event_name: 'SubagentStart', agent_id: 'a2', agent_type: 'Plan' }, 4000],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Grep', agent_id: 'a1', tool_input: { pattern: 'login' } }, 2200],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Read', agent_id: 'a1', tool_input: { file_path: 'src/auth/login.ts' } }, 2200],
  [{ hook_event_name: 'PreToolUse', tool_name: 'WebSearch', agent_id: 'a2', tool_input: {} }, 2200],
  [{ hook_event_name: 'SubagentStop', agent_id: 'a1' }, 2500],
  [{ hook_event_name: 'SubagentStop', agent_id: 'a2' }, 600],
  [{ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 't1' }, 300],
  [{ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 't2' }, 3500],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:/demo/src/settings.tsx' } }, 2200],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { description: 'Run the test suite', command: 'npm test' } }, 2500],
  [{ hook_event_name: 'Notification' }, 2500],
  [{ hook_event_name: 'Stop' }, 6000],
  [{ hook_event_name: 'SessionEnd' }, 0],
];

(async () => {
  for (const [ev, wait] of steps) {
    await post(ev);
    console.log(ev.hook_event_name, ev.tool_name || ev.agent_type || '');
    await sleep(wait);
  }
  console.log('demo finished');
})();
