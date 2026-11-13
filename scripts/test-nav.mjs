import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../frontend/node_modules/@playwright/test');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc5NDUyNTk4NCwiZXhwIjoxNzk1MTMwNzg0fQ.bOP7GmKIy-Yrw5VnnI0muQHP6a2TbtzFvgKERZtUi2M';
  const user = { id: 1, username: 'admin', email: 'admin@otix.local', is_admin: true };

  await context.addInitScript(({ t, u }) => {
    localStorage.setItem('otix-access-token', t);
    localStorage.setItem('otix_cached_user', JSON.stringify(u));
    localStorage.setItem('otix_cookie_consent', 'all');
  }, { t: token, u: user });

  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Request') || text.includes('button') || text.includes('state') || text.includes('Error')) {
      console.log('BROWSER:', text);
    }
  });

  console.log('Navigating...');
  await page.goto('http://localhost:5173/media/movie/1166', { waitUntil: 'domcontentloaded' });

  for (let s = 1; s <= 45; s++) {
    await page.waitForTimeout(1000);
    const htmlInfo = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        aria: b.getAttribute('aria-label'),
        classes: b.className,
      }));
      const checkingPill = document.querySelector('[aria-label="Checking availability"]');
      return {
        checkingPill: !!checkingPill,
        buttons: allButtons.filter(b => b.text.includes('Request') || b.text.includes('Stream') || b.text.includes('Check') || b.text.includes('Watch')),
      };
    });

    console.log(`[T+${s}s] checkingPill: ${htmlInfo.checkingPill}, targetButtons:`, JSON.stringify(htmlInfo.buttons));
    if (htmlInfo.buttons.some(b => b.text.includes('Request'))) {
      console.log(`\n=================================================`);
      console.log(` SUCCESS: REQUEST BUTTON FOUND AT SECOND ${s}!`);
      console.log(`=================================================\n`);
      break;
    }
  }

  await browser.close();
}

main().catch(console.error);
