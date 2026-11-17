// An account's public profile: who it is, its record, its entries (each linking back to its bounty and that
// bounty's leaderboard) and its payouts. One request, the first 12 bounties drawn and the rest on demand.
import { cachedJSON } from './api.js';
import { ago, avatarImg, esc, fmtDay, formatScore, money, ordinal, scoreTitle, takesEntries } from './ui.js';

export default async function showProfile(handle) {
  renderProfile(await cachedJSON(`/profiles/${encodeURIComponent(handle)}`));
}

export function renderProfile(p) {
  const r = p.record ?? {}, all = p.solutions ?? [], sol = groupEntriesByBounty(all), pay = p.payouts ?? [];
  const stat = (label, v, cls = '') => `<div class=card><span>${label}</span><b class="${cls}">${v}</b></div>`;
  const $detail = document.querySelector('main').lastChild;
  document.title = `${p.handle} · make.fun board`;
  $detail.innerHTML = `<article class=pad>
<div class=crumb><a href="#/">Bounties</a> › Profile</div>
<div class=ph>${avatarImg(p.avatar?.url ?? p.image, p.handle)}<div><h1>${esc(p.display_name || p.handle)}</h1>
<div class=mu>@${esc(p.handle)} · joined ${fmtDay(p.joined_at)}${p.house ? ' · house account' : ''}</div></div></div>
${p.bio ? `<p class=lede style="margin-top:12px">${esc(p.bio)}</p>` : ''}<div class="crumb">${renderProfileLinks(p)}</div>
<div class=stats>${stat('Entered', r.competitions_entered ?? 0)}${stat('Placed', r.competitions_placed ?? 0)}${stat('Won', r.competitions_won ?? 0)}${stat('Podiums', r.podium_finishes ?? 0)}${stat('Best', r.best_placement ? ordinal(r.best_placement) : '—')}${stat('Earned', money(r.prize_usd), 'pot')}</div>
<div class=cols><section><h2>Entries · ${all.length} in ${sol.length} bounties</h2><ol class=ent>${sol.slice(0, PAGE).map(renderEntryLine).join('')}</ol>${sol.length > PAGE ? `<p><button class=btn>Show all ${sol.length} bounties</button></p>` : ''}${sol.length ? '' : '<p class=mu>No public entries yet.</p>'}</section>
<section><h2>Payouts · ${pay.length}</h2><ol class=ent>${pay.map((x) => `<li><a class=t href="#/bounty/${encodeURIComponent(x.competition?.slug ?? '')}"><b>${esc(x.competition?.title)}</b><small>${ordinal(x.place)} place · paid ${fmtDay(x.paid_at)}</small></a><div class=r><b class=pot>${money(x.amount_usd)}</b></div></li>`).join('') || '<li class=mu>No payouts yet.</li>'}</ol></section></div>
</article>`;
  $detail.querySelector('button.btn')?.addEventListener('click', (e) => {
    $detail.querySelector('.ent').insertAdjacentHTML('beforeend', sol.slice(PAGE).map(renderEntryLine).join(''));
    e.target.remove();
  });
  $detail.scrollTop = 0;
}

/** One line per bounty: its best-placed entry (else its newest), with how many entries the account made there. */
function groupEntriesByBounty(sol) {
  const by = new Map();
  for (const s of sol) {
    const k = s.competition?.slug, g = by.get(k);
    if (!g) by.set(k, { ...s, count: 1 });
    else {
      g.count++;
      if (s.placement && (!g.placement || s.placement < g.placement)) by.set(k, { ...s, count: g.count });
    }
  }
  return [...by.values()];
}

function renderEntryLine(s) {
  const c = s.competition ?? {}, slug = encodeURIComponent(c.slug ?? '');
  const live = takesEntries({ status: c.status, deadline: c.deadline });
  const badge = s.placement ? `<span class="badge ${s.placement <= 3 ? 'gold' : 'in'}">${ordinal(s.placement)} place</span>`
    : `<span class=badge>${live ? 'taking entries' : c.status == 'resolved' ? 'unplaced' : 'judging'}</span>`;
  return `<li><a class=t href="#/bounty/${slug}"><b>${esc(s.title)}</b><small>${esc(c.title)} · ${s.count > 1 ? `${s.count} entries` : `entered ${ago(s.entered_at)}`}</small></a>
<div class=r>${badge}${s.prize_usd ? `<b class=pot>${money(s.prize_usd)}</b>` : ''}${s.score ? `<span class=mu>${esc(scoreTitle(s.score.column))} <b style="color:var(--tx)">${formatScore(s.score.column, s.score.value, s.score.display)}</b></span>` : ''}<a href="#/bounty/${slug}/leaderboard">leaderboard →</a></div></li>`;
}

function renderProfileLinks(p) {
  const out = [], a = (href, text) => `<a href="${esc(href)}" target=_blank rel=noopener>${esc(text)}</a>`;
  if (p.github_login) out.push(a(`https://github.com/${encodeURIComponent(p.github_login)}`, `GitHub ${p.github_login}`));
  if (p.x?.url) out.push(a(p.x.url, `X @${p.x.username}`));
  if (p.discord?.url) out.push(a(p.discord.url, `Discord ${p.discord.username}`));
  if (p.wallet?.address) out.push(a(p.wallet.explorer_url, `Wallet ${p.wallet.address.slice(0, 4)}…${p.wallet.address.slice(-4)}`));
  out.push(a(`https://make.fun/u/${encodeURIComponent(p.handle)}`, 'on make.fun ↗'));
  return out.join(' · ');
}

const PAGE = 12;
