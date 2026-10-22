# Earnings Flow
Income-statement flowcharts (Sankey) from SEC EDGAR XBRL filings. React + TypeScript + Vite + d3-sankey, installable PWA.

Live: https://bludiamond888-rgb.github.io/earnings-flow/

- **Data (all US-listed stocks)**: `.github/workflows/refresh-data.yml` runs weekly (Mon 11:17 UTC). It downloads SEC's bulk `companyfacts.zip` and `company_tickers_exchange.json`, keeps Nasdaq/NYSE/Cboe/TXSE common stocks (drops OTC, preferreds, warrants, units, rights) and runs `scripts/build-universe.ts`, which writes `universe.json` (search index: ticker, name, exchange, CIK, availability status, latest period) and one compact `c/<CIK>.json` per company (last 6 fiscal years, `src/lib/compact.ts`). Output goes to the force-pushed `data` branch; `pages.yml` overlays it onto `public/data/` at deploy. The run keeps per-company last-good files on read errors and aborts (keeping the last good data) if companies with charts would shrink by more than 30%.
- **Fallback**: the 30 starter tickers stay bundled on `main` (`npm run refresh-data`). The app loads `c/<CIK>.json` on demand; the service worker caches each company you open for offline use. A proxy URL in Settings (see `worker/`) can load the very latest filing live.
- **Not available cases** (clear message in the app): no revenue reported (pre-revenue biotech, SPACs), no XBRL financials at SEC (funds, trusts, banks filing with bank regulators), no 10-K/10-Q/20-F/40-F yet (recent IPOs), or a layout that can't be charted reliably.
- **Foreign filers**: IFRS (`ifrs-full`) and non-USD reporting currencies are supported from 20-F/40-F annual reports; quarterly figures are not in SEC's XBRL for these, so only fiscal years are shown.
- **Normalization** (`src/lib/normalize.ts`): us-gaap tags with fallbacks, discrete 10-Q quarters, Q4 = FY − (Q1+Q2+Q3), gross profit computed when missing, banks handled without COGS. Values are reported or simply derived (flagged), never estimated.
- **Segments**: companyfacts has no segment dimensions, so charts start at total revenue.
- **Beat/miss**: optional Finnhub key (Settings, stored in localStorage) → `/stock/earnings` EPS actual vs estimate.
- `npm test` (vitest, real SEC fixtures in `fixtures/`), `npm run shots` (Playwright WebKit screenshots).
