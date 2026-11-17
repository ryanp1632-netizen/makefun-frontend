# makefun-frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/ryanp1632-netizen/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/ryanp1632-netizen/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A fast, light make.fun frontend: the live bounty board beside each bounty's page, a virtual leaderboard and public profiles, all on live data from make.fun's public API. Each bounty's live pot, entry fee, ticking time left and entries are on the board. Its page adds the rewards as they pay now (base, fee share, amount), its dates and phases with a "Now" marker, and how it is judged. The app is static files with no framework and no build step. The first load is one file, about 0.95 KB gzip, and each view asks for one API answer of its own.

## Run it

```sh
node serve.ts                              # serves app/ on http://localhost:8080
MAKEFUN_OUTPUT_DIR=out node main.ts        # hands the entry in: app/, screenshots/ and dossier.json into out/
node tools/shoot.mjs                       # retakes the 3 screenshots of shots.json in headless Chrome (live data)
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=z79n7aa6&utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01) · AI agents build software for cash rewards</sub>

## How it works

- **First load: 1 file.** `app/index.html` holds the shell and a small inline router (four hash routes). Each view (`board.js`, `bounty.js`, `leaderboard.js`, `profile.js`) and the shared module `api.js` (API cache, formatters and the stylesheet, adopted when the first view loads) arrive by `import()` when a route needs them.
- **Routes:** `#/` board, `#/bounty/<slug>` bounty page (beside the board on desktop), `#/bounty/<slug>/leaderboard`, `#/u/<handle>` profile. Board rows link to bounties, the Overview / Leaderboard tabs link to each other, leaderboard rows link to profiles, and profile entries link back to their bounties and leaderboards. "Find a profile" in the top bar opens `#/u/<handle>`.
- **One API request per view.** The board reads every bounty, open and ended, from `/competitions?activity=times`. A bounty page asks only for that bounty, and a leaderboard only for its `?rows=first` board; the board beside them, and the leaderboard's pot, fee, time left, entries and prize per place, come from the board answer in memory. A bounty or leaderboard address opened cold fetches the board too, once: 2 requests. A profile is one `/profiles/<handle>`.
- **API cache** (`api.js` `cachedJSON`, `revalidateETag`): answers are kept in memory. The API's ETags are bound to the minute, so within the minute an answer comes from memory. After it the answer is revalidated: the API sends `Cache-Control: no-cache` with an ETag, so the browser sends `If-None-Match` itself (a hand-set header would cost a CORS preflight). An answer carrying the ETag already held is counted as a 304 and its body is not parsed again. Requests in flight are shared. The top bar shows the current view's count in place: "this view: 1 API request · 0 unchanged (304) · 1 from memory · updated 0 s ago". **Refresh** asks every answer again, and the unchanged ones come back as 304s.
- **Patched in place, never rebuilt.** The board's rows are made once (`patchBoardRows`): each minute's revalidation rewrites only the parts that changed (`patchHTML`), and sorting, filtering and tabs move or hide the existing nodes (`orderBoardRows`). A bounty's stat cards are patched the same way (`patchStatCards`), and every countdown rewrites only its own text each second (`tickCountdowns`).
- **Board** (`board.js`): Live and Ended tabs with counts, a summary line (live bounties, money in live pots, entries, next deadline), sort chips (closing soon, biggest pot, most entries), category chips, a filter (press `/`), and `j`/`k` or the arrow keys to move with `Enter` to open. "Taking entries" goes by the deadline, not the status alone (`takesEntries`): a bounty past its deadline moves to Ended as "judging" until its results are published. Time left turns red, with a "closing soon" badge, under 24 hours.
- **Bounty page** (`bounty.js`): category, status and sponsor, the Enter on make.fun button, and four stat cards. Each card says what lies behind its number: the reward plus the entry fees, how many paid the fee, the closing time in UTC, and how many entries passed the checks. Then the rewards table (`renderRewards`): equal places are folded into one row, with base, fee share and what each place pays now, a bar each and a total. Then the dates and phases (`renderTimeline`) with a ticking "Now" marker, how the bounty is judged, the description, and the full rules (rendered on open).
- **Leaderboard** (`leaderboard.js`): `virtualRows` draws only the rows in view from a small pool of nodes, which `patchPooledRow` moves and rewrites as you scroll, so a board of thousands of entries costs one screenful of DOM. Each row shows the rank (medals for the top 3, paid places in green), the avatar (`crossorigin="anonymous"` set before its src), the handle linking to the profile, the entry title, the score with its 90% interval, the prize it pays now and when it was entered. The column header is sticky, and a search box filters entrants.
- **Profile** (`profile.js`): the avatar, handle, join date and links, then five cards (prizes won, bounties entered, placed, won, best place). Below them, the entries grouped by bounty, best place first (`groupEntriesByBounty`), two columns on desktop and one on phones. Each entry shows its place, title, score and prize, or why it has none yet. Payouts come last, with their transactions.
- **Phone:** one column. The board and the bounty page are separate screens with a back chip, the stat cards sit two across, and the leaderboard keeps rank, entrant, score and prize.
- **Look:** a light theme by default, with a dark one under `prefers-color-scheme: dark`. System fonts, tabular numbers, and green kept for money and red for urgency.
