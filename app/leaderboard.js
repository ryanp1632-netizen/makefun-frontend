// A bounty's leaderboard as a virtual list: one request (?rows=first: the first rows whole, the rest compact), a
// fixed row height and a small pool of row nodes reused and patched as you scroll, so thousands of entries cost one
// screenful of DOM. The header's pot, fee, time left and entries come from the board's answer, held in memory.
import { showBoard } from './board.js';
import { BOARD, avatarURL, cachedJSON, esc, money, num, potOf, relTime, scoreName, scoreText, takesEntries, tickCountdowns } from './api.js';

/** #/bounty/<slug>/leaderboard: one API request for the board of entries. */
function renderLeaderboard(slug) {
  const wide = matchMedia('(min-width:901px)').matches;
  const bounty = wide ? showBoard(slug) : cachedJSON(BOARD).then((x) => x.items.find((b) => b.slug == slug));
  return Promise.all([cachedJSON(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`), bounty]).then(([lb, b]) => paintLeaderboard(slug, lb, b ?? {}));
}

/** Draw only the rows in view (plus a few), reusing pooled nodes and patching a node only when its row changes. */
function virtualRows() {
  if (!vl?.isConnected) return;
  const pane = vl.parentElement, n = shown.length;
  vl.style.height = n * ROW_H + 'px';
  const top = pane.scrollTop - vl.offsetTop;
  const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
  const last = Math.min(n, Math.ceil((top + pane.clientHeight) / ROW_H) + OVERSCAN);
  while (pool.length < last - first) pool.push(vl.appendChild(pooledRow()));
  pool.forEach((el, k) => {
    const i = first + k;
    el.hidden = i >= last;
    if (i < last && (el.row !== shown[i] || el.at !== i)) patchRow(el, i);
  });
}

/** A pooled row node takes the row at index i: its position, link, avatar, texts and bar are rewritten. */
function patchRow(el, i) {
  const r = (el.row = shown[i]);
  el.at = i;
  el.style.transform = `translateY(${i * ROW_H}px)`;
  el.href = '#/u/' + encodeURIComponent(r.handle);
  const [rk, who, sc, prize, at] = el.children, img = who.firstChild, src = avatarURL(r.image, r.handle);
  rk.firstChild.textContent = r.rank ?? '—';
  if (r.rank <= 3) rk.firstChild.dataset.m = r.rank;
  else delete rk.firstChild.dataset.m;
  if (img.getAttribute('src') != src) img.src = src;
  who.querySelector('b').textContent = '@' + r.handle + (r.house ? ' · house' : '');
  who.querySelector('small').textContent = r.title ?? '';
  sc.firstChild.textContent = scoreText(column, r.value, r.display);
  const bar = sc.lastChild.firstChild, lo = pos(r.low ?? r.value), hi = pos(r.high ?? r.value);
  bar.style.left = lo + '%';
  bar.style.width = Math.max(1.5, hi - lo) + '%';
  const won = r.prize && rewards[r.prize - 1];
  prize.textContent = won ? money(won.amountUsd) : '—';
  prize.className = won ? 'pot' : 'mu';
  at.textContent = r.at ? relTime(r.at) : '';
}

function pooledRow() {
  const a = document.createElement('a');
  a.className = 'lr';
  a.innerHTML = '<span><span class=rk></span></span><span class=who><img class=av alt=""><div><b></b><small></small></div></span><span class=sc><b></b><span class=ci><i></i></span></span><b></b><span class=mu></span>';
  const img = a.querySelector('img');
  img.crossOrigin = 'anonymous'; // before src: make.fun's images are CORP same-origin
  img.decoding = 'async';
  return a;
}

/** Build the frame once per bounty; a refresh of the same bounty keeps the filter and scroll and repaints the rows. */
function paintLeaderboard(slug, lb, b) {
  const pane = document.querySelector('main').lastElementChild, s = encodeURIComponent(slug);
  rows = mergeRows(lb);
  column = (lb.columns ?? []).find((c) => c.key == lb.rank_key) ?? { title: 'Score' };
  rewards = b.rewardsNow ?? [];
  const nums = rows.flatMap((r) => [r.value, r.low, r.high]).filter((v) => v != null && v !== '').map(Number).sort((x, y) => x - y);
  const lo = nums[Math.floor(nums.length * 0.05)] ?? 0, hi = nums.at(-1) ?? 1;
  scale = [lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.02];
  const title = lb.competition?.title ?? b.title ?? slug, ph = lb.phase ?? {}, live = takesEntries(b);
  document.title = 'Leaderboard · ' + title;
  if (pane.dataset.slug != slug + '/lb') {
    pane.dataset.slug = slug + '/lb';
    pane.innerHTML = `<div class=lbh><div class=chips><a class=crumb href="#/">Bounties</a><span class=tag>${esc(b.category ?? 'Bounty')}</span>${live ? '<span class="tag live">Open, taking entries</span>' : ''}</div>
<div class=top><h1>${esc(title)}</h1><a class="btn go" href="https://make.fun/bounty/${s}" target=_blank rel=noopener>${live ? 'Enter on make.fun' : 'Open on make.fun'} ↗</a></div>
<nav class=tabs><a href="#/bounty/${s}">Overview</a><a href="#/bounty/${s}/leaderboard" aria-current=page>Leaderboard<b>${num(b.submissionCount ?? rows.length)}</b></a></nav>
<div class=mini></div><label class=find><span class=mu></span><input type=search placeholder="Find an entrant or entry" aria-label="Find an entrant or entry"></label></div>
<div class="lr hd"><span>RANK</span><span>ENTRANT · ENTRY</span><span></span><span>PRIZE NOW</span><span>ENTERED</span></div><div class=vl></div>`;
    pane.querySelector('input').addEventListener('input', (e) => filterRows(e.target.value));
    pane.onscroll = () => requestAnimationFrame(virtualRows);
    vl = pane.querySelector('.vl');
    pool = [];
    pane.scrollTop = 0;
    query = '';
  }
  pane.querySelector('.mini').innerHTML = `<span class=pot><b>${money(potOf(b))}</b>${live ? 'live pot' : 'pot'}</span><span><b>${Number(b.entryFeeUsd) ? money(b.entryFeeUsd) : 'Free'}</b>entry fee</span>`
    + (live ? `<span class=hot><b data-dl="${esc(b.deadline)}" data-fmt=short></b>left</span>` : '<span><b>Ended</b>entries closed</span>')
    + `<span><b>${num(b.submissionCount ?? rows.length)}</b>entries</span><span><b>${num(rows.length)}</b>ranked</span><span><b>${rewards.length}</b>paid places</span>`;
  pane.querySelector('.find .mu').textContent = `${ph.title ?? 'Results'} phase · by ${scoreName(column).toLowerCase()}${rows.some((r) => r.low != null) ? ', bar = 90% interval' : ''}${ph.placements_held ? ' · unofficial until results' : ''}`;
  pane.querySelector('.hd').children[2].textContent = scoreName(column).toUpperCase();
  pane.querySelector('.hd').children[3].textContent = live ? 'PRIZE NOW' : 'PRIZE';
  if (!rows.length) vl.innerHTML = `<p class=empty>${lb.scores_visible === false ? 'Scores are held until the results publish.' : 'No ranked entries yet.'}</p>`;
  filterRows(query);
  tickCountdowns();
}

function filterRows(q) {
  query = q.trim().toLowerCase();
  shown = query ? rows.filter((r) => `${r.handle} ${r.title}`.toLowerCase().includes(query)) : rows;
  virtualRows();
}

/** ?rows=first's whole rows and compact rest in one shape. */
function mergeRows(lb) {
  const key = lb.rank_key, one = (e, value, display, image) => ({
    rank: e.rank, handle: e.handle, title: e.title, image, at: e.received_at, prize: e.prize_eligible ? e.prize_rank : null,
    value, display, low: e.interval?.low, high: e.interval?.high, house: e.house || e.baseline,
  });
  return (lb.entries ?? []).map((e) => one(e, e.values?.[key], e.display?.[key], e.image))
    .concat((lb.rest ?? []).map((e) => one(e, e.value, e.display, null)));
}

const pos = (v) => Math.max(0, Math.min(100, ((Number(v) - scale[0]) / (scale[1] - scale[0] || 1)) * 100));
const ROW_H = 48, OVERSCAN = 8;
let rows = [], shown = [], pool = [], scale = [0, 1], column = null, rewards = [], vl = null, query = '';

export default renderLeaderboard;
