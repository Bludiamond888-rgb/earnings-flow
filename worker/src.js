// Earnings Flow SEC proxy (Cloudflare Worker).
// Routes: /tickers -> company_tickers.json, /companyfacts/CIK##########.json, /submissions/CIK##########.json
const UA = 'EarningsFlow jackie@localhost';
const ALLOWED = [/^https:\/\/bludiamond888-rgb\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
function cors(origin) {
  const ok = origin && ALLOWED.some(r => r.test(origin));
  return { 'Access-Control-Allow-Origin': ok ? origin : 'https://bludiamond888-rgb.github.io', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}
export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin'); const h = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: h });
    const u = new URL(req.url); let target, ttl;
    if (u.pathname === '/tickers') { target = 'https://www.sec.gov/files/company_tickers.json'; ttl = 86400; }
    else if (/^\/companyfacts\/CIK\d{10}\.json$/.test(u.pathname)) { target = 'https://data.sec.gov/api/xbrl' + u.pathname; ttl = 21600; }
    else if (/^\/submissions\/CIK\d{10}\.json$/.test(u.pathname)) { target = 'https://data.sec.gov' + u.pathname; ttl = 3600; }
    else return new Response('Not found', { status: 404, headers: h });
    const cache = caches.default; const key = new Request(target);
    let res = await cache.match(key);
    if (!res) {
      const up = await fetch(target, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
      if (!up.ok) return new Response(`SEC error ${up.status}`, { status: up.status, headers: h });
      res = new Response(up.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });
      ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res); for (const [k, v] of Object.entries(h)) out.headers.set(k, v);
    return out;
  },
};
