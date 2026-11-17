// An account's public profile from one request: who it is, its record, every entry grouped by bounty (best place
// first, each linking back to its bounty and that bounty's leaderboard) and its payouts.
import { cachedJSON, fmt, takesEntries, tickCountdowns } from './api.js';

export default async function renderProfile(handle) {
  const pane = document.querySelector('main').lastChild;
  let p;
  try {
    p = await cachedJSON(`/profiles/${encodeURIComponent(handle)}`);
  } catch (e) {
    pane.innerHTML = `<article class=pf><h1>@${fmt.esc(handle)}</h1><p class=empty>No public profile found (${fmt.esc(e.message)}).</p></article>`;
    return;
  }
  // One bounty: its title and state, then each entry's place, title, score and prize (or why there is none yet).
  function renderBountyCard({ c, entries }) {
    const s = encodeURIComponent(c.slug ?? ''), live = takesEntries(c), done = c.status == 'resolved';
    const meta = live ? `closes in <time data-dl="${fmt.esc(c.deadline)}">${fmt.timeLeft(c.deadline)}</time> · ${fmt.money(c.pot_usd ?? c.reward_usd)} pot`
      : `${done ? 'ended' : 'judging, closed'} ${fmt.day(c.deadline)} · ${fmt.money(c.reward_usd)} reward`;
    return `<section class=ec><a href="#/bounty/${s}">${fmt.esc(c.title)}</a><small>${meta} · <a href="#/bounty/${s}/leaderboard">leaderboard</a></small><ol>${entries.map((e) => {
      const prize = Number(e.prize_usd), status = live ? 'taking entries' : !done ? 'awaiting result' : 'no prize';
      return `<li><span class="pl${prize ? (e.placement <= 3 ? ' top' : ' paid') : ''}">${e.placement ? '#' + e.placement : '—'}</span><span class=et title="${fmt.esc(e.title)}">${fmt.esc(e.title)}</span><span class=scv>${e.score ? fmt.score(e.score.column, e.score.value, e.score.display) : ''}</span>${prize ? `<span class=pz>${fmt.money(prize, true)}</span>` : `<span class="pz no">${status}</span>`}</li>`;
    }).join('')}</ol></section>`;
  }
  const r = p.record ?? {}, all = p.solutions ?? [], groups = groupEntriesByBounty(all), pay = p.payouts ?? [];
  const paid = groups.filter((g) => g.entries.some((s) => Number(s.prize_usd) > 0)).length, best = groups.find((g) => g.best == r.best_placement);
  const link = (href, text) => `<a href="${fmt.esc(href)}" target=_blank rel=noopener>${fmt.esc(text)}</a>`, links = [
    p.github_login && link(`https://github.com/${encodeURIComponent(p.github_login)}`, `GitHub ${p.github_login}`),
    p.x?.url && link(p.x.url, `X @${p.x.username}`),
    p.wallet?.address && link(p.wallet.explorer_url, `Wallet ${p.wallet.address.slice(0, 4)}…${p.wallet.address.slice(-4)}`),
    link(`https://make.fun/u/${encodeURIComponent(p.handle)}`, 'Profile on make.fun ↗'),
  ].filter(Boolean);
  const card = (label, value, sub, cls = '') => `<div class=card><span>${label}</span><b class="${cls}">${value}</b><small>${fmt.esc(sub)}</small></div>`;
  pane.innerHTML = `<article class=pf>
<div class=hero><img class=av crossorigin=anonymous alt="" src="${fmt.esc(fmt.avatar(p.avatar?.url ?? p.image, p.handle))}"><div><h1>${fmt.esc(p.display_name || p.handle)}</h1>
<p>@${fmt.esc(p.handle)} · joined ${fmt.day(p.joined_at, true)}${p.house ? ' · house account' : ''}${p.bio ? ' · ' + fmt.esc(p.bio) : ''}</p><p class=links>${links.join('')}</p></div></div>
<div class="cards five">${card('Prizes won', fmt.money(r.prize_usd), `${pay.length} payout${pay.length == 1 ? '' : 's'}`, 'pot')}${card('Bounties entered', fmt.num(r.competitions_entered ?? groups.length), `${all.length} entries`)}${card('Placed', fmt.num(r.competitions_placed), `${paid} in a paid place`)}${card('Won', fmt.num(r.competitions_won), `${r.podium_finishes ?? 0} podium finishes`)}${card('Best place', r.best_placement ? '#' + r.best_placement : '—', best ? `in ${best.c.title}` : '')}</div>
<h2>Entries by bounty <span>— ${all.length} entries in ${groups.length} bounties, best place first</span></h2>
<div class=eg>${groups.map(renderBountyCard).join('') || '<p class=empty>No public entries yet.</p>'}</div>
${pay.length ? `<section class="box payouts"><h2>Payouts</h2><p>${pay.length} paid in USDC on Solana</p><table class=rw><tbody>${pay.map((x) => `<tr><td><a href="#/bounty/${encodeURIComponent(x.competition?.slug ?? '')}">${fmt.esc(x.competition?.title)}</a></td><td>#${x.place}</td><td>${fmt.day(x.paid_at)}</td><td>${fmt.money(x.amount_usd, true)}</td><td><a href="${fmt.esc(x.explorer_url)}" target=_blank rel=noopener>transaction ↗</a></td></tr>`).join('')}</tbody></table></section>` : ''}
</article>`;
  scrollTo(0, 0);
  document.title = `${p.handle} · make.fun bounties`;
  tickCountdowns();
}

/** The entries by bounty: each bounty's entries best place first, the bounties by their best place, then newest. */
function groupEntriesByBounty(solutions) {
  const by = new Map();
  for (const s of solutions) {
    const slug = s.competition?.slug ?? '';
    if (!by.has(slug)) by.set(slug, { c: s.competition ?? {}, entries: [] });
    by.get(slug).entries.push(s);
  }
  const place = (s) => s.placement ?? Infinity;
  for (const g of by.values()) {
    g.entries.sort((x, y) => place(x) - place(y) || (x.entered_at < y.entered_at ? 1 : -1));
    g.best = g.entries[0].placement;
  }
  return [...by.values()].sort((x, y) => (x.best ?? Infinity) - (y.best ?? Infinity) || (x.c.deadline < y.c.deadline ? 1 : -1));
}
