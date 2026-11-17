// A bounty's page beside the board: status, the live pot, entry fee, time left and entries with what lies behind each,
// the rewards table as it pays now, the dates and phases with a live "Now" marker, how it is judged, description, rules.
import renderBoard from './board.js';
import { cachedJSON, fmt, patchHTML, revalidateEachMinute, takesEntries, tickCountdowns } from './api.js';

/** One request (the bounty's own answer); the board beside it comes from memory. Both are patched in place each minute. */
export default async function renderBounty(slug) {
  const path = `/competitions/${encodeURIComponent(slug)}?submissions=summary`;
  const [, b] = await Promise.all([renderBoard(slug), cachedJSON(path)]);
  renderOverview(b);
  revalidateEachMinute(() => Promise.all([renderBoard(slug), cachedJSON(path).then(patchStatCards)]));
}

/** The Overview tab, from the bounty's own answer or (on the board route) its board row alone. */
export function renderOverview(b) {
  // A small Markdown subset (headings, lists, code, emphasis, links), escaped first, for the description and rules.
  function markdownToHtml(src) {
    const inline = (s) => fmt.esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/g, (_, t, u) => `<a href="${u[0] == '/' ? 'https://make.fun' + u : u}" target=_blank rel=noopener>${t}</a>`);
    let html = '', list = '', code = null;
    const close = () => list && ((html += `</${list}>`), (list = ''));
    for (const line of String(src ?? '').split('\n')) {
      if (line.startsWith('```')) {
        close();
        if (code == null) code = '';
        else (html += `<pre><code>${fmt.esc(code)}</code></pre>`), (code = null);
      } else if (code != null) code += line + '\n';
      else {
        const h = line.match(/^#{1,4}\s+(.*)/), li = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)/);
        if (h) close(), (html += `<h4>${inline(h[1])}</h4>`);
        else if (li) {
          const tag = li[1] ? 'ol' : 'ul';
          if (list != tag) close(), (html += `<${(list = tag)}>`);
          html += `<li>${inline(li[2])}</li>`;
        } else if (line.trim()) close(), (html += `<p>${inline(line)}</p>`);
        else close();
      }
    }
    return close(), html;
  }
  const el = document.querySelector('main').lastChild;
  el.innerHTML = `<article class=bp>${renderBountyHead(b, 'overview')}
<div class=cards>${renderStatCards(b)}</div>
<div class=grid2><section class=box>${renderRewards(b)}</section>
<section class=box><h2>Dates and phases</h2><p>All times UTC</p><ol class=tl>${renderTimeline(b)}</ol></section></div>
${b.resolution?.summary ? `<section class="box md"><h2>How it is judged</h2><p>${fmt.esc(b.resolution.metric?.name ?? '')}${b.resolution.metric?.better ? `, ${fmt.esc(b.resolution.metric.better)} is better` : ''}</p>${fmt.esc(b.resolution.summary)}</section>` : ''}
<section class="box md"><h2>Description</h2><p></p>${markdownToHtml(b.description)}</section>
${b.rules ? `<details class=box><summary>Full rules (${Math.round(b.rules.length / 1024)} KB)</summary><div class=md></div></details>` : ''}</article>`;
  const rules = el.querySelector('details');
  rules?.addEventListener('toggle', () => (rules.lastChild.innerHTML ||= markdownToHtml(b.rules)));
  el.scrollTop = 0;
  document.title = `${b.title} · make.fun bounties`;
  tickCountdowns();
}

/** The four numbers that matter (live pot, entry fee, time left, entries), each with what lies behind it. */
export function renderStatCards(b) {
  const fee = Number(b.entryFeeUsd || 0), fees = Number(b.entryFeesUsd || 0), live = takesEntries(b);
  const last = b.submissions?.reduce?.((m, x) => (x.createdAt > m ? x.createdAt : m), '');
  return [
    [live ? 'Live pot' : 'Pot', fmt.money(b.potUsd ?? b.rewardAmount), fees ? `${fmt.money(b.rewardAmount)} reward + ${fmt.money(fees)} fees` :`${fmt.money(b.rewardAmount)} reward`, 'pot'],
    ['Entry fee', fee ? fmt.money(fee, true) : 'Free', fee ? `${fmt.num(b.entryFeePayers)} paid, once per account` : 'no fee to enter', ''],
    ['Time left', live ? `<time data-dl="${fmt.esc(b.deadline)}">${fmt.timeLeft(b.deadline)}</time>` : 'Closed', `${live ? 'closes' : 'closed'} ${fmt.date(b.deadline)}`, ''],
    ['Entries', fmt.num(b.submissionCount), b.submissionsPassed != null ? `${fmt.num(b.submissionsPassed)} passed the checks` : last ? `last entry ${fmt.ago(last)}` : 'none yet', ''],
  ].map(([label, value, sub, cls]) => `<div class=card><span>${label}</span><b class="${cls}">${value}</b><small>${fmt.esc(sub)}</small></div>`).join('');
}

/** Each minute: only the card parts that changed are rewritten (a running countdown is left to tick). */
function patchStatCards(b) {
  const fresh = document.createElement('div');
  fresh.innerHTML = renderStatCards(b);
  document.querySelectorAll('main .cards .card').forEach((card, i) => {
    const [, val, small] = card.children, [, nval, nsmall] = fresh.children[i]?.children ?? [];
    if (nval && !val.querySelector(`time[data-dl="${b.deadline}"]`)) patchHTML(val, nval.innerHTML);
    if (nsmall) patchHTML(small, nsmall.innerHTML);
  });
}

/** The rewards as they pay now: equal places folded into one row ("#4 – #10 … each"), base, fee share, amount, a bar. */
function renderRewards(b) {
  const list = b.rewardsNow ?? Object.entries(b.rewards ?? {}).map(([place, usd]) => ({ place: +place, baseUsd: usd, feeShareUsd: 0, amountUsd: usd }));
  const groups = [], max = Math.max(1, ...list.map((r) => Number(r.amountUsd))), sum = (k) => list.reduce((t, r) => t + Number(r[k] || 0), 0);
  for (const r of list) {
    const g = groups.at(-1);
    if (g && g.r.amountUsd == r.amountUsd && g.r.baseUsd == r.baseUsd && g.to == r.place - 1) g.to = r.place;
    else groups.push({ from: r.place, to: r.place, r });
  }
  return `<h2>Rewards</h2><p>${list.length} paid place${list.length == 1 ? '' : 's'} share the live pot of <b class=pot>${fmt.money(b.potUsd ?? b.rewardAmount)}</b></p>
<table class=rw><thead><tr><th>Place</th><th>Base</th><th>Fee share</th><th>Pays now</th><th></th></tr></thead><tbody>${groups.map(({ from, to, r }) =>
    `<tr><td>#${from}${to > from ? ` – #${to}` : ''}</td><td>${fmt.money(r.baseUsd, true)}</td><td>${Number(r.feeShareUsd) ? '+' + fmt.money(r.feeShareUsd, true) : '—'}</td><td>${fmt.money(r.amountUsd, true)}${to > from ? '<small> each</small>' : ''}</td><td><i style="width:${((100 * r.amountUsd) / max).toFixed(1)}%"></i></td></tr>`).join('')}</tbody>
<tfoot><tr><td>All ${list.length}</td><td>${fmt.money(sum('baseUsd'), true)}</td><td>${sum('feeShareUsd') ? '+' + fmt.money(sum('feeShareUsd'), true) : '—'}</td><td>${fmt.money(sum('amountUsd'), true)}</td><td></td></tr></tfoot></table>
${sum('feeShareUsd') ? `<small>Every ${fmt.money(b.entryFeeUsd, true)} entry fee is shared out over the paid places in proportion to their base reward, so each place pays more as entries arrive.</small>` : ''}`;
}

/** Opened, each phase, the deadline and the results in time order, with a "Now" marker that ticks between them. */
function renderTimeline(b) {
  const now = new Date().toISOString(), ph = b.phases ?? [], live = takesEntries(b);
  const at = [[b.opensAt ?? b.publishedAt, 'Opened', 'entries open']];
  for (const p of ph) if (p.startsAt) at.push([p.startsAt, p.title, p.scores == 'live' ? 'phase starts, scores show as entries land' : 'phase starts, judged in one heat']);
  at.push([b.deadline, 'Deadline', 'entries close']);
  const lastPhase = ph.at(-1);
  if (lastPhase?.endsAt && lastPhase.endsAt > b.deadline) at.push([lastPhase.endsAt, 'Results by', lastPhase.finalizedAt ? 'published' : 'published automatically']);
  if (b.resolvedAt) at.push([b.resolvedAt, 'Resolved', 'results final']);
  const items = at.filter(([t]) => t).sort(([x], [y]) => (x < y ? -1 : 1));
  const nowItem = ['', 'Now', live ? `<time data-dl="${fmt.esc(b.deadline)}">${fmt.timeLeft(b.deadline)}</time>` : `<time>${fmt.date(now)}</time>`, live ? 'left until entries close' : 'entries closed'];
  const k = items.findIndex(([t]) => t > now);
  items.splice(k < 0 ? items.length : k, 0, nowItem);
  return items.map(([t, label, sub, note]) => t === ''
    ? `<li class=now><b>${label}</b>${sub}<small>${note}</small></li>`
    : `<li class="${t <= now ? 'past' : ''}"><b>${label}</b><time>${fmt.date(t, true)}</time><small>${sub}</small></li>`).join('');
}

/** Category, status, title, the Enter button and the Overview / Leaderboard tabs, shared with the leaderboard. */
export function renderBountyHead(b, tab) {
  const s = encodeURIComponent(b.slug), live = takesEntries(b);
  const status = live ? '<span class=st>Open, taking entries</span>'
    : b.status == 'resolved' ? `<span class="st done">Resolved ${fmt.day(b.resolvedAt ?? b.deadline)}</span>` : '<span class="st wait">Entries closed, judging</span>';
  return `<div class=chips><a class="tag back" href="#/">← Bounties</a><span class=tag>${fmt.esc(b.category ?? 'Bounty')}</span>${status}<span class=tag>by ${fmt.esc(b.sponsor?.name ?? 'make.fun')}${b.sponsor?.isVerified ? ' ✓' : ''}</span></div>
<div class=head><h1>${fmt.esc(b.title)}</h1><a class="enter${live ? '' : ' off'}" href="https://make.fun/bounty/${s}" target=_blank rel=noopener>${live ? 'Enter on make.fun ↗' : 'Open on make.fun ↗'}</a></div>
${tab == 'overview' && b.summary ? `<p class=lede>${fmt.esc(b.summary)}</p>` : ''}
<nav class=tabs><a href="#/bounty/${s}"${tab == 'overview' ? ' aria-current=page' : ''}>Overview</a><a href="#/bounty/${s}/leaderboard"${tab == 'leaderboard' ? ' aria-current=page' : ''}>Leaderboard <i>${fmt.num(b.submissionCount)}</i></a></nav>`;
}
