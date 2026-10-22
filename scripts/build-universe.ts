// Build the full US-listed universe. Usage:
//   DATA_DIR=datastore npx tsx scripts/build-universe.ts [--zip companyfacts.zip] [--limit N] [--only AAPL,BRK-B]
// 1. Listings: SEC company_tickers_exchange.json (Nasdaq, NYSE, NYSE American via "NYSE", Cboe, TXSE); OTC dropped.
//    Preferreds, warrants, units and rights are dropped when the company's common ticker is also listed.
// 2. Financials: SEC bulk companyfacts.zip (one entry per CIK, streamed with `unzip -p`), or without --zip a throttled
//    per-company fetch of data.sec.gov/api/xbrl/companyfacts (<= 5 req/s, descriptive User-Agent).
// 3. Output: universe.json (search index) + c/<CIK>.json (compact periods for the Sankey) + universe-stats.json.
// Resilience: per-company keep-last-good, and the run aborts without writing the index if it would shrink > 30%.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { normalize, type Company } from '../src/lib/normalize.ts';
import { buildFlow } from '../src/lib/flow.ts';
import { pack, ST } from '../src/lib/compact.ts';

const DIR = process.env.DATA_DIR || 'public/data';
const UA = process.env.SEC_USER_AGENT || 'EarningsFlow/1.0 Jackie Lin jackie@localhost';
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const ZIP = arg('--zip'), LIMIT = +(arg('--limit') ?? 0), ONLY = arg('--only')?.split(',');
const MAX_SHRINK = 0.3, YEARS = 6;
const t0 = Date.now();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const H = { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' };
fs.mkdirSync(path.join(DIR, 'c'), { recursive: true });

async function get(url: string, tries = 4): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(60000) });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      console.warn(url, r.status);
    } catch (e) { console.warn(url, String(e)); }
    await sleep(2000 * 2 ** i);
  }
  throw new Error('failed ' + url);
}

// ---------- 1. listings ----------
const EXCH: Record<string, string> = { Nasdaq: 'Nasdaq', NYSE: 'NYSE', CBOE: 'Cboe', TXSE: 'TXSE' };
const cte = await get('https://www.sec.gov/files/company_tickers_exchange.json');
type Row = { cik: number; name: string; ticker: string; exch: string };
let rows: Row[] = cte.data.filter((r: any[]) => r[2] && EXCH[r[3]]).map((r: any[]) => ({ cik: r[0], name: r[1], ticker: String(r[2]).toUpperCase(), exch: EXCH[r[3]] }));
const byCik = new Map<number, Row[]>();
for (const r of rows) byCik.set(r.cik, [...(byCik.get(r.cik) ?? []), r]);
const SUFFIX = /^-?(P[A-Z]?|W[ST]?|WS-?[A-Z]?|U[N]?|R[T]?)$/; // preferred, warrant, unit, right
rows = rows.filter(r => !(byCik.get(r.cik)!.some(o => o !== r && r.ticker.startsWith(o.ticker) && SUFFIX.test(r.ticker.slice(o.ticker.length)))));
// SPAC-style unit/warrant/right tickers whose base isn't listed under the same CIK
rows = rows.filter(r => !/-(P[A-Z]|WS|UN|RT|U|W|R)$/.test(r.ticker));
if (ONLY) rows = rows.filter(r => ONLY.includes(r.ticker));
if (LIMIT) rows = rows.slice(0, LIMIT);
const ciks = [...new Set(rows.map(r => r.cik))];
console.log(`listings: ${cte.data.length} SEC rows -> ${rows.length} exchange-listed tickers, ${ciks.length} companies`);

// ---------- previous run (keep-last-good + shrink guard) ----------
const prevIdx = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'universe.json'), 'utf8')); } catch { return null; } })();
const prevStatus = new Map<number, [number, string]>();
for (const r of prevIdx?.rows ?? []) prevStatus.set(r[3], [r[4], r[5]]);

// ---------- 2. financials ----------
function unzipOne(name: string): Promise<string | null> {
  return new Promise(res => {
    const p = spawn('unzip', ['-p', ZIP!, name]); const chunks: Buffer[] = [];
    p.stdout.on('data', c => chunks.push(c)); p.on('close', code => res(code === 0 && chunks.length ? Buffer.concat(chunks).toString('utf8') : null)); p.on('error', () => res(null));
  });
}
let inZip: Set<string> | null = null;
if (ZIP) {
  inZip = await new Promise<Set<string>>(res => {
    const p = spawn('unzip', ['-Z1', ZIP]); let s = '';
    p.stdout.on('data', c => (s += c)); p.on('close', () => res(new Set(s.split('\n').filter(Boolean))));
  });
  console.log('zip entries:', inZip.size);
}
const stats = { secRows: cte.data.length, tickers: rows.length, companies: ciks.length, chart: 0, noRevenue: 0, noXbrl: 0, unsupported: 0, noReports: 0, ifrs: 0, nonUsd: 0, annualOnly: 0, stale: 0, keptLastGood: 0, bytes: 0, seconds: 0 };
const status = new Map<number, [number, string]>(); // cik -> [status, latest period end]
const staleCut = new Date(Date.now() - 548 * 864e5).toISOString().slice(0, 10); // ~18 months

async function one(cik: number) {
  const name = `CIK${String(cik).padStart(10, '0')}.json`;
  let raw: any = null;
  try {
    if (ZIP) { if (inZip!.has(name)) { const s = await unzipOne(name); raw = s ? JSON.parse(s) : null; } }
    else { await sleep(200); raw = await get(`https://data.sec.gov/api/xbrl/companyfacts/${name}`); }
  } catch (e) { console.warn(cik, String(e)); raw = undefined; }
  const file = path.join(DIR, 'c', `${cik}.json`);
  if (raw === undefined) { // fetch/parse failure: keep last good
    const p = prevStatus.get(cik); if (p && fs.existsSync(file)) { status.set(cik, p); stats.keptLastGood++; return; }
    status.set(cik, [ST.noXbrl, '']); stats.noXbrl++; return;
  }
  if (!raw || !raw.facts || !Object.keys(raw.facts).length) { status.set(cik, [ST.noXbrl, '']); stats.noXbrl++; if (fs.existsSync(file)) fs.rmSync(file); return; }
  let c: Company;
  try { c = normalize(raw, byCik.get(cik)![0].ticker); } catch (e) { console.warn('normalize', cik, String(e)); status.set(cik, [ST.unsupported, '']); stats.unsupported++; return; }
  // keep the last YEARS fiscal years
  const maxFy = Math.max(0, ...c.periods.map(p => p.fy));
  c.periods = c.periods.filter(p => p.fy > maxFy - YEARS);
  const withRev = c.periods.filter(p => p.items.revenue && p.items.revenue.v > 0);
  const charted = withRev.filter(p => { const f = buildFlow(p); return f && (f.nodes.some(n => ['op', 'pretax', 'ni'].includes(n.id)) || f.below.some(n => n.id === 'ni')); });
  const latest = (charted.length ? charted : c.periods).at(-1);
  let st: number;
  if (!c.periods.length) st = ST.unsupported;
  else if (!charted.length) st = withRev.length ? ST.unsupported : ST.noRevenue;
  else st = ST.chart;
  if (!c.periods.length) { status.set(cik, [ST.noReports, '']); stats.noReports++; if (fs.existsSync(file)) fs.rmSync(file); return; }
  const json = JSON.stringify(pack(c));
  fs.writeFileSync(file, json); stats.bytes += json.length;
  status.set(cik, [st, latest?.end ?? '']);
  if (st === ST.chart) stats.chart++; else if (st === ST.noRevenue) stats.noRevenue++; else stats.unsupported++;
  if (c.gaap === 'IFRS') stats.ifrs++;
  if (c.currency !== 'USD') stats.nonUsd++;
  if (st === ST.chart && !charted.some(p => p.fp !== 'FY')) stats.annualOnly++;
  if (latest && latest.end < staleCut) stats.stale++;
}
let i = 0, done = 0;
const N = ZIP ? 6 : 1;
await Promise.all(Array.from({ length: N }, async () => {
  while (i < ciks.length) { await one(ciks[i++]); if (++done % 500 === 0) console.log(`${done}/${ciks.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
}));

// ---------- 3. index + guard ----------
const out = rows.map(r => { const [s, end] = status.get(r.cik) ?? [ST.noXbrl, '']; return [r.ticker, r.name, r.exch, r.cik, s, end]; });
out.sort((a, b) => (a[0] as string).localeCompare(b[0] as string));
const prevChart = prevIdx?.stats?.chart ?? 0;
stats.seconds = Math.round((Date.now() - t0) / 1000);
console.log(JSON.stringify(stats));
if (!ONLY && !LIMIT && prevChart && stats.chart < prevChart * (1 - MAX_SHRINK)) {
  console.error(`ABORT: companies with charts would shrink from ${prevChart} to ${stats.chart} (> ${MAX_SHRINK * 100}%). Keeping last good index.`);
  process.exit(1);
}
const minChart = +(process.env.MIN_CHART ?? 0);
if (stats.chart < minChart) { console.error(`ABORT: only ${stats.chart} charts (< ${minChart})`); process.exit(1); }
// drop company files no longer referenced
const live = new Set(out.map(r => `${r[3]}.json`));
if (!ONLY && !LIMIT) for (const f of fs.readdirSync(path.join(DIR, 'c'))) if (!live.has(f)) fs.rmSync(path.join(DIR, 'c', f));
const updated = new Date().toISOString();
fs.writeFileSync(path.join(DIR, 'universe.json'), JSON.stringify({ updated, stats, fields: ['ticker', 'name', 'exchange', 'cik', 'status', 'latestEnd'], rows: out }));
fs.writeFileSync(path.join(DIR, 'universe-stats.json'), JSON.stringify({ updated, ...stats }, null, 1));
