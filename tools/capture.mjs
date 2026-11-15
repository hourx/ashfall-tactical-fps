// Capture the screenshots the judge sees, from the real page, in headless Chromium.
// No dependencies: it talks to Chrome's DevTools protocol over the WebSocket that
// Node 22+ ships with. Usage:
//
//   node tools/capture.mjs                 # writes every shot in shots.json
//   node tools/capture.mjs --only play     # one shot
//
// It also forwards page console errors, so a broken module fails loudly here instead
// of silently producing a black frame.
//
// Ported from the macOS build: the Chrome path, the WebGL backend and the shot quality
// are read from the environment so the same script renders on a headless Linux box
// (SwiftShader) and on a Mac (real GPU). Screenshots are taken at the platform's
// ceiling, 1280x720, JPEG quality 97, so the dossier carries as much image as the
// gate allows.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const port = Number(process.env.ASHFALL_CDP_PORT ?? 9333);
const origin = process.env.ASHFALL_ORIGIN ?? 'http://127.0.0.1:8080';
const profile = process.env.ASHFALL_PROFILE ?? '/tmp/ashfall-capture-profile';
const quality = Number(process.env.ASHFALL_JPEG_QUALITY ?? 97);
const width = Number(process.env.ASHFALL_WIDTH ?? 1280);
const height = Number(process.env.ASHFALL_HEIGHT ?? 720);

// Chrome lives in a different place on every machine; ASHFALL_CHROME wins, then the
// two layouts this repository has actually been rendered on.
const CANDIDATES = [
  process.env.ASHFALL_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/root/.hermes/tools/chromium-1208/chrome-linux64/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

function findChrome() {
  for (const candidate of CANDIDATES) {
    try {
      statSync(candidate);
      return candidate;
    } catch {
      // Not this one.
    }
  }
  throw new Error(`no Chrome binary found; tried:\n  ${CANDIDATES.join('\n  ')}`);
}

const chrome = findChrome();

// Headless Linux has no GPU, so WebGL runs on SwiftShader: these flags turn it on
// rather than letting the page fall back to a black canvas.
const GPU_FLAGS = process.platform === 'linux'
  ? [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--disable-gpu-sandbox',
  ]
  : ['--enable-unsafe-swiftshader'];

rmSync(profile, { recursive: true, force: true });
mkdirSync(join(here, 'screenshots'), { recursive: true });

const child = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  `--window-size=${width},${height}`,
  '--force-device-scale-factor=1',
  ...GPU_FLAGS,
  'about:blank',
], { stdio: 'ignore' });

async function waitForDevtools() {
  for (let i = 0; i < 160; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Chrome did not expose a devtools page target');
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
        return;
      }
      this.events.push(message);
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
    const id = this.nextId;
    this.nextId += 1;
    this.pending.set(id, { resolve: () => {}, reject: () => {} });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  drainErrors() {
    const found = [];
    for (const event of this.events) {
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
        found.push(event.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
      }
      if (event.method === 'Runtime.exceptionThrown') {
        const detail = event.params.exceptionDetails;
        found.push(`${detail.text} ${detail.exception?.description ?? ''}`.trim());
      }
    }
    this.events.length = 0;
    return found;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const wsUrl = await waitForDevtools();
  const cdp = new Cdp(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Prove the page really rasterises before trusting any frame: a silent SwiftShader
  // failure renders a black canvas and every screenshot would be worthless.
  const probe = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'NO-WEBGL';
      return gl.getParameter(gl.VERSION) + ' | ' + gl.getParameter(gl.RENDERER);
    })()`,
    returnByValue: true,
  });
  console.log(`webgl: ${probe.result.value}`);

  let failures = 0;
  for (const shot of shots) {
    if (only && !shot.name.includes(only)) continue;
    const url = `${origin}/index.html${shot.query}`;
    await cdp.send('Page.navigate', { url });
    let ready = false;
    for (let i = 0; i < 240; i += 1) {
      await sleep(100);
      const check = await cdp.send('Runtime.evaluate', {
        expression: 'Boolean(window.__shotReady)',
        returnByValue: true,
      });
      if (check.result.value) {
        ready = true;
        break;
      }
    }
    const errors = cdp.drainErrors();
    if (errors.length) {
      failures += 1;
      console.error(`[${shot.name}] page errors:\n  ${errors.join('\n  ')}`);
    }
    if (!ready) {
      failures += 1;
      console.error(`[${shot.name}] window.__shotReady never set`);
      continue;
    }
    // One extra frame so the compositor has the finished canvas.
    await sleep(400);
    const capture = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality });
    const bytes = Buffer.from(capture.data, 'base64');
    writeFileSync(join(here, 'screenshots', shot.name), bytes);
    console.log(`[${shot.name}] ${(bytes.length / 1024).toFixed(0)} KiB  ${url}`);
  }

  child.kill('SIGKILL');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  child.kill('SIGKILL');
  process.exit(1);
});
