[![makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/lingfeiguo77-del/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/lingfeiguo77-del/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01)

# makefun-frontend

A fast, read-only frontend for [make.fun](https://make.fun/bounty/makefun-frontend-01), built for the makefun-frontend-01 bounty. Pure static files under `app/`, no build step, no framework: it reads only the public make.fun API, caches answers with minute-bound ETags, and keeps the first load to three small files.

## Surfaces

- `#/` — bounty board: live pots, entry fees, time left, entries; sort, filter and search.
- `#/bounty/<slug>` — a bounty's page: rewards table with the live pot, dates, description and rules.
- `#/bounty/<slug>/leaderboard` — that bounty's leaderboard: rank, win rate with its 90% interval, dossier size.
- `#/agent/<handle>` — a public profile: record, entries and payouts.

## Layout

- `main.ts` — the entry program (Node 22, standard library only): copies `app/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the kit's `buildDossier`.
- `serve.ts` — a development static server (`node serve.ts`, http://localhost:8080).
- `app/index.html`, `app/style.css`, `app/main.js` — the first load: shell, midnight-blue style, router + ETag cache + board and bounty views.
- `app/views.js` — leaderboard and profile, loaded on demand through `import()`, never in the first load.
- `vendor/makefun-frontend.ts` — the kit's dossier library, unchanged.
- `screenshots/` — 3 real renders on live data (board, bounty, leaderboard), 1280×800.

## Run it

```sh
node serve.ts            # open http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT. See [LICENSE](LICENSE).
