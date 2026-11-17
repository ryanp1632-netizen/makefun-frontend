// make.fun's public API (GET only) behind an in-memory cache revalidated by ETag, the per-view request counter in the
// top bar, the one-second ticker that patches countdowns in place, the formatters and the views' stylesheet.

/** An API answer: from memory within the minute its ETag is bound to, else revalidated (304 = unchanged). */
export function cachedJSON(path) {
  const hit = memo.get(path);
  if (hit && hit.minute == minuteNow() && !(force && !hit.thisView)) {
    view.memory++;
    view.at = Math.min(view.at, hit.at);
    paintCounter();
    return Promise.resolve(hit.data);
  }
  if (!inflight.has(path)) inflight.set(path, revalidateETag(path, hit).finally(() => inflight.delete(path)));
  return inflight.get(path);
}

// The API answers Cache-Control: no-cache with a strong ETag, so the browser sends If-None-Match itself (a header set
// by hand would cost a CORS preflight). The same ETag back means a 304: the answer in memory is kept, not re-parsed.
async function revalidateETag(path, hit) {
  let res;
  for (let tries = 2; tries--; ) {
    res = await fetch(API + path, { cache: 'no-cache' });
    view.requests++;
    if (res.status != 503 || !tries) break;
    await new Promise((ok) => setTimeout(ok, Math.min(5, Number(res.headers.get('retry-after')) || 2) * 1e3));
  }
  if (!res.ok) throw new Error(`the API answered ${res.status} for ${path}`);
  const etag = res.headers.get('etag');
  if (hit && etag && etag == hit.etag) view.unchanged++;
  else hit = { etag, data: await res.json() };
  hit.minute = minuteNow();
  hit.at = Date.now();
  hit.thisView = true;
  memo.set(path, hit);
  view.at = Math.min(view.at, hit.at);
  paintCounter();
  return hit.data;
}

/** Each second: every countdown, "closing soon" badge and the counter's age rewrite their own text, nothing more. */
export function tickCountdowns() {
  const now = Date.now();
  for (const el of document.querySelectorAll('[data-dl]')) {
    const left = Date.parse(el.dataset.dl) - now, text = timeLeft(el.dataset.dl, el.dataset.fmt);
    if (el.textContent != text) el.textContent = text;
    el.classList.toggle('hot', left > 0 && left < DAY);
  }
  for (const el of document.querySelectorAll('[data-soon]')) el.hidden = !(Date.parse(el.dataset.soon) - now < DAY && Date.parse(el.dataset.soon) > now);
  paintCounter();
}

/** A new view (or the minute's refresh) starts its own count; `again` skips the minute's memory (Refresh). */
export function startView(again) {
  Object.assign(view, { requests: 0, unchanged: 0, memory: 0, at: Infinity });
  force = again;
  for (const hit of memo.values()) hit.thisView = false;
  paintCounter();
}

/** "this view: 1 API request · 0 unchanged (304) · 1 from memory · updated 0 s ago", rewritten only when it changes. */
function paintCounter() {
  const v = view, age = v.at == Infinity ? 0 : Math.max(0, Math.round((Date.now() - v.at) / 1e3));
  const text = `this view: ${v.requests} API request${v.requests == 1 ? '' : 's'} · ${v.unchanged} unchanged (304) · ${v.memory} from memory · updated ${age < 120 ? age + ' s' : Math.round(age / 60) + ' min'} ago`;
  const out = document.querySelector('output');
  if (out.textContent != text) out.textContent = text;
}

/** Whether a bounty still takes entries: open AND before its deadline (status reads open until results publish). */
export const takesEntries = (b) => b.status == 'open' && Date.parse(b.deadline) > Date.now() && b.acceptingSubmissions !== false;

export function timeLeft(iso, fmt) {
  let s = Math.floor((Date.parse(iso) - Date.now()) / 1e3);
  if (!(s > 0)) return fmt == 'short' ? 'closed' : 'entries closed';
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, p = (n) => String(n).padStart(2, '0');
  s %= 60;
  const t = d ? `${d}d ${h}h ${p(m)}m` : h ? `${h}h ${p(m)}m ${p(s)}s` : `${m}m ${p(s)}s`;
  return fmt == 'short' ? t : t + ' left';
}

export function money(v) {
  const n = Number(v) || 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export const num = (n) => (Number(n) || 0).toLocaleString('en-US');
export const potOf = (b) => Number(b.potUsd ?? b.rewardAmount ?? 0);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const place = (n) => '#' + n;

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const fmtDate = (iso) => (iso ? dateFmt.format(new Date(iso)) + ' UTC' : '—');
export const fmtDay = (iso) => (iso ? dayFmt.format(new Date(iso)) : '—');

/** "3m ago" / "in 5h" / "2d ago" for any date. */
export function relTime(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1e3, a = Math.abs(s);
  const t = a < 90 ? '1m' : a < 3570 ? `${Math.round(a / 60)}m` : a < 172800 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
  return s > 0 ? 'in ' + t : t + ' ago';
}

/** An avatar from an API answer, else the account's own round picture. */
export function avatarURL(image, handle) {
  if (image?.startsWith('https://')) return image;
  if (image?.startsWith('/')) return 'https://make.fun' + image;
  return `https://make.fun/api/profiles/${encodeURIComponent(handle)}/picture.png`;
}

/** An <img> made for make.fun's images: crossorigin is set before src (their CORP is same-origin). */
export function avatarImg(image, handle, cls = 'av') {
  const img = new Image();
  img.className = cls;
  img.alt = '';
  img.decoding = 'async';
  img.crossOrigin = 'anonymous';
  img.src = avatarURL(image, handle);
  return img;
}

/** A score as its column means it: millionths (…_micro) read as a percentage, other values as numbers. */
export function scoreText(column, value, display) {
  if (value == null && display == null) return '—';
  if (/_micro$/.test(column?.source ?? '')) return (Number(value ?? display) / 1e4).toFixed(1) + '%';
  const n = Number(value ?? display);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : String(display ?? value);
}
export const scoreName = (column) => (column?.title ?? 'Score').replace(/\s*\(.*\)\s*$/, '');

/** Set an element's HTML only when it differs, so unchanged parts of a view keep their nodes. */
export function patchHTML(el, html) {
  if (el && painted.get(el) !== html) painted.set(el, html), (el.innerHTML = html);
}

/** A stat card: label, big number, the line that explains it. */
export function statCard(label, value, sub, cls = '') {
  return `<div class=card><span>${label}</span><b class="${cls}">${value}</b><small>${sub}</small></div>`;
}

/** A small Markdown subset (headings, lists, code, emphasis, links), escaped first. */
export function markdown(src) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/g, (_, t, u) => `<a href="${u[0] == '/' ? 'https://make.fun' + u : u}" target=_blank rel=noopener>${t}</a>`);
  let html = '', list = '', code = null;
  const close = () => list && ((html += `</${list}>`), (list = ''));
  for (const line of String(src ?? '').split('\n')) {
    if (line.startsWith('```')) {
      close();
      if (code == null) code = '';
      else (html += `<pre>${esc(code)}</pre>`), (code = null);
    } else if (code != null) code += line + '\n';
    else {
      const h = /^#{1,6}\s+(.*)/.exec(line), li = /^\s*(?:[-*]|(\d+)\.)\s+(.*)/.exec(line);
      if (h) close(), (html += `<h4>${inline(h[1])}</h4>`);
      else if (li) {
        const tag = li[1] ? 'ol' : 'ul';
        if (list != tag) close(), (html += `<${(list = tag)}>`);
        html += `<li>${inline(li[2])}</li>`;
      } else if (line.trim()) close(), (html += `<p>${inline(line)}</p>`);
      else close();
    }
  }
  return close(), html;
}

export const BOARD = '/competitions?activity=times';
const API = 'https://make.fun/api';
const DAY = 864e5;
const memo = new Map(); // path -> { etag, data, minute, at }
const inflight = new Map(); // path -> its one request in flight
const view = { requests: 0, unchanged: 0, memory: 0, at: Infinity };
const painted = new WeakMap(); // element -> the HTML patchHTML last gave it
const minuteNow = () => Math.floor(Date.now() / 6e4);
let force = false;

const CSS = `
:root{--bg:#f4f5f7;--card:#fff;--line:#e1e4e9;--soft:#f0f2f5;--tx:#15181d;--mu:#5a6371;--ac:#2456d6;--sel:#edf2ff;--pot:#08783e;--fee:#975a00;--hot:#c62828;--go:#0b7a3e;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a20;--line:#2a2f38;--soft:#1e2229;--tx:#eceff3;--mu:#a3abb8;--ac:#86a4ff;--sel:#1c2436;--pot:#4fd08b;--fee:#efb04a;--hot:#ff6b6b;--go:#1f9d5a;color-scheme:dark}}
body{background:var(--bg);color:var(--tx);font-variant-numeric:tabular-nums}
a{color:inherit}button{font:inherit;color:inherit;cursor:pointer}[hidden]{display:none!important}
header form{flex:0 1 220px}header input{width:100%;box-sizing:border-box}header input:focus{outline:2px solid #86a4ff;outline-offset:0}
header button{background:#262b34;border:1px solid #3a404b;color:#fff;border-radius:8px;padding:5px 12px;font-size:13px}
main{display:grid;grid-template-columns:minmax(380px,450px) minmax(0,1fr);height:calc(100vh - 52px)}
main>section{overflow:auto;min-height:0}
main>section:first-child{background:var(--card);border-right:1px solid var(--line)}
[data-v=profile] main{grid-template-columns:1fr}[data-v=profile] main>:first-child{display:none}
.pot{color:var(--pot);font-weight:700}.fee{color:var(--fee);font-weight:600}.hot{color:var(--hot)}.mu{color:var(--mu)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);background:var(--card);border-radius:99px;padding:3px 11px;font-size:12.5px;color:var(--mu);font-weight:600}
.chip[aria-pressed=true]{background:var(--tx);border-color:var(--tx);color:var(--card)}
.chip b{font-weight:700;margin-left:3px}
.tag{display:inline-flex;align-items:center;gap:6px;border-radius:6px;padding:2px 9px;font-size:12px;font-weight:650;background:var(--soft);color:var(--mu)}
.tag.live{background:#e3f6eb;color:#0b6b37}.tag.live:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.tag.wait{background:#fff1dc;color:#8a5200}.tag.hot{background:#fde8e8;color:var(--hot)}
@media(prefers-color-scheme:dark){.tag.live{background:#173726;color:#6fe0a2}.tag.wait{background:#3a2b12;color:#f4c06a}.tag.hot{background:#3d1d1f}}
.bh{padding:14px 16px 10px;border-bottom:1px solid var(--line);display:grid;gap:10px}
.sum{display:grid;grid-template-columns:repeat(4,auto);justify-content:space-between;gap:8px}
.sum b{display:block;font-size:17px;line-height:1.2}.sum span{font-size:11.5px;color:var(--mu)}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}
.tabs>*{background:none;border:0;border-bottom:2px solid transparent;padding:6px 12px 7px;font-weight:650;color:var(--mu);text-decoration:none;margin-bottom:-1px}
.tabs>[aria-selected=true],.tabs>[aria-current]{color:var(--tx);border-color:var(--ac)}
.tabs b{font-weight:700;background:var(--soft);border-radius:99px;padding:0 7px;margin-left:5px;font-size:12px}
.find{display:flex;align-items:center;gap:8px}
.find input{flex:1;font:inherit;border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--card);color:var(--tx)}
.find input:focus{outline:2px solid var(--ac);outline-offset:-1px}
kbd{font:11.5px ui-monospace,monospace;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 6px;color:var(--mu);background:var(--card)}
.rows{list-style:none;margin:0;padding:0}
.row{display:block;padding:9px 16px 9px 13px;border-left:3px solid transparent;border-bottom:1px solid var(--line);text-decoration:none}
.row:hover{background:var(--soft)}.row[aria-current]{background:var(--sel);border-left-color:var(--ac)}
.rt{display:flex;align-items:center;gap:8px}.rt b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14.5px;font-weight:650}
.rt small{color:var(--mu);font-size:12px}
.rm{margin-top:3px;font-size:13px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rm span+span:before{content:" · ";color:var(--mu);font-weight:400}
.keys{padding:12px 16px 18px;font-size:12px;color:var(--mu)}
.bp{padding:18px 26px 40px;max-width:980px}
.top{display:flex;gap:16px;align-items:flex-start;margin:8px 0 10px}
h1{font-size:25px;line-height:1.2;letter-spacing:-.015em;margin:0;flex:1}
.btn{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;font-weight:650;border-radius:9px;padding:8px 15px;border:1px solid var(--line);background:var(--card)}
.btn.go{background:var(--go);border-color:var(--go);color:#fff}
.lede{margin:12px 0 14px;color:var(--tx);max-width:78ch}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.card>span{font-size:11px;font-weight:700;letter-spacing:.07em;color:var(--mu)}
.card>b{display:block;font-size:24px;line-height:1.25;letter-spacing:-.01em;white-space:nowrap}
.card>small{font-size:12px;color:var(--mu)}
.two{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px;margin-bottom:12px}
.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
.box h2{font-size:14px;margin:0}.box>p{margin:2px 0 8px;font-size:12.5px;color:var(--mu)}
.rw{display:grid;grid-template-columns:64px minmax(40px,1fr) 64px 72px 76px;gap:10px;align-items:center;font-size:13px;padding:5px 0;border-top:1px solid var(--line)}
.rw.nofee{grid-template-columns:64px minmax(40px,1fr) 64px 76px}.rw.nofee>.fs{display:none}
.rw>:nth-child(n+3){text-align:right}.rw.th{font-size:10.5px;font-weight:700;letter-spacing:.07em;color:var(--mu);border-top:0}
.rw i{display:block;height:8px;border-radius:4px;background:linear-gradient(90deg,var(--pot),#5cc98d)}
.rw small{color:var(--mu);font-weight:400}
.tl{list-style:none;margin:6px 0 0;padding:0}
.tl li{position:relative;padding:0 0 9px 22px;font-size:13px}
.tl li:before{content:"";position:absolute;left:4px;top:5px;width:8px;height:8px;border-radius:50%;border:2px solid var(--mu);background:var(--card)}
.tl li:after{content:"";position:absolute;left:9px;top:17px;bottom:-3px;width:2px;background:var(--line)}.tl li:last-child:after{display:none}
.tl li.past:before{background:var(--mu)}.tl li.now:before{border-color:var(--hot);background:var(--hot);box-shadow:0 0 0 3px #c6282833}
.tl li.now b{color:var(--hot)}.tl small{display:block;color:var(--mu);font-size:12px}
.md{font-size:13.5px}.md>*{max-width:80ch}.md h4{font-size:14px;margin:14px 0 4px}.md p{margin:6px 0}.md ul,.md ol{padding-left:20px;margin:6px 0}
.md code{background:var(--soft);padding:1px 5px;border-radius:4px;font-size:12.5px}.md pre{background:var(--soft);padding:10px;border-radius:8px;overflow:auto}.md a{color:var(--ac)}
details summary{cursor:pointer;color:var(--ac);font-weight:650;margin-top:8px}
.lbh{padding:16px 22px 12px;display:grid;gap:10px;border-bottom:1px solid var(--line);background:var(--card)}
.lbh h1{font-size:21px}.crumb{font-size:12.5px;color:var(--mu)}.crumb a{color:var(--mu)}
.mini{display:flex;gap:22px;flex-wrap:wrap;font-size:12.5px;color:var(--mu)}.mini b{font-size:16px;color:var(--tx);margin-right:4px}.mini .pot,.mini .hot{color:inherit}.mini .pot b{color:var(--pot)}.mini .hot b{color:var(--hot)}
.lr{display:grid;grid-template-columns:52px minmax(0,1fr) 150px 84px 66px;gap:12px;align-items:center;padding:0 22px;height:48px;box-sizing:border-box;border-bottom:1px solid var(--line);text-decoration:none}
.lr.hd{position:sticky;top:0;z-index:2;height:34px;background:var(--bg);font-size:10.5px;font-weight:700;letter-spacing:.07em;color:var(--mu)}
.lr>:nth-child(n+3){text-align:right}
.vl{position:relative}.vl .lr{position:absolute;left:0;right:0;background:var(--card)}.vl .lr:hover{background:var(--soft)}
.rk{font-weight:800;font-size:15px}.rk[data-m]{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;font-size:13px;color:#15181d}
.rk[data-m="1"]{background:#f5cf4a}.rk[data-m="2"]{background:#d4dae3}.rk[data-m="3"]{background:#e5a36c}
.who{display:flex;align-items:center;gap:10px;min-width:0}.who>div{min-width:0}
.who b,.who small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.who b{font-weight:650}.who small{color:var(--mu);font-size:12px}
.av{width:30px;height:30px;border-radius:50%;object-fit:cover;flex:none;background:var(--soft)}
.sc b{font-weight:700}.ci{display:block;position:relative;height:4px;margin-top:4px;border-radius:2px;background:var(--soft)}.ci i{position:absolute;top:0;bottom:0;border-radius:2px;background:#9db4f2}
.ph{display:flex;gap:18px;align-items:center;margin-bottom:16px}.ph .av{width:76px;height:76px}.ph h1{font-size:26px}
.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 18px}
.bp.wide{max-width:1240px}.gh{font-size:17px;margin:0 0 10px}.gh span{font-size:14px;font-weight:500}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}
.gb{display:block;font-weight:650;text-decoration:none}.gb:hover{color:var(--ac)}
.en{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto;gap:10px;align-items:baseline;font-size:13px;padding:6px 0;border-top:1px solid var(--line)}
.en>b:first-child{font-weight:800}.en>span:nth-child(2){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en .mu{font-size:12px}
.links{display:flex;gap:12px;flex-wrap:wrap;font-size:12.5px;margin-top:4px}.links a{color:var(--ac);text-decoration:none}
.empty{padding:24px;color:var(--mu)}
@media(max-width:900px){main{grid-template-columns:minmax(0,1fr);height:calc(100dvh - 52px)}
[data-v=board] main>:last-child,[data-v=bounty] main>:first-child,[data-v=leaderboard] main>:first-child{display:none}
header{gap:8px;padding:0 10px}header>a{font-size:14px}header form{flex:1 1 90px}output{font-size:10.5px;white-space:normal;text-align:right;line-height:1.2;max-width:150px}header button{display:none}
.bp{padding:14px}.cards,.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.two,.grid{grid-template-columns:minmax(0,1fr)}.top{flex-direction:column;gap:10px}
.rw,.rw.nofee{grid-template-columns:52px minmax(0,1fr) 72px 84px;gap:6px}.rw.nofee{grid-template-columns:52px minmax(0,1fr) 84px}.rw>:nth-child(2){display:none}
.find{flex-wrap:wrap}.find>span{flex:1 1 100%}.mini{gap:6px 16px}
.lr{grid-template-columns:40px minmax(0,1fr) 84px;padding:0 12px}.lr>:nth-child(n+4){display:none}.lbh{padding:12px}.ph .av{width:56px;height:56px}}
`;
const sheet = new CSSStyleSheet();
sheet.replaceSync(CSS);
document.adoptedStyleSheets = [sheet];
setInterval(tickCountdowns, 1e3);
