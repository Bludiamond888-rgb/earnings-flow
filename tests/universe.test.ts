import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { normalize } from '../src/lib/normalize';
import { buildFlow } from '../src/lib/flow';
import { pack, unpack, ST } from '../src/lib/compact';
import { searchRows, squash, type URow } from '../src/lib/data';
import { money, setCurrency } from '../src/lib/format';
const fx = (t: string) => JSON.parse(fs.readFileSync(`fixtures/${t}.json`, 'utf8'));
const M = 1e6;

describe('foreign filers (IFRS, 20-F, non-USD)', () => {
  it('SAP: IFRS in EUR, annual 20-F periods with full flow', () => {
    const c = normalize(fx('SAP'), 'SAP');
    expect(c.gaap).toBe('IFRS'); expect(c.currency).toBe('EUR');
    const p = c.periods.find(p => p.key === 'FY2025')!;
    expect(p.form).toBe('20-F');
    expect(p.items.revenue).toMatchObject({ v: 36800 * M, tag: 'Revenue' });
    expect(p.items.opIncome!.v).toBe(9617 * M);
    expect(c.periods.some(p => p.fp !== 'FY' && p.items.revenue)).toBe(false); // no quarterly XBRL from 6-Ks
    expect(buildFlow(p)!.nodes.map(n => n.id)).toContain('ni');
  });
  it('SNN: revenue derived from cost of sales + gross profit when no revenue total is tagged', () => {
    const p = normalize(fx('SNN'), 'SNN').periods.filter(p => p.fp === 'FY').at(-1)!;
    expect(p.items.revenue!.derived).toBe(true);
    expect(p.items.revenue!.v).toBe(p.items.cogs!.v + p.items.grossProfit!.v);
  });
  it('BCS: a bank\'s fee-only "revenue from contracts with customers" is not shown as total revenue', () => {
    const c = normalize(fx('BCS'), 'BCS');
    expect(c.currency).toBe('GBP');
    expect(c.periods.find(p => p.key === 'FY2025')!.items.revenue).toBeUndefined();
  });
});

describe('US banks', () => {
  it('PNC: revenue is reported or net interest + non-interest income, never fee-only', () => {
    const c = normalize(fx('PNC'), 'PNC');
    const p = c.periods.filter(p => p.fp !== 'FY').at(-1)!;
    expect(p.items.revenue!.tag).not.toMatch(/^RevenueFromContract/);
    expect(p.items.revenue!.v).toBeGreaterThan(p.items.pretax!.v);
    expect(buildFlow(p)!.nodes.map(n => n.id)).toEqual(expect.arrayContaining(['revenue', 'pretax', 'ni']));
  });
});

describe('compact per-company format', () => {
  it('round-trips losslessly', () => {
    for (const t of ['TSLA', 'JPM', 'SAP']) {
      const c = normalize(fx(t), t);
      const u = unpack(JSON.parse(JSON.stringify(pack(c))), t);
      expect(u).toEqual(c);
    }
  });
  it('is much smaller than the plain format', () => {
    const c = normalize(fx('AAPL'), 'AAPL');
    expect(JSON.stringify(pack(c)).length).toBeLessThan(JSON.stringify(c).length / 2);
  });
});

describe('search', () => {
  const rows: URow[] = [
    ['BRK-A', 'BERKSHIRE HATHAWAY INC', 'NYSE', 1067983, ST.chart, ''], ['BRK-B', 'BERKSHIRE HATHAWAY INC', 'NYSE', 1067983, ST.chart, ''],
    ['AAPL', 'Apple Inc.', 'Nasdaq', 320193, ST.chart, ''], ['APLE', 'Apple Hospitality REIT, Inc.', 'NYSE', 1418121, ST.chart, ''],
    ['MRNA', 'Moderna, Inc.', 'Nasdaq', 1682852, ST.chart, ''], ['A', 'Agilent Technologies', 'NYSE', 1090872, ST.chart, ''],
  ];
  it('finds share classes regardless of punctuation', () => { expect(searchRows(rows, 'brk.b', new Set())[0][0]).toBe('BRK-B'); expect(squash('BRK/B')).toBe('BRKB'); });
  it('exact ticker first, then name matches', () => {
    expect(searchRows(rows, 'a', new Set())[0][0]).toBe('A');
    expect(searchRows(rows, 'apple', new Set()).map(r => r[0])).toEqual(['AAPL', 'APLE']);
    expect(searchRows(rows, 'hathaway berk', new Set()).length).toBe(2);
  });
});

describe('currency formatting', () => {
  it('uses the reporting currency', () => { setCurrency('EUR'); expect(money(36.8e9)).toBe('€36.80B'); setCurrency('JPY'); expect(money(1.2e12)).toBe('¥1.20T'); setCurrency(); expect(money(5e6)).toBe('$5.0M'); });
});
