// Captures prototype screenshots for the deck from the running app (http://localhost:5174).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.APP_URL ?? 'http://localhost:5174';
mkdirSync('shots', { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

async function go(hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await wait(700);
}
async function shotOf(selectorFn, file, pad = 12) {
  const box = await page.evaluate(selectorFn);
  if (!box) throw new Error('missing element for ' + file);
  await page.evaluate((y) => window.scrollTo(0, window.scrollY + y - 80), box.y);
  await wait(300);
  const v = await page.evaluate(selectorFn);
  const sy = await page.evaluate(() => window.scrollY);
  const b = { ...v, y: v.y + sy };
  await page.screenshot({ path: `shots/${file}`, clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 } });
}

// Fresh state: clear only Callback's own keys.
await page.goto(`${BASE}/#/home`, { waitUntil: 'networkidle0' });
await page.evaluate(() => { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith('callback:')) localStorage.removeItem(k); } });
await page.reload({ waitUntil: 'networkidle0' });
await wait(500);
await page.screenshot({ path: 'shots/home.png', clip: { x: 0, y: 0, width: 1280, height: 640 } });

// Load Mei's fictional example.
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Try Mei'))?.click());
await wait(600);

// Value map: the direct-evidence card for the dashboard need.
await go('#/jobs/job_bayline/valuemap');
await shotOf(() => {
  const cards = [...document.querySelectorAll('main .card')].filter((c) => c.querySelector('h3')?.textContent.includes('Build dashboards for daily operations'));
  const r = cards[0]?.getBoundingClientRect();
  return r && { x: r.x, y: r.y, width: r.width, height: r.height };
}, 'valuemap.png');

// Prepared drill: follow-ups, then the first-vs-retry comparison.
await go('#/practice/session/sess_fixture');
await shotOf(() => {
  const chat = document.querySelector('main .chat');
  const bubbles = [...chat.querySelectorAll('.bubble')].slice(0, 6);
  const a = bubbles[0].getBoundingClientRect();
  const z = bubbles[bubbles.length - 1].getBoundingClientRect();
  return { x: chat.getBoundingClientRect().x, y: a.y, width: chat.getBoundingClientRect().width, height: z.bottom - a.y };
}, 'followups.png');
await shotOf(() => {
  const h = [...document.querySelectorAll('main h4')].find((x) => x.textContent === 'Comparison');
  const r = h?.closest('.card')?.getBoundingClientRect();
  return r && { x: r.x, y: r.y, width: r.width, height: r.height };
}, 'comparison.png');

// Plan my prep time: 20-minute budget fixture.
await go('#/progress/plan');
await shotOf(() => {
  const h = [...document.querySelectorAll('main h2')].find((x) => x.textContent.startsWith('Plan'));
  const sec = h?.closest('section');
  if (!sec) return null;
  const r = sec.getBoundingClientRect();
  const last = [...sec.querySelectorAll('p')].pop().getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: last.bottom - r.y + 16 };
}, 'plan.png');

// Guide opening step: sound bite + evidence.
await go('#/guide');
await page.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => /Opening/.test(b.textContent))?.click());
await wait(500);
await page.evaluate(() => {
  const set = (id, v) => { const el = document.getElementById(id); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('g-soundbite', 'I help operations managers see late shipments every morning.');
  set('g-evidence', 'Twelve supervisors used my dashboard to track late shipments in their daily stand-up. I cannot claim it reduced delivery delays.');
});
await wait(300);
await shotOf(() => {
  const h = [...document.querySelectorAll('main h2')].find((x) => x.textContent === 'Write a short opening');
  const r = h?.closest('section')?.getBoundingClientRect();
  return r && { x: r.x, y: r.y, width: r.width, height: r.height };
}, 'opening.png');

await browser.close();
console.log('saved shots/: home, valuemap, followups, comparison, plan, opening');
