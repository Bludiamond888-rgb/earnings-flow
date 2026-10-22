import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { normalize, yoyOf } from '../src/lib/normalize';
import { buildFlow } from '../src/lib/flow';
const fx = (t: string) => JSON.parse(fs.readFileSync(`fixtures/${t}.json`, 'utf8'));
const M = 1e6;

describe('TSLA (real SEC fixture)', () => {
  const c = normalize(fx('TSLA'), 'TSLA');
  const q = (k: string) => c.periods.find(p => p.key === k)!;
  it('reads Q2 FY2026 10-Q values with the right tags', () => {
    const p = q('FY2026Q2');
    expect(p.end).toBe('2026-06-30'); expect(p.form).toBe('10-Q');
    expect(p.items.revenue).toMatchObject({ v: 28236 * M, tag: 'Revenues' });
    expect(p.items.cogs!.v).toBe(23485 * M);
    expect(p.items.grossProfit!.v).toBe(4751 * M);
    expect(p.items.rd!.v).toBe(2371 * M); expect(p.items.sga!.v).toBe(1982 * M);
    expect(p.items.opIncome!.v).toBe(398 * M); expect(p.items.netIncome!.v).toBe(1114 * M);
  });
  it('derives Q4 = FY − (Q1+Q2+Q3) and flags it', () => {
    const p = q('FY2025Q4'); const fy = q('FY2025');
    const sum = ['FY2025Q1', 'FY2025Q2', 'FY2025Q3'].reduce((s, k) => s + q(k).items.revenue!.v, 0);
    expect(p.items.revenue!.v).toBe(fy.items.revenue!.v - sum);
    expect(p.items.revenue!.v).toBe(24901 * M);
    expect(p.items.revenue!.derived).toBe(true);
    expect(p.items.eps).toBeUndefined(); // EPS is not additive, never derived
    expect(p.start).toBe('2025-10-01');
  });
  it('finds the same quarter one year earlier', () => { expect(yoyOf(c, q('FY2026Q2'))!.key).toBe('FY2025Q2'); });
  it('builds a balanced flow', () => {
    const f = buildFlow(q('FY2026Q2'))!;
    for (const n of f.nodes) {
      const i = f.links.filter(l => l.target === n.id).reduce((s, l) => s + l.value, 0);
      const o = f.links.filter(l => l.source === n.id).reduce((s, l) => s + l.value, 0);
      if (i && o) expect(Math.abs(i - o)).toBeLessThan(1e6);
    }
    expect(f.nodes.find(n => n.id === 'ni')!.value).toBe(1114 * M);
  });
});

describe('fallback tags', () => {
  it('AAPL uses RevenueFromContractWithCustomerExcludingAssessedTax and CostOfGoodsAndServicesSold', () => {
    const c = normalize(fx('AAPL'), 'AAPL'); const p = c.periods.filter(p => p.fp !== 'FY').at(-1)!;
    expect(p.items.revenue!.tag).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(p.items.cogs!.tag).toBe('CostOfGoodsAndServicesSold');
  });
  it('GOOGL SG&A is derived from S&M + G&A when no SG&A tag', () => {
    const c = normalize(fx('GOOGL'), 'GOOGL'); const p = c.periods.filter(p => p.fp !== 'FY').at(-1)!;
    expect(p.items.sga!.derived).toBe(true);
    expect(p.items.sga!.tag).toContain('SellingAndMarketingExpense');
  });
  it('JPM (bank): no COGS, flow skips that node and uses pre-tax income', () => {
    const c = normalize(fx('JPM'), 'JPM'); const p = c.periods.filter(p => p.fp !== 'FY').at(-1)!;
    expect(p.items.cogs).toBeUndefined(); expect(p.items.grossProfit).toBeUndefined();
    const f = buildFlow(p)!;
    expect(f.nodes.some(n => n.id === 'cogs')).toBe(false);
    expect(f.nodes.some(n => n.id === 'pretax')).toBe(true);
    expect(f.notes.join(' ')).toMatch(/cost-of-revenue/);
  });
  it('XOM: no 10-K annual facts, fiscal year inferred, no crash', () => {
    const c = normalize(fx('XOM'), 'XOM'); expect(c.periods.length).toBeGreaterThan(0);
    expect(c.periods.at(-1)!.key).toBe('FY2026Q2');
  });
});

describe('missing tags (synthetic, built from TSLA facts)', () => {
  it('computes gross profit from revenue − cost when GrossProfit is missing', () => {
    const raw = fx('TSLA'); delete raw.facts['us-gaap'].GrossProfit;
    const p = normalize(raw, 'TSLA').periods.find(p => p.key === 'FY2026Q2')!;
    expect(p.items.grossProfit).toMatchObject({ v: 4751 * M, derived: true });
  });
  it('omits items whose tags are absent rather than inventing them', () => {
    const raw = fx('TSLA'); delete raw.facts['us-gaap'].ResearchAndDevelopmentExpense; delete raw.facts['us-gaap'].IncomeTaxExpenseBenefit;
    const p = normalize(raw, 'TSLA').periods.find(p => p.key === 'FY2026Q2')!;
    expect(p.items.rd).toBeUndefined(); expect(p.items.tax).toBeUndefined();
    const f = buildFlow(p)!; expect(f.nodes.some(n => n.id === 'rd')).toBe(false);
  });
  it('shows an operating loss as a red loss node', () => {
    const raw = fx('TSLA');
    for (const f of raw.facts['us-gaap'].OperatingIncomeLoss.units.USD) if (f.end === '2026-06-30' && f.start === '2026-04-01') f.val = -500 * M;
    const p = normalize(raw, 'TSLA').periods.find(p => p.key === 'FY2026Q2')!;
    const fl = buildFlow(p)!;
    expect(fl.nodes.find(n => n.id === 'opLoss')).toMatchObject({ kind: 'loss', value: 500 * M });
    expect(fl.below.find(n => n.id === 'ni')).toBeTruthy();
  });
});

describe('every bundled company builds a balanced chart for its latest quarter', () => {
  const idx = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8')).companies;
  for (const e of idx) it(e.ticker, () => {
    const c = JSON.parse(fs.readFileSync(`public/data/${e.ticker}.json`, 'utf8'));
    const p = c.periods.filter((p: any) => p.fp !== 'FY' && p.items.revenue).at(-1);
    if (!p) return;
    const f = buildFlow(p)!; expect(f).toBeTruthy();
    for (const n of f.nodes) {
      const i = f.links.filter(l => l.target === n.id).reduce((s, l) => s + l.value, 0);
      const o = f.links.filter(l => l.source === n.id).reduce((s, l) => s + l.value, 0);
      if (i && o) expect(Math.abs(i - o) / i).toBeLessThan(0.01);
    }
  });
});
