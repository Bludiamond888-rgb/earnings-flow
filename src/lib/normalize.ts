// Normalize SEC XBRL companyfacts into Earnings Flow's compact format. Never invents numbers:
// every value is either reported (with its us-gaap tag) or derived by simple arithmetic (flagged).
export type Item = { v: number; tag: string; derived?: boolean };
export type ItemKey =
  | 'revenue' | 'cogs' | 'grossProfit' | 'rd' | 'sga' | 'opexTotal' | 'opIncome'
  | 'interestExpense' | 'interestIncome' | 'pretax' | 'tax' | 'netIncome' | 'eps'
  | 'nonInterestExpense' | 'provision';
export type Period = {
  key: string; // e.g. FY2025Q2 / FY2025
  fy: number; fp: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'FY';
  start: string; end: string;
  form: string; filed: string; accn: string;
  items: Partial<Record<ItemKey, Item>>;
};
export type Company = { ticker: string; name: string; cik: number; updated: string; periods: Period[]; currency?: string; gaap?: 'US GAAP' | 'IFRS' };

type Fact = { start?: string; end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string; frame?: string };

export const TAGS: Record<Exclude<ItemKey, 'grossProfit'> | 'grossProfit', string[]> = {
  revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'RevenuesNetOfInterestExpense', 'SalesRevenueGoodsNet', 'GrossInvestmentIncomeOperating'],
  cogs: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization', 'CostOfServices'],
  grossProfit: ['GrossProfit'],
  rd: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost', 'TechnologyAndDevelopmentExpense'],
  sga: ['SellingGeneralAndAdministrativeExpense'],
  opexTotal: ['OperatingExpenses', 'CostsAndExpenses'],
  opIncome: ['OperatingIncomeLoss'],
  interestExpense: ['InterestExpenseNonoperating', 'InterestExpense', 'InterestExpenseDebt'],
  interestIncome: ['InvestmentIncomeInterest', 'InvestmentIncomeInterestAndDividend', 'InterestIncomeOther'],
  pretax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic'],
  tax: ['IncomeTaxExpenseBenefit'],
  netIncome: ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'],
  eps: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'],
  nonInterestExpense: ['NoninterestExpense'],
  provision: ['ProvisionForLoanLeaseAndOtherLosses', 'ProvisionForLoanAndLeaseLosses', 'ProvisionForCreditLossesNet'],
};
const EXTRA = ['SellingAndMarketingExpense', 'GeneralAndAdministrativeExpense', 'MarketingAndAdvertisingExpense', 'InterestIncomeExpenseNet', 'NoninterestIncome', 'InterestAndDividendIncomeOperating', 'BenefitsLossesAndExpenses'];
/** IFRS (foreign private issuers filing 20-F/40-F). Mostly annual only; amounts in the reporting currency. */
export const IFRS_TAGS: Partial<Record<ItemKey, string[]>> = {
  revenue: ['Revenue', 'RevenueFromContractsWithCustomers', 'RevenueAndOperatingIncome'],
  cogs: ['CostOfSales'],
  grossProfit: ['GrossProfit'],
  rd: ['ResearchAndDevelopmentExpense'],
  sga: ['SellingGeneralAndAdministrativeExpense'],
  opIncome: ['ProfitLossFromOperatingActivities'],
  interestExpense: ['FinanceCosts'],
  interestIncome: ['FinanceIncome'],
  pretax: ['ProfitLossBeforeTax'],
  tax: ['IncomeTaxExpenseContinuingOperations'],
  netIncome: ['ProfitLossAttributableToOwnersOfParent', 'ProfitLoss'],
  eps: ['DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare', 'BasicAndDilutedEarningsLossPerShare'],
};
const IFRS_EXTRA = ['DistributionCosts', 'SellingExpense', 'AdministrativeExpense', 'InterestRevenueExpense'];

const days = (s: string, e: string) => (Date.parse(e) - Date.parse(s)) / 864e5;
const isQ = (f: Fact) => f.start && days(f.start, f.end) >= 80 && days(f.start, f.end) <= 100;
const isFY = (f: Fact) => f.start && days(f.start, f.end) >= 350 && days(f.start, f.end) <= 380;
const okForm = (f: Fact) => /^(10-[QK]|20-F|40-F)/.test(f.form);
const isAnnualForm = (form: string) => /^(10-K|20-F|40-F)/.test(form);

/** Map "start|end" -> latest-filed fact for one tag (10-Q/10-K only). */
function byPeriod(facts: any, ns: string, tag: string, cur: string): Map<string, Fact> {
  const m = new Map<string, Fact>();
  const units = facts?.[ns]?.[tag]?.units;
  if (!units) return m;
  const arr: Fact[] = units[cur] ?? units[cur + '/shares'] ?? [];
  for (const f of arr) {
    if (!f.start || !okForm(f)) continue;
    const k = f.start + '|' + f.end;
    const p = m.get(k);
    if (!p || f.filed > p.filed) m.set(k, f);
  }
  return m;
}

/** Count recent filing facts for the headline tags of a taxonomy, per currency unit. */
function scoreUnits(facts: any, ns: string, tags: readonly string[]): Map<string, number> {
  const sc = new Map<string, number>();
  for (const t of tags) for (const [u, arr] of Object.entries<any>(facts?.[ns]?.[t]?.units ?? {})) {
    if (u.includes('/')) continue;
    const n = (arr as Fact[]).filter(f => f.start && okForm(f) && f.end >= '2019').length;
    if (n) sc.set(u, (sc.get(u) ?? 0) + n);
  }
  return sc;
}
/** Pick the taxonomy (us-gaap vs IFRS) and reporting currency with the most recent 10-K/10-Q/20-F/40-F facts. */
export function chooseBasis(facts: any): { ns: 'us-gaap' | 'ifrs-full'; cur: string } | null {
  let best: { ns: 'us-gaap' | 'ifrs-full'; cur: string; n: number } | null = null;
  for (const [ns, tags] of [['us-gaap', [...TAGS.revenue, ...TAGS.netIncome]], ['ifrs-full', [...IFRS_TAGS.revenue!, ...IFRS_TAGS.netIncome!]]] as const)
    for (const [cur, n] of scoreUnits(facts, ns, tags)) if (!best || n > best.n) best = { ns, cur, n };
  return best && { ns: best.ns, cur: best.cur };
}

export function normalize(raw: any, ticker: string): Company {
  const facts = raw.facts ?? {};
  const basis = chooseBasis(facts) ?? { ns: 'us-gaap' as const, cur: 'USD' };
  const ifrs = basis.ns === 'ifrs-full';
  const T: Record<string, string[]> = ifrs ? { ...Object.fromEntries(Object.keys(TAGS).map(k => [k, []])), ...IFRS_TAGS } : TAGS;
  const maps: Record<string, Map<string, Fact>> = {};
  for (const t of [...Object.values(T).flat(), ...(ifrs ? IFRS_EXTRA : EXTRA)]) maps[t] = byPeriod(facts, basis.ns, t, basis.cur);

  // Period skeleton: any revenue or net income fact with quarterly/annual duration.
  const skel = new Map<string, Fact>();
  for (const t of [...T.revenue, ...T.netIncome, ...T.opIncome, ...(ifrs ? [] : ['InterestIncomeExpenseNet'])]) for (const [k, f] of maps[t]) {
    if (!(isQ(f) || isFY(f))) continue;
    const p = skel.get(k); if (!p || f.filed > p.filed) skel.set(k, f);
  }
  const annual = [...skel.values()].filter(isFY).sort((a, b) => a.end.localeCompare(b.end));
  // drop overlapping annual windows (e.g. trailing 12m) - keep those ending ~yearly from the latest 10-K FY ends
  const fyEnds = annual.filter(f => isAnnualForm(f.form) && f.fp === 'FY').map(f => f.end);
  let fyEndSet = [...new Set(fyEnds)].sort();
  if (!fyEndSet.length) {
    // No 10-K annual facts in companyfacts: infer fiscal year end from a Q1 10-Q fact (end + ~9 months), else Dec 31.
    const q1 = [...skel.values()].find(f => isQ(f) && f.fp === 'Q1' && f.form.startsWith('10-Q'));
    const base = q1 ? new Date(Date.parse(q1.end) + 274 * 864e5) : new Date(Date.UTC(2000, 11, 31));
    const md = base.toISOString().slice(4, 10);
    const years = [...new Set([...skel.values()].map(f => +f.end.slice(0, 4)))];
    fyEndSet = years.map(y => y + md).sort();
  }
  const fiscalOf = (end: string): { fy: number; q: number } | null => {
    // find first FY end >= end (within tolerance), extrapolating one year past the latest
    const cands = [...fyEndSet];
    if (cands.length) { const last = new Date(cands[cands.length - 1]); const nx = new Date(last); nx.setFullYear(last.getFullYear() + 1); cands.push(nx.toISOString().slice(0, 10)); }
    for (const fe of cands) {
      const d = days(end, fe);
      if (d >= -10) {
        if (d > 380) return null;
        const q = 4 - Math.round(d / 91.3);
        if (q < 1 || q > 4) return null;
        return { fy: +fe.slice(0, 4), q };
      }
    }
    return null;
  };

  const pick = (key: ItemKey, k: string): Item | undefined => {
    for (const t of T[key] ?? []) { const f = maps[t].get(k); if (f) return { v: f.val, tag: t }; }
    return undefined;
  };
  const periods: Period[] = [];
  const seen = new Set<string>();
  for (const f of [...skel.values()].sort((a, b) => a.end.localeCompare(b.end))) {
    const k = f.start + '|' + f.end;
    let fy: number, fp: Period['fp'];
    if (isFY(f)) { if (!fyEndSet.includes(f.end)) continue; fy = +f.end.slice(0, 4); fp = 'FY'; }
    else { const r = fiscalOf(f.end); if (!r) continue; fy = r.fy; fp = ('Q' + r.q) as Period['fp']; }
    const key = fp === 'FY' ? `FY${fy}` : `FY${fy}${fp}`;
    if (seen.has(key)) continue; seen.add(key);
    const items: Period['items'] = {};
    for (const ik of Object.keys(T) as ItemKey[]) { const it = pick(ik, k); if (it) items[ik] = it; }
    // filing source = latest filing among the used facts
    let src = f;
    for (const t of Object.values(T).flat()) { const g = maps[t].get(k); if (g && g.accn === f.accn) { src = g; break; } }
    periods.push({ key, fy, fp, start: f.start!, end: f.end, form: src.form, filed: src.filed, accn: src.accn, items });
  }
  // SG&A fallback: Selling & marketing + G&A
  for (const p of periods) {
    const k = p.start + '|' + p.end;
    if (ifrs) {
      const s = maps['DistributionCosts'].get(k) ?? maps['SellingExpense'].get(k), g = maps['AdministrativeExpense'].get(k);
      if (!p.items.sga && s && g) p.items.sga = { v: s.val + g.val, tag: 'DistributionCosts + AdministrativeExpense', derived: true };
      // banks: "revenue from contracts with customers" is only fee income, not total income -> don't chart it as revenue
      if (p.items.revenue?.tag === 'RevenueFromContractsWithCustomers' && maps['InterestRevenueExpense'].get(k)) delete p.items.revenue;
      continue;
    }
    // Banks often report no revenue total: net revenue = net interest income + non-interest income (standard bank presentation)
    // (ASC 606 "revenue from contracts with customers" at a bank is only fee income, so it is replaced too)
    const nii = maps['InterestIncomeExpenseNet'].get(k), non = maps['NoninterestIncome'].get(k);
    if (nii && (!p.items.revenue || p.items.revenue.tag.startsWith('RevenueFromContract'))) {
      if (non) p.items.revenue = { v: nii.val + non.val, tag: 'InterestIncomeExpenseNet + NoninterestIncome', derived: true };
      else delete p.items.revenue;
    }
    if (!p.items.sga) {
      const s = maps['SellingAndMarketingExpense'].get(k) ?? maps['MarketingAndAdvertisingExpense'].get(k), g = maps['GeneralAndAdministrativeExpense'].get(k);
      if (s && g) p.items.sga = { v: s.val + g.val, tag: 'SellingAndMarketingExpense + GeneralAndAdministrativeExpense', derived: true };
    }
  }
  // Q4 derivation: Q4 = FY - (Q1+Q2+Q3) for each item where all four are present.
  for (const fyP of periods.filter(p => p.fp === 'FY')) {
    const qs = (['Q1', 'Q2', 'Q3'] as const).map(q => periods.find(p => p.fy === fyP.fy && p.fp === q));
    if (qs.some(q => !q)) continue;
    let q4 = periods.find(p => p.fy === fyP.fy && p.fp === 'Q4');
    if (!q4) {
      q4 = { key: `FY${fyP.fy}Q4`, fy: fyP.fy, fp: 'Q4', start: dayAfter(qs[2]!.end), end: fyP.end, form: fyP.form, filed: fyP.filed, accn: fyP.accn, items: {} };
      periods.push(q4);
    }
    for (const ik of Object.keys(fyP.items) as ItemKey[]) {
      if (q4.items[ik] || ik === 'eps') continue; // EPS is not additive
      const a = fyP.items[ik]!; const parts = qs.map(q => q!.items[ik]);
      if (parts.some(x => !x)) continue;
      q4.items[ik] = { v: a.v - parts.reduce((s, x) => s + x!.v, 0), tag: a.tag, derived: true };
    }
  }
  for (const p of periods) {
    const it = p.items;
    if (!it.revenue && it.cogs && it.grossProfit && it.cogs.v > 0) it.revenue = { v: it.cogs.v + it.grossProfit.v, tag: 'CostOfRevenue + GrossProfit', derived: true };
    if (!it.grossProfit && it.revenue && it.cogs) it.grossProfit = { v: it.revenue.v - it.cogs.v, tag: 'Revenue − CostOfRevenue', derived: true };
    if (!it.cogs && it.revenue && it.grossProfit) it.cogs = { v: it.revenue.v - it.grossProfit.v, tag: 'Revenue − GrossProfit', derived: true };
  }
  periods.sort((a, b) => a.end.localeCompare(b.end) || (a.fp === 'FY' ? 1 : -1));
  const kept = periods.filter(p => p.items.revenue || p.items.netIncome);
  return { ticker: ticker.toUpperCase(), name: raw.entityName, cik: raw.cik, updated: new Date().toISOString().slice(0, 10), periods: kept, currency: basis.cur, gaap: ifrs ? 'IFRS' : 'US GAAP' };
}
function dayAfter(d: string) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

export function yoyOf(c: Company, p: Period): Period | undefined {
  return c.periods.find(x => x.fp === p.fp && x.fy === p.fy - 1);
}
