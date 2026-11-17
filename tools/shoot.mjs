// Takes the entry's screenshots (Node 22+, standard library only): serves app/ with serve.ts, starts headless Chrome,
// drives it over the DevTools protocol with Node's built-in WebSocket and, for each shot of shots.json, opens its
// first route, then follows its `via` routes the way a reader clicks through (so the top bar counts that one view's
// requests), waits for window.__shotReady and the images, and captures a JPEG under 256 KiB. Nothing is edited after.
//   node tools/shoot.mjs [outDir] [--chrome <path>] [--profile <dir>] [--only <file>] [--shots <other shots.json>]
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = args[0] && !args[0].startsWith('--') ? args[0] : new URL('screenshots/', root).pathname.replace(/^\/(\w:)/, '$1');
const chromePath = opt('--chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const profile = opt('--profile', join(tmpdir(), 'makefun-shots-profile'));
const only = opt('--only', '');
const APP_PORT = 8123, CDP_PORT = 9333, MAX_BYTES = 256 * 1024;
const shotList = opt('--shots', new URL('shots.json', root));
const shots = JSON.parse(readFileSync(shotList, 'utf8')).filter((s) => !only || s.file == only);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['serve.ts', '--port', String(APP_PORT)], { cwd: root, stdio: 'ignore' });
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });

async function browserSocketURL() {
  for (let i = 0; i < 100; i++) {
    try {
      return (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await browserSocketURL());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let lastId = 0;
const waiting = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id != null && waiting.has(m.id)) {
    const { resolve, reject } = waiting.get(m.id);
    waiting.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method == 'Runtime.exceptionThrown') console.log('  page exception:', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  else if (m.method == 'Runtime.consoleAPICalled' && m.params.type == 'error') console.log('  console.error:', m.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (m.method == 'Log.entryAdded' && m.params.entry.level == 'error') console.log('  log:', m.params.entry.text, m.params.entry.url ?? '');
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++lastId;
  waiting.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

try {
  mkdirSync(outDir, { recursive: true });
  for (const shot of shots) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    const value = async (expr) => (await s('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    const settle = async (label) => {
      await sleep(150);
      let ok = false;
      for (let i = 0; i < 300 && !(ok = await value('window.__shotReady === true')); i++) await sleep(100);
      if (!ok) console.log(`  ${shot.file}: __shotReady never turned true at ${label}`);
      for (let i = 0; i < 80 && !(await value('[...document.images].every((i) => i.complete)')); i++) await sleep(100);
    };
    const { width, height } = shot.viewport;
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await Promise.all([s('Page.enable'), s('Runtime.enable'), s('Log.enable')]);
    const [first, ...then] = [...(shot.via ?? []), shot.path];
    await s('Page.navigate', { url: `http://localhost:${APP_PORT}/${first}` });
    await settle(first);
    for (const hash of then) {
      await value(`location.hash = ${JSON.stringify(hash)}`);
      await settle(hash);
    }
    await sleep(1500);
    let quality = 90, bytes;
    do {
      const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
      bytes = Buffer.from(data, 'base64');
      quality -= 5;
    } while (bytes.length > MAX_BYTES && quality > 30);
    writeFileSync(join(outDir, shot.file), bytes);
    console.log(`${shot.file}: ${[first, ...then].join(' -> ')} ${width}x${height}, ${bytes.length} bytes, quality ${quality + 5}`);
    await send('Target.closeTarget', { targetId });
  }
} finally {
  ws.close();
  chrome.kill();
  server.kill();
}
