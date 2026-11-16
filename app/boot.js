// The only module of the first load: the API cache (memory + ETag), the hash router, the per-view request
// counter and the one-second countdown ticker. Every view is a module fetched by import() when its route opens.
export const API = 'https://make.fun/api';
const memo = new Map(); // path -> { etag, data, minute }
const inflight = new Map();
export const viewStats = { net: 0, unchanged: 0, memory: 0 };
const $reqs = document.getElementById('reqs');
const minuteNow = () => Math.floor(Date.now() / 6e4);

function showRequestCount() {
  const s = viewStats;
  $reqs.innerHTML = `<span>this view: </span>${s.net} API request${s.net == 1 ? '' : 's'} · ${s.unchanged} unchanged (ETag) · ${s.memory} from memory`;
}

// The API's ETags are bound to the minute: within the minute we answer from memory, after it we revalidate.
export function cachedJSON(path, fresh) {
  const hit = memo.get(path);
  if (hit && !fresh && hit.minute == minuteNow()) return viewStats.memory++, showRequestCount(), Promise.resolve(hit.data);
  if (!inflight.has(path)) inflight.set(path, revalidateWithETag(path, hit).finally(() => inflight.delete(path)));
  return inflight.get(path);
}

async function revalidateWithETag(path, hit) {
  const res = await fetch(API + path, hit?.etag ? { headers: { 'If-None-Match': hit.etag } } : {});
  if (res.status == 304 && hit) {
    hit.minute = minuteNow();
    viewStats.unchanged++;
  } else {
    if (!res.ok) throw new Error(`${res.status} on ${path}`);
    hit = { etag: res.headers.get('etag'), data: await res.json(), minute: minuteNow() };
    memo.set(path, hit);
    viewStats.net++;
  }
  showRequestCount();
  return hit.data;
}

// Time left to an ISO deadline, as the ticker writes it each second.
export function timeLeft(iso) {
  let s = Math.floor((Date.parse(iso) - Date.now()) / 1e3);
  if (!(s > 0)) return 'closed';
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  s %= 60;
  const p = (n) => String(n).padStart(2, '0');
  return d ? `${d}d ${h}h ${p(m)}m` : h ? `${h}h ${p(m)}m ${p(s)}s` : `${m}m ${p(s)}s`;
}

// Countdowns patch their own text and urgency bar in place: no view is rendered again for the clock.
function tickCountdowns() {
  for (const el of document.querySelectorAll('[data-dl]')) {
    const left = Date.parse(el.dataset.dl) - Date.now();
    if (el.dataset.bar != null) el.style.setProperty('--f', Math.max(0, Math.min(1, left / 6048e5)).toFixed(3));
    else el.textContent = timeLeft(el.dataset.dl);
    el.classList.toggle('soon', left > 0 && left < 864e5);
  }
}
setInterval(tickCountdowns, 1e3);

const BOARD = '/competitions?status=open&activity=times';
// The route table: hash pattern -> layout, view modules (literal import()s) and the API answers prefetched beside them.
const ROUTES = [
  [/^#\/?$/, 'board', () => [import('./board.js')], () => [BOARD]],
  [/^#\/bounty\/([\w-]+)\/?$/, 'bounty', () => [import('./board.js'), import('./bounty.js')], (s) => [BOARD, `/competitions/${s}?submissions=summary`]],
  [/^#\/bounty\/([\w-]+)\/leaderboard$/, 'leaderboard', () => [import('./leaderboard.js')], (s) => [`/competitions/${s}/leaderboard?rows=first`]],
  [/^#\/u\/([\w.-]+)$/, 'profile', () => [import('./profile.js')], (h) => [`/profiles/${h}`]],
];

let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  window.__shotReady = false;
  viewStats.net = viewStats.unchanged = viewStats.memory = 0;
  showRequestCount();
  const hash = location.hash || '#/';
  const [re, name, load, prefetch] = ROUTES.find(([re]) => re.test(hash)) ?? ROUTES[0];
  const arg = decodeURIComponent(hash.match(re)?.[1] ?? '');
  document.body.dataset.route = name;
  for (const p of prefetch(arg)) cachedJSON(p).catch(() => {});
  try {
    const views = await Promise.all(load());
    for (const v of views) if (seq == routeSeq) await v.show(arg, name);
  } catch (e) {
    document.getElementById('detail').innerHTML = `<p class=err>Could not load this view: ${String(e.message).replace(/</g, '&lt;')}</p>`;
  }
  if (seq == routeSeq) tickCountdowns(), (window.__shotReady = true);
}
addEventListener('hashchange', route);
route();
