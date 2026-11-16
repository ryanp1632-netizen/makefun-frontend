# makefun-frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/ryanp1632-netizen/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/ryanp1632-netizen/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A fast, dark, master-detail frontend for make.fun's live bounties: the board with each bounty's live pot, entry fee, ticking time left and entries beside the selected bounty's page, a virtual leaderboard, and public profiles. It is static files with no framework and no build step, and it reads make.fun's public API with a 1.4 KB gzip first load.

## Run it

```sh
node serve.ts                              # serves app/ on http://localhost:8080
MAKEFUN_OUTPUT_DIR=out node main.ts        # hands the entry in: app/, screenshots/ and dossier.json into out/
node tools/shoot.mjs                       # retakes the 3 screenshots in headless Chrome (live data)
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=z79n7aa6&utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01) · AI agents build software for cash rewards</sub>

## How it works

- **First load: 2 files, about 1.4 KB gzip.** `app/index.html` holds the shell and its critical CSS inline. `app/boot.js` holds only the route table and router. Each view (`board.js`, `bounty.js`, `leaderboard.js`, `profile.js`), the API cache (`api.js`) and the shared styles and formatters (`ui.js`) arrive by `import()` when a route needs them. A route fetches its view modules and its API answers in parallel.
- **Routes:** `#/` board, `#/bounty/<slug>` bounty page (beside the board on desktop), `#/bounty/<slug>/leaderboard`, `#/u/<handle>` profile. Board rows link to bounties, leaderboard rows link to profiles, and profile entries link back to bounties and their leaderboards.
- **API cache** (`api.js`): answers are kept in memory. The API's ETags change each minute, so within a minute an answer comes straight from memory. After that it is revalidated: the API sends `Cache-Control: no-cache` with an ETag, so the browser sends `If-None-Match` itself. A hand-set header would cost a CORS preflight, and the API's 304 carries no CORS header. An answer whose ETag matches the stored one counts as unchanged, and its body is not parsed again. Requests in flight are shared. The header shows the current view's count: API requests, unchanged (ETag) and from memory.
- **Board** (`board.js`): built once, then patched in place. Each row's fields are rewritten only when they change, and sorting and filtering move the existing nodes. "Taking entries" goes by the deadline, not the status alone: a bounty past its deadline sits under "Past deadline · results pending". Every countdown ticks each second by rewriting only its own text and urgency bar. You can sort by any column, filter by typing (press `/`), use the category chips, and move through the list with `j`/`k` or the arrow keys.
- **Leaderboard** (`leaderboard.js`): one `?rows=first` request, then a virtual list. Rows have a fixed height, and a small pool of row nodes is reused and patched as you scroll, so a board of thousands of entries costs one screenful of DOM. Each row shows its rank, avatar, entry, score with its 90% interval, and its prize as it stands now.
- **Phone:** a single column, with the board and the bounty page on separate screens and columns trimmed to the ones that matter.
