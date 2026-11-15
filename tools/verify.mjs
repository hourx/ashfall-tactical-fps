// Behaviour checks the smoke test does not cover: a bot carrier plants, a defender
// defuses, a thrown frag hurts a body, and the bomb moves to a live attacker when the
// carrier dies. Each stage drives the real page through DevTools, so this is the same
// code path a player gets.
// Usage: node tools/verify.mjs [port]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const port = Number(process.argv[2] ?? 9337);
const profile = `/private/var/folders/rc/6wtyqsbn0td683k7ynjk7z7h0000gn/T/ashfall-verify-${port}`;
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

async function deploy(cdp) {
  await cdp.send('Page.navigate', { url: `${origin}/index.html` });
  await sleep(2500);
  await cdp.eval("document.getElementById('screen-action').click()");
  // Let freeze time run out so the round is live.
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    const phase = await cdp.eval('window.__ashfall.match.state.phase');
    if (phase === 'live') return;
  }
  throw new Error('round never went live');
}

async function main() {
  const cdp = new Cdp(await target());
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await deploy(cdp);

  const results = [];

  // 1. Bot carrier walks into site A and plants.
  const staged = await cdp.eval(`(() => {
    const g = window.__ashfall;
    const m = g.match.state;
    const bot = g.bots.find((b) => b.team === 'attack' && b.alive);
    m.bomb.carrier = bot;
    m.bomb.planted = false;
    m.bomb.targetSite = 'A';
    bot.carryBomb = true;
    bot.pos.set(-15.5, 0, -10.5);
    bot.body.vel.set(0, 0, 0);
    bot.state = 'patrol';
    bot.routeIndex = 0;
    for (const d of g.bots.filter((b) => b.team === 'defend')) {
      d.pos.set(d.pos.x, 0, 14);
      d.body.vel.set(0, 0, 0);
    }
    return { carrier: bot.name, phase: m.phase };
  })()`);
  let planted = false;
  for (let i = 0; i < 24; i += 1) {
    await sleep(250);
    planted = await cdp.eval('window.__ashfall.match.state.bomb.planted');
    if (planted) break;
  }
  results.push({ name: 'bot plants', ok: planted === true, detail: { ...staged, planted } });

  // 2. A defender that reaches the bomb defuses it.
  if (planted) {
    await cdp.eval(`(() => {
      const g = window.__ashfall;
      const m = g.match.state;
      // Clear the site so the defuse is a defuse, not a firefight.
      for (const a of g.bots.filter((b) => b.team === 'attack')) {
        a.pos.set(18, 0, 17);
        a.body.vel.set(0, 0, 0);
      }
      const d = g.bots.find((b) => b.team === 'defend' && b.alive);
      if (!d) return;
      d.pos.set(m.bomb.x, 0, m.bomb.z);
      d.body.vel.set(0, 0, 0);
      d.state = 'patrol';
      d.routeIndex = 0;
    })()`);
    let defused = false;
    for (let i = 0; i < 40; i += 1) {
      await sleep(250);
      defused = await cdp.eval('window.__ashfall.match.state.bomb.defused');
      if (defused) break;
    }
    results.push({ name: 'defender defuses', ok: defused === true, detail: { defused } });
  } else {
    results.push({ name: 'defender defuses', ok: false, detail: 'skipped: no plant' });
  }

  // 3. A frag thrown at a body in the open takes health off it.
  await deploy(cdp);
  const fragStage = await cdp.eval(`(() => {
    const g = window.__ashfall;
    const p = g.player;
    p.pos.set(0, 0, 10);
    p.body.vel.set(0, 0, 0);
    p.yaw = 0;
    p.pitch = -0.45;
    p.alive = true;
    p.health = 100;
    p.grenades = 1;
    p.ammo.ember = { mag: 1, reserve: 0 };
    p.lastThrow = -10;
    const d = g.bots.find((b) => b.team === 'defend');
    d.pos.set(0, 0, 4);
    d.body.vel.set(0, 0, 0);
    d.health = 100;
    d.alive = true;
    d.state = 'hold';
    d.holdAnchor = d.pos.clone();
    d.holdUntil = 999;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
    return { phase: g.match.state.phase, target: d.name };
  })()`);
  await sleep(2600);
  const fragResult = await cdp.eval(`(() => {
    const g = window.__ashfall;
    const d = g.bots.find((b) => b.team === 'defend' && b.name === ${JSON.stringify(fragStage.target)});
    return { health: Math.round(d.health), alive: d.alive, grenades: g.player.grenades };
  })()`);
  results.push({
    name: 'frag damages a body',
    ok: fragResult.health < 100,
    detail: { ...fragStage, ...fragResult },
  });

  // 4. Killing the carrier before the plant hands the charge to a live attacker.
  const handoff = await cdp.eval(`(() => {
    const g = window.__ashfall;
    const m = g.match.state;
    const carrier = g.bots.find((b) => b.team === 'attack' && b.alive);
    m.bomb.planted = false;
    m.bomb.carrier = carrier;
    carrier.carryBomb = true;
    g.match.applyDamage(carrier, 500, 'body', g.player, 'vantage');
    return {
      carrierName: carrier.name,
      dead: !carrier.alive,
      nextCarrier: m.bomb.carrier ? m.bomb.carrier.name : null,
      carriers: g.bots.filter((b) => b.carryBomb).map((b) => b.name),
    };
  })()`);
  results.push({
    name: 'bomb handoff on carrier death',
    ok: handoff.dead && handoff.nextCarrier !== null && handoff.nextCarrier !== handoff.carrierName,
    detail: handoff,
  });

  // 5. The buy menu sells a frag and the inventory/HUD count follows it.
  const bought = await cdp.eval(`(() => {
    const g = window.__ashfall;
    const m = g.match.state;
    m.phase = 'freeze';
    m.phaseTime = 6;
    g.player.money = 1000;
    g.player.grenades = 0;
    g.player.ammo.ember = { mag: 0, reserve: 0 };
    const result = g.match.buy('ember');
    g.player.alive = true;
    return {
      ok: result.ok,
      why: result.why ?? null,
      grenades: g.player.grenades,
      money: g.player.money,
    };
  })()`);
  const hudAfterBuy = await cdp.eval(`(() => {
    const m = window.__ashfall.match.state;
    m.phase = 'live';
    m.phaseTime = 60;
    return true;
  })()`);
  await sleep(400);
  const fragLabel = await cdp.eval("document.getElementById('frags').textContent");
  results.push({
    name: 'buy a frag',
    ok: bought.ok && bought.grenades === 1 && bought.money === 700 && fragLabel === 'FRAG ×1',
    detail: { ...bought, hudAfterBuy, fragLabel },
  });

  // 6. A seventh round win ends the series and offers a redeploy.
  const series = await cdp.eval(`(() => {
    const g = window.__ashfall;
    const m = g.match.state;
    m.score.attack = 6;
    m.score.defend = 0;
    m.phase = 'live';
    m.phaseTime = 60;
    m.result = null;
    for (const d of g.bots.filter((b) => b.team === 'defend')) {
      if (d.alive) g.match.applyDamage(d, 500, 'body', g.player, 'vantage');
    }
    return { score: m.score.attack + '-' + m.score.defend, phase: m.phase };
  })()`);
  let matchOver = false;
  for (let i = 0; i < 30; i += 1) {
    await sleep(250);
    matchOver = (await cdp.eval('window.__ashfall.match.state.phase')) === 'matchover';
    if (matchOver) break;
  }
  results.push({ name: 'seventh win ends the series', ok: matchOver, detail: series });

  for (const result of results) console.log(result.ok ? 'PASS' : 'FAIL', '-', result.name, JSON.stringify(result.detail));
  console.log('errors:', cdp.errors.length);
  for (const error of cdp.errors.slice(0, 5)) console.log('  -', String(error).split('\n')[0]);

  child.kill('SIGKILL');
  process.exit(cdp.errors.length || results.some((result) => !result.ok) ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  child.kill('SIGKILL');
  process.exit(1);
});
