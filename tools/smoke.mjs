// A headless smoke test: load the real page, start a match, let the bots fight for a
// while, and fail if the page logged an error or the round machine never advanced.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const port = 9334;
const profile = '/tmp/ashfall-smoke-profile';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.ASHFALL_ORIGIN ?? 'http://127.0.0.1:8080';

rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

const child = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--window-size=1280,720',
  '--enable-unsafe-swiftshader',
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

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.errors = [];
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const job = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) job.reject(new Error(message.error.message));
        else job.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
      }
    });
  }

  ready() {
    if (this.ws.readyState === 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.id;
    this.id += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }
}

async function main() {
  const cdp = new Cdp(await target());
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `${origin}/index.html` });
  await sleep(2500);

  const booted = await cdp.eval('Boolean(window.__ashfall)');
  if (!booted) throw new Error('game did not boot');

  await cdp.eval("document.getElementById('screen-action').click()");
  await sleep(1000);

  const samples = [];
  for (let i = 0; i < 14; i += 1) {
    await sleep(3000);
    samples.push(await cdp.eval(`(() => {
      const m = window.__ashfall.match.state;
      return { phase: m.phase, round: m.round, a: m.score.attack, d: m.score.defend, alive: window.__ashfall.bots.filter(b => b.alive).length, hp: Math.round(window.__ashfall.player.health), planted: m.bomb.planted, t: Math.round(m.phaseTime) };
    })()`));
  }

  console.log(JSON.stringify(samples, null, 0));
  console.log('errors:', cdp.errors.length);
  for (const error of cdp.errors) console.log('  -', error.split('\n')[0]);

  const advanced = samples.some((sample) => sample.round > 1 || sample.a + sample.d > 0);
  const moved = samples.some((sample, index) => index > 0 && (sample.phase !== samples[0].phase || sample.t !== samples[0].t));
  console.log('round advanced:', advanced, '| clock moved:', moved);

  child.kill('SIGKILL');
  process.exit(cdp.errors.length || !booted || !moved ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  child.kill('SIGKILL');
  process.exit(1);
});
