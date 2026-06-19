// Capture screenshots of all main pages using puppeteer-core + system Chrome.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  // Public pages
  { name: '01-login',      url: '/login.html',                 auth: false },
  { name: '02-index',      url: '/index.html',                 auth: false },
  // Protected — need PIN
  { name: '03-roster',     url: '/roster.html',                auth: true },
  { name: '04-reports',    url: '/reports.html',               auth: true },
  { name: '05-settings',   url: '/settings.html',              auth: true },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  for (const p of PAGES) {
    console.log(`Capturing ${p.name} (${p.url})...`);
    await page.goto(BASE + p.url, { waitUntil: 'networkidle0', timeout: 15000 });

    if (p.auth) {
      // Inject PIN into sessionStorage and reload
      await page.evaluate(() => sessionStorage.setItem('tardiness_admin_pin', '867530'));
      await page.goto(BASE + p.url, { waitUntil: 'networkidle0', timeout: 15000 });
    }

    // Give the page time to render dynamic content
    await new Promise(r => setTimeout(r, 800));

    const outPath = path.join(OUT, p.name + '.png');
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`  ✓ ${outPath}`);
  }

  // Bonus: capture index with search results
  console.log('Capturing 06-index-search (with student tiles)...');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await page.click('input#search');
  await page.type('input#search', 'a', { delay: 100 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT, '06-index-search.png'), fullPage: false });
  console.log(`  ✓ ${path.join(OUT, '06-index-search.png')}`);

  // Bonus: capture index with mark-late modal
  console.log('Capturing 07-index-modal (confirm dialog)...');
  const firstTile = await page.$('.student-tile');
  if (firstTile) {
    await firstTile.click();
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT, '07-index-modal.png'), fullPage: false });
    console.log(`  ✓ ${path.join(OUT, '07-index-modal.png')}`);
  }

  await browser.close();
  console.log('\n✓ All screenshots captured to', OUT);
})().catch(e => { console.error(e); process.exit(1); });
