// Shared by the views and loaded with the first of them: the views' stylesheet (adopted once, so the first load
// carries only the shell's CSS) and the small formatters every view uses.
const VIEW_STYLES = `
.pad{padding:18px 22px}.mu{color:var(--mu)}.err{color:var(--hot);padding:22px}
.sum{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--ln)}
.sum div{padding:12px 16px;border-right:1px solid var(--ln)}.sum div:last-child{border:0}
.sum b{display:block;font-size:20px;letter-spacing:-.02em}.sum span{font-size:12px;color:var(--mu)}
.ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 16px 8px}
.ctl input{flex:1 1 180px;background:var(--pn);border:1px solid var(--ln);border-radius:8px;color:var(--tx);font:inherit;padding:7px 11px}
.ctl input:focus,.vlq:focus{outline:2px solid var(--ac);outline-offset:-1px}
kbd{font:12px ui-monospace,monospace;border:1px solid var(--ln);border-bottom-width:2px;border-radius:5px;padding:1px 6px;color:var(--mu)}
.chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 10px}
.chips button,.th button{font:inherit;color:var(--mu);background:none;border:1px solid var(--ln);border-radius:99px;padding:3px 11px;font-size:13px;cursor:pointer}
.chips button[aria-pressed=true]{color:#0a0c10;background:var(--ac);border-color:var(--ac);font-weight:650}
.th,.row{display:grid;grid-template-columns:minmax(0,1fr) 92px 58px 112px 62px;gap:10px;align-items:center;padding:0 16px}
.th{position:sticky;top:0;background:var(--bg);z-index:1;border-bottom:1px solid var(--ln);padding-block:6px}
.th button{border:0;padding:2px 0;text-align:right;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}.th button:first-child{text-align:left}
.th button[aria-sort]{color:var(--tx)}.th [aria-sort=descending]:after{content:" ↓"}.th [aria-sort=ascending]:after{content:" ↑"}
.rows{list-style:none;margin:0;padding:0}
.row{min-height:58px;text-decoration:none;border-bottom:1px solid #1a1f2b;border-left:3px solid transparent;padding-left:13px}
.row:hover{background:#131823}.row[aria-current]{background:#171d2a;border-left-color:var(--ac)}
.row>*{text-align:right}.row .t{text-align:left;min-width:0}
.t b{display:block;font-weight:620;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t small,.row small{display:block;font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pot{color:var(--pot);font-weight:700}.fee{color:var(--fee);font-weight:600}.free{color:var(--mu);font-weight:400}
.bar{display:block;height:3px;border-radius:2px;margin-top:5px;background:linear-gradient(90deg,var(--ac) calc(var(--f,0)*100%),var(--ln) 0)}
.bar.soon{background:linear-gradient(90deg,var(--hot) calc(var(--f,0)*100%),var(--ln) 0)}time.soon{color:var(--hot)}
.past .row{opacity:.62}.sec{margin:0;padding:14px 16px 6px;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--mu)}
.facts{font-size:12px;color:var(--mu);padding:14px 16px 22px;margin:0}
.crumb{font-size:13px;color:var(--mu)}.crumb a{color:var(--mu)}
h1{font-size:25px;line-height:1.2;letter-spacing:-.02em;margin:6px 0 8px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--mu);margin:22px 0 8px}
.lede{color:#c9d0dc;margin:0 0 12px;max-width:70ch}
.pill{display:inline-flex;gap:7px;align-items:center;font-size:13px;font-weight:600;border-radius:99px;padding:3px 11px;background:#163322;color:#7af0a8}
.pill:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.pill.wait{background:#3a2c12;color:var(--fee)}.pill.done{background:#22283a;color:var(--mu)}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}
.card{background:var(--pn);border:1px solid var(--ln);border-radius:12px;padding:11px 13px}
.card span{font-size:12px;color:var(--mu);text-transform:uppercase;letter-spacing:.05em}.card b{display:block;white-space:nowrap;font-size:23px;letter-spacing:-.02em;margin:2px 0}.card small{font-size:12.5px;color:var(--mu)}
.acts{display:flex;gap:10px;flex-wrap:wrap}
button.btn{background:none;color:var(--tx);font:inherit;cursor:pointer}
.btn{display:inline-block;text-decoration:none;font-weight:650;border-radius:9px;padding:8px 15px;border:1px solid var(--ln)}.btn.go{background:var(--ac);color:#0a0c10;border-color:var(--ac)}
.cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:22px}
table{width:100%;border-collapse:collapse;font-size:14px}th{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mu);font-weight:600;text-align:right;padding:5px 0}
td{text-align:right;padding:6px 0;border-top:1px solid #1d2331}th:first-child,td:first-child{text-align:left}td:last-child{color:var(--pot);font-weight:700}
.dates{list-style:none;margin:0;padding:0 0 0 14px;border-left:2px solid var(--ln)}.dates li{position:relative;padding:0 0 9px;font-size:14px}
.dates li:before{content:"";position:absolute;left:-20px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--ln)}.dates li.on:before{background:var(--ac)}.dates small{display:block;color:var(--mu)}
.md{max-width:76ch;color:#d3d9e3}.md h3,.md h4{font-size:15px;margin:16px 0 4px}.md code{background:var(--pn);padding:1px 5px;border-radius:4px;font-size:13px}.md a{color:var(--ac)}
details summary{cursor:pointer;color:var(--ac);font-weight:600;margin:14px 0}
.lbh{display:flex;gap:14px;align-items:end;flex-wrap:wrap;padding:16px 22px 10px;border-bottom:1px solid var(--ln)}.lbh h1{margin:2px 0 0;font-size:22px}
.vlq{margin-left:auto;background:var(--pn);border:1px solid var(--ln);border-radius:8px;color:var(--tx);font:inherit;padding:7px 11px;width:210px}
.vh,.vr{display:grid;grid-template-columns:62px minmax(0,1fr) 210px 96px 110px;gap:14px;align-items:center;padding:0 22px}
.vh{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mu);padding-block:7px;border-bottom:1px solid var(--ln);position:sticky;top:0;background:var(--bg);z-index:1}
.vl{position:relative}.vr{position:absolute;left:0;right:0;height:56px;text-decoration:none;border-bottom:1px solid #1a1f2b}.vr:hover{background:#131823}
.vr .rk{font-weight:800;font-size:17px}.vr.prize .rk{color:var(--ac)}
.vr[data-medal] .rk{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;font-size:15px;color:#0a0c10}.vr[data-medal=""] .rk{display:block;width:auto;height:auto;font-size:17px;color:inherit}.vr.prize[data-medal=""] .rk{color:var(--ac)}
.vr[data-medal="1"] .rk{background:#ffd84d}.vr[data-medal="2"] .rk{background:#cfd8e6}.vr[data-medal="3"] .rk{background:#e8a46a}.vr .who{display:flex;gap:11px;align-items:center;min-width:0}.vr .who div{min-width:0}
.av{width:34px;height:34px;border-radius:50%;background:var(--ln);object-fit:cover;flex:none}
.sc{display:grid;grid-template-columns:52px 1fr;gap:9px;align-items:center;font-weight:700}
.ci{position:relative;height:6px;background:#1b2130;border-radius:3px}.ci i{position:absolute;top:0;bottom:0;background:#3a4a66;border-radius:3px}.ci b{position:absolute;top:-3px;width:3px;height:12px;background:var(--ac);border-radius:2px}
.vr .won{color:var(--pot);font-weight:700;text-align:right}.vr time{text-align:right;color:var(--mu);font-size:13px}.vh span:nth-child(n+4){text-align:right}
.ph{display:flex;gap:18px;align-items:center}.ph .av{width:84px;height:84px}.ph h1{margin:0}
.stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:18px 0}
.ent{list-style:none;margin:0;padding:0}.ent li{display:block;padding:11px 0;border-top:1px solid #1d2331}
.ent a{text-decoration:none}.ent .t b{white-space:normal;line-height:1.3}.ent .r{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:13px}.ent .r a{text-decoration:underline;color:var(--mu)}.badge{font-size:12px;font-weight:700;border-radius:6px;padding:2px 7px;background:#22283a;color:var(--mu)}.badge.gold{background:#3b3410;color:#ffd84d}.badge.in{background:#163322;color:#7af0a8}
@media(max-width:860px){.sum{grid-template-columns:repeat(2,1fr)}.sum div:nth-child(2){border-right:0}.sum div:nth-child(-n+2){border-bottom:1px solid var(--ln)}
.th,.row{grid-template-columns:minmax(0,1fr) 82px 92px;padding-inline:12px}.row{padding-left:9px}.th button:nth-child(3),.th button:nth-child(5),.row .fee,.row .n{display:none}
.pad{padding:14px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.cols{grid-template-columns:minmax(0,1fr)}.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.card b{font-size:20px}
.vh,.vr{grid-template-columns:40px minmax(0,1fr) 92px;padding:0 12px;gap:8px}.vh span:nth-child(n+4),.vr .won,.vr time{display:none}.sc{grid-template-columns:1fr}.ci{display:none}.vlq{width:100%;margin:0}.lbh{padding:12px}
.ph .av{width:64px;height:64px}.ph{gap:14px}}
`;
const sheet = new CSSStyleSheet();
sheet.replaceSync(VIEW_STYLES);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function money(v) {
  const n = Number(v) || 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

/** The live pot: the reward plus every entry fee paid into it. */
export const potOf = (b) => Number(b.potUsd ?? b.rewardAmount ?? 0);

/** Whether a bounty still takes entries: status open AND its deadline ahead (status stays open until results). */
export const takesEntries = (b) => b.status == 'open' && Date.parse(b.deadline) > Date.now() && b.acceptingSubmissions !== false;

const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const fmtDay = (iso) => (iso ? dayFmt.format(new Date(iso)) : '—');

export function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1e3;
  return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
}

/** An avatar URL from an API answer (make.fun-relative or absolute), else the account's own round picture. */
export function avatarURL(image, handle, small) {
  if (image?.startsWith('/api/avatars/')) return `https://make.fun${image}${small ? '?size=small' : ''}`;
  if (image?.startsWith('https://')) return image;
  if (image?.startsWith('/')) return 'https://make.fun' + image;
  return `https://make.fun/api/profiles/${encodeURIComponent(handle)}/picture.png`;
}
export const avatarImg = (image, handle, small) =>
  `<img class=av crossorigin=anonymous loading=lazy decoding=async alt="" src="${esc(avatarURL(image, handle, small))}">`;

/** A score as its column means it: judge win rates come in millionths and read as a percentage. */
export function formatScore(column, value, display) {
  if (value == null && display == null) return '—';
  if (/_micro$/.test(column?.source ?? '') || column?.key == 'judge') return (Number(value ?? display) / 1e4).toFixed(1) + '%';
  return display ?? String(value);
}

export function statusPill(b) {
  if (takesEntries(b)) return `<span class=pill>Taking entries · closes ${fmtDate(b.deadline)}</span>`;
  if (b.status == 'resolved') return `<span class="pill done">Resolved${b.resolvedAt ? ' · ' + fmtDay(b.resolvedAt) : ''}</span>`;
  return `<span class="pill wait">Past deadline · results pending</span>`;
}
