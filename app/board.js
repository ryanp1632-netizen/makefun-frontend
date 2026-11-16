// The board: the live bounties, sortable and filterable, built once and then patched row by row, so moving between
// bounties, re-sorting and the minute's revalidation never rebuild the list.
import { BOARD, cachedJSON } from './api.js';
import { ago, esc, money, potOf, takesEntries, timeLeft } from './ui.js';

export default async function showBoard(slug, routeName) {
  state.route = routeName;
  const data = await cachedJSON(BOARD);
  if (!rowEls.size) renderBoard();
  patchBoardRows(data.items);
  selectRow(slug || state.sel || (sortFilterBounties().find(takesEntries) ?? sortFilterBounties()[0])?.slug);
  if (routeName == 'board' && matchMedia('(min-width:861px)').matches) {
    const b = state.items.find((x) => x.slug == state.sel);
    if (b) (await import('./bounty.js')).renderBountyPanel(b);
  }
}

function renderBoard() {
  $list().innerHTML = `<div class=sum></div>
<div class=ctl><input type=search placeholder="Filter bounties by title or category" aria-label="Filter bounties"><kbd>/</kbd><kbd>j</kbd><kbd>k</kbd></div>
<div class=chips></div>
<div class=th><button data-k=title>Bounty</button><button data-k=pot>Live pot</button><button data-k=fee>Fee</button><button data-k=dl>Time left</button><button data-k=n>Entries</button></div>
<ol class=rows></ol><h3 class=sec>Past deadline · results pending</h3><ol class="rows past"></ol>
<p class=facts>First load 1.4 KB gzip: index.html + boot.js. Views load on demand; API answers kept in memory and revalidated by ETag; rows patched in place; countdowns tick without re-rendering. Keys: / filter · j k or ↑ ↓ move · ↵ open.</p>`;
  q('input').addEventListener('input', (e) => ((state.q = e.target.value.toLowerCase()), orderRowsInPlace()));
  q('.th').addEventListener('click', (e) => {
    const k = e.target.dataset?.k;
    if (!k) return;
    state.dir = state.sort == k ? -state.dir : k == 'dl' || k == 'title' ? 1 : -1;
    state.sort = k;
    orderRowsInPlace();
  });
  q('.chips').addEventListener('click', (e) => {
    if (e.target.dataset.c == null) return;
    state.cat = e.target.dataset.c;
    orderRowsInPlace();
  });
  addEventListener('keydown', boardKeys);
  setInterval(revalidateBoardEachMinute, 6e4);
}

/** Patch rows in place: a new bounty gets a row, a changed one has only its changed fields rewritten. */
export function patchBoardRows(items) {
  state.items = items;
  for (const b of items) {
    let a = rowEls.get(b.slug);
    if (!a) {
      a = document.createElement('a');
      a.className = 'row';
      a.href = `#/bounty/${encodeURIComponent(b.slug)}`;
      a.dataset.slug = b.slug;
      a.innerHTML = `<span class=t><b></b><small></small></span><span class=pot></span><span class=fee></span><span><time></time><i class=bar data-bar></i></span><span class=n></span>`;
      rowEls.set(b.slug, a);
    }
    const [t, pot, fee, tl, n] = a.children;
    const fees = Number(b.entryFeesUsd || 0);
    const last = b.submissions?.reduce((m, s) => (s.createdAt > m ? s.createdAt : m), '');
    setText(t.firstChild, b.title);
    setText(t.lastChild, `${b.category ?? 'Bounty'} · ${b.status == 'open' && !takesEntries(b) ? 'judging' : last ? 'last entry ' + ago(last) : 'no entries yet'}`);
    setHTML(pot, `${money(potOf(b))}${fees ? `<small>+${money(fees)} fees</small>` : ''}`);
    setHTML(fee, Number(b.entryFeeUsd) ? money(b.entryFeeUsd) : '<span class=free>free</span>');
    tl.firstChild.dataset.dl = tl.lastChild.dataset.dl = b.deadline;
    if (!tl.firstChild.textContent) tl.firstChild.textContent = timeLeft(b.deadline);
    setHTML(n, `${b.submissionCount.toLocaleString('en-US')}<small>entries</small>`);
  }
  for (const [slug, a] of rowEls) if (!items.some((b) => b.slug == slug)) a.remove(), rowEls.delete(slug);
  orderRowsInPlace();
  renderSummaryStrip();
}

/** Order the existing row nodes by the sort and filter: nodes are moved, never rebuilt. */
function orderRowsInPlace() {
  const [open, past] = $list().querySelectorAll('ol');
  const shown = sortFilterBounties();
  for (const a of rowEls.values()) a.hidden = true;
  for (const b of shown) {
    const a = rowEls.get(b.slug);
    a.hidden = false;
    (takesEntries(b) ? open : past).append(a);
  }
  q('.sec').hidden = !shown.some((b) => !takesEntries(b));
  for (const btn of $list().querySelectorAll('.th button'))
    btn.dataset.k == state.sort ? btn.setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending') : btn.removeAttribute('aria-sort');
  const cats = {};
  for (const b of state.items) cats[b.category] = (cats[b.category] || 0) + 1;
  q('.chips').innerHTML = [['', 'All', state.items.length], ...Object.keys(cats).sort().map((c) => [c, c, cats[c]])]
    .map(([c, label, n]) => `<button data-c="${esc(c)}" aria-pressed=${state.cat == c}>${esc(label)} ${n}</button>`)
    .join('');
}

function sortFilterBounties() {
  const key = SORTS[state.sort];
  return state.items
    .filter((b) => (!state.cat || b.category == state.cat) && (!state.q || `${b.title} ${b.category} ${b.summary}`.toLowerCase().includes(state.q)))
    .sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * state.dir);
}

function renderSummaryStrip() {
  const live = state.items.filter(takesEntries);
  const next = live.reduce((m, b) => (!m || b.deadline < m.deadline ? b : m), null);
  q('.sum').innerHTML = `<div><b>${live.length}</b><span>taking entries</span></div>
<div><b class=pot>${money(live.reduce((s, b) => s + potOf(b), 0))}</b><span>in live pots</span></div>
<div><b>${live.reduce((s, b) => s + b.submissionCount, 0).toLocaleString('en-US')}</b><span>entries so far</span></div>
<div><b><time data-dl="${next?.deadline ?? ''}">${next ? timeLeft(next.deadline) : '—'}</time></b><span title="${esc(next?.title)}">next deadline</span></div>`;
}

function selectRow(slug) {
  rowEls.get(state.sel)?.removeAttribute('aria-current');
  state.sel = slug;
  const a = rowEls.get(slug);
  if (a) a.setAttribute('aria-current', 'page'), a.scrollIntoView({ block: 'nearest' });
}

async function revalidateBoardEachMinute() {
  if (document.body.dataset.route == 'board' || document.body.dataset.route == 'bounty') patchBoardRows((await cachedJSON(BOARD)).items);
}

function boardKeys(e) {
  const route = document.body.dataset.route;
  if ((route != 'board' && route != 'bounty') || e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = e.target.matches?.('input');
  if (e.key == '/' && !typing) return e.preventDefault(), q('input').focus();
  if (e.key == 'Escape' && typing) return e.target.blur();
  const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[e.key];
  if (!step || (typing && e.key.length == 1)) return;
  e.preventDefault();
  const order = [...$list().querySelectorAll('.row:not([hidden])')].map((a) => a.dataset.slug);
  const next = order[Math.max(0, Math.min(order.length - 1, order.indexOf(state.sel) + step))];
  if (next) location.replace(`#/bounty/${encodeURIComponent(next)}`), rowEls.get(next).focus({ preventScroll: true });
}

const $list = () => document.querySelector('main').firstChild;
const q = (sel) => $list().querySelector(sel);
const state = { items: [], sort: 'dl', dir: 1, cat: '', q: '', sel: '', route: '' };
const rowEls = new Map(); // slug -> <a class=row>, created once and patched after
const SORTS = { title: (b) => b.title.toLowerCase(), pot: potOf, fee: (b) => Number(b.entryFeeUsd || 0), dl: (b) => Date.parse(b.deadline), n: (b) => b.submissionCount };
const setText = (el, s) => el.textContent != s && (el.textContent = s);
const setHTML = (el, s) => el.innerHTML != s && (el.innerHTML = s);
