// Compact per-company file format for the full universe (c/<CIK>.json), ~5-10x smaller than Company JSON.
import type { Company, Item, ItemKey, Period } from './normalize';
/** Availability status in universe.json */
export const ST = { chart: 0, noRevenue: 1, noXbrl: 2, unsupported: 3, noReports: 4 } as const;
type PItem = [number, number] | [number, number, 1];
export type Packed = { v: 1; n: string; cik: number; u: string; cur: string; g: 'U' | 'I'; t: string[]; p: [string, string, string, string, string, string, Record<string, PItem>][] };

export function pack(c: Company): Packed {
  const tags: string[] = []; const ti = (t: string) => { let k = tags.indexOf(t); if (k < 0) { k = tags.length; tags.push(t); } return k; };
  return {
    v: 1, n: c.name, cik: c.cik, u: c.updated, cur: c.currency ?? 'USD', g: c.gaap === 'IFRS' ? 'I' : 'U', t: tags,
    p: c.periods.map(p => [p.key, p.start, p.end, p.form, p.filed, p.accn,
      Object.fromEntries(Object.entries(p.items).map(([k, it]) => [k, (it!.derived ? [it!.v, ti(it!.tag), 1] : [it!.v, ti(it!.tag)]) as PItem]))]),
  };
}
export function unpack(x: Packed, ticker: string): Company {
  const periods: Period[] = x.p.map(([key, start, end, form, filed, accn, its]) => {
    const m = /^FY(\d{4})(Q[1-4])?$/.exec(key)!;
    const items: Partial<Record<ItemKey, Item>> = {};
    for (const [k, a] of Object.entries(its)) items[k as ItemKey] = a[2] ? { v: a[0], tag: x.t[a[1]], derived: true } : { v: a[0], tag: x.t[a[1]] };
    return { key, fy: +m[1], fp: (m[2] ?? 'FY') as Period['fp'], start, end, form, filed, accn, items };
  });
  return { ticker, name: x.n, cik: x.cik, updated: x.u, periods, currency: x.cur, gaap: x.g === 'I' ? 'IFRS' : 'US GAAP' };
}
