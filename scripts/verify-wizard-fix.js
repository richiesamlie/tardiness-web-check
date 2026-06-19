// Capture wizard step 2 (academic year) — the page that had the symbol bug.
const puppeteer = require('puppeteer-core');
const path = require('node:path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

  // Capture console messages for debugging
  page.on('console', msg => console.log('  [page]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('  [page error]', err.message));

  // Step 1: go to wizard and wait for it to load
  await page.goto('http://localhost:3000/wizard.html', { waitUntil: 'networkidle0' });
  await wait(2000);
  console.log('  URL after load:', page.url());
  const initialText = await page.evaluate(() => document.body.innerText.substring(0, 200));
  console.log('  Initial body:', initialText);

  // Check if wizard is at step 1
  const schoolExists = await page.$('#school');
  console.log('  #school found?', !!schoolExists);

  if (!schoolExists) {
    // Maybe wizard auto-completed? Check status
    const status = await page.evaluate(() => fetch('/api/wizard/status').then(r => r.json()));
    console.log('  wizard status:', status);
    if (status.completed) {
      console.log('  Wizard is already complete; reset DB and restart server, then re-run.');
    }
    await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'debug-wizard.png') });
    await browser.close();
    process.exit(1);
  }

  await page.type('#school', 'Elyon Christian Primary School');
  await wait(300);
  await page.click('#next');

  // Wait for step 2 to render
  await page.waitForSelector('.wizard-option', { timeout: 5000 });
  await wait(500);

  // Screenshot step 2 (the formerly buggy one)
  await page.screenshot({
    path: path.join(__dirname, '..', 'screenshots', '08-wizard-step2-fixed.png'),
    fullPage: false,
  });
  console.log('Captured wizard step 2');

  // Get the subtitle text to verify
  const subtitle = await page.$eval('#wizard-content p.muted', el => el.textContent);
  console.log('Subtitle text:', JSON.stringify(subtitle));

  // Check for any ${ in the rendered DOM
  const body = await page.evaluate(() => document.body.innerText);
  if (body.includes('${')) {
    console.error('❌ BUG STILL PRESENT — found ${...} in body');
    console.error('Found at:', body.split('\n').filter(l => l.includes('${')));
    process.exit(1);
  } else {
    console.log('✅ No ${...} symbols found in rendered text');
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
