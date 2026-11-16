// make.fun's public API, read with GET only: an in-memory cache revalidated by ETag, and the per-view request count.

// The API's ETags are bound to the minute: within the minute we answer from memory, after it we revalidate.
export function cachedJSON(path) {
  const hit = memo.get(path);
  if (hit && isFresh(path)) return viewStats.memory++, showRequestCount(), Promise.resolve(hit.data);
  if (!inflight.has(path)) inflight.set(path, revalidateWithETag(path, hit).finally(() => inflight.delete(path)));
  return inflight.get(path);
}

// The API answers Cache-Control: no-cache with an ETag, so the browser revalidates with If-None-Match itself (a
// header set by hand would cost a CORS preflight). An answer with the ETag we hold is unchanged: its body is not parsed.
async function revalidateWithETag(path, hit) {
  const res = await fetch(API + path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} on ${path}`);
  const etag = res.headers.get('etag');
  if (hit && etag && etag == hit.etag) {
    hit.minute = minuteNow();
    viewStats.unchanged++;
  } else {
    hit = { etag, data: await res.json(), minute: minuteNow() };
    memo.set(path, hit);
    viewStats.net++;
  }
  showRequestCount();
  return hit.data;
}

/** The API answers a route needs, started beside its view modules (already-fresh ones are not asked again). */
export function prefetchRoute(paths) {
  for (const p of paths) if (!isFresh(p)) cachedJSON(p).catch(() => {});
}

export function resetViewStats() {
  viewStats.net = viewStats.unchanged = viewStats.memory = 0;
  showRequestCount();
}

function showRequestCount() {
  const s = viewStats;
  document.querySelector('output').innerHTML = `<span>this view: </span>${s.net} API request${s.net == 1 ? '' : 's'} · ${s.unchanged} unchanged (ETag) · ${s.memory} from memory`;
}

export const BOARD = '/competitions?status=open&activity=times';
const API = 'https://make.fun/api';
const memo = new Map(); // path -> { etag, data, minute }
const inflight = new Map(); // path -> the one request in flight for it
const viewStats = { net: 0, unchanged: 0, memory: 0 };
const minuteNow = () => Math.floor(Date.now() / 6e4);
const isFresh = (path) => memo.get(path)?.minute == minuteNow();
