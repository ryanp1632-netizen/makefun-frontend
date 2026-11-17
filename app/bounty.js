// A bounty's page beside the board: status, the four numbers that matter (live pot, entry fee, time left, entries),
// the rewards table with base, fee share and pays now, the dates and phases with a live "Now" marker, the description
// and the rules. It paints at once from the board's answer, then one request (?submissions=summary) adds the phases,
// the passed-checks count and the rules, patching only the parts that changed.
import { showBoard, syncBoardRow } from './board.js';
import { cachedJSON, esc, fmtDate, fmtDay, markdown, money, num, patchHTML, potOf, relTime, statCard, takesEntries, tickCountdowns } from './api.js';

/** #/bounty/<slug>: one API request; the board beside it comes from memory. */
function renderBounty(slug) {
  let full = false;
  const wide = matchMedia('(min-width:901px)').matches;
  const fromBoard = wide && showBoard(slug).then((b) => !full && b?.slug == slug && paintBounty(b, null));
  const detail = cachedJSON(`/competitions/${encodeURIComponent(slug)}?submissions=summary`).then((d) => {
    full = true;
    paintBounty(d, d);
    if (wide) fromBoard.then(() => syncBoardRow(d));
  });
  return Promise.all([fromBoard, detail]);
}

/** Places with the same payout folded into one row (#4–10), each with base, fee share, pays now and a bar. */
function renderRewards(b) {
  const list = (b.rewardsNow ?? Object.entries(b.rewards ?? {}).map(([p, usd]) => ({ place: +p, baseUsd: usd, feeShareUsd: 0, amountUsd: usd })))
    .map((r) => ({ place: r.place, base: Number(r.baseUsd), share: Number(r.feeShareUsd) || 0, pays: Number(r.amountUsd) }));
  if (!list.length) return '<h2>Rewards</h2><p>No rewards listed.</p>';
  const groups = [], total = { base: 0, share: 0, pays: 0 };
  for (const r of list) {
    const g = groups.at(-1);
    if (g && g.pays == r.pays && g.base == r.base && g.to == r.place - 1) g.to = r.place;
    else groups.push({ ...r, to: r.place });
    for (const k in total) total[k] += r[k];
  }
  const top = Math.max(...list.map((r) => r.pays)), c = total.share > 0, cls = c ? 'rw' : 'rw nofee';
  return `<h2>Rewards</h2><p>${list.length} paid place${list.length == 1 ? '' : 's'} share the ${takesEntries(b) ? 'live ' : ''}pot of <b class=pot>${money(potOf(b), c)}</b></p>
<div class="${cls} th"><span>PLACE</span><span></span><span>BASE</span><span class=fs>FEE SHARE</span><span>PAYS NOW</span></div>
${groups.map((g) => `<div class="${cls}"><b>#${g.place}${g.to > g.place ? '–' + g.to : ''}</b><i style="width:${((g.pays / top) * 100).toFixed(1)}%"></i><span>${money(g.base)}</span><span class=fs>+${money(g.share, c)}</span><b class=pot>${money(g.pays, c)}${g.to > g.place ? ' <small>each</small>' : ''}</b></div>`).join('')}
<div class="${cls}"><b>Total</b><span></span><span>${money(total.base)}</span><span class=fs>+${money(total.share, c)}</span><b class=pot>${money(total.pays, c)}</b></div>`;
}

/** The dates and phases in time order, past ones filled, with a red "Now" marker where today falls. */
function renderTimeline(b, d) {
  const at = new Map(), add = (t, label, sub = '') => t && at.set(t, at.has(t) ? { label: at.get(t).label + ' · ' + label, sub: at.get(t).sub || sub } : { label, sub });
  add(d?.opensAt ?? b.publishedAt, 'Opened');
  for (const p of d?.phases ?? []) add(p.startsAt, `${p.title} phase`, p.scores == 'live' ? 'scores live' : 'scored after it ends');
  add(b.deadline, 'Deadline', 'entries close');
  const fin = d?.phases?.at(-1);
  if (fin?.endsAt) add(fin.endsAt, fin.finalizedAt ? 'Results published' : 'Results by', fin.finalizedAt ? '' : 'published automatically');
  if (d?.resolvedAt) add(d.resolvedAt, 'Resolved');
  const now = new Date().toISOString(), items = [...at].sort(([x], [y]) => (x < y ? -1 : 1));
  const i = items.findIndex(([t]) => t > now);
  if (i >= 0) items.splice(i, 0, [now, { now: true }]);
  return `<h2>Dates and phases</h2><ol class=tl>${items.map(([t, e]) => e.now
    ? `<li class=now><b>Now</b><small>${takesEntries(b) ? `<span data-dl="${esc(b.deadline)}" data-fmt=short></span> until entries close` : 'entries closed, judging'}</small></li>`
    : `<li class="${t <= now ? 'past' : ''}"><b>${esc(e.label)}</b><small>${fmtDate(t)} · ${relTime(t)}${e.sub ? ' · ' + e.sub : ''}</small></li>`).join('')}</ol>`;
}

/** The four stat cards: each number with the line that explains it. */
function renderCards(b, d) {
  const live = takesEntries(b), fee = Number(b.entryFeeUsd) || 0, fees = Number(b.entryFeesUsd) || 0;
  const last = (b.submissions ?? []).reduce((m, s) => (s.createdAt > m ? s.createdAt : m), '');
  return statCard(live ? 'LIVE POT' : 'POT', money(potOf(b), fees > 0), fees ? `${money(b.rewardAmount)} reward + ${money(fees, true)} fees` : 'the reward, no entry fees', 'pot')
    + statCard('ENTRY FEE', fee ? money(fee) : 'Free', fee ? `${num(b.entryFeePayers)} paid, once per account` : 'no fee to enter', fee ? 'fee' : '')
    + (live ? statCard('TIME LEFT', `<span data-dl="${esc(b.deadline)}" data-fmt=short></span>`, `closes ${fmtDate(b.deadline)}<i class=span data-from="${esc(d?.opensAt ?? b.publishedAt ?? '')}" data-to="${esc(b.deadline)}"></i>`)
      : statCard('ENDED', fmtDay(b.deadline), b.status == 'resolved' ? 'results published' : 'judging, results pending'))
    + statCard('ENTRIES', num(b.submissionCount), d?.submissionsPassed != null ? `${num(d.submissionsPassed)} passed the checks` : last ? `last entry ${relTime(last)}` : 'none yet');
}

/** Paint or patch the pane: a new bounty gets the frame, then each part is rewritten only if its HTML changed. */
export function paintBounty(b, d) {
  const pane = document.querySelector('main').lastElementChild, slug = encodeURIComponent(b.slug), live = takesEntries(b);
  if (pane.dataset.slug != b.slug || !pane.querySelector('.bp')) {
    pane.dataset.slug = b.slug;
    pane.innerHTML = `<article class=bp><div class=head></div><p class=lede></p><div class=cards></div>
<div class=two><section class=box data-part=rewards></section><section class=box data-part=dates></section></div>
<section class="box md" data-part=desc></section></article>`;
    pane.scrollTop = 0;
  }
  document.title = b.title + ' · make.fun bounties';
  const status = live ? '<span class="tag live">Open, taking entries</span>'
    : b.status == 'resolved' ? `<span class=tag>Resolved${d?.resolvedAt ? ' ' + fmtDay(d.resolvedAt) : ''}</span>` : '<span class="tag wait">Entries closed, judging</span>';
  const won = b.winner?.handle ? `<span class=tag>won by <a href="#/u/${encodeURIComponent(b.winner.handle)}">@${esc(b.winner.handle)}</a></span>` : '';
  patchHTML(pane.querySelector('.head'), `<div class=chips><a class=crumb href="#/">Bounties</a><span class=tag>${esc(b.category ?? 'Bounty')}</span>${status}${won}<span class=tag>by ${esc(b.sponsor?.name ?? 'make.fun')}</span></div>
<div class=top><h1>${esc(b.title)}</h1><a class="btn go" href="https://make.fun/bounty/${slug}" target=_blank rel=noopener>${live ? 'Enter on make.fun' : 'Open on make.fun'} ↗</a></div>
<nav class=tabs><a href="#/bounty/${slug}" aria-current=page>Overview</a><a href="#/bounty/${slug}/leaderboard">Leaderboard<b>${num(b.submissionCount)}</b></a></nav>`);
  patchHTML(pane.querySelector('.lede'), esc(b.summary));
  patchHTML(pane.querySelector('.cards'), renderCards(b, d));
  patchHTML(pane.querySelector('[data-part=rewards]'), renderRewards(b));
  patchHTML(pane.querySelector('[data-part=dates]'), renderTimeline(b, d));
  patchHTML(pane.querySelector('[data-part=desc]'), `<h2>Description</h2>${markdown(b.description)}${d?.rules ? `<details><summary>Full rules (${Math.round(d.rules.length / 1024)} KB)</summary><div></div></details>` : ''}`);
  const rules = pane.querySelector('details');
  if (rules && !rules.dataset.wired) {
    rules.dataset.wired = 1;
    rules.addEventListener('toggle', () => rules.open && !rules.lastChild.firstChild && (rules.lastChild.innerHTML = markdown(d.rules)));
  }
  tickCountdowns();
}

export default renderBounty;
