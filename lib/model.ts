// Token Launch Radar — the model.
//
// Everything the board claims is derived here from the sealed snapshot's own
// figures, in three moves:
//
//   1. peerMultiples() fits, for every category, the market-cap-to-TVL ratios
//      of the protocols in that category whose token already trades. A
//      pre-token protocol is priced the way the market already prices its
//      launched peers: implied value = TVL x category multiple.
//   2. valueProtocol() adjusts that base for the two signals the snapshot
//      carries about the protocol itself: its seven-day TVL momentum and
//      its maturity (how long DefiLlama has tracked it with no token). The
//      peer spread (25th to 75th percentile) becomes the value band.
//   3. farmPlan() writes each protocol a concrete plan from its category,
//      its chains and its size tier: what to do, what it costs, how long
//      the campaign runs.
//
// No protocol is named anywhere in this file. Feed it a different snapshot
// and it prices that universe instead: the radar is the model, not a list.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface CategoryFit {
  category: string;
  peers: number;
  p25: number;
  median: number;
  p75: number;
}

export interface Valuation {
  multiple: number;
  multipleLow: number;
  multipleHigh: number;
  momentumMult: number;
  maturityMult: number;
  ageDays: number | null;
  implied: number;
  impliedLow: number;
  impliedHigh: number;
  /** The fit that priced this row: a category (or shared) fit's name, or 'All categories' for the overall fallback. */
  fitName: string;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends Valuation {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  farm_steps: string[];
}

export interface LivePeer {
  name: string;
  symbol: string | null;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  counts: { protocols: number; preToken: number; watchlist: number; rows: number; live: number };
  setAside: {
    products: { count: number; examples: string[] };
    exchanges: { count: number; examples: string[] };
    rows: { name: string; category: string | null; tvl_usd: number; reason: string }[];
  };
  totalImplied: number;
  fits: CategoryFit[];
  globalFit: CategoryFit;
  rows: RadarRow[];
  live: LivePeer[];
}

// ---------------------------------------------------------------- snapshot

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!raw || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist arrays are required');
  }
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error('snapshot: every protocol needs a slug and a tvl_usd');
    }
  }
  return raw;
}

/** A protocol records no token when both token fields are null. */
export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * A wrapped, staked, bridged or exchange product of a token that already
 * trades is not a launch waiting to happen: WBTC is Bitcoin on Ethereum,
 * and its value already trades as BTC. The watchlist's own rule draws this
 * line with DefiLlama's parent record, which the snapshot does not carry;
 * this restates the same line from the ten fields it does carry — the
 * product categories, a version marker or a wrapped/staked word in the
 * name, or an exchange's name at the front of it.
 */
/** Why a record is set aside, in the page's own words, or null when it is a genuine launch candidate. */
export function tradedProductReason(p: Protocol): string | null {
  if (p.category === 'CEX' || EXCHANGE_NAMES.some((x) => p.name === x || p.name.startsWith(`${x} `))) {
    return 'exchange record — an exchange\u2019s own listing is not a protocol launch';
  }
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) {
    return `${p.category.toLowerCase()} product of a token that already trades`;
  }
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'wrapped or staked product, by its name';
  if (VERSION_SUFFIX.test(p.name)) return 'a versioned record of another protocol';
  return null;
}

export function isTradedProduct(p: Protocol): boolean {
  return tradedProductReason(p) !== null;
}

// ---------------------------------------------------------------- fitting

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

function fitOf(category: string, ratios: number[]): CategoryFit {
  const sorted = [...ratios].sort((a, b) => a - b);
  return {
    category,
    peers: sorted.length,
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
  };
}

/**
 * The fit group a category prices under: its own name. A category with
 * fewer than three launched peers prices at the overall fit instead, and
 * the board marks those rows "overall" — a thin three-peer median would
 * be a weaker claim than the 128-peer overall one, not a stronger one.
 */
export function fitGroupOf(category: string | null): string {
  return category ?? 'Uncategorised';
}

/**
 * Fit the market-cap/TVL multiples of the already-launched protocols, per
 * category and overall. Categories with fewer than three traded peers fall
 * back to the overall fit when a protocol is priced. The overall fit is
 * winsorised at its own 5th and 95th percentiles first, so one mispriced
 * micro-cap cannot stretch the band every fallback row displays.
 */
export function peerMultiples(protocols: Protocol[]): { byCategory: Map<string, CategoryFit>; global: CategoryFit } {
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (recordsNoToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const key = fitGroupOf(p.category);
    const list = groups.get(key);
    if (list) list.push(ratio);
    else groups.set(key, [ratio]);
    all.push(ratio);
  }
  const byCategory = new Map<string, CategoryFit>();
  for (const [category, ratios] of groups) {
    if (ratios.length >= 3) byCategory.set(category, fitOf(category, ratios));
  }
  const sortedAll = [...all].sort((a, b) => a - b);
  const lo = quantile(sortedAll, 0.05);
  const hi = quantile(sortedAll, 0.95);
  const winsorised = all.map((r) => Math.min(hi, Math.max(lo, r)));
  return { byCategory, global: fitOf('All categories', winsorised) };
}

// ---------------------------------------------------------------- valuation

const DAY_MS = 86_400_000;

export function ageInDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Price one pre-token protocol. The base is its TVL times the fitted median
 * multiple of its category's launched peers; momentum scales it by half the
 * (clamped) seven-day TVL change, and maturity adds up to +30% across five
 * tracked years. The band re-prices the base at the peers' 25th and 75th
 * percentile multiples, so the spread a reader sees is the market's own
 * disagreement about the category, not a made-up error bar.
 */
export function valueProtocol(p: Protocol, fits: { byCategory: Map<string, CategoryFit>; global: CategoryFit }, asOf: string): Valuation {
  const fit = fits.byCategory.get(fitGroupOf(p.category)) ?? fits.global;
  const growth = clamp(p.change_7d ?? 0, -40, 40);
  const momentumMult = 1 + growth / 200;
  const ageDays = ageInDays(p.listed_at, asOf);
  const maturityMult = ageDays === null ? 1 : 1 + 0.3 * (Math.min(ageDays, 1825) / 1825);
  const price = (multiple: number): number => Math.max(1, Math.round(p.tvl_usd * multiple * momentumMult * maturityMult));
  return {
    multiple: fit.median,
    multipleLow: fit.p25,
    multipleHigh: fit.p75,
    momentumMult,
    maturityMult,
    ageDays,
    implied: price(fit.median),
    impliedLow: price(fit.p25),
    impliedHigh: price(fit.p75),
    fitName: fit.category,
  };
}

// ---------------------------------------------------------------- farm plans

/** Whole dollars with thousands separators, written by hand so the output is byte-identical on any runtime. */
export function usd(n: number): string {
  const s = String(Math.max(0, Math.round(n)));
  return `$${s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** Rough per-session gas in dollars, keyed by the chain names the snapshot itself uses; an unlisted chain prices at the $2 L2-class fallback in gasFor(). */
const GAS_BY_CHAIN: Record<string, number> = {
  Ethereum: 25, Bitcoin: 5, Solana: 1, Binance: 1, Base: 1, 'Hyperliquid L1': 1,
  Arbitrum: 1, Sui: 1, Tron: 2, Stellar: 1, Monad: 1, Flare: 1, Avalanche: 3,
  Polygon: 1, 'Robinhood Chain': 1, TON: 1, Near: 1, Ripple: 1, Berachain: 2,
  Cronos: 1, Starknet: 1, Algorand: 1, RSK: 2, Mantle: 1, Bittensor: 2, Ink: 1,
  xDai: 1, Optimism: 1, Sei: 1, Cardano: 2, 'zkSync Era': 1, Aptos: 1, Plasma: 1,
  Linea: 1, Scroll: 1, Blast: 1, Sonic: 1, Hedera: 1, Injective: 1, Kava: 1,
};

function gasFor(chain: string): number {
  return GAS_BY_CHAIN[chain] ?? 2;
}

/** Working capital a farmer should bring, tiered by the protocol's own TVL. */
function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 10_000;
  if (tvl >= 250_000_000) return 5_000;
  if (tvl >= 50_000_000) return 2_500;
  if (tvl >= 10_000_000) return 1_000;
  return 250;
}

type Family = 'exchange' | 'lending' | 'vault' | 'bridge' | 'staking' | 'rwa' | 'chain' | 'payments' | 'core';

function familyOf(category: string | null): Family {
  switch (category) {
    case 'Dexs': case 'Derivatives': case 'Options Vault': case 'Options': return 'exchange';
    case 'Lending': case 'CDP': case 'Collateral Markets': return 'lending';
    case 'Yield': case 'Risk Curators': case 'Onchain Capital Allocator': case 'Leveraged Farming':
    case 'Basis Trading': case 'Yield Aggregator': case 'Fixed Interest': return 'vault';
    case 'Bridge': case 'Canonical Bridge': case 'Cross Chain': return 'bridge';
    case 'Liquid Staking': case 'Staking Pool': case 'Restaking': case 'Liquid Restaking': case 'Staking': return 'staking';
    case 'RWA': case 'RWA Lending': return 'rwa';
    case 'Chain': return 'chain';
    case 'Payments': return 'payments';
    default: return 'core';
  }
}

const CORE_ACTION: Record<Family, string> = {
  exchange: 'swap a liquid pair and leave a resting limit order, then provide the same pair in the tightest fee tier you can monitor',
  lending: 'supply a blue-chip collateral asset and borrow a small, safe amount against it, keeping the health factor above 2',
  vault: 'deposit into the flagship vault and leave the position untouched between visits, so your average balance, not a spike, is what gets measured',
  bridge: 'route a real transfer to the chain you actually use, in both directions, instead of bridging in a circle',
  staking: 'stake the base asset through the protocol and hold the receipt token in the same wallet, unstaked and visible',
  rwa: 'complete the onboarding or KYC the product asks for and hold one of its yield-bearing assets to term',
  chain: 'bridge a working balance in and use two or three native apps, so the wallet builds a real transaction history on the chain itself',
  payments: 'make real payments through it: load a balance, pay for something you were buying anyway, and keep the account active',
  core: 'use the product the way its own documentation leads a first user: one real position, held, not a single test click',
};

const CADENCE: Record<Family, string> = {
  exchange: 'trade a small amount every week and rebalance the liquidity position when it drifts out of range',
  lending: 'top the supply up or adjust the borrow every week so the position never sits idle or near liquidation',
  vault: 'add a small deposit every week rather than one lump sum, building a rising average balance',
  bridge: 'bridge once a week in alternating directions, varying the amount and the destination chain',
  staking: 'compound or add a small amount every week and never unstake during the campaign',
  rwa: 'add on the product\u2019s own settlement rhythm and hold every position to its term',
  chain: 'run three or four transactions a week across different native apps, at different times of day',
  payments: 'route your ordinary weekly spending through it, a few real payments a week',
  core: 'come back every week and repeat the core action at a slightly larger size',
};

/**
 * A five-step farm plan for one protocol, priced from its own figures: gas
 * from its main chain, working capital from its TVL tier, and a campaign
 * length that shortens as the protocol's tracked age grows (an older
 * pre-token protocol is nearer its launch, so the runway is shorter and
 * the weekly rhythm matters more).
 */
export function farmPlan(p: Protocol, ageDays: number | null): string[] {
  const family = familyOf(p.category);
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = gasFor(chain);
  const capital = capitalFor(p.tvl_usd);
  const weeks = ageDays === null ? 12 : clamp(18 - Math.floor(ageDays / 180), 6, 16);
  const others = p.chains.slice(1, 3);
  // Every fee a step names is collected here first, so the closing total is
  // the sum of the plan's own itemised costs — never a second formula.
  const setupFee = gas * 2;
  const openFee = gas;
  const rhythmFees = gas * weeks;
  const spreadFees = others.length * gas * 2;
  const spreadCapital = others.length * Math.round(capital / 2);
  const deepenFee = gas;
  const deepenCapital = Math.round(capital / 2);
  const totalFees = setupFee + openFee + rhythmFees + (others.length > 0 ? spreadFees : deepenFee);
  const totalCapital = capital + (others.length > 0 ? spreadCapital : deepenCapital);
  const steps: string[] = [
    `Set up on ${chain}: open ${p.name} in a fresh wallet kept only for farming and fund it with about ${usd(gas * 4)} for gas plus the working capital below. Cost: about ${usd(setupFee)} in funding and bridge fees, once. Time: under an hour on day one.`,
    `Put ${usd(capital)} to work in ${p.name}: ${CORE_ACTION[family]}. Cost: the ${usd(capital)} stays yours and withdrawable; about ${usd(openFee)} of gas to open. Time: about 20 minutes.`,
    `Hold the rhythm for ${weeks} weeks: ${CADENCE[family]}. Cost: about ${usd(gas)} a week in gas, ${usd(rhythmFees)} across the campaign. Time: about 15 minutes a week.`,
    others.length > 0
      ? `Spread to ${others.join(' and ')} once the first position is a month old: repeat the core action there at half size, ${usd(Math.round(capital / 2))} of working capital per extra chain. Multi-chain use is the cheapest proof you are a real user. Cost: one bridge fee of about ${usd(gas * 2)} per extra chain, ${usd(spreadFees)} in all. Time: one extra session.`
      : `Deepen on ${chain} instead of spreading: open a second, different position type in ${p.name} with ${usd(deepenCapital)} more working capital, so the wallet shows range, not one repeated click. Cost: about ${usd(deepenFee)} of gas. Time: one extra session.`,
    `From week ${Math.max(1, weeks - 2)}, check ${p.name}'s official channels weekly for a points program, snapshot or token announcement and keep every position live until any claim window closes; save each transaction hash as your eligibility record. Total campaign cost: about ${usd(totalFees)} in fees over ${weeks} weeks, plus ${usd(totalCapital)} of working capital.`,
  ];
  return steps;
}

// ---------------------------------------------------------------- the board

export interface Built {
  board: BoardRow[];
  data: RadarData;
}

/** Rank every protocol that records no token by its fitted implied value, and assemble the dashboard's data. */
export function buildRadar(snapshot: Snapshot): Built {
  const fits = peerMultiples(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const aside = snapshot.protocols.filter((p) => recordsNoToken(p) && isTradedProduct(p));
  const scored: RadarRow[] = [];
  for (const p of snapshot.protocols) {
    if (!recordsNoToken(p) || isTradedProduct(p)) continue;
    const v = valueProtocol(p, fits, snapshot.as_of);
    scored.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      watchlist: watch.has(p.slug),
      ...v,
      farm_steps: farmPlan(p, v.ageDays),
    });
  }
  scored.sort((a, b) => b.implied - a.implied || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  scored.forEach((row, i) => { row.rank = i + 1; });

  const board: BoardRow[] = scored.map((row) => ({
    slug: row.slug,
    name: row.name,
    rank: row.rank,
    implied_value_usd: row.implied,
    farm_steps: row.farm_steps,
  }));

  const live: LivePeer[] = snapshot.protocols
    .filter((p) => !recordsNoToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24)
    .map((p) => ({
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd ?? 0,
      ratio: Math.round(((p.mcap_usd ?? 0) / p.tvl_usd) * 10_000) / 10_000,
    }));

  const fitList = [...fits.byCategory.values()].sort((a, b) => b.peers - a.peers).slice(0, 18);
  const data: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    counts: {
      protocols: snapshot.protocols.length,
      preToken: scored.length,
      watchlist: snapshot.watchlist.length,
      rows: board.length,
      live: snapshot.protocols.filter((p) => !recordsNoToken(p)).length,
    },
    setAside: (() => {
      const withReason = aside.map((p) => ({ p, reason: tradedProductReason(p)! }));
      const exchanges = withReason.filter((x) => x.reason.startsWith('exchange record'));
      const products = withReason.filter((x) => !x.reason.startsWith('exchange record'));
      const top = (xs: { p: Protocol }[]): string[] => [...xs].sort((a, b) => b.p.tvl_usd - a.p.tvl_usd).slice(0, 4).map((x) => x.p.name);
      return {
        products: { count: products.length, examples: top(products) },
        exchanges: { count: exchanges.length, examples: top(exchanges) },
        rows: withReason
          .sort((a, b) => b.p.tvl_usd - a.p.tvl_usd)
          .map((x) => ({ name: x.p.name, category: x.p.category, tvl_usd: x.p.tvl_usd, reason: x.reason })),
      };
    })(),
    totalImplied: scored.reduce((sum, r) => sum + r.implied, 0),
    fits: fitList,
    globalFit: fits.global,
    rows: scored,
    live,
  };
  return { board, data };
}

/** The script the dashboard loads: the whole radar as one global, with `<` escaped so no name can break the tag. */
export function dataScript(data: RadarData): string {
  return `window.RADAR = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;
}

// ---------------------------------------------------------------- gate mirror

/**
 * The sealed gate's board rows, restated so a bad board fails here first:
 * 100 to 4,000 rows of the snapshot's own slugs, ranks exactly 1..N,
 * implied values positive, whole, capped and never rising with rank (and
 * not all equal), every watchlist slug covered, and every farm plan 3 to
 * 12 steps of 20 to 600 trimmed characters.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    const row = byRank[i]!;
    if (row.rank !== i + 1) return `ranks are not exactly 1..N (rank ${row.rank} at position ${i + 1})`;
    if (!known.has(row.slug)) return `slug ${row.slug} is not in the snapshot`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (!row.name) return `row ${row.slug} has no name`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 100_000_000_000_000) {
      return `row ${row.slug} has an implied value outside the gate's range`;
    }
    if (i > 0 && row.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `implied value rises at rank ${row.rank}`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${Array.isArray(row.farm_steps) ? row.farm_steps.length : 0} farm steps, outside 3..12`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} trimmed characters, outside 20..600`;
    }
  }
  if (byRank.length > 1 && byRank.every((r) => r.implied_value_usd === byRank[0]!.implied_value_usd)) {
    return 'every implied value is the same: a board that ranks nothing by value';
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}
