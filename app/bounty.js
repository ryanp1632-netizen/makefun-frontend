// A bounty's page: status, the four numbers that matter (live pot, entry fee, time left, entries), the rewards
// table as it stands with fees, the dates, how it is judged, its description and its rules (rendered on open).
import { cachedJSON } from './api.js';
import { ago, esc, fmtDate, money, ordinal, potOf, statusPill, takesEntries } from './ui.js';

export default async function showBounty(slug) {
  const b = await cachedJSON(`/competitions/${encodeURIComponent(slug)}?submissions=summary`);
  renderBountyPanel(b, true);
  document.title = `${b.title} · make.fun board`;
}

export function renderBountyPanel(b, full) {
  const fees = Number(b.entryFeesUsd || 0), fee = Number(b.entryFeeUsd || 0);
  const last = b.submissions?.reduce?.((m, s) => (s.createdAt > m ? s.createdAt : m), '');
  const slug = encodeURIComponent(b.slug), $detail = document.querySelector('main').lastChild;
  $detail.innerHTML = `<article class=pad>
<div class=crumb><a href="#/">Bounties</a> › ${esc(b.category ?? 'Bounty')} · by ${esc(b.sponsor?.name ?? 'make.fun')}</div>
<h1>${esc(b.title)}</h1><p class=lede>${esc(b.summary)}</p>${statusPill(b)}
<div class=cards>
<div class=card><span>Live pot</span><b class=pot>${money(potOf(b))}</b><small>${fees ? `${money(b.rewardAmount)} + ${money(fees)} fees` : 'fixed reward'}</small></div>
<div class=card><span>Entry fee</span><b class=fee>${fee ? money(fee) : '<span class=free>Free</span>'}</b><small>${fee ? `${(b.entryFeePayers ?? 0).toLocaleString('en-US')} paid` : 'no fee to enter'}</small></div>
<div class=card><span>Time left</span><b><time data-dl="${esc(b.deadline)}"></time></b><small>${takesEntries(b) ? 'until entries close' : 'entries closed'}</small></div>
<div class=card><span>Entries</span><b>${(b.submissionCount ?? 0).toLocaleString('en-US')}</b><small>${b.submissionsPassed != null ? `${b.submissionsPassed.toLocaleString('en-US')} passed checks` : last ? 'last ' + ago(last) : '—'}</small></div>
</div>
<div class=acts><a class="btn go" href="#/bounty/${slug}/leaderboard">Full leaderboard →</a>${full ? '' : `<a class=btn href="#/bounty/${slug}">Rules &amp; details</a>`}<a class=btn href="https://make.fun/bounty/${slug}" target=_blank rel=noopener>${takesEntries(b) ? 'Enter on make.fun ↗' : 'Open on make.fun ↗'}</a></div>
<div class=cols><section><h2>Rewards now</h2><table><thead><tr><th>Place</th><th>Base</th><th>Fee share</th><th>Amount</th></tr></thead><tbody>${renderRewardsTable(b)}</tbody></table></section>
<section><h2>Dates</h2><ol class=dates>${renderDates(b)}</ol></section></div>
${b.resolution?.summary ? `<h2>How it is judged</h2><p class=md>${esc(b.resolution.summary)}</p>` : ''}
${full ? `<h2>Description</h2><div class=md>${markdownToHtml(b.description)}</div>${b.rules ? `<details><summary>Full rules (${Math.round(b.rules.length / 1024)} KB)</summary><div class=md></div></details>` : ''}` : ''}
</article>`;
  const rules = $detail.querySelector('details');
  rules?.addEventListener('toggle', () => rules.open && !rules.lastChild.firstChild && (rules.lastChild.innerHTML = markdownToHtml(b.rules)), { once: true });
  $detail.scrollTop = 0;
}

/** Places with equal amounts folded into one row ("4th–10th"), each with its base, fee share and amount now. */
function renderRewardsTable(b) {
  const list = b.rewardsNow ?? Object.entries(b.rewards ?? {}).map(([place, usd]) => ({ place: +place, baseUsd: usd, feeShareUsd: 0, amountUsd: usd }));
  const groups = [];
  for (const r of list) {
    const g = groups.at(-1);
    if (g && g.r.amountUsd == r.amountUsd && g.r.baseUsd == r.baseUsd && g.to == r.place - 1) g.to = r.place;
    else groups.push({ from: r.place, to: r.place, r });
  }
  return groups.map(({ from, to, r }) =>
    `<tr><td>${ordinal(from)}${to > from ? '–' + ordinal(to) : ''}</td><td>${money(r.baseUsd)}</td><td>${Number(r.feeShareUsd) ? '+' + money(r.feeShareUsd) : '—'}</td><td>${money(r.amountUsd)}${to > from ? '<small class=mu> each</small>' : ''}</td></tr>`).join('');
}

/** The bounty's dates in time order, the ones already past marked. */
function renderDates(b) {
  const at = [[b.opensAt ?? b.publishedAt, 'Opened', '']];
  for (const p of b.phases ?? []) {
    if (p.startsAt && p.key != 'dev') at.push([p.startsAt, `${p.title} phase starts`, p.scores == 'live' ? 'scores live' : 'scores after it ends']);
  }
  at.push([b.deadline, 'Entry deadline', 'last moment to enter']);
  const fin = (b.phases ?? []).at(-1);
  if (fin?.endsAt) at.push([fin.endsAt, 'Results by', fin.finalizedAt ? 'finalized' : 'published automatically']);
  if (b.resolvedAt) at.push([b.resolvedAt, 'Resolved', '']);
  const now = new Date().toISOString();
  return at.filter(([t]) => t).sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([t, label, sub]) => `<li class="${t <= now ? 'on' : ''}"><b>${label}</b><small>${fmtDate(t)}${sub ? ' · ' + sub : ''}</small></li>`).join('');
}

/** A small Markdown subset (headings, lists, code, emphasis, links), escaped first, for descriptions and rules. */
function markdownToHtml(src) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/g, (_, t, u) => `<a href="${u[0] == '/' ? 'https://make.fun' + u : u}" target=_blank rel=noopener>${t}</a>`);
  let html = '', list = '', code = null;
  const close = () => list && ((html += `</${list}>`), (list = ''));
  for (const line of String(src ?? '').split('\n')) {
    if (line.startsWith('```')) {
      close();
      if (code == null) code = '';
      else (html += `<pre><code>${esc(code)}</code></pre>`), (code = null);
      continue;
    }
    if (code != null) {
      code += line + '\n';
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/), li = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)/);
    if (h) close(), (html += `<h4>${inline(h[2])}</h4>`);
    else if (li) {
      const tag = li[1] ? 'ol' : 'ul';
      if (list != tag) close(), (html += `<${(list = tag)}>`);
      html += `<li>${inline(li[2])}</li>`;
    } else if (line.trim()) close(), (html += `<p>${inline(line)}</p>`);
    else close();
  }
  return close(), html;
}
