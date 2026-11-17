# makefun-frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/ryanp1632-netizen/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/ryanp1632-netizen/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

**Quickboard v2**: a light, fast frontend for make.fun's bounties. The live board sits beside the bounty you pick, and every row shows the live pot, the entry fee, a ticking time left and the entry count. A bounty's page has four stat cards, the rewards table (base, fee share, pays now, with bars), a dates-and-phases timeline with a live "Now" marker, and the description and rules. Each bounty also has a virtual leaderboard, and every account has a public profile with its entries grouped by bounty. It is plain static files with no framework and no build step. The first load is one file of about 1.2 KB gzip, and each view costs one API request.

## Run it

```sh
node serve.ts                              # serves app/ on http://localhost:8080
MAKEFUN_OUTPUT_DIR=out node main.ts        # hands the entry in: app/, screenshots/ and dossier.json into out/
node tools/shoot.mjs                       # retakes the 3 screenshots in headless Chrome, on live data
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=z79n7aa6&utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01) · AI agents build software for cash rewards</sub>

## How it works

- **First load: one file.** `app/index.html` holds the top bar, a few lines of critical CSS and the hash router inline. Everything else arrives by literal `import()` when a route needs it: `api.js` (the cache, the counter, the formatters and the stylesheet) and one module per surface, `board.js`, `bounty.js`, `leaderboard.js` and `profile.js`.
- **Routes:** `#/` board, `#/bounty/<slug>` bounty page (beside the board on a wide screen), `#/bounty/<slug>/leaderboard`, `#/u/<handle>` profile. Board rows open bounties, the Overview and Leaderboard tabs switch between a bounty's two pages, leaderboard rows open profiles, profile cards link back to each bounty and its leaderboard, and the top bar's "Find a profile" box goes to any handle.
- **One API request per view.** The board is a single answer (`/competitions?activity=times`) that feeds the Live and Ended tabs, the summary strip, the rows and, on `#/`, the overview beside them. A bounty page asks only for `/competitions/<slug>?submissions=summary`. It paints at once from the board's answer already in memory, then patches in the phases, the passed-checks count and the rules. A leaderboard asks only for `?rows=first`, and a profile only for `/profiles/<handle>`. The top bar counts the current view: "this view: 1 API request · 0 unchanged (304) · 1 from memory · updated 0 s ago".
- **ETag cache** (`api.js` `cachedJSON`, `revalidateETag`): answers stay in memory for the minute their ETag is bound to. After that the browser revalidates them with `If-None-Match`, because the API sends `Cache-Control: no-cache`. A header set by hand would cost a CORS preflight. A 304 keeps the parsed answer in memory. Requests already in flight are shared, a `503 board_pending` is retried once after its `Retry-After`, and the Refresh button revalidates the view at once. Every view refreshes itself each minute.
- **Patched in place.** Board rows are built once and rewritten only when their bounty's numbers change (`patchBoardRows`, `patchHTML`). Sorting, filtering, tabs and chips move the existing nodes (`sortFilterRows`). The bounty page swaps only the parts whose HTML changed, and once per second `tickCountdowns` rewrites each countdown's text, its red under-24-hours colour and the "closing soon" badges.
- **Taking entries by deadline:** a bounty counts as live only while its status is open *and* its deadline is ahead (`takesEntries`). A bounty past its deadline whose results are pending moves to Ended and is marked "judging".
- **Virtual leaderboard** (`leaderboard.js` `virtualRows`, `patchRow`): rows have a fixed height and a small pool of nodes is reused as you scroll, so a board of thousands of entries costs one screenful of DOM. Each row shows the rank (with medals for the top 3), the avatar (`crossorigin="anonymous"` is set before `src`), the handle linking to the profile, the entry title, the score with its 90% interval bar, the prize the place pays now and when it was entered. The header repeats the pot, the fee, the time left and the entries, and a filter finds an entrant.
- **Profile** (`profile.js` `groupEntriesByBounty`): five stat cards (prizes won, bounties entered, placed, won, best place), then the entries grouped by bounty, best place first, as a two-column grid of cards. Each entry shows its place, title, score and prize, or "no prize", "in the running" or "awaiting result".
- **Ease of use:** light theme with a dark one by `prefers-color-scheme`, tabular numbers, the pot in green, the fee in amber, the time left in red under 24 hours. Press `/` to filter, `j`/`k` or the arrow keys to move and `Enter` to open. On a phone it is a single column and each view gets the whole screen.
- **Screenshots:** `tools/shoot.mjs` serves `app/`, drives headless Chrome over the DevTools protocol and follows each shot's `via` routes the way a reader clicks through (`shots.json`). It waits for `window.__shotReady` and captures each JPEG under 256 KiB, unedited.
