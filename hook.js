// Claude Code hook relay: reads the hook JSON from stdin and forwards it to the
// local Pixel Office server. Never prints anything and always exits 0, so it can
// never block or alter Claude Code, even when the server is not running.
const http = require('http');

const PORT = Number(process.env.PIXEL_OFFICE_PORT) || 4321;
let data = '';

setTimeout(() => process.exit(0), 1500); // hard safety net

process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { data += c; });
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  if (!data.trim()) return process.exit(0);
  const req = http.request(
    {
      host: '127.0.0.1',
      port: PORT,
      path: '/event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 800,
    },
    (res) => {
      res.resume();
      res.on('end', () => process.exit(0));
    }
  );
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(data);
});
