import { useEffect, useMemo, useRef, useState } from 'react';
import { sankey, type SankeyNode, type SankeyLink } from 'd3-sankey';
import type { Flow, FNode, FLink } from './lib/flow';
import { money, pct } from './lib/format';

type N = SankeyNode<FNode, FLink>; type L = SankeyLink<FNode, FLink>;
export const COLORS: Record<string, { node: string; link: string; text: string }> = {
  rev: { node: '#1e293b', link: '#e2e8f0', text: '#0f172a' },
  profit: { node: '#16a34a', link: '#bbf7d0', text: '#15803d' },
  cost: { node: '#e11d48', link: '#fecdd3', text: '#be123c' },
  loss: { node: '#991b1b', link: '#fca5a5', text: '#991b1b' },
  gain: { node: '#2563eb', link: '#bfdbfe', text: '#1d4ed8' },
  seg: { node: '#64748b', link: '#e2e8f0', text: '#334155' },
};
const SHORT: Record<string, string> = { revenue: 'Revenue', cogs: 'Cost of rev.', gp: 'Gross profit', opex: 'Op. costs', rd: 'R&D', sga: 'SG&A', otherOpex: 'Other opex', op: 'Op. income', nonop: 'Other inc.', pretax: 'Pre-tax', tax: 'Tax', ni: 'Net income', otherBelow: 'Other', prov: 'Provision', nie: 'Non-int. exp.', opLoss: 'Op. loss', ptLoss: 'Pre-tax loss', taxb: 'Tax benefit', otherGain: 'Other gains' };
const RANK: Record<string, number> = { profit: 0, gain: 1, rev: 2, seg: 2, cost: 3, loss: 4 };

export function Chart({ flow, revenue, pro, yoy, onPick, selected }: {
  flow: Flow; revenue: number; pro: boolean; yoy: Record<string, number | null> | null;
  onPick: (id: string, kind: 'node' | 'link', link?: FLink) => void; selected: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const ro = new ResizeObserver(e => setW(Math.round(e[0].contentRect.width)));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const vertical = false; // horizontal everywhere; narrow screens scroll sideways
  const compact = w < 600;
  const cw = w;
  const H = compact ? 470 : Math.max(440, Math.min(600, cw * 0.48));
  const pad = vertical ? { a0: 46, a1: 70, b0: 6, b1: 6 } : { a0: 6, a1: compact ? 66 : 150, b0: 14, b1: 14 };
  const L = vertical ? H : cw, B = vertical ? w : H;
  const layout = useMemo(() => {
    const nodes = flow.nodes.map(n => ({ ...n }));
    const links = flow.links.map(l => ({ ...l }));
    const gen = sankey<FNode, FLink>()
      .nodeId(d => d.id)
      .nodeWidth(compact ? 8 : 12)
      .nodePadding(compact ? 30 : 44)
      .nodeAlign((n: any) => n.targetLinks.length === 0 && n.id !== 'revenue' ? Math.max(0, Math.min(...n.sourceLinks.map((l: any) => l.target.depth)) - 1) : n.depth)
      .nodeSort((a, b) => ((a.id === 'nonop' && a.kind === 'cost' ? 5 : RANK[a.kind]) - (b.id === 'nonop' && b.kind === 'cost' ? 5 : RANK[b.kind])) || (b.value! - a.value!))
      .linkSort((a: any, b: any) => (RANK[a.target.kind] - RANK[b.target.kind]) || (RANK[a.source.kind] - RANK[b.source.kind]))
      .extent([[pad.a0, pad.b0], [L - pad.a1, B - pad.b1]]);
    return gen({ nodes, links });
  }, [flow, w, vertical, L, B, compact]);
  const P = (a: number, b: number) => (vertical ? `${b},${a}` : `${a},${b}`);
  const ribbon = (l: L) => {
    const s = l.source as N, t = l.target as N, wd = l.width!;
    const a0 = s.x1!, a1 = t.x0!, am = (a0 + a1) / 2, b0 = l.y0! - wd / 2, b1 = l.y1! - wd / 2;
    return `M${P(a0, b0)}C${P(am, b0)} ${P(am, b1)} ${P(a1, b1)}L${P(a1, b1 + wd)}C${P(am, b1 + wd)} ${P(am, b0 + wd)} ${P(a0, b0 + wd)}Z`;
  };
  const label = (n: N) => {
    const terminal = n.sourceLinks!.length === 0;
    const name = compact ? (SHORT[n.id] ?? n.label) : n.label;
    const amt = money(n.signed);
    const sub = pro ? `${pct(n.value! / revenue)} of rev${n.derived ? ' · derived' : ''}` : n.simple;
    const ch = yoy ? yoy[n.id] : undefined;
    return { terminal, name, amt, sub, ch };
  };
  const good = (n: N, c: number) => (n.kind === 'cost' || n.kind === 'loss' ? c < 0 : c > 0);
  return (
    <div ref={wrap} className="chartwrap">
      
      <svg width={cw} height={vertical ? L : B} role="img" aria-label="Income flow chart">
        <g>
          {layout.links.map((l, i) => {
            const s = l.source as N, t = l.target as N; const id = `${s.id}->${t.id}`;
            const k = t.kind === 'gain' ? 'gain' : (l.kind);
            return <path key={i} d={ribbon(l)} fill={COLORS[k].link} opacity={selected && selected !== id && selected !== s.id && selected !== t.id ? 0.35 : 0.9}
              className="ribbon" onClick={() => onPick(id, 'link', { source: s.id, target: t.id, value: l.value, kind: l.kind })} />;
          })}
        </g>
        {layout.nodes.map(n => {
          const x0 = n.x0!, x1 = n.x1!, y0 = n.y0!, y1 = n.y1!;
          const r = vertical ? { x: y0, y: x0, width: Math.max(1.5, y1 - y0), height: x1 - x0 } : { x: x0, y: y0, width: x1 - x0, height: Math.max(1.5, y1 - y0) };
          const lb = label(n); const c = COLORS[n.kind];
          const hit = vertical ? { x: r.x - 4, y: r.y - 16, width: r.width + 8, height: r.height + 32 } : { x: r.x - 14, y: r.y - 4, width: r.width + 28, height: r.height + 8 };
          // label placement
          let tx: number, ty: number, anchor: 'start' | 'middle' | 'end' = 'start';
          const mid = (y0 + y1) / 2;
          tx = x1 + (compact ? 3 : 6); ty = Math.max(12, Math.min(B - 30, mid - (compact ? 4 : 10)));
          const chEl = lb.ch != null && isFinite(lb.ch) ? <tspan className={good(n, lb.ch) ? 'up' : 'down'}> {lb.ch >= 0 ? '▲' : '▼'}{Math.abs(lb.ch * 100).toFixed(0)}%</tspan> : null;
          const small = compact || w < 900;
          return (
            <g key={n.id} className={(compact ? 'node c' : 'node') + (selected === n.id ? ' sel' : '')} onClick={() => onPick(n.id, 'node')}>
              <rect {...hit} fill="transparent" />
              <rect {...r} rx={2} fill={c.node} />
              <text x={tx} y={ty} textAnchor={anchor} className="lbl" paintOrder="stroke" stroke="#fff" strokeWidth={3.5} strokeLinejoin="round">
                <tspan x={tx} dy="0" fill={c.text} className="l1">{lb.name}</tspan>
                <tspan x={tx} dy={compact ? 11 : 13} fill={c.text} className="l2">{lb.amt}{!compact && chEl}</tspan>
                {compact && chEl && <tspan x={tx} dy={11} className="l2">{chEl}</tspan>}
                {lb.sub && !small && <tspan x={tx} dy="12" className="l3">{lb.sub}</tspan>}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
