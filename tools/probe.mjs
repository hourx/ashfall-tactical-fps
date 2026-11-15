// A longer headless session: start a match, let it run, and print the round machine's
// state every few seconds so a stuck round or a bot that never plants is obvious.
// Usage: node tools/probe.mjs [seconds] [port]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const seconds = Number(process.argv[2] ?? 150);
const port = Number(process.argv[3] ?? 9336);
const profile = `/private/var/folders/rc/6wtyqsbn0td683k7ynjk7z7h0000gn/T/ashfall-probe-${port}`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.ASHFALL_ORIGIN ?? 'http://127.0.0.1:8080';

rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

const child = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,720',
  '--enable-unsafe-swiftshader',
  '--mute-audio',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function target() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((entry) => entry.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // still booting
    }
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const ws = new WebSocket(await target());
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let id = 1;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const messageId = id;
  id += 1;
  pending.set(messageId, resolve);
  ws.send(JSON.stringify({ id: messageId, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `${origin}/index.html` });
await sleep(2500);
await send('Runtime.evaluate', { expression: "document.getElementById('screen-action').click()" });

const samples = Math.ceil(seconds / 5);
for (let i = 0; i < samples; i += 1) {
  await sleep(5000);
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const s = window.__ashfall.match.state;
      const bots = window.__ashfall.bots;
      return JSON.stringify({
        phase: s.phase,
        round: s.round,
        score: s.score.attack + '-' + s.score.defend,
        clock: Math.round(s.phaseTime),
        planted: s.bomb.planted,
        fuse: Math.round(s.bomb.timer),
        alive: bots.filter((b) => b.alive).length + (window.__ashfall.player.alive ? 1 : 0),
        states: bots.map((b) => b.alive ? b.state[0] : 'x').join(''),
        hp: Math.round(window.__ashfall.player.health),
      });
    })()`,
    returnByValue: true,
  });
  console.log(result.result.value);
}

console.log('errors:', errors.length);
for (const error of errors.slice(0, 6)) console.log('  -', String(error).split('\n')[0]);
child.kill('SIGKILL');
process.exit(errors.length ? 1 : 0);
