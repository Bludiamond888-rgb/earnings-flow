import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Chart, COLORS } from './Chart';
import { buildFlow, type FLink, type FNode } from './lib/flow';
import { yoyOf, type Company, type Period } from './lib/normalize';
import { loadCompany, loadEarnings, loadIndex, loadTickers, loadUniverse, myList, searchRows, settings, squash, STATUS_TEXT, type EpsRow, type IndexEntry, type TickerRow, type Universe } from './lib/data';
import { ST } from './lib/compact';
import { GLOSSARY } from './lib/glossary';
import { change, money, pct, setCurrency } from './lib/format';

const fpLabel = (p: Period) => (p.fp === 'FY' ? `FY${p.fy}` : `${p.fp} FY${p.fy}`);
const filingUrl = (c: Company, p: Period) => `https://www.sec.gov/Archives/edgar/data/${c.cik}/${p.accn.replace(/-/g, '')}/${p.accn}-index.htm`;

export default function App() {
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [updated, setUpdated] = useState('');
  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [uni, setUni] = useState<Universe | null | undefined>(undefined);
  const [list, setList] = useState<string[]>(() => myList.get());
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

  useEffect(() => { loadIndex().then(i => { setIndex(i.companies); setUpdated(i.updated); }); loadTickers().then(setTickers).catch(() => setTickers([])); loadUniverse().then(setUni); }, []);
  useEffect(() => { myList.set(list); }, [list]);
  useEffect(() => { localStorage.setItem('ef.pro', pro ? '1' : '0'); }, [pro]);
  useEffect(() => {
    if (!ticker || uni === undefined || !index.length) return;
    const urow = uni?.rows.find(r => r[0] === ticker) ?? uni?.rows.find(r => squash(r[0]) === squash(ticker));
    const row = tickers.find(t => t[0] === ticker);
    const bundled = index.some(c => c.ticker === ticker);
    setLoading(true); setErr(''); setCompany(null); setSel(null); setEps(null); setEpsErr('');
    loadCompany(ticker, row?.[1] ?? urow?.[3], bundled, urow)
      .then(r => {
        setCompany(r.company); setVia(r.via); localStorage.setItem('ef.last', ticker); setPkey('');
        setMode(r.company.periods.some(p => p.fp !== 'FY' && p.items.revenue) ? 'Q' : 'FY');
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
    loadEarnings(ticker).then(setEps).catch(e => setEpsErr(e.message));
  }, [ticker, tickers, index, uni]);

  setCurrency(company?.currency);
  const hasQ = !!company?.periods.some(p => p.fp !== 'FY' && p.items.revenue);
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
    if (uni) return searchRows(uni.rows, q, new Set([...bundled, ...list])).map(r => ({ t: [r[0], r[3], r[1]] as TickerRow, bundled: bundled.has(r[0]), u: r }));
    return tickers.filter(t => t[0].startsWith(s) || t[2].toUpperCase().includes(s))
      .sort((a, b) => (+(b[0] === s) - +(a[0] === s)) || (+b[0].startsWith(s) - +a[0].startsWith(s)) || (+bundled.has(b[0]) - +bundled.has(a[0])) || a[0].length - b[0].length).slice(0, 8)
      .map(t => ({ t, bundled: bundled.has(t[0]), u: undefined }));
  }, [q, tickers, index, uni, list]);
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
            {results.map(({ t, bundled, u }) => (
              <li key={t[0]} onMouseDown={() => pick(t[0])}><b>{t[0]}</b><span>{t[2]}{u && <small> · {u[2]}</small>}</span>
                {u ? (u[4] === ST.chart ? <em>chart</em> : <em className="muted">{u[4] === ST.noRevenue ? 'no revenue' : 'not available'}</em>)
                  : bundled ? <em>ready</em> : <em className="muted">{settings.workerUrl ? 'live' : 'proxy needed'}</em>}</li>
            ))}
          </ul>
        )}
      </div>

      {!ticker && (
        <section className="home">
          <h1>Where does the money go?</h1>
          <p>See where every dollar of a company's revenue goes, straight from its SEC filings. Search {uni ? `${uni.rows.length.toLocaleString()} US-listed stocks` : 'any ticker'} above.</p>
          {list.length > 0 && <><h4 className="listh">My list</h4><div className="chips mine">{list.map(t => <button key={t} onClick={() => pick(t)}>{t}</button>)}</div></>}
          <h4 className="listh">Popular</h4>
          <div className="chips">{index.map(c => <button key={c.ticker} onClick={() => pick(c.ticker)}>{c.ticker}</button>)}</div>
          <p className="fine">{uni ? <>Data for {(uni.stats?.chart ?? 0).toLocaleString()} companies refreshed {new Date(uni.updated).toLocaleDateString()} from SEC EDGAR; each opens offline after you view it once.</> : <>Bundled data refreshed {updated ? new Date(updated).toLocaleDateString() : '…'} from SEC EDGAR.</>}</p>
        </section>
      )}

      {loading && <div className="card center">Loading {ticker}…</div>}
      {err && <div className="card warn">{err === 'NOPROXY'
        ? <>{ticker} isn't a US exchange-listed company in SEC's ticker list, so no data is available. To load any SEC filer live, add a data proxy URL in <a onClick={() => setShowSettings(true)}>Settings</a>.</>
        : err.startsWith('STATUS:') ? <><b>Not available.</b> {uni?.rows.find(r => r[0] === ticker)?.[1] ?? ticker} {STATUS_TEXT[+err.slice(7)]}</>
        : err === 'OFFLINE' ? <>You're offline and {ticker} hasn't been opened on this device yet. Connect once and it will be saved for offline use.</>
        : err}</div>}

      {company && !period && !loading && (
        <section className="card warn">
          <b>Not available.</b> {company.name} {STATUS_TEXT[ST.noRevenue]}
          {(() => { const p = company.periods.filter(p => p.items.netIncome).at(-1); return p ? <p className="fine">Latest reported net {p.items.netIncome!.v < 0 ? 'loss' : 'income'}: <b>{money(p.items.netIncome!.v)}</b> ({fpLabel(p)}, ended {p.end}, <a href={filingUrl(company, p)} target="_blank" rel="noreferrer">SEC {p.form}</a>).</p> : null; })()}
        </section>
      )}

      {company && period && (
        <>
          <section className="head">
            <div>
              <div className="eyebrow">INCOME FLOW</div>
              <h2>{company.name}</h2>
              <div className="meta">{company.ticker} · {fpLabel(period)} · {period.fp === 'FY' ? 'Year' : 'Quarter'} ended {period.end} · {company.currency ?? 'USD'} · {company.gaap ?? 'US GAAP'}</div>
            </div>
            <button className={'add' + (list.includes(company.ticker) ? ' on' : '')} onClick={() => setList(l => l.includes(company.ticker) ? l.filter(x => x !== company.ticker) : [...l, company.ticker])}>
              {list.includes(company.ticker) ? '✓ In my list' : '+ Add to my list'}</button>
          </section>
          <section className="controls">
            <div className="seg">
              <button className={mode === 'Q' ? 'on' : ''} disabled={!hasQ} onClick={() => { setMode('Q'); setPkey(''); }}>Quarter</button>
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

          {!hasQ && <div className="card fine">Only annual figures are available: {company.gaap === 'IFRS' || /^(20|40)-F/.test(period.form) ? 'foreign companies file annual reports (20-F/40-F) with the SEC, and their quarterly updates are not in SEC\'s structured data.' : 'quarterly figures are not in SEC\'s structured data for this company.'}{company.currency && company.currency !== 'USD' ? ` Amounts are in ${company.currency}, the company's reporting currency.` : ''}</div>}
          {hasQ && company.currency && company.currency !== 'USD' && <div className="card fine">Amounts are in {company.currency}, the company's reporting currency.</div>}
          {Date.parse(period.end) < Date.now() - 548 * 864e5 && <div className="card warn">The latest figures SEC has in structured form are from {period.end}; newer reports may not be available yet.</div>}
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
              {via === 'worker' ? ' · live via proxy' : via === 'universe' ? ` · weekly SEC data (${company.updated})` : ` · bundled data (${company.updated})`}
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
          <small>Optional. All US-listed stocks already load from weekly data; a proxy loads the very latest filing live.</small>
        </label>
        <button className="primary" onClick={() => { settings.finnhub = k; settings.workerUrl = w; location.reload(); }}>Save</button>
      </div>
    </div>
  );
}
