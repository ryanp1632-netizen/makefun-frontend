// An account's public profile from one request: who it is, its record as five stat cards, and its entries grouped by
// bounty (best place first), each entry with its place, title, score and prize or status, linking back to the bounty
// and its leaderboard. Two columns on a desktop, one on a phone.
import { avatarImg, cachedJSON, esc, fmtDay, money, num, patchHTML, relTime, scoreName, scoreText, statCard, takesEntries } from './api.js';

/** #/u/<handle>: one API request. */
function renderProfile(handle) {
  return cachedJSON('/profiles/' + encodeURIComponent(handle)).then(paintProfile, (e) => {
    document.querySelector('main').lastElementChild.innerHTML = `<p class=empty>No public profile for @${esc(handle)} (${esc(e.message)}).</p>`;
  });
}

/** One group per bounty, its entries best place first; groups ordered by their best place, then the newest. */
function groupEntriesByBounty(list) {
  const by = new Map();
  for (const s of list) {
    const c = s.competition ?? {};
    if (!by.has(c.slug)) by.set(c.slug, { c, entries: [] });
    by.get(c.slug).entries.push(s);
  }
  for (const g of by.values()) {
    g.entries.sort((x, y) => (x.placement ?? 1e9) - (y.placement ?? 1e9) || (y.entered_at > x.entered_at ? 1 : -1));
    g.best = g.entries[0].placement ?? 1e9;
    g.last = g.entries.reduce((m, s) => (s.entered_at > m ? s.entered_at : m), '');
  }
  return [...by.values()].sort((x, y) => x.best - y.best || (y.last > x.last ? 1 : -1));
}

/** A bounty's card: its title and state, then each entry with place, title, score and prize or status. */
function renderGroup(g) {
  const { c, entries } = g;
  const slug = encodeURIComponent(c.slug ?? ''), live = takesEntries({ status: c.status, deadline: c.deadline });
  const state = live ? `closes ${relTime(c.deadline)}` : c.status == 'resolved' ? `ended ${fmtDay(c.deadline)}` : `judging since ${fmtDay(c.deadline)}`;
  return `<section class=box><a class=gb href="#/bounty/${slug}">${esc(c.title)}</a>
<p>${state} · ${money(c.reward_usd)} reward · <a href="#/bounty/${slug}/leaderboard">leaderboard</a></p>
${entries.map((s) => {
    const status = s.prize_usd ? `<b class=pot>${money(s.prize_usd)}</b>` : s.placement || c.status == 'resolved' ? '<span class=mu>no prize</span>'
      : `<span class=mu>${live ? 'in the running' : 'awaiting result'}</span>`;
    const score = s.score ? `<span class=mu title="${esc(s.score.column?.title)}">${esc(scoreName(s.score.column))} ${scoreText(s.score.column, s.score.value, s.score.display)}</span>` : '<span></span>';
    return `<div class=en><b>${s.placement ? '#' + s.placement : '—'}</b><span title="${esc(s.title)}">${esc(s.title)}</span>${score}${status}</div>`;
  }).join('')}</section>`;
}

function paintProfile(p) {
  const pane = document.querySelector('main').lastElementChild, r = p.record ?? {}, list = p.solutions ?? [], groups = groupEntriesByBounty(list);
  document.title = '@' + p.handle + ' · make.fun bounties';
  if (pane.dataset.slug != '@' + p.handle) {
    pane.dataset.slug = '@' + p.handle;
    pane.innerHTML = '<article class="bp wide"><div class=ph></div><div class="cards stats"></div><h2 class=gh></h2><div class=grid></div></article>';
    pane.querySelector('.ph').append(avatarImg(p.avatar?.url ?? p.image, p.handle), document.createElement('div'));
    pane.scrollTop = 0;
  }
  const links = [
    p.github_login && [`https://github.com/${encodeURIComponent(p.github_login)}`, 'GitHub ' + p.github_login],
    p.x?.url && [p.x.url, 'X @' + p.x.username],
    p.discord?.url && [p.discord.url, 'Discord ' + p.discord.username],
    p.wallet?.explorer_url && [p.wallet.explorer_url, `Wallet ${p.wallet.address.slice(0, 4)}…${p.wallet.address.slice(-4)}`],
    [`https://make.fun/u/${encodeURIComponent(p.handle)}`, 'make.fun ↗'],
  ].filter(Boolean).map(([href, text]) => `<a href="${esc(href)}" target=_blank rel=noopener>${esc(text)}</a>`).join('');
  patchHTML(pane.querySelector('.ph').lastChild, `<h1>${esc(p.display_name || '@' + p.handle)}</h1>
<div class=mu>${p.display_name ? '@' + esc(p.handle) + ' · ' : ''}joined ${fmtDay(p.joined_at)}${p.bio ? ' · ' + esc(p.bio) : ''}${p.house ? ' · house account' : ''}</div><div class=links>${links}</div>`);
  patchHTML(pane.querySelector('.stats'), statCard('PRIZES WON', money(r.prize_usd), `${num(p.payouts?.length)} payouts`, 'pot')
    + statCard('BOUNTIES ENTERED', num(r.competitions_entered), `${num(list.length)} public entries`)
    + statCard('PLACED', num(r.competitions_placed), 'in a paid place')
    + statCard('WON', num(r.competitions_won), `first places · ${num(r.podium_finishes)} podiums`)
    + statCard('BEST PLACE', r.best_placement ? '#' + r.best_placement : '—', r.best_placement ? 'best finish' : 'no place yet'));
  patchHTML(pane.querySelector('.gh'), `Entries by bounty <span class=mu>· ${num(list.length)} entries in ${num(groups.length)} bounties, best place first</span>`);
  patchHTML(pane.querySelector('.grid'), groups.map(renderGroup).join('') || '<p class=empty>No public entries yet.</p>');
}

export default renderProfile;
