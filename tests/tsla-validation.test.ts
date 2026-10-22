// Cross-check against the analyst's chart script /workspace/sankey.py (Tesla Q3 2026, from the press release).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { normalize } from '../src/lib/normalize';
const c = normalize(JSON.parse(fs.readFileSync('fixtures/TSLA.json', 'utf8')), 'TSLA');
const REF = { revenue: 28050e6, grossProfit: 5490e6, opIncome: 718e6, netIncome: 787e6, rd: 2760e6, sga: 2020e6 }; // sankey.py ($M, rounded)
describe('TSLA vs sankey.py', () => {
  const q3 = c.periods.find(p => p.key === 'FY2026Q3');
  it.skipIf(!q3)('Q3 FY2026 matches the reference within rounding', () => {
    for (const [k, v] of Object.entries(REF)) expect(Math.abs((q3!.items as any)[k].v - v) / v).toBeLessThan(0.01);
  });
  it('Q3 2026 10-Q is not in SEC XBRL yet (fixture fetched 2026-10-22)', () => { expect(q3).toBeUndefined(); });
  it('reference says revenue "≈ flat YoY": SEC Q3 FY2025 revenue is within 1% of $28.05B', () => {
    const prev = c.periods.find(p => p.key === 'FY2025Q3')!;
    expect(prev.items.revenue!.v).toBe(28095e6);
    expect(Math.abs(REF.revenue / prev.items.revenue!.v - 1)).toBeLessThan(0.01);
  });
});
