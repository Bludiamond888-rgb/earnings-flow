import { normalize, type Company } from './normalize';
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
export type Loaded = { company: Company; via: 'static' | 'worker' };
export async function loadCompany(ticker: string, cik: number | undefined, bundled: boolean): Promise<Loaded> {
  const w = settings.workerUrl;
  if (w && cik) {
    try {
      const r = await fetch(`${w}/companyfacts/CIK${String(cik).padStart(10, '0')}.json`);
      if (r.ok) return { company: normalize(await r.json(), ticker), via: 'worker' };
    } catch { /* fall back */ }
  }
  if (bundled) return { company: await (await fetch(`${BASE}${ticker}.json`)).json(), via: 'static' };
  throw new Error(w ? 'The data proxy could not load this company.' : 'NOPROXY');
}
export type EpsRow = { actual: number | null; estimate: number | null; period: string; quarter: number; year: number; surprisePercent: number | null };
export async function loadEarnings(ticker: string): Promise<EpsRow[] | null> {
  const k = settings.finnhub; if (!k) return null;
  const r = await fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(k)}`);
  if (!r.ok) throw new Error('Finnhub error ' + r.status);
  return r.json();
}
