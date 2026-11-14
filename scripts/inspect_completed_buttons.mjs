import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../frontend/node_modules/@playwright/test');
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = path.resolve(__dirname, '../scratch/e2e-evidence');

const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc5NDUyNTk4NCwiZXhwIjoxNzk1MTMwNzg0fQ.bOP7GmKIy-Yrw5VnnI0muQHP6a2TbtzFvgKERZtUi2M';

async function test() {
  const browser = await chromium.launch({ headless: false, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(({ token }) => {
    localStorage.setItem('otix-access-token', token);
    localStorage.setItem('otix_cached_user', JSON.stringify({ id: 1, username: 'admin' }));
    localStorage.setItem('otix_cookie_consent', 'all');
  }, { token: ADMIN_TOKEN });

  const page = await context.newPage();
  console.log('Navigating to Night of the Living Dead (/media/movie/1166)...');
  await page.goto('http://localhost:5173/media/movie/1166');
  await page.waitForTimeout(20000);

  const btns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim(),
      aria: b.getAttribute('aria-label'),
      classes: b.className
    })).filter(b => b.text || b.aria);
  });

  console.log('Buttons on /media/movie/1166:');
  console.log(JSON.stringify(btns, null, 2));

  await page.screenshot({ path: path.join(artifactDir, '07-movie-detail-download-completed-inspect.png') });
  console.log('Screenshot captured.');

  await browser.close();
}

test().catch(console.error);
