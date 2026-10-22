// Refresh bundled static data from SEC EDGAR. Usage: npx tsx scripts/refresh-data.ts [TICKER ...]
// SEC fair-access: descriptive User-Agent, <= 10 req/s (we do ~2/s).
import fs from 'node:fs';
import { normalize } from '../src/lib/normalize.ts';
const UA = process.env.SEC_USER_AGENT || 'EarningsFlow/1.0 Jackie Lin jackie@localhost';
export const STARTER = ['TSLA','AAPL','MSFT','NVDA','AMZN','GOOGL','META','NFLX','AMD','JPM','AVGO','COST','WMT','KO','PEP','DIS','INTC','ORCL','CRM','V','MA','UBER','PLTR','BAC','XOM','LLY','NKE','SBUX','MCD','HD'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function get(url: string) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
    if (r.ok) return r.json();
    console.warn(url, r.status); await sleep(2000 * (i + 1));
  }
  throw new Error('failed ' + url);
}
const out = 'public/data';
fs.mkdirSync(out, { recursive: true });
const tick: Record<string, { cik_str: number; ticker: string; title: string }> = await get('https://www.sec.gov/files/company_tickers.json');
const all = Object.values(tick);
fs.writeFileSync(`${out}/tickers.json`, JSON.stringify(all.map(t => [t.ticker, t.cik_str, t.title])));
const list = process.argv.slice(2).length ? process.argv.slice(2) : STARTER;
const prev = process.argv.slice(2).length && fs.existsSync(`${out}/index.json`) ? JSON.parse(fs.readFileSync(`${out}/index.json`, 'utf8')).companies : [];
const index: any[] = prev.filter((c: any) => !list.includes(c.ticker));
for (const t of list) {
  const row = all.find(x => x.ticker === t);
  if (!row) { console.warn('no CIK for', t); continue; }
  await sleep(500);
  const raw = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(row.cik_str).padStart(10, '0')}.json`);
  if (process.env.SAVE_FIXTURES) fs.writeFileSync(`fixtures/${t}.json`, JSON.stringify(raw));
  const c = normalize(raw, t);
  fs.writeFileSync(`${out}/${t}.json`, JSON.stringify(c));
  const last = c.periods.filter(p => p.fp !== 'FY').at(-1);
  index.push({ ticker: t, name: c.name, cik: c.cik, latest: last?.key, latestEnd: last?.end });
  console.log(t, c.periods.length, 'periods, latest', last?.key, last?.end);
}
index.sort((a, b) => STARTER.indexOf(a.ticker) - STARTER.indexOf(b.ticker));
fs.writeFileSync(`${out}/index.json`, JSON.stringify({ updated: new Date().toISOString(), companies: index }));
