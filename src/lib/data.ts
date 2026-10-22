import { normalize, type Company } from './normalize';
import { unpack, ST } from './compact';
export const settings = {
  get workerUrl() { return (localStorage.getItem('ef.worker') || '').replace(/\/+$/, ''); },
  set workerUrl(v: string) { localStorage.setItem('ef.worker', v.trim()); },
  get finnhub() { return localStorage.getItem('ef.finnhub') || ''; },
  set finnhub(v: string) { localStorage.setItem('ef.finnhub', v.trim()); },
};
export type IndexEntry = { ticker: string; name: string; cik: number; latest?: string };
export type TickerRow = [string, number, string];
const BASE = './data/';
export async function loadIndex(): Promise<{ updated: string; companies: IndexEntry[] }> { return (await fetch(BASE + 'index.json')).json(); }
let tickCache: TickerRow[] | null = null;
export async function loadTickers(): Promise<TickerRow[]> {
  if (!tickCache) tickCache = await (await fetch(BASE + 'tickers.json')).json();
  return tickCache!;
}
/** Full-universe search index: [ticker, name, exchange, cik, status, latestEnd] */
export type URow = [string, string, string, number, number, string];
export type Universe = { updated: string; rows: URow[]; stats?: Record<string, number> };
let uniCache: Promise<Universe | null> | null = null;
export function loadUniverse(): Promise<Universe | null> {
  if (!uniCache) uniCache = fetch(BASE + 'universe.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
  return uniCache;
}
/** Ticker matching that ignores punctuation, so BRK.B, BRK/B and BRK-B all find BRK-B. */
export const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export function searchRows(rows: URow[], q: string, boost: Set<string>, n = 8): URow[] {
  const s = q.trim().toUpperCase(), sq = squash(s); if (!sq) return [];
  const words = s.split(/\s+/).filter(Boolean);
  const scored: [number, URow][] = [];
  for (const r of rows) {
    const t = squash(r[0]), name = r[1].toUpperCase();
    let sc = -1;
    if (t === sq) sc = 100; else if (t.startsWith(sq)) sc = 80 - t.length;
    else if (name.startsWith(s)) sc = 60; else if (words.every(w => name.includes(w))) sc = 40;
    if (sc < 0) continue;
    if (r[4] === ST.chart) sc += 5; if (boost.has(r[0])) sc += 3;
    scored.push([sc, r]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1][0].length - b[1][0].length).slice(0, n).map(x => x[1]);
}
export const STATUS_TEXT: Record<number, string> = {
  [ST.noRevenue]: 'reports no revenue in its SEC financial data (common for pre-revenue biotechs, SPACs and holding companies), so there is no revenue flow to draw.',
  [ST.noXbrl]: 'has no machine-readable financial statements in SEC EDGAR (common for banks that file reports with bank regulators instead of the SEC, funds and trusts, and some foreign companies), so a chart is not available.',
  [ST.noReports]: 'has no annual or quarterly report (10-K, 10-Q, 20-F or 40-F) with financial data at the SEC yet (common for recent IPOs and closed-end funds), so a chart is not available.',
  [ST.unsupported]: 'files with SEC, but its income statement uses a layout this app cannot chart reliably (for example some banks, insurers, or foreign filers without a revenue total), so a chart is not available.',
};
export type Loaded = { company: Company; via: 'static' | 'worker' | 'universe' };
export async function loadCompany(ticker: string, cik: number | undefined, bundled: boolean, row?: URow): Promise<Loaded> {
  if (row && (row[4] === ST.chart || row[4] === ST.noRevenue)) {
    try {
      const r = await fetch(`${BASE}c/${row[3]}.json`);
      if (r.ok) return { company: unpack(await r.json(), ticker), via: 'universe' };
    } catch { /* offline and not cached: try bundled/proxy */ }
  }
  const w = settings.workerUrl;
  if (w && cik) {
    try {
      const r = await fetch(`${w}/companyfacts/CIK${String(cik).padStart(10, '0')}.json`);
      if (r.ok) return { company: normalize(await r.json(), ticker), via: 'worker' };
    } catch { /* fall back */ }
  }
  if (bundled) return { company: await (await fetch(`${BASE}${ticker}.json`)).json(), via: 'static' };
  if (row && row[4] !== ST.chart && row[4] !== ST.noRevenue) throw new Error('STATUS:' + row[4]);
  if (row) throw new Error('OFFLINE');
  throw new Error(w ? 'The data proxy could not load this company.' : 'NOPROXY');
}
export type EpsRow = { actual: number | null; estimate: number | null; period: string; quarter: number; year: number; surprisePercent: number | null };
export async function loadEarnings(ticker: string): Promise<EpsRow[] | null> {
  const k = settings.finnhub; if (!k) return null;
  const r = await fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(k)}`);
  if (!r.ok) throw new Error('Finnhub error ' + r.status);
  return r.json();
}

/** User's saved tickers (home screen list). */
export const myList = {
  get(): string[] { try { return JSON.parse(localStorage.getItem('ef.list') || '[]'); } catch { return []; } },
  set(v: string[]) { localStorage.setItem('ef.list', JSON.stringify(v)); },
};
