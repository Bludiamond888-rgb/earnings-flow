# Earnings Flow
Income-statement flowcharts (Sankey) from SEC EDGAR XBRL filings. React + TypeScript + Vite + d3-sankey, installable PWA.

Live: https://bludiamond888-rgb.github.io/earnings-flow/

- **Data**: bundled, pre-normalized JSON for a starter list in `public/data/` (refreshed weekly by `.github/workflows/refresh-data.yml`, or `npm run refresh-data`). Any other SEC filer loads live if a proxy URL is set in Settings (see `worker/`).
- **Normalization** (`src/lib/normalize.ts`): us-gaap tags with fallbacks, discrete 10-Q quarters, Q4 = FY − (Q1+Q2+Q3), gross profit computed when missing, banks handled without COGS. Values are reported or simply derived (flagged), never estimated.
- **Segments**: companyfacts has no segment dimensions, so charts start at total revenue.
- **Beat/miss**: optional Finnhub key (Settings, stored in localStorage) → `/stock/earnings` EPS actual vs estimate.
- `npm test` (vitest, real SEC fixtures in `fixtures/`), `npm run shots` (Playwright WebKit screenshots).
