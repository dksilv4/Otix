import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../frontend/node_modules/@playwright/test');

async function run() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc5NDUyNTk4NCwiZXhwIjoxNzk1MTMwNzg0fQ.bOP7GmKIy-Yrw5VnnI0muQHP6a2TbtzFvgKERZtUi2M';
  const user = { id: 1, username: 'admin', email: 'admin@otix.local', is_admin: true };
  
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('otix-access-token', token);
    localStorage.setItem('otix_cached_user', JSON.stringify(user));
    localStorage.setItem('otix_cookie_consent', 'all');
  }, { token, user });

  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto('http://localhost:5173/media/movie/1166', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    return {
      buttons: Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        aria: b.getAttribute('aria-label'),
      })),
      checkingPill: document.querySelector('[aria-label="Checking availability"]')?.outerHTML,
      heroHtml: document.querySelector('section, header, div.relative')?.innerText?.substring(0, 500),
    };
  });

  console.log('RESULT:', JSON.stringify(data, null, 2));
  await browser.close();
}

run().catch(console.error);
