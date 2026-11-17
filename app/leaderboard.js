// A bounty's leaderboard as a virtual list: one request (?rows=first), a fixed row height and a small pool of row nodes
// reused and patched as you scroll, so thousands of entries cost one screenful of DOM. Its header (pot, fee, time left,
// entries, the prize each place pays now) comes from the board answer already in memory.
import renderBoard from './board.js';
import { renderBountyHead, renderStatCards } from './bounty.js';
import { cachedJSON, fmt, revalidateEachMinute, tickCountdowns } from './api.js';

/** One request (the leaderboard); the bounty's numbers come from the board in memory. Rows are re-patched each minute. */
export default async function renderLeaderboard(slug) {
  const path = `/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`;
  const [items, lb] = await Promise.all([renderBoard(slug), cachedJSON(path)]);
  const b = items.find((x) => x.slug == slug) ?? { slug, title: lb.competition?.title ?? slug, status: lb.competition?.status, deadline: lb.phase?.ends_at };
  lbv.rewards = b.rewardsNow ?? [];
  lbv.read(lb);
  const ph = lb.phase ?? {}, title = fmt.esc(fmt.scoreTitle(lbv.col)), n = lbv.rows.length, pane = document.querySelector('main').lastChild;
  pane.innerHTML = `<article class=bp>${renderBountyHead(b, 'leaderboard')}<div class="cards mini">${renderStatCards(b)}</div>
<div class=lbbar><span><b>${fmt.num(n)}</b> ranked · ${fmt.esc(ph.title ?? '')} phase · ${title}${lbv.rows.some((r) => r.low != null) ? ', 90% interval' : ''} · ${ph.placements_held ? 'unofficial until results' : 'final places'}</span>
<input class=find type=search placeholder="Find an entrant or entry" aria-label="Find an entrant or entry"></div>
<div class=lbh><span>#</span><span>Entrant · entry</span><span>${title}</span><span>Prize now</span><span>Entered</span></div><div class=vl></div>
${n ? '' : `<p class=empty>${lb.scores_visible === false ? 'Scores are held until the results publish.' : 'No ranked entries yet.'}</p>`}</article>`;
  Object.assign(lbv, { vl: pane.querySelector('.vl'), pool: [], q: '' }).filter();
  pane.querySelector('input').addEventListener('input', (e) => ((lbv.q = e.target.value.trim().toLowerCase()), lbv.filter(), virtualRows()));
  pane.scrollTop = 0;
  document.title = `Leaderboard · ${b.title} · make.fun bounties`;
  virtualRows();
  tickCountdowns();
  revalidateEachMinute(() => Promise.all([renderBoard(slug), cachedJSON(path).then((fresh) => (lbv.read(fresh), lbv.filter(), virtualRows()))]));
}

/** Draw only the rows in view (and a few beyond), reusing pooled nodes and patching each only when its row changed. */
function virtualRows() {
  const { vl, shown, pool, h } = lbv;
  if (!vl?.isConnected) return;
  vl.style.height = shown.length * h + 'px';
  const top = -vl.getBoundingClientRect().top;
  const first = Math.max(0, Math.floor(top / h) - 4), last = Math.min(shown.length, Math.ceil((top + innerHeight) / h) + 4);
  while (pool.length < last - first) pool.push(vl.appendChild(lbv.makeRow()));
  pool.forEach((el, k) => {
    const i = first + k;
    el.hidden = i >= last;
    if (i < last && (el.row !== shown[i] || el.at !== i)) patchPooledRow(el, shown[i], i);
  });
}

/** One pooled node becomes row i: moved by transform, and its rank, avatar, entrant, score band and prize rewritten. */
function patchPooledRow(el, r, i) {
  el.row = r;
  el.at = i;
  el.style.transform = `translateY(${i * lbv.h}px)`;
  el.href = `#/u/${encodeURIComponent(r.handle)}`;
  const prize = r.prize && lbv.rewards[r.prize - 1];
  el.classList.toggle('paid', !!prize);
  el.dataset.m = r.rank <= 3 ? r.rank : '';
  const [rk, who, sc, pz, at] = el.children, img = who.firstChild, src = fmt.avatar(r.image && r.image + '?size=small', r.handle);
  rk.textContent = r.rank ?? '—';
  if (img.getAttribute('src') != src) img.src = src;
  who.querySelector('b').textContent = r.handle + (r.house ? ' · house' : '');
  who.querySelector('small').textContent = r.title ?? '';
  sc.firstChild.textContent = fmt.score(lbv.col, r.value, r.display);
  const [band, mark] = sc.lastChild.children, pos = (v) => (Math.max(0, Math.min(1, (Number(v) - lbv.lo) / (lbv.hi - lbv.lo || 1))) * 100).toFixed(1) + '%';
  band.style.left = pos(r.low ?? r.value);
  band.style.right = `calc(100% - ${pos(r.high ?? r.value)})`;
  mark.style.left = pos(r.value);
  pz.textContent = prize ? fmt.money(prize.amountUsd, true) : '';
  at.textContent = r.at ? fmt.ago(r.at) : '';
}

const lbv = {
  h: 50, // row height
  rows: [], shown: [], pool: [], vl: null, col: null, rewards: [], lo: 0, hi: 1, q: '',
  /** Read an answer's rows (the first ones whole, the rest compact) into one shape, and the score bar's scale. */
  read(lb) {
    const key = lb.rank_key, one = (e, value, display, image) => ({
      rank: e.rank, handle: e.handle, title: e.title, image, at: e.received_at, prize: e.prize_eligible ? e.prize_rank : null,
      value, display, low: e.interval?.low, high: e.interval?.high, house: e.house || e.baseline,
    });
    lbv.col = (lb.columns ?? []).find((c) => c.key == key) ?? { key, title: 'Score' };
    lbv.rows = (lb.entries ?? []).map((e) => one(e, e.values?.[key], e.display?.[key], e.image)).concat((lb.rest ?? []).map((e) => one(e, e.value, e.display, null)));
    // The bar's scale spans the field (its lowest 5% left out), so close scores still read apart.
    const nums = lbv.rows.flatMap((r) => [r.value, r.low, r.high]).filter((v) => v != null && v !== '').map(Number).sort((x, y) => x - y);
    lbv.lo = nums[Math.floor(nums.length * 0.05)] ?? 0;
    lbv.hi = nums.at(-1) ?? 1;
  },
  filter: () => (lbv.shown = lbv.q ? lbv.rows.filter((r) => `${r.handle} ${r.title}`.toLowerCase().includes(lbv.q)) : lbv.rows),
  makeRow() {
    const a = document.createElement('a');
    a.className = 'lr';
    a.innerHTML = '<span class=rk></span><span class=who><img class=av alt="" decoding=async><span><b></b><small></small></span></span><span class=sc><b></b><span class=ci><i></i><u></u></span></span><span class=pz></span><time></time>';
    a.querySelector('img').crossOrigin = 'anonymous'; // set before src: make.fun's images are same-origin CORP
    return a;
  },
};
addEventListener('scroll', () => requestAnimationFrame(virtualRows), { capture: true, passive: true });
addEventListener('resize', () => requestAnimationFrame(virtualRows));
