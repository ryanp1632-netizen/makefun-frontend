// make.fun's public API, read with GET only: each answer kept in memory for its minute and revalidated by ETag after
// it, the header's per-view request count, and the formatters and stylesheet every view shares.

/** One API answer: from memory within its minute (the API's ETags are bound to the minute), else revalidated. */
export function cachedJSON(path) {
  const hit = cache.memo.get(path);
  if (hit && hit.minute == cache.minute()) {
    cache.view.memory++;
    cache.view.at = Math.max(cache.view.at, hit.at);
    cache.showViewStats();
    return Promise.resolve(hit.data);
  }
  if (!cache.inflight.has(path)) cache.inflight.set(path, revalidateETag(path, hit).finally(() => cache.inflight.delete(path)));
  return cache.inflight.get(path);
}

/** The browser sends If-None-Match itself (cache: 'no-cache'; a header set by hand would cost a CORS preflight), so
 *  an answer carrying the ETag we hold is the API's 304: unchanged, and its body is not parsed again. */
async function revalidateETag(path, hit) {
  const v = cache.view; // counted to the view that asked, even if it lands after the next one starts
  const res = await fetch('https://make.fun/api' + path, { cache: 'no-cache' });
  v.requests++;
  cache.showViewStats();
  if (!res.ok) throw new Error(`make.fun answered ${res.status} for ${path}`);
  const etag = res.headers.get('etag');
  if (hit && etag && etag == hit.etag) v.unchanged++;
  else hit = { etag, data: await res.json() };
  hit.minute = cache.minute();
  v.at = hit.at = Date.now();
  cache.memo.set(path, hit);
  cache.showViewStats();
  return hit.data;
}

/** A route starts: the header's count resets. Refresh marks every answer stale first, so unchanged ones come back 304. */
export function startView(refresh) {
  if (refresh) for (const hit of cache.memo.values()) hit.minute = -1;
  cache.view = { requests: 0, unchanged: 0, memory: 0, at: 0, onMinute: null };
  cache.showViewStats();
}

/** The view's in-place patch, run each minute when the API's ETags turn. */
export function revalidateEachMinute(patch) {
  cache.view.onMinute = patch;
}

/** Write an element's HTML only when it differs: every view's in-place updates go through here. */
export function patchHTML(el, html) {
  if (el && el.innerHTML != html) el.innerHTML = html;
}

/** Every countdown rewrites only its own text each second; no view re-renders for the clock. */
export function tickCountdowns() {
  for (const el of document.querySelectorAll('[data-dl]')) {
    const left = Date.parse(el.dataset.dl) - Date.now();
    el.textContent = fmt.timeLeft(el.dataset.dl);
    el.classList.toggle('soon', left > 0 && left < 864e5);
  }
  cache.showViewStats();
}

/** Still taking entries: open AND before its deadline (a bounty reads open until its results are published). */
export function takesEntries(b) {
  return b.status == 'open' && Date.parse(b.deadline) > Date.now() && b.acceptingSubmissions !== false;
}

export const fmt = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
  money(v, cents) {
    const n = Number(v) || 0, d = cents || n % 1 ? 2 : 0;
    return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  num: (n) => (Number(n) || 0).toLocaleString('en-US'),
  timeLeft(iso) {
    let s = Math.floor((Date.parse(iso) - Date.now()) / 1e3);
    if (!(s > 0)) return 'closed';
    const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
    s %= 60;
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  },
  date: (iso, wd) => (iso ? new Intl.DateTimeFormat('en-US', { weekday: wd ? 'short' : undefined, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC' : '—'),
  day: (iso, year) => (iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: year ? 'numeric' : undefined, timeZone: 'UTC' }).format(new Date(iso)) : '—'),
  ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1e3;
    return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
  },
  /** A score as its column means it: win rates come in millionths, PnL in micro-USDC or lamports. */
  score(col, value, display) {
    if (value == null && display == null) return '—';
    const v = Number(value ?? display), t = col?.title ?? '';
    if (/_micro$/.test(col?.source ?? '') || col?.key == 'judge') return (v / 1e4).toFixed(1) + '%';
    if (/micro-?usdc/i.test(t)) return fmt.money(v / 1e6, true);
    if (/lamports/i.test(t)) return (v / 1e9).toFixed(2) + ' SOL';
    if (/µs/.test(t)) return fmt.num(v) + ' µs';
    return String(display ?? value);
  },
  scoreTitle: (col) => (col?.title ?? 'Score').replace(/\s*\((micro-?USDC|lamports)\)/i, ''),
  /** An avatar from an API answer (make.fun-relative or absolute), else the account's own picture. */
  avatar(image, handle) {
    if (image?.startsWith('https://')) return image;
    if (image?.startsWith('/')) return 'https://make.fun' + image;
    return `https://make.fun/api/profiles/${encodeURIComponent(handle)}/picture.png`;
  },
};

const cache = {
  memo: new Map(), // path -> { etag, data, minute, at }
  inflight: new Map(), // path -> the one request in flight for it
  view: { requests: 0, unchanged: 0, memory: 0, at: 0, onMinute: null },
  minute: () => Math.floor(Date.now() / 6e4),
  /** The header's line, patched in place: "this view: 1 API request · 0 unchanged (304) · 1 from memory · updated 0 s ago". */
  showViewStats() {
    const v = cache.view, age = v.at ? Math.max(0, Math.round((Date.now() - v.at) / 1e3)) : 0;
    patchHTML(document.querySelector('output'), `<span>this view: </span><b>${v.requests}</b> API request${v.requests == 1 ? '' : 's'} · <b>${v.unchanged}</b> unchanged (304) · <b>${v.memory}</b> from memory<span> · updated ${age} s ago</span>`);
  },
};
setInterval(tickCountdowns, 1e3);
setInterval(() => cache.view.onMinute?.(), 6e4);

// The views' stylesheet, adopted with the first view: the first load carries none of it.
document.adoptedStyleSheets = [...document.adoptedStyleSheets, new CSSStyleSheet()];
document.adoptedStyleSheets.at(-1).replaceSync(`
:root{--bg:#f4f5f7;--card:#fff;--ln:#e1e4ea;--ln2:#edf0f3;--ink:#0f172a;--mu:#566173;--pot:#08783f;--hot:#c81e1e;--acc:#1d4ed8;--sel:#edf2ff;--chip:#eef0f4;--top:#0f172a;font-variant-numeric:tabular-nums}
@media(prefers-color-scheme:dark){:root{--bg:#0b0f17;--card:#121826;--ln:#252f42;--ln2:#1b2333;--ink:#e7ebf2;--mu:#9ba6b9;--pot:#3fd98a;--hot:#ff6b61;--acc:#86a8ff;--sel:#17223a;--chip:#1c2434;--top:#05080e}}
body{background:var(--bg)!important;color:var(--ink)!important}a{color:inherit}[hidden]{display:none!important}a.tag{text-decoration:none}.back{display:none}
header{display:flex;align-items:center;gap:16px;padding:0 20px;background:var(--top)!important;position:sticky;top:0;z-index:5}
header>a{font-weight:750;font-size:17px;text-decoration:none;white-space:nowrap;letter-spacing:-.01em}header>a b{font-weight:500;color:#a5b8dc}
header form{flex:0 1 250px;margin-left:12px}
header input,.find{box-sizing:border-box;width:100%;font:inherit;font-size:13.5px;border-radius:8px;padding:7px 11px}
header input{background:#1e293b;border:1px solid #334155;color:#fff}header input::placeholder{color:#9aa8bd}
header output{margin-left:auto;font-size:12.5px;color:#cbd5e1;white-space:nowrap}header output b{color:#fff;font-weight:650}
header button{font:inherit;font-size:13px;font-weight:600;color:#fff;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:6px 13px;cursor:pointer}
header button:hover{background:#334155}
main{display:grid;grid-template-columns:480px minmax(0,1fr);height:calc(100dvh - 56px)}
main>section{overflow:auto;min-height:0;position:relative}main>section:first-child{border-right:1px solid var(--ln);background:var(--card)}
[data-route=profile] main{display:block;height:auto}[data-route=profile] main>section:first-child{display:none}
.find{background:var(--card);border:1px solid var(--ln);color:var(--ink)}.find:focus{outline:2px solid var(--acc);outline-offset:-1px}
.sum{display:grid;grid-template-columns:repeat(4,auto);justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--ln)}
.sum b{display:block;font-size:19px;font-weight:750;letter-spacing:-.01em;white-space:nowrap}.sum span{font-size:12px;color:var(--mu)}
.ctl{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 18px 0}.ctl .chips{flex-wrap:nowrap;gap:5px}
.seg{display:inline-flex;background:var(--chip);border-radius:8px;padding:3px}
.seg button{border:0;background:none;font:inherit;font-weight:650;font-size:13px;color:var(--mu);padding:4px 10px;white-space:nowrap;border-radius:6px;cursor:pointer}
.seg button[aria-selected=true]{background:var(--card);color:var(--ink);box-shadow:0 1px 2px #0f172a29}.seg i{font-style:normal;font-weight:500;margin-left:4px}
.chip{font:inherit;font-size:12.5px;font-weight:550;color:var(--mu);background:var(--card);border:1px solid var(--ln);border-radius:99px;padding:3px 9px;cursor:pointer;white-space:nowrap}
.chip[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:var(--card)}
.flt{display:flex;align-items:center;gap:6px;padding:10px 18px 0}
kbd{font:11.5px ui-monospace,Consolas,monospace;border:1px solid var(--ln);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--mu);background:var(--card)}
.cats{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px 12px;border-bottom:1px solid var(--ln)}
.row{display:block;padding:11px 18px 11px 15px;border-left:3px solid transparent;border-bottom:1px solid var(--ln2);text-decoration:none;outline-offset:-2px}
.row:hover{background:var(--bg)}.row[aria-current]{background:var(--sel);border-left-color:var(--acc)}
.r1{display:flex;align-items:center;gap:8px}.r1 b{font-weight:650;font-size:14.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.r1 small{font-size:12px;color:var(--mu)}.r2{display:block;margin-top:3px;font-size:13px;color:var(--mu)}.r2 b{color:var(--ink);font-weight:650}
.badge{font-style:normal;font-size:11px;font-weight:700;color:var(--hot);background:color-mix(in srgb,var(--hot) 11%,transparent);border-radius:99px;padding:1px 8px;white-space:nowrap}
.pot,.r2 .pot{color:var(--pot);font-weight:750}time.soon{color:var(--hot);font-weight:650}
.keys{font-size:12px;color:var(--mu);padding:12px 18px;margin:0}.empty{padding:24px 18px;color:var(--mu);margin:0}.empty:empty{display:none}
.bp{padding:18px 26px 40px;max-width:1000px}
.chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tag,.st{font-size:12px;font-weight:650;color:var(--mu);background:var(--chip);border-radius:6px;padding:2px 8px}
.st{display:inline-flex;align-items:center;gap:6px;color:var(--pot);background:color-mix(in srgb,var(--pot) 11%,transparent)}.st:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.st.wait{color:#a15c00;background:#fff3dc}.st.done{color:var(--mu);background:var(--chip)}
.head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;margin-top:10px}
h1{font-size:25px;line-height:1.2;letter-spacing:-.02em;margin:0}
.enter{flex:none;background:var(--pot);color:#fff;text-decoration:none;font-weight:650;padding:9px 16px;border-radius:9px;white-space:nowrap}.enter.off{background:var(--chip);color:var(--ink)}@media(prefers-color-scheme:dark){.enter{color:#052e16}}
.lede{color:var(--mu);margin:6px 0 0;max-width:80ch}
.tabs{display:flex;gap:22px;border-bottom:1px solid var(--ln);margin:12px 0 14px}
.tabs a{text-decoration:none;padding:7px 0;color:var(--mu);font-weight:650;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a[aria-current]{color:var(--ink);border-color:var(--acc)}.tabs i{font-style:normal;font-weight:500;color:var(--mu);margin-left:3px}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.card,.box,.ec{background:var(--card);border:1px solid var(--ln);border-radius:12px}
.card{padding:11px 14px}.card>span{display:block;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--mu)}
.card>b{display:block;font-size:24px;font-weight:750;letter-spacing:-.02em;margin:2px 0 0;white-space:nowrap}
.card>small{display:block;font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini .card{padding:8px 13px}.mini .card>b{font-size:19px}
.grid2{display:grid;grid-template-columns:minmax(0,1.32fr) minmax(0,1fr);gap:12px;margin-top:12px;align-items:start}
.box{padding:13px 16px}.box+.box{margin-top:12px}.grid2>.box{margin:0}.box h2{font-size:14.5px;margin:0}.box h2+p{margin:1px 0 6px;font-size:12.5px;color:var(--mu)}
.rw{width:100%;border-collapse:collapse;font-size:13.5px}
.rw th{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--mu);font-weight:700;text-align:right;padding:4px 0 5px}
.rw td{text-align:right;padding:6px 0;border-top:1px solid var(--ln2);white-space:nowrap}.rw th:first-child,.rw td:first-child{text-align:left;font-weight:650}
.rw td:nth-child(4){color:var(--pot);font-weight:750}.rw small{color:var(--mu);font-weight:400;font-size:11.5px}
.rw td:last-child{width:26%;padding-left:12px}.rw i{display:block;height:8px;border-radius:4px;background:var(--pot);opacity:.75}
.rw+small{display:block;margin-top:8px;font-size:12px;color:var(--mu)}.rw tfoot td{font-weight:650;border-top:1px solid var(--ln);color:var(--ink)}
.tl{list-style:none;margin:8px 0 0;padding:0}
.tl li{position:relative;display:grid;grid-template-columns:1fr auto;column-gap:8px;padding:0 0 9px 22px}
.tl li:before{content:"";position:absolute;left:2px;top:5px;width:11px;height:11px;border-radius:50%;box-sizing:border-box;border:2px solid var(--ln);background:var(--card);z-index:1}
.tl li:after{content:"";position:absolute;left:7px;top:12px;bottom:-5px;width:1px;background:var(--ln)}.tl li:last-child:after{display:none}
.tl li.past:before{background:var(--acc);border-color:var(--acc)}.tl li.now:before{background:var(--hot);border-color:var(--hot);box-shadow:0 0 0 4px color-mix(in srgb,var(--hot) 18%,transparent)}
.tl b{font-size:13.5px;font-weight:650}.tl time{font-size:12.5px;text-align:right}.tl small{grid-column:1/-1;font-size:12px;color:var(--mu)}
.tl .now b,.tl .now time{color:var(--hot)}
.md{line-height:1.6;font-size:14px}.md h4{font-size:15px;margin:14px 0 2px}.md p{margin:0 0 9px}.md ul,.md ol{padding-left:20px;margin:0 0 9px}
.md code{background:var(--chip);padding:1px 5px;border-radius:4px;font-size:12.5px}.md pre{background:var(--chip);padding:10px;border-radius:8px;overflow:auto}.md a{color:var(--acc)}
summary{cursor:pointer;font-weight:650;color:var(--acc)}
.lbbar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin:12px 0 8px;font-size:12.5px;color:var(--mu)}.lbbar .find{width:220px;flex:none}
.lbh,.lr{display:grid;grid-template-columns:40px minmax(0,1fr) 168px 84px 74px;gap:12px;align-items:center;padding:0 14px}
.lbh{position:sticky;top:0;z-index:2;background:var(--card);border:1px solid var(--ln);border-radius:12px 12px 0 0;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--mu);padding-block:8px}
.lbh span:nth-child(n+3){text-align:right}
.vl{position:relative;background:var(--card);border:1px solid var(--ln);border-top:0;border-radius:0 0 12px 12px;overflow:hidden}
.lr{position:absolute;left:0;right:0;top:0;height:50px;text-decoration:none;border-bottom:1px solid var(--ln2)}.lr:hover{background:var(--bg)}
.rk{font-weight:750;font-size:13.5px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%}.lr.paid .rk{color:var(--pot)}
.lr[data-m="1"] .rk{background:#f6c945;color:#3b2c00}.lr[data-m="2"] .rk{background:#d5dbe4;color:#1f2733}.lr[data-m="3"] .rk{background:#e5ab76;color:#3a2210}
.who{display:flex;gap:10px;align-items:center;min-width:0}.who span{min-width:0}
.who b,.who small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.who b{font-weight:650}.who small{color:var(--mu);font-size:12.5px}
.av{width:32px;height:32px;border-radius:50%;object-fit:cover;background:var(--chip);flex:none}
.sc{display:grid;grid-template-columns:54px 1fr;gap:9px;align-items:center;text-align:right;font-weight:650}
.ci{position:relative;height:6px;background:var(--chip);border-radius:3px}.ci i{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--acc) 40%,transparent);border-radius:3px}
.ci u{position:absolute;top:-3px;width:3px;height:12px;margin-left:-1px;background:var(--acc);border-radius:2px}
.pz{text-align:right;color:var(--pot);font-weight:750}.lr time{text-align:right;color:var(--mu);font-size:12.5px}
.pf{max-width:1180px;margin:0 auto;padding:22px 28px 48px}
.hero{display:flex;gap:18px;align-items:center}.hero .av{width:76px;height:76px}.hero p{margin:3px 0 0;color:var(--mu)}
.links a{color:var(--acc);text-decoration:none;margin-right:14px;font-size:13px;white-space:nowrap}
.five{grid-template-columns:repeat(5,minmax(0,1fr));margin:18px 0 22px}
.pf h2{font-size:16px;margin:0 0 10px}.pf h2 span{font-weight:400;color:var(--mu);font-size:13.5px}
.eg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}
.ec{padding:11px 14px 6px;content-visibility:auto;contain-intrinsic-size:auto 110px}
.ec>a{display:block;text-decoration:none;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ec>a:hover{color:var(--acc)}
.ec>small{display:block;color:var(--mu);font-size:12.5px}.ec>small a{color:var(--acc);text-decoration:none}
.ec ol{list-style:none;margin:7px 0 0;padding:0}
.ec li{display:grid;grid-template-columns:48px minmax(0,1fr) auto 100px;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--ln2);font-size:13.5px}
.pl{font-weight:750;font-size:12px;border-radius:6px;padding:1px 0;text-align:center;background:var(--chip);color:var(--mu)}
.pl.paid{color:var(--pot);background:color-mix(in srgb,var(--pot) 11%,transparent)}.pl.top{color:#6b4e00;background:#fbe7a6}
.et{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ec .scv{color:var(--mu);font-size:12.5px;text-align:right}
.ec .pz{font-size:13.5px}.ec .pz.no{color:var(--mu);font-weight:500;font-size:12.5px;white-space:nowrap}
.payouts{margin-top:22px}
@media(max-width:860px){header{flex-wrap:wrap;height:auto!important;gap:8px 10px;padding:8px 12px}header form{flex:1 1 120px;margin:0}
header output{order:9;flex-basis:100%;margin:0;font-size:11.5px;white-space:normal}header output>span:first-child{display:none}
main{grid-template-columns:minmax(0,1fr);height:auto}main>section{overflow:visible}main>section:first-child{border:0}
[data-route=board] main>section:last-child,[data-route=bounty] main>section:first-child,[data-route=leaderboard] main>section:first-child{display:none}
.sum{grid-template-columns:repeat(2,auto);padding:12px 14px}.ctl,.flt,.cats{padding-inline:14px}.ctl{flex-wrap:wrap}.row{padding-inline:11px 14px}.keys{display:none}
.bp{padding:14px}.head{flex-direction:column}.back{display:inline}.cards,.five{grid-template-columns:repeat(2,minmax(0,1fr))}.grid2{grid-template-columns:minmax(0,1fr)}
.lbbar{flex-direction:column;align-items:stretch}.rw th:last-child,.rw td:last-child{display:none}.rw th{letter-spacing:.02em}.lbbar .find{width:100%}
.lbh,.lr{grid-template-columns:32px minmax(0,1fr) 62px 62px;gap:8px;padding:0 8px}.lbh span:nth-child(5),.lr time{display:none}.sc{grid-template-columns:1fr}.ci{display:none}
.pf{padding:16px}.eg{grid-template-columns:minmax(0,1fr)}}
`);
