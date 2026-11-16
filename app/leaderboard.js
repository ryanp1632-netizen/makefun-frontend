// A bounty's leaderboard as a virtual list: one request (?rows=first, the compact board), a fixed row height, and a
// small pool of row nodes reused and patched as you scroll, so thousands of entries cost a screenful of DOM.
import { cachedJSON } from './api.js';
import { ago, avatarURL, esc, formatScore, money, scoreTitle } from './ui.js';

export default async function showLeaderboard(slug) {
  const [lb, b] = await Promise.all([
    cachedJSON(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`),
    cachedJSON(`/competitions/${encodeURIComponent(slug)}?submissions=summary`).catch(() => ({})),
  ]);
  renderLeaderboard(slug, lb, b);
}

export function renderLeaderboard(slug, lb, b) {
  rows = mergeFullAndCompactRows(lb);
  column = (lb.columns ?? []).find((c) => c.key == lb.rank_key) ?? { key: lb.rank_key, title: 'Score' };
  rewards = b.rewardsNow ?? [];
  // The bar's scale spans the field (its lowest 5% of scores left out), so close scores still read apart.
  const nums = rows.flatMap((r) => [r.value, r.low, r.high]).filter((v) => v != null && v !== '').map(Number).sort((x, y) => x - y);
  const lo = nums[Math.floor(nums.length * 0.05)] ?? 0, hi = nums.at(-1) ?? 1;
  scale = [lo - (hi - lo) * 0.04, hi + (hi - lo) * 0.04];
  const ph = lb.phase ?? {}, s = encodeURIComponent(slug);
  $detail = document.querySelector('main').lastChild;
  $detail.innerHTML = `<div class=lbh><div><div class=crumb><a href="#/">Bounties</a> › <a href="#/bounty/${s}">${esc(lb.competition?.title ?? slug)}</a> › Leaderboard</div>
<h1>Leaderboard <span class=mu>· ${rows.length.toLocaleString('en-US')} entries</span></h1>
<div class=mu>${esc(ph.title ?? '')} phase · ranked by ${esc(scoreTitle(column))}${rows.some((r) => r.low != null) ? ' with its 90% interval' : ''} · ${ph.placements_held ? 'places unofficial until results publish' : 'final'}${rewards.length ? ` · ${rewards.length} paid places, ${money(b.potUsd ?? b.rewardAmount)} pot` : ''}</div></div>
<input class=vlq type=search placeholder="Find an entrant or entry" aria-label="Find an entrant"></div>
<div class=vh><span>Rank</span><span>Entrant · entry</span><span>${esc(scoreTitle(column))}</span><span>Prize now</span><span>Entered</span></div>
${rows.length ? '' : `<p class=pad>${lb.scores_visible === false ? 'Scores are held until the results publish.' : 'No ranked entries yet.'}</p>`}<div class=vl></div>`;
  $vl = $detail.querySelector('.vl');
  pool = [];
  shown = rows;
  $detail.querySelector('.vlq').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    shown = q ? rows.filter((r) => `${r.handle} ${r.title}`.toLowerCase().includes(q)) : rows;
    $detail.scrollTop = 0;
    renderVirtualRows();
  });
  $detail.onscroll = () => requestAnimationFrame(renderVirtualRows);
  $detail.scrollTop = 0;
  renderVirtualRows();
}

/** Draw only the rows in view (plus a few), reusing pooled nodes and patching each only when its row changes. */
function renderVirtualRows() {
  if (!$vl?.isConnected) return;
  $vl.style.height = shown.length * ROW_H + 'px';
  const top = $detail.scrollTop - $vl.offsetTop;
  const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
  const last = Math.min(shown.length, Math.ceil((top + $detail.clientHeight) / ROW_H) + OVERSCAN);
  while (pool.length < last - first) pool.push($vl.appendChild(makePooledRow()));
  pool.forEach((el, k) => {
    const i = first + k;
    el.hidden = i >= last;
    if (i < last && (el.row !== shown[i] || el.at !== i)) patchPooledRow(el, shown[i], i);
  });
}

function makePooledRow() {
  const a = document.createElement('a');
  a.className = 'vr';
  a.innerHTML = `<span class=rk></span><span class=who><img class=av alt="" decoding=async><div class=t><b></b><small></small></div></span><span class=sc><b></b><span class=ci><i></i><b></b></span></span><span class=won></span><time></time>`;
  a.querySelector('img').crossOrigin = 'anonymous';
  return a;
}

function patchPooledRow(el, r, i) {
  el.row = r;
  el.at = i;
  el.style.transform = `translateY(${i * ROW_H}px)`;
  el.href = `#/u/${encodeURIComponent(r.handle)}`;
  const prize = r.prize && rewards[r.prize - 1];
  el.classList.toggle('prize', !!prize);
  el.dataset.medal = r.rank && r.rank <= 3 ? r.rank : '';
  const [rk, who, sc, won, at] = el.children;
  rk.textContent = r.rank ?? '—';
  const img = who.firstChild, src = avatarURL(r.image, r.handle, true);
  if (img.getAttribute('src') != src) img.src = src;
  who.querySelector('b').textContent = r.handle + (r.house ? ' · house' : '');
  who.querySelector('small').textContent = r.title ?? '';
  sc.firstChild.textContent = formatScore(column, r.value, r.display);
  const [band, mark] = sc.lastChild.children;
  band.style.left = pos(r.low ?? r.value);
  band.style.width = `calc(${pos(r.high ?? r.value)} - ${pos(r.low ?? r.value)})`;
  mark.style.left = pos(r.value);
  won.textContent = prize ? money(prize.amountUsd) : '';
  at.textContent = r.at ? ago(r.at) : '';
}

/** The first rows (whole) and the rest (compact) of ?rows=first, in one shape. */
function mergeFullAndCompactRows(lb) {
  const key = lb.rank_key, one = (e, value, display, image) => ({
    rank: e.rank, handle: e.handle, title: e.title, image, at: e.received_at, prize: e.prize_eligible ? e.prize_rank : null,
    value, display, low: e.interval?.low, high: e.interval?.high, house: e.house || e.baseline,
  });
  return (lb.entries ?? []).map((e) => one(e, e.values?.[key], e.display?.[key], e.image))
    .concat((lb.rest ?? []).map((e) => one(e, e.value, e.display, null)));
}

const pos = (v) => (Math.max(0, Math.min(1, (Number(v) - scale[0]) / (scale[1] - scale[0] || 1))) * 100).toFixed(2) + '%';
const ROW_H = 56, OVERSCAN = 6;
let rows = [], shown = [], pool = [], scale = [0, 1], column = null, rewards = [], $vl = null, $detail = null;
