# Earnings Flow SEC proxy
SEC blocks browser CORS and requires a descriptive User-Agent. This Worker adds `User-Agent: EarningsFlow jackie@localhost`,
caches responses at the edge (tickers 24h, companyfacts 6h), and allows CORS for https://bludiamond888-rgb.github.io and localhost.

Deploy (needs a free Cloudflare account):
    npx wrangler login
    cd worker && npx wrangler deploy
Then open Earnings Flow → Settings → Data proxy URL and paste `https://earnings-flow-proxy.<subdomain>.workers.dev`.
