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

1. **A fitted curve, not a multiple.** The market's pricing of the launched
   protocols is fitted as log market cap on log TVL (least absolute
   deviations, so a few enormous protocols cannot bend it). The fitted
   slope is about one half — market cap grows with roughly the square root
   of TVL — so any single market-cap/TVL multiple, which assumes a slope
   of one, systematically overprices large protocols and underprices
   small ones. Each category shifts the curve by its launched peers'
   median residual, shrunk toward no shift by n/(n+8): many peers earn a
   real shift, one peer earns a ninth of its raw pull, none earns nothing.
   The band beside each value is the fit's own residual spread (P25–P75).
2. **Adjustments.** The curve base is scaled by the protocol's own
   seven-day TVL momentum (half the move, clamped at +/-40%) and by its
   maturity (up to +30% across five tracked years with no token).
3. **The model grades itself.** On every run, `calibrate()` hides each
   launched peer's market cap in turn, refits everything on the remaining
   peers, and prices it: on this snapshot the curve's typical miss is
   x3.7 with 31% of launched peers priced within 2x of their real market
   cap (band coverage 48%), against x5.1, 20% and 36% for the
   category-multiple model it replaced. Those numbers are recomputed,
   never hardcoded, and ship in the dashboard's data.
4. **Set aside, not ranked.** Records that are wrapped, staked, bridged or
   exchange products of a token that already trades (WBTC is Bitcoin, not a
   launch) are excluded from the board with the reason stated on the page.
5. **Farm plans.** Each protocol gets five steps written from its category,
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
network: it reads only the `data.js` the program wrote beside it. On the
page: sort and filter the board, open any protocol's detail, re-price the
whole board in the model sandbox (your own momentum weight and maturity
bonus — the submitted board never changes), pin any three protocols to
compare them side by side, export the board as CSV, or press `/` to jump
straight to a protocol.

## Layout

- `main.ts` — the program: input, outputs, gate self-check, dossier.
- `lib/model.ts` — snapshot parsing, the fitted value model, farm plans.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — the board, a detail view, a filtered view, and a comparison.
- `vendor/makefun-board.ts` — the house dossier library, byte for byte.
