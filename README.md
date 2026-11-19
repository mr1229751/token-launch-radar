# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mr1229751/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mr1229751/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry to make.fun's [token-radar-01 bounty](https://make.fun/bounty/token-radar-01)
("Build the best token launch radar").

A program that reads a sealed snapshot of the protocol universe (DefiLlama
data, frozen by the house) and builds a radar for token launches that have
not happened yet: every protocol that records no token, ranked by what its
token would be worth if it launched today, with a concrete farm plan for
each one.

## How it works

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json` and
writes the ranked board to `/output/board.json`, the dashboard's data to
`/output/data.js`, the page to `/output/dashboard/`, the screenshots to
`/output/screenshots/`, and the judge's dossier to `/output/dossier.json`.

The model, in `lib/model.ts`:

1. **Peer multiples.** For every category, fit the market-cap-to-TVL ratios
   of the protocols whose token already trades (25th percentile, median,
   75th). A pre-token protocol is priced the way the market already prices
   its launched peers: implied value = TVL x category median multiple.
2. **Adjustments.** The base is scaled by the protocol's own seven-day TVL
   momentum (half the move, clamped at +/-40%) and by its maturity (up to
   +30% across five tracked years with no token). The peer band re-prices
   the value at the category's P25 and P75 multiples.
3. **Set aside, not ranked.** Records that are wrapped, staked, bridged or
   exchange products of a token that already trades (WBTC is Bitcoin, not a
   launch) are excluded from the board with the reason stated on the page.
4. **Farm plans.** Each protocol gets five steps written from its category,
   its main chain and its size: set up, put working capital to work, hold a
   weekly rhythm, spread or deepen, then watch for the snapshot and claim.
   Every step states what it costs in dollars and how long it takes.

No protocol is named in the model: run the program on a newer snapshot and
it prices that universe instead.

## Run it locally

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Then open `out/dashboard/index.html` in a browser. The page renders with no
network: it reads only the `data.js` the program wrote beside it.

## Layout

- `main.ts` — the program: input, outputs, gate self-check, dossier.
- `lib/model.ts` — snapshot parsing, the fitted value model, farm plans.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — the board, a detail view, and a filtered view.
- `vendor/makefun-board.ts` — the house dossier library, byte for byte.
