import type { Period, ItemKey } from './normalize';
export type Kind = 'rev' | 'profit' | 'cost' | 'loss' | 'gain' | 'seg';
export type FNode = { id: string; label: string; simple: string; value: number; kind: Kind; item?: ItemKey; tag?: string; derived?: boolean; signed: number };
export type FLink = { source: string; target: string; value: number; kind: Kind };
export type Flow = { nodes: FNode[]; links: FLink[]; notes: string[]; below: FNode[] };

/** Build a balanced Sankey graph from one normalized period. Only reported or simply-derived values. */
export function buildFlow(p: Period): Flow | null {
  const it = p.items; const nodes: FNode[] = []; const links: FLink[] = []; const notes: string[] = []; const below: FNode[] = [];
  const rev = it.revenue?.v;
  if (!rev || rev <= 0) return null;
  const add = (n: Omit<FNode, 'signed'> & { signed?: number }) => { const x = { signed: n.value, ...n } as FNode; nodes.push(x); return x; };
  const link = (s: string, t: string, v: number, kind: Kind) => { if (v > 0) links.push({ source: s, target: t, value: v, kind }); };
  add({ id: 'revenue', label: 'Revenue', simple: 'Money in (sales)', value: rev, kind: 'rev', item: 'revenue', tag: it.revenue!.tag, derived: it.revenue!.derived });

  let top = 'revenue'; let topVal = rev;
  const gp = it.grossProfit?.v, cogs = it.cogs?.v;
  if (gp != null && cogs != null && cogs > 0) {
    add({ id: 'cogs', label: 'Cost of revenue', simple: 'Cost to make & deliver', value: cogs, kind: 'cost', item: 'cogs', tag: it.cogs!.tag, derived: it.cogs!.derived });
    link('revenue', 'cogs', cogs, 'cost');
    if (gp > 0) {
      add({ id: 'gp', label: 'Gross profit', simple: 'Left after making it', value: gp, kind: 'profit', item: 'grossProfit', tag: it.grossProfit!.tag, derived: it.grossProfit!.derived });
      link('revenue', 'gp', gp, 'profit'); top = 'gp'; topVal = gp;
    } else { notes.push('Gross loss: cost of revenue exceeded revenue.'); topVal = 0; }
  } else notes.push('No cost-of-revenue line reported (common for banks and some service companies), so that step is skipped.');

  const op = it.opIncome?.v;
  const preT = it.pretax?.v; const ni = it.netIncome?.v;
  // operating section
  let opexTotal: number | undefined;
  let opexDerived = true;
  if (op != null) opexTotal = topVal - op;
  else if (preT != null) opexTotal = topVal - preT; // banks: total costs before tax
  if (opexTotal != null && opexTotal > 0) {
    const banky = op == null && top === 'revenue'; const noOp = op == null;
    const parts: { id: string; label: string; simple: string; key?: ItemKey; v: number; tag?: string; derived?: boolean }[] = [];
    const pushP = (k: ItemKey, id: string, label: string, simple: string) => { const x = it[k]; if (x && x.v > 0) parts.push({ id, label, simple, key: k, v: x.v, tag: x.tag, derived: x.derived }); };
    if (banky) { pushP('provision', 'prov', 'Credit loss provision', 'Set aside for bad loans'); pushP('nonInterestExpense', 'nie', 'Non-interest expense', 'Salaries, offices, tech'); }
    else { pushP('rd', 'rd', 'R&D', 'Inventing new stuff'); pushP('sga', 'sga', 'SG&A', 'Sales, marketing & admin'); }
    let sum = parts.reduce((s, x) => s + x.v, 0);
    if (sum > opexTotal * 1.001) { // reported parts exceed derived total (other operating gains). Scale ribbons, say so.
      const k = opexTotal / sum; parts.forEach(x => (x.v *= k)); sum = opexTotal;
      notes.push('Reported expense lines exceed the derived total (other income or gains offset them); ribbons scaled to fit, amounts in details are as reported.');
    }
    const other = opexTotal - sum;
    if (other > opexTotal * 0.003) parts.push({ id: 'otherOpex', label: noOp ? 'Other costs, net' : 'Other operating expenses', simple: 'Everything else to run it', v: other, derived: true, tag: 'derived remainder' });
    const opLoss = op != null && op < 0 ? -op : 0;
    add({ id: 'opex', label: banky ? 'Total expenses' : noOp ? 'Expenses & other, net' : 'Operating expenses', simple: banky ? 'Costs to run the bank' : 'Costs to run the business', value: opexTotal, kind: 'cost', item: 'opexTotal', derived: opexDerived, tag: noOp ? (banky ? 'Revenue − pre-tax income' : 'Gross profit − pre-tax income') : top === 'gp' ? 'Gross profit − operating income' : 'Revenue − operating income' });
    link(top, 'opex', Math.min(topVal, opexTotal), 'cost');
    if (opLoss > 0) { add({ id: 'opLoss', label: 'Operating loss', simple: 'Spent more than it earned', value: opLoss, kind: 'loss', item: 'opIncome', tag: it.opIncome!.tag, signed: op! }); link('opLoss', 'opex', opLoss, 'loss'); }
    for (const x of parts) {
      const orig = x.key ? it[x.key]!.v : x.v;
      add({ id: x.id, label: x.label, simple: x.simple, value: x.v, kind: 'cost', item: x.key, tag: x.tag, derived: x.derived, signed: orig });
      link('opex', x.id, x.v, 'cost');
    }
  }
  const earn = op != null ? op : preT;
  if (earn == null) { notes.push('No operating or pre-tax income reported for this period.'); return { nodes, links, notes, below }; }
  const earnId = op != null ? 'op' : 'pretax';
  if (earn <= 0) {
    // loss case: chart ends at the operating loss; below-the-line items shown as a list
    if (ni != null) below.push({ id: 'ni', label: ni < 0 ? 'Net loss' : 'Net income', simple: ni < 0 ? 'Lost money overall' : 'Profit', value: Math.abs(ni), signed: ni, kind: ni < 0 ? 'loss' : 'profit', item: 'netIncome', tag: it.netIncome!.tag, derived: it.netIncome!.derived });
    if (op != null && preT != null) below.push({ id: 'nonop', label: 'Other income / interest, net', simple: 'Interest & side income', value: Math.abs(preT - op), signed: preT - op, kind: preT - op >= 0 ? 'gain' : 'cost', derived: true, tag: 'Pre-tax − operating income' });
    if (it.tax) below.push({ id: 'tax', label: 'Income tax', simple: 'Taxes', value: Math.abs(it.tax.v), signed: it.tax.v, kind: it.tax.v >= 0 ? 'cost' : 'gain', item: 'tax', tag: it.tax.tag });
    notes.push(op != null && op < 0 ? 'Operating loss: expenses exceeded gross profit (the red "Operating loss" bar is the shortfall).' : 'Loss before tax.');
    return { nodes, links, notes, below };
  }
  add({ id: earnId, label: op != null ? 'Operating income' : 'Pre-tax income', simple: op != null ? 'Profit from the core business' : 'Profit before tax', value: earn, kind: 'profit', item: op != null ? 'opIncome' : 'pretax', tag: (op != null ? it.opIncome : it.pretax)!.tag, derived: (op != null ? it.opIncome : it.pretax)!.derived });
  link(top, earnId, Math.min(earn, topVal), 'profit');
  if (ni == null) { notes.push('Net income not reported for this period.'); return { nodes, links, notes, below }; }

  // non-operating: op -> pretax
  let cur = earnId, curVal = earn;
  if (op != null && preT != null) {
    const non = preT - op;
    if (Math.abs(non) > 0) {
      if (non > 0) { add({ id: 'nonop', label: 'Other income & interest, net', simple: 'Interest & side income', value: non, kind: 'gain', derived: true, tag: 'Pre-tax − operating income', signed: non }); }
      if (preT > 0) {
        add({ id: 'pretax', label: 'Pre-tax income', simple: 'Profit before tax', value: preT, kind: 'profit', item: 'pretax', tag: it.pretax!.tag });
        link(earnId, 'pretax', Math.min(op, preT), 'profit'); if (non > 0) link('nonop', 'pretax', non, 'gain');
      }
      if (non < 0) { add({ id: 'nonop', label: 'Interest & other expense, net', simple: 'Interest & side costs', value: -non, kind: 'cost', derived: true, tag: 'Pre-tax − operating income', signed: non }); link(earnId, 'nonop', Math.min(-non, op), 'cost'); if (-non > op) { add({ id: 'ptLoss', label: 'Pre-tax loss', simple: 'Lost money before tax', value: -non - op, signed: preT, kind: 'loss', item: 'pretax', tag: it.pretax!.tag }); link('ptLoss', 'nonop', -non - op, 'loss'); } }
      if (preT <= 0) { if (ni != null) below.push({ id: 'ni', label: ni < 0 ? 'Net loss' : 'Net income', simple: '', value: Math.abs(ni), signed: ni, kind: ni < 0 ? 'loss' : 'profit', item: 'netIncome', tag: it.netIncome!.tag }); return { nodes, links, notes, below }; }
      cur = 'pretax'; curVal = preT;
    }
  }
  // tax + other (NCI, discontinued ops) -> net income
  const tax = it.tax?.v;
  if (ni <= 0) {
    if (tax != null && tax > 0) { add({ id: 'tax', label: 'Income tax', simple: 'Taxes paid', value: Math.min(tax, curVal), signed: tax, kind: 'cost', item: 'tax', tag: it.tax!.tag }); link(cur, 'tax', Math.min(tax, curVal), 'cost'); }
    below.push({ id: 'ni', label: 'Net loss', simple: 'Lost money overall', value: -ni, signed: ni, kind: 'loss', item: 'netIncome', tag: it.netIncome!.tag });
    notes.push('Net loss after tax and other items.');
    return { nodes, links, notes, below };
  }
  add({ id: 'ni', label: 'Net income', simple: 'Final profit (the bottom line)', value: ni, kind: 'profit', item: 'netIncome', tag: it.netIncome!.tag, derived: it.netIncome!.derived });
  let rest = curVal;
  if (tax != null && tax > 0) { const t = Math.min(tax, rest); add({ id: 'tax', label: 'Income tax', simple: 'Taxes', value: t, signed: tax, kind: 'cost', item: 'tax', tag: it.tax!.tag }); link(cur, 'tax', t, 'cost'); rest -= t; }
  if (tax != null && tax < 0) { add({ id: 'taxb', label: 'Tax benefit', simple: 'Tax refund/credit', value: -tax, signed: tax, kind: 'gain', item: 'tax', tag: it.tax!.tag }); link('taxb', 'ni', -tax, 'gain'); rest += 0; }
  const toNi = Math.min(rest, ni - (tax != null && tax < 0 ? -tax : 0));
  if (toNi > 0) link(cur, 'ni', toNi, 'profit');
  const gap = rest - toNi; // other deductions (NCI, discontinued ops, unclassified)
  if (gap > curVal * 0.002) { add({ id: 'otherBelow', label: 'Other items, net', simple: 'Minority interest & misc', value: gap, kind: 'cost', derived: true, tag: 'derived remainder' }); link(cur, 'otherBelow', gap, 'cost'); }
  const inNi = links.filter(l => l.target === 'ni').reduce((s, l) => s + l.value, 0);
  if (ni - inNi > ni * 0.002) { add({ id: 'otherGain', label: 'Other gains, net', simple: 'Extra items added', value: ni - inNi, kind: 'gain', derived: true, tag: 'derived remainder' }); link('otherGain', 'ni', ni - inNi, 'gain'); }
  if (op == null || preT == null) { if (op != null && preT == null) notes.push('Pre-tax income not reported; non-operating items folded into "Other".'); }
  return { nodes, links, notes, below };
}
