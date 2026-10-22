import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Chart, COLORS } from './Chart';
import { buildFlow, type FLink, type FNode } from './lib/flow';
import { yoyOf, type Company, type Period } from './lib/normalize';
import { loadCompany, loadEarnings, loadIndex, loadTickers, settings, type EpsRow, type IndexEntry, type TickerRow } from './lib/data';
import { GLOSSARY } from './lib/glossary';
import { change, money, pct } from './lib/format';

const fpLabel = (p: Period) => (p.fp === 'FY' ? `FY${p.fy}` : `${p.fp} FY${p.fy}`);
const filingUrl = (c: Company, p: Period) => `https://www.sec.gov/Archives/edgar/data/${c.cik}/${p.accn.replace(/-/g, '')}/${p.accn}-index.htm`;

export default function App() {
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [updated, setUpdated] = useState('');
  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [ticker, setTicker] = useState(() => new URLSearchParams(location.search).get('t')?.toUpperCase() || localStorage.getItem('ef.last') || '');
  const [company, setCompany] = useState<Company | null>(null);
  const [via, setVia] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'Q' | 'FY'>('Q');
  const [pkey, setPkey] = useState('');
  const [yoy, setYoy] = useState(false);
  const [pro, setPro] = useState(() => localStorage.getItem('ef.pro') === '1');
  const [sel, setSel] = useState<{ id: string; kind: 'node' | 'link'; link?: FLink } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [eps, setEps] = useState<EpsRow[] | null>(null);
  const [epsErr, setEpsErr] = useState('');

  useEffect(() => { loadIndex().then(i => { setIndex(i.companies); setUpdated(i.updated); }); loadTickers().then(setTickers); }, []);
  useEffect(() => { localStorage.setItem('ef.pro', pro ? '1' : '0'); }, [pro]);
  useEffect(() => {
    if (!ticker || !tickers.length) return;
    const row = tickers.find(t => t[0] === ticker);
    const bundled = index.some(c => c.ticker === ticker);
    setLoading(true); setErr(''); setCompany(null); setSel(null); setEps(null); setEpsErr('');
    loadCompany(ticker, row?.[1], bundled)
      .then(r => { setCompany(r.company); setVia(r.via); localStorage.setItem('ef.last', ticker); setPkey(''); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
    loadEarnings(ticker).then(setEps).catch(e => setEpsErr(e.message));
  }, [ticker, tickers, index]);

  const periods = useMemo(() => (company?.periods ?? []).filter(p => (mode === 'FY' ? p.fp === 'FY' : p.fp !== 'FY') && p.items.revenue).slice().reverse(), [company, mode]);
  const period = periods.find(p => p.key === pkey) ?? periods[0];
  const prev = company && period ? yoyOf(company, period) : undefined;
  const flow = useMemo(() => (period ? buildFlow(period) : null), [period]);
  const prevFlow = useMemo(() => (prev ? buildFlow(prev) : null), [prev]);
  const yoyMap = useMemo(() => {
    if (!yoy || !flow || !prevFlow) return null;
    const m: Record<string, number | null> = {};
    for (const n of [...flow.nodes, ...flow.below]) { const o = [...prevFlow.nodes, ...prevFlow.below].find(x => x.id === n.id); m[n.id] = o ? change(n.signed, o.signed) : null; }
    return m;
  }, [yoy, flow, prevFlow]);
  const revenue = period?.items.revenue?.v ?? 1;

  const results = useMemo(() => {
    const s = q.trim().toUpperCase(); if (!s) return [];
    const bundled = new Set(index.map(i => i.ticker));
    return tickers.filter(t => t[0].startsWith(s) || t[2].toUpperCase().includes(s))
      .sort((a, b) => (+(b[0] === s) - +(a[0] === s)) || (+b[0].startsWith(s) - +a[0].startsWith(s)) || (+bundled.has(b[0]) - +bundled.has(a[0])) || a[0].length - b[0].length).slice(0, 8)
      .map(t => ({ t, bundled: bundled.has(t[0]) }));
  }, [q, tickers, index]);
  const pick = (t: string) => { setTicker(t); setQ(''); setFocus(false); history.replaceState(null, '', '?t=' + t); };

  const selNode: FNode | undefined = sel ? [...(flow?.nodes ?? []), ...(flow?.below ?? [])].find(n => n.id === (sel.kind === 'node' ? sel.id : sel.link!.target)) : undefined;
  const epsRow = eps && period && period.fp !== 'FY' ? eps.find(e => Math.abs(Date.parse(e.period) - Date.parse(period.end)) < 12 * 864e5) : undefined;

  return (
    <div className="app">
      <header className="top">
        <div className="brand" onClick={() => { setTicker(''); setCompany(null); history.replaceState(null, '', './'); }}>
          <img src="./icon-192.png" alt="" /> <span>Earnings Flow</span>
        </div>
        <button className="icon" aria-label="Settings" onClick={() => setShowSettings(true)}>⚙︎</button>
      </header>

      <div className="search">
        <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 200)}
          placeholder="Search ticker or company (e.g. TSLA)" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="search"
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) pick(results[0].t[0]); }} />
        {focus && results.length > 0 && (
          <ul className="results">
            {results.map(({ t, bundled }) => (
              <li key={t[0]} onMouseDown={() => pick(t[0])}><b>{t[0]}</b><span>{t[2]}</span>{bundled ? <em>ready</em> : <em className="muted">{settings.workerUrl ? 'live' : 'proxy needed'}</em>}</li>
            ))}
          </ul>
        )}
      </div>

      {!ticker && (
        <section className="home">
          <h1>Good to see you, Chairman.</h1>
          <p>See where every dollar of a company's revenue goes, straight from its SEC filings.</p>
          <div className="chips">{index.map(c => <button key={c.ticker} onClick={() => pick(c.ticker)}>{c.ticker}</button>)}</div>
          <p className="fine">Bundled data refreshed {updated ? new Date(updated).toLocaleDateString() : '…'} from SEC EDGAR.</p>
        </section>
      )}

      {loading && <div className="card center">Loading {ticker}…</div>}
      {err && <div className="card warn">{err === 'NOPROXY'
        ? <>{ticker} is not in the bundled starter list. To load any SEC filer live, add a data proxy URL in <a onClick={() => setShowSettings(true)}>Settings</a>.</>
        : err}</div>}

      {company && period && (
        <>
          <section className="head">
            <div>
              <div className="eyebrow">INCOME FLOW</div>
              <h2>{company.name}</h2>
              <div className="meta">{company.ticker} · {fpLabel(period)} · {period.fp === 'FY' ? 'Year' : 'Quarter'} ended {period.end} · USD · GAAP</div>
            </div>
          </section>
          <section className="controls">
            <div className="seg">
              <button className={mode === 'Q' ? 'on' : ''} onClick={() => { setMode('Q'); setPkey(''); }}>Quarter</button>
              <button className={mode === 'FY' ? 'on' : ''} onClick={() => { setMode('FY'); setPkey(''); }}>Fiscal year</button>
            </div>
            <select value={period.key} onChange={e => { setPkey(e.target.value); setSel(null); }} aria-label="Period">
              {periods.map(p => <option key={p.key} value={p.key}>{fpLabel(p)}</option>)}
            </select>
            <label className="toggle"><input type="checkbox" checked={yoy} onChange={e => setYoy(e.target.checked)} /> <span>vs last year</span></label>
            <div className="seg small">
              <button className={!pro ? 'on' : ''} onClick={() => setPro(false)}>Beginner</button>
              <button className={pro ? 'on' : ''} onClick={() => setPro(true)}>Pro</button>
            </div>
          </section>

          {yoy && !prev && <div className="card fine">No same-period data from one year earlier.</div>}
          {yoy && prev && <div className="yoynote">Compared with {fpLabel(prev)} (ended {prev.end}). <span className="up">▲▼ green</span> = better for the company, <span className="down">red</span> = worse.</div>}

          <section className="card chartcard">
            {flow ? <Chart flow={flow} revenue={revenue} pro={pro} yoy={yoyMap} selected={sel?.id ?? null} onPick={(id, kind, link) => setSel({ id, kind, link })} />
              : <p>Not enough reported data to draw this period.</p>}
            {flow && flow.below.length > 0 && (
              <div className="below">
                {flow.below.map(b => <button key={b.id} className="pill" style={{ color: COLORS[b.kind].text }} onClick={() => setSel({ id: b.id, kind: 'node' })}>{b.label} <b>{money(b.signed)}</b></button>)}
              </div>
            )}
            {!pro && <p className="tip">Tip: tap any bar or ribbon to learn what it means.</p>}
            <div className="source">
              Source: <a href={filingUrl(company, period)} target="_blank" rel="noreferrer">SEC {period.form} filed {period.filed}</a>
              {period.fp === 'Q4' && ' · Q4 derived as full year minus Q1–Q3'}
              {via === 'worker' ? ' · live via proxy' : ` · bundled data (${company.updated})`}
            </div>
            {flow?.notes.map((n, i) => <p key={i} className="fine">{n}</p>)}
            <p className="fine">Revenue segments aren't shown: SEC's XBRL company facts don't include segment breakdowns, so the chart starts at total revenue. Amounts marked "derived" are simple arithmetic on reported figures. A just-announced quarter appears here once its 10-Q/10-K is filed with the SEC.</p>
          </section>

          {flow && <section className="card">
            <table className="items"><tbody>
              {[...flow.nodes, ...flow.below].filter(n => n.id !== 'opex' || flow.nodes.some(x => x.id === 'rd')).map(n => {
                const ch = yoyMap?.[n.id];
                const good = (n.kind === 'cost' || n.kind === 'loss') ? (ch ?? 0) < 0 : (ch ?? 0) > 0;
                return <tr key={n.id} onClick={() => setSel({ id: n.id, kind: 'node' })}>
                  <td><span className="dot" style={{ background: COLORS[n.kind].node }} />{n.label}{!pro ? null : n.derived ? <span className="m"> · derived</span> : null}</td>
                  <td className="n"><b>{money(n.signed)}</b></td>
                  <td className="n m">{pct(Math.abs(n.signed) / revenue)}</td>
                  {yoy && <td className="n">{ch != null && isFinite(ch) ? <span className={good ? 'up' : 'down'}>{ch >= 0 ? '+' : '−'}{Math.abs(ch * 100).toFixed(1)}%</span> : '—'}</td>}
                </tr>;
              })}
            </tbody></table>
          </section>}

          <section className="card kpis">
            <Kpi label="Revenue" v={period.items.revenue?.v} p={prev?.items.revenue?.v} yoy={yoy} />
            {period.items.grossProfit && <Kpi label="Gross margin" pctv={period.items.grossProfit.v / revenue} pp={prev?.items.grossProfit && prev.items.revenue ? prev.items.grossProfit.v / prev.items.revenue.v : undefined} yoy={yoy} />}
            {period.items.opIncome && <Kpi label="Operating margin" pctv={period.items.opIncome.v / revenue} pp={prev?.items.opIncome && prev.items.revenue ? prev.items.opIncome.v / prev.items.revenue.v : undefined} yoy={yoy} />}
            {period.items.netIncome && <Kpi label="Net margin" pctv={period.items.netIncome.v / revenue} pp={prev?.items.netIncome && prev.items.revenue ? prev.items.netIncome.v / prev.items.revenue.v : undefined} yoy={yoy} />}
            {period.items.eps && <Kpi label="EPS (diluted)" eps={period.items.eps.v} p={prev?.items.eps?.v} yoy={yoy} />}
          </section>

          <section className="card beat">
            <h3>Beat or miss?</h3>
            {!settings.finnhub ? <p>Connect a free Finnhub key in <a onClick={() => setShowSettings(true)}>Settings</a> to compare EPS with analyst estimates.</p>
              : epsErr ? <p className="down">{epsErr}</p>
              : period.fp === 'FY' ? <p className="fine">Estimates are per quarter. Pick a quarter.</p>
              : !eps ? <p>Loading estimates…</p>
              : !epsRow || epsRow.estimate == null || epsRow.actual == null ? <p className="fine">Finnhub has no EPS estimate for the quarter ending {period.end}.</p>
              : <div className="bm">
                  <span className={'badge ' + (epsRow.actual >= epsRow.estimate ? 'beat' : 'miss')}>{epsRow.actual >= epsRow.estimate ? 'BEAT' : 'MISS'}</span>
                  <div>EPS <b>${epsRow.actual.toFixed(2)}</b> vs estimate ${epsRow.estimate.toFixed(2)}{epsRow.surprisePercent != null && <> ({epsRow.surprisePercent >= 0 ? '+' : ''}{epsRow.surprisePercent.toFixed(1)}%)</>}</div>
                  <div className="fine">Finnhub EPS may be adjusted (non-GAAP) and can differ from GAAP EPS above. Revenue estimates aren't available on Finnhub's free tier, so none are shown.</div>
                </div>}
          </section>
        </>
      )}

      {sel && selNode && period && (
        <Details node={selNode} link={sel.kind === 'link' ? sel.link : undefined} flow={flow!} revenue={revenue} pro={pro} prev={prevFlow} prevRev={prev?.items.revenue?.v} onClose={() => setSel(null)} />
      )}
      {showSettings && <Settings onClose={() => { setShowSettings(false); }} />}
      <footer>Data: SEC EDGAR XBRL. Not investment advice. <a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noreferrer">EDGAR</a></footer>
    </div>
  );
}

function Kpi({ label, v, p, pctv, pp, eps, yoy }: { label: string; v?: number; p?: number; pctv?: number; pp?: number; eps?: number; yoy: boolean }) {
  let main = '', ch: React.ReactNode = null;
  if (v != null) { main = money(v); const c = p != null ? change(v, p) : null; if (yoy && c != null) ch = <span className={c >= 0 ? 'up' : 'down'}>{c >= 0 ? '▲' : '▼'}{Math.abs(c * 100).toFixed(1)}%</span>; }
  if (eps != null) { main = `$${eps.toFixed(2)}`; const c = p != null ? change(eps, p) : null; if (yoy && c != null) ch = <span className={c >= 0 ? 'up' : 'down'}>{c >= 0 ? '▲' : '▼'}{Math.abs(c * 100).toFixed(0)}%</span>; }
  if (pctv != null) { main = pct(pctv); if (yoy && pp != null) { const d = (pctv - pp) * 100; ch = <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)} pts</span>; } }
  return <div className="kpi"><div className="k">{label}</div><div className="v">{main}</div>{ch && <div className="c">{ch}</div>}</div>;
}

function Details({ node, link, flow, revenue, pro, prev, prevRev, onClose }: { node: FNode; link?: FLink; flow: { nodes: FNode[] }; revenue: number; pro: boolean; prev: { nodes: FNode[]; below: FNode[] } | null; prevRev?: number; onClose: () => void }) {
  const g = GLOSSARY[node.id] ?? { title: node.label, text: '' };
  const src = link ? flow.nodes.find(n => n.id === link.source) : undefined;
  const o = prev ? [...prev.nodes, ...prev.below].find(n => n.id === node.id) : undefined;
  const c = o ? change(node.signed, o.signed) : null;
  const goodUp = !(node.kind === 'cost' || node.kind === 'loss');
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={g.title}>
        <div className="grab" />
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        {link && src && <div className="eyebrow">FLOW · {src.label} → {node.label}</div>}
        <h3 style={{ color: COLORS[node.kind].text }}>{g.title}</h3>
        <div className="big">{money(link ? link.value : node.signed)}</div>
        <div className="row"><span>{pct(Math.abs(link ? link.value : node.signed) / revenue)} of revenue</span>
          {c != null && <span className={(c >= 0) === goodUp ? 'up' : 'down'}>{c >= 0 ? '▲' : '▼'} {Math.abs(c * 100).toFixed(1)}% vs last year ({money(o!.signed)})</span>}
        </div>
        <p>{g.text}</p>
        {!pro && g.tip && <p className="tipbox">💡 {g.tip}</p>}
        {pro && <div className="pro">
          <div><span>XBRL</span><code>{node.tag ?? '—'}</code></div>
          <div><span>Basis</span>{node.derived ? 'Derived from reported figures' : 'Reported'}</div>
          {o && prevRev && <div><span>Prior % of rev</span>{pct(Math.abs(o.signed) / prevRev)}</div>}
          {link && node.signed !== link.value && <div><span>Item total</span>{money(node.signed)}</div>}
        </div>}
      </div>
    </div>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const [k, setK] = useState(settings.finnhub); const [w, setW] = useState(settings.workerUrl);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="grab" />
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3>Settings</h3>
        <label className="field">Finnhub API key (free at finnhub.io)
          <input value={k} onChange={e => setK(e.target.value)} placeholder="paste key" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <small>Stored only on this device (localStorage). Used for EPS actual vs estimate.</small>
        </label>
        <label className="field">Data proxy URL (Cloudflare Worker)
          <input value={w} onChange={e => setW(e.target.value)} placeholder="https://earnings-flow-proxy.<you>.workers.dev" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <small>Optional. Leave blank to use the bundled starter data. With a proxy, any SEC filer loads live.</small>
        </label>
        <button className="primary" onClick={() => { settings.finnhub = k; settings.workerUrl = w; location.reload(); }}>Save</button>
      </div>
    </div>
  );
}
