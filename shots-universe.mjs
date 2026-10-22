// WebKit iPhone screenshots of full-universe search/add and new tickers. URL=... node shots-universe.mjs
import { webkit, devices } from 'playwright';
const B = process.env.URL || 'http://localhost:4173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 15 Pro'] });
const p = await ctx.newPage();
await p.goto(B); await p.waitForTimeout(1200);
await p.fill('.search input', 'novo'); await p.waitForTimeout(500);
await p.screenshot({ path: 'screens/10-search-universe.png' });
await p.click('.results li:has-text("NVO")'); await p.waitForSelector('.chartwrap svg'); await p.waitForTimeout(700);
await p.click('button.add'); await p.waitForTimeout(300);
await p.screenshot({ path: 'screens/11-nvo-added-chart.png', fullPage: true });
for (const [t, f] of [['PNC', '12-pnc-bank'], ['O', '13-realty-income-reit'], ['CELH', '14-celh']]) {
  await p.fill('.search input', t); await p.waitForTimeout(400);
  await p.locator('.results li').filter({ has: p.locator(`b:text-is("${t}")`) }).first().click();
  await p.waitForSelector('.chartwrap svg'); await p.waitForTimeout(700);
  await p.click('button.add'); await p.waitForTimeout(200);
  await p.screenshot({ path: `screens/${f}.png`, fullPage: true });
}
await p.fill('.search input', 'OZK'); await p.waitForTimeout(400);
await p.locator('.results li').filter({ has: p.locator('b:text-is("OZK")') }).first().click(); await p.waitForTimeout(800);
await p.screenshot({ path: 'screens/15-not-available.png' });
await p.click('.brand'); await p.waitForTimeout(500);
await p.screenshot({ path: 'screens/16-home-my-list.png' });
await b.close();
