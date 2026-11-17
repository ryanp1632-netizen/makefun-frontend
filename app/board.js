// The board: every bounty from one request, Live and Ended tabs, sort and category chips and a filter. It is built once,
// then patched row by row: re-sorting, moving between bounties and each minute's revalidation never rebuild it.
import { cachedJSON, fmt, patchHTML, revalidateEachMinute, takesEntries, tickCountdowns } from './api.js';

/** The board in the left pane and, on the board route, the selected bounty's overview beside it from the same answer. */
export default async function renderBoard(slug) {
  if (!board.rows.size) board.build();
  const { items } = await cachedJSON(board.path);
  patchBoardRows(items);
  board.select(slug || board.sel || board.visible()[0]?.slug);
  if (document.body.dataset.route == 'board') {
    revalidateEachMinute(async () => patchBoardRows((await cachedJSON(board.path)).items));
    const b = items.find((x) => x.slug == board.sel);
    if (b && matchMedia('(min-width:861px)').matches) (await import('./bounty.js')).renderOverview(b);
  }
  tickCountdowns();
  return items;
}

/** Patch rows in place: a new bounty gets a row, a changed one has only its changed parts rewritten. */
export function patchBoardRows(items) {
  board.items = items;
  for (const b of items) {
    let a = board.rows.get(b.slug);
    if (!a) {
      a = document.createElement('a');
      a.className = 'row';
      a.href = `#/bounty/${encodeURIComponent(b.slug)}`;
      a.innerHTML = '<span class=r1><b></b><em class=badge hidden>closing soon</em><small></small></span><span class=r2><b class=pot></b> pot · <span></span> · <time></time> · <span></span></span>';
      board.rows.set(b.slug, a);
    }
    const live = takesEntries(b), [r1, r2] = a.children, [pot, mid, time, n] = r2.children;
    patchHTML(r1.firstChild, fmt.esc(b.title));
    patchHTML(r1.lastChild, fmt.esc(b.category ?? ''));
    r1.children[1].hidden = !(live && Date.parse(b.deadline) - Date.now() < 864e5);
    patchHTML(pot, fmt.money(b.potUsd ?? b.rewardAmount));
    patchHTML(mid, live ? (Number(b.entryFeeUsd) ? `<b>${fmt.money(b.entryFeeUsd)}</b> fee` : 'free to enter')
      : b.winner?.handle ? `won by <b>@${fmt.esc(b.winner.handle)}</b>` : b.status == 'resolved' ? 'resolved' : 'judging, results soon');
    if (live) {
      time.dataset.dl = b.deadline;
      time.textContent ||= fmt.timeLeft(b.deadline);
    } else {
      delete time.dataset.dl;
      time.classList.remove('soon');
      time.textContent = 'ended ' + fmt.day(b.deadline);
    }
    patchHTML(n, `<b>${fmt.num(b.submissionCount)}</b> entries`);
  }
  for (const [slug, a] of board.rows) if (!items.some((b) => b.slug == slug)) a.remove(), board.rows.delete(slug);
  orderBoardRows();
  const live = items.filter(takesEntries), next = live.reduce((m, b) => (!m || b.deadline < m.deadline ? b : m), null);
  patchHTML(board.$('.sum'), `<div><b>${live.length}</b><span>live bounties</span></div>
<div><b class=pot>${fmt.money(live.reduce((s, b) => s + Number(b.potUsd ?? b.rewardAmount), 0))}</b><span>in live pots</span></div>
<div><b>${fmt.num(live.reduce((s, b) => s + b.submissionCount, 0))}</b><span>entries so far</span></div>
<div><b><time data-dl="${next?.deadline ?? ''}">${next ? fmt.timeLeft(next.deadline) : '—'}</time></b><span title="${fmt.esc(next?.title)}">next deadline</span></div>`);
  for (const el of board.pane().querySelectorAll('[data-tab] i')) el.textContent = items.filter((b) => takesEntries(b) == (el.parentNode.dataset.tab == 'live')).length;
}

/** Order the existing rows by tab, category, filter and sort: nodes are moved and hidden, never rebuilt. */
function orderBoardRows() {
  const list = board.$('.rows'), shown = board.visible();
  for (const a of board.rows.values()) a.hidden = true;
  for (const b of shown) list.append(Object.assign(board.rows.get(b.slug), { hidden: false }));
  patchHTML(board.$('.empty'), shown.length ? '' : 'No bounties match.');
  const inTab = board.items.filter((b) => takesEntries(b) == (board.tab == 'live')), cats = {};
  for (const b of inTab) cats[b.category] = (cats[b.category] || 0) + 1;
  patchHTML(board.$('.cats'), [['', 'All', inTab.length], ...Object.keys(cats).sort().map((c) => [c, c, cats[c]])]
    .map(([c, label, k]) => `<button class=chip data-cat="${fmt.esc(c)}" aria-pressed=${board.cat == c}>${fmt.esc(label)} ${k}</button>`).join(''));
  for (const el of board.pane().querySelectorAll('[data-tab]')) el.setAttribute('aria-selected', el.dataset.tab == board.tab);
  for (const el of board.pane().querySelectorAll('[data-sort]')) el.setAttribute('aria-pressed', el.dataset.sort == board.sort);
}

/** j/k or the arrows move the selection (opening it beside the board), Enter opens it, / filters, Escape leaves the filter. */
function boardKeys(e) {
  if (document.body.dataset.route == 'profile' || e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = e.target.matches?.('input');
  if (e.key == '/' && !typing) return e.preventDefault(), board.$('input').focus();
  if (e.key == 'Escape' && typing) return e.target.blur();
  if (e.key == 'Enter' && !typing && !e.target.closest?.('a,button') && board.sel) return (location.hash = `#/bounty/${encodeURIComponent(board.sel)}`);
  const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[e.key];
  if (!step || (typing && e.key.length == 1) || e.target.closest?.('.lbbar')) return;
  e.preventDefault();
  const order = board.visible().map((b) => b.slug), next = order[Math.max(0, Math.min(order.length - 1, order.indexOf(board.sel) + step))];
  if (next) location.replace(`#/bounty/${encodeURIComponent(next)}${document.body.dataset.route == 'leaderboard' ? '/leaderboard' : ''}`);
}

const board = {
  path: '/competitions?activity=times', // every bounty, open and ended, in one answer
  items: [], rows: new Map(), tab: 'live', sort: 'dl', cat: '', q: '', sel: '',
  pane: () => document.querySelector('main').firstChild,
  $: (sel) => board.pane().querySelector(sel),
  /** The bounties the tab, category and filter leave, sorted: closing soon (ended: latest first), biggest pot, most entries. */
  visible() {
    const live = board.tab == 'live', q = board.q, key = {
      dl: (b) => (live ? -1 : 1) * Date.parse(b.deadline), pot: (b) => Number(b.potUsd ?? b.rewardAmount), n: (b) => b.submissionCount,
    }[board.sort];
    return board.items
      .filter((b) => takesEntries(b) == live && (!board.cat || b.category == board.cat) && (!q || `${b.title} ${b.category} ${b.summary}`.toLowerCase().includes(q)))
      .sort((x, y) => key(y) - key(x));
  },
  select(slug) {
    board.rows.get(board.sel)?.removeAttribute('aria-current');
    board.sel = slug;
    const a = board.rows.get(slug), b = board.items.find((x) => x.slug == slug);
    if (b && takesEntries(b) != (board.tab == 'live')) (board.tab = takesEntries(b) ? 'live' : 'ended'), (board.cat = ''), orderBoardRows();
    if (a) a.setAttribute('aria-current', 'page'), a.scrollIntoView({ block: 'nearest' });
  },
  build() {
    board.pane().innerHTML = `<div class=sum></div>
<div class=ctl><div class=seg role=tablist><button role=tab data-tab=live>Live <i></i></button><button role=tab data-tab=ended>Ended <i></i></button></div>
<div class=chips><button class=chip data-sort=dl>Closing soon</button><button class=chip data-sort=pot>Biggest pot</button><button class=chip data-sort=n>Most entries</button></div></div>
<label class=flt><input class=find type=search placeholder="Filter bounties by name" aria-label="Filter bounties by name"><kbd>/</kbd></label>
<div class=cats></div><div class=rows></div><p class=empty></p>
<p class=keys><kbd>j</kbd> <kbd>k</kbd> or <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> opens · <kbd>/</kbd> filters · times in UTC</p>`;
    board.$('input').addEventListener('input', (e) => ((board.q = e.target.value.trim().toLowerCase()), orderBoardRows()));
    board.pane().addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.tab) (board.tab = t.dataset.tab), (board.cat = '');
      if (t.dataset.sort) board.sort = t.dataset.sort;
      if (t.dataset.cat != null) board.cat = t.dataset.cat;
      orderBoardRows();
    });
    addEventListener('keydown', boardKeys);
  },
};
