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
  $('methodText').innerHTML =
    `For every category, the radar fits the <b>market-cap-to-TVL multiples of the protocols whose token already trades</b> ` +
    `(${g.peers} launched peers overall; median <b>${g.median.toFixed(2)}x</b>, peer band ${g.p25.toFixed(2)}x to ${g.p75.toFixed(2)}x). ` +
    `A pre-token protocol is priced as <b>TVL x its category's median multiple</b>, adjusted by its own seven-day TVL momentum ` +
    `(half the move, clamped at +/-40%) and by its maturity (up to +30% across five tracked years with no token). ` +
    `The band beside each value re-prices it at the category's 25th and 75th percentile multiples: the market's own spread, not an error bar. ` +
    `No protocol is named in the model; run it on a newer snapshot and it prices that universe instead. ` +
    `Every farm plan on the board is five steps written from the protocol's category, main chain and size: set up, put working capital to work, hold a weekly rhythm, spread or deepen, then watch for the snapshot and claim — each step states what it costs in dollars and how long it takes. ` +
    `The radar also sets aside <b>${R.setAside.count} records that record no token of their own but are wrapped, staked, bridged or exchange products of one that already trades</b> ` +
    `(${R.setAside.examples.map(esc).join(', ')}): their value already trades under the parent token, so they are not launches and are not ranked.`;
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

const state = { sortKey: 'rank', sortDir: 1, selected: null };

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
    r.implied >= minImp &&
    (q === '' || r.name.toLowerCase().includes(q) || r.slug.includes(q)));
}

function sortedRows(rows) {
  const key = state.sortKey;
  const dir = state.sortDir;
  const val = (r) => {
    const v = r[key];
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
  $('rowCount').textContent = `${rows.length} of ${R.rows.length} protocols`;
  $('boardBody').innerHTML = rows.map((r) => `
    <tr data-slug="${esc(r.slug)}"${state.selected === r.slug ? ' class="selected"' : ''}>
      <td class="rank">${r.rank}</td>
      <td class="name"><b>${esc(r.name)}</b>${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<span class="slug">${esc(r.slug)}</span></td>
      <td>${esc(r.category ?? 'Uncategorised')}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
      <td class="num money">${fmtMoney(r.tvl_usd)}</td>
      <td class="num">${fmtPct(r.change_7d)}</td>
      <td class="num">${fmtAge(r.ageDays)}</td>
      <td class="num money">${r.multiple.toFixed(2)}x</td>
      <td class="num imp">${fmtMoney(r.implied)}</td>
      <td class="num band">${fmtMoney(r.impliedLow)} – ${fmtMoney(r.impliedHigh)}</td>
    </tr>`).join('');
  for (const tr of $('boardBody').querySelectorAll('tr')) {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug, true));
  }
}

// ------------------------------------------------------------- detail

function openDetail(slug, scroll) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.selected = slug;
  const fit = R.fits.find((f) => f.category === (r.category ?? '')) || R.globalFit;
  const d = $('detail');
  d.hidden = false;
  d.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>#${r.rank} ${esc(r.name)}${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
        <span class="sub">${esc(r.slug)} · ${esc(r.category ?? 'Uncategorised')} · tracked since ${r.listed_at ?? 'an unrecorded date'}</span>
      </div>
      <div class="detail-imp"><b>${fmtFull(r.implied)}</b><i>implied value if it launched today</i></div>
    </div>
    <div class="detail-grid">
      <div>
        <h3>How the value is built</h3>
        <table class="breakdown">
          <tr><td>Total value locked (snapshot)</td><td class="num">${fmtFull(r.tvl_usd)}</td></tr>
          <tr><td>Peer multiple (${fit.category === 'All categories' ? `overall median of ${fit.peers} launched peers — ${esc(r.category ?? 'this category')} has too few launched peers to fit alone` : `median of ${fit.peers} launched ${esc(fit.category)} peers`})</td><td class="num">x ${r.multiple.toFixed(3)}</td></tr>
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
          <dt>Watchlist</dt><dd>${r.watchlist ? 'yes — on the house list, at or above the ' + fmtMoney(R.floor_usd) + ' floor' : 'not on the house list (it also applies parent-protocol rules the snapshot does not carry); the radar ranks it anyway'}</dd>
        </dl>
      </div>
      <div>
        <h3>Farm plan — what to do, what it costs, how long it takes</h3>
        <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </div>
    </div>`;
  renderBoardSelection();
  if (scroll) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ------------------------------------------------------------- wiring

function fillFilters() {
  const cats = [...new Set(R.rows.map((r) => r.category ?? 'Uncategorised'))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}

function applyHash() {
  // Screenshot staging and shareable views: #detail=<slug>, #cat=<category>,
  // #chain=<chain>, #watch=1, #q=<text> preset the page on load.
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('cat')) $('cat').value = h.get('cat');
  if (h.get('chain')) $('chain').value = h.get('chain');
  if (h.get('watch') === '1') $('watchOnly').checked = true;
  if (h.get('q')) $('q').value = h.get('q');
  renderBoard();
  if (h.get('detail')) openDetail(h.get('detail'), false);
}

function init() {
  renderStats();
  renderMethod();
  fillFilters();
  renderLive();
  $('footSource').textContent = `Data: ${R.source}. The board is regenerated from that sealed snapshot on every run of the program; nothing here is fetched live.`;
  for (const id of ['q', 'cat', 'chain', 'watchOnly', 'minImp']) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  }
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
