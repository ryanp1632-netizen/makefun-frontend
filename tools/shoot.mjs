// Takes the entry's screenshots (Node 22+, standard library only): serves app/ with serve.ts, starts headless Chrome,
// drives it over the DevTools protocol with Node's built-in WebSocket, opens each route of shots.json at its viewport,
// waits for window.__shotReady and the images, and captures a JPEG under 256 KiB. Nothing is edited afterwards.
//   node tools/shoot.mjs [outDir] [--chrome <path>] [--profile <dir>] [--only <file>] [--shots <shots.json>]
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const outDir = args[0] && !args[0].startsWith('--') ? args[0] : new URL('screenshots/', root).pathname.replace(/^\/(\w:)/, '$1');
const chromePath = opt('--chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const profile = opt('--profile', join(tmpdir(), 'makefun-shots-profile'));
const only = opt('--only', '');
const APP_PORT = 8123, CDP_PORT = 9333, MAX_BYTES = 256 * 1024;
const shots = JSON.parse(readFileSync(opt('--shots', new URL('shots.json', root)), 'utf8')).filter((s) => !only || s.file == only);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['serve.ts', '--port', String(APP_PORT)], { cwd: root, stdio: 'ignore' });
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });

async function browserSocketURL() {
  for (let i = 0; i < 100; i++) {
    try { return (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(100); }
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await browserSocketURL());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id != null && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method == 'Runtime.exceptionThrown') console.log('  page exception:', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  else if (m.method == 'Runtime.consoleAPICalled' && m.params.type == 'error') console.log('  console.error:', m.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (m.method == 'Log.entryAdded' && m.params.entry.level == 'error') console.log('  log:', m.params.entry.text, m.params.entry.url ?? '');
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

try {
  mkdirSync(outDir, { recursive: true });
  for (const shot of shots) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    const { width, height } = shot.viewport;
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await Promise.all([s('Page.enable'), s('Runtime.enable'), s('Log.enable')]);
    if (shot.dark) await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    // A shot with "from" opens that route first and then follows a link to its own, as a visitor would, so the header's
    // request count shows what the app reuses from memory.
    await s('Page.navigate', { url: `http://localhost:${APP_PORT}/${shot.from ?? shot.path}` });
    const ready = async (expr) => (await s('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    let ok = false;
    for (let i = 0; i < 300 && !(ok = await ready('window.__shotReady === true')); i++) await sleep(100);
    if (shot.from) {
      await sleep(400);
      await ready(`window.__shotReady = false, location.hash = ${JSON.stringify(shot.path)}`);
      for (let i = 0; i < 300 && !(ok = await ready('window.__shotReady === true')); i++) await sleep(100);
    }
    if (!ok) console.log(`  ${shot.file}: __shotReady never turned true`);
    if (shot.click) await ready(`document.querySelector(${JSON.stringify(shot.click)})?.click()`), await sleep(300);
    if (shot.eval) await ready(shot.eval), await sleep(1500); // test-only: run a script in the page (keys, typing) before the shot
    for (let i = 0; i < 80 && !(await ready('[...document.images].every((i) => i.complete)')); i++) await sleep(100);
    await sleep(1200);
    let quality = 90, bytes;
    do {
      const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
      bytes = Buffer.from(data, 'base64');
      quality -= 5;
    } while (bytes.length > MAX_BYTES && quality > 30);
    writeFileSync(join(outDir, shot.file), bytes);
    console.log(`${shot.file}: ${shot.path} ${width}x${height}, ${bytes.length} bytes, quality ${quality + 5}`);
    await send('Target.closeTarget', { targetId });
  }
} finally {
  ws.close();
  chrome.kill();
  server.kill();
}
