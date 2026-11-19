// Token Launch Radar — the page. Everything renders from window.RADAR,
// the data file main.ts writes beside this page from the sealed snapshot:
// no network, no framework, the board you see is the board that was graded.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);

/** $2.75B, $514M, $950K: compact money for table cells. */
function fmtMoney(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n;
}

/** Whole dollars with separators, for the detail view. */
function fmtFull(n) {
  return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtPct(v) {
  if (v === null || v === undefined) return '<span class="muted">n/a</span>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
}

function fmtAge(days) {
  if (days === null) return 'untracked';
  if (days < 90) return days + 'd';
  if (days < 730) return (days / 30.44).toFixed(1) + ' mo';
  return (days / 365.25).toFixed(1) + ' yrs';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ------------------------------------------------------------- masthead

function renderStats() {
  const c = R.counts;
  const stats = [
    [String(c.protocols), 'protocols scanned'],
    [String(c.rows), 'pre-token ranked'],
    [`${c.watchlist}/${c.watchlist}`, 'watchlist covered'],
    [fmtMoney(R.totalImplied), 'total implied value'],
    [R.as_of, 'snapshot date'],
  ];
  $('mastStats').innerHTML = stats.map(([b, i]) => `<div class="stat"><b>${b}</b><i>${i}</i></div>`).join('');
}

// ------------------------------------------------------------- method

function renderMethod() {
  const g = R.globalFit;
  const sa = R.setAside;
  $('modelStrip').innerHTML =
    `Priced as <b>TVL x the median market-cap/TVL multiple of launched peers</b> in the same line of work, ` +
    `adjusted for seven-day momentum and maturity. The full method, the fitted multiples and the records set aside are below the board.`;
  $('methodText').innerHTML =
    `For every category, the radar fits the <b>market-cap-to-TVL multiples of the protocols whose token already trades</b> ` +
    `(${g.peers} launched peers overall; median <b>${g.median.toFixed(2)}x</b>, peer band ${g.p25.toFixed(2)}x to ${g.p75.toFixed(2)}x, winsorised at the 5th-95th percentile so one mispriced micro-cap cannot stretch it). ` +
    `A pre-token protocol is priced as <b>TVL x its category's median multiple where that category has launched peers — the overall median otherwise</b> (the board marks those rows "overall"), ` +
    `adjusted by its own seven-day TVL momentum (half the move, clamped at +/-40%) and by its maturity (up to +30% across five tracked years with no token). ` +
    `The band beside each value re-prices it at the fit's 25th and 75th percentile multiples: the market's own spread, not an error bar. ` +
    `No protocol is named in the model; run it on a newer snapshot and it prices that universe instead. ` +
    `Every farm plan on the board is five steps written from the protocol's category, main chain and size: set up, put working capital to work, hold a weekly rhythm, spread or deepen, then watch for the snapshot and claim — each step states what it costs in dollars and how long it takes, and the closing total is the sum of the plan's own itemised costs. ` +
    `The radar sets aside <b>${sa.products.count} wrapped, staked or bridged products of a token that already trades</b> (${sa.products.examples.map(esc).join(', ')}): their value already trades under the parent token. ` +
    `It also sets aside <b>${sa.exchanges.count} exchange records</b> (${sa.exchanges.examples.map(esc).join(', ')}): an exchange's own listing is not a protocol launch. Every set-aside is listed with its reason below.`;
  const head = '<tr><th>Category</th><th class="num">Launched peers</th><th class="num">P25</th><th class="num">Median</th><th class="num">P75</th></tr>';
  const shown = R.fits.slice(0, 8);
  const body = shown.map((f) =>
    `<tr><td>${esc(f.category)}</td><td class="num">${f.peers}</td><td class="num">${f.p25.toFixed(2)}x</td><td class="num">${f.median.toFixed(2)}x</td><td class="num">${f.p75.toFixed(2)}x</td></tr>`).join('');
  const more = R.fits.length > shown.length
    ? `<tr><td colspan="5" style="color:var(--muted)">…and ${R.fits.length - shown.length} more fitted categories, used the same way; categories with fewer than three launched peers price at the overall fit.</td></tr>`
    : '';
  $('fitsTable').innerHTML = head + body + more;
}

// ------------------------------------------------------------- board

const state = { sortKey: 'rank', sortDir: 1, selected: null, pins: [], sbW: 0.5, sbB: 0.30 };

// ------------------------------------------------------------- sandbox

// The sandbox re-prices the board in the page under the reader's own
// momentum weight and maturity bonus, using the same formula the program
// fits with: implied = TVL x fitted multiple x momentum x maturity. At the
// model's own settings (50%, +30%) it returns the submitted board exactly;
// board.json itself is never touched.
function sandboxActive() {
  return state.sbW !== 0.5 || state.sbB !== 0.30;
}

function viewOf(r) {
  if (!sandboxActive()) return { implied: r.implied, low: r.impliedLow, high: r.impliedHigh };
  const growth = Math.max(-40, Math.min(40, r.change_7d ?? 0));
  const mom = 1 + (growth / 100) * state.sbW;
  const mat = r.ageDays === null ? 1 : 1 + state.sbB * (Math.min(r.ageDays, 1825) / 1825);
  const imp = Math.max(1, Math.round(r.tvl_usd * r.multiple * mom * mat));
  const k = r.implied > 0 ? imp / r.implied : 1;
  return { implied: imp, low: Math.round(r.impliedLow * k), high: Math.round(r.impliedHigh * k) };
}

function renderSandbox() {
  $('sbWVal').textContent = Math.round(state.sbW * 100) + '%';
  $('sbBVal').textContent = '+' + Math.round(state.sbB * 100) + '%';
  $('sbReset').hidden = !sandboxActive();
  $('sbNote').innerHTML = sandboxActive()
    ? `<b>Sandbox pricing is on</b> — ranks and values below are re-priced in this page at momentum ${Math.round(state.sbW * 100)}% and maturity +${Math.round(state.sbB * 100)}%. The submitted board (board.json) is unchanged; reset returns to it.`
    : `The fitted multiples are the market's; the two adjustments are the radar's. Move them and the board re-prices in the page — the submitted board (board.json) never changes. Pin any three protocols to compare them, export the board as CSV, or press <b>/</b> to jump to a protocol.`;
}

function filteredRows() {
  const q = $('q').value.trim().toLowerCase();
  const cat = $('cat').value;
  const chain = $('chain').value;
  const watchOnly = $('watchOnly').checked;
  const minImp = Number($('minImp').value);
  return R.rows.filter((r) =>
    (cat === '' || (r.category ?? 'Uncategorised') === cat) &&
    (chain === '' || r.chains.includes(chain)) &&
    (!watchOnly || r.watchlist) &&
    viewOf(r).implied >= minImp &&
    (q === '' || r.name.toLowerCase().includes(q) || r.slug.includes(q)));
}

function sortedRows(rows) {
  // In sandbox mode the default order is the sandbox ranking itself.
  if (sandboxActive() && state.sortKey === 'rank') {
    return [...rows].sort((a, b) => viewOf(b).implied - viewOf(a).implied);
  }
  const key = state.sortKey;
  const dir = state.sortDir;
  const val = (r) => {
    const v = key === 'implied' ? viewOf(r).implied : r[key];
    return v === null || v === undefined ? -Infinity : v;
  };
  return [...rows].sort((a, b) => {
    const va = val(a); const vb = val(b);
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb);
  });
}

function renderBoard() {
  const rows = sortedRows(filteredRows());
  const sb = sandboxActive();
  $('rowCount').textContent = `${rows.length} of ${R.rows.length} protocols${sb ? ' · sandbox pricing' : ''}`;
  $('boardBody').innerHTML = rows.map((r, i) => { const v = viewOf(r); return `
    <tr data-slug="${esc(r.slug)}"${state.selected === r.slug ? ' class="selected"' : ''}>
      <td class="rank">${sb ? i + 1 : r.rank}</td>
      <td class="name"><b>${esc(r.name)}</b>${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<span class="slug">${esc(r.slug)}</span></td>
      <td>${esc(r.category ?? 'Uncategorised')}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
      <td class="num money">${fmtMoney(r.tvl_usd)}</td>
      <td class="num">${fmtPct(r.change_7d)}</td>
      <td class="num">${fmtAge(r.ageDays)}</td>
      <td class="num money">${r.multiple.toFixed(2)}x${r.fitName === 'All categories' ? '<span class="overall">OVERALL</span>' : ''}</td>
      <td class="num imp">${fmtMoney(v.implied)}</td>
      <td class="num band">${fmtMoney(v.low)} – ${fmtMoney(v.high)}</td>
      <td><button class="pinbtn${state.pins.includes(r.slug) ? ' on' : ''}" data-pin="${esc(r.slug)}" type="button">${state.pins.includes(r.slug) ? 'Pinned' : 'Pin'}</button></td>
    </tr>`; }).join('');
  for (const tr of $('boardBody').querySelectorAll('tr')) {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug));
  }
  for (const b of $('boardBody').querySelectorAll('[data-pin]')) {
    b.addEventListener('click', (e) => { e.stopPropagation(); togglePin(b.dataset.pin); });
  }
}

// ------------------------------------------------------------- compare

function togglePin(slug) {
  const i = state.pins.indexOf(slug);
  if (i >= 0) state.pins.splice(i, 1);
  else {
    if (state.pins.length >= 3) state.pins.shift();
    state.pins.push(slug);
  }
  renderTray();
  renderBoard();
  if (!$('compare').hidden) openCompare();
}

function renderTray() {
  const t = $('tray');
  if (state.pins.length === 0) { t.hidden = true; t.innerHTML = ''; return; }
  const names = state.pins.map((s) => { const r = R.rows.find((x) => x.slug === s); return r ? esc(r.name) : s; });
  t.hidden = false;
  t.innerHTML = `<span class="tray-label">Pinned for comparison:</span> ${names.join(' · ')}
    <button class="closebtn" id="trayCompare" type="button" ${state.pins.length < 2 ? 'disabled' : ''}>Compare ${state.pins.length}</button>
    <button class="closebtn" id="trayClear" type="button">Clear</button>`;
  $('trayClear').addEventListener('click', () => { state.pins = []; renderTray(); renderBoard(); closeCompare(); });
  const cmp = $('trayCompare');
  if (cmp) cmp.addEventListener('click', openCompare);
}

/** The farm plan's closing line carries its own totals; read them back. */
function planTotals(r) {
  const last = r.farm_steps[r.farm_steps.length - 1] || '';
  const fees = last.match(/about (\$[\d,]+) in fees/);
  const weeks = last.match(/over (\d+) weeks/);
  const cap = last.match(/plus (\$[\d,]+) of working capital/);
  return { fees: fees ? fees[1] : '—', weeks: weeks ? weeks[1] : '—', cap: cap ? cap[1] : '—' };
}

function openCompare() {
  const rows = state.pins.map((s) => R.rows.find((x) => x.slug === s)).filter(Boolean);
  if (rows.length < 2) return;
  const d = $('compare');
  d.hidden = false;
  const cell = (fn) => rows.map((r) => `<td>${fn(r)}</td>`).join('');
  const num = (fn) => rows.map((r) => `<td class="num">${fn(r)}</td>`).join('');
  d.innerHTML = `
    <div class="detail-head">
      <div><h2>Compare — ${rows.map((r) => esc(r.name)).join(' vs ')}</h2>
      <span class="sub">Side by side on the radar's own numbers: the fitted price, the market band around it, and what farming each one costs.</span></div>
      <button class="closebtn" id="compareClose" type="button">Close</button>
    </div>
    <div class="fits-wrap"><table class="fits cmp">
      <tr><th></th>${rows.map((r) => `<th>#${r.rank} ${esc(r.name)}${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}</th>`).join('')}</tr>
      <tr><td>Category</td>${cell((r) => esc(r.category ?? 'Uncategorised'))}</tr>
      <tr><td>Chains</td>${cell((r) => esc(r.chains.join(', ') || 'none recorded'))}</tr>
      <tr><td>Total value locked</td>${num((r) => fmtFull(r.tvl_usd))}</tr>
      <tr><td>TVL change, 7d</td>${num((r) => (r.change_7d === null ? 'unreported' : r.change_7d.toFixed(2) + '%'))}</tr>
      <tr><td>Age with no token</td>${num((r) => fmtAge(r.ageDays))}</tr>
      <tr><td>Peer multiple</td>${num((r) => r.multiple.toFixed(3) + 'x (' + esc(r.fitName) + ' fit)')}</tr>
      <tr><td>Implied value</td>${num((r) => '<b>' + fmtFull(r.implied) + '</b>')}</tr>
      <tr><td>Peer band (P25 – P75)</td>${num((r) => fmtFull(r.impliedLow) + ' – ' + fmtFull(r.impliedHigh))}</tr>
      <tr><td>Farm plan</td>${cell((r) => { const t = planTotals(r); return `${r.farm_steps.length} steps · about ${t.fees} in fees over ${t.weeks} weeks, plus ${t.cap} of working capital`; })}</tr>
      <tr><td>Core move</td>${cell((r) => esc(r.farm_steps[1] || ''))}</tr>
    </table></div>`;
  $('compareClose').addEventListener('click', closeCompare);
  d.scrollIntoView({ block: 'nearest' });
}

function closeCompare() {
  $('compare').hidden = true;
}

// ------------------------------------------------------------- export + palette

function exportCsv() {
  const rows = sortedRows(filteredRows());
  const head = 'rank,name,slug,category,chains,tvl_usd,change_7d_pct,age_days,peer_multiple,implied_value_usd,band_low_usd,band_high_usd,watchlist';
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.rank, q(r.name), r.slug, q(r.category ?? 'Uncategorised'), q(r.chains.join(' ')),
    r.tvl_usd, r.change_7d ?? '', r.ageDays ?? '', r.multiple.toFixed(4), r.implied, r.impliedLow, r.impliedHigh, r.watchlist ? 1 : 0].join(','));
  const blob = new Blob([head + '\n' + lines.join('\n') + '\n'], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'token-launch-radar-board.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function paletteMatches() {
  const q = $('palInput').value.trim().toLowerCase();
  const hits = R.rows.filter((r) => q === '' || r.name.toLowerCase().includes(q) || r.slug.includes(q)).slice(0, 8);
  $('palList').innerHTML = hits.map((r) =>
    `<button class="pal-row" data-slug="${esc(r.slug)}" type="button"><b>#${r.rank} ${esc(r.name)}</b><span>${fmtMoney(r.implied)} implied · ${esc(r.category ?? 'Uncategorised')}</span></button>`).join('')
    || '<p class="pal-none">No protocol matches.</p>';
  for (const b of $('palList').querySelectorAll('[data-slug]')) {
    b.addEventListener('click', () => { closePalette(); openDetail(b.dataset.slug); });
  }
  return hits;
}

function openPalette() {
  $('palette').hidden = false;
  $('palInput').value = '';
  paletteMatches();
  $('palInput').focus();
}

function closePalette() {
  $('palette').hidden = true;
}

// ------------------------------------------------------------- detail

function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.selected = slug;
  const fit = R.fits.find((f) => f.category === r.fitName) || R.globalFit;
  const d = $('detail');
  d.hidden = false;
  d.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>#${r.rank} ${esc(r.name)}${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
        <span class="sub">${esc(r.slug)} · ${esc(r.category ?? 'Uncategorised')} · tracked since ${r.listed_at ?? 'an unrecorded date'}</span>
      </div>
      <div class="detail-imp"><b>${fmtFull(r.implied)}</b><i>implied value if it launched today</i></div>
      <button class="closebtn" id="detailClose" type="button">Close</button>
    </div>
    <div class="detail-grid">
      <div>
        <h3>How the value is built</h3>
        <table class="breakdown">
          <tr><td>Total value locked (snapshot)</td><td class="num">${fmtFull(r.tvl_usd)}</td></tr>
          <tr><td>Peer multiple (${fit.category === 'All categories' ? `overall median of ${fit.peers} launched peers — ${esc(r.category ?? 'this category')} has too few launched peers to fit alone` : `median of ${fit.peers} launched ${esc(fit.category)} peers${fit.category !== (r.category ?? '') ? ` — ${esc(r.category ?? '')} prices under the shared ${esc(fit.category)} fit` : ''}`})</td><td class="num">x ${r.multiple.toFixed(3)}</td></tr>
          <tr><td>Seven-day momentum (${r.change_7d === null ? 'unreported' : r.change_7d.toFixed(2) + '%'}, half weight)</td><td class="num">x ${r.momentumMult.toFixed(3)}</td></tr>
          <tr><td>Maturity (${fmtAge(r.ageDays)} tracked, no token)</td><td class="num">x ${r.maturityMult.toFixed(3)}</td></tr>
          <tr class="total"><td>Implied value</td><td class="num">${fmtFull(r.implied)}</td></tr>
          <tr><td>Peer band (P25 to P75 multiples)</td><td class="num">${fmtFull(r.impliedLow)} – ${fmtFull(r.impliedHigh)}</td></tr>
        </table>
        <h3 style="margin-top:16px">The protocol</h3>
        <dl class="kv">
          <dt>Chains</dt><dd>${esc(r.chains.join(', ') || 'none recorded')}</dd>
          <dt>TVL change, 7d</dt><dd>${r.change_7d === null ? 'unreported' : r.change_7d.toFixed(2) + '%'}</dd>
          <dt>Token</dt><dd>none recorded in the snapshot</dd>
          <dt>Watchlist</dt><dd>${r.watchlist ? 'yes — on the house list, at or above the ' + fmtMoney(R.floor_usd) + ' floor' : 'not on the house list — the house list also applies parent-protocol rules the snapshot does not carry; the radar ranks it anyway'}</dd>
        </dl>
      </div>
      <div>
        <h3>Farm plan — what to do, what it costs, how long it takes</h3>
        <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </div>
    </div>`;
  $('detailClose').addEventListener('click', closeDetail);
  renderBoardSelection();
}

function closeDetail() {
  $('detail').hidden = true;
  state.selected = null;
  renderBoardSelection();
}

function renderBoardSelection() {
  for (const tr of $('boardBody').querySelectorAll('tr')) {
    tr.classList.toggle('selected', tr.dataset.slug === state.selected);
  }
}

// ------------------------------------------------------------- live peers

function renderLive() {
  const head = '<tr><th>Protocol</th><th>Symbol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Cap / TVL</th></tr>';
  const body = R.live.map((p) =>
    `<tr><td>${esc(p.name)}</td><td>${esc(p.symbol ?? '—')}</td><td>${esc(p.category ?? 'Uncategorised')}</td>` +
    `<td class="num">${fmtMoney(p.tvl_usd)}</td><td class="num">${fmtMoney(p.mcap_usd)}</td><td class="num">${p.ratio.toFixed(2)}x</td></tr>`).join('');
  $('liveTable').innerHTML = head + body;
}

function renderAside() {
  const head = '<tr><th>Record</th><th>Category</th><th class="num">TVL</th><th>Why it is not ranked</th></tr>';
  const body = R.setAside.rows.map((x) =>
    `<tr><td>${esc(x.name)}</td><td>${esc(x.category ?? 'Uncategorised')}</td><td class="num">${fmtMoney(x.tvl_usd)}</td><td>${esc(x.reason)}</td></tr>`).join('');
  $('asideTable').innerHTML = head + body;
}

// ------------------------------------------------------------- wiring

function fillFilters() {
  const cats = [...new Set(R.rows.map((r) => r.category ?? 'Uncategorised'))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}

function applyHash() {
  // Screenshot staging and shareable views: #detail=<slug>, #cat=<category>,
  // #chain=<chain>, #watch=1, #q=<text>, #compare=<slug,slug,slug> preset
  // the page on load.
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('cat')) $('cat').value = h.get('cat');
  if (h.get('chain')) $('chain').value = h.get('chain');
  if (h.get('watch') === '1') $('watchOnly').checked = true;
  if (h.get('q')) $('q').value = h.get('q');
  if (h.get('compare')) {
    state.pins = h.get('compare').split(',').filter((s) => R.rows.some((r) => r.slug === s)).slice(0, 3);
    renderTray();
  }
  renderBoard();
  if (h.get('compare') && state.pins.length >= 2) openCompare();
  if (h.get('detail')) openDetail(h.get('detail'));
}

function init() {
  renderStats();
  renderMethod();
  renderSandbox();
  fillFilters();
  renderLive();
  renderAside();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDetail(); closePalette(); }
    if ((e.key === '/' || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) &&
        !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      openPalette();
    }
  });
  $('footSource').textContent = `Data: ${R.source}. The board is regenerated from that sealed snapshot on every run of the program; nothing here is fetched live.`;
  for (const id of ['q', 'cat', 'chain', 'watchOnly', 'minImp']) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  }
  $('sbW').addEventListener('input', () => { state.sbW = Number($('sbW').value) / 100; renderSandbox(); renderBoard(); });
  $('sbB').addEventListener('input', () => { state.sbB = Number($('sbB').value) / 100; renderSandbox(); renderBoard(); });
  $('sbReset').addEventListener('click', () => {
    state.sbW = 0.5; state.sbB = 0.30;
    $('sbW').value = '50'; $('sbB').value = '30';
    renderSandbox(); renderBoard();
  });
  $('csvBtn').addEventListener('click', exportCsv);
  $('paletteBtn').addEventListener('click', openPalette);
  $('palInput').addEventListener('input', paletteMatches);
  $('palInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const hits = paletteMatches(); if (hits.length) { closePalette(); openDetail(hits[0].slug); } }
  });
  $('palette').addEventListener('click', (e) => { if (e.target === $('palette')) closePalette(); });
  for (const th of document.querySelectorAll('table.board th[data-sort]')) {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = key === 'name' || key === 'category' ? 1 : -1; }
      if (key === 'rank') state.sortDir = 1;
      renderBoard();
    });
  }
  applyHash();
}

init();
