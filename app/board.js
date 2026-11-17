// The board: every bounty from one API answer, Live and Ended tabs, sort chips, a filter and category chips. Built
// once, then patched row by row: re-sorting and filtering move the existing rows, and the minute's refresh rewrites
// only the rows whose data changed. Countdowns tick in place (api.js tickCountdowns).
import { BOARD, cachedJSON, esc, fmtDay, money, num, patchHTML, potOf, takesEntries, tickCountdowns } from './api.js';

/** #/ : the board, and on a wide screen the closing-soonest bounty's overview beside it (from the same answer). */
function renderBoard() {
  return showBoard(state.sel).then(async (b) => {
    if (b && matchMedia('(min-width:901px)').matches) (await import('./bounty.js')).paintBounty(b, null);
  });
}

/** Rows are created once per bounty; a row's HTML is rewritten only when its bounty's numbers change. */
function patchBoardRows(items) {
  state.items = items;
  for (const b of items) {
    let a = rowEls.get(b.slug);
    if (!a) {
      a = document.createElement('a');
      a.className = 'row';
      a.href = '#/bounty/' + encodeURIComponent(b.slug);
      rowEls.set(b.slug, a);
    }
    patchHTML(a, rowHTML(b));
  }
  for (const [slug, a] of rowEls) if (!items.some((b) => b.slug == slug)) a.remove(), rowEls.delete(slug);
  sortFilterRows();
}

/** Sort and filter by moving the existing row nodes: nothing is rebuilt. */
function sortFilterRows() {
  const $ = side(), list = $.querySelector('.rows'), shown = visibleBounties();
  for (const a of rowEls.values()) a.hidden = true;
  for (const b of shown) {
    const a = rowEls.get(b.slug);
    a.hidden = false;
    list.append(a);
  }
  $.querySelector('.empty').hidden = shown.length > 0;
  const live = state.items.filter(takesEntries), inTab = state.tab == 'live' ? live : state.items.filter((b) => !takesEntries(b));
  patchHTML($.querySelector('[data-tab=live]'), `Live <b>${live.length}</b>`);
  patchHTML($.querySelector('[data-tab=ended]'), `Ended <b>${state.items.length - live.length}</b>`);
  for (const t of $.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', t.dataset.tab == state.tab);
  for (const c of $.querySelectorAll('[data-sort]')) c.setAttribute('aria-pressed', c.dataset.sort == state.sort);
  const cats = {};
  for (const b of inTab) cats[b.category] = (cats[b.category] || 0) + 1;
  patchHTML($.querySelector('[data-group=cat]'), [['', 'All', inTab.length], ...Object.keys(cats).sort().map((c) => [c, c, cats[c]])]
    .map(([c, label, n]) => `<button class=chip data-cat="${esc(c)}" aria-pressed=${state.cat == c}>${esc(label)}<b>${n}</b></button>`).join(''));
  const next = live.reduce((m, b) => (!m || b.deadline < m.deadline ? b : m), null);
  patchHTML($.querySelector('.sum'), `<div><b>${live.length} live</b><span>taking entries</span></div>
<div><b class=pot>${money(live.reduce((s, b) => s + potOf(b), 0))}</b><span>in live pots</span></div>
<div><b>${num(live.reduce((s, b) => s + b.submissionCount, 0))}</b><span>entries in them</span></div>
<div><b data-dl="${esc(next?.deadline ?? '')}" data-fmt=short></b><span>next deadline</span></div>`);
  tickCountdowns();
}

/** The board beside any bounty view: one cached answer, the row of `slug` selected. Returns that bounty. */
export async function showBoard(slug) {
  const data = await cachedJSON(BOARD);
  if (!rowEls.size) buildBoard();
  patchBoardRows(data.items ?? []);
  const shown = visibleBounties();
  const b = data.items.find((x) => x.slug == slug) ?? shown[0];
  if (b && !takesEntries(b) && state.tab == 'live' && b.slug == slug) state.tab = 'ended', sortFilterRows();
  selectRow(b?.slug);
  tickCountdowns();
  return b;
}

/** A bounty's own answer (fetched later) carries fresher numbers: copy them into its row and patch that row only. */
export function syncBoardRow(d) {
  const b = state.items.find((x) => x.slug == d.slug), a = rowEls.get(d.slug);
  if (!b || !a) return;
  for (const k of ['potUsd', 'entryFeesUsd', 'entryFeePayers', 'submissionCount', 'rewardsNow', 'status', 'deadline']) if (d[k] != null) b[k] = d[k];
  patchHTML(a, rowHTML(b));
  sortFilterRows();
}

function rowHTML(b) {
  const live = takesEntries(b), fee = Number(b.entryFeeUsd) || 0;
  const badge = live ? `<span class="tag hot" data-soon="${esc(b.deadline)}" hidden>closing soon</span>`
    : b.status == 'resolved' ? '<span class=tag>resolved</span>' : '<span class="tag wait">judging</span>';
  const when = live ? `<span data-dl="${esc(b.deadline)}"></span>` : `<span>ended ${fmtDay(b.deadline)}</span>`;
  const winner = b.winner?.handle ? `<span>won by @${esc(b.winner.handle)}</span>` : '';
  return `<div class=rt><b>${esc(b.title)}</b>${badge}<small>${esc(b.category ?? '')}</small></div>
<div class=rm><span class=pot>${money(potOf(b), Number(b.entryFeesUsd) > 0)} ${live ? 'pot' : 'paid'}</span>${fee ? `<span class=fee>${money(fee)} fee</span>` : '<span>no fee</span>'}${when}<span>${num(b.submissionCount)} entries</span>${winner}</div>`;
}

function buildBoard() {
  const $ = side();
  $.innerHTML = `<div class=bh><div class=sum></div>
<div class=tabs role=tablist><button role=tab data-tab=live></button><button role=tab data-tab=ended></button></div>
<div class=chips data-group=sort>${SORTS.map(([k, label]) => `<button class=chip data-sort=${k}>${label}</button>`).join('')}</div>
<label class=find><input type=search placeholder="Filter bounties by name" aria-label="Filter bounties by name"><kbd>/</kbd></label>
<div class=chips data-group=cat></div></div>
<ol class=rows></ol><p class=empty hidden>No bounty matches.</p>
<p class=keys><kbd>/</kbd> filter · <kbd>j</kbd> <kbd>k</kbd> or <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · the board is one API request, rows patched in place</p>`;
  $.querySelector('input').addEventListener('input', (e) => ((state.q = e.target.value.trim().toLowerCase()), sortFilterRows()));
  $.querySelector('.bh').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tab) state.tab = t.dataset.tab, (state.cat = '');
    if (t.dataset.sort) state.sort = t.dataset.sort;
    if (t.dataset.cat != null) state.cat = t.dataset.cat;
    sortFilterRows();
  });
  addEventListener('keydown', boardKeys);
}
function visibleBounties() {
  const [, , key, dir] = SORTS.find(([k]) => k == state.sort);
  const ended = state.tab == 'ended';
  return state.items
    .filter((b) => takesEntries(b) != ended && (!state.cat || b.category == state.cat))
    .filter((b) => !state.q || `${b.title} ${b.category} ${b.summary}`.toLowerCase().includes(state.q))
    .sort((a, b) => (key(a) - key(b)) * (ended && state.sort == 'soon' ? -dir : dir));
}

function selectRow(slug) {
  rowEls.get(state.sel)?.removeAttribute('aria-current');
  state.sel = slug;
  const a = rowEls.get(slug);
  if (a) a.setAttribute('aria-current', 'page'), a.scrollIntoView({ block: 'nearest' });
}

function boardKeys(e) {
  const v = document.body.dataset.v;
  if (v == 'profile' || e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = e.target.matches?.('input');
  if (e.key == '/' && !typing) return e.preventDefault(), side().querySelector('input').focus();
  if (e.key == 'Escape' && typing) return e.target.blur();
  if (typing) return;
  if (e.key == 'Enter' && state.sel && !e.target.matches('a,button')) return (location.hash = '#/bounty/' + encodeURIComponent(state.sel));
  const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[e.key];
  if (!step || v == 'leaderboard') return;
  e.preventDefault();
  const order = visibleBounties().map((b) => b.slug);
  const next = order[Math.max(0, Math.min(order.length - 1, order.indexOf(state.sel) + step))];
  if (next && next != state.sel) location.replace('#/bounty/' + encodeURIComponent(next));
}

const side = () => document.querySelector('main').firstElementChild;
const state = { items: [], tab: 'live', sort: 'soon', cat: '', q: '', sel: '' };
const rowEls = new Map(); // slug -> its <a class=row>, made once and patched after
const SORTS = [
  ['soon', 'Closing soon', (b) => Date.parse(b.deadline), 1],
  ['pot', 'Biggest pot', potOf, -1],
  ['entries', 'Most entries', (b) => b.submissionCount, -1],
  ['new', 'Newest', (b) => Date.parse(b.publishedAt ?? b.deadline), -1],
];

export default renderBoard;
