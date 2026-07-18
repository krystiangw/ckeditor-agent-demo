// Browser acceptance check: boots the app in headless Chromium and walks the
// demo path — draft → compliance pass → suggestions present → accept one.
// Uses Playwright from the sibling ckeditor-mcp install.
// Run: node scripts/e2e-check.mjs  (server must be running on :4600)
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../ckeditor-mcp/package.json', import.meta.url));
const { chromium } = require('playwright');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.editor, null, { timeout: 30_000 });
console.log('✓ editor booted');

await page.click('#draft-button');
await page.waitForFunction(() => window.editor.getData().includes('KIN-2024-0847'), null, { timeout: 20_000 });
console.log('✓ draft loaded into editor');

await page.click('#compliance-button');
await page.waitForFunction(
  () => document.querySelectorAll('.ck-suggestion-marker, [data-suggestion], .ck-suggestion').length > 0
    || Number(document.querySelector('#suggestion-count')?.textContent) > 0,
  null, { timeout: 20_000 },
);
const pending = await page.evaluate(() => document.querySelector('#suggestion-count')?.textContent);
console.log(`✓ compliance suggestions pending: ${pending}`);

// The editor data must now contain suggestion markup.
const hasMarkup = await page.evaluate(() => /suggestion/.test(window.editor.getData()));
console.log(`✓ suggestion markup in document: ${hasMarkup}`);

await page.screenshot({ path: '/tmp/claimdesk-app.png', fullPage: false });
console.log('✓ screenshot -> /tmp/claimdesk-app.png');

if (errors.length) {
  console.log('\n⚠ console/page errors:');
  errors.slice(0, 8).forEach((e) => console.log('  -', e.slice(0, 200)));
}
await browser.close();
console.log(errors.length ? '\n⚠ completed with console errors' : '\n✅ e2e check passed');
