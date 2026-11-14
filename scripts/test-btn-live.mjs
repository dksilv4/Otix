import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../frontend/node_modules/@playwright/test');

async function main() {
  console.log('Starting live test with full 60s observation window...');
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc5NDUyNTk4NCwiZXhwIjoxNzk1MTMwNzg0fQ.bOP7GmKIy-Yrw5VnnI0muQHP6a2TbtzFvgKERZtUi2M';
  const user = { id: 1, username: 'admin', email: 'admin@otix.local', is_admin: true, is_staff: true, is_superuser: true };

  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('otix-access-token', token);
    localStorage.setItem('otix_cached_user', JSON.stringify(user));
    localStorage.setItem('otix_cookie_consent', 'all');
  }, { token, user });

  const page = await context.newPage();

  page.on('response', res => {
    const u = res.url();
    if (u.includes('radarr') || u.includes('lookup')) {
      console.log(`[NET RES] ${res.status()} ${res.request().method()} ${u}`);
    }
  });

  console.log('Navigating to http://localhost:5173/media/movie/1166...');
  await page.goto('http://localhost:5173/media/movie/1166', { waitUntil: 'domcontentloaded' });

  for (let i = 1; i <= 30; i++) {
    await page.waitForTimeout(2000);
    const sec = i * 2;
    const info = await page.evaluate(() => {
      const pill = !!document.querySelector('[aria-label="Checking availability"]');
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
      const req = buttons.find(b => b.includes('Request') || b.includes('Stream') || b.includes('Play'));
      return { pill, req, buttonsCount: buttons.length };
    });

    console.log(`[T+${sec}s] pill: ${info.pill}, reqButton: "${info.req || 'NONE'}" (buttons: ${info.buttonsCount})`);

    if (info.req) {
      console.log(`\n🎉 SUCCESS! Button appeared at T+${sec}s: "${info.req}"`);
      await page.screenshot({ path: 'scratch/e2e-evidence/button-appeared-success.png' });
      console.log('Saved scratch/e2e-evidence/button-appeared-success.png');
      break;
    }
  }

  await page.waitForTimeout(3000);
  await browser.close();
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
